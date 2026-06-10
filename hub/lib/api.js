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
const engine = require('./engine');
const proposals = require('./proposals');

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
    case 'workflow/set-rules': {
      const { rules, expectedRev } = data;
      const wf = st();
      // Author-time gate: the FULL closed-grammar + safety validation. An unsafe or
      // malformed rule is refused here and never persists (overlay byte-unchanged).
      const v = engine.validateRules(rules, wf);
      if (!v.ok) return bad(v.error);
      const r = await w.writeOverlayCAS(project, expectedRev, { rules });
      if (!r.ok) return conflict(st());
      return ok(st());
    }
    case 'workflow/set-labels': {
      const { labels, expectedRev } = data;
      const v = engine.validateLabels(labels);
      if (!v.ok) return bad(v.error);
      const r = await w.writeOverlayCAS(project, expectedRev, { labels });
      if (!r.ok) return conflict(st());
      return ok(st());
    }
    case 'label/set': {
      const { id, label, set, by, expectedRev } = data;
      const wf = st();
      if (!findTicket(id)) return bad('unknown ticket');
      if (typeof label !== 'string' || !label) return bad('label required');
      // Enforce the settable_by contract against the acting author — an
      // unauthorized set writes NOTHING (no labels[] change, no comment, no route).
      if (!engine.labelSettableBy(label, by || '*', wf)) return bad('label not settable by this agent');
      const wantSet = set !== false; // default: set; explicit false ⇒ clear
      const r = await w.readModifyWriteLedger(project, expectedRev, (led) => {
        const t = led[id];
        if (!t) return;
        const cur = Array.isArray(t.labels) ? t.labels.filter((l) => typeof l === 'string') : [];
        if (wantSet) { if (!cur.includes(label)) cur.push(label); }
        else { const idx = cur.indexOf(label); if (idx >= 0) cur.splice(idx, 1); }
        t.labels = cur;
      });
      if (!r.ok) return conflict(st());
      w.appendComment(project, id, { author: by || 'hub', kind: 'label', body: `${wantSet ? 'set' : 'cleared'} label ${label}`, label, state: wantSet ? 'set' : 'cleared' });
      return ok(st());
    }
    case 'kb/add': {
      const { title, body, scope, stack, kind } = data;
      const r = w.addKbNote(project, { title, body, scope, stack, kind });
      if (!r.ok) return bad(r.error);
      return ok(st(), { doc: r.doc });
    }
    case 'kb/propose': {
      // /kai submits a PENDING proposal. It is recorded inert in the proposal store
      // (outside any recallable vault); the cockpit never auto-applies it.
      const { title, content, suggestedScope, suggestedStack, suggestedKind, source, why } = data;
      const r = proposals.propose({ title, content, suggestedScope, suggestedStack, suggestedKind, source, why });
      if (!r.ok) return bad(r.error);
      return ok(st(), { proposal: r.proposal });
    }
    case 'kb/approve': {
      // An explicit human action: re-authorize the stored proposal by id and write it
      // through the same guarded/contained chokepoint at the chosen server-validated
      // scope. A foreign/forged/stale id or an out-of-enum scope writes NOTHING.
      const { id, scope, by } = data;
      const r = await proposals.approve(project, { id, scope, by });
      if (!r.ok) return { code: r.code || 400, payload: { ok: false, error: r.error } };
      return ok(st(), { scope: r.scope, doc: r.doc });
    }
    case 'kb/reject': {
      // Mark the proposal rejected: retained for audit, removed from the inbox, never
      // recalled. A foreign/forged/already-decided id is refused.
      const { id, by, note } = data;
      const r = await proposals.reject(project, { id, by, note });
      if (!r.ok) return { code: r.code || 400, payload: { ok: false, error: r.error } };
      return ok(st(), { proposal: r.proposal });
    }
    default:
      return { code: 404, payload: { ok: false, error: 'unknown route' } };
  }
}

// The write surface the engine applies through — every mutation rides the existing
// CAS writers; instruct/fan_out are recorded only. Each closure carries the project.
// All ledger writes are awaited (the mutex serializes them) so the next projection
// read in the tick observes the effect — the tick is one sequential unit.
function engineIO(project) {
  return {
    async setLabel(id, label, set, by) {
      await w.readModifyWriteLedger(project, null, (led) => {
        const t = led[id]; if (!t) return;
        const cur = Array.isArray(t.labels) ? t.labels.filter((l) => typeof l === 'string') : [];
        if (set) { if (!cur.includes(label)) cur.push(label); }
        else { const i = cur.indexOf(label); if (i >= 0) cur.splice(i, 1); }
        t.labels = cur;
      });
      w.appendComment(project, id, { author: by, kind: 'label', body: `${set ? 'set' : 'cleared'} label ${label}`, label, state: set ? 'set' : 'cleared' });
    },
    async routeStage(id, toStage, by) {
      await w.readModifyWriteLedger(project, null, (led) => { if (led[id]) led[id].stage = toStage; });
      w.appendComment(project, id, { author: by, kind: 'advance', body: `stage → ${toStage}` });
    },
    async assign(id, agent, by) {
      await w.readModifyWriteLedger(project, null, (led) => {
        if (led[id]) { led[id].assignee = agent || null; led[id].assigned_at = new Date().toISOString(); }
      });
      w.appendComment(project, id, { author: by, kind: 'assign', body: `assigned → ${agent || '(none)'}` });
    },
    async requireGate(id, gate, by) {
      // add-only: append the gate name to the ticket's required set; never sets state
      await w.readModifyWriteLedger(project, null, (led) => {
        const t = led[id]; if (!t) return;
        const cur = Array.isArray(t.requiredGates) ? t.requiredGates.filter((g) => typeof g === 'string') : [];
        if (!cur.includes(gate)) cur.push(gate);
        t.requiredGates = cur;
      });
      w.appendComment(project, id, { author: by, kind: 'comment', body: `requires gate ${gate}` });
    },
    directive(id, target, prompt, by) {
      // recorded only — no write authority; the prompt is untrusted data stored raw
      w.appendComment(project, id, { author: by, kind: 'directive', body: String(prompt == null ? '' : prompt), target });
    },
    fanOut(id, targets, by) {
      w.appendComment(project, id, { author: by, kind: 'directive', body: `fan_out (recorded only): ${(targets || []).join(', ')}` });
    },
    async recordFired(id, rule, eventId, at, toStage) {
      await w.readModifyWriteLedger(project, null, (led) => {
        const t = led[id]; if (!t) return;
        const cur = Array.isArray(t.fired) ? t.fired : [];
        const entry = { rule, event: eventId, at: at || new Date().toISOString() };
        if (toStage) entry.toStage = toStage;
        cur.push(entry);
        t.fired = cur;
      });
    },
  };
}

/**
 * Run one deterministic engine tick for a project: derive the new events off the
 * comment-log tail, evaluate the rules against each, and apply matched do-actions
 * through the CAS writers. Idempotent via the (rule,event) dedup trace; bounded by
 * the loop budget (backward routes → NEEDS_HUMAN, stop) and the then-chain cap.
 *
 * Returns a summary `{ fired:[{rule,event,ticket}], needsHuman:[ids] }` for tests
 * and logging. Performs file mutations only; never spawns/execs anything.
 */
async function runEngineTick(project, io = engineIO(project)) {
  const fired = [];
  const needsHuman = [];
  const state0 = buildState(project);
  const rules = state0.rules || [];
  if (!rules.length) return { fired, needsHuman };
  const rulesById = new Map(rules.map((r) => [r.id, r]));

  for (const ticket0 of state0.tickets) {
    // re-read the ticket fresh per iteration so cross-ticket writes stay isolated
    let state = buildState(project);
    let ticket = state.tickets.find((t) => t.id === ticket0.id);
    if (!ticket) continue;
    const events = engine.deriveEvents(ticket.comments, new Set((ticket.fired || []).map((f) => f.event)));

    for (const event of events) {
      const candidates = engine.selectRules(event, rules);
      // a tick evaluates a bounded set; then-chains are expanded with a depth cap
      const queue = candidates.map((r) => ({ rule: r, depth: 0 }));
      let stopRouting = false;
      while (queue.length) {
        const { rule, depth } = queue.shift();
        if (depth > engine.CHAIN_DEPTH_CAP) break;
        state = buildState(project);
        ticket = state.tickets.find((t) => t.id === ticket0.id);
        if (!ticket) break;
        if (engine.alreadyFired(ticket, rule.id, event.id)) continue;
        if (!engine.matches(rule, ticket, event)) continue;

        // loop safety: a backward route over budget → NEEDS_HUMAN, stop routing
        const routeAction = (rule.do || []).find((a) => Object.keys(a)[0] === 'route_to_stage');
        if (routeAction && !stopRouting) {
          const toStage = routeAction.route_to_stage;
          const count = engine.backwardRouteCount(ticket, toStage, state);
          if (count >= engine.LOOP_BUDGET) {
            await io.setLabel(ticket.id, 'NEEDS_HUMAN', true, 'engine');
            await io.recordFired(ticket.id, rule.id, event.id, event.at);
            needsHuman.push(ticket.id);
            stopRouting = true;
            continue; // no further backward route fires for this loop
          }
        }

        // apply, recording the toStage on the fired entry for the loop counter
        const { result: wroteRoute, applied } = await applyWithRouteTrace(rule, ticket, event, state, io);
        if (applied.length) fired.push({ rule: rule.id, event: event.id, ticket: ticket.id });

        // expand the then-chain in the same tick iff the parent fired
        if (Array.isArray(rule.then) && wroteRoute !== 'refused') {
          for (const nextId of rule.then) {
            const next = rulesById.get(nextId);
            if (next) queue.push({ rule: next, depth: depth + 1 });
          }
        }
      }
    }
  }
  return { fired, needsHuman };
}

// Apply a rule, threading the route target into recordFired so the loop counter
// can see prior backward routes. Returns 'refused' when a route was blocked by the
// safety check (so the then-chain does not expand off a blocked parent route).
async function applyWithRouteTrace(rule, ticket, event, wf, io) {
  let routeStage = null;
  const wrapped = {
    ...io,
    async routeStage(id, toStage, by) { routeStage = toStage; await io.routeStage(id, toStage, by); },
    async recordFired(id, ruleId, eventId, at) { await io.recordFired(id, ruleId, eventId, at, routeStage); },
  };
  // detect a refused route: if the rule has a route action but it routes past an
  // unmet safety gate, apply() will skip it — surface that to the chain logic
  const routeAction = (rule.do || []).find((a) => Object.keys(a)[0] === 'route_to_stage');
  const routeRefused = !!routeAction && engine.routePastUnmetSafetyGate(routeAction.route_to_stage, ticket, wf);
  const applied = await engine.apply(rule, ticket, event, wf, wrapped);
  return { result: routeRefused ? 'refused' : 'applied', applied };
}

module.exports = { handle, isPermutation, validateStageList, PRESETS, GATE_STATES, runEngineTick, engineIO };
