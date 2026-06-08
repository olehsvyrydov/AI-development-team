import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { displayTitle, type ProjectView } from './models';

/** Init-vs-adopt facts surfaced to the ready card after a successful connect. */
export interface ConnectOutcomeState {
  readonly created: boolean;
  readonly source?: string;
  readonly title: string;
  readonly tickets?: number;
  readonly docs?: number;
}

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
  private readonly connectOut = signal<ConnectOutcomeState | null>(null);

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
  /** Init-vs-adopt facts for the most recent successful connect, else null. */
  readonly connectOutcome = this.connectOut.asReadonly();

  /** Sum of `needsYou` across all connected projects (absent counts contribute nothing). */
  readonly totalNeedsYou = computed(() =>
    this.items().reduce((sum, v) => sum + (v.record.taskSummary?.needsYou ?? 0), 0),
  );
  /** Count of connected projects. */
  readonly projectCount = computed(() => this.items().length);

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
    this.connectOut.set(null);
    try {
      const { created, view } = await this.api.connectProject(path);
      this.upsert(view);
      this.connectOut.set(outcomeOf(created, view));
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
    this.connectOut.set(null);
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

/** Derive the init-vs-adopt outcome from a connect result and the returned view. */
function outcomeOf(created: boolean, view: ProjectView): ConnectOutcomeState {
  const summary = view.state?.taskSummary;
  const base = view.state?.base;
  return {
    created,
    source: view.profile?.source,
    title: displayTitle(view),
    tickets: summary?.total,
    docs: base?.counts?.indexed,
  };
}
