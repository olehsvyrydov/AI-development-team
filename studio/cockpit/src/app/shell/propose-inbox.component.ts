import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { KnowledgeProposal, KnowledgeScope, ProjectState } from '../core/models';
import { GlyphComponent } from './glyph.component';

/** Human label for a scope, used in the Approve button's accessible name so over-share is visible. */
const SCOPE_LABEL: Readonly<Record<KnowledgeScope, string>> = {
  project: 'This project',
  common: 'Common',
};

/** The scope radios in segment order — the roving arrow keys walk this sequence within a card's group. */
const SCOPE_ORDER: readonly KnowledgeScope[] = ['project', 'common'];

/**
 * Clamp any scope value to a known enum at the component boundary. A proposal's `suggestedScope`
 * is UNTRUSTED — a corrupted/tampered on-disk record or a future server change could carry a value
 * outside the enum. Only an exact `common` (or its `global` alias) widens reach; everything else,
 * including `undefined`, falls back to the narrowest, safest `project`. This keeps the Approve label
 * a real scope (never "undefined") and keeps exactly one radio selected, tabbable, and aria-checked.
 */
function validScope(scope: unknown): KnowledgeScope {
  return scope === 'common' || scope === 'global' ? 'common' : 'project';
}

type Phase = 'idle' | 'busy' | 'error';

/**
 * The `/kai` propose inbox — pending, model-authored knowledge awaiting an explicit human approve.
 * It renders only when proposals exist (absent-not-zero) and never auto-applies anything: a proposal
 * becomes recallable knowledge only when the operator approves it into a chosen vault.
 *
 * Trust contract: proposal content, tags, source, and why are UNTRUSTED model output and reach the
 * DOM through interpolation only (escaped) — never `[innerHTML]`. The approve scope is a FIXED enum
 * (This project / Common) chosen via a radiogroup that defaults to `/kai`'s suggestion; it is never
 * derived from a free path. The Approve button's accessible name states the scope it applies so an
 * accidental click cannot silently widen reach.
 *
 * Each decision posts through the guarded control plane (`kb/approve { id, scope }` /
 * `kb/reject { id }`) and lifts the fresh server state to the panel via {@link applied}; the approved
 * item then appears in the Knowledge list at the chosen scope and the pending count decrements, all
 * from that single source of truth.
 */
@Component({
  selector: 'dart-propose-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    @if (proposals().length) {
      <section class="inbox" data-testid="propose-inbox" aria-labelledby="propose-inbox-heading">
        <header class="inbox__head">
          <dart-glyph name="propose" />
          <h3 class="inbox__title" id="propose-inbox-heading">Proposed knowledge</h3>
          <span class="inbox__src">from /kai</span>
          <span class="inbox__count" data-testid="propose-count">{{ proposals().length }} pending</span>
        </header>
        <p class="inbox__note">
          /kai surfaced these recurring notes for review. Nothing is saved until you approve — and you choose where it goes.
        </p>

        <ul class="cards" aria-label="Proposed knowledge from /kai">
          @for (p of proposals(); track p.id) {
            <li class="card" [attr.data-testid]="'proposal-' + p.id">
              @if (p.title) {
                <p class="card__title">{{ p.title }}</p>
              }
              <p class="card__body" [attr.data-testid]="'proposal-content-' + p.id">{{ p.content }}</p>

              <p class="card__meta">
                /kai suggests:
                <span class="card__chip"><dart-glyph name="scope-{{ suggestedScope(p) }}" [size]="12" /> {{ scopeLabel(p.suggestedScope) }}</span>
                @for (s of stackTags(p); track s) {
                  <span class="card__chip"><dart-glyph name="tag" [size]="12" /> {{ s }}</span>
                }
                @if (p.suggestedKind) {
                  <span class="card__chip">{{ p.suggestedKind }}</span>
                }
              </p>
              @if (p.source || p.why) {
                <p class="card__why">
                  @if (p.source) { <span>{{ p.source }}</span> }
                  @if (p.source && p.why) { <span aria-hidden="true"> · </span> }
                  @if (p.why) { <span>{{ p.why }}</span> }
                </p>
              }

              <div class="card__scope" role="radiogroup" [attr.data-testid]="'proposal-scope-' + p.id" [attr.aria-label]="'Approve scope for ' + (p.title || 'this proposal')">
                <span class="card__scopelbl">Approve as</span>
                <button
                  type="button"
                  class="seg__opt"
                  [attr.data-testid]="'proposal-scope-' + p.id + '-project'"
                  role="radio"
                  [attr.aria-checked]="chosen(p) === 'project'"
                  [attr.tabindex]="chosen(p) === 'project' ? 0 : -1"
                  [class.seg__opt--on]="chosen(p) === 'project'"
                  [disabled]="phaseFor(p.id) === 'busy'"
                  (click)="choose(p.id, 'project')"
                  (keydown)="onScopeKeydown($event, p.id, 'project')"
                >
                  <dart-glyph name="scope-project" [size]="12" /> This project
                </button>
                <button
                  type="button"
                  class="seg__opt"
                  [attr.data-testid]="'proposal-scope-' + p.id + '-common'"
                  role="radio"
                  [attr.aria-checked]="chosen(p) === 'common'"
                  [attr.tabindex]="chosen(p) === 'common' ? 0 : -1"
                  [class.seg__opt--on]="chosen(p) === 'common'"
                  [disabled]="phaseFor(p.id) === 'busy'"
                  (click)="choose(p.id, 'common')"
                  (keydown)="onScopeKeydown($event, p.id, 'common')"
                >
                  <dart-glyph name="scope-common" [size]="12" /> Common
                </button>
              </div>

              @if (phaseFor(p.id) === 'error') {
                <p class="card__err" role="alert" [attr.data-testid]="'proposal-error-' + p.id">
                  <dart-glyph name="cross" [size]="12" /> {{ errorFor(p.id) }}
                </p>
              }

              <div class="card__actions">
                <button
                  type="button"
                  class="btn"
                  [attr.data-testid]="'proposal-reject-' + p.id"
                  [attr.aria-label]="'Reject ' + (p.title || 'this proposal')"
                  [disabled]="phaseFor(p.id) === 'busy'"
                  (click)="reject(p.id)"
                >
                  <dart-glyph name="reject" [size]="12" /> Reject
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  [attr.data-testid]="'proposal-approve-' + p.id"
                  [attr.aria-label]="'Approve as ' + scopeLabel(chosen(p))"
                  [disabled]="phaseFor(p.id) === 'busy'"
                  (click)="approve(p)"
                >
                  @if (phaseFor(p.id) === 'busy') { <dart-glyph name="spinner" [size]="12" /> } @else { <dart-glyph name="approve" [size]="12" /> }
                  Approve as {{ scopeLabel(chosen(p)) }}
                </button>
              </div>
            </li>
          }
        </ul>

        <p class="inbox__live" data-testid="propose-live" role="status" aria-live="polite">{{ announcement() }}</p>
      </section>
    }
  `,
  styles: `
    .inbox { display: flex; flex-direction: column; gap: var(--kb-space-2); padding: var(--kb-space-2); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .inbox__head { display: flex; align-items: center; gap: 0.4rem; color: var(--kb-text); }
    .inbox__title { margin: 0; font-size: var(--kb-text-md, 0.95rem); font-weight: 600; }
    .inbox__src { font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .inbox__count { margin-left: auto; font-size: var(--kb-text-xs); font-weight: 700; color: var(--kb-text-subtle); }
    .inbox__note { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .card { display: flex; flex-direction: column; gap: 0.35rem; padding: var(--kb-space-2); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .card__title { margin: 0; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); overflow-wrap: anywhere; }
    .card__body { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
    .card__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .card__chip { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.05rem 0.35rem; font-size: var(--kb-text-xs); border-radius: 999px; border: 1px solid var(--kb-border); color: var(--kb-text-muted); }
    .card__why { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); overflow-wrap: anywhere; }
    .card__scope { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; }
    .card__scopelbl { font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-subtle); margin-right: 0.2rem; }
    .seg__opt { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.5rem; font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-subtle); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm, 0.3rem); cursor: pointer; }
    .seg__opt--on { color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); border-color: var(--kb-accent); }
    .seg__opt:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .seg__opt[disabled] { opacity: 0.55; cursor: default; }
    .card__err { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-danger); }
    .card__actions { display: flex; justify-content: flex-end; gap: var(--kb-space-2); }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn:hover { border-color: var(--kb-border-strong); }
    .btn:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .btn--primary { color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); border-color: var(--kb-accent); }
    .btn[disabled] { opacity: 0.55; cursor: default; }
    .inbox__live { margin: 0; min-height: 1rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
  `,
})
export class ProposeInboxComponent {
  private readonly cp = inject(ControlPlaneService);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The `/kai` pending inbox (pending-only from the server). The section is absent when empty. */
  readonly proposals = input.required<readonly KnowledgeProposal[]>();
  /** Fresh project state from an approve/reject, lifted for the panel/shell to adopt as truth. */
  readonly applied = output<ProjectState>();

  /** Per-proposal chosen scope override; absent means "use the proposal's suggested scope". */
  private readonly choiceById = signal<Readonly<Record<string, KnowledgeScope>>>({});
  /** Per-proposal in-flight phase. */
  private readonly phaseById = signal<Readonly<Record<string, Phase>>>({});
  /** Per-proposal terse error text for a failed decision. */
  private readonly errorById = signal<Readonly<Record<string, string>>>({});
  private readonly announcement_ = signal('');
  readonly announcement = this.announcement_.asReadonly();

  scopeLabel(scope: KnowledgeScope | undefined): string {
    return SCOPE_LABEL[validScope(scope)];
  }

  /** The `/kai`-suggested scope clamped to a valid enum, so the chip glyph is always a known one. */
  suggestedScope(p: KnowledgeProposal): KnowledgeScope {
    return validScope(p.suggestedScope);
  }

  /** Stack tags for display, dropping empty entries; the noise-only `any` is kept (it is the hint). */
  stackTags(p: KnowledgeProposal): readonly string[] {
    return (p.suggestedStack ?? []).filter((s) => !!s);
  }

  /** The scope that will be sent on approve: the operator's choice, else the suggested scope clamped to a valid enum. */
  chosen(p: KnowledgeProposal): KnowledgeScope {
    return this.choiceById()[p.id] ?? validScope(p.suggestedScope);
  }

  phaseFor(id: string): Phase {
    return this.phaseById()[id] ?? 'idle';
  }

  errorFor(id: string): string {
    return this.errorById()[id] ?? '';
  }

  choose(id: string, scope: KnowledgeScope): void {
    this.choiceById.update((m) => ({ ...m, [id]: scope }));
  }

  /**
   * Roving radiogroup nav within a single proposal's scope group: Left/Up select the previous scope,
   * Right/Down the next (wrapping), then focus the moved-to radio in that same card's group.
   */
  onScopeKeydown(event: KeyboardEvent, id: string, scope: KnowledgeScope): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const idx = SCOPE_ORDER.indexOf(scope);
    const next = SCOPE_ORDER[(idx + delta + SCOPE_ORDER.length) % SCOPE_ORDER.length];
    this.choose(id, next);
    this.hostEl.nativeElement
      .querySelector<HTMLElement>(`[data-testid="proposal-scope-${id}-${next}"]`)
      ?.focus();
  }

  async approve(p: KnowledgeProposal): Promise<void> {
    if (this.phaseFor(p.id) === 'busy') return;
    const scope = this.chosen(p);
    this.setPhase(p.id, 'busy');
    const res = await this.cp.approveProposal(p.id, scope);
    if (res.ok === true) {
      this.setPhase(p.id, 'idle');
      this.announce(`Proposal approved as ${this.scopeLabel(scope)}.`);
      if (res.state) this.applied.emit(res.state);
    } else if (res.ok === 'conflict') {
      this.setPhase(p.id, 'idle');
      if (res.state) this.applied.emit(res.state);
    } else {
      this.fail(p.id, res.error);
    }
  }

  async reject(id: string): Promise<void> {
    if (this.phaseFor(id) === 'busy') return;
    this.setPhase(id, 'busy');
    const res = await this.cp.rejectProposal(id);
    if (res.ok === true) {
      this.setPhase(id, 'idle');
      this.announce('Proposal rejected.');
      if (res.state) this.applied.emit(res.state);
    } else if (res.ok === 'conflict') {
      this.setPhase(id, 'idle');
      if (res.state) this.applied.emit(res.state);
    } else {
      this.fail(id, res.error);
    }
  }

  private setPhase(id: string, phase: Phase): void {
    this.phaseById.update((m) => ({ ...m, [id]: phase }));
  }

  private fail(id: string, error: string): void {
    this.errorById.update((m) => ({ ...m, [id]: this.friendlyError(error) }));
    this.setPhase(id, 'error');
  }

  private announce(text: string): void {
    this.announcement_.set(text);
  }

  /** Map a terse hub reason to an honest, actionable message for the card. */
  private friendlyError(reason: string): string {
    const lower = reason.toLowerCase();
    if (lower.includes('refus') || lower.includes('guard') || lower.includes('forbidden')) {
      return 'Couldn’t save — the write was refused by the local guard.';
    }
    if (lower.includes('unknown') || lower.includes('stale') || lower.includes('not found')) {
      return 'That proposal is no longer available — refresh the inbox.';
    }
    return `Couldn’t apply the decision. ${reason}`;
  }
}
