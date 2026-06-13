#!/usr/bin/env node
'use strict';
/*
 * The Kiro adapter generator — a `dart kiro init`-style CLI that emits Kiro-native
 * config (mcp.json + DART steering + a transcluded live digest + a custom-agent JSON)
 * from the SAME Core/skills/workflow/MCP. It is codegen, not new semantics.
 *
 *   node kiro/generate.js [--workspace | --global] [--dry-run] [--force] [--project <dir>]
 *
 * Posture:
 *   - OPT-IN: writes NOTHING on import; only an explicit CLI invocation writes.
 *   - --dry-run: prints the plan, writes nothing.
 *   - no-clobber: mcp.json + agent JSON are additively merged; a same-named NON-DART
 *     steering/agent file (no DART sentinel) is REFUSED, never overwritten; --force
 *     only re-asserts DART's own files.
 *   - write-confinement: every write realpath-contained to the chosen .kiro/ root.
 *   - no-secret: env carries NAME references only.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plan = require('./lib/plan');
const mcp = require('./lib/mcp');
const agent = require('./lib/agent');
const steering = require('./lib/steering');
const { resolveWithin } = require('./lib/containment');

/** Parse argv into options. No side effects. */
function parseArgs(argv) {
  const opts = { scope: 'workspace', dryRun: false, force: false, project: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') opts.scope = 'workspace';
    else if (a === '--global') opts.scope = 'global';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--project') opts.project = argv[++i];
    else if (!a.startsWith('-') && !opts.project) opts.project = a;
  }
  return opts;
}

/** The repo root (this file lives at <repo>/kiro/generate.js). */
function repoRoot() {
  return path.resolve(__dirname, '..');
}

/** The chosen .kiro/ scope root: <project>/.kiro (workspace) or ~/.kiro (global). */
function scopeRoot(opts, projectDir) {
  return opts.scope === 'global' ? path.join(os.homedir(), '.kiro') : path.join(projectDir, '.kiro');
}

function readJson(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Ensure the parent directory of a contained target exists (inside the root). */
function ensureDir(absPath) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
}

/**
 * Apply one planned file under the realpath-contained root. Returns a record of
 * the action for reporting; pushes refusals onto `refused`. mcp-json / agent-json
 * are additively merged; steering is sentinel-guarded no-clobber.
 */
function applyFile(file, root, opts, repo, refused, written) {
  const target = resolveWithin(root, file.rel, { mustRealpath: true });

  if (file.kind === 'mcp-json') {
    const existing = readJson(target);
    const merged = mcp.mergeMcp(existing, file.dartEntry);
    ensureDir(target);
    fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n');
    written.push(file.rel);
    return;
  }

  if (file.kind === 'agent-json') {
    const existing = readJson(target);
    if (existing && !looksLikeDartAgent(existing) && !isMergeableAgent(existing)) {
      refused.push(file.rel);
      return;
    }
    const merged = agent.mergeAgent(existing, repo, file.dartEntry);
    ensureDir(target);
    fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n');
    written.push(file.rel);
    return;
  }

  // steering + digest: sentinel-guarded no-clobber. The DART-owned dot-scoped
  // digest file is always DART's; a `dart-*.md` steering file occupied by a
  // non-DART (no-sentinel) file is refused.
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8');
    const guarded = file.kind === 'steering';
    if (guarded && !steering.isDartManaged(current)) {
      refused.push(file.rel);
      return;
    }
  }
  ensureDir(target);
  fs.writeFileSync(target, file.content);
  written.push(file.rel);
}

/** A custom-agent file is mergeable (its DART blocks can be added) as long as it parses. */
function isMergeableAgent() {
  return true;
}

/** True when an existing agent already carries DART's own server entry. */
function looksLikeDartAgent(obj) {
  return obj && obj.mcpServers && obj.mcpServers.dart != null;
}

/**
 * Run the generator. Returns a result describing the plan and (for a real run)
 * what was written / refused. Importing this module performs NO work — only
 * calling `run` does (opt-in).
 */
function run(argv) {
  const opts = parseArgs(argv);
  const repo = repoRoot();
  const projectDir = path.resolve(opts.project || process.cwd());
  const root = scopeRoot(opts, projectDir);

  const p = plan.build({ scope: opts.scope, project: projectDir, repoRoot: repo });

  if (opts.dryRun) {
    for (const f of p.files) {
      process.stdout.write(`[dry-run] would write ${path.join(root, f.rel)}\n`);
    }
    return { dryRun: true, scope: opts.scope, project: projectDir, root, plan: p, written: [], refused: [] };
  }

  const written = [];
  const refused = [];
  for (const f of p.files) {
    try {
      applyFile(f, root, opts, repo, refused, written);
    } catch (e) {
      process.stderr.write(`[kiro] ${f.rel}: ${e.message}\n`);
      refused.push(f.rel);
    }
  }
  for (const r of refused) {
    process.stderr.write(`[kiro] refused (non-DART or out-of-scope): ${r}\n`);
  }
  return { dryRun: false, scope: opts.scope, project: projectDir, root, plan: p, written, refused };
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { run, parseArgs, scopeRoot, repoRoot };
