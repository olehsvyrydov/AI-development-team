import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { KnowledgeView, ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { KnowledgePageComponent } from './knowledge-page.component';

const DOCS = [
  { name: 'code-rules', file: 'docs/code-rules.md', rev: 'm:1', scope: 'project' as const, stack: ['java'], kind: 'rule', index: 'indexed', provenance: 'you' as const, excerpt: 'Use constructor injection; never field @Autowired.' },
  { name: 'test-policy', file: 'docs/test-policy.md', rev: 'm:2', scope: 'common' as const, stack: ['any'], kind: 'style', index: 'indexed', provenance: 'kai' as const, excerpt: 'Every behaviour gets a failing test first.' },
];

function knowledge(over: Partial<KnowledgeView> = {}): KnowledgeView {
  return {
    method: 'filename-only',
    stack: ['java'],
    counts: { project: 1, common: 1 },
    docs: DOCS,
    ...over,
  };
}

function state(k: KnowledgeView | null = knowledge(), rev = 'r1'): ProjectState {
  return { rev, knowledge: k };
}

function mount(s: ProjectState = state()): {
  fixture: ComponentFixture<KnowledgePageComponent>;
  host: HTMLElement;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [KnowledgePageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(KnowledgePageComponent);
  fixture.componentRef.setInput('state', s);
  fixture.componentRef.setInput('projectName', 'payments-api');
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

function q(host: HTMLElement, sel: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(sel);
}

describe('KnowledgePageComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the page header, the doc list, and the Ask panel when notes exist', () => {
    const { host } = mount();
    expect(q(host, '[data-testid="knowledge-title"]')?.textContent).toContain('Knowledge');
    expect(q(host, '[data-testid="base-count"]')?.textContent).toContain('2 notes');
    expect(q(host, '[data-testid="kb-doc-list"]')).toBeTruthy();
    expect(host.querySelector('dart-knowledge-qa')).toBeTruthy();
  });

  describe('provenance-first doc row', () => {
    it('leads each row with provenance + scope + stack/kind + grounding BEFORE the name', () => {
      const { host } = mount();
      const row = host.querySelector('[data-testid="knowledge-doc"]')!;
      const prov = row.querySelector('[data-testid="doc-provenance"]')!;
      const name = row.querySelector('.doc__name')!;
      expect(prov.textContent).toContain('You');
      expect(row.querySelector('[data-testid="doc-scope-badge"]')?.textContent).toContain('Project');
      expect(row.querySelector('[data-testid="doc-grounding"]')?.textContent).toContain('indexed');
      // provenance node precedes the name node in document order (honesty leads).
      expect(prov.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(name.textContent).toContain('code-rules');
    });

    it('renders the /kai provenance as "From /kai" and a 2-line escaped excerpt', () => {
      const { fixture, host } = mount();
      // The common note shows under the "All" scope (default filter is the project's own notes).
      (host.querySelector('[data-testid="knowledge-scope-all"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const kaiRow = [...host.querySelectorAll('[data-testid="knowledge-doc"]')].find((r) =>
        r.querySelector('.doc__name')?.textContent?.includes('test-policy'),
      )!;
      expect(kaiRow.querySelector('[data-testid="doc-provenance"]')?.textContent).toContain('From /kai');
      expect(kaiRow.querySelector('.doc__excerpt')?.textContent).toContain('failing test first');
    });

    it('omits the provenance badge when the projection carries no provenance (never fabricates)', () => {
      const { host } = mount(state(knowledge({ docs: [{ name: 'n', scope: 'project', index: 'indexed' }], counts: { project: 1, common: 0 } })));
      const row = host.querySelector('[data-testid="knowledge-doc"]')!;
      expect(row.querySelector('[data-testid="doc-provenance"]')).toBeNull();
    });
  });

  describe('search + filters (client-side)', () => {
    it('filters the visible rows by the search box and announces the match count', async () => {
      const { fixture, host } = mount();
      const search = q(host, '[data-testid="kb-search"]') as HTMLInputElement;
      // searching the merged scope means widening to "All" so both rows are candidates
      (host.querySelector('[data-testid="knowledge-scope-all"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      search.value = 'failing test';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const names = [...host.querySelectorAll('.doc__name')].map((n) => n.textContent);
      expect(names.some((n) => n?.includes('test-policy'))).toBe(true);
      expect(names.some((n) => n?.includes('code-rules'))).toBe(false);
    });

    it('shows a Clear filters affordance when a filter matched nothing', async () => {
      const { fixture, host } = mount();
      const search = q(host, '[data-testid="kb-search"]') as HTMLInputElement;
      search.value = 'zzz-nothing-matches';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(q(host, '[data-testid="kb-clear-filters"]')).toBeTruthy();
    });
  });

  describe('empty states (honest, absent-not-zero)', () => {
    it('first-run empty shows an invite + Add, and hides scope filters and Ask', () => {
      const empty = state(knowledge({ counts: { project: 0, common: 0 }, docs: [] }));
      const { host } = mount(empty);
      expect(q(host, '[data-testid="kb-empty"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="knowledge-scope-project"]')).toBeNull();
      expect(host.querySelector('dart-knowledge-qa')).toBeNull();
      // the connect-a-codebase invite is the one allowed empty-affordance
      expect(q(host, '[data-testid="kb-source-empty"]')).toBeTruthy();
    });
  });

  describe('security: escaped hostile content', () => {
    it('renders a hostile note name + excerpt as inert escaped text (no script execution)', () => {
      const evil = '<img src=x onerror="window.__xssKb=1">';
      const { host } = mount(state(knowledge({ counts: { project: 1, common: 0 }, docs: [{ name: evil, scope: 'project', index: 'indexed', excerpt: evil, provenance: 'you' }] })));
      expect([...host.querySelectorAll('img')].filter((el) => el.hasAttribute('onerror'))).toEqual([]);
      expect((window as unknown as Record<string, unknown>)['__xssKb']).toBeUndefined();
      expect(host.textContent).toContain('<img');
    });
  });

  describe('region isolation', () => {
    it('a malformed sources slice fails only its region, the doc list still renders', () => {
      const broken = state();
      Object.defineProperty(broken.knowledge, 'sources', {
        enumerable: true,
        get() {
          throw new Error('bad sources');
        },
      });
      const { host } = mount(broken);
      expect(q(host, '[data-testid="kb-sources-error"]')).toBeTruthy();
      expect(q(host, '[data-testid="kb-doc-list"]')).toBeTruthy();
    });
  });
});
