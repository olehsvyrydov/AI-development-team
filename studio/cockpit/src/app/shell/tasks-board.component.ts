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
} from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { ProjectState, TicketView } from '../core/models';
import {
  activeSegmentIndex,
  cardGateSummary,
  cardVisualStatus,
  nextStageInOrder,
  partitionBoard,
  populatedStageCount,
  statusChip,
  ticketNeedsYou,
  worklistBands,
  worklistProgress,
  type BoardPartition,
  type CardGateSummary,
  type CardVisualStatus,
  type OffTrackGroup,
  type StageColumn,
  type WorklistBand,
  type WorklistProgress,
} from './board';
import { GlyphComponent } from './glyph.component';
import { StageDetailComponent } from './stage-detail.component';
import { TaskDetailComponent } from './task-detail.component';
import { TasksWorklistComponent } from './tasks-worklist.component';
import { TasksPipelineComponent } from './tasks-pipeline.component';
import { WorkflowDrawerComponent } from './workflow-drawer.component';
import { WorkflowEditController } from './workflow-edit-controller';

/** The two Tasks view modes: the needs-you-first worklist (default) and the CI-style stage pipeline. */
export type TasksViewMode = 'worklist' | 'pipeline';

const VIEW_MODE_KEY_PREFIX = 'dart.tasks.viewMode.';
const VIEW_MODES: ReadonlySet<string> = new Set<TasksViewMode>(['worklist', 'pipeline']);

/**
 * Tasks board — columns are the active track's workflow STAGES, in order, each holding the tickets
 * whose current stage matches (an empty stage still renders a placeholder column). Status and
 * needs-you are card CHIPS, never columns. A ticket whose stage is no longer in the track is
 * surfaced in a distinct OFF-TRACK lane below the columns — never dropped, never silently re-keyed;
 * it stays openable and advanceable so the operator can re-home it onto a real stage.
 *
 * The board is a pure projection of the single `state` input; the shell refreshes it on every SSE
 * push, so a workflow edit re-lays the columns out live (columns appear/disappear/reorder; a just-
 * removed stage's tickets fall into the off-track lane) and a CLI agent's change appears with no
 * reload. Advance moves a ticket to the NEXT stage in the workflow order via the guarded control
 * plane with the current `rev`; a 409 surfaces an inline conflict and the shell adopts the returned
 * state. Untrusted text (stage, owner, title) is interpolated only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-tasks-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent, StageDetailComponent, TaskDetailComponent, TasksWorklistComponent, TasksPipelineComponent, WorkflowDrawerComponent],
  providers: [WorkflowEditController],
  template: `
    <div class="pipeline" data-testid="pipeline-root" [attr.data-motion]="motionOk() ? 'on' : 'off'">
      <p class="board-live" data-testid="board-live" aria-live="polite" role="status">{{ liveAnnounce() }}</p>

      <header class="board-head">
        @if (projectName()) {
          <p class="board-cue" data-testid="board-project-cue"><dart-glyph name="info" /> Tasks for <strong>{{ projectName() }}</strong></p>
        }
        @if (!isEmpty()) {
          <p class="board-rollup" data-testid="board-rollup">
            <span class="rollup__total"><dart-glyph name="stack" /> {{ totalTasks() }} tasks</span>
            @if (needsYouCount() > 0) {
              <span class="rollup__need" data-testid="rollup-needs-you"><dart-glyph name="need" /> {{ needsYouCount() }} need you</span>
            }
          </p>
          <div class="view-switch" data-testid="view-mode-switch" role="radiogroup" aria-label="View">
            <button
              type="button"
              class="view-switch__opt"
              data-testid="view-mode-worklist"
              role="radio"
              [attr.aria-checked]="effectiveMode() === 'worklist'"
              [attr.data-active]="effectiveMode() === 'worklist'"
              [attr.tabindex]="effectiveMode() === 'worklist' ? 0 : -1"
              (click)="selectMode('worklist')"
              (keydown)="onSwitchKeydown($event)"
            >
              <dart-glyph name="stack" /> Worklist
            </button>
            <button
              type="button"
              class="view-switch__opt"
              data-testid="view-mode-pipeline"
              role="radio"
              [attr.aria-checked]="effectiveMode() === 'pipeline'"
              [attr.data-active]="effectiveMode() === 'pipeline'"
              [attr.tabindex]="effectiveMode() === 'pipeline' ? 0 : -1"
              (click)="selectMode('pipeline')"
              (keydown)="onSwitchKeydown($event)"
            >
              <dart-glyph name="advance" /> Pipeline
            </button>
          </div>
        }
      </header>

      @if (isEmpty()) {
        <p class="board-empty" data-testid="board-empty">No tasks yet — the team will create them as work starts.</p>
      } @else {
        @switch (effectiveMode()) {
        @case ('worklist') {
        <dart-tasks-worklist [bands]="bands()" [progress]="worklistProgress()" [cardTemplate]="cardTpl" />
        }
        @case ('pipeline') {
        <dart-tasks-pipeline
          [columns]="columns()"
          [workflowView]="state().workflowView ?? null"
          [state]="state()"
          [activeSegment]="activeSegment()"
          [backlogCount]="backlog().length"
          [doneCount]="doneTickets().length"
          [offTrackCount]="offTrackCount()"
          [middleEmpty]="middleEmpty()"
          [cardTemplate]="cardTpl"
          [armEdit]="startInEdit()"
          (selectWorklist)="selectMode('worklist')"
          (openStage)="openStage($event)"
          (openDrawer)="openWorkflowDrawer($event)"
        />
        }
        }
      }
    </div>

    <ng-template #cardTpl let-t let-reason="reason">
      <li class="card" [attr.data-testid]="'card-' + t.id" [attr.data-status]="cardStatus(t)" role="listitem">
        <button type="button" class="card__open" data-testid="card-open" (click)="openDetail(t)">
          <span class="card__id">{{ t.id }}</span>
          <span class="card__title">{{ t.title }}</span>
          @if (reason) {
            <span class="card__reason" data-testid="needs-you-reason"><dart-glyph [name]="reason.glyph" /> {{ reason.text }}</span>
          }
          <span class="card__owner"><dart-glyph name="agent" /> {{ t.assignee || t.expectedOwner || 'unassigned' }}</span>
          <span class="card__chips">
            <span class="chip chip--status" data-testid="chip-status"><dart-glyph [name]="status(t).glyph" /> {{ status(t).label }}</span>
            @if (gateSummary(t); as gs) {
              @if (gs.kind === 'gate') {
                <span class="chip" data-testid="chip-gate" [class]="'tone--' + gs.tone" [attr.data-shape]="gs.shape">
                  <dart-glyph [name]="gs.glyph" /> {{ gs.name }} {{ gs.text }}
                </span>
              } @else {
                <span class="chip chip--gate-rollup" data-testid="chip-gate">
                  <dart-glyph name="check" /> {{ gs.passed }}/{{ gs.total }} gates
                </span>
              }
            }
            @if (needsYou(t)) {
              <span class="chip chip--need" data-testid="chip-needs-you"><dart-glyph name="need" /> needs you</span>
            }
            @for (label of cardLabels(t); track label) {
              <span class="chip chip--label" data-testid="chip-label"><dart-glyph name="label" /> {{ label }}</span>
            }
          </span>
        </button>

        <div class="card__menuwrap">
          <button type="button" class="card__kebab" data-testid="card-menu" [attr.aria-expanded]="menuFor() === t.id" aria-haspopup="menu" aria-label="Task actions" (click)="toggleMenu(t.id ?? '')">
            <dart-glyph name="kebab" />
          </button>
          @if (menuFor() === t.id) {
            <div class="menu" role="menu">
              @if (advanceTarget(t); as to) {
                <button type="button" class="menu__item" role="menuitem" data-testid="menu-advance" [disabled]="busyFor() === t.id" (click)="advance(t, to)">
                  <dart-glyph name="advance" /> Advance to {{ to }}
                </button>
              } @else {
                <span class="menu__none" data-testid="menu-no-advance">No further stage</span>
              }
              <button type="button" class="menu__item" role="menuitem" data-testid="menu-open" (click)="openDetail(t)">Open detail</button>
            </div>
          }
        </div>

        @if (conflictFor() === t.id) {
          <p class="card__conflict" role="alert" data-testid="card-conflict">
            <dart-glyph name="conflict" /> This task changed elsewhere — reloaded.
            @if (advanceTarget(t); as to) {
              <button type="button" class="card__retry" data-testid="card-retry" (click)="advance(t, to)">Retry advance</button>
            }
          </p>
        }
        @if (errorFor() === t.id) {
          <p class="card__conflict" role="alert" data-testid="card-error"><dart-glyph name="cross" /> {{ errorText() }}</p>
        }
      </li>
    </ng-template>

    @if (openColumn(); as col) {
      <dart-stage-detail
        [column]="col"
        [stageIndex]="openStageIndex()"
        [stageCount]="columns().length"
        [nextStage]="openNextStage()"
        [gateDefs]="state().gateDefs ?? []"
        [workflowView]="state().workflowView ?? null"
        [activeSegment]="activeSegment()"
        [focusGate]="openStageFocusGate()"
        [removed]="openStageRemoved()"
        (openTicket)="openDetail($event)"
        (close)="closeStage()"
      />
    }

    @if (workflowDrawerOpen()) {
      <dart-workflow-drawer [deepLinkStage]="workflowDrawerStage()" (close)="closeWorkflowDrawer()" />
    }

    @if (selected(); as sel) {
      <dart-task-detail
        [ticket]="sel"
        [gateDefs]="state().gateDefs ?? []"
        [tracks]="state().tracks ?? {}"
        [stageOrder]="stageOrder()"
        [rev]="state().rev ?? ''"
        (applied)="applied.emit($event)"
        (close)="closeDetail()"
      />
    }
  `,
  styles: `
    /* Motion tokens — one place reduced-motion zeroes them; transitions read these. */
    :host { --kb-dur-fast: 120ms; --kb-dur-base: 160ms; --kb-dur-slow: 200ms; --kb-ease-out: cubic-bezier(0.16, 1, 0.3, 1); --kb-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1); }
    @media (prefers-reduced-motion: reduce) { :host { --kb-dur-fast: 0ms; --kb-dur-base: 0ms; --kb-dur-slow: 0ms; } }
    .board-live { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    .board-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--kb-space-2); margin-bottom: var(--kb-space-3); }
    .board-cue { display: flex; align-items: center; gap: 0.3rem; margin: 0; color: var(--kb-text-muted); font-size: var(--kb-text-sm); overflow-wrap: anywhere; }
    .board-cue strong { font-weight: 600; color: var(--kb-text); }
    .board-rollup { display: inline-flex; align-items: center; gap: var(--kb-space-3); margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .rollup__total, .rollup__need { display: inline-flex; align-items: center; gap: 0.3rem; }
    .rollup__need { color: var(--kb-warning); font-weight: 600; }
    .board-empty { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    /* The view-mode switch: a segmented radiogroup. The active option is distinguished by FILL and
       the checked glyph state (data-active) — never hue/position alone — with a 2px focus ring. */
    .view-switch { display: inline-flex; gap: 0; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); overflow: hidden; }
    .view-switch__opt { display: inline-flex; align-items: center; gap: 0.3rem; min-height: 28px; padding: 0.2rem 0.6rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-muted); background: transparent; border: none; cursor: pointer; }
    .view-switch__opt + .view-switch__opt { border-left: 1px solid var(--kb-border); }
    .view-switch__opt[data-active='true'] { color: var(--kb-text); background: var(--kb-surface-muted); font-weight: 600; }
    .view-switch__opt:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: -2px; }
    .card__reason { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-warning); }
    /* The shared card template (#cardTpl), reused verbatim by the Worklist bands and the Pipeline
       stage nodes — the single card design + its guarded advance / open / conflict machinery. */
    .card { position: relative; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); transition: border-color var(--kb-dur-fast) var(--kb-ease-out), box-shadow var(--kb-dur-base) var(--kb-ease-out); }
    .pipeline[data-motion='on'] .card { animation: card-arrive var(--kb-dur-base) var(--kb-ease-out); }
    @keyframes card-arrive { from { opacity: 0.4; transform: translateX(-4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .pipeline .card { animation: none; } }
    .card__open { display: flex; flex-direction: column; gap: 0.3rem; width: 100%; padding: var(--kb-space-2); text-align: left; background: transparent; border: none; color: inherit; cursor: pointer; font: inherit; }
    .card__id { font-family: var(--kb-font-mono, monospace); font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .card__title { font-weight: 600; font-size: var(--kb-text-sm); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .card__owner { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .card__chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.05rem 0.35rem; font-size: var(--kb-text-xs); border: 1px solid var(--kb-border); border-radius: 999px; }
    .chip[data-shape='soft'] { border-style: dashed; }
    .chip--need { color: var(--kb-warning); border-color: var(--kb-warning); }
    .chip--label { color: var(--kb-text-muted); font-family: var(--kb-font-mono, monospace); }
    .chip--gate-rollup { color: var(--kb-text-muted); }
    .chip--status { color: var(--kb-text-muted); }
    .tone--success { color: var(--kb-success); }
    .tone--danger { color: var(--kb-danger); }
    .tone--muted { color: var(--kb-text-muted); }
    .card__menuwrap { position: absolute; top: var(--kb-space-2); right: var(--kb-space-2); }
    .card__kebab { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; color: var(--kb-text-muted); background: transparent; border: 1px solid transparent; border-radius: var(--kb-radius-md); cursor: pointer; }
    .card__kebab:hover { border-color: var(--kb-border); color: var(--kb-text); }
    .menu { position: absolute; top: 1.9rem; right: 0; z-index: 5; min-width: 11rem; display: flex; flex-direction: column; background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); box-shadow: var(--kb-shadow-md, 0 6px 20px rgba(0,0,0,0.3)); overflow: hidden; }
    .menu__item { display: flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.6rem; text-align: left; background: transparent; border: none; color: var(--kb-text); cursor: pointer; font: inherit; font-size: var(--kb-text-sm); }
    .menu__item:hover { background: var(--kb-surface-muted); }
    .menu__none { padding: 0.45rem 0.6rem; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .card__conflict { display: flex; align-items: center; gap: 0.35rem; margin: 0; padding: 0.3rem var(--kb-space-2) var(--kb-space-2); color: var(--kb-warning); font-size: var(--kb-text-xs); }
    .card__retry, .card__kebab + .card__conflict button { font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); background: transparent; border: none; cursor: pointer; text-decoration: underline; }
  `,
})
export class TasksBoardComponent {
  private readonly cp = inject(ControlPlaneService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /**
   * The shared workflow-edit controller, provided here so the pipeline's edit-mode and the workflow
   * drawer both drive ONE CAS + conflict path. The board keeps its state current (the drawer can open
   * from worklist mode where the pipeline child is not mounted) and re-emits its applied state.
   */
  private readonly editCtrl = inject(WorkflowEditController);

  readonly state = input.required<ProjectState>();
  /**
   * The viewed project's display name, shown as a quiet context cue so the operator is never in
   * doubt which project a write lands in (untrusted — interpolated, escaped). Absent → no cue.
   */
  readonly projectName = input<string>('');
  /**
   * When true, open the board in pipeline mode with edit already armed — set when the operator enters
   * from the Workflow panel's "Edit workflow" affordance. The pipeline still resets to View on a fresh
   * mount (this only seeds the initial arm, it is not persisted).
   */
  readonly startInEdit = input<boolean>(false);
  /** A successful (or conflict-resync) mutation returns fresh state for the shell to adopt. */
  readonly applied = output<ProjectState>();

  private readonly openId = signal<string | null>(null);
  readonly menuFor = signal<string | null>(null);
  readonly busyFor = signal<string | null>(null);
  readonly conflictFor = signal<string | null>(null);
  readonly errorFor = signal<string | null>(null);
  readonly errorText = signal('');
  /** A quiet message announced to assistive tech when the board re-lays out from a live push. */
  readonly liveAnnounce = signal('');
  private firstRender = true;
  private prevRev: string | undefined;

  /**
   * Whether tasteful motion is allowed, mirrored from `prefers-reduced-motion`. Drives the host
   * `data-motion` attribute; every transition also reads a `--kb-dur-*` token zeroed under the
   * reduced-motion media query, so motion degrades to instant. No status is carried by motion alone
   * — the status chip, the count, and the text always carry it; motion only narrates the transition.
   */
  readonly motionOk = signal(this.prefersMotion());

  private prefersMotion(): boolean {
    if (typeof matchMedia !== 'function') return true;
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private readonly tickets = computed<readonly TicketView[]>(() => this.state().tickets ?? []);
  readonly stageOrder = computed<readonly string[]>(() => (this.state().workflowView?.stages ?? []).map((s) => s.stage));

  /**
   * The operator's explicit view-mode choice, when set. `null` means "no explicit choice — use the
   * data-derived default". Seeded once from the per-project persisted choice (defensively, since
   * `localStorage` may be absent or throw); a manual switch updates it and re-persists.
   */
  private readonly chosenMode = signal<TasksViewMode | null>(null);
  private persistKeyLoaded: string | null = null;

  /** The worklist's lifecycle bands (Needs-you → … → Off-track), absent-not-zero, claimed disjointly. */
  readonly bands = computed<readonly WorklistBand[]>(() => worklistBands(this.state().workflowView, this.tickets()));

  /**
   * The worklist's top progress picture (done / in-flight / backlog proportions + % done), read off
   * the existing canonical counts (else counted from tickets). `null` on an empty board → suppressed.
   */
  readonly worklistProgress = computed<WorklistProgress | null>(() =>
    worklistProgress(this.state().taskSummary ?? null, this.state().workflowView, this.tickets()),
  );

  /**
   * The data-derived default mode: Pipeline reads best only when work is genuinely mid-flow across
   * ≥2 stages at once; otherwise the needs-you-first Worklist (the dense, never-void default).
   */
  private readonly autoMode = computed<TasksViewMode>(() =>
    populatedStageCount(this.state().workflowView, this.tickets()) >= 2 ? 'pipeline' : 'worklist',
  );

  /**
   * The mode actually rendered: forced to pipeline when entered via "Edit workflow" (the chain is the
   * editor), else the operator's explicit choice, else the data-derived default.
   */
  readonly effectiveMode = computed<TasksViewMode>(() =>
    this.startInEdit() ? 'pipeline' : (this.chosenMode() ?? this.autoMode()),
  );

  /**
   * The single partition of the board into its four disjoint regions, recomputed once per state push
   * (O(tickets + stages): one pass over tickets to place each, one pass over stages to materialize the
   * columns). Each region view below (backlog/columns/done/off-track) is a cheap projection that reads
   * its slice off this one partition, so the per-stage grouping is computed in a single pass rather
   * than recomputing the per-stage filter once per region.
   */
  private readonly partition = computed<BoardPartition>(() => partitionBoard(this.state().workflowView, this.tickets()));

  /**
   * The in-pipeline stage columns: every stage column EXCEPT the literal `backlog` stage (the backlog
   * end-cap replaces it) and the done stage (the done end-cap replaces it). The pipeline chain renders
   * only these — their tickets are the only cards drawn in Pipeline mode.
   */
  readonly columns = computed<readonly StageColumn[]>(() => this.partition().columns);

  /** The Backlog holding pen — tickets not yet routed onto the track (claimed first, disjoint). */
  readonly backlog = computed<readonly TicketView[]>(() => this.partition().backlog);

  /** The finished tickets at the done stage, collapsed behind the done folder. */
  readonly doneTickets = computed<readonly TicketView[]>(() => this.partition().doneTickets);

  readonly offTrack = computed<readonly OffTrackGroup[]>(() => this.partition().offTrack);
  readonly offTrackCount = computed(() => this.offTrack().reduce((n, g) => n + g.tickets.length, 0));

  /** The index of the furthest in-progress stage column — how far the chain's lit active front reaches. */
  readonly activeSegment = computed(() => activeSegmentIndex(this.state().workflowView, this.tickets()));

  /** Header roll-up: the total tasks across the board (from the summary, else the ticket count). */
  readonly totalTasks = computed(() => this.state().taskSummary?.total ?? this.tickets().length);

  /**
   * Header roll-up: how many tickets currently need the human — absent (zero) hides the chip.
   * Prefers the Core's canonical count (`taskSummary.byStatus.needsYou`), which also captures cases
   * the per-card derivation misses (e.g. a waiting ticket awaiting its expected owner); falls back to
   * the client rejected-hard-gate derivation only when the summary is absent.
   */
  readonly needsYouCount = computed(() => {
    const canonical = this.state().taskSummary?.byStatus?.needsYou;
    return canonical ?? this.tickets().filter((t) => ticketNeedsYou(t)).length;
  });

  /**
   * Whether the whole middle (every rendered stage column) is empty WHILE work exists elsewhere on
   * the board (Backlog, done, or off-track). Drives the calm idle-state explainer (absent-not-zero):
   * shown only when the pipeline is genuinely at rest with work waiting/finished — never on a
   * whole-board-empty state (which owns its own invitation) and never when a stage holds work.
   */
  readonly middleEmpty = computed(() => {
    if (this.isEmpty()) return false;
    const allStagesIdle = this.columns().every((c) => c.tickets.length === 0);
    const workElsewhere = this.backlog().length > 0 || this.doneTickets().length > 0 || this.offTrack().length > 0;
    return allStagesIdle && workElsewhere;
  });

  /** Empty board: nothing in the Backlog, the columns, the done folder, or the off-track lane. */
  readonly isEmpty = computed(
    () =>
      this.backlog().length === 0 &&
      this.columns().length === 0 &&
      this.doneTickets().length === 0 &&
      this.offTrack().length === 0,
  );

  /** The open ticket, re-derived from the latest state by id so live pushes refresh it in place. */
  readonly selected = computed<TicketView | null>(() => {
    const id = this.openId();
    return id ? (this.tickets().find((t) => t.id === id) ?? null) : null;
  });

  /** The open stage-detail drawer's stage NAME (not a captured column), or null when closed. */
  private readonly openStageName = signal<string | null>(null);
  /** Whether the open drawer should focus its gate section (a gate-node click), not the close button. */
  readonly openStageFocusGate = signal(false);
  /** The DOM testid of the node that opened the drawer, so focus returns to it on close. */
  private stageTrigger: string | null = null;

  /**
   * The open drawer's column, RE-DERIVED from the live partition by STAGE NAME on every state push
   * (never a frozen snapshot) — so a gate change / a task leaving / a workflow edit refreshes the
   * open drawer in place, exactly as {@link selected} re-derives the open ticket by id. Returns a
   * retained-name placeholder column when the stage has been removed from the workflow while open
   * (see {@link openStageRemoved}); null only when no drawer is open.
   */
  readonly openColumn = computed<StageColumn | null>(() => {
    const name = this.openStageName();
    if (name === null) return null;
    const live = this.columns().find((c) => c.stage === name);
    return live ?? { stage: name, owner: null, gate: null, tickets: [] };
  });

  /** True when the open stage no longer exists among the rendered columns (removed-while-open). */
  readonly openStageRemoved = computed<boolean>(() => {
    const name = this.openStageName();
    return name !== null && !this.columns().some((c) => c.stage === name);
  });

  /** The open stage's index in the rendered rail (drives "step N of M"); -1 when removed/closed. */
  readonly openStageIndex = computed<number>(() => {
    const name = this.openStageName();
    return name === null ? -1 : this.columns().findIndex((c) => c.stage === name);
  });

  /**
   * The next stage after the open stage among the RENDERED rail stages — null at the last rendered
   * stage (the next stage is the done folder, which the drawer reads as "last stage before Done").
   */
  readonly openNextStage = computed<string | null>(() => {
    const name = this.openStageName();
    if (name === null) return null;
    const next = nextStageInOrder(name, this.stageOrder());
    return next !== null && this.columns().some((c) => c.stage === next) ? next : null;
  });

  constructor() {
    // Keep the shared edit controller's view of state current, and route its applied truth upward so
    // the shell adopts it — the single live-data loop for every workflow mutation on this board.
    this.editCtrl.onApply((state) => this.applied.emit(state));
    effect(() => this.editCtrl.setState(this.state()));

    // Announce a board re-layout when a fresh state (new rev) arrives after the initial render — a
    // quiet polite cue, never on first paint.
    effect(() => {
      const rev = this.state().rev;
      if (this.firstRender) {
        this.firstRender = false;
      } else if (rev !== this.prevRev) {
        this.liveAnnounce.set('Board updated');
      }
      this.prevRev = rev;
    });

    // Adopt the per-project persisted mode once per project, so a power user's explicit choice
    // survives reloads. Re-reads only when the project id changes (a view switch within a session
    // updates `chosenMode` directly, not via the store), so a live SSE push never re-collapses it.
    effect(() => {
      const key = this.persistKey();
      if (key === this.persistKeyLoaded) return;
      this.persistKeyLoaded = key;
      this.chosenMode.set(this.readPersistedMode(key));
    });
  }

  /** The per-project persistence key; a single global key when the project id is absent. */
  private persistKey(): string {
    const project = this.state().project;
    return VIEW_MODE_KEY_PREFIX + (project && project.trim() ? project : '_global');
  }

  /**
   * The persisted explicit mode for a key, or null when none is stored or the value is unrecognised.
   * `localStorage` may be absent (SSR) or throw (privacy mode); any failure falls back to null so the
   * data-derived default applies — never throws.
   */
  private readPersistedMode(key: string): TasksViewMode | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      return raw && VIEW_MODES.has(raw) ? (raw as TasksViewMode) : null;
    } catch {
      return null;
    }
  }

  /** Persist the operator's explicit mode; a failing/absent store is swallowed (best-effort). */
  private writePersistedMode(key: string, mode: TasksViewMode): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, mode);
    } catch {
      /* localStorage unavailable — the in-memory choice still wins for this session. */
    }
  }

  /** Switch the view mode: the operator's explicit choice wins thereafter and persists per project. */
  selectMode(mode: TasksViewMode): void {
    this.chosenMode.set(mode);
    this.persistKeyLoaded = this.persistKey();
    this.writePersistedMode(this.persistKey(), mode);
    this.liveAnnounce.set(mode === 'pipeline' ? 'Pipeline view' : 'Worklist view');
  }

  /** Arrow/Space/Enter on the radiogroup: arrows move the selection between the two modes. */
  onSwitchKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectMode('pipeline');
      this.focusActiveRadio();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectMode('worklist');
      this.focusActiveRadio();
    }
  }

  private focusActiveRadio(): void {
    const sel = this.effectiveMode() === 'pipeline' ? 'view-mode-pipeline' : 'view-mode-worklist';
    this.host.nativeElement.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.focus();
  }

  status(ticket: TicketView) {
    return statusChip(ticket.status);
  }

  /**
   * The card's colour key (`needs-you`/`blocked`/`in-flight`/`done`/`backlog`/`waiting`) that drives
   * its accent edge, tinted fill, and filled status pill via `data-status`. Reuses the band predicates
   * so colour cannot drift from the band; colour only reinforces the glyph + text the pill carries.
   */
  cardStatus(ticket: TicketView): CardVisualStatus {
    return cardVisualStatus(ticket, this.state().workflowView);
  }

  needsYou(ticket: TicketView): boolean {
    return ticketNeedsYou(ticket);
  }

  /** The labels this ticket carries, shown as plain label chips (a label may or may not route). */
  cardLabels(ticket: TicketView): readonly string[] {
    return ticket.labels ?? [];
  }

  /** The next workflow stage to advance to; an off-track ticket targets the first stage to re-home. */
  advanceTarget(ticket: TicketView): string | null {
    return nextStageInOrder(ticket.stage ?? '', this.stageOrder());
  }

  /**
   * The single compact gate chip for a card: the current stage's governing gate when it is unmet
   * (so a blocked card shows why), else a passed/total roll-up, else nothing. The full per-gate
   * breakdown stays in the task-detail modal so the card itself remains scannable.
   */
  gateSummary(ticket: TicketView): CardGateSummary | null {
    return cardGateSummary(ticket, this.state().workflowView);
  }

  toggleMenu(id: string): void {
    this.menuFor.update((cur) => (cur === id ? null : id));
  }

  openDetail(ticket: TicketView): void {
    this.menuFor.set(null);
    this.openId.set(ticket.id ?? null);
  }

  closeDetail(): void {
    this.openId.set(null);
  }

  /**
   * Open the stage-detail drawer for a stage by NAME (the drawer re-derives its column from live
   * state, never a captured snapshot). Remembers the originating node's testid so focus returns to
   * it on close.
   */
  openStage(req: { stage: string; focusGate: boolean }): void {
    this.menuFor.set(null);
    this.openStageFocusGate.set(req.focusGate);
    this.openStageName.set(req.stage);
    this.stageTrigger = req.focusGate ? `gate-node-${req.stage}` : `stage-${req.stage}`;
  }

  /** Close the drawer and return focus to the stage/gate node that opened it. */
  closeStage(): void {
    const trigger = this.stageTrigger;
    this.openStageName.set(null);
    this.openStageFocusGate.set(false);
    this.stageTrigger = null;
    if (trigger) {
      queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-testid="${trigger}"]`)?.focus());
    }
  }

  /** Whether the workflow-settings drawer (Preset / Labels / Rules) is open. */
  readonly workflowDrawerOpen = signal(false);
  /** The stage the drawer's Rules tab is deep-linked to (from a stage's `rules N` pill), or null. */
  readonly workflowDrawerStage = signal<string | null>(null);

  /**
   * Open the workflow-settings drawer. A stage name deep-links it to that stage's rules (the on-chain
   * `rules N` pill); `null` opens it at the top (the edit-mode "Workflow settings" affordance).
   */
  openWorkflowDrawer(stage: string | null): void {
    this.workflowDrawerStage.set(stage);
    this.workflowDrawerOpen.set(true);
  }

  closeWorkflowDrawer(): void {
    this.workflowDrawerOpen.set(false);
    this.workflowDrawerStage.set(null);
  }

  async advance(ticket: TicketView, toStage: string): Promise<void> {
    const id = ticket.id ?? '';
    this.menuFor.set(null);
    this.busyFor.set(id);
    this.conflictFor.set(null);
    this.errorFor.set(null);
    const res = await this.cp.advance({ id, toStage, expectedRev: this.state().rev ?? '', by: '/you' });
    this.busyFor.set(null);
    if (res.ok === true) {
      if (res.state) this.applied.emit(res.state);
    } else if (res.ok === 'conflict') {
      this.conflictFor.set(id);
      if (res.state) this.applied.emit(res.state);
    } else {
      this.errorFor.set(id);
      this.errorText.set(`Couldn't advance: ${res.error}`);
    }
  }
}
