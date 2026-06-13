'use strict';
/*
 * End-to-end write-guard for the NEW knowledge routes (kb/update, kb/remove,
 * kb/source/{connect,reindex,disconnect}): each is refused 403 without X-AIDT and
 * with a non-loopback Host — proving N-5/N-15/N-18/N-27 (the guard is inherited by
 * route placement at the HTTP layer, and re-proven for every new route here).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');

function proj() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-rg-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.workflow-state.json'), JSON.stringify({}));
  return dir;
}
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

test('N-27 the new CRUD + source routes are refused 403 without X-AIDT and with a non-loopback Host', async () => {
  const dir = proj();
  const ext = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-rgext-')));
  fs.writeFileSync(path.join(ext, 'a.md'), 'x');
  const port = await freePort();
  const { stop } = await startServer(dir, port);
  try {
    const routes = [
      ['kb/update', { file: 'x.md', scope: 'project', body: 'y', expectedRev: '0' }],
      ['kb/remove', { file: 'x.md', scope: 'project', expectedRev: '0' }],
      ['kb/source/connect', { path: ext, expectedRev: '0' }],
      ['kb/source/reindex', { sourceId: 'any', expectedRev: '0' }],
      ['kb/source/disconnect', { sourceId: 'any', expectedRev: '0' }],
    ];
    for (const [route, body] of routes) {
      const noHeader = await post(port, route, body);
      assert.equal(noHeader.status, 403, `${route} refused without X-AIDT`);
      const badHost = await post(port, route, body, { 'x-aidt': '1', host: 'evil.example.com' });
      assert.equal(badHost.status, 403, `${route} refused with a non-loopback Host`);
    }
    // nothing recorded by a refused connect
    assert.ok(!fs.existsSync(path.join(dir, '.aidevteam', 'sources.json')), 'no source recorded by a refused connect');
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(ext, { recursive: true, force: true });
  }
});

test('kb/source/connect succeeds with X-AIDT and surfaces the source in the projection', async () => {
  const dir = proj();
  const ext = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-rgok-')));
  fs.writeFileSync(path.join(ext, 'readme.md'), '# hello\nkeyword content');
  const port = await freePort();
  const { stop } = await startServer(dir, port);
  try {
    const res = await post(port, 'kb/source/connect', { path: ext, expectedRev: '0' }, { 'x-aidt': '1' });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.ok(payload.source && payload.source.path === fs.realpathSync(ext));
    assert.ok(Array.isArray(payload.state.knowledge.sources) && payload.state.knowledge.sources.length === 1);
    assert.equal(payload.state.knowledge.sources[0].external, false);
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(ext, { recursive: true, force: true });
  }
});
