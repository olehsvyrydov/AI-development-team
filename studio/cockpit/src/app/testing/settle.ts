import type { ComponentFixture } from '@angular/core/testing';

/**
 * Drain pending promise chains and run change detection, for zoneless component tests.
 *
 * Without zone.js, `fixture.whenStable()` does not await application-level promise chains (e.g.
 * a component that loads data in ngOnInit and then hydrates in a second await). This flushes the
 * microtask queue and re-runs change detection a few times so multi-stage async settles and the
 * template reflects the final signal state before assertions run.
 */
export async function settle<T>(fixture: ComponentFixture<T>, rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // A macrotask boundary lets queued promise continuations (and the next stage of a
    // multi-await chain) run before the next stability check + change-detection pass.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}
