import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TasksPanelComponent } from './tasks-panel.component';
import type { TaskSummary } from '../core/models';

function mount(summary: TaskSummary | null): ComponentFixture<TasksPanelComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [TasksPanelComponent] });
  const fixture = TestBed.createComponent(TasksPanelComponent);
  fixture.componentRef.setInput('summary', summary);
  fixture.detectChanges();
  return fixture;
}

const FULL: TaskSummary = {
  total: 14,
  byStatus: { in_progress: 8, waiting: 0, needsYou: 2, blocked: 1, done: 3 },
};

describe('TasksPanelComponent', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = mount(FULL).nativeElement as HTMLElement;
  });

  it('shows the total as a headline count', () => {
    expect(host.querySelector('[data-testid="tasks-total"]')?.textContent).toContain('14');
  });

  it('renders a count for each status with its label text (colour is never the only signal)', () => {
    const text = host.textContent ?? '';
    expect(text).toMatch(/8\s*in progress/i);
    expect(text).toMatch(/2\s*need you/i);
    expect(text).toMatch(/1\s*blocked/i);
    expect(text).toMatch(/3\s*done/i);
  });

  it('pairs every status count with an inline-SVG glyph (glyph + text, not colour alone)', () => {
    const inProgress = host.querySelector('[data-testid="count-in_progress"]')!;
    expect(inProgress.querySelector('svg')).toBeTruthy();
    expect(host.querySelector('[data-testid="count-needsYou"] svg')).toBeTruthy();
    expect(host.querySelector('[data-testid="count-blocked"] svg')).toBeTruthy();
    expect(host.querySelector('[data-testid="count-done"] svg')).toBeTruthy();
  });

  it('draws a decorative proportion bar whose segments carry the numbers as aria-labels', () => {
    const bar = host.querySelector('[data-testid="tasks-bar"]')!;
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    const labels = [...bar.querySelectorAll('[aria-label]')].map((s) => s.getAttribute('aria-label') ?? '');
    expect(labels.some((l) => /in progress/i.test(l) && /8/.test(l))).toBe(true);
    expect(labels.some((l) => /done/i.test(l) && /3/.test(l))).toBe(true);
  });

  it('shows the empty invitation (no zeros grid) when there are no tasks', () => {
    const empty = mount({ total: 0, byStatus: { in_progress: 0, waiting: 0, needsYou: 0, blocked: 0, done: 0 } });
    const el = empty.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No tasks yet — the team will create them as work starts.');
    expect(el.querySelector('[data-testid="tasks-bar"]')).toBeNull();
  });

  it('shows the empty invitation when the summary is absent (not a fabricated grid of zeros)', () => {
    const absent = mount(null);
    const el = absent.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No tasks yet — the team will create them as work starts.');
  });

  it('offers an entry point to the board', () => {
    expect(host.querySelector('[data-testid="tasks-open-board"]')?.textContent).toMatch(/Open board/i);
  });

  it('renders the board affordance as inert (no navigation) while the board view does not exist yet', () => {
    const el = host.querySelector('[data-testid="tasks-open-board"]')!;
    expect(el.hasAttribute('routerLink')).toBe(false);
    const href = el.getAttribute('href');
    expect(href === null || href === '' || href === '#').toBe(true);
    const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
    expect(disabled).toBe(true);
    expect(el.getAttribute('aria-label') ?? el.textContent ?? '').toMatch(/coming soon/i);
  });
});
