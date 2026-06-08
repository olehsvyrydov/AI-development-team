import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BaseDoc, BaseView } from '../core/models';

const REPRESENTATIVE_DOC_LIMIT = 3;

/**
 * Base panel — how many knowledge documents the project holds, how they are indexed, and an
 * invitation to add more. The method line is honest about recall: semantic when an embedder is
 * wired, otherwise a plain filename index. Document names originate from the project's files and
 * are untrusted, so they render through interpolation only (escaped).
 *
 * This slice has no add-document write endpoint and no Manage-base view: the "Add documents" and
 * "Manage base" controls are inert "coming soon" affordances (disabled, `aria-disabled`) that
 * signal where those features will live — they neither navigate nor fake a write.
 *
 * Empty (no docs, or no base facts at all): an invitation plus the Add control — never a bare
 * "No data".
 */
@Component({
  selector: 'dart-base-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      <h2 class="ph__title">Base</h2>
      @if (!isEmpty()) {
        <span class="ph__count" data-testid="base-count">{{ total() }} docs</span>
      }
    </header>

    <hr class="ph__rule" aria-hidden="true" />

    @if (isEmpty()) {
      <p class="ph__empty" data-testid="base-empty">No knowledge yet — add the rules and context your team must follow.</p>
    } @else {
      <ul class="breakdown" aria-label="Index status">
        <li class="bk bk--indexed" data-testid="base-indexed">
          <svg class="bk__glyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
            <polyline points="5,12 10,17 19,7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="bk__num">{{ counts().indexed }}</span> indexed
        </li>
        <li class="bk bk--indexing" data-testid="base-indexing">
          <svg class="bk__glyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M12 4 a8 8 0 0 1 0 16 z" fill="currentColor" stroke="none" />
          </svg>
          <span class="bk__num">{{ counts().indexing }}</span> indexing
        </li>
        <li class="bk bk--failed" data-testid="base-failed">
          <svg class="bk__glyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
            <path d="M12 4 L21 19 H3 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            <line x1="12" y1="10" x2="12" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
          </svg>
          <span class="bk__num">{{ counts().failed }}</span> failed
        </li>
      </ul>

      <p class="method" data-testid="base-method">{{ methodLine() }}</p>

      @if (docs().length) {
        <ul class="docs" aria-label="Recent documents">
          @for (doc of docs(); track doc.name) {
            <li class="doc">
              <span class="doc__name">{{ doc.name }}</span>
              <span class="doc__index">{{ doc.index ?? 'indexed' }}</span>
            </li>
          }
        </ul>
      }
    }

    <hr class="ph__rule" aria-hidden="true" />

    <footer class="ph__footrow">
      <button
        type="button"
        class="ph__add"
        data-testid="base-add"
        disabled
        aria-disabled="true"
        aria-label="Add documents (coming soon)"
      >
        <svg class="ph__addglyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
          <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        Add documents
        <span class="ph__soon">soon</span>
      </button>
      <button
        type="button"
        class="ph__foot"
        data-testid="base-manage"
        disabled
        aria-disabled="true"
        aria-label="Manage base (coming soon)"
      >
        Manage base
        <span class="ph__soon">soon</span>
        <svg class="ph__arrow" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
          <polyline points="9,6 15,12 9,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </footer>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--kb-space-2); height: 100%; }
    .ph { display: flex; align-items: center; gap: var(--kb-space-2); }
    .ph__tile { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: var(--kb-radius-md); }
    .ph__tile--base { background: color-mix(in srgb, var(--kb-accent) 12%, transparent); color: color-mix(in srgb, var(--kb-accent) 70%, var(--kb-text)); }
    .ph__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 600; margin-right: auto; }
    .ph__count { font-size: var(--kb-text-lg); font-weight: 700; }
    .ph__rule { width: 100%; margin: 0; border: none; border-top: 1px solid var(--kb-border); }
    .ph__empty { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .breakdown { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--kb-space-3); font-size: var(--kb-text-sm); }
    .bk { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--kb-text-muted); }
    .bk__glyph { flex: none; }
    .bk__num { font-weight: 700; color: var(--kb-text); }
    .bk--indexed { color: var(--kb-success); }
    .bk--indexing { color: var(--kb-text-muted); }
    .bk--failed { color: var(--kb-danger); }
    .method { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .docs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
    .doc { display: flex; align-items: center; justify-content: space-between; gap: var(--kb-space-2); font-size: var(--kb-text-sm); }
    .doc__name { color: var(--kb-text); overflow-wrap: anywhere; }
    .doc__index { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
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
    .ph__addglyph { flex: none; opacity: 0.6; }
    .ph__foot { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0; font: inherit; color: var(--kb-text-subtle); background: transparent; border: none; text-decoration: none; font-size: var(--kb-text-sm); font-weight: 600; }
    .ph__foot[disabled], .ph__foot[aria-disabled='true'] { cursor: default; }
    .ph__soon { padding: 0 0.3rem; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-subtle); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: 999px; }
    .ph__arrow { flex: none; opacity: 0.6; }
  `,
})
export class BasePanelComponent {
  readonly base = input.required<BaseView | null>();

  readonly counts = computed(() => this.base()?.counts ?? { indexed: 0, indexing: 0, failed: 0 });
  readonly total = computed(() => {
    const c = this.counts();
    return c.indexed + c.indexing + c.failed;
  });
  readonly isEmpty = computed(() => !this.base() || this.total() <= 0);

  readonly docs = computed<readonly BaseDoc[]>(() => (this.base()?.docs ?? []).slice(0, REPRESENTATIVE_DOC_LIMIT));

  readonly methodLine = computed(() =>
    this.base()?.method === 'local-embeddings'
      ? 'Indexed via: local embeddings (semantic)'
      : 'Filename index only — connect an embedder for semantic recall',
  );
}
