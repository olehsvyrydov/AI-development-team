'use strict';
/*
 * N-212 — hub ↔ memory parity for the scope/stack visibility predicate.
 *
 * The hub (JS) scopeMatches and the memory (TS) mirror must produce BYTE-IDENTICAL
 * results across the shared fixture table. This test evaluates BOTH implementations
 * over the same fixtures and asserts they agree row-for-row (and that each agrees
 * with the fixture's expected value). A predicate that drifts on one side — a
 * different any-wildcard rule, a missing status gate, a lost alias — fails here.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopeMatches } = require('../lib/knowledge');

const FIXTURE = path.join(__dirname, '..', 'lib', 'scope-fixtures.json');
const TS_MIRROR = path.join(__dirname, '..', '..', 'claude', 'memory', 'src', 'lib', 'knowledge-match.ts');

function loadRows() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).rows;
}

// Evaluate the TS mirror by importing it in a child node process (node runs TS
// directly) and printing a JSON array of booleans for the fixture rows.
function evalTsMirror(rows) {
  const script = `
    import { scopeMatches } from ${JSON.stringify(TS_MIRROR)};
    const rows = ${JSON.stringify(rows)};
    const out = rows.map((r) => scopeMatches(r.doc, r.project));
    process.stdout.write(JSON.stringify(out));
  `;
  const tmp = path.join(require('node:os').tmpdir(), `aidt-parity-${process.pid}.mjs`);
  fs.writeFileSync(tmp, script);
  try {
    const out = execFileSync(process.execPath, [tmp], { encoding: 'utf8' });
    return JSON.parse(out);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

test('N-212 hub scopeMatches agrees with the fixture expected values', () => {
  for (const row of loadRows()) {
    assert.equal(scopeMatches(row.doc, row.project), row.expected, `hub: ${row.name}`);
  }
});

test('N-212 hub ↔ memory mirror produce byte-identical results across the fixture table', () => {
  const rows = loadRows();
  const hub = rows.map((r) => scopeMatches(r.doc, r.project));
  const ts = evalTsMirror(rows);
  assert.equal(ts.length, rows.length, 'mirror evaluated every row');
  for (let i = 0; i < rows.length; i++) {
    assert.equal(ts[i], hub[i], `parity mismatch on row "${rows[i].name}" (hub=${hub[i]} ts=${ts[i]})`);
    assert.equal(ts[i], rows[i].expected, `mirror disagrees with expected on "${rows[i].name}"`);
  }
});
