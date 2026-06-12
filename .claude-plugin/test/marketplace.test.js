'use strict';
/*
 * Marketplace-manifest contract for the DART Claude Code plugin.
 *
 * The plugin is only installable via `claude plugin marketplace add <repo>` +
 * `claude plugin install dart@<marketplace>` when the repo root carries a valid
 * marketplace.json. These tests lock that manifest: it parses, declares the `dart`
 * plugin pointing at the shipped in-repo plugin, keeps namespacing parity with
 * plugin.json's name, and ships no secret-shaped value (the same no-secret bar the
 * rest of the package is held to).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLUGIN_DIR, '..');

function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

const MARKETPLACE_PATH = path.join(PLUGIN_DIR, 'marketplace.json');
const PLUGIN_MANIFEST_PATH = path.join(PLUGIN_DIR, 'plugin.json');

test('marketplace.json exists at .claude-plugin/marketplace.json and is valid JSON', () => {
  assert.ok(fs.existsSync(MARKETPLACE_PATH), 'marketplace manifest present at the repo plugin root');
  const mp = readJson(MARKETPLACE_PATH);
  assert.equal(typeof mp, 'object');
});

test('marketplace declares the required name + owner.name fields', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.equal(typeof mp.name, 'string');
  assert.ok(mp.name.length > 0, 'marketplace name is non-empty');
  assert.match(mp.name, /^[a-z][a-z0-9-]*$/, 'marketplace name is kebab-case (a valid marketplace id)');
  assert.equal(typeof mp.owner, 'object', 'owner is an object');
  assert.ok(mp.owner && typeof mp.owner.name === 'string' && mp.owner.name.length > 0, 'owner.name is a non-empty string');
});

test('marketplace lists the dart plugin pointing at the in-repo shipped plugin', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.ok(Array.isArray(mp.plugins) && mp.plugins.length >= 1, 'plugins is a non-empty array');
  const dart = mp.plugins.find((p) => p && p.name === 'dart');
  assert.ok(dart, 'a plugin entry named "dart" exists');
  assert.equal(typeof dart.source, 'string', 'the dart entry declares a source');
  // The plugin.json lives at .claude-plugin/plugin.json, so the marketplace root IS the
  // plugin root: the source points at the repo itself, never a remote fetch.
  const localSources = new Set(['.', './']);
  assert.ok(localSources.has(dart.source), `dart source points at the in-repo plugin (got "${dart.source}")`);
  const resolved = path.resolve(REPO_ROOT, dart.source);
  assert.ok(fs.existsSync(path.join(resolved, '.claude-plugin', 'plugin.json')),
    'the source resolves to the directory that contains the shipped plugin.json');
});

test('the dart plugin version (if pinned) matches the shipped plugin.json version', () => {
  const mp = readJson(MARKETPLACE_PATH);
  const pluginManifest = readJson(PLUGIN_MANIFEST_PATH);
  const dart = mp.plugins.find((p) => p && p.name === 'dart');
  if (dart.version !== undefined) {
    assert.equal(dart.version, pluginManifest.version,
      'a pinned marketplace version must agree with plugin.json so a release is consistent');
  }
});

test('namespacing parity: marketplace plugin name equals plugin.json name (so /dart:* holds)', () => {
  const mp = readJson(MARKETPLACE_PATH);
  const pluginManifest = readJson(PLUGIN_MANIFEST_PATH);
  const dart = mp.plugins.find((p) => p && p.name === 'dart');
  assert.equal(dart.name, pluginManifest.name,
    'the marketplace entry name must equal plugin.json name so commands resolve under /dart:*');
  assert.equal(dart.name, 'dart');
});

// No-secret invariant — the marketplace manifest carries env-var names only at most,
// never a literal credential. Reuses the high-confidence secret-shape patterns the rest
// of the package is scanned with.
test('no secret-shaped value in marketplace.json', () => {
  const SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/,                      // AWS access key id
    /\bsk-[A-Za-z0-9]{20,}\b/,               // OpenAI-style secret
    /xox[baprs]-[A-Za-z0-9-]{10,}/,          // Slack token
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,    // PEM private key
    /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*["'][^"'$][^"']{7,}["']/i, // key: "literal"
    /\bgh[posu]_[A-Za-z0-9]{20,}\b/,         // GitHub token
    /\bAIza[0-9A-Za-z_-]{35}\b/,             // Google API key
  ];
  const text = fs.readFileSync(MARKETPLACE_PATH, 'utf8');
  for (const pat of SECRET_PATTERNS) {
    assert.ok(!pat.test(text), `marketplace.json must not contain a secret-shaped value (${pat})`);
  }
});

test('marketplace.json is tracked by git so it survives a fresh checkout', () => {
  const { execFileSync } = require('node:child_process');
  const rel = path.relative(REPO_ROOT, MARKETPLACE_PATH);
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', rel], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(tracked, rel, 'the marketplace manifest must resolve on a clean clone');
});
