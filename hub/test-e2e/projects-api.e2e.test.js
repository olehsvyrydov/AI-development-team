'use strict';
/*
 * End-to-end coverage for the multi-project registry + connect/analyze HTTP API,
 * driven against the real shipped hub server (hub/server.js) started as a child
 * process on an ephemeral loopback port. Each test isolates the user-global
 * registry by pointing the server's HOME at a throwaway directory, so the real
 * ~/.aidevteam/registry.json is never read or written.
 *
 * Routes exercised end-to-end:
 *   GET    /api/projects          list connected projects
 *   POST   /api/projects/connect  connect + analyze a folder
 *   GET    /api/projects/:id       one project (record + profile)
 *   DELETE /api/projects/:id       forget a project (index entry only)
 *
 * Flows: full lifecycle, idempotent connect, write-guard security, id validation /
 * path-traversal, symlink containment in analysis, and malformed-input handling.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { startHub, makeProject, WRITE, rmrf } = require('./harness');

// ---------------------------------------------------------------------------
// 1. Full lifecycle: connect → list → get → delete → gone, files preserved.
// ---------------------------------------------------------------------------
test('lifecycle: connect, list, get, delete; project files survive', async () => {
  const hub = await startHub();
  const project = makeProject({
    name: 'lifecycle-fixture',
    readmeFirstParagraph: 'A fixture project used to exercise the connect lifecycle end to end.',
  });
  const marker = path.join(project, 'KEEP.txt');
  try {
    // POST connect with the write-guard header → 200 + record + profile
    const connect = await hub.request('POST', '/api/projects/connect', {
      headers: WRITE, body: { path: project },
    });
    assert.equal(connect.status, 200, 'connect succeeds');
    assert.equal(connect.json.ok, true);
    assert.equal(connect.json.created, true);

    const id = connect.json.project.id;
    assert.match(id, /^[0-9a-f]{12}$/, 'id is a 12-hex project id');
    assert.equal(connect.json.project.path, project, 'record carries the canonical path');

    const profile = connect.json.profile;
    assert.ok(profile, 'profile is returned');
    assert.equal(profile.title, 'lifecycle-fixture', 'title comes from package.json name');
    assert.match(profile.description, /exercise the connect lifecycle/, 'description comes from README first paragraph');

    // registry was written under the isolated HOME, not the real one
    assert.ok(fs.existsSync(hub.registryFile), 'registry persisted under isolated HOME');

    // GET list shows it exactly once
    const list = await hub.request('GET', '/api/projects');
    assert.equal(list.status, 200);
    assert.equal(list.json.projects.length, 1, 'listed exactly once');
    assert.equal(list.json.projects[0].id, id);

    // GET :id returns the profile
    const got = await hub.request('GET', `/api/projects/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.project.id, id);
    assert.ok(got.json.profile, 'profile returned on GET :id');
    assert.equal(got.json.profile.title, 'lifecycle-fixture');

    // DELETE :id with the guard header → 200
    const del = await hub.request('DELETE', `/api/projects/${id}`, { headers: WRITE });
    assert.equal(del.status, 200);
    assert.equal(del.json.removed, true);

    // GET list no longer contains it
    const after = await hub.request('GET', '/api/projects');
    assert.equal(after.status, 200);
    assert.equal(after.json.projects.length, 0, 'delisted after delete');

    // the project's files on disk are untouched
    assert.ok(fs.existsSync(project), 'project directory still exists');
    assert.equal(fs.readFileSync(marker, 'utf8'), 'user data must survive', 'marker file preserved');
  } finally {
    hub.stop();
    rmrf(project);
  }
});

// ---------------------------------------------------------------------------
// 2. Idempotent connect: same folder twice → same id, single list entry.
// ---------------------------------------------------------------------------
test('idempotent connect: same folder twice yields one entry and a stable id', async () => {
  const hub = await startHub();
  const project = makeProject({
    name: 'idempotent-fixture',
    readmeFirstParagraph: 'Connecting this folder twice must not create a duplicate.',
  });
  try {
    const first = await hub.request('POST', '/api/projects/connect', { headers: WRITE, body: { path: project } });
    const second = await hub.request('POST', '/api/projects/connect', { headers: WRITE, body: { path: project } });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.json.created, true, 'first connect creates');
    assert.equal(second.json.created, false, 'second connect does not re-create');
    assert.equal(first.json.project.id, second.json.project.id, 'stable id across connects');

    const list = await hub.request('GET', '/api/projects');
    assert.equal(list.json.projects.length, 1, 'a single list entry for the same folder');
  } finally {
    hub.stop();
    rmrf(project);
  }
});

// ---------------------------------------------------------------------------
// 3. Security: write guard, id validation, path traversal, symlink containment.
// ---------------------------------------------------------------------------
test('security: POST connect without X-AIDT is refused (403)', async () => {
  const hub = await startHub();
  const project = makeProject({ name: 'noheader', readmeFirstParagraph: 'Connect must be guarded.' });
  try {
    const res = await hub.request('POST', '/api/projects/connect', { body: { path: project } });
    assert.equal(res.status, 403, 'connect without the CSRF header is rejected');
    assert.equal(res.json.ok, false);

    // and nothing was registered
    const list = await hub.request('GET', '/api/projects');
    assert.equal(list.json.projects.length, 0, 'no project registered by the refused write');
  } finally {
    hub.stop();
    rmrf(project);
  }
});

test('security: DELETE without X-AIDT is refused (403) and the entry remains', async () => {
  const hub = await startHub();
  const project = makeProject({ name: 'delguard', readmeFirstParagraph: 'Delete must be guarded.' });
  try {
    const created = await hub.request('POST', '/api/projects/connect', { headers: WRITE, body: { path: project } });
    const id = created.json.project.id;

    const del = await hub.request('DELETE', `/api/projects/${id}`);
    assert.equal(del.status, 403, 'delete without the CSRF header is rejected');

    const list = await hub.request('GET', '/api/projects');
    assert.equal(list.json.projects.length, 1, 'entry still present after refused delete');
  } finally {
    hub.stop();
    rmrf(project);
  }
});

test('security: traversal :id and non-hex :id both 404 without reading any outside file', async () => {
  const hub = await startHub();
  try {
    // url-encoded ../../etc/passwd in the :id segment
    const traversal = await hub.request('GET', '/api/projects/..%2f..%2f..%2fetc%2fpasswd');
    assert.equal(traversal.status, 404, 'traversal id is 404');
    assert.ok(!/root:.*:0:0:/.test(traversal.text), 'response carries no /etc/passwd content');
    assert.equal(traversal.json && traversal.json.ok, false);

    // a syntactically invalid (non-hex) id
    const nonHex = await hub.request('GET', '/api/projects/not-a-hex-id');
    assert.equal(nonHex.status, 404, 'non-hex id is 404');

    // a well-formed but unknown 12-hex id
    const unknown = await hub.request('GET', '/api/projects/aaaaaaaaaaaa');
    assert.equal(unknown.status, 404, 'unknown 12-hex id is 404');
  } finally {
    hub.stop();
  }
});

test('security: a symlink to a file outside the project is not read into the profile', async () => {
  const hub = await startHub();
  // build a project whose only "README"-ish content lives behind a symlink that
  // points outside the project root; analysis must refuse to follow it.
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-e2e-symlink-')));
  const outsideContent = `SENTINEL-OUTSIDE-${Date.now()}-secret`;
  const outsideFile = path.join(os.tmpdir(), `aidt-e2e-outside-${process.pid}-${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(outsideFile, outsideContent);
  try {
    // package.json gives a benign title; the README is a symlink to the outside file
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'symlink-fixture' }));
    fs.symlinkSync(outsideFile, path.join(project, 'README.md'));
    // also symlink a real system file, to mirror the "symlink to /etc/hostname" case
    let hostname = '';
    try { hostname = fs.readFileSync('/etc/hostname', 'utf8').trim(); } catch { /* not present */ }
    if (hostname) {
      try { fs.symlinkSync('/etc/hostname', path.join(project, 'HOSTLINK')); } catch { /* best effort */ }
    }

    const connect = await hub.request('POST', '/api/projects/connect', { headers: WRITE, body: { path: project } });
    assert.equal(connect.status, 200, 'connect still succeeds with a confined analysis');
    const profile = connect.json.profile;
    assert.ok(profile, 'profile returned');

    const blob = JSON.stringify(profile) + '\n' + connect.text;
    assert.ok(!blob.includes(outsideContent), 'symlinked outside-file content must not leak into the profile');
    if (hostname) {
      assert.ok(!blob.includes(hostname), 'symlinked /etc/hostname content must not leak into the profile');
    }
    // the title from package.json still resolves (proves analysis ran, just confined)
    assert.equal(profile.title, 'symlink-fixture');
  } finally {
    hub.stop();
    rmrf(project);
    rmrf(outsideFile);
  }
});

// ---------------------------------------------------------------------------
// 3b. Bad input: missing / empty / relative / non-existent / NUL → 400, no 500/hang.
// ---------------------------------------------------------------------------
test('bad input: missing, empty, relative, NUL, and non-existent paths all return 400', async () => {
  const hub = await startHub();
  try {
    const nulPath = '/tmp/aidt' + String.fromCharCode(0) + 'evil';
    const cases = [
      ['missing path', {}],
      ['empty path', { path: '' }],
      ['relative path', { path: 'relative/dir' }],
      ['non-existent absolute path', { path: '/no/such/dir/aidt-e2e-xyz' }],
      ['path with embedded NUL', { path: nulPath }],
    ];
    for (const [label, body] of cases) {
      const res = await hub.request('POST', '/api/projects/connect', { headers: WRITE, body });
      assert.equal(res.status, 400, `${label} → 400`);
      assert.equal(res.json && res.json.ok, false, `${label} → ok:false`);
    }
  } finally {
    hub.stop();
  }
});

test('bad input: connecting a path that is a file (not a directory) returns 400', async () => {
  const hub = await startHub();
  const file = path.join(os.tmpdir(), `aidt-e2e-file-${process.pid}.txt`);
  fs.writeFileSync(file, 'i am a file, not a directory');
  try {
    const res = await hub.request('POST', '/api/projects/connect', { headers: WRITE, body: { path: file } });
    assert.equal(res.status, 400, 'a file path is rejected with 400');
    assert.equal(res.json.ok, false);
  } finally {
    hub.stop();
    rmrf(file);
  }
});
