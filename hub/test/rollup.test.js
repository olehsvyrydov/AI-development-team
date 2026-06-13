'use strict';
/*
 * Cross-project rollup multiplexer (hub/lib/rollup.js). A single SSE connection
 * mirrors EVERY registered project: the first frame is a full snapshot; a change
 * to ONE project recomputes only that project and merges it into a cached rollup;
 * a burst coalesces to fewer frames (merge-emit debounce on top of the per-channel
 * debounce); totals are the sum of the per-project counts; an unreadable project
 * yields stateChangedAt:null without tearing the stream. The frame is a strict
 * subset of /api/projects — it carries NO `path`. The project set is derived
 * server-side from the registry; there is no client list. Over-cap projects still
 * appear in the snapshot via the cheap (no live channel) path.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createChannels } = require('../lib/channels');
const { createRollup } = require('../lib/rollup');

function dir(tag) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-roll-' + tag + '-'))); }

// a fake SSE sink that records frames and lets a test fire 'close'
function fakeRes() {
  const r = { written: [], handlers: {} };
  r.write = (s) => { r.written.push(s); return true; };
  r.on = (ev, fn) => { r.handlers[ev] = fn; };
  r.fireClose = () => { if (r.handlers.close) r.handlers.close(); };
  return r;
}

// parse the data: line of the most recent `event: rollup` frame written to a sink
function lastFrame(res) {
  const frames = res.written.filter((s) => /^event: rollup\n/.test(s));
  if (!frames.length) return null;
  const last = frames[frames.length - 1];
  const m = last.match(/\ndata: (.*)\n\n$/s);
  return m ? JSON.parse(m[1]) : null;
}
function frameCount(res) { return res.written.filter((s) => /^event: rollup\n/.test(s)).length; }

// a registry stub backed by an explicit list of records
function fakeRegistry(records) {
  return { list: async () => records.map((r) => ({ ...r })) };
}

// summarize/freshness stubs keyed by dir so a test drives counts deterministically
function stubs(map) {
  return {
    summarize: (d) => (d in map ? map[d].summary : null),
    freshness: (d) => (d in map ? map[d].freshness : null),
  };
}

async function settle(ms = 60) { await new Promise((r) => setTimeout(r, ms)); }

test('the first frame is a full snapshot of all registry projects with the exact field set and NO path', async () => {
  const a = dir('a'), b = dir('b');
  const channels = createChannels({ render: () => 'x', debounceMs: 0 });
  const map = {
    [a]: { summary: { open: 5, needsYou: 2 }, freshness: 111 },
    [b]: { summary: { open: 3, needsYou: 0 }, freshness: 222 },
  };
  const registry = fakeRegistry([
    { id: 'aaaaaaaaaaaa', path: a, label: 'acme', status: 'connected', lastSeen: '2026-01-01T00:00:00Z' },
    { id: 'bbbbbbbbbbbb', path: b, label: 'billing', status: 'connected', lastSeen: '2026-01-02T00:00:00Z' },
  ]);
  const rollup = createRollup({ channels, registry, ...stubs(map), mergeDebounceMs: 10 });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    const frame = lastFrame(res);
    assert.ok(frame, 'a first frame was emitted');
    assert.equal(frame.totalOpen, 8);
    assert.equal(frame.totalNeedsYou, 2);
    assert.equal(frame.projects.length, 2);
    for (const p of frame.projects) {
      assert.deepEqual(
        Object.keys(p).sort(),
        ['id', 'label', 'live', 'needsYou', 'open', 'stateChangedAt', 'status'],
        'a project entry carries exactly the pinned fields');
      assert.ok(!('path' in p), 'the frame never carries path');
    }
  } finally { rollup.closeAll(); channels.closeAll(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test('a change to ONE project emits a merged frame with that project updated and recomputed totals', async () => {
  const a = dir('a'), b = dir('b');
  const channels = createChannels({ render: () => 'x', debounceMs: 0 });
  const map = {
    [a]: { summary: { open: 5, needsYou: 2 }, freshness: 111 },
    [b]: { summary: { open: 3, needsYou: 1 }, freshness: 222 },
  };
  const registry = fakeRegistry([
    { id: 'aaaaaaaaaaaa', path: a, label: 'acme', status: 'connected', lastSeen: '2026-01-01T00:00:00Z' },
    { id: 'bbbbbbbbbbbb', path: b, label: 'billing', status: 'connected', lastSeen: '2026-01-02T00:00:00Z' },
  ]);
  let recomputes = 0;
  const rollup = createRollup({
    channels, registry, freshness: () => 0, mergeDebounceMs: 10,
    summarize: (d) => { recomputes++; return map[d].summary; },
  });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    const afterSnapshot = recomputes;
    const framesAfterSnapshot = frameCount(res);

    // project A changes: only A is recomputed and the merged frame reflects it
    map[a].summary = { open: 9, needsYou: 4 };
    channels.push(a); // wakes A's channel → wakes the rollup sink
    await settle();

    assert.equal(recomputes - afterSnapshot, 1, 'only the changed project is recomputed (O(1) per tick)');
    assert.ok(frameCount(res) > framesAfterSnapshot, 'a merged frame was emitted');
    const frame = lastFrame(res);
    const aEntry = frame.projects.find((p) => p.id === 'aaaaaaaaaaaa');
    assert.equal(aEntry.open, 9);
    assert.equal(aEntry.needsYou, 4);
    assert.equal(frame.totalOpen, 12, 'totals = sum of per-project open (9 + 3)');
    assert.equal(frame.totalNeedsYou, 5, 'totals = sum of per-project needsYou (4 + 1)');
  } finally { rollup.closeAll(); channels.closeAll(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test('a burst of changes coalesces to fewer emits than changes (merge-emit debounce)', async () => {
  const a = dir('a');
  const channels = createChannels({ render: () => 'x', debounceMs: 0 });
  const map = { [a]: { summary: { open: 1, needsYou: 0 }, freshness: 0 } };
  const registry = fakeRegistry([{ id: 'aaaaaaaaaaaa', path: a, label: 'acme', status: 'connected', lastSeen: '2026-01-01T00:00:00Z' }]);
  const rollup = createRollup({ channels, registry, ...stubs(map), mergeDebounceMs: 40 });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    const base = frameCount(res);
    for (let i = 0; i < 6; i++) channels.push(a);
    await settle(120);
    const emitted = frameCount(res) - base;
    assert.ok(emitted >= 1, 'the burst produced at least one merged frame');
    assert.ok(emitted < 6, 'six rapid changes coalesce to fewer than six frames');
  } finally { rollup.closeAll(); channels.closeAll(); fs.rmSync(a, { recursive: true, force: true }); }
});

test('a project that becomes unreadable yields stateChangedAt:null and does not crash the stream', async () => {
  const a = dir('a'), b = dir('b');
  const channels = createChannels({ render: () => 'x', debounceMs: 0 });
  const registry = fakeRegistry([
    { id: 'aaaaaaaaaaaa', path: a, label: 'acme', status: 'error', lastSeen: '2026-01-01T00:00:00Z' },
    { id: 'bbbbbbbbbbbb', path: b, label: 'billing', status: 'connected', lastSeen: '2026-01-02T00:00:00Z' },
  ]);
  const rollup = createRollup({
    channels, registry, mergeDebounceMs: 10,
    summarize: (d) => (d === b ? { open: 3, needsYou: 1 } : null), // a is unreadable
    freshness: (d) => (d === b ? 222 : null),
  });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    const frame = lastFrame(res);
    const aEntry = frame.projects.find((p) => p.id === 'aaaaaaaaaaaa');
    assert.equal(aEntry.stateChangedAt, null, 'unreadable freshness is null, never fabricated');
    assert.equal(aEntry.open, 0, 'an unreadable summary degrades to 0 without crashing the merge');
    assert.equal(aEntry.needsYou, 0);
    assert.equal(frame.totalNeedsYou, 1, 'the readable project still contributes');
  } finally { rollup.closeAll(); channels.closeAll(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test('only the cap is live-pinned; over-cap projects still appear in the snapshot via the cheap path (live:false)', async () => {
  const ds = [dir('1'), dir('2'), dir('3')];
  const channels = createChannels({ render: () => 'x', debounceMs: 0, cap: 2 });
  const map = {};
  const records = ds.map((d, i) => {
    map[d] = { summary: { open: i + 1, needsYou: i }, freshness: 100 + i };
    return { id: String(i).repeat(12), path: d, label: 'p' + i, status: 'connected', lastSeen: '2026-01-0' + (i + 1) + 'T00:00:00Z' };
  });
  const registry = fakeRegistry(records);
  const rollup = createRollup({ channels, registry, ...stubs(map), cap: 2, mergeDebounceMs: 10 });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    const frame = lastFrame(res);
    assert.equal(frame.projects.length, 3, 'all registry projects appear, including the over-cap tail');
    const live = frame.projects.filter((p) => p.live);
    assert.equal(live.length, 2, 'at most the cap is live-pinned');
    const cold = frame.projects.filter((p) => !p.live);
    assert.equal(cold.length, 1, 'the over-cap project is cold (not live), never raising the cap');
    assert.ok(channels.activeCount() <= 2, 'the channel cap was never breached');
  } finally { rollup.closeAll(); channels.closeAll(); for (const d of ds) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a cold (over-cap) project is refreshed on the slow interval so its tail never freezes', async () => {
  const ds = [dir('1'), dir('2'), dir('3')];
  const channels = createChannels({ render: () => 'x', debounceMs: 0, cap: 2 });
  const map = {};
  const records = ds.map((d, i) => {
    map[d] = { summary: { open: i + 1, needsYou: i }, freshness: 100 + i };
    return { id: String(i).repeat(12), path: d, label: 'p' + i, status: 'connected', lastSeen: '2026-01-0' + (i + 1) + 'T00:00:00Z' };
  });
  const registry = fakeRegistry(records);
  const idOf = {};
  for (const r of records) idOf[r.path] = r.id;
  const rollup = createRollup({ channels, registry, ...stubs(map), cap: 2, mergeDebounceMs: 10, coldRefreshMs: 20 });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    const before = lastFrame(res);
    const coldEntry = before.projects.find((p) => !p.live);
    assert.ok(coldEntry, 'exactly one over-cap project starts cold');
    const coldDir = ds.find((d) => idOf[d] === coldEntry.id);

    // mutate ONLY the cold project's underlying state — it has no sink to wake it
    map[coldDir].summary = { open: 42, needsYou: 7 };
    map[coldDir].freshness = 999;
    await settle(80); // let the slow cold-refresh interval fire

    const after = lastFrame(res);
    const coldAfter = after.projects.find((p) => p.id === coldEntry.id);
    assert.equal(coldAfter.open, 42, 'the cold project picks up its new open count on the slow refresh');
    assert.equal(coldAfter.needsYou, 7);
    assert.equal(coldAfter.stateChangedAt, 999, 'the cold project picks up its new freshness');
    assert.equal(coldAfter.live, false, 'the cold refresh never promotes the project to live');
    assert.ok(channels.activeCount() <= 2, 'the cold refresh never opens a channel or breaches the cap');
  } finally { rollup.closeAll(); channels.closeAll(); for (const d of ds) fs.rmSync(d, { recursive: true, force: true }); }
});

test('the cold-refresh interval is cleared on teardown so it does not leak past the connection', async () => {
  const ds = [dir('1'), dir('2'), dir('3')];
  const channels = createChannels({ render: () => 'x', debounceMs: 0, cap: 2 });
  const map = {};
  const records = ds.map((d, i) => {
    map[d] = { summary: { open: i + 1, needsYou: i }, freshness: 100 + i };
    return { id: String(i).repeat(12), path: d, label: 'p' + i, status: 'connected', lastSeen: '2026-01-0' + (i + 1) + 'T00:00:00Z' };
  });
  const registry = fakeRegistry(records);
  let coldSummaries = 0;
  const rollup = createRollup({
    channels, registry, freshness: (d) => map[d].freshness, mergeDebounceMs: 10, coldRefreshMs: 20,
    summarize: (d) => { coldSummaries++; return map[d].summary; },
  });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    await settle(60); // let the cold-refresh interval fire at least once while connected
    const whileConnected = coldSummaries;
    assert.ok(whileConnected > records.length, 'the cold-refresh interval recomputes cold projects while connected');
    res.fireClose();
    const atTeardown = coldSummaries;
    await settle(80);
    assert.equal(coldSummaries, atTeardown, 'no cold-refresh recompute runs after teardown — the interval was cleared');
  } finally { rollup.closeAll(); channels.closeAll(); for (const d of ds) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a throw during sink setup leaves no connection or sink pinned (setup is exception-safe)', async () => {
  const a = dir('a'), b = dir('b');
  const realChannels = createChannels({ render: () => 'x', debounceMs: 0 });
  const map = {
    [a]: { summary: { open: 1, needsYou: 1 }, freshness: 1 },
    [b]: { summary: { open: 1, needsYou: 1 }, freshness: 1 },
  };
  const registry = fakeRegistry([
    { id: 'aaaaaaaaaaaa', path: a, label: 'a', status: 'connected', lastSeen: '2026-01-01T00:00:00Z' },
    { id: 'bbbbbbbbbbbb', path: b, label: 'b', status: 'connected', lastSeen: '2026-01-02T00:00:00Z' },
  ]);
  // a channels stub whose subscribe throws while wiring the watch set
  const throwingChannels = { subscribe: () => { throw new Error('watch setup failed'); } };
  const rollup = createRollup({ channels: throwingChannels, registry, ...stubs(map), mergeDebounceMs: 10 });
  const res = fakeRes();
  try {
    await assert.rejects(() => rollup.subscribe(res), /watch setup failed/, 'the setup throw propagates to the caller');
    assert.equal(rollup.connectionCount(), 0, 'no connection is left registered after a setup throw — teardown ran');
    assert.equal(realChannels.activeCount(), 0, 'no live channel is left pinned after a setup throw');
  } finally { rollup.closeAll(); realChannels.closeAll(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test('live-pin order is relevance-first: projects with needsYou are pinned before idle ones', async () => {
  const idle = dir('idle'), hot = dir('hot'), cold = dir('cold');
  const channels = createChannels({ render: () => 'x', debounceMs: 0, cap: 1 });
  const map = {
    [idle]: { summary: { open: 9, needsYou: 0 }, freshness: 1 },
    [hot]: { summary: { open: 1, needsYou: 5 }, freshness: 1 },
    [cold]: { summary: { open: 2, needsYou: 0 }, freshness: 1 },
  };
  const registry = fakeRegistry([
    { id: 'aaaaaaaaaaaa', path: idle, label: 'idle', status: 'connected', lastSeen: '2026-01-03T00:00:00Z' },
    { id: 'bbbbbbbbbbbb', path: hot, label: 'hot', status: 'connected', lastSeen: '2026-01-01T00:00:00Z' },
    { id: 'cccccccccccc', path: cold, label: 'cold', status: 'connected', lastSeen: '2026-01-02T00:00:00Z' },
  ]);
  const rollup = createRollup({ channels, registry, ...stubs(map), cap: 1, mergeDebounceMs: 10 });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    const frame = lastFrame(res);
    const hotEntry = frame.projects.find((p) => p.id === 'bbbbbbbbbbbb');
    assert.equal(hotEntry.live, true, 'the needsYou project wins the single live slot');
  } finally { rollup.closeAll(); channels.closeAll(); for (const d of [idle, hot, cold]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('teardown closes every live sink so no channel is left watched after the connection drops', async () => {
  const a = dir('a'), b = dir('b');
  const channels = createChannels({ render: () => 'x', debounceMs: 0 });
  const map = {
    [a]: { summary: { open: 1, needsYou: 1 }, freshness: 1 },
    [b]: { summary: { open: 1, needsYou: 1 }, freshness: 1 },
  };
  const registry = fakeRegistry([
    { id: 'aaaaaaaaaaaa', path: a, label: 'a', status: 'connected', lastSeen: '2026-01-01T00:00:00Z' },
    { id: 'bbbbbbbbbbbb', path: b, label: 'b', status: 'connected', lastSeen: '2026-01-02T00:00:00Z' },
  ]);
  const rollup = createRollup({ channels, registry, ...stubs(map), mergeDebounceMs: 10 });
  const res = fakeRes();
  try {
    await rollup.subscribe(res);
    assert.ok(channels.activeCount() > 0, 'live channels are pinned while subscribed');
    res.fireClose();
    assert.equal(channels.activeCount(), 0, 'every live channel is released on connection close — no FD leak');
  } finally { rollup.closeAll(); channels.closeAll(); fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});
