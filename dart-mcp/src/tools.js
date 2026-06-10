'use strict';
/*
 * The DART tool surface: name, description, and input shape for each tool, paired with
 * its pure handler from handlers.js. Kept SDK-free so the tool→api.handle mapping is
 * testable without a live MCP transport; server.js wires these thinly over stdio.
 *
 * The surface is exactly: seven write tools (each delegating 1:1 to one api.handle route)
 * and two read tools (pure buildState projections). There is deliberately NO gate-pass /
 * gate-clear / gate-satisfy tool and NO tool that retargets another project.
 */
const { invoke, WRITE_TOOLS, READ_TOOLS } = require('./handlers');

// Input field specs are declared as plain descriptors (kind + required + description) so
// this file needs no validation library. server.js lifts them into the SDK's Zod shape.
const REV = { kind: 'string', required: false, description: 'Expected ledger revision for compare-and-set; a stale value makes the write a no-op conflict.' };
const BY = { kind: 'string', required: false, description: 'The acting agent recorded as the comment author.' };

const TOOLS = [
  {
    name: 'dart_advance_ticket',
    route: 'ticket/advance',
    description: "Move a ticket to a stage as the stage's owner. Records an advance comment. Stale expectedRev is a no-op conflict.",
    input: {
      id: { kind: 'string', required: true, description: 'The ticket id.' },
      toStage: { kind: 'string', required: true, description: 'The destination stage.' },
      by: BY,
      expectedRev: REV,
    },
  },
  {
    name: 'dart_set_gate',
    route: 'gate/set',
    description: "Record a gate decision (passed|pending|rejected) as the gate's owner. There is no gate-pass shortcut for automation.",
    input: {
      id: { kind: 'string', required: true, description: 'The ticket id.' },
      gate: { kind: 'string', required: true, description: 'The gate name.' },
      state: { kind: 'string', required: true, description: 'passed | pending | rejected.' },
      note: { kind: 'string', required: false, description: 'An optional decision note.' },
      by: BY,
      expectedRev: REV,
    },
  },
  {
    name: 'dart_comment',
    route: 'ticket/comment',
    description: 'Append a typed comment to a ticket. The body is stored as inert data; DART never executes it.',
    input: {
      id: { kind: 'string', required: true, description: 'The ticket id.' },
      body: { kind: 'string', required: true, description: 'The comment body (data only).' },
      kind: { kind: 'string', required: false, description: 'An optional comment kind.' },
      author: { kind: 'string', required: false, description: 'The acting agent.' },
    },
  },
  {
    name: 'dart_set_label',
    route: 'label/set',
    description: "Set or clear a label, subject to the workflow's settable_by contract. An unauthorized set writes nothing.",
    input: {
      id: { kind: 'string', required: true, description: 'The ticket id.' },
      label: { kind: 'string', required: true, description: 'The label name.' },
      set: { kind: 'boolean', required: false, description: 'true to set (default), false to clear.' },
      by: BY,
      expectedRev: REV,
    },
  },
  {
    name: 'dart_assign',
    route: 'ticket/assign',
    description: 'Assign (or unassign) a ticket to an agent. Records an assign comment.',
    input: {
      id: { kind: 'string', required: true, description: 'The ticket id.' },
      assignee: { kind: 'string', required: false, description: 'The assignee, or omit to unassign.' },
      by: BY,
      expectedRev: REV,
    },
  },
  {
    name: 'dart_require_gate',
    route: 'gate/trigger',
    description: 'Add or strengthen a required gate (add-only). It never passes, satisfies, or removes a gate.',
    input: {
      gate: { kind: 'string', required: true, description: 'The gate name to require.' },
      trigger: { kind: 'string[]', required: false, description: 'Trigger tokens that activate the gate.' },
      owner: { kind: 'string', required: false, description: 'The gate owner agent.' },
      refusal: { kind: 'string', required: false, description: 'hard | soft.' },
      expectedRev: REV,
    },
  },
  {
    name: 'dart_consume_directive',
    route: 'directive/consume',
    description: "Mark a pending directive consumed by appending an audited marker that references the directive's id. Idempotent and durable.",
    input: {
      id: { kind: 'string', required: true, description: 'The ticket id.' },
      directiveId: { kind: 'string', required: true, description: "The directive's recorded id." },
      by: BY,
      note: { kind: 'string', required: false, description: 'An optional marker note.' },
    },
  },
  {
    name: 'dart_read_state',
    route: null,
    read: true,
    description: 'Read the bound project’s workflow projection: tickets, stages, gates, labels contract, active track — the digest’s data, no more.',
    input: {},
  },
  {
    name: 'dart_pending_directives',
    route: null,
    read: true,
    description: 'List the bound project’s un-consumed directives, each with its target[] and prompt as quoted data.',
    input: {},
  },
];

const WRITE_TOOL_NAMES = TOOLS.filter((t) => !t.read).map((t) => t.name);
const READ_TOOL_NAMES = TOOLS.filter((t) => t.read).map((t) => t.name);

module.exports = { TOOLS, WRITE_TOOL_NAMES, READ_TOOL_NAMES, invoke, WRITE_TOOLS, READ_TOOLS };
