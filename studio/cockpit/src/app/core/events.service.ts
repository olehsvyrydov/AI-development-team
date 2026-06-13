import { InjectionToken, Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_BRIDGE } from './platform-bridge';
import type { ProjectState, RollupFrame } from './models';

/** Minimal slice of the DOM EventSource the service depends on, so a host/test can substitute it. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  close(): void;
}

/** Factory token for opening a server-sent-events stream — overridable for tests and non-DOM hosts. */
export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSourceLike>('EventSourceFactory', {
  providedIn: 'root',
  factory: () => (url: string) => new EventSource(url) as unknown as EventSourceLike,
});

/**
 * Subscribes to the hub's `/api/events` server-sent stream and emits each fresh `buildState` push.
 * The hub re-emits the full read-model on any ledger / comment / KB change, so every interactive
 * surface re-derives from the latest emission instead of polling or fetching per change.
 *
 * The stream is opened lazily per subscription and closed on unsubscribe, so a view owns its own
 * connection for its lifetime. A payload that fails to parse is skipped — one bad frame never tears
 * the stream down.
 */
@Injectable({ providedIn: 'root' })
export class ProjectEventsService {
  private readonly bridge = inject(PLATFORM_BRIDGE);
  private readonly open = inject(EVENT_SOURCE_FACTORY);

  /**
   * A cold stream of fresh project states. Opening happens on subscribe; closing on unsubscribe.
   * Pass the viewed project's registry id to subscribe to that project's isolated channel
   * (`/api/events?project=<id>`), so a viewer receives only this project's pushes — never another
   * project's frames. With no id the stream is unscoped (`/api/events`) and the hub serves its
   * launch project (single-project back-compat).
   */
  connect(projectId?: string): Observable<ProjectState> {
    return new Observable<ProjectState>((subscriber) => {
      const path = projectId ? `/api/events?project=${encodeURIComponent(projectId)}` : '/api/events';
      const source = this.open(this.bridge.apiUrl(path));
      const onUpdate = (ev: MessageEvent) => {
        let parsed: ProjectState;
        try {
          parsed = JSON.parse(ev.data) as ProjectState;
        } catch {
          return;
        }
        subscriber.next(parsed);
      };
      source.addEventListener('update', onUpdate);
      return () => source.close();
    });
  }

  /**
   * A cold stream of cross-project rollup frames from the hub's single server-side fan-out channel
   * (`/api/events/rollup`). The hub multiplexes every watched project's channel internally and
   * emits ONE merged frame on the `rollup` event whenever any project's state changes — so the
   * home opens this one channel rather than N per-project subscriptions. The first frame is a full
   * snapshot; each later frame is also a full frame. Opening happens on subscribe, closing on
   * unsubscribe. A frame that fails to parse is skipped — one bad frame never tears the stream down.
   */
  connectRollup(): Observable<RollupFrame> {
    return new Observable<RollupFrame>((subscriber) => {
      const source = this.open(this.bridge.apiUrl('/api/events/rollup'));
      const onRollup = (ev: MessageEvent) => {
        let parsed: RollupFrame;
        try {
          parsed = JSON.parse(ev.data) as RollupFrame;
        } catch {
          return;
        }
        subscriber.next(parsed);
      };
      source.addEventListener('rollup', onRollup);
      return () => source.close();
    });
  }
}
