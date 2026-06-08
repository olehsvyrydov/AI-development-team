import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { WorkflowStageView, WorkflowView } from '../core/models';

/**
 * Workflow panel — a read-only horizontal rail of the active track's stages. Each stage chip names
 * the stage and its owning agent role; a stage that carries a governing gate shows a shield marker
 * whose STROKE encodes hardness — a solid shield is a hard (blocking) gate, a dashed shield is a
 * soft one. Hard vs soft is therefore carried by SHAPE, not colour, satisfying the colour-never-
 * alone rule. A visually-hidden ordered list gives screen readers the same flow as prose
 * ("vision (/po) -> architecture (/arch, hard gate) -> ..."), so the spatial SVG rail is decorative.
 *
 * When no workflow resolves (absent, or no stages) the panel states the default solo workflow
 * rather than rendering an empty rail.
 */
@Component({
  selector: 'dart-workflow-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ph">
      <span class="ph__tile ph__tile--workflow" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <circle cx="5" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="19" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6" />
          <line x1="7.6" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.6" />
          <polyline points="14,9.5 16.4,12 14,14.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <h2 class="ph__title">Workflow</h2>
      @if (stages().length) {
        <span class="ph__track" data-testid="workflow-track">track: {{ activeTrack() }}</span>
      }
    </header>

    <hr class="ph__rule" aria-hidden="true" />

    @if (!stages().length) {
      <p class="ph__empty" data-testid="workflow-empty">Using the default solo workflow.</p>
    } @else {
      <ol class="rail" aria-hidden="true">
        @for (s of stages(); track $index) {
          <li class="rail__item">
            <div class="chip" data-testid="stage-chip">
              <span class="chip__stage">{{ s.stage }}</span>
              @if (s.owner) {
                <span class="chip__owner">
                  <svg class="chip__diamond" aria-hidden="true" viewBox="0 0 24 24" width="11" height="11">
                    <path d="M12 4 L20 12 L12 20 L4 12 Z" fill="none" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                  {{ s.owner }}
                </span>
              }
              @if (s.gate; as gate) {
                <span class="chip__gate" [attr.data-testid]="'gate-' + s.stage" [attr.data-refusal]="gate.refusal" [class.chip__gate--hard]="gate.refusal === 'hard'">
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path data-gate-shape d="M12 3 L19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z" fill="none" stroke="currentColor" stroke-width="1.6" [attr.stroke-dasharray]="gate.refusal === 'hard' ? null : '3 2'" />
                  </svg>
                </span>
              }
            </div>
            @if (!$last) {
              <svg class="connector" data-testid="stage-connector" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <line x1="3" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="1.6" />
                <polyline points="15,8 20,12 15,16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            }
          </li>
        }
      </ol>

      <ol class="sr-only" data-testid="workflow-alt" aria-label="Workflow stages in order">
        @for (s of stages(); track $index) {
          <li>{{ describe(s) }}</li>
        }
      </ol>
    }

    <hr class="ph__rule" aria-hidden="true" />

    <button
      type="button"
      class="ph__foot"
      data-testid="workflow-full-link"
      [disabled]="!stages().length"
      [attr.aria-disabled]="stages().length ? null : 'true'"
      [attr.aria-label]="stages().length ? 'Edit workflow' : 'Edit workflow (no workflow to edit yet)'"
      (click)="openBuilder.emit()"
    >
      Edit workflow
      <svg class="ph__arrow" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
        <polyline points="9,6 15,12 9,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--kb-space-2); height: 100%; }
    .ph { display: flex; align-items: center; gap: var(--kb-space-2); }
    .ph__tile { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: var(--kb-radius-md); }
    .ph__tile--workflow { background: var(--kb-accent-soft); color: var(--kb-accent); }
    .ph__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 600; margin-right: auto; }
    .ph__track { font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .ph__rule { width: 100%; margin: 0; border: none; border-top: 1px solid var(--kb-border); }
    .ph__empty { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .rail { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--kb-space-1); }
    .rail__item { display: flex; align-items: center; gap: var(--kb-space-1); }
    .chip {
      display: inline-flex; flex-direction: column; gap: 0.15rem;
      padding: 0.3rem 0.5rem;
      background: var(--kb-surface-muted);
      border: 1px solid var(--kb-border);
      border-radius: var(--kb-radius-md);
      font-size: var(--kb-text-xs);
    }
    .chip__stage { font-weight: 600; color: var(--kb-text); }
    .chip__owner { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--kb-text-muted); }
    .chip__diamond { flex: none; }
    .chip__gate { color: var(--kb-text-muted); }
    .chip__gate--hard { color: var(--kb-accent); }
    .connector { flex: none; color: var(--kb-text-subtle); }
    .ph__foot { margin-top: auto; display: inline-flex; align-items: center; gap: 0.25rem; align-self: flex-start; padding: 0; font: inherit; color: var(--kb-text-subtle); background: transparent; border: none; text-decoration: none; font-size: var(--kb-text-sm); font-weight: 600; }
    .ph__foot:not([disabled]) { color: var(--kb-accent); cursor: pointer; }
    .ph__foot[disabled], .ph__foot[aria-disabled='true'] { cursor: default; }
    .ph__arrow { flex: none; opacity: 0.6; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    @media (max-width: 32rem) {
      .rail { flex-direction: column; align-items: flex-start; }
      .rail__item { flex-direction: column; align-items: flex-start; }
      .connector { transform: rotate(90deg); }
    }
  `,
})
export class WorkflowPanelComponent {
  readonly workflow = input.required<WorkflowView | null>();
  /** Activated by the footer affordance to open the editable workflow builder in place. */
  readonly openBuilder = output<void>();

  readonly stages = computed<readonly WorkflowStageView[]>(() => this.workflow()?.stages ?? []);
  readonly activeTrack = computed(() => this.workflow()?.activeTrack ?? '');

  /** The screen-reader prose for one stage: "architecture (/arch, hard gate)". */
  protected describe(s: WorkflowStageView): string {
    const parts: string[] = [];
    if (s.owner) parts.push(s.owner);
    if (s.gate) parts.push(`${s.gate.refusal} gate`);
    return parts.length ? `${s.stage} (${parts.join(', ')})` : s.stage;
  }
}
