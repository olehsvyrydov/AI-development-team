'use strict';
/*
 * Tests for the SCOPED knowledge write: addKbNote extended with a server-validated
 * scope enum {project, common}. A `scope:common` write targets a SECOND, user-level
 * vault root (~/.aidevteam/kb-common/) outside the project; every ADT-223 control
 * (realpath containment, O_EXCL no-overwrite, 64KB cap, text-only, server slug,
 * no path leak) must re-prove against that new root. Each refusal test snapshots the
 * relevant vault/files and asserts byte-identical after.
 *
 * The common-vault tests run under a CONTROLLED tmp HOME so the real ~/.aidevteam is
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
  const dir = freshTmp('aidt-sp-');
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

// snapshot a directory tree as a map of relpath -> bytes
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

// Run fn with HOME / USERPROFILE pointed at a fresh tmp dir, restoring after. The
// write module + knowledge module read os.homedir() lazily, so the override takes
// effect for the duration. Returns the tmp home dir for assertions.
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
const knowledge = require('../lib/knowledge');

// ---- happy path: scoped add writes front-matter ---------------------------

test('scope:project add writes into the project vault with project front-matter', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'Proj Note', body: 'hello', scope: 'project', stack: ['java'], kind: 'rule' });
    assert.equal(r.ok, true);
    const txt = fs.readFileSync(path.join(dir, r.doc.file), 'utf8');
    assert.match(txt, /^---\n/);
    assert.match(txt, /scope: project/);
    assert.match(txt, /stack: \[java\]/);
    assert.match(txt, /kind: rule/);
    assert.match(txt, /hello/);
    assert.equal(r.doc.scope, 'project');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-217 default scope is project (safest) when scope is absent', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'Default', body: 'x' });
    assert.equal(r.ok, true);
    assert.equal(r.doc.scope, 'project');
    const txt = fs.readFileSync(path.join(dir, r.doc.file), 'utf8');
    assert.match(txt, /scope: project/);
    // written into the project vault, not the home common vault
    assert.ok(r.doc.file.includes('.aidevteam') || r.doc.file.includes('kb') || r.doc.file.includes('docs'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('scope:common add writes ONE physical file into ~/.aidevteam/kb-common', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome((home) => {
      const res = w.addKbNote(dir, { title: 'House Rule', body: 'always test', scope: 'common', stack: ['any'], kind: 'rule' });
      assert.equal(res.ok, true);
      assert.equal(res.doc.scope, 'common');
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const files = listFiles(commonDir).filter((f) => f.endsWith('.md'));
      assert.equal(files.length, 1, 'exactly one common file on disk');
      const txt = fs.readFileSync(files[0], 'utf8');
      assert.match(txt, /scope: common/);
      assert.match(txt, /status: approved-common/);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-201: common-vault traversal contained ------------------------------

test('N-201 common traversal title is contained inside kb-common (or 400)', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const r = await w.addKbNote(dir, { title: '../../etc/passwd', body: 'x', scope: 'common' });
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      if (r.ok) {
        const files = listFiles(commonDir).filter((f) => f.endsWith('.md'));
        assert.equal(files.length, 1, 'one contained .md inside kb-common');
        assert.ok(fs.realpathSync(path.dirname(files[0])).startsWith(fs.realpathSync(commonDir)));
      } else {
        assert.equal(r.code, 400);
      }
      assert.ok(!fs.existsSync('/etc/passwd.md'));
      // nothing written above kb-common inside the tmp home
      const stray = listFiles(path.join(home, '.aidevteam')).filter((f) => !f.includes('kb-common'));
      assert.deepEqual(stray, [], 'nothing written outside kb-common in the home root');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-202: sibling-prefix trap -------------------------------------------

test('N-202 a common write cannot land in a sibling kb-common-evil dir', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const evil = path.join(home, '.aidevteam', 'kb-common-evil');
      fs.mkdirSync(evil, { recursive: true });
      const before = snapshot(evil);
      const r = await w.addKbNote(dir, { title: 'Trap', body: 'x', scope: 'common' });
      // whatever happens, the sibling dir is byte-unchanged
      assertUnchanged(evil, before, 'sibling kb-common-evil');
      if (r.ok) {
        assert.ok(fs.realpathSync(path.dirname(path.join(home, '.aidevteam', 'kb-common', path.basename(r.doc.file))))
          .startsWith(fs.realpathSync(path.join(home, '.aidevteam', 'kb-common'))));
      }
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-203: symlink escape -------------------------------------------------

test('N-203 a symlinked common vault escaping ~/.aidevteam is rejected, nothing written', async () => {
  const dir = tmpProject();
  const outside = freshTmp('aidt-cesc-');
  try {
    await withTmpHome(async (home) => {
      fs.mkdirSync(path.join(home, '.aidevteam'), { recursive: true });
      let linked = true;
      try { fs.symlinkSync(outside, path.join(home, '.aidevteam', 'kb-common')); } catch { linked = false; }
      if (!linked) { console.log('N-203 skipped: no symlink support'); return; }
      const before = snapshot(outside);
      const r = await w.addKbNote(dir, { title: 'Escape', body: 'x', scope: 'common' });
      assert.equal(r.ok, false, 'rejected');
      assert.equal(r.code, 400);
      assertUnchanged(outside, before, 'escaping symlink target');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('N-203b a symlink planted at the common target is not written through', async () => {
  const dir = tmpProject();
  const outside = freshTmp('aidt-cesc2-');
  try {
    await withTmpHome(async (home) => {
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      fs.mkdirSync(commonDir, { recursive: true });
      const secret = path.join(outside, 'secret.txt');
      fs.writeFileSync(secret, 'TOP-SECRET');
      let linked = true;
      try { fs.symlinkSync(secret, path.join(commonDir, 'planted.md')); } catch { linked = false; }
      if (!linked) { console.log('N-203b skipped: no symlink support'); return; }
      const r = await w.addKbNote(dir, { title: 'planted', body: 'OVERWRITE', scope: 'common' });
      assert.equal(fs.readFileSync(secret, 'utf8'), 'TOP-SECRET', 'secret not clobbered through the symlink');
      if (r.ok) assert.notEqual(r.doc.file.split(path.sep).pop(), 'planted.md');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-204: O_EXCL no-overwrite on common ---------------------------------

test('N-204 two common adds with the same title never replace the first', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const a = await w.addKbNote(dir, { title: 'Dup', body: 'first', scope: 'common' });
      const b = await w.addKbNote(dir, { title: 'Dup', body: 'second', scope: 'common' });
      assert.equal(a.ok, true); assert.equal(b.ok, true);
      assert.notEqual(a.doc.file, b.doc.file);
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const first = fs.readFileSync(path.join(commonDir, path.basename(a.doc.file)), 'utf8');
      assert.match(first, /first/, 'first common file unchanged');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-206: scope is an enum, not a path ----------------------------------

test('N-206 a path-shaped or out-of-enum scope is rejected, nothing written, no path leak', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      for (const bad of ['../../etc', '/abs', 'common/../..', 'bogus', 'global']) {
        const projBefore = snapshot(dir);
        const r = await w.addKbNote(dir, { title: 'Scopey', body: 'x', scope: bad });
        assert.equal(r.ok, false, `scope=${bad} rejected`);
        assert.equal(r.code, 400);
        const msg = JSON.stringify(r);
        assert.ok(!msg.includes(home) && !msg.includes(dir), `no path leak for scope=${bad}`);
        assertUnchanged(dir, projBefore, `project vault after scope=${bad}`);
      }
      // and nothing landed in the common vault either
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const cf = fs.existsSync(commonDir) ? listFiles(commonDir).filter((f) => f.endsWith('.md')) : [];
      assert.deepEqual(cf, [], 'nothing written to common from a rejected scope');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-207: over-cap / non-text on common ---------------------------------

test('N-207 over-64KB and binary bodies on a common add are rejected, nothing written', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const big = await w.addKbNote(dir, { title: 'Big', body: 'a'.repeat(65 * 1024), scope: 'common' });
      assert.equal(big.ok, false); assert.equal(big.code, 400);
      const bin = await w.addKbNote(dir, { title: 'Bin', body: 'has nul', scope: 'common' });
      assert.equal(bin.ok, false); assert.equal(bin.code, 400);
      const cf = fs.existsSync(commonDir) ? listFiles(commonDir).filter((f) => f.endsWith('.md')) : [];
      assert.deepEqual(cf, [], 'nothing written for oversize/binary common bodies');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-214: commonVaultDir override contained -----------------------------

test('N-214 a relative / NUL / non-dir / escaping commonVaultDir override degrades to the default or is refused', async () => {
  const dir = tmpProject();
  const escapeTarget = freshTmp('aidt-ovr-');
  try {
    await withTmpHome(async (home) => {
      const adt = path.join(home, '.aidevteam');
      fs.mkdirSync(adt, { recursive: true });
      const defCommon = path.join(adt, 'kb-common');

      // (1) relative override → ignored, falls back to the default common vault
      fs.writeFileSync(path.join(adt, 'config.json'), JSON.stringify({ knowledge: { commonVaultDir: 'relative/evil' } }));
      let r = await w.addKbNote(dir, { title: 'Rel', body: 'x', scope: 'common' });
      assert.equal(r.ok, true, 'relative override falls back to default');
      assert.ok(fs.existsSync(defCommon), 'wrote into default common, not the relative path');
      assert.ok(!fs.existsSync(path.join(home, 'relative')), 'no relative dir created');

      // (2) NUL-bearing override → ignored
      fs.writeFileSync(path.join(adt, 'config.json'), JSON.stringify({ knowledge: { commonVaultDir: '/tmp/a b' } }));
      r = await w.addKbNote(dir, { title: 'Nul', body: 'x', scope: 'common' });
      assert.ok(r.ok || r.code === 400);

      // (3) non-directory override (a regular file) → refuse the common write
      const aFile = path.join(adt, 'afile');
      fs.writeFileSync(aFile, 'not a dir');
      fs.writeFileSync(path.join(adt, 'config.json'), JSON.stringify({ knowledge: { commonVaultDir: aFile } }));
      const fileBytes = fs.readFileSync(aFile);
      r = await w.addKbNote(dir, { title: 'NonDir', body: 'x', scope: 'common' });
      assert.ok(fs.readFileSync(aFile).equals(fileBytes), 'the regular file used as override is untouched');

      // (4) symlink override escaping $HOME → never write to the uncontained path
      const linkPath = path.join(adt, 'escaping-link');
      let linked = true;
      try { fs.symlinkSync(escapeTarget, linkPath); } catch { linked = false; }
      if (linked) {
        const escBefore = snapshot(escapeTarget);
        fs.writeFileSync(path.join(adt, 'config.json'), JSON.stringify({ knowledge: { commonVaultDir: linkPath } }));
        r = await w.addKbNote(dir, { title: 'Esc', body: 'x', scope: 'common' });
        assertUnchanged(escapeTarget, escBefore, 'escaping override target');
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(escapeTarget, { recursive: true, force: true });
  }
});

// ---- N-218: shared-not-copied (one physical file) -------------------------

test('N-218 a common note saved while viewing project A is ONE file (not one per project)', async () => {
  const projA = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const r = await w.addKbNote(projA, { title: 'Shared', body: 'team rule', scope: 'common', stack: ['any'] });
      assert.equal(r.ok, true);
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      const files = listFiles(commonDir).filter((f) => f.endsWith('.md'));
      assert.equal(files.length, 1, 'exactly one physical common file');
    });
  } finally { fs.rmSync(projA, { recursive: true, force: true }); }
});

// ---- N-215: no info leak in errors (common vault) -------------------------

test('N-215 a refused common write leaks no absolute / $HOME / common-vault path or stack trace', async () => {
  const dir = tmpProject();
  const outside = freshTmp('aidt-leak-');
  try {
    await withTmpHome(async (home) => {
      fs.mkdirSync(path.join(home, '.aidevteam'), { recursive: true });
      let linked = true;
      try { fs.symlinkSync(outside, path.join(home, '.aidevteam', 'kb-common')); } catch { linked = false; }
      if (!linked) { console.log('N-215 skipped: no symlink support'); return; }
      const r = await w.addKbNote(dir, { title: 'Leaky', body: 'x', scope: 'common' });
      assert.equal(r.ok, false);
      const msg = JSON.stringify(r);
      assert.ok(!msg.includes(home), 'no $HOME path in the error');
      assert.ok(!msg.includes(outside), 'no escaping target path in the error');
      assert.ok(!msg.includes(dir), 'no project path in the error');
      assert.ok(!msg.includes('kb-common'), 'no common-vault path token in the error');
      assert.ok(!/\bat \w+.*:\d+:\d+/.test(msg), 'no stack frame in the error');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- inert storage on common (front-matter values stored raw) -------------

test('N-219-store a script/onerror body + tag are stored verbatim (inert) in common', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const payload = '<script>alert(1)</script>\n<img src=x onerror=alert(2)>';
      const r = await w.addKbNote(dir, { title: 'XSS', body: payload, scope: 'common', kind: 'context' });
      assert.equal(r.ok, true);
      const txt = fs.readFileSync(path.join(home, '.aidevteam', 'kb-common', path.basename(r.doc.file)), 'utf8');
      assert.ok(txt.includes(payload), 'body stored byte-for-byte, never pre-escaped');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
