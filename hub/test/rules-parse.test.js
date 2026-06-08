'use strict';
/*
 * parseRules / parseLabels + their projection into buildState, plus the
 * additive per-ticket labels:[] / fired:[] ledger fields surfacing on the
 * ticket projection. Rules/labels read primarily from the overlay JSON (full
 * fidelity); the base YAML carries a small parseable default set. Proto-pollution
 * keys (rule id, label name) never materialize as projection map keys (N-20 arm).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildState } = require('../lib/state');

const WF = `version: 1
preset: solo
tracks:
  full: [vision, architecture, security, implement, code_review, done]
gates:
  ARCH_APPROVED: { owner: "/arch", refusal: hard, trigger: [track:full] }
  SECOPS_APPROVED: { owner: "/secops", refusal: hard, safety_override: true, trigger: [track:full] }
  CODE_REVIEWED: { owner: "/rev", refusal: hard, trigger: [track:full] }
labels:
  TO_DEV_BE: { settable_by: ["/rev","/qa"], routes_to: implement, owner: "/be", meaning: "send back to backend dev" }
  NEEDS_HUMAN: { settable_by: ["*"], meaning: "park for a human decision" }
rules:
  - { id: route-back, when: { event: label.set, label: TO_DEV_BE }, do: [ { route_to_stage: implement } ] }
`;

function proj(overlay) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-rules-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'),
    JSON.stringify({ 'T-1': { title: 'A', track: 'full', stage: 'code_review', gates: {}, labels: ['TO_DEV_BE'], fired: [{ rule: 'r', event: 'e', at: 't' }] } }));
  if (overlay) fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.overrides.json'), JSON.stringify(overlay));
  return dir;
}

test('base labels + rules project into buildState', () => {
  const dir = proj();
  try {
    const st = buildState(dir);
    assert.ok(st.labels, 'labels projected');
    assert.deepEqual(st.labels.TO_DEV_BE.settable_by, ['/rev', '/qa']);
    assert.equal(st.labels.TO_DEV_BE.routes_to, 'implement');
    assert.equal(st.labels.NEEDS_HUMAN.settable_by[0], '*');
    assert.ok(Array.isArray(st.rules), 'rules projected');
    const r = st.rules.find((x) => x.id === 'route-back');
    assert.ok(r, 'rule present');
    assert.equal(r.when.event, 'label.set');
    assert.deepEqual(r.do, [{ route_to_stage: 'implement' }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('overlay adds + overrides rules by id and labels by name', () => {
  const dir = proj({
    labels: { TO_DEV_FE: { settable_by: ['/rev'], routes_to: 'implement', owner: '/fe' } },
    rules: [{ id: 'route-back', when: { event: 'gate.rejected' }, do: [{ assign: '/be' }] },
            { id: 'extra', when: { event: 'comment.added' }, do: [{ set_label: 'NEEDS_HUMAN' }] }],
  });
  try {
    const st = buildState(dir);
    assert.ok(st.labels.TO_DEV_FE, 'overlay label added');
    assert.ok(st.labels.TO_DEV_BE, 'base label retained');
    const byId = Object.fromEntries(st.rules.map((r) => [r.id, r]));
    assert.equal(byId['route-back'].when.event, 'gate.rejected', 'overlay overrides base rule by id');
    assert.ok(byId['extra'], 'overlay rule added');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('per-ticket labels:[] and fired:[] surface on the ticket projection', () => {
  const dir = proj();
  try {
    const st = buildState(dir);
    const t = st.tickets.find((x) => x.id === 'T-1');
    assert.deepEqual(t.labels, ['TO_DEV_BE']);
    assert.equal(Array.isArray(t.fired), true);
    assert.equal(t.fired.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a ticket with no labels/fired defaults to [] (backward compatible)', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-rules-')));
  try {
    fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
    fs.writeFileSync(path.join(dir, '.workflow-state.json'),
      JSON.stringify({ 'T-2': { title: 'B', track: 'full', stage: 'implement', gates: {} } }));
    const st = buildState(dir);
    const t = st.tickets.find((x) => x.id === 'T-2');
    assert.deepEqual(t.labels, []);
    assert.deepEqual(t.fired, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N-20 proto-pollution rule id / label name never shadow the prototype', () => {
  const dir = proj({
    labels: { __proto__: { settable_by: ['*'] }, constructor: { settable_by: ['*'] } },
    rules: [{ id: '__proto__', do: [] }, { id: 'prototype', do: [] }],
  });
  try {
    const st = buildState(dir);
    assert.equal({}.settable_by, undefined, 'Object.prototype not polluted by label name');
    assert.equal(({}).__proto__ === Object.prototype, true, 'Object.prototype intact');
    // a forbidden id/name must not appear as a usable projection key
    assert.ok(!Object.prototype.hasOwnProperty.call(st.labels, '__proto__'));
    assert.ok(!st.rules.some((r) => r.id === '__proto__' || r.id === 'prototype'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
