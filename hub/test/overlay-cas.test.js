'use strict';
/*
 * Tests for the compare-and-swap guard on the overlay-writing routes
 * (track/reorder, gate/trigger, preset). A stale expectedRev must be rejected with
 * 409 and leave the overlay byte-unchanged; the base workflow.yaml must never be
 * machine-written (byte-identical before/after any edit).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { handle } = require('../lib/api');
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

function proj() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-ov-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'),
    JSON.stringify({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } }));
  return dir;
}

const overlayPath = (dir) => path.join(dir, '.aidevteam', 'workflow.overrides.json');
function overlayHash(dir) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(overlayPath(dir))).digest('hex'); }
  catch { return 'ABSENT'; }
}
function yamlHash(dir) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'))).digest('hex');
}

const REORDER = ['implement', 'state_behavior', 'write_test', 'self_review', 'code_review'];

// ---- N-14: stale-rev → 409, overlay byte-unchanged ------------------------

test('N-14 track/reorder with a stale expectedRev → 409, overlay unchanged', async () => {
  const dir = proj();
  try {
    const before = overlayHash(dir);
    const r = await handle('track/reorder', { track: 'standard', stages: REORDER, expectedRev: 'stale' }, dir);
    assert.equal(r.code, 409);
    assert.equal(r.payload.conflict, true);
    assert.ok(r.payload.state, 'fresh state returned');
    assert.equal(overlayHash(dir), before, 'overlay byte-unchanged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-14 gate/trigger with a stale expectedRev → 409, overlay unchanged', async () => {
  const dir = proj();
  try {
    const before = overlayHash(dir);
    const r = await handle('gate/trigger', { gate: 'CODE_REVIEWED', refusal: 'soft', expectedRev: 'stale' }, dir);
    assert.equal(r.code, 409);
    assert.equal(overlayHash(dir), before, 'overlay byte-unchanged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-14 preset with a stale expectedRev → 409, overlay unchanged', async () => {
  const dir = proj();
  try {
    const before = overlayHash(dir);
    const r = await handle('preset', { preset: 'regulated', expectedRev: 'stale' }, dir);
    assert.equal(r.code, 409);
    assert.equal(overlayHash(dir), before, 'overlay byte-unchanged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- matching rev succeeds ------------------------------------------------

test('overlay routes accept the matching current rev and write', async () => {
  const dir = proj();
  try {
    let r = await handle('track/reorder', { track: 'standard', stages: REORDER, expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    assert.equal(r.payload.state.tracks.standard[0], 'implement');

    r = await handle('preset', { preset: 'regulated', expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    assert.equal(r.payload.state.preset, 'regulated');

    r = await handle('gate/trigger', { gate: 'CODE_REVIEWED', refusal: 'soft', expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    assert.equal(r.payload.state.gateDefs.find((g) => g.name === 'CODE_REVIEWED').refusal, 'soft');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- backward-compat: no expectedRev still writes (CAS opt-in) -------------

test('overlay routes still write when no expectedRev is supplied', async () => {
  const dir = proj();
  try {
    const r = await handle('preset', { preset: 'small-team' }, dir);
    assert.equal(r.code, 200);
    assert.equal(r.payload.state.preset, 'small-team');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-15: non-permutation rejected, overlay unchanged --------------------

test('N-15 reorder that adds/drops/duplicates a stage → 400, overlay unchanged', async () => {
  const dir = proj();
  try {
    const before = overlayHash(dir);
    assert.equal((await handle('track/reorder', { track: 'standard', stages: ['implement', 'DROP'], expectedRev: computeRev(dir) }, dir)).code, 400);
    assert.equal((await handle('track/reorder', { track: 'standard', stages: [...REORDER, 'extra'], expectedRev: computeRev(dir) }, dir)).code, 400);
    assert.equal((await handle('track/reorder', { track: 'standard', stages: ['implement', 'implement', 'write_test', 'self_review', 'code_review'], expectedRev: computeRev(dir) }, dir)).code, 400);
    assert.equal(overlayHash(dir), before, 'overlay unchanged after rejected reorders');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('preset enum is enforced even with a valid rev (400, overlay unchanged)', async () => {
  const dir = proj();
  try {
    const before = overlayHash(dir);
    assert.equal((await handle('preset', { preset: 'banana', expectedRev: computeRev(dir) }, dir)).code, 400);
    assert.equal(overlayHash(dir), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-16: base workflow.yaml byte-identical ------------------------------

test('N-16 base workflow.yaml is byte-identical after reorder/trigger/preset', async () => {
  const dir = proj();
  try {
    const before = yamlHash(dir);
    await handle('track/reorder', { track: 'standard', stages: REORDER, expectedRev: computeRev(dir) }, dir);
    await handle('gate/trigger', { gate: 'CODE_REVIEWED', refusal: 'soft', expectedRev: computeRev(dir) }, dir);
    await handle('preset', { preset: 'regulated', expectedRev: computeRev(dir) }, dir);
    assert.equal(yamlHash(dir), before, 'base YAML never machine-written');
    assert.ok(fs.existsSync(overlayPath(dir)), 'only the overlay changed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
