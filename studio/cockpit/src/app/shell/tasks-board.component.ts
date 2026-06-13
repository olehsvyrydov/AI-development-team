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
import { NgTemplateOutlet } from '@angular/common';
import { ControlPlaneService } from '../core/control-plane.service';
import type { ProjectState, TicketView } from '../core/models';
import {
  activeSegmentIndex,
  cardGateSummary,
  nextStageInOrder,
  partitionBoard,
  populatedStageCount,
  statusChip,
  ticketNeedsYou,
  worklistBands,
  type BoardPartition,
  type CardGateSummary,
  type OffTrackGroup,
  type StageColumn,
  type WorklistBand,
} from './board';
import { GlyphComponent } from './glyph.component';
import { TaskDetailComponent } from './task-detail.component';
import { TasksWorklistComponent } from './tasks-worklist.component';

/** The two Tasks view modes: the needs-you-first worklist (default) and the stage pipeline (train). */
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
  imports: [GlyphComponent, TaskDetailComponent, TasksWorklistComponent, NgTemplateOutlet],
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
        <dart-tasks-worklist [bands]="bands()" [cardTemplate]="cardTpl" />
        }
        @case ('pipeline') {
        <div class="train" data-testid="pipeline-train">
          <section class="backlog" data-testid="backlog-bar" aria-label="Backlog">
            <header class="backlog__head">
              <span class="backlog__title"><dart-glyph name="stack" /> Backlog</span>
              <span class="backlog__count" data-testid="backlog-count">{{ backlog().length }}</span>
            </header>
            <ul class="col__cards backlog__cards" role="list">
              @for (t of backlog(); track t.id) {
                <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: t }" />
              } @empty {
                <li class="backlog__empty" data-testid="backlog-empty">Backlog is clear.</li>
              }
            </ul>
            <button
              type="button"
              class="backlog__add"
              data-testid="backlog-add"
              disabled
              aria-disabled="true"
              title="Adding ideas to the Backlog is coming soon."
            >
              <dart-glyph name="add-stage" /> + idea · soon
            </button>
          </section>

          <div class="rail" data-testid="pipeline-rail" data-adaptive="true" role="list" aria-label="Tasks by workflow stage" (keydown)="onColumnKeydown($event)">
            <span class="rail__track" aria-hidden="true"></span>
            @for (col of columns(); track col.stage; let ci = $index) {
              <section
                class="col"
                [attr.data-testid]="'column-stage-' + col.stage"
                [attr.data-state]="col.tickets.length ? 'expanded' : 'compact'"
                role="listitem"
                tabindex="0"
                [attr.data-col-index]="ci"
                [attr.aria-label]="stationLabel(col)"
              >
                <header class="col__head">
                  <span
                    class="rail__node"
                    [attr.data-testid]="'rail-node-' + col.stage"
                    [attr.data-node]="nodeKind(col)"
                    [attr.data-active]="ci <= activeSegment() ? 'true' : 'false'"
                    aria-hidden="true"
                  >
                    @switch (nodeKind(col)) {
                      @case ('none') {
                        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" /></svg>
                      }
                      @case ('gate-hard') {
                        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 7 L17 12 L12 17 L7 12 Z" fill="currentColor" stroke="none" /></svg>
                      }
                      @case ('gate-soft') {
                        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 7 L17 12 L12 17 L7 12 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" /></svg>
                      }
                    }
                  </span>
                  <span class="col__stage">{{ col.stage }}</span>
                  @if (col.owner) {
                    <span class="col__owner"><dart-glyph name="agent" /> {{ col.owner }}</span>
                  }
                  <span class="col__count" data-testid="column-count">{{ col.tickets.length }}</span>
                </header>
                @if (col.tickets.length) {
                  <ul class="col__cards" role="list">
                    @for (t of col.tickets; track t.id) {
                      <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: t }" />
                    }
                  </ul>
                } @else {
                  <p class="col__empty col__empty--compact" [attr.data-testid]="'column-empty-' + col.stage">Nothing in this stage.</p>
                }
              </section>
            }
            @if (middleEmpty()) {
              <p class="rail__idle" data-testid="rail-middle-empty">
                No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them.
                <button type="button" class="rail__escape" data-testid="pipeline-to-worklist" (click)="selectMode('worklist')">
                  Switch to Worklist
                </button>
              </p>
            }
          </div>

          @if (terminal(); as term) {
            <section class="done" data-testid="done-folder" aria-label="Done">
              <span
                class="rail__node rail__node--terminal"
                [attr.data-testid]="'rail-node-' + term"
                data-node="terminal"
                [attr.data-active]="doneActive() ? 'true' : 'false'"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" /></svg>
              </span>
              <button
                type="button"
                class="done__face"
                data-testid="done-folder-toggle"
                [attr.aria-expanded]="doneOpen()"
                [attr.aria-label]="'Done — ' + doneTickets().length + ' tasks, activate to view'"
                (click)="toggleDone()"
              >
                <span class="done__stack" aria-hidden="true"><dart-glyph name="folder-stack" [size]="22" /></span>
                <span class="done__count" data-testid="done-folder-count">{{ doneTickets().length }}</span>
                <span class="done__label"><dart-glyph name="check" /> Done</span>
              </button>
              @if (doneOpen()) {
                <ul class="col__cards done__list" data-testid="done-folder-list" role="list">
                  @for (t of doneTickets(); track t.id) {
                    <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: t }" />
                  } @empty {
                    <li class="col__empty" data-testid="done-folder-empty">Nothing shipped yet.</li>
                  }
                </ul>
              }
            </section>
          }

          @if (offTrack().length) {
            <section class="offtrack" data-testid="off-track-lane" aria-label="Off-track tasks">
              <header class="offtrack__head">
                <dart-glyph name="warning" />
                <span class="offtrack__title">Off-track ({{ offTrackCount() }})</span>
              </header>
              <p class="offtrack__why">These tasks are in a stage that's no longer in the pipeline.</p>
              <p class="offtrack__reassure">Nothing's lost. Open a task and advance it to put it back on the pipeline.</p>
              <div class="offtrack__groups">
                @for (g of offTrack(); track g.stage) {
                  <div class="offtrack__group" [attr.data-testid]="'off-track-group-' + g.stage">
                    <p class="offtrack__stage">was in “{{ g.stage }}” — that stage is gone</p>
                    <ul class="col__cards" role="list">
                      @for (t of g.tickets; track t.id) {
                        <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: t }" />
                      }
                    </ul>
                  </div>
                }
              </div>
            </section>
          }
        </div>
        }
        }
      }
    </div>

    <ng-template #cardTpl let-t let-reason="reason">
      <li class="card" [attr.data-testid]="'card-' + t.id" role="listitem">
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
    :host { --kb-dur-fast: 120ms; --kb-dur-base: 160ms; --kb-dur-slow: 200ms; --kb-ease-out: cubic-bezier(0.16, 1, 0.3, 1); --kb-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1); --rail-compact-gap: 0.5rem; }
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
    .rail__escape { display: inline-block; margin-left: 0.4rem; padding: 0.1rem 0.4rem; pointer-events: auto; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); background: transparent; border: none; cursor: pointer; text-decoration: underline; }
    .card__reason { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-warning); }
    /* The board is a single non-scrolling flex row of four regions: [Backlog][rail][Done][Off-track].
       Backlog, Done and Off-track are fixed-width columns (flex: 0 0 auto) that hold their place; only
       the middle rail scrolls horizontally, so the side panels never float over the scrolled stages. */
    .train { display: flex; gap: var(--kb-space-3); align-items: stretch; width: 100%; padding-bottom: var(--kb-space-2); container-type: inline-size; container-name: board; }
    .backlog { flex: 0 0 auto; width: 13rem; min-width: 13rem; max-width: 13rem; display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .backlog__head { display: flex; align-items: center; gap: 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--kb-border); }
    .backlog__title { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; font-size: var(--kb-text-sm); }
    .backlog__count { margin-left: auto; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .backlog__cards { max-height: 60vh; overflow-y: auto; }
    .backlog__empty { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); font-style: italic; }
    .backlog__add { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.5rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); background: transparent; border: 1px dashed var(--kb-border); border-radius: var(--kb-radius-md); cursor: default; opacity: 0.7; }
    /* The middle region — the ONLY horizontally-scrolling part of the board. It grows to fill the
       space between the fixed side panels (flex: 1 1 0) and may shrink to zero (min-width: 0) so it
       never pushes them off-screen. Its columns flex-grow to share the width (min-width keeps a column
       legible; max-width stops a lone column from stretching absurdly); horizontal scroll appears
       inside this region only when the columns can no longer fit at their min-width. */
    /* The stations sit on ONE line (flex-wrap: nowrap) so the train reads as a single metro line; the
       continuous track runs behind that single row. Horizontal scroll (overflow-x: auto) is the
       genuine-busy fallback only — it engages when several stages expand to real columns at once and
       can no longer fit, never for the common mostly-empty case where compact stations stay narrow. */
    .rail { position: relative; flex: 1 1 0; min-width: 0; display: flex; flex-wrap: nowrap; gap: var(--rail-compact-gap); align-items: start; overflow-x: auto; scroll-snap-type: x proximity; padding-bottom: var(--kb-space-2); }
    /* The continuous train track behind the station nodes, so the compact nodes read as one line and
       not a row of gaps. It sits below the nodes (z-index) at the node-row's vertical centre. */
    .rail__track { position: absolute; left: 0; right: 0; top: 0.65rem; height: 1.5px; background: var(--kb-border); z-index: 0; }
    .col { position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--kb-space-2); scroll-snap-align: start; scroll-margin: var(--kb-space-3); border-radius: var(--kb-radius-md); }
    /* A populated stage expands to a real column that grows to share the rail's slack. */
    .col[data-state='expanded'] { flex: 1 1 14rem; min-width: 13rem; max-width: 24rem; }
    /* An empty stage collapses to a thin station node — it never grows, taking only its node lane,
       so many empty stages stay tidy on the track instead of forcing horizontal scroll. */
    .col[data-state='compact'] { flex: 0 0 auto; width: 1.9rem; min-width: 1.9rem; max-width: 1.9rem; align-items: center; }
    .col[data-state='compact'] .col__head { flex-direction: column; align-items: center; gap: 0.25rem; padding-bottom: 0; border-bottom: none; }
    .col[data-state='compact'] .col__owner { display: none; }
    .col[data-state='compact'] .col__count { margin-left: 0; }
    /* The vertical station name is capped short so the station band stays shallow — this lets the
       bottom-anchored idle line sit in the rail's open lower area without ever overlapping a label. */
    .col[data-state='compact'] .col__stage { writing-mode: vertical-rl; rotate: 180deg; max-height: 3.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.65rem; color: var(--kb-text-muted); }
    /* The empty marker stays in the DOM for tests + screen readers but is represented visually by the
       node + 0 count on a compact station. */
    .col[data-state='compact'] .col__empty--compact { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    /* When the whole middle is empty, the rail reserves an open lower band beneath the shallow
       station band so the calm idle-state explainer has somewhere to sit clear of the labels. */
    .rail:has([data-testid='rail-middle-empty']) { min-height: 7rem; }
    /* The calm idle-state explainer when the whole middle is empty and work waits elsewhere. It is
       lifted OUT of the flex flow (absolute) so it can never become a full-basis flex item that wraps
       the train onto a second row — the metro line stays single. It is anchored to the BOTTOM of the
       rail, in the open area BELOW the (capped) station label band, so it never overlaps a station
       name at any responsive width. */
    .rail__idle { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 0 var(--kb-space-3); color: var(--kb-text-subtle); font-size: var(--kb-text-sm); text-align: center; pointer-events: none; }
    .rail__node { display: inline-flex; align-items: center; justify-content: center; color: var(--kb-text-muted); background: var(--kb-bg, var(--kb-surface)); transition: color var(--kb-dur-base) var(--kb-ease-out); }
    .rail__node[data-active='true'] { color: var(--kb-accent); }
    .done__face .rail__node { display: none; }
    .done { flex: 0 0 auto; width: 9rem; min-width: 9rem; display: flex; flex-direction: column; gap: var(--kb-space-2); align-items: stretch; }
    .done__face { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: var(--kb-space-3) var(--kb-space-2); font: inherit; color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border-strong, var(--kb-border)); border-radius: var(--kb-radius-md); cursor: pointer; box-shadow: 2px 2px 0 -1px var(--kb-surface-muted), 4px 4px 0 -2px var(--kb-surface-muted); transition: transform var(--kb-dur-fast) var(--kb-ease-out); }
    .done__face:hover { transform: translateY(-1px); }
    .done__face:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .done__count { font-size: var(--kb-text-lg, 1.1rem); font-weight: 700; }
    .done__label { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .done__list { max-height: 60vh; overflow-y: auto; }
    .col:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .col__head { display: flex; align-items: center; gap: 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--kb-border); font-weight: 600; }
    .col__stage { font-size: var(--kb-text-sm); overflow-wrap: anywhere; }
    .col__owner { display: inline-flex; align-items: center; gap: 0.2rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); font-weight: 500; }
    .col__count { margin-left: auto; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .col__cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .col__empty { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); font-style: italic; padding: var(--kb-space-2); border: 1px dashed var(--kb-border); border-radius: var(--kb-radius-md); }
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
    /* Off-track is a fixed RIGHT-side panel (mirrors the fixed left Backlog) at the end of the row,
       absent when empty. It holds the orphans whose stage left the pipeline, still advanceable. */
    .offtrack { flex: 0 0 auto; width: 15rem; min-width: 14rem; display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-warning); border-radius: var(--kb-radius-md); }
    .offtrack__head { display: flex; align-items: center; gap: 0.4rem; color: var(--kb-warning); font-weight: 600; padding-bottom: 0.3rem; border-bottom: 1px solid var(--kb-border); }
    .offtrack__title { font-size: var(--kb-text-sm); }
    .offtrack__why { margin: 0; color: var(--kb-text-muted); font-size: var(--kb-text-xs); }
    .offtrack__reassure { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
    .offtrack__groups { display: flex; flex-direction: column; gap: var(--kb-space-2); max-height: 60vh; overflow-y: auto; }
    .offtrack__group { border: 1px solid var(--kb-warning); border-radius: var(--kb-radius-md); padding: var(--kb-space-2); }
    .offtrack__stage { margin: 0 0 var(--kb-space-2); font-size: var(--kb-text-xs); color: var(--kb-text-muted); overflow-wrap: anywhere; }
    /* Responsive — driven by the board's OWN width (it is narrower than the viewport behind the app
       shell), so a container query, not a viewport media query, decides the layout.
       Medium: the train keeps the adaptive model but Off-track drops BELOW as a full-width lane (it is
       secondary), letting the train keep its width longer. */
    @container board (max-width: 1099px) {
      .train { flex-wrap: wrap; }
      .offtrack { flex: 1 1 100%; width: auto; max-width: none; order: 99; }
    }
    /* Narrow: the side panels collapse before the train scrolls — Backlog and Done also drop to
       full-width lanes below the train, so the train (the main content) keeps the most width. The
       train stacks: populated stages flow as full-width sections, compact stations stay a slim strip. */
    @container board (max-width: 719px) {
      .backlog, .done { flex: 1 1 100%; width: auto; max-width: none; }
      .backlog { order: 1; }
      .rail { order: 2; }
      .done { order: 3; }
      .col[data-state='expanded'] { flex: 1 1 100%; max-width: none; }
    }
  `,
})
export class TasksBoardComponent {
  private readonly cp = inject(ControlPlaneService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly state = input.required<ProjectState>();
  /**
   * The viewed project's display name, shown as a quiet context cue so the operator is never in
   * doubt which project a write lands in (untrusted — interpolated, escaped). Absent → no cue.
   */
  readonly projectName = input<string>('');
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

  /** Whether the stacked done folder is expanded to list its finished tickets. */
  readonly doneOpen = signal(false);

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
   * The data-derived default mode: Pipeline reads best only when work is genuinely mid-flow across
   * ≥2 stages at once; otherwise the needs-you-first Worklist (the dense, never-void default).
   */
  private readonly autoMode = computed<TasksViewMode>(() =>
    populatedStageCount(this.state().workflowView, this.tickets()) >= 2 ? 'pipeline' : 'worklist',
  );

  /** The mode actually rendered: the operator's explicit choice if any, else the data-derived default. */
  readonly effectiveMode = computed<TasksViewMode>(() => this.chosenMode() ?? this.autoMode());

  /**
   * The single partition of the board into its four disjoint regions, recomputed once per state push
   * (O(tickets + stages): one pass over tickets to place each, one pass over stages to materialize the
   * columns). Each region view below (backlog/columns/done/off-track) is a cheap projection that reads
   * its slice off this one partition, so the per-stage grouping is computed in a single pass rather
   * than recomputing the per-stage filter once per region.
   */
  private readonly partition = computed<BoardPartition>(() => partitionBoard(this.state().workflowView, this.tickets()));

  /** The stage name collapsed into the done folder (a done-named stage, else the last), or null. */
  readonly terminal = computed<string | null>(() => this.partition().doneStage);

  /**
   * The pipeline stage columns: the rendered rail — every stage column EXCEPT the literal `backlog`
   * stage (the Backlog bar replaces it) and the done stage (the done folder replaces it).
   */
  readonly columns = computed<readonly StageColumn[]>(() => this.partition().columns);

  /** The Backlog holding pen — tickets not yet routed onto the track (claimed first, disjoint). */
  readonly backlog = computed<readonly TicketView[]>(() => this.partition().backlog);

  /** The finished tickets at the done stage, collapsed behind the done folder. */
  readonly doneTickets = computed<readonly TicketView[]>(() => this.partition().doneTickets);

  readonly offTrack = computed<readonly OffTrackGroup[]>(() => this.partition().offTrack);
  readonly offTrackCount = computed(() => this.offTrack().reduce((n, g) => n + g.tickets.length, 0));

  /** The index of the furthest in-progress stage column — how far the rail's active accent reaches. */
  readonly activeSegment = computed(() => activeSegmentIndex(this.state().workflowView, this.tickets()));

  /** Whether the done terminus is highlighted — true once work has reached it (the done folder is non-empty). */
  readonly doneActive = computed(() => this.doneTickets().length > 0);

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

  constructor() {
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

  needsYou(ticket: TicketView): boolean {
    return ticketNeedsYou(ticket);
  }

  /** The labels this ticket carries, shown as plain label chips (a label may or may not route). */
  cardLabels(ticket: TicketView): readonly string[] {
    return ticket.labels ?? [];
  }

  /**
   * The accessible name for a stage station, so a screen-reader user hears a thin compact station
   * as an empty stage (stage, count, owner) rather than a mystery marker — keeping keyboard and AT
   * parity with an expanded column.
   */
  stationLabel(col: StageColumn): string {
    const owner = col.owner ? `, ${col.owner}` : '';
    const empty = col.tickets.length === 0 ? ', empty' : '';
    return `Stage ${col.stage}, ${col.tickets.length} tasks${owner}${empty}`;
  }

  /** The rail node shape for a stage column: a plain dot for no gate, a diamond (solid/dashed) for hard/soft. */
  nodeKind(col: StageColumn): 'none' | 'gate-hard' | 'gate-soft' {
    if (!col.gate) return 'none';
    return col.gate.refusal === 'hard' ? 'gate-hard' : 'gate-soft';
  }

  toggleDone(): void {
    this.doneOpen.update((open) => !open);
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

  /** Roving focus across the stage columns: ←/→ move between columns for keyboard navigation. */
  onColumnKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const cols = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-col-index]')];
    const active = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-col-index]') : null;
    const idx = active ? cols.indexOf(active) : -1;
    if (idx < 0) return;
    const next = event.key === 'ArrowRight' ? idx + 1 : idx - 1;
    if (next < 0 || next >= cols.length) return;
    event.preventDefault();
    cols[next].focus();
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
