import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import type { KnowledgeDoc, KnowledgeProposal, KnowledgeScope, KnowledgeView, ProjectState } from '../core/models';
import { AddNoteFormComponent } from './add-note-form.component';
import { GlyphComponent } from './glyph.component';
import { ProposeInboxComponent } from './propose-inbox.component';

/** Scope filter for the displayed list: a single vault, or every visible doc. */
type ScopeFilter = KnowledgeScope | 'all';

/** The scope radios in segment order — the roving arrow keys walk this sequence. */
const SCOPE_ORDER: readonly ScopeFilter[] = ['project', 'common', 'all'];

/**
 * Knowledge panel — the merged view of what the project's AI team remembers: its own project-scoped
 * notes unioned with the approved common notes whose stack matches the project. It shows how many
 * docs of each scope are visible, an honest method line (semantic only when an embedder is wired,
 * else a plain filename index), and a live control to add more.
 *
 * The scope toggle (This project / Common / All) filters the displayed docs by their vault; Common
 * is framed honestly as shared across the operator's own projects on this machine, never a cloud.
 * Each doc carries a scope badge (glyph + text, never colour alone), its stack tags, and its kind.
 * Simple client-side stack/kind filters narrow the loaded set without a refetch.
 *
 * When the projection carries pending `/kai` proposals, a propose-inbox sub-component renders above
 * the list: model-authored knowledge awaiting an explicit human approve into a chosen vault. Nothing
 * is applied automatically; the inbox is absent (not a zero state) when there is nothing pending.
 *
 * Security: doc names, stack tags, kinds, and all proposal content originate from project files /
 * front-matter / the model and are UNTRUSTED, so they reach the DOM through interpolation only
 * (escaped) — never `[innerHTML]`. Both the scoped add form's scope and the proposal approve scope
 * are a fixed enum, never a free path. "Manage knowledge" stays an inert "coming soon" affordance
 * (disabled, `aria-disabled`) that neither navigates nor fakes a write.
 *
 * Empty (no docs, or no facts at all): an invitation plus the Add control — never a bare "No data".
 */
@Component({
  selector: 'dart-base-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AddNoteFormComponent, GlyphComponent, ProposeInboxComponent],
  template: `
    <header class="ph">
      <span class="ph__tile ph__tile--base" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <rect x="4" y="6" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 4 h10 a1.5 1.5 0 0 1 1.5 1.5 V18" fill="none" stroke="currentColor" stroke-width="1.6" />
          <line x1="7" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          <line x1="7" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          <line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </span>
      <h2 class="ph__title" data-testid="knowledge-title">Knowledge</h2>
      @if (!isEmpty()) {
        <span class="ph__count" data-testid="base-count">{{ total() }} docs</span>
      }
    </header>

    <p class="local" data-testid="knowledge-local">Local-first — nothing is uploaded. Indexed on this machine.</p>

    @if (proposals().length) {
      <dart-propose-inbox [proposals]="proposals()" (applied)="onApplied($event)" />
    }

    <hr class="ph__rule" aria-hidden="true" />

    @if (isEmpty()) {
      <p class="ph__empty" data-testid="base-empty">No knowledge yet — add the rules and context your team must follow.</p>
    } @else {
      <div class="scope" role="radiogroup" aria-label="Knowledge scope">
        <button
          type="button"
          class="seg__opt"
          data-testid="knowledge-scope-project"
          role="radio"
          [attr.aria-checked]="scopeFilter() === 'project'"
          [attr.tabindex]="scopeFilter() === 'project' ? 0 : -1"
          [class.seg__opt--on]="scopeFilter() === 'project'"
          (click)="setScope('project')"
          (keydown)="onScopeKeydown($event, 'project')"
        >
          <dart-glyph name="scope-project" /> This project
          <span class="seg__count">{{ counts().project }}</span>
        </button>
        <button
          type="button"
          class="seg__opt"
          data-testid="knowledge-scope-common"
          role="radio"
          [attr.aria-checked]="scopeFilter() === 'common'"
          [attr.tabindex]="scopeFilter() === 'common' ? 0 : -1"
          [class.seg__opt--on]="scopeFilter() === 'common'"
          (click)="setScope('common')"
          (keydown)="onScopeKeydown($event, 'common')"
        >
          <dart-glyph name="scope-common" /> Common
          <span class="seg__count">{{ counts().common }}</span>
        </button>
        <button
          type="button"
          class="seg__opt"
          data-testid="knowledge-scope-all"
          role="radio"
          [attr.aria-checked]="scopeFilter() === 'all'"
          [attr.tabindex]="scopeFilter() === 'all' ? 0 : -1"
          [class.seg__opt--on]="scopeFilter() === 'all'"
          (click)="setScope('all')"
          (keydown)="onScopeKeydown($event, 'all')"
        >
          All
          <span class="seg__count">{{ total() }}</span>
        </button>
      </div>

      <div class="filters">
        <label class="filters__field">
          <span class="filters__lbl"><dart-glyph name="tag" /> Stack</span>
          <select class="filters__sel" data-testid="knowledge-filter-stack" [value]="stackFilter()" (change)="onStackFilter($event)">
            <option value="">any</option>
            @for (s of stackOptions(); track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
        <label class="filters__field">
          <span class="filters__lbl"><dart-glyph name="tag" /> Kind</span>
          <select class="filters__sel" data-testid="knowledge-filter-kind" [value]="kindFilter()" (change)="onKindFilter($event)">
            <option value="">all</option>
            @for (k of kindOptions(); track k) {
              <option [value]="k">{{ k }}</option>
            }
          </select>
        </label>
      </div>

      <p class="method" data-testid="base-method">{{ methodLine() }}</p>

      @if (visibleDocs().length) {
        <ul class="docs" aria-label="Knowledge documents">
          @for (doc of visibleDocs(); track docKey(doc)) {
            <li class="doc" data-testid="knowledge-doc">
              <span class="doc__name">{{ doc.name }}</span>
              <span class="doc__chips">
                <span
                  class="chip chip--scope"
                  data-testid="doc-scope-badge"
                  [class.chip--common]="doc.scope === 'common'"
                >
                  @if (doc.scope === 'common') {
                    <dart-glyph name="scope-common" [size]="12" /> Common
                  } @else {
                    <dart-glyph name="scope-project" [size]="12" /> Project
                  }
                </span>
                @for (s of docStack(doc); track s) {
                  <span class="chip chip--stack"><dart-glyph name="tag" [size]="12" /> {{ s }}</span>
                }
                @if (doc.kind) {
                  <span class="chip chip--kind">{{ doc.kind }}</span>
                }
                <span class="doc__index">{{ doc.index ?? 'indexed' }}</span>
              </span>
            </li>
          }
        </ul>
      } @else {
        <p class="docs-empty" data-testid="knowledge-scope-empty">{{ emptyScopeLine() }}</p>
      }
    }

    <hr class="ph__rule" aria-hidden="true" />

    @if (formOpen()) {
      <dart-add-note-form
        [base]="base()"
        (applied)="onApplied($event)"
        (cancel)="closeForm()"
      />
    } @else {
      <footer class="ph__footrow">
        <button
          type="button"
          class="ph__add ph__add--live"
          data-testid="base-add"
          aria-label="Add knowledge"
          [attr.aria-expanded]="formOpen()"
          (click)="openForm()"
        >
          <svg class="ph__addglyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          Add knowledge
        </button>
        <button
          type="button"
          class="ph__foot"
          data-testid="base-manage"
          disabled
          aria-disabled="true"
          aria-label="Manage knowledge (coming soon)"
        >
          Manage knowledge
          <span class="ph__soon">soon</span>
          <svg class="ph__arrow" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
            <polyline points="9,6 15,12 9,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </footer>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--kb-space-2); height: 100%; }
    .ph { display: flex; align-items: center; gap: var(--kb-space-2); }
    .ph__tile { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: var(--kb-radius-md); }
    .ph__tile--base { background: color-mix(in srgb, var(--kb-accent) 12%, transparent); color: color-mix(in srgb, var(--kb-accent) 70%, var(--kb-text)); }
    .ph__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 600; margin-right: auto; }
    .ph__count { font-size: var(--kb-text-lg); font-weight: 700; }
    .local { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .ph__rule { width: 100%; margin: 0; border: none; border-top: 1px solid var(--kb-border); }
    .ph__empty { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .scope { display: inline-flex; gap: 0.25rem; padding: 0.2rem; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); width: fit-content; }
    .seg__opt { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text-subtle); background: transparent; border: none; border-radius: var(--kb-radius-sm, 0.3rem); cursor: pointer; }
    .seg__opt--on { color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); }
    .seg__opt:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .seg__count { font-size: var(--kb-text-xs); font-weight: 700; padding: 0 0.3rem; border-radius: 999px; background: color-mix(in srgb, currentColor 18%, transparent); }
    .filters { display: flex; gap: var(--kb-space-3); flex-wrap: wrap; }
    .filters__field { display: inline-flex; align-items: center; gap: 0.35rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .filters__lbl { display: inline-flex; align-items: center; gap: 0.25rem; }
    .filters__sel { font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm, 0.3rem); padding: 0.15rem 0.3rem; }
    .filters__sel:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .method { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .docs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
    .doc { display: flex; align-items: center; justify-content: space-between; gap: var(--kb-space-2); font-size: var(--kb-text-sm); }
    .doc__name { color: var(--kb-text); overflow-wrap: anywhere; }
    .doc__chips { display: inline-flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; justify-content: flex-end; }
    .chip { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.05rem 0.35rem; font-size: var(--kb-text-xs); border-radius: 999px; border: 1px solid var(--kb-border); color: var(--kb-text-muted); }
    .chip--scope { font-weight: 600; color: var(--kb-text-subtle); }
    .chip--common { color: var(--kb-accent); border-color: color-mix(in srgb, var(--kb-accent) 50%, var(--kb-border)); }
    .chip--kind { text-transform: capitalize; }
    .doc__index { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
    .docs-empty { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .ph__footrow { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: var(--kb-space-2); }
    .ph__add {
      display: inline-flex; align-items: center; gap: 0.3rem;
      padding: 0.3rem 0.6rem;
      font: inherit;
      background: var(--kb-surface-muted); color: var(--kb-text-subtle);
      border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md);
      text-decoration: none; font-size: var(--kb-text-sm); font-weight: 600;
    }
    .ph__add[disabled], .ph__add[aria-disabled='true'] { cursor: default; }
    .ph__add--live { color: var(--kb-accent); cursor: pointer; }
    .ph__add--live:hover { border-color: var(--kb-accent); }
    .ph__add--live:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .ph__add--live .ph__addglyph { opacity: 1; }
    .ph__addglyph { flex: none; opacity: 0.6; }
    .ph__foot { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0; font: inherit; color: var(--kb-text-subtle); background: transparent; border: none; text-decoration: none; font-size: var(--kb-text-sm); font-weight: 600; }
    .ph__foot[disabled], .ph__foot[aria-disabled='true'] { cursor: default; }
    .ph__soon { padding: 0 0.3rem; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-subtle); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: 999px; }
    .ph__arrow { flex: none; opacity: 0.6; }
  `,
})
export class BasePanelComponent {
  readonly base = input.required<KnowledgeView | null>();
  /** Fresh project state from a successful note add, lifted for the shell to adopt as truth. */
  readonly applied = output<ProjectState>();

  private readonly formOpen_ = signal(false);
  readonly formOpen = this.formOpen_.asReadonly();

  /** Which scope the list is filtered to. Defaults to the project's own notes. */
  readonly scopeFilter = signal<ScopeFilter>('project');
  /** Client-side stack tag filter; empty string = any. */
  readonly stackFilter = signal('');
  /** Client-side kind filter; empty string = all. */
  readonly kindFilter = signal('');

  openForm(): void {
    this.formOpen_.set(true);
  }

  closeForm(): void {
    this.formOpen_.set(false);
  }

  /** Lift the form's success state to the shell; keep the form open so further notes can be added. */
  onApplied(state: ProjectState): void {
    this.applied.emit(state);
  }

  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  setScope(scope: ScopeFilter): void {
    this.scopeFilter.set(scope);
  }

  /** Roving radiogroup nav: Left/Up select the previous scope, Right/Down the next (wrapping), focusing it. */
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
    this.hostEl.nativeElement
      .querySelector<HTMLElement>(`[data-testid="knowledge-scope-${next}"]`)
      ?.focus();
  }

  onStackFilter(event: Event): void {
    this.stackFilter.set((event.target as HTMLSelectElement).value);
  }

  onKindFilter(event: Event): void {
    this.kindFilter.set((event.target as HTMLSelectElement).value);
  }

  /** The `/kai` pending inbox carried on the knowledge projection; empty array when none/absent. */
  readonly proposals = computed<readonly KnowledgeProposal[]>(() => this.base()?.proposals ?? []);

  readonly counts = computed(() => this.base()?.counts ?? { project: 0, common: 0 });
  readonly total = computed(() => {
    const c = this.counts();
    return c.project + c.common;
  });
  readonly isEmpty = computed(() => !this.base() || this.total() <= 0);

  private readonly allDocs = computed<readonly KnowledgeDoc[]>(() => this.base()?.docs ?? []);

  /**
   * The specific stack tags present across the loaded docs, for the filter options. The literal
   * `any` token is dropped: the select's default empty option already means "all stacks", so listing
   * `any` would render a second, redundant "all" entry. Excluding it from the OPTIONS does not hide
   * any-tagged docs — those still appear under the default (empty) filter.
   */
  readonly stackOptions = computed(() => {
    const set = new Set<string>();
    for (const doc of this.allDocs()) for (const s of doc.stack ?? []) if (s && s !== 'any') set.add(s);
    return [...set].sort();
  });

  /** The kinds actually present across the loaded docs, for the filter options. */
  readonly kindOptions = computed(() => {
    const set = new Set<string>();
    for (const doc of this.allDocs()) if (doc.kind) set.add(doc.kind);
    return [...set].sort();
  });

  /** The docs after scope + stack + kind filtering. */
  readonly visibleDocs = computed<readonly KnowledgeDoc[]>(() => {
    const scope = this.scopeFilter();
    const stack = this.stackFilter();
    const kind = this.kindFilter();
    return this.allDocs().filter((doc) => {
      if (scope !== 'all' && doc.scope !== scope) return false;
      if (stack && !(doc.stack ?? []).includes(stack)) return false;
      if (kind && doc.kind !== kind) return false;
      return true;
    });
  });

  /**
   * A row identity unique across scopes. A slug (`name`) can repeat between the project and common
   * vaults, so tracking by name alone lets the renderer reuse one doc's DOM node for a same-named
   * doc of the other scope when the scope filter changes. Keying on `scope` + the per-vault file (or
   * name) keeps the two rows distinct.
   */
  docKey(doc: KnowledgeDoc): string {
    return `${doc.scope}:${doc.file ?? doc.name}`;
  }

  /** A doc's stack tags, with the noise-only `any` dropped when more specific tags exist. */
  docStack(doc: KnowledgeDoc): readonly string[] {
    const stack = (doc.stack ?? []).filter((s) => !!s);
    const specific = stack.filter((s) => s !== 'any');
    return specific.length ? specific : stack;
  }

  readonly emptyScopeLine = computed(() => {
    if (this.stackFilter() || this.kindFilter()) return 'No knowledge matches these filters.';
    if (this.scopeFilter() === 'common') {
      return 'No common knowledge yet — add a shared note, or promote a project note.';
    }
    return 'No knowledge in this scope yet.';
  });

  readonly methodLine = computed(() =>
    this.base()?.method === 'local-embeddings'
      ? 'Indexed via: local embeddings (semantic)'
      : 'Filename index only — connect an embedder for semantic recall',
  );
}
