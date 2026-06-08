import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import { BasePanelComponent } from './base-panel.component';
import { settle } from '../testing/settle';
import type { BaseView, ProjectState } from '../core/models';

function mount(base: BaseView | null): ComponentFixture<BasePanelComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BasePanelComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(BasePanelComponent);
  fixture.componentRef.setInput('base', base);
  fixture.detectChanges();
  return fixture;
}

const SEMANTIC: BaseView = {
  method: 'local-embeddings',
  counts: { indexed: 8, indexing: 1, failed: 2 },
  docs: [
    { name: 'code-rules', file: 'docs/code-rules.md', index: 'indexed' },
    { name: 'test-policy', file: 'docs/test-policy.md', index: 'indexed' },
  ],
};

const FILENAME_ONLY: BaseView = {
  method: 'filename-only',
  counts: { indexed: 3, indexing: 0, failed: 0 },
  docs: [{ name: 'readme', index: 'indexed' }],
};

describe('BasePanelComponent', () => {
  it('headlines the document count', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="base-count"]')?.textContent).toMatch(/11\s*docs/);
  });

  it('shows the indexed / indexing / failed breakdown with glyphs and numbers', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    const text = host.textContent ?? '';
    expect(text).toMatch(/8\s*indexed/i);
    expect(text).toMatch(/1\s*indexing/i);
    expect(text).toMatch(/2\s*failed/i);
    expect(host.querySelector('[data-testid="base-indexed"] svg')).toBeTruthy();
    expect(host.querySelector('[data-testid="base-failed"] svg')).toBeTruthy();
  });

  it('states the honest method line for local embeddings', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="base-method"]')?.textContent?.trim())
      .toBe('Indexed via: local embeddings (semantic)');
  });

  it('states the honest method line when only filenames are indexed', () => {
    const host = mount(FILENAME_ONLY).nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="base-method"]')?.textContent?.trim())
      .toBe('Filename index only — connect an embedder for semantic recall');
  });

  it('lists a few representative documents', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    const text = host.textContent ?? '';
    expect(text).toContain('code-rules');
    expect(text).toContain('test-policy');
  });

  it('offers a live Add control that opens the add-note form (no longer "coming soon")', () => {
    const fixture = mount(SEMANTIC);
    const host = fixture.nativeElement as HTMLElement;
    const add = host.querySelector('[data-testid="base-add"]') as HTMLButtonElement;
    expect(add).toBeTruthy();
    expect(add.textContent).toMatch(/Add a note|Add documents/i);
    expect(add.disabled).toBe(false);
    expect(add.getAttribute('aria-disabled')).not.toBe('true');
    expect((add.getAttribute('aria-label') ?? '') + (add.textContent ?? '')).not.toMatch(/coming soon/i);
    // No form until opened.
    expect(host.querySelector('dart-add-note-form')).toBeNull();
    add.click();
    fixture.detectChanges();
    expect(host.querySelector('dart-add-note-form')).toBeTruthy();
    expect(host.querySelector('[data-testid="note-title"]')).toBeTruthy();
  });

  it('closing the form (cancel) returns to the closed Base panel', () => {
    const fixture = mount(SEMANTIC);
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('[data-testid="base-add"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="note-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('dart-add-note-form')).toBeNull();
  });

  it('re-emits the form\'s applied state up to the shell so count/list can refresh', async () => {
    const fixture = mount(SEMANTIC);
    const host = fixture.nativeElement as HTMLElement;
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    (host.querySelector('[data-testid="base-add"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const title = host.querySelector('[data-testid="note-title"]') as HTMLInputElement;
    title.value = 'A new note';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (host.querySelector('[data-testid="note-submit"]') as HTMLButtonElement).click();
    const http = TestBed.inject(HttpTestingController);
    const next: ProjectState = { rev: 'r2', base: { method: 'local-embeddings', counts: { indexed: 12, indexing: 1, failed: 2 }, docs: [{ name: 'a-new-note', index: 'indexed' }] } };
    http.expectOne('/api/kb/add').flush({ ok: true, doc: { name: 'a-new-note', file: 'docs/a-new-note.md' }, state: next });
    await settle(fixture);
    expect(applied).not.toBeNull();
    expect((applied as unknown as ProjectState).base?.counts.indexed).toBe(12);
  });

  it('offers a Manage base entry point', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="base-manage"]')?.textContent).toMatch(/Manage base/i);
  });

  it('renders the Manage base affordance as inert (no navigation) while that view does not exist yet', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    const el = host.querySelector('[data-testid="base-manage"]')!;
    expect(el.hasAttribute('routerLink')).toBe(false);
    const href = el.getAttribute('href');
    expect(href === null || href === '' || href === '#').toBe(true);
    const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
    expect(disabled).toBe(true);
    expect(el.getAttribute('aria-label') ?? el.textContent ?? '').toMatch(/coming soon/i);
  });

  it('shows the empty invitation plus an Add button when there is no knowledge yet', () => {
    const host = mount({ method: 'filename-only', counts: { indexed: 0, indexing: 0, failed: 0 }, docs: [] })
      .nativeElement as HTMLElement;
    expect(host.textContent).toContain('No knowledge yet — add the rules and context your team must follow.');
    expect(host.querySelector('[data-testid="base-add"]')).toBeTruthy();
  });

  it('treats an absent base view as empty', () => {
    const host = mount(null).nativeElement as HTMLElement;
    expect(host.textContent).toContain('No knowledge yet — add the rules and context your team must follow.');
  });

  it('escapes untrusted document names rather than injecting markup (XSS guard)', () => {
    const host = mount({
      method: 'local-embeddings',
      counts: { indexed: 1, indexing: 0, failed: 0 },
      docs: [{ name: '<img src=x onerror="window.__xssBase=1">', index: 'indexed' }],
    }).nativeElement as HTMLElement;
    expect(host.querySelectorAll('img[onerror]').length).toBe(0);
    expect((window as unknown as Record<string, unknown>)['__xssBase']).toBeUndefined();
  });
});
