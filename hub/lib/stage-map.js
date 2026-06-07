'use strict';
/*
 * Canonical stage <-> gate <-> owner mapping.
 *
 * Track stages (workflow.yaml `tracks:`) are not the same tokens as gate names,
 * so this is the bridge. `expectedOwner` derives the owner from the parsed gate
 * owners at runtime, so it follows any workflow.yaml / overrides change. This
 * lets the board show the expected agent for a stage even before a real
 * assignee is set.
 */

// stage token -> governing gate name (stages without a gate are absent)
const STAGE_GATE = {
  architecture: 'ARCH_APPROVED',
  security: 'SECOPS_APPROVED',
  design: 'DESIGN_APPROVED',
  design_qa: 'DESIGN_APPROVED',
  approval_gate: 'APPROVAL_GATE',
  code_review: 'CODE_REVIEWED',
  reliability: 'RELIABILITY_OK',
  verify: 'VERIFIED',
  perf: 'PERF_OK',
};

// owner for gate-less stages (implementation / management / qa)
const STAGE_OWNER_DEFAULT = {
  vision: '/po',
  state_behavior: '/be',
  write_test: '/be',
  tdd: '/be',
  implement: '/be',
  self_review: '/be',
  qa: '/qa',
  done: null,
};

function stageGate(stage) {
  return STAGE_GATE[String(stage || '').toLowerCase()] || null;
}

/** The agent expected to own a stage: the mapped gate's owner, else a default. */
function expectedOwner(stage, wf) {
  const gate = stageGate(stage);
  if (gate) {
    const g = (wf && wf.gates ? wf.gates : []).find((x) => x.name === gate);
    if (g && g.owner) return g.owner;
  }
  return STAGE_OWNER_DEFAULT[String(stage || '').toLowerCase()] || null;
}

module.exports = { STAGE_GATE, STAGE_OWNER_DEFAULT, stageGate, expectedOwner };
