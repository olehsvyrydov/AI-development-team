'use strict';
/* TDD for ADT-206 write layer (Soren C5): atomic CAS ledger writes (no lost
 * updates vs concurrent agent edits), overlay merge, and append-only comments. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const w = require('../lib/write');

function tmp(ledger) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-write-'));
  if (ledger) fs.writeFileSync(path.join(dir, '.workflow-state.json'), JSON.stringify(ledger));
  return dir;
}

test('readModifyWriteLedger applies the mutator and bumps the rev', async () => {
  const dir = tmp({ 'T-1': { title: 'A', stage: 'dev', gates: {} } });
  try {
    const r = await w.readModifyWriteLedger(dir, null, (led) => { led['T-1'].stage = 'review'; });
    assert.equal(r.ok, true);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, '.workflow-state.json'), 'utf8'));
    assert.equal(saved['T-1'].stage, 'review');
    assert.equal(typeof r.rev, 'string');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CAS rejects a stale expectedRev (no lost-update clobber)', async () => {
  const dir = tmp({ 'T-1': { title: 'A', stage: 'dev', gates: {} } });
  try {
    const r = await w.readModifyWriteLedger(dir, 'definitely-stale-rev', (led) => { led['T-1'].stage = 'review'; });
    assert.equal(r.ok, false);
    assert.equal(r.conflict, true);
    // the ledger is unchanged
    const saved = JSON.parse(fs.readFileSync(path.join(dir, '.workflow-state.json'), 'utf8'));
    assert.equal(saved['T-1'].stage, 'dev');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CAS accepts the matching current rev', async () => {
  const dir = tmp({ 'T-1': { title: 'A', stage: 'dev', gates: {} } });
  try {
    const rev = w.computeRev(dir);
    const r = await w.readModifyWriteLedger(dir, rev, (led) => { led['T-1'].assignee = '/be'; });
    assert.equal(r.ok, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('concurrent writes serialize without corruption (mutex)', async () => {
  const dir = tmp({ 'T-1': { title: 'A', n: 0, gates: {} } });
  try {
    await Promise.all(Array.from({ length: 20 }, () =>
      w.readModifyWriteLedger(dir, null, (led) => { led['T-1'].n = (led['T-1'].n || 0) + 1; })));
    const saved = JSON.parse(fs.readFileSync(path.join(dir, '.workflow-state.json'), 'utf8'));
    assert.equal(saved['T-1'].n, 20, 'no increments lost');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('writeOverlay deep-merges into .aidevteam/workflow.overrides.json', async () => {
  const dir = tmp();
  try {
    await w.writeOverlay(dir, { preset: 'regulated' });
    await w.writeOverlay(dir, { tracks: { standard: ['implement', 'code_review'] } });
    const ov = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'workflow.overrides.json'), 'utf8'));
    assert.equal(ov.preset, 'regulated', 'first patch preserved');
    assert.deepEqual(ov.tracks.standard, ['implement', 'code_review'], 'second patch merged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('appendComment writes an append-only JSONL line and caps the body (C5)', async () => {
  const dir = tmp();
  try {
    const c1 = await w.appendComment(dir, 'T-1', { author: '/rev', kind: 'gate', body: 'rejected: needs tests' });
    await w.appendComment(dir, 'T-1', { author: '/be', kind: 'handoff', body: 'fixed' });
    const file = path.join(dir, '.aidevteam', 'comments', 'T-1.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    const rec = JSON.parse(lines[0]);
    assert.equal(rec.author, '/rev');
    assert.equal(rec.kind, 'gate');
    assert.ok(rec.ts && rec.id);
    assert.equal(c1.author, '/rev');
    // body cap
    const big = await w.appendComment(dir, 'T-2', { author: '/x', body: 'a'.repeat(20000) });
    assert.ok(big.body.length <= 8192, 'body capped at 8KB');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
