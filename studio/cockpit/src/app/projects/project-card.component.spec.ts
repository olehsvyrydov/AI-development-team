import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ProjectCardComponent } from './project-card.component';
import type { ProjectView } from '../core/models';

function view(over: Partial<ProjectView['profile']> = {}): ProjectView {
  return {
    record: { id: 'aaaaaaaaaaaa', path: '/p', label: 'fallback-label', addedAt: 't', lastSeen: '2026-06-01T00:00:00.000Z', status: 'connected' },
    profile: { title: 'payments-api', description: 'VAT-aware billing service.', ...over },
    state: null,
  };
}

function withRecord(over: Partial<ProjectView['record']>): ProjectView {
  const base = view();
  return { ...base, record: { ...base.record, ...over } };
}

async function mount(v: ProjectView): Promise<ComponentFixture<ProjectCardComponent>> {
  TestBed.configureTestingModule({
    imports: [ProjectCardComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(ProjectCardComponent);
  fixture.componentRef.setInput('view', v);
  fixture.detectChanges();
  return fixture;
}

describe('ProjectCardComponent', () => {
  it('shows the title, description and a status indicator', async () => {
    const fixture = await mount(view());
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('payments-api');
    expect(host.textContent).toContain('VAT-aware billing service.');
    expect(host.querySelector('[data-testid="status"]')).toBeTruthy();
  });

  it('falls back to the registry label when no profile title is present', async () => {
    const fixture = await mount({ ...view(), profile: null });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('fallback-label');
  });

  it('links into the project shell by id', async () => {
    const fixture = await mount(view());
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[data-testid="project-card"]')!;
    expect(link.getAttribute('href')).toContain('/projects/aaaaaaaaaaaa');
  });

  it('exposes an accessible name for the card link', async () => {
    const fixture = await mount(view());
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[data-testid="project-card"]')!;
    expect(link.getAttribute('aria-label')).toContain('payments-api');
  });

  it('shows a needs-you pulse with the count when needsYou > 0', async () => {
    const fixture = await mount(withRecord({ taskSummary: { open: 12, needsYou: 2 } }));
    const pulse = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="needs-you"]');
    expect(pulse).toBeTruthy();
    expect(pulse!.textContent).toContain('2 need you');
  });

  it('hides the needs-you pulse when needsYou is 0 (no "0 need you")', async () => {
    const fixture = await mount(withRecord({ taskSummary: { open: 12, needsYou: 0 } }));
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="needs-you"]')).toBeNull();
    expect(host.textContent).not.toContain('need you');
  });

  it('omits the needs-you pulse entirely when the summary is absent (absent-not-zero)', async () => {
    const fixture = await mount(view());
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="needs-you"]')).toBeNull();
    expect(host.textContent).not.toContain('need you');
  });

  it('shows the open-task count when a summary is present', async () => {
    const fixture = await mount(withRecord({ taskSummary: { open: 12, needsYou: 0 } }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('12 open');
  });

  it('shows a "Security-reviewed" governance badge when the security gate has passed', async () => {
    const v: ProjectView = {
      ...view(),
      state: { tickets: [{ stage: 'security', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' }] }] },
    };
    const badge = (await mount(v)).nativeElement.querySelector('[data-testid="governance-badge"]') as HTMLElement | null;
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain('Security-reviewed');
    expect(badge!.getAttribute('title')).toContain('security gate ran and approved');
  });

  it('shows a danger "blocked at {stage}" badge when a hard gate is rejected', async () => {
    const v: ProjectView = {
      ...view(),
      state: { tickets: [{ stage: 'security', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }] }] },
    };
    const badge = (await mount(v)).nativeElement.querySelector('[data-testid="governance-badge"]') as HTMLElement | null;
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain('blocked at security');
  });

  it('shows no governance badge by default (never a default decoration)', async () => {
    const fixture = await mount(view());
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="governance-badge"]')).toBeNull();
  });

  it('renders a long hyphenated title as a single text node, not split into fragments', async () => {
    const fixture = await mount(view({ title: 'AI-development-team' }));
    const title = (fixture.nativeElement as HTMLElement).querySelector('.card__title')!;
    expect(title.textContent?.trim()).toBe('AI-development-team');
    // The full title is available even when visually clamped.
    expect(title.getAttribute('title')).toBe('AI-development-team');
  });

  it('keeps the title off the badge\'s flex row so the badge never squeezes the title', async () => {
    const v: ProjectView = {
      ...view({ title: 'AI-development-team' }),
      state: { tickets: [{ stage: 'security', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' }] }] },
    };
    const host = (await mount(v)).nativeElement as HTMLElement;
    const title = host.querySelector('.card__title')!;
    const badge = host.querySelector('[data-testid="governance-badge"]')!;
    expect(title).toBeTruthy();
    expect(badge).toBeTruthy();
    // The badge must not be a direct sibling competing for width in the same row as the title.
    expect(title.parentElement).not.toBe(badge.parentElement);
  });
});
