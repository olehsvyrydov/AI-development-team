'use strict';
/*
 * Zero-build CommonJS bridge the hub lazy-requires to query the optional full-text
 * Knowledge index. It is the ONLY thing on the hub's read path that touches node:sqlite.
 *
 * It is strictly READ-ONLY and query-only: it opens the existing db, runs a NARROWING
 * candidate prefilter (own-project rows, or approved-common rows), and returns
 * server-known {file, scope, stack, project_id, status, score} candidates. It never
 * creates, writes, or indexes, and it never builds the index. The FINAL scope authority
 * is the hub's shared `scopeMatches`, re-applied by the caller (hub/lib/kb-search.js) —
 * this bridge only generates candidates, never widens scope.
 *
 * `project_id` is a content hash (sha1 of the git toplevel or realpath), NOT a filesystem
 * path, so returning it discloses no fs layout; it lets the caller recompute ownProject
 * itself (own-project vs another project) rather than trust the SQL prefilter. The hit
 * keys are still confined to that server-known set: no absolute `path`, `mtime`, or `size`
 * drift key ever leaves this module.
 *
 * On any miss (absent/locked/corrupt/foreign db, or any error) it returns
 * {available:false} so the hub keeps exactly today's file scan. No absolute path, drift
 * key, or raw db error ever leaves this module.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const UNAVAILABLE = { available: false, hits: [] };

function defaultDbPath() {
  return path.join(os.homedir(), '.aidevteam', 'memory', 'memory.db');
}

/**
 * Load node:sqlite without letting its one-time experimental-feature warning reach the
 * hub's stderr — the hub query path must stay quiet. The warning is suppressed only for
 * the duration of the require; any pre-existing listener is restored.
 */
function loadSqlite() {
  const filter = (warning) => {
    if (warning && warning.name === 'ExperimentalWarning' && /SQLite/i.test(String(warning.message))) return;
    if (original.length) for (const l of original) l(warning);
  };
  const original = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', filter);
  try {
    return require('node:sqlite');
  } finally {
    process.removeListener('warning', filter);
    for (const l of original) process.on('warning', l);
  }
}

/**
 * Reduce a raw user query to a safe FTS5 MATCH expression: each alphanumeric run becomes
 * a quoted term, OR-combined; all operator/syntax characters are stripped so the bound
 * parameter can never alter the statement or raise a malformed-query error.
 */
function sanitizeMatch(query) {
  const terms = String(query == null ? '' : query)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0)
    .slice(0, 16);
  if (!terms.length) return '';
  return terms.map((t) => `"${t}"`).join(' OR ');
}

function parseStack(raw) {
  if (!raw) return ['any'];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? v.map(String) : ['any'];
  } catch {
    return ['any'];
  }
}

/**
 * Query the index for one project. See module header for the read-only / candidate-only
 * contract. Returns {available, hits:[{file, scope, stack, project_id, status, score}]}
 * or {available:false}. `project_id`/`status` let the caller re-decide ownProject and
 * common-status through the canonical `scopeMatches` (defence in depth — the SQL prefilter
 * is never the final authority).
 *
 * @param {string} _project the project root (reserved; the caller passes projectId)
 * @param {{query:string, projectId:string, scope:('project'|'common'|'all'), dbPath?:string}} opts
 */
function ftsSearch(_project, opts) {
  const o = opts || {};
  const scope = o.scope || 'all';
  const scopes = scope === 'all' ? ['project', 'common'] : [scope];
  const dbPath = typeof o.dbPath === 'string' && o.dbPath ? o.dbPath : defaultDbPath();

  // Cheap existence gate FIRST, so the common no-index case never touches node:sqlite
  // (and never triggers its experimental-feature warning on stderr).
  try {
    if (!fs.existsSync(dbPath)) return UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }

  let DatabaseSync;
  try {
    ({ DatabaseSync } = loadSqlite());
  } catch {
    return UNAVAILABLE; // node without the sqlite built-in → degrade
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 2000;');
  } catch {
    return UNAVAILABLE; // absent / locked / not a db
  }

  try {
    // A probe establishes availability for the method label: the index is healthy when its
    // tables exist and answer. No MATCH is run — availability, not a ranked query.
    if (o.probe === true) {
      db.prepare('SELECT count(*) FROM kb_note').get();
      db.prepare("SELECT rowid FROM kb_fts WHERE kb_fts MATCH 'a' LIMIT 0").all();
      return { available: true, hits: [] };
    }

    const matchExpr = sanitizeMatch(o.query);
    if (!matchExpr) return UNAVAILABLE;
    const where = ['kb_fts MATCH ?'];
    const params = [matchExpr];
    const scopeClauses = [];
    if (scopes.includes('project')) {
      scopeClauses.push("(n.scope = 'project' AND n.project_id = ?)");
      params.push(String(o.projectId == null ? '' : o.projectId));
    }
    if (scopes.includes('common')) {
      scopeClauses.push("(n.scope = 'common' AND n.status = 'approved-common')");
    }
    if (!scopeClauses.length) return UNAVAILABLE;
    where.push(`(${scopeClauses.join(' OR ')})`);

    const limit = Number.isFinite(o.limit) ? Math.max(1, Math.min(200, Number(o.limit))) : 50;
    params.push(limit);

    const rows = db
      .prepare(
        `SELECT n.scope AS scope, n.stack AS stack, n.project_id AS project_id,
                n.status AS status, n.file AS file, bm25(kb_fts) AS rank
           FROM kb_fts JOIN kb_note n ON n.rowid = kb_fts.rowid
          WHERE ${where.join(' AND ')}
          ORDER BY rank
          LIMIT ?`,
      )
      .all(...params);

    const hits = rows.map((r) => ({
      file: r.file,
      scope: r.scope,
      stack: parseStack(r.stack),
      project_id: String(r.project_id == null ? '' : r.project_id),
      status: r.status == null ? null : String(r.status),
      score: -r.rank,
    }));
    return { available: true, hits };
  } catch {
    return UNAVAILABLE; // corrupt / foreign schema / any query error
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { ftsSearch };
