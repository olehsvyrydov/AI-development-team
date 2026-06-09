'use strict';
/*
 * Knowledge scope/tag model — the single source of truth for two things both the
 * hub projection AND the memory recall path must agree on:
 *
 *   1. parseFrontMatter(text)  — a bounded, never-throwing reader of a leading
 *      `---\n…\n---` YAML-ish front-matter block. It recognizes ONLY the schema
 *      keys, applies closed vocabularies, drops prototype-polluting keys, accepts
 *      only scalars / short flat lists of scalars, is size-bounded, and on any
 *      malformed/oversize/hostile input degrades to all-defaults. It never throws.
 *
 *   2. scopeMatches(doc, project) — the visibility/recall predicate: a project
 *      sees its own project-scoped notes plus approved common notes whose stack is
 *      "any" or intersects the project's declared stack. Re-implemented byte-for-
 *      byte on the memory side and locked with a parity test, so a note shown in
 *      the panel can never be invisible to recall (or vice-versa).
 *
 * Zero dependencies beyond node + the analyzer's stack detector; pure reads.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCOPES = new Set(['project', 'common']);
const KINDS = new Set(['pattern', 'style', 'rule', 'context']);
const STATUSES = new Set(['approved-project', 'approved-common', 'pending', 'rejected']);

// Closed stack vocabulary: the analyzer's detectable stack labels ∪ the "any"
// wildcard. A token outside this set is dropped on read (a hand-edited file stays
// readable) and never used to build a path.
const STACK_VOCAB = new Set([
  'any', 'node', 'typescript', 'python', 'rust', 'go', 'java', 'kotlin', 'ruby', 'php', 'docker', 'ci',
]);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_FRONT_MATTER_BYTES = 8 * 1024;
const MAX_STACK_TOKENS = 16;
const MAX_BY_LEN = 64;

const DEFAULTS = Object.freeze({
  scope: 'project',
  stack: Object.freeze(['any']),
  kind: 'context',
  status: 'approved-project',
  created: null,
  by: 'user',
});

function defaults() {
  return { scope: DEFAULTS.scope, stack: ['any'], kind: DEFAULTS.kind, status: DEFAULTS.status, created: null, by: DEFAULTS.by };
}

// Normalize a single stack token against the closed vocabulary; null if unknown.
function normStackToken(tok) {
  if (typeof tok !== 'string') return null;
  const t = tok.toLowerCase().trim();
  return STACK_VOCAB.has(t) ? t : null;
}

// Coerce a parsed stack value (scalar or flat list of scalars) to a deduped list
// of known tokens; an empty/unknown/oversize/nested result falls back to ["any"].
function normStackList(raw) {
  let items;
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string' || typeof raw === 'number') items = [raw];
  else return ['any'];
  const out = [];
  for (const it of items) {
    if (out.length >= MAX_STACK_TOKENS) break;
    const tok = normStackToken(typeof it === 'number' ? String(it) : it);
    if (tok && !out.includes(tok)) out.push(tok);
  }
  return out.length ? out : ['any'];
}

// Parse one scalar line value: `key: value` or `key: [a, b, c]`. Returns a string
// or a flat array of strings; a value that looks like a nested mapping (empty after
// the colon, with indented children) is reported as undefined so the caller keeps
// the default. Never executes anything.
function parseScalarValue(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (s === '') return undefined; // a bare `key:` opens a nested block → reject
  // strip a trailing inline comment that is clearly a comment (not inside quotes)
  if (s[0] === '[') {
    const close = s.lastIndexOf(']');
    if (close < 0) return undefined;
    const inner = s.slice(1, close).trim();
    if (inner === '') return [];
    return inner.split(',').map((t) => unquote(t.trim())).filter((t) => t.length > 0);
  }
  return unquote(s);
}

function unquote(s) {
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Parse a markdown document's leading front-matter into scope/stack/kind/status.
 *
 * @param text the raw document text (any type tolerated)
 * @returns `{ scope, stack:[…], kind, status, created, by }` — always a well-formed
 *          object with safe defaults; never throws on malformed/hostile input.
 */
function parseFrontMatter(text) {
  const out = defaults();
  try {
    if (typeof text !== 'string') return out;
    const m = text.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return out;
    const block = m[1];
    // size bound: an oversize block is treated as hostile → all defaults
    if (Buffer.byteLength(block, 'utf8') > MAX_FRONT_MATTER_BYTES) return out;

    const lines = block.split('\n');
    const seen = {};
    for (const line of lines) {
      // only top-level `key: value` lines (no leading indent → no nested mappings)
      const lm = line.match(/^([A-Za-z_][A-Za-z0-9_]*):(.*)$/);
      if (!lm) continue;
      const key = lm[1];
      if (FORBIDDEN_KEYS.has(key)) continue; // never assign a prototype-shadowing key
      const value = parseScalarValue(lm[2]);
      if (value === undefined) continue;
      seen[key] = value;
    }

    if (typeof seen.scope === 'string') {
      const sc = seen.scope.toLowerCase().trim();
      if (sc === 'global') out.scope = 'common';
      else if (SCOPES.has(sc)) out.scope = sc;
      // anything else stays the default 'project' (narrowest)
    }
    if (seen.stack !== undefined) out.stack = normStackList(seen.stack);
    if (typeof seen.kind === 'string') {
      const kd = seen.kind.toLowerCase().trim();
      if (KINDS.has(kd)) out.kind = kd;
    }
    if (typeof seen.status === 'string') {
      const stt = seen.status.toLowerCase().trim();
      if (STATUSES.has(stt)) out.status = stt;
    }
    if (typeof seen.created === 'string' && seen.created.trim()) out.created = seen.created.trim();
    if (typeof seen.by === 'string') {
      const by = seen.by.replace(/[\x00-\x1f]/g, '').slice(0, MAX_BY_LEN);
      if (by) out.by = by;
    }
  } catch {
    return defaults(); // never throw — degrade to all defaults
  }
  return out;
}

/**
 * The visibility/recall predicate. A doc is visible/recallable to a project when:
 *   - it is THIS project's own project-scoped note (doc.ownProject true), OR
 *   - it is a common note with status approved-common whose stack is "any" or
 *     intersects the project's declared stack.
 *
 * @param doc `{ scope, status, stack:[…], ownProject? }`
 * @param project `{ stack:[…] }` the project's declared stack
 * @returns true when the project may see/recall the doc
 */
function scopeMatches(doc, project) {
  if (!doc || typeof doc !== 'object') return false;
  const projectStackList = (project && Array.isArray(project.stack) && project.stack.length) ? project.stack : ['any'];
  if (doc.scope === 'project') {
    return doc.ownProject === true;
  }
  if (doc.scope === 'common') {
    if (doc.status !== 'approved-common') return false;
    const docStack = Array.isArray(doc.stack) && doc.stack.length ? doc.stack : ['any'];
    if (docStack.includes('any')) return true;
    return docStack.some((t) => projectStackList.includes(t));
  }
  return false;
}

// Read the project's declared stack: manual `knowledge.stack` in the project-local
// config wins; else the analyzer's detectStack; else ["any"]. Tokens are normalized
// against the closed vocabulary and never used to build a path. Never throws.
function projectStack(projectDir) {
  try {
    const cfgPath = path.join(projectDir, '.aidevteam', 'config.json');
    if (fs.existsSync(cfgPath)) {
      let cfg = null;
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = null; }
      const know = cfg && typeof cfg === 'object' ? cfg.knowledge : null;
      // A manual declaration that names at least one KNOWN stack token wins over
      // auto-detect; an all-unknown manual list falls through to auto-detect rather
      // than pinning the project to a degraded ["any"].
      if (know && typeof know === 'object' && know.stack !== undefined && hasKnown(know.stack)) {
        return normStackList(know.stack);
      }
    }
  } catch { /* fall through to auto-detect */ }
  const auto = detectStackBounded(projectDir);
  return auto.length ? auto : ['any'];
}

// Was there at least one KNOWN token in the manual declaration? (so we can tell an
// explicit ["any"] from an all-unknown list that degraded to ["any"]).
function hasKnown(raw) {
  let items;
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string' || typeof raw === 'number') items = [raw];
  else return false;
  return items.some((it) => normStackToken(typeof it === 'number' ? String(it) : it));
}

// A bounded, never-throwing stack detection that mirrors the analyzer's marker set,
// so the projection can declare a project's stack without writing a profile.
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
];
function detectStackBounded(root) {
  const found = new Set();
  for (const [marker, label] of STACK_MARKERS) {
    try { if (fs.existsSync(path.join(root, marker))) found.add(label); } catch { /* skip */ }
  }
  return [...found].sort();
}

// Resolve the user-global common-vault root. Default `~/.aidevteam/kb-common/`;
// an optional `knowledge.commonVaultDir` in `~/.aidevteam/config.json` may override
// it, but the override must be an absolute path with no NUL. The path is NOT realpath'd
// here (creation + realpath containment happen in the writer); this returns the intended
// root or null when the override is unusable (caller falls back to the default).
function commonVaultRoot() {
  const home = aidevteamHome();
  const def = path.join(home, 'kb-common');
  try {
    const cfgPath = path.join(home, 'config.json');
    if (fs.existsSync(cfgPath)) {
      let cfg = null;
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = null; }
      const know = cfg && typeof cfg === 'object' ? cfg.knowledge : null;
      const override = know && typeof know === 'object' ? know.commonVaultDir : null;
      if (typeof override === 'string' && override) {
        if (override.includes('\0')) return def; // NUL → ignore, use default
        if (!path.isAbsolute(override)) return def; // relative → ignore, use default
        return override;
      }
    }
  } catch { /* use default */ }
  return def;
}

function aidevteamHome() {
  return path.join(os.homedir(), '.aidevteam');
}

// Server-side normalizers for a scoped add: a client-supplied stack/kind is coerced
// to the closed vocabulary exactly as the reader would, so the emitted front-matter
// and the parsed-on-read front-matter agree by construction.
function normalizeStack(raw) {
  if (raw === undefined || raw === null) return ['any'];
  return normStackList(raw);
}
function normalizeKind(raw) {
  if (typeof raw !== 'string') return 'context';
  const k = raw.toLowerCase().trim();
  return KINDS.has(k) ? k : 'context';
}

module.exports = {
  parseFrontMatter,
  scopeMatches,
  projectStack,
  commonVaultRoot,
  aidevteamHome,
  normalizeStack,
  normalizeKind,
  STACK_VOCAB,
  SCOPES,
  KINDS,
  STATUSES,
  FORBIDDEN_KEYS,
  DEFAULTS,
};
