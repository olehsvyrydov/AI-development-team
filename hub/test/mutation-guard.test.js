'use strict';
/*
 * Ledger-mutation route guarantees (ticket/advance, gate/set, ticket/comment):
 * CAS conflict on a stale rev (N-17), the server-side comment-body cap with the
 * typed gate audit comment (N-19), and — end-to-end against the running server —
 * the write-guard refusal without X-AIDT for the mutation routes and kb/add
 * (N-7 / N-18).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { handle } = require('../lib/api');
const { computeRev } = require('../lib/write');

const WF = `version: 1
preset: solo
tracks:
  standard: [state_behavior, write_test, implement, self_review, code_review]
gates:
  CODE_REVIEWED: { owner: "/rev", refusal: hard, trigger: [track:standard] }
presets:
  solo: { always_required: [] }
`;

function proj() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-mut-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'),
    JSON.stringify({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } }));
  return dir;
}

function ledger(dir) { return JSON.parse(fs.readFileSync(path.join(dir, '.workflow-state.json'), 'utf8')); }
function comments(dir, id) {
  const f = path.join(dir, '.aidevteam', 'comments', `${id}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

// ---- N-17: ledger CAS 409 -------------------------------------------------

test('N-17 ticket/advance with a stale expectedRev → 409, ledger unchanged', async () => {
  const dir = proj();
  try {
    const r = await handle('ticket/advance', { id: 'T-1', toStage: 'code_review', expectedRev: 'stale' }, dir);
    assert.equal(r.code, 409);
    assert.equal(r.payload.conflict, true);
    assert.equal(ledger(dir)['T-1'].stage, 'implement', 'no lost update');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-17 gate/set with a stale expectedRev → 409, ledger unchanged', async () => {
  const dir = proj();
  try {
    const r = await handle('gate/set', { id: 'T-1', gate: 'CODE_REVIEWED', state: 'passed', expectedRev: 'stale' }, dir);
    assert.equal(r.code, 409);
    assert.deepEqual(ledger(dir)['T-1'].gates, {}, 'gate not written under conflict');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-19: comment cap + typed audit comment ------------------------------

test('N-19 over-long comment body is capped server-side at 8KB', async () => {
  const dir = proj();
  try {
    const r = await handle('ticket/comment', { id: 'T-1', author: '/be', body: 'a'.repeat(20000), kind: 'comment' }, dir);
    assert.equal(r.code, 200);
    assert.ok(r.payload.comment.body.length <= 8192, 'body capped at 8KB');
    assert.equal(comments(dir, 'T-1')[0].body.length, 8192);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-19 a gate/set decision emits the typed gate audit comment in the JSONL', async () => {
  const dir = proj();
  try {
    const r = await handle('gate/set', { id: 'T-1', gate: 'CODE_REVIEWED', state: 'passed', by: '/rev', expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    const cs = comments(dir, 'T-1');
    assert.equal(cs.length, 1);
    assert.equal(cs[0].kind, 'gate');
    assert.equal(cs[0].gate, 'CODE_REVIEWED');
    assert.equal(cs[0].state, 'passed');
    assert.equal(cs[0].author, '/rev');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('empty / missing-id comment → 400', async () => {
  const dir = proj();
  try {
    assert.equal((await handle('ticket/comment', { id: 'T-1', body: '' }, dir)).code, 400);
    assert.equal((await handle('ticket/comment', { body: 'hi' }, dir)).code, 400);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- N-7 / N-18: write-guard required (end-to-end against the server) ------

const SERVER = path.join(__dirname, '..', 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

function post(port, route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/' + route,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers } }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on('error', reject);
    r.end(payload);
  });
}

async function startServer(projectDir, port) {
  const child = spawn(process.execPath, [SERVER, projectDir, '--port', String(port)], { stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    let out = '';
    const onData = (c) => { out += c; if (/AI Dev Team Hub/.test(out)) { child.stdout.off('data', onData); resolve(); } };
    child.stdout.on('data', onData);
    child.on('exit', (code) => reject(new Error('server exited early: ' + code)));
    setTimeout(() => reject(new Error('server did not start')), 8000);
  });
  return { stop: () => new Promise((r) => { child.on('exit', () => r()); child.kill('SIGKILL'); }) };
}

test('N-18 mutation routes and kb/add are refused 403 without X-AIDT; allowed with it', async () => {
  const dir = proj();
  const port = await freePort();
  const { stop } = await startServer(dir, port);
  try {
    // without the custom header → 403, nothing written
    for (const [route, body] of [
      ['ticket/advance', { id: 'T-1', toStage: 'code_review' }],
      ['ticket/comment', { id: 'T-1', author: '/be', body: 'hi' }],
      ['gate/set', { id: 'T-1', gate: 'CODE_REVIEWED', state: 'passed' }],
      ['kb/add', { title: 'Guarded', body: 'x' }],
    ]) {
      const res = await post(port, route, body);
      assert.equal(res.status, 403, `${route} refused without X-AIDT`);
    }
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'comments', 'T-1.jsonl')), 'no comment written');
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'kb')), 'no KB note written');

    // with the header, kb/add succeeds and the base count goes up
    const ok = await post(port, 'kb/add', { title: 'Allowed Note', body: 'hello' }, { 'x-aidt': '1' });
    assert.equal(ok.status, 200);
    const payload = JSON.parse(ok.body);
    assert.ok(payload.state.kb.some((d) => d.name === 'allowed-note'));
    assert.ok(fs.existsSync(path.join(dir, '.aidevteam', 'kb', 'allowed-note.md')));
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('N-205 a scoped kb/add (project + common) is refused 403 without X-AIDT and with a non-loopback Host; nothing written', async () => {
  const dir = proj();
  const port = await freePort();
  // a fresh tmp HOME so a leaked common write would land somewhere we control + can inspect
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-guardhome-')));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  const { stop } = await startServer(dir, port);
  try {
    // missing X-AIDT
    for (const scope of ['project', 'common']) {
      const res = await post(port, 'kb/add', { title: 'NoHeader ' + scope, body: 'x', scope });
      assert.equal(res.status, 403, `scope:${scope} refused without X-AIDT`);
    }
    // present X-AIDT but a non-loopback Host header → still 403
    for (const scope of ['project', 'common']) {
      const res = await post(port, 'kb/add', { title: 'BadHost ' + scope, body: 'x', scope },
        { 'x-aidt': '1', host: 'evil.example.com' });
      assert.equal(res.status, 403, `scope:${scope} refused with non-loopback Host`);
    }
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'kb')), 'no project KB note written under 403');
    const commonDir = path.join(home, '.aidevteam', 'kb-common');
    const commonFiles = fs.existsSync(commonDir) ? fs.readdirSync(commonDir).filter((f) => f.endsWith('.md')) : [];
    assert.deepEqual(commonFiles, [], 'no common note written under 403');
  } finally {
    await stop();
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('N-16 the rule/label authoring routes are refused 403 without X-AIDT; nothing written', async () => {
  const dir = proj();
  const port = await freePort();
  const { stop } = await startServer(dir, port);
  try {
    for (const [route, body] of [
      ['workflow/set-rules', { rules: [{ id: 'a', do: [] }] }],
      ['workflow/set-labels', { labels: { X: { settable_by: ['*'] } } }],
      ['label/set', { id: 'T-1', label: 'X', set: true, by: '/rev' }],
    ]) {
      const res = await post(port, route, body);
      assert.equal(res.status, 403, `${route} refused without X-AIDT`);
    }
    // the overlay must not have been written by any refused authoring call
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'workflow.overrides.json')), 'no overlay written under 403');
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'comments', 'T-1.jsonl')), 'no label comment written under 403');
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
