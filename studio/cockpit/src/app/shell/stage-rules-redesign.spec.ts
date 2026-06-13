import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { LabelDef, RuleView } from '../core/models';
import { StageRulesComponent } from './stage-rules.component';

const LABELS: LabelDef[] = [
  { name: 'TO_DEV_BE', settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/be', meaning: 'send back to backend dev' },
  { name: 'TO_DEV_FE', settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/fe', meaning: 'send back to frontend dev' },
  { name: 'NEEDS_DESIGN', settableBy: ['/ui'], routesTo: null, owner: '/ui', meaning: 'needs a design pass' },
];

const RULE: RuleView = {
  id: 'route-rejection-to-backend',
  stage: 'code_review',
  when: [{ type: 'event', event: 'gate.rejected', gate: 'REVIEW' }, { type: 'label', label: 'TO_DEV_BE' }],
  do: [
    { action: 'route_to_stage', stage: 'implement' },
    { action: 'instruct', target: ['/be'], prompt: 'Fix it.' },
    { action: 'clear_label', label: 'TO_DEV_BE' },
  ],
};

const FANOUT_RULE: RuleView = {
  id: 'old-fanout',
  stage: 'code_review',
  when: [],
  do: [{ action: 'fan_out', stages: ['build_be', 'build_fe'] }],
};

function mount(opts: { rules?: RuleView[]; labels?: LabelDef[]; owner?: string | null } = {}): {
  fixture: ComponentFixture<StageRulesComponent>;
  host: HTMLElement;
  saved: (readonly RuleView[])[];
  manage: number;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [StageRulesComponent] });
  const fixture = TestBed.createComponent(StageRulesComponent);
  const saved: (readonly RuleView[])[] = [];
  let manage = 0;
  fixture.componentRef.setInput('stage', 'code_review');
  fixture.componentRef.setInput('owner', opts.owner === undefined ? '/rev' : opts.owner);
  fixture.componentRef.setInput('rules', opts.rules ?? []);
  fixture.componentRef.setInput('labels', opts.labels ?? LABELS);
  fixture.componentRef.setInput('stageOrder', ['vision', 'implement', 'code_review', 'done']);
  fixture.componentRef.setInput('safetyStages', []);
  fixture.componentRef.setInput('saving', false);
  fixture.componentRef.instance.save.subscribe((r) => saved.push(r));
  fixture.componentRef.instance.manageLabels.subscribe(() => (manage += 1));
  fixture.detectChanges();
  const getManage = (): number => manage;
  return { fixture, host: fixture.nativeElement as HTMLElement, saved, get manage() { return getManage(); } };
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

function selectValue(host: HTMLElement, sel: string, value: string): void {
  const el = $(host, sel) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('StageRules — fan-out is hidden as a new action', () => {
  it('does not offer Fan out in the DO action-type picker', () => {
    const { host, fixture } = mount();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const options = [...($(host, '[data-testid="action-type-0"]') as HTMLSelectElement).options].map((o) => o.value);
    expect(options).not.toContain('fan_out');
    expect(options).toContain('route_to_stage');
    expect(options).toContain('instruct');
  });

  it('renders a pre-existing fan_out rule read-only with an honest "does not run yet" note, no crash', () => {
    const { host } = mount({ rules: [FANOUT_RULE] });
    const card = $(host, '[data-testid="rule-card-old-fanout"]');
    expect(card.textContent?.toLowerCase()).toContain('does not run yet');
    // it still names the recorded targets, escaped text only
    expect(card.textContent).toContain('build_be');
  });
});

describe('StageRules — reads as a sentence with a live preview', () => {
  it('the WHEN/DO sections use plain-English subtitles, not bare keywords only', () => {
    const { host, fixture } = mount();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    const editor = $(host, '[data-testid="rule-editor-code_review"]');
    expect(editor.textContent?.toLowerCase()).toContain('when this happens');
    expect(editor.textContent?.toLowerCase()).toContain('in order');
  });

  it('shows a live preview sentence assembled from the draft', () => {
    const { host, fixture } = mount();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="rule-name"]', 'my-rule');
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-stage-0"]', 'implement');
    fixture.detectChanges();
    const preview = $(host, '[data-testid="rule-preview"]');
    expect(preview.textContent?.toLowerCase()).toContain('route to implement');
  });
});

describe('StageRules — friendly empty state', () => {
  it('teaches with an example and an add-first-rule button when a stage has no rules', () => {
    const { host } = mount({ rules: [] });
    const empty = $(host, '[data-testid="rules-empty-code_review"]');
    expect(empty.textContent?.toLowerCase()).toContain('when this happens');
    expect(empty.textContent).toContain('TO_DEV_BE');
  });
});

describe('StageRules — allowed-labels strip links to label management', () => {
  it('when the owner can set no labels, offers a create-a-label link instead of "per the contract"', () => {
    const result = mount({ owner: '/po', labels: [] });
    const strip = $(result.host, '[data-testid="allowed-labels-code_review"]');
    expect(strip.textContent).not.toContain('per the contract');
    $(result.host, '[data-testid="manage-labels-link-code_review"]').click();
    expect(result.manage).toBe(1);
  });

  it('escapes an injection-shaped label name in the allowed strip (no markup reaches the DOM)', () => {
    const nasty: LabelDef[] = [{ name: 'X<img src=x onerror=alert(1)>', settableBy: ['/rev'], routesTo: null }];
    const { host } = mount({ labels: nasty });
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('lists only the labels the stage owner may set in the allowed strip (others absent, not greyed)', () => {
    const { host } = mount();
    const strip = $(host, '[data-testid="allowed-labels-code_review"]');
    expect(strip.textContent ?? '').toMatch(/TO_DEV_BE/);
    expect(strip.textContent ?? '').toMatch(/TO_DEV_FE/);
    expect(strip.textContent ?? '').not.toMatch(/NEEDS_DESIGN/);
  });

  it('filters the Set-label action picker to the owner settable_by (unauthorized label absent)', () => {
    const { host, fixture } = mount();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-type-0"]', 'set_label');
    fixture.detectChanges();
    const values = [...($(host, '[data-testid="action-label-0"]') as HTMLSelectElement).options].map((o) => o.value);
    expect(values).toContain('TO_DEV_BE');
    expect(values).toContain('TO_DEV_FE');
    expect(values).not.toContain('NEEDS_DESIGN');
  });
});

describe('StageRules — read rendering escapes hostile rule text', () => {
  it('renders a recorded instruct prompt as text, never as live markup', () => {
    const hostile: RuleView = {
      id: 'x',
      stage: 'code_review',
      when: [],
      do: [{ action: 'instruct', target: ['/be'], prompt: '<img src=x onerror=alert(1)>' }],
    };
    const { host } = mount({ rules: [hostile] });
    expect(host.querySelector('img[onerror]')).toBeNull();
    expect($(host, '[data-testid="rule-card-x"]').textContent ?? '').toContain('<img src=x onerror=alert(1)>');
  });
});

describe('StageRules — backward-route loop affordances', () => {
  it('flags a route to an earlier stage with a loops-back badge', () => {
    const backward: RuleView = {
      id: 'loopy',
      stage: 'code_review',
      when: [],
      do: [{ action: 'route_to_stage', stage: 'implement' }],
    };
    const { host } = mount({ rules: [backward] });
    expect($(host, '[data-testid="rule-card-loopy"]').textContent ?? '').toMatch(/loops back/i);
  });

  it('shows the de-jargoned backward-loop safety note (read-only) when authoring', () => {
    const { host, fixture } = mount();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    const note = $(host, '[data-testid="rule-loop-note"]').textContent ?? '';
    expect(note).toMatch(/send work backward/i);
    expect(note).toMatch(/hands it to you/i);
  });
});

describe('StageRules — authoring emits the merged rule list', () => {
  it('authors a WHEN label / DO route rule and emits the full list with the new rule appended', () => {
    const existing: RuleView = {
      id: 'route-rejection-to-backend',
      stage: 'code_review',
      when: [{ type: 'label', label: 'TO_DEV_BE' }],
      do: [{ action: 'route_to_stage', stage: 'implement' }],
    };
    const { host, fixture, saved } = mount({ rules: [existing] });
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="rule-name"]', 'ping-on-comment');
    $(host, '[data-testid="rule-add-condition"]').click();
    fixture.detectChanges();
    selectValue(host, '[data-testid="condition-type-0"]', 'label');
    fixture.detectChanges();
    selectValue(host, '[data-testid="condition-label-0"]', 'TO_DEV_BE');
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-type-0"]', 'route_to_stage');
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-stage-0"]', 'implement');
    fixture.detectChanges();
    $(host, '[data-testid="rule-save"]').click();
    expect(saved.length).toBe(1);
    const list = saved[0];
    expect(list.some((r) => r.id === 'route-rejection-to-backend')).toBe(true);
    const added = list.find((r) => r.id === 'ping-on-comment');
    expect(added?.stage).toBe('code_review');
    expect(added?.when).toEqual([{ type: 'label', label: 'TO_DEV_BE' }]);
    expect(added?.do).toEqual([{ action: 'route_to_stage', stage: 'implement' }]);
  });

  it('disables Save with a reason on a route missing its target stage (emits nothing)', () => {
    const { host, fixture, saved } = mount();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="rule-name"]', 'incomplete');
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-type-0"]', 'route_to_stage');
    fixture.detectChanges();
    expect(($(host, '[data-testid="rule-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="rule-draft-error"]').textContent ?? '').toMatch(/target stage/i);
    expect(saved.length).toBe(0);
  });

  it('disables Save with a reason when an Instruct action has an empty prompt', () => {
    const { host, fixture } = mount();
    $(host, '[data-testid="rule-add-code_review"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="rule-name"]', 'instruct-empty');
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-type-0"]', 'instruct');
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-target-0"]', '/be');
    fixture.detectChanges();
    expect(($(host, '[data-testid="rule-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="rule-draft-error"]').textContent ?? '').toMatch(/prompt/i);
  });

  it('refuses (Save disabled + reason) a route past an unmet safety gate', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [StageRulesComponent] });
    const fixture = TestBed.createComponent(StageRulesComponent);
    const saved: (readonly RuleView[])[] = [];
    fixture.componentRef.setInput('stage', 'implement');
    fixture.componentRef.setInput('owner', '/be');
    fixture.componentRef.setInput('rules', []);
    fixture.componentRef.setInput('labels', LABELS);
    fixture.componentRef.setInput('stageOrder', ['vision', 'implement', 'security', 'release', 'done']);
    fixture.componentRef.setInput('safetyStages', ['security']);
    fixture.componentRef.setInput('saving', false);
    fixture.componentRef.instance.save.subscribe((r) => saved.push(r));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    $(host, '[data-testid="rule-add-implement"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="rule-name"]', 'bypass');
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-type-0"]', 'route_to_stage');
    fixture.detectChanges();
    selectValue(host, '[data-testid="action-stage-0"]', 'release');
    fixture.detectChanges();
    expect(($(host, '[data-testid="rule-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="rule-draft-error"]').textContent ?? '').toMatch(/safety gate/i);
    expect(saved.length).toBe(0);
  });
});
