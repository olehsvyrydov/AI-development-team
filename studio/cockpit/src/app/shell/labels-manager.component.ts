import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { LabelDef } from '../core/models';
import type { LabelSpec } from '../core/control-plane.service';
import { GlyphComponent } from './glyph.component';

/** The server's name cap, mirrored client-side so an over-long name is blocked before sending. */
const NAME_MAX = 64;

/** One-click starter labels — a routing label whose whole shape teaches by example (per the brief). */
const STARTERS: Record<string, { settableBy: string[]; routesTo: string; owner: string; meaning: string }> = {
  TO_DEV_BE: { settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/be', meaning: 'send back to the backend dev' },
  TO_DEV_FE: { settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/fe', meaning: 'send back to the frontend dev' },
};

/** A mutable draft of one label while its create/edit form is open. */
interface LabelDraft {
  readonly originalName: string | null;
  name: string;
  settableMode: 'specific' | 'anyone';
  settableAgents: string[];
  routesTo: string;
  owner: string;
  meaning: string;
}

/**
 * The label-management surface: the missing door that lets an operator CREATE the routing words
 * (`TO_DEV_BE`, …) the rule editor consumes. It lists the project's labels (name, who-can-set,
 * routes-to, meaning), teaches with an example-led empty state plus one-click starters, and offers a
 * create/edit/delete form. It is presentational like the rule editor: every create/edit/delete emits
 * the COMPLETE new label map (the engine's name-keyed `{ NAME: { settable_by, routes_to?, owner?,
 * meaning? } }` shape) on {@link save}, leaving the guarded overlay CAS write + 409 reconcile to the
 * parent builder (labels ride the same overlay/`rev` as stages and rules). All label text (names,
 * agents, routes, meaning) reaches the DOM through interpolation only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-labels-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <div class="labels" data-testid="labels-manager">
      <div class="labels__head">
        <span class="labels__title"><dart-glyph name="label" /> Labels</span>
        <span class="labels__count" data-testid="labels-count">{{ labels().length }} {{ labels().length === 1 ? 'label' : 'labels' }}</span>
        @if (!draft()) {
          <button type="button" class="btn btn--ghost" data-testid="label-new" (click)="startNew()">
            <dart-glyph name="add-stage" /> New label
          </button>
        }
      </div>
      <p class="labels__lead">Labels are the words your team uses to route work — make one once, any rule can use it to send work where it belongs.</p>
      <p class="labels__scope"><dart-glyph name="info" /> Saved to this project only — the shared default is never touched.</p>

      @if (labels().length === 0 && !draft()) {
        <div class="empty" data-testid="labels-empty">
          <p class="empty__head"><dart-glyph name="label" /> No labels yet.</p>
          <p class="empty__body">
            Create one to route work between stages — for example <span class="mono">TO_DEV_BE</span> to send a rejected review back to the backend dev.
          </p>
          <div class="empty__actions">
            <button type="button" class="btn btn--primary" data-testid="label-create-first" (click)="startNew()">
              <dart-glyph name="add-stage" /> Create your first label
            </button>
            <span class="empty__starters">
              Or start from an example:
              @for (s of starterNames; track s) {
                <button type="button" class="starter" [attr.data-testid]="'label-starter-' + s" (click)="startFromStarter(s)">{{ s }}</button>
              }
            </span>
          </div>
        </div>
      }

      @for (l of labels(); track l.name) {
        <div class="lrow" [attr.data-testid]="'label-row-' + l.name">
          <div class="lrow__main">
            <span class="lrow__name mono">{{ l.name }}</span>
            @if (l.routesTo) {
              <span class="lrow__route"><dart-glyph name="branch" /> routes to {{ l.routesTo }}@if (l.owner) { <span class="lrow__owner"> ({{ l.owner }})</span> }</span>
            } @else {
              <span class="lrow__noroute">no route (a flag, not a router)</span>
            }
          </div>
          <p class="lrow__settable">
            <dart-glyph name="agent" /> Who can set this:
            @if (isAnyone(l)) {
              <span class="agentchip">anyone (*)</span>
            } @else {
              @for (a of l.settableBy; track a) { <span class="agentchip">{{ a }}</span> }
            }
          </p>
          @if (l.meaning) { <p class="lrow__meaning">{{ l.meaning }}</p> }
          <div class="lrow__foot">
            <button type="button" class="btn btn--ghost btn--sm" [attr.data-testid]="'label-edit-' + l.name" (click)="startEdit(l)"><dart-glyph name="edit" /> edit</button>
            <button type="button" class="btn btn--ghost btn--sm lrow__del" [attr.data-testid]="'label-delete-' + l.name" (click)="askDelete(l.name)"><dart-glyph name="trash" /> delete</button>
          </div>
          @if (deleting() === l.name) {
            <div class="confirm" role="group" [attr.aria-label]="'Delete ' + l.name">
              <p class="confirm__body"><dart-glyph name="warning" /> Delete {{ l.name }}? Rules and tickets that reference it keep the raw name but it stops routing.</p>
              <div class="confirm__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-testid="label-delete-cancel" (click)="cancelDelete()">Cancel</button>
                <button type="button" class="btn btn--danger btn--sm" [attr.data-testid]="'label-delete-confirm-' + l.name" [disabled]="saving()" (click)="confirmDelete(l.name)"><dart-glyph name="trash" /> Delete label</button>
              </div>
            </div>
          }
        </div>
      }

      @if (draft(); as d) {
        <form class="leditor" data-testid="label-editor" (submit)="$event.preventDefault(); emitSave()">
          <p class="leditor__title">{{ d.originalName ? 'Edit label' : 'New label' }}</p>

          <label class="leditor__field">
            <span>Name <span aria-hidden="true">*</span></span>
            <input class="mono" data-testid="label-name" aria-required="true" [value]="d.name" (input)="setName($any($event.target).value)" />
            <span class="leditor__count">{{ d.name.trim().length }} / {{ nameMax }}</span>
            <span class="leditor__hint">Use UPPER_SNAKE — it's a machine routing key, shown on tickets.</span>
          </label>

          <div class="leditor__field" role="radiogroup" aria-label="Who can set this label">
            <span>Who can set this <span aria-hidden="true">*</span></span>
            <div class="modeseg">
              <button type="button" class="seg" role="radio" [attr.aria-checked]="d.settableMode === 'specific'" [class.seg--active]="d.settableMode === 'specific'" data-testid="settable-mode-specific" (click)="setMode('specific')">Specific agents</button>
              <button type="button" class="seg" role="radio" [attr.aria-checked]="d.settableMode === 'anyone'" [class.seg--active]="d.settableMode === 'anyone'" data-testid="settable-mode-anyone" (click)="setMode('anyone')">Anyone (*)</button>
            </div>
            @if (d.settableMode === 'specific') {
              <div class="chips">
                @for (o of owners(); track o) {
                  <label class="agentpick">
                    <input type="checkbox" [attr.data-testid]="'settable-chip-' + o" [checked]="d.settableAgents.includes(o)" (change)="toggleAgent(o)" />
                    <span>{{ o }}</span>
                  </label>
                }
              </div>
            }
            <span class="leditor__hint">Only these agents may set this label — the engine refuses anyone else.</span>
          </div>

          <label class="leditor__field">
            <span>Routes to</span>
            <select data-testid="label-routes" [value]="d.routesTo" (change)="setRoutesTo($any($event.target).value)">
              <option value="">none (a flag, no routing)</option>
              @for (s of stages(); track s) { <option [value]="s" [selected]="s === d.routesTo">{{ s }}</option> }
            </select>
          </label>

          <label class="leditor__field">
            <span>Routed work owner</span>
            <select data-testid="label-owner" [value]="d.owner" (change)="setOwner($any($event.target).value)">
              <option value="">— (optional)</option>
              @for (o of owners(); track o) { <option [value]="o" [selected]="o === d.owner">{{ o }}</option> }
            </select>
          </label>

          <label class="leditor__field">
            <span>What it means</span>
            <input data-testid="label-meaning" placeholder="e.g. send back to the backend dev" [value]="d.meaning" (input)="setMeaning($any($event.target).value)" />
          </label>

          @if (draftError(); as e) {
            <p class="leditor__err" data-testid="label-draft-error" role="alert">{{ e }}</p>
          }

          <div class="leditor__actions">
            <button type="button" class="btn btn--ghost" data-testid="label-cancel" (click)="cancelEdit()">Cancel</button>
            <button type="submit" class="btn btn--primary" data-testid="label-save" [disabled]="!!draftError() || saving()">
              @if (saving()) { <dart-glyph name="spinner" /> } <dart-glyph name="save" /> Save label
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .labels { display: flex; flex-direction: column; gap: 0.5rem; }
    .labels__head { display: flex; align-items: center; gap: 0.5rem; }
    .labels__title { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; color: var(--kb-text); }
    .labels__count { font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .labels__head .btn { margin-left: auto; }
    .labels__lead { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .labels__scope { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .labels__scope dart-glyph { color: var(--kb-accent); flex: none; }
    .empty { display: flex; flex-direction: column; gap: 0.4rem; padding: var(--kb-space-3); background: var(--kb-surface-muted); border: 1px dashed var(--kb-border); border-radius: var(--kb-radius-md); }
    .empty__head { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-weight: 600; color: var(--kb-text); }
    .empty__body { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .empty__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .empty__starters { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .starter { padding: 0.15rem 0.5rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); background: var(--kb-accent-soft); border: 1px solid var(--kb-accent); border-radius: 999px; cursor: pointer; }
    .lrow { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .lrow__main { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .lrow__name { font-weight: 600; color: var(--kb-text); }
    .mono { font-family: var(--kb-font-mono, ui-monospace, monospace); }
    .lrow__route { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .lrow__owner { color: var(--kb-text-subtle); }
    .lrow__noroute { font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .lrow__settable { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .agentchip { display: inline-flex; padding: 0.05rem 0.4rem; background: var(--kb-accent-soft); color: var(--kb-accent); border-radius: 999px; }
    .lrow__meaning { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .lrow__foot { display: flex; gap: 0.3rem; }
    .lrow__del { color: var(--kb-danger); }
    .confirm { margin-top: 0.35rem; padding: var(--kb-space-2); background: color-mix(in srgb, var(--kb-warning) 10%, var(--kb-surface)); border: 1px solid var(--kb-warning); border-radius: var(--kb-radius-md); }
    .confirm__body { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text); }
    .confirm__body dart-glyph { color: var(--kb-warning); flex: none; }
    .confirm__actions { display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.5rem; }
    .leditor { display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .leditor__title { margin: 0; font-weight: 600; color: var(--kb-text); }
    .leditor__field { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .leditor__field > span:first-child { font-weight: 600; }
    .leditor__count { color: var(--kb-text-subtle); }
    .leditor__hint { color: var(--kb-text-subtle); }
    .leditor__err { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-danger); }
    .leditor input, .leditor select { padding: 0.2rem 0.35rem; font: inherit; font-size: var(--kb-text-sm); color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); }
    .modeseg { display: inline-flex; gap: 0.3rem; }
    .seg { padding: 0.2rem 0.6rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-text-muted); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm); cursor: pointer; }
    .seg--active { color: var(--kb-accent); border-color: var(--kb-accent); }
    .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
    .agentpick { display: inline-flex; align-items: center; gap: 0.2rem; font-size: var(--kb-text-xs); color: var(--kb-text); }
    .leditor__actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn--sm { padding: 0.15rem 0.4rem; font-size: var(--kb-text-xs); }
    .btn--ghost { background: transparent; }
    .btn--primary { background: var(--kb-accent-soft); color: var(--kb-accent); border-color: var(--kb-accent); }
    .btn--danger { background: color-mix(in srgb, var(--kb-danger) 14%, transparent); color: var(--kb-danger); border-color: var(--kb-danger); }
    .btn:disabled { opacity: 0.55; cursor: default; }
  `,
})
export class LabelsManagerComponent {
  readonly labels = input.required<readonly LabelDef[]>();
  /** The active track's stages, for the routes-to picker. */
  readonly stages = input.required<readonly string[]>();
  /** The owner allowlist, for the settable-by chips and the routed-work owner picker. */
  readonly owners = input.required<readonly string[]>();
  readonly saving = input(false);

  /** The COMPLETE new label map (engine name-keyed shape) to persist via the parent's guarded CAS. */
  readonly save = output<Record<string, LabelSpec>>();

  readonly nameMax = NAME_MAX;
  readonly starterNames = Object.keys(STARTERS);

  private readonly draftSig = signal<LabelDraft | null>(null);
  readonly draft = this.draftSig.asReadonly();

  /** The label currently confirming deletion, or null. */
  readonly deleting = signal<string | null>(null);

  isAnyone(l: LabelDef): boolean {
    return l.settableBy.includes('*');
  }

  startNew(): void {
    this.deleting.set(null);
    this.draftSig.set({ originalName: null, name: '', settableMode: 'specific', settableAgents: [], routesTo: '', owner: '', meaning: '' });
  }

  startFromStarter(name: string): void {
    const s = STARTERS[name];
    if (!s) return;
    this.deleting.set(null);
    this.draftSig.set({
      originalName: null,
      name,
      settableMode: 'specific',
      settableAgents: [...s.settableBy],
      routesTo: s.routesTo,
      owner: s.owner,
      meaning: s.meaning,
    });
  }

  startEdit(l: LabelDef): void {
    this.deleting.set(null);
    const anyone = this.isAnyone(l);
    this.draftSig.set({
      originalName: l.name,
      name: l.name,
      settableMode: anyone ? 'anyone' : 'specific',
      settableAgents: anyone ? [] : [...l.settableBy],
      routesTo: l.routesTo ?? '',
      owner: l.owner ?? '',
      meaning: l.meaning ?? '',
    });
  }

  cancelEdit(): void {
    this.draftSig.set(null);
  }

  setName(name: string): void {
    this.draftSig.update((d) => (d ? { ...d, name } : d));
  }

  setMode(mode: 'specific' | 'anyone'): void {
    this.draftSig.update((d) => (d ? { ...d, settableMode: mode } : d));
  }

  toggleAgent(agent: string): void {
    this.draftSig.update((d) => {
      if (!d) return d;
      const has = d.settableAgents.includes(agent);
      return { ...d, settableAgents: has ? d.settableAgents.filter((a) => a !== agent) : [...d.settableAgents, agent] };
    });
  }

  setRoutesTo(routesTo: string): void {
    this.draftSig.update((d) => (d ? { ...d, routesTo } : d));
  }

  setOwner(owner: string): void {
    this.draftSig.update((d) => (d ? { ...d, owner } : d));
  }

  setMeaning(meaning: string): void {
    this.draftSig.update((d) => (d ? { ...d, meaning } : d));
  }

  /**
   * The client-side reason a draft cannot be saved, or null when valid. Mirrors the server
   * (`validateLabels`: name bounded + present + unique; `settable_by` a non-empty list when specific)
   * for fast feedback — the server re-validates and stays the authority.
   */
  readonly draftError = computed<string | null>(() => {
    const d = this.draftSig();
    if (!d) return null;
    const name = d.name.trim();
    if (!name) return 'A name is required.';
    if (name.length > NAME_MAX) return 'That name is too long.';
    const lower = name.toLowerCase();
    const collides = this.labels().some((l) => l.name.toLowerCase() === lower && l.name !== d.originalName);
    if (collides) return `A label named ${name} already exists.`;
    if (d.settableMode === 'specific' && d.settableAgents.length === 0) {
      return 'Pick at least one agent, or choose anyone.';
    }
    return null;
  });

  emitSave(): void {
    const d = this.draftSig();
    if (!d || this.draftError()) return;
    const name = d.name.trim();
    const spec: LabelSpec = {
      settable_by: d.settableMode === 'anyone' ? ['*'] : [...d.settableAgents],
      ...(d.routesTo ? { routes_to: d.routesTo } : {}),
      ...(d.owner ? { owner: d.owner } : {}),
      ...(d.meaning.trim() ? { meaning: d.meaning.trim() } : {}),
    };
    const map: Record<string, LabelSpec> = {};
    for (const l of this.labels()) {
      if (l.name === d.originalName || l.name === name) continue;
      map[l.name] = this.toSpec(l);
    }
    map[name] = spec;
    this.draftSig.set(null);
    this.save.emit(map);
  }

  askDelete(name: string): void {
    this.draftSig.set(null);
    this.deleting.set(name);
  }

  cancelDelete(): void {
    this.deleting.set(null);
  }

  confirmDelete(name: string): void {
    const map: Record<string, LabelSpec> = {};
    for (const l of this.labels()) {
      if (l.name === name) continue;
      map[l.name] = this.toSpec(l);
    }
    this.deleting.set(null);
    this.save.emit(map);
  }

  /** Fold one normalised {@link LabelDef} back into the engine's snake_case spec for a full-map write. */
  private toSpec(l: LabelDef): LabelSpec {
    return {
      settable_by: [...l.settableBy],
      ...(l.routesTo ? { routes_to: l.routesTo } : {}),
      ...(l.owner ? { owner: l.owner } : {}),
      ...(l.meaning ? { meaning: l.meaning } : {}),
    };
  }
}
