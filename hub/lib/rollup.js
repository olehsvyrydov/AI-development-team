'use strict';
/*
 * Cross-project rollup multiplexer.
 *
 * A single SSE connection mirrors EVERY registered project live. It does NOT open
 * one stream per project on the wire: it subscribes an in-process sink to each
 * project's existing channel (reusing channels.js — its reference counting, per-
 * channel debounce, FD cap and leak-free teardown), recomputes ONLY the project
 * whose files changed, merges that one entry into a cached rollup object, and emits
 * a single merged frame to the connection. The first frame to a new connection is a
 * full snapshot of all registry projects.
 *
 * Bounds (so cost never scales with the number of projects on the hot path):
 *   - O(1) per tick: a change recomputes exactly the changed project's summary; the
 *     other entries are reused from the cache, never rebuilt.
 *   - merge-emit debounce on top of the per-channel debounce, so a burst across
 *     projects collapses to one frame.
 *   - live-pin at most the channel cap, ordered by relevance (needsYou first, then
 *     most-recently-seen); projects beyond the cap appear in the frame from the
 *     cheap stat-only freshness/summary path and are flagged not-live. The cap is
 *     never raised; an over-cap channel is simply not opened.
 *
 * The emitted frame is a strict subset of GET /api/projects: per project it carries
 * { id, label, status, open, needsYou, stateChangedAt, live } — it drops `path` and
 * every ticket title/body. The project set is derived server-side from the registry;
 * there is no client-supplied project list, which removes the id/path-injection class
 * by construction.
 */
const { listSummary, stateChangedAt } = require('./state');

const DEFAULT_CAP = 16;
const DEFAULT_MERGE_DEBOUNCE_MS = 200;
const DEFAULT_COLD_REFRESH_MS = 5000;

/** Largest relevance score sorts first: any waiting decision outranks idle, then most-recently-seen. */
function relevanceKey(record, needsYou) {
  const seen = Date.parse(record.lastSeen || '') || 0;
  return { needsYou: needsYou || 0, seen };
}
function moreRelevant(a, b) {
  if (b.key.needsYou !== a.key.needsYou) return b.key.needsYou - a.key.needsYou;
  return b.key.seen - a.key.seen;
}

/**
 * Build a rollup multiplexer over the registry's projects, fanning every project's
 * changes into one merged SSE frame.
 *
 * @param opts.channels   the shared channel manager (channels.js) whose per-project
 *                        channels are reused; a project already watched by a board
 *                        viewer is shared, not re-watched
 * @param opts.registry   project registry exposing async `list()` of {id,path,label,status,lastSeen}
 * @param opts.summarize  optional `(dir) => {open,needsYou}|null`; defaults to listSummary
 *                        (one buildState for the changed project only)
 * @param opts.freshness  optional `(dir) => number|null` epoch-ms of last state change;
 *                        defaults to stateChangedAt (stat-only, no rebuild)
 * @param opts.cap        max live-pinned projects (defaults to the channel cap, 16)
 * @param opts.mergeDebounceMs merge-emit coalesce window in ms (default 200)
 * @param opts.coldRefreshMs interval in ms at which over-cap (cold) projects — which
 *        have no live channel to wake them — are cheaply re-summarized so their tail
 *        never freezes (default 5000); only the cold projects are recomputed, no
 *        channel is opened and the cap is never raised
 */
function createRollup({
  channels,
  registry,
  summarize = listSummary,
  freshness = stateChangedAt,
  cap = DEFAULT_CAP,
  mergeDebounceMs = DEFAULT_MERGE_DEBOUNCE_MS,
  coldRefreshMs = DEFAULT_COLD_REFRESH_MS,
} = {}) {
  const connections = new Set();

  function entryFor(record, live) {
    const summary = summarize(record.path) || { open: 0, needsYou: 0 };
    const at = freshness(record.path);
    return {
      id: record.id,
      label: record.label,
      status: record.status,
      open: summary.open || 0,
      needsYou: summary.needsYou || 0,
      stateChangedAt: typeof at === 'number' ? at : null,
      live: !!live,
    };
  }

  function frameOf(conn) {
    let totalOpen = 0;
    let totalNeedsYou = 0;
    const projects = conn.order.map((id) => {
      const e = conn.cache.get(id);
      totalOpen += e.open;
      totalNeedsYou += e.needsYou;
      return e;
    });
    return { totalOpen, totalNeedsYou, projects };
  }

  function emit(conn) {
    if (!conn.ready) return;
    const payload = `event: rollup\ndata: ${JSON.stringify(frameOf(conn))}\n\n`;
    try { conn.res.write(payload); } catch { /* client gone; teardown runs on close */ }
  }

  function scheduleEmit(conn) {
    clearTimeout(conn.debounce);
    conn.debounce = setTimeout(() => emit(conn), mergeDebounceMs);
  }

  // recompute exactly the one project whose channel woke, merge it, debounce-emit
  function onProjectChange(conn, record) {
    const live = conn.pinned.has(record.id);
    conn.cache.set(record.id, entryFor(record, live));
    scheduleEmit(conn);
  }

  /**
   * True when a re-summarized entry differs from the cached one in any wire field.
   * Identity (id/label/status) and live-ness are stable for a cold project, so this
   * compares only the values the cold refresh can change.
   */
  function entryChanged(prev, next) {
    return !prev
      || prev.open !== next.open
      || prev.needsYou !== next.needsYou
      || prev.stateChangedAt !== next.stateChangedAt;
  }

  // Cold projects (over the cap) have no channel sink to wake them, so a single slow
  // interval per connection cheaply re-summarizes ONLY them and merges any change.
  // It opens no channel and never raises the cap — the cold tail stays cold but fresh.
  function refreshCold(conn) {
    let changed = false;
    for (const record of conn.cold) {
      const next = entryFor(record, false);
      if (entryChanged(conn.cache.get(record.id), next)) {
        conn.cache.set(record.id, next);
        changed = true;
      }
    }
    if (changed) scheduleEmit(conn);
  }

  /**
   * Subscribe an SSE response to the rollup. Resolves the registry, pins live
   * channels up to the cap by relevance, builds and emits the full snapshot, then
   * keeps the frame merged on each project change. Registers teardown on the
   * close-source's 'close'. Returns the connection handle (mainly for tests).
   *
   * @param res an SSE response with `write(string)`; its head must already be
   *            written by the caller
   * @param closeSource the stream whose 'close' event drives teardown; defaults to
   *        `res`. Pass the request to align with the per-project stream, which
   *        unsubscribes on the request's 'close'.
   */
  async function subscribe(res, closeSource = res) {
    const records = await registry.list();
    const conn = {
      res,
      ready: false,
      cache: new Map(),   // id -> entry
      order: [],          // ids in display order (relevance), stable for the connection
      pinned: new Set(),  // ids with a live channel sink
      sinks: [],          // { close } from channels.subscribe, for teardown
      cold: [],           // records over the cap (no sink) refreshed on the slow interval
      debounce: null,
      coldTimer: null,
    };
    connections.add(conn);
    // register teardown before pinning any sink so a throw during setup (e.g. a watch
    // wiring failure in channels.subscribe) cannot leak a pinned sink or a connection
    // with no close handler; teardown is idempotent so the close event is safe too.
    closeSource.on('close', () => teardown(conn));

    try {
      // first snapshot: summarize every project once (this is the snapshot cost, not
      // the hot path) and rank by relevance so the cap pins the projects that matter
      const ranked = records.map((record) => {
        const summary = summarize(record.path) || { open: 0, needsYou: 0 };
        return { record, key: relevanceKey(record, summary.needsYou) };
      }).sort(moreRelevant);

      for (let i = 0; i < ranked.length; i++) {
        const record = ranked[i].record;
        const wantLive = i < cap;
        let live = false;
        if (wantLive) {
          // the sink IS the change signal: every channel write (initial + each
          // broadcast) wakes a single-project recompute. The payload is ignored —
          // the rollup recomputes the summary itself, never re-parses N states.
          const sink = { write: () => onProjectChange(conn, record) };
          const sub = channels.subscribe(record.path, sink);
          if (sub.ok) { live = true; conn.sinks.push(sub); conn.pinned.add(record.id); }
        }
        if (!live) conn.cold.push(record);
        conn.cache.set(record.id, entryFor(record, live));
        conn.order.push(record.id);
      }

      conn.ready = true;
      emit(conn);

      if (conn.cold.length && coldRefreshMs > 0) {
        conn.coldTimer = setInterval(() => refreshCold(conn), coldRefreshMs);
        if (conn.coldTimer.unref) conn.coldTimer.unref();
      }
    } catch (err) {
      teardown(conn);
      throw err;
    }
    return conn;
  }

  function teardown(conn) {
    if (!connections.has(conn)) return;
    connections.delete(conn);
    clearTimeout(conn.debounce);
    clearInterval(conn.coldTimer);
    for (const sub of conn.sinks) { try { sub.close(); } catch { /* already closed */ } }
    conn.sinks = [];
    conn.pinned.clear();
  }

  /** Tear down every open rollup connection (releases all live channel sinks). */
  function closeAll() { for (const conn of [...connections]) teardown(conn); }

  function connectionCount() { return connections.size; }

  return { subscribe, closeAll, connectionCount };
}

module.exports = { createRollup };
