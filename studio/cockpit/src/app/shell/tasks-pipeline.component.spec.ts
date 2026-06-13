import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { ProjectState, WorkflowView } from '../core/models';
import { TasksBoardComponent } from './tasks-board.component';

/**
 * The CI-style Pipeline is exercised through the board (its parent), which projects the `#cardTpl`
 * card and owns the partition + the guarded writes. These specs pin Pipeline mode and assert the new
 * connected-chain DOM contract: the stage-flow chain, gate nodes on connectors, the broken-connector
 * honesty, per-stage colour, only-in-pipeline cards + end-cap counts, drill-in, and dwell.
 */

const WF: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
    { stage: 'design', owner: '/ui', gate: { name: 'DESIGN_APPROVED', refusal: 'soft' } },
    { stage: 'code', owner: '/be', gate: null },
    { stage: 'done', owner: null, gate: null },
  ],
};

/** A busy pipeline: work fanned across stages, a rejected hard gate, a rejected soft gate, backlog/done. */
const BUSY: ProjectState = {
  rev: 'r1',
  preset: 'solo',
  project: 'p-pipe',
  workflowView: WF,
  tracks: { full: ['vision', 'architecture', 'design', 'code', 'done'] },
  gateDefs: [],
  taskSummary: { total: 7, byStatus: { in_progress: 2, waiting: 1, blocked: 1, done: 1, needsYou: 1 } },
  tickets: [
    { id: 'BK-1', title: 'Idea', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
    { id: 'V-1', title: 'Visioning', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po', gates: [], comments: [] },
    { id: 'A-1', title: 'Architecting', status: 'in_progress', stage: 'architecture', track: 'full', assignee: '/arch',
      gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'rejected' }], comments: [] },
    { id: 'D-1', title: 'Designing', status: 'waiting', stage: 'design', track: 'full', assignee: '/ui',
      gates: [{ name: 'DESIGN_APPROVED', refusal: 'soft', state: 'rejected' }], comments: [] },
    { id: 'DN-1', title: 'Shipped', status: 'done', stage: 'done', track: 'full', assignee: '/qa', gates: [], comments: [] },
    { id: 'OFF-1', title: 'Orphan', status: 'waiting', stage: 'gone-stage', track: 'full', gates: [], comments: [] },
  ],
};

function mount(state: ProjectState): { fixture: ComponentFixture<TasksBoardComponent>; host: HTMLElement } {
  const project = state.project && state.project.trim() ? state.project : '_global';
  localStorage.setItem(`dart.tasks.viewMode.${project}`, 'pipeline');
  TestBed.configureTestingModule({
    imports: [TasksBoardComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() }],
  });
  const fixture = TestBed.createComponent(TasksBoardComponent);
  fixture.componentRef.setInput('state', state);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('TasksPipelineComponent — the connected stage-flow chain', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('renders the chain as a role=list of stage nodes (one per in-pipeline stage, in order)', () => {
    const { host } = mount(BUSY);
    const chain = host.querySelector('[data-testid="pipeline-chain"]')!;
    expect(chain.getAttribute('role')).toBe('list');
    const stages = [...host.querySelectorAll('[data-testid^="stage-"]')]
      .map((s) => s.getAttribute('data-testid'))
      .filter((id) => id?.startsWith('stage-') && !id.startsWith('stage-gate-') && !id.startsWith('stage-status-') && !id.startsWith('stage-count-') && !id.startsWith('stage-dwell-'));
    // 'done' is the end-cap, never a chain node; the four in-pipeline stages render in order.
    expect(stages).toEqual(['stage-vision', 'stage-architecture', 'stage-design', 'stage-code']);
  });

  it('renders a stage node header with name, owner, status word + count, and the in-stage cards only', () => {
    const { host } = mount(BUSY);
    const arch = host.querySelector('[data-testid="stage-architecture"]')!;
    expect(arch.textContent).toContain('architecture');
    expect(arch.textContent).toContain('/arch');
    expect(arch.querySelector('[data-testid="stage-count-architecture"]')!.textContent).toContain('1');
    expect(arch.querySelector('[data-testid="card-A-1"]')).toBeTruthy();
    // A stage node renders only its OWN tickets, never another stage's.
    expect(arch.querySelector('[data-testid="card-V-1"]')).toBeNull();
  });
});

describe('TasksPipelineComponent — the stage-node header reads HORIZONTALLY (never one-letter-per-line)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('does not set a vertical writing-mode on any stage-node name (the long word never stacks per-letter)', () => {
    const { host } = mount(BUSY);
    for (const stage of ['vision', 'architecture', 'design', 'code']) {
      const name = host.querySelector<HTMLElement>(`[data-testid="stage-${stage}"] .stage-node__stage`)!;
      const mode = getComputedStyle(name).writingMode;
      expect(mode === '' || mode === 'horizontal-tb', `${stage} name writing-mode`).toBe(true);
    }
  });

  it('keeps the stage name on one line (no per-letter wrap) — the name never breaks inside a word', () => {
    const { host } = mount(BUSY);
    const name = host.querySelector<HTMLElement>('[data-testid="stage-architecture"] .stage-node__stage')!;
    const style = getComputedStyle(name);
    expect(style.whiteSpace).toBe('nowrap');
    // The compact-station "break anywhere" leak is gone — a long word stays intact, not split per glyph.
    expect(style.overflowWrap).not.toBe('anywhere');
    expect(style.wordBreak).not.toBe('break-all');
  });

  it('gives each stage segment a min-width that fits a horizontal header (>= 12rem)', () => {
    const { host } = mount(BUSY);
    const seg = host.querySelector<HTMLElement>('.flow__seg')!;
    const minWidth = getComputedStyle(seg).minWidth;
    const rem = minWidth.endsWith('rem')
      ? Number.parseFloat(minWidth)
      : Number.parseFloat(minWidth) / 16;
    expect(rem).toBeGreaterThanOrEqual(12);
  });

  it('renders the same horizontal name in the quiet/empty path-preview chain (idle nodes are not vertical either)', () => {
    const idle: ProjectState = {
      ...BUSY,
      taskSummary: { total: 2, byStatus: { in_progress: 0, waiting: 1, blocked: 0, done: 1, needsYou: 0 } },
      tickets: [
        { id: 'BK-1', title: 'Queued', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
        { id: 'DN-1', title: 'Shipped', status: 'done', stage: 'done', track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(idle);
    const name = host.querySelector<HTMLElement>('[data-testid="stage-architecture"] .stage-node__stage')!;
    expect(getComputedStyle(name).whiteSpace).toBe('nowrap');
  });
});

describe('TasksPipelineComponent — ONLY in-pipeline tickets; backlog/done/off-track are end-cap counts', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('draws NO backlog / done / off-track cards — only the three end-cap reference tiles with their counts', () => {
    const { host } = mount(BUSY);
    // No cards for the backlog / done / off-track tickets anywhere in Pipeline mode.
    expect(host.querySelector('[data-testid="card-BK-1"]')).toBeNull();
    expect(host.querySelector('[data-testid="card-DN-1"]')).toBeNull();
    expect(host.querySelector('[data-testid="card-OFF-1"]')).toBeNull();
    // The end-cap tiles carry the counts instead.
    expect(host.querySelector('[data-testid="pipeline-backlog-ref"]')!.textContent).toContain('1');
    expect(host.querySelector('[data-testid="pipeline-done-ref"]')!.textContent).toContain('1');
    expect(host.querySelector('[data-testid="pipeline-offtrack-ref"]')!.textContent).toContain('1');
  });

  it('each end-cap tile is a button that switches to the Worklist', () => {
    for (const id of ['pipeline-backlog-ref', 'pipeline-done-ref', 'pipeline-offtrack-ref']) {
      const { fixture, host } = mount(BUSY);
      const tile = host.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
      expect(tile.tagName).toBe('BUTTON');
      tile.click();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="worklist-root"]'), `${id} → worklist`).toBeTruthy();
      TestBed.resetTestingModule();
      localStorage.clear();
    }
  });

  it('omits the backlog end-cap when the backlog is empty (absent-not-zero)', () => {
    const noBacklog: ProjectState = { ...BUSY, tickets: BUSY.tickets!.filter((t) => t.id !== 'BK-1') };
    const { host } = mount(noBacklog);
    expect(host.querySelector('[data-testid="pipeline-backlog-ref"]')).toBeNull();
  });

  it('omits the off-track end-cap when every ticket sits on a real stage', () => {
    const onTrack: ProjectState = { ...BUSY, tickets: BUSY.tickets!.filter((t) => t.id !== 'OFF-1') };
    const { host } = mount(onTrack);
    expect(host.querySelector('[data-testid="pipeline-offtrack-ref"]')).toBeNull();
  });
});

describe('TasksPipelineComponent — gate nodes on the connectors (hard/soft + broken-line honesty)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('renders a gate node on the connector entering each gated stage, shaped + state-worded', () => {
    const { host } = mount(BUSY);
    const archGate = host.querySelector('[data-testid="gate-node-architecture"]')!;
    expect(archGate.getAttribute('data-shape')).toBe('hard');
    expect(archGate.getAttribute('data-gate-state')).toBe('rejected');
    expect(archGate.textContent).toMatch(/ARCH_APPROVED/);
    expect(archGate.textContent).toMatch(/rejected/); // the WORD, never colour-only
    const designGate = host.querySelector('[data-testid="gate-node-design"]')!;
    expect(designGate.getAttribute('data-shape')).toBe('soft');
  });

  it('renders NO gate node on a connector entering a stage with no gate', () => {
    const { host } = mount(BUSY);
    expect(host.querySelector('[data-testid="gate-node-vision"]')).toBeNull();
    expect(host.querySelector('[data-testid="gate-node-code"]')).toBeNull();
  });

  it('a rejected HARD gate BREAKS its connector (data-state="broken") — the load-bearing honesty', () => {
    const { host } = mount(BUSY);
    const archConnector = host.querySelector('[data-testid="flow-connector-architecture"]')!;
    expect(archConnector.getAttribute('data-state')).toBe('broken');
  });

  it('a rejected SOFT gate NEVER breaks its connector (soft warns, never blocks)', () => {
    const { host } = mount(BUSY);
    const designConnector = host.querySelector('[data-testid="flow-connector-design"]')!;
    expect(designConnector.getAttribute('data-state')).not.toBe('broken');
  });

  it('a passed hard gate keeps its connector intact (not broken)', () => {
    const passed: ProjectState = {
      ...BUSY,
      tickets: [
        { id: 'A-1', title: 'Architecting', status: 'in_progress', stage: 'architecture', track: 'full',
          gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }], comments: [] },
      ],
    };
    const { host } = mount(passed);
    expect(host.querySelector('[data-testid="flow-connector-architecture"]')!.getAttribute('data-state')).not.toBe('broken');
    expect(host.querySelector('[data-testid="gate-node-architecture"]')!.getAttribute('data-gate-state')).toBe('passed');
  });
});

describe('TasksPipelineComponent — per-stage colour + the lit active front (additive, never colour-only)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('marks a blocked stage data-stage-status="blocked" AND pairs it with the word "blocked"', () => {
    const { host } = mount(BUSY);
    const arch = host.querySelector('[data-testid="stage-architecture"]')!; // A-1 rejected hard gate → needs-you → blocked
    expect(arch.getAttribute('data-stage-status')).toBe('blocked');
    expect(arch.querySelector('[data-testid="stage-status-architecture"]')!.textContent).toMatch(/blocked/);
  });

  it('marks a running stage data-stage-status="running" with the word', () => {
    const { host } = mount(BUSY);
    const vision = host.querySelector('[data-testid="stage-vision"]')!; // V-1 in_progress, no blocker
    expect(vision.getAttribute('data-stage-status')).toBe('running');
    expect(vision.querySelector('[data-testid="stage-status-vision"]')!.textContent).toMatch(/running/);
  });

  it('marks a present-but-idle stage waiting, and an empty-ahead stage pending', () => {
    const { host } = mount(BUSY);
    expect(host.querySelector('[data-testid="stage-design"]')!.getAttribute('data-stage-status')).toBe('waiting'); // D-1 waiting
    expect(host.querySelector('[data-testid="stage-code"]')!.getAttribute('data-stage-status')).toBe('pending'); // empty, ahead
  });

  it('lights the connectors up to the active front and leaves those ahead pending', () => {
    const lit: ProjectState = {
      ...BUSY,
      tickets: [
        { id: 'A-1', title: 'Architecting', status: 'in_progress', stage: 'architecture', track: 'full',
          gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }], comments: [] },
      ],
    };
    const { host } = mount(lit);
    // architecture (index 1) holds the furthest in-progress ticket → its connector + earlier are passed.
    expect(host.querySelector('[data-testid="flow-connector-vision"]')!.getAttribute('data-state')).toBe('passed');
    expect(host.querySelector('[data-testid="flow-connector-architecture"]')!.getAttribute('data-state')).toBe('passed');
    // code (index 3) sits ahead of the front → pending.
    expect(host.querySelector('[data-testid="flow-connector-code"]')!.getAttribute('data-state')).toBe('pending');
  });
});

describe('TasksPipelineComponent — drill-in opens the stage-detail drawer (read-only lens)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('clicking a stage node opens the stage-detail DRAWER (not a ticket modal)', () => {
    const { fixture, host } = mount(BUSY);
    (host.querySelector('[data-testid="stage-architecture"]') as HTMLElement).click();
    fixture.detectChanges();
    const drawer = host.querySelector('[data-testid="stage-drawer"]')!;
    expect(drawer).toBeTruthy();
    expect(drawer.querySelector('[data-testid="stage-detail-name"]')!.textContent).toContain('architecture');
    // It is the drawer, NOT the centred task-detail modal.
    expect(host.querySelector('[data-testid="detail-header"]')).toBeNull();
  });

  it('clicking a gate node opens the SAME drawer focused on the gate section', () => {
    const { fixture, host } = mount(BUSY);
    (host.querySelector('[data-testid="gate-node-architecture"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-drawer"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="stage-gate-section"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="detail-header"]')).toBeNull();
  });

  it('clicking a card open button still opens its own detail (the shared #cardTpl path)', () => {
    const { fixture, host } = mount(BUSY);
    (host.querySelector('[data-testid="card-V-1"] [data-testid="card-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="detail-header"]')!.textContent).toContain('V-1');
  });
});

describe('TasksPipelineComponent — dwell-time "stuck N" signal (client-side, honest)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('shows a "stuck Nd" chip on a stage whose ticket has dwelled past the threshold', () => {
    const old = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
    const stuck: ProjectState = {
      ...BUSY,
      tickets: [
        { id: 'V-1', title: 'Visioning', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po',
          gates: [], comments: [{ kind: 'advance', body: 'stage → vision', ts: old }] },
      ],
    };
    const { host } = mount(stuck);
    const dwell = host.querySelector('[data-testid="stage-dwell-vision"]');
    expect(dwell?.textContent).toMatch(/stuck 5d/);
  });

  it('omits the dwell chip when the advance timestamp is unknown (never a fabricated duration)', () => {
    const fresh: ProjectState = {
      ...BUSY,
      tickets: [
        { id: 'V-1', title: 'Visioning', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po', gates: [], comments: [] },
      ],
    };
    const { host } = mount(fresh);
    expect(host.querySelector('[data-testid="stage-dwell-vision"]')).toBeNull();
  });
});

describe('TasksPipelineComponent — quiet/empty states', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('State A — middle idle, work elsewhere: the path preview + calm explainer + switch-to-worklist + end-caps', () => {
    const idle: ProjectState = {
      ...BUSY,
      taskSummary: { total: 2, byStatus: { in_progress: 0, waiting: 1, blocked: 0, done: 1, needsYou: 0 } },
      tickets: [
        { id: 'BK-1', title: 'Queued', status: 'waiting', stage: 'backlog', track: 'full', gates: [], comments: [] },
        { id: 'DN-1', title: 'Shipped', status: 'done', stage: 'done', track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(idle);
    // The idle chain is still drawn as a pending-path preview (teaches the workflow path).
    expect(host.querySelector('[data-testid="pipeline-chain"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="stage-vision"]')!.getAttribute('data-density')).toBe('idle');
    // The reused calm explainer + escape.
    expect(host.querySelector('[data-testid="rail-middle-empty"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="pipeline-to-worklist"]')).toBeTruthy();
    // The end-caps still say where the work is.
    expect(host.querySelector('[data-testid="pipeline-backlog-ref"]')!.textContent).toContain('1');
    expect(host.querySelector('[data-testid="pipeline-done-ref"]')!.textContent).toContain('1');
  });

  it('State B — whole board empty: Pipeline is SUPPRESSED; only the board-empty invitation shows', () => {
    const empty: ProjectState = {
      ...BUSY,
      workflowView: { activeTrack: null, stages: [] },
      tickets: [],
      taskSummary: { total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } },
    };
    const { host } = mount(empty);
    expect(host.querySelector('[data-testid="board-empty"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="pipeline-chain"]')).toBeNull();
    expect(host.querySelector('[data-testid="pipeline-flow"]')).toBeNull();
  });
});

describe('TasksPipelineComponent — a11y + colour-additive guard', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('every stage node exposes a status WORD + count (the pipeline reads with colour stripped)', () => {
    const { host } = mount(BUSY);
    for (const stage of ['vision', 'architecture', 'design', 'code']) {
      const word = host.querySelector(`[data-testid="stage-status-${stage}"]`)!.textContent ?? '';
      expect(word, `${stage} status word`).toMatch(/blocked|running|waiting|passed|pending/);
      expect(host.querySelector(`[data-testid="stage-count-${stage}"]`), `${stage} count`).toBeTruthy();
    }
  });

  it('a gate node is a button with an aria-label speaking name + state + action', () => {
    const { host } = mount(BUSY);
    const gate = host.querySelector('[data-testid="gate-node-architecture"]') as HTMLButtonElement;
    expect(gate.tagName).toBe('BUTTON');
    const label = gate.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/ARCH_APPROVED/);
    expect(label).toMatch(/rejected/);
    expect(label).toMatch(/activate to review/i);
  });

  it('roves focus across the whole chain (end-cap → gate → stage) with ArrowRight / ArrowLeft', () => {
    const { fixture, host } = mount(BUSY);
    const nodes = [...host.querySelectorAll<HTMLElement>('[data-col-index]')];
    expect(nodes.length).toBeGreaterThan(2);
    nodes[0].focus();
    nodes[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(nodes[1]);
    nodes[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(nodes[0]);
  });

  it('does not render [innerHTML] — an untrusted stage name/owner is interpolated + escaped', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const xssWf: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: evil, owner: evil, gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    const state: ProjectState = {
      ...BUSY,
      workflowView: xssWf,
      tracks: { full: [evil, 'code', 'done'] },
      tickets: [
        { id: 'X-1', title: 'x', status: 'in_progress', stage: evil, track: 'full', gates: [], comments: [] },
        { id: 'C-1', title: 'c', status: 'in_progress', stage: 'code', track: 'full', gates: [], comments: [] },
      ],
    };
    const { host } = mount(state);
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain(evil);
  });
});
