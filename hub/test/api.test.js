'use strict';
/* Tests for the control-plane routes: advance/assign/gate.set with audit
 * comments, validation (unknown input → 400), CAS conflict (409), overlay-only
 * workflow edits, and the no-clobber-of-YAML guarantee. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { handle, isPermutation } = require('../lib/api');
const { computeRev } = require('../lib/write');

const WF = `version: 1
preset: solo
tracks:
  standard: [state_behavior, write_test, implement, self_review, code_review]
gates:
  CODE_REVIEWED: { owner: "/rev", refusal: hard, trigger: [track:standard] }
presets:
  solo: { always_required: [] }
`;

function proj(ledger) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-api-'));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'), JSON.stringify(ledger));
  return dir;
}

test('gate/set updates the ledger AND emits a typed gate comment', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'standard', stage: 'code_review', gates: {} } });
  try {
    const r = await handle('gate/set', { id: 'T-1', gate: 'CODE_REVIEWED', state: 'rejected', note: 'needs tests', by: '/rev' }, dir);
    assert.equal(r.code, 200);
    const led = JSON.parse(fs.readFileSync(path.join(dir, '.workflow-state.json'), 'utf8'));
    assert.equal(led['T-1'].gates.CODE_REVIEWED.state, 'rejected');
    const comments = fs.readFileSync(path.join(dir, '.aidevteam', 'comments', 'T-1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(comments[0].kind, 'gate');
    assert.equal(comments[0].gate, 'CODE_REVIEWED');
    assert.equal(comments[0].author, '/rev');
    // and the returned state reflects the blocked status
    assert.equal(r.payload.state.tickets.find((t) => t.id === 'T-1').status, 'blocked');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('validation: unknown ticket / unknown gate / bad state → 400', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'standard', stage: 'code_review', gates: {} } });
  try {
    assert.equal((await handle('gate/set', { id: 'NOPE', gate: 'CODE_REVIEWED', state: 'passed' }, dir)).code, 400);
    assert.equal((await handle('gate/set', { id: 'T-1', gate: 'NOSUCH', state: 'passed' }, dir)).code, 400);
    assert.equal((await handle('gate/set', { id: 'T-1', gate: 'CODE_REVIEWED', state: 'weird' }, dir)).code, 400);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CAS: a stale expectedRev is rejected with 409', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } });
  try {
    const r = await handle('ticket/advance', { id: 'T-1', toStage: 'code_review', expectedRev: 'stale' }, dir);
    assert.equal(r.code, 409);
    assert.equal(r.payload.conflict, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('advance with the matching rev succeeds and bumps stage', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } });
  try {
    const r = await handle('ticket/advance', { id: 'T-1', toStage: 'code_review', expectedRev: computeRev(dir), by: '/be' }, dir);
    assert.equal(r.code, 200);
    assert.equal(r.payload.state.tickets[0].stage, 'code_review');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('track/reorder writes the overlay only and leaves workflow.yaml untouched', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } });
  try {
    const before = fs.readFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), 'utf8');
    const r = await handle('track/reorder', { track: 'standard', stages: ['implement', 'state_behavior', 'write_test', 'self_review', 'code_review'] }, dir);
    assert.equal(r.code, 200);
    const ov = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'workflow.overrides.json'), 'utf8'));
    assert.equal(ov.tracks.standard[0], 'implement');
    assert.equal(fs.readFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), 'utf8'), before, 'base YAML untouched');
    assert.deepEqual(r.payload.state.tracks.standard, ov.tracks.standard, 'effective state reflects overlay');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('track/reorder rejects a non-permutation (400)', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } });
  try {
    const r = await handle('track/reorder', { track: 'standard', stages: ['implement', 'DROP'] }, dir);
    assert.equal(r.code, 400);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('isPermutation accepts a reordering and rejects extra/missing/duplicate/wrong-length', () => {
  assert.equal(isPermutation(['a', 'b', 'c'], ['c', 'a', 'b']), true, 'same multiset, reordered');
  assert.equal(isPermutation(['a', 'b'], ['a', 'b', 'c']), false, 'extra element / wrong length');
  assert.equal(isPermutation(['a', 'b', 'c'], ['a', 'b']), false, 'missing element / wrong length');
  assert.equal(isPermutation(['a', 'a', 'b'], ['a', 'b', 'b']), false, 'same length, different multiplicities');
  assert.equal(isPermutation(['a', 'b'], 'not-an-array'), false, 'non-array second argument');
});

test('isPermutation is not fooled by delimiter-free concatenation collisions', () => {
  // ['a','bc'] and ['ab','c'] both concatenate to 'abc' after sorting with no
  // delimiter, but they are NOT permutations of each other.
  assert.equal(isPermutation(['a', 'bc'], ['ab', 'c']), false);
});

test('preset validates the enum and writes the overlay', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } });
  try {
    assert.equal((await handle('preset', { preset: 'banana' }, dir)).code, 400);
    const r = await handle('preset', { preset: 'regulated' }, dir);
    assert.equal(r.code, 200);
    assert.equal(r.payload.state.preset, 'regulated');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
