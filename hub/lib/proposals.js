'use strict';
/*
 * The /kai propose -> user-approve knowledge inbox.
 *
 * A proposal is UNTRUSTED model-authored content. It must be inert until an
 * explicit human approve. Inertness is a property of WHERE THE BYTES LIVE, not of a
 * status filter that could be regressed: proposals live in a third store
 * (~/.aidevteam/kb-proposals/), distinct from both knowledge vaults. This store is
 * NOT scanned by readKb and NOT read by the recall predicate (scopeMatches), so a
 * pending proposal is inert to all recall by construction.
 *
 *   - propose()      records a PENDING proposal with a server-generated id. The
 *                    content is bounded (size cap, text-only) and the suggested
 *                    scope/stack/kind are normalized to the closed vocabulary. The
 *                    client can never set or forge the id, the status, or a path.
 *   - listPending()  the inbox: only pending proposals (approved/rejected excluded).
 *   - approve()      re-authorizes against the STORED proposal by id (a foreign /
 *                    forged / stale / already-decided id is refused and NOTHING is
 *                    written). It writes the stored content through the SAME guarded,
 *                    realpath-contained addKbNote chokepoint at the server-validated
 *                    chosen scope, marks the proposal decided, and audits it.
 *   - reject()       marks the proposal rejected, RETAINS it for audit, removes it
 *                    from the inbox, and never recalls it.
 *
 * All stored content + suggested values are kept RAW (inert); the front end escapes
 * on render. Nothing is ever auto-applied. The store parser is bounded, prototype-
 * safe, and never throws (a malformed record is skipped, not fatal).
 *
 * Zero dependencies beyond node + the shared knowledge/write modules. Pure file I/O.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { aidevteamHome, normalizeStack, normalizeKind, SCOPES } = require('./knowledge');

// The write module is required lazily inside the functions that need it: state.js
// pulls in proposals.js, and write.js pulls in state.js, so a top-level require of
// write here would close a load-time cycle. The functions run well after load.
function writeModule() { return require('./write'); }

const MAX_CONTENT_BYTES = 64 * 1024;
const MAX_TITLE_LEN = 200;
const MAX_WHY_LEN = 2048;
const MAX_RECORD_BYTES = 256 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]');

const reject = (code, error) => ({ ok: false, code, error });

// Resolve the proposal store under the user-global home, realpath-contained to it
// (a symlinked store escaping ~/.aidevteam is refused). `create` builds the default
// store on demand the same way the vault defaults are created. Returns the contained
// realpath, or null when it cannot be safely resolved.
function proposalsDir(create) {
  const home = aidevteamHome();
  const intended = path.join(home, 'kb-proposals');
  if (create) {
    try { fs.mkdirSync(intended, { recursive: true }); } catch { return null; }
  } else if (!safeExists(intended)) {
    return null;
  }
  let root;
  let realHome;
  try { root = fs.realpathSync(intended); } catch { return null; }
  try { realHome = fs.realpathSync(home); } catch { return null; }
  return isContained(realHome, root) ? root : null;
}

function safeExists(p) { try { return fs.existsSync(p); } catch { return false; } }
function isContained(root, child) { return child === root || child.startsWith(root + path.sep); }

// A proposal id is server-generated and must be a plain token so it can never encode
// a path separator, a parent ref, or an extension when used to derive the record file.
function isSafeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

function recordPath(dir, id) {
  return path.join(dir, `${id}.json`);
}

// Read one proposal record file. Bounded (oversize -> skipped), prototype-safe
// (forbidden keys dropped, own-property assignment only), never throws. Returns a
// sanitized record or null when the file is missing/malformed/hostile.
function readRecord(dir, file) {
  const full = path.join(dir, file);
  let raw;
  try {
    const st = fs.statSync(full);
    if (!st.isFile() || st.size > MAX_RECORD_BYTES) return null;
    raw = fs.readFileSync(full, 'utf8');
  } catch { return null; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return sanitizeRecord(parsed);
}

// Build a clean projection of a stored record using own-property assignment only, so
// a `__proto__`/`constructor`/`prototype` key in the file cannot pollute the chain.
function sanitizeRecord(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = obj[k];
  }
  if (!isSafeId(out.id)) return null;
  if (typeof out.status !== 'string') return null;
  out.title = typeof out.title === 'string' ? out.title : '';
  out.content = typeof out.content === 'string' ? out.content : '';
  out.why = typeof out.why === 'string' ? out.why : '';
  out.suggestedStack = Array.isArray(out.suggestedStack) ? out.suggestedStack.filter((t) => typeof t === 'string') : [];
  return out;
}

// List every stored record (any status). Never throws; a malformed file is skipped.
function listAll() {
  const dir = proposalsDir(false);
  if (!dir) return [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const rec = readRecord(dir, f);
    if (rec) out.push(rec);
  }
  out.sort((a, b) => String(a.proposedAt || '').localeCompare(String(b.proposedAt || '')));
  return out;
}

/** The inbox: only PENDING proposals (approved/rejected are not inbox items). */
function listPending() {
  return listAll().filter((p) => p.status === 'pending');
}

// Atomic write of a proposal record (tmp + fsync + rename). The id is server-derived
// and validated, so the target stays inside the store.
let tmpSeq = 0;
function writeRecord(dir, rec) {
  const target = recordPath(dir, rec.id);
  const tmp = `${target}.tmp.${process.pid}.${tmpSeq++}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(rec, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
}

function contentError(content) {
  if (typeof content !== 'string' || content.length === 0) return 'content required';
  if (CONTROL_CHARS.test(content)) return 'content must be text';
  if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) return 'content too large';
  if (Buffer.from(content, 'utf8').toString('utf8') !== content) return 'content must be text';
  return null;
}

function normScope(raw) {
  return SCOPES.has(raw) ? raw : 'project';
}
function clampText(raw, max) {
  return String(raw == null ? '' : raw).replace(CONTROL_CHARS, '').slice(0, max);
}

/**
 * Record a PENDING proposal. The id, status, and timestamps are server-set; the
 * client supplies only the untrusted display fields and the suggestions. Content is
 * bounded (size cap, text-only); suggested scope/stack/kind are normalized to the
 * closed vocabulary. Nothing is written into any recallable vault.
 *
 * @param input `{ title, content, suggestedScope?, suggestedStack?, suggestedKind?, source?, why? }`
 * @returns `{ ok:true, proposal }` or `{ ok:false, code:400, error }` (terse, no paths)
 */
function propose(input = {}) {
  const { title, content, suggestedScope, suggestedStack, suggestedKind, source, why } = input;
  if (typeof title !== 'string' || title.length === 0 || title.length > MAX_TITLE_LEN) return reject(400, 'invalid title');
  const cErr = contentError(content);
  if (cErr) return reject(400, cErr);

  const dir = proposalsDir(true);
  if (!dir) return reject(400, 'proposal store is not writable');

  const proposal = {
    id: crypto.randomUUID(),
    status: 'pending',
    title: clampText(title, MAX_TITLE_LEN),
    content,
    suggestedScope: normScope(suggestedScope),
    suggestedStack: normalizeStack(suggestedStack),
    suggestedKind: normalizeKind(suggestedKind),
    source: clampText(source || '/kai', 64),
    why: clampText(why, MAX_WHY_LEN),
    proposedAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
  };
  try { writeRecord(dir, proposal); } catch { return reject(400, 'could not record the proposal'); }
  return { ok: true, proposal };
}

// Re-read the stored PENDING proposal by id. A missing / non-pending (already-decided
// or rejected) / unsafe id yields null so the caller refuses without any write.
function loadPending(id) {
  if (!isSafeId(id)) return null;
  const dir = proposalsDir(false);
  if (!dir) return null;
  const rec = readRecord(dir, `${id}.json`);
  if (!rec || rec.id !== id || rec.status !== 'pending') return null;
  return rec;
}

/**
 * Approve a pending proposal: re-authorize against the STORED proposal by id, write
 * its content through the SAME guarded/contained addKbNote chokepoint at the chosen
 * server-validated scope, mark the proposal decided, and audit the decision.
 *
 * A foreign / forged / stale / already-decided id, or an out-of-enum scope, is
 * refused and NOTHING is written. The chosen scope (not the proposal's suggestion)
 * governs the write.
 *
 * @param projectDir the server-resolved project root (never client-supplied)
 * @param input `{ id, scope, by? }` — scope an enum {project, common}
 * @returns `{ ok:true, scope, doc }` or `{ ok:false, code, error }`
 */
async function approve(projectDir, input = {}) {
  const { id, scope, by } = input;
  if (!SCOPES.has(scope)) return reject(400, 'invalid scope');
  const proposal = loadPending(id);
  if (!proposal) return reject(404, 'proposal not found');

  // The write rides the same guarded/contained chokepoint at the CHOSEN scope, with
  // the proposal's normalized suggested tags. status is server-derived by scope.
  const r = writeModule().addKbNote(projectDir, {
    title: proposal.title,
    body: proposal.content,
    scope,
    stack: proposal.suggestedStack,
    kind: proposal.suggestedKind,
  });
  if (!r.ok) return reject(r.code || 400, r.error);

  proposal.status = scope === 'common' ? 'approved-common' : 'approved-project';
  proposal.decidedBy = clampText(by || 'user', 64);
  proposal.decidedAt = new Date().toISOString();
  persistDecision(projectDir, proposal, `approved as ${scope}`);
  return { ok: true, scope, doc: r.doc };
}

/**
 * Reject a pending proposal: mark it rejected, RETAIN it in the store for audit,
 * remove it from the inbox, and never recall it.
 *
 * @param projectDir the server-resolved project root (for the audit trail)
 * @param input `{ id, by?, note? }`
 * @returns `{ ok:true, proposal }` or `{ ok:false, code, error }`
 */
async function reject_(projectDir, input = {}) {
  const { id, by, note } = input;
  const proposal = loadPending(id);
  if (!proposal) return reject(404, 'proposal not found');
  proposal.status = 'rejected';
  proposal.decidedBy = clampText(by || 'user', 64);
  proposal.decidedAt = new Date().toISOString();
  if (note != null) proposal.note = clampText(note, MAX_WHY_LEN);
  persistDecision(projectDir, proposal, note ? `rejected: ${proposal.note}` : 'rejected');
  return { ok: true, proposal };
}

// Persist the decided record (retained) and append an audit entry to the project's
// append-only comment trail. The store dir already exists (the pending record lives
// there). A failed audit append must not undo the decision.
function persistDecision(projectDir, proposal, summary) {
  const dir = proposalsDir(false);
  if (dir) {
    try { writeRecord(dir, proposal); } catch { /* leave the prior record */ }
  }
  try {
    writeModule().appendComment(projectDir, `proposal-${proposal.id}`, {
      author: proposal.decidedBy,
      kind: 'proposal-decision',
      body: summary,
      state: proposal.status,
    });
  } catch { /* audit is best-effort; the decision still stands */ }
}

module.exports = { propose, listPending, listAll, approve, reject: reject_, proposalsDir };
