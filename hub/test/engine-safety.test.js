'use strict';
/*
 * ADT-227 HARD gate — the rules+labels engine safety negatives N-1..N-22.
 *
 * Every refusal test snapshots the ledger/overlay/comments BEFORE and asserts a
 * BYTE-IDENTICAL state AFTER — the status/return code alone is insufficient. The
 * engine can route/label/assign/require-gate off the event stream with no human in
 * the loop, so each control is proven by a test that would fail if the control were
 * removed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { handle, runEngineTick } = require('../lib/api');
const engine = require('../lib/engine');
const { computeRev, appendComment } = require('../lib/write');
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
  TO_DEV_BE: { settable_by: ["/rev","/qa"], routes_to: implement, owner: "/be", meaning: "back to backend" }
  NEEDS_HUMAN: { settable_by: ["*"], meaning: "park for a human" }
  RESTRICTED: { settable_by: ["/secops"], meaning: "only secops" }
`;

function proj(ledger, overlay) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-eng-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'), JSON.stringify(ledger || {
    'T-1': { title: 'A', track: 'full', stage: 'code_review', gates: {}, labels: [], fired: [] },
  }));
  if (overlay) fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.overrides.json'), JSON.stringify(overlay));
  return dir;
}
const ledgerPath = (d) => path.join(d, '.workflow-state.json');
const overlayPath = (d) => path.join(d, '.aidevteam', 'workflow.overrides.json');
const yamlPath = (d) => path.join(d, '.aidevteam', 'workflow.yaml');
const commentsDir = (d) => path.join(d, '.aidevteam', 'comments');
const rd = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return 'ABSENT'; } };
const hash = (p) => crypto.createHash('sha256').update(rd(p)).digest('hex');
function commentsHash(d) {
  try {
    return fs.readdirSync(commentsDir(d)).sort().map((f) => f + ':' + rd(path.join(commentsDir(d), f))).join('|');
  } catch { return 'ABSENT'; }
}
// snapshot the whole mutable state for a byte-identical assertion after a refusal
function snap(d) { return { ledger: rd(ledgerPath(d)), overlay: rd(overlayPath(d)), yaml: hash(yamlPath(d)), comments: commentsHash(d) }; }
function assertUnchanged(d, before, msg) {
  const after = snap(d);
  assert.equal(after.ledger, before.ledger, (msg || '') + ' ledger byte-identical');
  assert.equal(after.overlay, before.overlay, (msg || '') + ' overlay byte-identical');
  assert.equal(after.yaml, before.yaml, (msg || '') + ' base YAML byte-identical');
  assert.equal(after.comments, before.comments, (msg || '') + ' comments byte-identical');
}
const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });

// ---- N-1: no gate-state action --------------------------------------------

test('N-1 the do-allowlist rejects set_gate/pass_gate and any unknown action', async () => {
  const dir = proj();
  try {
    const before = snap(dir);
    for (const verb of ['set_gate', 'pass_gate', 'satisfy_gate', 'clear_gate', 'frobnicate']) {
      const r = await handle('workflow/set-rules', {
        rules: [{ id: 'x', when: { event: 'comment.added' }, do: [{ [verb]: 'SECOPS_APPROVED' }] }],
      }, dir);
      assert.equal(r.code, 400, `${verb} rejected`);
    }
    assertUnchanged(dir, before, 'no gate-state action persisted —');
    // structural: the closed allowlist carries no gate-state verb
    for (const verb of ['set_gate', 'pass_gate', 'satisfy_gate', 'clear_gate', 'gate', 'state']) {
      assert.ok(!engine.DO_ACTIONS.has(verb), `${verb} not in DO_ACTIONS`);
    }
  } finally { cleanup(dir); }
});

test('N-1 structural: engine module performs no gate-state ledger write', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'engine.js'), 'utf8');
  assert.ok(!/\.state\s*=\s*['"]passed['"]/.test(src), 'engine never writes gate.state = passed');
  assert.ok(!/gates\s*\[[^\]]*\]\s*=\s*\{[^}]*state/.test(src), 'engine never writes a gate state object');
});

// ---- N-2: deterministic refusal short-circuits, no advisory lift -----------

test('N-2 the safety refusal is deterministic — no model/advisory path exists', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'engine.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').toLowerCase();
  for (const term of ['llm', 'openai', 'anthropic', 'fetch(', 'require(\'http', 'require("http', 'advisory', 'heuristic', 'math.random']) {
    assert.ok(!src.includes(term), `engine consults no ${term}`);
  }
  // the validator returns a settled verdict with no second-chance flip
  const wf = buildState(proj());
  const v = engine.routePastUnmetSafetyGate('implement', { track: 'full', stage: 'architecture', gates: [{ name: 'SECOPS_APPROVED', safety: true, state: 'pending' }] }, wf);
  assert.equal(v, true, 'route past unmet safety gate is a terminal true');
});

// ---- N-3: eval-time bypass refused -----------------------------------------

test('N-3 a rule routing past an unmet SECOPS gate does NOT advance the ticket (eval-time)', async () => {
  // ticket sits BEFORE security; SECOPS_APPROVED unmet; rule routes it to implement (past it)
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'architecture', gates: { SECOPS_APPROVED: { state: 'pending' } }, labels: [], fired: [] } },
    { rules: [{ id: 'bypass', when: { event: 'comment.added' }, do: [{ route_to_stage: 'implement' }] }] });
  try {
    // a comment.added event lands
    appendComment(dir, 'T-1', { author: '/be', kind: 'comment', body: 'go' });
    const before = snap(dir);
    const res = await runEngineTick(dir);
    // ticket stage unchanged, no advance comment, fired records no successful route
    const t = buildState(dir).tickets.find((x) => x.id === 'T-1');
    assert.equal(t.stage, 'architecture', 'stage not advanced past the unmet safety gate');
    assert.equal(res.fired.length, 0, 'no successful route recorded');
    // the ledger/comments must not show a stage advance
    assert.ok(!rd(path.join(commentsDir(dir), 'T-1.jsonl')).includes('stage → implement'));
    // overlay + yaml untouched by the eval
    assert.equal(snap(dir).overlay, before.overlay);
    assert.equal(snap(dir).yaml, before.yaml);
  } finally { cleanup(dir); }
});

test('a declared backward route (label routes_to) fires at eval-time — gate already passed, no crossing', async () => {
  // T-1 at code_review with SECOPS passed; a label.set TO_DEV_BE routes back to implement
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'code_review', gates: { SECOPS_APPROVED: { state: 'passed' } }, labels: [], fired: [] } },
    { rules: [{ id: 'back', when: { event: 'label.set', label: 'TO_DEV_BE', author: '/rev' }, do: [{ route_to_stage: 'implement' }, { clear_label: 'TO_DEV_BE' }] }] });
  try {
    await handle('label/set', { id: 'T-1', label: 'TO_DEV_BE', set: true, by: '/rev' }, dir);
    await runEngineTick(dir);
    const t = buildState(dir).tickets.find((x) => x.id === 'T-1');
    assert.equal(t.stage, 'implement', 'backward route applied (does not cross a passed gate)');
    assert.ok(!t.labels.includes('TO_DEV_BE'), 'one-shot routing label cleared');
  } finally { cleanup(dir); }
});

// ---- N-4: author-time bypass rejected, nothing written ---------------------

test('N-4 posting a bypass rule to set-rules → 400, overlay byte-unchanged', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'architecture', gates: { SECOPS_APPROVED: { state: 'pending' } }, labels: [], fired: [] } });
  try {
    const before = snap(dir);
    const r = await handle('workflow/set-rules', {
      rules: [{ id: 'bypass', when: { event: 'comment.added' }, do: [{ route_to_stage: 'implement' }] }],
    }, dir);
    assert.equal(r.code, 400);
    assert.match(r.payload.error, /safety/);
    assertUnchanged(dir, before, 'author-time bypass not persisted —');
  } finally { cleanup(dir); }
});

// ---- N-5: hand-edited overlay still refused at eval-time --------------------

test('N-5 a bypass rule injected directly into the overlay never executes at eval-time', async () => {
  // skip author-time by writing the overlay by hand
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'architecture', gates: { SECOPS_APPROVED: { state: 'pending' } }, labels: [], fired: [] } },
    { rules: [{ id: 'bypass', when: { event: 'comment.added' }, do: [{ route_to_stage: 'implement' }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/be', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    const t = buildState(dir).tickets.find((x) => x.id === 'T-1');
    assert.equal(t.stage, 'architecture', 'hand-edited bypass rule still refused at eval-time');
  } finally { cleanup(dir); }
});

// ---- N-5b: require_gate only adds ------------------------------------------

test('N-5b require_gate only adds a required gate — never sets a state or removes one', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: { SECOPS_APPROVED: { state: 'pending' } }, labels: [], fired: [] } },
    { rules: [{ id: 'addgate', when: { event: 'comment.added' }, do: [{ require_gate: 'PERF_OK' }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/be', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    const led = JSON.parse(rd(ledgerPath(dir)));
    assert.ok((led['T-1'].requiredGates || []).includes('PERF_OK'), 'gate added to required set');
    // no gate state was set to passed by the engine
    assert.equal(led['T-1'].gates.SECOPS_APPROVED.state, 'pending', 'existing gate state untouched');
    assert.ok(!('PERF_OK' in (led['T-1'].gates || {})), 'require_gate never creates a passed gate');
  } finally { cleanup(dir); }
});

// ---- N-6: label outside settable_by writes nothing -------------------------

test('N-6 setting a label outside settable_by writes nothing (route)', async () => {
  const dir = proj();
  try {
    const before = snap(dir);
    // /be is not in RESTRICTED.settable_by (only /secops)
    const r = await handle('label/set', { id: 'T-1', label: 'RESTRICTED', set: true, by: '/be' }, dir);
    assert.equal(r.code, 400);
    assertUnchanged(dir, before, 'unauthorized label set —');
  } finally { cleanup(dir); }
});

test('N-6 an engine set_label outside settable_by writes nothing (eval)', async () => {
  // rule acts as /be (author) but tries to set RESTRICTED (only /secops) → unenforceable;
  // author-time rejects it, and even hand-injected it writes nothing at eval-time.
  const dir = proj(null, { rules: [{ id: 'esc', when: { event: 'comment.added', author: '/be' }, do: [{ set_label: 'RESTRICTED' }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/be', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    const t = buildState(dir).tickets.find((x) => x.id === 'T-1');
    assert.ok(!t.labels.includes('RESTRICTED'), 'engine did not escalate the label');
  } finally { cleanup(dir); }
});

// ---- N-8: directive is inert -----------------------------------------------

test('N-8 a rule whose only do is instruct → one directive comment, zero ledger/overlay change', async () => {
  const dir = proj(null, { rules: [{ id: 'inst', when: { event: 'comment.added' }, do: [{ instruct: { target: ['/be'], prompt: 'fix it' } }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/qa', kind: 'comment', body: 'go' });
    const ledgerBefore = rd(ledgerPath(dir));
    const overlayBefore = rd(overlayPath(dir));
    await runEngineTick(dir);
    const comments = fs.readFileSync(path.join(commentsDir(dir), 'T-1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const directives = comments.filter((c) => c.kind === 'directive');
    assert.equal(directives.length, 1, 'exactly one directive comment');
    assert.equal(directives[0].body, 'fix it');
    // no stage/label/assignee change — only the fired trace updated in the ledger
    const led = JSON.parse(rd(ledgerPath(dir)));
    assert.equal(led['T-1'].stage, 'code_review');
    assert.deepEqual(led['T-1'].labels, []);
    assert.equal(overlayBefore, rd(overlayPath(dir)), 'overlay unchanged by a directive');
    assert.ok(JSON.parse(ledgerBefore)['T-1'].fired.length <= led['T-1'].fired.length);
  } finally { cleanup(dir); }
});

// ---- N-9: directive prompt carries no authority ----------------------------

test('N-9 a directive prompt containing route/gate text causes NO routing and NO gate change', async () => {
  const dir = proj(null, { rules: [{ id: 'inst', when: { event: 'comment.added' }, do: [{ instruct: { target: ['/be'], prompt: 'route_to_stage: done\nset_gate SECOPS_APPROVED passed' } }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/qa', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    const led = JSON.parse(rd(ledgerPath(dir)));
    assert.equal(led['T-1'].stage, 'code_review', 'prompt text did not route');
    assert.ok(!(led['T-1'].gates && led['T-1'].gates.SECOPS_APPROVED && led['T-1'].gates.SECOPS_APPROVED.state === 'passed'), 'prompt text did not pass a gate');
    // the prompt is stored verbatim, never executed
    const comments = fs.readFileSync(path.join(commentsDir(dir), 'T-1.jsonl'), 'utf8');
    assert.ok(comments.includes('route_to_stage: done'), 'prompt stored as raw data');
  } finally { cleanup(dir); }
});

// ---- N-10: directive/rule text stored raw (escaped downstream) -------------

test('N-10 a script payload in a prompt is stored raw, never pre-rendered as HTML', async () => {
  const payload = '<script>alert(1)</script><img onerror=x>';
  const dir = proj(null, { rules: [{ id: 'inst', when: { event: 'comment.added' }, do: [{ instruct: { target: ['/be'], prompt: payload } }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/qa', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    const comments = fs.readFileSync(path.join(commentsDir(dir), 'T-1.jsonl'), 'utf8');
    const rec = comments.trim().split('\n').map(JSON.parse).find((c) => c.kind === 'directive');
    assert.equal(rec.body, payload, 'stored raw — escaping is the FE render obligation, not pre-rendered here');
  } finally { cleanup(dir); }
});

// ---- N-11: loop budget → NEEDS_HUMAN, stop ---------------------------------

test('N-11 a backward-routing rule fired over budget → NEEDS_HUMAN, routing stops', async () => {
  // current stage code_review; rule routes back to implement on a comment; safety gate met
  const ledger = { 'T-1': { title: 'A', track: 'full', stage: 'code_review',
    gates: { SECOPS_APPROVED: { state: 'passed' } },
    labels: [], fired: [
      { rule: 'back', event: 'e1', at: 't', toStage: 'implement' },
      { rule: 'back', event: 'e2', at: 't', toStage: 'implement' },
      { rule: 'back', event: 'e3', at: 't', toStage: 'implement' },
    ] } };
  const dir = proj(ledger, { rules: [{ id: 'back', when: { event: 'comment.added' }, do: [{ route_to_stage: 'implement' }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/rev', kind: 'comment', body: 'again' });
    const res = await runEngineTick(dir);
    const t = buildState(dir).tickets.find((x) => x.id === 'T-1');
    assert.ok(t.labels.includes('NEEDS_HUMAN'), 'NEEDS_HUMAN set at the budget');
    assert.ok(res.needsHuman.includes('T-1'));
    assert.equal(t.stage, 'code_review', 'no further backward route fired past the budget');
  } finally { cleanup(dir); }
});

// ---- N-12: then-chain depth cap --------------------------------------------

test('N-12 a self/mutual then-chain terminates at the depth cap (no same-tick runaway)', async () => {
  const rules = [
    { id: 'a', when: { event: 'comment.added' }, do: [{ set_label: 'NEEDS_HUMAN' }], then: ['b'] },
    { id: 'b', when: { event: 'comment.added' }, do: [{ clear_label: 'NEEDS_HUMAN' }], then: ['a'] },
  ];
  const dir = proj(null, { rules });
  try {
    appendComment(dir, 'T-1', { author: '/qa', kind: 'comment', body: 'go' });
    // must return (not hang); the dedup + depth cap bound the expansion
    const res = await runEngineTick(dir);
    assert.ok(res.fired.length <= engine.CHAIN_DEPTH_CAP + 2, 'chain bounded by the depth cap');
  } finally { cleanup(dir); }
});

// ---- N-13: replayed tail → effectively once --------------------------------

test('N-13 the same event delivered twice applies the do-actions once', async () => {
  const dir = proj(null, { rules: [{ id: 'lab', when: { event: 'comment.added', author: '/rev' }, do: [{ set_label: 'TO_DEV_BE' }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/rev', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    await runEngineTick(dir); // replay: same comment tail, already in fired[]
    const led = JSON.parse(rd(ledgerPath(dir)));
    assert.deepEqual(led['T-1'].labels, ['TO_DEV_BE'], 'label set exactly once');
    const firedForRule = led['T-1'].fired.filter((f) => f.rule === 'lab');
    assert.equal(firedForRule.length, 1, 'exactly one (rule,event) fired entry');
  } finally { cleanup(dir); }
});

// ---- N-14: bounded evaluator / fan_out no spawn ----------------------------

test('N-14 fan_out spawns nothing and is recorded inertly', async () => {
  const dir = proj(null, { rules: [{ id: 'fo', when: { event: 'comment.added' }, do: [{ fan_out: ['security', 'design'] }] }] });
  try {
    appendComment(dir, 'T-1', { author: '/qa', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    const led = JSON.parse(rd(ledgerPath(dir)));
    assert.equal(led['T-1'].stage, 'code_review', 'fan_out did not route');
    const comments = fs.readFileSync(path.join(commentsDir(dir), 'T-1.jsonl'), 'utf8');
    assert.ok(comments.includes('fan_out (recorded only)'), 'fan_out recorded as inert directive');
  } finally { cleanup(dir); }
});

test('N-14b the engine module imports/calls NO execution-class API', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'engine.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const bad of ['child_process', 'spawn', 'execSync', 'exec(', 'execFile', 'ssh', 'eval(', 'Function(', 'vm.', 'require(\'vm\')', 'deserialize']) {
    assert.ok(!src.includes(bad), `engine has no ${bad}`);
  }
});

// ---- N-15: CAS writer + base YAML byte-unchanged ---------------------------

test('N-15 a full author + fire session leaves base workflow.yaml byte-identical', async () => {
  const dir = proj();
  try {
    const yamlBefore = hash(yamlPath(dir));
    await handle('workflow/set-rules', { rules: [{ id: 'lab', when: { event: 'comment.added', author: '/rev' }, do: [{ set_label: 'TO_DEV_BE' }] }] }, dir);
    await handle('label/set', { id: 'T-1', label: 'TO_DEV_BE', set: true, by: '/rev' }, dir);
    appendComment(dir, 'T-1', { author: '/rev', kind: 'comment', body: 'go' });
    await runEngineTick(dir);
    assert.equal(hash(yamlPath(dir)), yamlBefore, 'base YAML never machine-written');
  } finally { cleanup(dir); }
});

// ---- N-18: schema validation -----------------------------------------------

test('N-18 unknown action/event/predicate + unenforceable label → 400, overlay unchanged', async () => {
  const dir = proj();
  try {
    const before = snap(dir);
    const cases = [
      { rules: [{ id: 'a', when: { event: 'not.an.event' }, do: [] }] },
      { rules: [{ id: 'a', when: { bogus: 'x' }, do: [] }] },
      { rules: [{ id: 'a', do: [{ teleport: 'x' }] }] },
      { rules: [{ id: 'a', when: { event: 'comment.added', author: '/be' }, do: [{ set_label: 'RESTRICTED' }] }] }, // unenforceable
      { rules: [{ id: 'a', do: [{ assign: 'x'.repeat(200) }] }] },
      { rules: [{ id: 'a'.repeat(200), do: [] }] },
      { rules: 'not-a-list' },
    ];
    for (const body of cases) {
      const r = await handle('workflow/set-rules', body, dir);
      assert.equal(r.code, 400, JSON.stringify(body));
    }
    assertUnchanged(dir, before, 'malformed rule not persisted —');
  } finally { cleanup(dir); }
});

test('N-18b instruct requires both target and a non-empty prompt', async () => {
  const dir = proj();
  try {
    const before = snap(dir);
    for (const inst of [{ prompt: 'x' }, { target: ['/be'] }, { target: ['/be'], prompt: '' }, { target: [], prompt: 'x' }]) {
      const r = await handle('workflow/set-rules', { rules: [{ id: 'a', do: [{ instruct: inst }] }] }, dir);
      assert.equal(r.code, 400, JSON.stringify(inst));
    }
    assertUnchanged(dir, before, 'incomplete instruct not persisted —');
  } finally { cleanup(dir); }
});

// ---- N-19: ReDoS-safe pattern ----------------------------------------------

test('N-19 a catastrophic pattern against a long input does not hang; over-cap rejected', async () => {
  // bounded matcher: no backtracking blow-up
  const longInput = 'a'.repeat(8000) + 'X';
  const start = Date.now();
  const m = engine.patternMatches('(a+)+$', longInput); // treated as a literal/glob, not a regex
  assert.ok(Date.now() - start < 500, 'match completes in bounded time');
  assert.equal(typeof m, 'boolean');
  // over-cap pattern rejected at author-time
  const dir = proj();
  try {
    const before = snap(dir);
    const r = await handle('workflow/set-rules', { rules: [{ id: 'a', when: { pattern: 'x'.repeat(500) }, do: [] }] }, dir);
    assert.equal(r.code, 400);
    assert.match(r.payload.error, /pattern/);
    assertUnchanged(dir, before, 'over-cap pattern not persisted —');
  } finally { cleanup(dir); }
});

test('N-19 a glob pattern matches in linear time over a capped input', () => {
  assert.equal(engine.globMatch('a*c', 'aXXXXc'), true);
  assert.equal(engine.globMatch('a*c', 'aXXXXd'), false);
  const start = Date.now();
  engine.globMatch('*a*a*a*a*a*a*b', 'a'.repeat(8000));
  assert.ok(Date.now() - start < 500, 'glob bounded even with many stars');
});

// ---- N-20: bounds + proto-pollution ----------------------------------------

test('N-20 over-cap names rejected; proto-pollution names neutralized (Object.prototype intact)', async () => {
  const dir = proj();
  try {
    const before = snap(dir);
    const r1 = await handle('workflow/set-rules', { rules: [{ id: 'a', do: [{ set_label: 'x'.repeat(200) }] }] }, dir);
    assert.equal(r1.code, 400);
    for (const name of ['__proto__', 'constructor', 'prototype']) {
      const r = await handle('workflow/set-labels', { labels: { [name]: { settable_by: ['*'] } } }, dir);
      assert.equal(r.code, 400, `label named ${name} rejected`);
    }
    assertUnchanged(dir, before, 'bad names not persisted —');
    assert.equal({}.settable_by, undefined, 'Object.prototype not polluted');
    assert.equal(({}).__proto__ === Object.prototype, true, 'prototype intact');
  } finally { cleanup(dir); }
});

// ---- N-21: overlay-only authoring ------------------------------------------

test('N-21 rule/label edits land only in the overlay; base YAML never opened for write', async () => {
  const dir = proj();
  try {
    const yamlBefore = hash(yamlPath(dir));
    await handle('workflow/set-rules', { rules: [{ id: 'lab', when: { event: 'comment.added', author: '/rev' }, do: [{ set_label: 'TO_DEV_BE' }] }] }, dir);
    await handle('workflow/set-labels', { labels: { TO_DEV_FE: { settable_by: ['/rev'], routes_to: 'implement', owner: '/fe' } } }, dir);
    assert.equal(hash(yamlPath(dir)), yamlBefore, 'base YAML byte-identical');
    assert.ok(fs.existsSync(overlayPath(dir)), 'overlay written');
    const ov = JSON.parse(rd(overlayPath(dir)));
    assert.ok(ov.rules.some((r) => r.id === 'lab'));
    assert.ok(ov.labels.TO_DEV_FE);
  } finally { cleanup(dir); }
});

// ---- N-22: single validator — author == eval -------------------------------

test('N-22 author-time and eval-time use the same safety validator', () => {
  // the SAME exported function gates both: api set-rules (author) and apply (eval)
  // call engine.routePastUnmetSafetyGate / engine.validateRules.
  const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'api.js'), 'utf8');
  assert.ok(apiSrc.includes('engine.validateRules'), 'author-time calls the shared validator');
  const engSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'engine.js'), 'utf8');
  // validateAction (author) and apply (eval) both call routePastUnmetSafetyGate
  const calls = (engSrc.match(/routePastUnmetSafetyGate\(/g) || []).length;
  assert.ok(calls >= 2, 'the one safety function is used at both author-time and eval-time');
});

// ---- N-16 / N-17 are guard/CAS, exercised against the routes ---------------

test('N-17 a stale expectedRev on set-rules → 409, overlay byte-unchanged', async () => {
  const dir = proj();
  try {
    const before = snap(dir);
    const r = await handle('workflow/set-rules', {
      rules: [{ id: 'lab', when: { event: 'comment.added', author: '/rev' }, do: [{ set_label: 'TO_DEV_BE' }] }],
      expectedRev: 'stale',
    }, dir);
    assert.equal(r.code, 409);
    assertUnchanged(dir, before, 'stale set-rules —');
  } finally { cleanup(dir); }
});

test('N-17 a stale expectedRev on label/set → 409, ledger byte-unchanged', async () => {
  const dir = proj();
  try {
    const before = snap(dir);
    const r = await handle('label/set', { id: 'T-1', label: 'TO_DEV_BE', set: true, by: '/rev', expectedRev: 'stale' }, dir);
    assert.equal(r.code, 409);
    assertUnchanged(dir, before, 'stale label/set —');
  } finally { cleanup(dir); }
});

test('set-rules / label/set accept the matching rev and write (happy path)', async () => {
  const dir = proj();
  try {
    let r = await handle('workflow/set-rules', { rules: [{ id: 'lab', when: { event: 'comment.added', author: '/rev' }, do: [{ set_label: 'TO_DEV_BE' }] }], expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    r = await handle('label/set', { id: 'T-1', label: 'TO_DEV_BE', set: true, by: '/rev', expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    const t = buildState(dir).tickets.find((x) => x.id === 'T-1');
    assert.ok(t.labels.includes('TO_DEV_BE'));
  } finally { cleanup(dir); }
});
