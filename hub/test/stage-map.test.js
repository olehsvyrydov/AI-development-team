'use strict';
/* TDD for ADT-203 stage-map: which gate governs a stage, and the expected owner
 * (derived from the parsed gate owners so it follows workflow.yaml / overrides). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stageGate, expectedOwner } = require('../lib/stage-map');

// minimal parsed workflow: gates with owners (as state.js produces)
const WF = {
  gates: [
    { name: 'ARCH_APPROVED', owner: '/arch' },
    { name: 'SECOPS_APPROVED', owner: '/secops' },
    { name: 'DESIGN_APPROVED', owner: '/ui' },
    { name: 'CODE_REVIEWED', owner: '/rev' },
    { name: 'VERIFIED', owner: '/verify' },
  ],
};

test('stageGate maps a track stage to its governing gate (or null)', () => {
  assert.equal(stageGate('architecture'), 'ARCH_APPROVED');
  assert.equal(stageGate('security'), 'SECOPS_APPROVED');
  assert.equal(stageGate('code_review'), 'CODE_REVIEWED');
  assert.equal(stageGate('verify'), 'VERIFIED');
  assert.equal(stageGate('implement'), null); // no gate
  assert.equal(stageGate('done'), null);
});

test('expectedOwner derives from the gate owner when the stage maps to a gate', () => {
  assert.equal(expectedOwner('architecture', WF), '/arch');
  assert.equal(expectedOwner('security', WF), '/secops');
  assert.equal(expectedOwner('code_review', WF), '/rev');
});

test('expectedOwner falls back to a default for gate-less stages', () => {
  assert.equal(expectedOwner('vision', WF), '/po');
  assert.equal(expectedOwner('qa', WF), '/qa');
  assert.ok(['/be', '/fe'].includes(expectedOwner('implement', WF)));
});

test('expectedOwner follows an overridden gate owner', () => {
  const wf2 = { gates: [{ name: 'CODE_REVIEWED', owner: '/backend-reviewer' }] };
  assert.equal(expectedOwner('code_review', wf2), '/backend-reviewer');
});
