'use strict';
/*
 * Read-only directory browser for the folder picker.
 *
 *   GET /api/fs/roots            → { ok, roots:[{label,path}], recent:[{label,path}] }
 *   GET /api/fs/list?path=<dir>  → { ok, path, parent, entries:[{name,type:'dir',hasProject}], truncated? }
 *
 * This surface hands LOCAL FILESYSTEM READ to the browser, so it is the single new
 * attack surface in the slice and is deliberately narrow:
 *
 *   - One allowed root: the realpath of $HOME, resolved once. Every listing is
 *     confined to that root or a descendant; nothing outside it is ever reached.
 *   - Input is rejected before any FS work (non-string, relative, NUL, empty, or
 *     over-long path); a missing path defaults to the root.
 *   - The requested path is realpath-resolved BEFORE the containment check, so a
 *     symlink that escapes the root is caught and refused, never followed.
 *   - Containment reuses the analyze.js rule (realpath + `real===root ||
 *     real.startsWith(root+sep)`) — a trailing-separator check, so the
 *     /home/foo vs /home/foobar prefix trap is rejected.
 *   - Each child is itself containment-checked; an escaping symlink child is
 *     SKIPPED, not followed. Only directories are returned; files are omitted.
 *   - Entries carry exactly { name, type:'dir', hasProject } — readdir only, never
 *     readFile; no size/mtime/stat recon fields. hasProject is an existence-only
 *     artefact-marker check.
 *   - The listing is one directory level (non-recursive, no glob), entry-capped
 *     with a `truncated` flag, within a wall-clock budget — bounded against DoS.
 *
 * Pure read: nothing here writes, creates, deletes, or mutates anything. The HTTP
 * layer additionally routes both GETs through guard.js::writeAllowed because the
 * disclosure of home-directory structure is a capability, not public data.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { confinedPath, hasArtefacts, CAPS } = require('./analyze');

const MAX_PATH_LENGTH = 4096;       // bound the request path before any FS work
const MAX_ENTRIES = CAPS.maxFiles;  // one-level entry cap (mirrors the analyzer cap)
const TIME_BUDGET_MS = CAPS.timeBudgetMs;

let cachedHome = null;

/** The single allowed root: realpath($HOME), resolved once. */
function realHome() {
  if (cachedHome == null) {
    try { cachedHome = fs.realpathSync(os.homedir()); } catch { cachedHome = os.homedir(); }
  }
  return cachedHome;
}

/**
 * Realpath-resolve `target` and return it only if it is the root or a descendant
 * of it, reusing the analyze.js containment rule. Returns null when `target`
 * escapes the root or cannot be resolved. The trailing-separator check rejects the
 * /home/foo vs /home/foobar prefix trap.
 */
function confinedHome(root, target) {
  let real;
  try { real = fs.realpathSync(target); } catch { return null; }
  if (real === root) return real;
  if (real.startsWith(root + path.sep)) return real;
  return null;
}

// Validate the requested path before touching the filesystem. A truly absent path
// (null/undefined) defaults to the root so the picker opens at Home; any other
// malformed input — including an empty string — is rejected outright.
function validateRequestPath(root, requested) {
  if (requested == null) return { ok: true, value: root };
  if (typeof requested !== 'string') return { ok: false, reason: 'path must be a string' };
  if (requested.length === 0) return { ok: false, reason: 'path is empty' };
  if (requested.length > MAX_PATH_LENGTH) return { ok: false, reason: 'path too long' };
  if (requested.includes('\0')) return { ok: false, reason: 'path contains NUL' };
  if (!path.isAbsolute(requested)) return { ok: false, reason: 'path must be absolute' };
  return { ok: true, value: requested };
}

/**
 * List the immediate sub-directories of `requested` (default: `root`), confined to
 * `root`. Returns { ok:true, path, parent, entries, truncated? } on success, or
 * { ok:false, code, reason } on a refusal. Reads directory entries only — never a
 * file's bytes.
 */
function listDirectory(root, requested) {
  const valid = validateRequestPath(root, requested);
  if (!valid.ok) return { ok: false, code: 400, reason: valid.reason };

  const real = confinedHome(root, valid.value);
  if (!real) return { ok: false, code: 403, reason: 'path is outside the allowed root' };

  let stat;
  try { stat = fs.statSync(real); } catch { return { ok: false, code: 404, reason: 'path does not exist' }; }
  if (!stat.isDirectory()) return { ok: false, code: 400, reason: 'path is not a directory' };

  let dirents;
  try { dirents = fs.readdirSync(real, { withFileTypes: true }); } catch {
    return { ok: false, code: 400, reason: 'cannot read directory' };
  }

  const start = Date.now();
  const entries = [];
  let truncated = false;
  for (const ent of dirents) {
    if (entries.length >= MAX_ENTRIES || (Date.now() - start) > TIME_BUDGET_MS) { truncated = true; break; }
    // resolve each child to decide directory-ness AFTER following a symlink, and to
    // skip a child whose realpath escapes the root (skip-not-follow)
    const childReal = confinedHome(real, path.join(real, ent.name));
    if (!childReal) continue; // escaping symlink child → skipped, never listed
    let childStat;
    try { childStat = fs.statSync(childReal); } catch { continue; }
    if (!childStat.isDirectory()) continue; // files (and non-dirs) omitted entirely
    entries.push({ name: ent.name, type: 'dir', hasProject: hasArtefacts(childReal) });
  }

  const parent = real === root ? null : confinedHome(root, path.dirname(real));
  const result = { ok: true, path: real, parent: parent || null, entries };
  if (truncated) result.truncated = true;
  return result;
}

/**
 * The picker's starting points: Home plus the registry's recent roots, each
 * containment-checked so a stale entry pointing outside Home is omitted, not echoed.
 */
function listRoots(root, recent) {
  const roots = [{ label: 'Home', path: root }];
  const out = [];
  for (const r of Array.isArray(recent) ? recent : []) {
    if (!r || typeof r.path !== 'string') continue;
    const real = confinedHome(root, r.path);
    if (!real) continue;
    out.push({ label: typeof r.label === 'string' ? r.label : path.basename(real), path: real });
  }
  return { ok: true, roots, recent: out };
}

module.exports = { listDirectory, listRoots, confinedHome, realHome, MAX_ENTRIES, MAX_PATH_LENGTH };
