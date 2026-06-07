'use strict';
/* Registry CRUD over ~/.aidevteam/registry.json: connect/list/get/remove/touch,
 * dedup by id, tolerant load of a missing/corrupt file, atomic+locked persists,
 * and the contract that remove() drops only the index entry — the user's files
 * on disk are never touched. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRegistry } = require('../lib/registry');
const { projectId } = require('../lib/project-id');

function ctx() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-reg-home-'));
  const reg = createRegistry({ home });
  const file = path.join(home, '.aidevteam', 'registry.json');
  return { home, reg, file, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}
function projectDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-reg-proj-'));
  return fs.realpathSync(dir);
}

test('connect registers a project and list/get return it', async () => {
  const { reg, file, cleanup } = ctx();
  const dir = projectDir();
  try {
    const rec = await reg.connect(dir);
    assert.match(rec.id, /^[0-9a-f]{12}$/);
    assert.equal(rec.path, dir);
    assert.equal(rec.label, path.basename(dir));
    assert.equal(rec.status, 'connected');
    assert.ok(rec.addedAt && rec.lastSeen);

    assert.deepEqual((await reg.list()).map((p) => p.id), [rec.id]);
    assert.equal((await reg.get(rec.id)).path, dir);

    // persisted with the schema envelope
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.projects.length, 1);
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('connect dedups by id — connecting the same folder twice keeps one entry', async () => {
  const { reg, cleanup } = ctx();
  const dir = projectDir();
  try {
    const a = await reg.connect(dir);
    const b = await reg.connect(dir);
    assert.equal(a.id, b.id);
    assert.equal((await reg.list()).length, 1);
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('load tolerates a missing file', async () => {
  const { reg, cleanup } = ctx();
  try {
    assert.deepEqual(await reg.list(), []);
  } finally { cleanup(); }
});

test('load tolerates a corrupt file (never throws)', async () => {
  const { reg, file, cleanup } = ctx();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ this is : not json ]');
    assert.deepEqual(await reg.list(), []);
    // and a subsequent connect still works (overwrites the garbage)
    const dir = projectDir();
    const rec = await reg.connect(dir);
    assert.equal((await reg.list()).length, 1);
    assert.equal(rec.path, dir);
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { cleanup(); }
});

test('touch updates lastSeen', async () => {
  const { reg, cleanup } = ctx();
  const dir = projectDir();
  try {
    const rec = await reg.connect(dir);
    const before = rec.lastSeen;
    await new Promise((r) => setTimeout(r, 5));
    const touched = await reg.touch(rec.id);
    assert.notEqual(touched.lastSeen, before);
    assert.equal((await reg.get(rec.id)).lastSeen, touched.lastSeen);
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('remove drops the registry entry but leaves the project files on disk', async () => {
  const { reg, cleanup } = ctx();
  const dir = projectDir();
  const marker = path.join(dir, 'KEEP_ME.txt');
  fs.writeFileSync(marker, 'user data');
  try {
    const rec = await reg.connect(dir);
    const r = await reg.remove(rec.id);
    assert.equal(r.removed, true);
    assert.equal(await reg.get(rec.id), null);
    assert.deepEqual(await reg.list(), []);
    // the user's files are untouched
    assert.ok(fs.existsSync(dir), 'project directory still exists');
    assert.equal(fs.readFileSync(marker, 'utf8'), 'user data');
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('remove of an unknown id reports removed:false', async () => {
  const { reg, cleanup } = ctx();
  try {
    assert.deepEqual(await reg.remove('aaaaaaaaaaaa'), { removed: false });
  } finally { cleanup(); }
});

test('get of an unknown id returns null', async () => {
  const { reg, cleanup } = ctx();
  try {
    assert.equal(await reg.get('bbbbbbbbbbbb'), null);
  } finally { cleanup(); }
});

test('update applies only whitelisted fields and never mutates id or path', async () => {
  const { reg, cleanup } = ctx();
  const dir = projectDir();
  try {
    const rec = await reg.connect(dir);
    const updated = await reg.update(rec.id, {
      label: 'My Service', color: '#5B8DEF', status: 'offline',
      id: 'ffffffffffff', path: '/etc/passwd', addedAt: 'hacked',
    });
    assert.equal(updated.label, 'My Service');
    assert.equal(updated.color, '#5B8DEF');
    assert.equal(updated.status, 'offline');
    assert.equal(updated.id, rec.id, 'id immutable');
    assert.equal(updated.path, dir, 'path immutable');
    assert.equal(updated.addedAt, rec.addedAt, 'addedAt immutable');
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('connect canonicalizes the path (a symlinked pick stores the real root)', async () => {
  const { reg, cleanup } = ctx();
  const dir = projectDir();
  const link = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-reg-link-')) + '-l';
  fs.symlinkSync(dir, link);
  try {
    const rec = await reg.connect(link);
    assert.equal(rec.path, dir, 'stored path is the canonical realpath');
    assert.equal(rec.id, projectId(dir));
  } finally {
    cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
    try { fs.unlinkSync(link); } catch {}
  }
});

test('concurrent connects serialize without losing entries (mutex)', async () => {
  const { reg, cleanup } = ctx();
  const dirs = Array.from({ length: 8 }, () => projectDir());
  try {
    await Promise.all(dirs.map((d) => reg.connect(d)));
    assert.equal((await reg.list()).length, dirs.length, 'no entry lost to a write race');
  } finally {
    cleanup();
    dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  }
});

test('connect rejects a non-existent path', async () => {
  const { reg, cleanup } = ctx();
  try {
    await assert.rejects(() => reg.connect('/no/such/dir/xyz123'));
  } finally { cleanup(); }
});
