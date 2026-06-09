/**
 * Read the user's reduced-motion preference.
 *
 * @returns `true` when motion is allowed, `false` when the user prefers reduced motion. Defaults
 * to allowing motion when `matchMedia` is unavailable (server-side rendering, tests), so motion
 * is opt-out by capability, never silently disabled where the preference cannot be read.
 */
export function prefersMotion(): boolean {
  if (typeof matchMedia !== 'function') return true;
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
