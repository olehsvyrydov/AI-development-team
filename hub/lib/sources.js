'use strict';
/*
 * Connect-an-external-codebase: a READ-ONLY, realpath-contained, bounded source
 * record + a filename/keyword index. A "source" is configuration (a folder the
 * operator points DART at), NOT a knowledge note — it lives in <project>/.aidevteam/
 * sources.json and is a SEPARATE projection facet that is never merged into the
 * authored-note vault scope (scopeMatches is unaffected, connected content is never
 * recalled as an authored note).
 *
 * Security floor:
 *   - connect realpath-validates the supplied path is a REAL directory (not a file,
 *     device, or symlink-to-elsewhere) and records its CANONICAL realpath as `root`.
 *   - the ingest is READ-ONLY: it opens candidate files read-only and NEVER writes,
 *     renames, deletes, or creates anything under `root`. It writes only sources.json
 *     and the per-source index facet, both contained to .aidevteam/.
 *   - per-file realpath-containment to `root` BEFORE reading (reusing the analyze.js
 *     confinedPath discipline rooted at the EXTERNAL root); a symlink escaping `root`
 *     is SKIPPED, not followed (the exfiltration guard); `..`/absolute cannot escape.
 *   - bounded by the analyze.js CAPS (per-file/total bytes, max files, depth, time);
 *     binary/non-UTF-8 files skipped; .git, node_modules, and dotfiles excluded.
 *   - honest index method: 'filename' (filename + lexical keyword match) — no embedder,
 *     no network, no exec. Zero outbound I/O on every path.
 *   - CAS on a sources.json rev refuses a stale write.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWriteJSON } = require('./write');
const { CAPS, confinedPath } = require('./analyze');

const SOURCES_FILE = 'sources.json';
const INDEX_DIR = 'source-index';
const MAX_LABEL_LEN = 128;
const MAX_TERMS_PER_FILE = 64;
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.hg', '.svn', 'vendor', 'dist', 'build', '.next', 'target']);
const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.php', '.c', '.h', '.cpp', '.cc', '.hpp',
  '.cs', '.sh', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.html', '.css', '.scss', '.sql',
]);

const conflict = () => ({ ok: false, conflict: true });
const reject = (error) => ({ ok: false, code: 400, error });

// The .aidevteam dir, realpath-contained to the project root (a symlinked .aidevteam
// escaping the project is refused, never followed). Returns the contained realpath or
// null.
function containedAidevteam(project) {
  let root;
  try { root = fs.realpathSync(project); } catch { return null; }
  const adt = path.join(root, '.aidevteam');
  try { fs.mkdirSync(adt, { recursive: true }); } catch { return null; }
  let real;
  try { real = fs.realpathSync(adt); } catch { return null; }
  if (real !== adt && !real.startsWith(root + path.sep)) return null; // escapes the project
  return real;
}

function sourcesPath(project) {
  const adt = containedAidevteam(project);
  return adt ? path.join(adt, SOURCES_FILE) : null;
}

/** The CAS rev (mtime:size) of sources.json; '0' when absent. */
function sourcesRev(project) {
  const p = sourcesPath(project);
  if (!p) return '0';
  try { const st = fs.statSync(p); return `${st.mtimeMs}:${st.size}`; } catch { return '0'; }
}

function readSources(project) {
  const p = sourcesPath(project);
  if (!p) return { sources: [] };
  try {
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (v && typeof v === 'object' && Array.isArray(v.sources)) return { sources: v.sources };
  } catch { /* missing/malformed → empty */ }
  return { sources: [] };
}

function sanitizeLabel(s) {
  return String(s == null ? '' : s).replace(/[\x00-\x1f]/g, '').slice(0, MAX_LABEL_LEN);
}

// Lowercase keyword tokens from a filename + a bounded slice of its text content.
function extractTerms(relFile, text) {
  const terms = new Set();
  for (const t of relFile.toLowerCase().split(/[^a-z0-9]+/)) if (t.length >= 3) terms.add(t);
  for (const t of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (terms.size >= MAX_TERMS_PER_FILE) break;
    if (t.length >= 3) terms.add(t);
  }
  return [...terms].slice(0, MAX_TERMS_PER_FILE);
}

// Looks-like-text: a printable ext AND no NUL/binary control bytes in the read slice.
function looksText(rel, buf) {
  const ext = path.extname(rel).toLowerCase();
  if (ext && !TEXT_EXTENSIONS.has(ext)) return false;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) return false;
  }
  return true;
}

/**
 * Read-only, realpath-contained, bounded walk of `root`. Returns
 * `{ files:[{file, terms}], fileCount, truncated }`. Never writes/mutates `root`.
 * A symlink escaping `root` is skipped (not followed); dotfiles, VCS, and deps are
 * excluded; binary/non-UTF-8 files are skipped; the analyze.js CAPS bound the work.
 */
function ingest(root, caps) {
  const C = { ...CAPS, ...(caps || {}) };
  const budget = { start: Date.now(), bytes: 0, files: 0 };
  const files = [];
  let truncated = false;

  function walk(dirReal, depth) {
    if (truncated) return;
    if (depth > C.maxDepth) return;
    let ents = [];
    try { ents = fs.readdirSync(dirReal, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of ents) {
      if (files.length >= C.maxFiles || budget.files >= CAPS.maxFiles * 4 ||
          (Date.now() - budget.start) > C.timeBudgetMs || budget.bytes >= C.maxTotalBytes) { truncated = true; return; }
      if (ent.name.startsWith('.')) continue;           // dotfiles + dot-dirs excluded
      if (ent.isDirectory() && EXCLUDED_DIRS.has(ent.name)) continue;
      const rel = path.relative(root, path.join(dirReal, ent.name));
      // realpath-contain BEFORE touching: an escaping symlink is skipped, not followed
      const real = confinedPath(root, rel);
      if (!real) continue;
      let st;
      try { st = fs.lstatSync(path.join(dirReal, ent.name)); } catch { continue; }
      if (st.isSymbolicLink()) {
        // resolve and re-confine; if it escapes, confinedPath already returned the
        // contained realpath — but skip symlinks that point outside the tree entirely
        const linkReal = confinedPath(root, rel);
        if (!linkReal) continue;
      }
      let realStat;
      try { realStat = fs.statSync(real); } catch { continue; }
      if (realStat.isDirectory()) { budget.files++; walk(real, depth + 1); continue; }
      if (!realStat.isFile()) continue;
      budget.files++;
      const cap = Math.min(C.maxFileBytes, Math.max(0, C.maxTotalBytes - budget.bytes));
      if (cap <= 0) { truncated = true; return; }
      let buf;
      let fd;
      try {
        fd = fs.openSync(real, 'r');                    // READ-ONLY open
        buf = Buffer.alloc(cap);
        const n = fs.readSync(fd, buf, 0, cap, 0);
        buf = buf.subarray(0, n);
        budget.bytes += n;
      } catch { continue; }
      finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
      if (!looksText(rel, buf)) continue;               // binary/non-UTF-8 skipped
      files.push({ file: rel, terms: extractTerms(rel, buf.toString('utf8')) });
    }
  }

  walk(root, 0);
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return { files, fileCount: files.length, truncated };
}

function indexDir(project) {
  const adt = containedAidevteam(project);
  if (!adt) return null;
  const dir = path.join(adt, INDEX_DIR);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return null; }
  return dir;
}

// Write the per-source index facet inside .aidevteam/source-index/<id>.json (contained).
function writeIndexFacet(project, source, ingestResult) {
  const dir = indexDir(project);
  if (!dir) return false;
  const target = path.join(dir, `${source.id}.json`);
  let realParent;
  try { realParent = fs.realpathSync(path.dirname(target)); } catch { return false; }
  if (!realParent.startsWith(fs.realpathSync(path.join(project, '.aidevteam')))) return false;
  atomicWriteJSON(target, { sourceId: source.id, root: source.root, method: 'filename', files: ingestResult.files });
  return true;
}

function removeIndexFacet(project, sourceId) {
  const dir = indexDir(project);
  if (!dir) return;
  const target = path.join(dir, `${sourceId}.json`);
  // remove the derived facet only (inside .aidevteam, contained) — never the source tree
  try {
    let real;
    try { real = fs.realpathSync(target); } catch { return; }
    if (real.startsWith(fs.realpathSync(dir) + path.sep)) fs.rmSync(real, { force: true });
  } catch { /* best effort */ }
}

function persistSources(project, list) {
  const p = sourcesPath(project);
  if (!p) return false;
  let realParent;
  try { realParent = fs.realpathSync(path.dirname(p)); } catch { return false; }
  if (!realParent.startsWith(fs.realpathSync(project) + path.sep)) return false; // escapes project
  atomicWriteJSON(p, { sources: list });
  return true;
}

/**
 * Connect an external codebase as a read-only source. Realpath-validates `path` is a
 * REAL directory, records its canonical realpath, runs the read-only contained ingest,
 * and persists the source record + index facet. CAS on `expectedRev` (sourcesRev).
 *
 * @param project the project root
 * @param input `{ path, globs?, expectedRev?, caps?, by? }`
 * @returns `{ ok:true, source }`, `{ ok:false, conflict:true }`, or `{ ok:false, code:400, error }`
 */
async function connectSource(project, { path: srcPath, globs, expectedRev, caps, by } = {}) {
  if (typeof srcPath !== 'string' || srcPath.length === 0) return reject('a folder is required');
  if (srcPath.includes('\0')) return reject('invalid folder');
  if (containedAidevteam(project) == null) return reject('cannot record the source');
  if (expectedRev != null && expectedRev !== sourcesRev(project)) return conflict();

  // realpath-validate: must resolve to a REAL directory (a file/device/symlink-to-file refused)
  let root;
  try { root = fs.realpathSync(srcPath); } catch { return reject('that folder does not exist'); }
  let st;
  try { st = fs.statSync(root); } catch { return reject('that folder does not exist'); }
  if (!st.isDirectory()) return reject('that path is not a folder');

  const id = crypto.randomUUID();
  const ingestResult = ingest(root, caps);
  const now = new Date().toISOString();
  const source = {
    id,
    label: sanitizeLabel(globs && globs.label ? globs.label : path.basename(root)),
    root,
    globs: Array.isArray(globs) ? globs.slice(0, 32).map(String) : undefined,
    indexMethod: 'filename',
    connectedAt: now,
    lastIndexedAt: now,
    fileCount: ingestResult.fileCount,
    status: 'ready',
    by: sanitizeLabel(by || 'user'),
  };
  const list = readSources(project).sources.filter((s) => s && s.root !== root);
  list.push(source);
  if (!persistSources(project, list)) return reject('cannot record the source');
  writeIndexFacet(project, source, ingestResult);
  return { ok: true, source };
}

/**
 * Re-run the read-only contained ingest for an existing source. CAS on `expectedRev`.
 *
 * @param project the project root
 * @param input `{ sourceId, expectedRev?, caps? }`
 */
async function reindexSource(project, { sourceId, expectedRev, caps } = {}) {
  if (containedAidevteam(project) == null) return reject('cannot reindex');
  if (expectedRev != null && expectedRev !== sourcesRev(project)) return conflict();
  const list = readSources(project).sources;
  const idx = list.findIndex((s) => s && s.id === sourceId);
  if (idx < 0) return reject('unknown source');
  const source = list[idx];
  let st;
  try { st = fs.statSync(source.root); } catch { st = null; }
  if (!st || !st.isDirectory()) {
    source.status = 'error';
    persistSources(project, list);
    return reject('the connected folder is no longer available');
  }
  const ingestResult = ingest(source.root, caps);
  source.fileCount = ingestResult.fileCount;
  source.lastIndexedAt = new Date().toISOString();
  source.status = 'ready';
  list[idx] = source;
  if (!persistSources(project, list)) return reject('cannot reindex');
  writeIndexFacet(project, source, ingestResult);
  return { ok: true, source };
}

/**
 * Disconnect a source: remove the registration + its index facet only. NEVER touches
 * the external tree. CAS on `expectedRev`.
 *
 * @param project the project root
 * @param input `{ sourceId, expectedRev? }`
 */
async function disconnectSource(project, { sourceId, expectedRev } = {}) {
  if (containedAidevteam(project) == null) return reject('cannot disconnect');
  if (expectedRev != null && expectedRev !== sourcesRev(project)) return conflict();
  const list = readSources(project).sources;
  if (!list.some((s) => s && s.id === sourceId)) return reject('unknown source');
  const next = list.filter((s) => s && s.id !== sourceId);
  if (!persistSources(project, next)) return reject('cannot disconnect');
  removeIndexFacet(project, sourceId);
  return { ok: true };
}

/**
 * The sources facet for the projection: each source's public status fields (never a
 * secret). A separate facet — never merged into the authored-note docs / scopeMatches.
 */
function sourcesFacet(project) {
  return readSources(project).sources
    .filter((s) => s && typeof s === 'object' && typeof s.id === 'string')
    .map((s) => ({
      id: s.id,
      label: sanitizeLabel(s.label),
      path: typeof s.root === 'string' ? s.root : '',
      kind: 'codebase',
      status: s.status === 'ready' ? 'indexed' : (s.status || 'connected'),
      fileCount: typeof s.fileCount === 'number' ? s.fileCount : 0,
      method: s.indexMethod === 'filename' ? 'filename' : String(s.indexMethod || 'filename'),
      lastIndexedAt: s.lastIndexedAt || null,
      external: false,
    }));
}

module.exports = { connectSource, reindexSource, disconnectSource, sourcesFacet, sourcesRev, readSources, ingest };
