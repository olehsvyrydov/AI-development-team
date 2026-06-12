'use strict';
/*
 * Contract test for the on-demand /dart:ask command.
 *
 * The command is a read-only interpretation-check over the project's knowledge,
 * reusing the SAME gated Q&A backend (knowledge-qa / knowledge/ask). It MUST:
 *  - be dart:-namespaced (no clobber),
 *  - reuse the gated backend (no new path, no second egress path),
 *  - instruct presenting the backend's honest grounding label verbatim and the
 *    egress disclosure truthfully (never overclaim a semantic match),
 *  - declare the read-only contract (no write, no consume, no egress unless an
 *    overlay is already configured + enabled).
 * This locks those guarantees into the shipped instruction file.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CMD = path.join(REPO_ROOT, 'claude', 'commands', 'dart-ask.md');

test('the dart:ask command file exists', () => {
  assert.ok(fs.existsSync(CMD), 'claude/commands/dart-ask.md is shipped');
});

test('the command has valid frontmatter and is dart:-namespaced', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, 'starts with a YAML frontmatter block');
  assert.match(fm[1], /^name:\s*dart:ask\s*$/m, 'name is dart:ask (namespaced, no clobber)');
  assert.match(fm[1], /^description:\s*.+/m, 'has a description');
});

test('the command reuses the gated Q&A backend (knowledge-qa CLI / knowledge/ask)', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  assert.match(text, /hub\/lib\/knowledge-qa\.js/, 'runs the hub-independent Q&A CLI');
  assert.match(text, /knowledge\/ask/, 'references the same backend route');
});

test('the command instructs honest grounding + truthful egress disclosure (no overclaim)', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  assert.match(text, /grounding label/i, 'names the grounding label');
  assert.match(text, /verbatim/i, 'requires the label presented verbatim');
  assert.match(text, /not.*semantic understanding check|not.*overclaim|do not overclaim/i, 'forbids overclaiming a semantic match');
  assert.match(text, /egress/i, 'addresses egress disclosure');
});

test('the command declares the read-only / no-second-egress contract', () => {
  const text = fs.readFileSync(CMD, 'utf8');
  assert.match(text, /read-only|read only/i, 'positively states it is read-only');
  assert.match(text, /no second egress path|not add a second egress/i, 'forbids a second egress path');
  // Any mention of egress must be qualified by the overlay precondition or a negative.
  assert.match(text, /no egress unless|triggers no egress|only when an overlay/i,
    'egress is gated on an already-configured+enabled overlay');
});
