'use strict';
/* TDD for ADT-206 SECURITY (Soren C3): a loopback control plane is reachable by
 * any website the developer visits, so every mutating request must clear an
 * anti-CSRF + anti-DNS-rebinding gauntlet. Written before impl (Red). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeAllowed } = require('../lib/guard');

const PORT = 4477;
// a minimal mock of the bits of an http req the guard inspects
function req({ host = `127.0.0.1:${PORT}`, origin, xaidt = '1', remote = '127.0.0.1' } = {}) {
  const headers = { host };
  if (origin !== undefined) headers.origin = origin;
  if (xaidt != null) headers['x-aidt'] = xaidt; // pass xaidt:null to omit the header
  return { headers, socket: { remoteAddress: remote } };
}

test('a well-formed loopback request with the custom header is allowed', () => {
  assert.equal(writeAllowed(req(), { port: PORT, allowRemote: false }).ok, true);
});

test('missing X-AIDT header is refused (blocks cross-site simple POST)', () => {
  const r = writeAllowed(req({ xaidt: null }), { port: PORT, allowRemote: false });
  assert.equal(r.ok, false);
  assert.equal(r.code, 403);
});

test('a foreign Host header is refused (anti-DNS-rebinding)', () => {
  const r = writeAllowed(req({ host: 'evil.example.com' }), { port: PORT, allowRemote: false });
  assert.equal(r.ok, false);
  assert.equal(r.code, 403);
});

test('a cross-site Origin is refused even on loopback', () => {
  const r = writeAllowed(req({ origin: 'https://evil.example.com' }), { port: PORT, allowRemote: false });
  assert.equal(r.ok, false);
  assert.equal(r.code, 403);
});

test('a same-origin loopback Origin is allowed', () => {
  assert.equal(writeAllowed(req({ origin: `http://127.0.0.1:${PORT}` }), { port: PORT, allowRemote: false }).ok, true);
  assert.equal(writeAllowed(req({ origin: `http://localhost:${PORT}` }), { port: PORT, allowRemote: false }).ok, true);
});

test('a non-loopback socket is refused unless remote writes are explicitly enabled', () => {
  const remote = req({ host: `127.0.0.1:${PORT}`, remote: '192.168.1.50' });
  assert.equal(writeAllowed(remote, { port: PORT, allowRemote: false }).ok, false);
  // with --allow-remote-writes, a remote socket may pass the socket check
  assert.equal(writeAllowed(remote, { port: PORT, allowRemote: true }).ok, true);
});

test('localhost Host with no Origin (curl) is allowed on loopback', () => {
  assert.equal(writeAllowed(req({ host: `localhost:${PORT}`, origin: undefined }), { port: PORT, allowRemote: false }).ok, true);
});
