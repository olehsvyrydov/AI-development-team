'use strict';
/*
 * Tests for the shared knowledge module (knowledge.js): the bounded, never-throw
 * front-matter parser and the single-source-of-truth scope/stack match predicate.
 * Both are consumed by the hub projection AND mirrored on the memory recall side,
 * so the contract proven here is the one both sides must agree on.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const k = require('../lib/knowledge');

// ---- front-matter parse: defaults -----------------------------------------

test('parseFrontMatter: no front-matter → safe defaults', () => {
  const fm = k.parseFrontMatter('# Title\n\nbody');
  assert.equal(fm.scope, 'project');
  assert.deepEqual(fm.stack, ['any']);
  assert.equal(fm.kind, 'context');
  assert.equal(fm.status, 'approved-project');
});

test('parseFrontMatter: a well-formed block parses the schema keys', () => {
  const txt = '---\nscope: common\nstack: [java, python]\nkind: rule\nstatus: approved-common\nby: user\n---\n# T\n\nbody';
  const fm = k.parseFrontMatter(txt);
  assert.equal(fm.scope, 'common');
  assert.deepEqual(fm.stack, ['java', 'python']);
  assert.equal(fm.kind, 'rule');
  assert.equal(fm.status, 'approved-common');
  assert.equal(fm.by, 'user');
});

test('parseFrontMatter: global read-aliases to common', () => {
  const fm = k.parseFrontMatter('---\nscope: global\n---\nx');
  assert.equal(fm.scope, 'common');
});

test('parseFrontMatter: unknown scope degrades to project (narrowest)', () => {
  const fm = k.parseFrontMatter('---\nscope: wideopen\n---\nx');
  assert.equal(fm.scope, 'project');
});

test('parseFrontMatter: unknown kind → context, unknown stack tokens dropped', () => {
  const fm = k.parseFrontMatter('---\nkind: bogus\nstack: [java, martian, python]\n---\nx');
  assert.equal(fm.kind, 'context');
  assert.deepEqual(fm.stack, ['java', 'python']);
});

test('parseFrontMatter: empty stack list → ["any"]', () => {
  const fm = k.parseFrontMatter('---\nstack: []\n---\nx');
  assert.deepEqual(fm.stack, ['any']);
});

test('parseFrontMatter: scalar stack value is accepted as a one-element list', () => {
  const fm = k.parseFrontMatter('---\nstack: java\n---\nx');
  assert.deepEqual(fm.stack, ['java']);
});

// ---- N-208: prototype pollution -------------------------------------------

test('N-208 front-matter __proto__/constructor/prototype keys are dropped, no pollution', () => {
  const before = ({}).polluted;
  const txt = '---\n__proto__: {"polluted": true}\nconstructor: x\nprototype: y\nscope: common\n---\nx';
  const fm = k.parseFrontMatter(txt);
  assert.equal(({}).polluted, before, 'Object.prototype not polluted');
  assert.equal(fm.polluted, undefined);
  // a legitimate key alongside the hostile ones still reads
  assert.equal(fm.scope, 'common');
});

test('N-208b a literal __proto__ token as a value cannot pollute', () => {
  const txt = '---\nby: __proto__\n---\nx';
  const fm = k.parseFrontMatter(txt);
  assert.equal(({}).polluted, undefined);
  assert.equal(typeof fm.by, 'string');
});

// ---- N-209: malformed / nested / oversize never throws --------------------

test('N-209 nested-object value degrades to defaults, never throws', () => {
  const txt = '---\nstack:\n  nested:\n    deep: 1\nscope: common\n---\nx';
  let fm;
  assert.doesNotThrow(() => { fm = k.parseFrontMatter(txt); });
  // nested value is not a flat scalar list → stack falls back to default
  assert.deepEqual(fm.stack, ['any']);
});

test('N-209b a giant front-matter block does not throw and degrades', () => {
  const giant = '---\n' + 'x: ' + 'a'.repeat(200000) + '\nscope: common\n---\nbody';
  let fm;
  assert.doesNotThrow(() => { fm = k.parseFrontMatter(giant); });
  // oversize block → all defaults
  assert.equal(fm.scope, 'project');
});

test('N-209c a truncated --- fence never throws, degrades to defaults', () => {
  let fm;
  assert.doesNotThrow(() => { fm = k.parseFrontMatter('---\nscope: common\n# no closing fence\nbody'); });
  assert.equal(fm.scope, 'project');
  assert.deepEqual(fm.stack, ['any']);
});

test('N-209d non-string input never throws', () => {
  assert.doesNotThrow(() => k.parseFrontMatter(null));
  assert.doesNotThrow(() => k.parseFrontMatter(undefined));
  assert.doesNotThrow(() => k.parseFrontMatter(42));
  const fm = k.parseFrontMatter(null);
  assert.equal(fm.scope, 'project');
});

test('stack tokens are capped (no token explosion)', () => {
  const many = Array.from({ length: 40 }, (_, i) => `java`).join(', ');
  const fm = k.parseFrontMatter(`---\nstack: [${many}]\n---\nx`);
  assert.ok(fm.stack.length <= 16, `capped, got ${fm.stack.length}`);
});

// ---- scopeMatches predicate ------------------------------------------------

const doc = (over) => Object.assign({ scope: 'common', status: 'approved-common', stack: ['any'] }, over);

test('scopeMatches: a project sees its OWN project-scoped notes', () => {
  assert.equal(k.scopeMatches(doc({ scope: 'project', status: 'approved-project', stack: ['any'], ownProject: true }), { stack: ['java'] }), true);
});

test('scopeMatches: a project NEVER sees another project\'s project-scoped notes', () => {
  assert.equal(k.scopeMatches(doc({ scope: 'project', status: 'approved-project', ownProject: false }), { stack: ['java'] }), false);
});

test('N-211 java project sees java + any common, never python-only', () => {
  const project = { stack: ['java'] };
  assert.equal(k.scopeMatches(doc({ stack: ['java'] }), project), true, 'java common visible');
  assert.equal(k.scopeMatches(doc({ stack: ['any'] }), project), true, 'any common visible');
  assert.equal(k.scopeMatches(doc({ stack: ['python'] }), project), false, 'python-only common NOT visible');
  assert.equal(k.scopeMatches(doc({ stack: ['python', 'java'] }), project), true, 'intersecting common visible');
});

test('N-211b a no-stack (any) project sees ONLY any-common', () => {
  const project = { stack: ['any'] };
  assert.equal(k.scopeMatches(doc({ stack: ['any'] }), project), true);
  assert.equal(k.scopeMatches(doc({ stack: ['java'] }), project), false, 'no stack-specific common leaks in');
  assert.equal(k.scopeMatches(doc({ stack: ['python'] }), project), false);
});

test('scopeMatches: common note must be approved-common to be recalled', () => {
  const project = { stack: ['java'] };
  assert.equal(k.scopeMatches(doc({ stack: ['java'], status: 'pending' }), project), false, 'pending not recalled');
  assert.equal(k.scopeMatches(doc({ stack: ['java'], status: 'rejected' }), project), false, 'rejected not recalled');
  assert.equal(k.scopeMatches(doc({ stack: ['java'], status: 'approved-project' }), project), false, 'approved-project not a common note');
});

// ---- project stack reader (config precedence) -----------------------------

function tmpProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-know-')));
  fs.mkdirSync(path.join(dir, '.aidevteam'), { recursive: true });
  return dir;
}

test('projectStack: manual knowledge.stack wins over auto-detect', () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(path.join(dir, '.aidevteam', 'config.json'), JSON.stringify({ knowledge: { stack: ['java'] } }));
    fs.writeFileSync(path.join(dir, 'pom.xml'), '<project/>'); // would auto-detect java too
    assert.deepEqual(k.projectStack(dir), ['java']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectStack: falls back to analyzer detectStack when no manual config', () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(path.join(dir, 'pom.xml'), '<project/>');
    assert.deepEqual(k.projectStack(dir), ['java']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectStack: defaults to ["any"] for a no-stack project', () => {
  const dir = tmpProject();
  try {
    assert.deepEqual(k.projectStack(dir), ['any']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectStack: unknown manual tokens are dropped, empty → any', () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(path.join(dir, '.aidevteam', 'config.json'), JSON.stringify({ knowledge: { stack: ['martian'] } }));
    assert.deepEqual(k.projectStack(dir), ['any'], 'all-unknown manual tokens degrade to any, not used as a path');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectStack: malformed config never throws', () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(path.join(dir, '.aidevteam', 'config.json'), '{ not json');
    assert.doesNotThrow(() => k.projectStack(dir));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
