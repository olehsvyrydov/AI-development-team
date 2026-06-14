'use strict';
/*
 * The hub's full-text search seam degrades silently and ranks additively. These tests
 * stub the optional bridge to assert: an absent bridge yields null (caller keeps the
 * file scan); a throwing bridge yields null; a healthy bridge's hits are intersected
 * with the file-scan doc set (a hit for a file the scan did not surface is dropped, so a
 * stale index can only ever HIDE, never reveal); and the returned shape carries only
 * server-known {file, scope, score} — never an absolute path or a drift key.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const kbSearch = require('../lib/kb-search');

// Install a fake require resolution for the optional bridge so the test controls it
// without a built artifact on disk.
function withBridge(fakeModule, fn) {
  const realLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request.includes('kb-fts-bridge')) {
      if (fakeModule === 'throw') throw new Error('bridge load failed');
      return fakeModule;
    }
    return realLoad.call(this, request, parent, isMain);
  };
  try {
    return fn();
  } finally {
    Module._load = realLoad;
  }
}

test('absent bridge → ftsSearch returns null (caller keeps the file scan)', () => {
  const out = kbSearch.ftsSearch('/tmp/proj', { query: 'x', projectId: 'p', projectStack: ['any'], scope: 'all' });
  assert.equal(out, null);
});

test('throwing bridge → ftsSearch returns null (silent degradation)', () => {
  withBridge('throw', () => {
    const out = kbSearch.ftsSearch('/tmp/proj', { query: 'x', projectId: 'p', projectStack: ['any'], scope: 'all' });
    assert.equal(out, null);
  });
});

test('healthy bridge → returns available + hits of only {file, scope, score}', () => {
  const fake = {
    ftsSearch() {
      return { available: true, hits: [{ file: 'a.md', scope: 'project', score: 2, project_id: 'p', status: 'approved-project' }] };
    },
  };
  withBridge(fake, () => {
    const out = kbSearch.ftsSearch('/tmp/proj', { query: 'x', projectId: 'p', projectStack: ['any'], scope: 'all' });
    assert.ok(out && out.available === true);
    assert.equal(out.hits.length, 1);
    const hit = out.hits[0];
    assert.deepEqual(Object.keys(hit).sort(), ['file', 'scope', 'score']);
  });
});

test('a bridge hit whose project_id != the caller is dropped by the kb-search re-check (even if the SQL wrongly returned it)', () => {
  const fake = {
    ftsSearch() {
      // A (stubbed) SQL prefilter wrongly returns a project-scoped row owned by ANOTHER
      // project. The canonical scopeMatches re-check must drop it: ownProject is recomputed
      // from project_id vs the caller, never rubber-stamped to true.
      return {
        available: true,
        hits: [
          { file: 'mine.md', scope: 'project', score: 5, project_id: 'caller', status: 'approved-project' },
          { file: 'theirs.md', scope: 'project', score: 9, project_id: 'other-project', status: 'approved-project' },
        ],
      };
    },
  };
  withBridge(fake, () => {
    const out = kbSearch.ftsSearch('/tmp/proj', { query: 'x', projectId: 'caller', projectStack: ['any'], scope: 'all' });
    assert.ok(out && out.available === true);
    const files = out.hits.map((h) => h.file);
    assert.ok(files.includes('mine.md'), "the caller's own project note is kept");
    assert.ok(!files.includes('theirs.md'), "another project's note is dropped by the re-check");
  });
});

test('a bridge common hit not yet approved-common is dropped by the kb-search re-check', () => {
  const fake = {
    ftsSearch() {
      return {
        available: true,
        hits: [
          { file: 'good.md', scope: 'common', score: 5, project_id: '', status: 'approved-common', stack: ['any'] },
          { file: 'pending.md', scope: 'common', score: 9, project_id: '', status: 'pending', stack: ['any'] },
        ],
      };
    },
  };
  withBridge(fake, () => {
    const out = kbSearch.ftsSearch('/tmp/proj', { query: 'x', projectId: 'caller', projectStack: ['any'], scope: 'all' });
    const files = out.hits.map((h) => h.file);
    assert.ok(files.includes('good.md'), 'an approved-common hit is kept');
    assert.ok(!files.includes('pending.md'), 'a non-approved-common hit is dropped by the re-check');
  });
});

test('rankDocs is additive: a hit absent from the file-scan docs[] is ignored; order follows score', () => {
  const docs = [
    { name: 'a', file: 'a.md', scope: 'project' },
    { name: 'b', file: 'b.md', scope: 'project' },
    { name: 'c', file: 'c.md', scope: 'project' },
  ];
  // bridge ranks c above a, and includes a phantom 'ghost.md' the scan never surfaced
  const hits = [
    { file: 'ghost.md', scope: 'project', score: 99 },
    { file: 'c.md', scope: 'project', score: 5 },
    { file: 'a.md', scope: 'project', score: 3 },
  ];
  const ranked = kbSearch.rankDocs(docs, hits);
  // same docs, no addition, no removal
  assert.deepEqual(ranked.map((d) => d.file).sort(), ['a.md', 'b.md', 'c.md']);
  assert.ok(!ranked.some((d) => d.file === 'ghost.md'), 'a phantom hit is never added');
  // ranked ones come first, in score order; unranked keep their original order after
  assert.deepEqual(ranked.map((d) => d.file), ['c.md', 'a.md', 'b.md']);
});

test('rankDocs leaves docs untouched when there are no hits', () => {
  const docs = [{ name: 'a', file: 'a.md', scope: 'project' }, { name: 'b', file: 'b.md', scope: 'project' }];
  const ranked = kbSearch.rankDocs(docs, []);
  assert.deepEqual(ranked, docs);
});

test('rankDocs returns a NEW array (never the input reference), so a caller that clears its own list cannot empty the result', () => {
  const docs = [{ name: 'a', file: 'a.md', scope: 'project' }, { name: 'b', file: 'b.md', scope: 'project' }];
  // no hits → same content, but a distinct array the caller may safely splice
  const rankedNoHits = kbSearch.rankDocs(docs, []);
  assert.notEqual(rankedNoHits, docs, 'a distinct array is returned even with no hits');
  // the copy-back pattern (clear the source, repopulate from the result) must survive
  const result = kbSearch.rankDocs(docs, []);
  docs.length = 0;
  for (const d of result) docs.push(d);
  assert.deepEqual(docs.map((d) => d.file), ['a.md', 'b.md'], 'the result is not aliased to the cleared source');
});

void path;
