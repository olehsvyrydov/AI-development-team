import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { KnowledgeDoc, KnowledgeProposal, KnowledgeView, KbSource, ProjectState } from '../core/models';
import { KbDocListComponent } from './kb-doc-list.component';
import { KbSourcesComponent } from './kb-sources.component';
import { KnowledgeQaComponent } from './knowledge-qa.component';
import { NoteEditorComponent } from './note-editor.component';
import { NoteRemoveConfirmComponent } from './note-remove-confirm.component';
import { ProposeInboxComponent } from './propose-inbox.component';

/** A region guard: either the derived value, or the message from the derivation failure. */
type Derived<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function derive<T>(fn: () => T): Derived<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The dedicated Knowledge page — the in-shell view-mode entered from the panel's "Manage knowledge"
 * footer (a peer of the tasks board / workflow builder, NOT a route). It binds the live project
 * state and, on every CRUD/connect mutation and every SSE push, re-derives in place by lifting the
 * returned fresh state through {@link applied}.
 *
 * Layout (top → bottom): toolbar header (count + Add) · connected-codebases strip · the `/kai`
 * propose-inbox · the doc list ⟷ Ask split (side-by-side ≥lg, stacked <lg). Each region derives
 * behind its own guard so a malformed slice fails ONE region, never blanks the page. The scope/stack
 * /kind filters + Ask are part of the doc-list / Q&A sub-components, which self-hide while empty.
 *
 * The CRUD drawer and remove confirm are owned here so a row's ✎/🗑 opens them over the whole page;
 * the editor's scope-change disclosure + the CAS-conflict reconcile live in those sub-components.
 *
 * Security: every note name/excerpt/tag, source path/label, and overlay answer is UNTRUSTED and
 * reaches the DOM through interpolation only (escaped), never `[innerHTML]`. No Canon control ships;
 * the sources strip + Q&A egress line are the data-driven seam (overlayPresent stays false here).
 */
@Component({
  selector: 'dart-knowledge-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KbDocListComponent,
    KbSourcesComponent,
    KnowledgeQaComponent,
    NoteEditorComponent,
    NoteRemoveConfirmComponent,
    ProposeInboxComponent,
  ],
  template: `
    <div class="page">
      <header class="page__toolbar" data-testid="kb-toolbar">
        <span class="page__tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <rect x="4" y="6" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M8 4 h10 a1.5 1.5 0 0 1 1.5 1.5 V18" fill="none" stroke="currentColor" stroke-width="1.6" />
            <line x1="7" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            <line x1="7" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            <line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </span>
        <h2 class="page__title" data-testid="knowledge-title">Knowledge</h2>
        @if (total() > 0) {
          <span class="page__count" data-testid="base-count">{{ total() }} notes</span>
        }
        <button type="button" class="page__add" data-testid="base-add" aria-label="Add note" (click)="openAdd()">
          <svg class="page__addglyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          Add note
        </button>
      </header>

      <section class="region">
        @if (sources(); as s) {
          @if (s.ok) {
            <dart-kb-sources [sources]="s.value" [stateRev]="rev()" (applied)="applied.emit($event)" />
          } @else {
            <p class="region-error" role="alert" data-testid="kb-sources-error">Couldn't load connected codebases.</p>
          }
        }
      </section>

      @if (proposals().length) {
        <section class="region">
          <dart-propose-inbox [proposals]="proposals()" (applied)="applied.emit($event)" />
        </section>
      }

      <section class="split">
        <div class="split__list">
          @if (knowledge(); as k) {
            @if (k.ok) {
              <dart-kb-doc-list
                [docs]="k.value.docs ?? []"
                [method]="k.value.method"
                [counts]="k.value.counts"
                (add)="openAdd()"
                (edit)="openEdit($event)"
                (remove)="openRemove($event)"
              />
            } @else {
              <p class="region-error" role="alert" data-testid="kb-doc-list-error">Couldn't load notes.</p>
            }
          }
        </div>
        @if (total() > 0) {
          <aside class="split__ask" aria-label="Ask the knowledge base">
            <dart-knowledge-qa />
          </aside>
        }
      </section>
    </div>

    <dart-note-editor
      [open]="editorOpen()"
      [note]="editingNote()"
      [base]="knowledgeView()"
      (applied)="onEditorApplied($event)"
      (cancelled)="closeEditor()"
    />
    <dart-note-remove-confirm
      [open]="removeOpen()"
      [note]="removingNote()"
      (applied)="onRemoveApplied($event)"
      (cancelled)="closeRemove()"
    />
  `,
  styles: `
    .page { display: flex; flex-direction: column; gap: var(--kb-space-4); }
    .page__toolbar { display: flex; align-items: center; gap: var(--kb-space-2); position: sticky; top: 0; z-index: 2; padding: var(--kb-space-2) 0; background: var(--kb-bg, var(--kb-surface)); }
    .page__tile { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: var(--kb-radius-md); background: color-mix(in srgb, var(--kb-accent) 12%, transparent); color: color-mix(in srgb, var(--kb-accent) 70%, var(--kb-text)); }
    .page__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 600; }
    .page__count { font-size: var(--kb-text-md, 0.95rem); font-weight: 700; color: var(--kb-text-subtle); }
    .page__add { display: inline-flex; align-items: center; gap: 0.3rem; margin-left: auto; padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); border: 1px solid var(--kb-accent); border-radius: var(--kb-radius-md); cursor: pointer; }
    .page__add:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .page__addglyph { flex: none; }
    .region { scroll-margin-top: 3rem; }
    .region-error { margin: 0; padding: var(--kb-space-2); font-size: var(--kb-text-sm); color: var(--kb-danger); background: var(--kb-accent-soft); border: 1px solid var(--kb-danger); border-radius: var(--kb-radius-md); }
    .split { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 1fr); gap: var(--kb-space-4); align-items: start; }
    @media (max-width: 60rem) { .split { grid-template-columns: 1fr; } }
    .split__list { min-width: 0; }
    .split__ask { position: sticky; top: 3.5rem; padding: var(--kb-space-3); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-lg); }
    @media (max-width: 60rem) { .split__ask { position: static; } }
  `,
})
export class KnowledgePageComponent {
  /** The live project state — every mutation/SSE push re-derives the page from this. */
  readonly state = input<ProjectState>({});
  /** The project's human title, for any contextual copy. UNTRUSTED — escaped on render. */
  readonly projectName = input<string>('');
  /** Fresh project state to lift to the shell after any CRUD/connect mutation or SSE-driven change. */
  readonly applied = output<ProjectState>();

  private readonly editorOpen_ = signal(false);
  readonly editorOpen = this.editorOpen_.asReadonly();
  private readonly editingNote_ = signal<KnowledgeDoc | null>(null);
  readonly editingNote = this.editingNote_.asReadonly();
  private readonly removeOpen_ = signal(false);
  readonly removeOpen = this.removeOpen_.asReadonly();
  private readonly removingNote_ = signal<KnowledgeDoc | null>(null);
  readonly removingNote = this.removingNote_.asReadonly();

  /** The opaque project rev, threaded to source mutations as a best-effort CAS hint. */
  readonly rev = computed(() => this.state()?.rev);

  /** The raw knowledge view for the editor's honesty preview + stack tags (null when absent). */
  readonly knowledgeView = computed<KnowledgeView | null>(() => this.state()?.knowledge ?? null);

  /** The whole-projection note total drives the count badge + whether Ask shows. */
  readonly total = computed(() => {
    const c = this.state()?.knowledge?.counts;
    return c ? c.project + c.common : 0;
  });

  readonly proposals = computed<readonly KnowledgeProposal[]>(() => this.state()?.knowledge?.proposals ?? []);

  /** The doc-list region behind its own guard — a malformed knowledge slice fails only this region. */
  readonly knowledge = computed<Derived<KnowledgeView> | null>(() => {
    const k = this.state()?.knowledge;
    return k ? derive(() => k) : null;
  });

  /** The sources region behind its own guard. */
  readonly sources = computed<Derived<readonly KbSource[]> | null>(() => {
    const s = this.state();
    return s ? derive(() => s.knowledge?.sources ?? []) : null;
  });

  openAdd(): void {
    this.editingNote_.set(null);
    this.editorOpen_.set(true);
  }

  openEdit(doc: KnowledgeDoc): void {
    this.editingNote_.set(doc);
    this.editorOpen_.set(true);
  }

  closeEditor(): void {
    this.editorOpen_.set(false);
    this.editingNote_.set(null);
  }

  onEditorApplied(state: ProjectState): void {
    // A successful add/edit/move re-derives the page from fresh state; a 409 reconcile also flows
    // here (the editor keeps itself open for the operator to retry from server truth).
    this.applied.emit(state);
  }

  openRemove(doc: KnowledgeDoc): void {
    this.removingNote_.set(doc);
    this.removeOpen_.set(true);
  }

  closeRemove(): void {
    this.removeOpen_.set(false);
    this.removingNote_.set(null);
  }

  onRemoveApplied(state: ProjectState): void {
    this.applied.emit(state);
  }
}
