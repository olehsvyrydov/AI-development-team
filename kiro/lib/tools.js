'use strict';
/*
 * The single source of truth for which DART MCP tools are auto-approved.
 *
 * ONLY read-only tools may be auto-approved / pre-allowed: surfacing workflow
 * state and pending directives never mutates the ledger. The write tools
 * (advance / set-gate / require-gate / comment / set-label / assign /
 * consume-directive) are deliberately absent so they stay confirmation-gated in
 * Kiro — the single-writer-with-confirmation posture. Both the mcp.json
 * `autoApprove` and the agent JSON `allowedTools` derive from this one list, so
 * they cannot drift, and "*" is never emitted.
 */

/** The read-only DART tools, and the ONLY tools ever auto-approved. */
const READ_ONLY_TOOLS = Object.freeze(['dart_read_state', 'dart_pending_directives']);

/** The DART write tools — never auto-approved; always confirmation-gated. */
const WRITE_TOOLS = Object.freeze([
  'dart_advance_ticket',
  'dart_set_gate',
  'dart_require_gate',
  'dart_comment',
  'dart_set_label',
  'dart_assign',
  'dart_consume_directive',
]);

module.exports = { READ_ONLY_TOOLS, WRITE_TOOLS };
