'use strict';
/*
 * Per-ticket comment log access — read side plus filename sanitization.
 *
 * Kept free of any dependency on the state projection or the write path so it
 * can be shared by both without forming a require cycle. The comment log is an
 * append-only JSONL file, one record per line, stored per ticket.
 */
const fs = require('node:fs');
const path = require('node:path');

// keep comment files inside the comments dir regardless of the ticket id
function safeId(id) {
  return String(id || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'unknown';
}

function commentFile(dir, ticketId) {
  return path.join(dir, '.aidevteam', 'comments', `${safeId(ticketId)}.jsonl`);
}

/** Read a ticket's comment log (oldest first). Returns [] if none. */
function readComments(dir, ticketId) {
  let txt;
  try { txt = fs.readFileSync(commentFile(dir, ticketId), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of txt.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip a corrupt line */ }
  }
  return out;
}

module.exports = { safeId, commentFile, readComments };
