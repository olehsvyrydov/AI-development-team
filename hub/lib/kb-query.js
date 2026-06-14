'use strict';
/*
 * The consumable Knowledge search backend behind the read-only `kb/search` route.
 *
 * Scope authority: the visible set is `buildKnowledge(project).docs` — the single scoped
 * projection (a project's own vault ∪ matching approved-common, via the one `scopeMatches`
 * predicate). This module adds NO second scan and NO second scope predicate; it only
 * RANKS that set, so a result can never be a note outside the project's scope.
 *
 * Additive ranking (the file scan stays the authority on existence + visibility):
 *   - With a queryable index, the genuine full-text hits over note BODIES are intersected
 *     with `docs[]` by `file` (`rankDocs`); a hit for a file the scan did not surface is
 *     dropped, so a stale or wrong index can only ever HIDE, never reveal. method:'full-text'.
 *   - With no/absent/errored index, search falls back to a local filename/excerpt scan over
 *     the SAME `docs[]` — exactly today's filename-only behaviour. method:'filename-only'.
 *   - An empty/whitespace query returns the scope-filtered docs unranked.
 *
 * The label is HONEST: 'full-text' is reported ONLY when the index genuinely served this
 * query (a body hit intersected the scan); otherwise the result is 'filename-only'. The
 * response exposes only server-known, vault-relative doc fields — never an absolute path,
 * a drift key, or a raw db error. Read-only and never-throws: every failure degrades to
 * the filename-only scan.
 */
const { buildKnowledge } = require('./state');
const { projectId } = require('./project-id');
const { projectStack } = require('./knowledge');

/** The projection fields a search result may carry — vault-relative, no fs layout. */
const RESULT_FIELDS = ['file', 'name', 'scope', 'stack', 'kind', 'status', 'excerpt', 'index', 'provenance', 'authoritative', 'shadowed', 'shadowedBy'];

const MIN_TOKEN_CHARS = 2;
const MAX_RESULTS = 50;

/** Lowercased keyword tokens from a raw query, dropping very short ones. */
function tokenize(query) {
  return String(query == null ? '' : query)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= MIN_TOKEN_CHARS);
}

/** Project a doc down to the server-known, vault-relative result fields only. */
function projectResult(doc, score) {
  const out = {};
  for (const k of RESULT_FIELDS) if (doc[k] !== undefined) out[k] = doc[k];
  if (typeof score === 'number') out.score = score;
  return out;
}

/**
 * Filename/excerpt match over the already scope-filtered docs — today's filename-only
 * behaviour, used when no index serves the query. A doc matches when a query token is in
 * its name/slug or its plain-text excerpt; matches are ranked by token-hit count (name
 * hits weigh more than excerpt hits).
 */
function filenameScan(docs, tokens) {
  const scored = [];
  for (const doc of docs) {
    const name = String(doc.name || '').replace(/[-_]+/g, ' ').toLowerCase();
    const excerpt = String(doc.excerpt || '').toLowerCase();
    const tags = [...(Array.isArray(doc.stack) ? doc.stack : []), doc.kind || ''].join(' ').toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (name.includes(tok)) score += 3;
      else if (tags.includes(tok)) score += 2;
      else if (excerpt.includes(tok)) score += 1;
    }
    if (score > 0) scored.push({ doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map(({ doc, score }) => projectResult(doc, score));
}

/**
 * Run a scope-safe, additive, ranked Knowledge search for a project.
 *
 * @param {string} project the resolved project root (already authorized by the HTTP layer)
 * @param {{query?:string, scope?:('project'|'common'|'all')}} opts the search request
 * @returns {{ok:true, method:('full-text'|'filename-only'), query:string, scope:string,
 *            results:Array<object>}} the ranked, scope-filtered results carrying only
 *   server-known, vault-relative doc fields. Never throws.
 */
function search(project, opts = {}) {
  const scope = opts && (opts.scope === 'project' || opts.scope === 'common') ? opts.scope : 'all';
  const rawQuery = String(opts && opts.query != null ? opts.query : '');
  const tokens = tokenize(rawQuery);

  let knowledge;
  try { knowledge = buildKnowledge(project); } catch { knowledge = { docs: [], method: 'filename-only' }; }
  const allDocs = Array.isArray(knowledge.docs) ? knowledge.docs : [];
  // Apply the optional scope facet ON TOP of the already scope-filtered projection; this
  // only ever NARROWS the visible set, never widens it.
  const docs = scope === 'all' ? allDocs : allDocs.filter((d) => d.scope === scope);

  // Empty/whitespace query → the scope-filtered docs, unranked.
  if (!tokens.length) {
    return { ok: true, method: knowledge.method === 'full-text' ? 'full-text' : 'filename-only', query: rawQuery, scope, results: docs.map((d) => projectResult(d)) };
  }

  // Try a GENUINE full-text query over note bodies via the optional index. The hits are
  // intersected with the scope-filtered docs by `file`; the index never adds a doc nor
  // re-decides scope (kb-search.js already re-checks each hit through scopeMatches).
  try {
    const { ftsSearch, rankDocs } = require('./kb-search');
    const fts = ftsSearch(project, {
      query: rawQuery,
      projectId: projectId(project),
      projectStack: projectStack(project),
      scope,
    });
    if (fts && fts.available === true && Array.isArray(fts.hits)) {
      const hitFiles = new Set(fts.hits.map((h) => h && h.file));
      const matched = rankDocs(docs, fts.hits).filter((d) => hitFiles.has(d.file));
      // The index genuinely served this query — the label is honestly 'full-text'.
      return { ok: true, method: 'full-text', query: rawQuery, scope, results: matched.slice(0, MAX_RESULTS).map((d) => projectResult(d, scoreFor(fts.hits, d.file))) };
    }
  } catch { /* index absent/broken → fall back to the filename/excerpt scan below */ }

  // No index served the query → today's filename/excerpt scan. The label is HONEST: it
  // never claims 'full-text' when only the filename scan ran.
  return { ok: true, method: 'filename-only', query: rawQuery, scope, results: filenameScan(docs, tokens) };
}

/** The full-text score a hit set assigns to a file, or 0 when unranked. */
function scoreFor(hits, file) {
  for (const h of hits) if (h && h.file === file) return Number(h.score) || 0;
  return 0;
}

module.exports = { search };
