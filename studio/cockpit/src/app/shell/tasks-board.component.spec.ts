import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import { ControlPlaneService } from '../core/control-plane.service';
import type { ProjectState, WorkflowView } from '../core/models';
import { settle } from '../testing/settle';
import { TasksBoardComponent } from './tasks-board.component';
import { TasksWorklistComponent } from './tasks-worklist.component';

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

/**
 * Mount the board. `mode` pins the view-mode the test exercises; it defaults to `'pipeline'` so the
 * existing stage-train assertions read the train regardless of the fixture's populated-stage count
 * (the worklist is covered by its own describe below). Pinning persists the choice up-front, which
 * the component adopts as the operator's explicit choice.
 */
function mount(
  state: ProjectState,
  mode: 'pipeline' | 'worklist' | 'auto' = 'pipeline',
): { fixture: ComponentFixture<TasksBoardComponent>; host: HTMLElement; http: HttpTestingController } {
  if (mode !== 'auto') {
    const project = state.project && state.project.trim() ? state.project : '_global';
    localStorage.setItem(`dart.tasks.viewMode.${project}`, mode);
  }
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

describe('TasksBoardComponent — shared card + detail + advance contract (Pipeline mode)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('renders the in-pipeline stages as chain nodes, in order, with name + owner + count', () => {
    const { host } = mount(STATE);
    const stages = [...host.querySelectorAll('[data-testid="pipeline-chain"] .stage-node')].map((s) =>
      s.getAttribute('data-testid'),
    );
    // 'done' is the end-cap, not a chain node; vision/code/security render in order.
    expect(stages).toEqual(['stage-vision', 'stage-code', 'stage-security']);
    const vision = host.querySelector('[data-testid="stage-vision"]')!;
    expect(vision.textContent).toContain('vision');
    expect(vision.textContent).toContain('/po');
    expect(host.querySelector('[data-testid="stage-count-code"]')?.textContent).toContain('1');
    expect(host.querySelector('[data-testid="stage-count-vision"]')?.textContent).toContain('1');
    // The done end-cap carries the done count.
    expect(host.querySelector('[data-testid="pipeline-done-ref"]')!.textContent).toContain('1');
  });

  it('places each in-pipeline card in its CURRENT-stage node; done cards are the end-cap count only', () => {
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="stage-code"]')!.textContent).toContain('ADT-1');
    expect(host.querySelector('[data-testid="stage-vision"]')!.textContent).toContain('ADT-2');
    expect(host.querySelector('[data-testid="stage-security"]')!.textContent).toContain('ADT-3');
    // The done ticket is NOT a card anywhere — its count lives on the end-cap.
    expect(host.querySelector('[data-testid="card-ADT-4"]')).toBeNull();
    expect(host.querySelector('[data-testid="pipeline-done-ref"]')!.textContent).toContain('1');
  });

  it('shows status as a card chip (not a node), and no status-named nodes exist', () => {
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="stage-in_progress"]')).toBeNull();
    expect(host.querySelector('[data-testid="stage-blocked"]')).toBeNull();
    const card = host.querySelector('[data-testid="card-ADT-1"]')!;
    expect(card.querySelector('[data-testid="chip-status"]')?.textContent).toMatch(/in progress/i);
  });

  it('shows a needs-you chip on a card with a rejected hard gate (chip, never a node)', () => {
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
    const gateChips = card.querySelectorAll('[data-testid="chip-gate"]');
    expect(gateChips).toHaveLength(1);
    // 'code' has no governing gate → roll-up of passed/total with text (never colour alone).
    expect(gateChips[0].textContent).toMatch(/3\s*\/\s*4/);
  });

  it('surfaces the governing gate of the current stage when it is unmet (a blocked card shows why)', () => {
    const { host } = mount(STATE);
    const card = host.querySelector('[data-testid="card-ADT-3"]')!;
    const gateChips = card.querySelectorAll('[data-testid="chip-gate"]');
    expect(gateChips).toHaveLength(1);
    expect(gateChips[0].textContent).toMatch(/SECOPS_APPROVED/);
    expect(gateChips[0].textContent).toMatch(/rejected/);
  });

  it('shows no gate chip on a card that carries no gates', () => {
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="card-ADT-2"] [data-testid="chip-gate"]')).toBeNull();
  });

  it('advance posts toStage = the NEXT workflow stage with the current rev and the X-AIDT guard', async () => {
    const { fixture, host, http } = mount(STATE);
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const advance = host.querySelector('[data-testid="card-ADT-1"] [data-testid="menu-advance"]') as HTMLButtonElement;
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

  it('re-lays out the chain live when the workflow view changes (a stage edit pushed over SSE)', () => {
    const { fixture, host } = mount(STATE);
    expect([...host.querySelectorAll('[data-testid="pipeline-chain"] .stage-node')]).toHaveLength(3);

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

    const stages = [...host.querySelectorAll('[data-testid="pipeline-chain"] .stage-node')].map((c) => c.getAttribute('data-testid'));
    expect(stages).toEqual(['stage-vision', 'stage-code', 'stage-review']);
    // ADT-3 was at 'security' which is now gone → off-track end-cap count, never a card.
    expect(host.querySelector('[data-testid="card-ADT-3"]')).toBeNull();
    expect(host.querySelector('[data-testid="pipeline-offtrack-ref"]')!.textContent).toContain('1');
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

  it('escapes an untrusted stage name and owner in a chain node header (no HTML injection)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const xssWorkflow: WorkflowView = { activeTrack: 'full', stages: [{ stage: evil, owner: evil, gate: null }, { stage: 'done', owner: null, gate: null }] };
    const { host } = mount({ ...STATE, workflowView: xssWorkflow, tickets: [{ id: 'X', title: 'x', status: 'in_progress', stage: evil, gates: [], comments: [] }] });
    expect(host.querySelector('img')).toBeNull();
    const node = host.querySelector('[data-testid="stage-' + evil + '"] .stage-node__head')!;
    expect(node.textContent).toContain(evil);
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

  it('announces a live board update via an aria-live region', () => {
    const { host } = mount(STATE);
    const live = host.querySelector('[data-testid="board-live"]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
  });

  it('gates motion behind a reduced-motion check (data-motion reflects the preference)', () => {
    const { host } = mount(STATE);
    const root = host.querySelector('[data-testid="pipeline-root"]')!;
    expect(root.getAttribute('data-motion')).toMatch(/^(on|off)$/);
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

  it('rolls up needs-you and total in the board header (absent-not-zero needs-you)', () => {
    const { host } = mount(MIXED_STATE);
    const roll = host.querySelector('[data-testid="board-rollup"]')!;
    expect(roll.textContent).toMatch(/6/); // total tasks
    expect(host.querySelector('[data-testid="rollup-needs-you"]')!.textContent).toMatch(/1/);
  });

  it('rolls up needs-you from the canonical Core taskSummary value, not the client derivation', () => {
    const coreCounts = { ...MIXED_STATE, taskSummary: { total: 6, byStatus: { in_progress: 2, waiting: 1, blocked: 1, done: 1, needsYou: 3 } } };
    const { host } = mount(coreCounts);
    expect(host.querySelector('[data-testid="rollup-needs-you"]')!.textContent).toMatch(/3/);
  });

  it('falls back to the client needs-you derivation when the Core taskSummary is absent', () => {
    const noSummary = { ...MIXED_STATE, taskSummary: undefined };
    const { host } = mount(noSummary);
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

  it('shows a label chip on an in-pipeline card that carries a label (escaped)', () => {
    const { host } = mount(MIXED_STATE);
    const chip = host.querySelector('[data-testid="card-M-2"] [data-testid="chip-label"]')!;
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('TO_DEV_BE');
  });

  it('DISJOINTNESS: every in-pipeline ticket renders exactly once as a card; backlog/done/off-track are counts only', () => {
    const { host } = mount(MIXED_STATE);
    // In-pipeline tickets render as cards exactly once.
    for (const id of ['M-1', 'M-2']) {
      expect(host.querySelectorAll(`[data-testid="card-${id}"]`)).toHaveLength(1);
    }
    // Backlog / done / off-track tickets render NO cards.
    for (const id of ['B-1', 'B-2', 'D-1', 'O-1']) {
      expect(host.querySelector(`[data-testid="card-${id}"]`), `${id} is a count, not a card`).toBeNull();
    }
    // Their counts survive on the end-caps (2 backlog, 1 done, 1 off-track).
    expect(host.querySelector('[data-testid="pipeline-backlog-ref"]')!.textContent).toContain('2');
    expect(host.querySelector('[data-testid="pipeline-done-ref"]')!.textContent).toContain('1');
    expect(host.querySelector('[data-testid="pipeline-offtrack-ref"]')!.textContent).toContain('1');
  });
});


const COARSE_WF: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'code', owner: '/be', gate: null },
    { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
    { stage: 'done', owner: null, gate: null },
  ],
};

/** Coarse-lifecycle state: work clusters at the ends (backlog/done) + a single in-flight stage. */
const COARSE_STATE: ProjectState = {
  rev: 'r1',
  preset: 'solo',
  project: 'p-coarse',
  workflowView: COARSE_WF,
  tracks: { full: ['vision', 'code', 'security', 'done'] },
  gateDefs: [{ name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops' }],
  taskSummary: { total: 4, byStatus: { in_progress: 1, waiting: 1, blocked: 0, done: 1, needsYou: 1 } },
  tickets: [
    // A needs-you ticket awaiting its expected owner with no live agent (the hub case) — held in the
    // backlog holding pen, so only ONE rail stage ('code') is populated → the worklist is the default.
    { id: 'W-NEED', title: 'Approve security', status: 'waiting', stage: 'backlog', track: 'full',
      expectedOwner: '/arch', active: false, gates: [], comments: [] },
    { id: 'W-FLOW', title: 'Wire SSE channel', status: 'in_progress', stage: 'code', track: 'full', assignee: '/be', gates: [], comments: [] },
    { id: 'W-BACK', title: 'Backlog idea', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
    { id: 'W-DONE', title: 'Add board', status: 'done', stage: 'done', track: 'full', assignee: '/fe', gates: [], comments: [] },
  ],
};

describe('TasksBoardComponent — worklist default + view-mode toggle', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('defaults to the WORKLIST and renders the work as cards (no empty stage scaffold) when ≤1 stage is populated', () => {
    const { host } = mount(COARSE_STATE, 'auto');
    expect(host.querySelector('[data-testid="worklist-root"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="pipeline-chain"]')).toBeNull();
    expect(host.querySelector('[data-testid="stage-vision"]')).toBeNull();
    // The actual tickets render as cards in the worklist.
    expect(host.querySelector('[data-testid="card-W-NEED"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="card-W-FLOW"]')).toBeTruthy();
  });

  it('auto-defaults to PIPELINE when ≥2 stages are simultaneously populated', () => {
    // STATE has vision/code/security all populated.
    const { host } = mount(STATE, 'auto');
    expect(host.querySelector('[data-testid="pipeline-chain"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="worklist-root"]')).toBeNull();
  });

  it('renders the bands in fixed order, needs-you first and visually primary', () => {
    const { host } = mount(COARSE_STATE, 'auto');
    const bands = [...host.querySelectorAll('[data-testid^="worklist-band-"]')]
      .map((b) => b.getAttribute('data-testid'))
      .filter((id) => id !== 'worklist-band-count');
    expect(bands).toEqual([
      'worklist-band-needs-you',
      'worklist-band-in-flight',
      'worklist-band-backlog',
      'worklist-band-recently-done',
    ]);
    // Needs-you is first in DOM order.
    expect(bands[0]).toBe('worklist-band-needs-you');
    const needsBand = host.querySelector('[data-testid="worklist-band-needs-you"]')!;
    expect(needsBand.classList.contains('band--needs-you')).toBe(true);
  });

  it('OMITS a zero-count band entirely (absent-not-zero, never a (0) header)', () => {
    // No blocked/off-track tickets here → no off-track band; and a needs-you-free state hides it.
    const { host } = mount(COARSE_STATE, 'auto');
    expect(host.querySelector('[data-testid="worklist-band-off-track"]')).toBeNull();
    expect(host.textContent).not.toMatch(/\(0\)/);
    // Every rendered band header shows a real, positive count.
    for (const c of host.querySelectorAll('[data-testid="worklist-band-count"]')) {
      expect(Number(c.textContent)).toBeGreaterThan(0);
    }
  });

  it('shows the plain-words needs-you reason on a needs-you card', () => {
    const { host } = mount(COARSE_STATE, 'auto');
    const reason = host.querySelector('[data-testid="card-W-NEED"] [data-testid="needs-you-reason"]');
    expect(reason?.textContent).toMatch(/\/arch approval pending/);
  });

  it('lays each band out as an auto-fill grid that fills the width (the dead-void killer)', () => {
    const wlStyles: readonly string[] = ((TasksWorklistComponent as unknown as { ɵcmp: { styles?: string[] } }).ɵcmp.styles ?? []);
    const wlCss = wlStyles.join('\n');
    expect(wlCss).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(16rem,\s*1fr\)\)/);
    // No horizontal scroll is introduced by the worklist root.
    expect(wlCss).not.toMatch(/overflow-x:\s*auto/);
  });

  it('switches Worklist → Pipeline via the radiogroup toggle and back, and the centre swaps', () => {
    const { fixture, host } = mount(COARSE_STATE, 'auto');
    expect(host.querySelector('[data-testid="worklist-root"]')).toBeTruthy();
    const switchEl = host.querySelector('[data-testid="view-mode-switch"]')!;
    expect(switchEl.getAttribute('role')).toBe('radiogroup');
    (host.querySelector('[data-testid="view-mode-pipeline"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="pipeline-chain"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="worklist-root"]')).toBeNull();
    expect(host.querySelector('[data-testid="view-mode-pipeline"]')!.getAttribute('aria-checked')).toBe('true');
    (host.querySelector('[data-testid="view-mode-worklist"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="worklist-root"]')).toBeTruthy();
  });

  it('persists the chosen mode per project (survives a remount/reload)', () => {
    const first = mount(COARSE_STATE, 'auto');
    (first.host.querySelector('[data-testid="view-mode-pipeline"]') as HTMLButtonElement).click();
    first.fixture.detectChanges();
    expect(localStorage.getItem('dart.tasks.viewMode.p-coarse')).toBe('pipeline');
    TestBed.resetTestingModule();
    // Re-mount the same project WITHOUT clearing storage → the persisted choice wins over auto.
    const second = mount(COARSE_STATE, 'auto');
    expect(second.host.querySelector('[data-testid="pipeline-chain"]')).toBeTruthy();
  });

  it('falls back to the auto-default without throwing when localStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage blocked');
      },
    });
    try {
      // Must not throw on read; coarse state → auto worklist.
      const { host } = mount(COARSE_STATE, 'auto');
      expect(host.querySelector('[data-testid="worklist-root"]')).toBeTruthy();
      // A manual switch must also not throw even though the write fails.
      expect(() => (host.querySelector('[data-testid="view-mode-pipeline"]') as HTMLButtonElement).click()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('all-clear: with zero needs-you, the Needs-you band AND the roll-up needs-you chip are both absent (no "0 need you")', () => {
    const clear: ProjectState = {
      ...COARSE_STATE,
      taskSummary: { total: 2, byStatus: { in_progress: 1, waiting: 0, blocked: 0, done: 1, needsYou: 0 } },
      tickets: [
        { id: 'C-FLOW', title: 'Flowing', status: 'in_progress', stage: 'code', track: 'full', assignee: '/be', gates: [], comments: [] },
        { id: 'C-DONE', title: 'Shipped', status: 'done', stage: 'done', track: 'full', assignee: '/fe', gates: [], comments: [] },
      ],
    };
    const { host } = mount(clear, 'auto');
    expect(host.querySelector('[data-testid="worklist-band-needs-you"]')).toBeNull();
    expect(host.querySelector('[data-testid="rollup-needs-you"]')).toBeNull();
    expect(host.textContent).not.toMatch(/0 need you/i);
  });

  it('needsYou parity in DOM: the Needs-you band size equals the canonical roll-up count', () => {
    const { host } = mount(COARSE_STATE, 'auto');
    const bandCards = host.querySelectorAll('[data-testid="worklist-band-needs-you"] li.card').length;
    const rollup = host.querySelector('[data-testid="rollup-needs-you"]')!.textContent!;
    expect(rollup).toMatch(new RegExp(`${bandCards} need you`));
    expect(bandCards).toBe(COARSE_STATE.taskSummary!.byStatus.needsYou);
  });

  it('a worklist card action stays the guarded control-plane advance (no new write path)', async () => {
    const { fixture, host, http } = mount(COARSE_STATE, 'auto');
    (host.querySelector('[data-testid="card-W-FLOW"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const advance = host.querySelector('[data-testid="card-W-FLOW"] [data-testid="menu-advance"]') as HTMLButtonElement;
    expect(advance.textContent).toMatch(/security/);
    advance.click();
    const req = http.expectOne('/api/ticket/advance');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toMatchObject({ id: 'W-FLOW', toStage: 'security', expectedRev: 'r1' });
    req.flush({ ok: true, state: { ...COARSE_STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('entering Pipeline on an idle project keeps the calm idle line + a Switch-to-Worklist escape', () => {
    const idle: ProjectState = {
      ...COARSE_STATE,
      taskSummary: { total: 2, byStatus: { in_progress: 0, waiting: 1, blocked: 0, done: 1, needsYou: 0 } },
      tickets: [
        { id: 'I-BACK', title: 'Queued', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
        { id: 'I-DONE', title: 'Shipped', status: 'done', stage: 'done', track: 'full', assignee: '/fe', gates: [], comments: [] },
      ],
    };
    const { fixture, host } = mount(idle, 'pipeline');
    expect(host.querySelector('[data-testid="rail-middle-empty"]')).toBeTruthy();
    const escape = host.querySelector('[data-testid="pipeline-to-worklist"]') as HTMLButtonElement;
    expect(escape).toBeTruthy();
    escape.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="worklist-root"]')).toBeTruthy();
  });

  it('suppresses the view-mode switch when the whole board is empty', () => {
    const { host } = mount(
      { ...COARSE_STATE, workflowView: { activeTrack: null, stages: [] }, tickets: [],
        taskSummary: { total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } } },
      'auto',
    );
    expect(host.querySelector('[data-testid="board-empty"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="view-mode-switch"]')).toBeNull();
  });
});

describe('TasksBoardComponent — workflow-edit entry hides the task-view switch', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  function mountInEdit(state: ProjectState): { host: HTMLElement } {
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
    fixture.componentRef.setInput('startInEdit', true);
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement };
  }

  it('does NOT render the Worklist/Pipeline view-mode switch when entered via Edit workflow', () => {
    const { host } = mountInEdit(STATE);
    expect(host.querySelector('[data-testid="view-mode-switch"]')).toBeNull();
  });

  it('KEEPS the pipeline View/Edit toggle visible (and armed to edit) in workflow-edit entry', () => {
    const { host } = mountInEdit(STATE);
    expect(host.querySelector('[data-testid="pipeline-mode"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="pipeline-chain"]')?.getAttribute('data-mode')).toBe('edit');
  });

  it('still renders the view-mode switch on a plain (non-edit) board entry', () => {
    const { host } = mount(STATE, 'pipeline');
    expect(host.querySelector('[data-testid="view-mode-switch"]')).toBeTruthy();
  });
});

describe('TasksBoardComponent — visual-first worklist (colour, progress, hierarchy)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('colour-codes each card via data-status keyed to its band (done/in-flight/needs-you/backlog)', () => {
    const { fixture, host } = mount(COARSE_STATE, 'auto');
    // Backlog is collapsed by default; expand it so W-BACK's card renders for the assertion.
    (host.querySelector('[data-testid="backlog-expand"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const statusOf = (id: string) => host.querySelector(`[data-testid="card-${id}"]`)?.getAttribute('data-status');
    expect(statusOf('W-NEED')).toBe('needs-you'); // waiting + expected owner, no live agent
    expect(statusOf('W-FLOW')).toBe('in-flight'); // mid-pipeline in_progress
    expect(statusOf('W-BACK')).toBe('backlog'); // queued idea
    expect(statusOf('W-DONE')).toBe('done'); // shipped
  });

  it('renders the off-track card inside the red-owning off-track band (band owns the red, not the card)', () => {
    const offState: ProjectState = {
      ...STATE,
      taskSummary: { total: 2, byStatus: { in_progress: 1, waiting: 0, blocked: 0, done: 0, needsYou: 0 } },
      tickets: [
        { id: 'FLOW', title: 'Moving', status: 'in_progress', stage: 'code', track: 'full', assignee: '/be', gates: [], comments: [] },
        { id: 'OFF', title: 'Orphan', status: 'waiting', stage: 'gone-stage', track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(offState, 'worklist');
    const band = host.querySelector('[data-testid="worklist-band-off-track"]')!;
    expect(band.classList.contains('band--off-track')).toBe(true);
    // The off-track card renders inside that band (the band wrapper colours it red).
    expect(band.querySelector('[data-testid="card-OFF"]')).toBeTruthy();
  });

  it('a rejected hard gate takes needs-you precedence over the raw blocked status (amber, not red)', () => {
    const blockedState: ProjectState = {
      ...STATE,
      tickets: [
        { id: 'BLK', title: 'Stuck', status: 'blocked', stage: 'code', track: 'full', assignee: '/be',
          gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }], comments: [] },
      ],
    };
    const { host } = mount(blockedState, 'pipeline');
    expect(host.querySelector('[data-testid="card-BLK"]')?.getAttribute('data-status')).toBe('needs-you');
  });

  it('colours a genuinely blocked card red (data-status="blocked") via the shared card template', () => {
    const blockedNoGate: ProjectState = {
      ...STATE,
      tickets: [
        { id: 'BLK2', title: 'Stuck', status: 'blocked', stage: 'code', track: 'full', assignee: '/be', gates: [], comments: [] },
      ],
    };
    const { host } = mount(blockedNoGate, 'pipeline');
    expect(host.querySelector('[data-testid="card-BLK2"]')?.getAttribute('data-status')).toBe('blocked');
  });

  it('the status pill is never colour-only — it still carries its glyph + text label', () => {
    const { host } = mount(COARSE_STATE, 'auto');
    const pill = host.querySelector('[data-testid="card-W-FLOW"] [data-testid="chip-status"]')!;
    expect(pill.textContent).toMatch(/in progress/); // the word survives even with colour stripped
    expect(pill.querySelector('svg, [data-glyph], dart-glyph')).toBeTruthy(); // and the glyph
  });

  it('renders the progress bar with proportional segments, counts, % done, and a spoken aria-label', () => {
    const { host } = mount(COARSE_STATE, 'auto');
    const prog = host.querySelector('[data-testid="worklist-progress"]')!;
    expect(prog).toBeTruthy();
    expect(prog.getAttribute('role')).toBe('progressbar');
    // total 4: done 1, in_progress 1, backlog remainder 2 → 25% done.
    expect(prog.getAttribute('aria-valuenow')).toBe('25');
    expect(prog.getAttribute('aria-valuemin')).toBe('0');
    expect(prog.getAttribute('aria-valuemax')).toBe('100');
    expect(prog.getAttribute('aria-label')).toMatch(/1 of 4 tasks done/i);
    expect(prog.getAttribute('aria-label')).toMatch(/25 percent/i);
    // The bar has three segments (done + in-progress + backlog) summing to total.
    const segs = [...host.querySelectorAll('[data-testid="worklist-progress-bar"] [data-seg]')];
    expect(segs.map((s) => s.getAttribute('data-seg'))).toEqual(['done', 'in-progress', 'backlog']);
    // Counts row is real text (available without colour).
    const counts = host.querySelector('[data-testid="worklist-progress-counts"]')!;
    expect(counts.textContent).toMatch(/1 done/);
    expect(counts.textContent).toMatch(/4 total/);
    // The % is shown.
    expect(prog.textContent).toMatch(/25%/);
  });

  it('suppresses the progress bar on an empty board', () => {
    const { host } = mount(
      { ...COARSE_STATE, workflowView: { activeTrack: null, stages: [] }, tickets: [],
        taskSummary: { total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } } },
      'auto',
    );
    expect(host.querySelector('[data-testid="worklist-progress"]')).toBeNull();
  });

  it('all-done → 100% done, full green (no in-progress/backlog segment)', () => {
    const allDone: ProjectState = {
      ...COARSE_STATE,
      taskSummary: { total: 2, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 2, needsYou: 0 } },
      tickets: [
        { id: 'D1', title: 'Shipped one', status: 'done', stage: 'done', track: 'full', assignee: '/fe', gates: [], comments: [{ ts: '2026-06-12T00:00:00Z' }] },
        { id: 'D2', title: 'Shipped two', status: 'done', stage: 'done', track: 'full', assignee: '/fe', gates: [], comments: [{ ts: '2026-06-11T00:00:00Z' }] },
      ],
    };
    const { host } = mount(allDone, 'worklist');
    const prog = host.querySelector('[data-testid="worklist-progress"]')!;
    expect(prog.getAttribute('aria-valuenow')).toBe('100');
    expect(prog.textContent).toMatch(/100%/);
    const segs = [...host.querySelectorAll('[data-testid="worklist-progress-bar"] [data-seg]')];
    // Only the done segment carries width; in-progress + backlog are zero (absent from the bar).
    expect(segs.map((s) => s.getAttribute('data-seg'))).toEqual(['done']);
  });

  it('all-backlog → 0% done, neutral track (honest "queued, not started", never fake-green)', () => {
    const allBacklog: ProjectState = {
      ...COARSE_STATE,
      taskSummary: { total: 3, byStatus: { in_progress: 0, waiting: 3, blocked: 0, done: 0, needsYou: 0 } },
      tickets: [
        { id: 'Q1', title: 'Idea one', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
        { id: 'Q2', title: 'Idea two', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
        { id: 'Q3', title: 'Idea three', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(allBacklog, 'worklist');
    const prog = host.querySelector('[data-testid="worklist-progress"]')!;
    expect(prog.getAttribute('aria-valuenow')).toBe('0');
    expect(prog.textContent).toMatch(/0%/);
    const segs = [...host.querySelectorAll('[data-testid="worklist-progress-bar"] [data-seg]')];
    expect(segs.map((s) => s.getAttribute('data-seg'))).toEqual(['backlog']);
  });

  it('collapses Backlog by default to a "planned ▸" disclosure, expanding to the card grid', () => {
    const { fixture, host } = mount(COARSE_STATE, 'auto');
    const band = host.querySelector('[data-testid="worklist-band-backlog"]')!;
    expect(band).toBeTruthy();
    // Collapsed: the disclosure button is present and the backlog cards are NOT yet in the DOM.
    const toggle = host.querySelector('[data-testid="backlog-expand"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(band.textContent).toMatch(/planned/);
    expect(host.querySelector('[data-testid="card-W-BACK"]')).toBeNull();
    // Expand: the cards appear.
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-testid="card-W-BACK"]')).toBeTruthy();
  });

  it('marks active bands with their colour host class and keeps needs-you primary', () => {
    const { host } = mount(COARSE_STATE, 'auto');
    expect(host.querySelector('[data-testid="worklist-band-in-flight"]')?.classList.contains('band--in-flight')).toBe(true);
    expect(host.querySelector('[data-testid="worklist-band-backlog"]')?.classList.contains('band--backlog')).toBe(true);
    expect(host.querySelector('[data-testid="worklist-band-recently-done"]')?.classList.contains('band--recently-done')).toBe(true);
    expect(host.querySelector('[data-testid="worklist-band-needs-you"]')?.classList.contains('band--needs-you')).toBe(true);
  });
});
