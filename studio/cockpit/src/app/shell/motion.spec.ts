import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersMotion } from './motion';

describe('prefersMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows motion when matchMedia is unavailable (SSR/test-safe default)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersMotion()).toBe(true);
  });

  it('allows motion when the user has expressed no reduced-motion preference', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
    expect(prefersMotion()).toBe(true);
  });

  it('disallows motion when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
    }));
    expect(prefersMotion()).toBe(false);
  });

  it('queries the prefers-reduced-motion media feature', () => {
    const spy = vi.fn((query: string) => ({ matches: false, media: query }));
    vi.stubGlobal('matchMedia', spy);
    prefersMotion();
    expect(spy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
