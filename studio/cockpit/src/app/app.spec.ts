import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from './app';

/**
 * The root renders a skip link for keyboard users. It is absolutely positioned with a raised
 * stacking order, so it is the one element in the app that could ever sit over content and
 * intercept pointer events. To guarantee real mouse clicks always reach the controls beneath it,
 * the skip link must not consume pointer events until it is focused.
 */
describe('App root', () => {
  it('renders a keyboard skip link to the main content', async () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const skip = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.skip-link');
    expect(skip).toBeTruthy();
    expect(skip!.getAttribute('href')).toBe('#main');
  });

  it('declares the skip link non-interactive to the pointer until it is focused', () => {
    const src = readFileSync(join(__dirname, 'app.ts'), 'utf8');
    // Base rule must opt the link out of pointer hit-testing; focus restores it.
    expect(/\.skip-link\s*\{[^}]*pointer-events:\s*none/s.test(src)).toBe(true);
    expect(/\.skip-link:focus\s*\{[^}]*pointer-events:\s*auto/s.test(src)).toBe(true);
  });
});
