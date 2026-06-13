'use strict';
/* End-to-end wiring of GET /api/events/rollup on the running Core server: it rides
 * the same loopback stream guard as /api/events (a foreign Host is refused before
 * any channel opens), and a loopback request opens an SSE stream whose first
 * `event: rollup` frame is a full snapshot projecting to exactly {id,label,status,
 * open,needsYou,stateChangedAt,live} — never `path`. The server is spawned as a
 * child process and probed over http. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function startServer(projectDir, port) {
  const child = spawn(process.execPath, [SERVER, projectDir, '--port', String(port)], { stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    let out = '';
    const onData = (c) => { out += c; if (/AI Dev Team Hub/.test(out)) { child.stdout.off('data', onData); resolve(); } };
    child.stdout.on('data', onData);
    child.on('exit', (code) => reject(new Error('server exited early: ' + code + '\n' + out)));
    setTimeout(() => reject(new Error('server did not start:\n' + out)), 8000);
  });
  return { stop: () => new Promise((r) => { child.on('exit', () => r()); child.kill('SIGKILL'); }) };
}

function demoProject() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-rollup-route-')));
}

// open the SSE stream, resolve with the first `event: rollup` frame's parsed data,
// then close the socket so the server tears the connection down
function firstRollupFrame(port, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/api/events/rollup', headers }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve({ status: res.statusCode }); }
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        const m = buf.match(/event: rollup\ndata: (.*)\n\n/s);
        if (m) { r.destroy(); resolve({ status: 200, frame: JSON.parse(m[1]) }); }
      });
      res.on('error', () => {});
    });
    r.on('error', reject);
    r.end();
  });
}

function refusedStatus(port, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/api/events/rollup', headers }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    r.on('error', reject);
    r.end();
  });
}

test('a foreign Host is refused before any channel opens (same stream guard as /api/events)', async () => {
  const project = demoProject();
  const port = await freePort();
  const { stop } = await startServer(project, port);
  try {
    const status = await refusedStatus(port, { host: 'evil.example.com' });
    assert.equal(status, 403, 'off-loopback Host is refused by the stream guard');
  } finally { await stop(); fs.rmSync(project, { recursive: true, force: true }); }
});

test('a loopback request opens an SSE rollup stream; the first frame is a full snapshot with no path', async () => {
  const project = demoProject();
  const port = await freePort();
  const { stop } = await startServer(project, port);
  try {
    const { status, frame } = await firstRollupFrame(port, { host: `127.0.0.1:${port}` });
    assert.equal(status, 200);
    assert.equal(typeof frame.totalOpen, 'number');
    assert.equal(typeof frame.totalNeedsYou, 'number');
    assert.ok(Array.isArray(frame.projects));
    for (const p of frame.projects) {
      assert.deepEqual(
        Object.keys(p).sort(),
        ['id', 'label', 'live', 'needsYou', 'open', 'stateChangedAt', 'status'],
        'a project entry carries exactly the pinned subset of /api/projects');
      assert.ok(!('path' in p), 'the rollup frame never carries path');
    }
  } finally { await stop(); fs.rmSync(project, { recursive: true, force: true }); }
});
