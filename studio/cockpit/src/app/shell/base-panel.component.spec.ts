import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BasePanelComponent } from './base-panel.component';
import type { BaseView } from '../core/models';

function mount(base: BaseView | null): ComponentFixture<BasePanelComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [BasePanelComponent] });
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

  it('offers an Add documents invitation that does not pretend to write or navigate away', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    const add = host.querySelector('[data-testid="base-add"]')!;
    expect(add).toBeTruthy();
    expect(add.textContent).toMatch(/Add documents/i);
    // No write endpoint this slice: the control neither submits nor navigates.
    expect(add.getAttribute('type')).not.toBe('submit');
    expect(add.hasAttribute('routerLink')).toBe(false);
    const href = add.getAttribute('href');
    expect(href === null || href === '' || href === '#').toBe(true);
    const disabled = add.hasAttribute('disabled') || add.getAttribute('aria-disabled') === 'true';
    expect(disabled).toBe(true);
    expect(add.getAttribute('aria-label') ?? add.textContent ?? '').toMatch(/coming soon/i);
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
