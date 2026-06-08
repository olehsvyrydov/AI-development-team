'use strict';
/*
 * resolveProject(id) — the single id→write/stream-target authority at the HTTP
 * boundary. The client `project` value is a registry LOOKUP KEY, never a path:
 * shape-checked first (anchored 12-hex), resolved only via registry.get →
 * record.path, refused (400/404) writing nothing on a crafted/unknown id, and
 * falling back to the launch project when absent (single-project back-compat).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRegistry } = require('../lib/registry');
const { resolveProject } = require('../lib/resolve-project');

function ctx() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-resolve-home-')));
  const registry = createRegistry({ home });
  const launch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-resolve-launch-')));
  const cleanup = () => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(launch, { recursive: true, force: true });
  };
  return { home, registry, launch, cleanup };
}
function projectDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-resolve-proj-')));
}

test('absent id falls back to the launch project (single-project mode)', async () => {
  const { registry, launch, cleanup } = ctx();
  try {
    for (const id of [undefined, null, '']) {
      const r = await resolveProject(id, { registry, launch });
      assert.equal(r.ok, true);
      assert.equal(r.dir, launch);
    }
  } finally { cleanup(); }
});

test('a registered id resolves to its canonical record.path', async () => {
  const { registry, launch, cleanup } = ctx();
  const dir = projectDir();
  try {
    const rec = await registry.connect(dir);
    const r = await resolveProject(rec.id, { registry, launch });
    assert.equal(r.ok, true);
    assert.equal(r.dir, rec.path);
    assert.notEqual(r.dir, launch, 'a present id never resolves to the launch dir');
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a well-formed but unregistered id → 404, no dir', async () => {
  const { registry, launch, cleanup } = ctx();
  try {
    const r = await resolveProject('abcdef012345', { registry, launch });
    assert.equal(r.ok, false);
    assert.equal(r.code, 404);
    assert.equal(r.error, 'unknown project');
    assert.equal(r.dir, undefined);
  } finally { cleanup(); }
});

test('crafted ids fail the anchored shape check → 400, never a registry/path op', async () => {
  const { registry, launch, cleanup } = ctx();
  try {
    const crafted = [
      '../../etc/passwd',
      '..%2f..%2f',
      '/etc',
      '/home/x/other',
      'aaaaaa/bbbbbb',
      'aaaaaaaaaaaa\0',
      'aaaaaaaaaaa',     // 11
      'aaaaaaaaaaaaa',   // 13
      'zzzzzzzzzzzz',    // non-hex
      'AAAAAAAAAAAA',    // uppercase
      '..',
    ];
    for (const id of crafted) {
      const r = await resolveProject(id, { registry, launch });
      assert.equal(r.ok, false, `${JSON.stringify(id)} refused`);
      assert.equal(r.code, 400, `${JSON.stringify(id)} → 400`);
      assert.equal(r.error, 'invalid project id');
      assert.equal(r.dir, undefined);
    }
  } finally { cleanup(); }
});

test('a present id in a registry-less env finds no row → 404; absent stays on launch', async () => {
  const { registry, launch, cleanup } = ctx();
  try {
    assert.equal((await resolveProject('abcdef012345', { registry, launch })).code, 404);
    assert.equal((await resolveProject(null, { registry, launch })).dir, launch);
  } finally { cleanup(); }
});
