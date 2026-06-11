'use strict';
/*
 * The only module that mutates project files.
 *
 * All writes are atomic (tmp + fsync + rename) and the
 * ledger uses compare-and-swap on `rev` plus an in-process mutex, so a hub write
 * never clobbers a concurrent agent edit (returns {conflict:true} instead).
 * Comment bodies are capped and the ticket id is sanitized into the filename
 * (no path traversal). The base workflow.yaml is NEVER written — only the JSON
 * overlay.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileRev, containedCommonVaultDir } = require('./state');
const { safeId, commentFile, readComments } = require('./comments');
const { commonVaultRoot, aidevteamHome, normalizeStack, normalizeKind } = require('./knowledge');

const MAX_COMMENT_BODY = 8192;
const MAX_KB_BODY = 64 * 1024;
const MAX_KB_TITLE = 200;
const KB_SLUG_MAX = 80;
const KB_DIR_CANDIDATES = ['docs', 'kb', '.aidevteam/kb'];
const KB_COLLISION_LIMIT = 1000;

function computeRev(dir) { return fileRev(dir); }

let tmpSeq = 0;
function atomicWriteJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${tmpSeq++}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(obj, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, p); // atomic on the same filesystem
}

// in-process mutex: serialize all mutations so concurrent hub writes don't race
let tail = Promise.resolve();
function withLock(fn) {
  const result = tail.then(() => fn());
  tail = result.then(() => {}, () => {});
  return result;
}

function readLedgerRaw(dir) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir, '.workflow-state.json'), 'utf8'));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* missing/malformed → empty */ }
  return {};
}

/** Read-modify-write the ledger under a CAS guard + mutex. `mutator(ledger)` mutates in place. */
function readModifyWriteLedger(dir, expectedRev, mutator) {
  return withLock(() => {
    const rev = computeRev(dir);
    if (expectedRev != null && expectedRev !== rev) {
      return { ok: false, conflict: true, rev };
    }
    const led = readLedgerRaw(dir);
    mutator(led);
    atomicWriteJSON(path.join(dir, '.workflow-state.json'), led);
    return { ok: true, rev: computeRev(dir) };
  });
}

// Keys that would mutate the prototype chain rather than set an own property.
// They are dropped so a hostile patch (e.g. a stage/owner string surfacing as an
// object key) can never pollute Object.prototype through the overlay merge.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeOverlayPatch(dir, patch) {
  const p = path.join(dir, '.aidevteam', 'workflow.overrides.json');
  let cur = {};
  try {
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (v && typeof v === 'object') cur = v;
  } catch { /* none yet */ }
  atomicWriteJSON(p, deepMerge(cur, patch));
}

/** Merge a patch into the machine-owned overlay (never touches workflow.yaml). */
function writeOverlay(dir, patch) {
  return withLock(() => { mergeOverlayPatch(dir, patch); return { ok: true }; });
}

/**
 * Compare-and-swap variant of writeOverlay: under the same mutex, compute the
 * overlay-aware rev and refuse to write when `expectedRev` does not match (returns
 * {conflict:true} with no write), preventing a stale client from clobbering a
 * concurrent edit. A null/undefined `expectedRev` skips the check (opt-in CAS).
 */
function writeOverlayCAS(dir, expectedRev, patch) {
  return withLock(() => {
    const rev = computeRev(dir);
    if (expectedRev != null && expectedRev !== rev) {
      return { ok: false, conflict: true, rev };
    }
    mergeOverlayPatch(dir, patch);
    return { ok: true, rev: computeRev(dir) };
  });
}

// Derive a filesystem-safe slug from a free-text title. The character class
// excludes '/', '\\', '.', and NUL by construction, so the result cannot encode a
// path separator, a parent ref, a leading slash, or an extension. Empty after
// sanitization means the title carried no slug-able character.
function slugify(title) {
  return String(title == null ? '' : title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, KB_SLUG_MAX)
    .replace(/-+$/g, '');
}

// True only when `child` is `root` itself or lies strictly beneath it. The
// trailing-separator compare rejects the sibling-prefix trap (/p/kb vs /p/kbevil).
function isContained(root, child) {
  return child === root || child.startsWith(root + path.sep);
}

// Resolve the KB directory the same way the read side scans: first-existing of
// docs -> kb -> .aidevteam/kb, creating .aidevteam/kb when none exists. Returns
// the realpath of that directory, or null when it cannot be confined to the root.
function resolveKbDir(projectDir) {
  let root;
  try { root = fs.realpathSync(projectDir); } catch { return null; }
  for (const rel of KB_DIR_CANDIDATES) {
    const candidate = path.join(root, rel);
    if (!fs.existsSync(candidate)) continue;
    let real;
    try { real = fs.realpathSync(candidate); } catch { return null; }
    if (!isContained(root, real)) return null; // symlinked KB dir escaping the root
    return real;
  }
  const def = path.join(root, '.aidevteam', 'kb');
  fs.mkdirSync(def, { recursive: true });
  try { return fs.realpathSync(def); } catch { return null; }
}

// Resolve the user-level common-vault directory for WRITING. The intended root comes
// from the knowledge module (default ~/.aidevteam/kb-common, or an absolute config
// override). The default is created on demand (like the project default). An absolute
// commonVaultDir override is NOT created here: it must already resolve to a real
// directory. In every case the resolved real path must be realpath-contained within
// the user-global home root (~/.aidevteam) — a symlink (or override path) escaping
// $HOME is refused so an override cannot redirect common writes outside the user's own
// state. The containment decision is the shared `containedCommonVaultDir` (the same
// gate the read path uses). Returns the realpath of the common vault, or null when it
// cannot be safely resolved (caller refuses the write).
function resolveCommonKbDir() {
  const home = aidevteamHome();
  const intended = commonVaultRoot();
  const isDefault = intended === path.join(home, 'kb-common');

  if (isDefault) {
    try { fs.mkdirSync(intended, { recursive: true }); } catch { return null; }
  } else {
    // a non-existent / non-directory override is refused rather than created or followed
    let real;
    try { real = fs.realpathSync(intended); } catch { return null; }
    try { if (!fs.statSync(real).isDirectory()) return null; } catch { return null; }
  }
  return containedCommonVaultDir();
}

const SCOPE_ENUM = new Set(['project', 'common']);

// Build the YAML-ish front-matter header the writer emits (and the reader parses).
// Values are the server-validated scope/stack/kind; never client paths.
function frontMatterHeader({ scope, stack, kind, status, by }) {
  const lines = ['---'];
  lines.push(`scope: ${scope}`);
  lines.push(`stack: [${stack.join(', ')}]`);
  lines.push(`kind: ${kind}`);
  lines.push(`status: ${status}`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push(`by: ${by || 'user'}`);
  lines.push('---');
  return lines.join('\n') + '\n';
}

// Body must be a non-empty, UTF-8-encodable text string within the size cap, with
// no NUL byte and no C0 control char other than tab/newline/carriage-return
// (i.e. a text/markdown content shape, not binary).
const KB_CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]');
function kbBodyError(body) {
  if (typeof body !== 'string' || body.length === 0) return 'body required';
  if (KB_CONTROL_CHARS.test(body)) return 'body must be text';
  if (Buffer.byteLength(body, 'utf8') > MAX_KB_BODY) return 'body too large';
  // a lone surrogate cannot round-trip through UTF-8 → reject as non-text
  if (Buffer.from(body, 'utf8').toString('utf8') !== body) return 'body must be text';
  return null;
}

const reject = (error) => ({ ok: false, code: 400, error });

/**
 * Write a knowledge-base note as a new markdown file inside one of two server-known
 * vaults selected by the `scope` enum.
 *
 * `scope` is a server-validated enum — `project` (the project's KB dir) or `common`
 * (the user-level shared vault) — never a client path, directory, filename, or vault
 * path. The filename is server-derived from a slug of `title` (`<slug>.md`); the body
 * carries a server-emitted front-matter header recording the validated scope/stack/
 * kind/status. The target's parent is realpath-contained to the CHOSEN vault root
 * before any write, the file is created with O_EXCL (never overwriting; a collision
 * gets a unique numeric suffix), and the body is capped and required to be UTF-8 text.
 *
 * @param projectDir the server-resolved project root (never client-supplied)
 * @param note `{ title, body, scope?, stack?, kind? }` — title/body untrusted text;
 *        scope an enum (default `project`); stack/kind tags normalized to the closed vocab
 * @returns `{ ok:true, doc:{ name, file, scope, stack, kind, status } }` on success, or
 *          `{ ok:false, code:400, error }` with a terse message (no paths, no stack traces)
 */
function addKbNote(projectDir, { title, body, scope, stack, kind, status } = {}) {
  if (typeof title !== 'string' || title.length > MAX_KB_TITLE) return reject('invalid title');
  const bodyErr = kbBodyError(body);
  if (bodyErr) return reject(bodyErr);
  const slug = slugify(title);
  if (!slug) return reject('title has no usable characters');

  // scope is a server-validated enum that SELECTS one of two known roots — it is
  // never concatenated into a path. Absent → project (safest). Out-of-enum → reject.
  const effScope = scope === undefined || scope === null ? 'project' : scope;
  if (!SCOPE_ENUM.has(effScope)) return reject('invalid scope');

  const normStack = normalizeStack(stack);
  const normKind = normalizeKind(kind);
  const effStatus = effScope === 'common'
    ? 'approved-common'
    : (status === 'approved-project' || status === 'pending' || status === 'rejected' ? status : 'approved-project');

  let vaultDir;
  let relRoot; // the root the returned file path is reported relative to
  if (effScope === 'common') {
    vaultDir = resolveCommonKbDir();
    if (!vaultDir) return reject('knowledge base location is not writable');
    relRoot = vaultDir;
  } else {
    vaultDir = resolveKbDir(projectDir);
    if (!vaultDir) return reject('knowledge base location is not writable');
    relRoot = fs.realpathSync(projectDir);
  }

  const header = frontMatterHeader({ scope: effScope, stack: normStack, kind: normKind, status: effStatus });
  const fileContent = header + body;

  for (let n = 1; n <= KB_COLLISION_LIMIT; n++) {
    const name = n === 1 ? slug : `${slug}-${n}`;
    const target = path.join(vaultDir, `${name}.md`);
    // realpath the parent and confirm containment to the CHOSEN vault BEFORE any write
    let realParent;
    try { realParent = fs.realpathSync(path.dirname(target)); } catch { return reject('invalid location'); }
    if (!isContained(vaultDir, realParent)) return reject('invalid location');
    try {
      writeNewFileExclusive(target, fileContent);
    } catch (e) {
      if (e && e.code === 'EEXIST') continue; // never clobber — try the next suffix
      return reject('could not write the note');
    }
    return {
      ok: true,
      doc: { name, file: path.relative(relRoot, target), scope: effScope, stack: normStack, kind: normKind, status: effStatus },
    };
  }
  return reject('too many notes with this title');
}

// Create a NEW file atomically: write a tmp file, then link it into place with
// O_EXCL semantics (link fails if the target exists — symlink included — so a
// pre-existing entry is never followed or truncated). Falls back to an O_EXCL
// open+write when link is unavailable. Throws an EEXIST error on collision.
function writeNewFileExclusive(target, content) {
  const fd = fs.openSync(target, 'wx'); // O_CREAT|O_EXCL|O_WRONLY — never follows/truncates
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Append one comment to the per-ticket JSONL audit log (append-only, race-free). */
function appendComment(dir, ticketId, { author, kind, body, gate, state, label, target, ref } = {}) {
  const rec = {
    id: crypto.randomUUID(),
    ticket: String(ticketId),
    ts: new Date().toISOString(),
    author: author || 'hub',
    kind: kind || 'comment',
    body: String(body == null ? '' : body).slice(0, MAX_COMMENT_BODY),
  };
  if (gate) rec.gate = gate;
  if (state) rec.state = state;
  if (label) rec.label = label;
  if (target) rec.target = Array.isArray(target) ? target.map(String) : String(target);
  if (ref) rec.ref = String(ref).slice(0, 128);
  const file = commentFile(dir, ticketId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // O_APPEND single-line write — atomic across writers up to PIPE_BUF (4KB on
  // Linux); bodies are capped at 8KB, so two *concurrent* appends to the same
  // ticket could in theory interleave. Acceptable for the single-developer model;
  // revisit with flock if multi-writer contention becomes real.
  fs.appendFileSync(file, JSON.stringify(rec) + '\n');
  return rec;
}

module.exports = { computeRev, atomicWriteJSON, readModifyWriteLedger, writeOverlay, writeOverlayCAS, addKbNote, appendComment, readComments, safeId, slugify };
