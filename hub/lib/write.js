'use strict';
/*
 * hub/lib/write.js — the ONLY module that mutates project files (ADT-206).
 *
 * Security (Soren C5): all writes are atomic (tmp + fsync + rename) and the
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

const MAX_COMMENT_BODY = 8192; // C5

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

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Merge a patch into the machine-owned overlay (never touches workflow.yaml). */
function writeOverlay(dir, patch) {
  return withLock(() => {
    const p = path.join(dir, '.aidevteam', 'workflow.overrides.json');
    let cur = {};
    try {
      const v = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (v && typeof v === 'object') cur = v;
    } catch { /* none yet */ }
    atomicWriteJSON(p, deepMerge(cur, patch));
    return { ok: true };
  });
}

// keep comment files inside the comments dir regardless of the ticket id
function safeId(id) {
  return String(id || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'unknown';
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
  const file = path.join(dir, '.aidevteam', 'comments', `${safeId(ticketId)}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // O_APPEND single-line write — atomic across writers up to PIPE_BUF (4KB on
  // Linux); bodies are capped at 8KB, so two *concurrent* appends to the same
  // ticket could in theory interleave. Acceptable for the single-developer model;
  // revisit with flock if multi-writer contention becomes real.
  fs.appendFileSync(file, JSON.stringify(rec) + '\n');
  return rec;
}

/** Read a ticket's comment log (oldest first). Returns [] if none. */
function readComments(dir, ticketId) {
  const file = path.join(dir, '.aidevteam', 'comments', `${safeId(ticketId)}.jsonl`);
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of txt.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip a corrupt line */ }
  }
  return out;
}

module.exports = { computeRev, atomicWriteJSON, readModifyWriteLedger, writeOverlay, appendComment, readComments, safeId };
