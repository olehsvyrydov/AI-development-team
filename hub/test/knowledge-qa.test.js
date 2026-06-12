'use strict';
/*
 * Tests for the read-only interpretation-check Q&A (`knowledge/ask`) and the thin
 * mem0/OpenMemory overlay adapter.
 *
 * The egress negatives SPY the actual outbound network primitive (the injected
 * fetch) and snapshot on-disk state, asserting *no call occurred / the captured
 * body excludes X / no secret is present / bytes are unchanged* — never merely a
 * status code. No test ever makes a real outbound call: fetch is always a spy/stub
 * and HOME is a controlled tmp dir.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const w = require('../lib/write');
const qa = require('../lib/knowledge-qa');
const overlay = require('../lib/overlay');

const OVERLAY_URL = 'http://127.0.0.1:8765';

function freshTmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}
function tmpProject(stack) {
  const dir = freshTmp('aidt-qa-proj-');
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  if (stack) fs.writeFileSync(path.join(dir, '.aidevteam', 'config.json'), JSON.stringify({ knowledge: { stack } }));
  return dir;
}
async function withTmpHome(fn) {
  const home = freshTmp('aidt-qa-home-');
  const prev = process.env.HOME, prevP = process.env.USERPROFILE;
  process.env.HOME = home; process.env.USERPROFILE = home;
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
  try { return fn(); }
  finally { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
}

// A fetch spy: records every call; resolves to a caller-supplied response.
function spyFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: String(url), opts: opts || {} });
    if (typeof handler === 'function') return handler(url, opts, calls.length);
    return jsonResponse({ answer: 'ok', matches: [] });
  };
  fn.calls = calls;
  return fn;
}
function jsonResponse(obj, { status = 200 } = {}) {
  const text = JSON.stringify(obj);
  return { ok: status >= 200 && status < 300, status, async text() { return text; }, async json() { return JSON.parse(text); } };
}

// Configure an enabled overlay in the tmp HOME config (selection-only; no secret).
function writeOverlayConfig(home, { overlay: ov = 'openmemory', overlayUrl = OVERLAY_URL, embeddings } = {}) {
  const memory = { overlay: ov, overlayUrl };
  if (embeddings) memory.embeddings = embeddings;
  fs.writeFileSync(path.join(home, '.aidevteam', 'config.json'), JSON.stringify({ memory }));
}
function ensureHomeAidt(home) { fs.mkdirSync(path.join(home, '.aidevteam'), { recursive: true }); }

// Snapshot every file under a dir as {relpath: bytes} for byte-identical assertions.
function snapshotTree(dir) {
  const out = {};
  const walk = (d, base) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      const rel = path.join(base, e.name);
      if (e.isDirectory()) walk(full, rel);
      else out[rel] = fs.readFileSync(full).toString('hex');
    }
  };
  walk(dir, '');
  return out;
}

// ===========================================================================
// Local lexical tier — always-on, scope-correct, honest label
// ===========================================================================

test('lexical tier answers from local docs with an honest filename/keyword label', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(dir, { title: 'Webhook Retry Policy', body: 'retries use exponential backoff', scope: 'project' });
      const spy = spyFetch();
      const res = await qa.ask(dir, 'what is the webhook retry policy?', { fetchImpl: spy });
      assert.equal(spy.calls.length, 0, 'no overlay configured ⇒ no outbound call');
      assert.equal(res.grounding.method, 'filename-only');
      assert.equal(res.grounding.external, false);
      assert.equal(res.egressDisclosed, false);
      assert.ok(res.matches.some((m) => m.name === 'webhook-retry-policy'), 'matching note surfaced');
      assert.match(res.answer, /webhook-retry-policy|Webhook Retry/i);
      assert.match(res.grounding.label || '', /filename|keyword|no embedder/i);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('honest absence when no note matches', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(dir, { title: 'Webhook Retry Policy', body: 'backoff', scope: 'project' });
      const spy = spyFetch();
      const res = await qa.ask(dir, 'how do I configure kafka partitioning?', { fetchImpl: spy });
      assert.equal(spy.calls.length, 0);
      assert.equal(res.grounding.method, 'none');
      assert.equal(res.matches.length, 0);
      assert.match(res.answer, /no note|nothing|don't have|do not have/i);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-301 — the headline: no overlay ⇒ ZERO outbound network primitive invocations
// ===========================================================================

test('N-301 no overlay configured ⇒ zero outbound socket/fetch across many questions', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(dir, { title: 'Topic One', body: 'alpha', scope: 'project' });
      const spy = spyFetch();
      for (const q of ['topic one', 'alpha', 'nonexistent', 'webhook', 'one']) {
        const res = await qa.ask(dir, q, { fetchImpl: spy });
        assert.equal(res.egressDisclosed, false);
      }
      assert.equal(spy.calls.length, 0, 'no overlay ⇒ the network primitive is never invoked');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// Overlay tier — egress only when enabled + healthy
// ===========================================================================

test('overlay enabled + healthy + credential present ⇒ answer labelled external, egress disclosed', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlay: 'openmemory', overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Caching Strategy', body: 'lru', scope: 'project' });
      const spy = spyFetch((url) => {
        if (String(url).endsWith('/health')) return jsonResponse({ status: 'ok' });
        return jsonResponse({ answer: 'I understood caching as an LRU policy', matches: [{ title: 'Caching Strategy', score: 0.9 }] });
      });
      await withEnv({ OPENMEMORY_API_KEY: 'secret-token-xyz' }, async () => {
        const res = await qa.ask(dir, 'how was caching understood?', { fetchImpl: spy });
        assert.equal(res.grounding.method, 'overlay');
        assert.equal(res.grounding.external, true);
        assert.equal(res.egressDisclosed, true);
        assert.match(res.grounding.source || '', /openmemory/i);
        assert.match(res.answer, /LRU|caching/i);
        assert.ok(spy.calls.length >= 1, 'a request was actually sent');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-302 / N-303 — no SSRF: URL only from config, never from content/response
// ===========================================================================

test('N-302 a URL in a note body is never used as the egress target', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Metadata Note', body: 'see http://169.254.169.254/latest/meta-data for details', scope: 'project' });
      const spy = spyFetch((url) => jsonResponse({ answer: 'ok', matches: [] }));
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        await qa.ask(dir, 'metadata note', { fetchImpl: spy });
        for (const c of spy.calls) {
          assert.ok(!c.url.includes('169.254.169.254'), 'never contacts a content-supplied host');
          assert.ok(c.url.startsWith(OVERLAY_URL), `egress only to configured URL, got ${c.url}`);
        }
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-303 a host/redirect URL in the overlay response causes no second egress to that host', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Note', body: 'x', scope: 'project' });
      const spy = spyFetch((url) => {
        if (String(url).endsWith('/health')) return jsonResponse({ status: 'ok' });
        return jsonResponse({ answer: 'follow http://evil.example/inner', matches: [{ title: 'http://evil.example/x', score: 0.5 }] });
      });
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        await qa.ask(dir, 'note', { fetchImpl: spy });
        for (const c of spy.calls) assert.ok(!c.url.includes('evil.example'), 'no second hop to a response-supplied host');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-304 / N-305 — credential env-only, never persisted; missing ⇒ not connected
// ===========================================================================

test('N-304 credential is read from env only and never written to config', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Note', body: 'x', scope: 'project' });
      const spy = spyFetch((url) => String(url).endsWith('/health') ? jsonResponse({ status: 'ok' }) : jsonResponse({ answer: 'ok', matches: [] }));
      await withEnv({ OPENMEMORY_API_KEY: 'TOP-SECRET-VALUE' }, async () => {
        await qa.ask(dir, 'note', { fetchImpl: spy });
        const cfgText = fs.readFileSync(path.join(home, '.aidevteam', 'config.json'), 'utf8');
        assert.ok(!cfgText.includes('TOP-SECRET-VALUE'), 'secret never persisted to config');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-305 missing credential ⇒ not connected, no egress, local answer, no secret echo', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlay: 'openmemory', overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Local Topic', body: 'present', scope: 'project' });
      const spy = spyFetch();
      await withEnv({ OPENMEMORY_API_KEY: null }, async () => {
        const res = await qa.ask(dir, 'local topic', { fetchImpl: spy });
        assert.equal(spy.calls.length, 0, 'no credential ⇒ overlay treated unhealthy ⇒ no egress');
        assert.equal(res.egressDisclosed, false);
        assert.notEqual(res.grounding.method, 'overlay');
        assert.ok(res.matches.some((m) => m.name === 'local-topic'));
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-306 / N-307 — egress only when enabled AND healthy; disabled ⇒ no egress
// ===========================================================================

test('N-306 unhealthy overlay (probe fails) ⇒ no question egress, local answer', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Local Topic', body: 'x', scope: 'project' });
      // health probe throws (unreachable); the question must NOT be sent
      let questionCalls = 0;
      const spy = spyFetch((url) => {
        if (String(url).endsWith('/health')) throw new Error('ECONNREFUSED');
        questionCalls++; return jsonResponse({ answer: 'should not happen', matches: [] });
      });
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        const res = await qa.ask(dir, 'local topic', { fetchImpl: spy });
        assert.equal(questionCalls, 0, 'unhealthy ⇒ the question is never sent');
        assert.notEqual(res.grounding.method, 'overlay');
        assert.equal(res.egressDisclosed, false);
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-307 overlay disabled (overlay=null) ⇒ no egress even with a URL present', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      fs.writeFileSync(path.join(home, '.aidevteam', 'config.json'),
        JSON.stringify({ memory: { overlay: null, overlayUrl: OVERLAY_URL } }));
      w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
      const spy = spyFetch();
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        const res = await qa.ask(dir, 'topic', { fetchImpl: spy });
        assert.equal(spy.calls.length, 0, 'disabled ⇒ zero outbound calls');
        assert.equal(res.egressDisclosed, false);
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-308 — egress to the configured URL only
// ===========================================================================

test('N-308 every outbound call targets exactly the configured overlayUrl host', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
      const spy = spyFetch((url) => String(url).endsWith('/health') ? jsonResponse({ status: 'ok' }) : jsonResponse({ answer: 'ok', matches: [] }));
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        await qa.ask(dir, 'topic', { fetchImpl: spy });
        assert.ok(spy.calls.length >= 1);
        for (const c of spy.calls) {
          const u = new URL(c.url);
          assert.equal(u.host, new URL(OVERLAY_URL).host, `unexpected host ${u.host}`);
        }
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-309 — truthful disclosure
// ===========================================================================

test('N-309 disclosure present iff a send happened; no absolute privacy claim once overlay on', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      // local-only answer ⇒ no disclosure
      writeOverlayConfig(home, { overlay: null, overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
      const spyOff = spyFetch();
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        const local = await qa.ask(dir, 'topic', { fetchImpl: spyOff });
        assert.equal(local.egressDisclosed, false);
        assert.ok(!/100%|nothing leaves|fully local|absolutely private/i.test(JSON.stringify(local)), 'no absolute privacy claim string');
      });
      // overlay on + healthy ⇒ disclosure true, names residency tier
      writeOverlayConfig(home, { overlay: 'openmemory', overlayUrl: OVERLAY_URL });
      const spyOn = spyFetch((url) => String(url).endsWith('/health') ? jsonResponse({ status: 'ok' }) : jsonResponse({ answer: 'ext', matches: [] }));
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        const ext = await qa.ask(dir, 'topic', { fetchImpl: spyOn });
        assert.equal(ext.egressDisclosed, true);
        assert.ok(ext.grounding.residency, 'residency tier named');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-310 / N-311 / N-312 — payload excludes out-of-scope, proposals, secrets/whole-vault
// ===========================================================================

test('N-310 egress payload excludes another project\'s project-scoped notes', async () => {
  const a = tmpProject(['node']);
  const b = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(a, { title: 'Alpha Topic', body: 'visible-to-a', scope: 'project' });
      w.addKbNote(b, { title: 'Bravo Secret Note', body: 'b-only-content', scope: 'project' });
      let body = null;
      const spy = spyFetch((url, opts) => {
        if (String(url).endsWith('/health')) return jsonResponse({ status: 'ok' });
        body = opts && opts.body ? String(opts.body) : '';
        return jsonResponse({ answer: 'ok', matches: [] });
      });
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        await qa.ask(a, 'alpha topic', { fetchImpl: spy });
        assert.ok(body != null, 'a request body was captured');
        assert.ok(!body.includes('Bravo Secret'), 'project B title absent from egress');
        assert.ok(!body.includes('b-only-content'), 'project B body absent from egress');
      });
    });
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test('N-311 egress payload excludes pending proposals', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      const proposals = require('../lib/proposals');
      proposals.propose({ title: 'Proposed Secret Idea', content: 'proposal-only-content', source: '/kai', why: 'x' });
      w.addKbNote(dir, { title: 'Real Topic', body: 'present', scope: 'project' });
      let body = null;
      const spy = spyFetch((url, opts) => {
        if (String(url).endsWith('/health')) return jsonResponse({ status: 'ok' });
        body = opts && opts.body ? String(opts.body) : '';
        return jsonResponse({ answer: 'ok', matches: [] });
      });
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        await qa.ask(dir, 'real topic', { fetchImpl: spy });
        assert.ok(body != null);
        assert.ok(!body.includes('Proposed Secret Idea'), 'proposal title absent from egress');
        assert.ok(!body.includes('proposal-only-content'), 'proposal content absent from egress');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-312 egress payload excludes the env secret and is not a whole-vault dump', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Match Topic', body: 'this body is long prose that should not be dumped wholesale into egress', scope: 'project' });
      w.addKbNote(dir, { title: 'Unrelated Note', body: 'totally different secret content xyzzy', scope: 'project' });
      let body = null;
      const spy = spyFetch((url, opts) => {
        if (String(url).endsWith('/health')) return jsonResponse({ status: 'ok' });
        body = opts && opts.body ? String(opts.body) : '';
        return jsonResponse({ answer: 'ok', matches: [] });
      });
      await withEnv({ OPENMEMORY_API_KEY: 'SECRET-XYZ' }, async () => {
        await qa.ask(dir, 'match topic', { fetchImpl: spy });
        assert.ok(body != null);
        assert.ok(!body.includes('SECRET-XYZ'), 'env secret absent from egress body');
        assert.ok(!body.includes('xyzzy'), 'unrelated note body not dumped into egress');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-313 / N-314 — read-only (vaults + proposals byte-identical), no overlay & with overlay
// ===========================================================================

test('N-313 read-only with no overlay: vaults + proposal store byte-identical after N questions', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
      require('../lib/proposals').propose({ title: 'P', content: 'c', source: '/kai', why: 'w' });
      const before = { proj: snapshotTree(dir), home: snapshotTree(path.join(home, '.aidevteam')) };
      const spy = spyFetch();
      for (const q of ['topic', 'nope', 'x']) await qa.ask(dir, q, { fetchImpl: spy });
      const after = { proj: snapshotTree(dir), home: snapshotTree(path.join(home, '.aidevteam')) };
      assert.deepEqual(after.proj, before.proj, 'project vault unchanged');
      assert.deepEqual(after.home, before.home, 'home (common vault + proposals) unchanged');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-314 read-only with a healthy overlay answering: nothing written, overlay answer not persisted', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
      const before = { proj: snapshotTree(dir), home: snapshotTree(path.join(home, '.aidevteam')) };
      const spy = spyFetch((url) => String(url).endsWith('/health') ? jsonResponse({ status: 'ok' }) : jsonResponse({ answer: 'OVERLAY-MEMORY-BLOB', matches: [{ title: 'X', score: 1 }] }));
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        await qa.ask(dir, 'topic', { fetchImpl: spy });
      });
      const after = { proj: snapshotTree(dir), home: snapshotTree(path.join(home, '.aidevteam')) };
      assert.deepEqual(after.proj, before.proj, 'project vault unchanged by an overlay answer');
      assert.deepEqual(after.home, before.home, 'home unchanged by an overlay answer');
      // and the overlay blob is nowhere on disk
      for (const tree of [after.proj, after.home]) {
        for (const hex of Object.values(tree)) {
          assert.ok(!Buffer.from(hex, 'hex').toString('utf8').includes('OVERLAY-MEMORY-BLOB'), 'overlay answer never written to disk');
        }
      }
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-315 / N-316 — untrusted content/overlay response is inert (carried raw, escaped by FE)
// ===========================================================================

test('N-315 a script payload in a note body is carried as inert data, never executed', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async () => {
      const payload = '<script>window.__pwned=1</script>';
      w.addKbNote(dir, { title: 'XSS Topic', body: `danger ${payload}`, scope: 'project' });
      globalThis.__pwned = undefined;
      const res = await qa.ask(dir, 'xss topic', { fetchImpl: spyFetch() });
      // the route returns data only; rendering/escaping is the FE's job. Assert it
      // never executed anything and the value is a plain string.
      assert.equal(globalThis.__pwned, undefined, 'note content never executed');
      assert.equal(typeof res.answer, 'string');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-316 a malicious overlay response is inert, bounded, never executed, never self-promoted', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
      globalThis.__pwned2 = undefined;
      const spy = spyFetch((url) => String(url).endsWith('/health')
        ? jsonResponse({ status: 'ok' })
        : jsonResponse({ answer: '<img src=x onerror=globalThis.__pwned2=1>', matches: [{ title: 'javascript:alert(1)', score: 1 }] }));
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        const res = await qa.ask(dir, 'topic', { fetchImpl: spy });
        assert.equal(globalThis.__pwned2, undefined, 'overlay response never executed');
        assert.equal(typeof res.answer, 'string');
        assert.equal(res.grounding.method, 'overlay', 'answer labelled the overlay\'s');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-317 / N-318 — hang ⇒ abort + fallback; garbage/oversize ⇒ abandon tier
// ===========================================================================

test('N-317 a hanging overlay is aborted at the deadline and the local tier answers promptly', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Local Topic', body: 'present', scope: 'project' });
      let aborted = false;
      const spy = (url, opts) => {
        if (String(url).endsWith('/health')) {
          // never resolves unless aborted
          return new Promise((_resolve, reject) => {
            if (opts && opts.signal) opts.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
          });
        }
        return jsonResponse({ answer: 'should not be reached', matches: [] });
      };
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        const started = Date.now();
        const res = await qa.ask(dir, 'local topic', { fetchImpl: spy, overlayTimeoutMs: 50 });
        assert.ok(Date.now() - started < 2000, 'returns promptly, not hung');
        assert.ok(aborted, 'the hung request was actively aborted (signal fired)');
        assert.notEqual(res.grounding.method, 'overlay');
        assert.ok(res.matches.some((m) => m.name === 'local-topic'), 'local fallback answered');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-318 garbage/oversize overlay response ⇒ abandon overlay tier, never throws', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: OVERLAY_URL });
      w.addKbNote(dir, { title: 'Local Topic', body: 'present', scope: 'project' });
      const huge = 'A'.repeat(5 * 1024 * 1024);
      const spy = spyFetch((url) => {
        if (String(url).endsWith('/health')) return jsonResponse({ status: 'ok' });
        return { ok: true, status: 200, async text() { return 'not-json-' + huge; }, async json() { throw new Error('bad json'); } };
      });
      await withEnv({ OPENMEMORY_API_KEY: 'k' }, async () => {
        const res = await qa.ask(dir, 'local topic', { fetchImpl: spy });
        assert.notEqual(res.grounding.method, 'overlay', 'malformed response abandons the overlay tier');
        assert.ok(res.matches.some((m) => m.name === 'local-topic'), 'local tier answered');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-319 — no info leak in errors
// ===========================================================================

test('N-319 a degraded answer never echoes the secret, the auth URL, an abs path, or a stack trace', async () => {
  const dir = tmpProject(['node']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      writeOverlayConfig(home, { overlayUrl: 'http://user:TOPSECRET@127.0.0.1:8765' });
      w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
      const spy = spyFetch((url) => { throw new Error(`connect ECONNREFUSED ${home}/private/path`); });
      await withEnv({ OPENMEMORY_API_KEY: 'TOPSECRET' }, async () => {
        const res = await qa.ask(dir, 'topic', { fetchImpl: spy });
        const blob = JSON.stringify(res);
        assert.ok(!blob.includes('TOPSECRET'), 'no secret/credential leaked');
        assert.ok(!blob.includes(home), 'no $HOME-rooted absolute path leaked');
        assert.ok(!/ECONNREFUSED|at Object|\.js:\d+/.test(blob), 'no stack trace leaked');
      });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// N-320 — manifest is not a key store
// ===========================================================================

test('N-320 the committed mem0/openmemory manifests carry no real key, only a name hint', () => {
  const root = path.resolve(__dirname, '..', '..', 'claude', 'workflow', 'adapters', 'mcp');
  for (const f of ['mem0.json', 'openmemory.json']) {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    const j = JSON.parse(txt);
    const env = j.mcpServers[Object.keys(j.mcpServers)[0]].env || {};
    for (const [k, v] of Object.entries(env)) {
      if (/KEY|TOKEN|SECRET/i.test(k)) {
        assert.ok(v === 'REPLACE_ME' || v === '' || v == null, `${f}: ${k} must be a placeholder, not a real key`);
      }
    }
  }
});

// ===========================================================================
// N-321 / N-322 — no cross-project/proposal read; scopeMatches single authority
// ===========================================================================

test('N-321 project A Q&A never surfaces project B notes or any proposal (local tier)', async () => {
  const a = tmpProject(['node']);
  const b = tmpProject(['node']);
  try {
    await withTmpHome(async () => {
      w.addKbNote(a, { title: 'Alpha Topic', body: 'a', scope: 'project' });
      w.addKbNote(b, { title: 'Alpha Topic', body: 'b-secret', scope: 'project' });
      require('../lib/proposals').propose({ title: 'Alpha Topic', content: 'proposal', source: '/kai', why: 'w' });
      const res = await qa.ask(a, 'alpha topic', { fetchImpl: spyFetch() });
      assert.ok(res.matches.every((m) => m.scope !== 'proposal'), 'no proposal surfaced');
      // only A's own note is matchable; B's same-named note lives in B's vault, never read
      assert.ok(res.matches.length >= 1);
      for (const m of res.matches) assert.equal(m.scope === 'project' ? true : m.scope === 'common', true);
    });
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test('N-322 the Q&A visible set equals buildKnowledge docs filtered by scopeMatches', async () => {
  const dir = tmpProject(['java']);
  try {
    await withTmpHome(async (home) => {
      ensureHomeAidt(home);
      // a common note for a DIFFERENT stack must be invisible to both the panel and the Q&A
      const commonDir = path.join(home, '.aidevteam', 'kb-common');
      fs.mkdirSync(commonDir, { recursive: true });
      fs.writeFileSync(path.join(commonDir, 'python-only.md'),
        '---\nscope: common\nstatus: approved-common\nstack: [python]\n---\npython note');
      fs.writeFileSync(path.join(commonDir, 'any-note.md'),
        '---\nscope: common\nstatus: approved-common\nstack: [any]\n---\nany note about widgets');
      w.addKbNote(dir, { title: 'Widgets Local', body: 'java widgets', scope: 'project' });
      const { buildKnowledge } = require('../lib/state');
      const visible = new Set(buildKnowledge(dir).docs.map((d) => d.name));
      assert.ok(visible.has('any-note'), 'panel sees the any-stack common note');
      assert.ok(!visible.has('python-only'), 'panel hides the python-only common note for a java project');
      const res = await qa.ask(dir, 'widgets', { fetchImpl: spyFetch() });
      for (const m of res.matches) {
        assert.ok(visible.has(m.name), `Q&A surfaced ${m.name} which buildKnowledge did not make visible`);
        assert.notEqual(m.name, 'python-only', 'Q&A never reaches an out-of-stack common note');
      }
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// Hub-independent CLI: `node hub/lib/knowledge-qa.js <project> <question>`
// A thin wire-up of the same ask() — no new logic. Read-only, never-throws,
// exit 0, no network unless an overlay is enabled+healthy.
// ===========================================================================

const { spawnSync } = require('node:child_process');
const CLI = path.resolve(__dirname, '..', 'lib', 'knowledge-qa.js');

// Run the CLI as a child process with an isolated HOME (so no real overlay
// config or credential can leak in). Returns { status, stdout, stderr }.
function runCli(args, { home, env } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, ...(env || {}) },
  });
}

test('CLI prints the answer + the honest grounding label for a local match (filename-only)', async () => {
  const dir = tmpProject(['node']);
  const home = freshTmp('aidt-qa-home-');
  try {
    ensureHomeAidt(home);
    w.addKbNote(dir, { title: 'Webhook Retry Policy', body: 'exponential backoff', scope: 'project' });
    const r = runCli([dir, 'what is the webhook retry policy?'], { home });
    assert.equal(r.status, 0, 'CLI exits 0');
    assert.match(r.stdout, /webhook-retry-policy|Webhook Retry/i, 'the matched note is shown');
    assert.match(r.stdout, /filename|keyword|no embedder/i, 'the honest grounding label is printed verbatim');
    assert.match(r.stdout, /not .*semantic understanding check/i, 'never overclaims a semantic match');
    assert.doesNotMatch(r.stdout, /external\)/i, 'no egress disclosure for a local-only answer');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('CLI states honest absence when nothing matches, and still exits 0', () => {
  const dir = tmpProject(['node']);
  const home = freshTmp('aidt-qa-home-');
  try {
    ensureHomeAidt(home);
    w.addKbNote(dir, { title: 'Webhook Retry Policy', body: 'backoff', scope: 'project' });
    const r = runCli([dir, 'how do I configure kafka partitioning?'], { home });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no note|nothing/i, 'plain absence');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('CLI never-throws and exits 0 on a missing/garbage project dir', () => {
  const home = freshTmp('aidt-qa-home-');
  try {
    ensureHomeAidt(home);
    const r = runCli(['/no/such/project/at/all', 'anything?'], { home });
    assert.equal(r.status, 0, 'a bad project dir still exits 0');
    assert.equal(r.stderr.trim(), '', 'no stack trace on stderr');
    assert.match(r.stdout, /no note|nothing/i, 'degrades to honest absence');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('CLI with no question still exits 0 (never-throws)', () => {
  const dir = tmpProject(['node']);
  const home = freshTmp('aidt-qa-home-');
  try {
    ensureHomeAidt(home);
    const r = runCli([dir], { home });
    assert.equal(r.status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('CLI makes NO network call when no overlay is configured (read-only, no egress)', () => {
  const dir = tmpProject(['node']);
  const home = freshTmp('aidt-qa-home-');
  try {
    ensureHomeAidt(home); // home has NO overlay config ⇒ overlay disabled
    w.addKbNote(dir, { title: 'Local Topic', body: 'present', scope: 'project' });
    // Trap any outbound socket: a child that egresses would print PROBE-EGRESS.
    const trap = "const net=require('net');const o=net.Socket.prototype.connect;net.Socket.prototype.connect=function(){process.stdout.write('PROBE-EGRESS');return o.apply(this,arguments);};";
    const r = spawnSync(process.execPath, ['-e', `${trap}require(${JSON.stringify(CLI)});`, dir, 'local topic'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /PROBE-EGRESS/, 'no overlay ⇒ the network primitive is never invoked');
    assert.doesNotMatch(r.stdout, /external\)/i, 'no external/egress disclosure when local-only');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('renderCliText surfaces the egress disclosure iff an overlay actually answered', () => {
  const local = qa.renderCliText({
    answer: 'local answer',
    grounding: { method: 'filename-only', source: 'filename-only', external: false, label: 'Filename/keyword match only — no embedder configured.' },
    egressDisclosed: false,
  });
  assert.match(local, /Filename\/keyword match only/, 'verbatim honest label');
  assert.doesNotMatch(local, /Egress:/, 'no egress line when nothing was sent');

  const external = qa.renderCliText({
    answer: 'external answer',
    grounding: { method: 'overlay', source: 'openmemory', external: true, residency: 'EU', label: 'Answered by your connected memory service openmemory (external).' },
    egressDisclosed: true,
  });
  assert.match(external, /Answered by your connected memory service openmemory \(external\)/, 'overlay label verbatim');
  assert.match(external, /Egress:.*openmemory/i, 'egress disclosed truthfully with the source named');
});

test('CLI is read-only: the project vault is byte-identical after asking', () => {
  const dir = tmpProject(['node']);
  const home = freshTmp('aidt-qa-home-');
  try {
    ensureHomeAidt(home);
    w.addKbNote(dir, { title: 'Topic', body: 'x', scope: 'project' });
    const before = snapshotTree(dir);
    runCli([dir, 'topic'], { home });
    runCli([dir, 'nope'], { home });
    assert.deepEqual(snapshotTree(dir), before, 'CLI wrote nothing to the project vault');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});
