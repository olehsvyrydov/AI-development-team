import { DestroyRef, InjectionToken, Injectable, computed, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import { ProjectEventsService } from './events.service';
import type { RollupFrame, RollupProjectEntry } from './models';

/** One project waiting on the human — a band click-target ordered by descending need. */
export interface WaitingRollup {
  readonly id: string;
  /** The project's display name. UNTRUSTED — escape on render. */
  readonly name: string;
  readonly needsYou: number;
}

/**
 * Debounce window (ms) for the net-change announcer: a burst of frames within this window settles
 * to a single announcement of the final total. Injectable so tests can shorten it deterministically.
 */
export const ROLLUP_ANNOUNCE_DEBOUNCE_MS = new InjectionToken<number>('RollupAnnounceDebounceMs', {
  providedIn: 'root',
  factory: () => 1800,
});

/**
 * Signals-first store for the live cross-project rollup. It opens the hub's single fan-out channel
 * (`/api/events/rollup`), adopts the FIRST frame as a full snapshot and each later frame wholesale
 * (no client reconciliation), and exposes the rolled-up totals and per-project entries as signals —
 * so the Projects Home strip, band, and cards recompute live for free.
 *
 * It also owns the live-announce policy: ONE debounced, net-change-only sentence for the global
 * "needs you" total, exposed via {@link announcement}. The first-paint value and a no-op (unchanged
 * total) are never announced; per-project freshness and per-chip changes are NOT announced here.
 */
@Injectable({ providedIn: 'root' })
export class RollupStore {
  private readonly events = inject(ProjectEventsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly announceDebounceMs = inject(ROLLUP_ANNOUNCE_DEBOUNCE_MS);

  private readonly frame = signal<RollupFrame | null>(null);
  private readonly open = signal(false);
  private readonly announced = signal('');

  private sub: Subscription | null = null;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAnnouncedTotal: number | null = null;

  /** The live rollup entries, in the order the server sent them (grid order is never re-sorted live). */
  readonly projects = computed<readonly RollupProjectEntry[]>(() => this.frame()?.projects ?? []);
  /** Sum of `needsYou` across the frame; 0 before the first frame. */
  readonly totalNeedsYou = computed(() => this.frame()?.totalNeedsYou ?? 0);
  /** Sum of `open` across the frame; 0 before the first frame. */
  readonly totalOpen = computed(() => this.frame()?.totalOpen ?? 0);
  /** True once at least one frame has been adopted. */
  readonly hasFrame = computed(() => this.frame() !== null);
  /** Whether the live channel is currently connected (drops to false on stream error). */
  readonly channelOpen = this.open.asReadonly();
  /** The current debounced, net-change-only announcement sentence, or '' when nothing to announce. */
  readonly announcement = this.announced.asReadonly();

  /** The frame entries indexed by id, for a per-card freshness lookup without an O(N) scan. */
  readonly byId = computed<ReadonlyMap<string, RollupProjectEntry>>(() => {
    const map = new Map<string, RollupProjectEntry>();
    for (const p of this.projects()) map.set(p.id, p);
    return map;
  });

  /**
   * Projects with at least one task waiting on the human, ordered by descending need — the band's
   * click-targets. A project whose `needsYou` is 0 contributes nothing (absent-not-zero). This
   * ordering drives the BAND only; the card grid keeps its stable order.
   */
  readonly waiting = computed<readonly WaitingRollup[]>(() =>
    this.projects()
      .filter((p) => p.needsYou > 0)
      .map((p) => ({ id: p.id, name: p.label, needsYou: p.needsYou }))
      .sort((a, b) => b.needsYou - a.needsYou),
  );

  /** Open the live channel. Idempotent — a second call while running is a no-op. */
  start(): void {
    if (this.sub) return;
    this.sub = this.events.connectRollup().subscribe({
      next: (frame) => this.adopt(frame),
      error: () => this.open.set(false),
      complete: () => this.open.set(false),
    });
    this.destroyRef.onDestroy(() => this.stop());
  }

  /** Close the live channel and cancel any pending announcement timer. */
  stop(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    if (this.announceTimer !== null) {
      clearTimeout(this.announceTimer);
      this.announceTimer = null;
    }
    this.open.set(false);
  }

  private adopt(frame: RollupFrame): void {
    const first = this.frame() === null;
    this.frame.set(frame);
    this.open.set(true);
    if (first) {
      // First paint: render the value but never announce it — it is the page state the user lands on.
      this.lastAnnouncedTotal = frame.totalNeedsYou;
      return;
    }
    this.scheduleAnnounce();
  }

  /**
   * (Re)arm the debounce. A burst of frames keeps pushing the deadline out; when it finally fires we
   * announce the SETTLED total once, and only if it differs from the last announced value (net change).
   */
  private scheduleAnnounce(): void {
    if (this.announceTimer !== null) clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      this.announceTimer = null;
      const total = this.totalNeedsYou();
      if (total === this.lastAnnouncedTotal) return;
      this.lastAnnouncedTotal = total;
      this.announced.set(announcementFor(total, this.waiting().length));
    }, this.announceDebounceMs);
  }
}

/** Build the self-contained announcement sentence for a settled total (a polite, framed delta). */
function announcementFor(total: number, projectCount: number): string {
  if (total === 0) return 'No tasks need you.';
  const task = total === 1 ? 'task' : 'tasks';
  const project = projectCount === 1 ? 'project' : 'projects';
  return `Now ${total} ${task} need you across ${projectCount} ${project}.`;
}
