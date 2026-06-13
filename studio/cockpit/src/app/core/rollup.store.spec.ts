import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectEventsService } from './events.service';
import { RollupStore, ROLLUP_ANNOUNCE_DEBOUNCE_MS } from './rollup.store';
import type { RollupFrame, RollupProjectEntry } from './models';

function entry(over: Partial<RollupProjectEntry> = {}): RollupProjectEntry {
  return { id: 'a', label: 'a', status: 'connected', open: 0, needsYou: 0, stateChangedAt: 1, live: true, ...over };
}

function frame(projects: RollupProjectEntry[]): RollupFrame {
  return {
    totalOpen: projects.reduce((s, p) => s + p.open, 0),
    totalNeedsYou: projects.reduce((s, p) => s + p.needsYou, 0),
    projects,
  };
}

describe('RollupStore', () => {
  let frames: Subject<RollupFrame>;
  let store: RollupStore;

  beforeEach(() => {
    frames = new Subject<RollupFrame>();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectEventsService, useValue: { connectRollup: () => frames.asObservable() } },
        { provide: ROLLUP_ANNOUNCE_DEBOUNCE_MS, useValue: 1000 },
        RollupStore,
      ],
    });
    store = TestBed.inject(RollupStore);
    vi.useFakeTimers();
    store.start();
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  it('adopts the first frame as a full snapshot and exposes its totals', () => {
    frames.next(frame([entry({ id: 'a', open: 5, needsYou: 2 }), entry({ id: 'b', open: 3, needsYou: 1 })]));
    expect(store.totalNeedsYou()).toBe(3);
    expect(store.totalOpen()).toBe(8);
    expect(store.projects()).toHaveLength(2);
  });

  it('merges a later frame, recomputing counts without a reload', () => {
    frames.next(frame([entry({ id: 'a', open: 5, needsYou: 2 })]));
    expect(store.totalNeedsYou()).toBe(2);
    frames.next(frame([entry({ id: 'a', open: 6, needsYou: 4 })]));
    expect(store.totalNeedsYou()).toBe(4);
  });

  it('orders waiting projects by descending needsYou and drops the all-clear ones', () => {
    frames.next(
      frame([
        entry({ id: 'a', label: 'low', needsYou: 1 }),
        entry({ id: 'b', label: 'high', needsYou: 5 }),
        entry({ id: 'c', label: 'clear', needsYou: 0 }),
      ]),
    );
    const waiting = store.waiting();
    expect(waiting.map((w) => w.id)).toEqual(['b', 'a']);
  });

  it('marks the channel open once a frame arrives', () => {
    expect(store.channelOpen()).toBe(false);
    frames.next(frame([entry()]));
    expect(store.channelOpen()).toBe(true);
  });

  it('does NOT announce the first-paint value (the page state the user is landing on)', () => {
    frames.next(frame([entry({ needsYou: 5 })]));
    vi.advanceTimersByTime(2000);
    expect(store.announcement()).toBe('');
  });

  it('announces a net total change ONCE, debounced to the settled value', () => {
    frames.next(frame([entry({ id: 'a', needsYou: 2 })]));
    vi.advanceTimersByTime(2000);
    expect(store.announcement()).toBe('');

    // A burst of pushes within the debounce window must yield ONE announcement of the settled value.
    frames.next(frame([entry({ id: 'a', needsYou: 3 })]));
    frames.next(frame([entry({ id: 'a', needsYou: 4 })]));
    frames.next(frame([entry({ id: 'a', needsYou: 5 })]));
    vi.advanceTimersByTime(1000);

    expect(store.announcement()).toContain('5');
    expect(store.announcement()).toMatch(/need you/i);
  });

  it('does NOT announce a no-op frame whose total equals the last announced value', () => {
    frames.next(frame([entry({ id: 'a', needsYou: 2 })]));
    vi.advanceTimersByTime(1000);
    frames.next(frame([entry({ id: 'a', needsYou: 5 })]));
    vi.advanceTimersByTime(1000);
    const announced = store.announcement();
    expect(announced).toContain('5');

    // Same total again: settle fires but the value is unchanged → no new announcement text emitted.
    frames.next(frame([entry({ id: 'a', open: 9, needsYou: 5 })]));
    vi.advanceTimersByTime(1000);
    expect(store.announcement()).toBe(announced);
  });
});
