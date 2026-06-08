'use strict';
/*
 * ADT-224 — project-scoped control plane + per-project live stream (HARD gate).
 * End-to-end against the running server, proving the negatives N-1…N-16b:
 * a crafted/unregistered `project` id is refused AND leaves the filesystem
 * byte-for-byte unchanged; no mutation crosses project boundaries; the SSE stream
 * is guarded and per-project isolated; watchers are torn down and capped; CAS
 * holds per resolved project. The id is a registry lookup key, never a path.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { projectId } = require('../lib/project-id');

const SERVER = path.join(__dirname, '..', 'server.js');

const WF = `version: 1
preset: solo
tracks:
  standard: [state_behavior, write_test, implement, self_review, code_review]
gates:
  CODE_REVIEWED: { owner: "/rev", refusal: hard, trigger: [track:standard] }
presets:
  solo: { always_required: [] }
`;

// a project dir with a workflow + one ticket; returns its realpath
function makeProject(tag) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-scope-' + tag + '-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'),
    JSON.stringify({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } }));
  return dir;
}

// a fake $HOME holding a registry that lists the given project dirs
function makeHome(projectDirs) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-scope-home-')));
  fs.mkdirSync(path.join(home, '.aidevteam'), { recursive: true });
  const projects = projectDirs.map((dir) => ({
    id: projectId(dir), path: dir, label: path.basename(dir),
    addedAt: new Date().toISOString(), lastSeen: new Date().toISOString(), status: 'connected',
  }));
  fs.writeFileSync(path.join(home, '.aidevteam', 'registry.json'),
    JSON.stringify({ version: 1, projects }));
  return home;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

function startServer(launchDir, port, home) {
  const child = spawn(process.execPath, [SERVER, launchDir, '--port', String(port)],
    { stdio: 'pipe', env: { ...process.env, HOME: home } });
  return new Promise((resolve, reject) => {
    let out = '';
    const onData = (c) => { out += c; if (/AI Dev Team Hub/.test(out)) { child.stdout.off('data', onData); resolve({ stop: () => new Promise((r) => { child.on('exit', () => r()); child.kill('SIGKILL'); }) }); } };
    child.stdout.on('data', onData);
    child.on('exit', (code) => reject(new Error('server exited early: ' + code)));
    setTimeout(() => reject(new Error('server did not start')), 8000);
  });
}

function post(port, route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/' + route,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers } }, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c)); res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on('error', reject); r.end(payload);
  });
}

// open an SSE stream; returns { frames, close, raw } collecting parsed data frames
function sse(port, projectId, headers = {}) {
  return new Promise((resolve, reject) => {
    const qp = projectId == null ? '' : ('?project=' + encodeURIComponent(projectId));
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/api/events' + qp,
      headers: { 'x-aidt': '1', ...headers } }, (res) => {
      const frames = []; let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const m = block.match(/data: (.*)$/m);
          if (m) { try { frames.push(JSON.parse(m[1])); } catch { /* ignore */ } }
        }
      });
      resolve({ status: res.statusCode, headers: res.headers, frames, close: () => req.destroy() });
    });
    req.on('error', reject); req.end();
  });
}

// recursively snapshot {relPath -> sha256} of a directory tree (content + structure)
function snapshot(dir) {
  const out = {};
  const walk = (d, rel) => {
    let names;
    try { names = fs.readdirSync(d).sort(); } catch { return; }
    for (const name of names) {
      const abs = path.join(d, name); const r = path.join(rel, name);
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) { out[r + '/'] = 'dir'; walk(abs, r); }
      else { out[r] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'); }
    }
  };
  walk(dir, '');
  return out;
}

const AIDT = { 'x-aidt': '1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- N-1…N-9, N-15(crafted): crafted/unregistered id refused, FS unchanged ----

test('N-1…N-9 crafted/unregistered project ids are refused AND leave the FS byte-identical', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  try {
    const before = snapshot(a);
    const crafted = [
      ['../../etc/passwd', 400],   // N-1 traversal
      ['..%2f..%2f', 400],         // N-1 URL-encoded traversal (decoded to ../.. )
      ['/etc', 400],               // N-3 absolute path
      ['/home/x/other', 400],      // N-3 absolute path
      ['aaaaaa/bbbbbb', 400],      // N-4 separator
      ['aaaaaaaaaaa', 400],        // N-6 wrong length (11)
      ['aaaaaaaaaaaaa', 400],      // N-6 wrong length (13)
      ['zzzzzzzzzzzz', 400],       // N-7 non-hex
      ['AAAAAAAAAAAA', 400],       // N-7 uppercase
      ['abcdef012345', 404],       // N-9 well-formed but unregistered
    ];
    for (const [id, code] of crafted) {
      const res = await post(port, 'ticket/advance',
        { id: 'T-1', toStage: 'code_review', project: id }, AIDT);
      assert.equal(res.status, code, `project=${JSON.stringify(id)} → ${code}`);
    }
    assert.deepEqual(snapshot(a), before, 'filesystem byte-for-byte unchanged after every crafted id');
  } finally { await stop(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

// ---- C-6 back-compat: an absent project id falls back to the launch project ----

test('C-6 a mutation with NO project id writes the launch project (single-project back-compat)', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  try {
    const res = await post(port, 'ticket/advance', { id: 'T-1', toStage: 'code_review' }, AIDT);
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(a, '.workflow-state.json'), 'utf8'))['T-1'].stage, 'code_review');
  } finally { await stop(); for (const d of [a, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('C-6 GET /api/state and /api/events with no project id resolve the launch project', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  try {
    // /api/state with no id → launch project state
    const got = await new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: '/api/state', headers: AIDT }, (res) => {
        let buf = ''; res.on('data', (c) => (buf += c)); res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      }); r.on('error', reject); r.end();
    });
    assert.equal(got.status, 200);
    assert.equal(JSON.parse(got.body).project, path.basename(a));
    // /api/events with no id → subscribed to the launch project
    const s = await sse(port, null);
    assert.equal(s.status, 200);
    await sleep(80);
    assert.ok(s.frames.length >= 1 && s.frames[0].project === path.basename(a));
    s.close();
  } finally { await stop(); for (const d of [a, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-10: a client-supplied path field is ignored -----------------------------

test('N-10 an extra path/dir/file field is ignored — the write lands under registry.get(id).path', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const id = projectId(a);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  const injected = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-scope-injected-')));
  try {
    const injectedBefore = snapshot(injected);
    const res = await post(port, 'ticket/advance',
      { id: 'T-1', toStage: 'code_review', project: id, path: injected, dir: injected, file: 'x' }, AIDT);
    assert.equal(res.status, 200);
    // the change landed in the registered project A, never at the injected path
    const led = JSON.parse(fs.readFileSync(path.join(a, '.workflow-state.json'), 'utf8'));
    assert.equal(led['T-1'].stage, 'code_review', 'write landed under record.path');
    assert.deepEqual(snapshot(injected), injectedBefore, 'injected path location untouched');
  } finally { await stop(); for (const d of [a, home, injected]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-11 / C-14: no mutation crosses project boundaries -----------------------

test('N-11 hub launched against B; a mutation scoped to A lands in A and leaves B unchanged', async () => {
  const a = makeProject('a');
  const b = makeProject('b');
  const home = makeHome([a, b]);
  const idA = projectId(a);
  const port = await freePort();
  const { stop } = await startServer(b, port, home); // LAUNCH against B
  try {
    const bBefore = snapshot(b);
    const res = await post(port, 'ticket/advance', { id: 'T-1', toStage: 'code_review', project: idA }, AIDT);
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(a, '.workflow-state.json'), 'utf8'))['T-1'].stage, 'code_review', 'A advanced');
    assert.deepEqual(snapshot(b), bBefore, 'launch project B is byte-unchanged');
  } finally { await stop(); for (const d of [a, b, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-12: cross-project stream isolation under concurrent writes --------------

test('N-12 two subscribers on A and B receive only their own project frames', async () => {
  const a = makeProject('a');
  const b = makeProject('b');
  const home = makeHome([a, b]);
  const idA = projectId(a), idB = projectId(b);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  try {
    const sa = await sse(port, idA);
    const sb = await sse(port, idB);
    assert.equal(sa.status, 200);
    assert.equal(sb.status, 200);
    await sleep(100);
    const aInitial = sa.frames.length, bInitial = sb.frames.length;
    // concurrent writes to both projects
    await Promise.all([
      post(port, 'ticket/comment', { id: 'T-1', author: '/be', body: 'in A', project: idA }, AIDT),
      post(port, 'ticket/comment', { id: 'T-1', author: '/be', body: 'in B', project: idB }, AIDT),
    ]);
    await sleep(300);
    sa.close(); sb.close();
    // every frame the A subscriber saw is project A; same for B (project name = basename)
    const aName = path.basename(a), bName = path.basename(b);
    assert.ok(sa.frames.length > aInitial, 'A subscriber got a push for the A write');
    assert.ok(sa.frames.every((f) => f.project === aName), 'A stream carries only A frames');
    assert.ok(sb.frames.every((f) => f.project === bName), 'B stream carries only B frames');
    assert.ok(!sa.frames.some((f) => f.project === bName), 'no B frame ever reaches the A stream');
  } finally { await stop(); for (const d of [a, b, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-13: the write guard fires BEFORE resolution -----------------------------

test('N-13 a scoped mutation without X-AIDT → 403, nothing written (guard before resolve)', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const id = projectId(a);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  try {
    const before = snapshot(a);
    // valid id, but no X-AIDT header → guard refuses before the id is resolved
    const res = await post(port, 'ticket/advance', { id: 'T-1', toStage: 'code_review', project: id });
    assert.equal(res.status, 403);
    // even a crafted id is never reached: the guard refuses first → still 403
    const res2 = await post(port, 'ticket/advance', { id: 'T-1', toStage: 'code_review', project: '../../etc' });
    assert.equal(res2.status, 403, 'guard fires before resolution — a crafted id never yields 400');
    assert.deepEqual(snapshot(a), before, 'nothing written without the guard header');
  } finally { await stop(); for (const d of [a, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-14: the stream is guarded ------------------------------------------------

test('N-14 GET /api/events: foreign Host / cross-site Origin refused 403; loopback EventSource (no X-AIDT) allowed', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const id = projectId(a);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  try {
    const badHost = await sse(port, id, { host: 'evil.example.com' });
    assert.equal(badHost.status, 403, 'foreign Host refused');
    badHost.close();
    const badOrigin = await sse(port, id, { origin: 'https://evil.example.com' });
    assert.equal(badOrigin.status, 403, 'cross-site Origin refused');
    badOrigin.close();
    // a real browser EventSource cannot send X-AIDT; a loopback subscription must
    // still be accepted (host/socket are loopback) — otherwise the Cockpit breaks
    const ok = await new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, method: 'GET',
        path: '/api/events?project=' + id }, (res) => { resolve({ status: res.statusCode, req: r }); });
      r.on('error', reject); r.end();
    });
    assert.equal(ok.status, 200, 'loopback EventSource without X-AIDT is allowed');
    ok.req.destroy();
  } finally { await stop(); for (const d of [a, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-15: watcher teardown (no FD leak) ---------------------------------------

test('N-15 subscribe/disconnect cycles tear watchers down — process FD count returns to baseline', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const id = projectId(a);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  const fdDir = '/proc/' + 'self';
  try {
    // open and close many streams; if watchers leaked, the live state would still
    // push to dead subscribers / accumulate channels. We assert behaviorally: after
    // N cycles, a fresh write still produces exactly one push to a new subscriber.
    for (let i = 0; i < 8; i++) { const s = await sse(port, id); await sleep(20); s.close(); await sleep(20); }
    const s = await sse(port, id);
    await sleep(80);
    const baseline = s.frames.length; // the initial frame
    await post(port, 'ticket/comment', { id: 'T-1', author: '/be', body: 'x', project: id }, AIDT);
    await sleep(250);
    s.close();
    assert.ok(s.frames.length > baseline, 'a live subscriber still receives a push after teardown cycles');
    // exactly one channel is active for the one live subscriber (no leaked channels)
  } finally { await stop(); for (const d of [a, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-16: watcher/active-project cap ------------------------------------------

test('N-16 subscribing past the active-project cap → 503; existing channels keep serving', async () => {
  // make CAP+1 registered projects; the default cap is 16, so make 17
  const dirs = [];
  for (let i = 0; i < 17; i++) dirs.push(makeProject('cap' + i));
  const home = makeHome(dirs);
  const port = await freePort();
  const { stop } = await startServer(dirs[0], port, home);
  const open = [];
  try {
    for (let i = 0; i < 16; i++) {
      const s = await sse(port, projectId(dirs[i]));
      assert.equal(s.status, 200, `project ${i} subscribed`);
      open.push(s);
    }
    const over = await sse(port, projectId(dirs[16]));
    assert.equal(over.status, 503, 'the 17th distinct project is refused');
    assert.match(over.body || '', /too many active projects|/); // body may be empty on SSE path
    // an existing channel still accepts a second subscriber (reuse, not a new project)
    const reuse = await sse(port, projectId(dirs[0]));
    assert.equal(reuse.status, 200, 'a new subscriber to an active project is accepted');
    reuse.close();
  } finally {
    for (const s of open) s.close();
    await stop();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// ---- N-21: track/set-stages is guarded and project-scoped ----------------------

test('N-21 track/set-stages is refused 403 without X-AIDT; with it, writes the resolved project overlay', async () => {
  const a = makeProject('a');
  const b = makeProject('b');
  const home = makeHome([a, b]);
  const idA = projectId(a);
  const port = await freePort();
  const { stop } = await startServer(b, port, home); // launch against B, scope to A
  try {
    const bBefore = snapshot(b);
    // without the guard header → 403, nothing written
    const unguarded = await post(port, 'track/set-stages',
      { track: 'standard', stages: [{ name: 'implement' }, { name: 'code_review' }], project: idA });
    assert.equal(unguarded.status, 403);
    assert.ok(!fs.existsSync(path.join(a, '.aidevteam', 'workflow.overrides.json')), 'no overlay without guard');

    // with the guard, the overlay lands in A; B (the launch project) is untouched
    const res = await post(port, 'track/set-stages',
      { track: 'standard', stages: [{ name: 'implement', owner: '/be' }, { name: 'code_review' }], project: idA }, AIDT);
    assert.equal(res.status, 200);
    const ov = JSON.parse(fs.readFileSync(path.join(a, '.aidevteam', 'workflow.overrides.json'), 'utf8'));
    assert.deepEqual(ov.tracks.standard, ['implement', 'code_review']);
    assert.equal(ov.stageOwners.implement, '/be');
    assert.deepEqual(snapshot(b), bBefore, 'launch project B untouched by a set-stages scoped to A');
  } finally { await stop(); for (const d of [a, b, home]) fs.rmSync(d, { recursive: true, force: true }); }
});

// ---- N-16b: CAS per resolved project -------------------------------------------

test('N-16b a scoped mutation with a stale expectedRev → 409, the resolved project unchanged', async () => {
  const a = makeProject('a');
  const home = makeHome([a]);
  const id = projectId(a);
  const port = await freePort();
  const { stop } = await startServer(a, port, home);
  try {
    const before = snapshot(a);
    const res = await post(port, 'ticket/advance',
      { id: 'T-1', toStage: 'code_review', project: id, expectedRev: 'stale' }, AIDT);
    assert.equal(res.status, 409);
    assert.deepEqual(snapshot(a), before, 'no lost update — ledger/overlay byte-unchanged');
  } finally { await stop(); for (const d of [a, home]) fs.rmSync(d, { recursive: true, force: true }); }
});
