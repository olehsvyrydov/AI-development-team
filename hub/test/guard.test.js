'use strict';
/* Tests for the loopback control-plane guard: because a loopback control plane
 * is reachable by any website the developer visits, every mutating request must
 * clear an anti-CSRF and anti-DNS-rebinding gauntlet. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeAllowed, streamAllowed } = require('../lib/guard');

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

// ---- streamAllowed: the SSE guard (no X-AIDT — EventSource cannot send it) -----

test('streamAllowed: a loopback EventSource WITHOUT X-AIDT is allowed', () => {
  // a real browser EventSource cannot set a custom header, so the stream guard
  // does NOT require X-AIDT — Host/Origin/socket loopback pinning is the control
  assert.equal(streamAllowed(req({ xaidt: null }), { port: PORT, allowRemote: false }).ok, true);
});

test('streamAllowed: a foreign Host is refused (anti-DNS-rebinding)', () => {
  const r = streamAllowed(req({ host: 'evil.example.com', xaidt: null }), { port: PORT, allowRemote: false });
  assert.equal(r.ok, false);
  assert.equal(r.code, 403);
});

test('streamAllowed: a cross-site Origin is refused (anti-cross-site EventSource)', () => {
  const r = streamAllowed(req({ origin: 'https://evil.example.com', xaidt: null }), { port: PORT, allowRemote: false });
  assert.equal(r.ok, false);
  assert.equal(r.code, 403);
});

test('streamAllowed: a non-loopback socket is refused unless remote is enabled', () => {
  const remote = req({ remote: '192.168.1.50', xaidt: null });
  assert.equal(streamAllowed(remote, { port: PORT, allowRemote: false }).ok, false);
  assert.equal(streamAllowed(remote, { port: PORT, allowRemote: true }).ok, true);
});
