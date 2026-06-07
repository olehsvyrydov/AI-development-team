'use strict';
/*
 * End-to-end harness: drives the real shipped hub entrypoint (hub/server.js) over
 * HTTP, exactly as a user runs it.
 *
 * Each started server is the actual server.js child process, bound to an ephemeral
 * loopback port, with HOME (and USERPROFILE) pointed at a throwaway directory so the
 * user-global registry at ~/.aidevteam/registry.json is never touched. The registry
 * the server reads/writes therefore lives under <tmpHome>/.aidevteam/registry.json.
 *
 * Zero runtime dependencies: node:child_process + node:http only.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const SERVER_JS = path.join(__dirname, '..', 'server.js');

// Reserve an OS-assigned free loopback port, then release it for the child to bind.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Poll GET /api/state until the server answers 200 (or time out).
function waitForServer(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
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
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('hub server did not start in time'));
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * Start the real hub server for one test.
 *  - tmpHome: isolated HOME so the registry is a fresh temp file
 *  - boardDir: the projectDir argument the server serves (its own board)
 * Returns { port, baseURL, tmpHome, registryFile, request, stop, log() }.
 */
async function startHub({ boardDir } = {}) {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-e2e-home-'));
  const board = boardDir || fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-e2e-board-'));
  const port = await freePort();

  const child = spawn(process.execPath, [SERVER_JS, board, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d.toString(); });
  child.stderr.on('data', (d) => { log += d.toString(); });

  try {
    await waitForServer(port);
  } catch (e) {
    child.kill('SIGKILL');
    throw new Error(`${e.message}\nserver output:\n${log}`);
  }

  return {
    port,
    baseURL: `http://127.0.0.1:${port}`,
    tmpHome,
    boardDir: board,
    registryFile: path.join(tmpHome, '.aidevteam', 'registry.json'),
    log: () => log,
    request: (method, p, opts) => request(port, method, p, opts),
    stop() {
      child.kill('SIGKILL');
      fs.rmSync(tmpHome, { recursive: true, force: true });
      if (!boardDir) fs.rmSync(board, { recursive: true, force: true });
    },
  };
}

/**
 * Raw HTTP request over loopback. `headers` are merged verbatim so a test can omit
 * the X-AIDT guard header on purpose. A JSON body is sent only when provided.
 */
function request(port, method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const h = { ...headers };
    if (payload) {
      h['content-type'] = h['content-type'] || 'application/json';
      h['content-length'] = payload.length;
    }
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* leave null */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    r.on('error', reject);
    r.setTimeout(5000, () => { r.destroy(new Error('request timed out')); });
    if (payload) r.write(payload);
    r.end();
  });
}

// Header set that satisfies the write guard (X-AIDT present; loopback Host is set by
// node:http automatically; no Origin is sent, which the guard treats as non-browser).
const WRITE = { 'x-aidt': '1' };

/**
 * Create a self-contained fixture project on disk:
 *   - package.json with a known name + description
 *   - README.md whose first paragraph is the expected description source
 *   - KEEP.txt marker to prove DELETE never removes user files
 * Returns the realpath of the directory (matches the server's canonical id input).
 */
function makeProject({ name, readmeFirstParagraph, marker = 'KEEP.txt' } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-e2e-proj-')));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, version: '0.0.0', description: 'pkg-fallback-description' }, null, 2),
  );
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${name}\n\n${readmeFirstParagraph}\n\nSecond paragraph, should be ignored.\n`,
  );
  fs.writeFileSync(path.join(dir, marker), 'user data must survive');
  return dir;
}

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } }

module.exports = { startHub, makeProject, WRITE, rmrf };
