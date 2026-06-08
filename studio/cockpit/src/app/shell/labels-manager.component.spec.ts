import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { LabelDef } from '../core/models';
import type { LabelSpec } from '../core/control-plane.service';
import { LabelsManagerComponent } from './labels-manager.component';

const LABELS: LabelDef[] = [
  { name: 'TO_DEV_BE', settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/be', meaning: 'send back to backend dev' },
  { name: 'NEEDS_DESIGN', settableBy: ['*'], routesTo: null, owner: null, meaning: 'design rework' },
];

const STAGES = ['vision', 'implement', 'design', 'code_review', 'done'];
const OWNERS = ['/po', '/ba', '/arch', '/secops', '/ui', '/fe', '/be', '/rev', '/qa', '/e2e', '/verify'];

function mount(labels: readonly LabelDef[] = LABELS): {
  fixture: ComponentFixture<LabelsManagerComponent>;
  host: HTMLElement;
  saved: Record<string, LabelSpec>[];
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [LabelsManagerComponent] });
  const fixture = TestBed.createComponent(LabelsManagerComponent);
  const saved: Record<string, LabelSpec>[] = [];
  fixture.componentRef.setInput('labels', labels);
  fixture.componentRef.setInput('stages', STAGES);
  fixture.componentRef.setInput('owners', OWNERS);
  fixture.componentRef.setInput('saving', false);
  fixture.componentRef.instance.save.subscribe((m) => saved.push(m));
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, saved };
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

describe('LabelsManagerComponent — list', () => {
  it('renders each existing label as a row with its name, route, settable-by and meaning', () => {
    const { host } = mount();
    expect($(host, '[data-testid="label-row-TO_DEV_BE"]')).toBeTruthy();
    const row = $(host, '[data-testid="label-row-TO_DEV_BE"]');
    expect(row.textContent).toContain('TO_DEV_BE');
    expect(row.textContent).toContain('implement');
    expect(row.textContent).toContain('/rev');
    expect(row.textContent).toContain('send back to backend dev');
  });

  it('shows the real count, never a fabricated zero', () => {
    const { host } = mount();
    expect($(host, '[data-testid="labels-count"]').textContent).toContain('2');
  });

  it('renders a label with no route as a flag (no router), and `*` as anyone', () => {
    const { host } = mount();
    const row = $(host, '[data-testid="label-row-NEEDS_DESIGN"]');
    expect(row.textContent?.toLowerCase()).toContain('no route');
    expect(row.textContent?.toLowerCase()).toContain('anyone');
  });
});

describe('LabelsManagerComponent — empty state + starters', () => {
  it('teaches with an empty state and a create button when there are no labels', () => {
    const { host } = mount([]);
    expect($(host, '[data-testid="labels-empty"]')).toBeTruthy();
    expect($(host, '[data-testid="labels-empty"]').textContent).toContain('TO_DEV_BE');
    expect($(host, '[data-testid="label-create-first"]')).toBeTruthy();
  });

  it('one-click TO_DEV_BE starter pre-fills the form with a routing label settable by /rev', () => {
    const { host, fixture } = mount([]);
    $(host, '[data-testid="label-starter-TO_DEV_BE"]').click();
    fixture.detectChanges();
    expect(($(host, '[data-testid="label-name"]') as HTMLInputElement).value).toBe('TO_DEV_BE');
    // settable_by chips for /rev are pre-checked
    const revChip = $(host, '[data-testid="settable-chip-/rev"]') as HTMLInputElement;
    expect(revChip.checked).toBe(true);
  });

  it('saving the TO_DEV_BE starter emits the complete label map carrying the new label', () => {
    const { host, fixture, saved } = mount([]);
    $(host, '[data-testid="label-starter-TO_DEV_BE"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="label-save"]').click();
    expect(saved.length).toBe(1);
    expect(saved[0]['TO_DEV_BE']).toBeTruthy();
    expect(saved[0]['TO_DEV_BE'].settable_by).toContain('/rev');
    expect(saved[0]['TO_DEV_BE'].routes_to).toBe('implement');
  });
});

describe('LabelsManagerComponent — create', () => {
  it('creating a label posts the complete map (existing + new) keyed by name', () => {
    const { host, fixture, saved } = mount();
    $(host, '[data-testid="label-new"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="label-name"]', 'READY_FOR_QA');
    fixture.detectChanges();
    // pick a specific agent
    ($(host, '[data-testid="settable-chip-/rev"]') as HTMLInputElement).click();
    fixture.detectChanges();
    $(host, '[data-testid="label-save"]').click();
    expect(saved.length).toBe(1);
    const map = saved[0];
    expect(Object.keys(map).sort()).toEqual(['NEEDS_DESIGN', 'READY_FOR_QA', 'TO_DEV_BE']);
    expect(map['READY_FOR_QA'].settable_by).toEqual(['/rev']);
  });

  it('the "anyone" choice writes settable_by ["*"]', () => {
    const { host, fixture, saved } = mount([]);
    $(host, '[data-testid="label-create-first"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="label-name"]', 'NEEDS_HUMAN');
    $(host, '[data-testid="settable-mode-anyone"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="label-save"]').click();
    expect(saved[0]['NEEDS_HUMAN'].settable_by).toEqual(['*']);
  });

  it('disables Save with an inline reason when the name is empty', () => {
    const { host, fixture } = mount([]);
    $(host, '[data-testid="label-create-first"]').click();
    fixture.detectChanges();
    ($(host, '[data-testid="settable-chip-/rev"]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(($(host, '[data-testid="label-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="label-draft-error"]').textContent?.toLowerCase()).toContain('name');
  });

  it('disables Save when "specific agents" is chosen but none are selected', () => {
    const { host, fixture } = mount([]);
    $(host, '[data-testid="label-create-first"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="label-name"]', 'X');
    fixture.detectChanges();
    expect(($(host, '[data-testid="label-save"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('rejects a duplicate name (case-insensitive)', () => {
    const { host, fixture } = mount();
    $(host, '[data-testid="label-new"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="label-name"]', 'to_dev_be');
    ($(host, '[data-testid="settable-chip-/rev"]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(($(host, '[data-testid="label-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect($(host, '[data-testid="label-draft-error"]').textContent?.toLowerCase()).toContain('already');
  });
});

describe('LabelsManagerComponent — edit + delete', () => {
  it('editing a label keeps it in the map under a (possibly new) key with updated fields', () => {
    const { host, fixture, saved } = mount();
    $(host, '[data-testid="label-edit-TO_DEV_BE"]').click();
    fixture.detectChanges();
    setInput(host, '[data-testid="label-meaning"]', 'updated meaning');
    $(host, '[data-testid="label-save"]').click();
    expect(saved[0]['TO_DEV_BE'].meaning).toBe('updated meaning');
    // unchanged sibling preserved
    expect(saved[0]['NEEDS_DESIGN']).toBeTruthy();
  });

  it('deleting a label emits the map without it, after a confirm', () => {
    const { host, fixture, saved } = mount();
    $(host, '[data-testid="label-delete-TO_DEV_BE"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="label-delete-confirm-TO_DEV_BE"]').click();
    expect(saved.length).toBe(1);
    expect('TO_DEV_BE' in saved[0]).toBe(false);
    expect('NEEDS_DESIGN' in saved[0]).toBe(true);
  });
});

describe('LabelsManagerComponent — escaping', () => {
  it('renders an injection-shaped label name/meaning as escaped text, never markup', () => {
    const nasty: LabelDef[] = [
      { name: 'X_LABEL', settableBy: ['/rev'], routesTo: null, owner: null, meaning: '<img src=x onerror=alert(1)>' },
    ];
    const { host } = mount(nasty);
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
