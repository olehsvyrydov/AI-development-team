'use strict';
/*
 * Tests for the knowledge-base write mutation (write.js addKbNote) and its route
 * (POST /api/kb/add via api.js): a browser-supplied note is written to a file
 * INSIDE the project's KB dir under a server-derived slug filename. The negative
 * tests prove the containment, no-overwrite, size/type, and inert-storage controls.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const w = require('../lib/write');
const { handle } = require('../lib/api');

// real tmp dir (realpath-resolved so symlink containment compares are exact)
function tmpProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-kb-')));
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
  return out;
}

function kbDirOf(dir) {
  for (const d of ['docs', 'kb', '.aidevteam/kb']) {
    const p = path.join(dir, d);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ---- happy path -----------------------------------------------------------

test('addKbNote writes a server-slugged .md into a freshly created .aidevteam/kb', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'My First Note', body: '# hello\n\nworld' });
    assert.equal(r.ok, true);
    const kb = path.join(dir, '.aidevteam', 'kb');
    assert.ok(fs.existsSync(kb), 'KB dir created on demand');
    assert.equal(r.doc.file, path.join('.aidevteam', 'kb', 'my-first-note.md'));
    const written = fs.readFileSync(path.join(kb, 'my-first-note.md'), 'utf8');
    assert.match(written, /^---\n[\s\S]*?\n---\n/, 'self-describing front-matter header');
    assert.ok(written.endsWith('# hello\n\nworld'), 'body stored verbatim after the header');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('addKbNote targets the SAME dir readKb scans (docs first-existing)', async () => {
  const dir = tmpProject();
  try {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    const r = await w.addKbNote(dir, { title: 'Doc Note', body: 'x' });
    assert.equal(r.ok, true);
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'doc-note.md')), 'written into docs/ (first existing)');
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'kb')), 'did not create .aidevteam/kb when docs exists');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-1..N-5 slug containment / rejection --------------------------------

test('N-1 traversal title is contained as a single *.md inside the KB dir', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: '../../etc/passwd', body: 'x' });
    if (r.ok) {
      const kb = kbDirOf(dir);
      const files = listFiles(dir).filter((f) => f.startsWith(kb + path.sep));
      assert.equal(files.length, 1, 'exactly one file, inside the KB dir');
      assert.ok(files[0].endsWith('.md'));
    } else {
      assert.equal(r.code, 400);
    }
    // nothing at or above /etc, nothing outside the KB dir
    assert.ok(!fs.existsSync('/etc/passwd.md'));
    const outside = listFiles(dir).filter((f) => !f.startsWith(path.join(dir, 'docs') + path.sep)
      && !f.startsWith(path.join(dir, 'kb') + path.sep)
      && !f.startsWith(path.join(dir, '.aidevteam') + path.sep));
    assert.deepEqual(outside, [], 'no file written outside the KB dir tree');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-2 absolute-path title is contained or rejected, never written to /abs', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: '/abs/path', body: 'x' });
    if (r.ok) {
      const kb = kbDirOf(dir);
      assert.ok(r.doc.file.startsWith('.aidevteam' + path.sep) || r.doc.file.includes('kb'));
      assert.ok(fs.realpathSync(path.dirname(path.join(dir, r.doc.file))).startsWith(fs.realpathSync(kb)));
    } else {
      assert.equal(r.code, 400);
    }
    assert.ok(!fs.existsSync('/abs/path.md'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-3 separator title becomes a single flat slug, not a nested path', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'a/b', body: 'x' });
    assert.equal(r.ok, true);
    const kb = path.join(dir, '.aidevteam', 'kb');
    assert.ok(fs.existsSync(path.join(kb, 'a-b.md')), 'slug a-b.md, flat');
    assert.ok(!fs.existsSync(path.join(kb, 'a', 'b.md')), 'no nested a/b.md');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-4 extension injection neutralised — server-fixed .md only', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'x.md.sh', body: 'x' });
    assert.equal(r.ok, true);
    assert.ok(r.doc.file.endsWith('.md'), 'ends with .md');
    assert.ok(!r.doc.file.endsWith('.sh'), 'never .sh');
    const kb = path.join(dir, '.aidevteam', 'kb');
    const files = fs.readdirSync(kb);
    assert.ok(files.every((f) => f.endsWith('.md')), 'no executable-named file');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-5 a title that slugifies empty is rejected 400, nothing written', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: '!!! ...  ###', body: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 400);
    assert.equal(listFiles(dir).filter((f) => f.endsWith('.md')).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-6 symlink escape ----------------------------------------------------

test('N-6 a symlinked KB dir escaping the project is rejected, nothing written', async () => {
  const dir = tmpProject();
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-out-')));
  try {
    let linked = true;
    try { fs.symlinkSync(outside, path.join(dir, 'kb')); } catch { linked = false; }
    if (!linked) { console.log('N-6 skipped: filesystem cannot create symlinks'); return; }
    const r = await w.addKbNote(dir, { title: 'Escape', body: 'x' });
    assert.equal(r.ok, false, 'rejected');
    assert.equal(r.code, 400);
    assert.equal(fs.readdirSync(outside).length, 0, 'nothing written into the escaping target');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('N-6b a symlink planted at the target path is not written through', async () => {
  const dir = tmpProject();
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-out2-')));
  try {
    const kb = path.join(dir, '.aidevteam', 'kb');
    fs.mkdirSync(kb, { recursive: true });
    const secret = path.join(outside, 'secret.txt');
    fs.writeFileSync(secret, 'TOP-SECRET');
    let linked = true;
    try { fs.symlinkSync(secret, path.join(kb, 'planted.md')); } catch { linked = false; }
    if (!linked) { console.log('N-6b skipped: filesystem cannot create symlinks'); return; }
    const r = await w.addKbNote(dir, { title: 'planted', body: 'OVERWRITE' });
    // O_EXCL refuses the pre-existing symlink → unique-suffixed new file, secret intact
    assert.equal(fs.readFileSync(secret, 'utf8'), 'TOP-SECRET', 'secret not clobbered through the symlink');
    if (r.ok) assert.notEqual(r.doc.file.split(path.sep).pop(), 'planted.md', 'did not write the planted name');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-8 / N-9 no overwrite + O_EXCL --------------------------------------

test('N-8 same title twice never clobbers — unique suffix', async () => {
  const dir = tmpProject();
  try {
    const a = await w.addKbNote(dir, { title: 'Dup', body: 'first' });
    const b = await w.addKbNote(dir, { title: 'Dup', body: 'second' });
    assert.equal(a.ok, true); assert.equal(b.ok, true);
    assert.notEqual(a.doc.file, b.doc.file, 'distinct files');
    const kb = path.join(dir, '.aidevteam', 'kb');
    assert.ok(fs.readFileSync(path.join(kb, 'dup.md'), 'utf8').endsWith('first'), 'first file body unchanged');
    assert.ok(fs.readFileSync(path.join(dir, b.doc.file), 'utf8').endsWith('second'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-9 a pre-existing file at the computed name is not truncated (O_EXCL)', async () => {
  const dir = tmpProject();
  try {
    const kb = path.join(dir, '.aidevteam', 'kb');
    fs.mkdirSync(kb, { recursive: true });
    fs.writeFileSync(path.join(kb, 'race.md'), 'ORIGINAL');
    const r = await w.addKbNote(dir, { title: 'race', body: 'NEW' });
    assert.equal(r.ok, true);
    assert.equal(fs.readFileSync(path.join(kb, 'race.md'), 'utf8'), 'ORIGINAL', 'existing file not truncated');
    assert.notEqual(r.doc.file.split(path.sep).pop(), 'race.md');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-10 / N-11 size + type ----------------------------------------------

test('N-10 oversize body rejected 400, nothing written', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'Big', body: 'a'.repeat(65 * 1024) });
    assert.equal(r.ok, false);
    assert.equal(r.code, 400);
    assert.equal(listFiles(dir).filter((f) => f.endsWith('.md')).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-11 a body with NUL bytes / binary is rejected 400, nothing written', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'Bin', body: 'ok binary' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 400);
    assert.equal(listFiles(dir).filter((f) => f.endsWith('.md')).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('empty body is rejected 400', async () => {
  const dir = tmpProject();
  try {
    const r = await w.addKbNote(dir, { title: 'Empty', body: '' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 400);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-12 inert storage (stored verbatim, not pre-rendered) ---------------

test('N-12 a script/onerror body is stored verbatim (inert — not pre-rendered)', async () => {
  const dir = tmpProject();
  try {
    const payload = '<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n[click](javascript:alert(3))';
    const r = await w.addKbNote(dir, { title: 'XSS', body: payload });
    assert.equal(r.ok, true);
    const stored = fs.readFileSync(path.join(dir, r.doc.file), 'utf8');
    assert.ok(stored.endsWith(payload), 'body stored byte-for-byte, never HTML-escaped or pre-rendered');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- route-level: guard + fresh state + no info leak ----------------------

test('kb/add via api.handle returns 200 with fresh state and incremented base count', async () => {
  const dir = tmpProject();
  try {
    const before = require('../lib/state').buildState(dir).base.counts.indexed;
    const r = await handle('kb/add', { title: 'Route Note', body: 'hi' }, dir);
    assert.equal(r.code, 200);
    assert.equal(r.payload.state.base.counts.indexed, before + 1, 'Base count incremented');
    assert.ok(r.payload.state.kb.some((d) => d.name === 'route-note'));
    assert.ok(r.payload.doc);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kb/add empty title → 400 with no path/stack leak (N-13)', async () => {
  const dir = tmpProject();
  try {
    const r = await handle('kb/add', { title: '   ', body: 'x' }, dir);
    assert.equal(r.code, 400);
    const msg = JSON.stringify(r.payload);
    assert.ok(!msg.includes(dir), 'no absolute project path in the error');
    assert.ok(!msg.includes(os.tmpdir()), 'no absolute tmp path in the error');
    assert.ok(!/\bat \w+.*\(.*:\d+:\d+\)/.test(msg), 'no stack frame in the error');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-13 a containment rejection error carries no absolute path / stack', async () => {
  const dir = tmpProject();
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-leak-')));
  try {
    let linked = true;
    try { fs.symlinkSync(outside, path.join(dir, 'kb')); } catch { linked = false; }
    if (!linked) { console.log('N-13 symlink branch skipped: no symlink support'); return; }
    const r = await handle('kb/add', { title: 'Leak', body: 'x' }, dir);
    assert.equal(r.code, 400);
    const msg = JSON.stringify(r.payload);
    assert.ok(!msg.includes(outside) && !msg.includes(dir), 'no absolute path leaked');
    assert.ok(!/\bat \w+.*:\d+:\d+/.test(msg), 'no stack frame leaked');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
