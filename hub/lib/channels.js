'use strict';
/*
 * Per-project live-stream channels.
 *
 * Replaces the single global SSE subscriber set with one channel per RESOLVED
 * project root, so a writer to project A broadcasts ONLY to A's subscribers
 * (cross-project isolation). Each channel:
 *   - owns its own fs.watch set, created on the FIRST subscriber and torn down on
 *     the LAST unsubscribe (reference-counted via the returned subscription's
 *     close()), so the server never watches a project nobody is viewing and leaks
 *     no file descriptors across subscribe/unsubscribe cycles;
 *   - coalesces a burst of file changes into one push (per-channel debounce);
 *   - re-scans its watch targets on every change so a directory created after the
 *     first subscribe (e.g. .aidevteam/) is picked up.
 *
 * A cap on concurrently watched projects bounds the file-descriptor budget: at the
 * cap, a new project is refused cleanly (503) while existing channels keep serving;
 * a new subscriber to an already-active project always reuses its channel.
 *
 * The SSE payload is produced by an injected render(dir) so this module stays free
 * of the state projection (testable in isolation).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CAP = 16;
const DEFAULT_DEBOUNCE_MS = 150;

// per-channel watch targets, rooted at the channel's project dir (mirrors the
// inputs the state projection reads), plus the user-level workflow override
function watchTargets(dir, workflowFile) {
  const rels = [
    '', '.workflow-state.json', 'Backlog.md',
    '.aidevteam', '.aidevteam/tickets', '.aidevteam/kb', '.aidevteam/comments', '.claude/workflow',
    'backlog', 'backlog/tasks', 'docs', 'kb',
  ];
  const targets = rels.map((rel) => (rel ? path.join(dir, rel) : dir));
  targets.push(path.join(os.homedir(), '.aidevteam'));
  if (workflowFile) targets.push(workflowFile);
  return targets;
}

/**
 * Build a channel manager.
 *
 * @param opts.render `(dir) => string` produces the SSE `data:` payload for a project
 * @param opts.findWorkflow optional `(dir) => string|null` active workflow path to watch
 * @param opts.cap max concurrently watched projects (default 16)
 * @param opts.debounceMs per-channel change coalesce window (default 150)
 */
function createChannels({ render, findWorkflow = () => null, cap = DEFAULT_CAP, debounceMs = DEFAULT_DEBOUNCE_MS } = {}) {
  const channels = new Map(); // resolved dir -> channel

  function frame(dir) { return `event: update\ndata: ${render(dir)}\n\n`; }

  function makeChannel(dir) {
    const channel = { dir, subscribers: new Set(), watched: new Map(), debounce: null };

    const broadcast = () => {
      const payload = frame(dir);
      for (const res of channel.subscribers) {
        try { res.write(payload); } catch { channel.subscribers.delete(res); }
      }
    };
    const onChange = () => {
      clearTimeout(channel.debounce);
      channel.debounce = setTimeout(() => { startWatchers(); broadcast(); }, debounceMs);
    };
    const watch = (p) => {
      if (channel.watched.has(p)) return;
      try { fs.statSync(p); } catch { return; } // only watch what exists
      try {
        const w = fs.watch(p, { persistent: true }, onChange);
        channel.watched.set(p, w);
      } catch { /* a single bad watch never tears the channel down */ }
    };
    const startWatchers = () => { for (const t of watchTargets(dir, findWorkflow(dir))) watch(t); };

    channel.startWatchers = startWatchers;
    channel.broadcast = broadcast;
    channel.teardown = () => {
      clearTimeout(channel.debounce);
      for (const w of channel.watched.values()) { try { w.close(); } catch {} }
      channel.watched.clear();
    };
    return channel;
  }

  /** True when a project can be subscribed (already active, or under the cap). */
  function hasCapacity(dir) { return channels.has(dir) || channels.size < cap; }

  /**
   * Subscribe a response stream to a project's channel. Sends the initial frame and
   * returns `{ ok:true, close }` (call close on the request's 'close' to unsubscribe);
   * over the active-project cap a NEW project yields `{ ok:false, code:503, error }`.
   *
   * `res` must already have its SSE response head written when the caller writes
   * over a real HTTP stream (the initial frame is written to the body here).
   */
  function subscribe(dir, res) {
    let channel = channels.get(dir);
    if (!channel) {
      if (channels.size >= cap) return { ok: false, code: 503, error: 'too many active projects' };
      channel = makeChannel(dir);
      channels.set(dir, channel);
      channel.startWatchers();
    }
    channel.subscribers.add(res);
    try { res.write(frame(dir)); } catch { /* client already gone */ }

    let active = true;
    const close = () => {
      if (!active) return;
      active = false;
      channel.subscribers.delete(res);
      if (channel.subscribers.size === 0) {
        channel.teardown();
        channels.delete(dir);
      }
    };
    return { ok: true, close };
  }

  /** Push a fresh frame to one project's subscribers (used when a mutation lands). */
  function push(dir) {
    const channel = channels.get(dir);
    if (channel) channel.broadcast();
  }

  function activeCount() { return channels.size; }
  function watcherCount(dir) { const c = channels.get(dir); return c ? c.watched.size : 0; }
  function closeAll() {
    for (const channel of channels.values()) channel.teardown();
    channels.clear();
  }

  return { subscribe, push, hasCapacity, activeCount, watcherCount, closeAll };
}

module.exports = { createChannels, watchTargets };
