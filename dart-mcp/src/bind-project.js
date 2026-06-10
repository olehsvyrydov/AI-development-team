'use strict';
/*
 * Resolve the SINGLE project this server is bound to, at spawn time only.
 *
 * The bound directory comes from the process: its cwd by default, or a launch argument
 * the plugin passes (an absolute directory). The plugin spawns the server with the
 * project's canonical root, so binding is a plain realpath here — deliberately NO git
 * sub-process: the whole server import graph must stay free of child_process/exec, and
 * canonicalization that shells out would breach that. The spawner owns the canonical root.
 *
 * This is the ONLY place a directory is chosen, and it happens before any tool runs. A
 * tool argument never reaches here: the server passes the resolved bound directory to
 * every handler, so a client-supplied path / project id can never retarget a different
 * project's directory ("lookup key, never a path", collapsed to the single bound project).
 */
const fs = require('node:fs');
const path = require('node:path');

// Canonicalize a bound directory without shelling out (no git, no exec): realpath, or the
// input itself when realpath fails. Mirrors the registry's realpath fall-through only.
function canonicalDir(dir) {
  try { return fs.realpathSync(dir); } catch { return dir; }
}

/**
 * Resolve the bound project root from the spawn environment.
 *
 * @param argv process arguments after the script (the first absolute directory wins)
 * @param cwd the process working directory (the default bind target)
 * @returns the canonical bound project root
 * @throws Error when the chosen path is not an existing directory
 */
function resolveBoundProject(argv = [], cwd = process.cwd()) {
  const launchArg = (Array.isArray(argv) ? argv : []).find((a) => typeof a === 'string' && path.isAbsolute(a));
  const target = launchArg || cwd;
  let stat;
  try { stat = fs.statSync(target); } catch { throw new Error('bound project path does not exist'); }
  if (!stat.isDirectory()) throw new Error('bound project path is not a directory');
  return canonicalDir(target);
}

module.exports = { resolveBoundProject };
