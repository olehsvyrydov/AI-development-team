'use strict';
/*
 * The optional full-text search seam — the hub's only touch-point for the derived
 * Knowledge index. It lazy-`require`s a thin bridge from the optional `claude/memory`
 * package inside try/catch; on ANY absence/error/lock it returns null so the caller
 * keeps EXACTLY today's file scan (zero new dependency on the hub).
 *
 * Two safety properties hold here, not in the index:
 *   1. The canonical `scopeMatches` (hub/lib/knowledge.js) is re-applied to every
 *      candidate the bridge returns, so the index can never widen scope — only the
 *      shared predicate decides visibility. ownProject is recomputed from each hit's
 *      own `project_id` vs the caller and common-status is taken from the hit, so
 *      project-ownership and common-status are genuinely re-decided here (defence in
 *      depth) — the SQL prefilter is never the final authority.
 *   2. Ranking is ADDITIVE: `rankDocs` reorders the file-scan `docs[]` by FTS score but
 *      never adds a file the scan did not surface nor removes one. A stale index is
 *      thereby harmless — a phantom hit is dropped by the intersection, a missing hit
 *      just means that note is not body-ranked this turn.
 *
 * The bridge returns only server-known refs ({file, scope, score}); this module never
 * surfaces an absolute path, a drift key, or a raw db error.
 */
const path = require('node:path');
const { scopeMatches } = require('./knowledge');

// Candidate locations of the built CommonJS bridge inside the optional memory package.
// Resolved lazily; absence is normal and silent.
const BRIDGE_CANDIDATES = [
  path.join(__dirname, '..', '..', 'claude', 'memory', 'kb-fts-bridge.cjs'),
  path.join(__dirname, '..', '..', 'claude', 'memory', 'dist', 'kb-fts-bridge.js'),
];

function loadBridge() {
  for (const p of BRIDGE_CANDIDATES) {
    try {
      return require(p);
    } catch {
      /* try the next candidate; absence/error is silent */
    }
  }
  return null;
}

/**
 * Query the optional full-text index for a project.
 *
 * @param {string} project absolute project root
 * @param {{query:string, projectId:string, projectStack:string[], scope:('project'|'common'|'all')}} opts
 * @returns {{available:true, hits:Array<{file:string, scope:string, score:number}>}|null}
 *   `null` on any absence/error (caller keeps the file scan); otherwise the
 *   scope-re-validated hits, carrying only server-known {file, scope, score}.
 */
function ftsSearch(project, opts) {
  let bridge;
  try {
    bridge = loadBridge();
  } catch {
    return null;
  }
  if (!bridge || typeof bridge.ftsSearch !== 'function') return null;

  let result;
  try {
    result = bridge.ftsSearch(project, {
      query: String(opts && opts.query != null ? opts.query : ''),
      projectId: String(opts && opts.projectId != null ? opts.projectId : ''),
      projectStack: Array.isArray(opts && opts.projectStack) ? opts.projectStack : ['any'],
      scope: opts && opts.scope ? opts.scope : 'all',
      probe: !!(opts && opts.probe),
      dbPath: opts && opts.dbPath,
    });
  } catch {
    return null;
  }
  if (!result || result.available !== true || !Array.isArray(result.hits)) return null;

  const callerId = String(opts && opts.projectId != null ? opts.projectId : '');
  const projectMeta = { stack: Array.isArray(opts && opts.projectStack) && opts.projectStack.length ? opts.projectStack : ['any'] };
  const hits = [];
  for (const h of result.hits) {
    if (!h || typeof h.file !== 'string' || typeof h.scope !== 'string') continue;
    // Re-decide visibility through the canonical scopeMatches — the index is a candidate
    // generator, this predicate is the final authority. ownProject is recomputed from the
    // hit's own project_id vs the caller (never rubber-stamped to true), and common-status
    // is taken from the hit, so project-ownership AND common-status are genuinely re-checked
    // here. The SQL prefilter can only ever HIDE a visible note, never reveal a hidden one,
    // even if it were wrong.
    const doc = {
      scope: h.scope,
      status: h.status == null ? undefined : h.status,
      stack: Array.isArray(h.stack) ? h.stack : ['any'],
      ownProject: h.scope === 'project' && String(h.project_id == null ? '' : h.project_id) === callerId,
    };
    if (!scopeMatches(doc, projectMeta)) continue;
    hits.push({ file: h.file, scope: h.scope, score: Number(h.score) || 0 });
  }
  return { available: true, hits };
}

/**
 * Reorder the file-scan `docs[]` by full-text score WITHOUT adding or removing any doc.
 * Docs that a hit names (matched by `file`) move to the front in descending score order;
 * docs with no hit keep their original relative order behind them. A hit for a file not
 * in `docs[]` is ignored — the file scan stays the authority on what exists and is visible.
 *
 * Always returns a NEW array (never the input reference), so a caller may clear its own
 * list and repopulate it from the result without aliasing it to empty.
 *
 * @param {Array<{file:string}>} docs the scope-filtered file-scan docs
 * @param {Array<{file:string, score:number}>} hits the FTS hits
 * @returns {Array} a new array of the same docs, reordered; never a new or dropped doc
 */
function rankDocs(docs, hits) {
  if (!Array.isArray(docs)) return [];
  if (!Array.isArray(hits) || !hits.length) return docs.slice();
  const scoreByFile = new Map();
  for (const h of hits) {
    if (h && typeof h.file === 'string' && !scoreByFile.has(h.file)) scoreByFile.set(h.file, Number(h.score) || 0);
  }
  const ranked = [];
  const rest = [];
  for (const d of docs) {
    if (scoreByFile.has(d.file)) ranked.push(d);
    else rest.push(d);
  }
  ranked.sort((a, b) => scoreByFile.get(b.file) - scoreByFile.get(a.file));
  return [...ranked, ...rest];
}

module.exports = { ftsSearch, rankDocs };
