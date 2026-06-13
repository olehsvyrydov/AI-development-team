import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  ControlPlaneService,
  type LabelSpec,
  type MutationResult,
  type SetStagesStage,
} from '../core/control-plane.service';
import type { GateDef, LabelDef, ProjectState, RuleView, WorkflowStageView } from '../core/models';
import { denormalizeRules, normalizeLabels, normalizeRules } from '../core/models';

/** The gate that may never be routed past while unmet (safety override) — mirrored from the engine. */
export const SAFETY_GATE = 'SECOPS_APPROVED';

/** The allowed presets, mirrored from the hub allowlist (the server stays the authority). */
export const PRESETS = ['solo', 'small-team', 'regulated'] as const;

/** The roles a gate owner may be set to: those already used by gates, plus the standard team set. */
const STANDARD_OWNERS = ['/po', '/ba', '/arch', '/secops', '/ui', '/fe', '/be', '/rev', '/qa', '/e2e', '/verify'] as const;

/** The server's stage-name cap, mirrored client-side so an over-long name is blocked before sending. */
export const STAGE_NAME_MAX = 64;

/** The save lifecycle of an editor surface — each is rendered as glyph + text, never colour alone. */
export type Lifecycle = 'saved' | 'editing' | 'saving' | 'conflict' | 'error';

/** A draft of a gate's editable rule while its inline editor is open. */
export interface GateDraft {
  readonly gate: string;
  owner: string;
  refusal: 'hard' | 'soft';
  triggers: string[];
}

/** What the operator attempted when a 409 interrupted them, shown in the reconcile banner. */
export interface ConflictAttempt {
  readonly summary: string;
  readonly kind: 'reorder' | 'gate' | 'preset' | 'set-stages' | 'rules';
  readonly gate?: string;
  readonly stages?: readonly string[];
}

/**
 * The single, view-agnostic edit controller for a project's active workflow. It owns the ONE
 * implementation of every structural mutation (reorder / add / delete / set-owner via the declarative
 * `track/set-stages` CAS, gate-rule via `gate/trigger`, preset, rules, labels) together with the
 * optimistic working copy, the keyboard-pickup reorder model, the inline gate-rule draft, and the
 * first-class 409 reconciliation (adopt server truth, roll back, surface a focused conflict the
 * operator can Discard or Re-apply). Both the in-place pipeline edit-mode and any retained editor
 * sub-surface DRIVE this controller, so there is exactly one CAS + conflict path, never a copy.
 *
 * It is provided per editor host (not root), holds no DOM, and emits applied state through a callback
 * the host registers — the host adopts it as truth (a 200 or a 409 re-sync both carry fresh state).
 * Concurrency invariants it guarantees for callers: every write sends `expectedRev` from the
 * CURRENTLY-RENDERED state; a 409 is decoded, never thrown; the optimistic copy rolls back on
 * conflict; a stale server push during an in-flight reorder never yanks the dirty working order; one
 * write per atomic intent.
 */
@Injectable()
export class WorkflowEditController {
  private readonly cp = inject(ControlPlaneService);

  /** The live project state the host feeds in; every mutation reads its `rev` from here. */
  private readonly stateSignal = signal<ProjectState>({});

  /** The host's adopt-truth sink, invoked with fresh server state on a 200 or a 409 re-sync. */
  private onApplied: ((state: ProjectState) => void) | null = null;

  readonly presets = PRESETS;
  readonly nameMax = STAGE_NAME_MAX;

  /** Feed the controller the host's current live state (call on every input/SSE change). */
  setState(state: ProjectState): void {
    this.stateSignal.set(state ?? {});
  }

  /** Register the host's adopt-truth sink; the controller calls it with each fresh server state. */
  onApply(sink: (state: ProjectState) => void): void {
    this.onApplied = sink;
  }

  readonly state = this.stateSignal.asReadonly();

  /** The server's stage order for the active track — the truth the working copy resets to. */
  private readonly serverStages = computed<readonly WorkflowStageView[]>(() => this.state().workflowView?.stages ?? []);
  readonly activeTrack = computed<string | null>(() => this.state().workflowView?.activeTrack ?? null);
  readonly activePreset = computed(() => this.state().preset ?? 'solo');
  private readonly rev = computed(() => this.state().rev ?? '');
  private readonly gateDefs = computed<readonly GateDef[]>(() => this.state().gateDefs ?? []);

  /**
   * The project's `when → do` rules and label contract — read + authored by the inline editors. The
   * hub serialises labels as a name-keyed object and rules in its engine grammar; both are adapted
   * here into the array/typed shapes the editors bind.
   */
  readonly rules = computed<readonly RuleView[]>(() => normalizeRules(this.state().rules));
  readonly labels = computed<readonly LabelDef[]>(() => normalizeLabels(this.state().labels));

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

  /** The active track's stage names in order — for the rule editor's route picker + loop detection. */
  readonly stageNames = computed<readonly string[]>(() => this.working().map((s) => s.stage));

  /** Stages governed by an unmet safety-override gate — a rule may not route a ticket past one. */
  readonly safetyStages = computed<readonly string[]>(() =>
    this.working()
      .filter((s) => s.gate?.name === SAFETY_GATE && s.gate.refusal === 'hard')
      .map((s) => s.stage),
  );

  /** The owner allowlist: the standard team roles unioned with any owner the gates already use. */
  readonly ownerOptions = computed<readonly string[]>(() => {
    const used = this.gateDefs().map((g) => g.owner).filter((o): o is string => typeof o === 'string');
    return [...new Set<string>([...STANDARD_OWNERS, ...used])];
  });

  readonly lifecycle = signal<Lifecycle>('saved');
  readonly errorText = signal<string | null>(null);
  readonly conflict = signal<ConflictAttempt | null>(null);
  readonly announce = signal('');

  /** The index of the row in keyboard pick-up mode (Space-grabbed), or null. */
  readonly grabbedIndex = signal<number | null>(null);
  /** Whether a pointer drag of a row is in progress; set by the host while an HTML5 drag is live. */
  readonly pointerDragging = signal(false);
  /** The stage order before a keyboard pick-up began, restored on Escape. */
  private grabSnapshot: readonly WorkflowStageView[] | null = null;

  /** The stage whose inline gate-rule editor is open, or null, plus its working draft. */
  readonly editingGate = signal<string | null>(null);
  readonly draft = signal<GateDraft | null>(null);
  readonly triggerDraft = signal('');

  /** The stage currently confirming deletion (its inline confirm is open), or null. */
  readonly deleting = signal<string | null>(null);

  /** The insertion index for the open new-stage form (null when closed), with its name/owner draft. */
  readonly adding = signal<number | null>(null);
  readonly newName = signal('');
  readonly newOwner = signal('');

  /** Caption naming the insertion point of the open new-stage form ("at the end" / "after {stage}"). */
  readonly insertCaption = computed(() => {
    const at = this.adding();
    if (at === null) return '';
    const list = this.working();
    if (at <= 0) return 'new stage (at the start)';
    if (at >= list.length) return 'new stage (at the end)';
    return `new stage (inserting after “${list[at - 1].stage}”)`;
  });

  /**
   * The client-side validation reason a new-stage name is rejected, or null when valid. Mirrors the
   * server (required after trim, unique within the working list, length-capped) for fast feedback —
   * the server stays the authority and its terse `400` still surfaces as an error.
   */
  readonly newNameError = computed<string | null>(() => {
    if (this.adding() === null) return null;
    const name = this.newName().trim();
    if (!name) return 'A stage name is required.';
    if (name.length > STAGE_NAME_MAX) return 'Stage name is too long.';
    const lower = name.toLowerCase();
    if (this.working().some((s) => s.stage.toLowerCase() === lower)) {
      return `A stage named “${name}” already exists.`;
    }
    return null;
  });

  /** Whether the operator is mid-gesture on a reorder — a keyboard pick-up or a pointer drag. */
  private readonly reorderInProgress = computed(() => this.grabbedIndex() !== null || this.pointerDragging());

  constructor() {
    // When the server stages change identity (a fresh push or adopt), drop a stale optimistic copy so
    // the working copy follows server truth rather than pinning an outdated order — UNLESS the operator
    // is mid-gesture (a live keyboard pick-up or pointer drag), whose in-flight order is preserved so
    // an agent's concurrent push never yanks it from under the hand.
    effect(() => {
      const serverKey = this.serverStages().map((s) => s.stage).join('>');
      const local = this.workingStages();
      if (local && local.map((s) => s.stage).join('>') !== serverKey && !this.reorderInProgress()) {
        this.workingStages.set(null);
      }
    });
  }

  // Reorder — drag + keyboard, each commits immediately --------------------------------------------

  /** Move the stage at `from` to `to` and persist the full new order as one set-stages CAS write. */
  commitMove(from: number, to: number): void {
    const next = this.reordered(from, to);
    if (!next) return;
    const moved = next[Math.max(0, Math.min(to, next.length - 1))];
    this.announce.set(`Dropped ${moved.stage} at position ${to + 1} of ${next.length}.`);
    void this.commitStages(next, { summary: `reorder ${moved.stage}`, kind: 'set-stages', stages: next.map((s) => s.stage) });
  }

  /** The working list with the item at `from` removed and re-inserted at `to`, or null if a no-op. */
  private reordered(from: number, to: number): WorkflowStageView[] | null {
    const list = [...this.working()];
    if (from < 0 || from >= list.length) return null;
    const clampedTo = Math.max(0, Math.min(to, list.length - 1));
    if (from === clampedTo) return null;
    const [item] = list.splice(from, 1);
    list.splice(clampedTo, 0, item);
    return list;
  }

  /** Begin a keyboard pick-up of the row at `index`, snapshotting the order for Escape-to-restore. */
  pickUp(index: number): void {
    this.grabSnapshot = this.working();
    this.grabbedIndex.set(index);
    const total = this.working().length;
    this.announce.set(
      `Picked up ${this.working()[index].stage}, position ${index + 1} of ${total}. Use the arrow keys to move, Space to drop, Escape to cancel.`,
    );
  }

  /** Move the grabbed row by `delta` positions, previewing the new order optimistically (no write). */
  moveGrabbed(delta: number): void {
    const from = this.grabbedIndex();
    if (from === null) return;
    const to = from + delta;
    const next = this.reordered(from, to);
    if (!next) return;
    this.workingStages.set(next);
    const newIndex = Math.max(0, Math.min(to, next.length - 1));
    this.grabbedIndex.set(newIndex);
    this.announce.set(`${next[newIndex].stage} now at position ${newIndex + 1} of ${next.length}.`);
  }

  /** Drop the grabbed row, committing the previewed working order as one set-stages CAS write. */
  dropGrabbed(index: number): void {
    const to = this.grabbedIndex() ?? index;
    this.grabbedIndex.set(null);
    this.grabSnapshot = null;
    const next = [...this.working()];
    const moved = next[Math.max(0, Math.min(to, next.length - 1))];
    this.announce.set(`Dropped ${moved?.stage ?? ''} at position ${to + 1} of ${next.length}.`);
    void this.commitStages(next, { summary: `reorder ${moved?.stage ?? ''}`, kind: 'set-stages', stages: next.map((s) => s.stage) });
  }

  /** Whether a keyboard pick-up is in progress. */
  isGrabbing(): boolean {
    return this.grabbedIndex() !== null;
  }

  /**
   * Cancel a keyboard pick-up. The optimistic copy is dropped so the chain falls back to server truth
   * (which equals the pre-grab order at this instant, or a fresher order if an agent pushed mid-grab —
   * a live push must always flow into the read). With the grab ended, no in-flight gesture pins it.
   */
  cancelGrab(): void {
    const snapshot = this.grabSnapshot;
    const index = this.grabbedIndex();
    this.grabbedIndex.set(null);
    this.grabSnapshot = null;
    if (snapshot) {
      this.workingStages.set(null);
      this.announce.set(
        index !== null ? `Cancelled. ${snapshot[index]?.stage ?? ''} back at position ${index + 1}.` : 'Cancelled.',
      );
    }
  }

  // Stage-list edits (add / delete / owner) — one declarative set-stages write -------------------

  /** Map the working stage views to the declarative wire shape: name + owner (owner omitted when blank). */
  private stagePayload(stages: readonly WorkflowStageView[]): SetStagesStage[] {
    return stages.map((s) => (s.owner ? { name: s.stage, owner: s.owner } : { name: s.stage }));
  }

  /**
   * Commit a full ordered stage list to the overlay as one `track/set-stages` write. The working copy
   * is set optimistically so the surface already shows the edit; a 200/409 then adopts server truth.
   */
  async commitStages(stages: readonly WorkflowStageView[], attempt: ConflictAttempt): Promise<void> {
    const track = this.activeTrack();
    if (!track) return;
    this.workingStages.set(stages);
    this.lifecycle.set('saving');
    this.errorText.set(null);
    const res = await this.cp.setStages({ track, stages: this.stagePayload(stages), expectedRev: this.rev() });
    this.reconcile(res, attempt);
  }

  /** Open the new-stage form at insertion index `index`, clearing any other open inline surface. */
  openAdder(index: number): void {
    this.adding.set(index);
    this.newName.set('');
    this.newOwner.set('');
    this.deleting.set(null);
    if (this.lifecycle() !== 'saving') this.lifecycle.set('editing');
  }

  cancelAdd(): void {
    this.adding.set(null);
    if (this.lifecycle() === 'editing' && !this.reorderDirty()) this.lifecycle.set('saved');
  }

  /** Add a stage at the form's chosen insertion index; commits the full list as one set-stages CAS. */
  async confirmAdd(): Promise<void> {
    const at = this.adding();
    if (at === null || this.newNameError()) return;
    const owner = this.newOwner();
    const entry: WorkflowStageView = { stage: this.newName().trim(), owner: owner || null, gate: null };
    const list = [...this.working()];
    const index = Math.max(0, Math.min(at, list.length));
    list.splice(index, 0, entry);
    this.adding.set(null);
    this.announce.set(`Added ${entry.stage} at position ${index + 1} of ${list.length}.`);
    await this.commitStages(list, {
      summary: `add stage ${entry.stage}`,
      kind: 'set-stages',
      stages: list.map((s) => s.stage),
    });
  }

  openDelete(stage: string): void {
    if (this.working().length <= 1) return;
    this.deleting.set(stage);
    this.adding.set(null);
  }

  cancelDelete(): void {
    this.deleting.set(null);
  }

  async confirmDelete(stage: string): Promise<void> {
    if (this.working().length <= 1) return;
    const next = this.working().filter((s) => s.stage !== stage);
    this.deleting.set(null);
    await this.commitStages(next, { summary: `delete stage ${stage}`, kind: 'set-stages', stages: next.map((s) => s.stage) });
  }

  /** Set (or clear with `''`) a stage's owner and persist the whole list as one set-stages write. */
  async setStageOwner(stage: string, owner: string): Promise<void> {
    const next = this.working().map((s) => (s.stage === stage ? { ...s, owner: owner || null } : s));
    await this.commitStages(next, { summary: `set owner of ${stage}`, kind: 'set-stages', stages: next.map((s) => s.stage) });
  }

  /** Count the tickets currently recorded against a stage (for the delete confirm's off-track warning). */
  ticketsInStage(stage: string): number {
    return (this.state().tickets ?? []).filter((t) => t.stage === stage).length;
  }

  // Rule editor — when→do conditions per stage; commits via set-rules (same overlay/rev) ------------

  /** The number of `when → do` rules attached to a given stage. */
  rulesCount(stage: string): number {
    return this.rules().filter((r) => (r.stage ?? null) === stage).length;
  }

  /** Persist the full new rule list (the editor merged its edit into the project's others). */
  async saveRules(rules: readonly RuleView[]): Promise<boolean> {
    this.lifecycle.set('saving');
    this.errorText.set(null);
    const res = await this.cp.setRules({ rules: denormalizeRules(rules), expectedRev: this.rev() });
    const ok = res.ok === true;
    this.reconcile(res, { summary: 'edit rules', kind: 'rules' });
    return ok;
  }

  /** Persist the full new label contract (the manager merged its edit into the project's others). */
  async saveLabels(labels: Record<string, LabelSpec>): Promise<void> {
    this.lifecycle.set('saving');
    this.errorText.set(null);
    const res = await this.cp.setLabels({ labels, expectedRev: this.rev() });
    this.reconcile(res, { summary: 'edit labels', kind: 'rules' });
  }

  // Gate-rule edit — commits immediately -----------------------------------------------------------

  /** Whether a gate is the safety-override gate whose hard→soft softening is refused at the UI. */
  isSafetyGate(gate: string): boolean {
    return gate === SAFETY_GATE;
  }

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

  /** Set the draft refusal, refusing to soften the safety gate (the server refuses it regardless). */
  setDraftRefusal(refusal: 'hard' | 'soft'): void {
    this.draft.update((d) => {
      if (!d) return d;
      if (refusal === 'soft' && this.isSafetyGate(d.gate)) return d;
      return { ...d, refusal };
    });
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

  async saveGateRule(): Promise<boolean> {
    const d = this.draft();
    if (!d) return false;
    this.lifecycle.set('saving');
    this.errorText.set(null);
    const res = await this.cp.gateTrigger({
      gate: d.gate,
      owner: d.owner,
      refusal: d.refusal,
      trigger: d.triggers,
      expectedRev: this.rev(),
    });
    const ok = res.ok === true;
    if (ok) this.cancelGateEditor();
    this.reconcile(res, { summary: `edit ${d.gate} rule`, kind: 'gate', gate: d.gate });
    return ok;
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

  /** The preset that follows `preset` by `delta` positions (wraps) — for radiogroup arrow keys. */
  neighbourPreset(preset: string, delta: number): string {
    const idx = PRESETS.indexOf(preset as (typeof PRESETS)[number]);
    const next = (idx + delta + PRESETS.length) % PRESETS.length;
    return PRESETS[next];
  }

  // Conflict reconciliation ------------------------------------------------------------------------

  private reconcile(res: MutationResult, attempt: ConflictAttempt): void {
    if (res.ok === true) {
      if (res.state) this.onApplied?.(res.state);
      this.workingStages.set(null);
      this.lifecycle.set('saved');
      this.conflict.set(null);
      return;
    }
    if (res.ok === 'conflict') {
      // Adopt server truth (rolls back the optimistic change), then surface a focused reconcile.
      this.workingStages.set(null);
      this.cancelGateEditor();
      if (res.state) this.onApplied?.(res.state);
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

  /**
   * Re-stage the interrupted intent against the now-fresh server model so the operator can resave.
   * A reorder/set-stages replays only when every intended stage still exists; a gate edit re-opens
   * the editor; otherwise the operator keeps server truth.
   */
  reapplyConflict(): void {
    const attempt = this.conflict();
    this.conflict.set(null);
    if (!attempt) return;
    if ((attempt.kind === 'reorder' || attempt.kind === 'set-stages') && attempt.stages) {
      const order = attempt.stages;
      const byName = new Map(this.serverStages().map((s) => [s.stage, s]));
      const restaged = order.map((name) => byName.get(name)).filter((s): s is WorkflowStageView => !!s);
      if (restaged.length === order.length) {
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
