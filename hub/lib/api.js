'use strict';
/*
 * hub/lib/api.js — control-plane route handlers.
 *
 * Pure-ish over (route, data, project): validate input, mutate via lib/write.js
 * (atomic CAS for the ledger, overlay-only for workflow edits), and emit the
 * same typed comment a CLI agent would so the audit trail stays uniform.
 * Returns { code, payload }. The HTTP layer adds the request guard + body cap.
 */
const w = require('./write');
const { buildState } = require('./state');

const PRESETS = ['solo', 'small-team', 'regulated'];
const GATE_STATES = ['passed', 'pending', 'rejected'];

const STAGE_NAME_MAX = 64;
const OWNER_MAX = 64;
// Keys that, used as a stage/owner name, would corrupt the overlay object or the
// state projection by shadowing prototype/internal fields. Refused outright.
const FORBIDDEN_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

// True if any NUL / C0 control char is present (rejected in any free text field).
function hasControlChar(text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

// A stage NAME additionally bans path separators, so it can never become a path
// or an object key that escapes downstream. (Owners are agent tokens like "/be",
// so they may carry a leading slash — only control chars are banned there.)
function hasUnsafeChar(text) {
  if (hasControlChar(text)) return true;
  return text.includes('/') || text.includes('\\');
}

// Normalize one declarative stage entry to { name, owner } or null when malformed.
// A plain string is shorthand for { name } (back-compat with track/reorder).
function normStage(entry) {
  const e = typeof entry === 'string' ? { name: entry } : entry;
  if (!e || typeof e !== 'object' || typeof e.name !== 'string') return null;
  if (e.owner != null && typeof e.owner !== 'string') return null;
  return { name: e.name.trim(), owner: e.owner != null ? e.owner.trim() : '' };
}

// Validate the full ordered stage list against its own contract (NOT a permutation
// — add/delete/move are allowed). Returns { stages, owners } or { error }.
function validateStageList(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return { error: 'stages must be a non-empty list' };
  const seen = new Set();
  const names = [];
  const owners = {};
  for (const entry of stages) {
    const s = normStage(entry);
    if (!s) return { error: 'invalid stage entry' };
    if (!s.name || s.name.length > STAGE_NAME_MAX) return { error: 'stage name empty or too long' };
    if (hasUnsafeChar(s.name) || FORBIDDEN_NAMES.has(s.name)) return { error: 'invalid stage name' };
    if (seen.has(s.name)) return { error: 'duplicate stage name' };
    if (s.owner) {
      if (s.owner.length > OWNER_MAX) return { error: 'owner too long' };
      if (hasControlChar(s.owner) || FORBIDDEN_NAMES.has(s.owner)) return { error: 'invalid owner' };
      owners[s.name] = s.owner;
    }
    seen.add(s.name);
    names.push(s.name);
  }
  return { stages: names, owners };
}

const ok = (state, extra) => ({ code: 200, payload: { ok: true, ...extra, state } });
const bad = (error) => ({ code: 400, payload: { ok: false, error } });
const conflict = (state) => ({ code: 409, payload: { ok: false, conflict: true, state } });

function isPermutation(a, b) {
  if (!Array.isArray(b) || a.length !== b.length) return false;
  const counts = new Map();
  for (const item of a) counts.set(item, (counts.get(item) || 0) + 1);
  for (const item of b) {
    const remaining = counts.get(item);
    if (!remaining) return false;
    counts.set(item, remaining - 1);
  }
  return true;
}

async function handle(route, data, project) {
  data = data || {};
  const st = () => buildState(project);
  const findTicket = (id) => st().tickets.find((t) => t.id === id);

  switch (route) {
    case 'ticket/advance': {
      const { id, toStage, expectedRev, by } = data;
      if (!findTicket(id)) return bad('unknown ticket');
      if (!toStage || typeof toStage !== 'string') return bad('toStage required');
      const r = await w.readModifyWriteLedger(project, expectedRev, (led) => { if (led[id]) led[id].stage = toStage; });
      if (!r.ok) return conflict(st());
      w.appendComment(project, id, { author: by || 'hub', kind: 'advance', body: `stage → ${toStage}` });
      return ok(st());
    }
    case 'ticket/assign': {
      const { id, assignee, expectedRev, by } = data;
      if (!findTicket(id)) return bad('unknown ticket');
      const r = await w.readModifyWriteLedger(project, expectedRev, (led) => {
        if (led[id]) { led[id].assignee = assignee || null; led[id].assigned_at = new Date().toISOString(); }
      });
      if (!r.ok) return conflict(st());
      w.appendComment(project, id, { author: by || 'hub', kind: 'assign', body: `assigned → ${assignee || '(none)'}` });
      return ok(st());
    }
    case 'ticket/active': {
      const { id, agent, expectedRev } = data;
      if (!findTicket(id)) return bad('unknown ticket');
      if (!agent) return bad('agent required');
      const now = new Date().toISOString();
      const r = await w.readModifyWriteLedger(project, expectedRev, (led) => {
        if (led[id]) {
          const cur = led[id].active;
          led[id].active = { agent, since: cur && cur.agent === agent ? cur.since : now, heartbeat: now };
        }
      });
      if (!r.ok) return conflict(st());
      return ok(st()); // heartbeat emits no comment
    }
    case 'gate/set': {
      const { id, gate, state, note, by, expectedRev } = data;
      if (!findTicket(id)) return bad('unknown ticket');
      if (!st().gateDefs.some((g) => g.name === gate)) return bad('unknown gate');
      if (!GATE_STATES.includes(state)) return bad('state must be passed|pending|rejected');
      const r = await w.readModifyWriteLedger(project, expectedRev, (led) => {
        const t = led[id];
        if (!t) return;
        t.gates = t.gates || {};
        t.gates[gate] = { state, by: by || 'hub', at: new Date().toISOString(), ...(note ? { note } : {}) };
      });
      if (!r.ok) return conflict(st());
      // A hub gate decision emits the same typed comment a CLI agent would.
      w.appendComment(project, id, { author: by || 'hub', kind: 'gate', gate, state, body: note || `${gate} ${state}` });
      return ok(st());
    }
    case 'ticket/comment': {
      const { id, author, body, kind } = data;
      if (!id) return bad('id required');
      if (!body) return bad('body required');
      const comment = w.appendComment(project, id, { author, body, kind });
      return ok(st(), { comment });
    }
    case 'track/reorder': {
      const { track, stages, expectedRev } = data;
      const base = st().tracks[track];
      if (!base) return bad('unknown track');
      if (!isPermutation(base, stages)) return bad('stages must be a permutation of the track');
      const r = await w.writeOverlayCAS(project, expectedRev, { tracks: { [track]: stages } });
      if (!r.ok) return conflict(st());
      return ok(st());
    }
    case 'track/set-stages': {
      const { track, stages, expectedRev } = data;
      if (!st().tracks[track]) return bad('unknown track');
      const v = validateStageList(stages);
      if (v.error) return bad(v.error);
      const r = await w.writeOverlayCAS(project, expectedRev,
        { tracks: { [track]: v.stages }, stageOwners: v.owners });
      if (!r.ok) return conflict(st());
      return ok(st());
    }
    case 'gate/trigger': {
      const { gate, trigger, owner, refusal, expectedRev } = data;
      if (!gate || !st().gateDefs.some((g) => g.name === gate)) return bad('unknown gate');
      const patch = {};
      if (Array.isArray(trigger)) patch.trigger = trigger;
      if (typeof owner === 'string') patch.owner = owner;
      if (refusal === 'hard' || refusal === 'soft') patch.refusal = refusal;
      const r = await w.writeOverlayCAS(project, expectedRev, { gates: { [gate]: patch } });
      if (!r.ok) return conflict(st());
      return ok(st());
    }
    case 'preset': {
      const { preset, expectedRev } = data;
      if (!PRESETS.includes(preset)) return bad('preset must be solo|small-team|regulated');
      const r = await w.writeOverlayCAS(project, expectedRev, { preset });
      if (!r.ok) return conflict(st());
      return ok(st());
    }
    case 'kb/add': {
      const { title, body } = data;
      const r = w.addKbNote(project, { title, body });
      if (!r.ok) return bad(r.error);
      return ok(st(), { doc: r.doc });
    }
    default:
      return { code: 404, payload: { ok: false, error: 'unknown route' } };
  }
}

module.exports = { handle, isPermutation, validateStageList, PRESETS, GATE_STATES };
