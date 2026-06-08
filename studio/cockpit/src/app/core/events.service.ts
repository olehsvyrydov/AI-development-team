import { InjectionToken, Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_BRIDGE } from './platform-bridge';
import type { ProjectState } from './models';

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

  /** A cold stream of fresh project states. Opening happens on subscribe; closing on unsubscribe. */
  connect(): Observable<ProjectState> {
    return new Observable<ProjectState>((subscriber) => {
      const source = this.open(this.bridge.apiUrl('/api/events'));
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
}
