'use strict';
/*
 * Per-project SSE channel manager: subscribers keyed on the resolved project
 * root (cross-project isolation), watchers created on first subscriber and torn
 * down on last (refcount, no FD leak), a cap on concurrently watched projects
 * (over-cap → clean refusal), and a per-channel debounce. A push for project A
 * reaches ONLY A's subscribers.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createChannels } = require('../lib/channels');

function dir(tag) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-chan-' + tag + '-'))); }
// a fake SSE response that records what was written and lets a test fire 'close'
function fakeRes() {
  const r = { written: [], closed: false };
  r.write = (s) => { r.written.push(s); return true; };
  return r;
}

test('a subscriber gets its own channel; a push reaches only that channel', () => {
  const ch = createChannels({ render: (d) => 'state:' + path.basename(d) });
  const a = dir('a'), b = dir('b');
  try {
    const ra = fakeRes(), rb = fakeRes();
    const sa = ch.subscribe(a, ra);
    const sb = ch.subscribe(b, rb);
    assert.equal(sa.ok, true);
    assert.equal(sb.ok, true);
    // initial frame each
    assert.match(ra.written[0], /state:/);

    ch.push(a);
    // A got a second frame, B did not
    assert.equal(ra.written.length, 2);
    assert.equal(rb.written.length, 1, 'B never receives an A push');
    assert.match(ra.written[1], new RegExp('state:' + path.basename(a)));
  } finally { ch.closeAll(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test('watchers are refcounted: created on first subscriber, torn down on last close', () => {
  const ch = createChannels({ render: () => 'x', debounceMs: 0 });
  const a = dir('a');
  try {
    const r1 = fakeRes(), r2 = fakeRes();
    const s1 = ch.subscribe(a, r1);
    const s2 = ch.subscribe(a, r2);
    assert.equal(ch.activeCount(), 1, 'one channel for two subscribers on the same project');
    assert.ok(ch.watcherCount(a) > 0, 'watchers active while subscribed');

    s1.close();
    assert.equal(ch.activeCount(), 1, 'channel stays while one subscriber remains');
    s2.close();
    assert.equal(ch.activeCount(), 0, 'channel torn down on last close');
    assert.equal(ch.watcherCount(a), 0, 'watchers released — no FD leak');
  } finally { ch.closeAll(); fs.rmSync(a, { recursive: true, force: true }); }
});

test('the active-project cap refuses a new project cleanly (503), existing channels keep serving', () => {
  const ch = createChannels({ render: () => 'x', cap: 2 });
  const a = dir('a'), b = dir('b'), c = dir('c');
  try {
    assert.equal(ch.subscribe(a, fakeRes()).ok, true);
    assert.equal(ch.subscribe(b, fakeRes()).ok, true);
    const over = ch.subscribe(c, fakeRes());
    assert.equal(over.ok, false);
    assert.equal(over.code, 503);
    // a NEW subscriber to an already-active project is still accepted (reuses channel)
    assert.equal(ch.subscribe(a, fakeRes()).ok, true);
    assert.equal(ch.activeCount(), 2);
  } finally { ch.closeAll(); for (const d of [a, b, c]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a write to one project under concurrent activity never crosses to another', () => {
  const ch = createChannels({ render: (d) => path.basename(d) });
  const a = dir('a'), b = dir('b');
  try {
    const ra = fakeRes(), rb = fakeRes();
    ch.subscribe(a, ra);
    ch.subscribe(b, rb);
    ch.push(a); ch.push(b); ch.push(a);
    const aFrames = ra.written.filter((s) => s.includes(path.basename(a))).length;
    const aGotB = ra.written.some((s) => s.includes(path.basename(b)));
    assert.ok(aFrames >= 1);
    assert.equal(aGotB, false, 'no B frame on the A stream');
  } finally { ch.closeAll(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});
