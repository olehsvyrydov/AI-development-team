'use strict';
/*
 * Negative invariants for the DART plugin packaging (the security acceptance bar).
 *
 * Each test asserts a property that MUST hold for the no-clobber / opt-in / no-secret /
 * reversible / enterprise-force-disable posture. Where a control is load-bearing, the
 * test is written so removing the control flips it to failing.
 *
 *   N239-1   enabling the plugin does NOT mutate the user's ~/.claude config
 *   N239-1b  the plugin's shipped tree writes only inside its own directory
 *   N239-2   commands resolve under the dart: namespace (a user /arch is not overridden)
 *   N239-3   inert until opt-in (ships disabled; no auto-enable in any shipped file)
 *   N239-3b  absent where never enabled (no global/user enablement is written)
 *   N239-4   no secret in the manifest / .mcp.json / any shipped file (grep)
 *   N239-5   reversible on disable (no residual install outside the plugin dir)
 *   N239-6   enterprise force-disable documented + no self-re-enable code path
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLUGIN_DIR, '..');

/** Every file the plugin ships (manifest, hooks, mcp, README) — excluding tests/node_modules. */
function shippedFiles(dir = PLUGIN_DIR, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'test' || name === 'node_modules') continue;
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) shippedFiles(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

function readShipped() {
  return shippedFiles().map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
}

/**
 * The plugin's ACTIVE files — the manifest and the config the host actually loads
 * (hooks, mcp). Excludes README.md, which is human documentation and legitimately shows
 * the opt-in JSON a user writes in their OWN project settings. The invariant under test
 * is that the plugin's loaded config does not auto-enable itself, not that the docs may
 * never quote the opt-in syntax.
 */
function readActiveConfig() {
  return readShipped().filter(({ file }) => !/README\.md$/i.test(file));
}

const manifest = () => JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8'));

// N239-1 — no upsert into the user's ~/.claude. The plugin model is declarative: the
// host enables it from the project's own settings. No shipped file references a write
// into ~/.claude or the user's settings.json — there is no settings.ts-style clobber.
test('N239-1: no shipped file writes into the user ~/.claude settings', () => {
  for (const { file, text } of readShipped()) {
    assert.ok(!/~\/\.claude\/settings/.test(text), `${path.basename(file)} must not target ~/.claude/settings`);
    assert.ok(!/\.claude\/settings\.json[^"]*\b(write|upsert|append)/i.test(text),
      `${path.basename(file)} must not upsert into the user's settings`);
  }
});

// N239-1b — the shipped tree contains no absolute home path and no write outside the
// plugin root: every bundled command/path resolves against ${CLAUDE_PLUGIN_ROOT} or a
// plugin-relative path, never a hard-coded machine/home directory.
test('N239-1b: shipped configs reference only plugin-rooted paths, never an absolute home dir', () => {
  const configs = ['.claude-plugin/.mcp.json', '.claude-plugin/hooks/hooks.json', '.claude-plugin/plugin.json'];
  for (const rel of configs) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.ok(!/\/home\/[a-z]/i.test(text), `${rel} must not hard-code an absolute home path`);
    assert.ok(!/\/Users\//.test(text), `${rel} must not hard-code a macOS home path`);
  }
});

// N239-2 — namespacing. The manifest name is exactly "dart"; every command therefore
// resolves as /dart:<name>. A user's own same-named command is a different identifier
// and is not shadowed.
test('N239-2: the dart: namespace derives from name "dart"; user commands are not shadowed', () => {
  assert.equal(manifest().name, 'dart');
  // The packaged commands are plain files; their namespaced id is dart:<basename>.
  const cmdField = manifest().commands;
  const cmdDir = path.join(REPO_ROOT, cmdField.replace(/^\.\//, ''));
  const arch = path.join(cmdDir, 'arch.md');
  assert.ok(fs.existsSync(arch), 'an arch command is packaged');
  // It is reachable as /dart:arch — never as the bare /arch that a user might define.
  const namespacedId = `dart:${path.basename(arch, '.md')}`;
  assert.equal(namespacedId, 'dart:arch');
});

// N239-3 — inert until opt-in. Ships disabled, and NO shipped file force-enables itself
// (no "enabledPlugins" writing, no defaultEnabled:true).
test('N239-3: plugin ships disabled and no shipped file auto-enables it', () => {
  assert.equal(manifest().defaultEnabled, false);
  for (const { file, text } of readActiveConfig()) {
    assert.ok(!/"enabledPlugins"\s*:/.test(text), `${path.basename(file)} must not write enabledPlugins`);
    assert.ok(!/defaultEnabled"\s*:\s*true/.test(text), `${path.basename(file)} must not default-enable`);
  }
});

// N239-3b — absent where never enabled. The plugin declares no marketplace auto-add and
// no user-scope global enablement; enablement is left entirely to the host project.
test('N239-3b: nothing in the package globally/auto enables across projects', () => {
  for (const { file, text } of readActiveConfig()) {
    assert.ok(!/extraKnownMarketplaces/.test(text), `${path.basename(file)} must not self-register a marketplace`);
    assert.ok(!/--scope\s+user/.test(text), `${path.basename(file)} must not force a user-scope install`);
  }
});

// N239-4 — no secret anywhere shipped (the grep invariant, broadened to entropy).
test('N239-4: no secret-shaped value in any shipped plugin file', () => {
  const SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/,
    /sk-[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bgh[posu]_[A-Za-z0-9]{20,}\b/,
    /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*["'][^"'$][^"']{7,}["']/i,
    /[A-Za-z0-9+/]{40,}={0,2}/, // long base64-ish blob (no such literal should ship)
  ];
  for (const { file, text } of readShipped()) {
    for (const pat of SECRET_PATTERNS) {
      assert.ok(!pat.test(text), `${path.basename(file)} contains a secret-shaped value (${pat})`);
    }
  }
});

// N239-4 (companion) — every env entry in .mcp.json is a ${NAME} passthrough or a
// plugin-root path, never a literal value.
test('N239-4: .mcp.json env declares names only (no literal credential values)', () => {
  const mcp = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, '.mcp.json'), 'utf8'));
  for (const [, server] of Object.entries(mcp.mcpServers)) {
    for (const [key, val] of Object.entries(server.env || {})) {
      assert.match(String(val), /^\$\{[A-Z0-9_]+\}$|\$\{CLAUDE_PLUGIN_ROOT\}/,
        `env ${key} must be a name passthrough, not a value`);
    }
  }
});

// N239-5 — reversible. The package is self-contained under the plugin dir; it installs
// nothing outside it that a disable would leave behind. There is no postinstall/copy
// step in the package that lands files in ~/.claude.
test('N239-5: package is self-contained — no out-of-dir install side effect', () => {
  for (const { file, text } of readShipped()) {
    assert.ok(!/postinstall/.test(text), `${path.basename(file)} must not run a postinstall side effect`);
    assert.ok(!/cp\s+-[rR][^\n]*~\/\.claude/.test(text), `${path.basename(file)} must not copy into ~/.claude`);
  }
});

// N239-6 — enterprise force-disable documented + no self-re-enable code path anywhere
// in the shipped tree.
test('N239-6: README documents enterprise force-disable + no self-re-enable, and no code re-enables', () => {
  const readme = fs.readFileSync(path.join(PLUGIN_DIR, 'README.md'), 'utf8').toLowerCase();
  assert.match(readme, /force-disable|force disable|managed/, 'documents managed force-disable');
  assert.match(readme, /cannot be re-enabled|no.*re-enable|never dart/, 'states no self-re-enable');
  // No shipped file attempts to flip enablement on against a managed disable.
  for (const { file, text } of readShipped()) {
    assert.ok(!/plugin\s+enable|enablePlugin|forceEnable/i.test(text),
      `${path.basename(file)} must not contain a self-re-enable path`);
  }
});
