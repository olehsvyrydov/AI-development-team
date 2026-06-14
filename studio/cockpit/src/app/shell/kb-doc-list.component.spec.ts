import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlPlaneService } from '../core/control-plane.service';
import type { KbSearchInput } from '../core/control-plane.service';
import type { KnowledgeDoc, KnowledgeSearchOutcome } from '../core/models';
import { KbDocListComponent } from './kb-doc-list.component';
import { settle } from '../testing/settle';

/**
 * A controllable stand-in for the real control-plane read. It records every {@link searchKb} call
 * and answers from a queue so a test can assert WHAT was searched and HOW the component renders a
 * full-text / filename-only / unavailable outcome — without a live HTTP backend.
 */
class FakeControlPlane {
  readonly calls: KbSearchInput[] = [];
  next: (KnowledgeSearchOutcome | null)[] = [];

  searchKb(input: KbSearchInput): Promise<KnowledgeSearchOutcome | null> {
    this.calls.push(input);
    const out = this.next.length ? this.next.shift()! : null;
    return Promise.resolve(out);
  }
}

const DOCS: readonly KnowledgeDoc[] = [
  { name: 'coding-style', file: 'docs/coding-style.md', scope: 'project', stack: ['java'], kind: 'style', index: 'indexed', excerpt: 'tabs vs spaces' },
  { name: 'webhook-retry', file: 'docs/webhook-retry.md', scope: 'project', stack: ['java'], kind: 'pattern', index: 'indexed', excerpt: 'how we resend' },
  { name: 'commit-trailer', file: 'commit-trailer.md', scope: 'common', stack: ['any'], kind: 'rule', index: 'indexed', excerpt: 'sign your commits' },
];

function mount(): { fixture: ComponentFixture<KbDocListComponent>; host: HTMLElement; cp: FakeControlPlane } {
  const cp = new FakeControlPlane();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [KbDocListComponent],
    providers: [{ provide: ControlPlaneService, useValue: cp }],
  });
  const fixture = TestBed.createComponent(KbDocListComponent);
  fixture.componentRef.setInput('docs', DOCS);
  fixture.componentRef.setInput('method', 'filename-only');
  fixture.componentRef.setInput('counts', { project: 2, common: 1 });
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, cp };
}

function rowNames(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('[data-testid="knowledge-doc"]')).map((r) => r.textContent ?? '');
}

function typeSearch(fixture: ComponentFixture<KbDocListComponent>, host: HTMLElement, value: string): void {
  const input = host.querySelector('[data-testid="kb-search"]') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('KbDocListComponent full-text search', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the server full-text results (ranked) for a body-only term, not the client filter', async () => {
    const { fixture, host, cp } = mount();
    cp.next = [{
      method: 'full-text',
      query: 'idempotent',
      scope: 'project',
      results: [
        { name: 'webhook-retry', file: 'docs/webhook-retry.md', scope: 'project', score: 9, excerpt: 'idempotent resend' },
        { name: 'coding-style', file: 'docs/coding-style.md', scope: 'project', score: 2, excerpt: 'idempotent helpers' },
      ],
    }];
    // "idempotent" appears in NO title/excerpt of the loaded docs — a client-only filter finds nothing.
    typeSearch(fixture, host, 'idempotent');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();

    expect(cp.calls.at(-1)).toMatchObject({ query: 'idempotent', scope: 'project' });
    const names = rowNames(host);
    expect(names.join(' ')).toMatch(/webhook-retry/);
    expect(names.join(' ')).toMatch(/coding-style/);
    // Ranked order: the server's order is preserved (webhook-retry before coding-style).
    expect(names.findIndex((n) => /webhook-retry/.test(n))).toBeLessThan(names.findIndex((n) => /coding-style/.test(n)));
  });

  it('debounces — one settled search per pause, not one per keystroke', async () => {
    const { fixture, host, cp } = mount();
    cp.next = [{ method: 'full-text', query: 'retry', scope: 'project', results: [] }];
    typeSearch(fixture, host, 'r');
    typeSearch(fixture, host, 're');
    typeSearch(fixture, host, 'ret');
    typeSearch(fixture, host, 'retry');
    await vi.advanceTimersByTimeAsync(250);
    expect(cp.calls.length).toBe(1);
    expect(cp.calls[0].query).toBe('retry');
  });

  it('shows the normal doc list (no search call) when the query is empty', async () => {
    const { fixture, host, cp } = mount();
    typeSearch(fixture, host, '   ');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(cp.calls.length).toBe(0);
    // Default scope = project → the two project docs show via the client list.
    const names = rowNames(host);
    expect(names.join(' ')).toMatch(/coding-style/);
    expect(names.join(' ')).toMatch(/webhook-retry/);
  });

  it('falls back to the client-side title+excerpt filter when the search is unavailable (never blank, no error)', async () => {
    const { fixture, host, cp } = mount();
    cp.next = [null];
    typeSearch(fixture, host, 'resend');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    // The server is unavailable, but "resend" matches the webhook-retry excerpt client-side.
    const names = rowNames(host);
    expect(names.join(' ')).toMatch(/webhook-retry/);
    expect(names.join(' ')).not.toMatch(/coding-style/);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('reflects the method honestly — full-text over bodies vs filename/excerpt', async () => {
    const { fixture, host, cp } = mount();
    cp.next = [{ method: 'full-text', query: 'retry', scope: 'project', results: [{ name: 'webhook-retry', scope: 'project' }] }];
    typeSearch(fixture, host, 'retry');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="base-method"]')?.textContent).toMatch(/full[- ]text|note bodies/i);

    cp.next = [{ method: 'filename-only', query: 'retry', scope: 'project', results: [{ name: 'webhook-retry', scope: 'project' }] }];
    typeSearch(fixture, host, 'retryx');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    const line = host.querySelector('[data-testid="base-method"]')?.textContent ?? '';
    expect(line).toMatch(/filename|excerpt/i);
    expect(line).not.toMatch(/full[- ]text/i);
  });

  it('announces the settled result count via a polite live region, once (not per keystroke)', async () => {
    const { fixture, host, cp } = mount();
    cp.next = [{ method: 'full-text', query: 'retry', scope: 'project', results: [{ name: 'webhook-retry', scope: 'project' }] }];
    typeSearch(fixture, host, 'r');
    typeSearch(fixture, host, 're');
    typeSearch(fixture, host, 'retry');
    // Before the debounce settles, the live region has NOT churned per keystroke.
    const live = host.querySelector('[data-testid="kb-search-status"]') as HTMLElement;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent?.trim()).toBe('');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(live.textContent ?? '').toMatch(/1\s+(note|result)/i);
  });

  it('re-runs the search for the new scope when scope changes with an active query', async () => {
    const { fixture, host, cp } = mount();
    cp.next = [
      { method: 'full-text', query: 'retry', scope: 'project', results: [{ name: 'webhook-retry', scope: 'project' }] },
      { method: 'full-text', query: 'retry', scope: 'common', results: [{ name: 'commit-trailer', scope: 'common' }] },
    ];
    typeSearch(fixture, host, 'retry');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    (host.querySelector('[data-testid="knowledge-scope-common"]') as HTMLElement).click();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(cp.calls.map((c) => c.scope)).toEqual(['project', 'common']);
    expect(rowNames(host).join(' ')).toMatch(/commit-trailer/);
  });

  it('renders no absolute filesystem path from a result row', async () => {
    const { fixture, host, cp } = mount();
    cp.next = [{
      method: 'full-text',
      query: 'retry',
      scope: 'project',
      results: [{ name: 'webhook-retry', file: 'docs/webhook-retry.md', scope: 'project', excerpt: 'resend safely' }],
    }];
    typeSearch(fixture, host, 'retry');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    const list = host.querySelector('[data-testid="kb-doc-list"]')?.textContent ?? '';
    expect(list).not.toMatch(/\/home\/|\/Users\/|^\/|[A-Za-z]:\\/);
  });
});
