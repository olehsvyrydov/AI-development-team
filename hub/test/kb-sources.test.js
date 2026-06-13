'use strict';
/*
 * Tests for connect-an-external-codebase (ADT-248): a read-only, realpath-contained,
 * bounded source record + filename/keyword ingest. The negatives N-19..N-30 prove:
 * the external tree is byte-identical (read-only), an escaping symlink is skipped
 * (exfiltration guard), traversal is contained, DoS caps hold, binary/VCS/deps are
 * skipped, connected content never widens authored scope, connect validates a real
 * directory, sources.json is contained + carries no secret, disconnect removes only
 * the registration, ingest makes zero egress and runs no exec.
 *
 * Method for refusals: snapshot the external tree BYTE-IDENTICAL before/after.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sources = require('../lib/sources');
const { buildKnowledge } = require('../lib/state');
const { handle } = require('../lib/api');

function freshTmp(prefix) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); }
function tmpProject() {
  const dir = freshTmp('aidt-src-');
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
  for (const k of Object.keys(before)) assert.ok(after[k] && before[k].equals(after[k]), `${msg}: ${k} unchanged`);
}
// a small external codebase fixture
function tmpCodebase() {
  const dir = freshTmp('aidt-ext-');
  fs.writeFileSync(path.join(dir, 'README.md'), '# payments api\nretry webhooks here');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'retry.ts'), 'export function retryWebhook() {}');
  fs.mkdirSync(path.join(dir, 'node_modules', 'leftpad'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'leftpad', 'index.js'), 'module.exports=1');
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'config'), '[core]');
  return dir;
}

// ---- happy: connect records a canonical read-only source + index --------------

test('connectSource records a realpath-pinned read-only source and indexes filenames', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    const r = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    assert.equal(r.ok, true);
    const s = r.source;
    assert.equal(s.root, fs.realpathSync(ext), 'canonical realpath recorded');
    assert.equal(s.indexMethod, 'filename');
    assert.equal(s.status, 'ready');
    assert.ok(s.fileCount >= 2, 'README + src/retry.ts indexed');
    // persisted inside .aidevteam/
    const sj = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'sources.json'), 'utf8'));
    assert.equal(sj.sources.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- the projection emits the CAS token the source routes check -------------

test('buildKnowledge exposes a top-level sourcesRev matching the source-write CAS token', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    assert.equal(buildKnowledge(dir).sourcesRev, sources.sourcesRev(dir), 'token before any source');
    await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    assert.equal(buildKnowledge(dir).sourcesRev, sources.sourcesRev(dir), 'token tracks sources.json after connect');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// The real client path: the cockpit reads knowledge.sourcesRev from the projection
// and threads THAT back as expectedRev on connect/reindex/disconnect. Drive the full
// loop through the route handler so a token-name mismatch (the prior 409-on-every-
// mutation bug) is caught — never calling connectSource with a hand-fed '0'.
test('connect→reindex→disconnect succeed when the client threads knowledge.sourcesRev', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    let rev = buildKnowledge(dir).sourcesRev;
    const c = await handle('kb/source/connect', { path: ext, expectedRev: rev }, dir);
    assert.equal(c.code, 200, 'connect with the projection token succeeds');
    const sourceId = c.payload.source.id;

    rev = c.payload.state.knowledge.sourcesRev;
    const r = await handle('kb/source/reindex', { sourceId, expectedRev: rev }, dir);
    assert.equal(r.code, 200, 'reindex with the refreshed projection token succeeds');

    rev = r.payload.state.knowledge.sourcesRev;
    const d = await handle('kb/source/disconnect', { sourceId, expectedRev: rev }, dir);
    assert.equal(d.code, 200, 'disconnect with the refreshed projection token succeeds');
    assert.equal(d.payload.state.knowledge.sources.length, 0, 'source removed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- N-19 ingest is read-only — external tree byte-identical -----------------

test('N-19 connect + reindex leave the external tree byte-identical', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    const before = snapshot(ext);
    const c = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    assertUnchanged(ext, before, 'external tree after connect');
    const rev = sources.sourcesRev(dir);
    await sources.reindexSource(dir, { sourceId: c.source.id, expectedRev: rev });
    assertUnchanged(ext, before, 'external tree after reindex');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

test('N-19b the ingest source contains no write primitive targeting the source root', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'sources.js'), 'utf8');
  // the ingest opens files read-only and writes only under .aidevteam/
  assert.ok(!/openSync\([^)]*'w/.test(src.replace(/\n/g, ' ')) || /openSync\([^)]*, 'r'/.test(src), 'reads with mode r');
  assert.ok(!/fs\.writeFileSync\(.*source/i.test(src), 'no write to a source path');
});

// ---- N-20 symlink-escape skipped (the exfiltration guard) --------------------

test('N-20 a symlink inside the connected root pointing outside it is never read', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  const outside = freshTmp('aidt-secret-');
  try {
    const secret = path.join(outside, 'id_rsa');
    fs.writeFileSync(secret, 'PRIVATE-KEY-DO-NOT-EXFIL');
    let linked = true;
    try { fs.symlinkSync(secret, path.join(ext, 'src', 'leak.ts')); } catch { linked = false; }
    if (!linked) { console.log('N-20 skipped: no symlink support'); return; }
    const r = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    assert.equal(r.ok, true);
    const idx = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'source-index', `${r.source.id}.json`), 'utf8'));
    const blob = JSON.stringify(idx);
    assert.ok(!blob.includes('PRIVATE-KEY'), 'secret bytes never enter the index');
    assert.ok(!blob.includes('leak.ts'), 'escaping symlink excluded from the index');
    // and the secret file itself untouched
    assert.equal(fs.readFileSync(secret, 'utf8'), 'PRIVATE-KEY-DO-NOT-EXFIL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-21 per-file containment — .. / absolute cannot escape ------------------

test('N-21 only files realpath-contained to the source root are read', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  const outside = freshTmp('aidt-out21-');
  try {
    fs.writeFileSync(path.join(outside, 'external.md'), 'EXTERNAL-CONTENT');
    const r = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    const idx = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'source-index', `${r.source.id}.json`), 'utf8'));
    const blob = JSON.stringify(idx);
    assert.ok(!blob.includes('EXTERNAL-CONTENT'), 'nothing outside the root is read');
    for (const e of idx.files) {
      assert.ok(fs.realpathSync(path.join(r.source.root, e.file)).startsWith(r.source.root), 'every indexed file is contained');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-22 DoS caps enforced --------------------------------------------------

test('N-22 a tree exceeding the max-files cap stops at the cap and still returns an index', async () => {
  const dir = tmpProject();
  const ext = freshTmp('aidt-big-');
  try {
    for (let i = 0; i < 50; i++) fs.writeFileSync(path.join(ext, `f${i}.md`), `content ${i}`);
    const r = await sources.connectSource(dir, { path: ext, expectedRev: '0', caps: { maxFiles: 10 } });
    assert.equal(r.ok, true);
    assert.ok(r.source.fileCount <= 10, 'stopped at the max-files cap');
    assert.equal(r.source.status, 'ready');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- a hostile directory is capped BEFORE the in-memory sort -----------------

test('a directory with far more entries than the cap is sliced before sorting', async () => {
  const dir = tmpProject();
  const ext = freshTmp('aidt-flood-');
  try {
    for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(ext, `e${String(i).padStart(4, '0')}.md`), `x${i}`);
    const r = sources.ingest(ext, { maxFiles: 5 });
    assert.ok(r.fileCount <= 5, 'stops at the file cap');
    assert.equal(r.truncated, true, 'flagged truncated');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- non-UTF-8 and extensionless files are skipped (lossy-decode guard) -------

test('a non-UTF-8 .txt and an extensionless file are skipped, not lossily decoded', async () => {
  const dir = tmpProject();
  const ext = freshTmp('aidt-enc-');
  try {
    fs.writeFileSync(path.join(ext, 'good.md'), '# clean utf8 prose');
    fs.writeFileSync(path.join(ext, 'latin1.txt'), Buffer.from([0x68, 0x69, 0xe9, 0x21])); // "hi\xe9!" — invalid UTF-8
    fs.writeFileSync(path.join(ext, 'README'), 'extensionless body'); // no known text extension
    const r = sources.ingest(ext);
    const names = r.files.map((f) => f.file);
    assert.ok(names.includes('good.md'), 'valid utf8 included');
    assert.ok(!names.includes('latin1.txt'), 'non-UTF-8 known-extension file skipped');
    assert.ok(!names.includes('README'), 'extensionless file skipped');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- N-23 binary / VCS / deps skipped ----------------------------------------

test('N-23 .git, node_modules, dotfiles and binary files are excluded', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    fs.writeFileSync(path.join(ext, 'bin.dat'), Buffer.from([0, 1, 2, 0, 255]));
    fs.writeFileSync(path.join(ext, '.env'), 'SECRET=shh');
    const r = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    const idx = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'source-index', `${r.source.id}.json`), 'utf8'));
    const files = idx.files.map((e) => e.file);
    assert.ok(!files.some((f) => f.includes('node_modules')), 'node_modules excluded');
    assert.ok(!files.some((f) => f.includes('.git')), '.git excluded');
    assert.ok(!files.some((f) => f === '.env'), 'dotfile excluded');
    assert.ok(!files.some((f) => f === 'bin.dat'), 'binary excluded');
    assert.ok(files.includes('README.md'), 'README included');
    const blob = JSON.stringify(idx);
    assert.ok(!blob.includes('SECRET=shh'), 'dotfile content never read');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- N-24 no scope-widening — connected content ≠ authored note --------------

test('N-24 a connected source never appears in the authored-note docs / scopeMatches', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    const before = buildKnowledge(dir).docs.map((d) => d.name).sort();
    await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    const after = buildKnowledge(dir).docs.map((d) => d.name).sort();
    assert.deepEqual(after, before, 'authored-note docs are identical with and without a connected source');
    // the source appears only in the separate `sources` facet
    const kv = buildKnowledge(dir);
    assert.ok(Array.isArray(kv.sources) && kv.sources.length === 1, 'source surfaced in the sources facet only');
    assert.ok(!kv.docs.some((d) => d.name === 'readme' || d.name === 'retry'), 'no connected file as an authored note');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- N-25 connect validates a real directory ---------------------------------

test('N-25 connect refuses a file / non-existent / symlink-to-elsewhere; records nothing', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  const outside = freshTmp('aidt-ne-');
  try {
    const aFile = path.join(ext, 'README.md');
    for (const bad of [aFile, path.join(ext, 'does-not-exist'), '', '../../etc', null]) {
      const r = await sources.connectSource(dir, { path: bad, expectedRev: '0' });
      assert.equal(r.ok, false, `path=${bad} refused`);
    }
    // symlink-to-a-file recorded as a dir? refuse
    let linked = true;
    const link = path.join(outside, 'link-to-file');
    try { fs.symlinkSync(aFile, link); } catch { linked = false; }
    if (linked) {
      const r = await sources.connectSource(dir, { path: link, expectedRev: '0' });
      assert.equal(r.ok, false, 'symlink to a file refused');
    }
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'sources.json')) ||
      JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'sources.json'), 'utf8')).sources.length === 0,
      'nothing recorded for refused connects');
    // a valid dir records its canonical realpath
    const good = await sources.connectSource(dir, { path: ext, expectedRev: sources.sourcesRev(dir) });
    assert.equal(good.ok, true);
    assert.equal(good.source.root, fs.realpathSync(ext));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-26 sources.json contained + carries no secret -------------------------

test('N-26 sources.json is inside .aidevteam and carries no credential field', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    const r = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    const sjPath = path.join(dir, '.aidevteam', 'sources.json');
    assert.ok(fs.realpathSync(sjPath).startsWith(fs.realpathSync(path.join(dir, '.aidevteam'))), 'contained to .aidevteam');
    const blob = fs.readFileSync(sjPath, 'utf8').toLowerCase();
    for (const secretish of ['apikey', 'api_key', 'token', 'password', 'secret', 'credential']) {
      assert.ok(!blob.includes(secretish), `no ${secretish} in sources.json`);
    }
    assert.ok(r.ok);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

test('N-26b a symlinked .aidevteam escaping the project is refused, nothing recorded', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  const outside = freshTmp('aidt-adesc-');
  try {
    fs.rmSync(path.join(dir, '.aidevteam'), { recursive: true, force: true });
    let linked = true;
    try { fs.symlinkSync(outside, path.join(dir, '.aidevteam')); } catch { linked = false; }
    if (!linked) { console.log('N-26b skipped: no symlink support'); return; }
    const before = snapshot(outside);
    const r = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    assert.equal(r.ok, false, 'refused — .aidevteam escapes the project root');
    assertUnchanged(outside, before, 'escaping .aidevteam target');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- CAS on the source writers -----------------------------------------------

test('connect/reindex/disconnect refuse a stale expectedRev', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    const c = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    assert.equal(c.ok, true);
    const stale = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    assert.equal(stale.conflict, true, 'stale connect → conflict');
    const r2 = await sources.reindexSource(dir, { sourceId: c.source.id, expectedRev: 'STALE' });
    assert.equal(r2.conflict, true, 'stale reindex → conflict');
    const r3 = await sources.disconnectSource(dir, { sourceId: c.source.id, expectedRev: 'STALE' });
    assert.equal(r3.conflict, true, 'stale disconnect → conflict');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- N-28 disconnect removes only the registration ---------------------------

test('N-28 disconnect removes the registration + index facet; the external tree is untouched', async () => {
  const dir = tmpProject();
  const ext = tmpCodebase();
  try {
    const before = snapshot(ext);
    const c = await sources.connectSource(dir, { path: ext, expectedRev: '0' });
    const idxFile = path.join(dir, '.aidevteam', 'source-index', `${c.source.id}.json`);
    assert.ok(fs.existsSync(idxFile), 'index facet written');
    const r = await sources.disconnectSource(dir, { sourceId: c.source.id, expectedRev: sources.sourcesRev(dir) });
    assert.equal(r.ok, true);
    const sj = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'sources.json'), 'utf8'));
    assert.equal(sj.sources.length, 0, 'registration removed');
    assert.ok(!fs.existsSync(idxFile), 'index facet removed');
    assertUnchanged(ext, before, 'external tree after disconnect');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ext, { recursive: true, force: true }); }
});

// ---- N-30 no exec surface on the ingest path ---------------------------------

test('N-30 the connect/index path uses no spawn/child_process/exec/eval', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'sources.js'), 'utf8');
  assert.ok(!/child_process/.test(src), 'no child_process');
  assert.ok(!/\bspawn\b/.test(src), 'no spawn');
  assert.ok(!/\bexec(File)?(Sync)?\s*\(/.test(src), 'no exec*');
  assert.ok(!/\beval\s*\(/.test(src), 'no eval');
});

// ---- N-29 zero-egress on the ingest path -------------------------------------

test('N-29 the ingest path makes no outbound network call', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'sources.js'), 'utf8');
  assert.ok(!/\bfetch\s*\(/.test(src), 'no fetch');
  assert.ok(!/https?\.request|net\.connect|http\.get|https\.get/.test(src), 'no socket/http call');
});
