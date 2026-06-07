'use strict';
/*
 * User-global project registry at ~/.aidevteam/registry.json — a plain index of
 * connected projects, keyed by the canonical projectId. It is never written into
 * any product repo; each project's source of truth stays inside its own repo, so
 * a project remains usable from the bare hub/CLI without this index.
 *
 * Persistence reuses write.js::atomicWriteJSON (tmp + fsync + rename). That call
 * is NOT self-locking, so every read-modify-write here runs under an in-process
 * mutex to serialize concurrent writers within one process. Cross-process write
 * safety (two separate OS processes mutating the file at once) is out of scope —
 * the framework targets a single-developer model; revisit with an advisory file
 * lock if multi-process contention becomes real.
 *
 * The registry holds no secrets: only id/path/label/color/status/timestamps.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { atomicWriteJSON } = require('./write');
const { projectId, projectRoot } = require('./project-id');

const SCHEMA_VERSION = 1;
const STATUSES = new Set(['connected', 'analyzing', 'needs-auth', 'offline', 'error']);
const HEX_ID = /^[0-9a-f]{12}$/;

/** Validate a connect target and return its canonical root. Throws on bad input. */
function canonicalRoot(input) {
  if (typeof input !== 'string' || input.length === 0) throw new Error('path required');
  if (input.includes('\0')) throw new Error('path contains NUL');
  if (!path.isAbsolute(input)) throw new Error('path must be absolute');
  let stat;
  try { stat = fs.statSync(input); } catch { throw new Error('path does not exist'); }
  if (!stat.isDirectory()) throw new Error('path is not a directory');
  return projectRoot(input);
}

function emptyRegistry() { return { version: SCHEMA_VERSION, projects: [] }; }

/**
 * Build a registry bound to a home directory (defaults to the OS home). Injecting
 * `home` keeps the store testable without touching the real user profile.
 */
function createRegistry({ home = os.homedir() } = {}) {
  const file = path.join(home, '.aidevteam', 'registry.json');

  // in-process mutex: serialize read-modify-write so concurrent connects within
  // one process never clobber each other (atomicWriteJSON alone does not lock)
  let tail = Promise.resolve();
  function withLock(fn) {
    const result = tail.then(() => fn());
    tail = result.then(() => {}, () => {});
    return result;
  }

  // tolerant read: a missing or corrupt file yields an empty registry, never throws
  function load() {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return emptyRegistry(); }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return emptyRegistry(); }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) return emptyRegistry();
    const projects = parsed.projects.filter((p) => p && typeof p === 'object' && HEX_ID.test(p.id));
    return { version: SCHEMA_VERSION, projects };
  }

  function persist(reg) { atomicWriteJSON(file, reg); }

  async function list() { return load().projects; }

  async function get(id) {
    if (!HEX_ID.test(String(id || ''))) return null;
    return load().projects.find((p) => p.id === id) || null;
  }

  async function connect(input) {
    const root = canonicalRoot(input);
    const id = projectId(input);
    return withLock(() => {
      const reg = load();
      const existing = reg.projects.find((p) => p.id === id);
      if (existing) return existing;
      const now = new Date().toISOString();
      const record = {
        id,
        path: root,
        label: path.basename(root),
        addedAt: now,
        lastSeen: now,
        status: 'connected',
      };
      reg.projects.push(record);
      persist(reg);
      return record;
    });
  }

  async function remove(id) {
    if (!HEX_ID.test(String(id || ''))) return { removed: false };
    return withLock(() => {
      const reg = load();
      const before = reg.projects.length;
      reg.projects = reg.projects.filter((p) => p.id !== id);
      if (reg.projects.length === before) return { removed: false };
      persist(reg);
      return { removed: true };
    });
  }

  async function touch(id) {
    if (!HEX_ID.test(String(id || ''))) return null;
    return withLock(() => {
      const reg = load();
      const record = reg.projects.find((p) => p.id === id);
      if (!record) return null;
      record.lastSeen = new Date().toISOString();
      persist(reg);
      return record;
    });
  }

  async function update(id, patch) {
    if (!HEX_ID.test(String(id || ''))) return null;
    return withLock(() => {
      const reg = load();
      const record = reg.projects.find((p) => p.id === id);
      if (!record) return null;
      const p = patch || {};
      if (typeof p.label === 'string') record.label = p.label.slice(0, 200);
      if (typeof p.color === 'string') record.color = p.color.slice(0, 32);
      if (typeof p.status === 'string' && STATUSES.has(p.status)) record.status = p.status;
      record.lastSeen = new Date().toISOString();
      persist(reg);
      return record;
    });
  }

  return { file, load, list, get, connect, remove, touch, update };
}

module.exports = { createRegistry, canonicalRoot, SCHEMA_VERSION, STATUSES, HEX_ID };
