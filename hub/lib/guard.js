'use strict';
/*
 * Control-plane request guard.
 *
 * A server bound to 127.0.0.1 is still reachable by ANY website the developer
 * visits (the browser will happily POST to http://127.0.0.1:4477). So binding to
 * loopback does NOT protect the write API. Every mutating request must clear:
 *
 *   1. a custom request header (X-AIDT) — a cross-origin page cannot send it
 *      without a CORS preflight, which this server never grants → blocks the
 *      classic "malicious site drives your localhost" CSRF.
 *   2. a Host header pinned to loopback — defeats DNS-rebinding.
 *   3. an Origin (when present) pinned to loopback — defeats cross-site fetch.
 *   4. a loopback socket — unless --allow-remote-writes is explicitly set.
 *
 * The server also never emits permissive CORS headers. GET/SSE (read-only) may
 * skip this; only writes go through it.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function hostAllowed(req, port) {
  const host = String((req.headers && req.headers.host) || '').toLowerCase();
  if (!host) return false;
  // strip a trailing :port (handle bracketed IPv6 too)
  const m = host.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!m) return false;
  const name = m[1].replace(/^\[|\]$/g, '');
  const p = m[2];
  if (!LOOPBACK_HOSTS.has(name)) return false;
  return p == null || p === String(port);
}

function originAllowed(req, port) {
  const o = req.headers && req.headers.origin;
  if (!o) return true; // non-browser clients (curl, the hook) send no Origin
  let u;
  try { u = new URL(o); } catch { return false; }
  if (!LOOPBACK_HOSTS.has(u.hostname)) return false;
  return u.port === '' || u.port === String(port);
}

function hasCsrfHeader(req) {
  return !!(req.headers && req.headers['x-aidt'] != null);
}

function isLoopbackSocket(req) {
  const a = String((req.socket && req.socket.remoteAddress) || '');
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

/** Decide whether a mutating request may proceed. Returns {ok} or {ok,code,reason}. */
function writeAllowed(req, { port, allowRemote }) {
  if (!hasCsrfHeader(req)) return { ok: false, code: 403, reason: 'missing X-AIDT header' };
  if (!hostAllowed(req, port)) return { ok: false, code: 403, reason: 'Host not loopback' };
  if (!originAllowed(req, port)) return { ok: false, code: 403, reason: 'cross-site Origin' };
  if (!allowRemote && !isLoopbackSocket(req)) return { ok: false, code: 403, reason: 'remote writes disabled' };
  return { ok: true };
}

/**
 * Decide whether a per-project SSE subscription may open. Opening a stream
 * discloses one project's live activity and pins a watcher, so it carries the same
 * anti-DNS-rebinding / anti-cross-site posture as a write — loopback Host, loopback
 * Origin (when present), and a loopback socket. It does NOT require X-AIDT: a
 * browser EventSource cannot set a custom request header, so the Host/Origin/socket
 * loopback pinning is the operative control (a cross-site EventSource still sends an
 * Origin, which is refused here). Returns {ok} or {ok,code,reason}.
 */
function streamAllowed(req, { port, allowRemote }) {
  if (!hostAllowed(req, port)) return { ok: false, code: 403, reason: 'Host not loopback' };
  if (!originAllowed(req, port)) return { ok: false, code: 403, reason: 'cross-site Origin' };
  if (!allowRemote && !isLoopbackSocket(req)) return { ok: false, code: 403, reason: 'remote stream disabled' };
  return { ok: true };
}

module.exports = { writeAllowed, streamAllowed, hostAllowed, originAllowed, hasCsrfHeader, isLoopbackSocket };
