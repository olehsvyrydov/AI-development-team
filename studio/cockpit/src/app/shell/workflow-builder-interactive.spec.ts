import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { LabelDef, ProjectState, RuleView } from '../core/models';
import { WorkflowBuilderComponent } from './workflow-builder.component';
import { settle } from '../testing/settle';

const LABELS: LabelDef[] = [
  { name: 'TO_DEV_BE', settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/be', meaning: 'send back to backend dev' },
  { name: 'TO_DEV_FE', settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/fe', meaning: 'send back to frontend dev' },
  { name: 'NEEDS_DESIGN', settableBy: ['/ui'], routesTo: 'design', owner: '/ui', meaning: 'design rework' },
];

const RULES: RuleView[] = [
  {
    id: 'route-rejection-to-backend',
    stage: 'code_review',
    when: [
      { type: 'event', event: 'gate.rejected', gate: 'REVIEW' },
      { type: 'label', label: 'TO_DEV_BE' },
    ],
    do: [
      { action: 'route_to_stage', stage: 'implement' },
      { action: 'instruct', target: ['/be'], prompt: 'Fix the findings labelled TO_DEV_BE.' },
      { action: 'clear_label', label: 'TO_DEV_BE' },
    ],
  },
];

const STATE: ProjectState = {
  preset: 'solo',
  rev: 'r1',
  tracks: { full: ['vision', 'implement', 'code_review', 'done'] },
  workflowView: {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'implement', owner: '/be', gate: null },
      { stage: 'code_review', owner: '/rev', gate: { name: 'REVIEW', refusal: 'soft' } },
      { stage: 'done', owner: null, gate: null },
    ],
  },
  gateDefs: [
    { name: 'REVIEW', refusal: 'soft', owner: '/rev', trigger: ['change-class'] },
    { name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops', trigger: ['external-input'] },
  ],
  labels: LABELS,
  rules: RULES,
};

/** A track where a safety-override (SECOPS_APPROVED) gate sits between two stages, unmet. */
const SAFETY_STATE: ProjectState = {
  preset: 'regulated',
  rev: 'r1',
  tracks: { full: ['implement', 'security', 'release'] },
  workflowView: {
    activeTrack: 'full',
    stages: [
      { stage: 'implement', owner: '/be', gate: null },
      { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
      { stage: 'release', owner: '/po', gate: null },
    ],
  },
  gateDefs: [{ name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops', trigger: ['external-input'] }],
  labels: LABELS,
  rules: [],
};

function mount(state: ProjectState = STATE): {
  fixture: ComponentFixture<WorkflowBuilderComponent>;
  host: HTMLElement;
  http: HttpTestingController;
  applied: ProjectState[];
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkflowBuilderComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(WorkflowBuilderComponent);
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

function names(host: HTMLElement): (string | undefined)[] {
  return [...host.querySelectorAll('[data-testid="builder-stage-name"]')].map((e) => e.textContent?.trim());
}

function key(el: HTMLElement, k: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
}

/** jsdom lacks a DragEvent constructor; a bubbling, cancelable Event drives the same handlers. */
function drag(el: HTMLElement, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

describe('WorkflowBuilder — ADT-228 drag-to-reorder', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  it('removes the up/down arrow buttons and the per-row insert arrow (drag replaces them)', () => {
    const { host, http: h } = mount();
    http = h;
    expect(host.querySelector('[data-testid="move-up-vision"]')).toBeNull();
    expect(host.querySelector('[data-testid="move-down-vision"]')).toBeNull();
    expect(host.querySelector('[data-testid="insert-after-vision"]')).toBeNull();
  });

  it('reorders by dragging a grip and posts the full new order via set-stages', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    const gripVision = $(host, '[data-testid="move-grip-vision"]');
    const rowReview = $(host, '[data-testid="builder-row-code_review"]');

    drag(gripVision, 'dragstart');
    drag(rowReview, 'dragover');
    fixture.detectChanges();
    drag(rowReview, 'drop');
    drag(gripVision, 'dragend');
    fixture.detectChanges();

    // vision dropped onto code_review's position → it lands at code_review's index.
    expect(names(host)).toEqual(['implement', 'code_review', 'vision', 'done']);
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'implement',
      'code_review',
      'vision',
      'done',
    ]);
    expect(req.request.body.expectedRev).toBe('r1');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('only the grip is draggable; row body controls stay non-draggable', () => {
    const { host, http: h } = mount();
    http = h;
    expect($(host, '[data-testid="move-grip-vision"]').getAttribute('draggable')).toBe('true');
    const row = $(host, '[data-testid="builder-row-vision"]');
    expect(row.getAttribute('draggable')).not.toBe('true');
  });

  it('Escape mid-drag cancels: row returns home and nothing is posted', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    const gripVision = $(host, '[data-testid="move-grip-vision"]');
    const rowReview = $(host, '[data-testid="builder-row-code_review"]');
    drag(gripVision, 'dragstart');
    drag(rowReview, 'dragover');
    fixture.detectChanges();
    key(gripVision, 'Escape');
    fixture.detectChanges();
    expect(names(host)).toEqual(['vision', 'implement', 'code_review', 'done']);
    http.expectNone('/api/track/set-stages');
  });

  it('keyboard pick-up / move / drop reorders and announces each step, then posts', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    const grip = $(host, '[data-testid="move-grip-vision"]');
    const live = $(host, '[data-testid="builder-live"]');

    key(grip, ' '); // pick up
    fixture.detectChanges();
    expect(grip.getAttribute('aria-grabbed')).toBe('true');
    expect(live.textContent ?? '').toMatch(/picked up vision/i);

    key(grip, 'ArrowDown'); // move to position 2
    fixture.detectChanges();
    expect(names(host)).toEqual(['implement', 'vision', 'code_review', 'done']);
    expect(live.textContent ?? '').toMatch(/position 2 of 4/i);

    key(grip, ' '); // drop
    fixture.detectChanges();
    expect(live.textContent ?? '').toMatch(/dropped vision/i);
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'implement',
      'vision',
      'code_review',
      'done',
    ]);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
    expect(grip.getAttribute('aria-grabbed')).toBe('false');
  });

  it('Escape while grabbed cancels the keyboard move and posts nothing', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    const grip = $(host, '[data-testid="move-grip-vision"]');
    key(grip, ' ');
    fixture.detectChanges();
    key(grip, 'ArrowDown');
    fixture.detectChanges();
    key(grip, 'Escape');
    fixture.detectChanges();
    expect(names(host)).toEqual(['vision', 'implement', 'code_review', 'done']);
    expect(grip.getAttribute('aria-grabbed')).toBe('false');
    http.expectNone('/api/track/set-stages');
  });

  it('Alt+ArrowDown still reorders (the tested-primary keyboard path is kept)', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    const grip = $(host, '[data-testid="move-grip-vision"]');
    key(grip, 'ArrowDown', { altKey: true });
    fixture.detectChanges();
    expect(names(host)).toEqual(['implement', 'vision', 'code_review', 'done']);
    const req = http.expectOne('/api/track/set-stages');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('Add stage appends to the END and announces it can be dragged into place', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    $(host, '[data-testid="add-stage-foot"]').click();
    fixture.detectChanges();
    const input = $(host, '[data-testid="new-stage-name"]') as HTMLInputElement;
    input.value = 'triage';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect($(host, '[data-testid="new-stage-row"]').textContent ?? '').toMatch(/end/i);
    $(host, '[data-testid="new-stage-confirm"]').click();
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'vision',
      'implement',
      'code_review',
      'done',
      'triage',
    ]);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
    expect($(host, '[data-testid="builder-live"]').textContent ?? '').toMatch(/drag it into place/i);
  });

  it('keeps the basket/trash delete with its off-track confirm', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    expect(host.querySelector('[data-testid="delete-stage-vision"]')).toBeTruthy();
    $(host, '[data-testid="delete-stage-vision"]').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="delete-confirm-vision"]')).toBeTruthy();
  });
});

describe('WorkflowBuilder — ADT-229 when→do rule editor', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  function openRules(host: HTMLElement, fixture: ComponentFixture<WorkflowBuilderComponent>, stage: string): void {
    $(host, `[data-testid="rules-pill-${stage}"]`).click();
    fixture.detectChanges();
  }

  it('shows a rules pill with the rule count per stage', () => {
    const { host, http: h } = mount();
    http = h;
    expect($(host, '[data-testid="rules-pill-code_review"]').textContent ?? '').toMatch(/1/);
    expect($(host, '[data-testid="rules-pill-vision"]').textContent ?? '').toMatch(/0/);
  });

  it('reads a rule as a plain WHEN/DO sentence with escaped text', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    openRules(host, fixture, 'code_review');
    const card = $(host, '[data-testid="rule-card-route-rejection-to-backend"]');
    expect(card.textContent ?? '').toMatch(/WHEN/i);
    expect(card.textContent ?? '').toMatch(/gate\.rejected/);
    expect(card.textContent ?? '').toMatch(/TO_DEV_BE/);
    expect(card.textContent ?? '').toMatch(/DO/i);
    expect(card.textContent ?? '').toMatch(/implement/);
  });

  it('renders rule text escaped — a hostile prompt never reaches the DOM as HTML', () => {
    const hostile: ProjectState = {
      ...STATE,
      rules: [
        {
          id: 'x',
          stage: 'code_review',
          when: [],
          do: [{ action: 'instruct', target: ['/be'], prompt: '<img src=x onerror=alert(1)>' }],
        },
      ],
    };
    const { fixture, host, http: h } = mount(hostile);
    http = h;
    openRules(host, fixture, 'code_review');
    expect(host.querySelector('img[onerror]')).toBeNull();
  });

  it('flags a backward route with a loops-back badge', () => {
    const backward: ProjectState = {
      ...STATE,
      rules: [{ id: 'loopy', stage: 'code_review', when: [], do: [{ action: 'route_to_stage', stage: 'implement' }] }],
    };
    const { fixture, host, http: h } = mount(backward);
    http = h;
    openRules(host, fixture, 'code_review');
    expect($(host, '[data-testid="rule-card-loopy"]').textContent ?? '').toMatch(/loops back/i);
  });

  it('shows the loop-budget → NEEDS_HUMAN safety note (read-only) in the editor', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    openRules(host, fixture, 'code_review');
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    expect($(host, '[data-testid="rule-loop-note"]').textContent ?? '').toMatch(/NEEDS_HUMAN/);
  });

  it('shows the allowed-labels strip for the stage owner from the contract', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    openRules(host, fixture, 'code_review');
    const strip = $(host, '[data-testid="allowed-labels-code_review"]');
    // /rev may set TO_DEV_BE + TO_DEV_FE, NOT NEEDS_DESIGN (only /ui).
    expect(strip.textContent ?? '').toMatch(/TO_DEV_BE/);
    expect(strip.textContent ?? '').toMatch(/TO_DEV_FE/);
    expect(strip.textContent ?? '').not.toMatch(/NEEDS_DESIGN/);
  });

  it('filters the Set-label picker to the owner settable_by (unauthorized absent, not greyed)', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    openRules(host, fixture, 'code_review');
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    // add an action, choose Set label
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actionType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actionType.value = 'set_label';
    actionType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const labelSel = $(host, '[data-testid="action-label-0"]') as HTMLSelectElement;
    const values = [...labelSel.options].map((o) => o.value);
    expect(values).toContain('TO_DEV_BE');
    expect(values).toContain('TO_DEV_FE');
    expect(values).not.toContain('NEEDS_DESIGN');
  });

  it('authors a WHEN/DO rule and posts the full rule list to set-rules with rev', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    openRules(host, fixture, 'vision');
    $(host, '[data-testid="rule-add-vision"]').click();
    fixture.detectChanges();

    // name
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'ping-on-comment';
    name.dispatchEvent(new Event('input'));

    // one condition: label
    $(host, '[data-testid="rule-add-condition"]').click();
    fixture.detectChanges();
    const condType = $(host, '[data-testid="condition-type-0"]') as HTMLSelectElement;
    condType.value = 'label';
    condType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const condLabel = $(host, '[data-testid="condition-label-0"]') as HTMLSelectElement;
    condLabel.value = 'TO_DEV_BE';
    condLabel.dispatchEvent(new Event('change'));

    // one action: route to stage
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actType.value = 'route_to_stage';
    actType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const actStage = $(host, '[data-testid="action-stage-0"]') as HTMLSelectElement;
    actStage.value = 'implement';
    actStage.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    $(host, '[data-testid="rule-save"]').click();
    const req = http.expectOne('/api/workflow/set-rules');
    expect(req.request.body.expectedRev).toBe('r1');
    // The list is posted in the engine's wire grammar: a single `when` object + verb-keyed `do`.
    const posted: Array<{ id: string; stage?: string; when?: unknown; do?: unknown }> = req.request.body.rules;
    // existing rule kept + the new one appended.
    const added = posted.find((r) => r.id === 'ping-on-comment');
    expect(added).toBeTruthy();
    expect(added?.stage).toBe('vision');
    expect(added?.when).toEqual({ label: 'TO_DEV_BE' });
    expect(added?.do).toEqual([{ route_to_stage: 'implement' }]);
    expect(posted.some((r) => r.id === 'route-rejection-to-backend')).toBe(true);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('disables Save with a reason on an incomplete rule (route missing a target stage)', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    openRules(host, fixture, 'vision');
    $(host, '[data-testid="rule-add-vision"]').click();
    fixture.detectChanges();
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'incomplete';
    name.dispatchEvent(new Event('input'));
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actType.value = 'route_to_stage';
    actType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(($(host, '[data-testid="rule-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="rule-draft-error"]').textContent ?? '').toMatch(/target stage/i);
    http.expectNone('/api/workflow/set-rules');
  });

  it('disables Save with a reason when an Instruct action has an empty prompt', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    openRules(host, fixture, 'vision');
    $(host, '[data-testid="rule-add-vision"]').click();
    fixture.detectChanges();
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'instruct-empty';
    name.dispatchEvent(new Event('input'));
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actType.value = 'instruct';
    actType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const target = $(host, '[data-testid="action-target-0"]') as HTMLSelectElement;
    target.value = '/be';
    target.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(($(host, '[data-testid="rule-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="rule-draft-error"]').textContent ?? '').toMatch(/prompt/i);
  });

  it('refuses (Save disabled + reason) a route past an unmet safety gate', () => {
    const { fixture, host, http: h } = mount(SAFETY_STATE);
    http = h;
    $(host, '[data-testid="rules-pill-implement"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="rule-add-implement"]').click();
    fixture.detectChanges();
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'bypass';
    name.dispatchEvent(new Event('input'));
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actType.value = 'route_to_stage';
    actType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    // route to "release" — at/beyond the unmet SECOPS_APPROVED gate.
    const actStage = $(host, '[data-testid="action-stage-0"]') as HTMLSelectElement;
    actStage.value = 'release';
    actStage.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(($(host, '[data-testid="rule-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="rule-draft-error"]').textContent ?? '').toMatch(/safety gate/i);
    http.expectNone('/api/workflow/set-rules');
  });

  it('surfaces a server 400 on rule save (server is authority)', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    $(host, '[data-testid="rules-pill-vision"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="rule-add-vision"]').click();
    fixture.detectChanges();
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'ok-client';
    name.dispatchEvent(new Event('input'));
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actType.value = 'route_to_stage';
    actType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const actStage = $(host, '[data-testid="action-stage-0"]') as HTMLSelectElement;
    actStage.value = 'implement';
    actStage.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    $(host, '[data-testid="rule-save"]').click();
    const req = http.expectOne('/api/workflow/set-rules');
    req.flush({ ok: false, error: 'rule routes past an unmet safety gate' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    expect($(host, '[data-testid="builder-error"]').textContent ?? '').toMatch(/safety gate/i);
  });

  it('reconciles a 409 from a rule save with the shared conflict banner', async () => {
    const { fixture, host, http: h, applied } = mount();
    http = h;
    $(host, '[data-testid="rules-pill-vision"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="rule-add-vision"]').click();
    fixture.detectChanges();
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'race';
    name.dispatchEvent(new Event('input'));
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actType.value = 'route_to_stage';
    actType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const actStage = $(host, '[data-testid="action-stage-0"]') as HTMLSelectElement;
    actStage.value = 'implement';
    actStage.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    $(host, '[data-testid="rule-save"]').click();
    const req = http.expectOne('/api/workflow/set-rules');
    req.flush({ ok: false, conflict: true, state: { ...STATE, rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect($(host, '[data-testid="builder-conflict"]').getAttribute('role')).toBe('alert');
    expect(applied.at(-1)?.rev).toBe('r9');
  });
});
