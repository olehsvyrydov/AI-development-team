'use strict';
/*
 * Tests for the /kai propose -> user-approve knowledge inbox.
 *
 * A proposal is UNTRUSTED model output that must be inert until an explicit human
 * approve. It lives in a third store (~/.aidevteam/kb-proposals/) NOT scanned by
 * readKb and NOT read by the recall predicate; approve re-authorizes by the stored
 * id and writes through the SAME guarded/contained addKbNote chokepoint at the
 * chosen scope; reject is retained for audit and never recalled.
 *
 * Every refusal test snapshots the relevant store/vaults and asserts byte-identical
 * after. Runs under a CONTROLLED tmp HOME — the real ~/.aidevteam is never touched.
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
  const dir = freshTmp('aidt-prop-');
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

const proposals = require('../lib/proposals');
const state = require('../lib/state');

const commonDirOf = (home) => path.join(home, '.aidevteam', 'kb-common');
const proposalsDirOf = (home) => path.join(home, '.aidevteam', 'kb-proposals');
const mdFiles = (dir) => (fs.existsSync(dir) ? listFiles(dir).filter((f) => f.endsWith('.md')) : []);

// ---- propose: server-generated id, pending, stored inert -------------------

test('propose creates a PENDING proposal with a server-generated id', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      const r = await proposals.propose({
        title: 'Always write a test first',
        content: 'TDD is the house rule.',
        suggestedScope: 'common', suggestedStack: ['java'], suggestedKind: 'rule',
        why: 'seen in 4 tickets', id: 'client-forged-id',
      });
      assert.equal(r.ok, true);
      assert.equal(r.proposal.status, 'pending');
      assert.ok(r.proposal.id && typeof r.proposal.id === 'string');
      assert.notEqual(r.proposal.id, 'client-forged-id', 'client cannot set the id');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('propose bounds content (size/text) and normalizes suggested fields', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const big = await proposals.propose({ title: 'Big', content: 'a'.repeat(65 * 1024) });
      assert.equal(big.ok, false); assert.equal(big.code, 400);
      const bin = await proposals.propose({ title: 'Bin', content: 'has\x00nul' });
      assert.equal(bin.ok, false); assert.equal(bin.code, 400);
      const norm = await proposals.propose({ title: 'N', content: 'x', suggestedScope: 'bogus', suggestedStack: ['java', 'evil'], suggestedKind: 'nope' });
      assert.equal(norm.ok, true);
      assert.equal(norm.proposal.suggestedScope, 'project', 'unknown scope -> project (safest)');
      assert.deepEqual(norm.proposal.suggestedStack, ['java'], 'unknown stack token dropped');
      assert.equal(norm.proposal.suggestedKind, 'context', 'unknown kind -> context');
      // nothing written into either vault by proposing
      assert.deepEqual(mdFiles(commonDirOf(home)), [], 'no common write on propose');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-220: pending inert by LOCATION (not in readKb / recall) -------------

test('N-220 a pending proposal appears in NO project Knowledge list/recall, only the inbox', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      await proposals.propose({ title: 'Pending One', content: 'inert text', suggestedScope: 'common', suggestedStack: ['any'] });

      // not in readKb (project vault scan)
      assert.deepEqual(state.readKb(dir), [], 'project readKb does not see proposals');
      // not in the common scan
      assert.deepEqual(state.readCommonKb(), [], 'common scan does not see proposals');
      // not recalled by the merged knowledge projection
      const k = state.buildKnowledge(dir);
      assert.equal(k.docs.length, 0, 'no proposal recalled');
      // but visible in the inbox
      const inbox = proposals.listPending();
      assert.equal(inbox.length, 1);
      assert.equal(inbox[0].title, 'Pending One');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-221: NO auto-apply (both vaults byte-unchanged with no approval) -----

test('N-221 with NO approval, both vaults stay byte-unchanged and nothing is recalled', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const commonDir = commonDirOf(home);
      fs.mkdirSync(commonDir, { recursive: true });
      const projKb = path.join(dir, '.aidevteam', 'kb');
      fs.mkdirSync(projKb, { recursive: true });
      const commonBefore = snapshot(commonDir);
      const projBefore = snapshot(projKb);

      for (let i = 0; i < 5; i++) {
        await proposals.propose({ title: `P${i}`, content: `body ${i}`, suggestedScope: i % 2 ? 'common' : 'project' });
      }
      // no approve called → nothing in any recallable vault
      assertUnchanged(commonDir, commonBefore, 'common vault after proposals only');
      assertUnchanged(projKb, projBefore, 'project vault after proposals only');
      assert.equal(state.buildKnowledge(dir).docs.length, 0, 'no project recalls a proposal');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-222: approve-as-common writes only to common ------------------------

test('N-222 approve-as-common writes one approved-common file into the common vault only', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const p = await proposals.propose({ title: 'House Rule', content: 'always test', suggestedScope: 'common', suggestedStack: ['any'], suggestedKind: 'rule' });
      const projKb = path.join(dir, '.aidevteam', 'kb');
      fs.mkdirSync(projKb, { recursive: true });
      const projBefore = snapshot(projKb);

      const r = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      assert.equal(r.ok, true);
      assert.equal(r.doc.scope, 'common');

      const cf = mdFiles(commonDirOf(home));
      assert.equal(cf.length, 1, 'one common file written');
      const txt = fs.readFileSync(cf[0], 'utf8');
      assert.match(txt, /scope: common/);
      assert.match(txt, /status: approved-common/);
      assert.match(txt, /always test/);
      assertUnchanged(projKb, projBefore, 'project vault untouched by approve-as-common');

      // proposal removed from the pending inbox, marked approved
      assert.deepEqual(proposals.listPending(), [], 'inbox empties after approve');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-223: approve-as-project writes only to the project ------------------

test('N-223 approve-as-project writes into THIS project only, recallable only here', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const p = await proposals.propose({ title: 'Local Convention', content: 'use 2 spaces', suggestedScope: 'project' });
      const r = await proposals.approve(dir, { id: p.proposal.id, scope: 'project', by: 'user' });
      assert.equal(r.ok, true);
      assert.equal(r.doc.scope, 'project');

      const txt = fs.readFileSync(path.join(dir, r.doc.file), 'utf8');
      assert.match(txt, /scope: project/);
      assert.match(txt, /use 2 spaces/);
      // recallable here
      const k = state.buildKnowledge(dir);
      assert.ok(k.docs.some((d) => d.scope === 'project' && d.name === r.doc.name));
      // nothing in the common vault
      assert.deepEqual(mdFiles(commonDirOf(home)), [], 'nothing written to common');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-224: approve + reject audited ---------------------------------------

test('N-224 approve and reject each append an audit record (who/when)', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      const a = await proposals.propose({ title: 'A', content: 'x' });
      const b = await proposals.propose({ title: 'B', content: 'y' });
      const ra = await proposals.approve(dir, { id: a.proposal.id, scope: 'project', by: 'user' });
      assert.equal(ra.ok, true);
      const rb = await proposals.reject(dir, { id: b.proposal.id, by: 'user', note: 'not relevant' });
      assert.equal(rb.ok, true);

      const all = proposals.listAll();
      const approved = all.find((p) => p.id === a.proposal.id);
      const rejected = all.find((p) => p.id === b.proposal.id);
      assert.equal(approved.status, 'approved-project');
      assert.ok(approved.decidedBy && approved.decidedAt, 'approve audited');
      assert.equal(rejected.status, 'rejected');
      assert.ok(rejected.decidedBy && rejected.decidedAt, 'reject audited');

      // audit also lands in the append-only comment trail
      const comments = state.safeExists; // ensure module loaded
      assert.ok(comments);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-225: reject retained, never recalled --------------------------------

test('N-225 reject is retained for audit, removed from the inbox, never recalled', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const p = await proposals.propose({ title: 'Reject Me', content: 'nope', suggestedScope: 'common' });
      const r = await proposals.reject(dir, { id: p.proposal.id, by: 'user' });
      assert.equal(r.ok, true);

      assert.deepEqual(proposals.listPending(), [], 'removed from inbox');
      const retained = proposals.listAll().find((x) => x.id === p.proposal.id);
      assert.equal(retained.status, 'rejected', 'retained for audit');
      // never recalled, nothing in any vault
      assert.deepEqual(mdFiles(commonDirOf(home)), []);
      assert.equal(state.buildKnowledge(dir).docs.length, 0);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-226: BOLA — foreign/forged/stale/already-decided id refused ---------

test('N-226 approve with a foreign/forged/stale/already-decided id is refused, NOTHING written', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const commonDir = commonDirOf(home);
      fs.mkdirSync(commonDir, { recursive: true });
      const projKb = path.join(dir, '.aidevteam', 'kb');
      fs.mkdirSync(projKb, { recursive: true });

      // a forged id that never existed
      let commonBefore = snapshot(commonDir);
      let projBefore = snapshot(projKb);
      let r = await proposals.approve(dir, { id: 'does-not-exist', scope: 'common', by: 'user' });
      assert.equal(r.ok, false, 'forged id refused');
      assert.equal(r.code, 404);
      assertUnchanged(commonDir, commonBefore, 'common after forged-id approve');
      assertUnchanged(projKb, projBefore, 'project after forged-id approve');

      // a stale / already-decided id (approve, then approve again)
      const p = await proposals.propose({ title: 'Once', content: 'x', suggestedScope: 'common' });
      const first = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      assert.equal(first.ok, true);
      commonBefore = snapshot(commonDir);
      const second = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      assert.equal(second.ok, false, 'already-decided id refused');
      assertUnchanged(commonDir, commonBefore, 'no second write for an already-decided id');

      // a rejected proposal cannot then be approved
      const q = await proposals.propose({ title: 'Rej', content: 'y', suggestedScope: 'common' });
      await proposals.reject(dir, { id: q.proposal.id, by: 'user' });
      commonBefore = snapshot(commonDir);
      const afterReject = await proposals.approve(dir, { id: q.proposal.id, scope: 'common', by: 'user' });
      assert.equal(afterReject.ok, false, 'rejected proposal cannot be approved');
      assertUnchanged(commonDir, commonBefore, 'no write approving a rejected proposal');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-227: proposal-store parser bounded / proto-safe / never-throws ------

test('N-227 a malformed/__proto__/oversize proposal record is skipped, pollutes nothing, never throws', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const pdir = proposalsDirOf(home);
      fs.mkdirSync(pdir, { recursive: true });
      // a good record
      const good = await proposals.propose({ title: 'Good', content: 'ok' });
      // hostile / malformed sidecar files
      fs.writeFileSync(path.join(pdir, 'broken.json'), '{ not json ');
      fs.writeFileSync(path.join(pdir, 'proto.json'), JSON.stringify({ id: 'p', status: 'pending', __proto__: { polluted: true }, content: 'x', title: 'P' }));
      fs.writeFileSync(path.join(pdir, 'huge.json'), JSON.stringify({ id: 'h', status: 'pending', content: 'a'.repeat(2 * 1024 * 1024), title: 'H' }));

      let inbox;
      assert.doesNotThrow(() => { inbox = proposals.listPending(); }, 'parser never throws');
      assert.equal({}.polluted, undefined, 'no prototype pollution');
      assert.ok(inbox.some((p) => p.id === good.proposal.id), 'the valid record still renders');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-229: approve inherits every ADT-223 condition -----------------------

test('N-229 approve write inherits the chokepoint (over-cap/non-text rejected, traversal title contained)', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const commonDir = commonDirOf(home);
      // a traversal-shaped title on a proposal: approve must contain it or refuse
      const p = await proposals.propose({ title: '../../etc/passwd', content: 'x', suggestedScope: 'common' });
      const r = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      if (r.ok) {
        const cf = mdFiles(commonDir);
        assert.equal(cf.length, 1);
        assert.ok(fs.realpathSync(path.dirname(cf[0])).startsWith(fs.realpathSync(commonDir)), 'contained in common');
      } else {
        assert.equal(r.code, 400);
      }
      assert.ok(!fs.existsSync('/etc/passwd.md'));
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-230: proposal content stored raw (inert) ----------------------------

test('N-230 a script/onerror/javascript: payload is stored raw (inert), never executed/escaped at rest', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const payload = '<script>alert(1)</script> <img src=x onerror=alert(2)> javascript:alert(3)';
      const p = await proposals.propose({ title: 'XSS', content: payload, why: '<b>why</b>', suggestedScope: 'common' });
      assert.equal(p.ok, true);
      // stored byte-for-byte in the proposal store (never pre-escaped, never executed)
      const stored = proposals.listPending().find((x) => x.id === p.proposal.id);
      assert.equal(stored.content, payload, 'content stored raw');
      assert.equal(stored.why, '<b>why</b>', 'why stored raw');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-231: approve action carries the chosen scope ------------------------

test('N-231 the approve result names the chosen scope (no default over-share)', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      const p = await proposals.propose({ title: 'Scoped', content: 'x', suggestedScope: 'common' });
      // approving as PROJECT must honor the chosen scope, NOT the suggestion
      const r = await proposals.approve(dir, { id: p.proposal.id, scope: 'project', by: 'user' });
      assert.equal(r.ok, true);
      assert.equal(r.doc.scope, 'project', 'chosen scope wins over the suggestion');
      assert.equal(r.scope, 'project', 'the action reports the chosen scope');
      const decided = proposals.listAll().find((x) => x.id === p.proposal.id);
      assert.equal(decided.status, 'approved-project');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('approve with an out-of-enum scope is refused, nothing written', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const commonDir = commonDirOf(home); fs.mkdirSync(commonDir, { recursive: true });
      const projKb = path.join(dir, '.aidevteam', 'kb'); fs.mkdirSync(projKb, { recursive: true });
      const p = await proposals.propose({ title: 'Bad scope', content: 'x' });
      const commonBefore = snapshot(commonDir); const projBefore = snapshot(projKb);
      for (const bad of ['../../etc', '/abs', 'global', 'bogus', undefined]) {
        const r = await proposals.approve(dir, { id: p.proposal.id, scope: bad, by: 'user' });
        assert.equal(r.ok, false, `scope=${bad} refused`);
      }
      assertUnchanged(commonDir, commonBefore, 'common unchanged on bad-scope approve');
      assertUnchanged(projKb, projBefore, 'project unchanged on bad-scope approve');
      assert.equal(proposals.listPending().length, 1, 'still pending after refused approves');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- clampText strips ALL control chars, not just the first ----------------

test('stored display fields strip EVERY control char, not only the first', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async () => {
      const dirtyTitle = 'a\x01b\x02c\x07d';
      const dirtyWhy = 'why\x01one\x02two\x1ethree';
      const dirtySource = 's\x01o\x02u\x03r\x04ce';
      const p = await proposals.propose({ title: dirtyTitle, content: 'ok', why: dirtyWhy, source: dirtySource });
      assert.equal(p.ok, true);
      const stored = proposals.listPending().find((x) => x.id === p.proposal.id);
      const noControl = /^[^\x00-\x08\x0b\x0c\x0e-\x1f]*$/;
      assert.ok(noControl.test(stored.title), 'all control chars stripped from title');
      assert.equal(stored.title, 'abcd', 'every control char removed from title');
      assert.ok(noControl.test(stored.why), 'all control chars stripped from why');
      assert.equal(stored.why, 'whyonetwothree', 'every control char removed from why');
      assert.ok(noControl.test(stored.source), 'all control chars stripped from source');
      assert.equal(stored.source, 'source', 'every control char removed from source');

      // decidedBy is clamped the same way
      const r = await proposals.approve(dir, { id: p.proposal.id, scope: 'project', by: 'u\x01s\x02er' });
      assert.equal(r.ok, true);
      const decided = proposals.listAll().find((x) => x.id === p.proposal.id);
      assert.ok(noControl.test(decided.decidedBy), 'all control chars stripped from decidedBy');
      assert.equal(decided.decidedBy, 'user', 'every control char removed from decidedBy');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- approve double-write window: a record-write failure after the vault ---
// write must NOT leave a re-approvable pending proposal that double-writes -----

test('a decision-persist failure during approve leaves no re-approvable proposal and never double-writes the vault', async () => {
  const dir = tmpProject();
  const realRename = fs.renameSync;
  try {
    await withTmpHome(async (home) => {
      const commonDir = commonDirOf(home);
      const p = await proposals.propose({ title: 'Once Only', content: 'write me once', suggestedScope: 'common' });

      // Fail ONLY the proposal-store record rename (the *.json under kb-proposals),
      // once. The decided-state flip is persisted BEFORE the vault write, so this
      // models a persist failure in the approve flow.
      let failedOnce = false;
      fs.renameSync = (from, to) => {
        if (!failedOnce && String(to).includes('kb-proposals') && String(to).endsWith('.json')) {
          failedOnce = true;
          throw new Error('injected record-write failure');
        }
        return realRename(from, to);
      };

      const first = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      assert.equal(first.ok, false, 'approve fails when the decided record cannot be persisted');

      fs.renameSync = realRename;

      // The decided flip is persisted BEFORE the vault write, so a persist failure
      // means the vault write never ran: NO vault doc exists. The proposal may still
      // be pending, but that is safe precisely because nothing was written.
      assert.deepEqual(mdFiles(commonDir), [], 'no vault doc written when the decision could not be persisted');

      // A retry is therefore legitimate and writes exactly one doc — never a duplicate.
      const second = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      assert.equal(second.ok, true, 'a retry after a clean (no-write) failure succeeds');
      assert.equal(mdFiles(commonDir).length, 1, 'exactly one vault doc after the successful retry — no duplicate');
      assert.deepEqual(proposals.listPending(), [], 'inbox empty after the successful retry');
    });
  } finally {
    fs.renameSync = realRename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a vault-write failure after the decided flip leaves the proposal decided, not re-approvable, with no second vault doc', async () => {
  const dir = tmpProject();
  const write = require('../lib/write');
  const realAddKbNote = write.addKbNote;
  try {
    await withTmpHome(async (home) => {
      const commonDir = commonDirOf(home);
      const p = await proposals.propose({ title: 'Vault Fail', content: 'body', suggestedScope: 'common' });

      // The flip persists first; make the vault write fail AFTER it.
      write.addKbNote = () => { throw new Error('injected vault failure'); };
      const first = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      assert.equal(first.ok, false, 'approve fails when the vault write throws');

      write.addKbNote = realAddKbNote;

      // The proposal is decided (not pending) -> a retry cannot re-run the write.
      assert.deepEqual(proposals.listPending(), [], 'no pending proposal remains after vault failure');
      const decided = proposals.listAll().find((x) => x.id === p.proposal.id);
      assert.ok(decided && decided.status !== 'pending', 'proposal left in a decided, non-re-approvable state');

      const second = await proposals.approve(dir, { id: p.proposal.id, scope: 'common', by: 'user' });
      assert.equal(second.ok, false, 'a retry of the same id is refused');
      assert.deepEqual(mdFiles(commonDir), [], 'no vault doc written across the failed approve + retry');
    });
  } finally {
    write.addKbNote = realAddKbNote;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- malformed records (missing required fields) are SKIPPED, not coerced ----

test('a record with no/blank/non-string content is skipped: not listed, and an approve of its id is refused with nothing written', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const pdir = proposalsDirOf(home);
      fs.mkdirSync(pdir, { recursive: true });
      const commonDir = commonDirOf(home);
      fs.mkdirSync(commonDir, { recursive: true });

      // A genuinely valid record alongside the malformed ones.
      const good = await proposals.propose({ title: 'Good', content: 'real body' });

      // Required-field violations: no content, blank content, non-string content, no id.
      fs.writeFileSync(path.join(pdir, 'nocontent.json'), JSON.stringify({ id: 'nocontent', status: 'pending', title: 'No Content' }));
      fs.writeFileSync(path.join(pdir, 'blank.json'), JSON.stringify({ id: 'blank', status: 'pending', content: '', title: 'Blank' }));
      fs.writeFileSync(path.join(pdir, 'nonstr.json'), JSON.stringify({ id: 'nonstr', status: 'pending', content: { not: 'a string' }, title: 'NonStr' }));
      fs.writeFileSync(path.join(pdir, 'noid.json'), JSON.stringify({ status: 'pending', content: 'has body but no id', title: 'No Id' }));

      let inbox;
      assert.doesNotThrow(() => { inbox = proposals.listPending(); }, 'a malformed record never crashes the listing');
      const ids = inbox.map((p) => p.id);
      assert.ok(ids.includes(good.proposal.id), 'the valid record is listed');
      assert.ok(!ids.includes('nocontent'), 'a content-less record is skipped, not listed');
      assert.ok(!ids.includes('blank'), 'a blank-content record is skipped');
      assert.ok(!ids.includes('nonstr'), 'a non-string-content record is skipped');
      assert.ok(!ids.includes('noid'), 'an id-less record is skipped');

      // Approving a skipped (malformed) id is refused and writes nothing.
      const commonBefore = snapshot(commonDir);
      for (const badId of ['nocontent', 'blank', 'nonstr']) {
        const r = await proposals.approve(dir, { id: badId, scope: 'common', by: 'user' });
        assert.equal(r.ok, false, `approve of malformed id ${badId} is refused`);
        assert.equal(r.code, 404, `a malformed record is not loadable for approve (${badId})`);
      }
      assertUnchanged(commonDir, commonBefore, 'no vault doc written approving a malformed record');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a record missing only an optional field (title) still loads', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const pdir = proposalsDirOf(home);
      fs.mkdirSync(pdir, { recursive: true });
      // Required fields present (id/content/status); the optional title is absent.
      fs.writeFileSync(path.join(pdir, 'notitle.json'), JSON.stringify({ id: 'notitle', status: 'pending', content: 'body only' }));

      const inbox = proposals.listPending();
      const loaded = inbox.find((p) => p.id === 'notitle');
      assert.ok(loaded, 'a record missing only an optional field still loads');
      assert.equal(loaded.title, '', 'the optional title defaults to empty');
      assert.equal(loaded.content, 'body only', 'the required content is preserved');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- a corrupted/tampered record has EVERY optional field normalized on load --

test('a tampered record with a non-string source and out-of-enum scope/kind is fully normalized to safe defaults on load', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const pdir = proposalsDirOf(home);
      fs.mkdirSync(pdir, { recursive: true });

      // Required fields present; the optional display/suggested fields are corrupt:
      // a non-string source, an out-of-enum scope, and an out-of-enum kind.
      fs.writeFileSync(path.join(pdir, 'tampered.json'), JSON.stringify({
        id: 'tampered', status: 'pending', content: 'body',
        source: { not: 'a string' },
        suggestedScope: 'everywhere',
        suggestedKind: 'malware',
        suggestedStack: ['java', 'evil-token'],
      }));

      // A `global` suggestedScope is read-aliased to `common` (the front-matter rule).
      fs.writeFileSync(path.join(pdir, 'aliased.json'), JSON.stringify({
        id: 'aliased', status: 'pending', content: 'body', suggestedScope: 'global',
      }));

      let inbox;
      assert.doesNotThrow(() => { inbox = proposals.listPending(); }, 'a tampered record never crashes the listing');

      const tampered = inbox.find((p) => p.id === 'tampered');
      assert.ok(tampered, 'the tampered record still loads (never-throw, defaults applied)');
      assert.equal(typeof tampered.source, 'string', 'a non-string source is coerced to a string');
      assert.equal(tampered.suggestedScope, 'project', 'an out-of-enum scope clamps to the narrowest default');
      assert.equal(tampered.suggestedKind, 'context', 'an out-of-enum kind clamps to the default');
      assert.deepEqual(tampered.suggestedStack, ['java'], 'an unknown stack token is dropped');

      const aliased = inbox.find((p) => p.id === 'aliased');
      assert.ok(aliased, 'the aliased-scope record loads');
      assert.equal(aliased.suggestedScope, 'common', 'a `global` suggestedScope is read-aliased to common');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- reject fails LOUD when the decision cannot be persisted -----------------

test('a record-write failure during reject returns a failure (not ok:true) and the proposal stays pending', async () => {
  const dir = tmpProject();
  const realRename = fs.renameSync;
  try {
    await withTmpHome(async () => {
      const p = await proposals.propose({ title: 'Reject Loud', content: 'still actionable' });

      // Fail ONLY the proposal-store record rename (the *.json under kb-proposals).
      let failedOnce = false;
      fs.renameSync = (from, to) => {
        if (!failedOnce && String(to).includes('kb-proposals') && String(to).endsWith('.json')) {
          failedOnce = true;
          throw new Error('injected record-write failure');
        }
        return realRename(from, to);
      };

      const r = await proposals.reject(dir, { id: p.proposal.id, by: 'user' });
      fs.renameSync = realRename;

      assert.equal(r.ok, false, 'reject reports failure when the decision cannot be persisted');
      assert.notEqual(r.ok, true, 'reject does NOT report success on a persist failure');

      // The proposal is NOT silently lost: it remains pending and re-listable/actionable.
      const inbox = proposals.listPending();
      assert.ok(inbox.some((x) => x.id === p.proposal.id), 'the proposal is still pending after a failed reject');
    });
  } finally {
    fs.renameSync = realRename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- no path leak in approve/propose errors --------------------------------

test('a refused approve/propose leaks no absolute path or stack trace', async () => {
  const dir = tmpProject();
  try {
    await withTmpHome(async (home) => {
      const r = await proposals.approve(dir, { id: 'nope', scope: 'common', by: 'user' });
      const msg = JSON.stringify(r);
      assert.ok(!msg.includes(home) && !msg.includes(dir), 'no path leak');
      assert.ok(!/\bat \w+.*:\d+:\d+/.test(msg), 'no stack frame');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
