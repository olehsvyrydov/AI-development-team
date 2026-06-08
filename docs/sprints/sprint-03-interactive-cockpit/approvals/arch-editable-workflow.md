# ARCH approval — Interactive Cockpit, slice 2 (ADT-224 / ADT-225 / ADT-226)

**Gate:** ARCH_APPROVED · **Decision:** APPROVED (all three) · **Owner:** /arch (Jorge) · **Date:** 2026-06-08
**Branch:** feat/dart-interactive · **Supersedes nothing** — extends `approvals/arch-interactive.md` (slice 1).
**Decision log:** D-006 (scoping), D-007 (editable-workflow MVP), D-008 (stage-aligned board).

> Philosophy: *architecture is about trade-offs, not silver bullets.* This slice adds **no new
> service, no new runtime dependency, no new persistent store**. It reuses the registry (id→path),
> the write-guard, atomic CAS, and the overlay-only workflow model already in `hub/lib/*`. The only
> genuinely new surface is **one id→path resolution step on the write/stream path** — and that is
> precisely the surface /secops must hard-verify (ADT-224).

---

## Context recap — the root-cause bug (ADT-224)

The Cockpit already **reads** per-project correctly: `project-shell` fetches `GET /api/projects/:id`,
which resolves the id through `registry.get(id) → record.path` and builds state for *that* path. But:

- **Writes** go through `ControlPlaneService.mutate('/api/<route>', body)` → `POST /api/<route>` →
  `api.handle(route, data, PROJECT)` in `hub/server.js` (~line 184), where `PROJECT` is the **single
  launch directory** (argv / cwd), not the viewed project.
- **The live stream** is `ProjectEventsService.connect()` → `GET /api/events`, which serves
  `buildState()` for the **same launch `PROJECT`** (server.js ~lines 96/125/136).

So a note added while viewing project B is written to launch-project A, and a viewer of B receives
A's pushes. Reads are scoped; writes and the stream are not. This slice closes that gap by threading
the **viewed project's registry id** through every mutation and the stream, resolving it to a path
**only** via the registry, and confining every write to that registered root.

---

## ADT-224 — Project-scoped control plane + live updates  **(APPROVED — hard gate; SECOPS hard-gate to follow)**

### Decision 1 — How the id travels (routing contract)

The viewed project's **registry id** accompanies every mutation and the stream subscription. Chosen
contract — **keep the existing route shapes, add the id as a parameter** rather than restructure to
`/api/projects/:id/<action>`:

- **Mutations** (`POST /api/<route>`): the id is a **`project` field in the JSON body**, alongside the
  existing `expectedRev`/`id`/etc. The body is already parsed and size-capped; adding one field is the
  smallest change and keeps every existing handler signature (`api.handle(route, data, project)` —
  `project` already a parameter) intact.
- **Live stream** (`GET /api/events`): the id is a **`?project=:id` query parameter** →
  `GET /api/events?project=:id`. A query param (not a body) because SSE/`EventSource` is GET-only.
- **State read used by the stream's first frame**: `GET /api/state?project=:id` likewise (so the
  initial SSE frame and any `/api/state` poll resolve the same way).

**Why body-field + query-param over `/api/projects/:id/<action>`:** the path-segment form would force a
parallel route table and re-plumb every handler; the field/param form lets the server resolve the id to
a `project` directory **once, at the HTTP boundary**, then call the *unchanged* `api.handle(route, data,
project)`. One resolution site = one place for /secops to audit. Justification is consistency +
minimal surface, not novelty.

**Rule (consistency):** the resolution is identical for the body field and the query param — same
`resolveProject(id)` function, same rejection behavior, same fallback. There is exactly one id→path
authority in the server.

### Decision 2 — Resolution + confinement (the new attack surface — behavioral spec)

A single server-side function `resolveProject(id)` is the **only** way a request selects a write/stream
target. Behaviorally it MUST:

1. **Validate the id shape first.** The id is a registry id — a **12-char lowercase hex string**
   (`HEX_ID = /^[0-9a-f]{12}$/`, already enforced by `registry.get`). Anything else (path, traversal
   sequence, absolute path, URL, empty, non-hex, wrong length) **fails validation and is never used in
   any filesystem operation**. The id is **never concatenated into a path** — it is a *lookup key*.
2. **Resolve only via the registry.** `registry.get(id)` returns the canonical record or `null`. The
   target directory is **`record.path` and nothing else**. `record.path` was produced at connect time
   by `canonicalRoot()` → `projectRoot()` = git-toplevel-or-`realpath` of a verified directory, so it is
   already a canonical, existing, registered root. **The client-supplied id selects a row; it never
   supplies, influences, or overrides the path.**
3. **Refuse the unknown.** If validation fails or `registry.get(id)` is `null`, the request is **refused
   with a clear error and writes nothing**: `404 { ok:false, error:'unknown project' }` for an
   unregistered-but-well-formed id; `400 { ok:false, error:'invalid project id' }` for a malformed id.
   No file is read or written, no overlay is touched, no comment is appended, the stream is not opened.
4. **Confinement is by registry membership + canonical path — never by trusting client input.** Because
   the only path that can ever be used is a `record.path` already in the registry (each of which is a
   realpath’d directory the user explicitly connected), a crafted id **cannot** point the write anywhere
   outside a registered root. There is no string the client can send in `project` that yields a path not
   already vetted and stored by the registry. Traversal/absolute/symlink/foreign-path attempts degrade to
   either "malformed id → 400" or "no such row → 404".
5. **Guard + CAS unchanged and still required.** Resolution happens **after** the write-guard
   (`writeAllowed`: X-AIDT header + loopback Host/Origin + loopback socket) and **before**
   `api.handle`. The resolved `project` then flows into the *existing* `readModifyWriteLedger` /
   `writeOverlayCAS` paths — so atomic tmp+fsync+rename, the in-process mutex, and `expectedRev`/409
   CAS all apply exactly as today, now keyed on the resolved root's `rev`.

> **Defense in depth (recommended, not required for correctness):** `writeOverlayCAS`/ledger writes
> already join their target under `record.path`; if a future refactor ever derived a sub-path from any
> client value, add a realpath-containment assertion (`isContained(record.path, realpath(target))`,
> the helper already in `write.js`) before the write syscall. With the current design (server-derived
> relative paths under a registry-canonical root) this is belt-and-suspenders.

### Decision 3 — Back-compat: the single-project launch

The hub launched against a directory with **no `project` field / no `?project=`** keeps working:

- **Fallback rule:** when `project` is absent **and** the request is a mutation/stream, the target is the
  **launch `PROJECT`** (today's behavior) — *only if* the server was started in single-project mode.
- **Definition of single-project mode:** the hub always has a launch `PROJECT` (argv/cwd). The fallback
  is: *absent id ⇒ launch `PROJECT`*. A **present** id always resolves via the registry (never the
  launch dir). This means a legacy client (no id) and the new Cockpit (always sends the viewed id)
  coexist: legacy hits the launch project; the Cockpit hits the viewed project.
- **Registry-less environments** (no `~/.aidevteam/registry.json`): a present id simply finds no row →
  `404 unknown project` (correct — you cannot scope to a project you never connected). The launch
  project remains reachable via the absent-id fallback. No registry is required for the single-project
  path to work.

### Decision 4 — Live stream: per-project channels + bounded watchers

- **Subscription is per-project.** `GET /api/events?project=:id` resolves the id (same `resolveProject`)
  and the client is registered against **that resolved directory's channel**. A push generated for
  project A is delivered **only** to clients subscribed to A. A viewer of A never sees B's frames
  (AC: no cross-talk). Absent id + single-project mode ⇒ subscribed to the launch project (back-compat).
- **Watcher model — lazy, per-viewed-project, reference-counted, capped:**
  - The server keeps a **map of active project channels**, each owning its own `fs.watch` set (the same
    target list `startWatchers()` builds today: `.workflow-state.json`, overlay, `.aidevteam/*`,
    `backlog/*`, `docs`, `kb`, the active workflow file — but rooted at *that* project).
  - A channel's watchers are **created on first subscriber** and **torn down when the last subscriber
    disconnects** (reference count via the existing `req.on('close')`), so the server never watches
    projects nobody is viewing.
  - **Resource bound:** cap the number of concurrently watched projects (recommend **a small constant,
    e.g. 16**). At the cap, a new subscription either reuses an existing channel or is **refused with a
    clear error** (`503 { error:'too many active projects' }`) rather than opening unbounded watchers —
    this protects the file-descriptor budget. The launch project's channel is exempt/always-available in
    single-project mode.
  - **Degrade gracefully:** if `fs.watch` fails for a target (already tolerated today via try/catch), the
    channel still serves the initial frame and subsequent frames on whatever targets did bind; one bad
    watch never tears the channel down.
  - **Debounce per channel** (the existing 150 ms coalesce), so a burst of writes to one project yields
    one push to that project's viewers.
- **Trade-off (ATAM):** lazy per-project watchers trade a small amount of bookkeeping (channel map +
  refcount) for a hard FD bound and zero cross-talk. The alternative — one global watcher re-scanning all
  registered projects — is simpler but watches projects nobody views and risks unbounded FDs as the
  registry grows. The per-viewed-project model is the right scalability/maintainability balance for a
  single-developer, handful-of-projects workload.

### What /secops MUST HARD-verify for ADT-224 (prove the negatives)

This is the hard, safety-override gate. /secops must demonstrate, with tests, that:

1. **Crafted id writes nowhere.** A `project` value that is a path, `..` traversal, absolute path,
   URL-encoded traversal, symlink name, NUL-bearing, over/under 12 chars, or non-hex is **rejected
   (400/404) and leaves the filesystem byte-for-byte unchanged** — no overlay written, no ledger
   touched, no comment appended, no KB file created, no directory created. (Negative test: snapshot the
   FS, fire the crafted mutation, assert refusal + identical FS.)
2. **Unregistered id is refused.** A well-formed 12-hex id with **no registry row** ⇒ `404 unknown
   project`, nothing written, no stream opened.
3. **The path is never client-derived.** Assert that the only path used is `registry.get(id).path`;
   prove a client cannot supply a `path`/dir/filename that the write honors (the body carries only
   `project` + the route's own fields — no path field is read).
4. **Cross-project isolation on the stream.** Two subscribers on two ids receive **only** their own
   project's frames under concurrent writes (no B-frame ever reaches an A-subscriber).
5. **Guard still mandatory after scoping.** A scoped mutation **without** the X-AIDT header / from a
   non-loopback socket / with a foreign Host or Origin is still refused by `writeAllowed` **before**
   resolution — scoping does not weaken the existing CSRF/DNS-rebinding gauntlet.
6. **CAS still holds per resolved root.** A stale `expectedRev` against the resolved project is **409**,
   not a silent overwrite; concurrent writes to the same resolved project serialize under the mutex.
7. **Watcher bound is enforced.** Exceeding the active-project cap is refused cleanly (no unbounded
   `fs.watch`); last-unsubscribe tears watchers down (no FD leak).

---

## ADT-225 — Fully editable workflow builder (overlay model)  **(APPROVED — SECOPS review)**

### Decision 5 — One coherent "set the track's stage list" overlay op

Today `track/reorder` accepts a **permutation only** (`isPermutation` rejects add/delete). The MVP
(D-007: add / delete / move / owner / gate-trigger) is expressed as **one extended/parallel overlay
write** that takes the **full ordered stage list for the active track, with optional per-stage fields** —
so add, delete, move, and owner are a single coherent overlay write, not four ad-hoc ops.

**Op shape (behavioral):** `track/set-stages` (a new route; `track/reorder` stays for back-compat as the
permutation-only fast path) with body:

```
{ track, stages: [ { name, owner?, gate? }, ... ], expectedRev, by }
```

- `stages` is the **complete new ordered list** for the track. Add = a name not previously present;
  delete = a name omitted; move = a reordering; owner = the per-stage `owner`; gate/trigger = the
  per-stage `gate`. The op is **declarative** (set the whole list), which makes add/delete/move/owner
  one atomic overlay write and one CAS.
- Plain string stages remain accepted for back-compat (`"vision"` ≡ `{ name:"vision" }`).

### Decision 6 — Overlay representation (base file byte-unchanged)

- **Stage order** persists exactly as `track/reorder` does today: `overlay.tracks[track] = [<names>]`.
  `applyOverlay` already does `tracks: { ...wf.tracks, ...(ov.tracks || {}) }` — the overlay **replaces**
  a track's stage array wholesale, which is precisely add/delete/move. **No `state.js` change needed for
  ordering.**
- **Per-stage owner** needs a new overlay projection because today owner is derived from a **static map**
  (`stage-map.js`: `stageGate` / `STAGE_OWNER_DEFAULT`) and gate owners, **not** from per-stage overlay
  data. Add an overlay map **`overlay.stageOwners[stageName] = "<owner>"`** and have `state.js` consult it
  with this precedence when building `stageOwners` / `workflowView`:
  **overlay `stageOwners[stage]` → gate owner (`stageGate`→gateDefs) → `STAGE_OWNER_DEFAULT` → null.**
  This keeps the static map as the default while letting the overlay override per stage. `workflowView`'s
  `projectWorkflowView` already reads `stageOwners[stage]`, so it picks the override up for free once the
  map is overlay-merged.
- **Per-stage gate/trigger** maps onto the **existing gate model**, not a new one. A stage governed by a
  gate is linked through `stageGate(stage)` → a `gateDefs` entry, and the **gate's** trigger/owner/refusal
  are already overlay-editable via the existing `gate/trigger` route (`overlay.gates[GATE] = { trigger,
  owner, refusal }`). So "set a stage's gate/trigger" = (a) optionally associate the stage with a gate
  name and (b) edit that gate via the existing `gate/trigger` op. For the MVP, **gate association reuses
  the canonical `stage→gate` map**; a per-stage *custom* gate binding beyond the canonical map is **not**
  required by D-007 and is deferred (see Decision 8). The per-stage `gate?` field in `set-stages` is
  therefore **advisory metadata for the view**; the authoritative gate rule stays in `overlay.gates`.

> Net `state.js` change is small and additive: merge `overlay.stageOwners` into the computed
> `stageOwners` with the precedence above. `tracks`, `workflowView`, and the gate projection already do
> the rest. Base `workflow.yaml` is **never** written (only `writeOverlay`/`writeOverlayCAS` touch
> `.aidevteam/workflow.overrides.json`) — AC "base file byte-identical" holds by construction.

### Decision 7 — Validation (don't let an edit produce an invalid track)

`track/set-stages` validates **before any write** and writes nothing on failure (clear 400):

- Track must exist (`bad('unknown track')`).
- Each stage **name**: non-empty after trim, no duplicates within the list, length-capped, **text only**
  (reject control chars / NUL / path separators in the projection — names are rendered as **escaped
  text** by the FE, never raw HTML; the server stores them as plain strings, never as a path or field
  key that could escape). Reuse the same text-shape rigor as `addKbNote`/`slugify` guards.
- **Non-empty result:** a delete that would leave the track **empty** is rejected (AC).
- `owner` (when present): a plain string, capped, escaped on render; not interpreted as a path.
- **CAS:** rides `writeOverlayCAS(project, expectedRev, patch)` — stale `expectedRev` ⇒ **409**, view
  re-syncs (AC: conflict-safe). Behind the write-guard, overlay-only, atomic — same as every overlay op.

### Decision 8 — Conditions / loops: DEFERRED (per D-007, not trivial)

Branch/skip rules and loop-back edges are **graph-modeling** (edges, reachability, cycle validation) that
the current **linear stage-array overlay cannot express** without a new schema and new validation — they
are **not trivial** in the existing overlay. **Deferred to backlog (BL-04)**, exactly as D-007 anticipated.
Likewise **new-track authoring** and **brand-new gate definitions** stay out of scope (D-007); this op
edits the **active track's stage list + per-stage owner**, and rides the existing gate model for gates.

**Confirmation:** the editable builder is **overlay-only, validated, CAS-safe, guard-protected** — it
introduces **no new file-write surface** beyond `.aidevteam/workflow.overrides.json`.

---

## ADT-226 — Stage-aligned Tasks board (data)  **(APPROVED — SECOPS review)**

### Decision 9 — Columns = active track's stages; no new backend (one tiny confirmation)

The board is a **pure FE re-projection of state the server already delivers** — confirmed:

- **Columns** = `state.workflowView.stages[*].stage` in order (the active track's stages, already
  flattened and ordered by `projectWorkflowView`). When the workflow is edited (ADT-225), `workflowView`
  changes and the SSE push re-lays the columns out **live** — same stream, no reload (AC).
- **Placement** = each ticket sits in the column matching its `ticket.stage` (already on every
  `tickets[]` entry).
- **Advance** = move to the **next stage in track order**; `ticket/advance` already takes `toStage`, and
  "next" is `stages[indexOf(current)+1]` derived from `workflowView`/`tracks` order. Conflict-safe via the
  existing `expectedRev`/409 (AC).
- **Empty columns** render from the stage list even with zero tickets (AC) — the FE iterates stages, not
  tickets.
- **Orphaned ticket** (ticket.stage not in the active track, e.g. after a stage delete) is **surfaced in a
  distinct "off-track" lane**, never dropped (AC, D-008) — derivable on the FE by set-difference of
  `ticket.stage` against the column stage set.
- **Status / needs-you** stay as **card chips** (already on each ticket: `status`, plus `taskSummary`'s
  needs-you signal) — not a column (D-008).
- **Live updates** ride the **same per-project SSE channel** ADT-224 delivers (a CLI/other-viewer advance
  pushes to this project's viewers).

**New backend needed?** **No new route, no new persistence.** The board is fully derivable from
`state.tracks` / `state.workflowView` (stage order) + `state.tickets[*].stage` + the existing
`ticket/advance`, all now correctly **project-scoped by ADT-224**. *Minimal optional addition:* the
stage **order** is already explicit in `workflowView.stages` (ordered array), so the FE needs nothing
more — "next stage" is well-defined from that array. ADT-226 is therefore **gated on ADT-224 (scoped
state + stream) and shares ADT-225's stage model**, but adds **zero** server surface of its own.

---

## Cross-cutting decisions (apply to all three)

- **Reuse, don't add.** Registry (id→path) + write-guard + atomic CAS + overlay-only model are reused
  verbatim. **Zero new runtime dependencies.** Same-origin, loopback-by-default trust boundary unchanged.
- **Optimistic write + `expectedRev`/409 everywhere.** Every mutation (advance, gate, set-stages,
  reorder, owner) carries `expectedRev`; a stale write is **409 + re-sync**, never a silent overwrite.
- **One id→path authority.** Exactly one `resolveProject(id)` site at the HTTP boundary; every scoped
  write and the stream go through it. (Single audit point for /secops.)
- **Escaped untrusted text.** Stage names, owners, notes, ticket text render as escaped text — no raw
  HTML injection; the server stores them as plain strings, never as paths or field keys.

### Risks & mitigations (ATAM — risks / sensitivity / trade-off points)

| # | Risk | Severity | Mitigation | Owner |
|---|------|----------|-----------|-------|
| R1 | **id→path confinement is the new attack surface** — a crafted id could try to select a target outside a registered root. | High (safety) | id is a **lookup key, never a path**; 12-hex shape check; resolve **only** via `registry.get`; canonical `record.path` (git-top/realpath at connect); refuse unknown/malformed (400/404) writing nothing. **/secops HARD-verifies the negatives.** | /secops (hard) |
| R2 | **Per-project watchers** could exhaust file descriptors as projects grow. | Medium | Lazy, refcounted, **capped** (e.g. 16) channels; teardown on last unsubscribe; refuse over cap (503); degrade on per-target watch failure. | /be |
| R3 | **Overlay stage-set edit could yield an invalid track** (empty, duplicate, blank name). | Medium | Validate before write (non-empty, unique, trimmed, text-only, capped); reject with clear 400, write nothing; CAS on `expectedRev`. | /be |
| R4 | **Back-compat regression** — single-project launch breaks. | Medium | Explicit fallback: **absent id ⇒ launch `PROJECT`**; present id always via registry; registry-less env keeps the launch path. | /be |
| R5 | **Stream cross-talk** — a viewer of A sees B's frames. | Medium | Per-project channels keyed on the resolved root; deliver only to that channel's subscribers; /secops verifies isolation. | /be + /secops |
| R6 | **Orphaned-stage ticket dropped** after a stage delete. | Low | FE surfaces off-track tickets in a distinct lane; never filtered out (D-008). | /fe |

### Implementer boundaries (HOW is the developer's; these are the guardrails)

- **/be (ADT-224):** add `resolveProject(id)` at the HTTP boundary; thread the resolved `project` into the
  unchanged `api.handle` and the SSE channel; per-project channel map with refcount + cap; **never** derive
  a path from any client value other than via the registry. Keep guard → resolve → CAS order.
- **/be (ADT-225):** add `track/set-stages` (full ordered list + per-stage owner) on `writeOverlayCAS`;
  merge `overlay.stageOwners` into `state.js` `stageOwners` with the stated precedence; validate before
  write; base `workflow.yaml` untouched.
- **/fe (ADT-224/226):** send the **viewed project's id** with every mutation (`project` body field) and
  open `/api/events?project=:id`; build the board columns from `workflowView.stages` (ordered), place by
  `ticket.stage`, advance to next stage, render empty + off-track lanes, status as chips, escape all text.

---

## Verdict

| Ticket | Gate | Decision |
|--------|------|----------|
| ADT-224 | ARCH_APPROVED (hard) | **APPROVED** — scoped via registry id; one resolve authority; confinement by registry membership + canonical path; per-project bounded channels; guard + CAS preserved. **SECOPS hard-gate must prove the negatives (above).** |
| ADT-225 | ARCH_APPROVED (hard) | **APPROVED** — one declarative `track/set-stages` overlay op (add/delete/move/owner) + `overlay.stageOwners` merge; gate via existing model; validated, overlay-only, CAS-safe. Conditions/loops + new-track/gate authoring **deferred** (D-007 / BL-04). |
| ADT-226 | ARCH_APPROVED (hard) | **APPROVED** — pure FE re-projection of scoped state; columns = ordered `workflowView.stages`; advance = next stage; **no new backend**; empty + off-track lanes; live via ADT-224's channel. |

Proceed to **/secops** (ADT-224 hard, ADT-225/226 review). Then APPROVAL_GATE → /be + /fe under TDD.
