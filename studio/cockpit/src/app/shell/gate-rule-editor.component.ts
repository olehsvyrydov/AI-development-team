import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { GlyphComponent } from './glyph.component';
import { WorkflowEditController } from './workflow-edit-controller';

/**
 * The inline gate-rule editor — one editor of a gate's owner, hard/soft refusal (by shield SHAPE),
 * and trigger chips, driving the shared {@link WorkflowEditController}'s single `gate/trigger` CAS
 * path. It is the ONE rendering of this editor; the chain anchors it as a popover below a gate node.
 * The safety gate's soft option is disabled (the server refuses softening regardless). Untrusted
 * owner/trigger text reaches the DOM through interpolation only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-gate-rule-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <p class="gre__head">Gate: {{ gate() }}</p>
    @if (ctrl.draft(); as d) {
      <label class="gre__field">
        <span>Owner</span>
        <select data-testid="gate-owner" #firstField [value]="d.owner" (change)="ctrl.setDraftOwner($any($event.target).value)">
          @for (o of ctrl.ownerOptions(); track o) {
            <option [value]="o" [selected]="o === d.owner">{{ o }}</option>
          }
        </select>
      </label>

      <div class="gre__field gre__field--row" role="radiogroup" aria-label="Refusal">
        <span>Refusal</span>
        <button type="button" class="seg" role="radio" [attr.aria-checked]="d.refusal === 'hard'" [class.seg--active]="d.refusal === 'hard'" data-testid="gate-refusal-hard" (click)="ctrl.setDraftRefusal('hard')">
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 3 L19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
          Hard
        </button>
        <button type="button" class="seg" role="radio" [attr.aria-checked]="d.refusal === 'soft'" [class.seg--active]="d.refusal === 'soft'" data-testid="gate-refusal-soft" [disabled]="ctrl.isSafetyGate(d.gate)" (click)="ctrl.setDraftRefusal('soft')">
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 3 L19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" /></svg>
          Soft
        </button>
      </div>
      @if (ctrl.isSafetyGate(d.gate)) {
        <p class="gre__note" data-testid="gate-safety-note"><dart-glyph name="info" /> Safety gate — can't be softened.</p>
      }

      <div class="gre__field">
        <span>Triggers</span>
        <span class="chips">
          @for (t of d.triggers; track $index) {
            <span class="chip" [attr.data-testid]="'trigger-chip-' + $index">
              {{ t }}
              <button type="button" class="chip__x" [attr.aria-label]="'Remove trigger ' + t" (click)="ctrl.removeTrigger($index)"><dart-glyph name="remove" /></button>
            </span>
          }
          <input class="chips__add" data-testid="trigger-add" placeholder="add trigger…" [value]="ctrl.triggerDraft()" (input)="ctrl.triggerDraft.set($any($event.target).value)" (keydown.enter)="ctrl.addTrigger()" />
        </span>
      </div>

      <div class="gre__actions">
        <button type="button" class="btn btn--ghost" data-testid="gate-rule-cancel" (click)="cancel.emit()">Cancel</button>
        <button type="button" class="btn btn--primary" data-testid="gate-rule-save" [disabled]="ctrl.lifecycle() === 'saving'" (click)="ctrl.saveGateRule()">
          @if (ctrl.lifecycle() === 'saving') { <dart-glyph name="spinner" /> } <dart-glyph name="save" /> Save gate
        </button>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .gre__head { margin: 0; font-weight: 600; font-size: var(--kb-text-sm); }
    .gre__field { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .gre__field--row { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 0.4rem; }
    .gre__note { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .gre__actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
    .seg, .chip { display: inline-flex; align-items: center; gap: 0.2rem; font-size: var(--kb-text-xs); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); }
    .seg { padding: 0.2rem 0.5rem; font: inherit; color: var(--kb-text-muted); border-radius: var(--kb-radius-sm); cursor: pointer; }
    .seg--active { color: var(--kb-accent); border-color: var(--kb-accent); }
    .seg:disabled, .btn:disabled { opacity: 0.5; cursor: default; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
    .chip { padding: 0.1rem 0.4rem; color: var(--kb-text); border-radius: 999px; }
    .chip__x { display: inline-flex; padding: 0; color: var(--kb-text-muted); background: transparent; border: none; cursor: pointer; }
    .chips__add, select { width: 100%; padding: 0.2rem 0.35rem; font: inherit; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .chips__add { width: 8rem; }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; border-radius: var(--kb-radius-md); border: 1px solid var(--kb-border); background: var(--kb-surface-muted); color: var(--kb-text); cursor: pointer; }
    .btn--ghost { background: transparent; }
    .btn--primary { background: var(--kb-accent-soft); color: var(--kb-accent); border-color: var(--kb-accent); }
  `,
})
export class GateRuleEditorComponent {
  /** The shared edit controller (the gate draft + the single gate/trigger CAS live here). */
  protected readonly ctrl = inject(WorkflowEditController);

  /** The gate being edited (for the editor's heading). */
  readonly gate = input.required<string>();

  /** Close the editor; the host restores focus to the anchoring gate-edit affordance. */
  readonly cancel = output<void>();

  private readonly firstField = viewChild<ElementRef<HTMLElement>>('firstField');

  /** Move focus into the editor's first field — called by the host on open (focus management). */
  focusFirst(): void {
    queueMicrotask(() => this.firstField()?.nativeElement?.focus());
  }
}
