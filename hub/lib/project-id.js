'use strict';
/*
 * Stable project identity, shared by the memory store and the hub registry so a
 * project's board and its vector rows line up. JS port of the TypeScript
 * implementation in claude/memory/src/lib/project-id.ts — the algorithm is
 * reproduced exactly (same hash, encoding, truncation, and fall-through order)
 * so both sides derive the identical key for any directory.
 *
 * id = first 12 hex of sha1(canonical project root). The canonical root is the
 * git top-level if the dir is inside a repo, else the realpath of the dir.
 * Path-based, so a move/rename can orphan history — accepted as a known
 * limitation; the registry keeps the path so a future re-link can recompute it.
 */
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');

/** Resolve the canonical root for a working directory (git top-level or realpath). */
function projectRoot(cwd) {
  try {
    // argv form, no shell — a hostile dir name cannot be interpreted as a command
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    if (top) return top;
  } catch {
    // not a git repo (or git absent) — fall through
  }
  try {
    return fs.realpathSync(cwd);
  } catch {
    return cwd;
  }
}

/** Short, stable id for a project, derived from its canonical root. */
function projectId(cwd) {
  const root = projectRoot(cwd);
  return crypto.createHash('sha1').update(root).digest('hex').slice(0, 12);
}

module.exports = { projectRoot, projectId };
