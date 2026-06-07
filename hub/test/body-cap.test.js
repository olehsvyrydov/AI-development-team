'use strict';
/* An oversize request body must yield a clean HTTP 413 with a JSON error — never a
 * socket reset — for BOTH the projects route and the generic control-plane POST
 * route. The body is still capped: the server stops buffering past MAX_BODY rather
 * than reading an unbounded body into memory. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createServer } = require('../lib/projects');
const { MAX_BODY } = require('../lib/http-body');

const WRITE_HEADERS = { 'x-aidt': '1' };

// POST a raw payload of `bytes` length and resolve with {status, json} — or reject
// if the socket is reset (which is exactly the regression we are guarding against).
function postRaw(port, p, bytes, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({
      host: '127.0.0.1', port, method: 'POST', path: p,
      headers: { 'content-type': 'application/json', ...headers },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject); // ECONNRESET would land here → test fails
    r.write(Buffer.alloc(bytes, 0x61)); // 'a' * bytes, well past MAX_BODY
    r.end();
  });
}

function startProjectsServer() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-cap-home-'));
  const server = createServer({ home, port: 0 });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ port, cleanup: () => { server.close(); fs.rmSync(home, { recursive: true, force: true }); } });
    });
  });
}

test('projects route: an oversize body returns HTTP 413 JSON, not a socket reset', async () => {
  const { port, cleanup } = await startProjectsServer();
  try {
    const res = await postRaw(port, '/api/projects/connect', MAX_BODY + 1024, WRITE_HEADERS);
    assert.equal(res.status, 413, 'oversize body → 413');
    assert.ok(res.json && res.json.ok === false, 'JSON error body returned');
    assert.match(String(res.json.error), /too large/i);
  } finally { cleanup(); }
});

const SERVER_JS = path.join(__dirname, '..', 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

function waitFor(port, deadline) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      const r = http.get({ host: '127.0.0.1', port, path: '/api/state', timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      r.on('error', retry);
      r.on('timeout', () => { r.destroy(); retry(); });
    };
    const retry = () => { if (Date.now() > deadline) return reject(new Error('server did not start')); setTimeout(tick, 100); };
    tick();
  });
}

test('generic control-plane POST: an oversize body returns HTTP 413 JSON, not a socket reset', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-cap-e2e-home-'));
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-cap-e2e-board-'));
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER_JS, board, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
  });
  try {
    await waitFor(port, Date.now() + 10_000);
    // a generic /api/<route> POST (not /api/projects) exercising the second call site
    const res = await postRaw(port, '/api/advance', MAX_BODY + 1024, WRITE_HEADERS);
    assert.equal(res.status, 413, 'oversize body → 413');
    assert.ok(res.json && res.json.ok === false, 'JSON error body returned');
    assert.match(String(res.json.error), /too large/i);
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(board, { recursive: true, force: true });
  }
});
