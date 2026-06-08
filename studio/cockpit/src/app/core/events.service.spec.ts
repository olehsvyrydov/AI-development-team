import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_SOURCE_FACTORY, ProjectEventsService } from './events.service';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from './platform-bridge';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;
  listeners: Record<string, (ev: MessageEvent) => void> = {};
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: MessageEvent) => void) {
    this.listeners[type] = fn;
  }
  emit(type: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    this.listeners[type]?.(ev);
  }
  close() {
    this.closed = true;
  }
}

describe('ProjectEventsService', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
        { provide: EVENT_SOURCE_FACTORY, useValue: (url: string) => new FakeEventSource(url) },
        ProjectEventsService,
      ],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens an EventSource against /api/events and pushes parsed update payloads', () => {
    const svc = TestBed.inject(ProjectEventsService);
    const received: unknown[] = [];
    const sub = svc.connect().subscribe((s) => received.push(s));

    const es = FakeEventSource.instances[0];
    expect(es.url).toContain('/api/events');

    es.emit('update', { rev: 'r1', tickets: [{ id: 'A' }] });
    es.emit('update', { rev: 'r2', tickets: [{ id: 'A' }, { id: 'B' }] });

    expect(received).toHaveLength(2);
    expect((received[1] as { rev: string }).rev).toBe('r2');
    sub.unsubscribe();
    expect(es.closed).toBe(true);
  });

  it('ignores a malformed payload rather than erroring the stream', () => {
    const svc = TestBed.inject(ProjectEventsService);
    const received: unknown[] = [];
    const sub = svc.connect().subscribe((s) => received.push(s));
    const es = FakeEventSource.instances[0];
    es.listeners['update']?.({ data: 'not json{' } as MessageEvent);
    es.emit('update', { rev: 'ok' });
    expect(received).toHaveLength(1);
    sub.unsubscribe();
  });
});
