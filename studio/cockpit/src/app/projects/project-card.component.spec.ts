import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('orders the calm signal hierarchy top-to-bottom: title → description → pulse → footer', async () => {
    const fixture = await mount(withRecord({ taskSummary: { open: 12, needsYou: 2 } }));
    const host = fixture.nativeElement as HTMLElement;
    const card = host.querySelector('[data-testid="project-card"]')!;
    const order = (sel: string) => Array.from(card.querySelectorAll('*')).indexOf(card.querySelector(sel)!);
    const title = order('.card__title');
    const desc = order('.card__desc');
    const pulse = order('[data-testid="pulse"]');
    const foot = order('.card__foot');
    expect(title).toBeGreaterThanOrEqual(0);
    expect(title).toBeLessThan(desc);
    expect(desc).toBeLessThan(pulse);
    expect(pulse).toBeLessThan(foot);
  });

  it('pairs the open count with a check glyph so it reads at a glance', async () => {
    const fixture = await mount(withRecord({ taskSummary: { open: 12, needsYou: 0 } }));
    const open = (fixture.nativeElement as HTMLElement).querySelector('.pulse__open')!;
    expect(open.textContent).toContain('12 open');
    expect(open.querySelector('svg')).toBeTruthy();
  });

  it('demotes connection + freshness to a single footer line ("connected · updated …")', async () => {
    const fixture = await mount(view());
    const foot = (fixture.nativeElement as HTMLElement).querySelector('.card__foot')!;
    expect(foot.textContent).toContain('connected');
    expect(foot.textContent).toContain('updated');
  });

  it('does not surface any knowledge count on the card (knowledge demoted off the card)', async () => {
    const v: ProjectView = {
      ...view(),
      state: { knowledge: { method: 'filename-only', stack: ['any'], counts: { project: 9, common: 0 }, docs: [] }, tickets: [] },
    };
    const host = (await mount(v)).nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('knowledge');
    expect(host.textContent).not.toContain('in knowledge');
  });

  it('marks the body as hydrated so the crossfade is gated and reduced-motion-safe', async () => {
    const fixture = await mount(view());
    const body = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="card-body"]')!;
    // Hydrated (profile present) bodies carry the data hook the crossfade animation reads; the
    // animation itself is zeroed by the reduced-motion media query in one place.
    expect(body.getAttribute('data-hydrated')).toBe('true');
  });

  it('marks an un-hydrated (record-only) body so it can skeleton, not pop', async () => {
    const fixture = await mount({ ...view(), profile: null, state: null });
    const body = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="card-body"]')!;
    expect(body.getAttribute('data-hydrated')).toBe('false');
  });
});

describe('ProjectCardComponent freshness', () => {
  async function mountWithFreshness(state: 'live' | 'idle' | 'stale' | 'offline', ageLabel: string) {
    TestBed.configureTestingModule({ imports: [ProjectCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProjectCardComponent);
    fixture.componentRef.setInput('view', view());
    fixture.componentRef.setInput('freshness', { state, ageLabel });
    fixture.detectChanges();
    return fixture;
  }

  it('renders the live state with a word and a ringed dot (shape + word, never colour alone)', async () => {
    const host = (await mountWithFreshness('live', '')).nativeElement as HTMLElement;
    const fresh = host.querySelector('[data-testid="freshness"]')!;
    expect(fresh.textContent).toContain('live');
    expect(fresh.getAttribute('data-state')).toBe('live');
  });

  it('renders the idle state with an aged relative word', async () => {
    const host = (await mountWithFreshness('idle', '4m ago')).nativeElement as HTMLElement;
    const fresh = host.querySelector('[data-testid="freshness"]')!;
    expect(fresh.getAttribute('data-state')).toBe('idle');
    expect(fresh.textContent).toContain('updated 4m ago');
  });

  it('renders the stale state with the warning word and a dashed-dot glyph', async () => {
    const host = (await mountWithFreshness('stale', '14m ago')).nativeElement as HTMLElement;
    const fresh = host.querySelector('[data-testid="freshness"]')!;
    expect(fresh.getAttribute('data-state')).toBe('stale');
    expect(fresh.textContent).toContain('stale');
    expect(fresh.textContent).toContain('14m ago');
    expect(fresh.querySelector('svg')).toBeTruthy();
  });

  it('renders the offline state with the offline word and a slashed-dot glyph', async () => {
    const host = (await mountWithFreshness('offline', '')).nativeElement as HTMLElement;
    const fresh = host.querySelector('[data-testid="freshness"]')!;
    expect(fresh.getAttribute('data-state')).toBe('offline');
    expect(fresh.textContent).toContain('offline');
    expect(fresh.querySelector('svg')).toBeTruthy();
  });

  it('falls back to the registry last-seen footer when no freshness input is supplied (degradation)', async () => {
    TestBed.configureTestingModule({ imports: [ProjectCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProjectCardComponent);
    fixture.componentRef.setInput('view', view());
    fixture.detectChanges();
    const foot = (fixture.nativeElement as HTMLElement).querySelector('.card__foot')!;
    expect(foot.textContent).toContain('updated');
    expect(foot.querySelector('[data-testid="freshness"]')).toBeNull();
  });

  it('does not wrap per-card freshness in a live region (freshness is visible-only, not announced)', async () => {
    const host = (await mountWithFreshness('stale', '14m ago')).nativeElement as HTMLElement;
    const fresh = host.querySelector('[data-testid="freshness"]')!;
    expect(fresh.getAttribute('aria-live')).toBeNull();
    expect(fresh.closest('[aria-live]')).toBeNull();
  });
});

describe('ProjectCardComponent live ring-pulse (one pulse per push)', () => {
  async function mountLive(pulseKey: number | null) {
    TestBed.configureTestingModule({ imports: [ProjectCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProjectCardComponent);
    fixture.componentRef.setInput('view', view());
    fixture.componentRef.setInput('freshness', { state: 'live', ageLabel: '' });
    fixture.componentRef.setInput('pulseKey', pulseKey);
    fixture.detectChanges();
    return fixture;
  }

  const ring = (fixture: ComponentFixture<ProjectCardComponent>) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(".fresh__solid[data-ring='true']");

  it('renders the ringed live dot keyed to the current push', async () => {
    const fixture = await mountLive(1000);
    const dot = ring(fixture);
    expect(dot).toBeTruthy();
    expect(dot!.getAttribute('data-pulse')).toBe('1000');
  });

  it('remounts the ring on each push so the keyframe replays (a new node per pulseKey)', async () => {
    const fixture = await mountLive(1000);
    const first = ring(fixture);
    expect(first).toBeTruthy();

    fixture.componentRef.setInput('pulseKey', 2000);
    fixture.detectChanges();
    const second = ring(fixture);

    expect(second).toBeTruthy();
    expect(second!.getAttribute('data-pulse')).toBe('2000');
    expect(second).not.toBe(first);
  });

  it('keeps the same ring node when the push key is unchanged (no spurious replay)', async () => {
    const fixture = await mountLive(1000);
    const first = ring(fixture);

    fixture.detectChanges();
    const second = ring(fixture);

    expect(second).toBe(first);
  });

  it('zeroes the ring-pulse under prefers-reduced-motion at the live-dot specificity', () => {
    const src = readFileSync(join(__dirname, 'project-card.component.ts'), 'utf8');
    const reduced = src.slice(src.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain(".fresh[data-state='live']");
    expect(reduced).toMatch(/animation:\s*none/);
  });
});
