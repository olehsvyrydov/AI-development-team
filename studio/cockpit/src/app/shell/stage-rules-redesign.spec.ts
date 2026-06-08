import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { LabelDef, RuleView } from '../core/models';
import { StageRulesComponent } from './stage-rules.component';

const LABELS: LabelDef[] = [
  { name: 'TO_DEV_BE', settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/be', meaning: 'send back to backend dev' },
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
});
