# Architecture Gate — Cross-Project Rollup (live Projects Home)

**Author:** Jorge (/arch) · **Stands in for:** /secops confirmation (read-only, no new exposure) · **Date:** 2026-06-13
**Scope:** Make the cockpit's Projects Home mirror N connected projects in real time — live cross-project "needs-you" strip, live per-project cards, per-project state freshness.

## Decision

**ARCHITECTURE = APPROVED-WITH-CONDITIONS.**
**SECURITY = NOT-TRIGGERED-FOR-NEW-SURFACE** (read-only, no data class beyond today's `GET /api/projects`), **provided the conditions below hold**. One condition (the DoS bound) is the only thing standing between this and a full /secops escalation — it is mechanical and listed as C-3.

Smallest change that delivers the differentiator: **one thin server-side fan-out endpoint + make the existing ProjectsHome strip/cards live off it.** No new view, no new data class, no new mutation.

---

## 1. Transport — server-side fan-out SSE (option a)

**Chosen: `GET /api/events/rollup` — a single SSE stream that internally multiplexes the active per-project channels and emits a merged rollup frame on any change.**

Rejected:
- **(b) N client EventSources merged client-side.** EventSource has a low per-origin connection cap (~6 in browsers), no clean client multiplex, and pushes the FD/cap accounting into the UI. At 50 projects this is dead on arrival. Reject.
- **(c) interval poll of `GET /api/projects`.** Not "real time"; and far *worse* on load than fan-out, because every poll rebuilds `buildState` for **all** N projects unconditionally (see §2). Reject as the primary; keep a slow poll only as a liveness fallback if the stream drops (UI concern, not architecture).

Why fan-out wins: it **reuses `channels.js` verbatim** — reference counting, per-channel debounce, the FD cap, and FD-leak-free teardown already exist and are proven. The multiplexer is a subscriber *of the same channel machinery the cockpit board already uses*, not a parallel watch path.

### Shape of the multiplexer (the only new server code)

- On connect, resolve the registry list → subscribe the rollup connection to **each registered project's channel** through the existing `channels.subscribe(dir, sink)`, where `sink` is an internal in-process writer (not the HTTP res), reusing reference counting so a project already watched by a board viewer is shared, not re-watched.
- On any channel change, recompute **only the changed project's** summary, merge into a cached rollup object, and write one merged frame to the rollup connection. Debounce the *merge/emit* (≈150–250ms) on top of the per-channel debounce so a burst across projects collapses to one frame.
- Teardown mirrors `subscribe`'s `close()` for every project on request close — no new FD lifecycle invented.

### Cap interaction (the one real constraint)

The channel cap is ~16 active projects. A rollup over **>16 registered projects cannot pin a live watcher on every project at once.** Do **not** raise the cap (it is the FD budget). Resolution:

- **C-1 (MANDATORY):** the rollup subscribes live channels up to the cap, ordered by relevance (projects with `needsYou > 0` first, then most-recently-seen). Projects beyond the cap are included in the frame from a **cheap cold summary** (file-stat read, §2) refreshed on a slow interval, and are clearly "not live-pinned." This keeps 2–16 projects fully live, degrades gracefully at 50, and never breaches the FD budget. At the cap a new live subscription is refused exactly as `subscribe` already does (clean, no leak).

`2 projects`: both live, trivial. `50 projects`: top ~16 live by relevance, the tail cold-refreshed — bounded, honest, no stall.

---

## 2. Rollup projection + freshness — and the perf bound

### Frame shape (exactly what the cockpit needs, nothing more)

```jsonc
{
  "rev": "<monotone server rev for this frame>",
  "totals": { "open": <int>, "needsYou": <int> },
  "projects": [
    {
      "id": "<12-hex>",
      "label": "<registry label>",
      "status": "<registry status>",
      "open": <int>,
      "needsYou": <int>,
      "freshness": <epoch-ms>,   // see below
      "live": <bool>             // true = live-pinned channel; false = cold-refreshed (over cap)
    }
  ]
}
```

Every field is **already exposed by `GET /api/projects`** (`{...rec, taskSummary:{open,needsYou}}`) except `freshness` and `live`, which are metadata about *the same* summary. **No ticket titles, paths, or ledger bodies.** (Note: today `GET /api/projects` returns the full registry `rec`, which includes `path`. The rollup frame **must project to `{id,label,status}` and drop `path`** — same data class or *less*, never more.)

### Freshness — from `fileRev`, not a rebuild

`freshness` = the ledger/state mtime, sourced from the **existing `fileRev(project)`** (mtime+size of `.workflow-state.json` and the overrides file) — already computed, already on the detail frame as `rev`, no new I/O. Surface it as the max mtime (or expose `fileRev` directly as an opaque token + a display mtime). **Do not** derive freshness from registry `lastSeen` (that is heartbeat, not state change) and **do not** compute it by building state.

### THE PERF TRAP — and the bound (MANDATORY)

Confirmed against source: **`listSummary` calls full `buildState(project)`** (state.js:769). The naive design — recompute all N summaries on every file change, or poll `/api/projects` (which maps `listSummary` over all records) — is O(N × buildState) per tick. That is the trap.

- **C-2 (MANDATORY): recompute only the project that changed.** Each per-channel change recomputes **one** `listSummary`/`buildState` (the changed dir) and merges into the cached rollup; the other N-1 entries are untouched. A change is therefore O(1 buildState), not O(N).
- **C-3 (MANDATORY): debounce + cap + cheap cold path.** (i) Merge-emit debounce ≈150–250ms on top of the per-channel debounce. (ii) Live `buildState` only for the ≤16 live-pinned projects. (iii) Over-cap projects use a **cheap cold summary**: prefer a stat-only freshness read; a full `buildState` for cold projects runs at most on a slow interval (e.g. ≤ every few seconds), never on the hot path. This bounds worst-case work regardless of N.

`buildState` for one small project is acceptable per change. `buildState` for *all* projects on *every* change is not — C-2 is what makes the difference and is non-negotiable.

---

## 3. Security confirmation (stands in for /secops)

Verified against `channels.js`, `projects.js`, `server.js`:

- **(a) READ-ONLY.** No mutation, no write route, no engine tick. Pure projection of summaries the API already serves. ✅
- **(b) No new exposure.** Frame carries `{id,label,status,open,needsYou,freshness,live}` — a **subset** of `GET /api/projects` (drops `path`; adds only freshness metadata over the same summary). No ticket titles, no paths, no ledger bodies. ✅ *Condition: the implementation MUST project away `path`; do not stream the raw registry `rec`.*
- **(c) Loopback-only.** Ride the **same `streamAllowed` guard the `/api/events` SSE uses** (Host/Origin/socket pinning, loopback; EventSource cannot send `X-AIDT`, so pinning is the operative control). Apply it BEFORE resolving the registry or opening any channel. ✅
- **(d) No path/id injection.** The rollup takes **no `projects=` id list from the client** — it derives the project set from the server-side registry. (If a future filter param is added, ids MUST be validated `HEX_ID` and registry-resolved, never path-concatenated — same rule as `projects.js`.) This removes an entire injection class by construction. ✅
- **(e) DoS bound.** This is the *only* place a new risk could enter. It is closed by **C-1 (cap, never raised), C-2 (recompute only the changed project), C-3 (debounce + cheap cold path)**. A huge/malicious project tree costs at most one `buildState` per debounced change of *that* project, and N projects cannot multiply the hot-path cost. ✅ **conditional on C-1/C-2/C-3.**

**Escalation trigger → a full /secops review IS required IF** the implementation: (i) raises the channel cap to "fan out to all," (ii) accepts a client-supplied `projects=` id/path list, (iii) adds ticket titles/paths/ledger bodies to the frame, or (iv) recomputes all-N on the hot path (unbounded recompute = DoS). Absent all four, **SECURITY = NOT-TRIGGERED-FOR-NEW-SURFACE.**

---

## 4. Consolidation / UX-arch call

**Make the EXISTING `ProjectsHome` live — do NOT add a new view/route.** ProjectsHome already computes `totalNeedsYou`, the sorted "waiting" list, the cockpit strip, and per-card open/needsYou pulse. The only gaps are: the list is fetched **once** (no live refresh) and freshness is registry `lastSeen` (wrong source). Both are fixed by feeding the same components from the live stream.

**Cockpit contract — a live `RollupStore`:**
- One `RollupStore` opens `GET /api/events/rollup`, holds the latest rollup frame, exposes `totals` and the per-project list as signals.
- ProjectsHome binds the strip to `totals` + the `needsYou`-sorted list; each card binds to its project entry; freshness renders from `freshness`; show a subtle "not live" affordance for `live:false` (over-cap) projects.
- Keep the initial `GET /api/projects` fetch for first paint; the stream supersedes it (the first rollup frame is a full snapshot, so the store needs no special reconciliation).
- Reconnect/backoff on stream drop; optional slow `/api/projects` poll purely as a liveness fallback.

This reuses the proven board SSE+store pattern; it is the smallest change that turns a one-shot home into a live cross-project rollup.

---

## Conditions (must all hold for the gate + security confirmation to stand)

- **C-1** Live-pin ≤ cap projects (relevance-ordered: needsYou first, then lastSeen); over-cap projects cold-refreshed, never raise the cap.
- **C-2** Recompute only the changed project per tick; merge into a cached rollup (no all-N rebuild on the hot path).
- **C-3** Merge-emit debounce on top of per-channel debounce; cold projects use a stat-cheap path, full rebuild only on a slow interval.
- **C-4** Frame projects to `{id,label,status,open,needsYou,freshness,live}` — drop `path`; freshness from `fileRev`, not `lastSeen`.
- **C-5** Same `streamAllowed` loopback guard as `/api/events`, applied before opening any channel; no client-supplied id/path list.

Violating C-1/C-2/C-3 (DoS) or C-4/C-5 (exposure/injection) re-triggers a full /secops review per §3.
