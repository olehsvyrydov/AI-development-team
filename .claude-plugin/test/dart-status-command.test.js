'use strict';
/*
 * Contract test for the on-demand /dart:status command.
 *
 * The command is a read-only convenience that surfaces the project's CURRENT
 * workflow status (tickets · stages · gates · who's-acting) via the SAME
 * deterministic, overlay-aware digest projection the hub board and the live hook
 * use. It MUST NOT advance, gate, or comment — those stay explicit agent actions
 * / MCP tools. This locks that contract in the shipped instruction file so a
 * later edit cannot silently make the read mutate workflow state.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CMD = path.join(REPO_ROOT, 'claude', 'commands', 'dart-status.md');

test('the dart:status command file exists', () => {
  assert.ok(fs.existsSync(CMD), 'claude/commands/dart-status.md is shipped');
});

test('the command has valid frontmatter and is dart:-namespaced', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, 'starts with a YAML frontmatter block');
  assert.match(fm[1], /^name:\s*dart:status\s*$/m, 'name is dart:status (namespaced, no clobber)');
  assert.match(fm[1], /^description:\s*.+/m, 'has a description');
});

test('the command reuses the digest projection (node hub/lib/digest.js ... --text|--json)', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  assert.match(text, /hub\/lib\/digest\.js/, 'runs the same deterministic digest path');
  assert.match(text, /--text|--json/, 'documents the text/json projection');
});

test('the command declares the read-only contract — no advance, no gate, no comment, no write', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  assert.match(text, /read-only|read only/i, 'positively states it is read-only');
  // The mutation verbs (advance/set-a-gate/comment/write) appear ONLY inside an
  // explicit negative or "stays explicit elsewhere" clause — never as an instruction
  // to perform them. Locate the contract section and assert it negates each one.
  assert.match(text, /does \*\*not\*\* advance|not advance any\b/i, 'negates advancing a ticket');
  assert.match(text, /set or clear any gate|set a gate result|gate result.*explicit/i, 'gate-setting stays explicit, not done here');
  assert.match(text, /post any comment|commenting stay/i, 'commenting stays explicit, not done here');
  assert.match(text, /write any project file|writes? nothing|never.*write/i, 'writes no project file');
  assert.match(text, /never consumes a directive/i, 'never consumes a directive');
});
