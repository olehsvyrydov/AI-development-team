import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkflowPanelComponent } from './workflow-panel.component';
import type { WorkflowView } from '../core/models';

function mount(workflow: WorkflowView | null): ComponentFixture<WorkflowPanelComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [WorkflowPanelComponent] });
  const fixture = TestBed.createComponent(WorkflowPanelComponent);
  fixture.componentRef.setInput('workflow', workflow);
  fixture.detectChanges();
  return fixture;
}

const FULL: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
    { stage: 'design', owner: '/ui', gate: { name: 'DESIGN_APPROVED', refusal: 'soft' } },
    { stage: 'done', owner: null, gate: null },
  ],
};

describe('WorkflowPanelComponent', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = mount(FULL).nativeElement as HTMLElement;
  });

  it('renders one chip per stage showing the stage name and its owner role', () => {
    const chips = host.querySelectorAll('[data-testid="stage-chip"]');
    expect(chips.length).toBe(4);
    const text = host.textContent ?? '';
    expect(text).toContain('vision');
    expect(text).toContain('/po');
    expect(text).toContain('architecture');
    expect(text).toContain('/arch');
  });

  it('shows the active track', () => {
    expect(host.textContent).toMatch(/full/);
  });

  it('encodes a HARD gate with a solid shield stroke and a SOFT gate with a dashed stroke', () => {
    const hard = host.querySelector('[data-testid="gate-architecture"] svg [data-gate-shape]')
      ?? host.querySelector('[data-testid="gate-architecture"] [data-gate-shape]');
    const soft = host.querySelector('[data-testid="gate-design"] [data-gate-shape]');
    expect(hard).toBeTruthy();
    expect(soft).toBeTruthy();
    // Hard = solid (no dasharray); soft = dashed. Shape carries the distinction, not colour.
    expect(hard!.getAttribute('stroke-dasharray')).toBeNull();
    expect(soft!.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('marks the hard vs soft distinction with a data attribute too (testable + self-describing)', () => {
    expect(host.querySelector('[data-testid="gate-architecture"]')?.getAttribute('data-refusal')).toBe('hard');
    expect(host.querySelector('[data-testid="gate-design"]')?.getAttribute('data-refusal')).toBe('soft');
  });

  it('does not render a gate marker for a stage without a gate', () => {
    expect(host.querySelector('[data-testid="gate-vision"]')).toBeNull();
    expect(host.querySelector('[data-testid="gate-done"]')).toBeNull();
  });

  it('draws connector arrows between consecutive stages', () => {
    expect(host.querySelectorAll('[data-testid="stage-connector"]').length).toBe(3);
  });

  it('provides a screen-reader ordered-list text alternative of the flow including gate hardness', () => {
    const alt = host.querySelector('[data-testid="workflow-alt"]')!;
    expect(alt.tagName.toLowerCase()).toBe('ol');
    const items = [...alt.querySelectorAll('li')].map((li) => li.textContent?.trim() ?? '');
    expect(items.length).toBe(4);
    expect(items[0]).toMatch(/vision \(\/po\)/);
    expect(items[1]).toMatch(/architecture \(\/arch, hard gate\)/);
    expect(items[2]).toMatch(/design \(\/ui, soft gate\)/);
  });

  it('shows the default-solo message when no workflow resolved', () => {
    const empty = mount(null).nativeElement as HTMLElement;
    expect(empty.textContent).toContain('Using the default solo workflow.');
    const emptyStages = mount({ activeTrack: null, stages: [] }).nativeElement as HTMLElement;
    expect(emptyStages.textContent).toContain('Using the default solo workflow.');
  });

  it('offers a footer affordance to the full workflow', () => {
    expect(host.querySelector('[data-testid="workflow-full-link"]')?.textContent).toMatch(/View full workflow/i);
  });

  it('renders the full-workflow affordance as inert (no navigation) while the view does not exist yet', () => {
    const el = host.querySelector('[data-testid="workflow-full-link"]')!;
    expect(el.hasAttribute('routerLink')).toBe(false);
    const href = el.getAttribute('href');
    expect(href === null || href === '' || href === '#').toBe(true);
    const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
    expect(disabled).toBe(true);
    expect(el.getAttribute('aria-label') ?? el.textContent ?? '').toMatch(/coming soon/i);
  });
});
