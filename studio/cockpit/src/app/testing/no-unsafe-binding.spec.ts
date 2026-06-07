import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-scan: untrusted project metadata (README/manifest title + description) reaches the DOM
 * only through Angular interpolation, which escapes by default. This app therefore has ZERO
 * DOM bindings that bypass the sanitizer. Any `[innerHTML]` binding or any DomSanitizer
 * `bypassSecurityTrust*` call is a regression — there is no markdown carve-out in this slice.
 */

const APP_ROOT = join(__dirname, '..');

function allSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...allSources(full));
    } else if ((entry.endsWith('.ts') || entry.endsWith('.html')) && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = allSources(APP_ROOT);

describe('unsafe DOM binding source-scan', () => {
  it('finds source files to scan', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it('contains no [innerHTML] binding anywhere', () => {
    // Match the BINDING syntax (`[innerHTML]=`), not the bare token — prose/doc-comments may
    // name [innerHTML] when explaining why it's forbidden, and that is not a regression.
    const offenders = SOURCES.filter((f) => /\[innerHTML\]\s*=/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('contains no DomSanitizer bypassSecurityTrust* call anywhere', () => {
    // CALL sites only (`bypassSecurityTrust*(`), so a doc-comment mentioning the API doesn't trip.
    const offenders = SOURCES.filter((f) => /bypassSecurityTrust\w*\s*\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
