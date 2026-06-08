# SECOPS — Sprint 03 Interactive Cockpit, slice 2 (ADT-224 HARD · ADT-225 / ADT-226 review)

> **/secops (Soren) — Principal Security Engineer.**
> Three gates in one pass:
> - **ADT-224 — `SECOPS_APPROVED` (HARD, safety-override).** The browser now supplies a
>   `project` **id that selects which project is written and streamed**. This is an
>   authorization/confinement surface: a single client-controlled value chooses a write
>   target and a stream channel. This is the one hard surface of the slice.
> - **ADT-225 — `SECOPS_APPROVED` (review).** One NET-NEW overlay op `track/set-stages`
>   accepts the full ordered stage list + per-stage owner from the browser; persists to the
>   overlay only. Validation, CAS, escaped render, guard.
> - **ADT-226 — `SECOPS_APPROVED` (review).** FE-only re-projection of already-scoped state.
>   No new server surface; escaped render; advance rides the existing CAS route.
>
> **Inputs read in full:** `approvals/arch-editable-workflow.md` (routing contract D-1…D-9,
> the "what /secops MUST HARD-verify" 7-point list §ADT-224, the ATAM risk table R1…R6);
> tickets `ADT-224/225/226`; `.workflow-state.json` (the three ARCH-approved notes).
> **Existing machinery inspected IN SOURCE — I read the code, not the design's claim about
> it:** `hub/server.js` (control-plane dispatch line 177-189, SSE line 127-140, the **single
> global** `clients` Set line 93 + `watched` Set line 94 rooted at the launch `PROJECT`,
> `writeAllowed` placement line 179), `hub/lib/api.js` (every handler over `(route,data,
> project)`; `track/reorder` `isPermutation`; **no `set-stages`, no `resolveProject`**),
> `hub/lib/registry.js` (`HEX_ID=/^[0-9a-f]{12}$/` line 25; `get(id)` line 71-74 →
> `HEX_ID.test(String(id||''))` then `find(p=>p.id===id)`; `canonicalRoot` line 28-36;
> `connect` stores `path: projectRoot(input)` line 87), `hub/lib/project-id.js`
> (`projectRoot` = git-toplevel-or-`realpath` line 19-36), `hub/lib/guard.js`
> (`writeAllowed`), `hub/lib/write.js` (`readModifyWriteLedger` CAS, `writeOverlayCAS`,
> `writeOverlay`, `mergeOverlayPatch`→only `.aidevteam/workflow.overrides.json`,
> `deepMerge`, `appendComment`, `addKbNote` containment), `hub/lib/state.js`
> (`applyOverlay` wholesale `tracks` replace line 115, `projectWorkflowView` line 267-279,
> `stageOwners` build line 334-336), `hub/lib/projects.js` (`:id` validated as 12-hex,
> never concatenated to a path — line 89, 114-118). Prior gate style:
> `approvals/secops-cockpit-v2.md` and `approvals/secops-interactive.md` (C-/N- format).

---

## Verdict (summary up top)

- **ADT-224 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).** Binding
  on the **17 numbered conditions C-1…C-17 (§2)**, proven by the negative tests **N-1…N-16
  (§5)**. No CRITICAL/HIGH finding is left open — each is converted to a binding, testable
  condition. **Implementation is BLOCKED until C-1…C-17 ship with N-1…N-16 green and pass
  `/rev`.**
- **ADT-225 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.** Binding on **C-18…C-24
  (§3)**, proven by **N-17…N-21**. The op `track/set-stages` and the `overlay.stageOwners`
  merge are **NET-NEW code** (do not exist today) and each carries its own proving test.
- **ADT-226 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.** Binding on **C-25…C-27
  (§4)**, proven by **N-22…N-23**. FE re-projection only; zero new server surface — the
  obligation is escaped render + riding the already-scoped state/route.

**Headline finding (rank honestly):** the id→path resolution (`resolveProject`), the
**per-project SSE channels**, and the **per-project bounded watcher map** are **entirely
net-new code** — today `hub/server.js` has ONE global `clients` Set and ONE `watched` Set
rooted at the launch `PROJECT` (lines 93-116). There is **no** cross-project isolation and
**no** per-project watcher teardown in source today. The confinement *building blocks*
(`HEX_ID` anchored regex; `registry.get` lookup-not-concatenation; `record.path` canonical at
connect; `writeAllowed`; the CAS) are **real and verified** — but the resolution step, the
channel isolation, and the watcher bound are unwritten and must each be proven, not credited
as reused.

---

## 0. Verification of the controls these designs reuse (I read the source)

A gate that rubber-stamps "reuse the registry + guard + CAS" without reading it ships a hole
when the "reused" control turns out to be net-new. Findings:

| Control the design leans on | Source (verified) | Verdict |
|---|---|---|
| **`HEX_ID` id-shape gate** `/^[0-9a-f]{12}$/` | `registry.js:25`, **anchored** (`^…$`) | **Real.** A value with `/`, `..`, an absolute path, NUL, URL-encoding, wrong length, or any non-hex char **fails** `HEX_ID.test(String(id))` → no row. The anchors are load-bearing: an unanchored regex would admit `aaaaaaaaaaaa/../../etc`. Keep anchored (C-2). |
| **`registry.get(id)` — lookup key, never a path** | `registry.js:71-74` — `HEX_ID.test(String(id\|\|''))` then `find(p=>p.id===id)`; returns `null` on miss | **Real.** The id is used **only** as a `===` match against stored ids; it is **never** passed to `path.join`/`fs.*`. A crafted id that somehow passed the regex still only does an array `find`. (C-1, C-3.) |
| **`record.path` is canonical + containment-set at connect** | `registry.js:87` stores `path: projectRoot(input)`; `canonicalRoot` (`registry.js:28-36`) rejects non-string/empty/NUL/relative/non-existent/non-dir **before** `projectRoot`; `projectRoot` (`project-id.js:19-36`) = `git rev-parse --show-toplevel` (argv, no shell) else `fs.realpathSync` | **Real.** The stored path is a realpath'd/git-top directory the user explicitly connected. The client id selects a **row**; it never supplies/influences/overrides the path. (C-3.) This is the load-bearing fact that makes "confinement by registry membership" sound — **verified, not assumed.** |
| **`:id` never concatenated to a path (existing read API)** | `projects.js:89,114-118` — `HEX_ID.test(tail[0])` then `registry.get`; a non-hex `:id` → `notFound`, never a lookup-by-path | **Real.** The new write/stream resolution must mirror this exact discipline (C-1). |
| **`writeAllowed`** anti-CSRF/DNS-rebinding (X-AIDT + loopback Host + loopback Origin + loopback socket) | `guard.js:53-59`; applied to **every** `/api/*` POST in `server.js:177-180` | **Real.** Mutations inherit the guard **by placement**. But it runs **before** the body is parsed, i.e. before `project` is known — so the design's "guard → resolve → CAS" order holds **for mutations**. The **stream** GET (`/api/events`) is **NOT** guarded today (`server.js:127`, read-only) — see C-9. |
| **CAS** `readModifyWriteLedger` / `writeOverlayCAS` (`expectedRev!==rev → {conflict}`, mutex, atomic tmp+fsync+rename) | `write.js:57-69,104-113` | **Real and reusable.** Keyed on the **resolved** project's `rev` once `project` is threaded in. (C-7.) |
| **Overlay-only** (`workflow.yaml` never machine-written) | `write.js:83-96` — only `.aidevteam/workflow.overrides.json` | **Real.** Base byte-identical holds by construction (C-19). |
| **`applyOverlay` wholesale `tracks` replace** | `state.js:115` `tracks: { ...wf.tracks, ...(ov.tracks\|\|{}) }` | **Real.** Overlay replaces a track's stage array wholesale = add/delete/move. (C-18.) |
| **`isPermutation`** (existing `track/reorder`) | `api.js:20-30,98` | **Real but INSUFFICIENT for set-stages.** `set-stages` is **declarative** (add/delete allowed), so it CANNOT reuse `isPermutation`; it needs its **own** validator (non-empty, unique, trimmed, text-only, capped, non-empty-result). **NET-NEW.** (C-20.) |
| **`resolveProject(id)` (id→write/stream target)** | **absent** — no such function | **NET-NEW, the entire HARD surface.** All of §2 is new code under TDD. |
| **`track/set-stages` route + `overlay.stageOwners` merge** | **absent** — `api.js` has no `set-stages`; `state.js:334-336` builds `stageOwners` from `expectedOwner` only, **no overlay read** | **NET-NEW.** §3 is new code under TDD. |
| **Per-project SSE channel + bounded watcher map** | **absent** — `server.js:93` ONE global `clients` Set; `server.js:94` ONE `watched` Set; `startWatchers` roots at the launch `PROJECT` (line 109-115) | **NET-NEW, security-relevant (isolation + DoS bound).** No per-project channel, no refcount, no cap, no teardown exists today. §2 C-10…C-13 are new code each carrying a proving test. |

**Headline:** the id-shape gate, the registry-lookup-not-concatenation discipline, the
canonical `record.path`, the guard, the CAS, and overlay-only writes are **real and
verified**. `resolveProject`, the **per-project channel isolation**, the **bounded watcher
map**, `track/set-stages`, and the `overlay.stageOwners` merge are **net-new code** and each
carries its own proving test; none may be counted as a passing mitigation until written and
tested.

---

## 1. Trust model & threat surface (delta)

**Trust model unchanged:** single-developer, localhost. The Operator is trusted; **the browser
the Operator also uses is NOT.** Any website the Operator visits can
`fetch('http://127.0.0.1:<port>/api/<route>', {method:'POST', body:'{"project":"…"}'})`.
Loopback binding is **not** the access control — `writeAllowed` is. The NEW element is that a
single client-controlled string (`project`) now **selects which project is written and which
project's events a subscriber receives**. The risk classes:

**STRIDE — the `project` id → write/stream resolution (the new surface):**

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Tampering (id used as a path)** | A `project` value like `../../etc`, `/abs`, `a/b`, a URL-encoded traversal, a NUL-bearing string, or a symlink name is concatenated into a filesystem path and a write lands outside any registered root. | **HIGH** | **C-1, C-2, C-3** — id is a **lookup key only**; `HEX_ID` anchored shape-check; resolve **only** via `registry.get`; the only path used is `record.path`. A crafted id fails the regex (→`null`) or matches no row → refused, **nothing written**. |
| **Spoofing / BOLA (well-formed but unregistered id)** | A valid-shaped 12-hex id with **no registry row** selects a target. | **MED** | **C-4** — `registry.get`→`null` ⇒ `404 unknown project`, nothing written, no stream opened. |
| **Tampering (client-supplied path field honored)** | The body carries a `path`/`dir`/`file` field that the write honors instead of `record.path`. | **HIGH** | **C-5** — the **only** path ever used is `registry.get(id).path`; no client path/dir/filename field is read. (Prove: a body with a `path` field is ignored; the write still lands under `record.path`.) |
| **Spoofing / CSRF / DNS-rebinding (scoping weakens the guard)** | Scoping the write makes someone move/relax `writeAllowed`; a hostile site drives a scoped write. | **HIGH** | **C-8, C-9** — guard runs **BEFORE** resolution (order = guard → resolve → CAS); a scoped mutation missing X-AIDT / non-loopback Host/Origin / non-loopback socket → `403`, **before** the id is even resolved, nothing written. The stream GET gets its own pre-resolution checks (C-9). |
| **Information disclosure (cross-project stream leak)** | A subscriber to project A receives project B's events (a write to B pushes to an A viewer). | **HIGH** | **C-10, C-11** — per-project channels keyed on the **resolved** root; a push for B is delivered **only** to B's subscribers; proven under concurrent writes (N-12). Today's single global `clients` Set would leak **everything to everyone** — net-new isolation. |
| **DoS (unbounded watchers / FD exhaustion)** | Each viewed project opens its own `fs.watch` set; many projects (or rapid subscribe/unsubscribe) exhaust file descriptors. | **MED** | **C-12, C-13** — per-project watchers are **capped** (small constant, e.g. 16), **refcounted**, and **torn down on last unsubscribe**; over the cap → clean `503`, no unbounded `fs.watch`. |
| **Integrity (CAS bypass under scoping)** | Scoping breaks the per-project CAS; a stale write silently overwrites. | **MED** | **C-7** — CAS is per **resolved** project; stale `expectedRev` → `409`, no silent overwrite; concurrent writes to one resolved project serialize under the mutex. |
| **Availability/back-compat (single-project launch breaks)** | Absent id stops resolving to the launch project; legacy clients break or, worse, an absent id falls through to an unguarded path. | **MED** | **C-6** — absent id ⇒ launch `PROJECT` (single-project mode), **still guarded**; a **present** id always resolves via the registry (never the launch dir). |
| **Information disclosure (error leak)** | A `400`/`404` echoes an absolute server path or a registry dump, aiding recon. | LOW | **C-17** — terse messages (`'invalid project id'` / `'unknown project'`); no absolute paths, no stack traces, no registry contents. |

No CRITICAL findings. Every HIGH is converted to a binding, tested condition.

---

## 2. BINDING conditions — ADT-224 `SECOPS_APPROVED` (HARD)

These are acceptance criteria. `/rev` verifies **each one in code with a proving negative
test** (§5); the gate is met only when N-1…N-16 ship green. Implementation is **BLOCKED**
until then.

**C-1 — The id is a registry LOOKUP KEY, never concatenated into a path.** `resolveProject(id)`
uses the client `project` value **only** as the argument to `registry.get(id)`, which `===`-matches
it against stored ids. It is **never** passed to `path.join`, `path.resolve`, `fs.*`, or any
string-built path. (Mirror the existing read-API discipline in `projects.js:89,114-118`.)

**C-2 — Id-shape validated first, with the ANCHORED regex.** Before any registry lookup,
validate the id against `HEX_ID = /^[0-9a-f]{12}$/` (anchors load-bearing — reuse
`registry.HEX_ID`, do not re-declare a looser one). Anything else — a path, a `..` sequence, an
absolute path, a URL-encoded variant (`%2e%2e%2f`), a NUL-bearing string, a symlink name, an
over/under-12-length string, any non-`[0-9a-f]` char — **fails validation** and is **never used
in any filesystem operation** → `400 { ok:false, error:'invalid project id' }`, nothing written,
no stream opened. (Note: the HTTP layer URL-decodes the query param before it reaches the
resolver, so a `%2e%2e` arrives as `..` and is rejected by shape; assert this explicitly in N-2.)

**C-3 — The only path ever used is `registry.get(id).path` (canonical, connect-time
containment-checked).** The resolved target directory is **`record.path` and nothing else**.
`record.path` is the registry's stored canonical root (`registry.js:87` → `projectRoot` =
git-top-or-`realpath` of a `canonicalRoot`-validated directory — verified in source, §0). The
client id selects a **row**; it never supplies, influences, or overrides the path. There is **no
string the client can send** in `project` that yields a path not already vetted and stored by the
registry.

**C-4 — Well-formed-but-unregistered id is refused.** A valid 12-hex id with **no** registry row
⇒ `registry.get`→`null` ⇒ `404 { ok:false, error:'unknown project' }`, nothing written, no
stream opened, no overlay/ledger/comment/kb file touched, no directory created.

**C-5 — No client-supplied path/dir/filename field is honored.** The request body carries only
`project` (the id) + the route's own existing fields (`expectedRev`, `id`, `toStage`, `stages`,
etc.). The resolver reads **no** `path`/`dir`/`file`/`filename` field. Prove: a mutation body
that *adds* a `path`/`dir` field is ignored — the write still lands under `record.path` and never
at the injected path. (Defense-in-depth per Jorge's note: if any future sub-path is ever derived
from a client value, it must pass `write.js::isContained(record.path, realpath(target))` before
the syscall. With the current server-derived relative paths this is belt-and-suspenders — but
**record it as a standing guardrail**, not a passing control today.)

**C-6 — Back-compat: absent id ⇒ launch `PROJECT`, still guarded.** When `project` is absent
(body field absent for a mutation, `?project=` absent for the stream), the target is the launch
`PROJECT` (today's single-project behavior). A **present** id **always** resolves via the
registry (never the launch dir). The absent-id fallback path is **still** subject to `writeAllowed`
(it is the same POST dispatch). In a registry-less environment, a **present** id finds no row →
`404` (correct); the launch project stays reachable via the absent-id fallback.

**C-7 — CAS is per resolved project.** Resolution flows the resolved `project` into the
**existing** `readModifyWriteLedger` / `writeOverlayCAS`. A stale `expectedRev` against the
resolved project → `409 { conflict, state }`, **no silent overwrite**; concurrent writes to the
same resolved project serialize under the existing mutex. Scoping does not weaken CAS.

**C-8 — Guard runs BEFORE resolution (order = guard → resolve → CAS).** For mutations, the
`/api/*` POST dispatch already runs `writeAllowed` **before** the body is parsed
(`server.js:177-182`), hence before `project` is known. A scoped mutation **missing X-AIDT**,
from a **non-loopback socket**, or with a **foreign Host/Origin** → `403`, **before** any
resolution, nothing written. Do not move resolution ahead of the guard.

**C-9 — The stream subscription (`GET /api/events?project=:id`) is guarded against
CSRF/DNS-rebinding BEFORE it opens a channel or resolves the id.** Opening a per-project stream
is a capability (it discloses one project's live activity and pins a watcher). Today
`/api/events` is an **unguarded** read GET (`server.js:127`). The scoped stream MUST, before
resolving the id or registering a subscriber, enforce loopback **Host** and loopback **Origin**
(when present) and a loopback socket — the same anti-DNS-rebinding / anti-cross-site posture as
the write path — with **no permissive CORS**. (EventSource cannot send X-AIDT, so the header
check is N/A for the stream; the Host/Origin/socket loopback pinning is the operative control. A
cross-site page that opens an `EventSource` to `http://127.0.0.1:<port>/api/events?project=…`
sends an `Origin` → it must be loopback-pinned and refused otherwise.) A bad Host/Origin/socket →
`403`, **no channel opened, no watcher created, id never resolved**. *(This is a hardening of
today's behavior; flag to /arch as a net-new control on the read stream, justified by the new
per-project disclosure.)*

**C-10 — Per-project stream channels keyed on the resolved root.** A subscriber to project A is
registered against **A's** channel only. A push generated for project A is delivered **only** to
A's subscribers. The single global `clients` Set (`server.js:93`) must be replaced by a
per-resolved-project channel map. (Net-new; today everything broadcasts to everyone.)

**C-11 — Cross-project isolation proven under concurrent writes.** A B-frame **never** reaches
an A-subscriber. Prove with two subscribers on two ids under concurrent writes to both projects:
each receives **only** its own project's frames (N-12).

**C-12 — Per-project watchers are bounded + refcounted + torn down.** A channel's `fs.watch` set
is created on **first** subscriber and **torn down on last unsubscribe** (refcount via the
existing `req.on('close')`). The server never watches a project nobody is viewing. No FD leak
across subscribe/unsubscribe cycles (N-15).

**C-13 — Active-project cap enforced (DoS bound).** Cap the number of concurrently watched
projects at a small constant (e.g. 16). At the cap, a new subscription either reuses an existing
channel or is **refused cleanly** (`503 { error:'too many active projects' }`) — **never** opens
unbounded `fs.watch` handles. The launch project's channel is exempt in single-project mode. A
per-target `fs.watch` failure degrades gracefully (one bad watch never tears the channel down) —
the existing try/catch posture (`server.js:104`) is preserved per channel.

**C-14 — No mutation crosses project boundaries.** A mutation scoped to project A writes
**only** under A's `record.path` — never the launch project, never project B. Prove: viewing/
scoping to A while the hub launched against B, a note/advance/gate/overlay edit lands in A and
**B is byte-unchanged** (this is the root-cause bug the ticket fixes; assert the negative too).

**C-15 — Crafted id leaves the filesystem byte-for-byte unchanged.** For every crafted
`project` value (path, `..`, absolute, URL-encoded traversal, symlink name, NUL-bearing,
wrong-length, non-hex): snapshot the FS, fire the scoped mutation, assert refusal (`400`/`404`)
**and an identical FS** — no overlay written, no ledger touched, no comment appended, no KB file
created, no directory created (N-1…N-9). Asserting only the status code is insufficient; **assert
no write occurred.**

**C-16 — Single id→path authority.** Exactly **one** `resolveProject(id)` site at the HTTP
boundary serves both the body field (mutations) and the query param (stream). Identical
validation, identical rejection behavior, identical fallback. One audit point. (No second,
divergent resolver.)

**C-17 — No info leak in errors.** `400`/`404`/`503` messages are terse and **never** echo an
absolute server path, a registry dump, or a stack trace (consistent with the other routes'
`bad('…')` strings).

---

## 3. BINDING conditions — ADT-225 `SECOPS_APPROVED` (review)

`track/set-stages` and the `overlay.stageOwners` merge are **NET-NEW** (do not exist today).

**C-18 — Overlay-only; base `workflow.yaml` byte-unchanged.** `set-stages` writes **only** via
`writeOverlayCAS` → `.aidevteam/workflow.overrides.json` (`overlay.tracks[track]` wholesale
replace + `overlay.stageOwners[stage]`). The base `workflow.yaml` is **never** opened for write.
Prove: hash the resolved `workflow.yaml` before/after a full add/delete/move/owner edit session →
identical (N-17).

**C-19 — The full-stage-list op is VALIDATED before any write; nothing persists on failure
(clear `400`).** `set-stages` is **declarative** (the full ordered list), so it **cannot** reuse
`isPermutation`. It needs its own validator. Reject, writing nothing, when:
- the **track is unknown** (`bad('unknown track')`);
- the resulting stage list is **empty** (a delete that empties the track) → reject;
- any stage **name** is empty/whitespace after trim, a **duplicate** within the list, or over the
  length cap;
- any stage **name** or **owner** contains control chars / NUL / a path separator — stored as a
  **plain string**, never as a path or a field key that could escape (reuse the `addKbNote`/
  `slugify` text-shape rigor in spirit; the stage name is **not** turned into a filename here, but
  it MUST NOT be usable as one downstream).

**C-20 — Owner is from a constrained set / plain capped string, never interpreted as a path.**
The per-stage `owner` (when present) is a plain string, length-capped, escaped on render, and
**never** interpreted as a path or used to build one. (Per Jorge's design the per-stage `gate`
field is **advisory view metadata** — the authoritative gate rule stays in `overlay.gates` via
the existing `gate/trigger` op; `set-stages` MUST NOT let `gate` rewrite gate definitions.)

**C-21 — No injection via stage/owner names into the projection.** Stage names and owners flow
into `state.js` `tracks` / `stageOwners` / `workflowView` as **inert strings**. They are **not**
used as object keys that could shadow prototype/internal fields in a way that corrupts the
projection (guard against `__proto__`/`constructor`/`prototype` as a stage name or owner key in
the overlay merge — `deepMerge` in `write.js:71-81` walks `Object.entries`; confirm a stage named
`__proto__` cannot pollute). Reject or neutralize such names (N-20).

**C-22 — Escaped on the FE.** Stage names and owners render as **escaped text** in the builder
and the board — no `[innerHTML]` / `bypassSecurityTrust*`. A `<script>`/`<img onerror>` payload
in a stage name or owner is shown as literal text, never executed (N-19).

**C-23 — CAS-safe.** `set-stages` rides `writeOverlayCAS(project, expectedRev, patch)` — a stale
`expectedRev` → `409 { conflict, state }`, overlay byte-unchanged, the view re-syncs rather than
overwriting (N-18). (Scoped to the resolved project per ADT-224 C-7.)

**C-24 — Behind the write-guard.** `track/set-stages` sits on the guarded `/api/*` POST path;
missing X-AIDT / non-loopback Host/Origin / non-loopback socket → `403`, nothing written
(N-21). No new file-write surface beyond `.aidevteam/workflow.overrides.json`.

---

## 4. BINDING conditions — ADT-226 `SECOPS_APPROVED` (review)

FE re-projection only. **No new server route, no new persistence, no new input-trust path.**

**C-25 — No new surface.** The board derives columns from `state.workflowView.stages` (ordered)
and places tickets by `ticket.stage` — both already in the scoped read projection. Confirm in
review that **no** new route/handler/file-write is introduced. Advance rides the **existing**
`ticket/advance` (CAS-guarded, `api.js:38-46`); "next stage" is `stages[index+1]` from
`workflowView` — no new write path.

**C-26 — Escaped render of stage / owner / ticket text.** Column labels (stage, owner), ticket
title, status, and the off-track lane render as **escaped text** — no `[innerHTML]`/bypass. A
crafted stage name (from ADT-225) or ticket title is shown literally, never executed (N-22).

**C-27 — Advance is CAS-safe and scoped.** `ticket/advance` returns `409 { conflict, state }` on
stale `expectedRev`; the board adopts the returned state and offers retry. The advance is scoped
to the resolved project (ADT-224). An off-track ticket (stage not in the active track) is
**surfaced**, never dropped — a UX requirement with **no** security weight, but confirm it does
not silently re-key/move a ticket server-side (N-23).

---

## 5. Negative-test checklist `/rev` MUST confirm

The gate is met only when these ship green. `/rev` confirms **each is a real test that would
fail if its control were removed** — not a comment, not a happy-path assertion. **For every
"crafted id" test: snapshot the filesystem before, assert refusal AND a byte-identical FS
after — the status code alone is insufficient.**

### ADT-224 (HARD — N-1…N-16)

- [ ] **N-1 (traversal id):** `project:"../../etc/passwd"` (and `"..%2f..%2f"`) → `400 invalid
      project id`; **no** registry lookup by path; FS byte-identical; no stream opened.
- [ ] **N-2 (URL-encoded traversal on the stream param):** `?project=%2e%2e%2f%2e%2e` → after the
      HTTP layer decodes it to `../..`, shape-check `400`; no channel opened, no watcher created.
- [ ] **N-3 (absolute path id):** `project:"/etc"` / `"/home/x/other"` → `400`; FS unchanged.
- [ ] **N-4 (separator id):** `project:"aaaaaa/bbbbbb"` → `400` (fails anchored hex); FS unchanged.
- [ ] **N-5 (NUL-bearing id):** `project:"aaaaaaaaaaaa "` → `400`; FS unchanged.
- [ ] **N-6 (wrong length):** 11-char and 13-char hex → `400`; FS unchanged.
- [ ] **N-7 (non-hex):** `project:"zzzzzzzzzzzz"` / mixed-case `"AAAAAAAAAAAA"` → `400`; FS
      unchanged. (Confirms the regex is `[0-9a-f]`, lowercase-only, anchored.)
- [ ] **N-8 (symlink-name id):** a `project` value equal to a symlink's name → still just a
      12-hex shape check + registry `find`; never a path op; FS unchanged.
- [ ] **N-9 (well-formed unregistered id):** a valid 12-hex id with **no** registry row → `404
      unknown project`; nothing written; no stream opened; no dir created.
- [ ] **N-10 (client path field ignored):** a mutation body with an **extra** `path`/`dir`/`file`
      field alongside a valid `project` → the write lands under `registry.get(project).path`,
      **never** at the injected path; the injected path location is untouched.
- [ ] **N-11 (no cross-project write):** hub launched against project B; a mutation scoped to a
      registered project A → the change lands in **A**; **B is byte-unchanged** (root-cause
      regression guard).
- [ ] **N-12 (cross-project stream isolation under concurrent writes):** two subscribers on ids
      A and B; concurrent writes to both → the A-subscriber receives **only** A-frames, the
      B-subscriber **only** B-frames; **no** B-frame on the A stream.
- [ ] **N-13 (guard required on scoped mutation):** a scoped mutation **without** X-AIDT → `403`;
      with a **non-loopback Host**, a **cross-site Origin**, and (no `--allow-remote-writes`) a
      **non-loopback socket**, each → `403`; nothing written; **guard fires before resolution**
      (assert the id is never resolved on a `403`).
- [ ] **N-14 (guard on the stream):** `GET /api/events?project=…` with a **non-loopback Host** or
      a **cross-site Origin** → `403`; **no channel opened, no watcher created**.
- [ ] **N-15 (watcher teardown — no FD leak):** subscribe then disconnect N times on the same
      project → the channel's watchers are torn down on last unsubscribe; the watched-project
      count returns to baseline (no monotonic FD growth).
- [ ] **N-16 (watcher cap — clean refusal):** subscribing past the active-project cap → `503 too
      many active projects`; **no** unbounded `fs.watch`; existing channels keep serving.
- [ ] **N-16b (CAS per resolved project):** a scoped mutation with a **stale `expectedRev`** →
      `409 { conflict, state }`; the resolved project's ledger/overlay is **byte-unchanged**; no
      lost update.

### ADT-225 (review — N-17…N-21)

- [ ] **N-17 (base YAML byte-identical):** hash `workflow.yaml` before/after a full
      add/delete/move/owner `set-stages` session → identical; only
      `.aidevteam/workflow.overrides.json` changed.
- [ ] **N-18 (overlay CAS — stale rev → 409):** a `set-stages` save with a stale `expectedRev` →
      `409 { conflict, state }`; overlay byte-unchanged; concurrent edit survives.
- [ ] **N-19 (invalid stage-list rejected, nothing written):** an **empty** resulting list, a
      **duplicate** name, an **empty/whitespace** name, an **over-cap** name, and an **unknown
      track** each → `400`, **overlay unchanged**.
- [ ] **N-20 (prototype-pollution / key-escape neutralized):** a stage name or owner of
      `__proto__` / `constructor` / `prototype` does **not** pollute the projection or the overlay
      object; it is rejected or stored inertly; `Object.prototype` is unmodified after the write.
- [ ] **N-21 (escaped render + guard):** a stage name / owner containing `<script>…` / `<img
      onerror=…>` renders as **literal escaped text** in the builder and board (no execution);
      and a `set-stages` without X-AIDT / non-loopback Host/Origin → `403`, nothing written.

### ADT-226 (review — N-22…N-23)

- [ ] **N-22 (escaped board render):** a crafted stage name (via ADT-225) / ticket title / owner
      shown in a column header or card renders as **literal escaped text** — no `[innerHTML]`/
      bypass; the payload does not execute. Source-scan: no `[innerHTML]`/`bypassSecurityTrust*`
      on board content + a behavioral non-execution assertion.
- [ ] **N-23 (advance CAS-safe, no new write, off-track not re-keyed):** a `ticket/advance`
      against a stale `expectedRev` → `409 { conflict, state }`, no lost update; an off-track
      ticket is **surfaced** (set-difference on the FE) and is **not** silently re-keyed/moved
      server-side; the board introduces no new route or persistence.

---

## 6. Gate decisions

**ADT-224 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** C-1…C-17 (§2), proven by N-1…N-16 (§5).
- **No CRITICAL/HIGH left open:** id-as-path traversal, client-path-field injection,
  CSRF/DNS-rebinding on both the mutation and the new stream surface, cross-project stream leak,
  and the watcher DoS are each converted to a binding, tested condition.
- **Net-new code flagged (not free reuse):** `resolveProject`, the **per-project SSE channel
  isolation**, and the **bounded/refcounted watcher map** do **not** exist today (one global
  `clients` Set + one `watched` Set rooted at the launch project). The id-shape gate, the
  registry-lookup discipline, the canonical `record.path`, the guard, and the CAS are reused and
  verified; the resolution, the isolation, and the bound are net-new and each carry a proving
  test. **C-9 hardens the read stream** (Host/Origin/socket loopback pinning before it opens a
  channel) — flag to /arch as a net-new control justified by the new per-project disclosure.
- **BLOCKED until:** C-1…C-17 ship with N-1…N-16 green and pass `/rev`. ARCH approved the
  routing/confinement design; this hard gate does not waive — implementation is blocked until
  verified.

**ADT-225 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.**
- **Binding on:** C-18…C-24 (§3), proven by N-17…N-21. `track/set-stages` + `overlay.stageOwners`
  are **net-new**; the declarative op needs its **own** validator (cannot reuse `isPermutation`),
  must reject the empty/duplicate/blank/over-cap/unknown-track cases writing nothing, must
  neutralize prototype-pollution stage/owner keys, renders escaped, is CAS-safe, overlay-only
  (base YAML byte-identical), and behind the guard.

**ADT-226 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.**
- **Binding on:** C-25…C-27 (§4), proven by N-22…N-23. FE re-projection only — **no** new server
  surface; escaped render of stage/owner/ticket text; advance rides the existing CAS-guarded,
  now project-scoped `ticket/advance`; off-track tickets surfaced, never silently re-keyed.

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-08 · **Status:** APPROVED WITH CONDITIONS
(ADT-224 HARD gate conditional on C-1…C-17 + N-1…N-16; ADT-225 conditional on C-18…C-24 +
N-17…N-21; ADT-226 conditional on C-25…C-27 + N-22…N-23) · **Next:** ADT-224 → `/be` under TDD
(must ship N-1…N-16; `resolveProject`, per-project channels, bounded watchers are net-new) →
`/rev` verifies each condition in code; ADT-225 → `/be` adds `set-stages` + `overlay.stageOwners`
merge with N-17…N-21 + `/fe` builds the editable builder (escaped); ADT-226 → `/fe` re-projection
(escaped) → `/rev`. Then `/sm` — please update sprint status.
