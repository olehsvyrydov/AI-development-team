'use strict';
/* TDD for hub/lib/comments.js — the dependency-free comment reader shared by
 * state.js and write.js. Proves: ordered read, empty default, id sanitization,
 * corrupt-line tolerance. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readComments, safeId } = require('../lib/comments');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-comments-'));
}
function writeLog(dir, id, records) {
  const file = path.join(dir, '.aidevteam', 'comments', `${safeId(id)}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

test('readComments returns records oldest first', () => {
  const dir = tmpProject();
  try {
    writeLog(dir, 'T-1', [
      { id: 'a', ticket: 'T-1', ts: '2026-01-01T00:00:00Z', author: '/be', kind: 'comment', body: 'first' },
      { id: 'b', ticket: 'T-1', ts: '2026-01-02T00:00:00Z', author: '/rev', kind: 'gate', body: 'second', gate: 'CODE_REVIEWED', state: 'passed' },
    ]);
    const got = readComments(dir, 'T-1');
    assert.equal(got.length, 2);
    assert.equal(got[0].body, 'first');
    assert.equal(got[1].gate, 'CODE_REVIEWED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readComments returns [] when no log exists', () => {
  const dir = tmpProject();
  try {
    assert.deepEqual(readComments(dir, 'T-missing'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readComments skips corrupt lines instead of throwing', () => {
  const dir = tmpProject();
  try {
    const file = path.join(dir, '.aidevteam', 'comments', `${safeId('T-2')}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"id":"a","body":"ok"}\nnot-json\n{"id":"b","body":"also ok"}\n');
    const got = readComments(dir, 'T-2');
    assert.equal(got.length, 2);
    assert.equal(got[1].id, 'b');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('safeId strips path separators so the id cannot escape the comments dir', () => {
  assert.ok(!safeId('../../etc/passwd').includes('/'), 'no path separators survive');
  assert.equal(safeId(''), 'unknown');
});
