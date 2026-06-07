// @ts-check
/*
 * Test harness fixtures for the hub board.
 *
 * Each test gets its own private copy of the fixture project plus its own hub
 * server instance bound to an ephemeral loopback port. This isolates tests that
 * mutate the project's state on disk (the live-update test) from the rest, and
 * lets the whole suite run in parallel.
 *
 * Exposed fixtures:
 *   - hub.baseURL    the http://127.0.0.1:<port> of this test's server
 *   - hub.projectDir the temp copy of the fixture project this server reads
 *   - hub.writeState(obj)   overwrite the project's .workflow-state.json atomically
 *   - hub.post(route, body) POST to the control plane with the required header
 */
const base = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const FIXTURE_SRC = path.join(__dirname, '..', 'fixtures', 'project');
const SERVER_JS = path.join(__dirname, '..', '..', 'server.js');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// poll GET /api/state until the server answers (or time out)
function waitForServer(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/state', timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('hub server did not start in time'));
      setTimeout(tick, 100);
    };
    tick();
  });
}

// a tiny loopback POST helper that sets the anti-CSRF header the guard requires
function postJson(port, route, body) {
  const payload = Buffer.from(JSON.stringify(body || {}));
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/' + route, method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': payload.length, 'x-aidt': '1' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* leave null */ }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const test = base.test.extend({
  hub: async ({}, use, testInfo) => {
    // 1. private copy of the fixture project for this test
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-'));
    copyDir(FIXTURE_SRC, projectDir);

    // 2. start the hub server on an OS-assigned free port
    const port = await new Promise((resolve, reject) => {
      const srv = http.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });

    const child = spawn(process.execPath, [SERVER_JS, projectDir, '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    child.stdout.on('data', (d) => { serverLog += d.toString(); });
    child.stderr.on('data', (d) => { serverLog += d.toString(); });

    try {
      await waitForServer(port);
    } catch (e) {
      child.kill('SIGKILL');
      throw new Error(`${e.message}\nserver output:\n${serverLog}`);
    }

    const baseURL = `http://127.0.0.1:${port}`;

    const hub = {
      baseURL,
      projectDir,
      port,
      // overwrite the ledger on disk (atomically) to drive a live update via the watcher
      writeState(obj) {
        const target = path.join(projectDir, '.workflow-state.json');
        const tmp = target + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
        fs.renameSync(tmp, target);
      },
      readState() {
        return JSON.parse(fs.readFileSync(path.join(projectDir, '.workflow-state.json'), 'utf8'));
      },
      post(route, body) { return postJson(port, route, body); },
    };

    await use(hub);

    // 3. teardown: stop the server, remove the temp copy
    child.kill('SIGKILL');
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* best effort */ }
  },
});

module.exports = { test, expect: base.expect };
