'use strict';
/* Tests for hub/lib/state.js — the explicit, multi-ticket workflow projection.
 * Covers per-ticket track/stage/assignee/expectedOwner/gates, backward
 * compatibility with older ledgers, overlay merge, and a stable rev. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildState, summarizeTasks, stateChangedAt } = require('../lib/state');

const WORKFLOW = `version: 1
preset: small-team
change_classes:
  standard:    { desc: "a feature", track: standard }
tracks:
  standard:  [state_behavior, write_test, implement, self_review, code_review]
  full:      [vision, architecture, security, design, approval_gate, tdd, code_review, qa, verify, done]
gates:
  ARCH_APPROVED:   { owner: "/arch",   refusal: hard, trigger: [new_service] }
  SECOPS_APPROVED: { owner: "/secops", refusal: hard, safety_override: true, trigger: [auth] }
  CODE_REVIEWED:   { owner: "/rev",    refusal: hard, trigger: [track:standard] }
  VERIFIED:        { owner: "/verify", refusal: hard, trigger: [track:full] }
presets:
  small-team:
    always_required: [CODE_REVIEWED]
  regulated:
    always_required: [ARCH_APPROVED, SECOPS_APPROVED, CODE_REVIEWED, VERIFIED]
`;

function fixture(ledger, overrides) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-state-'));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WORKFLOW);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'), JSON.stringify(ledger));
  if (overrides) fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.overrides.json'), JSON.stringify(overrides));
  return dir;
}

test('buildState exposes every ticket with track/stage/assignee/expectedOwner/gates (multi-ticket)', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'full', stage: 'security', assignee: '/secops',
             gates: { ARCH_APPROVED: { state: 'passed', by: '/arch' }, SECOPS_APPROVED: { state: 'pending' } } },
    'T-2': { title: 'B', track: 'standard', stage: 'code_review',
             gates: { CODE_REVIEWED: { state: 'rejected', by: '/rev', note: 'needs tests' } } },
  });
  try {
    const st = buildState(dir);
    assert.equal(st.preset, 'small-team');
    assert.equal(st.tickets.length, 2, 'returns ALL tickets, not just one');
    const t1 = st.tickets.find((t) => t.id === 'T-1');
    assert.equal(t1.track, 'full');
    assert.equal(t1.stage, 'security');
    assert.equal(t1.assignee, '/secops');
    assert.equal(t1.expectedOwner, '/secops');
    const sec = t1.gates.find((g) => g.name === 'SECOPS_APPROVED');
    assert.equal(sec.state, 'pending');
    assert.equal(sec.safety, true);
    assert.equal(sec.refusal, 'hard');
    // top-level projection helpers
    assert.ok(st.tracks.full.includes('verify'), 'tracks parsed');
    assert.ok(st.gateDefs.some((g) => g.name === 'CODE_REVIEWED' && g.required), 'always_required reflected');
    assert.equal(typeof st.rev, 'string');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a rejected hard gate makes the ticket status "blocked"', () => {
  const dir = fixture({ 'T-2': { title: 'B', track: 'standard', stage: 'code_review',
    gates: { CODE_REVIEWED: { state: 'rejected', by: '/rev' } } } });
  try {
    const t2 = buildState(dir).tickets.find((t) => t.id === 'T-2');
    assert.equal(t2.status, 'blocked');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('older ledger without assignee still parses and shows expectedOwner', () => {
  const dir = fixture({ 'T-3': { title: 'C', track: 'full', stage: 'architecture',
    gates: { ARCH_APPROVED: { state: 'pending' } } } });
  try {
    const t3 = buildState(dir).tickets.find((t) => t.id === 'T-3');
    assert.equal(t3.assignee, null);
    assert.equal(t3.expectedOwner, '/arch', 'derives expected owner when unassigned');
    assert.equal(t3.status, 'waiting');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket surfaces its comment log oldest-first; no log → []', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} },
    'T-2': { title: 'B', track: 'standard', stage: 'implement', gates: {} },
  });
  try {
    const file = path.join(dir, '.aidevteam', 'comments', 'T-1.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file,
      JSON.stringify({ id: 'c1', ticket: 'T-1', ts: '2026-01-01T00:00:00Z', author: '/be', kind: 'comment', body: 'first' }) + '\n' +
      JSON.stringify({ id: 'c2', ticket: 'T-1', ts: '2026-01-02T00:00:00Z', author: '/rev', kind: 'gate', body: 'second', gate: 'CODE_REVIEWED', state: 'passed' }) + '\n');
    const st = buildState(dir);
    const t1 = st.tickets.find((t) => t.id === 'T-1');
    const t2 = st.tickets.find((t) => t.id === 'T-2');
    assert.equal(t1.comments.length, 2);
    assert.equal(t1.comments[0].body, 'first');
    assert.equal(t1.comments[1].gate, 'CODE_REVIEWED');
    assert.deepEqual(t2.comments, [], 'ticket without a log gets an empty array');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket description comes from the ledger when present, else null', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'standard', stage: 'implement', description: 'why this exists', gates: {} },
    'T-2': { title: 'B', track: 'standard', stage: 'implement', gates: {} },
  });
  try {
    const st = buildState(dir);
    assert.equal(st.tickets.find((t) => t.id === 'T-1').description, 'why this exists');
    assert.equal(st.tickets.find((t) => t.id === 'T-2').description, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket description falls back to a markdown ticket body when the ledger lacks one', () => {
  const dir = fixture({
    'T-7': { title: 'G', track: 'standard', stage: 'implement', gates: {} },
  });
  try {
    const tdir = path.join(dir, '.aidevteam', 'tickets');
    fs.mkdirSync(tdir, { recursive: true });
    fs.writeFileSync(path.join(tdir, 'T-7.md'),
      '---\nid: T-7\ntitle: G\n---\n\n# G\n\nThe detailed body of the ticket.\n');
    const t7 = buildState(dir).tickets.find((t) => t.id === 'T-7');
    assert.equal(t7.description, 'The detailed body of the ticket.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('taskSummary folds ticket statuses; core byStatus buckets sum to total', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'full', stage: 'implement', assignee: '/be', gates: {} },           // in_progress
    'T-2': { title: 'B', track: 'full', stage: 'implement', assignee: '/be', gates: {} },           // in_progress
    'T-3': { title: 'C', track: 'full', stage: 'security', gates: { SECOPS_APPROVED: { state: 'rejected' } } }, // blocked + needsYou (hard reject)
    'T-4': { title: 'D', track: 'full', stage: 'done', gates: {} },                                 // done
  });
  try {
    const s = buildState(dir).taskSummary;
    assert.equal(s.total, 4);
    const core = s.byStatus.in_progress + s.byStatus.waiting + s.byStatus.blocked + s.byStatus.done;
    assert.equal(core, s.total, 'core buckets (in_progress+waiting+blocked+done) sum to total');
    assert.equal(s.byStatus.in_progress, 2);
    assert.equal(s.byStatus.done, 1);
    assert.equal(s.byStatus.blocked, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('needsYou is an overlay: hard-gate-rejected counts, and is NOT a sixth bucket', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'full', stage: 'security', gates: { SECOPS_APPROVED: { state: 'rejected' } } },
  });
  try {
    const s = buildState(dir).taskSummary;
    assert.equal(s.byStatus.needsYou, 1, 'a hard-gate-rejected ticket needs you');
    assert.equal(s.byStatus.blocked, 1, 'and is still counted in its base blocked bucket (overlay, not exclusive)');
    const core = s.byStatus.in_progress + s.byStatus.waiting + s.byStatus.blocked + s.byStatus.done;
    assert.equal(core, s.total, 'needsYou does not break the sum invariant');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a literal "needsYou" status cannot pollute the overlay count', () => {
  // The overlay key and a status value collide lexically. The overlay must be
  // derived solely from needsHumanDecision, never incremented by a status match.
  const coreTickets = [
    { status: 'in_progress', gates: [] },
    { status: 'waiting', gates: [] },
    { status: 'blocked', gates: [] },
    { status: 'done', gates: [] },
  ];
  const withCollision = [...coreTickets, { status: 'needsYou', gates: [] }];

  const baseline = summarizeTasks(coreTickets);
  const baseCore = baseline.byStatus.in_progress + baseline.byStatus.waiting
    + baseline.byStatus.blocked + baseline.byStatus.done;
  assert.equal(baseCore, baseline.total, 'core buckets sum to total for valid statuses');
  assert.equal(baseline.byStatus.needsYou, 0, 'no ticket needs a human decision here');

  const polluted = summarizeTasks(withCollision);
  assert.equal(polluted.byStatus.needsYou, 0,
    'a colliding status value must not be counted as the needsYou overlay');
  const collisionCore = polluted.byStatus.in_progress + polluted.byStatus.waiting
    + polluted.byStatus.blocked + polluted.byStatus.done;
  assert.equal(collisionCore, baseCore,
    'a foreign status lands in no core bucket and leaves the core counts untouched');
});

test('needsYou counts a waiting ticket with an expectedOwner and no active agent', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'full', stage: 'architecture', gates: { ARCH_APPROVED: { state: 'pending' } } }, // waiting, expectedOwner /arch, no active
    'T-2': { title: 'B', track: 'full', stage: 'architecture', active: '/arch', gates: { ARCH_APPROVED: { state: 'pending' } } }, // waiting but agent active → not needsYou
  });
  try {
    const s = buildState(dir).taskSummary;
    assert.equal(s.byStatus.waiting, 2);
    assert.equal(s.byStatus.needsYou, 1, 'only the parked-with-owner-no-heartbeat ticket needs you');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('workflowView flattens the active track into render-ready stages with gate {name,refusal}', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'full', stage: 'security', assignee: '/secops', gates: { SECOPS_APPROVED: { state: 'pending' } } },
  });
  try {
    const wv = buildState(dir).workflowView;
    assert.equal(wv.activeTrack, 'full', 'active ticket track wins');
    const arch = wv.stages.find((s) => s.stage === 'architecture');
    assert.deepEqual(arch.gate, { name: 'ARCH_APPROVED', refusal: 'hard' });
    assert.equal(arch.owner, '/arch');
    const vision = wv.stages.find((s) => s.stage === 'vision');
    assert.equal(vision.gate, null, 'a gate-less stage carries gate:null');
    assert.equal(vision.owner, '/po');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('workflowView falls back to the longest defined track when no active ticket resolves', () => {
  const dir = fixture({
    'T-1': { title: 'A', track: 'standard', stage: 'done', gates: {} }, // done → not the active selection
  });
  try {
    const wv = buildState(dir).workflowView;
    assert.equal(wv.activeTrack, 'full', 'longest defined track is the fallback');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('base reports filename-only method with indexed = doc count when no embedder is configured', () => {
  const dir = fixture({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } });
  try {
    const docsDir = path.join(dir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'code-rules.md'), '# rules');
    fs.writeFileSync(path.join(docsDir, 'arch.md'), '# arch');
    const base = buildState(dir).base;
    assert.equal(base.method, 'filename-only');
    assert.equal(base.counts.indexed, 2);
    assert.equal(base.counts.indexing, 0);
    assert.equal(base.counts.failed, 0);
    assert.equal(base.docs.length, 2);
    assert.ok(base.docs.every((d) => d.index === 'indexed' && d.name && d.file));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('overlay (.aidevteam/workflow.overrides.json) merges over the base workflow', () => {
  const dir = fixture(
    { 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } },
    { preset: 'regulated', tracks: { standard: ['implement', 'code_review'] } },
  );
  try {
    const st = buildState(dir);
    assert.equal(st.preset, 'regulated', 'overlay preset wins');
    assert.deepEqual(st.tracks.standard, ['implement', 'code_review'], 'overlay track order wins');
    assert.ok(st.overlay, 'overlay path reported');
    // switching preset via overlay must re-resolve always_required
    const req = st.gateDefs.filter((g) => g.required).map((g) => g.name).sort();
    assert.deepEqual(req, ['ARCH_APPROVED', 'CODE_REVIEWED', 'SECOPS_APPROVED', 'VERIFIED'],
      'regulated always_required resolved after overlay preset switch');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stateChangedAt is the max watched-file mtime in ms and tracks a fresh ledger write', () => {
  const dir = fixture({ 'T-1': { title: 'A', track: 'standard', stage: 'implement', gates: {} } });
  try {
    const first = stateChangedAt(dir);
    assert.equal(typeof first, 'number', 'a readable project yields a numeric epoch-ms');
    const future = Date.now() + 5000;
    fs.utimesSync(path.join(dir, '.workflow-state.json'), future / 1000, future / 1000);
    const after = stateChangedAt(dir);
    assert.ok(after >= first, 'a fresher ledger write moves the freshness forward');
    assert.ok(Math.abs(after - future) < 50, 'freshness reflects the ledger mtime');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stateChangedAt is null for a missing project (honest absence, never fabricated)', () => {
  assert.equal(stateChangedAt(path.join(os.tmpdir(), 'aidt-no-such-' + Date.now())), null);
});
