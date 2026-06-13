import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { TicketView, WorkflowView } from '../core/models';
import {
  dwellSince,
  enteredCurrentStageAt,
  stageGateNode,
  stageNodeStatus,
  type StageColumn,
  type StageGateNode,
  type StageNodeStatus,
} from './board';
import { gateStateView } from './gate-view';
import { GlyphComponent } from './glyph.component';

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

/**
 * The CI-style PIPELINE — a left→right connected chain of stage NODES joined by explicit CONNECTORS,
 * with GATE/APPROVAL nodes on the connectors as the centrepiece. It renders ONLY the in-pipeline
 * tickets (the `columns` the parent already partitioned) as cards inside their stage node; Backlog,
 * Done and Off-track collapse to small end-cap reference tiles (count + a link back to the Worklist),
 * never cards. Per-stage status colour + the lit active front give flow-health at a glance; a rejected
 * HARD gate visibly BREAKS its connector (red + dashed + severed) while a soft gate never does.
 *
 * This component owns only the chain projection + its roving keyboard. It introduces NO write path:
 * cards reuse the parent board's `#cardTpl` (with all its guarded advance / open machinery) projected
 * verbatim through `cardTemplate`; a stage/gate node click emits `openTicket` so the parent opens the
 * existing task-detail (read-only navigation; advance / gate-decide stay the existing guarded writes).
 * Untrusted text (stage, owner, gate name, title) reaches the DOM through interpolation only — never
 * `[innerHTML]`. Horizontal scroll is conventional for a pipeline; the chain never wraps.
 */
@Component({
  selector: 'dart-tasks-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent, NgTemplateOutlet],
  template: `
    <div class="flow" data-testid="pipeline-flow" role="group" aria-label="Pipeline">
      <div
        class="flow__scroll"
        data-testid="pipeline-chain"
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

        @for (seg of segments(); track seg.col.stage) {
          <div class="flow__seg">
            <span
              class="flow__connector"
              [attr.data-testid]="'flow-connector-' + seg.col.stage"
              [attr.data-state]="seg.connector"
              aria-hidden="true"
            ></span>

            @if (seg.gate; as g) {
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
            }

            <section
              class="stage-node"
              [attr.data-testid]="'stage-' + seg.col.stage"
              [attr.data-stage-status]="seg.status"
              [attr.data-density]="seg.density"
              [attr.data-active]="seg.active ? 'true' : 'false'"
              [attr.data-col-index]="seg.colIndex"
              role="listitem"
              tabindex="0"
              [attr.aria-label]="stageLabel(seg)"
              (click)="onStageClick($event, seg)"
              (keydown)="onStageActivate($event, seg)"
            >
              <header class="stage-node__head">
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
                @if (seg.col.owner) {
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
              </header>

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
  `,
  styles: `
    .flow { display: flex; flex-direction: column; gap: var(--kb-space-2); width: 100%; container-type: inline-size; container-name: board; }
    /* The chain is ONE non-wrapping left→right row; only the middle scrolls (conventional for a pipeline). */
    .flow__scroll { position: relative; display: flex; flex-wrap: nowrap; align-items: stretch; gap: var(--kb-space-2); overflow-x: auto; padding-bottom: var(--kb-space-2); }
    /* The continuous rail behind the nodes, so the chain reads as one connected line, not a row of gaps. */
    .flow__track { position: absolute; left: 0; right: 0; top: 1.1rem; height: 1.5px; background: var(--kb-border); z-index: 0; }

    /* End-cap reference tiles — count + a link back to the Worklist; pinned, never scrolling away. */
    .endcap { position: relative; z-index: 1; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; width: 7rem; min-height: 44px; padding: var(--kb-space-2); font: inherit; color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .endcap:hover { border-color: var(--kb-border-strong, var(--kb-text-muted)); }
    .endcap:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .endcap__icon { color: var(--kb-text-muted); }
    .endcap__label { font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .endcap__count { font-size: var(--kb-text-lg, 1.1rem); font-weight: 700; }
    .endcap--done .endcap__icon { color: var(--kb-success); }

    .flow__seg { position: relative; z-index: 1; flex: 1 1 14rem; min-width: 13rem; display: flex; flex-direction: column; align-items: stretch; }
    /* The connector entering this stage: a thin lit/faint/severed line above the node. */
    .flow__connector { height: 1.5px; margin: 1rem 0 0.4rem; background: var(--kb-border); }
    .flow__connector[data-state='passed'] { background: var(--kb-success); }
    .flow__connector[data-state='pending'] { background: var(--kb-border); }
    /* A rejected HARD gate severs the line: red, dashed, zero-height border — the "blocked here" read. */
    .flow__connector[data-state='broken'] { height: 0; background: none; border-top: 2px dashed var(--kb-danger); }

    /* The gate node on the connector — the centrepiece checkpoint. Shape carries kind, word carries state. */
    .gate-node { position: relative; z-index: 2; align-self: center; display: inline-flex; align-items: center; gap: 0.3rem; min-height: 24px; margin: -0.2rem 0 0.3rem; padding: 0.15rem 0.45rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-muted); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: 999px; cursor: pointer; }
    .gate-node:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .gate-node[data-gate-state='passed'] { color: var(--kb-success); }
    .gate-node[data-gate-state='pending'] { color: var(--kb-text-muted); }
    .gate-node[data-gate-state='rejected'][data-shape='hard'] { color: var(--kb-danger); border-color: var(--kb-danger); }
    .gate-node[data-gate-state='rejected'][data-shape='soft'] { color: var(--kb-warning); border-color: var(--kb-warning); }
    .gate-node__word { white-space: nowrap; }
    @media (pointer: coarse) { .gate-node { min-height: 44px; } }

    /* The stage node — header (marker + name + owner + gate word + status word + count + dwell) over its cards. */
    .stage-node { display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-top: 2px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .stage-node:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .stage-node[data-stage-status='blocked'] { border-top-color: var(--kb-danger); }
    .stage-node[data-stage-status='running'] { border-top-color: var(--kb-accent); }
    .stage-node[data-stage-status='waiting'] { border-top-color: var(--kb-warning); }
    .stage-node[data-stage-status='passed'] { border-top-color: var(--kb-success); }
    .stage-node[data-stage-status='pending'] { border-top-color: var(--kb-border); }
    /* An idle/passed node is a slim preview marker (the pending-path preview teaches the workflow shape). */
    .stage-node[data-density='idle'], .stage-node[data-density='passed'] { background: transparent; }
    /* One horizontal header row: marker · NAME · owner · gate · status · count. It wraps to a second
       line only when genuinely out of width (flex-wrap), but each item stays on its own line — the
       name never breaks per-letter. */
    .stage-node__head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--kb-border); font-weight: 600; }
    .stage-node__marker { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; color: var(--kb-text-muted); }
    .stage-node[data-active='true'] .stage-node__marker { color: var(--kb-accent); }
    /* The name reads horizontally on one line; when the node is narrow it ellipsises rather than
       collapsing to a one-letter-per-line column (the old compact-station "break anywhere" leak). */
    .stage-node__stage { flex: 1 1 auto; min-width: 0; font-size: var(--kb-text-sm); color: var(--kb-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stage-node__owner { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 0.2rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); font-weight: 500; white-space: nowrap; }
    .stage-node__gate { flex: 0 0 auto; font-size: var(--kb-text-xs); color: var(--kb-text-muted); font-weight: 500; white-space: nowrap; }
    .stage-node__status { flex: 0 0 auto; font-size: var(--kb-text-xs); color: var(--kb-text-muted); font-weight: 500; white-space: nowrap; }
    .stage-node__count { flex: 0 0 auto; margin-left: auto; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .stage-node__dwell { display: inline-flex; align-items: center; gap: 0.2rem; flex-basis: 100%; font-size: var(--kb-text-xs); color: var(--kb-text-muted); font-weight: 500; }
    .stage-node__cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); max-height: 60vh; overflow-y: auto; }

    .flow__offtrack-ref { display: inline-flex; align-self: flex-start; align-items: center; gap: 0.3rem; min-height: 24px; padding: 0.2rem 0.5rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-danger); background: transparent; border: 1px solid var(--kb-danger); border-radius: var(--kb-radius-md); cursor: pointer; }
    .flow__offtrack-ref:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    @media (pointer: coarse) { .flow__offtrack-ref { min-height: 44px; } }

    .flow__idle { margin: 0; padding: var(--kb-space-3); color: var(--kb-text-subtle); font-size: var(--kb-text-sm); text-align: center; }
    .flow__escape { display: inline-block; margin-left: 0.4rem; padding: 0.1rem 0.4rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); background: transparent; border: none; cursor: pointer; text-decoration: underline; }

    /* Narrow: the chain still scrolls left→right (conventional); the end-caps drop below as full-width tiles. */
    @container board (max-width: 719px) {
      .endcap { width: 100%; flex-direction: row; justify-content: space-between; }
    }
  `,
})
export class TasksPipelineComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The in-pipeline stage columns (the parent's `partition().columns` — already the in-pipeline set). */
  readonly columns = input.required<readonly StageColumn[]>();
  /** The active workflow view — drives the per-ticket colour reduction inside `stageNodeStatus`. */
  readonly workflowView = input<WorkflowView | null>(null);
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

  /** Switch back to the Worklist (an end-cap / idle-escape link). No write path. */
  readonly selectWorklist = output<void>();
  /** Open a ticket's detail (read-only drill-in). The parent owns the modal + the guarded writes. */
  readonly openTicket = output<TicketView>();

  /** Re-export for the template (gate diamond tone/word reuse). */
  readonly gateStateView = gateStateView;

  /**
   * The render-ready chain: one segment per in-pipeline stage, each carrying its density, reduced
   * status (+ word), rolled-up gate node, connector state (a rejected hard gate severs it), active
   * flag, and dwell label. Roving-focus indices are assigned left→right across the WHOLE chain
   * (backlog end-cap = 0, then per stage: gate node, then stage node) so keyboard focus traverses it.
   */
  readonly segments = computed<readonly StageSegment[]>(() => {
    const cols = this.columns();
    const wf = this.workflowView();
    const active = this.activeSegment();
    const nowMs = this.now();
    // colIndex 0 is reserved for the backlog end-cap (rendered only when backlogCount > 0); the chain
    // indices start after it so focus order matches DOM order whether or not the end-cap is present.
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

  /** The most-actionable ticket in a stage to drill into: first rejected-gate, else first non-passed, else first. */
  private mostActionable(seg: StageSegment): TicketView | null {
    const tickets = seg.col.tickets;
    if (tickets.length === 0) return null;
    const gateName = seg.gate?.name;
    if (gateName) {
      const rejected = tickets.find((t) => (t.gates ?? []).some((g) => g.name === gateName && (g.state ?? '').toLowerCase() === 'rejected'));
      if (rejected) return rejected;
      const unmet = tickets.find((t) => {
        const g = (t.gates ?? []).find((x) => x.name === gateName);
        return !g || (g.state ?? '').toLowerCase() !== 'passed';
      });
      if (unmet) return unmet;
    }
    return tickets[0];
  }

  /**
   * Drill into a stage node → the most-actionable ticket's detail (a no-op on an empty preview node).
   * A click that originated inside one of the node's cards is ignored — the card owns its own
   * open / kebab / advance interactions, so the node-level drill-in never hijacks them.
   */
  onStageClick(event: Event, seg: StageSegment): void {
    if (event.target instanceof HTMLElement && event.target.closest('.card')) return;
    const target = this.mostActionable(seg);
    if (target) this.openTicket.emit(target);
  }

  /** Keyboard activation of a stage node (Enter/Space) drills in like a click. */
  onStageActivate(event: KeyboardEvent, seg: StageSegment): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target instanceof HTMLElement && event.target.closest('.card')) return;
    event.preventDefault();
    const target = this.mostActionable(seg);
    if (target) this.openTicket.emit(target);
  }

  /** Drill into a gate node → the governing ticket's detail at its gate panel (the existing write path). */
  onGateClick(seg: StageSegment): void {
    const target = this.mostActionable(seg);
    if (target) this.openTicket.emit(target);
  }

  /** Roving focus across the WHOLE chain: ←/→ move between end-caps, gate nodes, and stage nodes. */
  onChainKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const nodes = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-col-index]')];
    const active = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-col-index]') : null;
    const idx = active ? nodes.indexOf(active) : -1;
    if (idx < 0) return;
    const next = event.key === 'ArrowRight' ? idx + 1 : idx - 1;
    if (next < 0 || next >= nodes.length) return;
    event.preventDefault();
    nodes[next].focus();
  }
}
