import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { KnowledgeDoc, KnowledgeScope, KnowledgeView, ProjectState } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** Maximum bytes the markdown body may carry, mirroring the hub's server-side cap. */
const MAX_BODY_BYTES = 64 * 1024;
/** Maximum title length the hub accepts before slugging. */
const MAX_TITLE_CHARS = 200;
/** Plain-language note kinds, matching the hub's closed vocabulary. */
const KINDS = ['context', 'rule', 'style', 'pattern'] as const;
/** The scope radios in segment order — the roving arrow keys walk this sequence. */
const SCOPE_ORDER: readonly KnowledgeScope[] = ['project', 'common'];
/** Stack tags the form offers in addition to the project's declared stack; `any` always present. */
const STACK_TAGS = ['any', 'node', 'typescript', 'python', 'rust', 'go', 'java', 'kotlin', 'ruby', 'php', 'docker', 'ci'] as const;

/** The one place the local-write reassurance lives — a future store swap is a one-line change here. */
const LOCAL_WRITE_LINE = "Saves to this project's knowledge on this machine — nothing is uploaded.";

type Lifecycle = 'idle' | 'saving' | 'saved' | 'error';

const UTF8 = new TextEncoder();

/**
 * The Knowledge editor drawer — one focus-trapped right-side sheet that both ADDS a new note and
 * EDITS an existing one, generalising the add-note composer. It keeps the doc list visible behind
 * it (`role="dialog"`, `aria-modal`, focus-trapped, `Esc` closes); the opener restores focus to the
 * trigger that summoned it.
 *
 * Add mode (`note` absent): a fresh composer → `addKbNote` (additive, no `expectedRev`).
 *
 * Edit mode (`note` present): the fields pre-fill from the note; the title is READ-ONLY (the slug
 * is identity — a rename is add+delete, said honestly). Submit → `editKbNote` with the note's
 * `id`/`file` and `expectedRev = note.rev` (a guarded CAS). A scope change off the loaded value is a
 * vault MOVE the server performs; the drawer discloses the consequence inline before save (the
 * over-share guard) so a re-scope is never silent.
 *
 * Conflict (409) is a FIRST-CLASS outcome, never an error toast: on `ok:'conflict'` the drawer
 * re-fills its fields from the fresh note carried by the returned state, shows an inline "changed
 * elsewhere — reloaded" line, and lifts that fresh state via {@link applied} so the whole page
 * re-derives — never an optimistic clobber of a concurrent edit.
 *
 * Security: title/body/excerpt/tags are UNTRUSTED. The preview renders through interpolation only
 * (escaped, `white-space: pre-wrap`) — never `[innerHTML]`. The scope is a fixed radiogroup, never
 * a free path; the size cap is enforced before sending and the server enforces it again.
 */
@Component({
  selector: 'dart-note-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    @if (open()) {
      <div class="backdrop" (click)="cancel()">
        <div
          #drawer
          class="drawer"
          data-testid="note-editor"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="editing() ? 'Edit note' : 'Add knowledge'"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="onKeydown($event)"
        >
          <header class="drawer__head">
            @if (editing()) {
              <dart-glyph name="edit" />
              <h2 class="drawer__title" data-testid="note-editor-title">Edit: {{ note()?.name }}</h2>
            } @else {
              <dart-glyph name="add-comment" />
              <h2 class="drawer__title" data-testid="note-editor-title">Add knowledge</h2>
            }
            <button type="button" class="icon-btn" data-testid="note-editor-close" aria-label="Close" (click)="cancel()">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <div class="drawer__body">
            <p class="local"><dart-glyph name="info" /> {{ localWriteLine }}</p>

            <label class="lbl" for="note-editor-title-input">Title <span class="req" aria-hidden="true">*</span></label>
            <input
              id="note-editor-title-input"
              class="ctl"
              data-testid="note-title"
              type="text"
              required
              autocomplete="off"
              [attr.maxlength]="maxTitle"
              [value]="title()"
              [disabled]="editing()"
              [attr.readonly]="editing() ? '' : null"
              (input)="onTitle($event)"
              [attr.aria-invalid]="titleTooLong() ? 'true' : null"
            />
            @if (editing()) {
              <p class="field-hint" data-testid="note-title-readonly">Renaming makes a new note — remove this one and add it again.</p>
            } @else {
              <p class="meter" data-testid="note-title-size">{{ title().length }} / {{ maxTitle }}</p>
            }
            @if (titleTooLong()) {
              <p class="field-hint field-hint--bad">Title is too long (max {{ maxTitle }}).</p>
            }

            <label class="lbl" for="note-editor-body">Body (markdown) <span class="req" aria-hidden="true">*</span></label>
            <textarea
              id="note-editor-body"
              class="ctl ctl--area"
              data-testid="note-body"
              rows="8"
              [value]="body()"
              (input)="onBody($event)"
              [attr.aria-invalid]="bodyTooLarge() || bodyEmpty() ? 'true' : null"
            ></textarea>
            <p class="meter" data-testid="note-size">{{ bodySizeLabel() }} / 64 KB</p>
            @if (bodyTooLarge()) {
              <p class="field-hint field-hint--bad">Note is too large (max 64 KB).</p>
            } @else if (bodyEmpty()) {
              <p class="field-hint field-hint--bad" data-testid="note-body-empty">Body is required.</p>
            }

            @if (body().length) {
              <details class="preview">
                <summary class="preview__sum">Preview</summary>
                <pre class="preview__body" data-testid="note-preview">{{ body() }}</pre>
              </details>
            }

            <fieldset class="scope" data-testid="note-scope" role="radiogroup" aria-label="Scope">
              <legend class="lbl">Scope</legend>
              <div class="seg">
                <button
                  type="button"
                  class="seg__opt"
                  data-testid="note-scope-project"
                  role="radio"
                  [attr.aria-checked]="scope() === 'project'"
                  [attr.tabindex]="scope() === 'project' ? 0 : -1"
                  [class.seg__opt--on]="scope() === 'project'"
                  (click)="setScope('project')"
                  (keydown)="onScopeKeydown($event, 'project')"
                >
                  <dart-glyph name="scope-project" /> This project
                </button>
                <button
                  type="button"
                  class="seg__opt"
                  data-testid="note-scope-common"
                  role="radio"
                  [attr.aria-checked]="scope() === 'common'"
                  [attr.tabindex]="scope() === 'common' ? 0 : -1"
                  [class.seg__opt--on]="scope() === 'common'"
                  (click)="setScope('common')"
                  (keydown)="onScopeKeydown($event, 'common')"
                >
                  <dart-glyph name="scope-common" /> Common
                </button>
              </div>
              @if (scopeChange(); as disclosure) {
                <p class="scope__move" data-testid="note-scope-change" role="status" aria-live="polite">
                  <dart-glyph name="info" [size]="12" /> {{ disclosure }}
                </p>
              }
              @if (scope() === 'common') {
                <p class="scope__hint" data-testid="note-scope-hint">
                  Common is shared across your own projects on this machine — never uploaded, never a cloud.
                </p>
              }
            </fieldset>

            <div class="tags">
              <div class="tags__field">
                <label class="lbl" for="note-editor-stack">Stack</label>
                <select id="note-editor-stack" class="ctl" data-testid="note-stack" [value]="stack()" (change)="onStack($event)">
                  <option value="">any</option>
                  @for (s of stackTags(); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
              <div class="tags__field">
                <label class="lbl" for="note-editor-kind">Kind</label>
                <select id="note-editor-kind" class="ctl" data-testid="note-kind" [value]="kind()" (change)="onKind($event)">
                  @for (k of kinds; track k) {
                    <option [value]="k">{{ k }}</option>
                  }
                </select>
              </div>
            </div>

            <p class="index" data-testid="note-index-preview"><dart-glyph name="info" /> {{ indexPreview() }}</p>

            @if (lifecycle() === 'error') {
              <p class="banner banner--error" role="alert" data-testid="note-error"><dart-glyph name="cross" /> {{ message() }}</p>
            }
            <p class="status" data-testid="note-status" role="status" aria-live="polite">
              @if (lifecycle() === 'saved') { <dart-glyph name="check" /> {{ message() }} }
              @else if (lifecycle() === 'saving') { {{ editing() ? 'Saving…' : 'Adding note…' }} }
              @else if (reconciled()) { <span data-testid="note-conflict">This note changed elsewhere — reloaded.</span> }
            </p>
          </div>

          <footer class="drawer__foot">
            <button type="button" class="btn" data-testid="note-cancel" (click)="cancel()">Cancel</button>
            <button
              type="button"
              class="btn btn--primary"
              data-testid="note-submit"
              [disabled]="!canSubmit()"
              (click)="submit()"
            >
              @if (lifecycle() === 'saving') { <dart-glyph name="spinner" /> {{ editing() ? 'Saving…' : 'Adding…' }} }
              @else { <dart-glyph name="save" /> {{ editing() ? 'Save note' : 'Add to knowledge' }} }
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; display: flex; justify-content: flex-end; background: rgba(0, 0, 0, 0.5); z-index: 60; }
    .drawer { display: flex; flex-direction: column; width: min(32rem, 100%); max-height: 100vh; background: var(--kb-surface); border-left: 1px solid var(--kb-border); box-shadow: var(--kb-shadow-md); color: var(--kb-text); }
    @media (prefers-reduced-motion: no-preference) { .drawer { animation: drawer-in var(--kb-dur-base, 0.18s) var(--kb-ease-out, ease-out); } }
    @keyframes drawer-in { from { transform: translateX(1.5rem); opacity: 0.6; } }
    .drawer:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: -2px; }
    .drawer__head { display: flex; align-items: center; gap: 0.4rem; padding: var(--kb-space-3) var(--kb-space-4); border-bottom: 1px solid var(--kb-border); }
    .drawer__title { margin: 0; margin-right: auto; font-size: var(--kb-text-lg); font-weight: 600; overflow-wrap: anywhere; }
    .icon-btn { display: inline-flex; padding: 0.25rem; color: var(--kb-text-muted); background: transparent; border: none; border-radius: var(--kb-radius-md); cursor: pointer; }
    .icon-btn:hover { color: var(--kb-text); background: var(--kb-surface-muted); }
    .drawer__body { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-4); }
    .local { display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .lbl { font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); }
    .req { color: var(--kb-danger); }
    .ctl { width: 100%; padding: 0.4rem 0.55rem; font: inherit; font-size: var(--kb-text-sm); color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); box-sizing: border-box; }
    .ctl:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .ctl[disabled] { opacity: 0.7; cursor: default; }
    .ctl--area { resize: vertical; min-height: 8rem; font-family: var(--kb-font-mono, monospace); }
    .meter { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); text-align: right; }
    .field-hint { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .field-hint--bad { color: var(--kb-danger); }
    .preview { font-size: var(--kb-text-xs); }
    .preview__sum { cursor: pointer; color: var(--kb-text-muted); }
    .preview__body { margin: 0.3rem 0 0; padding: var(--kb-space-2); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); color: var(--kb-text-muted); }
    .scope { margin: 0; padding: 0; border: none; display: flex; flex-direction: column; gap: 0.35rem; }
    .scope legend { padding: 0; }
    .seg { display: inline-flex; gap: 0.25rem; padding: 0.2rem; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); width: fit-content; }
    .seg__opt { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text-subtle); background: transparent; border: none; border-radius: var(--kb-radius-sm, 0.3rem); cursor: pointer; }
    .seg__opt--on { color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); }
    .seg__opt:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .scope__move { display: flex; align-items: flex-start; gap: 0.35rem; margin: 0; padding: 0.4rem var(--kb-space-2); font-size: var(--kb-text-xs); color: var(--kb-text); background: var(--kb-accent-soft); border: 1px solid color-mix(in srgb, var(--kb-accent) 40%, var(--kb-border)); border-radius: var(--kb-radius-md); }
    .scope__hint { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .tags { display: flex; gap: var(--kb-space-2); }
    .tags__field { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; }
    .index { display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .banner--error { display: flex; align-items: center; gap: 0.35rem; margin: 0; padding: 0.4rem var(--kb-space-2); font-size: var(--kb-text-sm); color: var(--kb-danger); background: var(--kb-accent-soft); border: 1px solid var(--kb-danger); border-radius: var(--kb-radius-md); }
    .status { display: flex; align-items: center; gap: 0.35rem; margin: 0; min-height: 1.1rem; font-size: var(--kb-text-sm); color: var(--kb-success); }
    .drawer__foot { display: flex; justify-content: flex-end; gap: var(--kb-space-2); padding: var(--kb-space-3) var(--kb-space-4); border-top: 1px solid var(--kb-border); }
    .btn { padding: 0.4rem 0.8rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn:hover { border-color: var(--kb-border-strong); }
    .btn:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .btn--primary { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); border-color: var(--kb-accent); }
    .btn[disabled] { opacity: 0.55; cursor: default; }
  `,
})
export class NoteEditorComponent {
  private readonly cp = inject(ControlPlaneService);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly drawerRef = viewChild<ElementRef<HTMLElement>>('drawer');

  /** Whether the drawer is open. */
  readonly open = input(false);
  /** The note being edited; absent → add mode. */
  readonly note = input<KnowledgeDoc | null>(null);
  /** The current Knowledge view, read to keep the index preview honest and stock the stack tags. */
  readonly base = input<KnowledgeView | null>(null);
  /** Fresh project state to adopt on a successful add/edit/move (or a 409 reconcile). */
  readonly applied = output<ProjectState>();
  /** The operator dismissed the drawer without saving. */
  readonly cancelled = output<void>();

  protected readonly maxTitle = MAX_TITLE_CHARS;
  protected readonly kinds = KINDS;
  protected readonly localWriteLine = LOCAL_WRITE_LINE;

  readonly title = signal('');
  readonly body = signal('');
  readonly scope = signal<KnowledgeScope>('project');
  readonly stack = signal('');
  readonly kind = signal<string>('context');
  readonly lifecycle = signal<Lifecycle>('idle');
  readonly message = signal('');
  /** True after a 409 re-filled the fields from fresh state, so the inline reconcile line shows. */
  readonly reconciled = signal(false);

  /** The note's scope as loaded, against which a scope move is detected (edit only). */
  private readonly loadedScope = signal<KnowledgeScope>('project');

  readonly editing = computed(() => this.note() != null);

  constructor() {
    // Re-seed the fields whenever the drawer opens or the bound note changes, and move focus into
    // the drawer so the trap has somewhere to start. A re-fill from a 409 reconcile is handled in
    // submit() directly (it must not depend on the note input changing).
    effect(() => {
      const open = this.open();
      const note = this.note();
      if (!open) return;
      this.seedFrom(note);
      queueMicrotask(() => this.drawerRef()?.nativeElement.focus());
    });
  }

  private seedFrom(note: KnowledgeDoc | null): void {
    this.lifecycle.set('idle');
    this.message.set('');
    this.reconciled.set(false);
    if (note) {
      this.title.set(note.name);
      // The projection carries only a short, server-capped excerpt — NOT the full body — so seeding
      // body from it would silently truncate on save. Body starts empty in edit; the operator enters
      // the new content (validation blocks an empty submit). The excerpt is a preview only, not source.
      this.body.set('');
      this.scope.set(note.scope);
      this.loadedScope.set(note.scope);
      this.stack.set((note.stack ?? []).find((s) => s && s !== 'any') ?? '');
      this.kind.set(note.kind ?? 'context');
    } else {
      this.title.set('');
      this.body.set('');
      this.scope.set('project');
      this.loadedScope.set('project');
      this.stack.set('');
      this.kind.set('context');
    }
  }

  readonly stackTags = computed(() => {
    const declared = (this.base()?.stack ?? []).filter((s) => s && s !== 'any');
    const rest = STACK_TAGS.filter((s) => s !== 'any' && !declared.includes(s));
    return [...declared, ...rest];
  });

  private readonly bodyBytes = computed(() => UTF8.encode(this.body()).length);
  readonly bodySizeLabel = computed(() => {
    const bytes = this.bodyBytes();
    return bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`;
  });
  readonly bodyTooLarge = computed(() => this.bodyBytes() > MAX_BODY_BYTES);
  readonly titleTooLong = computed(() => this.title().length > MAX_TITLE_CHARS);

  private readonly titleValid = computed(() => this.title().trim().length > 0 && !this.titleTooLong());
  private readonly bodyValid = computed(() => this.body().trim().length > 0 && !this.bodyTooLarge());
  readonly bodyEmpty = computed(() => this.title().trim().length > 0 && this.body().trim().length === 0);
  readonly canSubmit = computed(() => this.lifecycle() !== 'saving' && this.titleValid() && this.bodyValid());

  readonly indexPreview = computed(() =>
    this.base()?.method === 'local-embeddings'
      ? 'Indexed for semantic recall via local embeddings.'
      : 'Saved as a filename-indexed note (no semantic embedding).',
  );

  /** The over-share disclosure: shown only in edit mode when the scope moves off the loaded value. */
  readonly scopeChange = computed<string | null>(() => {
    if (!this.editing()) return null;
    const from = this.loadedScope();
    const to = this.scope();
    if (from === to) return null;
    return to === 'common'
      ? 'Moving from This project to Common — your other projects on this machine will be able to see this note (it stays on your machine; never a cloud).'
      : 'Moving from Common to This project — your other projects on this machine will no longer see this note.';
  });

  onTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
    this.clearOutcome();
  }

  onBody(event: Event): void {
    this.body.set((event.target as HTMLTextAreaElement).value);
    this.clearOutcome();
  }

  onStack(event: Event): void {
    this.stack.set((event.target as HTMLSelectElement).value);
  }

  onKind(event: Event): void {
    this.kind.set((event.target as HTMLSelectElement).value);
  }

  setScope(scope: KnowledgeScope): void {
    this.scope.set(scope);
  }

  onScopeKeydown(event: KeyboardEvent, scope: KnowledgeScope): void {
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
    this.hostEl.nativeElement.querySelector<HTMLElement>(`[data-testid="note-scope-${next}"]`)?.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    } else if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const root = this.drawerRef()?.nativeElement;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = root.ownerDocument.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || active === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  cancel(): void {
    this.cancelled.emit();
  }

  private clearOutcome(): void {
    if (this.lifecycle() === 'error' || this.lifecycle() === 'saved') this.lifecycle.set('idle');
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.lifecycle.set('saving');
    this.message.set('');
    this.reconciled.set(false);
    const stack = this.stack() ? [this.stack()] : ['any'];

    if (this.editing()) {
      const note = this.note()!;
      const res = await this.cp.editKbNote({
        id: note.file ? undefined : note.name,
        file: note.file,
        title: note.name,
        body: this.body(),
        scope: this.scope(),
        stack,
        kind: this.kind(),
        expectedRev: note.rev,
      });
      if (res.ok === true) {
        this.lifecycle.set('saved');
        this.message.set('Note saved.');
        if (res.state) this.applied.emit(res.state);
      } else if (res.ok === 'conflict') {
        this.reconcile(res.state, note);
      } else {
        this.fail(res.error);
      }
      return;
    }

    const res = await this.cp.addKbNote({
      title: this.title().trim(),
      body: this.body(),
      scope: this.scope(),
      stack,
      kind: this.kind(),
    });
    if (res.ok === true) {
      this.lifecycle.set('saved');
      this.message.set(res.doc?.name ? `Note added — saved as ${res.doc.name}.` : 'Note added.');
      if (res.state) this.applied.emit(res.state);
    } else {
      this.fail(res.error);
    }
  }

  /**
   * Reconcile a 409: re-fill the fields from the FRESH version of this note in the returned state
   * (so the operator continues from server truth, not their stale copy), surface the inline reload
   * line, and lift the fresh state so the whole page re-derives. Never a clobber, never an error
   * toast. When the note has vanished from fresh state (removed elsewhere) the fields stay as typed
   * and only the state is lifted, so the page reflects the deletion.
   */
  private reconcile(state: ProjectState | null, note: KnowledgeDoc): void {
    this.lifecycle.set('idle');
    this.reconciled.set(true);
    const fresh = findDoc(state, note);
    if (fresh) this.seedAfterReload(fresh);
    if (state) this.applied.emit(state);
  }

  private seedAfterReload(note: KnowledgeDoc): void {
    // Re-fill the metadata + the loaded scope from server truth; KEEP the operator's typed body (it
    // is the new content they intend to save, and the projection has no full body to restore).
    this.title.set(note.name);
    this.scope.set(note.scope);
    this.loadedScope.set(note.scope);
    this.stack.set((note.stack ?? []).find((s) => s && s !== 'any') ?? '');
    this.kind.set(note.kind ?? 'context');
    this.reconciled.set(true);
  }

  private fail(reason: string): void {
    this.lifecycle.set('error');
    this.message.set(friendlyKbError(reason));
  }
}

/** Locate a note in a fresh projection by file (preferred) or scope+name, for a 409 re-fill. */
function findDoc(state: ProjectState | null, ref: KnowledgeDoc): KnowledgeDoc | null {
  const docs = state?.knowledge?.docs ?? [];
  if (ref.file) {
    const byFile = docs.find((d) => d.file === ref.file);
    if (byFile) return byFile;
  }
  return docs.find((d) => d.scope === ref.scope && d.name === ref.name) ?? null;
}

/** Map a terse hub reason to an honest, actionable message; covers add/update/remove reasons. */
function friendlyKbError(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes('large') || lower.includes('413')) return 'Note is too large (max 64 KB).';
  if (lower.includes('not found') || lower.includes('unknown')) {
    return 'That note is no longer here — refresh and try again.';
  }
  if (lower.includes('filename') || lower.includes('slug') || lower.includes('title')) {
    return "That title can't be turned into a filename — add some letters or numbers.";
  }
  if (lower.includes('refus') || lower.includes('guard') || lower.includes('forbidden')) {
    return 'Couldn’t save — the write was refused by the local guard.';
  }
  return `Couldn’t save the note. ${reason}`;
}
