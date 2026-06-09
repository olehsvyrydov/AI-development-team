import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { KnowledgeScope, KnowledgeView, ProjectState } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** Maximum bytes the markdown body may carry, mirroring the hub's server-side cap. */
const MAX_BODY_BYTES = 64 * 1024;
/** Maximum title length the hub accepts before slugging. */
const MAX_TITLE_CHARS = 200;

/** Plain-language note kinds, matching the hub's closed vocabulary. */
const KINDS = ['context', 'rule', 'style', 'pattern'] as const;
/** Stack tags the form offers in addition to the project's declared stack; `any` always present. */
const STACK_TAGS = ['any', 'node', 'typescript', 'python', 'rust', 'go', 'java', 'kotlin', 'ruby', 'php', 'docker', 'ci'] as const;

type Lifecycle = 'idle' | 'saving' | 'added' | 'error';

const UTF8 = new TextEncoder();

/**
 * Add-note form for the Knowledge panel — a paste-a-note composer (required title + markdown body)
 * that writes one contained markdown file to a knowledge vault. The client sends a title, a body,
 * and the note's classifying metadata: a `scope` chosen from a FIXED enum (This project / Common),
 * and optional `stack`/`kind` tags. It never names a path, filename, or directory — the hub derives
 * a safe, contained filename and `scope` selects one of two server-known vault roots, so the form
 * cannot escape the knowledge base. On success the hub returns the fresh project state (whose
 * Knowledge projection already carries the new doc + incremented count) which the form lifts to the
 * shell via {@link applied}; the list and count refresh from that single source of truth.
 *
 * Security: the body and tags are untrusted. Any echo/preview renders through interpolation only
 * (escaped, `white-space: pre-wrap`) — never `[innerHTML]` — so a `<script>` is shown as literal
 * text. The scope is a fixed radiogroup, never a free path. The size cap is enforced before sending
 * and the server enforces it again as the backstop.
 *
 * Honesty: the indexing preview reflects the project's real method and never claims semantic
 * indexing unless an embedder is genuinely configured. The copy states plainly that nothing is
 * uploaded — this is a local file write; Common is shared across the operator's own projects on
 * this machine, never a cloud.
 */
@Component({
  selector: 'dart-add-note-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <section class="form" aria-labelledby="add-note-heading">
      <header class="form__head">
        <dart-glyph name="add-comment" />
        <h3 class="form__title" id="add-note-heading">Add knowledge</h3>
      </header>

      <p class="form__local"><dart-glyph name="info" /> This saves a markdown file on this machine — nothing is uploaded anywhere.</p>

      <label class="lbl" for="add-note-title">Title <span class="req" aria-hidden="true">*</span></label>
      <input
        id="add-note-title"
        class="ctl"
        data-testid="note-title"
        type="text"
        required
        autocomplete="off"
        [attr.maxlength]="maxTitle"
        [value]="title()"
        (input)="onTitle($event)"
        [attr.aria-invalid]="titleTooLong() ? 'true' : null"
      />
      <p class="meter" data-testid="note-title-size">{{ title().length }} / {{ maxTitle }}</p>
      @if (titleTooLong()) {
        <p class="field-hint field-hint--bad">Title is too long (max {{ maxTitle }}).</p>
      }

      <label class="lbl" for="add-note-body">Body (markdown)</label>
      <textarea
        id="add-note-body"
        class="ctl ctl--area"
        data-testid="note-body"
        rows="6"
        [value]="body()"
        (input)="onBody($event)"
        [attr.aria-invalid]="bodyTooLarge() ? 'true' : null"
      ></textarea>
      <p class="meter" data-testid="note-size">{{ bodySizeLabel() }} / 64 KB</p>
      @if (bodyTooLarge()) {
        <p class="field-hint field-hint--bad">Note is too large (max 64 KB).</p>
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
            [class.seg__opt--on]="scope() === 'project'"
            (click)="setScope('project')"
          >
            <dart-glyph name="scope-project" /> This project
          </button>
          <button
            type="button"
            class="seg__opt"
            data-testid="note-scope-common"
            role="radio"
            [attr.aria-checked]="scope() === 'common'"
            [class.seg__opt--on]="scope() === 'common'"
            (click)="setScope('common')"
          >
            <dart-glyph name="scope-common" /> Common
          </button>
        </div>
        @if (scope() === 'common') {
          <p class="scope__hint" data-testid="note-scope-hint">
            Common is shared across your own projects on this machine — never uploaded, never a cloud.
          </p>
        }
      </fieldset>

      <div class="tags">
        <div class="tags__field">
          <label class="lbl" for="add-note-stack">Stack</label>
          <select id="add-note-stack" class="ctl" data-testid="note-stack" [value]="stack()" (change)="onStack($event)">
            <option value="">any</option>
            @for (s of stackTags(); track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </div>
        <div class="tags__field">
          <label class="lbl" for="add-note-kind">Kind</label>
          <select id="add-note-kind" class="ctl" data-testid="note-kind" [value]="kind()" (change)="onKind($event)">
            @for (k of kinds; track k) {
              <option [value]="k">{{ k }}</option>
            }
          </select>
        </div>
      </div>

      <p class="form__index" data-testid="note-index-preview"><dart-glyph name="info" /> {{ indexPreview() }}</p>

      @if (lifecycle() === 'error') {
        <p class="banner banner--error" role="alert" data-testid="note-error"><dart-glyph name="cross" /> {{ message() }}</p>
      }
      <p class="status" data-testid="note-status" role="status" aria-live="polite">
        @if (lifecycle() === 'added') { <dart-glyph name="check" /> {{ message() }} }
        @else if (lifecycle() === 'saving') { Adding note… }
      </p>

      <div class="form__actions">
        <button type="button" class="btn" data-testid="note-cancel" (click)="cancel.emit()">Cancel</button>
        <button
          type="button"
          class="btn btn--primary"
          data-testid="note-submit"
          [disabled]="!canSubmit()"
          (click)="submit()"
        >
          @if (lifecycle() === 'saving') { <dart-glyph name="spinner" /> Adding… }
          @else { <dart-glyph name="save" /> Add to knowledge }
        </button>
      </div>
    </section>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .form__head { display: flex; align-items: center; gap: 0.4rem; color: var(--kb-text); }
    .form__title { margin: 0; font-size: var(--kb-text-md, 0.95rem); font-weight: 600; }
    .form__local { display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .lbl { font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); }
    .req { color: var(--kb-danger); }
    .ctl { width: 100%; padding: 0.4rem 0.55rem; font: inherit; font-size: var(--kb-text-sm); color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); box-sizing: border-box; }
    .ctl:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .ctl--area { resize: vertical; min-height: 6rem; font-family: var(--kb-font-mono, monospace); }
    .meter { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); text-align: right; }
    .field-hint { margin: 0; font-size: var(--kb-text-xs); }
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
    .scope__hint { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .tags { display: flex; gap: var(--kb-space-2); }
    .tags__field { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; }
    .form__index { display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .banner--error { display: flex; align-items: center; gap: 0.35rem; margin: 0; padding: 0.4rem var(--kb-space-2); font-size: var(--kb-text-sm); color: var(--kb-danger); background: var(--kb-accent-soft); border: 1px solid var(--kb-danger); border-radius: var(--kb-radius-md); }
    .status { display: flex; align-items: center; gap: 0.35rem; margin: 0; min-height: 1.1rem; font-size: var(--kb-text-sm); color: var(--kb-success); }
    .form__actions { display: flex; justify-content: flex-end; gap: var(--kb-space-2); margin-top: var(--kb-space-1, 0.25rem); }
    .btn { padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn:hover { border-color: var(--kb-border-strong); }
    .btn--primary { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); border-color: var(--kb-accent); }
    .btn[disabled] { opacity: 0.55; cursor: default; }
  `,
})
export class AddNoteFormComponent {
  private readonly cp = inject(ControlPlaneService);

  /** The current Knowledge view, read to keep the indexing preview honest and stock the stack tags. */
  readonly base = input.required<KnowledgeView | null>();
  /** Fresh project state to adopt on a successful add (carries the new doc + incremented count). */
  readonly applied = output<ProjectState>();
  /** The operator dismissed the form without adding. */
  readonly cancel = output<void>();

  protected readonly maxTitle = MAX_TITLE_CHARS;
  protected readonly kinds = KINDS;
  readonly title = signal('');
  readonly body = signal('');
  /** The chosen vault. Defaults to `project` — the narrowest, least-sharing scope. */
  readonly scope = signal<KnowledgeScope>('project');
  /** Empty string means "any" (the form sends `['any']` or omits a narrowing tag). */
  readonly stack = signal('');
  readonly kind = signal<string>('context');
  readonly lifecycle = signal<Lifecycle>('idle');
  readonly message = signal('');

  /** The project's declared stack first, then the rest of the closed vocabulary (deduped). */
  readonly stackTags = computed(() => {
    const declared = (this.base()?.stack ?? []).filter((s) => s && s !== 'any');
    const rest = STACK_TAGS.filter((s) => s !== 'any' && !declared.includes(s));
    return [...declared, ...rest];
  });

  /** Body size in whole kilobytes, measured as UTF-8 bytes the way the server caps it. */
  private readonly bodyBytes = computed(() => UTF8.encode(this.body()).length);
  /** Live size label against the 64 KB cap: exact bytes under 1 KB, otherwise whole kilobytes. */
  readonly bodySizeLabel = computed(() => {
    const bytes = this.bodyBytes();
    return bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`;
  });
  readonly bodyTooLarge = computed(() => this.bodyBytes() > MAX_BODY_BYTES);
  readonly titleTooLong = computed(() => this.title().length > MAX_TITLE_CHARS);

  private readonly titleValid = computed(() => this.title().trim().length > 0 && !this.titleTooLong());
  readonly canSubmit = computed(
    () => this.lifecycle() !== 'saving' && this.titleValid() && !this.bodyTooLarge(),
  );

  readonly indexPreview = computed(() =>
    this.base()?.method === 'local-embeddings'
      ? 'Indexed for semantic recall via local embeddings.'
      : 'Saved as a filename-indexed note (no semantic embedding).',
  );

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

  private clearOutcome(): void {
    if (this.lifecycle() === 'error' || this.lifecycle() === 'added') this.lifecycle.set('idle');
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.lifecycle.set('saving');
    this.message.set('');
    const stack = this.stack() ? [this.stack()] : ['any'];
    const res = await this.cp.addKbNote({
      title: this.title().trim(),
      body: this.body(),
      scope: this.scope(),
      stack,
      kind: this.kind(),
    });
    if (res.ok === true) {
      const name = res.doc?.name;
      this.title.set('');
      this.body.set('');
      this.lifecycle.set('added');
      this.message.set(name ? `Note added — saved as ${name}.` : 'Note added.');
      if (res.state) this.applied.emit(res.state);
    } else {
      this.lifecycle.set('error');
      this.message.set(this.friendlyError(res.error));
    }
  }

  /** Map the terse hub reason to an honest, actionable message; the list is left unchanged. */
  private friendlyError(reason: string): string {
    const lower = reason.toLowerCase();
    if (lower.includes('large') || lower.includes('413')) return 'Note is too large (max 64 KB).';
    if (lower.includes('filename') || lower.includes('slug') || lower.includes('title')) {
      return "That title can't be turned into a filename — add some letters or numbers.";
    }
    if (lower.includes('refus') || lower.includes('guard') || lower.includes('forbidden')) {
      return 'Couldn’t save — the write was refused by the local guard.';
    }
    return `Couldn’t add the note. ${reason}`;
  }
}
