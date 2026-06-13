import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { TicketView } from '../core/models';
import {
  needsYouReason,
  RECENTLY_DONE_CAP,
  type NeedsYouReason,
  type WorklistBand,
  type WorklistProgress,
} from './board';
import { GlyphComponent } from './glyph.component';

/**
 * The Worklist centre — the default Tasks rendering. The actual tickets shown as real cards, grouped
 * by lifecycle BAND in fixed reading order (Needs-you → In-flight → Backlog → Recently-done →
 * Off-track), each band a responsive auto-fill grid that REFLOWS to fill the board's own width so a
 * sparse pipeline never reads as an empty void. A band whose set is empty is OMITTED (absent-not-zero
 * — no `(0)` header). The Needs-you band is first and visually primary (warning accent); each of its
 * cards carries the plain-words reason it needs a person.
 *
 * The card itself is the parent board's `#cardTpl`, projected verbatim through `cardTemplate`, so the
 * single card design — and all its guarded advance / menu / conflict / open machinery — is reused
 * unchanged across every band. This component owns only the band scaffolding and the within-band
 * roving keyboard; it introduces no write path. Untrusted text (stage, owner, title, reasons derived
 * from them) reaches the DOM through interpolation only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-tasks-worklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent, NgTemplateOutlet],
  template: `
    <div class="worklist" data-testid="worklist-root" (keydown)="onCardKeydown($event)">
      @if (progress(); as p) {
        <div
          class="progress"
          data-testid="worklist-progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="p.percentDone"
          [attr.aria-label]="progressLabel(p)"
        >
          <p class="progress__label">Feature progress</p>
          <div class="progress__row">
            <div class="progress__track" data-testid="worklist-progress-bar" aria-hidden="true">
              @if (p.done > 0) {
                <span class="progress__seg progress__seg--done" data-seg="done" [style.flexGrow]="p.done"></span>
              }
              @if (p.inProgress > 0) {
                <span class="progress__seg progress__seg--in-progress" data-seg="in-progress" [style.flexGrow]="p.inProgress"></span>
              }
              @if (p.backlog > 0) {
                <span class="progress__seg progress__seg--backlog" data-seg="backlog" [style.flexGrow]="p.backlog"></span>
              }
            </div>
            <span class="progress__pct">{{ p.percentDone }}% done</span>
          </div>
          <p class="progress__counts" data-testid="worklist-progress-counts">
            @if (p.done > 0) { <span>{{ p.done }} done</span> }
            @if (p.inProgress > 0) { <span>{{ p.inProgress }} in progress</span> }
            @if (p.backlog > 0) { <span>{{ p.backlog }} backlog</span> }
            @if (p.needsYou > 0) { <span class="progress__need"><dart-glyph name="need" /> {{ p.needsYou }} need you</span> }
            <span>{{ p.total }} total</span>
          </p>
        </div>
      }

      @for (band of bands(); track band.kind) {
        <section
          class="band"
          [class.band--needs-you]="band.kind === 'needs-you'"
          [class.band--in-flight]="band.kind === 'in-flight'"
          [class.band--backlog]="band.kind === 'backlog'"
          [class.band--recently-done]="band.kind === 'recently-done'"
          [class.band--off-track]="band.kind === 'off-track'"
          [attr.data-testid]="'worklist-band-' + band.kind"
          [attr.aria-label]="band.heading"
        >
          <header class="band__head">
            @if (band.kind === 'backlog') {
              <button
                type="button"
                class="band__disclosure"
                data-testid="backlog-expand"
                [attr.aria-expanded]="backlogExpanded()"
                (click)="toggleBacklog()"
              >
                <dart-glyph [name]="band.glyph" />
                <span class="band__title">{{ band.heading }}</span>
                <span class="band__planned">{{ band.tickets.length }} planned</span>
                <dart-glyph name="caret" />
              </button>
            } @else {
              <h3 class="band__title"><dart-glyph [name]="band.glyph" /> {{ band.heading }}</h3>
              <span class="band__count" data-testid="worklist-band-count">{{ band.tickets.length }}</span>
            }
            @if (band.kind === 'recently-done' && band.tickets.length > cap) {
              <button
                type="button"
                class="band__expand"
                data-testid="recently-done-expand"
                [attr.aria-expanded]="doneExpanded()"
                (click)="toggleDone()"
              >
                @if (doneExpanded()) {
                  see fewer
                } @else {
                  see all in Done →
                }
              </button>
            }
          </header>

          @if (band.kind === 'off-track') {
            <p class="band__why">These tasks are in a stage that's no longer in the pipeline.</p>
            <p class="band__reassure">Nothing's lost. Open a task and advance it to put it back on the pipeline.</p>
          }

          @if (band.kind !== 'backlog' || backlogExpanded()) {
            <ul class="band__cards" role="list">
              @for (t of visibleTickets(band); track t.id) {
                @if (band.kind === 'needs-you' && reasonFor(t); as reason) {
                  <ng-container
                    [ngTemplateOutlet]="cardTemplate()"
                    [ngTemplateOutletContext]="{ $implicit: t, reason: reason }"
                  />
                } @else {
                  <ng-container [ngTemplateOutlet]="cardTemplate()" [ngTemplateOutletContext]="{ $implicit: t }" />
                }
              }
            </ul>
          }
        </section>
      }
    </div>
  `,
  styles: `
    /* The worklist IS the centre — full width, a vertical stack of bands. Its width drives the card
       grid (container query, not viewport) so the layout reflows to the board, never the screen. */
    .worklist { display: flex; flex-direction: column; gap: var(--kb-space-4, 1.5rem); width: 100%; container-type: inline-size; container-name: board; }
    .band { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .band__head { display: flex; align-items: center; gap: 0.5rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--kb-border); }
    .band__title { display: inline-flex; align-items: center; gap: 0.35rem; margin: 0; font-size: var(--kb-text-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .band__count { font-size: var(--kb-text-sm); color: var(--kb-text-muted); font-weight: 600; }
    .band__expand { margin-left: auto; min-height: 24px; padding: 0.1rem 0.4rem; font: inherit; font-size: var(--kb-text-xs); color: var(--kb-accent); background: transparent; border: none; cursor: pointer; text-decoration: underline; }
    .band__expand:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    /* The Needs-you band leads the read: warning-accent heading. The per-card colour (edge/fill/pill)
       now comes from the global data-status rules, not a band-scoped card override — so colour can
       never drift from the card's real status. The other bands' header colours are global too. */
    .band--needs-you .band__title { color: var(--kb-warning); }
    .band--needs-you .band__head { border-bottom-color: var(--kb-warning); }
    /* Off-track is the only-when-present red shelf: a red-edged container (self-explaining) at the
       bottom; its cards read red via the band-scoped global rule. */
    .band--off-track { padding: var(--kb-space-2); border: 1px solid var(--kb-danger); border-radius: var(--kb-radius-md); }
    .band--off-track .band__head { border-bottom-color: var(--kb-danger); }
    .band__why { margin: 0; color: var(--kb-text-muted); font-size: var(--kb-text-xs); }
    .band__reassure { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
    /* THE dead-void killer: cards pack to fill any board width, reflowing 5→4→3→2→1 with no
       breakpoint cliffs and no horizontal scroll — below ~16rem container the single column wins. */
    .band__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--kb-space-3); list-style: none; margin: 0; padding: 0; }

    /* Backlog is the quiet shelf: collapsed by default to a muted one-line disclosure. */
    .band__disclosure { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 24px; padding: 0.1rem 0; font: inherit; color: var(--kb-text-muted); background: transparent; border: none; cursor: pointer; }
    .band__disclosure:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .band__disclosure .band__title { color: var(--kb-text-muted); }
    .band__planned { font-size: var(--kb-text-sm); color: var(--kb-text-subtle); }
    .band__disclosure[aria-expanded='true'] dart-glyph:last-child { rotate: 90deg; }
    @media (prefers-reduced-motion: no-preference) { .band__disclosure dart-glyph:last-child { transition: rotate var(--kb-dur-fast, 120ms) ease; } }
    @media (pointer: coarse) { .band__disclosure { min-height: 44px; } }

    /* Feature-progress block — a segmented bar reading off the existing counts (no new data). The bar
       is decorative (aria-hidden); the role=progressbar + aria-label + the real counts row carry the
       meaning without colour, so a colour-blind or screen-reader user gets the same proportion. */
    .progress { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: var(--kb-space-4, 1.5rem); }
    .progress__label { margin: 0; font-size: var(--kb-text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--kb-text-muted); }
    .progress__row { display: flex; align-items: center; gap: var(--kb-space-3); }
    .progress__track { display: flex; flex: 1 1 auto; gap: 1px; height: 8px; border-radius: 999px; overflow: hidden; background: var(--kb-surface-muted); }
    .progress__seg { min-width: 3px; height: 100%; }
    .progress__seg--done { background: var(--kb-success); }
    .progress__seg--in-progress { background: var(--kb-accent); }
    .progress__seg--backlog { background: var(--kb-neutral-soft, var(--kb-border)); }
    .progress__pct { flex: 0 0 auto; font-size: var(--kb-text-sm); font-weight: 700; color: var(--kb-text); }
    .progress__counts { display: flex; flex-wrap: wrap; gap: 0.1rem 0.5rem; margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .progress__counts > span + span::before { content: '· '; color: var(--kb-text-subtle); }
    .progress__need { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--kb-warning); font-weight: 600; }
  `,
})
export class TasksWorklistComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The bands to render, already partitioned + ordered + absent-not-zero filtered by the parent. */
  readonly bands = input.required<readonly WorklistBand[]>();

  /** The feature-progress picture for the top bar, or null on an empty board (then suppressed). */
  readonly progress = input<WorklistProgress | null>(null);

  /**
   * The parent board's card template, projected verbatim into every band so the one card design and
   * all its guarded actions are reused unchanged. The Needs-you band passes an extra `reason` context.
   */
  readonly cardTemplate = input.required<TemplateRef<unknown>>();

  /** The recently-done teaser cap — only this many cards show until the operator expands. */
  readonly cap = RECENTLY_DONE_CAP;

  /** Whether the recently-done band is expanded past its teaser cap (operator-held disclosure). */
  readonly doneExpanded = signal(false);

  /** Whether the quiet Backlog band is expanded from its collapsed "N planned ▸" disclosure. */
  readonly backlogExpanded = signal(false);

  toggleBacklog(): void {
    this.backlogExpanded.update((open) => !open);
  }

  /**
   * The spoken progress label — the same proportion the sighted glance reads, in words, so a
   * screen-reader user gets the picture without colour. Names only the non-zero buckets it surfaces.
   */
  progressLabel(p: WorklistProgress): string {
    const parts = [`Feature progress: ${p.done} of ${p.total} tasks done, ${p.percentDone} percent`];
    if (p.inProgress > 0) parts.push(`${p.inProgress} in progress`);
    if (p.backlog > 0) parts.push(`${p.backlog} in backlog`);
    if (p.needsYou > 0) parts.push(`${p.needsYou} need you`);
    return parts.join('; ') + '.';
  }

  private readonly reasonCache = computed(() => new WeakMap<TicketView, NeedsYouReason | null>());

  /** The plain-words reason a needs-you card is waiting on a person, or null when it does not apply. */
  reasonFor(ticket: TicketView): NeedsYouReason | null {
    const cache = this.reasonCache();
    if (cache.has(ticket)) return cache.get(ticket) ?? null;
    const reason = needsYouReason(ticket);
    cache.set(ticket, reason);
    return reason;
  }

  /** The tickets actually rendered for a band — recently-done is capped to its teaser until expanded. */
  visibleTickets(band: WorklistBand): readonly TicketView[] {
    if (band.kind === 'recently-done' && !this.doneExpanded()) return band.tickets.slice(0, this.cap);
    return band.tickets;
  }

  toggleDone(): void {
    this.doneExpanded.update((open) => !open);
  }

  /**
   * Roving focus across the cards of a band: ←/→ (and ↑/↓) move between the band's own cards so no
   * interaction is mouse-only. Movement is scoped to the band the focused card sits in; Tab still
   * crosses to the next band's first card. Mirrors the pipeline rail's roving contract for parity.
   */
  onCardKeydown(event: KeyboardEvent): void {
    const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
    const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    if (!horizontal && !vertical) return;
    const active = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.band') : null;
    if (!active) return;
    const cards = [...active.querySelectorAll<HTMLElement>('[data-testid="card-open"]')];
    const current = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-testid="card-open"]') : null;
    const idx = current ? cards.indexOf(current) : -1;
    if (idx < 0) return;
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const next = forward ? idx + 1 : idx - 1;
    if (next < 0 || next >= cards.length) return;
    event.preventDefault();
    cards[next].focus();
  }
}
