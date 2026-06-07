'use strict';
/* Control-plane HTTP routes for projects: GET list, POST connect, GET :id, DELETE
 * :id. Writes (POST/DELETE) must clear the same guard as the existing POST API
 * (X-AIDT + loopback Host/Origin); reads do not. Bad input → 400, unknown id → 404,
 * :id is validated as 12-hex against the registry and never used as a raw FS path,
 * and DELETE leaves the project's files on disk. Exercised end-to-end over http. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createServer } = require('../lib/projects');

function startServer() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-srv-home-'));
  const server = createServer({ home, port: 0 });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, home, cleanup: () => { server.close(); fs.rmSync(home, { recursive: true, force: true }); } });
    });
  });
}

function projectDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-srv-proj-')));
}

function req(port, method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({
      host: '127.0.0.1', port, method, path: p,
      headers: { 'content-type': 'application/json', ...headers },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const WRITE_HEADERS = { 'x-aidt': '1' };

test('POST connect requires the X-AIDT write guard', async () => {
  const { port, cleanup } = await startServer();
  const dir = projectDir();
  try {
    const res = await req(port, 'POST', '/api/projects/connect', { body: { path: dir } });
    assert.equal(res.status, 403, 'a write without X-AIDT is refused');
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST connect registers and returns the project, GET list shows it', async () => {
  const { port, cleanup } = await startServer();
  const dir = projectDir();
  try {
    const res = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: dir } });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.created, true);
    assert.match(res.json.project.id, /^[0-9a-f]{12}$/);
    assert.equal(res.json.project.path, dir);
    assert.ok(res.json.profile, 'profile returned');

    const list = await req(port, 'GET', '/api/projects');
    assert.equal(list.status, 200);
    assert.equal(list.json.projects.length, 1);
    assert.equal(list.json.projects[0].id, res.json.project.id);
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST connect is idempotent on id (created:false on the second call)', async () => {
  const { port, cleanup } = await startServer();
  const dir = projectDir();
  try {
    const a = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: dir } });
    const b = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: dir } });
    assert.equal(a.json.created, true);
    assert.equal(b.json.created, false);
    assert.equal(a.json.project.id, b.json.project.id);
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST connect rejects a relative path with 400', async () => {
  const { port, cleanup } = await startServer();
  try {
    const res = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: 'relative/dir' } });
    assert.equal(res.status, 400);
    assert.equal(res.json.ok, false);
  } finally { cleanup(); }
});

test('POST connect rejects a missing path with 400', async () => {
  const { port, cleanup } = await startServer();
  try {
    const res = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: {} });
    assert.equal(res.status, 400);
  } finally { cleanup(); }
});

test('POST connect rejects a non-existent directory with 400', async () => {
  const { port, cleanup } = await startServer();
  try {
    const res = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: '/no/such/dir/abc' } });
    assert.equal(res.status, 400);
  } finally { cleanup(); }
});

test('GET :id returns the project; unknown id is 404', async () => {
  const { port, cleanup } = await startServer();
  const dir = projectDir();
  try {
    const created = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: dir } });
    const id = created.json.project.id;
    const got = await req(port, 'GET', `/api/projects/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.project.id, id);
    assert.ok(got.json.profile);

    const missing = await req(port, 'GET', '/api/projects/aaaaaaaaaaaa');
    assert.equal(missing.status, 404);
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('GET :id returns the stored profile + fresh state WITHOUT re-writing profile.json', async () => {
  const { port, cleanup } = await startServer();
  const dir = projectDir();
  const profilePath = path.join(dir, '.aidevteam', 'profile.json');
  try {
    const created = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: dir } });
    const id = created.json.project.id;
    assert.ok(fs.existsSync(profilePath), 'connect writes profile.json');

    // capture the on-disk profile right after connect
    const before = fs.readFileSync(profilePath, 'utf8');
    const beforeMtime = fs.statSync(profilePath).mtimeMs;
    await new Promise((r) => setTimeout(r, 20)); // let the clock advance so a rewrite would change mtime

    const got = await req(port, 'GET', `/api/projects/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.project.id, id);
    assert.ok(got.json.profile, 'GET returns the profile');
    assert.equal(got.json.profile.id, id, 'returned profile is the stored one');
    assert.ok('state' in got.json, 'GET returns workflow state');

    // a GET must not mutate disk: identical bytes and unchanged mtime
    const after = fs.readFileSync(profilePath, 'utf8');
    const afterMtime = fs.statSync(profilePath).mtimeMs;
    assert.equal(after, before, 'GET :id must not rewrite profile.json contents');
    assert.equal(afterMtime, beforeMtime, 'GET :id must not touch profile.json mtime');
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test(':id that is not 12-hex is rejected as 404 and never used as a path', async () => {
  const { port, cleanup } = await startServer();
  try {
    // a path-traversal attempt in the :id segment must not be honored
    const res = await req(port, 'GET', '/api/projects/..%2f..%2f..%2fetc%2fpasswd');
    assert.equal(res.status, 404);
    const res2 = await req(port, 'GET', '/api/projects/not-hex-id');
    assert.equal(res2.status, 404);
  } finally { cleanup(); }
});

test('DELETE requires the write guard, removes the entry, and leaves files on disk', async () => {
  const { port, cleanup } = await startServer();
  const dir = projectDir();
  const marker = path.join(dir, 'KEEP.txt');
  fs.writeFileSync(marker, 'user data');
  try {
    const created = await req(port, 'POST', '/api/projects/connect', { headers: WRITE_HEADERS, body: { path: dir } });
    const id = created.json.project.id;

    const noGuard = await req(port, 'DELETE', `/api/projects/${id}`);
    assert.equal(noGuard.status, 403, 'DELETE without X-AIDT is refused');

    const del = await req(port, 'DELETE', `/api/projects/${id}`, { headers: WRITE_HEADERS });
    assert.equal(del.status, 200);
    assert.equal(del.json.removed, true);

    const list = await req(port, 'GET', '/api/projects');
    assert.equal(list.json.projects.length, 0);

    // the user's files remain untouched
    assert.ok(fs.existsSync(dir));
    assert.equal(fs.readFileSync(marker, 'utf8'), 'user data');

    const delMissing = await req(port, 'DELETE', `/api/projects/${id}`, { headers: WRITE_HEADERS });
    assert.equal(delMissing.status, 404, 'deleting an unknown id is 404');
  } finally { cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});
