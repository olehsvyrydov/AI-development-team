#!/usr/bin/env node
/*
 * AI Dev Team — local Hub
 * A zero-dependency dashboard for the proportional workflow: live gate board,
 * tickets, and knowledge base for any project. Reads the file-based defaults
 * (no Jira/Confluence/MCP required) and live-updates via SSE on file changes.
 *
 *   node hub/server.js [projectDir] [--port 4477]
 *
 * projectDir defaults to the current directory.
 *
 * The state projection lives in hub/lib/state.js (shared with hub/lib/digest.js
 * and, via that CLI, the memory SessionStart hook) so every consumer agrees.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
let PROJECT = process.cwd();
let PORT = 4477;
let HOST = '127.0.0.1';   // serves local paths/state — bind to loopback by default
let ALLOW_REMOTE = false; // writes are refused off-loopback unless this is set
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') PORT = parseInt(argv[++i], 10) || PORT;
  else if (argv[i] === '--host') HOST = argv[++i] || HOST;
  else if (argv[i] === '--allow-remote-writes') ALLOW_REMOTE = true;
  else if (argv[i] === '--help' || argv[i] === '-h') {
    console.log('Usage: node hub/server.js [projectDir] [--port N] [--host ADDR]');
    console.log('  Binds to 127.0.0.1 by default; pass --host 0.0.0.0 to allow LAN access.');
    process.exit(0);
  } else if (!argv[i].startsWith('-')) PROJECT = path.resolve(argv[i]);
}
// fail fast on a bad projectDir rather than silently showing an empty board
try {
  if (!fs.statSync(PROJECT).isDirectory()) throw new Error('not a directory');
} catch {
  console.error(`Error: projectDir is not a directory: ${PROJECT}`);
  process.exit(1);
}
const SELF_DIR = __dirname;

// ---- state projection (shared lib: hub/lib/state.js) -----------------------
const lib = require('./lib/state');
const { writeAllowed, streamAllowed } = require('./lib/guard');
const api = require('./lib/api');
const knowledgeQa = require('./lib/knowledge-qa');
const projects = require('./lib/projects');
const { createRegistry } = require('./lib/registry');
const { resolveProject } = require('./lib/resolve-project');
const { createChannels } = require('./lib/channels');
const { createRollup } = require('./lib/rollup');
const { readJsonBody } = require('./lib/http-body');
const { createStaticSpa } = require('./lib/static-spa');
const { safeExists, safeRead } = lib;

// production Cockpit build (Angular `@angular/build` → dist/<project>/browser);
// served same-origin at `/` so the page reaches network-idle (no HMR socket).
// When absent (undeployed), the server falls back to the legacy board below.
const cockpit = createStaticSpa(
  path.join(SELF_DIR, '..', 'studio', 'cockpit', 'dist', 'cockpit', 'browser'));

// user-global project registry (~/.aidevteam/registry.json) for the projects/* API
const registry = createRegistry({ home: os.homedir() });

// the single allowed root for the directory browser: realpath($HOME), resolved once
let BROWSE_ROOT;
try { BROWSE_ROOT = fs.realpathSync(os.homedir()); } catch { BROWSE_ROOT = os.homedir(); }

// the active workflow path for this project (used by the watcher + startup log)
function findWorkflow() { return lib.findWorkflow(PROJECT); }

// API/SSE payload = the shared multi-ticket projection PLUS legacy single-ticket
// aliases (ticket/stage/track/gates) so the current read-only UI keeps working
// until the Phase-4 board replaces it. New consumers use tickets[]/tracks/etc.
function buildStateFor(dir) {
  const st = lib.buildState(dir);
  const sel = st.tickets.find((t) => String(t.stage).toLowerCase() !== 'done') || st.tickets[0] || null;
  return Object.assign({}, st, {
    writable: true, // this hub instance supports the control-plane POST API
    ticket: sel ? sel.id : null,
    stage: sel ? sel.stage : null,
    track: sel ? sel.track : null,
    gates: sel ? sel.gates : [],
  });
}
function buildState() { return buildStateFor(PROJECT); }

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ---- SSE: per-project channels (isolation + bounded, refcounted watchers) ---
// Each resolved project has its own channel + watcher set; a writer to project A
// broadcasts only to A's subscribers. Channels are created on first subscriber,
// torn down on last, and capped to bound the file-descriptor budget.
const channels = createChannels({
  render: (dir) => JSON.stringify(buildStateFor(dir)),
  findWorkflow: (dir) => lib.findWorkflow(dir),
  // Edge-triggered deterministic engine: on any file change to a watched project,
  // derive the new events off the comment-log tail and apply matched rules through
  // the CAS writers BEFORE the SSE frame is broadcast. A tick failure is swallowed
  // by the channel hook and never blocks the push.
  onChange: (dir) => api.runEngineTick(dir),
});

// ---- SSE: cross-project rollup ---------------------------------------------
// One stream mirrors EVERY registered project: it subscribes in-process sinks to
// the same per-project channels (reusing their refcount/cap/debounce/teardown),
// recomputes only the changed project per tick, merges into a cached rollup, and
// emits a single merged frame. The frame is a strict subset of /api/projects (no
// path, no ticket bodies). The project set is the server-side registry — no client
// list — so there is no id/path-injection surface and no new mutation route.
const rollup = createRollup({ channels, registry });

// ---- HTTP ------------------------------------------------------------------
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('Bad Request'); }
  let query = null;
  try { query = new URL(req.url, 'http://localhost').searchParams; } catch {}
  if (pathname === '/api/state') {
    // resolve the viewed project (?project=:id) the same way the stream does; a
    // crafted/unregistered id is refused (400/404), absent id ⇒ launch project
    return resolveProject(query && query.get('project'), { registry, launch: PROJECT }).then((r) => {
      if (!r.ok) return sendJson(res, r.code, { ok: false, error: r.error });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(buildStateFor(r.dir)));
    });
  }
  if (pathname === '/api/events/rollup') {
    // A cross-project mirror discloses every connected project's live activity and
    // pins watchers, so it is a capability: ride the SAME loopback Host/Origin/socket
    // pinning the per-project stream uses, applied BEFORE the registry is read or any
    // channel is opened. The project set is derived server-side; no client list is
    // accepted, so there is no id/path-injection surface here.
    const gate = streamAllowed(req, { port: PORT, allowRemote: ALLOW_REMOTE });
    if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.setTimeout(0);
    if (req.socket) req.socket.setTimeout(0);
    // subscribe() writes the first full snapshot and tears down on the request's
    // 'close', matching the per-project stream's unsubscribe trigger
    return rollup.subscribe(res, req).catch(() => { try { res.end(); } catch {} });
  }
  if (pathname === '/api/events') {
    // Opening a per-project stream discloses one project's live activity and pins a
    // watcher, so it is a capability: enforce loopback Host/Origin/socket pinning
    // BEFORE resolving the id or opening a channel. (EventSource cannot send X-AIDT,
    // so the stream guard pins Host/Origin/socket rather than requiring the header.)
    const gate = streamAllowed(req, { port: PORT, allowRemote: ALLOW_REMOTE });
    if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
    return resolveProject(query && query.get('project'), { registry, launch: PROJECT }).then((r) => {
      if (!r.ok) return sendJson(res, r.code, { ok: false, error: r.error });
      // refuse over the active-project cap BEFORE writing the SSE head, so the cap
      // refusal is a clean 503 (no channel opened, no watcher created)
      if (!channels.hasCapacity(r.dir)) {
        return sendJson(res, 503, { ok: false, error: 'too many active projects' });
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      // keep the stream open: disable request/socket idle timeouts for SSE
      res.setTimeout(0);
      if (req.socket) req.socket.setTimeout(0);
      const sub = channels.subscribe(r.dir, res); // writes the initial frame
      req.on('close', () => sub.close());
    });
  }
  // ---- read-only interpretation-check Q&A: GET /api/knowledge/ask ----------
  // A read over the project's already-visible knowledge (buildKnowledge scope). It
  // mutates nothing and only egresses when an overlay is enabled+healthy. It rides
  // the same loopback Host/Origin/socket pinning as the SSE stream (a capability that
  // can disclose local data and, when configured, egress); EventSource-style reads
  // cannot send X-AIDT, so Host/Origin/socket pinning is the operative control here.
  if (pathname === '/api/knowledge/ask') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    const gate = streamAllowed(req, { port: PORT, allowRemote: ALLOW_REMOTE });
    if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
    return resolveProject(query && query.get('project'), { registry, launch: PROJECT }).then((r) => {
      if (!r.ok) return sendJson(res, r.code, { ok: false, error: r.error });
      const question = (query && query.get('q')) || '';
      return knowledgeQa.ask(r.dir, question)
        .then((answer) => sendJson(res, 200, { ok: true, ...answer }))
        // never-throws contract: a degraded tier still answers; a true internal
        // failure returns a terse 200 honest-absence rather than a 500 stack leak
        .catch(() => sendJson(res, 200, {
          ok: true,
          answer: 'No note found on this topic in this project\'s scope.',
          matches: [],
          grounding: { method: 'none', source: 'filename-only', external: false, label: 'No note found on this topic in this project\'s scope.' },
          egressDisclosed: false,
        }));
    });
  }
  // ---- read-only directory browser: /api/fs/* (folder picker) --------------
  // these GETs disclose local filesystem structure, so they carry the write guard
  // (anti-CSRF / anti-DNS-rebinding) before any FS work, same as the write API
  if (pathname === '/api/fs/roots' || pathname === '/api/fs/list') {
    const gate = writeAllowed(req, { port: PORT, allowRemote: ALLOW_REMOTE });
    if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
    Promise.resolve(projects.handleFs(req.method, pathname, query, { registry, browseRoot: BROWSE_ROOT }))
      .then((r) => r ? sendJson(res, r.code, r.payload) : sendJson(res, 404, { ok: false, error: 'unknown route' }))
      .catch((e) => sendJson(res, 500, { ok: false, error: String(e && e.message || e) }));
    return;
  }

  // ---- multi-project registry: /api/projects[/...] -------------------------
  if (pathname === '/api/projects' || pathname.startsWith('/api/projects/')) {
    const write = req.method === 'POST' || req.method === 'DELETE';
    const finish = (data) => {
      Promise.resolve(projects.handle(req.method, pathname, data, { registry }))
        .then((r) => r ? sendJson(res, r.code, r.payload) : sendJson(res, 404, { ok: false, error: 'unknown route' }))
        .catch((e) => sendJson(res, 500, { ok: false, error: String(e && e.message || e) }));
    };
    if (write) {
      const gate = writeAllowed(req, { port: PORT, allowRemote: ALLOW_REMOTE });
      if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
      readJsonBody(req, (err, data) => {
        if (err) return sendJson(res, err.message === 'body too large' ? 413 : 400, { ok: false, error: err.message });
        finish(data);
      });
      return;
    }
    if (req.method === 'GET') { finish(null); return; }
    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  }

  // ---- control plane: POST /api/<route> ------------------------------------
  if (req.method === 'POST' && pathname.startsWith('/api/')) {
    // anti-CSRF + anti-DNS-rebinding gauntlet before any mutation
    const gate = writeAllowed(req, { port: PORT, allowRemote: ALLOW_REMOTE });
    if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
    const route = pathname.slice('/api/'.length);
    readJsonBody(req, (err, data) => {
      if (err) return sendJson(res, err.message === 'body too large' ? 413 : 400, { ok: false, error: err.message });
      // resolve the target project from the body's `project` id (guard already
      // cleared above — order is guard → resolve → CAS). A crafted/unregistered id
      // is refused here and api.handle is NEVER reached, so nothing is written.
      resolveProject(data && data.project, { registry, launch: PROJECT }).then((rp) => {
        if (!rp.ok) return sendJson(res, rp.code, { ok: false, error: rp.error });
        return Promise.resolve(api.handle(route, data, rp.dir)).then((r) => {
          if (r.code !== 200) return sendJson(res, r.code, r.payload);
          // a successful mutation may newly satisfy a rule's `when`; run the
          // deterministic engine tick before notifying subscribers so a label/
          // comment write that triggers a route is reflected in the pushed state.
          return Promise.resolve(api.runEngineTick(rp.dir)).catch(() => {}).then(() => {
            channels.push(rp.dir); // notify only the resolved project's subscribers
            sendJson(res, r.code, r.payload);
          });
        });
      }).catch((e) => sendJson(res, 500, { ok: false, error: String(e && e.message || e) }));
    });
    return;
  }

  // ---- legacy zero-dependency board (the original hub UI) ------------------
  if (pathname === '/legacy' || pathname === '/legacy/' || pathname.startsWith('/legacy/')) {
    return serveLegacyBoard(res);
  }

  // ---- production Cockpit SPA at `/` (same-origin, no HMR) ------------------
  // Non-/api, non-/legacy GETs serve the build; unknown client routes fall back
  // to its index.html. When the build is absent, serve the legacy board so the
  // server still works undeployed.
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (cockpit.tryServe(req, res, pathname)) return;
    return serveLegacyBoard(res);
  }
  res.writeHead(405, { 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
});

function serveLegacyBoard(res) {
  const file = path.join(SELF_DIR, 'public', 'index.html');
  if (!safeExists(file)) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    return res.end('Hub UI not found: ' + file);
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(safeRead(file));
}

// watchers are now per-project and lazy: a channel binds its own fs.watch set on
// the first subscriber to that project and tears it down on the last (no eager,
// always-on global watcher rooted at the launch project).
server.listen(PORT, HOST, () => {
  const isAny = (HOST === '0.0.0.0' || HOST === '::');
  const shown = isAny ? 'localhost' : (HOST.includes(':') ? `[${HOST}]` : HOST);  // bracket IPv6 literals
  console.log(`AI Dev Team Hub → http://${shown}:${PORT}`);
  console.log(`  project: ${PROJECT}`);
  const wf = findWorkflow();
  console.log(`  workflow: ${wf ? path.relative(PROJECT, wf) : '(none found — showing empty board)'}`);
});
