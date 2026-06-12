'use strict';
/*
 * Contract test for the on-demand /dart:directives command (alias /dart:next).
 *
 * The command is a read-only convenience that surfaces the project's CURRENT
 * pending directives via the SAME deterministic digest path the live hook uses.
 * It MUST NOT consume and MUST NOT touch the session seen-file (an explicit pull
 * is not "the hook surfaced it this turn"). This locks that contract in the
 * shipped instruction file so a later edit cannot silently make the pull mutate
 * state (N-9a).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CMD = path.join(REPO_ROOT, 'claude', 'commands', 'dart-directives.md');

test('the dart:directives command file exists', () => {
  assert.ok(fs.existsSync(CMD), 'claude/commands/dart-directives.md is shipped');
});

test('the command documents the dart:directives name and the dart:next alias', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  assert.match(text, /dart:directives/, 'names /dart:directives');
  assert.match(text, /dart:next/, 'documents the /dart:next alias');
});

test('the command reuses the digest projection (node hub/lib/digest.js ... --json|--text)', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  assert.match(text, /hub\/lib\/digest\.js/, 'runs the same deterministic digest path');
});

test('N-9a: the command is read-only — no consume, no seen-file, no project write', () => {
  const text = fs.readFileSync(CMD, 'utf8').toLowerCase();
  // Any mention of consume must be a NEGATIVE statement (never/does not), not an instruction to consume.
  for (const m of text.matchAll(/[^.\n]*directive\/consume[^.\n]*/g)) {
    assert.match(m[0], /never|not|does not|don't|do not|stays the explicit/,
      `consume may only appear as a negative/no-op statement: "${m[0].trim()}"`);
  }
  // Any mention of the seen-file must be a NEGATIVE statement (not touched / unchanged).
  for (const m of text.matchAll(/[^.\n]*seen-file[^.\n]*/g)) {
    assert.match(m[0], /not|never|unchanged|untouched|does not|leaving/,
      `seen-file may only appear as a no-touch statement: "${m[0].trim()}"`);
  }
  // It must positively state it is read-only and explicitly addresses the seen marker.
  assert.match(text, /read-only|read only/, 'states it is read-only');
  assert.match(text, /seen/, 'explicitly addresses the seen-file (states it is not touched)');
});
