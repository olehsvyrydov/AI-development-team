'use strict';
/*
 * Route-level tests for kb/update + kb/remove via api.handle: fresh state returned,
 * CAS 409 → conflict, no path/stack leak. The HTTP write-guard (X-AIDT/loopback) is
 * proven separately in mutation-guard.test.js by route placement; here we prove the
 * handler's CAS + projection + error-hygiene contract.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { handle } = require('../lib/api');
const { buildState } = require('../lib/state');

function tmpProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-crud-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  return dir;
}
function docRev(dir, name) {
  const d = buildState(dir).knowledge.docs.find((x) => x.name === name);
  return d && d.rev;
}

test('kb/update edits the body and returns fresh state', async () => {
  const dir = tmpProject();
  try {
    await handle('kb/add', { title: 'Route Edit', body: 'before', scope: 'project' }, dir);
    const rev = docRev(dir, 'route-edit');
    const r = await handle('kb/update', { file: 'route-edit.md', scope: 'project', body: 'after', expectedRev: rev }, dir);
    assert.equal(r.code, 200);
    assert.ok(r.payload.state, 'fresh state returned');
    assert.ok(r.payload.state.knowledge.docs.some((d) => d.name === 'route-edit'));
    const stored = fs.readFileSync(path.join(dir, r.payload.doc.file), 'utf8');
    assert.match(stored, /after/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kb/update with a stale rev → 409 conflict carrying fresh state', async () => {
  const dir = tmpProject();
  try {
    await handle('kb/add', { title: 'Stale', body: 'v1', scope: 'project' }, dir);
    const file = path.join(dir, '.aidevteam', 'kb', 'stale.md');
    const before = fs.readFileSync(file);
    const r = await handle('kb/update', { file: 'stale.md', scope: 'project', body: 'v2', expectedRev: 'STALE:0:0' }, dir);
    assert.equal(r.code, 409);
    assert.equal(r.payload.conflict, true);
    assert.ok(r.payload.state, 'fresh state in the conflict payload');
    assert.ok(fs.readFileSync(file).equals(before), 'note byte-unchanged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kb/remove soft-deletes and returns fresh state with the note gone', async () => {
  const dir = tmpProject();
  try {
    await handle('kb/add', { title: 'Gone Route', body: 'x', scope: 'project' }, dir);
    const rev = docRev(dir, 'gone-route');
    const r = await handle('kb/remove', { file: 'gone-route.md', scope: 'project', expectedRev: rev }, dir);
    assert.equal(r.code, 200);
    assert.ok(!r.payload.state.knowledge.docs.some((d) => d.name === 'gone-route'), 'gone from the projection');
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'kb', 'gone-route.md')), 'gone from the vault');
    assert.equal(fs.readdirSync(path.join(dir, '.aidevteam', 'kb', '.trash')).length, 1, 'recoverable in .trash');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kb/remove with a stale rev → 409 conflict, nothing moved', async () => {
  const dir = tmpProject();
  try {
    await handle('kb/add', { title: 'Hold Route', body: 'x', scope: 'project' }, dir);
    const r = await handle('kb/remove', { file: 'hold-route.md', scope: 'project', expectedRev: 'STALE:0:0' }, dir);
    assert.equal(r.code, 409);
    assert.equal(r.payload.conflict, true);
    assert.ok(fs.existsSync(path.join(dir, '.aidevteam', 'kb', 'hold-route.md')), 'note untouched');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kb/update on a missing note → 400 with no path/stack leak', async () => {
  const dir = tmpProject();
  try {
    const r = await handle('kb/update', { file: 'nope.md', scope: 'project', body: 'x', expectedRev: '0' }, dir);
    assert.equal(r.code, 400);
    const msg = JSON.stringify(r.payload);
    assert.ok(!msg.includes(dir), 'no project path leaked');
    assert.ok(!msg.includes(os.tmpdir()), 'no tmp path leaked');
    assert.ok(!/\bat \w+.*:\d+:\d+/.test(msg), 'no stack frame leaked');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the projection surfaces a per-note rev for the CAS round-trip', async () => {
  const dir = tmpProject();
  try {
    await handle('kb/add', { title: 'Has Rev', body: 'x', scope: 'project' }, dir);
    const d = buildState(dir).knowledge.docs.find((x) => x.name === 'has-rev');
    assert.ok(d.rev && /^\d/.test(String(d.rev)), 'doc carries a non-empty rev');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
