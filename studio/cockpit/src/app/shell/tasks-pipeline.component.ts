import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { ProjectState, WorkflowView } from '../core/models';
import { StageAddFormComponent } from './stage-add-form.component';
import {
  doneStage,
  dwellSince,
  enteredCurrentStageAt,
  stageGateNode,
  stageNodeStatus,
  type StageColumn,
  type StageGateNode,
  type StageNodeStatus,
} from './board';
import { gateStateView } from './gate-view';
import { GateRuleEditorComponent } from './gate-rule-editor.component';
import { GlyphComponent } from './glyph.component';
import { WorkflowEditController } from './workflow-edit-controller';

/** The connector state entering a stage: lit (passed/running), faint (pending), or severed (broken). */
type ConnectorState = 'passed' | 'pending' | 'broken';

/** The render-ready view of one stage node in the chain: density, status, gate node, dwell. */
interface StageSegment {
  readonly col: StageColumn;
  /** This stage's index in the rendered chain (drives the active-front read + roving focus). */
  readonly ci: number;
  /** Roving-focus index across the WHOLE chain (end-caps + gate nodes + stage nodes). */
  readonly colIndex: number;
  readonly density: 'active' | 'idle' | 'passed';
  readonly status: StageNodeStatus;
  /** The worst-actionable status word paired with the colour (never colour-only). */
  readonly statusWord: string;
  readonly gate: StageGateNode | null;
  /** The roving-focus index assigned to this stage's gate node, when present. */
  readonly gateColIndex: number | null;
  readonly connector: ConnectorState;
  readonly active: boolean;
  /** A coarse "stuck Nd" label when the most-dwelling in-stage ticket exceeds the threshold, else null. */
  readonly dwell: string | null;
}

const STATUS_WORD: Readonly<Record<StageNodeStatus, string>> = {
  blocked: 'blocked',
  running: 'running',
  waiting: 'waiting',
  passed: 'passed',
  pending: 'pending',
};

/** The `data-testid` of an event's current target element, or null when it is not a tagged element. */
function anchorTestId(target: EventTarget | null | undefined): string | null {
  return target instanceof HTMLElement ? target.getAttribute('data-testid') : null;
}

/**
 * The CI-style PIPELINE — a left→right connected chain of stage NODES joined by explicit CONNECTORS,
 * with GATE/APPROVAL nodes on the connectors as the centrepiece. It is the project's ONE control
 * plane: read by default, and editable IN PLACE behind a View/Edit toggle. In View it renders the
 * chain exactly as the operator (and agents) read it — zero mutation surface. In Edit it arms the
 * same nodes with affordances lifted onto them — a grip (drag + Space/arrow + Alt+Left/Right keyboard
 * reorder), an inline owner picker, a delete, connector insert-slots + an end cap for adding, and an
 * inline gate-rule editor anchored to the gate node — all driving the shared {@link
 * WorkflowEditController}: one declarative CAS per atomic intent, first-class 409 reconciliation, no
 * silent clobber. Workflow-level settings (Preset / Labels / Rules) live in a side drawer the host
 * opens; this component emits the requests.
 *
 * It introduces NO new write path: in-pipeline cards reuse the parent board's `#cardTpl` (with all its
 * guarded advance / open machinery) projected verbatim; every structural mutation rides the single
 * `ControlPlaneService` chokepoint through the controller. Untrusted text (stage, owner, gate name,
 * trigger, title) reaches the DOM through interpolation only — never `[innerHTML]`. Edit-mode resets
 * to View on every navigation/reload — a live workflow re-arms deliberately.
 */
@Component({
  selector: 'dart-tasks-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent, NgTemplateOutlet, GateRuleEditorComponent, StageAddFormComponent],
  host: {
    '[attr.data-motion]': "motionOk() ? 'on' : 'off'",
  },
  template: `
    <div class="flow" data-testid="pipeline-flow" role="group" aria-label="Pipeline">
      <header class="flow__bar">
        <span class="flow__bartrack" data-testid="pipeline-track">{{ trackLabel() }}</span>

        @if (editMode()) {
          <span class="pill" [class]="'pill--' + lifecycle()" data-testid="pipeline-liveness" aria-live="polite">
            @switch (lifecycle()) {
              @case ('saved') { <dart-glyph name="check" /> saved }
              @case ('editing') { <dart-glyph name="edit" /> unsaved }
              @case ('saving') { <dart-glyph name="spinner" /> saving… }
              @case ('conflict') { <dart-glyph name="conflict" /> conflict }
              @case ('error') { <dart-glyph name="cross" /> couldn't save }
            }
          </span>
          <button type="button" class="flow__settings" data-testid="pipeline-workflow-settings" (click)="openDrawer.emit(null)">
            <dart-glyph name="preset" /> Workflow settings
          </button>
        }

        <div class="modetoggle" role="group" aria-label="Pipeline mode" data-testid="pipeline-mode">
          <button
            type="button"
            class="modetoggle__seg"
            data-testid="pipeline-mode-view"
            [class.modetoggle__seg--active]="!editMode()"
            [attr.aria-pressed]="!editMode()"
            (click)="setEdit(false)"
          >
            View
          </button>
          <button
            type="button"
            class="modetoggle__seg"
            data-testid="pipeline-mode-edit"
            [class.modetoggle__seg--active]="editMode()"
            [attr.aria-pressed]="editMode()"
            (click)="setEdit(true)"
          >
            <dart-glyph name="edit" /> Edit
          </button>
        </div>
      </header>

      @if (editMode()) {
        <p class="flow__overlay" data-testid="pipeline-overlay-banner">
          <dart-glyph name="info" /> Your changes save to this project only — the shared default is never touched.
        </p>
      }

      @if (conflict(); as c) {
        <div class="flow__conflict" role="alert" tabindex="-1" #conflictBanner data-testid="pipeline-conflict">
          <dart-glyph name="conflict" />
          <div class="flow__conflict-body">
            <p class="flow__conflict-title">This workflow changed while you were editing.</p>
            <p class="flow__conflict-sub">We reloaded the current workflow; your unsaved edit was not applied. What you tried: {{ c.summary }}</p>
            <div class="flow__conflict-actions">
              <button type="button" class="btn btn--ghost" data-testid="pipeline-conflict-discard" (click)="ctrl.discardConflict()">Discard my edit</button>
              <button type="button" class="btn btn--primary" data-testid="pipeline-conflict-reapply" (click)="ctrl.reapplyConflict()">Re-apply on top</button>
            </div>
          </div>
        </div>
      }

      @if (errorText(); as e) {
        <p class="flow__error" role="alert" data-testid="pipeline-error"><dart-glyph name="cross" /> {{ e }}</p>
      }

      <div
        class="flow__scroll"
        data-testid="pipeline-chain"
        [attr.data-mode]="editMode() ? 'edit' : 'view'"
        role="list"
        aria-label="Pipeline stages"
        (keydown)="onChainKeydown($event)"
      >
        <span class="flow__track" aria-hidden="true"></span>

        @if (backlogCount() > 0) {
          <button
            type="button"
            class="endcap endcap--backlog"
            data-testid="pipeline-backlog-ref"
            role="listitem"
            data-col-index="0"
            (click)="selectWorklist.emit()"
          >
            <span class="endcap__icon"><dart-glyph name="stack" /></span>
            <span class="endcap__label">From backlog</span>
            <span class="endcap__count" data-testid="pipeline-backlog-count">{{ backlogCount() }}</span>
            <dart-glyph name="advance" />
          </button>
        }

        @for (seg of segments(); track seg.col.stage; let i = $index) {
          <div class="flow__seg" [class.flow__seg--dragover]="editMode() && dropIndex() === i && draggingIndex() !== null">
            @if (editMode()) {
              <button
                type="button"
                class="insertslot"
                [attr.data-testid]="'pipeline-insert-' + i"
                [attr.aria-label]="'Add a stage before ' + seg.col.stage"
                (click)="openAdder(i, $event)"
              >
                <dart-glyph name="add-stage" />
              </button>
            }

            <span
              class="flow__connector"
              [attr.data-testid]="'flow-connector-' + seg.col.stage"
              [attr.data-state]="seg.connector"
              aria-hidden="true"
            ></span>

            @if (seg.gate; as g) {
              <div class="gate-wrap">
                <button
                  type="button"
                  class="gate-node"
                  [attr.data-testid]="'gate-node-' + seg.col.stage"
                  [attr.data-shape]="g.shape"
                  [attr.data-gate-state]="g.state"
                  [attr.data-col-index]="seg.gateColIndex"
                  [attr.aria-label]="gateLabel(seg)"
                  (click)="onGateClick(seg)"
                >
                  @switch (g.shape) {
                    @case ('hard') {
                      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 6 L18 12 L12 18 L6 12 Z" fill="currentColor" stroke="none" /></svg>
                    }
                    @case ('soft') {
                      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 6 L18 12 L12 18 L6 12 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2" /></svg>
                    }
                  }
                  <span class="gate-node__word">{{ g.name }} {{ gateStateWord(g.state) }}</span>
                </button>

                @if (editMode()) {
                  <button
                    type="button"
                    class="gate-edit"
                    [attr.data-testid]="'gate-edit-' + seg.col.stage"
                    [attr.aria-expanded]="editingGate() === g.name"
                    [attr.aria-label]="'Edit gate ' + g.name"
                    (click)="openGateEditor(g.name, $event)"
                  >
                    <dart-glyph name="edit" />
                  </button>
                }

                @if (editMode() && editingGate() === g.name) {
                  <dart-gate-rule-editor
                    class="gateeditor"
                    role="dialog"
                    aria-modal="false"
                    #gateEditor
                    [gate]="g.name"
                    [attr.aria-label]="'Gate ' + g.name"
                    [attr.data-testid]="'gate-rule-editor-' + seg.col.stage"
                    (cancel)="closeGateEditor()"
                    (keydown)="onPopoverKeydown($event, 'gate')"
                  />
                }
              </div>
            }

            <section
              class="stage-node"
              [attr.data-testid]="'stage-' + seg.col.stage"
              [attr.data-stage-status]="seg.status"
              [attr.data-density]="seg.density"
              [attr.data-active]="seg.active ? 'true' : 'false'"
              [attr.data-lifted]="editMode() && grabbedIndex() === i ? 'true' : null"
              [attr.data-col-index]="seg.colIndex"
              role="listitem"
              tabindex="0"
              [attr.aria-label]="stageLabel(seg)"
              (click)="onStageClick($event, seg)"
              (keydown)="onStageActivate($event, seg)"
            >
              <header class="stage-node__head">
                @if (editMode()) {
                  <button
                    type="button"
                    class="stage-node__grip"
                    #grip
                    draggable="true"
                    [attr.data-testid]="'stage-grip-' + seg.col.stage"
                    [attr.aria-label]="'Move ' + seg.col.stage + ', position ' + (i + 1) + ' of ' + segments().length"
                    [attr.aria-grabbed]="grabbedIndex() === i"
                    (dragstart)="onDragStart($event, i)"
                    (dragend)="onDragEnd()"
                    (drop)="onDrop($event, i)"
                    (dragover)="onDragOver($event, i)"
                    (keydown)="onGripKeydown($event, i)"
                    (click)="$event.stopPropagation()"
                  >
                    <dart-glyph name="grip" />
                  </button>
                }
                <span class="stage-node__marker" [attr.data-node]="markerKind(seg.col)" aria-hidden="true">
                  @switch (markerKind(seg.col)) {
                    @case ('none') {
                      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" /></svg>
                    }
                    @case ('gate-hard') {
                      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M12 7 L17 12 L12 17 L7 12 Z" fill="currentColor" stroke="none" /></svg>
                    }
                    @case ('gate-soft') {
                      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M12 7 L17 12 L12 17 L7 12 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" /></svg>
                    }
                  }
                </span>
                <span class="stage-node__stage">{{ seg.col.stage }}</span>

                @if (editMode()) {
                  <label class="stage-node__ownersel">
                    <span class="sr-only">Owner for {{ seg.col.stage }}</span>
                    <dart-glyph name="agent" />
                    <select
                      [attr.data-testid]="'owner-select-' + seg.col.stage"
                      [attr.aria-label]="'Owner for ' + seg.col.stage"
                      [disabled]="lifecycle() === 'saving'"
                      (click)="$event.stopPropagation()"
                      (change)="ctrl.setStageOwner(seg.col.stage, $any($event.target).value)"
                    >
                      <option value="" [selected]="!seg.col.owner">—</option>
                      @for (o of ownerOptions(); track o) {
                        <option [value]="o" [selected]="o === seg.col.owner">{{ o }}</option>
                      }
                    </select>
                    <dart-glyph name="caret" />
                  </label>
                } @else if (seg.col.owner) {
                  <span class="stage-node__owner"><dart-glyph name="agent" /> {{ seg.col.owner }}</span>
                }

                @if (seg.gate; as g) {
                  <span class="stage-node__gate" [attr.data-testid]="'stage-gate-' + seg.col.stage">{{ gateStateWord(g.state) }}</span>
                }
                <span class="stage-node__status" [attr.data-testid]="'stage-status-' + seg.col.stage">{{ seg.statusWord }}</span>
                <span class="stage-node__count" [attr.data-testid]="'stage-count-' + seg.col.stage">{{ seg.col.tickets.length }}</span>
                @if (seg.dwell; as d) {
                  <span class="stage-node__dwell" [attr.data-testid]="'stage-dwell-' + seg.col.stage"><dart-glyph name="pending" /> stuck {{ d }}</span>
                }

                @if (editMode()) {
                  <button
                    type="button"
                    class="stage-node__rules"
                    [attr.data-testid]="'rules-pill-' + seg.col.stage"
                    [attr.aria-label]="'Conditions on ' + seg.col.stage + ': ' + rulesCount(seg.col.stage)"
                    (click)="onRulesPill($event, seg.col.stage)"
                  >
                    <dart-glyph name="condition" /> rules {{ rulesCount(seg.col.stage) }}
                  </button>
                  <button
                    type="button"
                    class="stage-node__del"
                    [attr.data-testid]="'delete-stage-' + seg.col.stage"
                    [attr.aria-label]="'Delete ' + seg.col.stage"
                    [disabled]="segments().length <= 1 || lifecycle() === 'saving'"
                    [attr.title]="segments().length <= 1 ? 'A track needs at least one stage.' : null"
                    (click)="onDeleteClick($event, seg.col.stage)"
                  >
                    <dart-glyph name="trash" />
                  </button>
                }
              </header>

              @if (editMode() && deleting() === seg.col.stage) {
                <div class="confirm" role="group" [attr.aria-label]="'Delete ' + seg.col.stage" [attr.data-testid]="'delete-confirm-' + seg.col.stage" (click)="$event.stopPropagation()" (keydown)="onPopoverKeydown($event, 'delete')">
                  <p class="confirm__body">
                    <dart-glyph name="warning" />
                    @if (ticketsInStage(seg.col.stage) > 0) {
                      <span>{{ ticketsInStage(seg.col.stage) }} task(s) are currently in this stage. Deleting it won't lose them — they'll be shown as OFF-TRACK until you move them to another stage.</span>
                    } @else {
                      <span>No tasks are in this stage. They'll be shown as OFF-TRACK if any appear before you move them.</span>
                    }
                  </p>
                  <p class="confirm__sub">This edits the overlay only; the base workflow file is unchanged.</p>
                  <div class="confirm__actions">
                    <button type="button" class="btn btn--ghost" #deleteCancel data-testid="delete-confirm-cancel" (click)="ctrl.cancelDelete()">Cancel</button>
                    <button type="button" class="btn btn--danger" [attr.data-testid]="'delete-confirm-go-' + seg.col.stage" [disabled]="lifecycle() === 'saving'" (click)="ctrl.confirmDelete(seg.col.stage)">
                      @if (lifecycle() === 'saving') { <dart-glyph name="spinner" /> } <dart-glyph name="trash" /> Delete stage
                    </button>
                  </div>
                </div>
              }

              @if (editMode() && adding() === i) {
                <dart-stage-add-form #addForm (added)="onStageAdded()" (click)="$event.stopPropagation()" (keydown)="onPopoverKeydown($event, 'add')" />
              }

              @if (seg.col.tickets.length) {
                <ul class="stage-node__cards" role="list">
                  @for (t of seg.col.tickets; track t.id) {
                    <ng-container [ngTemplateOutlet]="cardTemplate()" [ngTemplateOutletContext]="{ $implicit: t }" />
                  }
                </ul>
              }
            </section>
          </div>
        }

        @if (editMode()) {
          <div class="flow__addcap">
            <button type="button" class="insertslot insertslot--end" data-testid="pipeline-add-end" aria-label="Add a stage at the end" (click)="openAdder(segments().length, $event)">
              <dart-glyph name="add-stage" /> Add stage
            </button>
            @if (adding() === segments().length) {
              <dart-stage-add-form #addForm (added)="onStageAdded()" (keydown)="onPopoverKeydown($event, 'add')" />
            }
          </div>
        }

        @if (doneCount() > 0) {
          <button
            type="button"
            class="endcap endcap--done"
            data-testid="pipeline-done-ref"
            role="listitem"
            [attr.data-col-index]="doneColIndex()"
            (click)="selectWorklist.emit()"
          >
            <span class="endcap__icon"><dart-glyph name="check" /></span>
            <span class="endcap__label">Done</span>
            <span class="endcap__count" data-testid="pipeline-done-count">{{ doneCount() }}</span>
            <dart-glyph name="advance" />
          </button>
        }
      </div>

      @if (offTrackCount() > 0) {
        <button
          type="button"
          class="flow__offtrack-ref"
          data-testid="pipeline-offtrack-ref"
          (click)="selectWorklist.emit()"
        >
          <dart-glyph name="warning" /> {{ offTrackCount() }} off-track <dart-glyph name="advance" />
        </button>
      }

      @if (middleEmpty()) {
        <p class="flow__idle" data-testid="rail-middle-empty">
          No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them.
          <button type="button" class="flow__escape" data-testid="pipeline-to-worklist" (click)="selectWorklist.emit()">
            Switch to Worklist
          </button>
        </p>
      }
    </div>

    <p class="sr-only" role="status" aria-live="assertive" data-testid="pipeline-live">{{ announce() }}</p>
  `,
  styles: `
    .flow { display: flex; flex-direction: column; gap: var(--kb-space-2); width: 100%; container-type: inline-size; container-name: board; --kb-dur-fast: 120ms; --kb-dur-base: 160ms; --kb-ease-out: cubic-bezier(0.16,1,0.3,1); --kb-ease-in-out: cubic-bezier(0.65,0,0.35,1); }
    .flow__bar { display: flex; align-items: center; gap: var(--kb-space-2); flex-wrap: wrap; }
    .flow__bartrack, .endcap__label, .stage-node__owner, .stage-node__ownersel, .stage-node__gate, .stage-node__status, .stage-node__dwell { font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .modetoggle { margin-left: auto; display: inline-flex; gap: 0.2rem; padding: 0.2rem; border: 1px solid var(--kb-border); border-radius: 999px; }
    .modetoggle__seg, .flow__settings, .pill, .insertslot, .stage-node__rules, .seg, .chip { display: inline-flex; align-items: center; }
    .modetoggle__seg { gap: 0.25rem; min-height: 28px; padding: 0.2rem 0.7rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-muted); background: var(--kb-surface-muted); border: none; border-radius: 999px; cursor: pointer; }
    .modetoggle__seg--active { color: var(--kb-accent); background: var(--kb-accent-soft); }
    .flow__settings { gap: 0.25rem; min-height: 28px; padding: 0.2rem 0.6rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-muted); background: transparent; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .modetoggle__seg:focus-visible, .flow__settings:focus-visible, .endcap:focus-visible, .gate-node:focus-visible, .gate-edit:focus-visible, .insertslot:focus-visible, .stage-node:focus-visible, .stage-node__grip:focus-visible, .stage-node__rules:focus-visible, .stage-node__del:focus-visible, .flow__offtrack-ref:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .pill { gap: 0.3rem; padding: 0.2rem 0.6rem; font-size: var(--kb-text-xs); font-weight: 600; border-radius: 999px; border: 1px solid var(--kb-border); color: var(--kb-text-muted); }
    .pill--saved { color: var(--kb-success); }
    .pill--editing { color: var(--kb-warning); }
    .pill--conflict, .pill--error, .stage-node__del { color: var(--kb-danger); }

    .flow__overlay, .flow__conflict, .flow__error { margin: 0; padding: var(--kb-space-2) var(--kb-space-3); border-radius: var(--kb-radius-md); border: 1px solid var(--kb-border); font-size: var(--kb-text-sm); }
    .flow__overlay { display: flex; align-items: center; gap: 0.5rem; background: var(--kb-surface-muted); color: var(--kb-text-muted); }
    .flow__overlay dart-glyph { color: var(--kb-accent); flex: none; }
    .flow__conflict { display: flex; gap: 0.5rem; align-items: flex-start; border-color: var(--kb-warning); background: color-mix(in srgb, var(--kb-warning) 14%, transparent); color: var(--kb-text); }
    .flow__conflict dart-glyph { color: var(--kb-warning); flex: none; }
    .flow__conflict-body { display: flex; flex-direction: column; gap: 0.35rem; }
    .flow__conflict-title { margin: 0; font-weight: 600; }
    .flow__conflict-sub { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .flow__conflict-actions, .gateeditor__actions, .confirm__actions, .newstage__actions { display: flex; gap: 0.4rem; }
    .flow__error { display: flex; align-items: center; gap: 0.4rem; border-color: var(--kb-danger); color: var(--kb-danger); }

    .flow__scroll { position: relative; display: flex; flex-wrap: nowrap; align-items: stretch; gap: var(--kb-space-2); overflow-x: auto; padding-bottom: var(--kb-space-2); border-radius: var(--kb-radius-md); }
    .flow__scroll[data-mode='edit'] { box-shadow: inset 0 0 0 1px var(--kb-accent); background: color-mix(in srgb, var(--kb-accent-soft) 35%, transparent); padding: var(--kb-space-2); }
    .flow__track { position: absolute; left: 0; right: 0; top: 1.1rem; height: 1.5px; background: var(--kb-border); z-index: 0; }

    .endcap { position: relative; z-index: 1; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; width: 7rem; min-height: 44px; padding: var(--kb-space-2); font: inherit; color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .endcap:hover { border-color: var(--kb-border-strong, var(--kb-text-muted)); }
    .endcap__icon { color: var(--kb-text-muted); }
    .endcap__count { font-size: var(--kb-text-lg, 1.1rem); font-weight: 700; }
    .endcap--done .endcap__icon { color: var(--kb-success); }

    .flow__seg { position: relative; z-index: 1; flex: 1 1 14rem; min-width: 13rem; display: flex; flex-direction: column; align-items: stretch; }
    .flow__connector { height: 1.5px; margin: 1rem 0 0.4rem; background: var(--kb-border); }
    .flow__connector[data-state='passed'] { background: var(--kb-success); }
    .flow__connector[data-state='pending'] { background: var(--kb-border); }
    .flow__connector[data-state='broken'] { height: 0; background: none; border-top: 2px dashed var(--kb-danger); }
    .flow__seg--dragover .flow__connector { height: 2px; background: var(--kb-accent); border: none; }

    .gate-wrap { position: relative; align-self: center; display: inline-flex; align-items: center; gap: 0.25rem; }
    .gate-node { position: relative; z-index: 2; display: inline-flex; align-items: center; gap: 0.3rem; min-height: 24px; margin: -0.2rem 0 0.3rem; padding: 0.15rem 0.45rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-muted); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: 999px; cursor: pointer; }
    .gate-node[data-gate-state='passed'] { color: var(--kb-success); }
    .gate-node[data-gate-state='rejected'][data-shape='hard'] { color: var(--kb-danger); border-color: var(--kb-danger); }
    .gate-node[data-gate-state='rejected'][data-shape='soft'] { color: var(--kb-warning); border-color: var(--kb-warning); }
    .gate-node__word, .stage-node__owner, .stage-node__gate, .stage-node__status { white-space: nowrap; }
    .gate-edit { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; min-height: 24px; color: var(--kb-text-muted); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); cursor: pointer; }

    .gateeditor { position: absolute; top: 100%; left: 0; z-index: 6; width: 18rem; margin-top: 0.3rem; padding: var(--kb-space-3); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); box-shadow: var(--kb-shadow-md, 0 6px 20px rgba(0,0,0,0.3)); }
    .stage-node__del:disabled, .btn:disabled { opacity: 0.5; cursor: default; }
    .stage-node__ownersel select { padding: 0.1rem 0.25rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }

    .insertslot { align-self: center; justify-content: center; gap: 0.25rem; min-height: 24px; min-width: 24px; margin: 0.2rem 0; padding: 0.1rem 0.4rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); background: transparent; border: 1px dashed var(--kb-border); border-radius: var(--kb-radius-sm); cursor: pointer; opacity: 0.6; }
    .insertslot:hover, .insertslot:focus-visible { opacity: 1; color: var(--kb-accent); border-color: var(--kb-accent); }
    .flow__addcap { flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--kb-space-2); align-self: flex-start; min-width: 13rem; padding-top: 1.4rem; }
    .insertslot--end { font-weight: 600; }

    .stage-node { display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-top: 2px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; transition: transform var(--kb-dur-base) var(--kb-ease-in-out), box-shadow var(--kb-dur-fast) var(--kb-ease-out); }
    .stage-node[data-stage-status='blocked'] { border-top-color: var(--kb-danger); }
    .stage-node[data-stage-status='running'] { border-top-color: var(--kb-accent); }
    .stage-node[data-stage-status='waiting'] { border-top-color: var(--kb-warning); }
    .stage-node[data-stage-status='passed'] { border-top-color: var(--kb-success); }
    .stage-node[data-lifted='true'] { opacity: 0.85; transform: scale(0.97); border-color: var(--kb-accent); box-shadow: var(--kb-shadow-md, 0 2px 8px rgba(0,0,0,0.3)); }
    .stage-node[data-density='idle'], .stage-node[data-density='passed'] { background: transparent; }
    .stage-node__head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--kb-border); font-weight: 600; }
    .stage-node__grip { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; color: var(--kb-text-subtle); background: transparent; border: 1px solid transparent; border-radius: var(--kb-radius-sm); cursor: grab; }
    .stage-node__marker { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; color: var(--kb-text-muted); }
    .stage-node[data-active='true'] .stage-node__marker { color: var(--kb-accent); }
    .stage-node__stage { flex: 1 1 auto; min-width: 0; font-size: var(--kb-text-sm); color: var(--kb-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stage-node__owner, .stage-node__ownersel { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 0.2rem; font-weight: 500; }
    .stage-node__gate, .stage-node__status { flex: 0 0 auto; font-weight: 500; }
    .stage-node__count { flex: 0 0 auto; margin-left: auto; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .stage-node__dwell { display: inline-flex; align-items: center; gap: 0.2rem; flex-basis: 100%; font-weight: 500; }
    .stage-node__rules { gap: 0.2rem; min-height: 24px; padding: 0.1rem 0.4rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-muted); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: 999px; cursor: pointer; }
    .stage-node__del { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; min-height: 24px; background: transparent; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); cursor: pointer; }
    .stage-node__cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); max-height: 60vh; overflow-y: auto; }

    .confirm { margin-top: 0.35rem; padding: var(--kb-space-2); border-radius: var(--kb-radius-md); cursor: default; background: color-mix(in srgb, var(--kb-warning) 10%, var(--kb-surface)); border: 1px solid var(--kb-warning); }
    .confirm__body { margin: 0; display: flex; gap: 0.4rem; align-items: flex-start; font-size: var(--kb-text-sm); color: var(--kb-text); }
    .confirm__body dart-glyph { color: var(--kb-warning); flex: none; }
    .confirm__sub { margin: 0.3rem 0 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .confirm__actions { display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.5rem; }

    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; border-radius: var(--kb-radius-md); border: 1px solid var(--kb-border); background: var(--kb-surface-muted); color: var(--kb-text); cursor: pointer; }
    .btn--ghost { background: transparent; }
    .btn--primary { background: var(--kb-accent-soft); color: var(--kb-accent); border-color: var(--kb-accent); }
    .btn--danger { background: color-mix(in srgb, var(--kb-danger) 14%, transparent); color: var(--kb-danger); border-color: var(--kb-danger); }

    .flow__offtrack-ref { display: inline-flex; align-self: flex-start; align-items: center; gap: 0.3rem; min-height: 24px; padding: 0.2rem 0.5rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-danger); background: transparent; border: 1px solid var(--kb-danger); border-radius: var(--kb-radius-md); cursor: pointer; }
    .flow__idle { margin: 0; padding: var(--kb-space-3); color: var(--kb-text-subtle); font-size: var(--kb-text-sm); text-align: center; }
    .flow__escape { display: inline-block; margin-left: 0.4rem; padding: 0.1rem 0.4rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); background: transparent; border: none; cursor: pointer; text-decoration: underline; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

    /* Reduced motion zeroes durations AND disables the drag-lift transform — no state by motion alone. */
    :host([data-motion='off']) .stage-node, :host([data-motion='off']) .stage-node[data-lifted='true'] { transition: none; transform: none; }
    @media (prefers-reduced-motion: reduce) {
      .flow { --kb-dur-fast: 0ms; --kb-dur-base: 0ms; --kb-ease-out: linear; --kb-ease-in-out: linear; }
      .stage-node { transition: none; }
      .stage-node[data-lifted='true'] { transform: none; }
    }
    @media (pointer: coarse) {
      .gate-node, .gate-edit, .insertslot, .stage-node__grip, .stage-node__del, .stage-node__rules, .flow__offtrack-ref { min-height: 44px; }
    }
    @container board (max-width: 719px) { .endcap { width: 100%; flex-direction: row; justify-content: space-between; } }
  `,
})
export class TasksPipelineComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The shared, view-agnostic edit controller — the ONE implementation of every CAS + conflict path. */
  protected readonly ctrl = inject(WorkflowEditController);

  /** The in-pipeline stage columns (the parent's `partition().columns` — already the in-pipeline set). */
  readonly columns = input.required<readonly StageColumn[]>();
  /** The active workflow view — drives the per-ticket colour reduction inside `stageNodeStatus`. */
  readonly workflowView = input<WorkflowView | null>(null);
  /** The full live project state — feeds the edit controller its `rev`, owners, rules, and tickets. */
  readonly state = input<ProjectState | null>(null);
  /** The furthest in-progress rendered-rail index — how far the lit active front reaches. */
  readonly activeSegment = input.required<number>();
  readonly backlogCount = input.required<number>();
  readonly doneCount = input.required<number>();
  readonly offTrackCount = input.required<number>();
  /** Whether the whole middle is empty while work waits elsewhere (the calm path-preview state). */
  readonly middleEmpty = input.required<boolean>();
  /** Injectable wall clock for the dwell signal (deterministic in tests). */
  readonly now = input<number>(Date.now());

  /** The parent board's card template, projected verbatim so the one card design + guards are reused. */
  readonly cardTemplate = input.required<TemplateRef<unknown>>();
  /**
   * Seed edit-mode on the first render (the operator entered via "Edit workflow"). It only arms the
   * initial state — View remains the deliberate default on any later fresh mount; edit-mode is never
   * persisted across navigation/reload.
   */
  readonly armEdit = input<boolean>(false);

  /** Switch back to the Worklist (an end-cap / idle-escape link). No write path. */
  readonly selectWorklist = output<void>();
  /**
   * Open the stage-detail drawer for a stage (read-only lens). A stage-node click requests the
   * stage focused on its identity; a gate-node click requests the SAME drawer focused on the gate
   * section. The host owns the drawer + the partition; this never opens a ticket directly.
   */
  readonly openStage = output<{ stage: string; focusGate: boolean }>();
  /**
   * Open the Workflow drawer (Preset / Labels / Rules). `null` opens it at the top; a stage name
   * deep-links it to that stage's rules (the per-stage `rules N` pill).
   */
  readonly openDrawer = output<string | null>();

  /** Re-export for the template (gate diamond tone/word reuse). */
  readonly gateStateView = gateStateView;

  // Edit-mode + controller re-exports for the template -----------------------------------------------

  /** Whether the chain is armed for editing. View is the default; not persisted across nav/reload. */
  readonly editMode = signal(false);

  readonly lifecycle = this.ctrl.lifecycle;
  readonly conflict = this.ctrl.conflict;
  readonly errorText = this.ctrl.errorText;
  readonly announce = this.ctrl.announce;
  readonly grabbedIndex = this.ctrl.grabbedIndex;
  readonly editingGate = this.ctrl.editingGate;
  readonly deleting = this.ctrl.deleting;
  readonly adding = this.ctrl.adding;
  readonly ownerOptions = this.ctrl.ownerOptions;

  /** The index of the row being dragged (pointer) and the current drop target index. */
  readonly draggingIndex = signal<number | null>(null);
  readonly dropIndex = signal<number | null>(null);

  /**
   * Whether tasteful motion is allowed, mirrored from `prefers-reduced-motion`; drives the host
   * `data-motion` attribute. The only motion edit-mode introduces is the drag-lift, gated here and on
   * the reduced-motion media query — no state is ever carried by motion alone.
   */
  readonly motionOk = signal(this.prefersMotion());

  private readonly firstGrip = viewChild<ElementRef<HTMLButtonElement>>('grip');
  private readonly conflictBanner = viewChild<ElementRef<HTMLElement>>('conflictBanner');
  private readonly gateEditor = viewChild<GateRuleEditorComponent>('gateEditor');
  private readonly addForm = viewChild<StageAddFormComponent>('addForm');
  private readonly deleteCancel = viewChild<ElementRef<HTMLButtonElement>>('deleteCancel');

  /** Guards the one-shot edit-mode seed from re-arming after the operator flips back to View. */
  private armSeeded = false;

  /**
   * The `data-testid` of the affordance that opened each inline popover. Stored as a selector rather
   * than a node so focus restores correctly even after the chain re-renders (e.g. an add re-keys the
   * insert slots) — the affordance is re-queried from the live DOM at the moment the popover closes.
   */
  private gateAnchor: string | null = null;
  private deleteAnchor: string | null = null;
  private addAnchor: string | null = null;

  constructor() {
    // Seed edit-mode once when entered via "Edit workflow" (arming is not persisted thereafter).
    effect(() => {
      if (this.armSeeded) return;
      this.armSeeded = true;
      if (this.armEdit()) this.setEdit(true);
    });
    // A conflict pins focus to the banner (assertive recovery point); the controller closes editors.
    effect(() => {
      if (this.conflict()) {
        const el = this.conflictBanner()?.nativeElement;
        if (el) queueMicrotask(() => el.focus());
      }
    });
  }

  private prefersMotion(): boolean {
    if (typeof matchMedia !== 'function') return true;
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** The active-track label shown in the header band. */
  readonly trackLabel = computed(() => {
    const track = this.workflowView()?.activeTrack;
    return track ? `track: ${track}` : '';
  });

  /**
   * The render-ready chain: one segment per in-pipeline stage. In View these follow the live
   * `columns`. In Edit they follow the controller's optimistic `working()` order, joined to each
   * stage's live column (cards/counts) so an in-flight reorder previews while ticket movement still
   * renders underneath. Roving-focus indices are assigned left→right across the WHOLE chain.
   */
  readonly segments = computed<readonly StageSegment[]>(() => {
    const cols = this.orderedColumns();
    const wf = this.workflowView();
    const active = this.activeSegment();
    const nowMs = this.now();
    let nextIndex = this.backlogCount() > 0 ? 1 : 0;
    return cols.map((col, ci) => {
      const status = stageNodeStatus(col, active, ci, wf);
      const gate = stageGateNode(col);
      const gateColIndex = gate ? nextIndex++ : null;
      const colIndex = nextIndex++;
      const density: StageSegment['density'] =
        col.tickets.length >= 1 ? 'active' : ci <= active && active >= 0 ? 'passed' : 'idle';
      return {
        col,
        ci,
        colIndex,
        density,
        status,
        statusWord: STATUS_WORD[status],
        gate,
        gateColIndex,
        connector: this.connectorState(gate, ci, active),
        active: ci <= active && active >= 0,
        dwell: this.stageDwell(col, nowMs),
      };
    });
  });

  /**
   * In View, the parent's already-ordered columns. In Edit, those same VISIBLE columns reordered by
   * the controller's working order (an optimistic reorder/add/delete preview) — the Backlog and Done
   * stages stay collapsed into their end-caps in both modes, never leaking into the chain. A
   * newly-added stage (in the working order but not yet a column, and not the Done stage) shows as an
   * empty node so the insert previews; ticket movement still renders live underneath the edit.
   */
  private orderedColumns(): readonly StageColumn[] {
    const cols = this.columns();
    if (!this.editMode()) return cols;
    const visible = new Set(cols.map((c) => c.stage));
    const byStage = new Map(cols.map((c) => [c.stage, c]));
    const done = doneStage(this.workflowView());
    return this.ctrl
      .working()
      .filter((s) => visible.has(s.stage) || s.stage !== done)
      .map((s) => byStage.get(s.stage) ?? { stage: s.stage, owner: s.owner, gate: s.gate, tickets: [] });
  }

  /** The roving-focus index for the Done end-cap — last in the chain, after every stage segment. */
  readonly doneColIndex = computed<number>(() => {
    const segs = this.segments();
    const last = segs.length ? segs[segs.length - 1] : null;
    const base = last ? last.colIndex : this.backlogCount() > 0 ? 0 : -1;
    return base + 1;
  });

  /** The connector entering a stage: a rejected HARD gate severs it; else lit behind the front, faint ahead. */
  private connectorState(gate: StageGateNode | null, ci: number, active: number): ConnectorState {
    if (gate && gate.shape === 'hard' && gate.state === 'rejected') return 'broken';
    return ci <= active && active >= 0 ? 'passed' : 'pending';
  }

  /** The coarse "stuck Nd" label for a stage: the longest dwell among its tickets, or null when none qualifies. */
  private stageDwell(col: StageColumn, nowMs: number): string | null {
    let longest: string | null = null;
    for (const t of col.tickets) {
      const label = dwellSince(enteredCurrentStageAt(t), nowMs);
      if (label && (longest === null || Number.parseInt(label, 10) > Number.parseInt(longest, 10))) {
        longest = label;
      }
    }
    return longest;
  }

  /** The stage marker shape: a plain dot for no gate, a solid/dashed diamond for a hard/soft gate. */
  markerKind(col: StageColumn): 'none' | 'gate-hard' | 'gate-soft' {
    if (!col.gate) return 'none';
    return col.gate.refusal === 'hard' ? 'gate-hard' : 'gate-soft';
  }

  /** The gate state as a spoken word (passed / pending / rejected) — colour is never the only signal. */
  gateStateWord(state: StageGateNode['state']): string {
    return gateStateView(state).text;
  }

  /** The number of `when → do` rules attached to a stage (the count on its rules pill). */
  rulesCount(stage: string): number {
    return this.ctrl.rulesCount(stage);
  }

  ticketsInStage(stage: string): number {
    return this.ctrl.ticketsInStage(stage);
  }

  /** The accessible name for a stage node — the full picture in words (no colour dependence). */
  stageLabel(seg: StageSegment): string {
    const owner = seg.col.owner ? `, ${seg.col.owner}` : '';
    const gate = seg.gate ? `, gate ${seg.gate.name} ${this.gateStateWord(seg.gate.state)}` : '';
    return `Stage ${seg.col.stage}${owner}, ${seg.col.tickets.length} tasks${gate}, ${seg.statusWord}`;
  }

  /** The accessible name for a gate node — name + state + the activate-to-review action. */
  gateLabel(seg: StageSegment): string {
    const g = seg.gate!;
    const count = g.total > 1 ? `, ${g.passed} of ${g.total} passed` : '';
    return `${g.name} gate, ${this.gateStateWord(g.state)}${count}, activate to review`;
  }

  // Mode toggle ------------------------------------------------------------------------------------

  /** Flip the chain into or out of edit-mode; arming moves focus to the first grip and announces it. */
  setEdit(on: boolean): void {
    if (this.editMode() === on) return;
    this.editMode.set(on);
    if (on) {
      this.ctrl.announce.set('Edit mode on — stages, owners and gates are now editable.');
      queueMicrotask(() => this.firstGrip()?.nativeElement?.focus());
    } else {
      this.ctrl.cancelGateEditor();
      this.ctrl.cancelDelete();
      this.ctrl.cancelAdd();
      this.ctrl.announce.set('Edit mode off.');
    }
  }

  // Stage-node interactions ------------------------------------------------------------------------

  /**
   * Open the stage-detail drawer for a stage node (read-only lens). In edit-mode a click on the node
   * chrome is reserved for the inline affordances, so a bare node click is ignored there; a click that
   * originated inside a card is always ignored (the card owns its own interactions).
   */
  onStageClick(event: Event, seg: StageSegment): void {
    if (event.target instanceof HTMLElement && event.target.closest('.card')) return;
    if (this.editMode()) return;
    this.openStage.emit({ stage: seg.col.stage, focusGate: false });
  }

  /** Keyboard activation of a stage node (Enter/Space) opens the drawer like a click (View only). */
  onStageActivate(event: KeyboardEvent, seg: StageSegment): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target instanceof HTMLElement && event.target.closest('.card')) return;
    if (event.target instanceof HTMLElement && event.target.closest('button, select, input, [role="dialog"]')) return;
    if (this.editMode()) return;
    event.preventDefault();
    this.openStage.emit({ stage: seg.col.stage, focusGate: false });
  }

  /** Open the SAME stage drawer focused on the gate section (read-only — View; in Edit it's the editor). */
  onGateClick(seg: StageSegment): void {
    if (this.editMode()) return;
    this.openStage.emit({ stage: seg.col.stage, focusGate: true });
  }

  onRulesPill(event: Event, stage: string): void {
    event.stopPropagation();
    this.openDrawer.emit(stage);
  }

  onDeleteClick(event: Event, stage: string): void {
    event.stopPropagation();
    this.deleteAnchor = anchorTestId(event.currentTarget);
    this.ctrl.openDelete(stage);
    queueMicrotask(() => this.deleteCancel()?.nativeElement?.focus());
  }

  openAdder(index: number, event?: Event): void {
    this.addAnchor = anchorTestId(event?.currentTarget);
    this.ctrl.openAdder(index);
    queueMicrotask(() => this.addForm()?.focusName());
  }

  openGateEditor(gate: string, event?: Event): void {
    this.gateAnchor = anchorTestId(event?.currentTarget);
    this.ctrl.openGateEditor(gate);
    queueMicrotask(() => this.gateEditor()?.focusFirst());
  }

  /** Close the gate editor and return focus to the gate-edit affordance that opened it. */
  closeGateEditor(): void {
    this.ctrl.cancelGateEditor();
    this.restoreFocus(this.gateAnchor);
    this.gateAnchor = null;
  }

  /** Re-query a popover's anchoring affordance by its test id and focus it once the popover has closed. */
  private restoreFocus(testId: string | null): void {
    if (!testId) return;
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus());
  }

  /** After a valid add stages, return focus to the insert slot / end button that opened the form. */
  onStageAdded(): void {
    this.restoreFocus(this.addAnchor);
    this.addAnchor = null;
  }

  // Pointer drag (HTML5) — only the grip is draggable; the node body stays clickable ---------------

  onDragStart(event: DragEvent, index: number): void {
    this.ctrl.grabbedIndex.set(null);
    this.ctrl.pointerDragging.set(true);
    this.draggingIndex.set(index);
    this.dropIndex.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, index: number): void {
    if (this.draggingIndex() === null) return;
    event.preventDefault();
    this.dropIndex.set(index);
  }

  onDrop(event: DragEvent, index: number): void {
    const from = this.draggingIndex();
    if (from === null) return;
    event.preventDefault();
    this.draggingIndex.set(null);
    this.dropIndex.set(null);
    this.ctrl.pointerDragging.set(false);
    this.ctrl.commitMove(from, index);
  }

  /** A drag that ends without a drop (cancelled or dropped outside a target) writes nothing. */
  onDragEnd(): void {
    this.draggingIndex.set(null);
    this.dropIndex.set(null);
    this.ctrl.pointerDragging.set(false);
  }

  /**
   * Keyboard reorder on the HORIZONTAL chain: Alt+Left/Alt+Right (re-axised from the builder's
   * Alt+Up/Down), plus a Space pick-up / ←→ move / Space drop mode. Escape cancels a pick-up and
   * restores order. Every move emits an assertive announcement via the controller.
   */
  onGripKeydown(event: KeyboardEvent, index: number): void {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      this.ctrl.grabbedIndex.set(null);
      this.ctrl.commitMove(index, index + (event.key === 'ArrowLeft' ? -1 : 1));
      return;
    }
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar') {
      event.preventDefault();
      this.ctrl.isGrabbing() ? this.ctrl.dropGrabbed(index) : this.ctrl.pickUp(index);
      return;
    }
    if (this.ctrl.isGrabbing() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      this.ctrl.moveGrabbed(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (event.key === 'Escape') {
      if (this.draggingIndex() !== null) this.onDragEnd();
      this.ctrl.cancelGrab();
    }
  }

  /**
   * Escape inside an inline popover/confirm closes it and returns focus to the affordance that opened
   * it (the anchoring gate-edit button, delete-stage button, or insert/add-end button); Tab stays local.
   */
  onPopoverKeydown(event: KeyboardEvent, kind: 'gate' | 'delete' | 'add'): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (kind === 'gate') {
      this.ctrl.cancelGateEditor();
      this.restoreFocus(this.gateAnchor);
      this.gateAnchor = null;
    } else if (kind === 'delete') {
      this.ctrl.cancelDelete();
      this.restoreFocus(this.deleteAnchor);
      this.deleteAnchor = null;
    } else {
      this.ctrl.cancelAdd();
      this.restoreFocus(this.addAnchor);
      this.addAnchor = null;
    }
  }

  /**
   * Roving focus across the WHOLE chain: ←/→ move between end-caps, gate nodes, and stage nodes —
   * but only when focus is on a node itself, never when it is on an inner affordance (a grip's
   * Alt+Arrow reorder, an owner select, the gate editor) which own their own arrow semantics.
   */
  onChainKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    // An inner affordance (grip Alt+Arrow reorder, owner select, gate editor) owns its own arrow
    // semantics; only a focused NODE roves. The chain nodes themselves carry no such ancestor.
    if (target && target.closest('select, input, [role="dialog"]') && !target.matches('[data-col-index]')) return;
    const nodes = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-col-index]')];
    const active = target ? target.closest<HTMLElement>('[data-col-index]') : null;
    const idx = active ? nodes.indexOf(active) : -1;
    if (idx < 0) return;
    const next = event.key === 'ArrowRight' ? idx + 1 : idx - 1;
    if (next < 0 || next >= nodes.length) return;
    event.preventDefault();
    nodes[next].focus();
  }
}
