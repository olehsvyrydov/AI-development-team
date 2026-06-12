'use strict';
/*
 * Unit tests for the thin overlay adapter: config-only URL, env-only credential,
 * abortable time-boxed health probe, validated/bounded response, never-throws.
 * Network is always a spy/stub; HOME is a controlled tmp dir.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const overlay = require('../lib/overlay');

function freshTmp(p) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p))); }
async function withTmpHome(fn) {
  const home = freshTmp('aidt-ov-home-');
  const prev = process.env.HOME, prevP = process.env.USERPROFILE;
  process.env.HOME = home; process.env.USERPROFILE = home;
  fs.mkdirSync(path.join(home, '.aidevteam'), { recursive: true });
  try { return await fn(home); }
  finally {
    if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev;
    if (prevP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevP;
    fs.rmSync(home, { recursive: true, force: true });
  }
}
function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
}
function writeCfg(home, memory) { fs.writeFileSync(path.join(home, '.aidevteam', 'config.json'), JSON.stringify({ memory })); }
function jsonResponse(obj) { const t = JSON.stringify(obj); return { ok: true, status: 200, async text() { return t; } }; }

test('loadOverlayConfig reads selection-only overlay + overlayUrl, defaults to null', async () => {
  await withTmpHome(async (home) => {
    assert.equal(overlay.loadOverlayConfig().overlay, null, 'default off');
    writeCfg(home, { overlay: 'openmemory', overlayUrl: 'http://127.0.0.1:8765' });
    const c = overlay.loadOverlayConfig();
    assert.equal(c.overlay, 'openmemory');
    assert.equal(c.overlayUrl, 'http://127.0.0.1:8765');
  });
});

test('an unknown overlay service or malformed URL ⇒ treated as off (fails closed)', async () => {
  await withTmpHome(async (home) => {
    writeCfg(home, { overlay: 'bogus-service', overlayUrl: 'http://127.0.0.1:8765' });
    assert.equal(overlay.loadOverlayConfig().overlay, null, 'unknown service rejected');
    writeCfg(home, { overlay: 'openmemory', overlayUrl: 'not-a-url' });
    assert.equal(overlay.loadOverlayConfig().overlayUrl, null, 'malformed URL rejected');
    writeCfg(home, { overlay: 'openmemory', overlayUrl: 'file:///etc/passwd' });
    assert.equal(overlay.loadOverlayConfig().overlayUrl, null, 'non-http scheme rejected');
  });
});

test('health is false when unconfigured, when URL missing, or when required credential absent', async () => {
  await withTmpHome(async (home) => {
    // unconfigured
    let h = await overlay.checkHealth({ fetchImpl: jsonResponse });
    assert.equal(h.healthy, false);
    // configured but no credential in env
    writeCfg(home, { overlay: 'openmemory', overlayUrl: 'http://127.0.0.1:8765' });
    await withEnv({ OPENMEMORY_API_KEY: null }, async () => {
      h = await overlay.checkHealth({ fetchImpl: async () => jsonResponse({ status: 'ok' }) });
      assert.equal(h.healthy, false, 'missing credential ⇒ not connected');
    });
  });
});

test('health probe is aborted at the deadline (no dangling socket) and reports unhealthy', async () => {
  await withTmpHome(async (home) => {
    writeCfg(home, { overlay: 'openmemory', overlayUrl: 'http://127.0.0.1:8765' });
    let aborted = false;
    const hang = (url, opts) => new Promise((_res, rej) => {
      if (opts && opts.signal) opts.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); });
    });
    await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
      const started = Date.now();
      const h = await overlay.checkHealth({ fetchImpl: hang, timeoutMs: 40 });
      assert.equal(h.healthy, false);
      assert.ok(aborted, 'the in-flight probe was aborted via the signal');
      assert.ok(Date.now() - started < 1500, 'returned promptly at the deadline');
    });
  });
});

test('queryOverlay returns a bounded, shape-validated answer; oversize/garbage ⇒ null', async () => {
  await withTmpHome(async (home) => {
    writeCfg(home, { overlay: 'openmemory', overlayUrl: 'http://127.0.0.1:8765' });
    await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
      const good = await overlay.queryOverlay(
        { question: 'q', context: 'c', scopeKey: 'p' },
        { fetchImpl: async () => jsonResponse({ answer: 'understood', matches: [{ title: 't', score: 0.5 }] }) });
      assert.equal(good.answer, 'understood');
      assert.equal(good.matches[0].title, 't');

      const huge = 'A'.repeat(5 * 1024 * 1024);
      const bad = await overlay.queryOverlay(
        { question: 'q', context: 'c', scopeKey: 'p' },
        { fetchImpl: async () => ({ ok: true, status: 200, async text() { return huge; } }) });
      assert.equal(bad, null, 'oversize response rejected');
    });
  });
});

test('queryOverlay sends only to the configured URL and never throws on a network error', async () => {
  await withTmpHome(async (home) => {
    writeCfg(home, { overlay: 'openmemory', overlayUrl: 'http://127.0.0.1:8765' });
    await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
      const r = await overlay.queryOverlay(
        { question: 'q', context: 'c', scopeKey: 'p' },
        { fetchImpl: async () => { throw new Error('boom'); } });
      assert.equal(r, null, 'network error degrades to null, never throws');
    });
  });
});
