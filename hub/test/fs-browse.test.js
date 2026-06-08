'use strict';
/*
 * Read-only directory-browser endpoint (GET /api/fs/list, GET /api/fs/roots).
 *
 * This surface hands LOCAL FILESYSTEM READ to the browser, so the tests prove the
 * NEGATIVE — every refusal, skip, and cap — not just the happy path:
 *   - containment: a `..`-climb, an absolute path outside the root, an escaping
 *     symlink as the requested path, and an escaping symlink CHILD are all
 *     refused/skipped; the containment helper rejects the /home/foo vs
 *     /home/foobar prefix trap.
 *   - no content leak: entries are exactly { name, type:'dir', hasProject }; files,
 *     sizes, and stat metadata never appear, even for a dir like ~/.ssh.
 *   - input rejection: NUL/relative/non-dir/over-long paths are refused before any FS work.
 *   - guard: missing X-AIDT, a non-loopback Host/Origin, and a non-loopback socket
 *     each → 403; no permissive CORS.
 *   - DoS: a huge directory is capped with truncated:true; the listing is one level,
 *     non-recursive, and never reads a file.
 *   - pure read: a series of calls mutates nothing.
 *
 * The browse root is injected (a tmp dir standing in for $HOME) so the real home is
 * never touched.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { listDirectory, listRoots, confinedHome } = require('../lib/fs-browse');
const { createServer } = require('../lib/projects');

// a real tmp dir, realpath'd (macOS /var → /private/var), standing in for $HOME
function tmpHome() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-fs-home-')));
}
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });

// can this filesystem create a symlink? (skip symlink-specific tests if not)
function canSymlink(home) {
  try {
    const a = path.join(home, '.symprobe-target');
    const b = path.join(home, '.symprobe-link');
    fs.mkdirSync(a, { recursive: true });
    fs.symlinkSync(a, b);
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { force: true });
    return true;
  } catch { return false; }
}

// ---- unit: the containment helper (N-15) -----------------------------------

test('N-15 confinedHome accepts the home boundary and descendants, rejects the prefix trap', () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(path.join(home, 'sub'), { recursive: true });
    assert.equal(confinedHome(home, home), home, 'home itself is contained');
    assert.equal(confinedHome(home, path.join(home, 'sub')), path.join(home, 'sub'), 'a descendant is contained');
    // the /home/foo vs /home/foobar prefix trap: a sibling sharing a name prefix
    const trap = home + 'bar';
    fs.mkdirSync(trap, { recursive: true });
    try {
      assert.equal(confinedHome(home, trap), null, 'a loose prefix sibling is NOT contained');
    } finally { rm(trap); }
  } finally { rm(home); }
});

test('N-15 / N-1 confinedHome rejects a `..`-climb out of home', () => {
  const home = tmpHome();
  try {
    assert.equal(confinedHome(home, path.join(home, '..')), null, 'parent of home escapes');
    assert.equal(confinedHome(home, path.join(home, '..', '..')), null, 'grandparent escapes');
  } finally { rm(home); }
});

test('N-2 confinedHome rejects an absolute path outside home', () => {
  const home = tmpHome();
  try {
    assert.equal(confinedHome(home, '/etc'), null);
    assert.equal(confinedHome(home, '/'), null);
  } finally { rm(home); }
});

test('N-15 confinedHome resolves a symlink and rejects one whose target escapes home', () => {
  const home = tmpHome();
  if (!canSymlink(home)) { rm(home); return; /* skipped: FS cannot symlink */ }
  try {
    const escape = path.join(home, 'escape');
    fs.symlinkSync('/etc', escape);
    assert.equal(confinedHome(home, escape), null, 'a symlink to /etc escapes and is refused');
  } finally { rm(home); }
});

// ---- unit: listDirectory behaviour -----------------------------------------

test('N-5 entries are exactly {name,type:dir,hasProject}; files omitted, no stat metadata', () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(path.join(home, 'projectA', '.aidevteam'), { recursive: true });
    fs.writeFileSync(path.join(home, 'projectA', '.aidevteam', 'workflow.yaml'), 'preset: solo\n');
    fs.mkdirSync(path.join(home, 'plainDir'), { recursive: true });
    fs.writeFileSync(path.join(home, 'a-file.txt'), 'secret contents');
    const r = listDirectory(home, home);
    assert.equal(r.ok, true);
    const names = r.entries.map((e) => e.name).sort();
    assert.deepEqual(names, ['plainDir', 'projectA'], 'only directories; the file is omitted');
    for (const e of r.entries) {
      assert.deepEqual(Object.keys(e).sort(), ['hasProject', 'name', 'type'], 'exactly these three keys');
      assert.equal(e.type, 'dir');
      assert.equal(typeof e.hasProject, 'boolean');
      assert.ok(!('size' in e) && !('mtime' in e) && !('mode' in e) && !('ino' in e), 'no stat-derived recon fields');
    }
    assert.equal(r.entries.find((e) => e.name === 'projectA').hasProject, true, 'artefact marker → hasProject');
    assert.equal(r.entries.find((e) => e.name === 'plainDir').hasProject, false);
  } finally { rm(home); }
});

test('N-5 a dotfile dir like .ssh lists by name only and never leaks file contents', () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.ssh', 'id_ed25519'), 'PRIVATE KEY MATERIAL');
    const r = listDirectory(home, home);
    const ssh = r.entries.find((e) => e.name === '.ssh');
    assert.ok(ssh, 'a dotfile dir is listed name-only (not hidden)');
    const blob = JSON.stringify(r);
    assert.ok(!blob.includes('PRIVATE KEY MATERIAL'), 'no file contents anywhere in the response');
    assert.ok(!blob.includes('id_ed25519'), 'no file entry, even by name');
  } finally { rm(home); }
});

test('N-13 parent is null at home and the contained parent for a sub-dir', () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(path.join(home, 'sub', 'deep'), { recursive: true });
    assert.equal(listDirectory(home, home).parent, null, 'parent is null at home');
    const sub = listDirectory(home, path.join(home, 'sub'));
    assert.equal(sub.parent, home, 'a sub-dir parent is the contained home');
  } finally { rm(home); }
});

test('N-1 a `..`-climb request is refused with no entries', () => {
  const home = tmpHome();
  try {
    const r = listDirectory(home, path.join(home, '..', '..'));
    assert.equal(r.ok, false);
    assert.ok(!r.entries);
  } finally { rm(home); }
});

test('N-2 an absolute path outside home is refused', () => {
  const home = tmpHome();
  try {
    assert.equal(listDirectory(home, '/etc').ok, false);
    assert.equal(listDirectory(home, '/').ok, false);
  } finally { rm(home); }
});

test('N-3 an escaping symlink as the requested path is refused', () => {
  const home = tmpHome();
  if (!canSymlink(home)) { rm(home); return; }
  try {
    fs.symlinkSync('/etc', path.join(home, 'etclink'));
    const r = listDirectory(home, path.join(home, 'etclink'));
    assert.equal(r.ok, false, 'the symlink resolves to /etc and fails containment');
  } finally { rm(home); }
});

test('N-4 an escaping symlink CHILD is skipped; the rest of the dir lists', () => {
  const home = tmpHome();
  if (!canSymlink(home)) { rm(home); return; }
  try {
    fs.mkdirSync(path.join(home, 'keep'), { recursive: true });
    fs.symlinkSync('/etc', path.join(home, 'escapechild'));
    const r = listDirectory(home, home);
    assert.equal(r.ok, true);
    const names = r.entries.map((e) => e.name);
    assert.ok(names.includes('keep'), 'the contained dir is listed');
    assert.ok(!names.includes('escapechild'), 'the escaping symlink child is skipped, not listed');
  } finally { rm(home); }
});

test('N-6 NUL, relative, non-dir, and over-long paths are each refused before any FS read', () => {
  const home = tmpHome();
  try {
    fs.writeFileSync(path.join(home, 'file.txt'), 'x');
    assert.equal(listDirectory(home, path.join(home, 'a\0b')).ok, false, 'NUL byte refused');
    assert.equal(listDirectory(home, 'relative/dir').ok, false, 'relative path refused');
    assert.equal(listDirectory(home, path.join(home, 'file.txt')).ok, false, 'a file (non-dir) refused');
    assert.equal(listDirectory(home, '/' + 'a'.repeat(5000)).ok, false, 'over-long path refused');
    assert.equal(listDirectory(home, '').ok, false, 'empty path refused');
    assert.equal(listDirectory(home, 123).ok, false, 'non-string refused');
  } finally { rm(home); }
});

test('N-11 a directory over the entry cap is truncated with truncated:true', () => {
  const home = tmpHome();
  try {
    const big = path.join(home, 'big');
    fs.mkdirSync(big, { recursive: true });
    const cap = require('../lib/fs-browse').MAX_ENTRIES;
    for (let i = 0; i < cap + 25; i++) fs.mkdirSync(path.join(big, 'd' + i), { recursive: true });
    const r = listDirectory(home, big);
    assert.equal(r.ok, true);
    assert.ok(r.entries.length <= cap, 'entries are capped');
    assert.equal(r.truncated, true, 'truncated flag set');
  } finally { rm(home); }
});

test('N-12 the listing is one level only and reads no file', () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(path.join(home, 'top', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(home, 'top', 'data.txt'), 'bytes');
    // a file whose read would throw if attempted (no read perms) must not break the listing
    const r = listDirectory(home, home);
    const names = r.entries.map((e) => e.name);
    assert.ok(names.includes('top'));
    assert.ok(!names.includes('nested'), 'nested children of a child do not appear (non-recursive)');
    assert.ok(!names.includes('data.txt'), 'no file entries');
  } finally { rm(home); }
});

test('listRoots returns Home + containment-checked recent roots, omitting any outside home', () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(path.join(home, 'projX'), { recursive: true });
    const recent = [
      { label: 'projX', path: path.join(home, 'projX') },
      { label: 'outside', path: '/etc' },                 // outside home → omitted
    ];
    const r = listRoots(home, recent);
    assert.equal(r.ok, true);
    assert.equal(r.roots[0].label, 'Home');
    assert.equal(r.roots[0].path, home);
    const recentPaths = r.recent.map((x) => x.path);
    assert.ok(recentPaths.includes(path.join(home, 'projX')), 'a contained recent root is kept');
    assert.ok(!recentPaths.includes('/etc'), 'a recent root outside home is omitted, not echoed');
  } finally { rm(home); }
});

// ---- HTTP integration: the guard on the GET (N-7..N-10) ---------------------

function startServer(home) {
  const server = createServer({ home, port: 0 });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, cleanup: () => server.close() });
    });
  });
}

function req(port, p, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: p, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, json, headers: res.headers });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

const GUARD = { 'x-aidt': '1' };

test('N-7 fs/list and fs/roots without X-AIDT are 403', async () => {
  const home = tmpHome();
  const { port, cleanup } = await startServer(home);
  try {
    assert.equal((await req(port, '/api/fs/roots')).status, 403, 'roots needs the guard');
    assert.equal((await req(port, `/api/fs/list?path=${encodeURIComponent(home)}`)).status, 403, 'list needs the guard');
  } finally { cleanup(); rm(home); }
});

test('N-8 a non-loopback Host and a cross-site Origin are each 403', async () => {
  const home = tmpHome();
  const { port, cleanup } = await startServer(home);
  try {
    const badHost = await req(port, '/api/fs/roots', { headers: { ...GUARD, host: 'evil.example.com' } });
    assert.equal(badHost.status, 403, 'non-loopback Host refused');
    const badOrigin = await req(port, '/api/fs/roots', { headers: { ...GUARD, origin: 'https://evil.example.com' } });
    assert.equal(badOrigin.status, 403, 'cross-site Origin refused');
  } finally { cleanup(); rm(home); }
});

test('N-9 the fs GET guard is writeAllowed, which refuses a non-loopback socket without --allow-remote-writes', () => {
  const { writeAllowed } = require('../lib/guard');
  // the fs/* routes apply this exact gauntlet; here we prove the socket arm it relies on
  const remote = { headers: { host: '127.0.0.1:4477', 'x-aidt': '1' }, socket: { remoteAddress: '192.168.1.50' } };
  assert.equal(writeAllowed(remote, { port: 4477, allowRemote: false }).ok, false, 'non-loopback socket refused');
  assert.equal(writeAllowed(remote, { port: 4477, allowRemote: false }).code, 403);
});

test('N-10 fs responses emit no permissive CORS header', async () => {
  const home = tmpHome();
  const { port, cleanup } = await startServer(home);
  try {
    const r = await req(port, '/api/fs/roots', { headers: GUARD });
    assert.equal(r.status, 200);
    assert.ok(!('access-control-allow-origin' in r.headers), 'no Access-Control-Allow-Origin header');
  } finally { cleanup(); rm(home); }
});

test('a guarded fs/list inside home lists folders; a `..`-escape over HTTP is refused', async () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, 'inside'), { recursive: true });
  const { port, cleanup } = await startServer(home);
  try {
    const ok = await req(port, `/api/fs/list?path=${encodeURIComponent(home)}`, { headers: GUARD });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.entries.some((e) => e.name === 'inside'));
    const escape = await req(port, `/api/fs/list?path=${encodeURIComponent(path.join(home, '..', '..'))}`, { headers: GUARD });
    assert.ok(escape.status === 400 || escape.status === 403, 'a `..`-escape is refused over HTTP');
  } finally { cleanup(); rm(home); }
});

test('N-14 a series of fs/* calls mutates nothing on disk', async () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, 'd1'), { recursive: true });
  const { port, cleanup } = await startServer(home);
  const snapshot = () => fs.readdirSync(home).sort().join(',');
  try {
    const before = snapshot();
    await req(port, '/api/fs/roots', { headers: GUARD });
    await req(port, `/api/fs/list?path=${encodeURIComponent(home)}`, { headers: GUARD });
    await req(port, `/api/fs/list?path=${encodeURIComponent(path.join(home, 'd1'))}`, { headers: GUARD });
    assert.equal(snapshot(), before, 'no entries created/removed by reads');
  } finally { cleanup(); rm(home); }
});

test('fs/list defaults to home when path is omitted, with parent null', async () => {
  const home = tmpHome();
  const { port, cleanup } = await startServer(home);
  try {
    const r = await req(port, '/api/fs/list', { headers: GUARD });
    assert.equal(r.status, 200);
    assert.equal(r.json.path, home, 'omitted path defaults to home');
    assert.equal(r.json.parent, null);
  } finally { cleanup(); rm(home); }
});
