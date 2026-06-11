'use strict';
/*
 * DART write-back tool handlers.
 *
 * Each handler is a pure function over (args, projectDir) that delegates 1:1 to the
 * hub control plane. There is exactly ONE mutation path: hub api.handle (and its
 * markDirectiveConsumed wrapper, which itself routes through api.handle). This module
 * imports api.handle + state.buildState ONLY — never write.js, never the ledger/overlay
 * file, never a hand-built engineIO. Adding a mutation that api.handle lacks means
 * adding it to api.handle first, then exposing it here — never forking a second writer.
 *
 * projectDir is the single bound project root, resolved once at spawn by the server.
 * A tool argument is a lookup key / data value, never a path: no handler accepts a
 * filesystem path, directory, or foreign project id, so a tool call can never retarget
 * another project's directory. The bound project is the only directory any write reaches.
 *
 * No argument ever reaches an execution sink: every value is forwarded to api.handle as
 * ledger / overlay / comment data. This module's import graph is free of
 * child_process / exec / spawn / fork / ssh / vm, and it never eval()s.
 */
const { handle, markDirectiveConsumed } = require('../../hub/lib/api');
const { buildState } = require('../../hub/lib/state');

// Coerce a tool argument to a non-empty trimmed string, or undefined. Used so an
// absent/blank field falls through to api.handle's own validation rather than being
// silently turned into a different value.
function str(v) {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

// The mutating handlers (advance, set-gate, set-label, assign, require-gate) forward
// expectedRev verbatim so the existing CAS writer governs the write: a stale revision
// is a conflict that changes nothing — none invents, defaults, or alters it. The
// append-only handlers (comment, consume-directive) take no expectedRev: they only
// append to the log, so there is no read-modify-write window and no lost-update to guard.
const writeHandlers = {
  // ticket/advance — owner's explicit stage move (same authority as the hub HTTP layer).
  // The engine remains the single validator for any AUTOMATION route past a safety gate;
  // this surface adds no rule-evaluation path and no gate-pass action.
  dart_advance_ticket(args, projectDir) {
    return handle('ticket/advance', {
      id: str(args.id), toStage: str(args.toStage), by: str(args.by), expectedRev: args.expectedRev,
    }, projectDir);
  },

  // gate/set — records an owner agent's gate decision (pending|passed|rejected). There is
  // NO gate-pass/gate-clear/gate-satisfy action: automation can never fabricate a passed
  // safety gate; only an owner agent records a decision here, exactly as the hub does.
  dart_set_gate(args, projectDir) {
    return handle('gate/set', {
      id: str(args.id), gate: str(args.gate), state: str(args.state),
      note: str(args.note), by: str(args.by), expectedRev: args.expectedRev,
    }, projectDir);
  },

  dart_comment(args, projectDir) {
    return handle('ticket/comment', {
      id: str(args.id), body: typeof args.body === 'string' ? args.body : undefined,
      kind: str(args.kind), author: str(args.author),
    }, projectDir);
  },

  // label/set — settable_by is enforced inside api.handle (engine.labelSettableBy); an
  // unauthorized set writes nothing (no label, no comment, no route). This surface re-checks
  // nothing — it relies on the single validator.
  dart_set_label(args, projectDir) {
    return handle('label/set', {
      id: str(args.id), label: str(args.label),
      set: args.set === false ? false : true, by: str(args.by), expectedRev: args.expectedRev,
    }, projectDir);
  },

  dart_assign(args, projectDir) {
    return handle('ticket/assign', {
      id: str(args.id), assignee: str(args.assignee), by: str(args.by), expectedRev: args.expectedRev,
    }, projectDir);
  },

  // require_gate — add-only: gate/trigger appends/patches a gate's required posture in the
  // overlay; it never sets, satisfies, or removes a gate's state. There is no remove form.
  dart_require_gate(args, projectDir) {
    const trigger = Array.isArray(args.trigger) ? args.trigger.map(String) : undefined;
    return handle('gate/trigger', {
      gate: str(args.gate), trigger, owner: str(args.owner),
      refusal: str(args.refusal), expectedRev: args.expectedRev,
    }, projectDir);
  },

  // consume_directive — an explicit, audited, append-only marker referencing the directive's
  // id, written through api.handle('directive/consume'). Idempotent + durable: pending is
  // derived from the log, so a second consume is a harmless no-op against the derived set.
  dart_consume_directive(args, projectDir) {
    return markDirectiveConsumed(projectDir, {
      id: str(args.id), directiveId: str(args.directiveId), by: str(args.by), note: str(args.note),
    });
  },
};

// Read handlers project the SAME buildState the SessionStart digest renders — no more.
const readHandlers = {
  dart_read_state(_args, projectDir) {
    return { code: 200, payload: { ok: true, state: buildState(projectDir) } };
  },

  // Pending directives: the un-consumed kind:"directive" intents, each with target[] + prompt
  // as quoted data. DART never evaluates a directive — only the addressed agent may act.
  dart_pending_directives(_args, projectDir) {
    return { code: 200, payload: { ok: true, directives: buildState(projectDir).directives } };
  },
};

const handlers = { ...writeHandlers, ...readHandlers };

const WRITE_TOOLS = Object.keys(writeHandlers);
const READ_TOOLS = Object.keys(readHandlers);

/**
 * Invoke a tool handler by name against the bound project directory.
 *
 * @param name the tool name (one of WRITE_TOOLS / READ_TOOLS)
 * @param args the tool arguments (data only; never a path)
 * @param projectDir the single bound project root resolved at spawn
 * @returns the hub route's `{ code, payload }` shape verbatim
 * @throws Error when the tool name is not a registered handler
 */
function invoke(name, args, projectDir) {
  const fn = handlers[name];
  if (typeof fn !== 'function') throw new Error(`unknown tool: ${name}`);
  return fn(args || {}, projectDir);
}

module.exports = { handlers, invoke, WRITE_TOOLS, READ_TOOLS };
