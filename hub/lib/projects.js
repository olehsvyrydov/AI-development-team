'use strict';
/*
 * Control-plane route handlers for the multi-project registry.
 *
 *   GET    /api/projects           list connected projects
 *   POST   /api/projects/connect   { path } → connect + analyze a folder
 *   GET    /api/projects/:id        one project (record + profile + state)
 *   DELETE /api/projects/:id        forget a project (index entry only)
 *
 * Reads (GET) are open like /api/state. Writes (POST, DELETE) are mutations and the
 * HTTP layer puts them behind guard.js::writeAllowed before dispatch — the same
 * gauntlet the existing POST /api/<route> uses; this module is never reached for a
 * write that has not cleared the guard.
 *
 * The :id path parameter is validated as a 12-hex id and looked up in the registry;
 * it is never concatenated into a filesystem path. The project id is always derived
 * server-side from the connected folder, never taken from the request.
 *
 * Returns { code, payload } like hub/lib/api.js.
 */
const http = require('node:http');
const os = require('node:os');
const { createRegistry, HEX_ID } = require('./registry');
const { analyze, readProfile } = require('./analyze');
const { listSummary } = require('./state');
const { listDirectory, listRoots, realHome } = require('./fs-browse');
const { writeAllowed } = require('./guard');
const { readJsonBody } = require('./http-body');

const ok = (extra) => ({ code: 200, payload: { ok: true, ...extra } });
const bad = (error) => ({ code: 400, payload: { ok: false, error } });
const notFound = (error) => ({ code: 404, payload: { ok: false, error: error || 'not found' } });

// strip the /api/projects prefix → the remaining segments
function projectsTail(pathname) {
  const m = pathname.match(/^\/api\/projects(?:\/(.*))?$/);
  if (!m) return null;
  return m[1] == null ? [] : m[1].split('/').filter((s) => s.length > 0);
}

/**
 * Dispatch a projects/* request. `deps.registry` supplies storage; `data` is the
 * parsed JSON body (writes only). Returns { code, payload }; returns null if the
 * path is not a projects route so the caller can fall through.
 */
async function handle(method, pathname, data, deps) {
  const tail = projectsTail(pathname);
  if (tail == null) return null;
  const registry = deps.registry;

  if (method === 'GET' && tail.length === 0) {
    // enrich each record with a compact {open, needsYou} so the home view needs no
    // N+1; a project whose state cannot be built omits the field (absent-not-zero)
    // and never fails the whole list
    const records = await registry.list();
    const projects = records.map((rec) => {
      const summary = listSummary(rec.path);
      return summary ? { ...rec, taskSummary: summary } : { ...rec };
    });
    return ok({ projects });
  }

  if (method === 'POST' && tail.length === 1 && tail[0] === 'connect') {
    const folder = data && data.path;
    let record;
    let existed = false;
    try {
      const before = await registry.list();
      record = await registry.connect(folder);
      existed = before.some((p) => p.id === record.id);
    } catch (e) {
      return bad(String((e && e.message) || 'invalid path'));
    }
    const created = !existed;
    let profile = null;
    let state = null;
    try {
      const result = analyze(record.path);
      profile = result.profile;
      state = result.state;
    } catch (e) {
      // never leave a half-registered project: keep the registration, return a
      // placeholder profile carrying the failure so the UI can offer a re-run
      profile = { error: String((e && e.message) || 'analysis failed') };
    }
    return ok({ created, project: record, profile, state });
  }

  if (tail.length === 1 && HEX_ID.test(tail[0])) {
    const id = tail[0];
    if (method === 'GET') {
      const record = await registry.get(id);
      if (!record) return notFound('unknown project');
      // a GET is read-only: return the stored profile + fresh state, never
      // re-analyzing or re-writing profile.json (analysis happens on connect)
      let profile = null;
      let state = null;
      try {
        const result = readProfile(record.path);
        profile = result.profile;
        state = result.state;
      } catch (e) {
        profile = { error: String((e && e.message) || 'read failed') };
      }
      return ok({ project: record, profile, state });
    }
    if (method === 'DELETE') {
      const r = await registry.remove(id);
      if (!r.removed) return notFound('unknown project');
      return ok({ removed: true });
    }
  }

  // a :id segment that is not a 12-hex id never maps to a project (and is never
  // used as a path) → treat as not found rather than attempting any lookup
  if (tail.length === 1 && (method === 'GET' || method === 'DELETE')) {
    return notFound('unknown project');
  }

  return bad('unsupported projects route');
}

/**
 * Dispatch a read-only filesystem-browser request (GET /api/fs/roots,
 * GET /api/fs/list?path=). Returns { code, payload } or null when the path is not
 * an fs route. The browse root is realpath($HOME); `recent` comes from the
 * registry's canonical roots. The HTTP layer applies the write guard before this
 * is reached, because the disclosure of home-directory structure is a capability.
 */
async function handleFs(method, pathname, query, deps) {
  if (pathname !== '/api/fs/roots' && pathname !== '/api/fs/list') return null;
  if (method !== 'GET') return { code: 405, payload: { ok: false, error: 'method not allowed' } };

  const home = (deps && deps.browseRoot) || realHome();
  if (pathname === '/api/fs/roots') {
    const records = await deps.registry.list();
    const recent = records.map((r) => ({ label: r.label, path: r.path }));
    const r = listRoots(home, recent);
    return { code: 200, payload: r };
  }

  const r = listDirectory(home, query && query.get ? query.get('path') : null);
  if (!r.ok) return { code: r.code || 400, payload: { ok: false, error: r.reason } };
  return { code: 200, payload: r };
}

function isWrite(method) { return method === 'POST' || method === 'DELETE'; }

function isFsPath(pathname) { return pathname === '/api/fs/roots' || pathname === '/api/fs/list'; }

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

/**
 * A standalone HTTP server exposing only the projects/* routes — used by tests and
 * as a self-contained surface. The production hub mounts handle() inside its own
 * server (hub/server.js); this mirrors that wiring (guard on writes, body cap).
 */
function createServer({ home = os.homedir(), port = 4477, allowRemote = false } = {}) {
  const registry = createRegistry({ home });
  let browseRoot;
  try { browseRoot = require('node:fs').realpathSync(home); } catch { browseRoot = home; }
  return http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { return sendJson(res, 400, { ok: false, error: 'bad url' }); }
    const pathname = url.pathname;
    const realPort = (req.socket && req.socket.localPort) || port;

    // the fs/* reads disclose local filesystem structure, so they carry the write
    // guard even though they are GETs (anti-CSRF / anti-DNS-rebinding)
    if (isFsPath(pathname)) {
      const gate = writeAllowed(req, { port: realPort, allowRemote });
      if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
      Promise.resolve(handleFs(req.method, pathname, url.searchParams, { registry, browseRoot }))
        .then((r) => r ? sendJson(res, r.code, r.payload) : sendJson(res, 404, { ok: false, error: 'unknown route' }))
        .catch((e) => sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }));
      return;
    }

    const dispatch = (data) => {
      Promise.resolve(handle(req.method, pathname, data, { registry }))
        .then((r) => {
          if (!r) return sendJson(res, 404, { ok: false, error: 'unknown route' });
          sendJson(res, r.code, r.payload);
        })
        .catch((e) => sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }));
    };

    if (isWrite(req.method)) {
      const gate = writeAllowed(req, { port: realPort, allowRemote });
      if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
      return readJsonBody(req, (err, data) => {
        if (err) return sendJson(res, err.message === 'body too large' ? 413 : 400, { ok: false, error: err.message });
        dispatch(data);
      });
    }
    dispatch(null);
  });
}

module.exports = { handle, handleFs, projectsTail, createServer };
