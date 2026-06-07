import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ProjectsStore } from '../core/projects.store';
import type { ProjectView } from '../core/models';
import { ProjectCardComponent } from './project-card.component';
import { ConnectPanelComponent } from './connect-panel.component';

/**
 * Projects Home — the launcher. A responsive grid of connected-project cards plus an always-last
 * "Connect a project" affordance, and a first-run empty state. The list endpoint returns records
 * only, so each card's profile (title/description) is hydrated lazily here via getProject.
 */
@Component({
  selector: 'dart-projects-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectCardComponent, ConnectPanelComponent],
  template: `
    <header class="topbar">
      <div class="brand">
        <span class="brand__dot" aria-hidden="true"></span>
        <span class="brand__name">AI Dev Team · Studio</span>
      </div>
    </header>

    <main id="main" class="page">
      <h1 class="page__title">Your projects</h1>

      @if (store.loadError(); as err) {
        <p class="banner banner--error" role="alert" data-testid="load-error">Couldn't load projects: {{ err }}</p>
      }

      @if (store.isEmpty() && store.connectStatus() === 'idle') {
        <section class="empty" data-testid="empty-state" aria-labelledby="empty-h">
          <span class="empty__glyph" aria-hidden="true">◧</span>
          <h2 id="empty-h" class="empty__title">No projects yet</h2>
          <p class="empty__lead">
            Connect a folder and the team will read it, summarise it, and get to work.
          </p>
          <dart-connect-panel [status]="store.connectStatus()" [error]="store.connectError()" (connect)="onConnect($event)" (reset)="store.resetConnect()" />
        </section>
      } @else {
        <section class="grid" aria-label="Connected projects">
          @for (view of hydrated(); track view.record.id) {
            <dart-project-card [view]="view" />
          }
          <dart-connect-panel [status]="store.connectStatus()" [error]="store.connectError()" (connect)="onConnect($event)" (reset)="store.resetConnect()" />
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
    .page { max-width: 76rem; margin: 0 auto; padding: var(--kb-space-5) var(--kb-space-4); }
    .page__title { margin: 0 0 var(--kb-space-4); font-size: var(--kb-text-2xl); font-weight: 700; }
    .banner { padding: var(--kb-space-2) var(--kb-space-3); border-radius: var(--kb-radius-md); margin-bottom: var(--kb-space-3); }
    .banner--error { background: var(--kb-accent-soft); color: var(--kb-danger); border: 1px solid var(--kb-danger); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
      gap: var(--kb-space-3);
    }
    .empty {
      max-width: 34rem;
      margin: var(--kb-space-6) auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--kb-space-3);
    }
    .empty__glyph { font-size: 2.5rem; color: var(--kb-accent); }
    .empty__title { margin: 0; font-size: var(--kb-text-xl); }
    .empty__lead { margin: 0; color: var(--kb-text-muted); }
  `,
})
export class ProjectsHomeComponent implements OnInit {
  protected readonly store = inject(ProjectsStore);
  private readonly api = inject(ApiService);

  /** Profiles fetched per project id, merged over the store's record-only views for display. */
  private readonly profiles = signal<ReadonlyMap<string, ProjectView>>(new Map());

  readonly hydrated = computed<readonly ProjectView[]>(() => {
    const byId = this.profiles();
    return this.store.projects().map((view) => byId.get(view.record.id) ?? view);
  });

  async ngOnInit(): Promise<void> {
    await this.store.load();
    void this.hydrateProfiles();
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
