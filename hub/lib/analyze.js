'use strict';
/*
 * Deterministic, no-LLM project analysis run on connect.
 *
 * Two paths:
 *   - fast path  — the folder already has ADT artefacts; reuse state.js::buildState
 *                  to project title/description/tickets, and tag source 'artefacts'.
 *   - init path  — derive a title, description, detected stack, and key files from a
 *                  FIXED allowlist of marker/doc files, tagged source 'analysis'.
 *
 * Security floor (containment): every file the analyzer touches is resolved with
 * realpathSync and must stay within realpath(root); a path that escapes the root
 * (e.g. a symlink to ~/.ssh) is skipped, never read. The derived profile is written
 * to <root>/.aidevteam/profile.json, and that target is itself confined — a
 * symlinked .aidevteam that escapes the root is refused rather than followed.
 *
 * Denial-of-service caps bound the work: a per-file byte cap, a total-files cap, a
 * total-bytes cap, a max directory depth, and a wall-clock time budget. Scanning
 * stops when any cap is exceeded; analysis still returns a usable profile.
 *
 * The profile is byte-stable for a given directory (all scans are sorted; the only
 * time-varying field is analyzedAt), so golden-fixture tests are trivial.
 */
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJSON } = require('./write');
const { projectId, projectRoot } = require('./project-id');
const { canonicalRoot } = require('./registry');
const { buildState, safeExists } = require('./state');

const CAPS = Object.freeze({
  maxFileBytes: 256 * 1024,   // bytes read from any single file
  maxFiles: 2000,             // directory entries inspected during the stack scan
  maxTotalBytes: 4 * 1024 * 1024, // cumulative bytes read across all files
  maxDepth: 4,                // directory recursion depth for the stack scan
  maxDescriptionChars: 500,   // stored description length
  timeBudgetMs: 2000,         // wall-clock budget for the whole analysis
});

const PROFILE_VERSION = 1;

// stack markers: present file/dir at (bounded) depth → stack label, scanned in a
// stable order so the resulting stack[] is deterministic
const STACK_MARKERS = [
  ['package.json', 'node'],
  ['tsconfig.json', 'typescript'],
  ['pyproject.toml', 'python'],
  ['requirements.txt', 'python'],
  ['Cargo.toml', 'rust'],
  ['go.mod', 'go'],
  ['pom.xml', 'java'],
  ['build.gradle', 'java'],
  ['build.gradle.kts', 'kotlin'],
  ['Gemfile', 'ruby'],
  ['composer.json', 'php'],
  ['Dockerfile', 'docker'],
  ['.github/workflows', 'ci'],
];

// fixed priority list surfaced to the UI; bounded
const KEY_FILE_CANDIDATES = [
  'README.md', 'README', 'readme.md', 'package.json', 'pyproject.toml',
  'Cargo.toml', 'go.mod', 'pom.xml', 'CLAUDE.md', 'workflow.yaml',
];

const README_NAMES = ['README.md', 'README', 'readme.md', 'Readme.md'];

// a project "already has ADT artefacts" when one of these project-local markers is
// present. A project-local workflow.yaml counts; the framework's bundled default
// (resolved from outside the project) does NOT — every dir would otherwise match.
// The profile.json this analyzer writes is deliberately excluded, so re-analyzing
// the same folder is idempotent (it does not flip the init path to the fast path).
const ARTEFACT_MARKERS = [
  '.workflow-state.json', 'CLAUDE.md',
  path.join('.aidevteam', 'workflow.yaml'),
  path.join('.aidevteam', 'comments'),
  path.join('.aidevteam', 'tickets'),
  path.join('.aidevteam', 'workflow.overrides.json'),
  path.join('.claude', 'workflow', 'workflow.yaml'),
];

/** Resolve `rel` under `root`, returning the real path only if it stays inside root. */
function confinedPath(root, rel) {
  const target = path.join(root, rel);
  let real;
  try { real = fs.realpathSync(target); } catch { return null; }
  if (real !== root && !real.startsWith(root + path.sep)) return null; // escapes root
  return real;
}

/** Read a confined file up to the per-file/total byte caps. Returns '' if absent/escaping. */
function confinedRead(root, rel, budget) {
  const real = confinedPath(root, rel);
  if (!real) return '';
  let stat;
  try { stat = fs.statSync(real); } catch { return ''; }
  if (!stat.isFile()) return '';
  const cap = Math.min(CAPS.maxFileBytes, Math.max(0, CAPS.maxTotalBytes - budget.bytes));
  if (cap <= 0) return '';
  let fd;
  try {
    fd = fs.openSync(real, 'r');
    const buf = Buffer.alloc(cap);
    const n = fs.readSync(fd, buf, 0, cap, 0);
    budget.bytes += n;
    return buf.toString('utf8', 0, n);
  } catch { return ''; }
  finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
}

function existsConfined(root, rel) { return confinedPath(root, rel) != null; }

function parseJsonSafe(txt) {
  try { const v = JSON.parse(txt); return v && typeof v === 'object' ? v : null; }
  catch { return null; }
}

const SHORT_DESCRIPTION_CHARS = 280;
const LONG_DESCRIPTION_CHARS = 1200;
const LONG_DESCRIPTION_PARAGRAPHS = 3;

// Drop fenced code blocks (``` ... ``` / ~~~ ... ~~~) wholesale: their contents
// (ASCII diagrams, shell snippets) are never prose and must not be split across
// blank-line blocks where the body would lose its fence marker.
function stripFences(s) {
  const out = [];
  let fence = null;
  for (const line of s.split('\n')) {
    const open = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (open && line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (open) { fence = open[1]; continue; }
    out.push(line);
  }
  return out.join('\n');
}

// Strip leading YAML front-matter (--- ... ---) and split into blank-line-delimited blocks.
function readmeBlocks(md) {
  let s = String(md || '').replace(/\r\n?/g, '\n');
  const fm = s.match(/^---\n[\s\S]*?\n---\n?/);
  if (fm) s = s.slice(fm[0].length);
  s = stripFences(s);
  return s.split(/\n[ \t]*\n/);
}

// A block is non-prose when every non-blank line is structural/decorative markup
// (badges, images, links/anchors, headings, rules, blockquotes, lists, tables,
// HTML, comments) — i.e. it carries no human-readable sentence to surface.
function isProseBlock(block) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  return lines.some((line) => isProseLine(line));
}

function isProseLine(line) {
  if (!line) return false;
  if (/^<!--/.test(line)) return false;                 // HTML comment
  if (/^#{1,6}\s/.test(line)) return false;             // ATX heading
  if (/^(=+|-{2,}|\*{3,}|_{3,})$/.test(line)) return false; // setext underline / horizontal rule
  if (/^>/.test(line)) return false;                    // blockquote
  if (/^([-*+]\s|\d+[.)]\s)/.test(line)) return false;  // list item
  if (/^\|.*\|/.test(line)) return false;               // table row
  if (/^[|:\- ]+$/.test(line)) return false;            // table delimiter
  if (/^<\/?[a-zA-Z]/.test(line)) return false;         // HTML tag/block line
  // strip inline markup; if nothing readable remains (badge/image/link-only), not prose
  return stripInlineMarkdown(line).replace(/[^\p{L}\p{N}]/gu, '').length > 0;
}

// Reduce inline markdown to plain text: drop images, unwrap links to their text,
// remove emphasis/code markers, decode a few common entities, collapse whitespace.
function stripInlineMarkdown(text) {
  let s = String(text || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');               // HTML comments
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');           // images ![alt](url)
  s = s.replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ');          // reference images
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');         // links [text](url) -> text
  s = s.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');        // reference links -> text
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');             // HTML tags
  s = s.replace(/`+([^`]*)`+/g, '$1');                   // inline code
  s = s.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');    // bold/italic
  s = s.replace(/[*_~`]/g, '');                          // stray emphasis markers
  s = s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => (
    { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }[m] || ' '
  ));
  return s.replace(/\s+/g, ' ').trim();
}

// First genuine prose block of a README as clean plain text, or '' if none exists.
function firstProseParagraph(md) {
  for (const block of readmeBlocks(md)) {
    if (isProseBlock(block)) {
      const text = stripInlineMarkdown(block.replace(/\n/g, ' '));
      if (text) return text;
    }
  }
  return '';
}

// Up to `maxParagraphs` consecutive prose blocks joined into one cleaned passage.
function leadingProse(md, maxParagraphs) {
  const out = [];
  for (const block of readmeBlocks(md)) {
    if (!isProseBlock(block)) continue;
    const text = stripInlineMarkdown(block.replace(/\n/g, ' '));
    if (text) out.push(text);
    if (out.length >= maxParagraphs) break;
  }
  return out.join('\n\n');
}

// Cap to `max` chars on a word/sentence boundary, never mid-token, no trailing space.
function capText(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const sentenceEnd = cut.search(/[.!?][^.!?]*$/);
  if (sentenceEnd > max * 0.5 && /[.!?]/.test(cut[sentenceEnd])) {
    return cut.slice(0, sentenceEnd + 1).trim();
  }
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 0) cut = cut.slice(0, lastSpace);
  return cut.trim();
}

// description from pyproject.toml / Cargo.toml via a simple line regex (zero-dep)
function tomlDescription(txt) {
  const m = String(txt || '').match(/^\s*description\s*=\s*["']([^"'\n]+)["']/m);
  return m ? m[1].trim() : '';
}

function gitRemoteName(root) {
  try {
    const { execFileSync } = require('node:child_process');
    const url = execFileSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], {
      stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim();
    if (!url) return '';
    return url.replace(/\.git$/, '').replace(/[/\\]+$/, '').split(/[/\\:]/).pop() || '';
  } catch { return ''; }
}

/** Detect the stack by scanning marker files within the caps, depth-bounded. */
function detectStack(root, budget) {
  const found = new Set();
  for (const [marker, label] of STACK_MARKERS) {
    if (existsConfined(root, marker)) found.add(label);
  }
  // one bounded level into immediate sub-dirs for nested manifests, respecting caps
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { entries = []; }
  for (const ent of entries) {
    if (budget.files >= CAPS.maxFiles || (Date.now() - budget.start) > CAPS.timeBudgetMs) break;
    budget.files++;
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    for (const [marker, label] of STACK_MARKERS) {
      if (marker.includes('/')) continue;
      if (existsConfined(root, path.join(ent.name, marker))) found.add(label);
    }
  }
  return [...found].sort();
}

function deriveKeyFiles(root) {
  const out = [];
  for (const name of KEY_FILE_CANDIDATES) {
    if (out.includes(name)) continue;
    if (existsConfined(root, name)) out.push(name);
    if (out.length >= 10) break;
  }
  return out;
}

function deriveTitle(root, budget) {
  const pkg = parseJsonSafe(confinedRead(root, 'package.json', budget));
  if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  const remote = gitRemoteName(root);
  if (remote) return remote;
  return path.basename(root);
}

// Derive human-readable prose for the project, never raw README markup.
// Returns { description, longDescription }: a short capped sentence/paragraph and a
// longer passage (a few prose paragraphs) for the project page header. Prefers the
// README's first genuine prose, then package.json/TOML descriptions, then a generic.
function deriveDescription(root, stack, budget) {
  const cap = Math.min(CAPS.maxDescriptionChars, SHORT_DESCRIPTION_CHARS);
  for (const name of README_NAMES) {
    const md = confinedRead(root, name, budget);
    const prose = firstProseParagraph(md);
    if (prose) {
      return {
        description: capText(prose, cap),
        longDescription: capText(leadingProse(md, LONG_DESCRIPTION_PARAGRAPHS), LONG_DESCRIPTION_CHARS),
      };
    }
  }
  const pkg = parseJsonSafe(confinedRead(root, 'package.json', budget));
  if (pkg && typeof pkg.description === 'string' && pkg.description.trim()) {
    const desc = capText(pkg.description.trim(), cap);
    return { description: desc, longDescription: desc };
  }
  for (const name of ['pyproject.toml', 'Cargo.toml']) {
    const desc = tomlDescription(confinedRead(root, name, budget));
    if (desc) {
      const short = capText(desc, cap);
      return { description: short, longDescription: short };
    }
  }
  const primary = stack[0] || 'multi-language';
  const generic = `A ${primary} project.`;
  return { description: generic, longDescription: generic };
}

function hasArtefacts(root) {
  return ARTEFACT_MARKERS.some((m) => existsConfined(root, m));
}

// confine the profile target: refuse a symlinked .aidevteam that escapes the root
function profileTarget(root) {
  const adtDir = path.join(root, '.aidevteam');
  if (safeExists(adtDir)) {
    let real;
    try { real = fs.realpathSync(adtDir); } catch { real = adtDir; }
    if (real !== adtDir && real !== path.join(root, '.aidevteam')) {
      if (!real.startsWith(root + path.sep)) {
        throw new Error('.aidevteam escapes the project root — refusing to write profile');
      }
    }
  }
  return path.join(adtDir, 'profile.json');
}

/**
 * Connect-time analysis for a directory. Validates and canonicalizes the input,
 * derives a profile (fast path if ADT artefacts exist, else init analysis), writes
 * it atomically inside the project root, and returns { root, id, profile, state? }.
 * Throws on invalid input (before any write) and on a profile target that escapes
 * the root.
 */
function analyze(input) {
  canonicalRoot(input); // validate: absolute, exists, is a directory, no NUL
  const root = projectRoot(input);
  const id = projectId(input);
  const budget = { start: Date.now(), bytes: 0, files: 0 };

  const stack = detectStack(root, budget);
  const keyFiles = deriveKeyFiles(root);
  const fast = hasArtefacts(root);

  let state = null;
  if (fast) state = buildState(root);
  const { description, longDescription } = deriveDescription(root, stack, budget);
  const title = deriveTitle(root, budget);

  const profile = {
    version: PROFILE_VERSION,
    id,
    title,
    description,
    longDescription,
    titleOverride: null,
    descriptionOverride: null,
    stack,
    keyFiles,
    source: fast ? 'artefacts' : 'analysis',
    analyzedAt: new Date().toISOString(),
  };

  const target = profileTarget(root); // throws if .aidevteam escapes root
  atomicWriteJSON(target, profile);

  return { root, id, profile, state };
}

/**
 * Read-only companion to analyze(): returns the STORED profile (the profile.json
 * written by the last connect/analyze, confined to the project root) plus a freshly
 * projected workflow state — WITHOUT re-analyzing or writing anything. Used by a
 * plain GET so a read never mutates disk.
 *
 * Falls back gracefully when no profile has been written yet: returns a profile of
 * { id, source: 'unanalyzed' } so the caller still gets the {profile, state} shape
 * and the UI can offer to analyze. Never writes on this path.
 */
function readProfile(input) {
  canonicalRoot(input); // validate: absolute, exists, is a directory, no NUL
  const root = projectRoot(input);
  const id = projectId(input);

  let profile = parseJsonSafe(confinedRead(root, path.join('.aidevteam', 'profile.json'), { bytes: 0 }));
  if (!profile) profile = { version: PROFILE_VERSION, id, source: 'unanalyzed' };

  const state = hasArtefacts(root) ? buildState(root) : null;
  return { root, id, profile, state };
}

module.exports = { analyze, readProfile, CAPS, confinedPath, hasArtefacts, ARTEFACT_MARKERS };
