'use strict';
/*
 * Install-docs parity contract for the DART Claude Code plugin.
 *
 * The README's "Install & enable" section is the published install path. These tests lock
 * it to the manifests so the documented commands stay literally reproducible: the plugin
 * and marketplace names it names must equal plugin.json / marketplace.json, the canonical
 * two-command flow and the no-npx caveat must be present, the optional overlay env vars
 * must be documented by name, and — like the rest of the package — the docs must carry no
 * secret-shaped value.
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

const README_PATH = path.join(PLUGIN_DIR, 'README.md');
const MARKETPLACE_PATH = path.join(PLUGIN_DIR, 'marketplace.json');
const PLUGIN_MANIFEST_PATH = path.join(PLUGIN_DIR, 'plugin.json');

const readme = fs.readFileSync(README_PATH, 'utf8');
const marketplace = readJson(MARKETPLACE_PATH);
const pluginManifest = readJson(PLUGIN_MANIFEST_PATH);

test('install docs name the real plugin and marketplace via the install selector', () => {
  // plugin@marketplace selector: both halves are "dart" here, and the docs must spell it
  // exactly as the CLI install argument so a copy-paste install actually resolves.
  const selector = `${pluginManifest.name}@${marketplace.name}`;
  assert.equal(selector, 'dart@dart', 'manifests agree on the dart@dart selector');
  assert.ok(
    readme.includes(`claude plugin install ${selector}`),
    `README must document "claude plugin install ${selector}"`,
  );
});

test('install docs reference the marketplace plugin entry name (namespacing parity)', () => {
  const dart = marketplace.plugins.find((p) => p && p.name === 'dart');
  assert.ok(dart, 'marketplace lists a dart plugin entry');
  assert.equal(dart.name, pluginManifest.name, 'marketplace entry name equals plugin.json name');
  // The dart: command namespace derives from the plugin name; the docs must show it.
  assert.ok(
    new RegExp(`/${pluginManifest.name}:`).test(readme),
    `README must show the /${pluginManifest.name}: command namespace`,
  );
});

test('install docs document the canonical two-command public-git flow', () => {
  assert.ok(
    /claude plugin marketplace add\s+olehsvyrydov\/AI-development-team/.test(readme),
    'README must document the canonical owner/repo marketplace add',
  );
  assert.ok(
    /default branch/i.test(readme),
    'README must state the canonical form targets the default branch (post-merge)',
  );
});

test('install docs document the current pre-main branch-ref install form', () => {
  // Either accepted branch-ref form must appear: the git-URL #ref or the owner/repo@ref shorthand.
  const gitUrlRef = /github\.com\/olehsvyrydov\/AI-development-team\.git#feat\/dart-interactive/;
  const shorthandRef = /olehsvyrydov\/AI-development-team@feat\/dart-interactive/;
  assert.ok(
    gitUrlRef.test(readme) || shorthandRef.test(readme),
    'README must document a verified branch-ref marketplace add for the pre-main install',
  );
});

test('install docs state there is no npx / one-liner install path', () => {
  assert.ok(/no\b[^.]*\bnpx/i.test(readme), 'README must state there is no npx install path');
  // npm is only ever a marketplace SOURCE, never a plugin install one-liner. The docs must
  // not present a non-existent "npm install dart" / "npx dart" install command *as a
  // command* — i.e. inside a fenced code block, where a reader copy-pastes it. The prose
  // caveat that names these to deny them is expected and must NOT trip this check.
  const codeBlocks = readme.match(/```[\s\S]*?```/g) || [];
  for (const block of codeBlocks) {
    assert.ok(
      !/npm\s+install\s+dart\b/i.test(block) && !/npx\s+dart\b/i.test(block),
      'README code blocks must not present a non-existent npm/npx plugin install one-liner',
    );
  }
});

test('install docs document the optional overlay env vars by name only', () => {
  const envVars = [
    'VOYAGE_API_KEY',
    'GEMINI_API_KEY',
    'QDRANT_URL',
    'OPENMEMORY_BASE_URL',
    'OPENMEMORY_API_KEY',
    'MEM0_API_KEY',
  ];
  for (const name of envVars) {
    assert.ok(readme.includes(name), `README must name the optional env var ${name}`);
  }
});

test('install docs document enable (opt-in) and disable/uninstall', () => {
  assert.ok(/enabledPlugins/.test(readme), 'README must document the enabledPlugins opt-in');
  assert.ok(/claude plugin disable dart@dart/.test(readme), 'README must document disable');
  assert.ok(/claude plugin uninstall dart@dart/.test(readme), 'README must document uninstall');
});

// No-secret invariant — the docs carry env-var NAMES at most, never a literal credential.
// Reuses the high-confidence secret-shape patterns the rest of the package is scanned with.
test('no secret-shaped value in the install docs', () => {
  const SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/,                      // AWS access key id
    /\bsk-[A-Za-z0-9]{20,}\b/,               // OpenAI-style secret
    /xox[baprs]-[A-Za-z0-9-]{10,}/,          // Slack token
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,    // PEM private key
    /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*["'][^"'$][^"']{7,}["']/i, // key: "literal"
    /\bgh[posu]_[A-Za-z0-9]{20,}\b/,         // GitHub token
    /\bAIza[0-9A-Za-z_-]{35}\b/,             // Google API key
  ];
  for (const pat of SECRET_PATTERNS) {
    assert.ok(!pat.test(readme), `README must not contain a secret-shaped value (${pat})`);
  }
});

test('install docs are tracked by git so they survive a fresh checkout', () => {
  const { execFileSync } = require('node:child_process');
  const rel = path.relative(REPO_ROOT, README_PATH);
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', rel], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(tracked, rel, 'the install README must resolve on a clean clone');
});
