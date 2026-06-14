'use strict';
/*
 * buildKnowledge's method label is honest and its ordering is additive. With no embedder
 * and no FTS bridge, the label stays 'filename-only' and the docs are exactly today's
 * file scan. With a healthy FTS probe, the label flips to 'full-text' and the docs are
 * reordered — but never added to or removed from. A throwing probe degrades silently to
 * the file scan. The label flips on a LIVE probe, never on mere package presence.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// load fresh so the kb-search stub is honoured
function freshState() {
  delete require.cache[require.resolve('../lib/state')];
  delete require.cache[require.resolve('../lib/kb-search')];
  return require('../lib/state');
}

// Isolate HOME so the real ~/.aidevteam common vault never bleeds into the projection.
const realHome = os.homedir();
function setHome(h) {
  process.env.HOME = h;
  process.env.USERPROFILE = h;
}

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-kbm-'));
  setHome(path.join(root, 'home'));
  fs.mkdirSync(process.env.HOME, { recursive: true });
  const dir = path.join(root, 'project');
  const docs = path.join(dir, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'aaa.md'), '---\nscope: project\n---\n# aaa\n\nalpha body\n');
  fs.writeFileSync(path.join(docs, 'zzz.md'), '---\nscope: project\n---\n# zzz\n\nzeta body\n');
  return { root, dir };
}

// Stub the optional bridge module the kb-search seam lazy-requires.
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

test('no embedder, no FTS → method filename-only, docs are the plain file scan', () => {
  const { root, dir } = makeProject();
  try {
    // bridge absent: loadBridge() finds nothing → null
    const state = freshState();
    const k = state.buildKnowledge(dir);
    assert.equal(k.method, 'filename-only');
    assert.deepEqual(k.docs.map((d) => d.file).sort(), ['docs/aaa.md', 'docs/zzz.md']);
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('healthy FTS probe → method full-text, docs reordered but identical set', () => {
  const { root, dir } = makeProject();
  try {
    const fake = {
      ftsSearch() {
        // rank zzz above aaa
        return { available: true, hits: [{ file: 'docs/zzz.md', scope: 'project', score: 9 }] };
      },
    };
    withBridge(fake, () => {
      const state = freshState();
      const k = state.buildKnowledge(dir);
      assert.equal(k.method, 'full-text');
      // identical set, no add/remove
      assert.deepEqual(k.docs.map((d) => d.file).sort(), ['docs/aaa.md', 'docs/zzz.md']);
      // reordered: zzz first
      assert.equal(k.docs[0].file, 'docs/zzz.md');
    });
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('throwing FTS probe → silent fallback to filename-only file scan', () => {
  const { root, dir } = makeProject();
  try {
    withBridge('throw', () => {
      const state = freshState();
      const k = state.buildKnowledge(dir);
      assert.equal(k.method, 'filename-only');
      assert.deepEqual(k.docs.map((d) => d.file).sort(), ['docs/aaa.md', 'docs/zzz.md']);
    });
  } finally {
    setHome(realHome);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
