'use strict';
/*
 * The interpretation-check Q&A — a READ-ONLY answer over what the project already
 * holds, scoped exactly as the Knowledge panel is.
 *
 * Scope authority: the visible set is `buildKnowledge(project).docs` — the single
 * scoped projection (a project's own vault ∪ matching approved-common, via the one
 * `scopeMatches` predicate). The Q&A adds NO second scan and NO second predicate, so
 * it can surface only what the project may already see; it never reads another
 * project's vault or the inert `proposals[]`.
 *
 * Tiers, best-available first, each degrading locally:
 *   - overlay  — only when an overlay is configured AND healthy: query the external
 *                service and label the answer the overlay's (egress disclosed).
 *   - lexical  — always-on local keyword/title/body match over the scoped docs, with
 *                an honest "filename/keyword, no embedder" grounding label.
 *   - absence  — nothing matched in any tier: say so plainly.
 *
 * The route is read-only (no write of any kind is performed here) and never throws:
 * any tier failure degrades to the next. A question triggers no egress unless an
 * overlay is enabled and healthy.
 */
const path = require('node:path');
const { buildKnowledge, containedCommonVaultDir, safeRead } = require('./state');
const overlay = require('./overlay');

const MAX_LEXICAL_MATCHES = 10;
const MAX_SNIPPET_CHARS = 240;
const MAX_EGRESS_TITLES = 10;
const MIN_TOKEN_CHARS = 3;

// Strip front-matter + a leading title heading, returning the prose body for matching.
function noteBody(text) {
  let s = String(text || '');
  const fm = s.match(/^---\n[\s\S]*?\n---\n?/);
  if (fm) s = s.slice(fm[0].length);
  s = s.replace(/^\s*#[^\n]*\n/, '');
  return s.trim();
}

// Resolve a doc's body from disk through the SAME contained roots buildKnowledge used:
// a project doc's `file` is relative to the project root; a common doc's `file` is
// relative to the contained common-vault root. No new scope/scan is introduced — the
// doc set is already scope-filtered; this only fetches text for the matched names.
function readDocBody(project, doc) {
  try {
    if (doc.scope === 'project') {
      return noteBody(safeRead(path.join(project, doc.file)));
    }
    if (doc.scope === 'common') {
      const root = containedCommonVaultDir();
      if (!root) return '';
      return noteBody(safeRead(path.join(root, doc.file)));
    }
  } catch { /* fall through */ }
  return '';
}

// Tokenize a question into lowercased keyword tokens, dropping very short ones.
function tokenize(question) {
  return String(question || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_CHARS);
}

// Build a haystack from a doc's slug/name and its body, plus its tags (stack/kind).
function docHaystack(project, doc) {
  const title = String(doc.name || '').replace(/[-_]+/g, ' ').toLowerCase();
  const body = readDocBody(project, doc).toLowerCase();
  const tags = [...(Array.isArray(doc.stack) ? doc.stack : []), doc.kind || ''].join(' ').toLowerCase();
  return { title, body, tags };
}

// Score a doc against the question tokens: a title/tag hit weighs more than a body hit.
function scoreDoc(tokens, hay) {
  let score = 0;
  for (const tok of tokens) {
    if (hay.title.includes(tok)) score += 3;
    else if (hay.tags.includes(tok)) score += 2;
    else if (hay.body.includes(tok)) score += 1;
  }
  return score;
}

// A short, plain snippet from the body for display (untrusted prose carried raw).
function snippet(project, doc) {
  const body = readDocBody(project, doc);
  return body.length > MAX_SNIPPET_CHARS ? `${body.slice(0, MAX_SNIPPET_CHARS)}…` : body;
}

// The always-on local tier: keyword match over the scoped docs. Returns the ranked
// matches (name + scope + stack + snippet). Never throws.
function lexicalMatches(project, question, docs) {
  const tokens = tokenize(question);
  if (!tokens.length) return [];
  const scored = [];
  for (const doc of docs) {
    const hay = docHaystack(project, doc);
    const score = scoreDoc(tokens, hay);
    if (score > 0) scored.push({ doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_LEXICAL_MATCHES).map(({ doc, score }) => ({
    name: doc.name,
    scope: doc.scope,
    stack: doc.stack,
    kind: doc.kind,
    score,
    snippet: snippet(project, doc),
  }));
}

function lexicalAnswer(matches) {
  const names = matches.map((m) => m.name).join(', ');
  return `Filename/keyword match in this project's scope: ${names}. No embedder is configured, so this is not a semantic understanding check.`;
}

// Build the MINIMAL, in-scope egress context: only the matching note TITLES (slugs)
// the local tier already surfaced — never bodies, never out-of-scope notes, never
// proposals, never a secret. Bounded.
function egressContext(localMatches) {
  const titles = localMatches.slice(0, MAX_EGRESS_TITLES).map((m) => m.name);
  return titles.length ? `topic notes in scope: ${titles.join(', ')}` : 'no in-scope notes matched';
}

/**
 * Answer an interpretation-check question, read-only, best-available tier first.
 *
 * @param project the resolved project root (already authorized by the HTTP layer)
 * @param question the user's question (untrusted text)
 * @param opts `{ fetchImpl?, overlayTimeoutMs? }` — fetch is injectable for tests;
 *        no real outbound call is ever made unless an overlay is enabled+healthy
 * @returns `{ answer, matches:[…], grounding:{ method, source, external, residency?, label }, egressDisclosed }`
 */
async function ask(project, question, opts = {}) {
  const fetchImpl = opts.fetchImpl !== undefined ? opts.fetchImpl : globalThis.fetch;
  const overlayTimeoutMs = opts.overlayTimeoutMs;

  // The single scoped projection — the only source of the visible doc set.
  let docs = [];
  try { docs = buildKnowledge(project).docs || []; } catch { docs = []; }

  // Local tier first (always available, never egresses) — also the source of the
  // minimal egress context if an overlay turns out to be healthy.
  const localMatches = lexicalMatches(project, question, docs);

  // Overlay tier: only when configured AND healthy. The health signal gates BOTH the
  // send and the disclosure, so they cannot drift.
  let healthy = false;
  let config = null;
  try {
    const probe = await overlay.checkHealth({ fetchImpl, ...(overlayTimeoutMs ? { timeoutMs: overlayTimeoutMs } : {}) });
    healthy = probe.healthy;
    config = probe.config;
  } catch { healthy = false; }

  if (healthy && config && config.overlay) {
    let answer = null;
    try {
      answer = await overlay.queryOverlay(
        { question, context: egressContext(localMatches), scopeKey: scopeKeyFor(project) },
        { fetchImpl, ...(overlayTimeoutMs ? { timeoutMs: overlayTimeoutMs } : {}) });
    } catch { answer = null; }
    if (answer) {
      return {
        answer: answer.answer || `Answered by your connected memory service ${config.overlay}.`,
        matches: (answer.matches || []).map((m) => ({ name: m.title, scope: 'overlay', score: m.score })),
        grounding: {
          method: 'overlay',
          source: config.overlay,
          external: true,
          residency: config.residency,
          label: `Answered by your connected memory service ${config.overlay} (external).`,
        },
        egressDisclosed: true,
      };
    }
    // overlay enabled but produced no usable answer ⇒ fall through to local (no
    // egress is disclosed for an answer the overlay did not actually provide).
  }

  if (localMatches.length) {
    return {
      answer: lexicalAnswer(localMatches),
      matches: localMatches,
      grounding: {
        method: 'filename-only',
        source: 'filename-only',
        external: false,
        label: 'Filename/keyword match only — no embedder configured, so this is not a semantic understanding check.',
      },
      egressDisclosed: false,
    };
  }

  return {
    answer: 'No note found on this topic in this project\'s scope.',
    matches: [],
    grounding: {
      method: 'none',
      source: 'filename-only',
      external: false,
      label: 'No note found on this topic in this project\'s scope.',
    },
    egressDisclosed: false,
  };
}

// A stable, non-secret scope identifier for the project (its basename). Used only to
// scope the overlay query; carries no path and no secret.
function scopeKeyFor(project) {
  return path.basename(String(project || '')) || 'project';
}

module.exports = { ask, lexicalMatches, egressContext };
