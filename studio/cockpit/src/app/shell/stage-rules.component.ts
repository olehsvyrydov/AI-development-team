import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { LabelDef, RuleAction, RuleCondition, RuleView } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** The closed WHEN-predicate kinds the selector offers (mirrors the engine's grammar). */
const CONDITION_TYPES = ['label', 'pattern', 'event'] as const;

/** The closed event enum the WHEN-selector exposes (derived 1:1 from the engine's typed events). */
const EVENT_NAMES = [
  'comment.added',
  'gate.passed',
  'gate.rejected',
  'gate.pending',
  'stage.entered',
  'stage.left',
  'assignee.changed',
  'label.set',
  'label.cleared',
  'ticket.created',
] as const;

/**
 * The DO-action kinds the editor OFFERS as new actions. `fan_out` is deliberately absent: the engine
 * records but does not execute parallel branches, so authoring a new one would be a control that does
 * nothing. The model union still carries `fan_out` and any pre-existing one renders read-only — the
 * editor simply never offers it as a new action.
 */
const ACTION_TYPES = ['route_to_stage', 'set_label', 'clear_label', 'instruct'] as const;

/** Agents an Instruct action may target. */
const INSTRUCT_TARGETS = ['/po', '/ba', '/arch', '/secops', '/ui', '/fe', '/be', '/rev', '/qa', '/e2e', '/verify'] as const;

/** A mutable draft of one rule while its editor is open. */
interface RuleDraft {
  readonly originalId: string | null;
  id: string;
  when: RuleCondition[];
  do: RuleAction[];
}

/**
 * The inline conditions surface for one stage: a read list of its `when → do` rules as plain
 * sentence cards, an allowed-labels strip sourced from the published contract, and a form to author
 * or edit a rule. The Set-label picker is filtered to the stage owner's `settable_by`, and a draft
 * that would route past an unmet safety-override gate or set an unauthorized label disables Save with
 * an inline reason — mirroring the server contract for fast feedback. The server re-validates on save
 * and is the authority. All rule text (ids, labels, prompts, patterns, stage names) reaches the DOM
 * through interpolation only — never `[innerHTML]`.
 *
 * The component is presentational: it emits the FULL new rule list (the edited rule merged into the
 * project's other rules) on {@link save}, leaving the guarded overlay CAS write + 409 reconcile to the
 * parent builder.
 */
@Component({
  selector: 'dart-stage-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <div class="rules" [attr.data-testid]="'stage-rules-' + stage()">
      <div class="rules__head">
        <span class="rules__title"><dart-glyph name="condition" /> Conditions on {{ stage() }}</span>
        <button type="button" class="btn btn--ghost" [attr.data-testid]="'rule-add-' + stage()" (click)="startNew()">
          <dart-glyph name="add-stage" /> Add rule
        </button>
      </div>

      @if (stageRules().length === 0 && !draft()) {
        <div class="rules__empty" [attr.data-testid]="'rules-empty-' + stage()">
          <p class="rules__emptyhead"><dart-glyph name="condition" /> No rules on this stage yet.</p>
          <p class="rules__emptybody">A rule is "when this happens, do that". For example:</p>
          <p class="rules__exline"><span class="kw">When</span> the review is rejected and the ticket has label TO_DEV_BE</p>
          <p class="rules__exline"><span class="kw">Do</span> send it back to /be to fix, then clear the label.</p>
        </div>
      }

      @for (r of stageRules(); track r.id) {
        <div class="rulecard" [attr.data-testid]="'rule-card-' + r.id">
          <p class="rulecard__when">
            <dart-glyph name="condition" /> <span class="kw">WHEN</span>
            @if (!r.when || r.when.length === 0) {
              <span> this stage runs</span>
            } @else {
              @for (c of r.when; track $index) {
                @if ($index > 0) { <span class="and"> AND </span> }
                <span class="cond">{{ conditionText(c) }}</span>
              }
            }
          </p>
          @for (a of r.do; track $index) {
            @if (a.action === 'fan_out') {
              <p class="rulecard__do rulecard__do--inert" [attr.data-testid]="'fanout-' + r.id">
                <dart-glyph name="pending" /> <span class="kw">DO</span>
                <span class="act">{{ actionText(a) }}</span>
                <span class="inertnote">— parallel execution is not available yet; this action is recorded but does not run yet.</span>
              </p>
            } @else {
              <p class="rulecard__do">
                <dart-glyph name="branch" /> <span class="kw">DO</span>
                <span class="act">{{ actionText(a) }}</span>
                @if (isBackwardRoute(a)) {
                  <span class="loopback" [attr.data-testid]="'loopback-' + r.id"><dart-glyph name="loop" /> loops back</span>
                }
                @if (a.action === 'clear_label') {
                  <span class="oneshot">(clears the label so the loop runs once, not forever)</span>
                }
              </p>
            }
          }
          <div class="rulecard__foot">
            <button type="button" class="btn btn--ghost btn--sm" [attr.data-testid]="'rule-edit-' + r.id" (click)="startEdit(r)">
              <dart-glyph name="edit" /> edit
            </button>
            <button type="button" class="btn btn--ghost btn--sm rule__del" [attr.data-testid]="'rule-delete-' + r.id" (click)="emitDelete(r)">
              <dart-glyph name="trash" /> delete
            </button>
          </div>
        </div>
      }

      <p class="strip" [attr.data-testid]="'allowed-labels-' + stage()">
        <dart-glyph name="label" /> Labels {{ ownerLabel() }} can use here:
        @if (settableLabels().length === 0) {
          <span class="strip__none">none yet —</span>
          <button type="button" class="strip__link" [attr.data-testid]="'manage-labels-link-' + stage()" (click)="manageLabels.emit()">create a label</button>
          <span class="strip__none">and choose {{ ownerLabel() }} under "Who can set this".</span>
        } @else {
          @for (l of settableLabels(); track l.name) {
            <span class="labelchip" [attr.data-testid]="'allowed-chip-' + l.name">{{ l.name }}@if (l.routesTo) { <span class="labelchip__route"> &rarr; {{ l.routesTo }}</span> }</span>
          }
          <button type="button" class="strip__link" [attr.data-testid]="'manage-labels-link-' + stage()" (click)="manageLabels.emit()">manage labels</button>
        }
      </p>

      @if (draft(); as d) {
        <form class="editor" [attr.data-testid]="'rule-editor-' + stage()" (submit)="$event.preventDefault(); emitSave()">
          <p class="editor__title">{{ d.originalId ? 'Edit rule' : 'New rule — when something happens, do something.' }}</p>

          <label class="editor__name">
            <span>Name</span>
            <input data-testid="rule-name" [value]="d.id" (input)="setId($any($event.target).value)" />
            <span class="editor__hint">A short name so you can find this rule later — e.g. send-rejection-to-backend.</span>
          </label>

          <fieldset class="editor__group">
            <legend>
              <span class="editor__legend"><dart-glyph name="condition" /> When this happens…</span>
              <button type="button" class="editor__help" data-testid="when-help-toggle" [attr.aria-expanded]="whenHelp()" aria-label="Help on conditions" (click)="whenHelp.set(!whenHelp())"><dart-glyph name="help" /></button>
            </legend>
            <p class="editor__sub">All of these must be true (AND).</p>
            @if (whenHelp()) {
              <p class="editor__helpbody" data-testid="when-help">Pick what makes this rule run — a label on the ticket, text in a comment, or a workflow event like a gate passing or being rejected. Leave it empty to run every time the stage runs.</p>
            }
            @if (d.when.length === 0) {
              <p class="editor__hint">No condition yet — this rule runs every time the stage runs. Add a condition to narrow it.</p>
            }
            @for (c of d.when; track $index) {
              <div class="editor__row" [attr.data-testid]="'condition-row-' + $index">
                @if ($index > 0) { <span class="and">AND</span> }
                <select [attr.data-testid]="'condition-type-' + $index" [value]="c.type" (change)="setConditionType($index, $any($event.target).value)">
                  @for (t of conditionTypes; track t) { <option [value]="t" [selected]="t === c.type">{{ conditionTypeLabel(t) }}</option> }
                </select>
                @switch (c.type) {
                  @case ('label') {
                    <select [attr.data-testid]="'condition-label-' + $index" [value]="c.label || ''" (change)="setConditionField($index, 'label', $any($event.target).value)">
                      <option value="">label…</option>
                      @for (l of allLabels(); track l.name) { <option [value]="l.name" [selected]="l.name === c.label">{{ l.name }}</option> }
                    </select>
                  }
                  @case ('pattern') {
                    <input [attr.data-testid]="'condition-pattern-' + $index" placeholder="pattern" [value]="c.pattern || ''" (input)="setConditionField($index, 'pattern', $any($event.target).value)" />
                  }
                  @case ('event') {
                    <select [attr.data-testid]="'condition-event-' + $index" [value]="c.event || ''" (change)="setConditionField($index, 'event', $any($event.target).value)">
                      <option value="">event…</option>
                      @for (e of eventNames; track e) { <option [value]="e" [selected]="e === c.event">{{ e }}</option> }
                    </select>
                  }
                }
                <button type="button" class="btn btn--ghost btn--sm" [attr.data-testid]="'condition-remove-' + $index" aria-label="Remove condition" (click)="removeCondition($index)"><dart-glyph name="remove" /></button>
              </div>
            }
            <button type="button" class="btn btn--ghost btn--sm" data-testid="rule-add-condition" (click)="addCondition()"><dart-glyph name="condition" /> add another condition (all must match)</button>
          </fieldset>

          <fieldset class="editor__group">
            <legend>
              <span class="editor__legend"><dart-glyph name="branch" /> …do this, in order:</span>
              <button type="button" class="editor__help" data-testid="do-help-toggle" [attr.aria-expanded]="doHelp()" aria-label="Help on actions" (click)="doHelp.set(!doHelp())"><dart-glyph name="help" /></button>
            </legend>
            <p class="editor__sub">These actions run top-to-bottom.</p>
            @if (doHelp()) {
              <p class="editor__helpbody" data-testid="do-help">Each action runs in order: send work to a stage, add or remove a label, or instruct an agent. DART records the instruction; your AI tool carries it out.</p>
            }
            @for (a of d.do; track $index) {
              <div class="editor__row" [attr.data-testid]="'action-row-' + $index">
                <span class="editor__num">{{ $index + 1 }}</span>
                <select [attr.data-testid]="'action-type-' + $index" [value]="a.action" (change)="setActionType($index, $any($event.target).value)">
                  @for (t of actionTypes; track t) { <option [value]="t" [selected]="t === a.action">{{ actionTypeLabel(t) }}</option> }
                </select>
                @switch (a.action) {
                  @case ('route_to_stage') {
                    <select [attr.data-testid]="'action-stage-' + $index" [value]="a.stage || ''" (change)="setActionField($index, 'stage', $any($event.target).value)">
                      <option value="">stage…</option>
                      @for (s of stageOrder(); track s) { <option [value]="s" [selected]="s === a.stage">{{ s }}</option> }
                    </select>
                  }
                  @case ('set_label') {
                    <select [attr.data-testid]="'action-label-' + $index" [value]="a.label || ''" (change)="setActionField($index, 'label', $any($event.target).value)">
                      <option value="">label…</option>
                      @for (l of settableLabels(); track l.name) { <option [value]="l.name" [selected]="l.name === a.label">{{ l.name }}</option> }
                    </select>
                  }
                  @case ('clear_label') {
                    <select [attr.data-testid]="'action-clearlabel-' + $index" [value]="a.label || ''" (change)="setActionField($index, 'label', $any($event.target).value)">
                      <option value="">label…</option>
                      @for (l of allLabels(); track l.name) { <option [value]="l.name" [selected]="l.name === a.label">{{ l.name }}</option> }
                    </select>
                  }
                  @case ('instruct') {
                    <span class="editor__conn">tell</span>
                    <select [attr.data-testid]="'action-target-' + $index" [value]="firstTarget(a)" (change)="setActionTarget($index, $any($event.target).value)">
                      <option value="">who…</option>
                      @for (t of instructTargets; track t) { <option [value]="t" [selected]="t === firstTarget(a)">{{ t }}</option> }
                    </select>
                    <input [attr.data-testid]="'action-prompt-' + $index" placeholder="what should they do?" [value]="a.prompt || ''" (input)="setActionField($index, 'prompt', $any($event.target).value)" />
                  }
                }
                <button type="button" class="btn btn--ghost btn--sm" [attr.data-testid]="'action-remove-' + $index" aria-label="Remove action" (click)="removeAction($index)"><dart-glyph name="remove" /></button>
              </div>
            }
            <button type="button" class="btn btn--ghost btn--sm" data-testid="rule-add-action" (click)="addAction()"><dart-glyph name="branch" /> add another action</button>
          </fieldset>

          <p class="editor__preview" data-testid="rule-preview">
            <span class="editor__previewlabel">This rule:</span> {{ previewSentence() }}
          </p>

          <p class="editor__loopnote" data-testid="rule-loop-note">
            <dart-glyph name="warning" /> This rule can send work backward — that's a loop, and it's fine. If a ticket loops too many times, DART stops and hands it to you instead of looping forever.
          </p>

          @if (draftError(); as e) {
            <p class="editor__err" data-testid="rule-draft-error" role="alert">{{ e }}</p>
          }

          <div class="editor__actions">
            <button type="button" class="btn btn--ghost" data-testid="rule-cancel" (click)="cancelEdit()">Cancel</button>
            <button type="submit" class="btn btn--primary" data-testid="rule-save" [disabled]="!!draftError() || saving()">
              @if (saving()) { <dart-glyph name="spinner" /> } <dart-glyph name="save" /> Save rule
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    :host { display: block; flex: 1 1 100%; margin-top: 0.35rem; }
    .rules { display: flex; flex-direction: column; gap: 0.5rem; padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .rules__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .rules__title { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; font-size: var(--kb-text-sm); color: var(--kb-text); }
    .rules__empty { display: flex; flex-direction: column; gap: 0.15rem; margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-subtle); }
    .rules__emptyhead { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-weight: 600; color: var(--kb-text-muted); }
    .rules__emptybody { margin: 0; }
    .rules__exline { margin: 0; padding-left: 0.5rem; color: var(--kb-text-muted); }
    .rulecard__do--inert { color: var(--kb-text-subtle); }
    .inertnote { font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .rulecard { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.4rem 0.5rem; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .rulecard__when, .rulecard__do { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text); }
    .kw { font-weight: 700; letter-spacing: 0.03em; color: var(--kb-text-muted); }
    .and { font-weight: 600; color: var(--kb-text-subtle); }
    .loopback { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--kb-warning); font-size: var(--kb-text-xs); }
    .oneshot { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
    .rulecard__foot { display: flex; gap: 0.3rem; }
    .rule__del { color: var(--kb-danger); }
    .strip { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin: 0; padding-top: 0.3rem; border-top: 1px dashed var(--kb-border); font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .labelchip { display: inline-flex; align-items: center; padding: 0.05rem 0.4rem; background: var(--kb-accent-soft); color: var(--kb-accent); border-radius: 999px; }
    .labelchip__route { color: var(--kb-text-muted); }
    .strip__none { color: var(--kb-text-subtle); }
    .strip__link { padding: 0; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); background: transparent; border: none; text-decoration: underline; cursor: pointer; }
    .strip__link:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .editor { display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .editor__title { margin: 0; font-weight: 600; color: var(--kb-text); }
    .editor__name { display: flex; flex-direction: column; gap: 0.2rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .editor__group { display: flex; flex-direction: column; gap: 0.35rem; margin: 0; padding: 0.4rem; border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .editor__group legend { display: flex; align-items: center; justify-content: space-between; gap: 0.3rem; width: 100%; }
    .editor__legend { display: inline-flex; align-items: center; gap: 0.3rem; font-size: var(--kb-text-sm); font-weight: 700; color: var(--kb-text); }
    .editor__help { display: inline-flex; padding: 0.1rem; color: var(--kb-text-muted); background: transparent; border: none; cursor: pointer; }
    .editor__help:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; border-radius: var(--kb-radius-sm); }
    .editor__sub { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .editor__helpbody { margin: 0; padding: 0.3rem 0.4rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); background: var(--kb-surface); border-radius: var(--kb-radius-sm); }
    .editor__num { display: inline-flex; align-items: center; justify-content: center; width: 1.3rem; height: 1.3rem; font-size: var(--kb-text-xs); font-weight: 700; color: var(--kb-text-muted); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: 999px; flex: none; }
    .editor__conn { font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .editor__preview { margin: 0; padding: 0.4rem 0.5rem; font-size: var(--kb-text-sm); color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .editor__previewlabel { font-weight: 700; color: var(--kb-text-muted); }
    .editor__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
    .editor__hint { font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .editor select, .editor input { padding: 0.2rem 0.35rem; font: inherit; font-size: var(--kb-text-sm); color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .editor__loopnote { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-warning); }
    .editor__err { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-danger); }
    .editor__actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn--sm { padding: 0.15rem 0.4rem; font-size: var(--kb-text-xs); }
    .btn--ghost { background: transparent; }
    .btn--primary { background: var(--kb-accent-soft); color: var(--kb-accent); border-color: var(--kb-accent); }
    .btn:disabled { opacity: 0.55; cursor: default; }
  `,
})
export class StageRulesComponent {
  readonly stage = input.required<string>();
  readonly owner = input<string | null>(null);
  readonly rules = input.required<readonly RuleView[]>();
  readonly labels = input.required<readonly LabelDef[]>();
  /** The active track's stages in order — for the route picker and backward-route detection. */
  readonly stageOrder = input.required<readonly string[]>();
  /** Gate name keyed by the stage it governs — used to find a safety gate ahead of a route target. */
  readonly safetyStages = input<readonly string[]>([]);
  readonly saving = input(false);

  /** The full new rule list (the edited rule merged into the project's others), to persist. */
  readonly save = output<readonly RuleView[]>();
  readonly cancel = output<void>();
  /** Asks the parent builder to open the Labels management surface (the strip's create/manage link). */
  readonly manageLabels = output<void>();

  readonly conditionTypes = CONDITION_TYPES;
  readonly eventNames = EVENT_NAMES;
  readonly actionTypes = ACTION_TYPES;
  readonly instructTargets = INSTRUCT_TARGETS;

  private readonly draftSig = signal<RuleDraft | null>(null);
  readonly draft = this.draftSig.asReadonly();

  /** Collapsed-by-default inline help disclosures for the WHEN / DO sections. */
  readonly whenHelp = signal(false);
  readonly doHelp = signal(false);

  /**
   * The draft echoed as one plain sentence, reusing the read renderers ({@link conditionText} /
   * {@link actionText}) so what the user sees while authoring matches the saved card exactly.
   */
  readonly previewSentence = computed<string>(() => {
    const d = this.draftSig();
    if (!d) return '';
    const conds = d.when.filter((c) => this.conditionFilled(c)).map((c) => this.conditionText(c));
    const acts = d.do.filter((a) => this.actionFilled(a)).map((a) => this.actionText(a));
    const when = conds.length ? `When ${conds.join(' and ')}, ` : 'Whenever this stage runs, ';
    const then = acts.length ? acts.join(', then ') : '(no actions yet)';
    return `${when}${then}.`;
  });

  private conditionFilled(c: RuleCondition): boolean {
    if (c.type === 'label') return !!c.label;
    if (c.type === 'pattern') return !!c.pattern;
    return !!c.event;
  }

  private actionFilled(a: RuleAction): boolean {
    if (a.action === 'route_to_stage') return !!a.stage;
    if (a.action === 'set_label' || a.action === 'clear_label') return !!a.label;
    if (a.action === 'instruct') return !!(a.target && a.target[0]);
    return true;
  }

  /** The rules attached to this stage (read cards). */
  readonly stageRules = computed(() => this.rules().filter((r) => (r.stage ?? null) === this.stage()));

  readonly allLabels = computed(() => this.labels());

  /** Labels the stage owner may set, per the contract (`*` = any). The Set-label picker uses this. */
  readonly settableLabels = computed<readonly LabelDef[]>(() => {
    const owner = this.owner();
    return this.labels().filter((l) => l.settableBy.includes('*') || (owner ? l.settableBy.includes(owner) : false));
  });

  readonly ownerLabel = computed(() => this.owner() ?? 'this stage');

  conditionTypeLabel(t: string): string {
    return t === 'pattern' ? 'A comment matches text' : t === 'event' ? 'Something happened' : 'The ticket has a label';
  }

  actionTypeLabel(t: string): string {
    switch (t) {
      case 'route_to_stage':
        return 'Send work to a stage';
      case 'set_label':
        return 'Add a label';
      case 'clear_label':
        return 'Remove a label';
      case 'instruct':
        return 'Tell an agent to do something';
      case 'fan_out':
        return 'Fan out';
      default:
        return t;
    }
  }

  conditionText(c: RuleCondition): string {
    if (c.type === 'label') return `label ${c.label ?? '—'}`;
    if (c.type === 'pattern') return `a comment matches /${c.pattern ?? ''}/`;
    const qualifier = c.gate ? ` ${c.gate}` : c.stage ? ` ${c.stage}` : '';
    return `event ${c.event ?? '—'}${qualifier}`;
  }

  actionText(a: RuleAction): string {
    switch (a.action) {
      case 'route_to_stage':
        return `route to ${a.stage ?? '—'}`;
      case 'set_label':
        return `set label ${a.label ?? '—'}`;
      case 'clear_label':
        return `clear label ${a.label ?? '—'}`;
      case 'instruct':
        return `instruct ${(a.target ?? []).join(', ') || '—'}: "${a.prompt ?? ''}"`;
      case 'fan_out':
        return `fan out to ${(a.stages ?? []).join(', ') || '—'}`;
      default:
        return a.action;
    }
  }

  firstTarget(a: RuleAction): string {
    return a.target?.[0] ?? '';
  }

  /** A route targets a stage earlier than the current one in track order → it loops back. */
  isBackwardRoute(a: RuleAction): boolean {
    if (a.action !== 'route_to_stage' || !a.stage) return false;
    const order = this.stageOrder();
    const here = order.indexOf(this.stage());
    const target = order.indexOf(a.stage);
    return here >= 0 && target >= 0 && target < here;
  }

  startNew(): void {
    this.whenHelp.set(false);
    this.doHelp.set(false);
    this.draftSig.set({ originalId: null, id: '', when: [], do: [] });
  }

  startEdit(r: RuleView): void {
    this.draftSig.set({
      originalId: r.id,
      id: r.id,
      when: (r.when ?? []).map((c) => ({ ...c })),
      do: r.do.map((a) => ({ ...a, target: a.target ? [...a.target] : undefined, stages: a.stages ? [...a.stages] : undefined })),
    });
  }

  cancelEdit(): void {
    this.draftSig.set(null);
    this.cancel.emit();
  }

  setId(id: string): void {
    this.draftSig.update((d) => (d ? { ...d, id } : d));
  }

  addCondition(): void {
    this.draftSig.update((d) => (d ? { ...d, when: [...d.when, { type: 'label' }] } : d));
  }

  removeCondition(i: number): void {
    this.draftSig.update((d) => (d ? { ...d, when: d.when.filter((_, idx) => idx !== i) } : d));
  }

  setConditionType(i: number, type: RuleCondition['type']): void {
    this.draftSig.update((d) => (d ? { ...d, when: d.when.map((c, idx) => (idx === i ? { type } : c)) } : d));
  }

  setConditionField(i: number, field: 'label' | 'pattern' | 'event', value: string): void {
    this.draftSig.update((d) => (d ? { ...d, when: d.when.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)) } : d));
  }

  addAction(): void {
    this.draftSig.update((d) => (d ? { ...d, do: [...d.do, { action: 'route_to_stage' }] } : d));
  }

  removeAction(i: number): void {
    this.draftSig.update((d) => (d ? { ...d, do: d.do.filter((_, idx) => idx !== i) } : d));
  }

  setActionType(i: number, action: RuleAction['action']): void {
    this.draftSig.update((d) => (d ? { ...d, do: d.do.map((a, idx) => (idx === i ? { action } : a)) } : d));
  }

  setActionField(i: number, field: 'stage' | 'label' | 'prompt', value: string): void {
    this.draftSig.update((d) => (d ? { ...d, do: d.do.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)) } : d));
  }

  setActionTarget(i: number, target: string): void {
    this.draftSig.update((d) =>
      d ? { ...d, do: d.do.map((a, idx) => (idx === i ? { ...a, target: target ? [target] : [] } : a)) } : d,
    );
  }

  /**
   * The client-side reason a draft cannot be saved, or null when valid. Mirrors the server contract
   * (complete fields, a settable label, no route past an unmet safety gate) for fast feedback — the
   * server re-validates and stays the authority.
   */
  readonly draftError = computed<string | null>(() => {
    const d = this.draftSig();
    if (!d) return null;
    if (!d.id.trim()) return 'A rule name is required.';
    if (d.do.length === 0) return 'Add at least one action.';
    const settable = new Set(this.settableLabels().map((l) => l.name));
    for (const a of d.do) {
      if (a.action === 'route_to_stage') {
        if (!a.stage) return 'Pick a target stage for the route action.';
        if (this.routesPastUnmetSafetyGate(a.stage)) return 'This route would skip past an unmet safety gate.';
      }
      if (a.action === 'set_label') {
        if (!a.label) return 'Pick a label to set.';
        if (!settable.has(a.label)) return `${this.ownerLabel()} cannot set the label ${a.label}.`;
      }
      if (a.action === 'clear_label' && !a.label) return 'Pick a label to clear.';
      if (a.action === 'instruct') {
        if (!a.target || a.target.length === 0 || !a.target[0]) return 'Pick who to instruct.';
        if (!a.prompt || !a.prompt.trim()) return 'Instruct needs a prompt.';
      }
    }
    for (const c of d.when) {
      if (c.type === 'label' && !c.label) return 'Pick a label for the condition.';
      if (c.type === 'pattern' && (!c.pattern || !c.pattern.trim())) return 'The pattern cannot be empty.';
      if (c.type === 'event' && !c.event) return 'Pick an event for the condition.';
    }
    return null;
  });

  /** True when routing to `target` would move a ticket at/beyond a not-yet-passed safety gate. */
  private routesPastUnmetSafetyGate(target: string): boolean {
    const order = this.stageOrder();
    const here = order.indexOf(this.stage());
    const targetIdx = order.indexOf(target);
    if (here < 0 || targetIdx < 0 || targetIdx <= here) return false;
    // Any safety-gated stage strictly between the current stage and the (forward) target is bypassed.
    return this.safetyStages().some((s) => {
      const gi = order.indexOf(s);
      return gi > here && gi <= targetIdx;
    });
  }

  emitSave(): void {
    const d = this.draftSig();
    if (!d || this.draftError()) return;
    const rule: RuleView = { id: d.id.trim(), stage: this.stage(), when: d.when, do: d.do };
    const others = this.rules().filter((r) => r.id !== d.originalId && r.id !== rule.id);
    this.save.emit([...others, rule]);
  }

  emitDelete(r: RuleView): void {
    this.save.emit(this.rules().filter((x) => x.id !== r.id));
  }
}
