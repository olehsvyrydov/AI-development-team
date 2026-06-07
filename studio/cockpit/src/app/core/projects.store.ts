import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { ProjectView } from './models';

/** The connect → analyse → ready/error sequence, surfaced to the card UI. */
export type ConnectStatus = 'idle' | 'analyzing' | 'ready' | 'error';

/**
 * Signals-first store for the Projects Home launcher. Holds the connected-project list and the
 * state machine for the in-place connect flow. No external state library — plain signals plus
 * the injected {@link ApiService} (which owns transport and the X-AIDT write guard).
 */
@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  private readonly api = inject(ApiService);

  private readonly items = signal<readonly ProjectView[]>([]);
  private readonly hasLoaded = signal(false);
  private readonly loadFailure = signal<string | null>(null);
  private readonly connect_ = signal<ConnectStatus>('idle');
  private readonly connectErr = signal<string | null>(null);

  /** Connected projects as view-models (record + profile + state). */
  readonly projects = this.items.asReadonly();
  /** True once a list load has resolved at least once. */
  readonly loaded = this.hasLoaded.asReadonly();
  /** Error text from the most recent list load, if it failed. */
  readonly loadError = this.loadFailure.asReadonly();
  /** Current phase of the connect flow. */
  readonly connectStatus = this.connect_.asReadonly();
  /** Hub error text for a failed connect, else null. */
  readonly connectError = this.connectErr.asReadonly();

  /** True only after a successful load that returned zero projects — drives the empty state. */
  readonly isEmpty = computed(() => this.hasLoaded() && this.items().length === 0);

  /** Fetch the connected-project list. The list endpoint returns records; profiles load lazily. */
  async load(): Promise<void> {
    this.loadFailure.set(null);
    try {
      const records = await this.api.listProjects();
      this.items.set(records.map((record) => ({ record, profile: null, state: null })));
    } catch (err) {
      this.loadFailure.set(messageOf(err));
      this.items.set([]);
    } finally {
      this.hasLoaded.set(true);
    }
  }

  /**
   * Connect a folder and fold the result into the list. Moves the connect status through
   * `analyzing` → `ready` (or `error`), and upserts the returned project so a brand-new card
   * appears at the front while a re-connect updates the existing card in place.
   */
  async connect(path: string): Promise<void> {
    this.connect_.set('analyzing');
    this.connectErr.set(null);
    try {
      const { view } = await this.api.connectProject(path);
      this.upsert(view);
      this.connect_.set('ready');
    } catch (err) {
      this.connectErr.set(messageOf(err));
      this.connect_.set('error');
    }
  }

  /** Return the connect flow to its resting state (e.g. after closing the connect panel). */
  resetConnect(): void {
    this.connect_.set('idle');
    this.connectErr.set(null);
  }

  private upsert(view: ProjectView): void {
    this.items.update((list) => {
      const idx = list.findIndex((v) => v.record.id === view.record.id);
      if (idx === -1) return [view, ...list];
      const next = list.slice();
      next[idx] = view;
      return next;
    });
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
