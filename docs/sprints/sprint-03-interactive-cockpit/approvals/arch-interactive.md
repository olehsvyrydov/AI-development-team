# ARCH decision — Sprint 03 Interactive Cockpit (ADT-221 / ADT-222 / ADT-223)

**Gate:** ARCH_APPROVED (hard) · **Owner:** /arch (Jorge) · **Date:** 2026-06-08
**Verdict:** **APPROVED** for ADT-221, ADT-222, ADT-223 (with one named-and-only new route for 223 and the containment contract below).
**Preset/track:** all three `full` track under `solo` (per /po D-004). SECOPS is **HARD for 223**, **review** for 221/222.

> Principle in force: *architecture is about trade-offs, not silver bullets.* The trade we are making across this sprint is **reuse the proven, guarded control plane wherever possible, and open exactly one new, minimal, hard-gated write surface (KB-add) — no more.**

---

## 0. Context & invariants (apply to all three)

The hub control plane already provides everything the read/mutate UI needs, behind a tested safety stack:

- **Write guard** (`hub/lib/guard.js`): every mutating request must clear X-AIDT header + loopback Host + loopback Origin + loopback socket (unless `--allow-remote-writes`). The server never emits permissive CORS. This already defeats CSRF / DNS-rebinding / cross-site fetch.
- **CAS ledger** (`hub/lib/write.js readModifyWriteLedger`): atomic tmp+fsync+rename, in-process mutex, `expectedRev` compare-and-swap → returns `{conflict:true}` instead of clobbering.
- **Overlay-only workflow edits** (`writeOverlay` → `.aidevteam/workflow.overrides.json`): the base `workflow.yaml` is **never** machine-written; `state.js applyOverlay` deep-merges overlay over the parsed base at read time.
- **Append-only comments** (`hub/lib/comments.js` / `appendComment`): per-ticket JSONL, body capped at 8 KB, ticket id sanitized into the filename (no traversal).
- **Body cap** (`hub/lib/http-body.js`): 64 KB request cap, clean 413, no socket reset.
- **State projection** (`hub/lib/state.js buildState`): the single source for `tracks`, `gateDefs` (`{name,owner,refusal,safety,trigger,required}`), `stageOwners`, `preset`, `workflowView`, `tickets[]` (each with `stage`, `status`, `assignee`, `active`, `gates[]`, `comments[]`, `description`), `base`, `kb`, and `rev`.
- **Live updates** (`/api/events` SSE): the server watches the inputs and re-broadcasts `buildState()` on change. The watcher already covers `docs`, `kb`, `.aidevteam/kb`, `.aidevteam/comments`, the ledger and the overlay.
- **Cockpit guarded POST** (`api.service.ts post()` → `bridge.writeHeaders()`): the existing, working pattern that attaches X-AIDT. All three tickets' mutations ride this same path.

**Cross-cutting guardrails (binding on /fe and /be):**

1. **Optimistic write + `expectedRev` + 409 re-sync everywhere** (D-005). Every mutation sends `expectedRev` = the `rev` from the last `buildState`. On 409 the UI takes the `state` returned in the 409 body as the new truth, rolls back the optimistic change, surfaces a **conflict** state, and lets the user retry against fresh `rev`. Never silent overwrite.
2. **Zero new runtime dependencies.** Same-origin, loopback-default. No new npm deps server- or client-side.
3. **Escape all untrusted text** (labels, owners, comment bodies, KB title/body) as inert text — never raw HTML. This is an existing Cockpit/Angular default; preserve it (no `innerHTML`/`bypassSecurityTrust*`).
4. **`rev` is the contract token.** It is `fileRev(project)` = mtime+size of `.workflow-state.json` + the overlay. The UI must treat it as opaque and round-trip it unchanged.

---

## 1. ADT-221 — Editable Workflow builder

**Decision: APPROVED. NO new backend route. Rides the existing overlay-only routes.**

### Contract (Cockpit ↔ control plane)

**Read** (from `buildState`, already in the SSE/`/api/state` payload):
- current order → `tracks[<activeTrack>]` (and `workflowView.stages` for render-ready order + per-stage owner + governing gate `{name,refusal}`);
- gate rules → `gateDefs[]` = `{name, owner, refusal, safety, trigger[], required}`;
- preset → `preset`; preset-driven always-required → the `required` flag on each gateDef;
- concurrency token → `rev`.

**Edit** (existing routes, all `writeOverlay`-only, all guarded):
- **Reorder a track** → `POST /api/track/reorder` `{ track, stages, expectedRev }`. Server validates `isPermutation(base, stages)` — rejects any add/drop/duplicate with `400 "stages must be a permutation of the track"` and writes nothing. Satisfies the "valid rearrangement only" AC.
- **Edit a gate rule** → `POST /api/gate/trigger` `{ gate, trigger?, owner?, refusal?, expectedRev }`. Patches only the provided fields into `overlay.gates[gate]`; unknown gate → `400`. Covers trigger labels + owner + hard/soft.
- **Switch preset** → `POST /api/preset` `{ preset, expectedRev }`. Allowlisted to `solo|small-team|regulated`; `state.js` re-resolves `alwaysRequired` for the effective preset on the next read, so preset-driven required gates update without restart.

**Reconcile a 409:** the overlay routes are the one place the **current code does not yet thread `expectedRev`** (see Gap below). With the gap closed, the UI on 409 adopts the returned `state`, shows **conflict**, and re-enables retry. The live SSE push means a concurrent CLI edit re-renders the builder even without a local action.

**Base file safety (provable AC):** all three routes call `writeOverlay`, which writes only `.aidevteam/workflow.overrides.json`. `workflow.yaml` is never opened for write anywhere in `write.js`. The "base byte-identical before/after" AC is satisfied by construction and is a trivial test (hash the resolved `workflow.yaml` before/after an edit).

### Stage-owner scope (ratify D-001)

**Ratified: MVP edits gate owners only; no new capability needed, and per-stage non-gate owner editing stays deferred.** Rationale: `stageOwners` is **derived** — `expectedOwner(stage, wf)` with a gate's owner taking precedence via `workflowView`. A gate stage's owner is already editable through `gate/trigger`'s `owner` field. Non-gate stage owners have **no overlay slot** today (the overlay schema carries `tracks`, `gates`, `preset` only); adding one would mean a new overlay key + new validation + a new merge path — i.e. new write surface for marginal MVP value. Defer per D-001. The builder edits gate owners via `gate/trigger`; for non-gate stages it shows the derived owner read-only.

### Gap to close (minimal, NOT a new route)

`track/reorder`, `gate/trigger`, and `preset` currently **ignore `expectedRev`** (they call `writeOverlay` without a CAS check), unlike the ledger routes. To honor D-005 uniformly, **/be must add `expectedRev` CAS to these three overlay routes**: compute `rev` under the same mutex, return `409 {conflict, state}` on mismatch, else write. This is an extension of the existing route handlers and the existing `withLock`/`fileRev` machinery — **no new route, no new dependency, no new file surface.** (`fileRev` already includes the overlay's mtime+size, so the overlay's own changes move `rev`.) This is a hard precondition of the 221 "conflict-safe" AC; record it for /be.

---

## 2. ADT-222 — Tasks board + task detail

**Decision: APPROVED. NO new backend route. Pure projection + existing mutations.**

### Read shape — already complete in `buildState`, no per-ticket fetch

- **Board columns by status** ← `tickets[].status` (`in_progress|waiting|blocked|done`) with `taskSummary.byStatus` for counts (sums to `total`; `needsYou` is an overlay count, not a sixth bucket — do not add it into column sums).
- **Detail** ← the same `tickets[]` entry: `status`, `stage`, `gates[]` (each `{name,refusal,state,by,at,note,required,owner,trigger}` → renders the gate/trigger labels and hard/soft), `comments[]` (already `readComments`-joined: `{author,kind,ts,body,gate?,state?}` → the timeline), `description`.

**There is no per-ticket fetch.** Everything the detail view needs is in the single `buildState` payload that `/api/state` and `/api/events` already deliver. The detail view is a client-side selection of `tickets.find(id)`; it must re-derive from each fresh SSE push (so a live comment/gate change appears without reload).

### Mutations — existing guarded + CAS routes (thread `expectedRev`)

- **Advance** (explicit action per D-002) → `POST /api/ticket/advance` `{ id, toStage, expectedRev, by }`. Already CAS-guarded; already emits the `advance` typed comment.
- **Add comment** → `POST /api/ticket/comment` `{ id, author, body, kind }`. Body capped at 8 KB in `appendComment`; over-cap is sliced server-side, but the **over-long-body "rejected with a clear message" AC** is better served by the UI enforcing the same 8 KB limit pre-send and the route already refusing empty/no-id with `400`. (Comments are append-only and not part of `rev`; they need no CAS — but the UI still re-syncs from the next SSE push.)
- **Approve/reject a gate** → `POST /api/gate/set` `{ id, gate, state, note, by, expectedRev }`. Already CAS-guarded; already emits the **same typed `gate` audit comment a CLI agent would** (the AC's "same typed audit comment" is satisfied by `api.js` line 78 — confirmed, no change needed). Allowlisted `state ∈ {passed,pending,rejected}`; unknown gate → `400`.

**Live update path:** reuse `/api/events` SSE exactly as the read panels do — the watcher already covers the ledger and `.aidevteam/comments`, so an advance/comment/gate-decision from a CLI agent or another browser action re-broadcasts and re-renders. No new mechanism.

**Conflict-safe:** advance + gate decision already return `409 {conflict, state}` on stale `expectedRev`; the UI adopts the returned state and offers retry (D-005). Comment posts re-sync via SSE.

**No new route confirmed.** Columns/labels are projections; all three mutations exist and are guarded.

---

## 3. ADT-223 — Knowledge Base input (the ONE new backend)

**Decision: APPROVED, with the new write capability specified below as a HARD-gated, contained, add-only route. This is the only new attack surface in the sprint — keep it minimal.**

### The new route

`POST /api/kb/add` — handled in `hub/lib/api.js` (same dispatcher, so it inherits the write guard + 64 KB body cap + the `/api/` POST path that already runs `writeAllowed`). Mutation goes through a **new `write.js` function** (`addKbNote`) so `write.js` remains the only module that touches project files.

> If the Cockpit must target a **registry** project (not the server's single `PROJECT`), the route is `POST /api/projects/:id/kb` and resolves `record.path` **server-side from the registry** (never a client path) — identical to how `connect` derives the folder. Either placement is acceptable; the containment contract below is identical. **/be picks one; the project directory is always server-resolved, never client-supplied.**

### Data contract

**Request:** `{ title: string, body: string }` (markdown). No path, no filename, no directory from the client — ever.

**Response (success):** `200 { ok:true, doc:{ name, file, index }, state }` where `state` is the fresh `buildState` so the list + count update optimistically and the SSE push confirms.

**Rejections (each returns no-write):** `400` for empty title/body, oversize, disallowed type, or a slug that resolves outside the KB dir; `409`/clobber-avoidance handled by the no-overwrite rule below; `403` from the guard when the X-AIDT/loopback gauntlet is not cleared.

### Persistence location — MUST align with `readKb`

`state.js readKb` scans `['docs', 'kb', '.aidevteam/kb']` and uses the **first existing** dir. To guarantee the note appears in the list and increments the count **deterministically**, and to avoid ever writing into a project's real `docs/` tree:

- **Write target = `<project>/.aidevteam/kb/`** (created on demand). The watcher already watches `.aidevteam/kb`, so the SSE push fires.
- **Caveat (record for /be):** because `readKb` returns the **first existing** of `docs`→`kb`→`.aidevteam/kb`, if a project already has a `docs/` or `kb/` dir, a note written to `.aidevteam/kb` would not be the dir `readKb` scans, so it would not show up. **Decision: the KB-add route must write to whichever directory `readKb` will actually scan for this project** — i.e. resolve the same first-existing target (`docs`→`kb`→`.aidevteam/kb`), and when none exists, **create `.aidevteam/kb`** (the contained default) and write there. This keeps "it appears in the list and the count goes up by one" true by construction, while defaulting new writes into the contained `.aidevteam/kb` namespace rather than a real source tree. Containment (realpath check) applies to the resolved target regardless.

### Containment design (behavioral — this is what /secops HARD-gates)

The server derives a **safe filename from the title slug** and proves the final path stays inside the KB dir **before** writing:

1. **Slug, never a path.** Take `title`, lowercase, replace any non-`[a-z0-9]` run with `-`, trim leading/trailing `-`, cap length (e.g. 80 chars). If the slug is empty after sanitization → reject `400`. The slug **cannot contain** `/`, `\`, `.` (so no `..`, no extension injection), or a leading `/` (so no absolute path). Append the server-fixed extension `.md`.
2. **No client filename, ever.** The `.md` extension and the directory are server-constants; the client supplies only `title`/`body`.
3. **Realpath containment check before write.** Compute `target = join(realpath(kbDir), slug + '.md')`, then assert `realpath(dirname(target)) === realpath(kbDir)` (or, for a not-yet-created file, that the resolved parent is exactly the KB dir). If the resolved parent escapes the KB dir (traversal, absolute, or a **symlinked** KB dir / entry that points elsewhere) → reject `400`, write nothing. This defeats path traversal, absolute paths, and symlink escape — the three negatives the ticket demands be **proven**.
4. **No overwrite (clobber-safe).** Open with `O_EXCL` (`wx` flag) via the existing atomic tmp+rename, OR, on name collision, derive a **new** unique safe name (append `-2`, `-3`, …) — never replace an existing file. The ticket allows "new safe name or rejection, never clobber"; **decision: derive a unique suffix** so the add always succeeds for a duplicate title (better UX) while guaranteeing no overwrite. Implement the existence check + the create atomically (`O_EXCL`) so a TOCTOU race still cannot clobber.
5. **Size cap + type allowlist.** Enforce a body size cap **at the route** (e.g. 64 KB, ≤ the existing 64 KB HTTP body cap so the cap is reachable and returns a clean message rather than a 413) and a **text/markdown allowlist** — accept only a UTF-8 markdown/plain-text body; reject anything else (the MVP has no binary/upload path per D-003, so this is a content-shape check, not MIME sniffing). Title length capped (e.g. 200 chars). Oversize/disallowed → `400`, write nothing.
6. **Atomic write.** Reuse the `write.js` tmp+fsync+rename pattern so a reader never sees a partial file.
7. **Write-guard required.** The route sits on the `/api/` POST path that already runs `writeAllowed` → without X-AIDT/loopback it is `403`. The "refused without the write-guard" AC is satisfied by placement; add an explicit negative test.

### Base panel surfacing + honest indexing

The note surfaces through the **existing base projection** (`buildBase` over `readKb`): no new read path. `buildBase` already sets `method` = `local-embeddings` **only when** `embedderConfigured(project)` (a real selector ≠ `none`), else `filename-only`, and `counts.indexed` = the doc count with `indexing/failed` as true zeros by construction. **This is the honest indexing label the AC demands** — the new note inherits it automatically; the route triggers **no** embedding job (D-003). The list entry renders `body` as inert text (Angular default), satisfying the escaped-preview AC.

### What /secops MUST verify for ADT-223 (HARD gate handoff)

Give /secops these as concrete, testable controls — each must be **proven by a negative test**, not assumed:

1. **Filename is 100% server-derived from a slug**; no request field (title, body, or any other) can introduce `/`, `\`, `..`, a leading `/`, or an alternate extension. Prove: title `"../../etc/passwd"`, `"/abs/path"`, `"a/b"`, `"x.md.sh"` all collapse to a contained `*.md` slug or are rejected — **no file outside the KB dir**.
2. **Realpath containment holds against symlink escape:** a symlinked KB dir (or a symlink planted as the target) that resolves outside the project is **rejected, nothing written.** Prove with an actual symlink in the test.
3. **No overwrite under collision and under TOCTOU:** a duplicate title never replaces an existing file (unique-suffix or reject); `O_EXCL` create closes the race.
4. **Size + type caps reject before write:** an oversize body and a non-text body are rejected `400`, nothing written.
5. **Write-guard enforced:** a request missing X-AIDT, or with a non-loopback Host/Origin, or off a non-loopback socket (without `--allow-remote-writes`) is `403`, nothing written.
6. **Body/inert rendering:** stored body is never executed/HTML-injected in the list/preview (escaped text).
7. **No secrets / no info leak:** error messages do not echo absolute server paths or stack traces (the route returns a terse `400`/`409` message, consistent with the other routes).
8. **The write goes through `write.js` only** (single mutation chokepoint) and emits no comment/ledger change (KB add is orthogonal to the ledger; `rev` need not move for KB, but the SSE watcher on `.aidevteam/kb` still pushes the new `buildState`).

---

## 4. Risks & mitigations

| # | Risk | Likelihood / Impact | Mitigation (architectural) |
|---|------|--------------------|----------------------------|
| R1 | **Concurrent edits clobber** (CLI agent + browser, or two browser tabs) | M / M | CAS `expectedRev` on every ledger route + **(new)** on the three overlay routes; 409 → re-sync + retry (D-005). No mutation writes without a fresh-rev check except append-only comments (which can't clobber). |
| R2 | **KB write = the new attack surface** (traversal / symlink / clobber / oversize / CSRF) | M / **H** | Contained, add-only, server-derived slug, realpath check before write, `O_EXCL` no-overwrite, size+type caps, write-guard, single `write.js` chokepoint. HARD SECOPS gate with the 8 negative tests above. |
| R3 | **Workflow overlay corruption** damages the live process | L / M | Overlay-only writes; base `workflow.yaml` never machine-written (provable byte-identical); `track/reorder` permutation-validated; `preset` allowlisted; `gate/trigger` patches known fields of a known gate only; `applyOverlay` tolerates malformed overlay (falls back to base). |
| R4 | **KB note written where `readKb` won't scan it** (project has `docs/` or `kb/`) → "added but not listed" | M / M | Route resolves the **same first-existing target** `readKb` uses, defaulting to creating `.aidevteam/kb`; count-increments-by-one becomes true by construction (R-tested). |
| R5 | **Dishonest indexing claim** (claims semantic index without an embedder) | L / M | Reuse `buildBase`/`embedderConfigured`; label is `filename-only` unless a real embedder selector is set; no embedding job triggered (D-003). |
| R6 | **Stale client `rev`** after SSE reconnect gap | L / L | UI always sends the `rev` from the latest received `buildState`; on 409 it adopts the 409-body state; SSE re-broadcast closes any gap on the next change. |
| R7 | **Over-long comment** silently truncated server-side | L / L | UI enforces the 8 KB cap pre-send with a clear message (AC); server slice remains the backstop. |

---

## 5. Approval summary

| Ticket | Verdict | New backend? | What |
|--------|---------|--------------|------|
| ADT-221 Editable Workflow builder | **APPROVED** | **No new route.** One **extension**: add `expectedRev` CAS to `track/reorder`, `gate/trigger`, `preset` (D-005 uniformity). Stage-owner scope (D-001) ratified — gate owners only, no overlay change. | Overlay-only edits via existing routes; base `workflow.yaml` never written. |
| ADT-222 Tasks board + detail | **APPROVED** | **No new route.** | Board/detail are projections of `tickets[]`/`gateDefs`/`taskSummary`; advance/comment/gate via existing CAS+guard routes; `gate/set` already emits the typed audit comment; live via existing SSE. |
| ADT-223 KB input | **APPROVED** | **YES — exactly one:** `POST /api/kb/add` (or `/api/projects/:id/kb`) + new `write.js addKbNote`. | Add-only, server-derived slug, realpath-contained, `O_EXCL` no-overwrite, size+type caps, write-guard, single chokepoint, honest indexing via `buildBase`. **SECOPS HARD** — 8 named negative tests. |

**ARCH_APPROVED = passed** for ADT-221/222/223. Next gates: SECOPS (HARD for 223), DESIGN, APPROVAL_GATE.
