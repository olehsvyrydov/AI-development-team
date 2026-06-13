import { ChangeDetectionStrategy, Component, ElementRef, inject, output, viewChild } from '@angular/core';
import { GlyphComponent } from './glyph.component';
import { WorkflowEditController } from './workflow-edit-controller';

/**
 * The add-a-stage mini-form — name (required, unique, length-capped via the controller's
 * {@link WorkflowEditController.newNameError}) + an optional owner, committing one declarative
 * `set-stages` CAS at the controller's chosen insertion index. It is the ONE rendering of the
 * add-stage form, driven by the shared controller; the chain anchors it at a connector insert slot
 * or the end cap. Untrusted name/owner text reaches the DOM through interpolation only.
 */
@Component({
  selector: 'dart-stage-add-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <form class="saf" data-testid="new-stage-form" (submit)="$event.preventDefault(); confirm()">
      <p class="saf__caption">{{ ctrl.insertCaption() }}</p>
      <label class="saf__field">
        <span>Name <span aria-hidden="true">*</span></span>
        <input
          #nameInput
          class="saf__input"
          data-testid="new-stage-name"
          aria-required="true"
          aria-describedby="new-stage-help"
          [value]="ctrl.newName()"
          (input)="ctrl.newName.set($any($event.target).value)"
        />
        <span class="saf__count">{{ ctrl.newName().trim().length }} / {{ ctrl.nameMax }}</span>
      </label>
      <label class="saf__field">
        <span>Owner</span>
        <select class="saf__input" data-testid="new-stage-owner" [value]="ctrl.newOwner()" (change)="ctrl.newOwner.set($any($event.target).value)">
          <option value="">—</option>
          @for (o of ctrl.ownerOptions(); track o) {
            <option [value]="o">{{ o }}</option>
          }
        </select>
      </label>
      @if (ctrl.newNameError(); as e) {
        <p class="saf__err" id="new-stage-help" role="alert" data-testid="new-stage-error">{{ e }}</p>
      }
      <div class="saf__actions">
        <button type="button" class="btn btn--ghost" data-testid="new-stage-cancel" (click)="ctrl.cancelAdd()">Cancel</button>
        <button type="submit" class="btn btn--primary" data-testid="new-stage-confirm" [disabled]="!!ctrl.newNameError() || ctrl.lifecycle() === 'saving'">
          @if (ctrl.lifecycle() === 'saving') { <dart-glyph name="spinner" /> } <dart-glyph name="add-stage" /> Add stage
        </button>
      </div>
    </form>
  `,
  styles: `
    .saf { margin-top: 0.35rem; display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface); border: 1px dashed var(--kb-border); border-radius: var(--kb-radius-md); }
    .saf__caption, .saf__err { margin: 0; font-size: var(--kb-text-xs); }
    .saf__caption { color: var(--kb-text-muted); }
    .saf__err { color: var(--kb-danger); }
    .saf__count { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .saf__field { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .saf__input { padding: 0.2rem 0.35rem; font: inherit; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .saf__actions { display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.5rem; }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; border-radius: var(--kb-radius-md); border: 1px solid var(--kb-border); background: var(--kb-surface-muted); color: var(--kb-text); cursor: pointer; }
    .btn:disabled { opacity: 0.55; cursor: default; }
    .btn--ghost { background: transparent; }
    .btn--primary { background: var(--kb-accent-soft); color: var(--kb-accent); border-color: var(--kb-accent); }
  `,
})
export class StageAddFormComponent {
  /** The shared edit controller (the new-stage draft + the single set-stages CAS live here). */
  protected readonly ctrl = inject(WorkflowEditController);

  /** Emitted after a submit's add commit settles (success or conflict) so the host can restore focus. */
  readonly added = output<void>();

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  /** Move focus to the name field — called by the host when the form opens (focus management). */
  focusName(): void {
    queueMicrotask(() => this.nameInput()?.nativeElement?.focus());
  }

  confirm(): void {
    void this.ctrl.confirmAdd().then(() => this.added.emit());
  }
}
