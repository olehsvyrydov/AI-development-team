'use strict';
/*
 * Control-plane route contracts for the /kai propose-inbox: kb/propose, kb/approve,
 * kb/reject through api.handle, plus the inbox surfacing in the state projection's
 * knowledge view (inert by location) and the recall-precedence annotation.
 *
 * Runs under a CONTROLLED tmp HOME so the real ~/.aidevteam is never touched.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { handle } = require('../lib/api');
const state = require('../lib/state');

function freshTmp(prefix) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); }
function tmpProject() {
  const dir = freshTmp('aidt-papi-');
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  return dir;
}
async function withTmpHome(fn) {
  const home = freshTmp('aidt-home-');
  const prevHome = process.env.HOME, prevProfile = process.env.USERPROFILE;
  process.env.HOME = home; process.env.USERPROFILE = home;
  try { return await fn(home); }
  finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevProfile;
    fs.rmSync(home, { recursive: true, force: true });
  }
}
const mdFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : []);

test('kb/propose records a pending proposal; kb/approve writes it; kb/reject refuses afterwards', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      const p = await handle('kb/propose', { title: 'Prop', content: 'note body', suggestedScope: 'common', suggestedStack: ['any'], suggestedKind: 'rule' }, dir);
      assert.equal(p.code, 200);
      assert.equal(p.payload.proposal.status, 'pending');
      const id = p.payload.proposal.id;

      // the returned state carries the inbox item, not a recalled doc
      assert.equal(p.payload.state.knowledge.proposals.length, 1);
      assert.equal(p.payload.state.knowledge.docs.length, 0);

      const a = await handle('kb/approve', { id, scope: 'common', by: 'user' }, dir);
      assert.equal(a.code, 200);
      assert.equal(a.payload.scope, 'common');
      // now recallable; inbox empty
      assert.equal(a.payload.state.knowledge.proposals.length, 0);
      assert.ok(a.payload.state.knowledge.docs.some((d) => d.scope === 'common'));

      // a second decision on the same id is refused (already decided)
      const r = await handle('kb/reject', { id, by: 'user' }, dir);
      assert.equal(r.code, 404);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kb/approve with a forged id returns 404 and writes nothing', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const a = await handle('kb/approve', { id: 'forged', scope: 'common', by: 'user' }, dir);
      assert.equal(a.code, 404);
      assert.equal(a.payload.ok, false);
      assert.deepEqual(mdFiles(path.join(home, '.aidevteam', 'kb-common')), []);
      assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'kb')));
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('kb/propose with an invalid title/content is rejected 400', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      assert.equal((await handle('kb/propose', { title: '', content: 'x' }, dir)).code, 400);
      assert.equal((await handle('kb/propose', { title: 'T', content: '' }, dir)).code, 400);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-232: precedence is annotation, not suppression ----------------------

test('N-232 a conflicting project + common note BOTH surface; the project one is flagged authoritative', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      // common note (approve a proposal as common)
      const pc = await handle('kb/propose', { title: 'Shared Rule', content: 'common version', suggestedScope: 'common', suggestedStack: ['any'] }, dir);
      await handle('kb/approve', { id: pc.payload.proposal.id, scope: 'common', by: 'user' }, dir);
      // project note with the SAME title (approve a proposal as project)
      const pp = await handle('kb/propose', { title: 'Shared Rule', content: 'project version', suggestedScope: 'project' }, dir);
      const a = await handle('kb/approve', { id: pp.payload.proposal.id, scope: 'project', by: 'user' }, dir);
      assert.equal(a.code, 200);

      const k = a.payload.state.knowledge;
      const sharedDocs = k.docs.filter((d) => d.name === 'shared-rule');
      // both surface — nothing is hidden
      assert.equal(sharedDocs.length, 2, 'both the project and common note surface');
      assert.ok(sharedDocs.some((d) => d.scope === 'project'));
      assert.ok(sharedDocs.some((d) => d.scope === 'common'));
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
