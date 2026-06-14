'use strict';
/*
 * The consumable knowledge search backend (kb/search). It ranks the project's already
 * scope-filtered docs by a genuine full-text signal over note BODIES when the index is
 * queryable, and falls back to a filename/excerpt scan over the SAME docs[] — labelled
 * 'filename-only', never 'full-text' — when the index is absent. The file scan stays the
 * authority on existence + visibility (additive intersection), so search can never reveal
 * a note outside the project's scope nor add one the scan did not surface.
 *
 * These tests build a real project vault, control the optional bridge via the module
 * loader, and assert: a body-only term is FOUND via full-text when the index answers; the
 * SAME term falls back to the filename/excerpt scan with method 'filename-only' when the
 * index is absent; a cross-project term never returns another project's note; an empty
 * query returns the unranked scope-filtered docs.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

function freshModules() {
  for (const k of Object.keys(require.cache)) {
    if (/hub\/lib\/(kb-query|kb-search|state)\.js$/.test(k)) delete require.cache[k];
  }
  return require('../lib/kb-query');
}

const realHome = os.homedir();
function setHome(h) { process.env.HOME = h; process.env.USERPROFILE = h; }

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-kbq-'));
  setHome(path.join(root, 'home'));
  fs.mkdirSync(process.env.HOME, { recursive: true });
  const dir = path.join(root, 'project');
  const docs = path.join(dir, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  // The note's filename + title say nothing about "kafka"; only the BODY does. A
  // filename-only scan cannot match it on title; a real full-text scan over the body can.
  fs.writeFileSync(path.join(docs, 'messaging.md'), '---\nscope: project\n---\n# Messaging\n\nwe use kafka for the event bus\n');
  fs.writeFileSync(path.join(docs, 'webhooks.md'), '---\nscope: project\n---\n# Webhooks\n\nretries use exponential backoff\n');
  return { root, dir };
}

// Stub the optional bridge the kb-search seam lazy-requires.
function withBridge(fakeModule, fn) {
  const realLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request.includes('kb-fts-bridge')) {
      if (fakeModule === 'throw') throw new Error('bridge load failed');
      return fakeModule;
    }
    return realLoad.call(this, request, parent, isMain);
  };
  try { return fn(); } finally { Module._load = realLoad; }
}

test('a body-only term is found via full-text when the index is built (real full-text over bodies)', () => {
  const { root, dir } = makeProject();
  try {
    // A healthy bridge: a probe (empty query) answers available; a real query ranks the
    // body-only hit. The hit names messaging.md by file, carrying its project_id so the
    // canonical scopeMatches re-check keeps it.
    const fake = {
      ftsSearch(_p, opts) {
        if (!opts.query) return { available: true, hits: [] }; // probe
        return { available: true, hits: [{ file: 'docs/messaging.md', scope: 'project', score: 9, project_id: opts.projectId, status: 'approved-project', stack: ['any'] }] };
      },
    };
    withBridge(fake, () => {
      const kbQuery = freshModules();
      const out = kbQuery.search(dir, { query: 'kafka', scope: 'all' });
      assert.equal(out.method, 'full-text');
      assert.ok(out.results.some((r) => r.file === 'docs/messaging.md'), 'body-only term found via full-text');
      assert.equal(out.results[0].file, 'docs/messaging.md', 'the body hit ranks first');
    });
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the same body-only term falls back to the filename/excerpt scan with method filename-only when the index is absent', () => {
  const { root, dir } = makeProject();
  try {
    // bridge absent → kb-search returns null → fallback filename/excerpt scan over docs[].
    const kbQuery = freshModules();
    const out = kbQuery.search(dir, { query: 'kafka', scope: 'all' });
    assert.equal(out.method, 'filename-only');
    // the excerpt scan still finds the body term (today's behaviour: name + excerpt), but
    // the label is HONEST — it never claims full-text when no index served the query.
    assert.ok(out.results.some((r) => r.file === 'docs/messaging.md'), 'excerpt scan finds the body term');
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a cross-project query never returns another project\'s note', () => {
  const { root, dir } = makeProject();
  try {
    // A misbehaving bridge tries to surface a file the project file-scan never produced
    // (another project's note). The additive intersection drops it: only docs[] the scan
    // surfaced can ever appear.
    const fake = {
      ftsSearch(_p, opts) {
        if (!opts.query) return { available: true, hits: [] };
        return { available: true, hits: [{ file: 'docs/other-project-secret.md', scope: 'project', score: 99, project_id: 'someone-else', status: 'approved-project', stack: ['any'] }] };
      },
    };
    withBridge(fake, () => {
      const kbQuery = freshModules();
      const out = kbQuery.search(dir, { query: 'kafka', scope: 'all' });
      assert.ok(!out.results.some((r) => r.file === 'docs/other-project-secret.md'), 'a foreign note is never surfaced');
      assert.ok(out.results.every((r) => r.file === 'docs/messaging.md' || r.file === 'docs/webhooks.md'), 'only this project\'s scanned docs appear');
    });
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an empty query returns the unranked scope-filtered docs', () => {
  const { root, dir } = makeProject();
  try {
    const kbQuery = freshModules();
    const out = kbQuery.search(dir, { query: '   ', scope: 'all' });
    assert.deepEqual(out.results.map((r) => r.file).sort(), ['docs/messaging.md', 'docs/webhooks.md']);
    assert.ok(out.results.every((r) => typeof r.score !== 'number' || r.score === 0), 'no ranking applied on an empty query');
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('results expose only server-known doc fields — no absolute path', () => {
  const { root, dir } = makeProject();
  try {
    const kbQuery = freshModules();
    const out = kbQuery.search(dir, { query: 'webhooks', scope: 'all' });
    for (const r of out.results) {
      assert.ok(!path.isAbsolute(r.file), 'file is vault-relative, never absolute');
      assert.ok(!('path' in r), 'no absolute path key');
      assert.ok(!('mtime_ms' in r) && !('size' in r), 'no drift key');
    }
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
