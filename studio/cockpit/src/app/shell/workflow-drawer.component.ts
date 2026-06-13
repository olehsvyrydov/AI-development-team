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
import type { LabelSpec } from '../core/control-plane.service';
import type { RuleView } from '../core/models';
import { GlyphComponent } from './glyph.component';
import { LabelsManagerComponent } from './labels-manager.component';
import { StageRulesComponent } from './stage-rules.component';
import { PRESETS, WorkflowEditController } from './workflow-edit-controller';

/** The drawer's tabs — the workflow-level settings that do not fit a per-node chain metaphor. */
type DrawerTab = 'preset' | 'labels' | 'rules';

/**
 * Right-side WORKFLOW drawer — the home for the workflow-level settings that do not belong on a chain
 * node: the **Preset** radiogroup (solo / small-team / regulated), the **Labels** manager, and the
 * **Rules** (`when → do`) authoring grammar per stage. It reuses the same slide-in drawer shell the
 * read-only stage drawer uses (scrim, dialog role, focus trap, Escape-to-close) and drives the SAME
 * shared {@link WorkflowEditController} the chain edit-mode drives — so every mutation is still one
 * CAS on the single guarded chokepoint, with the same first-class 409 reconciliation. It is opened
 * from the chain's edit-mode header, or deep-linked to a stage's rules by its on-chain `rules N` pill.
 *
 * It owns no write path of its own: Preset commits via the controller's preset path, Labels via
 * set-labels, Rules via set-rules. Untrusted label/rule/stage text reaches the DOM through the child
 * editors' interpolation only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-workflow-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent, LabelsManagerComponent, StageRulesComponent],
  template: `
    <div class="wd-scrim" data-testid="workflow-drawer-scrim" (click)="close.emit()">
      <aside
        class="wd-drawer"
        #drawer
        data-testid="workflow-drawer"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        (click)="$event.stopPropagation()"
        (keydown)="onKeydown($event)"
      >
        <header class="wd-head">
          <button #closeBtn type="button" class="wd-close" data-testid="workflow-drawer-close" aria-label="Close" (click)="close.emit()">
            <dart-glyph name="cross" />
          </button>
          <h2 class="wd-title" [id]="titleId">Workflow settings</h2>
          <p class="wd-sub"><dart-glyph name="info" /> Changes save to this project only — the shared default is never touched.</p>
        </header>

        <div class="wd-tabs" role="tablist" aria-label="Workflow settings">
          @for (t of tabs; track t.id) {
            <button
              type="button"
              class="wd-tab"
              role="tab"
              [class.wd-tab--active]="tab() === t.id"
              [attr.aria-selected]="tab() === t.id"
              [attr.data-testid]="'workflow-tab-' + t.id"
              (click)="tab.set(t.id)"
            >
              <dart-glyph [name]="t.glyph" /> {{ t.label }}
            </button>
          }
        </div>

        <div class="wd-body">
          @switch (tab()) {
            @case ('preset') {
              <div class="preset" role="radiogroup" aria-label="Workflow preset" data-testid="workflow-preset">
                @for (p of presets; track p) {
                  <button
                    type="button"
                    class="preset__seg"
                    role="radio"
                    [class.preset__seg--active]="ctrl.activePreset() === p"
                    [attr.aria-checked]="ctrl.activePreset() === p"
                    [attr.data-testid]="'preset-' + p"
                    [disabled]="ctrl.lifecycle() === 'saving'"
                    (click)="ctrl.choosePreset(p)"
                    (keydown)="onPresetKeydown($event, p)"
                  >
                    @if (ctrl.activePreset() === p) { <dart-glyph name="check" /> }
                    {{ p }}
                  </button>
                }
              </div>
            }
            @case ('labels') {
              <dart-labels-manager
                [labels]="ctrl.labels()"
                [stages]="ctrl.stageNames()"
                [owners]="ctrl.ownerOptions()"
                [saving]="ctrl.lifecycle() === 'saving'"
                (save)="saveLabels($event)"
              />
            }
            @case ('rules') {
              <label class="wd-stagepick">
                <span>Stage</span>
                <select data-testid="workflow-rules-stage" [value]="rulesStage()" (change)="rulesStage.set($any($event.target).value)">
                  @for (s of ctrl.stageNames(); track s) {
                    <option [value]="s" [selected]="s === rulesStage()">{{ s }} ({{ ctrl.rulesCount(s) }})</option>
                  }
                </select>
              </label>
              @if (rulesStage(); as stage) {
                <dart-stage-rules
                  [stage]="stage"
                  [owner]="ownerFor(stage)"
                  [rules]="ctrl.rules()"
                  [labels]="ctrl.labels()"
                  [stageOrder]="ctrl.stageNames()"
                  [safetyStages]="ctrl.safetyStages()"
                  [saving]="ctrl.lifecycle() === 'saving'"
                  (save)="saveRules($event)"
                  (cancel)="close.emit()"
                  (manageLabels)="tab.set('labels')"
                />
              }
            }
          }
        </div>
      </aside>
    </div>
  `,
  styles: `
    :host { --kb-dur-base: 160ms; --kb-ease-out: cubic-bezier(0.16, 1, 0.3, 1); }
    @media (prefers-reduced-motion: reduce) { :host { --kb-dur-base: 0ms; } }
    .wd-scrim { position: fixed; inset: 0; display: flex; justify-content: flex-end; background: color-mix(in srgb, #000 45%, transparent); z-index: 40; }
    .wd-drawer { position: relative; width: min(34rem, 100%); height: 100%; display: flex; flex-direction: column; background: var(--kb-surface); border-left: 1px solid var(--kb-border); box-shadow: var(--kb-shadow-lg, -10px 0 40px rgba(0,0,0,0.4)); overflow-y: auto; animation: wd-slide var(--kb-dur-base) var(--kb-ease-out); }
    @keyframes wd-slide { from { transform: translateX(100%); } to { transform: none; } }
    @media (prefers-reduced-motion: reduce) { .wd-drawer { animation: none; } }
    @media (max-width: 640px) { .wd-drawer { width: 100%; } }
    .wd-head { position: sticky; top: 0; z-index: 2; padding: var(--kb-space-4); background: var(--kb-surface); border-bottom: 1px solid var(--kb-border); }
    .wd-close { position: absolute; top: var(--kb-space-3); right: var(--kb-space-3); display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; color: var(--kb-text-muted); background: transparent; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .wd-close:hover { color: var(--kb-text); }
    .wd-title { margin: 0 2.5rem 0 0; font-size: var(--kb-text-xl); font-weight: 700; }
    .wd-sub { display: flex; align-items: center; gap: 0.35rem; margin: 0.4rem 0 0; color: var(--kb-text-muted); font-size: var(--kb-text-xs); }
    .wd-sub dart-glyph { color: var(--kb-accent); flex: none; }
    .wd-tabs { display: flex; gap: 0.2rem; padding: var(--kb-space-2) var(--kb-space-4) 0; }
    .wd-tab { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.3rem 0.7rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-muted); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-bottom: none; border-radius: var(--kb-radius-md) var(--kb-radius-md) 0 0; cursor: pointer; }
    .wd-tab--active { color: var(--kb-accent); background: var(--kb-accent-soft); }
    .wd-tab:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .wd-body { padding: var(--kb-space-4); display: flex; flex-direction: column; gap: var(--kb-space-3); }
    .preset { display: inline-flex; gap: 0.3rem; padding: 0.2rem; border: 1px solid var(--kb-border); border-radius: 999px; align-self: flex-start; }
    .preset__seg { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.25rem 0.6rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-muted); background: var(--kb-surface-muted); border: none; border-radius: 999px; cursor: pointer; }
    .preset__seg--active { background: var(--kb-accent-soft); color: var(--kb-accent); }
    .preset__seg:disabled { opacity: 0.55; cursor: default; }
    .preset__seg:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .wd-stagepick { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .wd-stagepick select { padding: 0.25rem 0.4rem; font: inherit; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    @media (pointer: coarse) { .wd-close { min-height: 44px; } }
  `,
})
export class WorkflowDrawerComponent {
  /** The shared edit controller — provided by the host so the drawer and the chain share one path. */
  protected readonly ctrl = inject(WorkflowEditController);

  /** Which stage to deep-link the Rules tab to (when opened from a stage's `rules N` pill), or null. */
  readonly deepLinkStage = input<string | null>(null);

  /** Close the drawer (scrim click, Escape, or the close button); the host clears the open flag. */
  readonly close = output<void>();

  readonly presets = PRESETS;
  readonly tabs = [
    { id: 'preset' as const, label: 'Preset', glyph: 'preset' as const },
    { id: 'labels' as const, label: 'Labels', glyph: 'label' as const },
    { id: 'rules' as const, label: 'Rules', glyph: 'condition' as const },
  ];

  /** The active tab. Opens on Rules deep-linked to a stage, else Preset. */
  readonly tab = signal<DrawerTab>('preset');
  /** The stage whose rules the Rules tab edits. */
  readonly rulesStage = signal<string>('');

  private readonly seq = Math.random().toString(36).slice(2, 8);
  readonly titleId = `wd-title-${this.seq}`;

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly drawer = viewChild<ElementRef<HTMLElement>>('drawer');

  /** The deep-link target as a stable computed, defaulting to the first stage when none is set. */
  private readonly firstStage = computed(() => this.ctrl.stageNames()[0] ?? '');

  constructor() {
    // A deep-link opens straight on the Rules tab scrolled to that stage; otherwise default to Preset.
    effect(() => {
      const target = this.deepLinkStage();
      if (target) {
        this.tab.set('rules');
        this.rulesStage.set(target);
      } else if (!this.rulesStage()) {
        this.rulesStage.set(this.firstStage());
      }
    });
    effect(() => {
      const btn = this.closeBtn()?.nativeElement;
      if (btn) queueMicrotask(() => btn.focus());
    });
  }

  /** The owner of a stage, for the rules editor's instruct-target default. */
  ownerFor(stage: string): string | null {
    return this.ctrl.working().find((s) => s.stage === stage)?.owner ?? null;
  }

  saveLabels(labels: Record<string, LabelSpec>): void {
    void this.ctrl.saveLabels(labels);
  }

  async saveRules(rules: readonly RuleView[]): Promise<void> {
    await this.ctrl.saveRules(rules);
  }

  onPresetKeydown(event: KeyboardEvent, preset: string): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.ctrl.choosePreset(this.ctrl.neighbourPreset(preset, 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.ctrl.choosePreset(this.ctrl.neighbourPreset(preset, -1));
    }
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
