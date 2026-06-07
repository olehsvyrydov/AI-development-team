import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { displayDescription, displayTitle, type ProjectView } from '../core/models';

/**
 * One project tile in the launcher grid: title, the auto-collected description, detected stack
 * chips, and a status / last-seen indicator. The whole card is a router link into the shell.
 *
 * Security: `title` and `description` come from the project's README/manifest and are untrusted.
 * They are rendered with Angular interpolation only ({{ }}), which HTML-escapes — never via
 * `[innerHTML]`. The source-scan test enforces that no bypass exists anywhere in the app.
 */
@Component({
  selector: 'dart-project-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a
      class="card"
      data-testid="project-card"
      [routerLink]="['/projects', view().record.id]"
      [attr.aria-label]="'Open project ' + title()"
    >
      <header class="card__head">
        <span class="card__glyph" aria-hidden="true">◧</span>
        <h2 class="card__title">{{ title() }}</h2>
      </header>

      @if (stack().length) {
        <ul class="card__chips" aria-label="Detected stack">
          @for (tech of stack(); track tech) {
            <li class="chip">{{ tech }}</li>
          }
        </ul>
      }

      @if (description()) {
        <p class="card__desc">{{ description() }}</p>
      } @else {
        <p class="card__desc card__desc--empty">No description collected yet.</p>
      }

      <footer class="card__foot">
        <span class="status" data-testid="status">
          <span class="status__dot" [class]="'status__dot--' + view().record.status" aria-hidden="true"></span>
          <span>{{ statusLabel() }}</span>
        </span>
        @if (lastSeen()) {
          <span class="card__seen">updated {{ lastSeen() }}</span>
        }
      </footer>
    </a>
  `,
  styles: `
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
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
    }
    .card:hover {
      border-color: var(--kb-border-strong);
      box-shadow: var(--kb-shadow-md);
      transform: translateY(-2px);
    }
    .card__head { display: flex; align-items: center; gap: var(--kb-space-2); }
    .card__glyph { color: var(--kb-accent); font-size: var(--kb-text-lg); }
    .card__title {
      margin: 0;
      font-size: var(--kb-text-lg);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
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
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card__desc--empty { color: var(--kb-text-subtle); font-style: italic; }
    .card__foot {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--kb-space-2);
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

  readonly title = computed(() => displayTitle(this.view()));
  readonly description = computed(() => displayDescription(this.view().profile));
  readonly stack = computed(() => this.view().profile?.stack ?? []);
  readonly statusLabel = computed(() => this.view().record.status);
  readonly lastSeen = computed(() => formatRelative(this.view().record.lastSeen));
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
