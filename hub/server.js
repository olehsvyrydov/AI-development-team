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
const { writeAllowed } = require('./lib/guard');
const api = require('./lib/api');
const projects = require('./lib/projects');
const { createRegistry } = require('./lib/registry');
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
function buildState() {
  const st = lib.buildState(PROJECT);
  const sel = st.tickets.find((t) => String(t.stage).toLowerCase() !== 'done') || st.tickets[0] || null;
  return Object.assign({}, st, {
    writable: true, // this hub instance supports the control-plane POST API
    ticket: sel ? sel.id : null,
    stage: sel ? sel.stage : null,
    track: sel ? sel.track : null,
    gates: sel ? sel.gates : [],
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ---- SSE: watch the inputs, push on change ---------------------------------
const clients = new Set();
const watched = new Set();
function broadcast() {
  const payload = `event: update\ndata: ${JSON.stringify(buildState())}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch { clients.delete(res); } }
}
let debounce = null;
// on any change, re-scan for newly-created targets (idempotent) then push
function onChange() { clearTimeout(debounce); debounce = setTimeout(() => { startWatchers(); broadcast(); }, 150); }
function watch(p) {
  if (watched.has(p) || !safeExists(p)) return;
  try { fs.watch(p, { persistent: true }, onChange); watched.add(p); } catch {}
}
function startWatchers() {
  // watch the project root too, so creating .aidevteam/, docs/, backlog/, etc.
  // AFTER startup is caught (then re-scanned for deeper watchers on the next tick)
  watch(PROJECT);
  ['.workflow-state.json', 'Backlog.md',
   '.aidevteam', '.aidevteam/tickets', '.aidevteam/kb', '.aidevteam/comments', '.claude/workflow',
   'backlog', 'backlog/tasks', 'docs', 'kb']
    .forEach(rel => watch(path.join(PROJECT, rel)));
  watch(path.join(os.homedir(), '.aidevteam'));   // user-level workflow override
  const wf = findWorkflow(); if (wf) watch(wf);    // the active workflow file directly
}

// ---- HTTP ------------------------------------------------------------------
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('Bad Request'); }
  if (pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(buildState()));
  }
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    // keep the stream open: disable request/socket idle timeouts for SSE
    res.setTimeout(0);
    if (req.socket) req.socket.setTimeout(0);
    res.write(`event: update\ndata: ${JSON.stringify(buildState())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  // ---- read-only directory browser: /api/fs/* (folder picker) --------------
  // these GETs disclose local filesystem structure, so they carry the write guard
  // (anti-CSRF / anti-DNS-rebinding) before any FS work, same as the write API
  if (pathname === '/api/fs/roots' || pathname === '/api/fs/list') {
    const gate = writeAllowed(req, { port: PORT, allowRemote: ALLOW_REMOTE });
    if (!gate.ok) return sendJson(res, gate.code, { ok: false, error: gate.reason });
    let query = null;
    try { query = new URL(req.url, 'http://localhost').searchParams; } catch {}
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
      Promise.resolve(api.handle(route, data, PROJECT))
        .then((r) => sendJson(res, r.code, r.payload))
        .catch((e) => sendJson(res, 500, { ok: false, error: String(e && e.message || e) }));
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

startWatchers();
server.listen(PORT, HOST, () => {
  const isAny = (HOST === '0.0.0.0' || HOST === '::');
  const shown = isAny ? 'localhost' : (HOST.includes(':') ? `[${HOST}]` : HOST);  // bracket IPv6 literals
  console.log(`AI Dev Team Hub → http://${shown}:${PORT}`);
  console.log(`  project: ${PROJECT}`);
  const wf = findWorkflow();
  console.log(`  workflow: ${wf ? path.relative(PROJECT, wf) : '(none found — showing empty board)'}`);
});
