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
    return ok({ projects: await registry.list() });
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

function isWrite(method) { return method === 'POST' || method === 'DELETE'; }

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
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { return sendJson(res, 400, { ok: false, error: 'bad url' }); }
    const realPort = (req.socket && req.socket.localPort) || port;

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

module.exports = { handle, projectsTail, createServer };
