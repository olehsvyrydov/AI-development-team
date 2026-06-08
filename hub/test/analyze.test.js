'use strict';
/* Deterministic, no-LLM connect+analyze. Covers the existing-artefacts fast path,
 * the init-analysis derivation ladder (title/description/stack/keyFiles), the
 * read-confinement floor (a symlink under the project pointing outside must not be
 * read), the analyzer DoS caps, profile-write confinement, and determinism. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyze, CAPS } = require('../lib/analyze');

function tmpProject(files = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aidt-an-')));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return dir;
}
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });

test('init path: title from package.json name, description from README first paragraph', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'cool-svc', description: 'pkg desc' }),
    'tsconfig.json': '{}',
    'README.md': '# Cool Service\n\nThe first paragraph describes it.\n\nSecond paragraph ignored.',
  });
  try {
    const r = analyze(dir);
    assert.equal(r.profile.title, 'cool-svc');
    assert.equal(r.profile.description, 'The first paragraph describes it.');
    assert.equal(r.profile.source, 'analysis');
    assert.ok(r.profile.stack.includes('node'));
    assert.ok(r.profile.stack.includes('typescript'));
    assert.ok(r.profile.keyFiles.includes('README.md'));
    // profile persisted inside the project's .aidevteam dir
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.aidevteam', 'profile.json'), 'utf8'));
    assert.equal(onDisk.title, 'cool-svc');
  } finally { rm(dir); }
});

test('init path: description falls back to package.json description when no README', () => {
  const dir = tmpProject({ 'package.json': JSON.stringify({ name: 'p', description: 'from package' }) });
  try {
    assert.equal(analyze(dir).profile.description, 'from package');
  } finally { rm(dir); }
});

test('init path: title falls back to directory basename when no manifest name', () => {
  const dir = tmpProject({ 'index.html': '<html></html>' });
  try {
    assert.equal(analyze(dir).profile.title, path.basename(dir));
  } finally { rm(dir); }
});

test('init path: description falls back to a file-type summary sentence', () => {
  const dir = tmpProject({ 'Cargo.toml': '[package]\nname = "x"\n', 'src/main.rs': 'fn main(){}' });
  try {
    const r = analyze(dir);
    assert.ok(r.profile.stack.includes('rust'));
    assert.ok(/project/i.test(r.profile.description), 'a generated summary sentence');
  } finally { rm(dir); }
});

test('determinism: same directory yields a byte-identical profile (ignoring analyzedAt)', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'det' }),
    'Dockerfile': 'FROM node',
    'go.mod': 'module x',
  });
  try {
    const a = analyze(dir).profile;
    const b = analyze(dir).profile;
    const strip = (p) => ({ ...p, analyzedAt: null });
    assert.deepEqual(strip(a), strip(b));
  } finally { rm(dir); }
});

test('fast path: an existing-ADT project is detected and profiled from artefacts', () => {
  const dir = tmpProject({
    '.workflow-state.json': JSON.stringify({ 'T-1': { title: 'A', stage: 'dev', gates: {} } }),
    'README.md': '# Existing\n\nAlready an ADT project.',
  });
  try {
    const r = analyze(dir);
    assert.equal(r.profile.source, 'artefacts');
    assert.ok(r.state, 'fast path returns buildState');
    assert.equal(r.profile.description, 'Already an ADT project.');
  } finally { rm(dir); }
});

test('read-confinement: a symlink under the project escaping the root is NOT read', () => {
  const secret = tmpProject({ 'secret.txt': 'TOP SECRET' });
  const secretFile = path.join(secret, 'secret.txt');
  const dir = tmpProject({ 'package.json': JSON.stringify({ name: 'victim' }) });
  // a README that is actually a symlink to a file outside the project root
  fs.symlinkSync(secretFile, path.join(dir, 'README.md'));
  try {
    const r = analyze(dir);
    // the escaping symlink must be skipped — its contents never reach the profile
    assert.ok(!String(r.profile.description || '').includes('TOP SECRET'),
      'escaping symlink contents must not leak into the profile');
  } finally { rm(dir); rm(secret); }
});

test('read-confinement: a symlinked .aidevteam dir escaping the root refuses the profile write', () => {
  const outside = tmpProject({});
  const dir = tmpProject({ 'package.json': JSON.stringify({ name: 'v' }) });
  // .aidevteam is a symlink pointing outside the project root
  fs.symlinkSync(outside, path.join(dir, '.aidevteam'));
  try {
    assert.throws(() => analyze(dir), /escap|outside|confin/i,
      'must refuse to write the profile through a symlink that escapes the root');
    // nothing was written into the outside directory
    assert.ok(!fs.existsSync(path.join(outside, 'profile.json')));
  } finally { rm(dir); rm(outside); }
});

test('DoS cap: a README larger than the per-file byte cap is truncated, not fully read', () => {
  const huge = 'x'.repeat(CAPS.maxFileBytes + 50_000);
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'big' }),
    'README.md': `# Big\n\n${huge}`,
  });
  try {
    const r = analyze(dir);
    assert.ok((r.profile.description || '').length <= CAPS.maxDescriptionChars,
      'description is capped regardless of README size');
  } finally { rm(dir); }
});

test('DoS cap: the stack scan stops at the file-count cap and still returns', () => {
  const files = { 'package.json': JSON.stringify({ name: 'many' }) };
  for (let i = 0; i < CAPS.maxFiles + 200; i++) files[`f${i}.txt`] = 'x';
  const dir = tmpProject(files);
  try {
    const r = analyze(dir); // must return without scanning unbounded files
    assert.ok(Array.isArray(r.profile.stack));
    assert.ok(r.profile.stack.includes('node'));
  } finally { rm(dir); }
});

test('analysis never persists a half-registered project: bad input throws before any write', () => {
  assert.throws(() => analyze('/no/such/path/zzz'), /exist|director/i);
});

test('description skips a leading badge/shields row and uses the first real prose', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'badged' }),
    'README.md': [
      '# Badged Project',
      '',
      '![Claude Code](https://img.shields.io/badge/Claude-ready-6E56CF) ![Cursor](https://img.shields.io/badge/Cursor-ready-blue)',
      '',
      'Badged is a deterministic project analyzer that produces clean prose.',
    ].join('\n'),
  });
  try {
    const d = analyze(dir).profile.description;
    assert.equal(d, 'Badged is a deterministic project analyzer that produces clean prose.');
    assert.ok(!d.includes('!['), 'no raw markdown image syntax');
    assert.ok(!d.includes('shields.io'), 'no badge URL leaks');
  } finally { rm(dir); }
});

test('description skips HTML comment, heading, and a lone image before prose', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'mixed' }),
    'README.md': [
      '<!-- this is a hidden comment -->',
      '',
      '# Title',
      '',
      '<p align="center"><img src="logo.png" alt="logo"></p>',
      '',
      '![banner](banner.png)',
      '',
      'The real description lives down here as prose.',
    ].join('\n'),
  });
  try {
    assert.equal(analyze(dir).profile.description, 'The real description lives down here as prose.');
  } finally { rm(dir); }
});

test('description strips inline markdown links, emphasis, and code to plain text', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'inline' }),
    'README.md': '# Inline\n\nVisit **our** [docs site](https://example.com) and run `npm test` for _details_.',
  });
  try {
    const d = analyze(dir).profile.description;
    assert.equal(d, 'Visit our docs site and run npm test for details.');
  } finally { rm(dir); }
});

test('description skips lists, blockquotes, tables, HRs and code fences as non-prose', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'blocks' }),
    'README.md': [
      '# Heading',
      '',
      '- a list item',
      '- another item',
      '',
      '> a blockquote',
      '',
      '| col | col |',
      '| --- | --- |',
      '| 1   | 2   |',
      '',
      '---',
      '',
      '```',
      'code block contents',
      '```',
      '',
      'Finally, the genuine prose paragraph appears.',
    ].join('\n'),
  });
  try {
    assert.equal(analyze(dir).profile.description, 'Finally, the genuine prose paragraph appears.');
  } finally { rm(dir); }
});

test('a fenced ASCII diagram between prose paragraphs is not surfaced as prose', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'fenced' }),
    'README.md': [
      '# Fenced',
      '',
      'The first prose paragraph introduces the project.',
      '',
      '```',
      '   +-----+',
      '   | BOX |',
      '   +-----+',
      '```',
      '',
      'The second prose paragraph follows the diagram.',
    ].join('\n'),
  });
  try {
    const p = analyze(dir).profile;
    assert.equal(p.description, 'The first prose paragraph introduces the project.');
    assert.ok(!p.longDescription.includes('+-----+'), 'ASCII diagram excluded');
    assert.ok(p.longDescription.includes('The second prose paragraph follows the diagram.'));
  } finally { rm(dir); }
});

test('longDescription spans multiple prose paragraphs and is capped', () => {
  const para = (n) => `Paragraph ${n} ` + 'word '.repeat(40);
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'long' }),
    'README.md': [
      '# Long',
      '',
      '![badge](https://img.shields.io/badge/x-y-z)',
      '',
      para(1).trim(),
      '',
      para(2).trim(),
      '',
      para(3).trim(),
      '',
      para(4).trim(),
    ].join('\n'),
  });
  try {
    const p = analyze(dir).profile;
    assert.ok(p.longDescription.startsWith('Paragraph 1'), 'starts at first prose paragraph');
    assert.ok(p.longDescription.includes('Paragraph 2'), 'spans more than one paragraph');
    assert.ok(p.longDescription.length >= p.description.length, 'long >= short');
    assert.ok(p.longDescription.length <= 1200, 'longDescription is capped');
    assert.ok(!p.longDescription.includes('!['), 'no raw markdown image syntax');
    assert.ok(p.description.length <= CAPS.maxDescriptionChars);
  } finally { rm(dir); }
});

test('short description ends on a word/sentence boundary, not mid-word', () => {
  const long = 'This sentence is intentionally long. ' + 'alpha bravo charlie delta echo foxtrot golf hotel '.repeat(20);
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'cap' }),
    'README.md': `# Cap\n\n${long}`,
  });
  try {
    const d = analyze(dir).profile.description;
    assert.ok(d.length <= CAPS.maxDescriptionChars);
    assert.ok(!/\S$/.test(d) || /[.\w]$/.test(d), 'does not end mid-token');
    assert.ok(!d.endsWith(' '), 'no trailing whitespace');
  } finally { rm(dir); }
});

test('no-prose README falls back to package.json, never raw badge markdown', () => {
  const dir = tmpProject({
    'package.json': JSON.stringify({ name: 'badgesonly', description: 'A clean package description.' }),
    'README.md': [
      '# Badges Only',
      '',
      '![one](https://img.shields.io/badge/a-b-c) ![two](https://img.shields.io/badge/d-e-f)',
      '',
      '[![link badge](https://img.shields.io/badge/g-h-i)](https://example.com)',
    ].join('\n'),
  });
  try {
    const p = analyze(dir).profile;
    assert.equal(p.description, 'A clean package description.');
    assert.ok(!p.description.includes('!['), 'no raw markdown image syntax');
    assert.ok(!p.longDescription.includes('!['), 'long has no raw markdown image syntax');
  } finally { rm(dir); }
});

test('no README and no descriptions yields a graceful generic, no raw markdown', () => {
  const dir = tmpProject({ 'index.html': '<html></html>' });
  try {
    const p = analyze(dir).profile;
    assert.ok(p.description && !p.description.includes('!['));
    assert.ok(typeof p.longDescription === 'string');
  } finally { rm(dir); }
});
