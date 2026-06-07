'use strict';
/* Project identity parity: hub/lib/project-id.js must reproduce the algorithm in
 * claude/memory/src/lib/project-id.ts byte-for-byte (sha1 of the canonical root,
 * first 12 hex). A divergence would split a project's board from its memory rows. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { projectId, projectRoot } = require('../lib/project-id');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-pid-'));
}

// the TS algorithm, reproduced independently here as the oracle
function tsProjectRoot(dir) {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim();
    if (top) return top;
  } catch { /* not a repo */ }
  try { return fs.realpathSync(dir); } catch { return dir; }
}
function tsProjectId(dir) {
  return crypto.createHash('sha1').update(tsProjectRoot(dir)).digest('hex').slice(0, 12);
}

test('projectId is 12 lowercase hex chars', () => {
  const dir = tmpDir();
  try {
    const id = projectId(dir);
    assert.match(id, /^[0-9a-f]{12}$/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectId matches the TS algorithm for a non-git dir (realpath path)', () => {
  const dir = tmpDir();
  try {
    assert.equal(projectId(dir), tsProjectId(dir));
    assert.equal(projectRoot(dir), tsProjectRoot(dir));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectId matches the TS algorithm inside a git repo (toplevel)', () => {
  const dir = tmpDir();
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const sub = path.join(dir, 'pkg', 'inner');
    fs.mkdirSync(sub, { recursive: true });
    // a path inside the repo and the repo root yield the same id (both → toplevel)
    assert.equal(projectId(sub), projectId(dir));
    assert.equal(projectId(dir), tsProjectId(dir));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectRoot resolves symlinks for a non-git dir', () => {
  const real = tmpDir();
  const link = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-pid-link-')) + '-l';
  try {
    fs.symlinkSync(real, link);
    // realpath collapses the symlink so both pick the same canonical root + id
    assert.equal(projectRoot(link), fs.realpathSync(real));
    assert.equal(projectId(link), projectId(real));
  } finally {
    fs.rmSync(real, { recursive: true, force: true });
    try { fs.unlinkSync(link); } catch {}
  }
});
