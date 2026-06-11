'use strict';
/*
 * Shape and invariant tests for the DART Claude Code plugin package.
 *
 * These lock the packaging contract: a valid manifest, dart:-namespacing (the plugin
 * name that prefixes every command/skill), the bundled hooks, the bundled MCP server
 * declared with env-var NAMES only (no secret values), opt-in defaults, and the
 * no-secret-anywhere invariant across every shipped file.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLUGIN_DIR, '..');

function readJson(relFromRepo) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relFromRepo), 'utf8'));
}

/** Resolve a manifest path field (which may use ${CLAUDE_PLUGIN_ROOT}) to a repo-relative fs path. */
function resolvePluginPath(p) {
  const stripped = p.replace('${CLAUDE_PLUGIN_ROOT}', '.').replace(/^\.\//, '');
  return path.join(REPO_ROOT, stripped);
}

test('manifest exists at .claude-plugin/plugin.json and is valid JSON', () => {
  const manifest = readJson('.claude-plugin/plugin.json');
  assert.equal(typeof manifest, 'object');
});

test('manifest declares the required name field as kebab-case "dart" (the dart: namespace)', () => {
  const m = readJson('.claude-plugin/plugin.json');
  assert.equal(m.name, 'dart', 'name must be exactly "dart" so commands resolve under /dart:*');
  assert.match(m.name, /^[a-z][a-z0-9-]*$/, 'name must be kebab-case with no spaces');
});

test('manifest declares version and description metadata', () => {
  const m = readJson('.claude-plugin/plugin.json');
  assert.match(m.version, /^\d+\.\d+\.\d+/, 'semantic version');
  assert.equal(typeof m.description, 'string');
  assert.ok(m.description.length > 0);
});

test('manifest ships disabled by default — opt-in (defaultEnabled:false)', () => {
  const m = readJson('.claude-plugin/plugin.json');
  assert.equal(m.defaultEnabled, false, 'plugin must be inert until a project opts in');
});

test('manifest declares the DART skills (workflow-engine + the agent team)', () => {
  const m = readJson('.claude-plugin/plugin.json');
  const dirs = (Array.isArray(m.skills) ? m.skills : [m.skills]);
  assert.ok(dirs.length >= 1, 'skills path declared');
  for (const d of dirs) {
    const abs = resolvePluginPath(d);
    assert.ok(fs.existsSync(abs), `skills dir exists: ${d}`);
  }
  // The workflow-engine skill is the heart of the team and MUST be packaged.
  const we = path.join(REPO_ROOT, 'claude/skills/workflow-engine/SKILL.md');
  assert.ok(fs.existsSync(we), 'workflow-engine SKILL.md is bundled');
});

test('manifest declares the namespaced commands (the agent team)', () => {
  const m = readJson('.claude-plugin/plugin.json');
  const cmds = (Array.isArray(m.commands) ? m.commands : [m.commands]);
  assert.ok(cmds.length >= 1);
  for (const c of cmds) {
    assert.ok(fs.existsSync(resolvePluginPath(c)), `commands path exists: ${c}`);
  }
});

test('manifest references a hooks config that declares SessionStart + PreCompact', () => {
  const m = readJson('.claude-plugin/plugin.json');
  assert.ok(m.hooks, 'hooks declared');
  const hooksAbs = resolvePluginPath(m.hooks);
  assert.ok(fs.existsSync(hooksAbs), 'hooks.json exists');
  const hooks = JSON.parse(fs.readFileSync(hooksAbs, 'utf8')).hooks;
  assert.ok(hooks.SessionStart, 'SessionStart hook present (digest/directive surfacing)');
  assert.ok(hooks.PreCompact, 'PreCompact hook present (context save)');
});

test('hooks commands reference the bundled hook scripts via ${CLAUDE_PLUGIN_ROOT}', () => {
  const m = readJson('.claude-plugin/plugin.json');
  const hooks = JSON.parse(fs.readFileSync(resolvePluginPath(m.hooks), 'utf8')).hooks;
  const allCmds = [];
  for (const ev of Object.values(hooks)) {
    for (const matcher of ev) {
      for (const h of matcher.hooks) {
        allCmds.push([h.command, ...(h.args || [])].join(' '));
      }
    }
  }
  const joined = allCmds.join('\n');
  assert.match(joined, /\$\{CLAUDE_PLUGIN_ROOT\}/, 'hook scripts resolved against the plugin root, never an absolute machine path');
  assert.match(joined, /restore-context\.ts/, 'SessionStart runs the restore-context hook');
  assert.match(joined, /save-context\.ts/, 'PreCompact runs the save-context hook');
});

test('manifest references an MCP config that declares the dart-mcp server', () => {
  const m = readJson('.claude-plugin/plugin.json');
  assert.ok(m.mcpServers, 'mcpServers declared');
  const mcpAbs = resolvePluginPath(m.mcpServers);
  assert.ok(fs.existsSync(mcpAbs), '.mcp.json exists');
  const servers = JSON.parse(fs.readFileSync(mcpAbs, 'utf8')).mcpServers;
  assert.ok(servers.dart, 'a "dart" MCP server entry exists');
  const dart = servers.dart;
  assert.equal(dart.command, 'node', 'spawned via node (stdio child process)');
  const argline = (dart.args || []).join(' ');
  assert.match(argline, /dart-mcp\/src\/server\.js/, 'points at the ADT-237 stdio server');
  assert.match(argline, /\$\{CLAUDE_PLUGIN_ROOT\}/, 'server path resolved against the plugin root');
});

test('MCP env passes env-var NAMES only — no secret VALUES baked in', () => {
  const m = readJson('.claude-plugin/plugin.json');
  const dart = JSON.parse(fs.readFileSync(resolvePluginPath(m.mcpServers), 'utf8')).mcpServers.dart;
  const env = dart.env || {};
  for (const [key, val] of Object.entries(env)) {
    // Either a bare passthrough ("VOYAGE_API_KEY":"${VOYAGE_API_KEY}") or a
    // ${CLAUDE_PLUGIN_ROOT}-derived path — never a literal credential value.
    assert.match(
      String(val),
      /^\$\{[A-Z0-9_]+\}$|\$\{CLAUDE_PLUGIN_ROOT\}/,
      `env ${key} must be a ${'${VAR}'} passthrough or a plugin-root path, not a literal value`,
    );
  }
});

test('the shipped MCP config is tracked by git so it survives a fresh checkout', () => {
  const m = readJson('.claude-plugin/plugin.json');
  const mcpAbs = resolvePluginPath(m.mcpServers);
  const relFromRepo = path.relative(REPO_ROOT, mcpAbs);
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', relFromRepo], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(tracked, relFromRepo, 'the manifest reference must resolve on a clean clone');
});

test('the MCP server binds to the project at spawn (bound-project arg), never a client path', () => {
  const m = readJson('.claude-plugin/plugin.json');
  const dart = JSON.parse(fs.readFileSync(resolvePluginPath(m.mcpServers), 'utf8')).mcpServers.dart;
  const argline = (dart.args || []).join(' ');
  assert.match(argline, /\$\{CLAUDE_PROJECT_DIR\}/, 'bound to the launching project dir at spawn');
});

// --- No-secret-anywhere invariant (C239-4 / N239-4) ---------------------------------

/** Files actually shipped by the plugin: the manifest, hooks, mcp, and the README. */
function shippedFiles() {
  const dir = PLUGIN_DIR;
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (name === 'test' || name === 'node_modules') continue;
    if (fs.statSync(abs).isDirectory()) {
      for (const f of fs.readdirSync(abs)) out.push(path.join(abs, f));
    } else {
      out.push(abs);
    }
  }
  return out;
}

test('no secret-shaped value in any shipped plugin file (grep invariant)', () => {
  // Label-anchored credential patterns + long high-entropy base64-ish tokens.
  const SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/,                      // AWS access key id
    /sk-[A-Za-z0-9]{20,}/,                   // OpenAI-style secret
    /xox[baprs]-[A-Za-z0-9-]{10,}/,          // Slack token
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,    // PEM private key
    /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*["'][^"'$][^"']{7,}["']/i, // key: "literal"
    /\bgh[posu]_[A-Za-z0-9]{20,}\b/,         // GitHub token
  ];
  for (const file of shippedFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pat of SECRET_PATTERNS) {
      assert.ok(!pat.test(text), `shipped file ${path.basename(file)} must not contain a secret-shaped value (${pat})`);
    }
  }
});

test('the env declared in .mcp.json names only known passthrough vars, never values', () => {
  const m = readJson('.claude-plugin/plugin.json');
  const text = fs.readFileSync(resolvePluginPath(m.mcpServers), 'utf8');
  // Every occurrence of a known secret env name must appear ONLY as a ${NAME} reference.
  for (const name of ['VOYAGE_API_KEY', 'GEMINI_API_KEY', 'QDRANT_API_KEY']) {
    const re = new RegExp(`"[^"]*"\\s*:\\s*"([^"]*${name}[^"]*)"`, 'g');
    let mt;
    while ((mt = re.exec(text)) !== null) {
      assert.match(mt[1], new RegExp(`\\$\\{${name}\\}`), `${name} must be a ${'${NAME}'} passthrough`);
    }
  }
});

test('a README documents opt-in, what the plugin adds, and the enterprise force-disable note', () => {
  const readme = path.join(PLUGIN_DIR, 'README.md');
  assert.ok(fs.existsSync(readme), 'plugin README present');
  const text = fs.readFileSync(readme, 'utf8').toLowerCase();
  assert.match(text, /opt-in|opt in|enable/, 'documents opt-in');
  assert.match(text, /dart:/, 'documents the dart: namespace');
  assert.match(text, /force-disable|force disable|managed|enterprise/, 'documents the enterprise force-disable interaction');
  assert.match(text, /re-enable|self-re-enable|cannot re-enable/, 'states no self-re-enable');
});
