import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ProjectsStore } from '../core/projects.store';
import { RollupStore, type WaitingRollup } from '../core/rollup.store';
import { deriveFreshness, formatRelativeMs, type ProjectView } from '../core/models';
import { GlyphComponent } from '../shell/glyph.component';
import { prefersMotion } from '../shell/motion';
import { ProjectCardComponent, type FreshnessFooter } from './project-card.component';
import { ConnectPanelComponent } from './connect-panel.component';
import { ANCHOR_LINE, CTA_HELPER, HOME_SUBHEAD, HOME_TITLE, HOW_STEPS, TRUST_CHIPS, WHAT_IT_IS } from './copy';

/** How often the shared freshness ticker re-derives relative ages without a push (one timer). */
const FRESHNESS_TICK_MS = 30_000;

const DOCS_URL = 'https://github.com/svyrydov/ai-dev-team#readme';

/**
 * Projects Home — the launcher. A first-run pitch when no project is connected, otherwise a
 * responsive grid of project cards above an "Add a project" cell, with a thin global strip that
 * surfaces cross-project momentum (how many tasks need you). The list endpoint returns records
 * with a compact `{ open, needsYou }` roll-up; each card's profile/state is hydrated lazily here
 * so the governance badge and full title/description appear without an N+1 on first paint.
 *
 * Every at-a-glance signal is absent-not-zero: the needs-you strip omits the "need you" figure
 * when the cross-project sum is 0, and a project with no roll-up contributes nothing.
 */
@Component({
  selector: 'dart-projects-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GlyphComponent, ProjectCardComponent, ConnectPanelComponent],
  template: `
    <header class="topbar">
      <div class="brand">
        <span class="brand__dot" aria-hidden="true"></span>
        <span class="brand__name">DART · Studio</span>
      </div>
    </header>

    <main id="main" class="page">
      @if (store.loadError(); as err) {
        <p class="banner banner--error" role="alert" data-testid="load-error">Couldn't load projects: {{ err }}</p>
      }

      @if (store.isEmpty() && store.connectStatus() === 'idle') {
        <section class="empty" data-testid="empty-state" aria-labelledby="empty-h">
          <span class="empty__tile" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40">
              <rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
              <line x1="10" y1="4.5" x2="10" y2="19.5" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </span>
          <h1 id="empty-h" class="empty__name">DART</h1>
          <p class="empty__anchor">{{ anchor }}</p>
          <p class="empty__lead">{{ whatItIs }}</p>

          <ol class="steps" aria-label="How it works">
            @for (step of steps; track step.label; let i = $index) {
              <li class="step" data-testid="empty-step">
                <span class="step__icon" aria-hidden="true">
                  @switch (i) {
                    @case (0) {
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M3 7 h5 l2 2 h11 v9 a1 1 0 0 1 -1 1 H4 a1 1 0 0 1 -1 -1 z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                      </svg>
                    }
                    @case (1) {
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.6" />
                        <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                      </svg>
                    }
                    @default {
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <circle cx="5" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
                        <circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
                        <circle cx="19" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
                        <line x1="7" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.6" />
                        <line x1="14" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="1.6" />
                      </svg>
                    }
                  }
                </span>
                <span class="step__body">
                  <span class="step__label">{{ step.label }}</span>
                  <span class="step__line">{{ step.line }}</span>
                </span>
              </li>
            }
          </ol>

          <dart-connect-panel
            [status]="store.connectStatus()"
            [error]="store.connectError()"
            [outcome]="store.connectOutcome()"
            (connect)="onConnect($event)"
            (reset)="store.resetConnect()"
          />
          <p class="empty__helper">{{ ctaHelper }}</p>

          <ul class="trust" aria-label="What you can rely on">
            @for (chip of trustChips; track chip) {
              <li class="trust__chip" data-testid="trust-chip">
                <span class="trust__dot" aria-hidden="true"></span>{{ chip }}
              </li>
            }
          </ul>

          <a class="docs" data-testid="read-docs" [href]="docsUrl" target="_blank" rel="noopener noreferrer">
            Read the docs
            <svg class="docs__arrow" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
              <line x1="4" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <polyline points="13,6 19,12 13,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
        </section>
      } @else {
        <header class="head">
          <div class="head__titles">
            <h1 class="page__title">{{ homeTitle }}</h1>
            <p class="head__sub" data-testid="home-subhead">{{ homeSubhead }}</p>
          </div>
          <div class="signals" data-testid="needs-you-strip">
            @if (displayCount() > 0) {
              <span class="signals__count">{{ displayCount() }} {{ projectNoun() }}</span>
            }
            @if (displayNeedsYou() > 0) {
              <span class="signals__need" data-testid="global-needs-you">
                <dart-glyph name="need" [size]="13" />
                {{ displayNeedsYou() }} need you
              </span>
            }
          </div>
        </header>

        <p class="sr-rollup" data-testid="rollup-announcer" aria-live="polite" aria-atomic="true">{{ rollup.announcement() }}</p>

        @if (displayNeedsYou() > 0) {
          <aside class="cockpit" data-testid="cockpit-strip" aria-labelledby="needs-you-eyebrow">
            <span class="cockpit__eyebrow" id="needs-you-eyebrow">NEEDS YOU</span>
            <span class="cockpit__lead">
              <dart-glyph name="need" [size]="15" />
              <span>{{ displayNeedsYou() }} {{ taskNoun() }} across {{ waitingNoun() }} waiting on you</span>
              <span class="cockpit__health" [attr.data-open]="rollup.channelOpen()">
                @if (rollup.channelOpen()) {
                  · live
                } @else {
                  · reconnecting…
                }
              </span>
            </span>
            <span class="cockpit__chips">
              @for (w of displayWaiting(); track w.id) {
                <a
                  class="cockpit__chip"
                  data-testid="cockpit-chip"
                  [routerLink]="['/projects', w.id]"
                  [attr.aria-label]="'Open ' + w.name + ', ' + w.needsYou + ' tasks need you'"
                >{{ w.name }} ({{ w.needsYou }})</a>
              }
            </span>
          </aside>
        }

        <section class="grid" data-testid="home-grid" [attr.data-motion]="motionOk() ? 'on' : 'off'" aria-label="Connected projects">
          @for (view of hydrated(); track view.record.id) {
            <dart-project-card
              [view]="view"
              [freshness]="freshnessFor(view.record.id)"
              [pulseKey]="pulseKeyFor(view.record.id)"
            />
          }
          <dart-connect-panel
            [status]="store.connectStatus()"
            [error]="store.connectError()"
            [outcome]="store.connectOutcome()"
            (connect)="onConnect($event)"
            (reset)="store.resetConnect()"
          />
        </section>
      }
    </main>
  `,
  styles: `
    .topbar {
      display: flex;
      align-items: center;
      padding: var(--kb-space-3) var(--kb-space-4);
      background: linear-gradient(120deg, var(--kb-header-from), var(--kb-header-to));
      border-bottom: 1px solid var(--kb-border);
    }
    .brand { display: inline-flex; align-items: center; gap: 0.6rem; font-weight: 600; }
    .brand__dot {
      width: 0.7rem; height: 0.7rem; border-radius: 999px;
      background: var(--kb-accent);
      box-shadow: 0 0 0.6rem var(--kb-accent);
    }
    /* Motion tokens — one place reduced-motion zeroes them; the grid stagger reads these. */
    :host { --kb-dur-base: 200ms; --kb-ease-out: cubic-bezier(0.16, 1, 0.3, 1); }
    @media (prefers-reduced-motion: reduce) { :host { --kb-dur-base: 0ms; } }
    .page { max-width: 76rem; margin: 0 auto; padding: var(--kb-space-5) var(--kb-space-4); }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--kb-space-3); margin-bottom: var(--kb-space-3); }
    .head__titles { display: flex; flex-direction: column; gap: 0.15rem; }
    .page__title { margin: 0; font-size: var(--kb-text-2xl); font-weight: 700; }
    .head__sub { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .signals { display: inline-flex; align-items: center; gap: var(--kb-space-3); font-size: var(--kb-text-sm); }
    .signals__count { color: var(--kb-text-muted); }
    .signals__need { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; color: var(--kb-warning); }
    /* The needs-you cockpit strip: a calm, full-width banner that routes the human straight to the
       work waiting on them. Warning hue on the left edge, never alarming red fill. Absent at 0. */
    .cockpit {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kb-space-2) var(--kb-space-3);
      margin-bottom: var(--kb-space-4);
      padding: var(--kb-space-2) var(--kb-space-3);
      background: var(--kb-surface);
      border: 1px solid var(--kb-border);
      border-left: 3px solid var(--kb-warning);
      border-radius: var(--kb-radius-md);
    }
    /* Visually-hidden, dedicated, and the ONLY announcing live region: the debounced needs-you
       total. Per-card freshness and chip changes are visible-only and never announce. */
    .sr-rollup {
      position: absolute;
      width: 1px; height: 1px;
      margin: -1px; padding: 0; border: 0;
      overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%);
      white-space: nowrap;
    }
    /* The NEEDS YOU eyebrow makes the band read as THE triage surface, not an incidental banner. */
    .cockpit__eyebrow {
      flex-basis: 100%;
      font-size: var(--kb-text-xs);
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--kb-warning);
    }
    .cockpit__lead { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 600; color: var(--kb-warning); font-size: var(--kb-text-sm); }
    /* Channel health at the band level only (never per chip): honest "reconnecting…" when the
       stream drops so the developer knows the count may be frozen. */
    .cockpit__health { margin-left: auto; font-weight: 500; color: var(--kb-text-muted); }
    .cockpit__health[data-open='false'] { color: var(--kb-text-subtle); font-style: italic; }
    .cockpit__chips { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--kb-space-2); }
    .cockpit__chip {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem 0.55rem;
      font-size: var(--kb-text-xs);
      font-weight: 600;
      color: var(--kb-text);
      background: var(--kb-surface-muted);
      border: 1px solid var(--kb-border);
      border-radius: 999px;
      text-decoration: none;
    }
    .cockpit__chip:hover { border-color: var(--kb-border-strong); }
    .cockpit__chip:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .banner { padding: var(--kb-space-2) var(--kb-space-3); border-radius: var(--kb-radius-md); margin-bottom: var(--kb-space-3); }
    .banner--error { background: var(--kb-accent-soft); color: var(--kb-danger); border: 1px solid var(--kb-danger); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
      gap: var(--kb-space-3);
    }
    /* Cards fade + rise in a short stagger on load so the launcher reads as composed, not a
       wall snapping in. The per-card delay is capped so a large grid never cascades slowly; the
       reduced-motion-zeroed token collapses the whole effect to an instant appearance. */
    .grid[data-motion='on'] > * { animation: card-enter var(--kb-dur-base) var(--kb-ease-out) both; }
    .grid[data-motion='on'] > *:nth-child(1) { animation-delay: 0ms; }
    .grid[data-motion='on'] > *:nth-child(2) { animation-delay: 40ms; }
    .grid[data-motion='on'] > *:nth-child(3) { animation-delay: 80ms; }
    .grid[data-motion='on'] > *:nth-child(4) { animation-delay: 120ms; }
    .grid[data-motion='on'] > *:nth-child(n+5) { animation-delay: 160ms; }
    @keyframes card-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    /* Disable at the same specificity as the enabling rule (the [data-motion='on'] scope) so the
       override wins the cascade — a lower-specificity '.grid > *' would lose and motion would run. */
    @media (prefers-reduced-motion: reduce) {
      .grid[data-motion='on'] > * { animation: none; transition: none; transform: none; }
    }
    .empty {
      max-width: 40rem;
      margin: var(--kb-space-5) auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--kb-space-3);
    }
    .empty__tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: var(--kb-radius-lg);
      background: var(--kb-accent-soft);
      color: var(--kb-accent);
    }
    .empty__name { margin: 0; font-size: var(--kb-text-2xl); font-weight: 800; letter-spacing: 0.02em; }
    .empty__anchor { margin: 0; font-size: var(--kb-text-lg); font-weight: 600; }
    .empty__lead { margin: 0; max-width: 36rem; color: var(--kb-text-muted); font-size: var(--kb-text-sm); line-height: 1.5; }
    .empty__helper { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: var(--kb-space-3);
      width: 100%;
      margin: var(--kb-space-2) 0;
      padding: 0;
      list-style: none;
      text-align: left;
    }
    .step { display: flex; gap: var(--kb-space-2); }
    .step__icon {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: var(--kb-radius-md);
      background: var(--kb-surface-muted);
      color: var(--kb-accent);
    }
    .step__body { display: flex; flex-direction: column; gap: 0.15rem; }
    .step__label { font-weight: 600; font-size: var(--kb-text-sm); }
    .step__line { color: var(--kb-text-muted); font-size: var(--kb-text-xs); line-height: 1.45; }
    .trust { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--kb-space-2); margin: 0; padding: 0; list-style: none; }
    .trust__chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.2rem 0.6rem;
      font-size: var(--kb-text-xs);
      color: var(--kb-text-muted);
      background: var(--kb-surface);
      border: 1px solid var(--kb-border);
      border-radius: 999px;
    }
    .trust__dot { width: 0.45rem; height: 0.45rem; border-radius: 999px; background: var(--kb-accent); }
    .docs { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--kb-accent); font-size: var(--kb-text-sm); text-decoration: none; }
    .docs:hover { text-decoration: underline; }
    .docs__arrow { flex: none; }
  `,
})
export class ProjectsHomeComponent implements OnInit, OnDestroy {
  protected readonly store = inject(ProjectsStore);
  protected readonly rollup = inject(RollupStore);
  private readonly api = inject(ApiService);

  protected readonly anchor = ANCHOR_LINE;
  protected readonly whatItIs = WHAT_IT_IS;
  protected readonly steps = HOW_STEPS;
  protected readonly trustChips = TRUST_CHIPS;
  protected readonly ctaHelper = CTA_HELPER;
  protected readonly homeTitle = HOME_TITLE;
  protected readonly homeSubhead = HOME_SUBHEAD;
  protected readonly docsUrl = DOCS_URL;

  /** Whether the grid stagger-enter is allowed; zeroed under reduced motion. */
  protected readonly motionOk = signal(prefersMotion());

  /** The shared freshness ticker: one timer ages every card's relative time without a push. */
  private readonly now = signal(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * Cross-project "need you" total: the live rollup once a frame has arrived, otherwise the
   * first-paint list sum so the strip is correct before the stream's first snapshot.
   */
  protected readonly displayNeedsYou = computed(() =>
    this.rollup.hasFrame() ? this.rollup.totalNeedsYou() : this.store.totalNeedsYou(),
  );

  /** Connected-project count: live rollup once a frame exists, else the first-paint list length. */
  protected readonly displayCount = computed(() =>
    this.rollup.hasFrame() ? this.rollup.projects().length : this.store.projectCount(),
  );

  /** Band click-targets ordered by descending need: live rollup once a frame exists, else the list. */
  protected readonly displayWaiting = computed<readonly WaitingRollup[]>(() =>
    this.rollup.hasFrame() ? this.rollup.waiting() : this.store.waiting(),
  );

  protected projectNoun(): string {
    return this.displayCount() === 1 ? 'project' : 'projects';
  }

  protected taskNoun(): string {
    return this.displayNeedsYou() === 1 ? 'task' : 'tasks';
  }

  protected waitingNoun(): string {
    const n = this.displayWaiting().length;
    return n === 1 ? '1 project' : `${n} projects`;
  }

  /** Profiles fetched per project id, merged over the store's record-only views for display. */
  private readonly profiles = signal<ReadonlyMap<string, ProjectView>>(new Map());

  readonly hydrated = computed<readonly ProjectView[]>(() => {
    const byId = this.profiles();
    return this.store.projects().map((view) => byId.get(view.record.id) ?? view);
  });

  /**
   * The freshness footer for a card, derived from its live rollup entry as of the shared ticker.
   * Returns `null` when no live entry exists (the card then degrades to its registry last-seen).
   */
  protected freshnessFor(id: string): FreshnessFooter | null {
    const entry = this.rollup.byId().get(id);
    if (!entry) return null;
    const now = this.now();
    const state = deriveFreshness(entry, now, this.rollup.channelOpen());
    return { state, ageLabel: formatRelativeMs(entry.stateChangedAt, now) };
  }

  /** The per-card single-pulse key (the entry's last state-change instant), or null when absent. */
  protected pulseKeyFor(id: string): number | null {
    return this.rollup.byId().get(id)?.stateChangedAt ?? null;
  }

  async ngOnInit(): Promise<void> {
    this.rollup.start();
    this.ticker = setInterval(() => this.now.set(Date.now()), FRESHNESS_TICK_MS);
    await this.store.load();
    void this.hydrateProfiles();
  }

  ngOnDestroy(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.rollup.stop();
  }

  async onConnect(path: string): Promise<void> {
    await this.store.connect(path);
    void this.hydrateProfiles();
  }

  /** Fetch each project's full view (profile + state) so cards show title/description. */
  private async hydrateProfiles(): Promise<void> {
    const views = this.store.projects();
    const results = await Promise.all(
      views.map(async (view) => {
        try {
          return (await this.api.getProject(view.record.id)) ?? view;
        } catch {
          return view;
        }
      }),
    );
    const next = new Map<string, ProjectView>();
    for (const view of results) {
      if (view?.record?.id) next.set(view.record.id, view);
    }
    this.profiles.set(next);
  }
}
