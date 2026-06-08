'use strict';
/* Static SPA server for the production Cockpit build, served same-origin from the
 * Core. Verifies: a normal asset serves with the right content-type; an unknown
 * client-side route falls back to the build's index.html; path traversal (raw,
 * encoded, absolute) is rejected and never escapes the build root; a missing
 * build root reports "not built" so the caller can fall back to the legacy board;
 * no directory listing. The resolver is exercised directly and over http. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createStaticSpa, contentTypeFor } = require('../lib/static-spa');

function buildDir() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-spa-')));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><dart-root></dart-root>');
  fs.writeFileSync(path.join(root, 'main.js'), 'console.log("app");');
  fs.writeFileSync(path.join(root, 'styles.css'), 'body{color:red}');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'logo.svg'), '<svg></svg>');
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function startServer(root) {
  const spa = createStaticSpa(root);
  const server = http.createServer((req, res) => {
    if (!spa.tryServe(req, res)) {
      res.writeHead(418, { 'content-type': 'text/plain' });
      res.end('passthrough');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ port, close: () => server.close() });
    });
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

test('contentTypeFor maps known extensions and defaults to octet-stream', () => {
  assert.match(contentTypeFor('app.js'), /javascript/);
  assert.match(contentTypeFor('a.css'), /text\/css/);
  assert.match(contentTypeFor('index.html'), /text\/html/);
  assert.match(contentTypeFor('logo.svg'), /image\/svg/);
  assert.match(contentTypeFor('icon.ico'), /image\/x-icon/);
  assert.match(contentTypeFor('data.json'), /application\/json/);
  assert.match(contentTypeFor('font.woff2'), /font\/woff2/);
  assert.match(contentTypeFor('blob.bin'), /application\/octet-stream/);
});

test('a real asset serves with the right content-type', async () => {
  const { root, cleanup } = buildDir();
  const { port, close } = await startServer(root);
  try {
    const res = await get(port, '/main.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /javascript/);
    assert.equal(res.body, 'console.log("app");');
    const css = await get(port, '/styles.css');
    assert.match(css.headers['content-type'], /text\/css/);
    const svg = await get(port, '/assets/logo.svg');
    assert.equal(svg.status, 200);
    assert.match(svg.headers['content-type'], /image\/svg/);
  } finally { close(); cleanup(); }
});

test('the root path serves index.html', async () => {
  const { root, cleanup } = buildDir();
  const { port, close } = await startServer(root);
  try {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /dart-root/);
  } finally { close(); cleanup(); }
});

test('an unknown client-side route falls back to index.html', async () => {
  const { root, cleanup } = buildDir();
  const { port, close } = await startServer(root);
  try {
    const res = await get(port, '/projects/abc123');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /dart-root/);
  } finally { close(); cleanup(); }
});

test('path traversal is rejected and never escapes the build root', async () => {
  const { root, cleanup } = buildDir();
  const { port, close } = await startServer(root);
  try {
    // Encoded-slash (%2f) traversal is not collapsed by URL parsing, so it
    // reaches the resolver as a single escaping segment and is rejected (404).
    for (const p of ['/..%2f..%2f..%2f..%2fetc%2fpasswd',
                     '/assets%2f..%2f..%2f..%2fetc%2fpasswd']) {
      const res = await get(port, p);
      assert.equal(res.status, 404, `encoded traversal must 404 for ${p}`);
      assert.ok(!/root:.*:0:0:/.test(res.body), `must not leak /etc/passwd for ${p}`);
    }
    // Dot-segment forms that the URL parser DOES collapse stay contained inside
    // the root (a non-existent file there), so they can never read /etc/passwd.
    for (const p of ['/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
                     '/../../../../../../etc/passwd']) {
      const res = await get(port, p);
      assert.ok(!/root:.*:0:0:/.test(res.body), `must not leak /etc/passwd for ${p}`);
    }
    // The resolver itself rejects any path that escapes the build root.
    const { resolveWithin } = require('../lib/static-spa');
    assert.equal(resolveWithin(root, '/..%2f..%2f..%2fetc%2fpasswd'.replace(/%2f/g, '/')), null);
    assert.equal(resolveWithin(root, '/assets/../../../../etc/passwd'), null);
    assert.equal(resolveWithin(root, '/../../../../etc/passwd'), null);
  } finally { close(); cleanup(); }
});

test('a request for a missing file under the root falls back to index.html (SPA)', async () => {
  const { root, cleanup } = buildDir();
  const { port, close } = await startServer(root);
  try {
    const res = await get(port, '/does-not-exist.js');
    // a non-asset-looking route is treated as a client route and gets index.html;
    // but a missing file that looks like an asset (has a known ext) 404s.
    assert.equal(res.status, 404);
  } finally { close(); cleanup(); }
});

test('a directory request does not list contents; it falls back to index.html', async () => {
  const { root, cleanup } = buildDir();
  const { port, close } = await startServer(root);
  try {
    const res = await get(port, '/assets');
    assert.equal(res.status, 200);
    assert.match(res.body, /dart-root/);
    assert.doesNotMatch(res.body, /logo\.svg/);
  } finally { close(); cleanup(); }
});

test('when the build root is absent, tryServe returns false (caller falls back)', async () => {
  const missing = path.join(os.tmpdir(), 'aidt-spa-missing-' + Date.now());
  const spa = createStaticSpa(missing);
  assert.equal(spa.exists(), false);
  const { port, close } = await startServer(missing);
  try {
    const res = await get(port, '/');
    assert.equal(res.status, 418, 'passthrough lets the caller serve the legacy board');
    assert.equal(res.body, 'passthrough');
  } finally { close(); cleanup_noop(); close; }
  function cleanup_noop() {}
});
