'use strict';
/*
 * hub/lib/state.js — the single, file-derived workflow projection (ADT-203).
 *
 * Extracted from hub/server.js and extended: parses `tracks`, merges the
 * machine-owned overlay (.aidevteam/workflow.overrides.json), and returns EVERY
 * ticket with explicit track/stage/assignee/expectedOwner/status/gates plus a
 * `rev` for optimistic concurrency. Shared by the hub server, the digest CLI,
 * and (via that CLI) the memory SessionStart hook, so all three agree (AC-X3).
 *
 * Pure reads, no writes — never throws on missing/malformed inputs.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expectedOwner } = require('./stage-map');

function safeExists(p) { try { return fs.existsSync(p); } catch { return false; } }
function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function norm(s) { return String(s == null ? '' : s).replace(/['"]/g, '').trim(); }
function normState(s) {
  const v = String(s == null ? '' : s).toLowerCase().trim();
  if (['passed', 'approved', 'pass', 'ok', 'done', 'complete'].includes(v)) return 'passed';
  if (['rejected', 'reject', 'failed', 'fail', 'blocked'].includes(v)) return 'rejected';
  return 'pending';
}

// workflow.yaml resolution — project override -> user override -> installed -> bundled default
function findWorkflow(project) {
  const candidates = [
    path.join(project, '.aidevteam', 'workflow.yaml'),
    path.join(os.homedir(), '.aidevteam', 'workflow.yaml'),
    path.join(project, '.claude', 'workflow', 'workflow.yaml'),
    path.join(__dirname, '..', '..', 'claude', 'workflow', 'workflow.yaml'),
  ];
  return candidates.find(safeExists) || null;
}
function wfLabel(project, wfPath) {
  if (!wfPath) return null;
  const rel = path.relative(project, wfPath);
  if (!rel.startsWith('..')) return rel;
  const home = os.homedir();
  if (wfPath === home || wfPath.startsWith(home + path.sep)) return '~/' + path.relative(home, wfPath);
  return path.basename(wfPath);
}

// return the text of a top-level `key:` block (until the next top-level key)
function section(yaml, key) {
  const lines = yaml.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^' + key + ':\\s*(#.*)?$').test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function parseWorkflow(yaml) {
  const preset = (yaml.match(/^preset:\s*["']?([A-Za-z-]+)/m) || [])[1] || 'solo';
  const gates = [];
  for (const line of section(yaml, 'gates').split('\n')) {
    const m = line.match(/^\s+([A-Z][A-Z0-9_]*):\s*\{(.*)\}\s*$/);
    if (!m) continue;
    const body = m[2];
    gates.push({
      name: m[1],
      owner: norm((body.match(/owner:\s*["']?([^,}"']+)/) || [])[1] || ''),
      refusal: ((body.match(/refusal:\s*["']?(\w+)/) || [])[1] || '').toLowerCase() === 'hard' ? 'hard' : 'soft',
      safety: /safety_override:\s*true/.test(body),
      trigger: (body.match(/trigger:\s*\[([^\]]*)\]/) || [, ''])[1].split(',').map((s) => s.trim()).filter(Boolean),
    });
  }
  // tracks: each `name: [a, b, c]`
  const tracks = {};
  for (const line of section(yaml, 'tracks').split('\n')) {
    const m = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*\[([^\]]*)\]/);
    if (m) tracks[m[1]] = m[2].split(',').map((s) => norm(s)).filter(Boolean);
  }
  // always_required for EVERY preset (so an overlay preset switch re-resolves it)
  const presetsAR = {};
  let cur = null;
  for (const line of section(yaml, 'presets').split('\n')) {
    const head = line.match(/^\s{2}([A-Za-z-]+):(.*)$/);
    if (head) {
      cur = head[1];
      const inline = head[2].match(/always_required:\s*\[([^\]]*)\]/);
      if (inline) presetsAR[cur] = inline[1].split(',').map(norm).filter(Boolean);
      continue;
    }
    if (cur) {
      const ar = line.match(/always_required:\s*\[([^\]]*)\]/);
      if (ar) presetsAR[cur] = ar[1].split(',').map(norm).filter(Boolean);
    }
  }
  return { preset, gates, tracks, alwaysRequired: presetsAR[preset] || [], presetsAR };
}

// deep-merge the machine-owned overlay over the parsed base (overlay wins per key)
function applyOverlay(wf, project) {
  const p = path.join(project, '.aidevteam', 'workflow.overrides.json');
  if (!safeExists(p)) return { wf, overlayPath: null };
  let ov;
  try { ov = JSON.parse(safeRead(p)); } catch { return { wf, overlayPath: null }; }
  if (!ov || typeof ov !== 'object') return { wf, overlayPath: null };
  const effPreset = typeof ov.preset === 'string' ? ov.preset : wf.preset;
  const presetsAR = wf.presetsAR || {};
  const merged = {
    preset: effPreset,
    tracks: { ...wf.tracks, ...(ov.tracks || {}) },
    gates: mergeGates(wf.gates, ov.gates),
    // re-resolve always_required for the EFFECTIVE preset (overlay may switch it)
    alwaysRequired: Array.isArray(ov.alwaysRequired) ? ov.alwaysRequired : (presetsAR[effPreset] || wf.alwaysRequired),
    presetsAR,
  };
  return { wf: merged, overlayPath: p };
}
function mergeGates(base, ovGates) {
  if (!ovGates || typeof ovGates !== 'object') return base;
  const byName = new Map(base.map((g) => [g.name, { ...g }]));
  for (const [name, patch] of Object.entries(ovGates)) {
    const g = byName.get(name) || { name, owner: '', refusal: 'soft', safety: false, trigger: [] };
    byName.set(name, { ...g, ...patch, name });
  }
  return [...byName.values()];
}

function readLedger(project) {
  const p = path.join(project, '.workflow-state.json');
  if (!safeExists(p)) return { tickets: {}, error: null };
  try {
    const v = JSON.parse(safeRead(p));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { tickets: {}, error: 'ledger is not a ticket map' };
    return { tickets: v, error: null };
  } catch { return { tickets: {}, error: 'invalid JSON' }; }
}

// markdown ticket fallback (Backlog.md / .aidevteam/tickets) when the ledger is empty
function readTickets(project) {
  const dirs = [path.join(project, 'backlog', 'tasks'), path.join(project, 'backlog'), path.join(project, '.aidevteam', 'tickets')];
  const out = [];
  for (const dir of dirs) {
    if (!safeExists(dir)) continue;
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const txt = safeRead(path.join(dir, f));
      out.push({
        id: norm((txt.match(/^id:\s*(.+)$/m) || [])[1] || (f.match(/^([A-Za-z]+-?\d+)/) || [])[1] || f.replace(/\.md$/, '')),
        title: norm((txt.match(/^title:\s*(.+)$/m) || [])[1] || (txt.match(/^#\s+(.+)$/m) || [])[1] || f.replace(/\.md$/, '')),
        stage: norm((txt.match(/^status:\s*(.+)$/m) || [])[1] || 'unknown'),
        file: path.relative(project, path.join(dir, f)),
      });
    }
    if (out.length) break;
  }
  if (!out.length) {
    const bf = path.join(project, 'Backlog.md');
    if (safeExists(bf)) {
      const re = /^[-*]\s+\[([ xX])\]\s+(.+)$/gm;
      let m;
      while ((m = re.exec(safeRead(bf)))) {
        const title = m[2].trim();
        const id = (title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/) || [])[1] || `#${out.length + 1}`;
        out.push({ id, title, stage: /[xX]/.test(m[1]) ? 'done' : 'todo', file: 'Backlog.md' });
      }
    }
  }
  return out;
}

function readKb(project) {
  const dirs = ['docs', 'kb', '.aidevteam/kb'].map((d) => path.join(project, d));
  const dir = dirs.find(safeExists);
  if (!dir) return [];
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
      .map((f) => ({ name: f.replace(/\.md$/, ''), file: path.relative(project, path.join(dir, f)) }));
  } catch { return []; }
}

function statusOf(stage, mergedGates, assignee) {
  const s = String(stage || '').toLowerCase();
  if (s === 'done') return 'done';
  for (const g of mergedGates) if (g.state === 'rejected' && g.refusal === 'hard') return 'blocked';
  if (assignee) return 'in_progress';
  return 'waiting';
}

function fileRev(project) {
  let rev = '';
  for (const rel of ['.workflow-state.json', '.aidevteam/workflow.overrides.json']) {
    try {
      const st = fs.statSync(path.join(project, rel));
      rev += `${rel}:${st.mtimeMs}:${st.size};`;
    } catch { /* absent */ }
  }
  return rev || '0';
}

/** Build the full, multi-ticket workflow projection for a project directory. */
function buildState(project) {
  const wfPath = findWorkflow(project);
  const base = wfPath ? parseWorkflow(safeRead(wfPath)) : { preset: 'solo', gates: [], tracks: {}, alwaysRequired: [] };
  const { wf, overlayPath } = applyOverlay(base, project);
  const { tickets: ledger, error: ledgerError } = readLedger(project);

  const gateDefs = wf.gates.map((g) => ({ ...g, required: wf.alwaysRequired.includes(g.name) }));
  const stageOwners = {};
  for (const seq of Object.values(wf.tracks)) for (const stage of seq) {
    if (!(stage in stageOwners)) stageOwners[stage] = expectedOwner(stage, wf);
  }

  let tickets = Object.entries(ledger)
    .filter(([, t]) => t && typeof t === 'object')
    .map(([id, t]) => {
      const tg = t.gates || {};
      const gates = wf.gates.map((g) => {
        const e = tg[g.name] || {};
        return { ...g, required: wf.alwaysRequired.includes(g.name), state: normState(e.state), by: e.by || null, at: e.at || null, note: e.note || null };
      });
      const assignee = t.assignee || null;
      return {
        id,
        title: t.title || id,
        track: t.track || null,
        stage: t.stage || t.track || 'unknown',
        assignee,
        assigned_at: t.assigned_at || null,
        active: t.active || null,
        expectedOwner: expectedOwner(t.stage, wf),
        status: statusOf(t.stage, gates, assignee),
        gates,
        source: 'ledger',
      };
    });

  // fall back to markdown tickets when the ledger has none
  if (!tickets.length) {
    tickets = readTickets(project).map((t) => ({
      id: t.id, title: t.title, track: null, stage: t.stage, assignee: null, assigned_at: null,
      active: null, expectedOwner: expectedOwner(t.stage, wf), status: statusOf(t.stage, [], null),
      gates: gateDefs.map((g) => ({ ...g, state: 'pending', by: null, at: null, note: null })),
      file: t.file, source: 'markdown',
    }));
  }

  return {
    project: path.basename(project),
    workflow: wfLabel(project, wfPath),
    overlay: overlayPath ? path.relative(project, overlayPath) : null,
    preset: wf.preset,
    tracks: wf.tracks,
    gateDefs,
    stageOwners,
    tickets,
    ticketCount: tickets.length,
    ledgerError,
    kb: readKb(project),
    rev: fileRev(project),
  };
}

module.exports = { buildState, parseWorkflow, findWorkflow, normState, wfLabel, section, safeExists, safeRead };
