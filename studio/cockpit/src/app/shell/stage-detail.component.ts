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
import type { GateDef, TicketView, WorkflowView } from '../core/models';
import {
  cardGateSummary,
  cardVisualStatus,
  commentsNewestFirst,
  dwellSince,
  enteredCurrentStageAt,
  stageActivity,
  stageGateNode,
  stageRoleLine,
  statusChip,
  STAGE_ACTIVITY_CAP,
  type CardGateSummary,
  type StageActivityEntry,
  type StageColumn,
  type StageGateNode,
} from './board';
import { gateRowsFor, gateStateView, type GateRowView } from './gate-view';
import { GlyphComponent } from './glyph.component';

/** The render-ready view of one in-stage task ROW (compact — never the chain's full `#cardTpl`). */
interface TaskRow {
  readonly ticket: TicketView;
  readonly id: string;
  readonly title: string;
  readonly status: { readonly glyph: string; readonly label: string };
  readonly visual: string;
  readonly owner: string;
  readonly gate: CardGateSummary | null;
  readonly dwell: string | null;
  /** The newest comment as the "what it's doing now" line, or null when the ticket has no comments. */
  readonly latest: { readonly author: string; readonly kind: string; readonly body: string } | null;
}

/**
 * Right-side slide-in STAGE-DETAIL drawer — a read-only LENS onto the full current process at one
 * pipeline stage: its identity (name, owner, step N of M, an honest role line, what's next), its
 * governing gate(s) rolled up + per-task provenance (with a prominent blocker banner for a rejected
 * gate), every task sitting at the stage as a compact clickable row showing what each is doing now,
 * and the merged newest-first activity log. A stage with no tasks renders an honest empty state; a
 * stage removed from the workflow while open renders a retained-name + "no longer in the workflow".
 *
 * The drawer is a pure projection of its `column` input, which the host re-derives from live
 * `state()` by STAGE NAME on every SSE push — never a frozen snapshot. It owns NO write path:
 * status is read-only, and every task row / blocker link / activity id drills through to the
 * existing task-detail (via `openTicket`), where the guarded control-plane Approve/Reject/Advance
 * remain the sole mutations. Untrusted text (stage, owner, gate name/note, title, comment
 * author/body/kind, ts) reaches the DOM through interpolation only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-stage-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <div
      class="stage-scrim"
      data-testid="stage-scrim"
      (click)="onScrimClick()"
    >
      <aside
        class="stage-drawer"
        #drawer
        data-testid="stage-drawer"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        (click)="$event.stopPropagation()"
        (keydown)="onKeydown($event)"
      >
        <header class="sd-identity" data-testid="stage-identity">
          <button #closeBtn type="button" class="sd-close" data-testid="stage-close" aria-label="Close" (click)="close.emit()">
            <dart-glyph name="cross" />
          </button>
          <h2 class="sd-name" [id]="titleId" data-testid="stage-detail-name">{{ column().stage }}</h2>

          @if (removed()) {
            <p class="sd-removed" data-testid="stage-removed">This stage is no longer in the workflow.</p>
          } @else {
            <p class="sd-meta">
              @if (column().owner) {
                <span class="sd-owner" data-testid="stage-detail-owner"><dart-glyph name="agent" /> {{ column().owner }}</span>
              }
              <span class="sd-position" data-testid="stage-detail-position">step {{ stageIndex() + 1 }} of {{ stageCount() }}</span>
            </p>
            <p class="sd-role" data-testid="stage-detail-role">{{ roleLine() }}</p>
            <p class="sd-next" data-testid="stage-detail-next">
              @if (nextStage(); as n) {
                <dart-glyph name="advance" /> Next: {{ n }}
              } @else {
                This is the last stage before Done.
              }
            </p>
          }
        </header>

        @if (!removed()) {
          <section
            class="sd-gate"
            #gateSection
            tabindex="-1"
            data-testid="stage-gate-section"
            [attr.aria-label]="'Gate for ' + column().stage"
          >
            @if (blocker(); as b) {
              <div class="sd-blocker" data-testid="stage-gate-blocker" [attr.data-shape]="b.shape" role="alert">
                <dart-glyph name="warning" />
                <span class="sd-blocker__word">Blocked here</span>
                <span>— {{ b.name }} is rejected. {{ b.parked }} task(s) parked.</span>
                <span class="sd-blocker__links">
                  @for (t of b.tickets; track t.id) {
                    <button type="button" class="sd-link" [attr.data-testid]="'stage-blocker-link-' + t.id" (click)="openTicket.emit(t)">{{ t.id }}</button>
                  }
                </span>
              </div>
            }

            @if (gateNode(); as g) {
              <p class="sd-gate__head">
                <span class="sd-gate__shape" [attr.data-shape]="g.shape" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path d="M12 6 L18 12 L12 18 L6 12 Z" [attr.fill]="g.shape === 'hard' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" [attr.stroke-dasharray]="g.shape === 'soft' ? '3 2' : null" />
                  </svg>
                </span>
                <span class="sd-gate__name">{{ g.name }}</span>
                @if (column().tickets.length > 0) {
                  <span class="sd-gate__state" data-testid="stage-gate-state" [class]="'tone--' + gateTone(g.state)"><dart-glyph [name]="gateGlyph(g.state)" /> {{ g.state }}</span>
                }
                @if (g.total > 1) {
                  <span class="sd-gate__tally">{{ g.passed }} of {{ g.total }} tasks passed</span>
                }
              </p>

              @if (column().tickets.length === 0) {
                <p class="muted" data-testid="stage-gate-empty">No tasks to gate yet.</p>
              }

              @for (row of gateRows(); track row.ticketId) {
                <div class="sd-gaterow" [attr.data-testid]="'stage-gate-row-' + row.gate.name + '-' + row.ticketId">
                  <button type="button" class="sd-link sd-gaterow__id" (click)="openTicket.emit(row.ticket)">{{ row.ticketId }}</button>
                  <span class="sd-gaterow__state" [class]="'tone--' + row.gate.state.tone"><dart-glyph [name]="row.gate.state.glyph" /> {{ row.gate.state.text }}</span>
                  <span class="sd-gaterow__by">
                    @if (row.gate.by) { decided by {{ row.gate.by }} } @else if (row.gate.owner) { owner {{ row.gate.owner }} }
                  </span>
                  @if (row.gate.at) {
                    <span class="sd-gaterow__at" [attr.title]="row.gate.at">{{ row.gate.at }}</span>
                  }
                  @if (row.gate.note) {
                    <span class="sd-gaterow__note">rationale: {{ row.gate.note }}</span>
                  }
                </div>
              }
            } @else {
              <p class="muted" data-testid="stage-gate-none">No gate governs this stage.</p>
            }
          </section>

          <section class="sd-tasks" data-testid="stage-tasks" [attr.aria-label]="'Tasks at ' + column().stage">
            <h3 class="sd-h">Tasks at this stage @if (rows().length) { ({{ rows().length }}) }</h3>
            @if (rows().length === 0) {
              <p class="muted" data-testid="stage-tasks-empty">
                No tasks at this stage right now.
                @if (emptyReassurance(); as r) { <span class="sd-reassure">{{ r }}</span> }
              </p>
            }
            @for (row of rows(); track row.id) {
              <button type="button" class="sd-task" [attr.data-testid]="'stage-task-' + row.id" (click)="openTicket.emit(row.ticket)">
                <span class="sd-task__line">
                  <span class="sd-task__id">{{ row.id }}</span>
                  <span class="sd-task__title">{{ row.title }}</span>
                  <dart-glyph name="advance" />
                </span>
                <span class="sd-task__chips">
                  <span class="chip" [attr.data-status]="row.visual"><dart-glyph [name]="row.status.glyph" /> {{ row.status.label }}</span>
                  <span class="chip"><dart-glyph name="agent" /> {{ row.owner }}</span>
                  @if (row.gate; as gs) {
                    @if (gs.kind === 'gate') {
                      <span class="chip" [class]="'tone--' + gs.tone" [attr.data-shape]="gs.shape"><dart-glyph [name]="gs.glyph" /> {{ gs.name }} {{ gs.text }}</span>
                    } @else {
                      <span class="chip"><dart-glyph name="check" /> {{ gs.passed }}/{{ gs.total }} gates</span>
                    }
                  }
                  @if (row.dwell; as d) {
                    <span class="chip"><dart-glyph name="pending" /> here {{ d }}</span>
                  }
                </span>
                <span class="sd-task__now" [attr.data-testid]="'stage-task-activity-' + row.id">
                  @if (row.latest; as a) {
                    now: {{ a.author }} · {{ a.kind }} · {{ a.body }}
                  } @else {
                    No activity logged yet.
                  }
                </span>
              </button>
            }
          </section>

          <section class="sd-activity" data-testid="stage-activity" aria-label="Activity log">
            <h3 class="sd-h">Activity (process log)</h3>
            @if (activity().length === 0) {
              <p class="muted" data-testid="stage-activity-empty">No recent activity at this stage.</p>
            } @else if (activityCapped()) {
              <p class="muted sd-act__cap" data-testid="stage-activity-capped">Showing the {{ activityCap }} most recent entries.</p>
            }
            @for (entry of activity(); track $index) {
              <p class="sd-act" [attr.data-testid]="'stage-activity-entry-' + $index">
                <span class="sd-act__author">{{ entry.comment.author }}</span>
                <span class="sd-act__kind">[{{ entry.comment.kind || 'comment' }}]</span>
                <span class="sd-act__ts" [attr.title]="entry.comment.ts">{{ entry.comment.ts }}</span>
                @if (entry.ticketId) {
                  <button type="button" class="sd-link sd-act__id" (click)="openByEntry(entry)">{{ entry.ticketId }}</button>
                }
                <span class="sd-act__body">{{ entry.comment.body }}</span>
              </p>
            }
          </section>
        }
      </aside>
    </div>
  `,
  styles: `
    :host { --kb-dur-base: 160ms; --kb-ease-out: cubic-bezier(0.16, 1, 0.3, 1); }
    @media (prefers-reduced-motion: reduce) { :host { --kb-dur-base: 0ms; } }
    /* z-index 40 sits BELOW the task-detail modal (50) so a drilled-through ticket modal stacks on
       top of the drawer; ESC closes the top-most surface (the modal) first. */
    .stage-scrim { position: fixed; inset: 0; display: flex; justify-content: flex-end; background: color-mix(in srgb, #000 45%, transparent); z-index: 40; }
    .stage-drawer { position: relative; width: min(34rem, 100%); height: 100%; display: flex; flex-direction: column; background: var(--kb-surface); border-left: 1px solid var(--kb-border); box-shadow: var(--kb-shadow-lg, -10px 0 40px rgba(0,0,0,0.4)); overflow-y: auto; animation: sd-slide var(--kb-dur-base) var(--kb-ease-out); }
    @keyframes sd-slide { from { transform: translateX(100%); } to { transform: none; } }
    @media (prefers-reduced-motion: reduce) { .stage-drawer { animation: none; } }
    @media (max-width: 640px) { .stage-drawer { width: 100%; } }

    .sd-identity { position: sticky; top: 0; z-index: 2; padding: var(--kb-space-4); background: var(--kb-surface); border-bottom: 1px solid var(--kb-border); }
    .sd-close { position: absolute; top: var(--kb-space-3); right: var(--kb-space-3); display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; color: var(--kb-text-muted); background: transparent; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .sd-close:hover { color: var(--kb-text); }
    .sd-name { margin: 0 2.5rem 0 0; font-size: var(--kb-text-xl); font-weight: 700; overflow-wrap: anywhere; }
    .sd-meta { margin: 0.4rem 0 0; display: flex; align-items: center; gap: var(--kb-space-3); flex-wrap: wrap; color: var(--kb-text-muted); font-size: var(--kb-text-sm); }
    .sd-owner { display: inline-flex; align-items: center; gap: 0.3rem; }
    .sd-role { margin: 0.4rem 0 0; color: var(--kb-text); font-size: var(--kb-text-sm); overflow-wrap: anywhere; }
    .sd-next { margin: 0.4rem 0 0; display: inline-flex; align-items: center; gap: 0.3rem; color: var(--kb-text-muted); font-size: var(--kb-text-sm); }
    .sd-removed { margin: 0.5rem 0 0; color: var(--kb-text-muted); font-size: var(--kb-text-sm); }

    .sd-gate { position: sticky; top: 0; z-index: 1; padding: var(--kb-space-3) var(--kb-space-4); border-bottom: 1px solid var(--kb-border); background: var(--kb-surface); }
    .sd-gate:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: -2px; }
    .sd-blocker { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; margin-bottom: var(--kb-space-2); padding: var(--kb-space-2) var(--kb-space-3); color: var(--kb-danger); border: 2px solid var(--kb-danger); border-radius: var(--kb-radius-md); background: color-mix(in srgb, var(--kb-danger) 10%, transparent); font-size: var(--kb-text-sm); }
    .sd-blocker[data-shape='soft'] { color: var(--kb-warning); border-color: var(--kb-warning); background: color-mix(in srgb, var(--kb-warning) 10%, transparent); }
    .sd-blocker__word { font-weight: 700; }
    .sd-blocker__links { display: inline-flex; gap: 0.3rem; }
    .sd-gate__head { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin: 0 0 var(--kb-space-2); font-size: var(--kb-text-sm); }
    .sd-gate__shape { display: inline-flex; color: var(--kb-text-muted); }
    .sd-gate__name { font-weight: 600; }
    .sd-gate__state { display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 600; }
    .sd-gate__tally { color: var(--kb-text-muted); font-size: var(--kb-text-xs); }
    .sd-gaterow { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; padding: 0.3rem 0; font-size: var(--kb-text-sm); }
    .sd-gaterow__state { display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 600; }
    .sd-gaterow__by, .sd-gaterow__at, .sd-gaterow__note { color: var(--kb-text-muted); }

    .sd-tasks, .sd-activity { padding: var(--kb-space-3) var(--kb-space-4); }
    .sd-activity { border-top: 1px solid var(--kb-border); }
    .sd-h { margin: 0 0 var(--kb-space-2); font-size: var(--kb-text-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--kb-text-muted); }
    .muted { color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .sd-reassure { display: block; margin-top: 0.2rem; color: var(--kb-text-muted); }

    .sd-task { display: flex; flex-direction: column; gap: 0.3rem; width: 100%; margin-bottom: var(--kb-space-2); padding: var(--kb-space-2); text-align: left; font: inherit; color: inherit; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .sd-task:hover { border-color: var(--kb-border-strong, var(--kb-text-muted)); }
    .sd-task:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .sd-task__line { display: flex; align-items: center; gap: 0.4rem; }
    .sd-task__id { font-family: var(--kb-font-mono, monospace); font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .sd-task__title { flex: 1 1 auto; min-width: 0; font-weight: 600; font-size: var(--kb-text-sm); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .sd-task__chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .sd-task__now { font-size: var(--kb-text-xs); color: var(--kb-text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .chip { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.05rem 0.35rem; font-size: var(--kb-text-xs); border: 1px solid var(--kb-border); border-radius: 999px; }
    .chip[data-shape='soft'] { border-style: dashed; }

    .sd-act { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 var(--kb-space-2); font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .sd-act__author { font-weight: 600; color: var(--kb-text); }
    .sd-act__body { flex-basis: 100%; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--kb-text); }
    .sd-act__cap { margin: 0 0 var(--kb-space-2); font-size: var(--kb-text-xs); }

    .sd-link { font: inherit; font-size: inherit; font-family: var(--kb-font-mono, monospace); color: var(--kb-accent); background: transparent; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
    .sd-link:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .tone--success { color: var(--kb-success); }
    .tone--danger { color: var(--kb-danger); }
    .tone--muted { color: var(--kb-text-muted); }

    @media (pointer: coarse) { .sd-close, .sd-task { min-height: 44px; } }
  `,
})
export class StageDetailComponent {
  /** The stage's live column, RE-DERIVED by the host from `state()` by stage name on every push. */
  readonly column = input.required<StageColumn>();
  /** The stage's index in the rendered rail (drives "step N of M"). */
  readonly stageIndex = input.required<number>();
  /** The rendered rail length (the honest count of the pipeline the operator sees). */
  readonly stageCount = input.required<number>();
  /** The next stage in order, or null at the last stage before Done. */
  readonly nextStage = input.required<string | null>();
  readonly gateDefs = input<readonly GateDef[]>([]);
  readonly workflowView = input<WorkflowView | null>(null);
  /** The furthest in-progress rendered-rail index — drives the empty-stage behind/ahead reassurance. */
  readonly activeSegment = input<number>(-1);
  /** When true, open with focus on the gate section rather than the close button. */
  readonly focusGate = input<boolean>(false);
  /** True when the open stage has been removed from the workflow during a live push. */
  readonly removed = input<boolean>(false);
  /** Injectable wall clock for the dwell signal (deterministic in tests). */
  readonly now = input<number>(Date.now());

  /** Closed by the close button, Escape, or a scrim click; the host returns focus to the trigger node. */
  readonly close = output<void>();
  /** Drill through to the existing task-detail for a ticket (the host owns the modal + the writes). */
  readonly openTicket = output<TicketView>();

  private readonly seq = Math.random().toString(36).slice(2, 8);
  readonly titleId = `stage-title-${this.seq}`;

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly gateSectionEl = viewChild<ElementRef<HTMLElement>>('gateSection');
  private readonly drawer = viewChild<ElementRef<HTMLElement>>('drawer');

  readonly roleLine = computed(() => stageRoleLine(this.column(), this.workflowView()));
  readonly gateNode = computed<StageGateNode | null>(() => stageGateNode(this.column()));
  readonly activity = computed<readonly StageActivityEntry[]>(() => stageActivity(this.column()));

  /** The cap the activity log truncates to, surfaced so the note can name the same number it enforces. */
  readonly activityCap = STAGE_ACTIVITY_CAP;

  /** True only when more comments exist across the stage's tickets than the log shows — so the
   *  "most recent shown" note appears only when the list is genuinely truncated (absent-not-zero). */
  readonly activityCapped = computed<boolean>(() => {
    const total = this.column().tickets.reduce((n, t) => n + (t.comments?.length ?? 0), 0);
    return total > this.activityCap;
  });

  /** Per-ticket gate provenance rows for the governing gate, in the stage's most-actionable order. */
  readonly gateRows = computed(() => {
    const node = this.gateNode();
    if (!node) return [];
    const out: { ticketId: string; ticket: TicketView; gate: GateRowView }[] = [];
    for (const t of this.sortedTickets()) {
      const row = gateRowsFor(t, this.gateDefs()).find((g) => g.name === node.name);
      if (row) out.push({ ticketId: t.id ?? '', ticket: t, gate: row });
    }
    return out;
  });

  /** The rejected-gate blocker, or null when the gate is not rejected. */
  readonly blocker = computed(() => {
    const node = this.gateNode();
    if (!node || node.state !== 'rejected') return null;
    const parked = this.column().tickets.filter((t) =>
      (t.gates ?? []).some((g) => g.name === node.name && (g.state ?? '').toLowerCase() === 'rejected'),
    );
    return { name: node.name, shape: node.shape, parked: parked.length, tickets: parked };
  });

  /** The in-stage tickets as compact rows, most-actionable first. */
  readonly rows = computed<readonly TaskRow[]>(() => {
    const wf = this.workflowView();
    const nowMs = this.now();
    return this.sortedTickets().map((t) => {
      const newest = commentsNewestFirst(t.comments)[0];
      return {
        ticket: t,
        id: t.id ?? '',
        title: t.title ?? '',
        status: statusChip(t.status),
        visual: cardVisualStatus(t, wf),
        owner: t.assignee || t.expectedOwner || 'unassigned',
        gate: cardGateSummary(t, wf),
        dwell: dwellSince(enteredCurrentStageAt(t), nowMs),
        latest: newest ? { author: newest.author ?? '', kind: newest.kind ?? 'comment', body: newest.body ?? '' } : null,
      };
    });
  });

  /** Reassurance for an empty stage: behind the active front → already passed; ahead → will arrive. */
  readonly emptyReassurance = computed<string | null>(() => {
    if (this.column().tickets.length > 0) return null;
    const active = this.activeSegment();
    if (active < 0) return null;
    const i = this.stageIndex();
    if (i <= active) return 'Work has already passed through here.';
    return 'Work will arrive here as the team advances it.';
  });

  constructor() {
    effect(() => {
      if (this.focusGate() && !this.removed()) {
        const el = this.gateSectionEl()?.nativeElement;
        if (el) {
          queueMicrotask(() => {
            el.focus();
            el.scrollIntoView?.({ block: 'start' });
          });
          return;
        }
      }
      const btn = this.closeBtn()?.nativeElement;
      if (btn) queueMicrotask(() => btn.focus());
    });
  }

  /** Most-actionable order: rejected-gate tickets, then gate-unmet, then the rest (generalised sort). */
  private sortedTickets(): readonly TicketView[] {
    const node = this.gateNode();
    const gateName = node?.name;
    const rank = (t: TicketView): number => {
      if (!gateName) return 2;
      const g = (t.gates ?? []).find((x) => x.name === gateName);
      const state = (g?.state ?? '').toLowerCase();
      if (state === 'rejected') return 0;
      if (state !== 'passed') return 1;
      return 2;
    };
    return [...this.column().tickets].sort((a, b) => rank(a) - rank(b));
  }

  gateTone(state: StageGateNode['state']): string {
    return gateStateView(state).tone;
  }

  gateGlyph(state: StageGateNode['state']): string {
    return gateStateView(state).glyph;
  }

  openByEntry(entry: StageActivityEntry): void {
    const t = this.column().tickets.find((x) => x.id === entry.ticketId);
    if (t) this.openTicket.emit(t);
  }

  onScrimClick(): void {
    this.close.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close.emit();
      return;
    }
    if (event.key === 'Tab') this.trapFocus(event);
  }

  private trapFocus(event: KeyboardEvent): void {
    const root = this.drawer()?.nativeElement;
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
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
