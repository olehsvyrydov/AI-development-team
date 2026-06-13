'use strict';
/*
 * Write-containment for the Kiro generator. Every write target MUST resolve
 * inside the chosen `.kiro/` (workspace) or `~/.kiro/` (global) root. The
 * trailing-separator compare rejects the sibling-prefix trap (`/p/.kiro` vs
 * `/p/.kiro-evil`); realpath resolution of existing ancestors rejects a `..`
 * escape and a symlink whose target leaves the root.
 *
 * This is NET-NEW write-confinement code (the `state.js` isContained helper is
 * scoped to ~/.aidevteam READS); it reuses the same trailing-separator pattern.
 */
const fs = require('node:fs');
const path = require('node:path');

/**
 * True only when `child` is `root` itself or lies strictly beneath it. The
 * trailing-separator compare rejects the sibling-prefix trap (/p/.kiro vs
 * /p/.kiro-evil).
 */
function isContained(root, child) {
  return child === root || child.startsWith(root + path.sep);
}

/**
 * Realpath the deepest EXISTING ancestor of an absolute target so a symlinked
 * ancestor is resolved to its true location (and thus caught by the containment
 * check), while still allowing not-yet-created leaf paths.
 */
function realpathExistingAncestor(absolute) {
  let dir = absolute;
  const tail = [];
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    tail.unshift(path.basename(dir));
    dir = parent;
  }
  let realDir;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    realDir = dir;
  }
  return tail.length ? path.join(realDir, ...tail) : realDir;
}

/**
 * Resolve `relative` against the realpath'd `root` and refuse anything that
 * escapes the root. With `mustRealpath`, also resolve symlinked ancestors of the
 * target and refuse if the resolved path leaves the root.
 *
 * @param root the scope root (its realpath is the containment boundary)
 * @param relative a path relative to the root (a leading abs path / `..` escape is refused)
 * @param opts.mustRealpath also reject a target reachable only through an escaping symlink
 * @return the absolute, contained write target
 * @throws Error if the resolved target would escape the root
 */
function resolveWithin(root, relative, opts = {}) {
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    realRoot = path.resolve(root);
  }
  const joined = path.resolve(realRoot, relative);
  if (!isContained(realRoot, joined)) {
    throw new Error(`refused: target escapes .kiro containment: ${relative}`);
  }
  if (opts.mustRealpath) {
    const resolved = realpathExistingAncestor(joined);
    if (!isContained(realRoot, resolved)) {
      throw new Error(`refused: symlinked target escapes .kiro containment: ${relative}`);
    }
    return resolved;
  }
  return joined;
}

module.exports = { isContained, resolveWithin, realpathExistingAncestor };
