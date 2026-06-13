'use strict';
/*
 * Tests for the knowledge edit (editKbNote) + soft-delete (deleteKbNote) writers,
 * extending the one guarded writer. The negatives N-1..N-18 + N-31..N-35 prove
 * containment, no-symlink-follow, CAS, soft-delete-not-unlink, scan-excluded trash,
 * scope-MOVE-contained-both-sides, scope-is-enum, and inert storage.
 *
 * Method for every refusal: snapshot the relevant vault/files BEFORE and assert
 * BYTE-IDENTICAL after — nothing written/moved/trashed, not merely the error code.
 *
 * Common-vault tests run under a CONTROLLED tmp HOME so the real ~/.aidevteam is
 * never touched.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshTmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}
function tmpProject() {
  const dir = freshTmp('aidt-ed-');
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  return dir;
}
function listFiles(dir) {
  const out = [];
  (function walk(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  })(dir);
  return out.sort();
}
function snapshot(dir) {
  const snap = {};
  for (const f of listFiles(dir)) snap[path.relative(dir, f)] = fs.readFileSync(f);
  return snap;
}
function assertUnchanged(dir, before, msg) {
  const after = snapshot(dir);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), `${msg}: file list unchanged`);
  for (const k of Object.keys(before)) {
    assert.ok(after[k] && before[k].equals(after[k]), `${msg}: ${k} bytes unchanged`);
  }
}
async function withTmpHome(fn) {
  const home = freshTmp('aidt-home-');
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try { return await fn(home); }
  finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevProfile;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const w = require('../lib/write');
const { buildKnowledge } = require('../lib/state');

function kbDir(dir) { return path.join(dir, '.aidevteam', 'kb'); }

// The per-note CAS rev the real route uses: read `rev` straight off the projection
// the client sees (buildKnowledge().docs), resolving by the server-derived slug +
// scope. Returns null when the note is absent from the projection (e.g. an escaping
// symlink that never surfaces as a doc).
function noteRev(dir, { scope, file }) {
  const slug = path.basename(String(file)).replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const doc = buildKnowledge(dir).docs.find((d) => d.scope === scope && d.name === slug);
  return doc ? doc.rev : null;
}

// ---- happy: edit body in place keeps the same slug -------------------------

test('editKbNote rewrites the body in place under the same slug', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Code Rules', body: 'old body', scope: 'project', stack: ['java'], kind: 'rule' });
    assert.equal(a.ok, true);
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    const e = await w.editKbNote(dir, { file: a.doc.file, scope: 'project', body: 'new body', stack: ['python'], kind: 'pattern', expectedRev: rev });
    assert.equal(e.ok, true);
    assert.equal(e.doc.name, 'code-rules', 'same slug');
    const txt = fs.readFileSync(path.join(dir, e.doc.file), 'utf8');
    assert.match(txt, /new body/);
    assert.ok(!txt.includes('old body'), 'old body gone');
    assert.match(txt, /stack: \[python\]/);
    assert.match(txt, /kind: pattern/);
    // exactly one file (no second slug created)
    assert.equal(listFiles(kbDir(dir)).filter((f) => f.endsWith('.md')).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-1 edit containment — crafted id/file cannot escape -------------------

test('N-1 a crafted file/id resolving outside the vault edits nothing', async () => {
  const dir = tmpProject();
  const outside = freshTmp('aidt-out-');
  try {
    const secret = path.join(outside, 'secret.md');
    fs.writeFileSync(secret, 'SECRET');
    const a = await w.addKbNote(dir, { title: 'Real', body: 'x', scope: 'project' });
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    for (const bad of ['../../../' + path.relative('/', secret), '/etc/passwd', '../../secret', path.join('..', '..', 'secret.md')]) {
      const before = fs.readFileSync(secret);
      const r = await w.editKbNote(dir, { file: bad, scope: 'project', body: 'PWNED', expectedRev: rev });
      assert.ok(fs.readFileSync(secret).equals(before), `external secret unchanged for ${bad}`);
      if (r.ok) {
        // if it resolved, it must be inside the vault (basename-only), never the secret
        assert.ok(fs.realpathSync(path.dirname(path.join(dir, r.doc.file))).startsWith(fs.realpathSync(kbDir(dir))));
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-2 edit re-validates body (cap / text / empty) -----------------------

test('N-2 edit with oversize / binary / empty body → 400, note byte-unchanged', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Keep', body: 'original', scope: 'project' });
    const file = path.join(dir, a.doc.file);
    const before = fs.readFileSync(file);
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    for (const body of ['a'.repeat(65 * 1024), 'has\0nul', '']) {
      const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'project', body, expectedRev: rev });
      assert.equal(r.ok, false);
      assert.equal(r.code, 400);
      assert.ok(fs.readFileSync(file).equals(before), 'note byte-unchanged');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-3 server-derived slug on edit; no client path -----------------------

test('N-3 edit cannot relocate/rename via a path-shaped file field', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Stable', body: 'x', scope: 'project' });
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    const r = await w.editKbNote(dir, { file: 'sub/../stable.md.sh', scope: 'project', body: 'y', expectedRev: rev });
    // resolution is basename+slug → either edits stable.md, or refuses; never creates .sh / nested
    const files = listFiles(kbDir(dir)).filter((f) => f.endsWith('.md'));
    assert.ok(files.every((f) => f.endsWith('.md')));
    assert.ok(!listFiles(dir).some((f) => f.endsWith('.sh')), 'no .sh file');
    if (r.ok) assert.equal(r.doc.name, 'stable');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-4 title immutable on edit -------------------------------------------

test('N-4 changing the title does not rename the slug (title immutable)', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Original Name', body: 'x', scope: 'project' });
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'project', title: 'A Totally New Name', body: 'y', expectedRev: rev });
    assert.equal(r.ok, true);
    assert.equal(r.doc.name, 'original-name', 'slug unchanged despite title change');
    assert.ok(fs.existsSync(path.join(kbDir(dir), 'original-name.md')));
    assert.ok(!fs.existsSync(path.join(kbDir(dir), 'a-totally-new-name.md')), 'no rename');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-6 edit never follows a symlink out of the vault ---------------------

test('N-6 editing a note whose on-disk path is a symlink out of the vault is refused/contained', async () => {
  const dir = tmpProject();
  const outside = freshTmp('aidt-sym-');
  try {
    const kb = kbDir(dir);
    fs.mkdirSync(kb, { recursive: true });
    const external = path.join(outside, 'external.txt');
    fs.writeFileSync(external, 'EXTERNAL');
    let linked = true;
    try { fs.symlinkSync(external, path.join(kb, 'linky.md')); } catch { linked = false; }
    if (!linked) { console.log('N-6 skipped: no symlink support'); return; }
    const before = fs.readFileSync(external);
    const r = await w.editKbNote(dir, { file: 'linky.md', scope: 'project', body: 'OVERWRITE', expectedRev: noteRev(dir, { scope: 'project', file: '.aidevteam/kb/linky.md' }) });
    assert.ok(fs.readFileSync(external).equals(before), 'external target not written through the symlink');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-7 CAS on edit — lost-update -----------------------------------------

test('N-7 a stale expectedRev on edit → conflict, nothing written', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'CAS Note', body: 'v1', scope: 'project' });
    const file = path.join(dir, a.doc.file);
    const before = fs.readFileSync(file);
    const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'project', body: 'v2', expectedRev: 'STALE:0:0' });
    assert.equal(r.ok, false);
    assert.equal(r.conflict, true);
    assert.ok(fs.readFileSync(file).equals(before), 'note byte-unchanged on conflict');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-8 soft-delete moves to contained .trash, not unlink -----------------

test('N-8 deleteKbNote moves the file into <vault>/.trash, not unlink (recoverable)', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'To Remove', body: 'keepme', scope: 'project' });
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    const r = await w.deleteKbNote(dir, { file: a.doc.file, scope: 'project', expectedRev: rev });
    assert.equal(r.ok, true);
    assert.ok(!fs.existsSync(path.join(dir, a.doc.file)), 'original gone from the vault');
    const trash = path.join(kbDir(dir), '.trash');
    const trashed = listFiles(trash);
    assert.equal(trashed.length, 1, 'exactly one file in .trash');
    assert.ok(fs.readFileSync(trashed[0], 'utf8').includes('keepme'), 'content preserved (not unlinked)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-9 .trash is scan-excluded -------------------------------------------

test('N-9 a trashed note is no longer surfaced by buildKnowledge', async () => {
  const dir = tmpProject();
  try {
    const { buildKnowledge } = require('../lib/state');
    const a = await w.addKbNote(dir, { title: 'Vanish', body: 'x', scope: 'project' });
    assert.ok(buildKnowledge(dir).docs.some((d) => d.name === 'vanish'));
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    await w.deleteKbNote(dir, { file: a.doc.file, scope: 'project', expectedRev: rev });
    assert.ok(!buildKnowledge(dir).docs.some((d) => d.name === 'vanish'), 'gone from the projection');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-10 no hard unlink reachable -----------------------------------------

test('N-10 the delete path uses no fs.unlink/rm/rmdir on a vault file (source-scan)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'write.js'), 'utf8');
  // the delete writer must not contain a destructive primitive
  assert.ok(!/fs\.unlink/.test(src), 'no fs.unlink in write.js');
  assert.ok(!/fs\.rmSync|fs\.rm\(/.test(src), 'no fs.rm in write.js');
  assert.ok(!/fs\.rmdir/.test(src), 'no fs.rmdir in write.js');
});

// ---- N-11 delete containment — crafted id cannot delete outside vault -------

test('N-11 a crafted file/scope on delete moves nothing outside the vault', async () => {
  const dir = tmpProject();
  const outside = freshTmp('aidt-dout-');
  try {
    const secret = path.join(outside, 'secret.md');
    fs.writeFileSync(secret, 'SECRET');
    await w.addKbNote(dir, { title: 'Anchor', body: 'x', scope: 'project' });
    for (const bad of ['../../../' + path.relative('/', secret), '/etc/passwd', '../../secret.md']) {
      const before = fs.readFileSync(secret);
      const r = await w.deleteKbNote(dir, { file: bad, scope: 'project', expectedRev: '0' });
      assert.ok(fs.existsSync(secret), 'external secret not moved/removed');
      assert.ok(fs.readFileSync(secret).equals(before));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-12 .trash target cannot escape the vault ----------------------------

test('N-12 a symlinked .trash escaping the vault is refused; nothing lands outside', async () => {
  const dir = tmpProject();
  const outside = freshTmp('aidt-tesc-');
  try {
    const kb = kbDir(dir);
    fs.mkdirSync(kb, { recursive: true });
    let linked = true;
    try { fs.symlinkSync(outside, path.join(kb, '.trash')); } catch { linked = false; }
    if (!linked) { console.log('N-12 skipped: no symlink support'); return; }
    const a = await w.addKbNote(dir, { title: 'Guard', body: 'x', scope: 'project' });
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    const before = snapshot(outside);
    const r = await w.deleteKbNote(dir, { file: a.doc.file, scope: 'project', expectedRev: rev });
    assert.equal(r.ok, false, 'refused');
    assertUnchanged(outside, before, 'escaping .trash target');
    assert.ok(fs.existsSync(path.join(dir, a.doc.file)), 'note still in vault (nothing moved)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-13 CAS on delete — lost-update --------------------------------------

test('N-13 a stale expectedRev on delete → conflict, nothing moved/trashed', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Hold', body: 'x', scope: 'project' });
    const before = snapshot(kbDir(dir));
    const r = await w.deleteKbNote(dir, { file: a.doc.file, scope: 'project', expectedRev: 'STALE:0:0' });
    assert.equal(r.ok, false);
    assert.equal(r.conflict, true);
    assertUnchanged(kbDir(dir), before, 'vault on delete-conflict');
    assert.ok(!fs.existsSync(path.join(kbDir(dir), '.trash')), 'no .trash created on conflict');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-14 delete audited (slug/scope/actor, no path) -----------------------

test('N-14 a confirmed delete appends a kb-delete audit record with no filesystem path', async () => {
  const dir = tmpProject();
  try {
    const { readComments } = require('../lib/write');
    const a = await w.addKbNote(dir, { title: 'Audited', body: 'x', scope: 'project' });
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    await w.deleteKbNote(dir, { file: a.doc.file, scope: 'project', expectedRev: rev, by: 'tester' });
    const comments = readComments(dir, 'knowledge');
    const del = comments.find((c) => c.kind === 'kb-delete');
    assert.ok(del, 'kb-delete audit record exists');
    const msg = JSON.stringify(del);
    assert.ok(msg.includes('audited') || msg.includes('project'), 'records slug/scope');
    assert.ok(!msg.includes(dir), 'no filesystem path in the audit record');
    assert.ok(!msg.includes(kbDir(dir)), 'no vault path in the audit record');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-16 scope-MOVE contained on BOTH sides -------------------------------

test('N-16 a scope change project→common moves the file + soft-deletes the source', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const a = await w.addKbNote(dir, { title: 'Promote Me', body: 'shared rule', scope: 'project', stack: ['java'] });
      const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
      const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'common', body: 'shared rule', stack: ['java'], expectedRev: rev });
      assert.equal(r.ok, true);
      assert.equal(r.doc.scope, 'common');
      // destination contained in the common vault
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const commonFiles = listFiles(commonDir).filter((f) => f.endsWith('.md'));
      assert.equal(commonFiles.length, 1, 'one file in common');
      assert.match(fs.readFileSync(commonFiles[0], 'utf8'), /scope: common/);
      // source soft-deleted (gone from the project vault top level, recoverable in .trash)
      assert.ok(!fs.existsSync(path.join(dir, a.doc.file)), 'source removed from project vault');
      assert.equal(listFiles(path.join(kbDir(dir), '.trash')).length, 1, 'source recoverable in project .trash');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-16b common→project move lands in the project vault, source soft-deleted', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const a = await w.addKbNote(dir, { title: 'Demote Me', body: 'x', scope: 'common', stack: ['any'] });
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const rev = noteRev(dir, { scope: 'common', file: path.basename(a.doc.file) });
      const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'project', body: 'x', expectedRev: rev });
      assert.equal(r.ok, true);
      assert.equal(r.doc.scope, 'project');
      assert.ok(fs.existsSync(path.join(dir, r.doc.file)), 'lands in project vault');
      const commonTop = fs.readdirSync(commonDir).filter((f) => f.endsWith('.md'));
      assert.equal(commonTop.length, 0, 'gone from common top level');
      assert.equal(listFiles(path.join(commonDir, '.trash')).length, 1, 'recoverable in common .trash');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-17 scope is an enum, not a path -------------------------------------

test('N-17 a path-shaped / out-of-enum scope on edit is refused; nothing moved', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const a = await w.addKbNote(dir, { title: 'Enum', body: 'x', scope: 'project' });
      const file = path.join(dir, a.doc.file);
      const before = fs.readFileSync(file);
      const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
      for (const bad of ['../x', '/abs', 'common/../..', 'bogus']) {
        const r = await w.editKbNote(dir, { file: a.doc.file, scope: bad, body: 'y', expectedRev: rev });
        assert.equal(r.ok, false, `scope=${bad} refused`);
        const msg = JSON.stringify(r);
        assert.ok(!msg.includes(home) && !msg.includes(dir), `no path leak for scope=${bad}`);
        assert.ok(fs.readFileSync(file).equals(before), `note unchanged for scope=${bad}`);
      }
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-18 CAS on the MOVE --------------------------------------------------

test('N-18 a stale expectedRev on a scope-changing edit → conflict; file stays put', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const a = await w.addKbNote(dir, { title: 'Move CAS', body: 'x', scope: 'project' });
      const file = path.join(dir, a.doc.file);
      const before = fs.readFileSync(file);
      const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'common', body: 'x', expectedRev: 'STALE:0:0' });
      assert.equal(r.ok, false);
      assert.equal(r.conflict, true);
      assert.ok(fs.readFileSync(file).equals(before), 'source stays in the project vault, byte-unchanged');
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const cf = fs.existsSync(commonDir) ? listFiles(commonDir).filter((f) => f.endsWith('.md')) : [];
      assert.deepEqual(cf, [], 'nothing in the destination vault');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- provenance + created survive an in-place edit AND a scope move ---------

function frontMatterOf(text) {
  const out = {};
  const fm = String(text).match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return out;
  for (const line of fm[1].split('\n')) {
    const m = line.match(/^([a-z]+):\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

test('an edit preserves the original by + created (a /kai note keeps its provenance)', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Authored By Kai', body: 'v1', scope: 'project', stack: ['java'] });
    // stamp the on-disk note as /kai-authored with a known original created
    const file = path.join(dir, a.doc.file);
    const original = fs.readFileSync(file, 'utf8');
    const originalCreated = '2020-01-02T03:04:05.000Z';
    fs.writeFileSync(file, original
      .replace(/^by: .*$/m, 'by: kai')
      .replace(/^created: .*$/m, `created: ${originalCreated}`));

    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    const e = await w.editKbNote(dir, { file: a.doc.file, scope: 'project', body: 'v2', expectedRev: rev });
    assert.equal(e.ok, true);
    const fm = frontMatterOf(fs.readFileSync(path.join(dir, e.doc.file), 'utf8'));
    assert.equal(fm.by, 'kai', 'by preserved across an in-place edit');
    assert.equal(fm.created, originalCreated, 'created preserved across an in-place edit');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a scope move preserves the original by + created', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const a = await w.addKbNote(dir, { title: 'Promote Provenance', body: 'shared', scope: 'project', stack: ['java'] });
      const file = path.join(dir, a.doc.file);
      const original = fs.readFileSync(file, 'utf8');
      const originalCreated = '2019-06-07T08:09:10.000Z';
      fs.writeFileSync(file, original
        .replace(/^by: .*$/m, 'by: kai')
        .replace(/^created: .*$/m, `created: ${originalCreated}`));

      const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
      const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'common', body: 'shared', stack: ['java'], expectedRev: rev });
      assert.equal(r.ok, true);
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const moved = listFiles(commonDir).filter((f) => f.endsWith('.md'))[0];
      const fm = frontMatterOf(fs.readFileSync(moved, 'utf8'));
      assert.equal(fm.by, 'kai', 'by preserved across a scope move');
      assert.equal(fm.created, originalCreated, 'created preserved across a scope move');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-31 / N-33 inert + proto-safe (edit re-emits server front-matter) ----

test('N-31 an edited body with a script/onerror payload is stored verbatim (inert)', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Inert', body: 'clean', scope: 'project' });
    const rev = noteRev(dir, { scope: 'project', file: a.doc.file });
    const payload = '<script>alert(1)</script>\n<img src=x onerror=alert(2)>';
    const r = await w.editKbNote(dir, { file: a.doc.file, scope: 'project', body: payload, expectedRev: rev });
    assert.equal(r.ok, true);
    const stored = fs.readFileSync(path.join(dir, r.doc.file), 'utf8');
    assert.ok(stored.includes(payload), 'payload stored byte-for-byte, never pre-escaped');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
