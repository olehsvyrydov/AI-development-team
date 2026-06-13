import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { ProjectState, WorkflowView } from '../core/models';
import { TasksBoardComponent } from './tasks-board.component';
import { settle } from '../testing/settle';

/**
 * The in-place pipeline EDIT-MODE — the one control plane. The CI chain becomes editable behind a
 * View/Edit toggle, driving the shared {@link WorkflowEditController} (one CAS + conflict path). These
 * specs pin pipeline mode and arm edit, then exercise the build-to acceptance criteria: the toggle +
 * armed treatment, in-node grip/owner/delete, keyboard reorder (Alt+Left/Right), add via insert slots,
 * the gate editor with the SECOPS softening refusal, the atomic writes, and the first-class 409.
 */

const WF: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
    { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
    { stage: 'code', owner: '/be', gate: null },
    { stage: 'done', owner: null, gate: null },
  ],
};

const STATE: ProjectState = {
  rev: 'r1',
  preset: 'regulated',
  project: 'p-edit',
  workflowView: WF,
  tracks: { full: ['vision', 'architecture', 'security', 'code', 'done'] },
  gateDefs: [
    { name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch', trigger: ['change-class'] },
    { name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops', trigger: ['external-input'] },
  ],
  labels: [],
  rules: [],
  taskSummary: { total: 3, byStatus: { in_progress: 3, waiting: 0, needsYou: 0, blocked: 0, done: 0 } },
  tickets: [
    { id: 'V-1', title: 'Visioning', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po', gates: [], comments: [] },
    { id: 'A-1', title: 'Architecting', status: 'in_progress', stage: 'architecture', track: 'full', assignee: '/arch', gates: [], comments: [] },
    { id: 'S-1', title: 'Securing', status: 'in_progress', stage: 'security', track: 'full', assignee: '/secops', gates: [], comments: [] },
  ],
};

function mount(state: ProjectState = STATE): {
  fixture: ComponentFixture<TasksBoardComponent>;
  host: HTMLElement;
  http: HttpTestingController;
  applied: ProjectState[];
} {
  const project = state.project && state.project.trim() ? state.project : '_global';
  localStorage.setItem(`dart.tasks.viewMode.${project}`, 'pipeline');
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TasksBoardComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() }],
  });
  const fixture = TestBed.createComponent(TasksBoardComponent);
  const applied: ProjectState[] = [];
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.instance.applied.subscribe((s) => applied.push(s));
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController), applied };
}

function $(host: HTMLElement, sel: string): HTMLElement {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as HTMLElement;
}

function armEdit(host: HTMLElement, fixture: ComponentFixture<TasksBoardComponent>): void {
  $(host, '[data-testid="pipeline-mode-edit"]').click();
  fixture.detectChanges();
}

function key(el: HTMLElement, k: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
}

describe('Pipeline edit-mode — the View/Edit toggle (AC1, AC2)', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('defaults to View with a role=group toggle and ZERO edit affordances', () => {
    const { host, http: h } = mount();
    http = h;
    const group = $(host, '[data-testid="pipeline-mode"]');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toMatch(/pipeline mode/i);
    expect($(host, '[data-testid="pipeline-mode-view"]').getAttribute('aria-pressed')).toBe('true');
    expect($(host, '[data-testid="pipeline-mode-edit"]').getAttribute('aria-pressed')).toBe('false');
    // No edit affordances in View.
    expect(host.querySelector('[data-testid="stage-grip-vision"]')).toBeNull();
    expect(host.querySelector('[data-testid="owner-select-vision"]')).toBeNull();
    expect(host.querySelector('[data-testid="delete-stage-vision"]')).toBeNull();
    expect(host.querySelector('[data-testid="pipeline-liveness"]')).toBeNull();
    expect(host.querySelector('[data-testid="pipeline-insert-0"]')).toBeNull();
  });

  it('arms the chain on Edit: armed container, liveness pill, overlay banner, grips/owners/delete appear', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    expect($(host, '[data-testid="pipeline-chain"]').getAttribute('data-mode')).toBe('edit');
    expect($(host, '[data-testid="pipeline-mode-edit"]').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="pipeline-liveness"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="pipeline-overlay-banner"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="stage-grip-vision"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="owner-select-vision"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="delete-stage-vision"]')).toBeTruthy();
  });

  it('flipping to Edit moves focus to the first stage grip and announces it assertively', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    await settle(fixture);
    expect(document.activeElement).toBe($(host, '[data-testid="stage-grip-vision"]'));
    expect($(host, '[data-testid="pipeline-live"]').textContent ?? '').toMatch(/edit mode on/i);
  });

  it('View remains the default after a re-mount (edit-mode does NOT persist)', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    expect($(host, '[data-testid="pipeline-chain"]').getAttribute('data-mode')).toBe('edit');
    // A fresh mount re-arms deliberately — View again.
    const second = mount();
    expect($(second.host, '[data-testid="pipeline-chain"]').getAttribute('data-mode')).toBe('view');
    second.http.verify();
  });
});

describe('Pipeline edit-mode — stage node affordances (AC3, AC4, AC5)', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('keyboard reorder uses Alt+Left/Alt+Right and commits ONE set-stages CAS with expectedRev', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    const grip = $(host, '[data-testid="stage-grip-architecture"]');
    key(grip, 'ArrowLeft', { altKey: true });
    fixture.detectChanges();
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.body.expectedRev).toBe('r1');
    expect(req.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'architecture',
      'vision',
      'security',
      'code',
      'done',
    ]);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
    expect($(host, '[data-testid="pipeline-liveness"]').textContent).toMatch(/saved/i);
  });

  it('Escape during a Space pick-up restores the order and writes nothing', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    const grip = $(host, '[data-testid="stage-grip-architecture"]');
    key(grip, ' ');
    key(grip, 'ArrowLeft');
    fixture.detectChanges();
    key(grip, 'Escape');
    fixture.detectChanges();
    http.expectNone('/api/track/set-stages');
    expect($(host, '[data-testid="pipeline-live"]').textContent ?? '').toMatch(/cancelled/i);
  });

  it('owner picker commits one set-stages CAS', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    const sel = $(host, '[data-testid="owner-select-vision"]') as HTMLSelectElement;
    sel.value = '/ba';
    sel.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const req = http.expectOne('/api/track/set-stages');
    const vision = req.request.body.stages.find((s: { name: string }) => s.name === 'vision');
    expect(vision.owner).toBe('/ba');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('delete opens the off-track confirm (counts tickets, overlay-only copy) and commits one CAS', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="delete-stage-architecture"]').click();
    fixture.detectChanges();
    const confirm = $(host, '[data-testid="delete-confirm-architecture"]');
    expect(confirm.textContent).toMatch(/1 task/i);
    expect(confirm.textContent).toMatch(/overlay only|base file|this project only/i);
    $(host, '[data-testid="delete-confirm-go-architecture"]').click();
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.body.stages.map((s: { name: string }) => s.name)).toEqual(['vision', 'security', 'code', 'done']);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('delete is disabled when only one stage remains', () => {
    const ONE: ProjectState = {
      ...STATE,
      workflowView: { activeTrack: 'full', stages: [{ stage: 'build', owner: '/be', gate: null }, { stage: 'done', owner: null, gate: null }] },
      tracks: { full: ['build', 'done'] },
      tickets: [{ id: 'O-1', title: 'Only', status: 'in_progress', stage: 'build', track: 'full', assignee: '/be', gates: [], comments: [] }],
    };
    const { host, fixture, http: h } = mount(ONE);
    http = h;
    armEdit(host, fixture);
    // 'done' is the Done end-cap; deleting the only chain stage would empty the visible track → disabled.
    expect($(host, '[data-testid="delete-stage-build"]').hasAttribute('disabled')).toBe(true);
  });
});

describe('Pipeline edit-mode — add stage (AC6)', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('an insert slot opens a mini-form that validates name and commits one CAS at the chosen index', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    // Insert slot before 'architecture' (index 1).
    $(host, '[data-testid="pipeline-insert-1"]').click();
    fixture.detectChanges();
    const input = $(host, '[data-testid="new-stage-name"]') as HTMLInputElement;
    // Duplicate name is rejected (Save disabled).
    input.value = 'vision';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(($(host, '[data-testid="new-stage-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    input.value = 'triage';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(($(host, '[data-testid="new-stage-confirm"]') as HTMLButtonElement).disabled).toBe(false);
    $(host, '[data-testid="new-stage-confirm"]').click();
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'vision',
      'triage',
      'architecture',
      'security',
      'code',
      'done',
    ]);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('an end-of-chain affordance adds at the end of the visible chain', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="pipeline-add-end"]').click();
    fixture.detectChanges();
    const input = $(host, '[data-testid="new-stage-name"]') as HTMLInputElement;
    input.value = 'release';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    $(host, '[data-testid="new-stage-confirm"]').click();
    const req = http.expectOne('/api/track/set-stages');
    // 'done' is the Done end-cap (not a chain segment); the end-cap adds at the end of the visible
    // chain — after 'code', before the Done end-cap.
    expect(req.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'vision',
      'architecture',
      'security',
      'code',
      'release',
      'done',
    ]);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });
});

describe('Pipeline edit-mode — gate editor + SECOPS softening refusal (AC7)', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('opens an inline gate editor on a gate node and commits one gate/trigger CAS', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="gate-edit-architecture"]').click();
    fixture.detectChanges();
    const editor = $(host, '[data-testid="gate-rule-editor-architecture"]');
    expect(editor.getAttribute('role')).toBe('dialog');
    $(host, '[data-testid="gate-refusal-soft"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="gate-rule-save"]').click();
    const req = http.expectOne('/api/gate/trigger');
    expect(req.request.body.gate).toBe('ARCH_APPROVED');
    expect(req.request.body.refusal).toBe('soft');
    expect(req.request.body.expectedRev).toBe('r1');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('the SECOPS_APPROVED safety gate cannot be softened from the UI (hard→soft disabled + note)', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="gate-edit-security"]').click();
    fixture.detectChanges();
    const soft = $(host, '[data-testid="gate-refusal-soft"]') as HTMLButtonElement;
    expect(soft.disabled).toBe(true);
    expect($(host, '[data-testid="gate-rule-editor-security"]').textContent).toMatch(/can'?t be softened|safety gate/i);
    // Clicking soft does not flip the draft — hard stays selected.
    soft.click();
    fixture.detectChanges();
    expect($(host, '[data-testid="gate-refusal-hard"]').getAttribute('aria-checked')).toBe('true');
  });
});

describe('Pipeline edit-mode — Escape restores focus to the anchoring affordance (AC11)', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('Escape-closing the gate editor returns focus to its gate-edit button', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="gate-edit-architecture"]').click();
    fixture.detectChanges();
    const editor = $(host, '[data-testid="gate-rule-editor-architecture"]');
    key(editor, 'Escape');
    fixture.detectChanges();
    await settle(fixture);
    expect(host.querySelector('[data-testid="gate-rule-editor-architecture"]')).toBeNull();
    expect(document.activeElement).toBe($(host, '[data-testid="gate-edit-architecture"]'));
  });

  it('Escape-closing the delete confirm returns focus to its delete-stage button', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="delete-stage-architecture"]').click();
    fixture.detectChanges();
    const confirm = $(host, '[data-testid="delete-confirm-architecture"]');
    key(confirm, 'Escape');
    fixture.detectChanges();
    await settle(fixture);
    expect(host.querySelector('[data-testid="delete-confirm-architecture"]')).toBeNull();
    expect(document.activeElement).toBe($(host, '[data-testid="delete-stage-architecture"]'));
  });

  it('Escape-closing the add form returns focus to the triggering insert slot', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="pipeline-insert-1"]').click();
    fixture.detectChanges();
    const form = $(host, '[data-testid="new-stage-form"]');
    key(form, 'Escape');
    fixture.detectChanges();
    await settle(fixture);
    expect(host.querySelector('[data-testid="new-stage-form"]')).toBeNull();
    expect(document.activeElement).toBe($(host, '[data-testid="pipeline-insert-1"]'));
  });

  it('Escape-closing the end-cap add form returns focus to the Add-stage end button', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="pipeline-add-end"]').click();
    fixture.detectChanges();
    const form = $(host, '[data-testid="new-stage-form"]');
    key(form, 'Escape');
    fixture.detectChanges();
    await settle(fixture);
    expect(host.querySelector('[data-testid="new-stage-form"]')).toBeNull();
    expect(document.activeElement).toBe($(host, '[data-testid="pipeline-add-end"]'));
  });

  it('a successful add returns focus to the triggering insert slot', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="pipeline-insert-1"]').click();
    fixture.detectChanges();
    const input = $(host, '[data-testid="new-stage-name"]') as HTMLInputElement;
    input.value = 'triage';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    $(host, '[data-testid="new-stage-confirm"]').click();
    http.expectOne('/api/track/set-stages').flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
    expect(document.activeElement).toBe($(host, '[data-testid="pipeline-insert-1"]'));
  });
});

describe('Pipeline edit-mode — conflict & liveness (AC9)', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('a stale-rev 409 surfaces the conflict banner at the top of the chain, adopts server truth, rolls back', async () => {
    const { host, fixture, http: h, applied } = mount();
    http = h;
    armEdit(host, fixture);
    const grip = $(host, '[data-testid="stage-grip-architecture"]');
    key(grip, 'ArrowLeft', { altKey: true });
    fixture.detectChanges();
    const req = http.expectOne('/api/track/set-stages');
    // The server moved on: 409 carrying fresh truth (original order, rev r9).
    req.flush({ ok: false, conflict: true, state: { ...STATE, rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    const banner = $(host, '[data-testid="pipeline-conflict"]');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toMatch(/what you tried/i);
    expect($(host, '[data-testid="pipeline-liveness"]').textContent).toMatch(/conflict/i);
    // Adopted server truth (rolled back the optimistic move — original order shown).
    expect(applied.at(-1)?.rev).toBe('r9');
    const order = [...host.querySelectorAll('[data-testid^="stage-"]')]
      .map((s) => s.getAttribute('data-testid'))
      .filter((id) => ['stage-vision', 'stage-architecture', 'stage-security', 'stage-code'].includes(id ?? ''));
    expect(order).toEqual(['stage-vision', 'stage-architecture', 'stage-security', 'stage-code']);
  });

  it('Discard clears the conflict banner and returns the liveness pill to saved', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    key($(host, '[data-testid="stage-grip-architecture"]'), 'ArrowLeft', { altKey: true });
    fixture.detectChanges();
    http
      .expectOne('/api/track/set-stages')
      .flush({ ok: false, conflict: true, state: { ...STATE, rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    $(host, '[data-testid="pipeline-conflict-discard"]').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="pipeline-conflict"]')).toBeNull();
    expect($(host, '[data-testid="pipeline-liveness"]').textContent).toMatch(/saved/i);
  });
});

describe('Pipeline edit-mode — live SSE while editing (AC10)', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('an incoming state push updates the chain underneath edit-mode (ticket movement renders live)', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    expect($(host, '[data-testid="stage-count-code"]').textContent).toContain('0');
    // An agent advanced A-1 into 'code' — the host adopts the push.
    const moved: ProjectState = {
      ...STATE,
      rev: 'r2',
      tickets: STATE.tickets!.map((t) => (t.id === 'A-1' ? { ...t, stage: 'code' } : t)),
    };
    fixture.componentRef.setInput('state', moved);
    fixture.detectChanges();
    expect($(host, '[data-testid="stage-count-code"]').textContent).toContain('1');
    // Still armed — edit affordances remain.
    expect(host.querySelector('[data-testid="stage-grip-vision"]')).toBeTruthy();
  });

  it('after a cancelled pick-up, a later SSE stage reorder flows into the chain (no stale snapshot pins the order)', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    const grip = $(host, '[data-testid="stage-grip-architecture"]');
    // Pick up then cancel — the controller pins a snapshot equal to the then-current server order.
    key(grip, ' ');
    key(grip, 'ArrowLeft');
    fixture.detectChanges();
    key(grip, 'Escape');
    fixture.detectChanges();
    http.expectNone('/api/track/set-stages');
    // An agent reorders the stages server-side and pushes fresh truth (security before architecture).
    const reordered: ProjectState = {
      ...STATE,
      rev: 'r2',
      workflowView: {
        activeTrack: 'full',
        stages: [
          { stage: 'vision', owner: '/po', gate: null },
          { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
          { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
          { stage: 'code', owner: '/be', gate: null },
          { stage: 'done', owner: null, gate: null },
        ],
      },
      tracks: { full: ['vision', 'security', 'architecture', 'code', 'done'] },
    };
    fixture.componentRef.setInput('state', reordered);
    fixture.detectChanges();
    // The chain reflects SERVER truth, not the stale snapshot (security now precedes architecture).
    const order = [...host.querySelectorAll('[data-testid^="stage-"]')]
      .map((s) => s.getAttribute('data-testid'))
      .filter((id) => ['stage-vision', 'stage-architecture', 'stage-security', 'stage-code'].includes(id ?? ''));
    expect(order).toEqual(['stage-vision', 'stage-security', 'stage-architecture', 'stage-code']);
  });

  it('during an ACTIVE pick-up, an SSE stage reorder does NOT yank the in-flight order', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    const grip = $(host, '[data-testid="stage-grip-architecture"]');
    // Pick up architecture and move it before vision — an optimistic, dirty in-flight order.
    key(grip, ' ');
    key(grip, 'ArrowLeft');
    fixture.detectChanges();
    // While the grab is live, an agent reorders the (original) server order differently and pushes.
    const reordered: ProjectState = {
      ...STATE,
      rev: 'r2',
      workflowView: {
        activeTrack: 'full',
        stages: [
          { stage: 'vision', owner: '/po', gate: null },
          { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
          { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
          { stage: 'code', owner: '/be', gate: null },
          { stage: 'done', owner: null, gate: null },
        ],
      },
      tracks: { full: ['vision', 'security', 'architecture', 'code', 'done'] },
    };
    fixture.componentRef.setInput('state', reordered);
    fixture.detectChanges();
    // The dirty grab is preserved: architecture stays where the operator dragged it (before vision).
    const order = [...host.querySelectorAll('[data-testid^="stage-"]')]
      .map((s) => s.getAttribute('data-testid'))
      .filter((id) => ['stage-vision', 'stage-architecture', 'stage-security', 'stage-code'].includes(id ?? ''));
    expect(order).toEqual(['stage-architecture', 'stage-vision', 'stage-security', 'stage-code']);
    http.expectNone('/api/track/set-stages');
  });
});
