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
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') PORT = parseInt(argv[++i], 10) || PORT;
  else if (argv[i] === '--host') HOST = argv[++i] || HOST;
  else if (argv[i] === '--help' || argv[i] === '-h') {
    console.log('Usage: node hub/server.js [projectDir] [--port N] [--host ADDR]');
    console.log('  Binds to 127.0.0.1 by default; pass --host 0.0.0.0 to allow LAN access.');
    process.exit(0);
  } else if (!argv[i].startsWith('-')) PROJECT = path.resolve(argv[i]);
}
const SELF_DIR = __dirname;

// ---- locate the workflow definition (override cascade) ---------------------
function findWorkflow() {
  // The Hub's workflow resolution order (first found wins). Project + user overrides
  // match the engine contract; the "default" additionally covers a project-scope
  // install (.claude/workflow/) and running from the framework checkout (claude/workflow/),
  // ending at the Hub's own copy.
  const candidates = [
    path.join(PROJECT, '.aidevteam', 'workflow.yaml'),
    path.join(os.homedir(), '.aidevteam', 'workflow.yaml'),
    path.join(PROJECT, '.claude', 'workflow', 'workflow.yaml'),
    path.join(PROJECT, 'claude', 'workflow', 'workflow.yaml'),
    path.join(SELF_DIR, '..', 'claude', 'workflow', 'workflow.yaml'),
  ];
  return candidates.find(p => safeExists(p)) || null;
}
function safeExists(p) { try { return fs.existsSync(p); } catch { return false; } }
function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function norm(s) { return String(s ?? '').replace(/['"]/g, '').trim(); }

// ---- tolerant, regex-based YAML reading (only what the board needs) --------
function parseWorkflow(yaml) {
  const preset = (yaml.match(/^preset:\s*([A-Za-z-]+)/m) || [])[1] || 'solo';
  // gates: each is a single line `NAME: { owner: "..", refusal: hard, safety_override: true, trigger: [..] }`
  const gates = [];
  const gateBlock = section(yaml, 'gates');
  for (const line of gateBlock.split('\n')) {
    const m = line.match(/^\s+([A-Z][A-Z0-9_]*):\s*\{(.*)\}\s*$/);
    if (!m) continue;
    const body = m[2];
    gates.push({
      name: m[1],
      owner: (body.match(/owner:\s*"([^"]+)"/) || [])[1] || '',
      refusal: (body.match(/refusal:\s*(\w+)/) || [])[1] || 'soft',
      safety: /safety_override:\s*true/.test(body),
      trigger: (body.match(/trigger:\s*\[([^\]]*)\]/) || [, ''])[1]
        .split(',').map(s => s.trim()).filter(Boolean),
    });
  }
  // active preset's always_required — scan the presets block line by line
  let alwaysRequired = [];
  {
    let cur = null;
    for (const line of section(yaml, 'presets').split('\n')) {
      const head = line.match(/^\s{2}([A-Za-z-]+):\s*$/);
      if (head) { cur = head[1]; continue; }
      if (cur === preset) {
        const ar = line.match(/always_required:\s*\[([^\]]*)\]/);
        if (ar) { alwaysRequired = ar[1].split(',').map(s => s.trim()).filter(Boolean); break; }
      }
    }
  }
  return { preset, gates, alwaysRequired };
}

// return the text of a top-level `key:` block (until the next top-level key or EOF).
// Done line-by-line — robust for the LAST top-level key (regex EOF anchors are not).
function section(yaml, key) {
  const lines = yaml.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^' + key + ':\\s*$').test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;   // next top-level key
    out.push(lines[i]);
  }
  return out.join('\n');
}

// ---- ledger (.workflow-state.json) -----------------------------------------
// Canonical .workflow-state.json: a map keyed by ticket id, each with
// { title, track, stage, gates: { GATE: { state: passed|pending|rejected, by, at } } }.
function readLedger() {
  const p = path.join(PROJECT, '.workflow-state.json');
  if (!safeExists(p)) return { tickets: {}, error: null };
  try { return { tickets: JSON.parse(safeRead(p)) || {}, error: null }; }
  catch { return { tickets: {}, error: 'invalid JSON' }; }
}

// ---- tickets (Backlog.md / markdown) ---------------------------------------
function readTickets() {
  const dirs = [
    path.join(PROJECT, 'backlog', 'tasks'),
    path.join(PROJECT, 'backlog'),
    path.join(PROJECT, '.aidevteam', 'tickets'),
  ];
  const out = [];
  for (const dir of dirs) {
    if (!safeExists(dir)) continue;
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const txt = safeRead(path.join(dir, f));
      out.push({
        id: norm((txt.match(/^id:\s*(.+)$/m) || [])[1]
          || (f.match(/^([A-Za-z]+-?\d+)/) || [])[1] || f.replace(/\.md$/, '')),
        title: norm((txt.match(/^title:\s*(.+)$/m) || [])[1]
          || (txt.match(/^#\s+(.+)$/m) || [])[1] || f.replace(/\.md$/, '')),
        status: norm((txt.match(/^status:\s*(.+)$/m) || [])[1] || 'unknown'),
        file: path.relative(PROJECT, path.join(dir, f)),
      });
    }
    if (out.length) break; // first dir that has tickets wins
  }
  // Fallback: a single Backlog.md file at the project root (checkbox task list)
  if (!out.length) {
    const bf = path.join(PROJECT, 'Backlog.md');
    if (safeExists(bf)) {
      const re = /^[-*]\s+\[([ xX])\]\s+(.+)$/gm;
      let m;
      while ((m = re.exec(safeRead(bf)))) {
        const title = m[2].trim();
        const id = (title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/) || [])[1] || `#${out.length + 1}`;
        out.push({ id, title, status: /[xX]/.test(m[1]) ? 'done' : 'todo', file: 'Backlog.md' });
      }
    }
  }
  return out;
}

// ---- knowledge base (docs / vault) -----------------------------------------
function readKb() {
  const dirs = ['docs', 'kb', '.aidevteam/kb'].map(d => path.join(PROJECT, d));
  const dir = dirs.find(safeExists);
  if (!dir) return [];
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.md'))
      .map(f => ({ name: f.replace(/\.md$/, ''), file: path.relative(PROJECT, path.join(dir, f)) }));
  } catch { return []; }
}

// ---- assemble state --------------------------------------------------------
function buildState() {
  const wfPath = findWorkflow();
  const wf = wfPath ? parseWorkflow(safeRead(wfPath)) : { preset: 'solo', gates: [], alwaysRequired: [] };
  const { tickets: ledger, error: ledgerError } = readLedger();
  const valid = id => ledger[id] && typeof ledger[id] === 'object';
  const obj = id => (valid(id) ? ledger[id] : {});
  const ids = Object.keys(ledger);
  // tickets come from the ledger (canonical, keyed by id); fall back to markdown files if none
  let tickets = ids.map(id => {
    const t = obj(id);
    return { id, title: t.title || id, status: t.stage || t.track || 'unknown', source: 'ledger' };
  });
  if (!tickets.length) tickets = readTickets();
  // the gate board reflects ONE *valid* ticket: first not-yet-done, else the first valid one
  const selId = ids.find(id => valid(id) && (ledger[id].stage || '') !== 'done')
    || ids.find(valid) || null;
  const sel = selId ? obj(selId) : null;
  const malformed = ids.filter(id => !valid(id));
  const selGates = (sel && sel.gates) || {};
  const gates = wf.gates.map(g => {
    const e = selGates[g.name] || {};
    return {
      ...g,
      required: wf.alwaysRequired.includes(g.name),
      state: e.state || 'pending',   // passed | pending | rejected
      by: e.by || null,
      at: e.at || null,
    };
  });
  return {
    project: path.basename(PROJECT),   // dir name only — don't leak the absolute path over the API
    workflow: wfPath ? path.relative(PROJECT, wfPath) : null,
    preset: wf.preset,
    ticket: selId,
    stage: (sel && sel.stage) || null,
    track: (sel && sel.track) || null,
    ticketCount: ids.length,
    ledgerError: ledgerError || (malformed.length ? `${malformed.length} malformed ticket entr${malformed.length > 1 ? 'ies' : 'y'}` : null),
    gates,
    tickets,
    kb: readKb(),
  };
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
   '.aidevteam', '.aidevteam/tickets', '.aidevteam/kb', '.claude/workflow', 'claude/workflow',
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
  // static: index.html
  const file = path.join(SELF_DIR, 'public', 'index.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(safeRead(file));
});

startWatchers();
server.listen(PORT, HOST, () => {
  const isAny = (HOST === '0.0.0.0' || HOST === '::');
  const shown = isAny ? 'localhost' : (HOST.includes(':') ? `[${HOST}]` : HOST);  // bracket IPv6 literals
  console.log(`AI Dev Team Hub → http://${shown}:${PORT}`);
  console.log(`  project: ${PROJECT}`);
  const wf = findWorkflow();
  console.log(`  workflow: ${wf ? path.relative(PROJECT, wf) : '(none found — showing empty board)'}`);
});
