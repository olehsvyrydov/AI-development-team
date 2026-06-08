import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ControlPlaneService, type MutationResult } from '../core/control-plane.service';
import type { GateDef, ProjectState, WorkflowStageView } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** The save lifecycle of the builder — each is glyph + text, never colour alone. */
type Lifecycle = 'saved' | 'editing' | 'saving' | 'conflict' | 'error';

/** The allowed presets, mirrored from the hub allowlist (the server stays the authority). */
const PRESETS = ['solo', 'small-team', 'regulated'] as const;

/** The roles a gate owner may be set to: those already used by gates, plus the standard team set. */
const STANDARD_OWNERS = ['/po', '/ba', '/arch', '/secops', '/ui', '/fe', '/be', '/rev', '/qa', '/e2e', '/verify'] as const;

/** A draft of a gate's editable rule while its inline editor is open. */
interface GateDraft {
  readonly gate: string;
  owner: string;
  refusal: 'hard' | 'soft';
  triggers: string[];
}

/** What the operator attempted when a 409 interrupted them, shown in the reconcile banner. */
interface ConflictAttempt {
  readonly summary: string;
  readonly kind: 'reorder' | 'gate' | 'preset';
  readonly gate?: string;
  readonly stages?: readonly string[];
}

/**
 * Editable Workflow builder. Grows the read-only stage rail into an editor that reorders the active
 * track's stages (keyboard-first: a focused grip + Alt+Arrow moves the stage; visible move buttons
 * are the pointer alternative), edits a gate's rule (owner from an allowlist, hard/soft by shield
 * SHAPE, trigger chips), and switches the preset (a radiogroup) — all persisted to the project's
 * OVERLAY only, never the base workflow file (a persistent banner states this).
 *
 * Every mutation rides the guarded control plane with the current opaque `rev`. Reorder moves are
 * optimistic and batched, committed by Save; preset and gate-rule edits commit immediately. On a
 * 409 the builder adopts the fresh server `state`, rolls back the optimistic change, and surfaces a
 * focused CONFLICT reconcile (Discard keeps server truth; Re-apply re-stages the intent on the
 * fresh model) — never a silent overwrite. Untrusted owner/trigger/stage text reaches the DOM
 * through interpolation only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-workflow-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <div class="banner banner--overlay" data-testid="overlay-banner">
      <dart-glyph name="info" />
      <span>
        You're editing this project's OVERLAY — the base workflow file is never changed.
        @if (isDefaultWorkflow()) {
          <span class="banner__sub">This project uses the default workflow; your first edit creates an overlay.</span>
        }
      </span>
    </div>

    <div class="topbar">
      <div class="preset" role="radiogroup" aria-label="Workflow preset" data-testid="preset-control">
        <span class="preset__label"><dart-glyph name="preset" /> Preset</span>
        @for (p of presets; track p) {
          <button
            type="button"
            class="preset__seg"
            role="radio"
            [class.preset__seg--active]="activePreset() === p"
            [attr.aria-checked]="activePreset() === p"
            [attr.data-testid]="'preset-' + p"
            [disabled]="lifecycle() === 'saving'"
            (click)="choosePreset(p)"
            (keydown)="onPresetKeydown($event, p)"
          >
            @if (activePreset() === p) { <dart-glyph name="check" /> }
            {{ p }}
          </button>
        }
      </div>

      <span class="pill" [class]="'pill--' + lifecycle()" data-testid="builder-status" aria-live="polite">
        @switch (lifecycle()) {
          @case ('saved') { <dart-glyph name="check" /> saved }
          @case ('editing') { <dart-glyph name="edit" /> unsaved changes }
          @case ('saving') { <dart-glyph name="spinner" /> saving… }
          @case ('conflict') { <dart-glyph name="conflict" /> conflict }
          @case ('error') { <dart-glyph name="cross" /> couldn't save }
        }
      </span>
    </div>

    @if (conflict(); as c) {
      <div class="banner banner--conflict" role="alert" tabindex="-1" #conflictBanner data-testid="builder-conflict">
        <dart-glyph name="conflict" />
        <div class="banner__body">
          <p class="banner__title">This workflow changed while you were editing.</p>
          <p class="banner__sub">We reloaded the current workflow; your unsaved edit was not applied. What you tried: {{ c.summary }}</p>
          <div class="banner__actions">
            <button type="button" class="btn btn--ghost" data-testid="conflict-discard" (click)="discardConflict()">Discard my edit</button>
            <button type="button" class="btn btn--primary" data-testid="conflict-reapply" (click)="reapplyConflict()">Re-apply on top</button>
          </div>
        </div>
      </div>
    }

    @if (errorText(); as e) {
      <p class="banner banner--error" role="alert" data-testid="builder-error"><dart-glyph name="cross" /> {{ e }}</p>
    }

    <p class="hint" id="reorder-hint">Stages — focus a stage, then Alt+ArrowUp / Alt+ArrowDown to move it.</p>

    <ol class="rows" role="list" aria-label="Workflow stages" aria-describedby="reorder-hint">
      @for (s of working(); track s.stage; let i = $index) {
        <li class="row" role="listitem" [attr.data-testid]="'builder-row-' + s.stage">
          <button
            type="button"
            class="row__grip"
            [attr.data-testid]="'move-grip-' + s.stage"
            [attr.aria-label]="'Move ' + s.stage + ', position ' + (i + 1) + ' of ' + working().length"
            (keydown)="onGripKeydown($event, i)"
          >
            <dart-glyph name="grip" />
          </button>

          <span class="row__stage" data-testid="builder-stage-name">{{ s.stage }}</span>

          <span class="row__owner">
            @if (s.owner) { <dart-glyph name="agent" /> {{ s.owner }} } @else { <span class="row__noowner">—</span> }
          </span>

          @if (s.gate; as gate) {
            <span class="row__gate" [attr.data-testid]="'builder-gate-' + s.stage" [attr.data-refusal]="gate.refusal">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path
                  data-gate-shape
                  d="M12 3 L19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  [attr.stroke-dasharray]="gate.refusal === 'hard' ? null : '3 2'"
                />
              </svg>
              <span class="row__gatename">{{ gate.name }}</span>
              <span class="row__gaterule">{{ gate.refusal }}</span>
            </span>
            <button
              type="button"
              class="row__edit"
              [attr.data-testid]="'builder-gate-edit-' + s.stage"
              [attr.aria-expanded]="editingGate() === gate.name"
              (click)="openGateEditor(gate.name)"
            >
              <dart-glyph name="edit" /> edit
            </button>
          } @else {
            <span class="row__nogate">(no gate)</span>
          }

          <span class="row__moves">
            <button type="button" class="row__move" [attr.data-testid]="'move-up-' + s.stage" [disabled]="i === 0" aria-label="Move up" (click)="move(i, -1)">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><polyline points="6,15 12,9 18,15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button type="button" class="row__move" [attr.data-testid]="'move-down-' + s.stage" [disabled]="i === working().length - 1" aria-label="Move down" (click)="move(i, 1)">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><polyline points="6,9 12,15 18,9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </span>

          @if (s.gate && editingGate() === s.gate.name && draft(); as d) {
            <div class="ruleeditor" [attr.data-testid]="'gate-rule-editor-' + s.stage">
              <label class="ruleeditor__field">
                <span>Owner</span>
                <select data-testid="gate-owner" [value]="d.owner" (change)="setDraftOwner($any($event.target).value)">
                  @for (o of ownerOptions(); track o) {
                    <option [value]="o" [selected]="o === d.owner">{{ o }}</option>
                  }
                </select>
              </label>

              <div class="ruleeditor__field" role="radiogroup" aria-label="Refusal">
                <span>Refusal</span>
                <button type="button" class="seg" role="radio" [attr.aria-checked]="d.refusal === 'hard'" [class.seg--active]="d.refusal === 'hard'" data-testid="gate-refusal-hard" (click)="setDraftRefusal('hard')">
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 3 L19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
                  Hard
                </button>
                <button type="button" class="seg" role="radio" [attr.aria-checked]="d.refusal === 'soft'" [class.seg--active]="d.refusal === 'soft'" data-testid="gate-refusal-soft" (click)="setDraftRefusal('soft')">
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 3 L19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" /></svg>
                  Soft
                </button>
              </div>

              <div class="ruleeditor__field">
                <span>Triggers</span>
                <span class="chips">
                  @for (t of d.triggers; track $index) {
                    <span class="chip" [attr.data-testid]="'trigger-chip-' + $index">
                      {{ t }}
                      <button type="button" class="chip__x" [attr.aria-label]="'Remove trigger ' + t" (click)="removeTrigger($index)"><dart-glyph name="remove" /></button>
                    </span>
                  }
                  <input class="chips__add" data-testid="trigger-add" placeholder="add trigger…" [value]="triggerDraft()" (input)="triggerDraft.set($any($event.target).value)" (keydown.enter)="addTrigger()" />
                </span>
              </div>

              <div class="ruleeditor__actions">
                <button type="button" class="btn btn--ghost" data-testid="gate-rule-cancel" (click)="cancelGateEditor()">Cancel</button>
                <button type="button" class="btn btn--primary" data-testid="gate-rule-save" [disabled]="lifecycle() === 'saving'" (click)="saveGateRule()">
                  @if (lifecycle() === 'saving') { <dart-glyph name="spinner" /> } <dart-glyph name="save" /> Save gate
                </button>
              </div>
            </div>
          }
        </li>
      }
    </ol>

    @if (reorderDirty()) {
      <div class="footbar" data-testid="builder-reorder-bar">
        <button type="button" class="btn btn--ghost" data-testid="builder-discard" (click)="discardReorder()">Discard</button>
        <button type="button" class="btn btn--primary" data-testid="builder-save" [disabled]="lifecycle() === 'saving'" (click)="saveReorder()">
          @if (lifecycle() === 'saving') { <dart-glyph name="spinner" /> } <dart-glyph name="save" /> Save changes
        </button>
      </div>
    }

    <p class="sr-only" role="status" aria-live="assertive" data-testid="builder-live">{{ announce() }}</p>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--kb-space-3); }
    .banner { display: flex; gap: 0.5rem; padding: var(--kb-space-2) var(--kb-space-3); border-radius: var(--kb-radius-md); font-size: var(--kb-text-sm); }
    .banner--overlay { background: var(--kb-surface-muted); color: var(--kb-text-muted); border: 1px solid var(--kb-border); }
    .banner--overlay dart-glyph { color: var(--kb-accent); flex: none; }
    .banner__sub { display: block; color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
    .banner--conflict { background: color-mix(in srgb, var(--kb-warning) 14%, transparent); border: 1px solid var(--kb-warning); color: var(--kb-text); align-items: flex-start; }
    .banner--conflict dart-glyph { color: var(--kb-warning); flex: none; }
    .banner__body { display: flex; flex-direction: column; gap: 0.35rem; }
    .banner__title { margin: 0; font-weight: 600; }
    .banner__actions { display: flex; gap: 0.4rem; }
    .banner--error { color: var(--kb-danger); border: 1px solid var(--kb-danger); align-items: center; }
    .topbar { display: flex; align-items: center; gap: var(--kb-space-3); flex-wrap: wrap; }
    .preset__label, .row__owner, .row__gate, .seg, .chip { display: inline-flex; align-items: center; }
    .preset { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem; border: 1px solid var(--kb-border); border-radius: 999px; }
    .preset__label { gap: 0.25rem; padding: 0 0.4rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .preset__seg { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.25rem 0.6rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-muted); background: var(--kb-surface-muted); border: none; border-radius: 999px; cursor: pointer; }
    .preset__seg--active { background: var(--kb-accent-soft); color: var(--kb-accent); }
    .preset__seg:disabled { opacity: 0.55; cursor: default; }
    .pill { display: inline-flex; align-items: center; gap: 0.3rem; margin-left: auto; padding: 0.2rem 0.6rem; font-size: var(--kb-text-xs); font-weight: 600; border-radius: 999px; border: 1px solid var(--kb-border); color: var(--kb-text-muted); }
    .pill--saved { color: var(--kb-success); }
    .pill--editing { color: var(--kb-warning); }
    .pill--conflict, .pill--error { color: var(--kb-danger); }
    .hint { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-1); }
    .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.35rem 0.5rem; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .row__grip { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; color: var(--kb-text-subtle); background: transparent; border: 1px solid transparent; border-radius: var(--kb-radius-sm); cursor: grab; }
    .row__grip:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .row__stage { font-weight: 600; color: var(--kb-text); min-width: 6rem; }
    .row__owner { gap: 0.25rem; color: var(--kb-text-muted); font-size: var(--kb-text-sm); }
    .row__noowner { color: var(--kb-text-subtle); }
    .row__gate { gap: 0.3rem; color: var(--kb-text-muted); font-size: var(--kb-text-xs); }
    .row__gate[data-refusal='hard'] { color: var(--kb-accent); }
    .row__gatename { font-weight: 600; }
    .row__gaterule { text-transform: uppercase; letter-spacing: 0.03em; color: var(--kb-text-subtle); }
    .row__nogate { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
    .row__edit { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.15rem 0.4rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-muted); background: transparent; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); cursor: pointer; }
    .row__moves { display: inline-flex; gap: 0.2rem; margin-left: auto; }
    .row__move { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; color: var(--kb-text-muted); background: transparent; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); cursor: pointer; }
    .row__move:disabled { opacity: 0.4; cursor: default; }
    .ruleeditor { flex: 1 1 100%; display: flex; flex-wrap: wrap; gap: var(--kb-space-3); align-items: flex-start; margin-top: 0.35rem; padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .ruleeditor__field { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .ruleeditor__field select { padding: 0.25rem 0.4rem; font: inherit; background: var(--kb-surface-muted); color: var(--kb-text); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .seg { gap: 0.25rem; padding: 0.2rem 0.5rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-muted); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); cursor: pointer; }
    .seg--active { color: var(--kb-accent); border-color: var(--kb-accent); }
    .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
    .chip { gap: 0.2rem; padding: 0.1rem 0.4rem; font-size: var(--kb-text-xs); color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: 999px; }
    .chip__x { display: inline-flex; padding: 0; color: var(--kb-text-muted); background: transparent; border: none; cursor: pointer; }
    .chips__add { width: 8rem; padding: 0.2rem 0.4rem; font: inherit; font-size: var(--kb-text-xs); background: var(--kb-surface-muted); color: var(--kb-text); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .ruleeditor__actions { display: flex; gap: 0.4rem; align-items: flex-end; margin-left: auto; }
    .footbar { display: flex; justify-content: flex-end; gap: 0.4rem; padding-top: var(--kb-space-2); border-top: 1px solid var(--kb-border); }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; border-radius: var(--kb-radius-md); border: 1px solid var(--kb-border); background: var(--kb-surface-muted); color: var(--kb-text); cursor: pointer; }
    .btn:disabled { opacity: 0.55; cursor: default; }
    .btn--ghost { background: transparent; }
    .btn--primary { background: var(--kb-accent-soft); color: var(--kb-accent); border-color: var(--kb-accent); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  `,
})
export class WorkflowBuilderComponent {
  private readonly cp = inject(ControlPlaneService);

  readonly state = input.required<ProjectState>();
  /** A 2xx or 409-resync mutation returns fresh server state for the shell to adopt as truth. */
  readonly applied = output<ProjectState>();

  readonly presets = PRESETS;

  /** The server's stage order for the active track — the truth the working copy resets to. */
  private readonly serverStages = computed<readonly WorkflowStageView[]>(() => this.state().workflowView?.stages ?? []);
  private readonly activeTrack = computed<string | null>(() => this.state().workflowView?.activeTrack ?? null);
  readonly activePreset = computed(() => this.state().preset ?? 'solo');
  private readonly rev = computed(() => this.state().rev ?? '');
  private readonly gateDefs = computed<readonly GateDef[]>(() => this.state().gateDefs ?? []);

  /** A project with no overlay still resolves stages from the base/default workflow. */
  readonly isDefaultWorkflow = computed(() => !this.state()['overlay']);

  /** The locally-reordered stage list (optimistic). Resets to server truth on adopt/discard. */
  private readonly workingStages = signal<readonly WorkflowStageView[] | null>(null);
  readonly working = computed<readonly WorkflowStageView[]>(() => this.workingStages() ?? this.serverStages());
  readonly reorderDirty = computed(() => {
    const local = this.workingStages();
    if (!local) return false;
    return local.map((s) => s.stage).join('>') !== this.serverStages().map((s) => s.stage).join('>');
  });

  readonly lifecycle = signal<Lifecycle>('saved');
  readonly errorText = signal<string | null>(null);
  readonly conflict = signal<ConflictAttempt | null>(null);
  readonly announce = signal('');

  readonly editingGate = signal<string | null>(null);
  readonly draft = signal<GateDraft | null>(null);
  readonly triggerDraft = signal('');

  /** The owner allowlist: the standard team roles unioned with any owner the gates already use. */
  readonly ownerOptions = computed<readonly string[]>(() => {
    const used = this.gateDefs().map((g) => g.owner).filter((o): o is string => typeof o === 'string');
    return [...new Set<string>([...STANDARD_OWNERS, ...used])];
  });

  constructor() {
    // When the server stages change identity (a fresh push or adopt), drop a stale reorder draft so
    // the working copy follows server truth rather than pinning an outdated optimistic order.
    effect(() => {
      const serverKey = this.serverStages().map((s) => s.stage).join('>');
      const local = this.workingStages();
      if (local && local.map((s) => s.stage).join('>') !== serverKey && !this.reorderDirty()) {
        this.workingStages.set(null);
      }
    });
  }

  // Reorder — optimistic + batched ----------------------------------------------------------------

  move(index: number, delta: number): void {
    const next = [...this.working()];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    this.workingStages.set(next);
    if (this.lifecycle() !== 'saving') this.lifecycle.set('editing');
    this.announce.set(`Moved ${next[target].stage} to position ${target + 1} of ${next.length}.`);
  }

  onGripKeydown(event: KeyboardEvent, index: number): void {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.move(index, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.move(index, 1);
    }
  }

  discardReorder(): void {
    this.workingStages.set(null);
    this.lifecycle.set('saved');
  }

  async saveReorder(): Promise<void> {
    const track = this.activeTrack();
    if (!track) return;
    const stages = this.working().map((s) => s.stage);
    this.lifecycle.set('saving');
    this.errorText.set(null);
    const res = await this.cp.reorderTrack({ track, stages, expectedRev: this.rev() });
    this.reconcile(res, { summary: 'reorder stages', kind: 'reorder', stages });
  }

  // Gate-rule edit — commits immediately -----------------------------------------------------------

  openGateEditor(gate: string): void {
    const def = this.gateDefs().find((g) => g.name === gate);
    this.editingGate.set(gate);
    this.draft.set({
      gate,
      owner: def?.owner ?? this.ownerOptions()[0],
      refusal: def?.refusal === 'soft' ? 'soft' : 'hard',
      triggers: [...(def?.trigger ?? [])],
    });
    this.triggerDraft.set('');
  }

  cancelGateEditor(): void {
    this.editingGate.set(null);
    this.draft.set(null);
  }

  setDraftOwner(owner: string): void {
    this.draft.update((d) => (d ? { ...d, owner } : d));
  }

  setDraftRefusal(refusal: 'hard' | 'soft'): void {
    this.draft.update((d) => (d ? { ...d, refusal } : d));
  }

  addTrigger(): void {
    const value = this.triggerDraft().trim();
    if (!value) return;
    this.draft.update((d) => (d ? { ...d, triggers: [...d.triggers, value] } : d));
    this.triggerDraft.set('');
  }

  removeTrigger(index: number): void {
    this.draft.update((d) => (d ? { ...d, triggers: d.triggers.filter((_, i) => i !== index) } : d));
  }

  async saveGateRule(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    this.lifecycle.set('saving');
    this.errorText.set(null);
    const res = await this.cp.gateTrigger({
      gate: d.gate,
      owner: d.owner,
      refusal: d.refusal,
      trigger: d.triggers,
      expectedRev: this.rev(),
    });
    if (res.ok === true) this.cancelGateEditor();
    this.reconcile(res, { summary: `edit ${d.gate} rule`, kind: 'gate', gate: d.gate });
  }

  // Preset — commits immediately -------------------------------------------------------------------

  choosePreset(preset: string): void {
    if (preset === this.activePreset()) return;
    this.lifecycle.set('saving');
    this.errorText.set(null);
    void this.cp
      .setPreset({ preset, expectedRev: this.rev() })
      .then((res) => this.reconcile(res, { summary: `set preset to ${preset}`, kind: 'preset' }));
  }

  onPresetKeydown(event: KeyboardEvent, preset: string): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.choosePreset(this.neighbourPreset(preset, 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.choosePreset(this.neighbourPreset(preset, -1));
    }
  }

  private neighbourPreset(preset: string, delta: number): string {
    const idx = PRESETS.indexOf(preset as (typeof PRESETS)[number]);
    const next = (idx + delta + PRESETS.length) % PRESETS.length;
    return PRESETS[next];
  }

  // Conflict reconciliation ------------------------------------------------------------------------

  private reconcile(res: MutationResult, attempt: ConflictAttempt): void {
    if (res.ok === true) {
      if (res.state) this.applied.emit(res.state);
      this.workingStages.set(null);
      this.lifecycle.set('saved');
      this.conflict.set(null);
      return;
    }
    if (res.ok === 'conflict') {
      // Adopt server truth (rolls back the optimistic change), then surface a focused reconcile.
      this.workingStages.set(null);
      this.cancelGateEditor();
      if (res.state) this.applied.emit(res.state);
      this.lifecycle.set('conflict');
      this.conflict.set(attempt);
      return;
    }
    this.lifecycle.set('error');
    this.errorText.set(`Couldn't save: ${res.error}`);
  }

  discardConflict(): void {
    this.conflict.set(null);
    this.lifecycle.set('saved');
  }

  /** Re-stage the interrupted intent against the now-fresh server model so the operator can resave. */
  reapplyConflict(): void {
    const attempt = this.conflict();
    this.conflict.set(null);
    if (!attempt) return;
    if (attempt.kind === 'reorder' && attempt.stages) {
      const order = attempt.stages;
      const byName = new Map(this.serverStages().map((s) => [s.stage, s]));
      const restaged = order.map((name) => byName.get(name)).filter((s): s is WorkflowStageView => !!s);
      if (restaged.length === this.serverStages().length) {
        this.workingStages.set(restaged);
        this.lifecycle.set('editing');
        return;
      }
    }
    if (attempt.kind === 'gate' && attempt.gate) {
      this.openGateEditor(attempt.gate);
      this.lifecycle.set('editing');
      return;
    }
    this.lifecycle.set('saved');
  }
}
