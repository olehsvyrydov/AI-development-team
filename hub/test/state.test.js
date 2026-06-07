'use strict';
/* TDD for ADT-203 hub/lib/state.js — the explicit, multi-ticket workflow projection.
 * AC-X1 (track/stage/assignee/expectedOwner/gates explicit), AC-X2 (backward compat),
 * plus overlay merge and a stable rev. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildState } = require('../lib/state');

const WORKFLOW = `version: 1
preset: small-team
change_classes:
  standard:    { desc: "a feature", track: standard }
tracks:
  standard:  [state_behavior, write_test, implement, self_review, code_review]
  full:      [vision, architecture, security, design, approval_gate, tdd, code_review, qa, verify, done]
gates:
  ARCH_APPROVED:   { owner: "/arch",   refusal: hard, trigger: [new_service] }
  SECOPS_APPROVED: { owner: "/secops", refusal: hard, safety_override: true, trigger: [auth] }
  CODE_REVIEWED:   { owner: "/rev",    refusal: hard, trigger: [track:standard] }
  VERIFIED:        { owner: "/verify", refusal: hard, trigger: [track:full] }
presets:
  small-team:
    always_required: [CODE_REVIEWED]
`;

function fixture(ledger, overrides) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-state-'));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WORKFLOW);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'), JSON.stringify(ledger));
  if (overrides) fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.overrides.json'), JSON.stringify(overrides));
  return dir;
}

test('buildState exposes every ticket with track/stage/assignee/expectedOwner/gates (AC-X1, multi-ticket)', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'full', stage: 'security', assignee: '/secops',
             gates: { ARCH_APPROVED: { state: 'passed', by: '/arch' }, SECOPS_APPROVED: { state: 'pending' } } },
    'T-2': { title: 'B', track: 'standard', stage: 'code_review',
             gates: { CODE_REVIEWED: { state: 'rejected', by: '/rev', note: 'needs tests' } } },
  });
  try {
    const st = buildState(dir);
    assert.equal(st.preset, 'small-team');
    assert.equal(st.tickets.length, 2, 'returns ALL tickets, not just one');
    const t1 = st.tickets.find((t) => t.id === 'T-1');
    assert.equal(t1.track, 'full');
    assert.equal(t1.stage, 'security');
    assert.equal(t1.assignee, '/secops');
    assert.equal(t1.expectedOwner, '/secops');
    const sec = t1.gates.find((g) => g.name === 'SECOPS_APPROVED');
    assert.equal(sec.state, 'pending');
    assert.equal(sec.safety, true);
    assert.equal(sec.refusal, 'hard');
    // top-level projection helpers
    assert.ok(st.tracks.full.includes('verify'), 'tracks parsed');
    assert.ok(st.gateDefs.some((g) => g.name === 'CODE_REVIEWED' && g.required), 'always_required reflected');
    assert.equal(typeof st.rev, 'string');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a rejected hard gate makes the ticket status "blocked"', () => {
  const dir = fixture({ 'T-2': { title: 'B', track: 'standard', stage: 'code_review',
    gates: { CODE_REVIEWED: { state: 'rejected', by: '/rev' } } } });
  try {
    const t2 = buildState(dir).tickets.find((t) => t.id === 'T-2');
    assert.equal(t2.status, 'blocked');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('older ledger without assignee still parses and shows expectedOwner (AC-X2)', () => {
  const dir = fixture({ 'T-3': { title: 'C', track: 'full', stage: 'architecture',
    gates: { ARCH_APPROVED: { state: 'pending' } } } });
  try {
    const t3 = buildState(dir).tickets.find((t) => t.id === 'T-3');
    assert.equal(t3.assignee, null);
    assert.equal(t3.expectedOwner, '/arch', 'derives expected owner when unassigned');
    assert.equal(t3.status, 'waiting');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('overlay (.aidevteam/workflow.overrides.json) merges over the base workflow', () => {
  const dir = fixture(
    { 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } },
    { preset: 'regulated', tracks: { standard: ['implement', 'code_review'] } },
  );
  try {
    const st = buildState(dir);
    assert.equal(st.preset, 'regulated', 'overlay preset wins');
    assert.deepEqual(st.tracks.standard, ['implement', 'code_review'], 'overlay track order wins');
    assert.ok(st.overlay, 'overlay path reported');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
