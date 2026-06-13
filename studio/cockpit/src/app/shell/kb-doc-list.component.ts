import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import type { KnowledgeDoc, KnowledgeScope } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** Scope filter for the displayed list: a single vault, or every visible doc. */
type ScopeFilter = KnowledgeScope | 'all';
/** The scope radios in segment order — the roving arrow keys walk this sequence. */
const SCOPE_ORDER: readonly ScopeFilter[] = ['project', 'common', 'all'];

/** A provenance value mapped to its catalogued glyph + honest text (glyph + text, never colour). */
const PROVENANCE: Readonly<Record<string, { readonly glyph: string; readonly text: string }>> = {
  you: { glyph: 'edit', text: 'You' },
  kai: { glyph: 'propose', text: 'From /kai' },
  codebase: { glyph: 'folder-stack', text: 'Imported' },
};

/**
 * The provenance-first knowledge worklist — the doc list (region D) plus its toolbar (search +
 * scope/stack/kind filters + the honest method line). Honesty is the information architecture: every
 * row leads with the machine's relationship to the note — provenance badge, scope badge, stack/kind
 * chips, and the honest index/grounding label — BEFORE the title, then a 2-line escaped excerpt.
 * Each row carries inline ✎ edit and 🗑 remove buttons (the whole row is not a link — a note is text).
 *
 * Search + scope/stack/kind filtering are client-side over the already-loaded merged view (no
 * round-trip); the result count is announced via `aria-live`. Distinct empty states: a genuine
 * whole-empty invites add; a filtered-empty offers Clear filters; a scope-empty reuses honest copy.
 *
 * Security: note names, excerpts, tags, and kinds are UNTRUSTED and reach the DOM through
 * interpolation only (escaped), never `[innerHTML]`. The provenance value is a closed enum looked up
 * to a catalogued glyph — a free string is never echoed into a glyph.
 */
@Component({
  selector: 'dart-kb-doc-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <div class="toolbar">
      <div class="toolbar__row">
        <h3 class="toolbar__title">Notes <span class="toolbar__count" aria-live="polite">({{ countLabel() }})</span></h3>
        <label class="search">
          <dart-glyph name="search" [size]="14" />
          <input
            type="search"
            class="search__input"
            data-testid="kb-search"
            aria-label="Search notes"
            autocomplete="off"
            placeholder="search notes…"
            [value]="search()"
            (input)="onSearch($event)"
          />
        </label>
      </div>

      @if (!empty()) {
        <div class="filters">
          <div class="scope" role="radiogroup" aria-label="Knowledge scope">
            @for (seg of segments(); track seg.scope) {
              <button
                type="button"
                class="seg__opt"
                [attr.data-testid]="'knowledge-scope-' + seg.scope"
                role="radio"
                [attr.aria-checked]="scopeFilter() === seg.scope"
                [attr.tabindex]="scopeFilter() === seg.scope ? 0 : -1"
                [class.seg__opt--on]="scopeFilter() === seg.scope"
                (click)="setScope(seg.scope)"
                (keydown)="onScopeKeydown($event, seg.scope)"
              >
                {{ seg.label }}<span class="seg__count">{{ seg.count }}</span>
              </button>
            }
          </div>
          <label class="filters__field">
            <span class="filters__lbl"><dart-glyph name="tag" [size]="12" /> Stack</span>
            <select class="filters__sel" data-testid="knowledge-filter-stack" [value]="stackFilter()" (change)="onStackFilter($event)">
              <option value="">any</option>
              @for (s of stackOptions(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </label>
          <label class="filters__field">
            <span class="filters__lbl"><dart-glyph name="tag" [size]="12" /> Kind</span>
            <select class="filters__sel" data-testid="knowledge-filter-kind" [value]="kindFilter()" (change)="onKindFilter($event)">
              <option value="">all</option>
              @for (k of kindOptions(); track k) {
                <option [value]="k">{{ k }}</option>
              }
            </select>
          </label>
        </div>
      }
      <p class="method" data-testid="base-method">{{ methodLine() }}</p>
    </div>

    @if (empty()) {
      <div class="empty" data-testid="kb-empty">
        <p class="empty__line">No knowledge yet — add the rules and context your team must follow.</p>
        <button type="button" class="btn btn--primary" data-testid="kb-empty-add" (click)="add.emit()">
          <dart-glyph name="add-comment" [size]="14" /> Add note
        </button>
      </div>
    } @else if (visibleDocs().length) {
      <ul class="docs" data-testid="kb-doc-list" aria-label="Knowledge notes">
        @for (doc of visibleDocs(); track docKey(doc)) {
          <li class="doc" data-testid="knowledge-doc">
            <div class="doc__lead">
              @if (provenance(doc); as p) {
                <span class="badge badge--prov" data-testid="doc-provenance"><dart-glyph [name]="p.glyph" [size]="12" /> {{ p.text }}</span>
              }
              <span class="badge badge--scope" data-testid="doc-scope-badge" [class.badge--common]="doc.scope === 'common'">
                @if (doc.scope === 'common') { <dart-glyph name="scope-common" [size]="12" /> Common }
                @else { <dart-glyph name="scope-project" [size]="12" /> Project }
              </span>
              @for (s of docStack(doc); track s) {
                <span class="badge badge--stack"><dart-glyph name="tag" [size]="12" /> {{ s }}</span>
              }
              @if (doc.kind) {
                <span class="badge badge--kind">{{ doc.kind }}</span>
              }
              <span class="badge badge--index" data-testid="doc-grounding">{{ doc.index ?? 'indexed' }}</span>
              <span class="doc__spacer"></span>
              <button type="button" class="icon-btn" data-testid="doc-edit" [attr.aria-label]="'Edit ' + doc.name" (click)="edit.emit(doc)">
                <dart-glyph name="edit" [size]="16" />
              </button>
              <button type="button" class="icon-btn icon-btn--danger" data-testid="doc-remove" [attr.aria-label]="'Remove ' + doc.name" (click)="remove.emit(doc)">
                <dart-glyph name="trash" [size]="16" />
              </button>
            </div>
            <p class="doc__name">{{ doc.name }}</p>
            @if (doc.excerpt) {
              <p class="doc__excerpt">{{ doc.excerpt }}</p>
            }
          </li>
        }
      </ul>
    } @else {
      <div class="docs-empty">
        <p class="docs-empty__line" [attr.data-testid]="filtering() ? 'kb-filter-empty' : 'knowledge-scope-empty'">{{ emptyScopeLine() }}</p>
        @if (filtering()) {
          <button type="button" class="btn" data-testid="kb-clear-filters" (click)="clearFilters()">Clear filters</button>
        }
      </div>
    }
  `,
  styles: `
    .toolbar { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .toolbar__row { display: flex; align-items: center; gap: var(--kb-space-2); flex-wrap: wrap; }
    .toolbar__title { margin: 0; margin-right: auto; font-size: var(--kb-text-md, 0.95rem); font-weight: 600; }
    .toolbar__count { color: var(--kb-text-muted); font-weight: 400; }
    .search { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.5rem; background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); color: var(--kb-text-muted); }
    .search:focus-within { outline: 2px solid var(--kb-focus-ring); outline-offset: 1px; }
    .search__input { font: inherit; font-size: var(--kb-text-sm); color: var(--kb-text); background: transparent; border: none; outline: none; min-width: 12rem; }
    .filters { display: flex; align-items: center; gap: var(--kb-space-3); flex-wrap: wrap; }
    .scope { display: inline-flex; gap: 0.25rem; padding: 0.2rem; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .seg__opt { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text-subtle); background: transparent; border: none; border-radius: var(--kb-radius-sm, 0.3rem); cursor: pointer; }
    .seg__opt--on { color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); }
    .seg__opt:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .seg__count { font-size: var(--kb-text-xs); font-weight: 700; padding: 0 0.3rem; border-radius: 999px; background: color-mix(in srgb, currentColor 18%, transparent); }
    .filters__field { display: inline-flex; align-items: center; gap: 0.35rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .filters__lbl { display: inline-flex; align-items: center; gap: 0.25rem; }
    .filters__sel { font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm, 0.3rem); padding: 0.15rem 0.3rem; }
    .filters__sel:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .method { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .docs { list-style: none; margin: var(--kb-space-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .doc { display: flex; flex-direction: column; gap: 0.25rem; padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .doc__lead { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
    .doc__spacer { flex: 1 1 auto; }
    .badge { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.05rem 0.35rem; font-size: var(--kb-text-xs); border-radius: 999px; border: 1px solid var(--kb-border); color: var(--kb-text-muted); }
    .badge--prov { font-weight: 600; color: var(--kb-text-subtle); }
    .badge--scope { font-weight: 600; color: var(--kb-text-subtle); }
    .badge--common { color: var(--kb-accent); border-color: color-mix(in srgb, var(--kb-accent) 50%, var(--kb-border)); }
    .badge--kind { text-transform: capitalize; }
    .badge--index { border: none; color: var(--kb-text-subtle); }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 1.6rem; min-height: 1.6rem; padding: 0.2rem; color: var(--kb-text-muted); background: transparent; border: 1px solid transparent; border-radius: var(--kb-radius-md); cursor: pointer; }
    .icon-btn:hover { color: var(--kb-text); background: var(--kb-surface-muted); }
    .icon-btn:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 1px; }
    .icon-btn--danger:hover { color: var(--kb-danger); }
    .doc__name { margin: 0; font-weight: 600; font-size: var(--kb-text-sm); color: var(--kb-text); overflow-wrap: anywhere; }
    .doc__excerpt { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .docs-empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--kb-space-2); margin-top: var(--kb-space-2); }
    .docs-empty__line { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: var(--kb-space-2); padding: var(--kb-space-5) var(--kb-space-3); text-align: center; }
    .empty__line { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn:hover { border-color: var(--kb-border-strong); }
    .btn:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .btn--primary { color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); border-color: var(--kb-accent); }
  `,
})
export class KbDocListComponent {
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The merged docs (project ∪ matching common) from the projection. */
  readonly docs = input<readonly KnowledgeDoc[]>([]);
  /** The honest method line phrased from the projection's `method`. */
  readonly method = input<string>('filename-only');
  /** Per-scope counts from the projection (`{ project, common }`). */
  readonly counts = input<{ readonly project: number; readonly common: number }>({ project: 0, common: 0 });

  /** Open the editor drawer in add mode (whole-empty CTA). */
  readonly add = output<void>();
  /** Open the editor drawer in edit mode for a note. */
  readonly edit = output<KnowledgeDoc>();
  /** Open the remove confirm for a note. */
  readonly remove = output<KnowledgeDoc>();

  readonly scopeFilter = signal<ScopeFilter>('project');
  readonly stackFilter = signal('');
  readonly kindFilter = signal('');
  readonly search = signal('');

  readonly total = computed(() => this.counts().project + this.counts().common);
  readonly empty = computed(() => this.total() <= 0);
  readonly filtering = computed(() => !!this.search().trim() || !!this.stackFilter() || !!this.kindFilter());

  readonly segments = computed(() => {
    const c = this.counts();
    return [
      { scope: 'project' as ScopeFilter, label: 'This project', count: c.project },
      { scope: 'common' as ScopeFilter, label: 'Common', count: c.common },
      { scope: 'all' as ScopeFilter, label: 'All', count: c.project + c.common },
    ];
  });

  private readonly allDocs = computed<readonly KnowledgeDoc[]>(() => this.docs() ?? []);

  readonly stackOptions = computed(() => {
    const set = new Set<string>();
    for (const doc of this.allDocs()) for (const s of doc.stack ?? []) if (s && s !== 'any') set.add(s);
    return [...set].sort();
  });

  readonly kindOptions = computed(() => {
    const set = new Set<string>();
    for (const doc of this.allDocs()) if (doc.kind) set.add(doc.kind);
    return [...set].sort();
  });

  readonly visibleDocs = computed<readonly KnowledgeDoc[]>(() => {
    const scope = this.scopeFilter();
    const stack = this.stackFilter();
    const kind = this.kindFilter();
    const q = this.search().trim().toLowerCase();
    return this.allDocs().filter((doc) => {
      if (scope !== 'all' && doc.scope !== scope) return false;
      if (stack && !(doc.stack ?? []).includes(stack)) return false;
      if (kind && doc.kind !== kind) return false;
      if (q) {
        const hay = `${doc.name} ${doc.excerpt ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  readonly countLabel = computed(() => {
    const n = this.visibleDocs().length;
    if (this.filtering()) return `${n} ${n === 1 ? 'note' : 'notes'} match`;
    return `${n} in this scope`;
  });

  readonly methodLine = computed(() =>
    this.method() === 'local-embeddings'
      ? 'Indexed via: local embeddings (semantic)'
      : 'Indexed via: filename index only — connect an embedder for semantic recall',
  );

  readonly emptyScopeLine = computed(() => {
    if (this.filtering()) return 'No notes match these filters.';
    if (this.scopeFilter() === 'common') {
      return 'No common knowledge yet — add a shared note, or promote a project note.';
    }
    return 'No knowledge in this scope yet.';
  });

  provenance(doc: KnowledgeDoc): { readonly glyph: string; readonly text: string } | null {
    return doc.provenance ? (PROVENANCE[doc.provenance] ?? null) : null;
  }

  docStack(doc: KnowledgeDoc): readonly string[] {
    const stack = (doc.stack ?? []).filter((s) => !!s);
    const specific = stack.filter((s) => s !== 'any');
    return specific.length ? specific : stack;
  }

  docKey(doc: KnowledgeDoc): string {
    return `${doc.scope}:${doc.file ?? doc.name}`;
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }
  onStackFilter(event: Event): void {
    this.stackFilter.set((event.target as HTMLSelectElement).value);
  }
  onKindFilter(event: Event): void {
    this.kindFilter.set((event.target as HTMLSelectElement).value);
  }
  clearFilters(): void {
    this.search.set('');
    this.stackFilter.set('');
    this.kindFilter.set('');
  }

  setScope(scope: ScopeFilter): void {
    this.scopeFilter.set(scope);
  }

  onScopeKeydown(event: KeyboardEvent, scope: ScopeFilter): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const idx = SCOPE_ORDER.indexOf(scope);
    const next = SCOPE_ORDER[(idx + delta + SCOPE_ORDER.length) % SCOPE_ORDER.length];
    this.setScope(next);
    this.hostEl.nativeElement.querySelector<HTMLElement>(`[data-testid="knowledge-scope-${next}"]`)?.focus();
  }
}
