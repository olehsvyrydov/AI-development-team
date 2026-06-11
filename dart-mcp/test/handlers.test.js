'use strict';
/*
 * DART write-back tool handlers — the security negatives.
 *
 * Each tool handler is exercised directly as a pure (args, projectDir) → { code, payload }
 * function against a tmp project (the api.test.js pattern). Where a refusal involves state,
 * the test snapshots the ledger / overlay / comment log BEFORE and asserts a byte-identical
 * state AFTER — a status code alone is insufficient. Every test would fail if its control
 * were removed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { invoke, WRITE_TOOLS, READ_TOOLS } = require('../src/handlers');
const { TOOLS } = require('../src/tools');
const { resolveBoundProject } = require('../src/bind-project');
const { computeRev, appendComment } = require('../../hub/lib/write');
const { buildState } = require('../../hub/lib/state');

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
  RESTRICTED: { settable_by: ["/secops"], meaning: "only secops" }
presets:
  solo: { always_required: [] }
`;

function proj(ledger) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-mcp-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aidevteam', 'workflow.yaml'), WF);
  fs.writeFileSync(path.join(dir, '.workflow-state.json'), JSON.stringify(ledger || {}));
  return dir;
}
function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }
function rd(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function commentsFile(dir, id) { return path.join(dir, '.aidevteam', 'comments', `${id}.jsonl`); }
function ledgerFile(dir) { return path.join(dir, '.workflow-state.json'); }
function overlayFile(dir) { return path.join(dir, '.aidevteam', 'workflow.overrides.json'); }
function yamlFile(dir) { return path.join(dir, '.aidevteam', 'workflow.yaml'); }
function snap(dir) {
  return { ledger: rd(ledgerFile(dir)), overlay: rd(overlayFile(dir)), yaml: rd(yamlFile(dir)) };
}
function assertNoWrite(dir, id, before) {
  assert.equal(rd(ledgerFile(dir)), before.ledger, 'ledger byte-unchanged');
  assert.equal(rd(overlayFile(dir)), before.overlay, 'overlay byte-unchanged');
  assert.equal(rd(commentsFile(dir, id)), before.comment, 'comment log byte-unchanged');
}

// ---- happy path: each tool delegates 1:1 to its api.handle route ----------------------

test('write tools map 1:1 to api.handle and read tools project buildState', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  try {
    let rev = computeRev(dir);
    let r = await invoke('dart_assign', { id: 'T-1', assignee: '/be', by: '/sm', expectedRev: rev }, dir);
    assert.equal(r.code, 200);
    assert.equal(buildState(dir).tickets[0].assignee, '/be');

    rev = computeRev(dir);
    r = await invoke('dart_advance_ticket', { id: 'T-1', toStage: 'code_review', by: '/be', expectedRev: rev }, dir);
    assert.equal(r.code, 200);
    assert.equal(buildState(dir).tickets[0].stage, 'code_review');

    rev = computeRev(dir);
    r = await invoke('dart_set_gate', { id: 'T-1', gate: 'CODE_REVIEWED', state: 'passed', by: '/rev', expectedRev: rev }, dir);
    assert.equal(r.code, 200);
    assert.equal(buildState(dir).tickets[0].gates.find((g) => g.name === 'CODE_REVIEWED').state, 'passed');

    r = await invoke('dart_comment', { id: 'T-1', body: 'note', author: '/be' }, dir);
    assert.equal(r.code, 200);

    const read = invoke('dart_read_state', {}, dir);
    assert.equal(read.code, 200);
    assert.equal(read.payload.state.tickets[0].id, 'T-1');
    const dirs = invoke('dart_pending_directives', {}, dir);
    assert.ok(Array.isArray(dirs.payload.directives));
  } finally { cleanup(dir); }
});

// ---- N237-1 — single writer (import-graph / source scan) ------------------------------

test('N237-1 the module import graph reaches the ledger ONLY through api.handle', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = strip(rd(path.join(srcDir, f)));
    assert.ok(!/require\(\s*['"][^'"]*lib\/write['"]\s*\)/.test(src), `${f} must not require write.js`);
    assert.ok(!/\.workflow-state\.json/.test(src), `${f} must not open the ledger file`);
    assert.ok(!/workflow\.overrides\.json/.test(src), `${f} must not open the overlay file`);
    assert.ok(!/engineIO\s*\(/.test(src), `${f} must not construct a parallel engineIO`);
  }
  // handlers.js must not call any fs writer against a project file
  const handlers = strip(rd(path.join(srcDir, 'handlers.js')));
  assert.ok(!/fs\.(write|appendFile|truncate|rm|unlink)/.test(handlers), 'handlers.js must not call fs writers');
  assert.ok(!/require\(\s*['"]node:fs['"]/.test(handlers) && !/require\(\s*['"]fs['"]/.test(handlers), 'handlers.js does not even import fs');
});

// ---- N237-2a — a tool cannot route past an unmet safety_override gate ------------------

test('N237-2a no MCP tool exposes a rule/automation route that bypasses routePastUnmetSafetyGate', () => {
  // The single safety validator lives in the engine and governs the AUTOMATION (rule-eval)
  // route. The MCP surface exposes no rule-evaluation/automation tool, so it cannot drive a
  // ticket past an unmet safety gate by automation — there is no engine-route tool at all.
  const srcDir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(srcDir).filter((x) => x.endsWith('.js'))) {
    const src = rd(path.join(srcDir, f));
    assert.ok(!/runEngineTick|engine\.apply|selectRules|deriveEvents/.test(src),
      `${f} must not invoke the rule engine (no automation route surface)`);
  }
  // and the do-allowlist still has no gate-pass action (the invariant the route relies on)
  const engine = require('../../hub/lib/engine');
  assert.ok(!engine.DO_ACTIONS.has('set_gate') && !engine.DO_ACTIONS.has('pass_gate') && !engine.DO_ACTIONS.has('clear_gate'),
    'engine exposes no gate-pass/clear do-action');
});

// ---- N237-2b — there is NO gate-pass tool ---------------------------------------------

test('N237-2b the tool surface contains no gate-pass / gate-clear / gate-satisfy tool', () => {
  const names = TOOLS.map((t) => t.name);
  for (const banned of ['dart_pass_gate', 'dart_clear_gate', 'dart_satisfy_gate', 'dart_approve_gate']) {
    assert.ok(!names.includes(banned), `must not expose ${banned}`);
  }
  // the only gate-state tool is dart_set_gate, which delegates to gate/set (owner decision)
  assert.equal(TOOLS.find((t) => t.name === 'dart_set_gate').route, 'gate/set');
  // gate/set can record any GATE_STATE, but automation has no tool that calls it on its behalf
  // without an explicit `by` owner — there is no automation shortcut in the surface.
  assert.equal(names.filter((n) => /gate/.test(n)).sort().join(','), 'dart_require_gate,dart_set_gate');
});

// ---- N237-2c — unauthorized label set writes nothing ----------------------------------

test('N237-2c dart_set_label by an unauthorized agent writes nothing', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  appendComment(dir, 'T-1', { author: '/be', kind: 'comment', body: 'seed' });
  const before = { ...snap(dir), comment: rd(commentsFile(dir, 'T-1')) };
  try {
    const r = await invoke('dart_set_label', { id: 'T-1', label: 'RESTRICTED', by: '/be', expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 400, 'refused');
    assertNoWrite(dir, 'T-1', before);
    assert.deepEqual(buildState(dir).tickets[0].labels, [], 'no label added');
  } finally { cleanup(dir); }
});

test('N237-2c (positive control) an AUTHORIZED label set does write', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  try {
    const r = await invoke('dart_set_label', { id: 'T-1', label: 'RESTRICTED', by: '/secops', expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    assert.deepEqual(buildState(dir).tickets[0].labels, ['RESTRICTED']);
  } finally { cleanup(dir); }
});

// ---- N237-2d — require_gate is add-only -----------------------------------------------

test('N237-2d dart_require_gate is add-only — no remove/satisfy form, never sets gate state', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'architecture', gates: {}, labels: [] } });
  try {
    const r = await invoke('dart_require_gate', { gate: 'SECOPS_APPROVED', trigger: ['track:full'], expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    // it touched only the overlay gate config, never a gate STATE on the ticket
    const t = buildState(dir).tickets[0];
    assert.equal(t.gates.find((g) => g.name === 'SECOPS_APPROVED').state, 'pending', 'gate state unchanged by require');
    // the handler/tool exposes no remove or satisfy argument
    const tool = TOOLS.find((x) => x.name === 'dart_require_gate');
    assert.ok(!('remove' in tool.input) && !('satisfy' in tool.input) && !('state' in tool.input),
      'require_gate input has no remove/satisfy/state field');
  } finally { cleanup(dir); }
});

// ---- N237-3 — stale expectedRev → conflict, nothing written ---------------------------

test('N237-3 a stale expectedRev write is a conflict that changes nothing', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  appendComment(dir, 'T-1', { author: '/be', kind: 'comment', body: 'seed' });
  const before = { ...snap(dir), comment: rd(commentsFile(dir, 'T-1')) };
  try {
    const r = await invoke('dart_advance_ticket', { id: 'T-1', toStage: 'code_review', expectedRev: 'stale-rev', by: '/be' }, dir);
    assert.equal(r.code, 409);
    assert.equal(r.payload.conflict, true);
    assertNoWrite(dir, 'T-1', before);
    assert.equal(buildState(dir).tickets[0].stage, 'implement', 'stage unchanged');
  } finally { cleanup(dir); }
});

// ---- N237-3b — base workflow.yaml byte-unchanged after an overlay-mutating tool -------

test('N237-3b base workflow.yaml is byte-unchanged after dart_require_gate (overlay-only)', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'architecture', gates: {}, labels: [] } });
  const yamlBefore = rd(yamlFile(dir));
  try {
    const r = await invoke('dart_require_gate', { gate: 'ARCH_APPROVED', owner: '/arch', expectedRev: computeRev(dir) }, dir);
    assert.equal(r.code, 200);
    assert.equal(rd(yamlFile(dir)), yamlBefore, 'base YAML untouched');
    assert.ok(rd(overlayFile(dir)) != null, 'only the overlay moved');
  } finally { cleanup(dir); }
});

// ---- N237-4 — no-exec import graph ----------------------------------------------------

test('N237-4 the module import graph is free of exec sinks and eval', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const banned = [/child_process/, /\bexec\b/, /\bexecSync\b/, /\bspawn\b/, /\bfork\b/, /\bssh\b/, /require\(\s*['"]node:vm['"]/, /\bvm\b/, /\beval\(/, /new\s+Function\s*\(/];
  function scan(file, seen) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = rd(file);
    if (src == null) return;
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const re of banned) assert.ok(!re.test(stripped), `${path.basename(file)} must not contain ${re}`);
    // follow first-party relative imports only (the bundled SDK/zod transport is excluded by design)
    const importRe = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    let m;
    while ((m = importRe.exec(stripped))) {
      let target = path.resolve(path.dirname(file), m[1]);
      if (!target.endsWith('.js')) target += '.js';
      if (fs.existsSync(target)) scan(target, seen);
    }
  }
  // the dart-mcp own source + the hub modules it pulls in (api, state, project-id)
  for (const entry of ['handlers.js', 'tools.js', 'bind-project.js']) {
    scan(path.join(srcDir, entry), new Set());
  }
});

// ---- N237-4b — a directive/tool arg cannot execute ------------------------------------

test('N237-4b a directive-shaped tool arg is stored as inert data, never executed', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  try {
    const payload = '$(rm -rf ~); reboot; `whoami`';
    const r = await invoke('dart_comment', { id: 'T-1', body: payload, kind: 'directive', author: '/sm' }, dir);
    assert.equal(r.code, 200);
    // the body is persisted verbatim as data; the engine derives no event from a directive
    const engine = require('../../hub/lib/engine');
    const rec = JSON.parse(rd(commentsFile(dir, 'T-1')).trim());
    assert.equal(rec.body, payload, 'stored verbatim');
    assert.equal(engine.eventFromComment(rec), null, 'a directive triggers no engine event');
  } finally { cleanup(dir); }
});

// ---- N237-5 — no listening socket / port ----------------------------------------------

test('N237-5 nothing in the server opens a listening socket or port', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(srcDir).filter((x) => x.endsWith('.js'))) {
    const src = rd(path.join(srcDir, f)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/\.listen\s*\(/.test(src), `${f} must not call .listen()`);
    assert.ok(!/createServer/.test(src), `${f} must not create a network server`);
    assert.ok(!/require\(\s*['"]node:(net|http|https|http2|tls|dgram)['"]/.test(src), `${f} must not import a network module`);
  }
});

// ---- N237-5b — bound-project only (a tool arg cannot retarget another project) --------

test('N237-5b a tool argument cannot retarget another project', async () => {
  const bound = proj({ 'T-1': { title: 'Bound', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  const foreign = proj({ 'T-1': { title: 'Foreign', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  try {
    // even if a client passes path/project/dir/cwd fields, they are ignored — the write lands
    // in the bound project only, because handlers take projectDir as a fixed parameter.
    const r = await invoke('dart_advance_ticket', {
      id: 'T-1', toStage: 'code_review', by: '/be', expectedRev: computeRev(bound),
      project: foreign, path: foreign, dir: foreign, cwd: foreign, projectDir: foreign,
    }, bound);
    assert.equal(r.code, 200);
    assert.equal(buildState(bound).tickets[0].stage, 'code_review', 'bound project advanced');
    assert.equal(buildState(foreign).tickets[0].stage, 'implement', 'foreign project untouched');
  } finally { cleanup(bound); cleanup(foreign); }
});

test('N237-5b the handler signature accepts no path field — only (args, projectDir)', () => {
  // No handler reads a path/dir/cwd field from args; the bound dir is the second parameter.
  const handlers = rd(path.join(__dirname, '..', 'src', 'handlers.js'));
  assert.ok(!/args\.(path|dir|cwd|projectDir|project)\b/.test(handlers), 'handlers ignore any client path field');
  // resolveBoundProject only consults argv (absolute) + cwd, never a tool argument
  const bind = rd(path.join(__dirname, '..', 'src', 'bind-project.js'));
  assert.ok(/resolveBoundProject\s*\(\s*argv/.test(bind), 'binding is from argv/cwd at spawn');
});

// ---- N237-6 — no secret persisted / logged --------------------------------------------

test('N237-6 no tool accepts a credential parameter; nothing logs args or env', () => {
  // 1) no tool declares a secret-shaped input field
  const secretField = /\b(api[_-]?key|secret|token|password|passwd|credential|bearer)\b/i;
  for (const t of TOOLS) {
    for (const field of Object.keys(t.input || {})) {
      assert.ok(!secretField.test(field), `${t.name} must not accept a secret field (${field})`);
    }
  }
  // 2) the server never logs tool arguments or env values
  const server = rd(path.join(__dirname, '..', 'src', 'server.js'));
  assert.ok(!/process\.env\b[^\n]*(write|log|stderr|stdout)/.test(server), 'server must not log env values');
  // every stderr write in the server is a fixed message, never an args/body interpolation
  const stderrWrites = server.match(/process\.stderr\.write\([^)]*\)/g) || [];
  for (const wline of stderrWrites) {
    assert.ok(!/\bargs\b|\bbody\b|JSON\.stringify\(\s*args/.test(wline), `stderr write must not include args/body: ${wline}`);
  }
});

test('N237-6 a credential-shaped comment body is not echoed to any persisted log beyond the ticket the user wrote', async () => {
  // Defense-in-depth: a pasted secret in a comment body lands ONLY in that ticket's audit
  // log (where the user put it) — no tool copies it elsewhere, and the server does not log it.
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  try {
    const secret = 'sk-live-ABCDEF0123456789ABCDEF0123456789';
    await invoke('dart_comment', { id: 'T-1', body: `key=${secret}`, author: '/be' }, dir);
    // the secret is only in the one ticket the author wrote; the overlay/ledger never carry it
    assert.ok(!String(rd(overlayFile(dir)) || '').includes(secret), 'overlay carries no secret');
    assert.ok(!String(rd(ledgerFile(dir)) || '').includes(secret), 'ledger carries no secret');
  } finally { cleanup(dir); }
});

// ---- surface shape: exactly nine tools, write/read split ------------------------------

test('the tool surface is the 7 write + 2 read tools, each handler present', () => {
  assert.deepEqual(WRITE_TOOLS.sort(), [
    'dart_advance_ticket', 'dart_assign', 'dart_comment', 'dart_consume_directive',
    'dart_require_gate', 'dart_set_gate', 'dart_set_label',
  ]);
  assert.deepEqual(READ_TOOLS.sort(), ['dart_pending_directives', 'dart_read_state']);
  assert.equal(TOOLS.length, 9);
});

// ---- consume_directive rides the same writer; pending is derived ----------------------

test('dart_consume_directive marks a directive consumed via the guarded writer; pending derives away', async () => {
  const dir = proj({ 'T-1': { title: 'A', track: 'full', stage: 'implement', gates: {}, labels: [] } });
  try {
    const d = appendComment(dir, 'T-1', { author: '/sm', kind: 'directive', body: 'do the thing', target: ['/be'] });
    assert.equal(buildState(dir).directives.length, 1, 'one pending directive');
    const r = await invoke('dart_consume_directive', { id: 'T-1', directiveId: d.id, by: '/be' }, dir);
    assert.equal(r.code, 200);
    assert.equal(buildState(dir).directives.length, 0, 'directive no longer pending');
    // idempotent: a second consume is a harmless no-op against the derived set
    const r2 = await invoke('dart_consume_directive', { id: 'T-1', directiveId: d.id, by: '/be' }, dir);
    assert.equal(r2.code, 200);
    assert.equal(buildState(dir).directives.length, 0, 'still consumed');
  } finally { cleanup(dir); }
});

// ---- bind-project: lookup key, never a path -------------------------------------------

test('resolveBoundProject binds cwd / an absolute launch arg, and rejects a non-directory', () => {
  const dir = proj({});
  try {
    assert.equal(resolveBoundProject([], dir), fs.realpathSync(dir), 'cwd binds');
    assert.equal(resolveBoundProject([dir], '/nonexistent-xyz'), fs.realpathSync(dir), 'absolute launch arg binds');
    // a relative arg is ignored (only absolute launch args select a project)
    assert.equal(resolveBoundProject(['some/rel/path'], dir), fs.realpathSync(dir), 'relative arg ignored');
    const file = path.join(dir, '.workflow-state.json');
    assert.throws(() => resolveBoundProject([file], '/x'), /not a directory/, 'a file path is refused');
  } finally { cleanup(dir); }
});
