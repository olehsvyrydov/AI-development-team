import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { BaseView, ProjectState } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** Maximum bytes the markdown body may carry, mirroring the hub's server-side cap. */
const MAX_BODY_BYTES = 64 * 1024;
/** Maximum title length the hub accepts before slugging. */
const MAX_TITLE_CHARS = 200;

type Lifecycle = 'idle' | 'saving' | 'added' | 'error';

const UTF8 = new TextEncoder();

/**
 * Add-note form for the Base panel — a paste-a-note composer (required title + markdown body) that
 * writes one contained markdown file to the project's knowledge base. The client sends ONLY the
 * title and body; the hub derives a safe, contained filename, so the form never names a path,
 * filename, or extension. On success the hub returns the fresh project state (whose base projection
 * already carries the new doc and the incremented count) which the form lifts to the shell via
 * {@link applied}; the list and count refresh from that single source of truth.
 *
 * Security: the body is untrusted. Any echo/preview renders it through interpolation only (escaped,
 * `white-space: pre-wrap`) — never `[innerHTML]` — so a `<script>` in the body is shown as literal
 * text. The size cap is enforced before sending and the server enforces it again as the backstop.
 *
 * Honesty: the indexing preview reflects the project's real method (filename index vs local
 * embeddings) and never claims semantic indexing unless an embedder is genuinely configured; adding
 * a note triggers no embedding job. The copy states plainly that nothing is uploaded — this is a
 * local file write.
 */
@Component({
  selector: 'dart-add-note-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <section class="form" aria-labelledby="add-note-heading">
      <header class="form__head">
        <dart-glyph name="add-comment" />
        <h3 class="form__title" id="add-note-heading">Add a note</h3>
      </header>

      <p class="form__local"><dart-glyph name="info" /> This saves a markdown file in this project — nothing is uploaded anywhere.</p>

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
          @else { <dart-glyph name="save" /> Add note }
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

  /** The current Base view, read to keep the indexing preview honest to the real method. */
  readonly base = input.required<BaseView | null>();
  /** Fresh project state to adopt on a successful add (carries the new doc + incremented count). */
  readonly applied = output<ProjectState>();
  /** The operator dismissed the form without adding. */
  readonly cancel = output<void>();

  protected readonly maxTitle = MAX_TITLE_CHARS;
  readonly title = signal('');
  readonly body = signal('');
  readonly lifecycle = signal<Lifecycle>('idle');
  readonly message = signal('');

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

  private clearOutcome(): void {
    if (this.lifecycle() === 'error' || this.lifecycle() === 'added') this.lifecycle.set('idle');
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.lifecycle.set('saving');
    this.message.set('');
    const res = await this.cp.addKbNote({ title: this.title().trim(), body: this.body() });
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

  /** Map the terse hub reason to an honest, actionable message; the Base list is left unchanged. */
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
