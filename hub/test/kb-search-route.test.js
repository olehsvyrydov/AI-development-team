'use strict';
/*
 * Server-level integration: GET /api/kb/search is a read-only, loopback-pinned route over
 * the launch project's scoped knowledge. With no index it ranks via a filename/excerpt
 * scan and labels 'filename-only' (never 'full-text'); it rides loopback Host/Origin/socket
 * pinning (no X-AIDT needed for a read), refuses a cross-site Origin, and rejects a non-GET.
 * The child server is given a controlled HOME so no real index/overlay is reachable.
 */
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
function get(port, rawPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: rawPath, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on('error', reject);
    r.end();
  });
}
async function startServer(projectDir, port, home) {
  const child = spawn(process.execPath, [SERVER, projectDir, '--port', String(port)],
    { stdio: 'pipe', env: { ...process.env, HOME: home, USERPROFILE: home } });
  await new Promise((resolve, reject) => {
    let out = '';
    const onData = (c) => { out += c; if (/AI Dev Team Hub/.test(out)) { child.stdout.off('data', onData); resolve(); } };
    child.stdout.on('data', onData);
    child.on('exit', (code) => reject(new Error('server exited early: ' + code + '\n' + out)));
    setTimeout(() => reject(new Error('server did not start:\n' + out)), 8000);
  });
  return { stop: () => new Promise((r) => { child.on('exit', () => r()); child.kill('SIGKILL'); }) };
}
function freshTmp(p) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p))); }

test('GET /api/kb/search ranks the project scope locally and labels filename-only without an index', async () => {
  const home = freshTmp('aidt-kbs-home-');
  const project = freshTmp('aidt-kbs-proj-');
  fs.mkdirSync(path.join(project, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(project, 'docs', 'webhook-retry.md'),
    '---\nscope: project\n---\n# Webhook Retry\nretries use exponential backoff');
  const port = await freePort();
  const { stop } = await startServer(project, port, home);
  try {
    const res = await get(port, '/api/kb/search?q=' + encodeURIComponent('webhook'));
    assert.equal(res.status, 200);
    const j = JSON.parse(res.body);
    assert.equal(j.ok, true);
    assert.equal(j.method, 'filename-only', 'no index → honest filename-only label');
    assert.ok(j.results.some((r) => r.file === 'docs/webhook-retry.md'), 'match surfaced');
    for (const r of j.results) assert.ok(!path.isAbsolute(r.file), 'no absolute path leaked');
  } finally { stop(); fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('GET /api/kb/search with an empty query returns the unranked scope-filtered docs', async () => {
  const home = freshTmp('aidt-kbs-home-');
  const project = freshTmp('aidt-kbs-proj-');
  fs.mkdirSync(path.join(project, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(project, 'docs', 'a.md'), '---\nscope: project\n---\n# A\nalpha');
  fs.writeFileSync(path.join(project, 'docs', 'b.md'), '---\nscope: project\n---\n# B\nbeta');
  const port = await freePort();
  const { stop } = await startServer(project, port, home);
  try {
    const res = await get(port, '/api/kb/search?q=');
    assert.equal(res.status, 200);
    const j = JSON.parse(res.body);
    assert.deepEqual(j.results.map((r) => r.file).sort(), ['docs/a.md', 'docs/b.md']);
  } finally { stop(); fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('GET /api/kb/search refuses a cross-site Origin (loopback pinning on the read)', async () => {
  const home = freshTmp('aidt-kbs-home-');
  const project = freshTmp('aidt-kbs-proj-');
  const port = await freePort();
  const { stop } = await startServer(project, port, home);
  try {
    const res = await get(port, '/api/kb/search?q=x', { Origin: 'http://evil.example' });
    assert.equal(res.status, 403, 'a cross-site Origin is refused');
  } finally { stop(); fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('GET /api/kb/search rejects a non-GET method', async () => {
  const home = freshTmp('aidt-kbs-home-');
  const project = freshTmp('aidt-kbs-proj-');
  const port = await freePort();
  const { stop } = await startServer(project, port, home);
  try {
    const status = await new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/kb/search', headers: { 'x-aidt': '1' } }, (res) => { res.resume(); resolve(res.statusCode); });
      r.on('error', reject); r.end();
    });
    assert.equal(status, 405);
  } finally { stop(); fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});
