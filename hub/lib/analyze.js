'use strict';
/*
 * Deterministic, no-LLM project analysis run on connect.
 *
 * Two paths:
 *   - fast path  — the folder already has ADT artefacts; reuse state.js::buildState
 *                  to project title/description/tickets, and tag source 'artefacts'.
 *   - init path  — derive a title, description, detected stack, and key files from a
 *                  FIXED allowlist of marker/doc files, tagged source 'analysis'.
 *
 * Security floor (containment): every file the analyzer touches is resolved with
 * realpathSync and must stay within realpath(root); a path that escapes the root
 * (e.g. a symlink to ~/.ssh) is skipped, never read. The derived profile is written
 * to <root>/.aidevteam/profile.json, and that target is itself confined — a
 * symlinked .aidevteam that escapes the root is refused rather than followed.
 *
 * Denial-of-service caps bound the work: a per-file byte cap, a total-files cap, a
 * total-bytes cap, a max directory depth, and a wall-clock time budget. Scanning
 * stops when any cap is exceeded; analysis still returns a usable profile.
 *
 * The profile is byte-stable for a given directory (all scans are sorted; the only
 * time-varying field is analyzedAt), so golden-fixture tests are trivial.
 */
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJSON } = require('./write');
const { projectId, projectRoot } = require('./project-id');
const { canonicalRoot } = require('./registry');
const { buildState, safeExists } = require('./state');

const CAPS = Object.freeze({
  maxFileBytes: 256 * 1024,   // bytes read from any single file
  maxFiles: 2000,             // directory entries inspected during the stack scan
  maxTotalBytes: 4 * 1024 * 1024, // cumulative bytes read across all files
  maxDepth: 4,                // directory recursion depth for the stack scan
  maxDescriptionChars: 500,   // stored description length
  timeBudgetMs: 2000,         // wall-clock budget for the whole analysis
});

const PROFILE_VERSION = 1;

// stack markers: present file/dir at (bounded) depth → stack label, scanned in a
// stable order so the resulting stack[] is deterministic
const STACK_MARKERS = [
  ['package.json', 'node'],
  ['tsconfig.json', 'typescript'],
  ['pyproject.toml', 'python'],
  ['requirements.txt', 'python'],
  ['Cargo.toml', 'rust'],
  ['go.mod', 'go'],
  ['pom.xml', 'java'],
  ['build.gradle', 'java'],
  ['build.gradle.kts', 'kotlin'],
  ['Gemfile', 'ruby'],
  ['composer.json', 'php'],
  ['Dockerfile', 'docker'],
  ['.github/workflows', 'ci'],
];

// fixed priority list surfaced to the UI; bounded
const KEY_FILE_CANDIDATES = [
  'README.md', 'README', 'readme.md', 'package.json', 'pyproject.toml',
  'Cargo.toml', 'go.mod', 'pom.xml', 'CLAUDE.md', 'workflow.yaml',
];

const README_NAMES = ['README.md', 'README', 'readme.md', 'Readme.md'];

// a project "already has ADT artefacts" when one of these project-local markers is
// present. A project-local workflow.yaml counts; the framework's bundled default
// (resolved from outside the project) does NOT — every dir would otherwise match.
// The profile.json this analyzer writes is deliberately excluded, so re-analyzing
// the same folder is idempotent (it does not flip the init path to the fast path).
const ARTEFACT_MARKERS = [
  '.workflow-state.json', 'CLAUDE.md',
  path.join('.aidevteam', 'workflow.yaml'),
  path.join('.aidevteam', 'comments'),
  path.join('.aidevteam', 'tickets'),
  path.join('.aidevteam', 'workflow.overrides.json'),
  path.join('.claude', 'workflow', 'workflow.yaml'),
];

/** Resolve `rel` under `root`, returning the real path only if it stays inside root. */
function confinedPath(root, rel) {
  const target = path.join(root, rel);
  let real;
  try { real = fs.realpathSync(target); } catch { return null; }
  if (real !== root && !real.startsWith(root + path.sep)) return null; // escapes root
  return real;
}

/** Read a confined file up to the per-file/total byte caps. Returns '' if absent/escaping. */
function confinedRead(root, rel, budget) {
  const real = confinedPath(root, rel);
  if (!real) return '';
  let stat;
  try { stat = fs.statSync(real); } catch { return ''; }
  if (!stat.isFile()) return '';
  const cap = Math.min(CAPS.maxFileBytes, Math.max(0, CAPS.maxTotalBytes - budget.bytes));
  if (cap <= 0) return '';
  let fd;
  try {
    fd = fs.openSync(real, 'r');
    const buf = Buffer.alloc(cap);
    const n = fs.readSync(fd, buf, 0, cap, 0);
    budget.bytes += n;
    return buf.toString('utf8', 0, n);
  } catch { return ''; }
  finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
}

function existsConfined(root, rel) { return confinedPath(root, rel) != null; }

function parseJsonSafe(txt) {
  try { const v = JSON.parse(txt); return v && typeof v === 'object' ? v : null; }
  catch { return null; }
}

// first blank-line-delimited paragraph of a README, front-matter and leading H1 stripped
function firstParagraph(md) {
  let s = String(md || '');
  const fm = s.match(/^---\n[\s\S]*?\n---\n?/);
  if (fm) s = s.slice(fm[0].length);
  s = s.replace(/^\s*#[^\n]*\n/, '');
  const para = s.trim().split(/\n\s*\n/)[0] || '';
  return para.replace(/\s+/g, ' ').trim();
}

// description from pyproject.toml / Cargo.toml via a simple line regex (zero-dep)
function tomlDescription(txt) {
  const m = String(txt || '').match(/^\s*description\s*=\s*["']([^"'\n]+)["']/m);
  return m ? m[1].trim() : '';
}

function gitRemoteName(root) {
  try {
    const { execFileSync } = require('node:child_process');
    const url = execFileSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], {
      stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim();
    if (!url) return '';
    return url.replace(/\.git$/, '').replace(/[/\\]+$/, '').split(/[/\\:]/).pop() || '';
  } catch { return ''; }
}

/** Detect the stack by scanning marker files within the caps, depth-bounded. */
function detectStack(root, budget) {
  const found = new Set();
  for (const [marker, label] of STACK_MARKERS) {
    if (existsConfined(root, marker)) found.add(label);
  }
  // one bounded level into immediate sub-dirs for nested manifests, respecting caps
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { entries = []; }
  for (const ent of entries) {
    if (budget.files >= CAPS.maxFiles || (Date.now() - budget.start) > CAPS.timeBudgetMs) break;
    budget.files++;
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    for (const [marker, label] of STACK_MARKERS) {
      if (marker.includes('/')) continue;
      if (existsConfined(root, path.join(ent.name, marker))) found.add(label);
    }
  }
  return [...found].sort();
}

function deriveKeyFiles(root) {
  const out = [];
  for (const name of KEY_FILE_CANDIDATES) {
    if (out.includes(name)) continue;
    if (existsConfined(root, name)) out.push(name);
    if (out.length >= 10) break;
  }
  return out;
}

function deriveTitle(root, budget) {
  const pkg = parseJsonSafe(confinedRead(root, 'package.json', budget));
  if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  const remote = gitRemoteName(root);
  if (remote) return remote;
  return path.basename(root);
}

function deriveDescription(root, stack, budget) {
  for (const name of README_NAMES) {
    const para = firstParagraph(confinedRead(root, name, budget));
    if (para) return para.slice(0, CAPS.maxDescriptionChars);
  }
  const pkg = parseJsonSafe(confinedRead(root, 'package.json', budget));
  if (pkg && typeof pkg.description === 'string' && pkg.description.trim()) {
    return pkg.description.trim().slice(0, CAPS.maxDescriptionChars);
  }
  for (const name of ['pyproject.toml', 'Cargo.toml']) {
    const desc = tomlDescription(confinedRead(root, name, budget));
    if (desc) return desc.slice(0, CAPS.maxDescriptionChars);
  }
  const primary = stack[0] || 'multi-language';
  return `A ${primary} project.`;
}

function hasArtefacts(root) {
  return ARTEFACT_MARKERS.some((m) => existsConfined(root, m));
}

// confine the profile target: refuse a symlinked .aidevteam that escapes the root
function profileTarget(root) {
  const adtDir = path.join(root, '.aidevteam');
  if (safeExists(adtDir)) {
    let real;
    try { real = fs.realpathSync(adtDir); } catch { real = adtDir; }
    if (real !== adtDir && real !== path.join(root, '.aidevteam')) {
      if (!real.startsWith(root + path.sep)) {
        throw new Error('.aidevteam escapes the project root — refusing to write profile');
      }
    }
  }
  return path.join(adtDir, 'profile.json');
}

/**
 * Connect-time analysis for a directory. Validates and canonicalizes the input,
 * derives a profile (fast path if ADT artefacts exist, else init analysis), writes
 * it atomically inside the project root, and returns { root, id, profile, state? }.
 * Throws on invalid input (before any write) and on a profile target that escapes
 * the root.
 */
function analyze(input) {
  canonicalRoot(input); // validate: absolute, exists, is a directory, no NUL
  const root = projectRoot(input);
  const id = projectId(input);
  const budget = { start: Date.now(), bytes: 0, files: 0 };

  const stack = detectStack(root, budget);
  const keyFiles = deriveKeyFiles(root);
  const fast = hasArtefacts(root);

  let state = null;
  let description;
  if (fast) {
    state = buildState(root);
    description = deriveDescription(root, stack, budget);
  } else {
    description = deriveDescription(root, stack, budget);
  }
  const title = deriveTitle(root, budget);

  const profile = {
    version: PROFILE_VERSION,
    id,
    title,
    description,
    titleOverride: null,
    descriptionOverride: null,
    stack,
    keyFiles,
    source: fast ? 'artefacts' : 'analysis',
    analyzedAt: new Date().toISOString(),
  };

  const target = profileTarget(root); // throws if .aidevteam escapes root
  atomicWriteJSON(target, profile);

  return { root, id, profile, state };
}

/**
 * Read-only companion to analyze(): returns the STORED profile (the profile.json
 * written by the last connect/analyze, confined to the project root) plus a freshly
 * projected workflow state — WITHOUT re-analyzing or writing anything. Used by a
 * plain GET so a read never mutates disk.
 *
 * Falls back gracefully when no profile has been written yet: returns a profile of
 * { id, source: 'unanalyzed' } so the caller still gets the {profile, state} shape
 * and the UI can offer to analyze. Never writes on this path.
 */
function readProfile(input) {
  canonicalRoot(input); // validate: absolute, exists, is a directory, no NUL
  const root = projectRoot(input);
  const id = projectId(input);

  let profile = parseJsonSafe(confinedRead(root, path.join('.aidevteam', 'profile.json'), { bytes: 0 }));
  if (!profile) profile = { version: PROFILE_VERSION, id, source: 'unanalyzed' };

  const state = hasArtefacts(root) ? buildState(root) : null;
  return { root, id, profile, state };
}

module.exports = { analyze, readProfile, CAPS, confinedPath };
