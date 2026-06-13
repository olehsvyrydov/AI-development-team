import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { ProjectState, WorkflowView } from '../core/models';
import { TasksBoardComponent } from './tasks-board.component';

/**
 * The stage-detail DRAWER is exercised through the board (its host), which owns the partition, the
 * open state keyed by stage NAME (re-derived on every push), and the drill-through to the existing
 * task-detail modal. These specs pin Pipeline mode and assert the drawer contract: identity, gate
 * provenance + blocker, compact task rows with "doing now", the newest-first activity log, the
 * honest empty/removed states, drill-through, close/focus mechanics, live re-derive, and escaping.
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

const BASE: ProjectState = {
  rev: 'r1',
  preset: 'solo',
  project: 'p-sd',
  workflowView: WF,
  tracks: { full: ['vision', 'architecture', 'design', 'code', 'done'] },
  gateDefs: [{ name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch' }],
  taskSummary: { total: 5, byStatus: { in_progress: 2, waiting: 1, blocked: 1, done: 1, needsYou: 1 } },
  tickets: [
    { id: 'V-1', title: 'Visioning', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po', gates: [], comments: [] },
    {
      id: 'A-1', title: 'Architecting', status: 'in_progress', stage: 'architecture', track: 'full', assignee: '/arch',
      gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed', by: '/arch', at: '2026-06-11T09:00:00Z' }],
      comments: [
        { id: 'c1', author: '/be', kind: 'comment', body: 'wiring the resolver', ts: '2026-06-12T08:00:00Z' },
        { id: 'c0', author: '/be', kind: 'advance', body: 'stage → architecture', ts: '2026-06-10T08:00:00Z' },
      ],
    },
    {
      id: 'A-2', title: 'More arch', status: 'waiting', stage: 'architecture', track: 'full', assignee: '/arch',
      gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'pending', owner: '/arch' }], comments: [],
    },
    { id: 'D-1', title: 'Designing', status: 'waiting', stage: 'design', track: 'full', assignee: '/ui', gates: [], comments: [] },
    { id: 'DN-1', title: 'Shipped', status: 'done', stage: 'done', track: 'full', gates: [], comments: [] },
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

function openStage(host: HTMLElement, fixture: ComponentFixture<TasksBoardComponent>, stage: string): void {
  (host.querySelector(`[data-testid="stage-${stage}"]`) as HTMLElement).click();
  fixture.detectChanges();
}

afterEach(() => {
  TestBed.resetTestingModule();
  localStorage.clear();
});

describe('stage-detail drawer — trigger + form', () => {
  it('a stage-node click opens the drawer (a role=dialog, aria-modal, labelled by the stage name), NOT the ticket modal', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    const drawer = host.querySelector('[data-testid="stage-drawer"]')!;
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    const labelled = drawer.getAttribute('aria-labelledby');
    expect(host.querySelector(`#${labelled}`)!.textContent).toContain('architecture');
    expect(host.querySelector('[data-testid="detail-header"]')).toBeNull();
  });

  it('a gate-node click opens the SAME drawer focused on the gate section', () => {
    const { fixture, host } = mount(BASE);
    (host.querySelector('[data-testid="gate-node-architecture"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-drawer"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="stage-gate-section"]')).toBeTruthy();
  });
});

describe('stage-detail drawer — identity section', () => {
  it('shows name, owner, step N of M (rendered-rail count), an honest role line, and the next stage', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    expect(host.querySelector('[data-testid="stage-detail-name"]')!.textContent).toContain('architecture');
    expect(host.querySelector('[data-testid="stage-detail-owner"]')!.textContent).toContain('/arch');
    // rendered rail excludes backlog + done → vision, architecture, design, code = 4; architecture is #2.
    expect(host.querySelector('[data-testid="stage-detail-position"]')!.textContent).toMatch(/step 2 of 4/);
    expect(host.querySelector('[data-testid="stage-detail-role"]')!.textContent!.trim().length).toBeGreaterThan(0);
    expect(host.querySelector('[data-testid="stage-detail-next"]')!.textContent).toMatch(/Next:\s*design/);
  });

  it('reads "last stage before Done" honestly for the final rendered stage', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'code');
    expect(host.querySelector('[data-testid="stage-detail-next"]')!.textContent).toMatch(/last stage before Done/);
  });
});

describe('stage-detail drawer — gate(s): state + provenance + blocker', () => {
  it('rolls up the gate node with state word + a "{passed} of {total}" tally and shows per-task provenance (by/at)', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    const section = host.querySelector('[data-testid="stage-gate-section"]')!;
    expect(section.textContent).toContain('ARCH_APPROVED');
    expect(section.textContent).toMatch(/1 of 2 tasks passed/);
    const row = host.querySelector('[data-testid="stage-gate-row-ARCH_APPROVED-A-1"]')!;
    expect(row.textContent).toMatch(/passed/);
    expect(row.textContent).toMatch(/decided by \/arch/);
    expect(row.querySelector('[title="2026-06-11T09:00:00Z"]')).toBeTruthy();
  });

  it('raises a prominent BLOCKER banner for a rejected HARD gate (danger), naming the parked task as a drill link', () => {
    const rejected: ProjectState = {
      ...BASE,
      tickets: [
        { id: 'A-1', title: 'Architecting', status: 'blocked', stage: 'architecture', track: 'full',
          gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'rejected', by: '/arch', at: '2026-06-12T00:00:00Z', note: 'redo the boundary' }], comments: [] },
      ],
    };
    const { fixture, host } = mount(rejected);
    openStage(host, fixture, 'architecture');
    const banner = host.querySelector('[data-testid="stage-gate-blocker"]')!;
    expect(banner).toBeTruthy();
    expect(banner.getAttribute('data-shape')).toBe('hard');
    expect(banner.textContent).toMatch(/Blocked here/);
    expect(banner.textContent).toContain('ARCH_APPROVED');
    expect(host.querySelector('[data-testid="stage-gate-row-ARCH_APPROVED-A-1"]')!.textContent).toMatch(/rationale: redo the boundary/);
  });

  it('a rejected SOFT gate warns (not danger) — the banner border is the warning shape', () => {
    const softRej: ProjectState = {
      ...BASE,
      tickets: [
        { id: 'D-1', title: 'Designing', status: 'waiting', stage: 'design', track: 'full',
          gates: [{ name: 'DESIGN_APPROVED', refusal: 'soft', state: 'rejected' }], comments: [] },
      ],
    };
    const { fixture, host } = mount(softRej);
    openStage(host, fixture, 'design');
    expect(host.querySelector('[data-testid="stage-gate-blocker"]')!.getAttribute('data-shape')).toBe('soft');
  });

  it('an ungated stage says so (no empty gate box)', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'vision');
    expect(host.querySelector('[data-testid="stage-gate-none"]')).toBeTruthy();
  });
});

describe('stage-detail drawer — tasks with "doing now" + drill-through', () => {
  it('renders a compact row per in-stage task (NOT the #cardTpl) with status + the newest-comment "doing now" line', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    const row = host.querySelector('[data-testid="stage-task-A-1"]')!;
    expect(row).toBeTruthy();
    expect(row.querySelector('[data-testid="card-A-1"]')).toBeNull(); // not the full card template
    expect(host.querySelector('[data-testid="stage-task-activity-A-1"]')!.textContent).toContain('wiring the resolver');
    // a task with no comments reads honestly, not a fabricated line
    expect(host.querySelector('[data-testid="stage-task-activity-A-2"]')!.textContent).toMatch(/No activity logged yet/);
  });

  it('a task row drills through to the EXISTING task-detail modal (the drawer stays mounted behind)', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    (host.querySelector('[data-testid="stage-task-A-1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="detail-header"]')!.textContent).toContain('A-1');
    expect(host.querySelector('[data-testid="stage-drawer"]')).toBeTruthy();
  });
});

describe('stage-detail drawer — activity / process log (newest-first)', () => {
  it('merges the stage tickets’ comments newest-first, attributed + timestamped', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    const e0 = host.querySelector('[data-testid="stage-activity-entry-0"]')!;
    const e1 = host.querySelector('[data-testid="stage-activity-entry-1"]')!;
    expect(e0.textContent).toContain('wiring the resolver'); // 2026-06-12 newest
    expect(e1.textContent).toMatch(/advanced to architecture|stage . architecture|architecture/); // 2026-06-10 advance
  });

  it('shows the honest empty notice when the stage tickets carry no comments', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'design'); // D-1 has no comments
    expect(host.querySelector('[data-testid="stage-activity-empty"]')).toBeTruthy();
  });

  it('notes the 20-entry cap ONLY when it is actually reached (absent-not-zero)', () => {
    // Under the cap: no note.
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture'); // 2 comments total
    expect(host.querySelector('[data-testid="stage-activity-capped"]')).toBeNull();
    TestBed.resetTestingModule();
    localStorage.clear();

    // Over the cap: an honest "most recent shown" note, and exactly 20 entries rendered.
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `c${i}`, author: '/be', kind: 'comment', body: `note ${i}`,
      ts: `2026-06-12T${String(i % 24).padStart(2, '0')}:00:0${i % 10}Z`,
    }));
    const capped: ProjectState = {
      ...BASE,
      tickets: [
        { id: 'A-9', title: 'busy', status: 'in_progress', stage: 'architecture', track: 'full', gates: [], comments: many },
      ],
    };
    const m = mount(capped);
    openStage(m.host, m.fixture, 'architecture');
    const note = m.host.querySelector('[data-testid="stage-activity-capped"]')!;
    expect(note).toBeTruthy();
    expect(note.textContent).toMatch(/20 most recent/i);
    expect(m.host.querySelectorAll('[data-testid^="stage-activity-entry-"]').length).toBe(20);
  });
});

describe('stage-detail drawer — honest EMPTY stage (never blank)', () => {
  it('shows identity + gate definition + role + a "no tasks" notice with ahead-of-front reassurance', () => {
    const empty: ProjectState = {
      ...BASE,
      tickets: [
        { id: 'V-1', title: 'Visioning', status: 'in_progress', stage: 'vision', track: 'full', gates: [], comments: [] },
      ],
    };
    const { fixture, host } = mount(empty);
    openStage(host, fixture, 'code'); // empty, ahead of the active front (vision)
    expect(host.querySelector('[data-testid="stage-identity"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="stage-detail-role"]')!.textContent!.trim().length).toBeGreaterThan(0);
    expect(host.querySelector('[data-testid="stage-tasks-empty"]')!.textContent).toMatch(/No tasks at this stage right now/);
    expect(host.querySelector('[data-testid="stage-tasks-empty"]')!.textContent).toMatch(/Work will arrive here/);
  });

  it('an empty gated stage says "No tasks to gate yet" — never a vacuous green "passed"', () => {
    const empty: ProjectState = {
      ...BASE,
      tickets: [{ id: 'V-1', title: 'V', status: 'in_progress', stage: 'vision', track: 'full', gates: [], comments: [] }],
    };
    const { fixture, host } = mount(empty);
    openStage(host, fixture, 'architecture'); // gated but empty
    const section = host.querySelector('[data-testid="stage-gate-section"]')!;
    expect(host.querySelector('[data-testid="stage-gate-empty"]')!.textContent).toMatch(/No tasks to gate yet/);
    // The gate NAME still shows, but the rolled-up STATE WORD is suppressed: a gate over zero tickets
    // has not "passed" — there is simply nothing to gate. No vacuous "passed" word, no green tone.
    expect(section.textContent).toContain('ARCH_APPROVED');
    expect(section.querySelector('[data-testid="stage-gate-state"]')).toBeNull();
    expect(section.textContent).not.toMatch(/passed/i);
    expect(section.querySelector('.tone--success')).toBeNull();
  });

  it('a POPULATED gated stage still shows its real rolled-up gate state word', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture'); // A-1 + A-2 present
    const stateEl = host.querySelector('[data-testid="stage-gate-state"]')!;
    expect(stateEl).toBeTruthy();
    expect(stateEl.textContent).toMatch(/pending/i); // A-2's gate is unmet → rolled-up pending
  });
});

describe('stage-detail drawer — close + focus mechanics', () => {
  it('the close button closes the drawer and returns focus to the originating stage node', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    (host.querySelector('[data-testid="stage-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-drawer"]')).toBeNull();
  });

  it('Escape closes the drawer', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    host.querySelector('[data-testid="stage-drawer"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-drawer"]')).toBeNull();
  });

  it('a backdrop (scrim) click closes the drawer; a click inside the drawer does not', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    host.querySelector('[data-testid="stage-drawer"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-drawer"]'), 'inside click keeps it open').toBeTruthy();
    (host.querySelector('[data-testid="stage-scrim"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-drawer"]'), 'scrim click closes').toBeNull();
  });

  it('traps Tab focus within the drawer (Shift+Tab from the first focusable cycles to the last)', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    const drawer = host.querySelector('[data-testid="stage-drawer"]') as HTMLElement;
    const focusables = [...drawer.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')];
    focusables[0].focus();
    drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });
});

describe('stage-detail drawer — LIVE re-derive from state on SSE push (never a frozen snapshot)', () => {
  it('a gate change reflects in the open drawer without reopening', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    expect(host.querySelector('[data-testid="stage-gate-blocker"]')).toBeNull();
    // A CLI agent rejects the gate on A-1 — a fresh state arrives.
    const next: ProjectState = {
      ...BASE,
      rev: 'r2',
      tickets: BASE.tickets!.map((t) =>
        t.id === 'A-1' ? { ...t, gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'rejected', by: '/arch' }] } : t,
      ),
    };
    fixture.componentRef.setInput('state', next);
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-gate-blocker"]')).toBeTruthy();
  });

  it('a task leaving the stage drops out of the open drawer in place', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    expect(host.querySelector('[data-testid="stage-task-A-2"]')).toBeTruthy();
    const next: ProjectState = {
      ...BASE,
      rev: 'r2',
      tickets: BASE.tickets!.map((t) => (t.id === 'A-2' ? { ...t, stage: 'design' } : t)),
    };
    fixture.componentRef.setInput('state', next);
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-task-A-2"]')).toBeNull();
  });

  it('a stage removed from the workflow while open shows the retained-name removed state, not a broken shell', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    const trimmedWf: WorkflowView = { activeTrack: 'full', stages: WF.stages.filter((s) => s.stage !== 'architecture') };
    const next: ProjectState = {
      ...BASE,
      rev: 'r2',
      workflowView: trimmedWf,
      tracks: { full: ['vision', 'design', 'code', 'done'] },
    };
    fixture.componentRef.setInput('state', next);
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stage-detail-name"]')!.textContent).toContain('architecture');
    expect(host.querySelector('[data-testid="stage-removed"]')).toBeTruthy();
  });
});

describe('stage-detail drawer — read-only + security', () => {
  it('introduces NO write affordance: no advance / approve / reject / comment controls in the drawer', () => {
    const { fixture, host } = mount(BASE);
    openStage(host, fixture, 'architecture');
    const drawer = host.querySelector('[data-testid="stage-drawer"]')!;
    expect(drawer.querySelector('[data-testid="gate-approve"]')).toBeNull();
    expect(drawer.querySelector('[data-testid="gate-reject"]')).toBeNull();
    expect(drawer.querySelector('[data-testid="detail-advance"]')).toBeNull();
    expect(drawer.querySelector('[data-testid="comment-post"]')).toBeNull();
    expect(drawer.querySelector('textarea')).toBeNull();
  });

  it('escapes a hostile comment body / task title — interpolation only, no injected element', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const hostile: ProjectState = {
      ...BASE,
      tickets: [
        { id: 'A-1', title: evil, status: 'in_progress', stage: 'architecture', track: 'full',
          gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'pending', note: evil }],
          comments: [{ id: 'c1', author: evil, kind: 'comment', body: evil, ts: '2026-06-12T00:00:00Z' }] },
      ],
    };
    const { fixture, host } = mount(hostile);
    openStage(host, fixture, 'architecture');
    const drawer = host.querySelector('[data-testid="stage-drawer"]')!;
    expect(drawer.querySelector('img')).toBeNull();
    expect(drawer.textContent).toContain(evil);
  });
});
