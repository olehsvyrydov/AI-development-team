import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import { ControlPlaneService } from '../core/control-plane.service';
import type { ProjectState, WorkflowView } from '../core/models';
import { settle } from '../testing/settle';
import { TasksBoardComponent } from './tasks-board.component';

const WORKFLOW: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'code', owner: '/be', gate: null },
    { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
    { stage: 'done', owner: null, gate: null },
  ],
};

const STATE: ProjectState = {
  rev: 'r1',
  preset: 'solo',
  workflowView: WORKFLOW,
  tracks: { full: ['vision', 'code', 'security', 'done'] },
  gateDefs: [
    { name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch' },
    { name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops' },
  ],
  taskSummary: { total: 4, byStatus: { in_progress: 2, waiting: 0, blocked: 1, done: 1, needsYou: 1 } },
  tickets: [
    { id: 'ADT-1', title: 'First task', status: 'in_progress', stage: 'code', track: 'full', assignee: '/fe',
      gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }], comments: [] },
    { id: 'ADT-2', title: 'Second task', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/be',
      gates: [], comments: [] },
    { id: 'ADT-3', title: 'Blocked task', status: 'blocked', stage: 'security', track: 'full', assignee: '/be',
      gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }], comments: [] },
    { id: 'ADT-4', title: 'Done task', status: 'done', stage: 'done', track: 'full', assignee: '/qa', gates: [], comments: [] },
  ],
};

function mount(state: ProjectState): { fixture: ComponentFixture<TasksBoardComponent>; host: HTMLElement; http: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [TasksBoardComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(TasksBoardComponent);
  fixture.componentRef.setInput('state', state);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

describe('TasksBoardComponent — stage-aligned', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders one stage column per non-terminal stage, in order, with stage name, owner, and count', () => {
    const { host } = mount(STATE);
    const cols = [...host.querySelectorAll('[data-testid^="column-stage-"]')];
    // The terminal stage ('done') becomes the done folder, not a stage column.
    expect(cols.map((c) => c.getAttribute('data-testid'))).toEqual([
      'column-stage-vision',
      'column-stage-code',
      'column-stage-security',
    ]);
    const vision = host.querySelector('[data-testid="column-stage-vision"]')!;
    expect(vision.textContent).toContain('vision');
    expect(vision.textContent).toContain('/po');
    expect(host.querySelector('[data-testid="column-stage-code"] [data-testid="column-count"]')?.textContent).toContain('1');
    expect(host.querySelector('[data-testid="column-stage-vision"] [data-testid="column-count"]')?.textContent).toContain('1');
    // The terminal stage is the done folder with its live count.
    expect(host.querySelector('[data-testid="done-folder"]')).toBeTruthy();
  });

  it('places each card in its CURRENT-stage column', () => {
    const { fixture, host } = mount(STATE);
    expect(host.querySelector('[data-testid="column-stage-code"]')!.textContent).toContain('ADT-1');
    expect(host.querySelector('[data-testid="column-stage-vision"]')!.textContent).toContain('ADT-2');
    expect(host.querySelector('[data-testid="column-stage-security"]')!.textContent).toContain('ADT-3');
    // The terminal stage collapses into the done folder; expand it to see the finished card.
    (host.querySelector('[data-testid="done-folder-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="done-folder-list"]')!.textContent).toContain('ADT-4');
  });

  it('shows status as a card chip (not a column), and no status-named columns exist', () => {
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="column-stage-in_progress"]')).toBeNull();
    expect(host.querySelector('[data-testid="column-stage-blocked"]')).toBeNull();
    const card = host.querySelector('[data-testid="card-ADT-1"]')!;
    expect(card.querySelector('[data-testid="chip-status"]')?.textContent).toMatch(/in progress/i);
  });

  it('shows a needs-you chip on a card with a rejected hard gate (chip, never a column)', () => {
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="card-ADT-3"] [data-testid="chip-needs-you"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="card-ADT-1"] [data-testid="chip-needs-you"]')).toBeNull();
  });

  it('shows a COMPACT gate summary on a card — one chip, never a chip per gate', () => {
    const manyGates: ProjectState = {
      ...STATE,
      tickets: [
        {
          id: 'ADT-7',
          title: 'Many gates',
          status: 'in_progress',
          stage: 'code',
          track: 'full',
          gates: [
            { name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' },
            { name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' },
            { name: 'DESIGN_APPROVED', refusal: 'soft', state: 'passed' },
            { name: 'CODE_REVIEWED', refusal: 'soft', state: 'pending' },
          ],
          comments: [],
        },
      ],
    };
    const { host } = mount(manyGates);
    const card = host.querySelector('[data-testid="card-ADT-7"]')!;
    // Exactly one gate chip — a roll-up, not one chip per gate.
    const gateChips = card.querySelectorAll('[data-testid="chip-gate"]');
    expect(gateChips).toHaveLength(1);
    // 'code' has no governing gate → roll-up of passed/total with text (never colour alone).
    expect(gateChips[0].textContent).toMatch(/3\s*\/\s*4/);
  });

  it('surfaces the governing gate of the current stage when it is unmet (a blocked card shows why)', () => {
    // ADT-3 is at 'security' with SECOPS_APPROVED rejected — the governing gate is unmet.
    const { host } = mount(STATE);
    const card = host.querySelector('[data-testid="card-ADT-3"]')!;
    const gateChips = card.querySelectorAll('[data-testid="chip-gate"]');
    expect(gateChips).toHaveLength(1);
    expect(gateChips[0].textContent).toMatch(/SECOPS_APPROVED/);
    expect(gateChips[0].textContent).toMatch(/rejected/);
  });

  it('shows no gate chip on a card that carries no gates', () => {
    // ADT-2 carries no gates.
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="card-ADT-2"] [data-testid="chip-gate"]')).toBeNull();
  });

  it('shows a muted placeholder for a stage column with no tickets (never vanishes)', () => {
    const oneOnly: ProjectState = { ...STATE, tickets: [STATE.tickets![0]] };
    const { host } = mount(oneOnly);
    const vision = host.querySelector('[data-testid="column-stage-vision"]')!;
    expect(vision.querySelector('[data-testid="column-empty-vision"]')?.textContent).toMatch(/nothing/i);
  });

  it('advance posts toStage = the NEXT workflow stage with the current rev and the X-AIDT guard', async () => {
    const { fixture, host, http } = mount(STATE);
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const advance = host.querySelector('[data-testid="card-ADT-1"] [data-testid="menu-advance"]') as HTMLButtonElement;
    // ADT-1 is at 'code'; the next stage in the workflow order is 'security'.
    expect(advance.textContent).toMatch(/security/);
    advance.click();
    const req = http.expectOne('/api/ticket/advance');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toMatchObject({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1' });
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('includes the scoped project id on the advance body when the control plane is scoped', async () => {
    const { fixture, host, http } = mount(STATE);
    TestBed.inject(ControlPlaneService).setProject('abcdef123456');
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="menu-advance"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/ticket/advance');
    expect((req.request.body as { project?: string }).project).toBe('abcdef123456');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('offers no advance for a ticket already at the last stage', () => {
    const { fixture, host } = mount(STATE);
    (host.querySelector('[data-testid="done-folder-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="card-ADT-4"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="card-ADT-4"] [data-testid="menu-advance"]')).toBeNull();
    expect(host.querySelector('[data-testid="card-ADT-4"] [data-testid="menu-no-advance"]')).toBeTruthy();
  });

  it('surfaces an off-track ticket in a labelled off-track lane (never hidden, never re-keyed)', () => {
    const orphaned: ProjectState = {
      ...STATE,
      tickets: [
        ...STATE.tickets!,
        { id: 'ADT-9', title: 'Spike', status: 'waiting', stage: 'design-review', track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(orphaned);
    const lane = host.querySelector('[data-testid="off-track-lane"]')!;
    expect(lane).toBeTruthy();
    expect(lane.textContent).toMatch(/off-track/i);
    expect(lane.querySelector('[data-testid="off-track-group-design-review"]')?.textContent).toContain('design-review');
    expect(lane.querySelector('[data-testid="card-ADT-9"]')).toBeTruthy();
    // The card is unchanged in any column — it is surfaced, not silently re-homed.
    expect(host.querySelector('[data-testid="column-stage-vision"]')!.textContent).not.toContain('ADT-9');
  });

  it('hides the off-track lane entirely when every ticket sits on a real stage (absent-not-zero)', () => {
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="off-track-lane"]')).toBeNull();
  });

  it('lets an off-track ticket advance onto a real stage (re-home), posting the first stage', async () => {
    const orphaned: ProjectState = {
      ...STATE,
      tickets: [{ id: 'ADT-9', title: 'Spike', status: 'waiting', stage: 'design-review', gates: [], comments: [] }],
    };
    const { fixture, host, http } = mount(orphaned);
    (host.querySelector('[data-testid="card-ADT-9"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const advance = host.querySelector('[data-testid="card-ADT-9"] [data-testid="menu-advance"]') as HTMLButtonElement;
    expect(advance.textContent).toMatch(/vision/);
    advance.click();
    const req = http.expectOne('/api/ticket/advance');
    expect(req.request.body).toMatchObject({ id: 'ADT-9', toStage: 'vision' });
    req.flush({ ok: true, state: { ...orphaned, rev: 'r2' } });
    await settle(fixture);
  });

  it('re-lays out the columns live when the workflow view changes (a stage edit pushed over SSE)', () => {
    const { fixture, host } = mount(STATE);
    // 4 stages with 'done' terminal → 3 stage columns + the done folder.
    expect([...host.querySelectorAll('[data-testid^="column-stage-"]')]).toHaveLength(3);

    // A workflow edit removes 'security' and adds 'review' — pushed as fresh state.
    const editedWorkflow: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'vision', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'review', owner: '/rev', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    fixture.componentRef.setInput('state', { ...STATE, rev: 'r2', workflowView: editedWorkflow });
    fixture.detectChanges();

    const cols = [...host.querySelectorAll('[data-testid^="column-stage-"]')].map((c) => c.getAttribute('data-testid'));
    // 'done' is the terminal stage → it is the done folder, not a stage column.
    expect(cols).toEqual(['column-stage-vision', 'column-stage-code', 'column-stage-review']);
    expect(host.querySelector('[data-testid="done-folder"]')).toBeTruthy();
    // ADT-3 was at 'security' which is now gone → it drops into the off-track lane, not dropped.
    expect(host.querySelector('[data-testid="off-track-lane"] [data-testid="card-ADT-3"]')).toBeTruthy();
  });

  it('surfaces a 409 on advance as an inline conflict on the card with a retry', async () => {
    const { fixture, host, http } = mount(STATE);
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="menu-advance"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/ticket/advance');
    req.flush({ ok: false, conflict: true, state: { ...STATE, rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    const card = host.querySelector('[data-testid="card-ADT-1"]')!;
    expect(card.querySelector('[data-testid="card-conflict"]')).toBeTruthy();
    expect(card.textContent).toMatch(/changed|retry/i);
  });

  it('escapes an untrusted card title (no HTML injection on the board)', () => {
    const xss: ProjectState = { ...STATE, tickets: [{ id: 'X', title: '<img src=x onerror=alert(1)>', status: 'in_progress', stage: 'vision', gates: [], comments: [] }] };
    const { host } = mount(xss);
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('escapes an untrusted stage name and owner in a column header (no HTML injection)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    // Two stages so `evil` is a real (non-terminal) stage column, not collapsed into the done folder.
    const xssWorkflow: WorkflowView = { activeTrack: 'full', stages: [{ stage: evil, owner: evil, gate: null }, { stage: 'done', owner: null, gate: null }] };
    const { host } = mount({ ...STATE, workflowView: xssWorkflow, tickets: [] });
    expect(host.querySelector('img')).toBeNull();
    const header = host.querySelector('[data-testid="pipeline-rail"] .col__head')!;
    expect(header.textContent).toContain(evil);
  });

  it('escapes an untrusted off-track stage label (no HTML injection)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const orphaned: ProjectState = {
      ...STATE,
      tickets: [{ id: 'ADT-9', title: 'Spike', status: 'waiting', stage: evil, gates: [], comments: [] }],
    };
    const { host } = mount(orphaned);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-testid="off-track-lane"]')!.textContent).toContain(evil);
  });

  it('opens the detail modal when a card is activated and emits applied state up', () => {
    const { fixture, host } = mount(STATE);
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="detail-header"]')!.textContent).toContain('ADT-1');
    (host.querySelector('[data-testid="detail-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(applied).toBeNull();
  });

  it('the open detail reflects a live state push without closing', () => {
    const { fixture, host } = mount(STATE);
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const live: ProjectState = {
      ...STATE,
      rev: 'r2',
      tickets: STATE.tickets!.map((t) => (t.id === 'ADT-1' ? { ...t, comments: [{ id: 'k', author: '/x', ts: '2026-06-08T10:00:00Z', body: 'pushed live' }] } : t)),
    };
    fixture.componentRef.setInput('state', live);
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="comments"]')!.textContent).toContain('pushed live');
  });

  it('shows the empty board invitation when there are no tickets and no stages', () => {
    const { host } = mount({ ...STATE, workflowView: { activeTrack: null, stages: [] }, tickets: [], taskSummary: { total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } } });
    expect(host.textContent).toMatch(/No tasks yet/i);
  });

  it('moves focus across stage columns with ArrowRight / ArrowLeft for keyboard navigation', () => {
    const { fixture, host } = mount(STATE);
    const cols = [...host.querySelectorAll<HTMLElement>('[data-testid^="column-stage-"]')];
    cols[0].focus();
    cols[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(cols[1]);
    cols[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(cols[0]);
  });

  it('announces a live board update via an aria-live region', () => {
    const { host } = mount(STATE);
    const live = host.querySelector('[data-testid="board-live"]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows a quiet escaped "Tasks for {project}" cue when a project name is given', () => {
    TestBed.configureTestingModule({
      imports: [TasksBoardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() }],
    });
    const fixture = TestBed.createComponent(TasksBoardComponent);
    fixture.componentRef.setInput('state', STATE);
    fixture.componentRef.setInput('projectName', '<b>payments</b>');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const cue = host.querySelector('[data-testid="board-project-cue"]')!;
    expect(cue.textContent).toMatch(/Tasks for/i);
    expect(cue.textContent).toContain('<b>payments</b>');
    expect(host.querySelector('b')).toBeNull();
  });
});

const BACKLOG_WF: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
    { stage: 'review', owner: '/rev', gate: { name: 'CODE_REVIEWED', refusal: 'soft' } },
    { stage: 'done', owner: null, gate: null },
  ],
};

/** A mixed set that exercises every region: backlog, mid-stage, terminal/done, off-track. */
const MIXED_STATE: ProjectState = {
  rev: 'r1',
  preset: 'solo',
  workflowView: BACKLOG_WF,
  tracks: { full: ['vision', 'architecture', 'review', 'done'] },
  gateDefs: [],
  taskSummary: { total: 6, byStatus: { in_progress: 2, waiting: 1, blocked: 1, done: 1, needsYou: 1 } },
  tickets: [
    { id: 'B-1', title: 'Idea one', status: 'waiting', stage: undefined, track: 'full', gates: [], comments: [] },
    { id: 'B-2', title: 'Idea two', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
    { id: 'M-1', title: 'Mid task', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po', gates: [], comments: [] },
    { id: 'M-2', title: 'Routed task', status: 'in_progress', stage: 'architecture', track: 'full', assignee: '/arch',
      gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }], labels: ['TO_DEV_BE'], comments: [] },
    { id: 'D-1', title: 'Shipped task', status: 'done', stage: 'done', track: 'full', assignee: '/qa', gates: [], comments: [] },
    { id: 'O-1', title: 'Orphan task', status: 'waiting', stage: 'gone-stage', track: 'full', gates: [], comments: [] },
  ],
};

describe('TasksBoardComponent — pipeline (backlog bar / rail / done folder / parity)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists Backlog tickets (unstaged or backlog-staged) in the sticky left Backlog bar', () => {
    const { host } = mount(MIXED_STATE);
    const bar = host.querySelector('[data-testid="backlog-bar"]')!;
    expect(bar).toBeTruthy();
    expect(bar.querySelector('[data-testid="card-B-1"]')).toBeTruthy();
    expect(bar.querySelector('[data-testid="card-B-2"]')).toBeTruthy();
    // A backlog ticket never doubles into a stage column.
    expect(host.querySelector('[data-testid="column-stage-vision"]')!.textContent).not.toContain('B-1');
  });

  it('shows the Backlog count and an inert "+ idea" affordance that does not write', () => {
    const { host } = mount(MIXED_STATE);
    expect(host.querySelector('[data-testid="backlog-count"]')!.textContent).toContain('2');
    const add = host.querySelector('[data-testid="backlog-add"]') as HTMLButtonElement;
    expect(add).toBeTruthy();
    expect(add.disabled).toBe(true);
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(add.getAttribute('href')).toBeNull();
  });

  it('shows a muted placeholder when the Backlog is empty (never a bare box)', () => {
    const { host } = mount({ ...MIXED_STATE, tickets: MIXED_STATE.tickets!.filter((t) => !['B-1', 'B-2'].includes(t.id!)) });
    expect(host.querySelector('[data-testid="backlog-empty"]')!.textContent).toMatch(/clear/i);
  });

  it('renders a connecting rail with one node per stage, shaped by gate hardness', () => {
    const { host } = mount(MIXED_STATE);
    expect(host.querySelector('[data-testid="pipeline-rail"]')).toBeTruthy();
    // vision: no gate → plain dot; architecture: hard gate → solid diamond; review: soft → dashed diamond.
    expect(host.querySelector('[data-testid="rail-node-vision"]')!.getAttribute('data-node')).toBe('none');
    expect(host.querySelector('[data-testid="rail-node-architecture"]')!.getAttribute('data-node')).toBe('gate-hard');
    expect(host.querySelector('[data-testid="rail-node-review"]')!.getAttribute('data-node')).toBe('gate-soft');
    // The terminal node marks the done terminus.
    expect(host.querySelector('[data-testid="rail-node-done"]')!.getAttribute('data-node')).toBe('terminal');
  });

  it('marks the rail active segment up to the furthest in-progress stage', () => {
    const { host } = mount(MIXED_STATE);
    // M-2 (in_progress) sits at 'architecture' (index 1) → that node is the active edge.
    expect(host.querySelector('[data-testid="rail-node-architecture"]')!.getAttribute('data-active')).toBe('true');
    // 'review' is past the furthest in-progress stage → not active.
    expect(host.querySelector('[data-testid="rail-node-review"]')!.getAttribute('data-active')).toBe('false');
  });

  it('collapses terminal-stage tickets into a clickable done folder that expands and re-collapses', () => {
    const { fixture, host } = mount(MIXED_STATE);
    const folder = host.querySelector('[data-testid="done-folder"]')!;
    expect(folder.querySelector('[data-testid="done-folder-count"]')!.textContent).toContain('1');
    // Collapsed: the done card is not yet listed.
    expect(host.querySelector('[data-testid="done-folder-list"]')).toBeNull();
    const toggle = host.querySelector('[data-testid="done-folder-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-testid="done-folder-list"]')!.textContent).toContain('D-1');
    toggle.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="done-folder-list"]')).toBeNull();
  });

  it('shows a label chip on a card that carries a label (escaped)', () => {
    const { host } = mount(MIXED_STATE);
    const chip = host.querySelector('[data-testid="card-M-2"] [data-testid="chip-label"]')!;
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('TO_DEV_BE');
  });

  it('rolls up needs-you and total in the board header (absent-not-zero needs-you)', () => {
    const { host } = mount(MIXED_STATE);
    const roll = host.querySelector('[data-testid="board-rollup"]')!;
    expect(roll.textContent).toMatch(/6/); // total tasks
    expect(host.querySelector('[data-testid="rollup-needs-you"]')!.textContent).toMatch(/1/);
  });

  it('omits the needs-you roll-up when nothing needs the human (absent, never a zero)', () => {
    const calm = { ...MIXED_STATE, tickets: MIXED_STATE.tickets!.filter((t) => t.id !== 'M-2') };
    const { host } = mount(calm);
    expect(host.querySelector('[data-testid="rollup-needs-you"]')).toBeNull();
  });

  it('keeps the off-track lane for a ticket at a stage no longer in the track', () => {
    const { host } = mount(MIXED_STATE);
    const lane = host.querySelector('[data-testid="off-track-lane"]')!;
    expect(lane.querySelector('[data-testid="card-O-1"]')).toBeTruthy();
    expect(lane.textContent).toMatch(/nothing's lost/i);
  });

  it('gates motion behind a reduced-motion check (data-motion reflects the preference)', () => {
    const { host } = mount(MIXED_STATE);
    const root = host.querySelector('[data-testid="pipeline-root"]')!;
    expect(root.getAttribute('data-motion')).toMatch(/^(on|off)$/);
  });

  it('DISJOINTNESS (R1): every ticket renders in EXACTLY ONE region', () => {
    const { fixture, host } = mount(MIXED_STATE);
    // Expand the done folder so its cards are in the DOM and counted.
    (host.querySelector('[data-testid="done-folder-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const regions: Record<string, Element | null> = {
      backlog: host.querySelector('[data-testid="backlog-bar"]'),
      rail: host.querySelector('[data-testid="pipeline-rail"]'),
      done: host.querySelector('[data-testid="done-folder"]'),
      offtrack: host.querySelector('[data-testid="off-track-lane"]'),
    };

    for (const t of MIXED_STATE.tickets!) {
      const id = t.id!;
      const hits = Object.entries(regions)
        .filter(([, root]) => root?.querySelector(`[data-testid="card-${id}"]`))
        .map(([name]) => name);
      expect(hits, `ticket ${id} should appear in exactly one region, found in: ${hits.join(', ') || 'none'}`).toHaveLength(1);
    }

    // And the whole board renders every ticket exactly once (no orphan, no duplicate).
    const allCards = [...host.querySelectorAll('[data-testid^="card-"]')].map((c) => c.getAttribute('data-testid'));
    const ids = MIXED_STATE.tickets!.map((t) => `card-${t.id}`);
    for (const id of ids) {
      expect(allCards.filter((c) => c === id)).toHaveLength(1);
    }
  });
});
