'use strict';
/* End-to-end checks on the running Core server: the production Cockpit build is
 * served same-origin at `/`, deep client routes fall back to its index.html,
 * traversal is contained, the legacy board moved to `/legacy`, and the existing
 * `/api/projects` route is unaffected. When the build dir is absent the server
 * still starts and serves the legacy board at `/`. The server is spawned as a
 * child process (it binds on import) and probed over http. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const BUILD_DIR = path.join(__dirname, '..', '..', 'studio', 'cockpit', 'dist', 'cockpit', 'browser');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

function get(port, rawPath) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: rawPath }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
    });
    r.on('error', reject);
    r.end();
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
  return { child, stop: () => new Promise((r) => { child.on('exit', () => r()); child.kill('SIGKILL'); }) };
}

function demoProject() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-server-proj-')));
}

const hasBuild = fs.existsSync(path.join(BUILD_DIR, 'index.html'));

test('serves the production Cockpit build at `/` and falls back for client routes', { skip: !hasBuild }, async () => {
  const project = demoProject();
  const port = await freePort();
  const { stop } = await startServer(project, port);
  try {
    const root = await get(port, '/');
    assert.equal(root.status, 200);
    assert.match(root.headers['content-type'], /text\/html/);
    assert.match(root.body, /<dart-root|<app-root/);

    const deep = await get(port, '/projects/abc123');
    assert.equal(deep.status, 200, 'client-side route falls back to index.html');
    assert.match(deep.body, /<dart-root|<app-root/);

    const traversal = await get(port, '/..%2f..%2f..%2f..%2fetc%2fpasswd');
    assert.equal(traversal.status, 404);
    assert.ok(!/root:.*:0:0:/.test(traversal.body), 'must not leak /etc/passwd');
  } finally { stop(); fs.rmSync(project, { recursive: true, force: true }); }
});

test('/legacy serves the original zero-dependency board; /api/projects is unaffected', { skip: !hasBuild }, async () => {
  const project = demoProject();
  const port = await freePort();
  const { stop } = await startServer(project, port);
  try {
    const legacy = await get(port, '/legacy');
    assert.equal(legacy.status, 200);
    assert.match(legacy.headers['content-type'], /text\/html/);

    const apiProjects = await get(port, '/api/projects');
    assert.equal(apiProjects.status, 200, '/api/projects still answers');
    const parsed = JSON.parse(apiProjects.body);
    assert.ok(parsed && typeof parsed === 'object');

    const apiState = await get(port, '/api/state');
    assert.equal(apiState.status, 200, '/api/state still answers');
  } finally { stop(); fs.rmSync(project, { recursive: true, force: true }); }
});

test('when the build dir is absent the server still starts and serves the legacy board at `/`', async () => {
  // Temporarily move the build aside so the server falls back to legacy.
  const dist = path.join(__dirname, '..', '..', 'studio', 'cockpit', 'dist');
  const stash = dist + '.stash-' + process.pid;
  const moved = fs.existsSync(dist);
  if (moved) fs.renameSync(dist, stash);
  const project = demoProject();
  const port = await freePort();
  let started;
  try {
    started = await startServer(project, port);
    const root = await get(port, '/');
    assert.equal(root.status, 200, 'server serves something at `/` with no build');
    assert.match(root.headers['content-type'], /text\/html/);

    const legacy = await get(port, '/legacy');
    assert.equal(legacy.status, 200, '/legacy still works with no build');

    const api = await get(port, '/api/projects');
    assert.equal(api.status, 200, '/api/projects still works with no build');
  } finally {
    if (started) await started.stop();
    fs.rmSync(project, { recursive: true, force: true });
    if (moved) fs.renameSync(stash, dist);
  }
});
