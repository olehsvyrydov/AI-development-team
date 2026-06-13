import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ControlPlaneService } from '../core/control-plane.service';
import { ProjectEventsService } from '../core/events.service';
import {
  displayDescription,
  displayTitle,
  type KnowledgeView,
  type ProjectState,
  type ProjectView,
  type TaskSummary,
  type WorkflowView,
} from '../core/models';
import { BasePanelComponent } from './base-panel.component';
import { KnowledgePageComponent } from './knowledge-page.component';
import { TasksBoardComponent } from './tasks-board.component';
import { TasksPanelComponent } from './tasks-panel.component';
import { WorkflowPanelComponent } from './workflow-panel.component';

/** A guarded panel input: either the derived value, or the derivation error message. */
type Derived<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function derive<T>(fn: () => T): Derived<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Project Shell — the per-project workspace entered from a launcher card. A header row carries the
 * back link, a glyph tile, the title, a settings affordance, and a live connection dot; the full
 * auto-collected description sits in its own full-width block below, wrapping to as many lines as
 * needed (no truncation). Below that are three read surfaces — Workflow, Tasks, and Base — each
 * derived independently so one panel failing to build never blanks the others.
 *
 * Security: title and description are untrusted README/manifest text, rendered with interpolation
 * only (escaped) — no `[innerHTML]`. The route id binds via component-input binding; the view loads
 * from getProject.
 */
@Component({
  selector: 'dart-project-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    WorkflowPanelComponent,
    TasksPanelComponent,
    BasePanelComponent,
    TasksBoardComponent,
    KnowledgePageComponent,
  ],
  template: `
    <header class="shell-head">
      <a class="back" routerLink="/" data-testid="back-to-projects" aria-label="Back to projects">
        <svg class="back__chevron" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
          <polyline points="14,6 8,12 14,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Projects
      </a>
      @if (view(); as v) {
        <span class="shell-head__tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
            <line x1="10" y1="4.5" x2="10" y2="19.5" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </span>
        <h1 class="shell-head__title">{{ title() }}</h1>
        <button type="button" class="shell-head__settings" data-testid="shell-settings" aria-label="Project settings" aria-disabled="true">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M12 3 v2.4 M12 18.6 V21 M3 12 h2.4 M18.6 12 H21 M5.3 5.3 l1.7 1.7 M17 17 l1.7 1.7 M18.7 5.3 L17 7 M7 17 l-1.7 1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <span class="shell-head__conn" data-testid="shell-conn" [class]="'shell-head__conn--' + v.record.status">
          <span class="shell-head__dot" aria-hidden="true"></span>
          <span>{{ connectionLabel() }}</span>
        </span>
      }
    </header>

    @if (view()) {
      <div class="shell-descwrap">
        @if (description()) {
          <p class="shell-desc" data-testid="shell-description">{{ description() }}</p>
        } @else {
          <p class="shell-desc shell-desc--empty" data-testid="shell-description">No description collected yet.</p>
        }
      </div>
    }

    <main id="main" class="shell-body">
      @if (error(); as err) {
        <p class="banner banner--error" role="alert" data-testid="shell-error">Couldn't open this project: {{ err }}</p>
      } @else if (!view()) {
        <p class="muted" role="status" aria-live="polite">Loading project…</p>
      } @else if (boardOpen()) {
        <section class="board-view" data-testid="tasks-board-view" [attr.aria-label]="boardTitle()">
          <div class="board-view__head">
            <button type="button" class="board-view__back" data-testid="board-back" (click)="closeBoard()">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                <polyline points="14,6 8,12 14,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {{ boardBackLabel() }}
            </button>
            <h2 class="board-view__title" data-testid="board-view-title">{{ boardTitle() }}</h2>
          </div>
          <dart-tasks-board [state]="liveState()" [projectName]="title()" [startInEdit]="boardStartInEdit()" (applied)="adoptState($event)" />
        </section>
      } @else if (knowledgeOpen()) {
        <section class="board-view" data-testid="knowledge-page-view" aria-label="Knowledge">
          <div class="board-view__head">
            <button type="button" class="board-view__back" data-testid="knowledge-back" (click)="closeKnowledge()">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                <polyline points="14,6 8,12 14,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Back to panels
            </button>
            <h2 class="board-view__title">Knowledge</h2>
          </div>
          <dart-knowledge-page [state]="liveState()" [projectName]="title()" (applied)="adoptState($event)" />
        </section>
      } @else {
        <section class="panels" aria-label="Project areas">
          <article class="panel" data-testid="panel-workflow">
            @if (workflow(); as w) {
              @if (w.ok) {
                <dart-workflow-panel [workflow]="w.value" (openBuilder)="openWorkflowEditor()" />
              } @else {
                <p class="panel-error" role="alert" data-testid="panel-workflow-error">Couldn't load workflow.</p>
              }
            }
          </article>
          <article class="panel" data-testid="panel-tasks">
            @if (tasks(); as t) {
              @if (t.ok) {
                <dart-tasks-panel [summary]="t.value" (openBoard)="openBoard()" />
              } @else {
                <p class="panel-error" role="alert" data-testid="panel-tasks-error">Couldn't load tasks.</p>
              }
            }
          </article>
          <article class="panel" data-testid="panel-base">
            @if (base(); as b) {
              @if (b.ok) {
                <dart-base-panel [base]="b.value" (applied)="adoptState($event)" (manage)="openKnowledge()" />
              } @else {
                <p class="panel-error" role="alert" data-testid="panel-base-error">Couldn't load base.</p>
              }
            }
          </article>
        </section>
      }
    </main>
  `,
  styles: `
    .shell-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kb-space-3);
      padding: var(--kb-space-3) var(--kb-space-4);
      background: linear-gradient(120deg, var(--kb-header-from), var(--kb-header-to));
      border-bottom: 1px solid var(--kb-border);
    }
    .back { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--kb-text-muted); text-decoration: none; font-size: var(--kb-text-sm); }
    .back:hover { color: var(--kb-text); }
    .back__chevron { flex: none; }
    .shell-head__tile {
      flex: none; display: inline-flex; align-items: center; justify-content: center;
      width: 2.25rem; height: 2.25rem; border-radius: var(--kb-radius-md);
      background: var(--kb-accent-soft); color: var(--kb-accent);
    }
    .shell-head__title { margin: 0; font-size: var(--kb-text-xl); font-weight: 700; margin-right: auto; overflow-wrap: anywhere; }
    .shell-head__settings {
      flex: none; display: inline-flex; align-items: center; justify-content: center;
      width: 2rem; height: 2rem; padding: 0;
      color: var(--kb-text-muted); background: transparent;
      border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer;
    }
    .shell-head__settings:hover { color: var(--kb-text); border-color: var(--kb-border-strong); }
    .shell-head__conn { display: inline-flex; align-items: center; gap: 0.4rem; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .shell-head__dot { width: 0.55rem; height: 0.55rem; border-radius: 999px; background: var(--kb-text-subtle); }
    .shell-head__conn--connected .shell-head__dot { background: var(--kb-success); box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--kb-success) 22%, transparent); }
    .shell-head__conn--analyzing .shell-head__dot { background: var(--kb-warning); }
    .shell-head__conn--error .shell-head__dot, .shell-head__conn--offline .shell-head__dot { background: var(--kb-danger); }
    .shell-descwrap { padding: var(--kb-space-4) var(--kb-space-4) 0; }
    .shell-desc {
      max-width: 60rem; margin: 0 auto;
      color: var(--kb-text-muted); font-size: var(--kb-text-sm); line-height: 1.55;
      white-space: normal; overflow-wrap: anywhere;
    }
    .shell-desc--empty { color: var(--kb-text-subtle); font-style: italic; }
    .shell-body { max-width: 120rem; margin: 0 auto; padding: var(--kb-space-5) var(--kb-space-4); }
    .muted { color: var(--kb-text-muted); }
    .banner--error { padding: var(--kb-space-3); border-radius: var(--kb-radius-md); background: var(--kb-accent-soft); color: var(--kb-danger); border: 1px solid var(--kb-danger); }
    .panels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
      gap: var(--kb-space-3);
      align-items: stretch;
    }
    .panel {
      display: flex;
      padding: var(--kb-space-4);
      background: var(--kb-surface);
      border: 1px solid var(--kb-border);
      border-radius: var(--kb-radius-lg);
      box-shadow: var(--kb-shadow-sm);
    }
    .panel > * { flex: 1 1 auto; }
    .panel-error { margin: 0; color: var(--kb-danger); font-size: var(--kb-text-sm); }
    .board-view__head { display: flex; align-items: center; gap: var(--kb-space-3); margin-bottom: var(--kb-space-4); }
    .board-view__back { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0; font: inherit; font-size: var(--kb-text-sm); color: var(--kb-text-muted); background: transparent; border: none; cursor: pointer; }
    .board-view__back:hover { color: var(--kb-text); }
    .board-view__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 600; }
  `,
})
export class ProjectShellComponent {
  private readonly api = inject(ApiService);
  private readonly events = inject(ProjectEventsService);
  private readonly controlPlane = inject(ControlPlaneService);

  /** Project id from the route (`projects/:id`), bound via component-input binding. */
  readonly id = input.required<string>();

  /** The live-stream subscription for the currently viewed project; replaced when the id changes. */
  private liveSub: Subscription | null = null;

  private readonly loaded = signal<ProjectView | null>(null);
  private readonly failure = signal<string | null>(null);
  private readonly boardOpen_ = signal(false);
  private readonly boardStartInEdit_ = signal(false);
  private readonly knowledgeOpen_ = signal(false);

  readonly view = this.loaded.asReadonly();
  readonly error = this.failure.asReadonly();
  /** Whether the in-shell tasks board is showing in place of the summary panels. */
  readonly boardOpen = this.boardOpen_.asReadonly();
  /**
   * Whether the board should open with the pipeline already armed for editing — set when the operator
   * enters from the Workflow panel's "Edit workflow" affordance, cleared on a plain board open.
   */
  readonly boardStartInEdit = this.boardStartInEdit_.asReadonly();
  /**
   * The board view's heading and accessible name, mode-dependent: "Edit workflow" when entered from
   * the Workflow panel (the chain is the editor), else "Tasks board" for a plain board open.
   */
  readonly boardTitle = computed(() => (this.boardStartInEdit_() ? 'Edit workflow' : 'Tasks board'));
  /**
   * The board view's back-button label: "Done editing" frames the edit-workflow exit as finishing the
   * task; "Back to panels" for a plain board open. The action is identical — both return to the panels.
   */
  readonly boardBackLabel = computed(() => (this.boardStartInEdit_() ? 'Done editing' : 'Back to panels'));
  /** Whether the in-shell Knowledge page is showing in place of the summary panels. */
  readonly knowledgeOpen = this.knowledgeOpen_.asReadonly();
  /** The current project state — the board binds against this so SSE pushes flow through live. */
  readonly liveState = computed<ProjectState>(() => this.loaded()?.state ?? {});

  openBoard(): void {
    this.knowledgeOpen_.set(false);
    this.boardStartInEdit_.set(false);
    this.boardOpen_.set(true);
  }

  closeBoard(): void {
    this.boardOpen_.set(false);
    this.boardStartInEdit_.set(false);
  }

  /**
   * Open the tasks board with the pipeline armed for editing — the one control plane. The standalone
   * workflow-builder destination is retired; editing the workflow happens IN PLACE on the chain.
   */
  openWorkflowEditor(): void {
    this.knowledgeOpen_.set(false);
    this.boardStartInEdit_.set(true);
    this.boardOpen_.set(true);
  }

  openKnowledge(): void {
    this.boardOpen_.set(false);
    this.boardStartInEdit_.set(false);
    this.knowledgeOpen_.set(true);
  }

  closeKnowledge(): void {
    this.knowledgeOpen_.set(false);
  }

  /** Adopt fresh state returned by a board/detail mutation (200 or 409 re-sync) as the new truth. */
  adoptState(state: ProjectState): void {
    const current = this.loaded();
    if (current) this.loaded.set({ ...current, state });
  }
  readonly title = computed(() => {
    const v = this.loaded();
    return v ? displayTitle(v) : '';
  });
  readonly description = computed(() => displayDescription(this.loaded()?.profile ?? null));
  readonly connectionLabel = computed(() => {
    const status = this.loaded()?.record.status;
    return status === 'connected' ? 'connected' : status === 'analyzing' ? 'analysing' : (status ?? '');
  });

  /**
   * Each panel input is derived behind its own guard so a malformed slice of `state` fails only
   * that panel — the other two still render. `null` while the view is loading.
   */
  readonly workflow = computed<Derived<WorkflowView | null> | null>(() => {
    const v = this.loaded();
    return v ? derive(() => v.state?.workflowView ?? null) : null;
  });
  readonly tasks = computed<Derived<TaskSummary | null> | null>(() => {
    const v = this.loaded();
    return v ? derive(() => v.state?.taskSummary ?? null) : null;
  });
  readonly base = computed<Derived<KnowledgeView | null> | null>(() => {
    const v = this.loaded();
    return v ? derive(() => v.state?.knowledge ?? null) : null;
  });

  constructor() {
    // Load + scope whenever the route id changes (including its first binding). The effect tracks
    // the id signal; each new id clears prior state, scopes the control plane to that project so
    // every mutation targets it, refetches, and re-opens the per-project live stream.
    effect((onCleanup) => {
      const id = this.id();
      this.loaded.set(null);
      this.failure.set(null);

      // Scope every mutation to the viewed project so a write lands in THIS project, never the
      // hub's launch directory (the root-cause scoping bug this closes).
      this.controlPlane.setProject(id);

      this.api
        .getProject(id)
        .then((view) => {
          if (this.id() === id) this.loaded.set(view);
        })
        .catch((err: unknown) => {
          if (this.id() === id) this.failure.set(err instanceof Error ? err.message : String(err));
        });

      // Live updates from THIS project's isolated channel: the hub pushes the full read-model on any
      // change. Adopt each push so the board and an open detail re-derive without a reload — and so a
      // board re-lays out live when the workflow is edited. A transport that cannot open (no SSE in
      // this host) simply yields no pushes; the one-shot fetch above still populates the view.
      this.liveSub?.unsubscribe();
      this.liveSub = this.events.connect(id).subscribe({ next: (state) => this.adoptState(state), error: () => undefined });
      onCleanup(() => this.liveSub?.unsubscribe());
    });
  }
}
