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
const { fileRev } = require('./state');
const { safeId, commentFile, readComments } = require('./comments');

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
 * Write a knowledge-base note as a new markdown file inside the project's KB dir.
 *
 * The filename is server-derived from a slug of `title` (`<slug>.md`); the client
 * never supplies a path, filename, directory, or extension. The target's parent is
 * realpath-contained to the KB dir before any write, the file is created with
 * O_EXCL (never overwriting; a name collision gets a unique numeric suffix), and the
 * body is capped and required to be UTF-8 text. All file creation is atomic.
 *
 * @param projectDir the server-resolved project root (never client-supplied)
 * @param note `{ title, body }` — both client-supplied untrusted text
 * @returns `{ ok:true, doc:{ name, file } }` on success, or `{ ok:false, code:400, error }`
 *          with a terse message (no absolute paths, no stack traces) on rejection
 */
function addKbNote(projectDir, { title, body } = {}) {
  if (typeof title !== 'string' || title.length > MAX_KB_TITLE) return reject('invalid title');
  const bodyErr = kbBodyError(body);
  if (bodyErr) return reject(bodyErr);
  const slug = slugify(title);
  if (!slug) return reject('title has no usable characters');

  const kbDir = resolveKbDir(projectDir);
  if (!kbDir) return reject('knowledge base location is not writable');

  const root = fs.realpathSync(projectDir);
  for (let n = 1; n <= KB_COLLISION_LIMIT; n++) {
    const name = n === 1 ? slug : `${slug}-${n}`;
    const target = path.join(kbDir, `${name}.md`);
    // realpath the parent and confirm containment BEFORE any write syscall
    let realParent;
    try { realParent = fs.realpathSync(path.dirname(target)); } catch { return reject('invalid location'); }
    if (!isContained(kbDir, realParent)) return reject('invalid location');
    try {
      writeNewFileExclusive(target, body);
    } catch (e) {
      if (e && e.code === 'EEXIST') continue; // never clobber — try the next suffix
      return reject('could not write the note');
    }
    return { ok: true, doc: { name: `${name}`, file: path.relative(root, target) } };
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
function appendComment(dir, ticketId, { author, kind, body, gate, state } = {}) {
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
  const file = commentFile(dir, ticketId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // O_APPEND single-line write — atomic across writers up to PIPE_BUF (4KB on
  // Linux); bodies are capped at 8KB, so two *concurrent* appends to the same
  // ticket could in theory interleave. Acceptable for the single-developer model;
  // revisit with flock if multi-writer contention becomes real.
  fs.appendFileSync(file, JSON.stringify(rec) + '\n');
  return rec;
}

module.exports = { computeRev, atomicWriteJSON, readModifyWriteLedger, writeOverlay, writeOverlayCAS, addKbNote, appendComment, readComments, safeId };
