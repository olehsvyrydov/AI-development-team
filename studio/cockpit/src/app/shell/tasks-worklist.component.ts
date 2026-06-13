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
import { needsYouReason, RECENTLY_DONE_CAP, type NeedsYouReason, type WorklistBand } from './board';
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
      @for (band of bands(); track band.kind) {
        <section
          class="band"
          [class.band--needs-you]="band.kind === 'needs-you'"
          [class.band--off-track]="band.kind === 'off-track'"
          [attr.data-testid]="'worklist-band-' + band.kind"
          [attr.aria-label]="band.heading"
        >
          <header class="band__head">
            <h3 class="band__title"><dart-glyph [name]="band.glyph" /> {{ band.heading }}</h3>
            <span class="band__count" data-testid="worklist-band-count">{{ band.tickets.length }}</span>
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
    /* The Needs-you band leads the read: warning-accent heading, and its cards are warning-edged. */
    .band--needs-you .band__title { color: var(--kb-warning); }
    .band--needs-you .band__head { border-bottom-color: var(--kb-warning); }
    .band--needs-you .band__cards :where(.card) { border-color: var(--kb-warning); }
    .band--off-track .band__title { color: var(--kb-warning); }
    .band__why { margin: 0; color: var(--kb-text-muted); font-size: var(--kb-text-xs); }
    .band__reassure { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-xs); }
    /* THE dead-void killer: cards pack to fill any board width, reflowing 5→4→3→2→1 with no
       breakpoint cliffs and no horizontal scroll — below ~16rem container the single column wins. */
    .band__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--kb-space-3); list-style: none; margin: 0; padding: 0; }
  `,
})
export class TasksWorklistComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The bands to render, already partitioned + ordered + absent-not-zero filtered by the parent. */
  readonly bands = input.required<readonly WorklistBand[]>();

  /**
   * The parent board's card template, projected verbatim into every band so the one card design and
   * all its guarded actions are reused unchanged. The Needs-you band passes an extra `reason` context.
   */
  readonly cardTemplate = input.required<TemplateRef<unknown>>();

  /** The recently-done teaser cap — only this many cards show until the operator expands. */
  readonly cap = RECENTLY_DONE_CAP;

  /** Whether the recently-done band is expanded past its teaser cap (operator-held disclosure). */
  readonly doneExpanded = signal(false);

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
