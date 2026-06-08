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
];

const RULES: RuleView[] = [
  {
    id: 'route-rejection-to-backend',
    stage: 'code_review',
    when: [{ type: 'event', event: 'gate.rejected', gate: 'REVIEW' }, { type: 'label', label: 'TO_DEV_BE' }],
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
  gateDefs: [{ name: 'REVIEW', refusal: 'soft', owner: '/rev', trigger: ['change-class'] }],
  labels: LABELS,
  rules: RULES,
};

const NO_LABELS_STATE: ProjectState = { ...STATE, labels: [] };

function mount(state: ProjectState = STATE): {
  fixture: ComponentFixture<WorkflowBuilderComponent>;
  host: HTMLElement;
  http: HttpTestingController;
  applied: ProjectState[];
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkflowBuilderComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() }],
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

function setInput(host: HTMLElement, sel: string, value: string): void {
  const el = $(host, sel) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('WorkflowBuilder — Labels tab + management', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  it('offers a Labels tab in the topbar that swaps the body for the labels manager', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    $(host, '[data-testid="labels-tab"]').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="labels-manager"]')).toBeTruthy();
    // the stage list is hidden while on Labels
    expect(host.querySelector('[data-testid="builder-row-vision"]')).toBeNull();
  });

  it('creating a label posts the full map to workflow/set-labels under expectedRev', async () => {
    const { fixture, host, http: h } = mount(NO_LABELS_STATE);
    http = h;
    $(host, '[data-testid="labels-tab"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="label-starter-TO_DEV_BE"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="label-save"]').click();
    fixture.detectChanges();

    const req = http.expectOne('/api/workflow/set-labels');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.expectedRev).toBe('r1');
    expect(req.request.body.labels.TO_DEV_BE).toBeTruthy();
    expect(req.request.body.labels.TO_DEV_BE.settable_by).toContain('/rev');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('after a created label feeds the state, it appears in a rule editor label picker', async () => {
    // start with no labels, then adopt a state that has TO_DEV_BE (simulating the server echo)
    const { fixture, host, http: h } = mount(NO_LABELS_STATE);
    http = h;
    // open code_review rules and a set_label action — picker should be empty initially
    $(host, '[data-testid="rules-pill-code_review"]').click();
    fixture.detectChanges();
    // now adopt a state carrying the label
    fixture.componentRef.setInput('state', STATE);
    fixture.detectChanges();
    // the allowed-labels strip now lists the live label
    expect($(host, '[data-testid="allowed-labels-code_review"]').textContent).toContain('TO_DEV_BE');
  });

  it('the allowed-labels empty state links to the Labels tab instead of a dead "per the contract" strip', () => {
    const { fixture, host, http: h } = mount(NO_LABELS_STATE);
    http = h;
    // open rules for a stage whose owner can set nothing (no labels exist)
    $(host, '[data-testid="rules-pill-vision"]').click();
    fixture.detectChanges();
    const strip = $(host, '[data-testid="allowed-labels-vision"]');
    expect(strip.textContent).not.toContain('per the contract');
    const link = $(host, '[data-testid="manage-labels-link-vision"]');
    expect(link).toBeTruthy();
    link.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="labels-manager"]')).toBeTruthy();
  });
});

describe('WorkflowBuilder — pipeline visuals', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  it('renders each stage as a card on a pipeline rail with a gate-shape node', () => {
    const { host, http: h } = mount();
    http = h;
    // a vertical rail spine and a node per stage
    expect(host.querySelector('[data-testid="builder-rail"]')).toBeTruthy();
    // the gated stage (code_review, soft) carries a node marked as a gate (diamond), not a plain dot
    const node = $(host, '[data-testid="rail-node-code_review"]');
    expect(node.getAttribute('data-node')).toBe('gate-soft');
    // an ungated stage carries a plain dot node
    expect($(host, '[data-testid="rail-node-vision"]').getAttribute('data-node')).toBe('none');
  });

  it('the rail node is decorative (aria-hidden) so the gate is never carried by shape alone', () => {
    const { host, http: h } = mount();
    http = h;
    expect($(host, '[data-testid="rail-node-code_review"]').getAttribute('aria-hidden')).toBe('true');
    // the textual gate marker still names the gate + hardness
    expect($(host, '[data-testid="builder-gate-code_review"]').textContent).toContain('REVIEW');
  });
});

describe('WorkflowBuilder — motion respects prefers-reduced-motion', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  it('exposes a motionOk signal driven by the reduced-motion media query', () => {
    const { fixture, http: h } = mount();
    http = h;
    const cmp = fixture.componentInstance as unknown as { motionOk: () => boolean };
    // jsdom matchMedia defaults to not-matching → motion allowed; the host carries the class toggle
    expect(typeof cmp.motionOk()).toBe('boolean');
  });

  it('reflects motion preference on the host so a single token site can zero durations', () => {
    const { host, http: h } = mount();
    http = h;
    // the builder host (or root) carries a data attribute mirroring motionOk for the tokenised gate
    const root = host.querySelector('[data-testid="builder-motion-root"]') ?? host;
    expect(root.hasAttribute('data-motion')).toBe(true);
  });
});

describe('WorkflowBuilder — first-run mental-model card', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  it('shows a dismissible first-run helper naming the six nouns, then hides it', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    const card = $(host, '[data-testid="first-run-card"]');
    expect(card.textContent?.toLowerCase()).toContain('stage');
    expect(card.textContent?.toLowerCase()).toContain('label');
    $(host, '[data-testid="first-run-dismiss"]').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="first-run-card"]')).toBeNull();
  });
});
