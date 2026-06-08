import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { ProjectState } from '../core/models';
import { WorkflowBuilderComponent } from './workflow-builder.component';
import { settle } from '../testing/settle';

/**
 * These exercise the builder against state in the HUB's wire shape — the shape the live registry
 * API actually serves: the label contract is an object keyed by name with snake_case fields, and a
 * rule's `when` is a single AND-of-keys object while its `do` is a list of verb-keyed actions. The
 * crafted-array fixtures in the sibling specs never hit this path, so the rendered UI broke while the
 * unit tests stayed green. Each test below drives the real rendered DOM.
 */

/** Hub-shaped state: object labels (snake_case) + engine-grammar rules (object `when`, verb `do`). */
const HUB_STATE = {
  preset: 'small-team',
  rev: 'r1',
  tracks: { full: ['vision', 'implement', 'code_review', 'done'] },
  workflowView: {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'implement', owner: '/be', gate: null },
      { stage: 'code_review', owner: '/rev', gate: { name: 'CODE_REVIEWED', refusal: 'hard' } },
      { stage: 'done', owner: null, gate: null },
    ],
  },
  gateDefs: [{ name: 'CODE_REVIEWED', owner: '/rev', refusal: 'hard', trigger: ['track:full'] }],
  labels: {
    TO_DEV_BE: { settable_by: ['/rev'], routes_to: 'implement', owner: '/be', meaning: 'back to backend' },
  },
  rules: [
    { id: 'back', stage: 'code_review', when: { event: 'label.set', label: 'TO_DEV_BE' }, do: [{ route_to_stage: 'implement' }] },
  ],
  tickets: [],
} as unknown as ProjectState;

/** Hub state with NO labels declared — the rule editor must still let event/pattern rules be authored. */
const NO_LABELS_STATE = { ...HUB_STATE, labels: {}, rules: [] } as unknown as ProjectState;

function mount(state: ProjectState): {
  fixture: ComponentFixture<WorkflowBuilderComponent>;
  host: HTMLElement;
  http: HttpTestingController;
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
  fixture.componentRef.setInput('state', state);
  // Adopt applied state back into the input, mirroring the shell so optimistic writes settle.
  fixture.componentRef.instance.applied.subscribe((s) => fixture.componentRef.setInput('state', s));
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

function $(host: HTMLElement, sel: string): HTMLElement {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as HTMLElement;
}

describe('WorkflowBuilder — live hub-shaped data', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  it('BUG1: a stage row Owner select renders an option per allowed agent (not just the clear option)', () => {
    const { host, http: h } = mount(HUB_STATE);
    http = h;
    const select = $(host, '[data-testid="owner-select-vision"]') as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    // The clear option plus the full standard allowlist.
    expect(values).toContain('');
    for (const agent of ['/po', '/arch', '/secops', '/be', '/fe', '/rev', '/qa', '/ui', '/verify']) {
      expect(values).toContain(agent);
    }
    expect(values.filter((v) => v !== '').length).toBeGreaterThanOrEqual(9);
  });

  it('BUG1: the Add-stage form Owner select also renders the full allowed-agent option list', () => {
    const { fixture, host, http: h } = mount(HUB_STATE);
    http = h;
    $(host, '[data-testid="add-stage-foot"]').click();
    fixture.detectChanges();
    const select = $(host, '[data-testid="new-stage-owner"]') as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    for (const agent of ['/po', '/arch', '/secops', '/be', '/fe', '/rev', '/qa', '/ui', '/verify']) {
      expect(values).toContain(agent);
    }
  });

  it('BUG2: opening a stage rule panel renders existing rules as cards (no render crash on object labels)', () => {
    const { fixture, host, http: h } = mount(HUB_STATE);
    http = h;
    $(host, '[data-testid="rules-pill-code_review"]').click();
    fixture.detectChanges();
    // The panel and the existing engine-grammar rule both render.
    expect(host.querySelector('[data-testid="stage-rules-code_review"]')).toBeTruthy();
    const card = $(host, '[data-testid="rule-card-back"]');
    expect(card.textContent ?? '').toMatch(/WHEN/i);
    expect(card.textContent ?? '').toMatch(/label\.set/);
    expect(card.textContent ?? '').toMatch(/implement/);
    // The allowed-labels strip reads the object-shaped contract.
    expect($(host, '[data-testid="allowed-labels-code_review"]').textContent ?? '').toMatch(/TO_DEV_BE/);
  });

  it('BUG2: "Add rule" opens an editable WHEN/DO form with interactive type + action selectors', () => {
    const { fixture, host, http: h } = mount(HUB_STATE);
    http = h;
    $(host, '[data-testid="rules-pill-code_review"]').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="rule-editor-code_review"]')).toBeNull();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    // The editor appears with a WHEN condition adder and a DO action adder.
    expect(host.querySelector('[data-testid="rule-editor-code_review"]')).toBeTruthy();
    $(host, '[data-testid="rule-add-condition"]').click();
    fixture.detectChanges();
    const condType = $(host, '[data-testid="condition-type-0"]') as HTMLSelectElement;
    const condTypes = [...condType.options].map((o) => o.value);
    expect(condTypes).toEqual(expect.arrayContaining(['event', 'pattern', 'label']));
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    const actTypes = [...actType.options].map((o) => o.value);
    expect(actTypes).toEqual(expect.arrayContaining(['route_to_stage', 'instruct', 'set_label']));
  });

  it('BUG2: with NO labels defined, "Add rule" still authors an event-condition rule and posts engine grammar', async () => {
    const { fixture, host, http: h } = mount(NO_LABELS_STATE);
    http = h;
    $(host, '[data-testid="rules-pill-code_review"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'on-comment';
    name.dispatchEvent(new Event('input'));

    // WHEN: an event condition (no labels exist, but event is still selectable).
    $(host, '[data-testid="rule-add-condition"]').click();
    fixture.detectChanges();
    const condType = $(host, '[data-testid="condition-type-0"]') as HTMLSelectElement;
    condType.value = 'event';
    condType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const condEvent = $(host, '[data-testid="condition-event-0"]') as HTMLSelectElement;
    condEvent.value = 'comment.added';
    condEvent.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // DO: instruct.
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
    const prompt = $(host, '[data-testid="action-prompt-0"]') as HTMLInputElement;
    prompt.value = 'take a look';
    prompt.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(($(host, '[data-testid="rule-save"]') as HTMLButtonElement).disabled).toBe(false);
    $(host, '[data-testid="rule-save"]').click();
    const req = http.expectOne('/api/workflow/set-rules');
    const posted = req.request.body.rules as Array<{ id: string; when?: unknown; do?: unknown }>;
    const added = posted.find((r) => r.id === 'on-comment');
    expect(added?.when).toEqual({ event: 'comment.added' });
    expect(added?.do).toEqual([{ instruct: { target: ['/be'], prompt: 'take a look' } }]);
    req.flush({ ok: true, state: HUB_STATE });
    await settle(fixture);
  });

  it('BUG3: adding a stage renders a NORMAL new row (name, Owner select, remove) and frees the Add button for a second add', async () => {
    const { fixture, host, http: h } = mount(HUB_STATE);
    http = h;

    // First add.
    $(host, '[data-testid="add-stage-foot"]').click();
    fixture.detectChanges();
    let nameInput = $(host, '[data-testid="new-stage-name"]') as HTMLInputElement;
    nameInput.value = 'Triage';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const owner = $(host, '[data-testid="new-stage-owner"]') as HTMLSelectElement;
    owner.value = '/qa';
    owner.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    $(host, '[data-testid="new-stage-confirm"]').click();

    const req1 = http.expectOne('/api/track/set-stages');
    expect(req1.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'vision',
      'implement',
      'code_review',
      'done',
      'Triage',
    ]);
    // Server echoes the new ordered list back in hub shape.
    req1.flush({
      ok: true,
      state: {
        ...HUB_STATE,
        rev: 'r2',
        workflowView: {
          activeTrack: 'full',
          stages: [...(HUB_STATE.workflowView!.stages as unknown[]), { stage: 'Triage', owner: '/qa', gate: null }],
        },
      },
    });
    await settle(fixture);

    // The new stage is a NORMAL row: name shown, an Owner select, and a remove button.
    const row = $(host, '[data-testid="builder-row-Triage"]');
    expect($(row, '[data-testid="builder-stage-name"]').textContent?.trim()).toBe('Triage');
    expect(host.querySelector('[data-testid="owner-select-Triage"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="delete-stage-Triage"]')).toBeTruthy();

    // The add form closed and the Add-stage button is enabled again.
    expect(host.querySelector('[data-testid="new-stage-row"]')).toBeNull();
    const addFoot = $(host, '[data-testid="add-stage-foot"]') as HTMLButtonElement;
    expect(addFoot.disabled).toBe(false);

    // A SECOND add works.
    addFoot.click();
    fixture.detectChanges();
    nameInput = $(host, '[data-testid="new-stage-name"]') as HTMLInputElement;
    nameInput.value = 'Release';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    $(host, '[data-testid="new-stage-confirm"]').click();
    const req2 = http.expectOne('/api/track/set-stages');
    expect(req2.request.body.stages.map((s: { name: string }) => s.name)).toEqual([
      'vision',
      'implement',
      'code_review',
      'done',
      'Triage',
      'Release',
    ]);
    req2.flush({ ok: true, state: { ...HUB_STATE, rev: 'r3' } });
    await settle(fixture);
  });
});
