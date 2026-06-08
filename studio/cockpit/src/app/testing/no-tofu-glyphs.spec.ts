import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-scan: rendered UI must not rely on exotic Unicode glyphs that fall back to "tofu" (▯)
 * when the user's font lacks them. Icons are inline SVG instead (decorative SVGs carry
 * aria-hidden; meaningful ones carry an accessible name). This test forbids the specific
 * fragile glyphs the launcher previously used, plus any character outside the safe printable
 * range, anywhere a template string can reach the DOM.
 *
 * Only component source is scanned (templates live in `.ts` here). Doc-comments are stripped
 * first so prose explaining the rule can still name a glyph without tripping the scan.
 */

const APP_ROOT = join(__dirname, '..');

function componentSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...componentSources(full));
    } else if (entry.endsWith('.component.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Drop block/line comments so prose that names a forbidden glyph isn't counted as rendered. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const SOURCES = componentSources(APP_ROOT);

/** Glyphs the launcher previously rendered that tofu in common fonts. */
const FORBIDDEN_GLYPHS = ['＋', '◧', '‹', '›', '▯'];

/** Anything above Latin-1 that isn't a normal typographic character used in copy. */
const ALLOWED_NON_ASCII = new Set(['·', '…', '–', '—', '’', '“', '”', '‘']);

describe('no tofu-prone glyphs in rendered UI', () => {
  it('finds component sources to scan', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it('contains none of the known fragile glyphs', () => {
    const offenders = SOURCES.filter((f) => {
      const body = stripComments(readFileSync(f, 'utf8'));
      return FORBIDDEN_GLYPHS.some((g) => body.includes(g));
    });
    expect(offenders).toEqual([]);
  });

  it('contains no other non-ASCII glyph outside the typographic allow-list', () => {
    const offenders: string[] = [];
    for (const f of SOURCES) {
      const body = stripComments(readFileSync(f, 'utf8'));
      for (const ch of body) {
        if (ch.charCodeAt(0) > 0x7f && !ALLOWED_NON_ASCII.has(ch)) {
          offenders.push(`${f}: ${ch} (U+${ch.charCodeAt(0).toString(16).toUpperCase()})`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
