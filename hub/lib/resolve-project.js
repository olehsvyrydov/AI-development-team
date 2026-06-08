'use strict';
/*
 * The single id→target authority at the HTTP boundary.
 *
 * The browser supplies a `project` value that selects which registered project a
 * mutation writes to and which project's live stream a subscriber receives. That
 * value is a registry LOOKUP KEY, never a path: it is shape-checked against the
 * anchored 12-hex id regex FIRST, then resolved ONLY via registry.get → the
 * canonical record.path produced at connect time. It is never concatenated into a
 * filesystem path, never passed to path.join / fs.*, and no client-supplied
 * path/dir/file field is honored. A crafted id (traversal, absolute, separator,
 * NUL, wrong length, non-hex, uppercase) fails the shape check → 400; a
 * well-formed but unregistered id finds no row → 404. An absent id falls back to
 * the launch project (single-project back-compat).
 *
 * Exactly one resolveProject() serves both the mutation body field and the stream
 * query param, so there is one audit point and identical rejection behavior.
 */
const { HEX_ID } = require('./registry');

/**
 * Resolve a client-supplied project id to a target directory.
 *
 * @param id the client `project` value (mutation body field or stream query param);
 *           absent/empty selects the launch project
 * @param deps `{ registry, launch }` — the user-global registry and the launch root
 * @returns `{ ok:true, dir }` on success, or `{ ok:false, code, error }` with a
 *          terse message (no absolute paths, no stack traces) on refusal
 */
async function resolveProject(id, { registry, launch }) {
  if (id == null || id === '') return { ok: true, dir: launch };
  if (typeof id !== 'string' || !HEX_ID.test(id)) {
    return { ok: false, code: 400, error: 'invalid project id' };
  }
  const record = await registry.get(id);
  if (!record) return { ok: false, code: 404, error: 'unknown project' };
  return { ok: true, dir: record.path };
}

module.exports = { resolveProject };
