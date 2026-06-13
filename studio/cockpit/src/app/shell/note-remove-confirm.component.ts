import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { KnowledgeDoc, ProjectState } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** Human label for a scope, echoed in the confirm copy so the operator confirms the right vault. */
const SCOPE_LABEL = { project: 'Project', common: 'Common' } as const;

type Phase = 'idle' | 'busy' | 'error' | 'conflict';

/**
 * The remove-note confirm — a small CENTRED `role="alertdialog"` (a yes/no decision, not a drawer).
 * `aria-modal`, focus-trapped, `Esc` = Cancel, and INITIAL FOCUS ON CANCEL (the destructive default
 * is never auto-focused). It echoes the note's name + scope (escaped) and states the honest
 * consequence ("your agents stop following it") so a removal is never blind.
 *
 * Submit → `removeKbNote { id|file, scope, expectedRev: note.rev }` (a guarded CAS soft-delete). A
 * 409 is a FIRST-CLASS outcome, never an error toast: the confirm HOLDS, shows "changed elsewhere —
 * refresh", and lifts the fresh state via {@link applied} so the page re-derives — it does NOT
 * blind-delete. On success the page adopts fresh state, the row leaves the list, and the count
 * decrements from that single source of truth.
 *
 * Security: the note name is UNTRUSTED and reaches the DOM through interpolation only (escaped).
 */
@Component({
  selector: 'dart-note-remove-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    @if (open() && note(); as n) {
      <div class="backdrop" (click)="cancel()">
        <div
          #dialog
          class="dialog"
          data-testid="note-remove-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="remove-confirm-title"
          aria-describedby="remove-confirm-body"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="onKeydown($event)"
        >
          <header class="dialog__head">
            <dart-glyph name="trash" />
            <h2 class="dialog__title" id="remove-confirm-title">Remove this note?</h2>
          </header>
          <p class="dialog__body" id="remove-confirm-body">
            “{{ n.name }}” ({{ scopeOf(n) }}) will be removed from this project on your machine.
            Your agents stop following it. This isn't sent anywhere, and it can't be undone here.
          </p>

          @if (phase() === 'conflict') {
            <p class="note" role="status" aria-live="polite" data-testid="note-remove-conflict">
              <dart-glyph name="info" [size]="12" /> This note changed elsewhere — refresh.
            </p>
          } @else if (phase() === 'error') {
            <p class="note note--err" role="alert" data-testid="note-remove-error">
              <dart-glyph name="cross" [size]="12" /> {{ message() }}
            </p>
          }

          <footer class="dialog__foot">
            <button #cancelBtn type="button" class="btn" data-testid="note-remove-confirm-cancel" (click)="cancel()">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn--danger"
              data-testid="note-remove-confirm-ok"
              [disabled]="phase() === 'busy'"
              (click)="confirm(n)"
            >
              @if (phase() === 'busy') { <dart-glyph name="spinner" [size]="14" /> Removing… }
              @else { <dart-glyph name="trash" [size]="14" /> Remove note }
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--kb-space-4); background: rgba(0, 0, 0, 0.55); z-index: 70; }
    .dialog { display: flex; flex-direction: column; gap: var(--kb-space-3); width: min(28rem, 100%); padding: var(--kb-space-4); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-lg); box-shadow: var(--kb-shadow-md); color: var(--kb-text); }
    .dialog:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .dialog__head { display: flex; align-items: center; gap: 0.4rem; color: var(--kb-danger); }
    .dialog__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 700; color: var(--kb-text); }
    .dialog__body { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); line-height: 1.5; overflow-wrap: anywhere; }
    .note { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .note--err { color: var(--kb-danger); }
    .dialog__foot { display: flex; justify-content: flex-end; gap: var(--kb-space-2); }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.8rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn:hover { border-color: var(--kb-border-strong); }
    .btn:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .btn--danger { color: #fff; background: var(--kb-danger); border-color: var(--kb-danger); }
    .btn[disabled] { opacity: 0.55; cursor: default; }
  `,
})
export class NoteRemoveConfirmComponent {
  private readonly cp = inject(ControlPlaneService);
  private readonly dialogRef = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly cancelBtn = viewChild<ElementRef<HTMLButtonElement>>('cancelBtn');

  /** Whether the confirm is open. */
  readonly open = input(false);
  /** The note proposed for removal. */
  readonly note = input<KnowledgeDoc | null>(null);
  /** Fresh project state to adopt on a successful remove (or a 409 reconcile). */
  readonly applied = output<ProjectState>();
  /** The operator cancelled (Cancel / Esc / backdrop). */
  readonly cancelled = output<void>();

  private readonly phase_ = signal<Phase>('idle');
  readonly phase = this.phase_.asReadonly();
  readonly message = signal('');

  constructor() {
    // On open, reset the phase and place INITIAL FOCUS ON CANCEL — the destructive default is never
    // auto-focused, so an accidental Enter cancels rather than deletes.
    effect(() => {
      if (!this.open()) return;
      this.phase_.set('idle');
      this.message.set('');
      queueMicrotask(() => this.cancelBtn()?.nativeElement.focus());
    });
  }

  scopeOf(n: KnowledgeDoc): string {
    return SCOPE_LABEL[n.scope === 'common' ? 'common' : 'project'];
  }

  cancel(): void {
    this.cancelled.emit();
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
    const root = this.dialogRef()?.nativeElement;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>('button:not([disabled])');
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

  async confirm(note: KnowledgeDoc): Promise<void> {
    if (this.phase_() === 'busy') return;
    this.phase_.set('busy');
    this.message.set('');
    const res = await this.cp.removeKbNote({
      id: note.file ? undefined : note.name,
      file: note.file,
      scope: note.scope,
      expectedRev: note.rev,
    });
    if (res.ok === true) {
      this.phase_.set('idle');
      if (res.state) this.applied.emit(res.state);
      this.cancelled.emit();
    } else if (res.ok === 'conflict') {
      // Hold the confirm; reconcile from fresh state. Never a blind delete, never an error toast.
      this.phase_.set('conflict');
      if (res.state) this.applied.emit(res.state);
    } else {
      this.phase_.set('error');
      this.message.set(friendlyRemoveError(res.error));
    }
  }
}

/** Map a terse hub reason to an honest, actionable removal message. */
function friendlyRemoveError(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes('not found') || lower.includes('unknown')) {
    return 'That note is no longer here — refresh.';
  }
  if (lower.includes('refus') || lower.includes('guard') || lower.includes('forbidden')) {
    return 'Couldn’t remove — the write was refused by the local guard.';
  }
  return `Couldn’t remove the note. ${reason}`;
}
