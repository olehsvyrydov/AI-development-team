import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-scan: under `prefers-reduced-motion: reduce` the disable rule must MATCH OR EXCEED the
 * specificity of the rule that enables the animation, or the enable wins the cascade and motion
 * keeps running. The enabling rules are all scoped by a `[data-motion='on']` attribute selector,
 * so the reduced-motion override must target that same scope (not a lower-specificity ancestor).
 *
 * Asserting on the source string is deliberate: jsdom does not evaluate `@media` queries or the
 * cascade, so a behavioural assertion is not available here — the cascade math is the contract,
 * and the contract lives in the stylesheet text. The override must therefore appear in the LAST
 * reduced-motion block that targets the scope, since that block wins among the scoped rules.
 */

const DIR = __dirname;

function source(file: string): string {
  return readFileSync(join(DIR, file), 'utf8');
}

/** Bodies of every `@media (prefers-reduced-motion: reduce) { … }` block, in source order. */
function reducedMotionBlocks(src: string): string[] {
  const marker = '@media (prefers-reduced-motion: reduce)';
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf(marker, from);
    if (start === -1) break;
    const open = src.indexOf('{', start);
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    blocks.push(src.slice(open + 1, i));
    from = i + 1;
  }
  return blocks;
}

/**
 * Body of the LAST reduced-motion block that targets `scope` — the one that wins the cascade
 * among the scoped overrides. Concatenating all blocks (the previous behaviour) would let the
 * `animation: none` assertion pass on text from a non-winning block while the final scoped block
 * silently dropped the override; selecting the last scoped block prevents that false pass.
 */
function winningScopedBlock(src: string, scope: string): string {
  const scoped = reducedMotionBlocks(src).filter((block) => block.includes(scope));
  return scoped.at(-1) ?? '';
}

describe('reduced-motion disables motion at matching specificity', () => {
  it('projects-home: the reduced-motion override targets the data-motion=on grid scope', () => {
    const block = winningScopedBlock(source('projects-home.component.ts'), ".grid[data-motion='on']");
    expect(block).toMatch(/animation:\s*none/);
  });

  it('project-card: the reduced-motion override targets the data-motion=on card scope', () => {
    const block = winningScopedBlock(source('project-card.component.ts'), ".card[data-motion='on']");
    expect(block).toMatch(/animation:\s*none/);
  });

  it('project-card: the live-dot ring-pulse is disabled at its own data-pulse scope under reduced motion', () => {
    const block = winningScopedBlock(source('project-card.component.ts'), ".fresh[data-state='live']");
    expect(block).toMatch(/animation:\s*none/);
  });

  it('connect-panel: the reduced-motion override targets the data-motion=on connect scope', () => {
    const block = winningScopedBlock(source('connect-panel.component.ts'), ".connect[data-motion='on']");
    expect(block).toMatch(/animation:\s*none/);
  });
});

describe('the shared motion helper is used (no duplicated local prefersMotion)', () => {
  for (const file of ['projects-home.component.ts', 'project-card.component.ts', 'connect-panel.component.ts']) {
    it(`${file} imports prefersMotion from the shell helper and defines no local copy`, () => {
      const src = source(file);
      expect(src).toMatch(/import\s*\{[^}]*\bprefersMotion\b[^}]*\}\s*from\s*['"][^'"]*shell\/motion['"]/);
      expect(src).not.toMatch(/function\s+prefersMotion\s*\(/);
    });
  }
});
