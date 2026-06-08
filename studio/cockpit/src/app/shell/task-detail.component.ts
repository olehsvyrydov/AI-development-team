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
import { ControlPlaneService, type MutationResult } from '../core/control-plane.service';
import type { GateDef, ProjectState, TicketView } from '../core/models';
import { commentsNewestFirst, nextStage } from './board';
import { GlyphComponent } from './glyph.component';
import { gateRowsFor, type GateRowView } from './gate-view';

/** Server-enforced comment-body cap (8 KB). Mirrored here so over-cap is blocked before sending. */
const COMMENT_BODY_MAX = 8192;

/** A pending gate decision the operator is confirming (with an optional rationale note). */
interface PendingDecision {
  readonly gate: string;
  readonly state: 'passed' | 'rejected';
}

/**
 * Focus-trapped task detail dialog. Renders a ticket's status/stage/assignee, its gate rows
 * (hard/soft by shield SHAPE, passed/rejected/pending by glyph + text), an escaped comments
 * timeline (newest-first), an add-comment composer (≤ 8 KB), and Approve/Reject on the gate that
 * governs the current stage.
 *
 * The dialog is a pure projection of its `ticket` input, which the shell refreshes on every SSE
 * push. A live refresh updates the gates/timeline in place WITHOUT clearing the composer draft —
 * the draft is component-local and only cleared on a successful post. Mutations ride the guarded
 * control plane with the current `rev`; a 409 surfaces an inline conflict notice and the shell
 * adopts the fresh server state, never a silent overwrite.
 *
 * Untrusted text (title, author, body, note, trigger, owner) reaches the DOM through interpolation
 * only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-task-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <div
      class="scrim"
      data-testid="detail-scrim"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      (keydown)="onKeydown($event)"
      (click)="onScrimClick($event)"
    >
      <div class="modal" #modal (click)="$event.stopPropagation()">
        <button #closeBtn type="button" class="modal__close" data-testid="detail-close" aria-label="Close" (click)="close.emit()">
          <dart-glyph name="cross" />
        </button>

        <header class="head" data-testid="detail-header">
          <div class="head__row">
            <span class="head__id">{{ ticket().id }}</span>
            <span class="pill" data-testid="detail-stage">stage: {{ ticket().stage }}</span>
            @if (advanceTo(); as to) {
              <button type="button" class="btn btn--ghost head__advance" data-testid="detail-advance" [disabled]="busy()" (click)="advance(to)">
                <dart-glyph name="advance" /> Advance to {{ to }}
              </button>
            }
          </div>
          <h2 class="head__title" [id]="titleId">{{ ticket().title }}</h2>
          <p class="head__meta">
            <dart-glyph name="agent" /> <span>{{ ticket().assignee || ticket().expectedOwner || 'unassigned' }}</span>
            <span class="head__status" [class]="'tone--' + statusTone()" data-testid="detail-status">
              <dart-glyph [name]="statusGlyph()" /> {{ ticket().status }}
            </span>
          </p>
        </header>

        @if (conflict(); as c) {
          <div class="conflict" role="alert" data-testid="detail-conflict">
            <dart-glyph name="conflict" />
            <span>This task changed elsewhere — reloaded to the current state. Your action was not applied.</span>
            <button type="button" class="btn btn--ghost" data-testid="detail-conflict-dismiss" (click)="dismissConflict()">Dismiss</button>
          </div>
        }

        <section class="gates" aria-label="Gates">
          <h3 class="section__h">Gates</h3>
          @if (gateRows().length === 0) {
            <p class="muted" data-testid="gates-empty">No gates triggered for this ticket.</p>
          }
          @for (g of gateRows(); track g.name) {
            <div class="gate" [attr.data-testid]="'gate-' + g.name">
              <span class="gate__shield" [attr.data-shape]="g.shape" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    d="M12 3 L19 6 V11 C19 16 15 19 12 21 C9 19 5 16 5 11 V6 Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                    [attr.stroke-dasharray]="g.shape === 'soft' ? '3 2' : null"
                  />
                </svg>
              </span>
              <span class="gate__shape-label">{{ g.shape }}</span>
              <span class="gate__state" [class]="'tone--' + g.state.tone">
                <dart-glyph [name]="g.state.glyph" /> {{ g.state.text }}
              </span>
              <span class="gate__name">{{ g.name }}</span>
              <span class="gate__by">
                @if (g.by) { decided by {{ g.by }} } @else if (g.owner) { owner {{ g.owner }} }
              </span>
              @if (g.trigger.length) {
                <span class="gate__trigger">trigger: {{ g.trigger.join(', ') }}</span>
              }
              @if (g.note) {
                <span class="gate__note">rationale: {{ g.note }}</span>
              }
              @if (g.decidable) {
                <span class="gate__actions">
                  <button type="button" class="btn btn--ok" data-testid="gate-approve" [disabled]="busy()" (click)="askDecision(g, 'passed')">
                    <dart-glyph name="approve" /> Approve
                  </button>
                  <button type="button" class="btn btn--no" data-testid="gate-reject" [disabled]="busy()" (click)="askDecision(g, 'rejected')">
                    <dart-glyph name="reject" /> Reject
                  </button>
                </span>
              }
            </div>
          }

          @if (pending(); as p) {
            <div class="decide" data-testid="gate-decide">
              <label class="decide__label" [attr.for]="noteId">
                {{ p.state === 'passed' ? 'Approve' : 'Reject' }} {{ p.gate }} — optional rationale
              </label>
              <input [id]="noteId" class="decide__note" data-testid="gate-decide-note" [value]="decideNote()" (input)="decideNote.set($any($event.target).value)" />
              <button type="button" class="btn btn--ghost" data-testid="gate-decide-cancel" (click)="cancelDecision()">Cancel</button>
              <button type="button" class="btn btn--ok" data-testid="gate-decide-confirm" [disabled]="busy()" (click)="confirmDecision()">
                @if (busy()) { <dart-glyph name="spinner" /> } Confirm
              </button>
            </div>
          }
        </section>

        <section class="comments" aria-label="Comments">
          <h3 class="section__h">Comments <span class="muted">(newest first)</span></h3>
          <ul class="timeline" data-testid="comments">
            @for (c of comments(); track c.id) {
              <li class="comment" [attr.data-testid]="'comment-' + (c.id || $index)">
                <p class="comment__meta">
                  <span class="comment__author">{{ c.author }}</span>
                  <span class="comment__kind">[{{ c.kind || 'comment' }}]</span>
                  <span class="comment__time" [attr.title]="c.ts">{{ c.ts }}</span>
                </p>
                <p class="comment__body">{{ c.body }}</p>
              </li>
            } @empty {
              <li class="muted" data-testid="comments-empty">No comments yet.</li>
            }
          </ul>

          <div class="composer">
            <label class="composer__label" [attr.for]="bodyId">Add a comment (as {{ author() }})</label>
            <textarea
              [id]="bodyId"
              class="composer__body"
              data-testid="comment-body"
              rows="3"
              [value]="draft()"
              (input)="draft.set($any($event.target).value)"
              placeholder="Write a comment… (markdown shown as plain text)"
            ></textarea>
            <div class="composer__foot">
              <span class="composer__count" [class.composer__count--over]="overCap()" data-testid="comment-count">
                {{ draft().length }} / {{ max }}
              </span>
              @if (overCap()) {
                <span class="composer__err" data-testid="comment-too-long">Comment is too long (max 8 KB).</span>
              }
              @if (commentError(); as e) {
                <span class="composer__err" role="alert" data-testid="comment-error">{{ e }}</span>
              }
              <button type="button" class="btn btn--primary" data-testid="comment-post" [disabled]="!canPost()" (click)="postComment()">
                @if (posting()) { <dart-glyph name="spinner" /> } <dart-glyph name="add-comment" /> Post comment
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    .scrim { position: fixed; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding: var(--kb-space-5) var(--kb-space-4); background: color-mix(in srgb, #000 55%, transparent); overflow: auto; z-index: 50; }
    .modal { position: relative; width: min(46rem, 100%); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-lg); box-shadow: var(--kb-shadow-lg, 0 10px 40px rgba(0,0,0,0.4)); padding: var(--kb-space-4); display: flex; flex-direction: column; gap: var(--kb-space-3); }
    .modal__close { position: absolute; top: var(--kb-space-3); right: var(--kb-space-3); display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; color: var(--kb-text-muted); background: transparent; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .modal__close:hover { color: var(--kb-text); }
    .head__row { display: flex; align-items: center; gap: var(--kb-space-2); flex-wrap: wrap; }
    .head__id { font-family: var(--kb-font-mono, monospace); color: var(--kb-text-muted); font-size: var(--kb-text-sm); }
    .pill { padding: 0.1rem 0.5rem; font-size: var(--kb-text-xs); border: 1px solid var(--kb-border); border-radius: 999px; color: var(--kb-text-muted); }
    .head__advance { margin-left: auto; }
    .head__title { margin: 0; font-size: var(--kb-text-xl); font-weight: 700; overflow-wrap: anywhere; }
    .head__meta { margin: 0; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; color: var(--kb-text-muted); font-size: var(--kb-text-sm); }
    .head__status { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; }
    .section__h { margin: 0 0 var(--kb-space-2); font-size: var(--kb-text-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--kb-text-muted); }
    .muted { color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .conflict { display: flex; align-items: center; gap: 0.5rem; padding: var(--kb-space-2) var(--kb-space-3); background: color-mix(in srgb, var(--kb-warning) 14%, transparent); border: 1px solid var(--kb-warning); border-radius: var(--kb-radius-md); color: var(--kb-text); font-size: var(--kb-text-sm); }
    .gates, .comments { border-top: 1px solid var(--kb-border); padding-top: var(--kb-space-3); }
    .gate { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.35rem 0; font-size: var(--kb-text-sm); }
    .gate__shield { display: inline-flex; color: var(--kb-text-muted); }
    .gate__shape-label { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); text-transform: uppercase; }
    .gate__state { display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 600; }
    .gate__name { font-weight: 600; }
    .gate__by, .gate__trigger, .gate__note { color: var(--kb-text-muted); }
    .gate__actions { display: inline-flex; gap: 0.4rem; margin-left: auto; }
    .decide { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: var(--kb-space-2); background: var(--kb-surface-muted); border-radius: var(--kb-radius-md); }
    .decide__note { flex: 1 1 12rem; padding: 0.3rem 0.5rem; background: var(--kb-surface); color: var(--kb-text); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .tone--success { color: var(--kb-success); }
    .tone--danger { color: var(--kb-danger); }
    .tone--muted { color: var(--kb-text-muted); }
    .timeline { list-style: none; margin: 0 0 var(--kb-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .comment { padding: var(--kb-space-2); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .comment__meta { margin: 0 0 0.25rem; display: flex; gap: 0.5rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .comment__author { font-weight: 600; color: var(--kb-text); }
    .comment__body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--kb-text-sm); color: var(--kb-text); }
    .composer { display: flex; flex-direction: column; gap: 0.4rem; }
    .composer__body { width: 100%; resize: vertical; padding: 0.5rem; background: var(--kb-surface-muted); color: var(--kb-text); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); font: inherit; }
    .composer__foot { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .composer__count { font-size: var(--kb-text-xs); color: var(--kb-text-muted); margin-right: auto; }
    .composer__count--over { color: var(--kb-danger); }
    .composer__err { color: var(--kb-danger); font-size: var(--kb-text-sm); }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; border-radius: var(--kb-radius-md); border: 1px solid var(--kb-border); background: var(--kb-surface-muted); color: var(--kb-text); cursor: pointer; }
    .btn:disabled { opacity: 0.55; cursor: default; }
    .btn--ghost { background: transparent; }
    .btn--primary { background: var(--kb-accent-soft); color: var(--kb-accent); border-color: var(--kb-accent); }
    .btn--ok { color: var(--kb-success); }
    .btn--no { color: var(--kb-danger); }
  `,
})
export class TaskDetailComponent {
  private readonly cp = inject(ControlPlaneService);

  readonly ticket = input.required<TicketView>();
  readonly gateDefs = input<readonly GateDef[]>([]);
  readonly tracks = input<Readonly<Record<string, readonly string[]>>>({});
  readonly rev = input<string>('');
  readonly author = input<string>('/you');

  /** Closed by the close button, Escape, or a scrim click; the shell returns focus to the card. */
  readonly close = output<void>();
  /** A successful mutation returns fresh server state for the shell to adopt as truth. */
  readonly applied = output<ProjectState>();

  readonly max = COMMENT_BODY_MAX;
  private readonly seq = Math.random().toString(36).slice(2, 8);
  readonly titleId = `detail-title-${this.seq}`;
  readonly bodyId = `detail-body-${this.seq}`;
  readonly noteId = `detail-note-${this.seq}`;

  /** Composer draft — component-local so an SSE-driven ticket refresh never clears it. */
  readonly draft = signal('');
  readonly posting = signal(false);
  readonly commentError = signal<string | null>(null);

  readonly pending = signal<PendingDecision | null>(null);
  readonly decideNote = signal('');
  readonly deciding = signal(false);
  readonly conflict = signal(false);

  readonly busy = computed(() => this.posting() || this.deciding());

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly modal = viewChild<ElementRef<HTMLElement>>('modal');

  readonly comments = computed(() => commentsNewestFirst(this.ticket().comments));
  readonly gateRows = computed<readonly GateRowView[]>(() => gateRowsFor(this.ticket(), this.gateDefs()));
  readonly advanceTo = computed(() => nextStage(this.ticket(), this.tracks()));

  readonly overCap = computed(() => this.draft().length > COMMENT_BODY_MAX);
  readonly canPost = computed(() => this.draft().trim().length > 0 && !this.overCap() && !this.posting());

  readonly statusGlyph = computed(() => {
    switch (this.ticket().status) {
      case 'in_progress':
        return 'progress';
      case 'blocked':
        return 'blocked';
      case 'done':
        return 'check';
      default:
        return 'dot';
    }
  });
  readonly statusTone = computed(() => {
    switch (this.ticket().status) {
      case 'blocked':
        return 'danger';
      case 'done':
        return 'success';
      default:
        return 'muted';
    }
  });

  constructor() {
    // Move focus to the close button when the dialog mounts (legacy modal pattern).
    effect(() => {
      const btn = this.closeBtn()?.nativeElement;
      if (btn) queueMicrotask(() => btn.focus());
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close.emit();
      return;
    }
    if (event.key === 'Tab') this.trapFocus(event);
  }

  onScrimClick(_event: MouseEvent): void {
    this.close.emit();
  }

  private trapFocus(event: KeyboardEvent): void {
    const root = this.modal()?.nativeElement;
    if (!root) return;
    const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async postComment(): Promise<void> {
    if (!this.canPost()) return;
    this.posting.set(true);
    this.commentError.set(null);
    const res = await this.cp.comment({ id: this.ticket().id ?? '', author: this.author(), body: this.draft(), kind: 'comment' });
    this.posting.set(false);
    if (res.ok === true) {
      this.draft.set('');
      this.emitState(res);
    } else if (res.ok === false) {
      this.commentError.set(res.error);
    }
  }

  askDecision(gate: GateRowView, state: 'passed' | 'rejected'): void {
    this.pending.set({ gate: gate.name, state });
    this.decideNote.set('');
  }

  cancelDecision(): void {
    this.pending.set(null);
  }

  async confirmDecision(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    this.deciding.set(true);
    this.conflict.set(false);
    const note = this.decideNote().trim();
    const res = await this.cp.gateSet({
      id: this.ticket().id ?? '',
      gate: p.gate,
      state: p.state,
      by: this.author(),
      expectedRev: this.rev(),
      ...(note ? { note } : {}),
    });
    this.deciding.set(false);
    this.pending.set(null);
    this.reconcile(res);
  }

  async advance(toStage: string): Promise<void> {
    this.deciding.set(true);
    this.conflict.set(false);
    const res = await this.cp.advance({ id: this.ticket().id ?? '', toStage, expectedRev: this.rev(), by: this.author() });
    this.deciding.set(false);
    this.reconcile(res);
  }

  dismissConflict(): void {
    this.conflict.set(false);
  }

  private reconcile(res: MutationResult): void {
    if (res.ok === 'conflict') {
      this.conflict.set(true);
      if (res.state) this.applied.emit(res.state);
      return;
    }
    if (res.ok === true) this.emitState(res);
  }

  private emitState(res: MutationResult): void {
    if (res.ok !== false && res.state) this.applied.emit(res.state);
  }
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
