import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { displayDescription, displayTitle, type ProjectView } from '../core/models';

/**
 * Project Shell — the per-project workspace entered from a launcher card. For this slice it
 * shows the project header (title + auto-collected description) and placeholder regions for the
 * Workflow / Tasks / Base panels, which arrive in later tickets. The route id binds via
 * component-input binding; the view loads from getProject.
 *
 * Security: title and description are untrusted README/manifest text, rendered with
 * interpolation only (escaped) — no `[innerHTML]`.
 */
@Component({
  selector: 'dart-project-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="shell-head">
      <a class="back" routerLink="/" data-testid="back-to-projects" aria-label="Back to projects">‹ Projects</a>
      @if (view(); as v) {
        <span class="shell-head__glyph" aria-hidden="true">◧</span>
        <h1 class="shell-head__title">{{ title() }}</h1>
        @if (description()) {
          <p class="shell-head__desc" [attr.title]="description()">{{ description() }}</p>
        }
      }
    </header>

    <main id="main" class="shell-body">
      @if (error(); as err) {
        <p class="banner banner--error" role="alert" data-testid="shell-error">Couldn't open this project: {{ err }}</p>
      } @else if (!view()) {
        <p class="muted" role="status" aria-live="polite">Loading project…</p>
      } @else {
        <section class="panels" aria-label="Project areas">
          <article class="panel" data-testid="panel-workflow">
            <h2 class="panel__title">Workflow</h2>
            <p class="panel__hint">Visual orchestration builder — coming soon.</p>
          </article>
          <article class="panel" data-testid="panel-tasks">
            <h2 class="panel__title">Tasks</h2>
            <p class="panel__hint">Agent-managed board — coming soon.</p>
          </article>
          <article class="panel" data-testid="panel-base">
            <h2 class="panel__title">Base</h2>
            <p class="panel__hint">Knowledge documents the agents follow — coming soon.</p>
          </article>
        </section>
      }
    </main>
  `,
  styles: `
    .shell-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kb-space-3);
      padding: var(--kb-space-3) var(--kb-space-4);
      background: linear-gradient(120deg, var(--kb-header-from), var(--kb-header-to));
      border-bottom: 1px solid var(--kb-border);
    }
    .back { color: var(--kb-text-muted); text-decoration: none; font-size: var(--kb-text-sm); }
    .back:hover { color: var(--kb-text); }
    .shell-head__glyph { color: var(--kb-accent); }
    .shell-head__title { margin: 0; font-size: var(--kb-text-xl); font-weight: 700; }
    .shell-head__desc {
      margin: 0;
      color: var(--kb-text-muted);
      font-size: var(--kb-text-sm);
      max-width: 42rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .shell-body { max-width: 76rem; margin: 0 auto; padding: var(--kb-space-5) var(--kb-space-4); }
    .muted { color: var(--kb-text-muted); }
    .banner--error { padding: var(--kb-space-3); border-radius: var(--kb-radius-md); background: var(--kb-accent-soft); color: var(--kb-danger); border: 1px solid var(--kb-danger); }
    .panels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
      gap: var(--kb-space-3);
    }
    .panel {
      padding: var(--kb-space-4);
      background: var(--kb-surface);
      border: 1px solid var(--kb-border);
      border-radius: var(--kb-radius-lg);
      box-shadow: var(--kb-shadow-sm);
    }
    .panel__title { margin: 0 0 var(--kb-space-2); font-size: var(--kb-text-lg); }
    .panel__hint { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
  `,
})
export class ProjectShellComponent {
  private readonly api = inject(ApiService);

  /** Project id from the route (`projects/:id`), bound via component-input binding. */
  readonly id = input.required<string>();

  private readonly loaded = signal<ProjectView | null>(null);
  private readonly failure = signal<string | null>(null);

  readonly view = this.loaded.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly title = computed(() => {
    const v = this.loaded();
    return v ? displayTitle(v) : '';
  });
  readonly description = computed(() => displayDescription(this.loaded()?.profile ?? null));

  constructor() {
    // Load whenever the route id changes (including its first binding). The effect tracks the
    // id signal; each new id clears prior state and refetches.
    effect(() => {
      const id = this.id();
      this.loaded.set(null);
      this.failure.set(null);
      this.api
        .getProject(id)
        .then((view) => {
          if (this.id() === id) this.loaded.set(view);
        })
        .catch((err: unknown) => {
          if (this.id() === id) this.failure.set(err instanceof Error ? err.message : String(err));
        });
    });
  }
}
