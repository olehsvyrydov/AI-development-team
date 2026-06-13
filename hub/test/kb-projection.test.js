'use strict';
/*
 * Tests for the Knowledge PROJECTION: readKb parses each doc's front-matter; the
 * common-vault scan reads only the common vault; the merged projection a project
 * sees = its own project notes ∪ approved-common notes matching its stack. Proves the
 * cross-project isolation, the cross-type stack-leak negative, vault-wins, and that
 * the honest filename-only method survives.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const w = require('../lib/write');
const { buildState } = require('../lib/state');

function freshTmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}
function tmpProject(stack) {
  const dir = freshTmp('aidt-proj-');
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  if (stack) fs.writeFileSync(path.join(dir, '.aidevteam', 'config.json'), JSON.stringify({ knowledge: { stack } }));
  return dir;
}
async function withTmpHome(fn) {
  const home = freshTmp('aidt-home-');
  const prev = process.env.HOME, prevP = process.env.USERPROFILE;
  process.env.HOME = home; process.env.USERPROFILE = home;
  try { return await fn(home); }
  finally {
    if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev;
    if (prevP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevP;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// the merged knowledge set a project sees (names only)
function knowledgeNames(state) {
  return (state.knowledge && state.knowledge.docs || []).map((d) => d.name).sort();
}
function knowledgeBySource(state, source) {
  return (state.knowledge && state.knowledge.docs || []).filter((d) => d.scope === source).map((d) => d.name).sort();
}

// ---- front-matter surfaces on each doc ------------------------------------

test('readKb surfaces parsed front-matter facts per doc', () => {
  const dir = tmpProject(['java']);
  try {
    w.addKbNote(dir, { title: 'A Rule', body: 'x', scope: 'project', stack: ['java'], kind: 'rule' });
    const st = buildState(dir);
    const doc = st.knowledge.docs.find((d) => d.name === 'a-rule');
    assert.ok(doc, 'doc present');
    assert.equal(doc.scope, 'project');
    assert.deepEqual(doc.stack, ['java']);
    assert.equal(doc.kind, 'rule');
    assert.equal(typeof doc.index, 'string');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- each doc carries a server-capped, plain-text excerpt ------------------

test('a doc carries a plain-text excerpt: front-matter stripped, capped, no raw HTML', () => {
  const dir = tmpProject(['java']);
  try {
    const body = '# Heading\n\n<script>alert(1)</script> ' + 'lorem ipsum dolor sit amet '.repeat(40);
    w.addKbNote(dir, { title: 'Excerpt Doc', body, scope: 'project', stack: ['java'] });
    const doc = buildState(dir).knowledge.docs.find((d) => d.name === 'excerpt-doc');
    assert.ok(doc, 'doc present');
    assert.equal(typeof doc.excerpt, 'string', 'excerpt emitted');
    assert.ok(doc.excerpt.length > 0 && doc.excerpt.length <= 160, `excerpt capped (got ${doc.excerpt.length})`);
    assert.ok(!doc.excerpt.includes('---'), 'no front-matter delimiter');
    assert.ok(!doc.excerpt.includes('scope:'), 'no front-matter field');
    assert.ok(!/<script|<\/script|<img|onerror/i.test(doc.excerpt), 'no raw HTML/script in the excerpt');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-210 cross-project isolation ----------------------------------------

test('N-210 project A never sees project B project-scoped notes', async () => {
  const a = tmpProject(['java']);
  const b = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(a, { title: 'A Secret', body: 'x', scope: 'project' });
      w.addKbNote(b, { title: 'B Secret', body: 'x', scope: 'project' });
      const sa = buildState(a);
      const sb = buildState(b);
      assert.ok(knowledgeNames(sa).includes('a-secret'));
      assert.ok(!knowledgeNames(sa).includes('b-secret'), 'A does not see B project notes');
      assert.ok(knowledgeNames(sb).includes('b-secret'));
      assert.ok(!knowledgeNames(sb).includes('a-secret'), 'B does not see A project notes');
    });
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

// ---- N-211 cross-type stack leak (the core negative) ----------------------

test('N-211 java project sees java+any common, never python-only', async () => {
  const java = tmpProject(['java']);
  const seeder = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(seeder, { title: 'Java Common', body: 'x', scope: 'common', stack: ['java'] });
      w.addKbNote(seeder, { title: 'Python Common', body: 'x', scope: 'common', stack: ['python'] });
      w.addKbNote(seeder, { title: 'Any Common', body: 'x', scope: 'common', stack: ['any'] });
      w.addKbNote(java, { title: 'My Own', body: 'x', scope: 'project' });

      const common = knowledgeBySource(buildState(java), 'common');
      assert.ok(common.includes('java-common'), 'java common visible');
      assert.ok(common.includes('any-common'), 'any common visible');
      assert.ok(!common.includes('python-common'), 'python-only common NOT visible');
      assert.ok(knowledgeNames(buildState(java)).includes('my-own'), 'own project note visible');
    });
  } finally {
    fs.rmSync(java, { recursive: true, force: true });
    fs.rmSync(seeder, { recursive: true, force: true });
  }
});

test('N-211b a no-stack project sees ONLY any-common', async () => {
  const research = tmpProject(); // no declared stack, no markers → ["any"]
  const seeder = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(seeder, { title: 'Java Common', body: 'x', scope: 'common', stack: ['java'] });
      w.addKbNote(seeder, { title: 'Any Common', body: 'x', scope: 'common', stack: ['any'] });
      const common = knowledgeBySource(buildState(research), 'common');
      assert.deepEqual(common, ['any-common'], 'only any-common, no stack-specific leak');
    });
  } finally {
    fs.rmSync(research, { recursive: true, force: true });
    fs.rmSync(seeder, { recursive: true, force: true });
  }
});

// ---- common reads never leak a project note (and vice versa) --------------

test('N-209iso reading Common never leaks a project-scoped note', async () => {
  const proj = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(proj, { title: 'Proj Only', body: 'x', scope: 'project' });
      w.addKbNote(proj, { title: 'Common One', body: 'x', scope: 'common', stack: ['any'] });
      const st = buildState(proj);
      const commonDocs = st.knowledge.docs.filter((d) => d.scope === 'common');
      assert.ok(commonDocs.every((d) => d.name !== 'proj-only'), 'no project note in the common set');
      assert.ok(commonDocs.some((d) => d.name === 'common-one'));
    });
  } finally { fs.rmSync(proj, { recursive: true, force: true }); }
});

// ---- N-213 front-matter scope ≠ vault → vault wins ------------------------

test('N-213 a project-vault file claiming scope:common is treated as project', async () => {
  const a = tmpProject(['java']);
  const b = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      // hand-write a file INTO project A's vault whose front-matter lies "scope: common"
      const kb = path.join(a, '.aidevteam', 'kb');
      fs.mkdirSync(kb, { recursive: true });
      fs.writeFileSync(path.join(kb, 'liar.md'), '---\nscope: common\nstack: [any]\nstatus: approved-common\n---\n# liar\n\nx');
      const sa = buildState(a);
      const sb = buildState(b);
      const liarInA = sa.knowledge.docs.find((d) => d.name === 'liar');
      assert.ok(liarInA, 'present in its holding project');
      assert.equal(liarInA.scope, 'project', 'holding vault wins → treated as project scope');
      assert.ok(!knowledgeNames(sb).includes('liar'), 'does not leak into another project');
    });
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

// ---- N-216 honest indexing -------------------------------------------------

test('N-216 method stays filename-only with no embedder after scoped adds', async () => {
  const proj = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(proj, { title: 'P', body: 'x', scope: 'project' });
      w.addKbNote(proj, { title: 'C', body: 'x', scope: 'common', stack: ['any'] });
      const st = buildState(proj);
      assert.equal(st.base.method, 'filename-only');
      assert.equal(st.knowledge.method, 'filename-only');
    });
  } finally { fs.rmSync(proj, { recursive: true, force: true }); }
});

// ---- per-scope counts ------------------------------------------------------

test('knowledge projection reports per-scope counts', async () => {
  const proj = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(proj, { title: 'P1', body: 'x', scope: 'project' });
      w.addKbNote(proj, { title: 'P2', body: 'x', scope: 'project' });
      w.addKbNote(proj, { title: 'C1', body: 'x', scope: 'common', stack: ['java'] });
      const st = buildState(proj);
      assert.equal(st.knowledge.counts.project, 2);
      assert.equal(st.knowledge.counts.common, 1);
    });
  } finally { fs.rmSync(proj, { recursive: true, force: true }); }
});

// ---- read-path containment: an escaping commonVaultDir override is NOT read -

test('N-214r a commonVaultDir override outside $HOME is NOT read (read path is bounded like the write path)', async () => {
  const proj = tmpProject(['java']);
  const outside = freshTmp('aidt-readesc-');
  try {
    await withTmpHome(async (home) => {
      const adt = path.join(home, '.aidevteam');
      fs.mkdirSync(adt, { recursive: true });
      // plant a "common" note in a REAL directory outside $HOME and point the override at it
      fs.writeFileSync(
        path.join(outside, 'leaked.md'),
        '---\nscope: common\nstack: [any]\nstatus: approved-common\n---\n# leaked\n\nsecret',
      );
      fs.writeFileSync(path.join(adt, 'config.json'), JSON.stringify({ knowledge: { commonVaultDir: outside } }));

      const st = buildState(proj);
      const commonNames = knowledgeBySource(st, 'common');
      assert.ok(!commonNames.includes('leaked'), 'escaping override note is NOT read into the projection');
      assert.equal(st.knowledge.counts.common, 0, 'no common notes read from an uncontained override');
    });
  } finally {
    fs.rmSync(proj, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// ---- N-208 malformed front-matter in a file never breaks the scan ---------

test('N-208proj a __proto__ / malformed front-matter file does not pollute or throw', async () => {
  const proj = tmpProject(['java']);
  try {
    await withTmpHome(async () => {
      const kb = path.join(proj, '.aidevteam', 'kb');
      fs.mkdirSync(kb, { recursive: true });
      fs.writeFileSync(path.join(kb, 'evil.md'), '---\n__proto__: {"polluted":1}\nscope: project\n---\nx');
      fs.writeFileSync(path.join(kb, 'broken.md'), '---\nscope: common\n# never closed\nbody');
      let st;
      assert.doesNotThrow(() => { st = buildState(proj); });
      assert.equal(({}).polluted, undefined, 'no prototype pollution from a doc');
      assert.ok(st.knowledge.docs.some((d) => d.name === 'evil'));
      assert.ok(st.knowledge.docs.some((d) => d.name === 'broken'));
    });
  } finally { fs.rmSync(proj, { recursive: true, force: true }); }
});
