'use strict';
/*
 * The deterministic conditional-workflow engine.
 *
 * Rules authored in the workflow document/overlay are a standing, unattended
 * actor: every matching event on the comment-log/ledger tail can route, label,
 * assign, or require a gate WITHOUT a human in the loop. This module is the closed-
 * grammar evaluator that decides, and the SINGLE safety validator that guards both
 * author-time (a rule is saved) and evaluation-time (a rule fires) — one function,
 * no divergent second check.
 *
 * Hard safety properties enforced here:
 *  - The `do` action set is a CLOSED allowlist with NO gate-state-passing action;
 *    the engine can never set a gate to passed (only an owner agent via gate/set).
 *  - A route to/past a stage governed by an unmet safety-override gate is refused,
 *    at author-time AND eval-time, through the same validator.
 *  - set_label/clear_label honor the label's settable_by contract.
 *  - require_gate may only ADD a required gate, never remove or satisfy one.
 *  - instruct is recorded-only (no write authority); its prompt is untrusted data.
 *  - pattern is a bounded, backtracking-free matcher (ReDoS-safe).
 *  - Names/ids are bounded and proto-pollution keys are neutralized.
 *  - A replayed event applies a (rule,event) pair effectively-once (dedup).
 *  - A backward-route loop budget terminates a cycle to NEEDS_HUMAN and stops.
 *
 * The engine imports NOTHING from child_process/exec/spawn/ssh and never eval()s:
 * it performs file mutations only, through the existing CAS writers in write.js.
 */
const { stageGate } = require('./stage-map');

// ---- closed grammar --------------------------------------------------------

// The ONLY do-actions the engine accepts. There is deliberately no set_gate /
// pass_gate / satisfy_gate / clear_gate: the engine exposes no gate-state write.
const DO_ACTIONS = new Set([
  'set_label', 'clear_label', 'route_to_stage', 'assign', 'require_gate', 'instruct', 'fan_out',
]);
const ENGINE_MUTATIONS = new Set(['set_label', 'clear_label', 'route_to_stage', 'assign', 'require_gate']);

// The closed when-predicate vocabulary (AND-of-keys).
const WHEN_KEYS = new Set(['label', 'pattern', 'in', 'event', 'gate', 'state', 'stage', 'author', 'track', 'preset']);

// The closed event enum (1:1 with the existing typed comment / ledger mutations).
const EVENTS = new Set([
  'comment.added', 'gate.passed', 'gate.rejected', 'gate.pending',
  'stage.entered', 'stage.left', 'assignee.changed',
  'label.set', 'label.cleared', 'ticket.created', 'loop.exceeded',
]);

const PATTERN_SCOPES = new Set(['comment', 'title', 'description']);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const NAME_MAX = 64;
const ID_MAX = 80;
const PATTERN_MAX = 200;
const PROMPT_MAX = 8192;
const AGENT_MAX = 64;

const LOOP_BUDGET = 3;       // backward route_to_stage traversals per ticket per loop
const CHAIN_DEPTH_CAP = 8;   // then: chain depth within one tick

// ---- small validators ------------------------------------------------------

function hasControlChar(text) {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 0x20) return true;
  return false;
}
// A name token that may become a stage/label key — no path separators, no control
// chars, no prototype-shadowing key, length-capped.
function nameError(value, max, what) {
  if (typeof value !== 'string') return `${what} must be a string`;
  const v = value.trim();
  if (!v || v.length > max) return `${what} empty or too long`;
  if (hasControlChar(v) || v.includes('/') || v.includes('\\')) return `invalid ${what}`;
  if (FORBIDDEN_KEYS.has(v)) return `invalid ${what}`;
  return null;
}
// An agent token (e.g. "/be") may carry a leading slash; only control chars and
// over-cap and proto keys are banned.
function agentError(value) {
  if (typeof value !== 'string') return 'agent must be a string';
  const v = value.trim();
  if (!v || v.length > AGENT_MAX) return 'agent empty or too long';
  if (hasControlChar(v)) return 'invalid agent';
  if (FORBIDDEN_KEYS.has(v)) return 'invalid agent';
  return null;
}

// ---- bounded, ReDoS-safe pattern matcher -----------------------------------
//
// `pattern` is NEVER compiled into a backtracking regex engine. It is a bounded,
// anchored glob over a length-capped input: `*` and `?` only, case-insensitive,
// matched in linear time with a two-pointer scan (no nested quantifiers, no
// backtracking blow-up). A pattern over the length cap is rejected at author-time.
function patternError(pat) {
  if (typeof pat !== 'string') return 'pattern must be a string';
  if (pat.length === 0) return 'pattern empty';
  if (pat.length > PATTERN_MAX) return 'pattern too long';
  if (hasControlChar(pat)) return 'invalid pattern';
  return null;
}
// Linear-time glob match (`*` = any run, `?` = one char). Greedy with a single
// backtrack pointer — O(n*m) worst case but with NO exponential blow-up, and the
// input is capped at the comment-body size, so it cannot hang the evaluator.
function globMatch(pattern, input) {
  const pat = String(pattern).toLowerCase();
  const str = String(input).toLowerCase();
  let p = 0, s = 0, star = -1, mark = 0;
  while (s < str.length) {
    if (p < pat.length && (pat[p] === '?' || pat[p] === str[s])) { p++; s++; }
    else if (p < pat.length && pat[p] === '*') { star = p++; mark = s; }
    else if (star !== -1) { p = star + 1; s = ++mark; }
    else return false;
  }
  while (p < pat.length && pat[p] === '*') p++;
  return p === pat.length;
}
// A pattern with no wildcard is a case-insensitive substring test (bounded).
function patternMatches(pattern, input) {
  const pat = String(pattern);
  if (pat.includes('*') || pat.includes('?')) return globMatch(pat, input);
  return String(input).toLowerCase().includes(pat.toLowerCase());
}

// ---- the SINGLE safety check (author-time AND eval-time) -------------------
//
// True when routing a ticket to `targetStage` would CROSS an unmet safety_override
// gate — i.e. move the ticket from at/before that gate's stage to at/beyond it
// while the gate is not yet passed. A purely BACKWARD route (target at or before
// the ticket's current position) never crosses a gate and is allowed; a forward
// route INTO or PAST an unmet safety gate is refused. The stage ordering is derived
// from the ticket's active track array (the only authority on order). Used
// identically at author-time and eval-time — there is no second implementation.
function routePastUnmetSafetyGate(targetStage, ticket, wf) {
  const order = trackOrder(ticket, wf);
  const targetIdx = order.indexOf(String(targetStage));
  if (targetIdx < 0) {
    // target not in the track: refuse only if it directly maps to an unmet safety gate
    return gateIsUnmetSafety(stageGate(targetStage), ticket);
  }
  const curIdx = order.indexOf(String(ticket.stage));
  const from = curIdx < 0 ? 0 : curIdx;
  // a backward (or in-place) route cannot cross a gate the ticket already passed
  if (targetIdx <= from) return false;
  // forward route: refuse if any safety gate strictly between the current position
  // (exclusive) and the target (inclusive) is unmet — that gate would be skipped
  for (let i = from + 1; i <= targetIdx; i++) {
    const gate = stageGate(order[i]);
    if (gate && gateIsUnmetSafety(gate, ticket)) return true;
  }
  return false;
}
function gateIsUnmetSafety(gateName, ticket) {
  if (!gateName) return false;
  const g = (ticket.gates || []).find((x) => x.name === gateName);
  if (!g) return false;
  return g.safety === true && g.state !== 'passed';
}
function trackOrder(ticket, wf) {
  const tracks = (wf && wf.tracks) || {};
  const name = ticket && ticket.track;
  if (name && Array.isArray(tracks[name])) return tracks[name];
  // single-track fallback: the longest defined track
  let best = [];
  for (const seq of Object.values(tracks)) if (Array.isArray(seq) && seq.length > best.length) best = seq;
  return best;
}

// ---- author-time schema + safety validation --------------------------------
//
// Validate ONE rule against the closed grammar and the safety invariants. `wf` is
// the projection (tracks/labels/gateDefs); the safety arm needs the track order +
// gate safety flags. Returns { ok:true } or { ok:false, error } — terse, no paths.
function validateRule(rule, wf) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return fail('rule must be an object');
  const idErr = idError(rule.id);
  if (idErr) return fail(idErr);

  if (rule.when != null) {
    const w = rule.when;
    if (typeof w !== 'object' || Array.isArray(w)) return fail('when must be an object');
    for (const key of Object.keys(w)) {
      if (FORBIDDEN_KEYS.has(key)) return fail('invalid when predicate');
      if (!WHEN_KEYS.has(key)) return fail('unknown when predicate');
    }
    if (w.event != null && !EVENTS.has(w.event)) return fail('unknown event');
    if (w.in != null && !PATTERN_SCOPES.has(w.in)) return fail('unknown pattern scope');
    if (w.pattern != null) { const e = patternError(w.pattern); if (e) return fail(e); }
    if (w.label != null) { const e = nameError(w.label, NAME_MAX, 'label'); if (e) return fail(e); }
  }

  if (!Array.isArray(rule.do)) return fail('do must be a list');
  for (const action of rule.do) {
    const e = validateAction(action, rule, wf);
    if (e) return fail(e);
  }

  if (rule.then != null) {
    if (!Array.isArray(rule.then)) return fail('then must be a list');
    for (const t of rule.then) if (typeof t !== 'string' || FORBIDDEN_KEYS.has(t)) return fail('invalid then target');
  }
  return { ok: true };
}

function validateAction(action, rule, wf) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return 'invalid do action';
  const keys = Object.keys(action);
  if (keys.length !== 1) return 'a do action must carry exactly one verb';
  const verb = keys[0];
  if (FORBIDDEN_KEYS.has(verb) || !DO_ACTIONS.has(verb)) return 'unknown do action';
  const value = action[verb];

  switch (verb) {
    case 'set_label':
    case 'clear_label': {
      const e = nameError(value, NAME_MAX, 'label');
      if (e) return e;
      // A rule cannot author a label action its acting context cannot set.
      if (!labelSettableBy(value, actingAgent(rule), wf)) return 'label not settable by this agent';
      return null;
    }
    case 'route_to_stage': {
      const e = nameError(value, NAME_MAX, 'stage');
      if (e) return e;
      // Author-time mirror of the eval-time safety refusal. A forward route that
      // crosses an unmet safety gate is a bypass and is refused at save time — UNLESS
      // it is a declared backward route blessed by a label contract (the routing
      // label's `routes_to` names the target), which by construction returns a ticket
      // that has already cleared the gate. Eval-time re-checks per ticket regardless.
      if (isDeclaredBackwardRoute(value, rule, wf)) return null;
      // Same crossing function as eval-time (single validator), applied to a
      // worst-case representative ticket sitting at the track start with all gates
      // unmet — the most permissive position for catching a forward bypass.
      for (const ticket of representativeTickets(wf)) {
        if (routePastUnmetSafetyGate(value, ticket, wf)) return 'rule routes past an unmet safety gate';
      }
      return null;
    }
    case 'assign': return agentError(value);
    case 'require_gate': {
      if (typeof value !== 'string' || FORBIDDEN_KEYS.has(value)) return 'invalid gate name';
      if (value.length > NAME_MAX || hasControlChar(value)) return 'invalid gate name';
      return null;
    }
    case 'instruct': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return 'instruct requires target and prompt';
      const targets = Array.isArray(value.target) ? value.target : (value.target != null ? [value.target] : []);
      if (targets.length === 0) return 'instruct requires a target';
      for (const t of targets) { const e = agentError(t); if (e) return e; }
      if (typeof value.prompt !== 'string' || value.prompt.trim().length === 0) return 'instruct requires a prompt';
      if (value.prompt.length > PROMPT_MAX) return 'instruct prompt too long';
      return null;
    }
    case 'fan_out': {
      if (!Array.isArray(value)) return 'fan_out must be a list';
      for (const v of value) { const e = nameError(v, NAME_MAX, 'fan_out target'); if (e) return e; }
      return null;
    }
    default:
      return 'unknown do action';
  }
}

function idError(id) {
  if (typeof id !== 'string') return 'rule id required';
  const v = id.trim();
  if (!v || v.length > ID_MAX) return 'rule id empty or too long';
  if (hasControlChar(v) || FORBIDDEN_KEYS.has(v)) return 'invalid rule id';
  return null;
}

// The agent a rule acts as: its `author` predicate, else "*" (any). Used to scope
// the label settable_by check both at author-time and eval-time.
function actingAgent(rule) {
  const a = rule && rule.when && rule.when.author;
  return typeof a === 'string' && a ? a : '*';
}
function labelSettableBy(label, agent, wf) {
  const labels = (wf && wf.labels) || {};
  const def = Object.prototype.hasOwnProperty.call(labels, label) ? labels[label] : null;
  if (!def) return false; // unknown label cannot be set by anyone
  const list = Array.isArray(def.settable_by) ? def.settable_by : [];
  if (list.includes('*')) return true;
  if (agent === '*') return false; // an unscoped rule cannot set a restricted label
  return list.includes(agent);
}

// A representative ticket per track, positioned at the track start with all gates
// in their default (unmet) state, so the author-time route check sees the same
// safety topology the engine will see at eval-time for a worst-case ticket.
function representativeTickets(wf) {
  const tracks = (wf && wf.tracks) || {};
  const gateDefs = (wf && wf.gateDefs) || [];
  const gates = gateDefs.map((g) => ({ name: g.name, safety: g.safety === true, state: 'pending' }));
  const out = [];
  for (const [name, seq] of Object.entries(tracks)) {
    if (!Array.isArray(seq)) continue;
    out.push({ track: name, stage: seq[0], gates });
  }
  if (!out.length) out.push({ track: null, stage: null, gates });
  return out;
}

// A route is a contract-blessed BACKWARD route when the rule is triggered by, or
// references, a routing label whose `routes_to` names the target stage. Such a
// label sends a ticket that has already progressed back to an earlier stage, so it
// never crosses a gate forward — the architecture's one-shot-routing-label model.
function isDeclaredBackwardRoute(targetStage, rule, wf) {
  const labels = (wf && wf.labels) || {};
  const referenced = new Set();
  if (rule.when && typeof rule.when.label === 'string') referenced.add(rule.when.label);
  for (const action of rule.do || []) {
    const verb = Object.keys(action)[0];
    if ((verb === 'set_label' || verb === 'clear_label') && typeof action[verb] === 'string') referenced.add(action[verb]);
  }
  for (const name of referenced) {
    const def = Object.prototype.hasOwnProperty.call(labels, name) ? labels[name] : null;
    if (def && def.routes_to === targetStage) return true;
  }
  return false;
}

function fail(error) { return { ok: false, error }; }

// Validate a whole rule list; returns the first error (terse) or {ok:true}.
function validateRules(rules, wf) {
  if (!Array.isArray(rules)) return fail('rules must be a list');
  const seen = new Set();
  for (const rule of rules) {
    const r = validateRule(rule, wf);
    if (!r.ok) return r;
    if (seen.has(rule.id)) return fail('duplicate rule id');
    seen.add(rule.id);
  }
  return { ok: true };
}

// Validate a labels contract map. Names bounded + proto-safe; settable_by a list.
function validateLabels(labels) {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return fail('labels must be an object');
  for (const [name, def] of Object.entries(labels)) {
    const e = nameError(name, NAME_MAX, 'label');
    if (e) return fail(e);
    if (!def || typeof def !== 'object' || Array.isArray(def)) return fail('label definition must be an object');
    if (def.settable_by != null && !Array.isArray(def.settable_by)) return fail('settable_by must be a list');
  }
  return { ok: true };
}

// ---- event derivation off the comment-log tail -----------------------------
//
// Map a typed comment record to the engine event(s) it represents. The JSONL
// record `id` is the per-event identity used for dedup; it rides through unchanged.
function eventFromComment(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const base = { id: rec.id, ticket: rec.ticket, author: rec.author, body: rec.body, at: rec.ts };
  switch (rec.kind) {
    case 'comment': return { ...base, event: 'comment.added' };
    case 'gate':
      return { ...base, event: rec.state === 'passed' ? 'gate.passed' : rec.state === 'rejected' ? 'gate.rejected' : 'gate.pending', gate: rec.gate, state: rec.state };
    case 'advance': return { ...base, event: 'stage.entered' };
    case 'assign': return { ...base, event: 'assignee.changed' };
    case 'label': return { ...base, event: rec.state === 'cleared' ? 'label.cleared' : 'label.set', label: rec.label };
    case 'directive': return null; // directives are inert: they trigger no rule
    default: return null;
  }
}

// Derive the new events from the tail of the comment log that appeared since the
// last seen id. `seenIds` is a Set of comment ids already processed.
function deriveEvents(comments, seenIds) {
  const out = [];
  for (const rec of comments || []) {
    if (seenIds && seenIds.has(rec.id)) continue;
    const ev = eventFromComment(rec);
    if (ev) out.push(ev);
  }
  return out;
}

// ---- rule selection + matching ---------------------------------------------

function selectRules(event, rules) {
  return (rules || []).filter((r) => {
    const when = r.when || {};
    if (when.event != null) return when.event === event.event;
    return true; // no event qualifier ⇒ candidate for any event (when refines it)
  });
}

// Evaluate a rule's `when` (AND-of-predicates) + optional `if` against the event
// and the ticket. Pure, deterministic, no model/advisory consulted.
function matches(rule, ticket, event) {
  const w = rule.when || {};
  if (w.event != null && w.event !== event.event) return false;
  if (w.gate != null && w.gate !== event.gate) return false;
  if (w.state != null && w.state !== event.state) return false;
  if (w.author != null && w.author !== event.author) return false;
  if (w.stage != null && String(w.stage) !== String(ticket.stage)) return false;
  if (w.track != null && String(w.track) !== String(ticket.track)) return false;
  if (w.label != null && !(ticket.labels || []).includes(w.label)) return false;
  if (w.pattern != null) {
    const scope = w.in || 'comment';
    const input = scope === 'title' ? ticket.title : scope === 'description' ? (ticket.description || '') : (event.body || '');
    if (!patternMatches(w.pattern, input)) return false;
  }
  return true;
}

// ---- apply (the eval-time mutator) -----------------------------------------
//
// Apply a matched rule's `do:` actions IN ORDER for one event. Engine-mutations
// ride the injected CAS writers; instruct is appended as an inert directive
// comment; fan_out is recorded only (Phase-0 no-op for multi-agent execution).
//
// Every action re-runs the relevant safety check (eval-time arm) through the SAME
// validator helpers used at author-time. A refusal writes NOTHING for that action.
//
// `io` injects the write surface so the engine stays testable without HTTP:
//   { setLabel(ticketId, label, set, by), routeStage(ticketId, toStage, by),
//     assign(ticketId, agent, by), requireGate(ticketId, gate, by),
//     directive(ticketId, target, prompt, by), recordFired(ticketId, rule, eventId, at) }
async function apply(rule, ticket, event, wf, io) {
  const applied = [];
  for (const action of rule.do || []) {
    const verb = Object.keys(action)[0];
    const value = action[verb];
    switch (verb) {
      case 'set_label':
      case 'clear_label': {
        if (!labelSettableBy(value, actingAgent(rule), wf)) break; // unauthorized → write nothing
        await io.setLabel(ticket.id, value, verb === 'set_label', actingAgent(rule));
        applied.push(verb);
        break;
      }
      case 'route_to_stage': {
        if (routePastUnmetSafetyGate(value, ticket, wf)) break; // refused → write nothing
        await io.routeStage(ticket.id, value, actingAgent(rule));
        applied.push(verb);
        break;
      }
      case 'assign':
        await io.assign(ticket.id, value, actingAgent(rule));
        applied.push(verb);
        break;
      case 'require_gate':
        await io.requireGate(ticket.id, value, actingAgent(rule)); // add-only by construction
        applied.push(verb);
        break;
      case 'instruct': {
        const targets = Array.isArray(value.target) ? value.target : [value.target];
        io.directive(ticket.id, targets, value.prompt, actingAgent(rule)); // recorded only
        applied.push(verb);
        break;
      }
      case 'fan_out':
        if (io.fanOut) io.fanOut(ticket.id, value, actingAgent(rule)); // recorded, no spawn
        applied.push(verb);
        break;
      default:
        break; // unknown verb never reaches here (validated), but never acts
    }
  }
  await io.recordFired(ticket.id, rule.id, event.id, event.at);
  return applied;
}

// Has this (rule, event) pair already fired on this ticket? The dedup key is the
// rule id + the triggering comment id; a replayed/re-watched tail is effectively
// once.
function alreadyFired(ticket, ruleId, eventId) {
  return (ticket.fired || []).some((f) => f.rule === ruleId && f.event === eventId);
}

// Count backward route traversals to a stage from the fired trace (loop budget).
function backwardRouteCount(ticket, toStage, wf) {
  const order = trackOrder(ticket, wf);
  const toIdx = order.indexOf(String(toStage));
  if (toIdx < 0) return 0;
  // a "backward" route lands at or before the ticket's current stage position
  const curIdx = order.indexOf(String(ticket.stage));
  return toIdx <= curIdx ? (ticket.fired || []).filter((f) => f.toStage === String(toStage)).length : 0;
}

module.exports = {
  DO_ACTIONS, ENGINE_MUTATIONS, WHEN_KEYS, EVENTS, PATTERN_SCOPES,
  LOOP_BUDGET, CHAIN_DEPTH_CAP, NAME_MAX, ID_MAX, PATTERN_MAX,
  validateRule, validateRules, validateLabels,
  routePastUnmetSafetyGate, labelSettableBy, actingAgent, trackOrder,
  patternMatches, globMatch, patternError,
  deriveEvents, eventFromComment, selectRules, matches, apply,
  alreadyFired, backwardRouteCount,
};
