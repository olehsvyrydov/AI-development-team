import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { displayDescription, displayTitle, governanceSignal, type ProjectView } from '../core/models';
import { GlyphComponent } from '../shell/glyph.component';
import { prefersMotion } from '../shell/motion';
import { SECURITY_REVIEWED_TOOLTIP } from './copy';

/**
 * One project tile in the launcher grid: a header row carrying the glyph tile and an optional
 * governance badge, the title on its own full-width line below them, the auto-collected
 * description, detected stack chips, an at-a-glance pulse (open tasks + a "needs you" chip), and a
 * demoted status / last-seen line. The whole card is a router link.
 *
 * The title sits on its own line — never sharing a flex row with the badge — so a long hyphenated
 * name is not squeezed into a thin column. It wraps on whitespace only (no break at hyphens),
 * clamps to two lines with an ellipsis, and exposes the full name via the native `title` tooltip.
 *
 * At-a-glance signals are absent-not-zero: the needs-you chip shows only when `needsYou > 0`,
 * and the open count and governance badge appear only when their data is present. A project with
 * no task summary or no gate facts shows no fabricated zeros.
 *
 * Security: `title` and `description` come from the project's README/manifest and are untrusted.
 * They are rendered with Angular interpolation only ({{ }}), which HTML-escapes — never via
 * `[innerHTML]`. The source-scan test enforces that no bypass exists anywhere in the app.
 */
@Component({
  selector: 'dart-project-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GlyphComponent],
  template: `
    <a
      class="card"
      data-testid="project-card"
      [attr.data-motion]="motionOk() ? 'on' : 'off'"
      [routerLink]="['/projects', view().record.id]"
      [attr.aria-label]="'Open project ' + title()"
    >
      <header class="card__head">
        <span class="card__tile" aria-hidden="true">
          <svg class="card__glyph" viewBox="0 0 24 24" width="20" height="20">
            <rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
            <line x1="10" y1="4.5" x2="10" y2="19.5" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </span>
        @if (governance(); as gov) {
          @if (gov.kind === 'security-reviewed') {
            <span
              class="badge badge--ok"
              data-testid="governance-badge"
              [attr.title]="securityTooltip"
            >
              <svg class="badge__glyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
                <path d="M12 3 19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z" fill="currentColor" stroke="none" />
              </svg>
              <span>Security-reviewed</span>
            </span>
          } @else {
            <span class="badge badge--danger" data-testid="governance-badge">
              <svg class="badge__glyph" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
                <path d="M12 3 19 6 v5 c0 5 -3 7 -7 9 c-4 -2 -7 -4 -7 -9 V6 z" fill="none" stroke="currentColor" stroke-width="1.6" />
              </svg>
              <span>blocked at {{ gov.stage }}</span>
            </span>
          }
        }
      </header>

      <div class="card__body" data-testid="card-body" [attr.data-hydrated]="hydrated()">
        <h2 class="card__title" [attr.title]="title()">{{ title() }}</h2>

        @if (description()) {
          <p class="card__desc">{{ description() }}</p>
        } @else {
          <p class="card__desc card__desc--empty">No description collected yet.</p>
        }

        @if (pulse(); as p) {
          <div class="pulse" data-testid="pulse">
            <span class="pulse__open">
              <dart-glyph name="check" [size]="13" />
              {{ p.open }} open
            </span>
            @if (p.needsYou > 0) {
              <span class="pulse__need" data-testid="needs-you">
                <dart-glyph name="need" [size]="13" />
                <span>{{ p.needsYou }} need you</span>
              </span>
            }
          </div>
        }

        @if (stack().length) {
          <ul class="card__chips" aria-label="Detected stack">
            @for (tech of stack(); track tech) {
              <li class="chip">{{ tech }}</li>
            }
          </ul>
        }
      </div>

      <hr class="card__rule" aria-hidden="true" />

      <footer class="card__foot" data-testid="status">
        <span class="status">
          <span class="status__dot" [class]="'status__dot--' + view().record.status" aria-hidden="true"></span>
          <span>{{ statusLabel() }}</span>
        </span>
        @if (lastSeen()) {
          <span class="card__seen">· updated {{ lastSeen() }}</span>
        }
      </footer>
    </a>
  `,
  styles: `
    /* Motion tokens — one place reduced-motion zeroes them; hover lift + hydrate crossfade read these. */
    :host { --kb-dur-fast: 120ms; --kb-dur-base: 160ms; --kb-ease-out: cubic-bezier(0.16, 1, 0.3, 1); }
    @media (prefers-reduced-motion: reduce) { :host { --kb-dur-fast: 0ms; --kb-dur-base: 0ms; } }
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--kb-space-2);
      min-height: 11rem;
      padding: var(--kb-space-3);
      background: var(--kb-surface);
      border: 1px solid var(--kb-border);
      border-radius: var(--kb-radius-lg);
      box-shadow: var(--kb-shadow-sm);
      color: var(--kb-text);
      text-decoration: none;
      transition: border-color var(--kb-dur-fast) var(--kb-ease-out), box-shadow var(--kb-dur-base) var(--kb-ease-out), transform var(--kb-dur-fast) var(--kb-ease-out);
    }
    /* Hover lift confirms the card is a live target; under reduced motion the tokens above
       zero the durations, so the border/elevation swap instantly with no translate. */
    .card:hover {
      border-color: var(--kb-border-strong);
      box-shadow: var(--kb-shadow-md);
      transform: translateY(-2px);
    }
    @media (prefers-reduced-motion: reduce) { .card:hover { transform: none; } }
    .card:focus-visible { outline: 2px solid var(--kb-focus-ring, var(--kb-accent)); outline-offset: 2px; }
    .card:hover .card__tile { color: var(--kb-accent-strong, var(--kb-accent)); }
    .card__body { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    /* When lazy hydration swaps record-only for the full profile, the arriving text cross-fades
       instead of hard-popping; gated by the data hook + the reduced-motion-zeroed tokens. */
    .card[data-motion='on'] .card__body[data-hydrated='true'] { animation: card-hydrate var(--kb-dur-base) var(--kb-ease-out); }
    @keyframes card-hydrate { from { opacity: 0.35; } to { opacity: 1; } }
    /* Disable at the enabling rule's specificity (the [data-motion='on'] scope) so the override
       wins; a bare '.card__body' is lower specificity and the crossfade would keep running. */
    @media (prefers-reduced-motion: reduce) {
      .card[data-motion='on'] .card__body[data-hydrated='true'] { animation: none; transition: none; transform: none; }
    }
    .card__head { display: flex; align-items: center; gap: var(--kb-space-2); }
    .card__tile {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: var(--kb-radius-md);
      background: var(--kb-accent-soft);
      color: var(--kb-accent);
    }
    .card__title {
      margin: 0;
      min-width: 0;
      font-size: var(--kb-text-lg);
      font-weight: 600;
      word-break: normal;
      overflow-wrap: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .badge {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: auto;
      padding: 0.1rem 0.45rem;
      font-size: var(--kb-text-xs);
      font-weight: 600;
      border-radius: 999px;
      border: 1px solid currentColor;
      white-space: nowrap;
    }
    .badge__glyph { flex: none; }
    .badge--ok { color: var(--kb-success); }
    .badge--danger { color: var(--kb-danger); }
    .card__chips { display: flex; flex-wrap: wrap; gap: var(--kb-space-1); margin: 0; padding: 0; list-style: none; }
    .chip {
      padding: 0.1rem 0.5rem;
      font-size: var(--kb-text-xs);
      color: var(--kb-text-muted);
      background: var(--kb-surface-muted);
      border: 1px solid var(--kb-border);
      border-radius: 999px;
    }
    .card__desc {
      margin: 0;
      color: var(--kb-text-muted);
      font-size: var(--kb-text-sm);
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card__desc--empty { color: var(--kb-text-subtle); font-style: italic; }
    .pulse {
      display: flex;
      align-items: center;
      gap: var(--kb-space-2);
      font-size: var(--kb-text-xs);
      font-weight: 600;
    }
    .pulse__open { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--kb-text-muted); }
    .pulse__need {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--kb-warning);
    }
    .card__rule { margin: var(--kb-space-1) 0 0; border: none; border-top: 1px solid var(--kb-border); }
    /* The connection + freshness line is the calmest signal — a single demoted footer row. */
    .card__foot {
      margin-top: auto;
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: var(--kb-text-xs);
      color: var(--kb-text-subtle);
    }
    .status { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--kb-text-muted); }
    .status__dot { width: 0.55rem; height: 0.55rem; border-radius: 999px; background: var(--kb-text-subtle); }
    .status__dot--connected { background: var(--kb-success); }
    .status__dot--analyzing { background: var(--kb-warning); }
    .status__dot--error { background: var(--kb-danger); }
    .status__dot--offline, .status__dot--needs-auth { background: var(--kb-text-subtle); }
  `,
})
export class ProjectCardComponent {
  readonly view = input.required<ProjectView>();

  protected readonly securityTooltip = SECURITY_REVIEWED_TOOLTIP;

  /** Whether the hover lift + hydrate crossfade are allowed; zeroed under reduced motion. */
  protected readonly motionOk = signal(prefersMotion());

  /**
   * True once the lazy profile fetch has merged in (a non-null profile or state). Drives the
   * hydrate crossfade so the description/badge arrive smoothly rather than popping; a record-only
   * view stays `false` so it can present calmly until its profile lands.
   */
  readonly hydrated = computed(() => this.view().profile !== null || this.view().state !== null);

  readonly title = computed(() => displayTitle(this.view()));
  readonly description = computed(() => displayDescription(this.view().profile));
  readonly stack = computed(() => this.view().profile?.stack ?? []);
  readonly statusLabel = computed(() => this.view().record.status);
  readonly lastSeen = computed(() => formatRelative(this.view().record.lastSeen));

  /** The compact `{ open, needsYou }` roll-up from the list payload, or null when absent. */
  readonly pulse = computed(() => this.view().record.taskSummary ?? null);

  /** The governance badge signal derived from the hydrated detail state, or null when absent. */
  readonly governance = computed(() => governanceSignal(this.view().state));
}

/** Render an ISO timestamp as a coarse relative string ("2h ago"); empty if unparseable. */
function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
