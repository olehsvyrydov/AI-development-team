'use strict';
/*
 * Turnkey proof for the shipped MCP bundle.
 *
 * A git-only / marketplace install ships dist/server.cjs but NOT dart-mcp/node_modules.
 * The bundle must therefore run the dart_* write-back tools with NO node_modules present:
 * the MCP SDK and zod are inlined into the bundle, while the hub control plane stays a
 * runtime-relative require to ../../hub/lib (one source of truth, never copied in).
 *
 * These tests:
 *  - prove the dist bundle has the third-party deps INLINED (no require of the sdk / zod)
 *    and does NOT carry a second copy of the hub control plane;
 *  - drive the bundle over stdio with node_modules MOVED ASIDE, asserting it advertises
 *    the nine tools and reads state — the real no-node_modules turnkey proof.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MCP_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(MCP_ROOT, 'dist', 'server.cjs');
const NODE_MODULES = path.join(MCP_ROOT, 'node_modules');
const REPO_ROOT = path.resolve(MCP_ROOT, '..');

// Build the bundle once so the test reflects the current source, not a stale artifact.
before(() => {
  execFileSync('npm', ['run', 'build'], { cwd: MCP_ROOT, stdio: 'ignore' });
});

test('the dist bundle exists and is the committed runtime artifact', () => {
  assert.ok(fs.existsSync(DIST), 'dist/server.cjs must exist (run npm run build)');
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', 'dart-mcp/dist/server.cjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(tracked, 'dart-mcp/dist/server.cjs', 'the bundle must be tracked so it survives a clean clone');
});

test('third-party deps are INLINED — no require of the sdk or zod remains', () => {
  const src = fs.readFileSync(DIST, 'utf8');
  assert.ok(!/require\(\s*["']@modelcontextprotocol\/sdk/.test(src), 'no require of @modelcontextprotocol/sdk');
  assert.ok(!/require\(\s*["']zod["']\)/.test(src), 'no require of zod');
  // The inlined runtime is actually present (transport + zod object type are in the bundle).
  assert.ok(src.includes('StdioServerTransport'), 'the inlined SDK stdio transport must be in the bundle');
  assert.ok(/Zod\w/.test(src), 'the inlined zod runtime must be in the bundle');
});

test('the hub control plane is NOT copied into the bundle — only a relative require to it', () => {
  const src = fs.readFileSync(DIST, 'utf8');
  // The bundle keeps the control plane external+relative so there is ONE source of truth.
  assert.ok(src.includes('require("../../hub/lib/api")'), 'bundle requires the real hub api by relative path');
  assert.ok(src.includes('require("../../hub/lib/state")'), 'bundle requires the real hub state by relative path');
  // No inlined COPY: hub control-plane internals (only defined in hub/lib/*, never in the
  // adapter surface) must be ABSENT from the bundle. The adapter's own route descriptors
  // (e.g. the literal "ticket/advance" in tools.js) are legitimately bundled, so they are
  // NOT a copy signal — these internal symbols are.
  for (const internal of ['stageGate', 'parseFrontMatter', 'commonVaultRoot', 'expectedOwner', 'aidevteamHome']) {
    assert.ok(!src.includes(internal), `hub control-plane internal ${internal} must NOT be inlined into the bundle`);
  }
});

test('the relative require to hub/lib resolves from dist/ to the repo control plane', () => {
  const distDir = path.dirname(DIST);
  for (const rel of ['../../hub/lib/api', '../../hub/lib/state']) {
    const resolved = require.resolve(path.resolve(distDir, rel));
    assert.ok(fs.existsSync(resolved), `${rel} must resolve from dist/`);
    assert.ok(resolved.startsWith(path.join(REPO_ROOT, 'hub', 'lib')), `${rel} must point at the repo hub/lib`);
  }
});

// Drive the bundle over stdio: one JSON-RPC request per line, collect by id.
function driveBundle(projectDir, requests, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DIST, projectDir], {
      cwd: os.tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
    let out = '';
    let err = '';
    const byId = new Map();
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`bundle timed out. stderr: ${err}`));
    }, 15000);

    child.stdout.on('data', (d) => {
      out += d.toString();
      let nl;
      while ((nl = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, nl).trim();
        out = out.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined) byId.set(msg.id, msg);
        if (byId.size === requests.length) {
          clearTimeout(timer);
          child.stdin.end();
          child.kill('SIGTERM');
          resolve({ byId, err });
        }
      }
    });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });

    for (const req of requests) child.stdin.write(JSON.stringify(req) + '\n');
  });
}

// A minimal bound project: a ledger file the read path can project.
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dart-bundle-proj-'));
  fs.writeFileSync(
    path.join(dir, '.workflow-state.json'),
    JSON.stringify({
      'BND-1': { title: 'Bundle smoke', track: 'standard', stage: 'todo', gates: {} },
    }),
  );
  return dir;
}

test('the BUNDLE runs the tools with node_modules MOVED ASIDE (turnkey: zero setup)', async () => {
  const projectDir = makeProject();
  const aside = NODE_MODULES + '.aside-bundle-test';
  const hadNodeModules = fs.existsSync(NODE_MODULES);

  // Move node_modules out of the resolution path to prove the bundle needs none of it.
  if (hadNodeModules) fs.renameSync(NODE_MODULES, aside);
  try {
    assert.ok(!fs.existsSync(NODE_MODULES), 'node_modules must be absent for the turnkey proof');

    // Sanitize the env so no NODE_PATH / global modules can mask a missing dependency.
    const env = { ...process.env };
    delete env.NODE_PATH;

    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'bundle-test', version: '0.0.0' },
      } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
        name: 'dart_read_state', arguments: {},
      } },
    ];

    const { byId, err } = await driveBundle(projectDir, requests, env);

    const init = byId.get(1);
    assert.ok(init && init.result, `initialize must succeed without node_modules. stderr: ${err}`);
    assert.equal(init.result.serverInfo.name, 'dart');

    const list = byId.get(2);
    assert.ok(list && list.result && Array.isArray(list.result.tools), 'tools/list must return tools');
    const names = list.result.tools.map((t) => t.name).sort();
    assert.equal(names.length, 9, `the bundle must advertise 9 tools, got ${names.length}: ${names}`);
    for (const expected of [
      'dart_advance_ticket', 'dart_assign', 'dart_comment', 'dart_consume_directive',
      'dart_pending_directives', 'dart_read_state', 'dart_require_gate', 'dart_set_gate', 'dart_set_label',
    ]) {
      assert.ok(names.includes(expected), `bundle must expose ${expected}`);
    }

    const call = byId.get(3);
    assert.ok(call && call.result, 'dart_read_state must return a result without node_modules');
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.ok, true, 'dart_read_state payload.ok must be true');
    assert.ok(payload.state, 'dart_read_state must return the workflow state projection');
  } finally {
    if (hadNodeModules) fs.renameSync(aside, NODE_MODULES);
  }
});
