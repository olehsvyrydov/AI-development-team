import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import { BasePanelComponent } from './base-panel.component';
import { settle } from '../testing/settle';
import type { KnowledgeView, ProjectState } from '../core/models';

function mount(base: KnowledgeView | null): ComponentFixture<BasePanelComponent> {
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

const MERGED: KnowledgeView = {
  method: 'filename-only',
  stack: ['java'],
  counts: { project: 2, common: 1 },
  docs: [
    { name: 'coding-style', file: 'docs/coding-style.md', scope: 'project', stack: ['java'], kind: 'style', index: 'indexed' },
    { name: 'webhook-retry', file: 'docs/webhook-retry.md', scope: 'project', stack: ['java'], kind: 'pattern', index: 'indexed' },
    { name: 'commit-trailer', file: 'commit-trailer.md', scope: 'common', stack: ['any'], kind: 'rule', index: 'indexed' },
  ],
};

const SEMANTIC: KnowledgeView = {
  method: 'local-embeddings',
  stack: ['python'],
  counts: { project: 1, common: 0 },
  docs: [{ name: 'pep8', scope: 'project', stack: ['python'], kind: 'style', index: 'indexed' }],
};

function text(host: HTMLElement): string {
  return host.textContent ?? '';
}

function scopeButton(host: HTMLElement, scope: string): HTMLElement {
  return host.querySelector(`[data-testid="knowledge-scope-${scope}"]`) as HTMLElement;
}

function docRows(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll('[data-testid="knowledge-doc"]')) as HTMLElement[];
}

describe('Knowledge panel', () => {
  it('is titled "Knowledge", not "Base"', () => {
    const host = mount(MERGED).nativeElement as HTMLElement;
    const title = host.querySelector('[data-testid="knowledge-title"]') ?? host.querySelector('h2');
    expect(title?.textContent).toMatch(/Knowledge/);
    expect(title?.textContent).not.toMatch(/\bBase\b/);
  });

  it('headlines the total document count', () => {
    const host = mount(MERGED).nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="base-count"]')?.textContent).toMatch(/3\s*docs/);
  });

  it('states the honest method line when only filenames are indexed', () => {
    const host = mount(MERGED).nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="base-method"]')?.textContent?.trim())
      .toBe('Filename index only — connect an embedder for semantic recall');
  });

  it('states the honest semantic method line when an embedder is wired', () => {
    const host = mount(SEMANTIC).nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="base-method"]')?.textContent?.trim())
      .toBe('Indexed via: local embeddings (semantic)');
  });

  it('shows the honest local-first line, scoping Common to this machine (never a cloud)', () => {
    const host = mount(MERGED).nativeElement as HTMLElement;
    const t = text(host);
    expect(t).toMatch(/nothing is uploaded/i);
    expect(t).not.toMatch(/cloud/i);
  });

  it('offers a scope toggle as a radiogroup with This project and Common, showing per-scope counts', () => {
    const host = mount(MERGED).nativeElement as HTMLElement;
    const group = host.querySelector('[role="radiogroup"]');
    expect(group).toBeTruthy();
    const project = scopeButton(host, 'project');
    const common = scopeButton(host, 'common');
    expect(project.getAttribute('role')).toBe('radio');
    expect(common.getAttribute('role')).toBe('radio');
    expect(project.textContent).toMatch(/This project/i);
    expect(project.textContent).toMatch(/2/);
    expect(common.textContent).toMatch(/Common/i);
    expect(common.textContent).toMatch(/1/);
  });

  it('filters the doc list to the selected scope', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    // Default shows the project's own notes.
    scopeButton(host, 'project').click();
    fixture.detectChanges();
    let names = docRows(host).map((r) => r.textContent ?? '');
    expect(names.join(' ')).toMatch(/coding-style/);
    expect(names.join(' ')).toMatch(/webhook-retry/);
    expect(names.join(' ')).not.toMatch(/commit-trailer/);
    // Common shows only the common note.
    scopeButton(host, 'common').click();
    fixture.detectChanges();
    names = docRows(host).map((r) => r.textContent ?? '');
    expect(names.join(' ')).toMatch(/commit-trailer/);
    expect(names.join(' ')).not.toMatch(/coding-style/);
  });

  it('marks Common as the selected radio after clicking it', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'common').click();
    fixture.detectChanges();
    expect(scopeButton(host, 'common').getAttribute('aria-checked')).toBe('true');
    expect(scopeButton(host, 'project').getAttribute('aria-checked')).toBe('false');
  });

  it('moves the scope selection to the next option on ArrowRight from a focused radio', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    const project = scopeButton(host, 'project');
    project.focus();
    project.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    const common = scopeButton(host, 'common');
    expect(common.getAttribute('aria-checked')).toBe('true');
    expect(project.getAttribute('aria-checked')).toBe('false');
    expect(document.activeElement).toBe(common);
  });

  it('moves the scope selection to the previous option on ArrowLeft from a focused radio', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'common').click();
    fixture.detectChanges();
    const common = scopeButton(host, 'common');
    common.focus();
    common.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    const project = scopeButton(host, 'project');
    expect(project.getAttribute('aria-checked')).toBe('true');
    expect(common.getAttribute('aria-checked')).toBe('false');
    expect(document.activeElement).toBe(project);
  });

  it('an All scope shows every doc regardless of scope', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    expect(docRows(host).length).toBe(3);
  });

  it('shows each doc its scope badge by glyph+text (not colour alone)', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    const common = docRows(host).find((r) => (r.textContent ?? '').includes('commit-trailer'))!;
    const badge = common.querySelector('[data-testid="doc-scope-badge"]')!;
    expect(badge.textContent).toMatch(/Common/i);
    expect(badge.querySelector('svg')).toBeTruthy();
    const project = docRows(host).find((r) => (r.textContent ?? '').includes('coding-style'))!;
    const pbadge = project.querySelector('[data-testid="doc-scope-badge"]')!;
    expect(pbadge.textContent).toMatch(/Project/i);
  });

  it('keeps same-named project and common docs as two distinct rows across a scope change', () => {
    const COLLIDING: KnowledgeView = {
      method: 'filename-only',
      stack: ['java'],
      counts: { project: 1, common: 1 },
      docs: [
        { name: 'coding-style', file: 'project/coding-style.md', scope: 'project', stack: ['java'], kind: 'style', index: 'indexed' },
        { name: 'coding-style', file: 'common/coding-style.md', scope: 'common', stack: ['java'], kind: 'rule', index: 'indexed' },
      ],
    };
    const fixture = mount(COLLIDING);
    const host = fixture.nativeElement as HTMLElement;

    scopeButton(host, 'all').click();
    fixture.detectChanges();
    let rows = docRows(host);
    expect(rows.length).toBe(2);
    const projectRow = rows.find((r) => (r.textContent ?? '').includes('Project'))!;
    const commonRow = rows.find((r) => (r.textContent ?? '').includes('Common'))!;
    expect(projectRow).toBeTruthy();
    expect(commonRow).toBeTruthy();
    expect(projectRow).not.toBe(commonRow);

    // Filtering to a single scope must surface that scope's row, not the other reused under its key.
    scopeButton(host, 'common').click();
    fixture.detectChanges();
    rows = docRows(host);
    expect(rows.length).toBe(1);
    const badge = rows[0].querySelector('[data-testid="doc-scope-badge"]')!;
    expect(badge.textContent).toMatch(/Common/i);
    expect(badge.textContent).not.toMatch(/Project/i);

    scopeButton(host, 'project').click();
    fixture.detectChanges();
    rows = docRows(host);
    expect(rows.length).toBe(1);
    const pbadge = rows[0].querySelector('[data-testid="doc-scope-badge"]')!;
    expect(pbadge.textContent).toMatch(/Project/i);
    expect(pbadge.textContent).not.toMatch(/Common/i);
  });

  it('renders stack and kind chips on each doc', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'project').click();
    fixture.detectChanges();
    const row = docRows(host).find((r) => (r.textContent ?? '').includes('coding-style'))!;
    const chips = row.textContent ?? '';
    expect(chips).toMatch(/java/);
    expect(chips).toMatch(/style/);
  });

  it('excludes the literal "any" tag from the stack filter options (the default empty option already means all)', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    const options = fixture.componentInstance.stackOptions();
    expect(options).not.toContain('any');
    expect(options).toContain('java');
    // The rendered dropdown carries exactly one "any" — the default empty option, never a duplicate.
    const stackFilter = host.querySelector('[data-testid="knowledge-filter-stack"]') as HTMLSelectElement;
    const anyOptions = Array.from(stackFilter.options).filter((o) => o.textContent?.trim() === 'any');
    expect(anyOptions.length).toBe(1);
    expect(anyOptions[0].value).toBe('');
  });

  it('still shows an any-tagged doc under the default (all stacks) filter', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    // Default stack filter is the empty option; the any-tagged common doc must remain visible.
    const stackFilter = host.querySelector('[data-testid="knowledge-filter-stack"]') as HTMLSelectElement;
    expect(stackFilter.value).toBe('');
    const names = docRows(host).map((r) => r.textContent ?? '').join(' ');
    expect(names).toMatch(/commit-trailer/);
  });

  it('filters the loaded set by a stack tag client-side', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    const stackFilter = host.querySelector('[data-testid="knowledge-filter-stack"]') as HTMLSelectElement;
    expect(stackFilter).toBeTruthy();
    stackFilter.value = 'java';
    stackFilter.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const names = docRows(host).map((r) => r.textContent ?? '').join(' ');
    expect(names).toMatch(/coding-style/);
    expect(names).not.toMatch(/commit-trailer/);
  });

  it('filters the loaded set by a kind tag client-side', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    const kindFilter = host.querySelector('[data-testid="knowledge-filter-kind"]') as HTMLSelectElement;
    expect(kindFilter).toBeTruthy();
    kindFilter.value = 'rule';
    kindFilter.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const names = docRows(host).map((r) => r.textContent ?? '').join(' ');
    expect(names).toMatch(/commit-trailer/);
    expect(names).not.toMatch(/coding-style/);
  });

  it('offers a live Add control that opens the scoped add form', () => {
    const fixture = mount(MERGED);
    const host = fixture.nativeElement as HTMLElement;
    const add = host.querySelector('[data-testid="base-add"]') as HTMLButtonElement;
    expect(add).toBeTruthy();
    expect(add.disabled).toBe(false);
    expect(host.querySelector('dart-add-note-form')).toBeNull();
    add.click();
    fixture.detectChanges();
    expect(host.querySelector('dart-add-note-form')).toBeTruthy();
    expect(host.querySelector('[data-testid="note-title"]')).toBeTruthy();
  });

  it('re-emits the form\'s applied state up to the shell so count/list can refresh', async () => {
    const fixture = mount(MERGED);
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
    const next: ProjectState = { rev: 'r2', knowledge: { method: 'filename-only', stack: ['java'], counts: { project: 3, common: 1 }, docs: [{ name: 'a-new-note', scope: 'project', stack: ['java'], kind: 'context', index: 'indexed' }] } };
    http.expectOne('/api/kb/add').flush({ ok: true, doc: { name: 'a-new-note', file: 'docs/a-new-note.md', scope: 'project', stack: ['java'], kind: 'context' }, state: next });
    await settle(fixture);
    expect(applied).not.toBeNull();
    expect((applied as unknown as ProjectState).knowledge?.counts.project).toBe(3);
  });

  it('keeps a Manage knowledge affordance inert (no navigation) while that view does not exist', () => {
    const host = mount(MERGED).nativeElement as HTMLElement;
    const el = host.querySelector('[data-testid="base-manage"]')!;
    expect(el.hasAttribute('routerLink')).toBe(false);
    const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
    expect(disabled).toBe(true);
    expect(el.getAttribute('aria-label') ?? el.textContent ?? '').toMatch(/soon|coming soon/i);
    expect(el.textContent).toMatch(/Manage knowledge/i);
  });

  it('shows the empty invitation plus an Add button when there is no knowledge yet', () => {
    const host = mount({ method: 'filename-only', stack: ['any'], counts: { project: 0, common: 0 }, docs: [] })
      .nativeElement as HTMLElement;
    expect(host.textContent).toContain('No knowledge yet — add the rules and context your team must follow.');
    expect(host.querySelector('[data-testid="base-add"]')).toBeTruthy();
  });

  it('treats an absent knowledge view as empty', () => {
    const host = mount(null).nativeElement as HTMLElement;
    expect(host.textContent).toContain('No knowledge yet — add the rules and context your team must follow.');
  });

  it('escapes a hostile document name rather than injecting markup (XSS guard)', () => {
    const fixture = mount({
      method: 'filename-only',
      stack: ['any'],
      counts: { project: 1, common: 0 },
      docs: [{ name: '<img src=x onerror="window.__xssKb=1">', scope: 'project', stack: ['java'], kind: 'rule', index: 'indexed' }],
    });
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    expect(host.querySelectorAll('img[onerror]').length).toBe(0);
    expect((window as unknown as Record<string, unknown>)['__xssKb']).toBeUndefined();
  });

  it('escapes a hostile stack tag rather than injecting markup', () => {
    const fixture = mount({
      method: 'filename-only',
      stack: ['any'],
      counts: { project: 1, common: 0 },
      docs: [{ name: 'note', scope: 'project', stack: ['<img src=x onerror="window.__xssTag=1">'], kind: 'rule', index: 'indexed' }],
    });
    const host = fixture.nativeElement as HTMLElement;
    scopeButton(host, 'all').click();
    fixture.detectChanges();
    expect(host.querySelectorAll('img[onerror]').length).toBe(0);
    expect((window as unknown as Record<string, unknown>)['__xssTag']).toBeUndefined();
  });
});
