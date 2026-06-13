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

  it('aligns the active-segment accent with the rendered rail when the workflow opens with a `backlog` stage', () => {
    // The rail drops the literal `backlog` stage, so `code` is the first rendered node. The active
    // accent (furthest in-progress) must light `code`, not the node one position further along.
    const wfBacklogFirst: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'backlog', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'review', owner: '/rev', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    const state: ProjectState = {
      ...MIXED_STATE,
      workflowView: wfBacklogFirst,
      tracks: { full: ['backlog', 'code', 'review', 'done'] },
      tickets: [
        { id: 'C-1', title: 'Coding', status: 'in_progress', stage: 'code', track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(state);
    // `code` holds the furthest in-progress ticket → its node is the active edge.
    expect(host.querySelector('[data-testid="rail-node-code"]')!.getAttribute('data-active')).toBe('true');
    // `review` sits past the furthest in-progress stage → not active (no off-by-one bleed).
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

  it('rolls up needs-you from the canonical Core taskSummary value, not the client derivation', () => {
    // The Core counts 3 needs-you (e.g. a waiting ticket awaiting its expected owner), while the
    // client-side rejected-hard-gate derivation only finds 1 (M-2). The header must trust the Core.
    const coreCounts = { ...MIXED_STATE, taskSummary: { total: 6, byStatus: { in_progress: 2, waiting: 1, blocked: 1, done: 1, needsYou: 3 } } };
    const { host } = mount(coreCounts);
    expect(host.querySelector('[data-testid="rollup-needs-you"]')!.textContent).toMatch(/3/);
  });

  it('falls back to the client needs-you derivation when the Core taskSummary is absent', () => {
    const noSummary = { ...MIXED_STATE, taskSummary: undefined };
    const { host } = mount(noSummary);
    // Only M-2 carries a rejected hard gate → the client derivation finds 1.
    expect(host.querySelector('[data-testid="rollup-needs-you"]')!.textContent).toMatch(/1/);
  });

  it('omits the needs-you roll-up when the Core reports zero needs-you (absent, never a zero)', () => {
    const calm = {
      ...MIXED_STATE,
      taskSummary: { total: 6, byStatus: { in_progress: 2, waiting: 1, blocked: 1, done: 1, needsYou: 0 } },
      tickets: MIXED_STATE.tickets!.filter((t) => t.id !== 'M-2'),
    };
    const { host } = mount(calm);
    expect(host.querySelector('[data-testid="rollup-needs-you"]')).toBeNull();
  });

  it('omits the needs-you roll-up when the Core summary is absent and nothing needs the human', () => {
    const calm = { ...MIXED_STATE, taskSummary: undefined, tickets: MIXED_STATE.tickets!.filter((t) => t.id !== 'M-2') };
    const { host } = mount(calm);
    expect(host.querySelector('[data-testid="rollup-needs-you"]')).toBeNull();
  });

  it('marks the terminal done node active when work has reached the done stage', () => {
    // MIXED_STATE has D-1 in the terminal 'done' stage → the done node is the active edge.
    const { host } = mount(MIXED_STATE);
    expect(host.querySelector('[data-testid="rail-node-done"]')!.getAttribute('data-active')).toBe('true');
  });

  it('marks the terminal done node inactive when nothing has reached done (empty done folder)', () => {
    const noneDone = { ...MIXED_STATE, tickets: MIXED_STATE.tickets!.filter((t) => t.id !== 'D-1') };
    const { host } = mount(noneDone);
    expect(host.querySelector('[data-testid="rail-node-done"]')!.getAttribute('data-active')).toBe('false');
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

  it('targets the done-named stage for the folder even when a stage follows it (a Test stage after done)', () => {
    // A workflow with a `Test` stage AFTER `done`: the folder must hold the `done` tickets (real
    // count), and `done` must NOT also render as a regular column. `Test` stays a normal column.
    const wfTestAfterDone: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
        { stage: 'Test', owner: '/qa', gate: null },
      ],
    };
    const tickets = Array.from({ length: 8 }, (_, i) => ({
      id: `DN-${i}`, title: `Done ${i}`, status: 'done', stage: 'done', track: 'full', gates: [], comments: [],
    }));
    const state: ProjectState = {
      ...STATE,
      workflowView: wfTestAfterDone,
      tracks: { full: ['code', 'done', 'Test'] },
      tickets: [
        { id: 'C-1', title: 'Coding', status: 'in_progress', stage: 'code', track: 'full', gates: [], comments: [] },
        ...tickets,
        { id: 'T-1', title: 'Testing', status: 'waiting', stage: 'Test', track: 'full', gates: [], comments: [] },
      ],
    };
    const { fixture, host } = mount(state);

    // The done folder shows the REAL done count (8), not the trailing stage's count.
    expect(host.querySelector('[data-testid="done-folder-count"]')!.textContent).toContain('8');

    // `done` is NOT a regular stage column; `code` and `Test` are.
    const cols = [...host.querySelectorAll('[data-testid^="column-stage-"]')].map((c) => c.getAttribute('data-testid'));
    expect(cols).toEqual(['column-stage-code', 'column-stage-Test']);
    expect(host.querySelector('[data-testid="column-stage-done"]')).toBeNull();

    // The trailing `Test` column holds its own ticket, not the done ones.
    expect(host.querySelector('[data-testid="column-stage-Test"]')!.textContent).toContain('T-1');
    expect(host.querySelector('[data-testid="column-stage-Test"]')!.textContent).not.toContain('DN-0');

    // Expanding the folder lists the 8 done tickets.
    (host.querySelector('[data-testid="done-folder-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="done-folder-list"]')!.textContent).toContain('DN-0');
  });

  it('renders the off-track lane as a fixed right-side panel after the done folder, within the train', () => {
    const { host } = mount(MIXED_STATE);
    const train = host.querySelector('[data-testid="pipeline-train"]')!;
    expect(train).toBeTruthy();
    const lane = host.querySelector('[data-testid="off-track-lane"]')!;
    expect(lane).toBeTruthy();
    // The off-track lane sits inside the same horizontal train as the rail and done folder (right side).
    expect(train.contains(lane)).toBe(true);
    // The done folder precedes the off-track lane in document order (off-track is the right-most region).
    const done = host.querySelector('[data-testid="done-folder"]')!;
    expect(done.compareDocumentPosition(lane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lays the train out as four direct-child regions in order: Backlog → rail → Done → Off-track', () => {
    const { host } = mount(MIXED_STATE);
    const train = host.querySelector('[data-testid="pipeline-train"]')!;
    // The four regions are DIRECT children of the train (a single flex row), in this exact order.
    const directRegions = [...train.children]
      .map((el) => el.getAttribute('data-testid'))
      .filter((id): id is string => id !== null);
    expect(directRegions).toEqual([
      'backlog-bar',
      'pipeline-rail',
      'done-folder',
      'off-track-lane',
    ]);
  });

  it('nests every stage column inside the middle rail, with the side panels as the rail\'s siblings (not nested in it)', () => {
    const { host } = mount(MIXED_STATE);
    const rail = host.querySelector('[data-testid="pipeline-rail"]')!;
    // The horizontally-scrolling middle region holds the stage columns...
    const cols = [...host.querySelectorAll('[data-testid^="column-stage-"]')];
    expect(cols.length).toBeGreaterThan(0);
    for (const col of cols) {
      expect(rail.contains(col)).toBe(true);
    }
    // ...while the fixed side panels live OUTSIDE the scrolling rail (siblings, so the rail can scroll
    // beneath/between them without the panels moving or floating over the scrolled stages).
    for (const id of ['backlog-bar', 'done-folder', 'off-track-lane']) {
      const panel = host.querySelector(`[data-testid="${id}"]`)!;
      expect(panel).toBeTruthy();
      expect(rail.contains(panel)).toBe(false);
      expect(panel.contains(rail)).toBe(false);
    }
  });

  it('keeps the four regions as direct children of the single train row so each side panel holds its own track', () => {
    const { host } = mount(MIXED_STATE);
    const train = host.querySelector('[data-testid="pipeline-train"]')!;
    const ids = ['backlog-bar', 'pipeline-rail', 'done-folder', 'off-track-lane'];
    // Each region is a DIRECT child of the train (a peer in the flex row), not buried inside another.
    for (const id of ids) {
      const region = host.querySelector(`[data-testid="${id}"]`)!;
      expect(region.parentElement).toBe(train);
    }
  });

  it('keeps the off-track lane absent when every ticket sits on a real stage (absent-not-zero, right side)', () => {
    const onTrack = { ...MIXED_STATE, tickets: MIXED_STATE.tickets!.filter((t) => t.id !== 'O-1') };
    const { host } = mount(onTrack);
    expect(host.querySelector('[data-testid="off-track-lane"]')).toBeNull();
  });

  it('keeps an off-track ticket advanceable from the right-side lane (re-home onto a real stage)', async () => {
    const { fixture, host, http } = mount(MIXED_STATE);
    const lane = host.querySelector('[data-testid="off-track-lane"]')!;
    (lane.querySelector('[data-testid="card-O-1"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const advance = lane.querySelector('[data-testid="card-O-1"] [data-testid="menu-advance"]') as HTMLButtonElement;
    expect(advance).toBeTruthy();
    advance.click();
    const req = http.expectOne('/api/ticket/advance');
    expect(req.request.body).toMatchObject({ id: 'O-1', toStage: 'vision' });
    req.flush({ ok: true, state: { ...MIXED_STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('marks the rail adaptive so stage columns flex to fill the available width', () => {
    const { host } = mount(MIXED_STATE);
    // The rail opts into the adaptive (flex-grow, fills the viewport) layout rather than fixed-narrow.
    expect(host.querySelector('[data-testid="pipeline-rail"]')!.getAttribute('data-adaptive')).toBe('true');
  });

  it('workflow-aware Backlog: a ticket at a pre-start token the workflow DEFINES lands in that column, not Backlog', () => {
    // The workflow legitimately names `ready` as a real stage — the builder allows arbitrary names.
    const readyStageWf: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'ready', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    const state: ProjectState = {
      ...MIXED_STATE,
      workflowView: readyStageWf,
      tracks: { full: ['ready', 'code', 'done'] },
      tickets: [
        { id: 'R-1', title: 'At ready', status: 'in_progress', stage: 'ready', track: 'full', gates: [], comments: [] },
        { id: 'B-1', title: 'Unstaged idea', status: 'waiting', stage: undefined, track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(state);

    // R-1 routes to the `ready` COLUMN (a real stage), never the Backlog bar.
    const readyColumn = host.querySelector('[data-testid="column-stage-ready"]')!;
    expect(readyColumn).toBeTruthy();
    expect(readyColumn.querySelector('[data-testid="card-R-1"]')).toBeTruthy();
    const backlogBar = host.querySelector('[data-testid="backlog-bar"]')!;
    expect(backlogBar.querySelector('[data-testid="card-R-1"]')).toBeNull();

    // The unstaged ticket still falls to Backlog (pre-start / never routed).
    expect(backlogBar.querySelector('[data-testid="card-B-1"]')).toBeTruthy();
  });
});

/**
 * A many-stage workflow (the `full` track shape) with most stages empty — the case the adaptive
 * train targets: empty stages collapse to thin compact stations so the rail does not scroll through
 * empty columns, while populated stages expand to real columns.
 */
const WIDE_WF: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
    { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
    { stage: 'design', owner: '/ui', gate: { name: 'DESIGN_APPROVED', refusal: 'soft' } },
    { stage: 'tdd', owner: '/be', gate: null },
    { stage: 'code_review', owner: '/rev', gate: { name: 'CODE_REVIEWED', refusal: 'soft' } },
    { stage: 'qa', owner: '/qa', gate: null },
    { stage: 'verify', owner: '/verify', gate: null },
    { stage: 'done', owner: null, gate: null },
  ],
};

function wideState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    rev: 'r1',
    preset: 'solo',
    workflowView: WIDE_WF,
    tracks: { full: ['vision', 'security', 'architecture', 'design', 'tdd', 'code_review', 'qa', 'verify', 'done'] },
    gateDefs: [],
    taskSummary: { total: 2, byStatus: { in_progress: 0, waiting: 1, blocked: 0, done: 1, needsYou: 0 } },
    tickets: [
      { id: 'BL-1', title: 'Idea', status: 'waiting', stage: undefined, track: 'full', gates: [], comments: [] },
      { id: 'DN-1', title: 'Shipped', status: 'done', stage: 'done', track: 'full', gates: [], comments: [] },
    ],
    ...overrides,
  };
}

describe('TasksBoardComponent — adaptive train (compact stations + expanded columns)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders an EMPTY stage as a COMPACT station: data-state=compact, the name + 0 count, no card list', () => {
    const { host } = mount(wideState());
    const vision = host.querySelector('[data-testid="column-stage-vision"]')!;
    expect(vision.getAttribute('data-state')).toBe('compact');
    // The station still shows the stage name and a real 0 count (absent-not-zero: a real count).
    expect(vision.textContent).toContain('vision');
    expect(vision.querySelector('[data-testid="column-count"]')!.textContent).toContain('0');
    // A compact station does not render its (empty) card list as a visible column body.
    expect(vision.querySelector('.col__cards')).toBeNull();
  });

  it('keeps the stable contract on a compact station: column-stage-*, column-count, rail-node-* with data-node/data-active, column-empty-*', () => {
    const { host } = mount(wideState());
    const vision = host.querySelector('[data-testid="column-stage-vision"]')!;
    // Node shape + active state still resolve on a compact station.
    const node = vision.querySelector('[data-testid="rail-node-vision"]')!;
    expect(node.getAttribute('data-node')).toBe('none');
    expect(node.getAttribute('data-active')).toMatch(/^(true|false)$/);
    const security = host.querySelector('[data-testid="column-stage-security"]')!;
    expect(security.querySelector('[data-testid="rail-node-security"]')!.getAttribute('data-node')).toBe('gate-hard');
    // The empty marker is present in the DOM (for tests + screen readers) even when compact.
    expect(vision.querySelector('[data-testid="column-empty-vision"]')).toBeTruthy();
  });

  it('renders a POPULATED stage as an EXPANDED column: data-state=expanded, with its task cards', () => {
    const populated = wideState({
      tickets: [
        { id: 'BL-1', title: 'Idea', status: 'waiting', stage: undefined, track: 'full', gates: [], comments: [] },
        { id: 'A-1', title: 'Building', status: 'in_progress', stage: 'architecture', track: 'full', assignee: '/arch', gates: [], comments: [] },
        { id: 'DN-1', title: 'Shipped', status: 'done', stage: 'done', track: 'full', gates: [], comments: [] },
      ],
    });
    const { host } = mount(populated);
    const arch = host.querySelector('[data-testid="column-stage-architecture"]')!;
    expect(arch.getAttribute('data-state')).toBe('expanded');
    expect(arch.querySelector('.col__cards')).toBeTruthy();
    expect(arch.querySelector('[data-testid="card-A-1"]')).toBeTruthy();
    expect(arch.querySelector('[data-testid="column-count"]')!.textContent).toContain('1');
    // An adjacent empty stage stays compact alongside it.
    expect(host.querySelector('[data-testid="column-stage-tdd"]')!.getAttribute('data-state')).toBe('compact');
  });

  it('keeps every stage rendered (compact + expanded) so the rail does not scroll through empty columns', () => {
    const populated = wideState({
      tickets: [
        { id: 'A-1', title: 'Building', status: 'in_progress', stage: 'architecture', track: 'full', gates: [], comments: [] },
        { id: 'DN-1', title: 'Shipped', status: 'done', stage: 'done', track: 'full', gates: [], comments: [] },
      ],
    });
    const { host } = mount(populated);
    const cols = [...host.querySelectorAll('[data-testid^="column-stage-"]')];
    // All 8 non-terminal stages render (done is the folder).
    expect(cols).toHaveLength(8);
    // Most are compact (only architecture is populated) — the rail's natural width stays small.
    const compact = cols.filter((c) => c.getAttribute('data-state') === 'compact');
    const expanded = cols.filter((c) => c.getAttribute('data-state') === 'expanded');
    expect(expanded).toHaveLength(1);
    expect(compact).toHaveLength(7);
  });

  it('shows the calm-middle line when the whole middle is empty AND there is work elsewhere', () => {
    // wideState has Backlog (BL-1) + Done (DN-1) populated, the entire middle empty.
    const { host } = mount(wideState());
    const line = host.querySelector('[data-testid="rail-middle-empty"]');
    expect(line).toBeTruthy();
    expect(line!.textContent).toMatch(/mid-pipeline/i);
  });

  it('omits the calm-middle line when a middle stage holds work', () => {
    const populated = wideState({
      tickets: [
        { id: 'BL-1', title: 'Idea', status: 'waiting', stage: undefined, track: 'full', gates: [], comments: [] },
        { id: 'A-1', title: 'Building', status: 'in_progress', stage: 'architecture', track: 'full', gates: [], comments: [] },
      ],
    });
    const { host } = mount(populated);
    expect(host.querySelector('[data-testid="rail-middle-empty"]')).toBeNull();
  });

  it('omits the calm-middle line on a whole-board-empty state (the board-empty invitation owns that case)', () => {
    const { host } = mount({ ...wideState(), workflowView: { activeTrack: null, stages: [] }, tickets: [], taskSummary: { total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } } });
    // Nothing anywhere → the board-empty invitation, never the calm-middle line.
    expect(host.querySelector('[data-testid="board-empty"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="rail-middle-empty"]')).toBeNull();
  });

  it('omits the calm-middle line when stages exist but there is no work ANYWHERE (idle, not at-rest-with-work)', () => {
    // Stages present, every region empty → no calm-middle line (it teaches only when work waits elsewhere).
    const { host } = mount({ ...wideState(), tickets: [], taskSummary: { total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } } });
    expect(host.querySelector('[data-testid="rail-middle-empty"]')).toBeNull();
  });

  it('roves focus with ArrowRight / ArrowLeft ACROSS a compact station (no stage is keyboard-unreachable)', () => {
    const { fixture, host } = mount(wideState());
    const cols = [...host.querySelectorAll<HTMLElement>('[data-testid^="column-stage-"]')];
    // vision + security are both compact; arrow keys still traverse them.
    expect(cols[0].getAttribute('data-state')).toBe('compact');
    expect(cols[1].getAttribute('data-state')).toBe('compact');
    cols[0].focus();
    cols[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(cols[1]);
    cols[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(cols[0]);
  });

  it('keeps the four-region order [backlog][rail][done][off-track] with the adaptive rail', () => {
    const { host } = mount(wideState());
    const train = host.querySelector('[data-testid="pipeline-train"]')!;
    const directRegions = [...train.children]
      .map((el) => el.getAttribute('data-testid'))
      .filter((id): id is string => id !== null);
    // No off-track here → backlog, rail, done in order.
    expect(directRegions).toEqual(['backlog-bar', 'pipeline-rail', 'done-folder']);
  });
});

/**
 * The single-line metro contract. jsdom does not lay out flexbox, so `offsetTop` parity across
 * nodes is unreliable; instead we assert the CSS contract that guarantees one row: the rail does
 * not wrap, the compact stations stay narrow enough that ~11 fit a normal desktop width, the
 * track line spans the row, and the calm idle line is lifted out of the flex flow so it can never
 * push the stations onto a second row.
 */
describe('TasksBoardComponent — single-line metro rail (CSS contract)', () => {
  // Angular emits view-scoped CSS with a `[_ngcontent-…]` attribute appended to each selector and
  // strips quotes from attribute selectors, so a source `.col[data-state='compact'] {` is emitted as
  // `.col[data-state=compact][_ngcontent-%COMP%] {`. Match the selector head up to that boundary.
  function ruleBody(css: string, selectorHead: string): string {
    const head = selectorHead.replace(/'/g, '');
    const re = new RegExp(head.replace(/[.[\]]/g, '\\$&') + '\\[_ngcontent[^{]*\\{([^}]*)\\}');
    const m = css.match(re);
    expect(m, `selector not found: ${selectorHead}`).toBeTruthy();
    return m![1];
  }

  const styles: readonly string[] = ((TasksBoardComponent as unknown as { ɵcmp: { styles?: string[] } }).ɵcmp.styles ?? []);
  const css = styles.join('\n');

  it('lays the rail out as a single non-wrapping row of stations', () => {
    const rail = ruleBody(css, '.rail');
    expect(rail).toContain('flex-wrap: nowrap');
    expect(rail).not.toContain('flex-wrap: wrap');
  });

  it('runs a continuous track line across the single row of nodes', () => {
    const track = ruleBody(css, '.rail__track');
    expect(track).toContain('position: absolute');
    expect(track).toContain('left: 0');
    expect(track).toContain('right: 0');
  });

  it('keeps compact stations narrow (≤ ~2.1rem) so all 11 fit a desktop rail without horizontal scroll', () => {
    const compact = ruleBody(css, ".col[data-state='compact']");
    const maxW = compact.match(/max-width:\s*([\d.]+)rem/);
    const width = compact.match(/(?:^|;|\s)width:\s*([\d.]+)rem/);
    const bound = maxW ?? width;
    expect(bound, 'compact station must declare a rem width/max-width').toBeTruthy();
    // Tightened from 2.4rem: 11 × 2.1rem + 10 gaps must clear the ~33rem worst-case central rail.
    expect(Number(bound![1])).toBeLessThanOrEqual(2.1);
  });

  it('proves 11 compact stations + inter-node gaps fit the worst-case ~33rem central rail', () => {
    const compact = ruleBody(css, ".col[data-state='compact']");
    const w = Number((compact.match(/(?:^|;|\s)width:\s*([\d.]+)rem/) ?? [])[1]);
    // The compact inter-node gap is set on the rail for the compact-station case.
    const railCompactGap = Number(
      (css.match(/--rail-compact-gap:\s*([\d.]+)rem/) ?? [])[1],
    );
    expect(w, 'compact station width in rem').toBeGreaterThan(0);
    expect(railCompactGap, 'a named compact inter-node gap in rem').toBeGreaterThan(0);
    // 11 stations, 10 inter-node gaps. Worst case (off-track present) leaves the rail ~33rem.
    const trainWidth = 11 * w + 10 * railCompactGap;
    expect(trainWidth).toBeLessThanOrEqual(33);
  });

  it('places the calm idle line in the rail’s lower band, below the capped station label band (no overlap)', () => {
    const idle = ruleBody(css, '.rail__idle');
    // It must NOT be a full-basis flex item (flex: 1 1 100%) — that is what wrapped the row.
    expect(idle).not.toMatch(/flex:\s*1\s+1\s+100%/);
    // It is taken out of flow (absolute) so the station row stays single.
    expect(idle).toContain('position: absolute');
    // It is anchored to the BOTTOM of the rail (the open space beneath the nodes), not pinned at a
    // small top offset that would render on top of the vertical station labels.
    expect(idle).toMatch(/bottom:\s*0/);
    expect(idle).not.toMatch(/top:\s*2\.6rem/);
  });

  it('caps the compact station label band short so the idle line clears it', () => {
    // The compact label is a descendant selector; Angular appends a [_ngcontent…] hook to each
    // compound and separates them with whitespace, so match the rule body whitespace-tolerantly.
    const m = css.match(
      /\.col\[data-state=compact\]\[_ngcontent[^\]]*\]\s+\.col__stage\[_ngcontent[^{]*\{([^}]*)\}/,
    );
    expect(m, 'compact label rule not found').toBeTruthy();
    const cap = m![1].match(/max-height:\s*([\d.]+)rem/);
    expect(cap, 'compact label must cap its vertical height').toBeTruthy();
    // A short cap keeps the station band shallow so the bottom-anchored idle line never overlaps it.
    expect(Number(cap![1])).toBeLessThanOrEqual(4);
  });

  it('keeps overflow-x auto as the genuine-busy scroll fallback', () => {
    const rail = ruleBody(css, '.rail');
    expect(rail).toContain('overflow-x: auto');
  });
});
