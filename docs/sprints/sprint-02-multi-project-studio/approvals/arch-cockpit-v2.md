# ARCH — Cockpit v2 Read-Surfaces & Folder Browser (ADT-218 / ADT-219 / ADT-220)

> **/arch (Jorge) — Principal Solution Architect. `ARCH_APPROVED` gate (hard).**
> Scope: three Cockpit-v2 tickets that need new Core-side data shapes. All three are
> **read-only/derived** over data the hub already produces, except ADT-220 which adds
> **one** net-new read surface (a directory browser) — the single new attack surface in
> this slice, handed to /secops next as a hard gate.
> Inputs read in full: `ui-design-cockpit-v2.md` §1–§6, `cockpit-promotion-apex.md`
> §3.3/§4/§5.3, `DECISIONS.md`, `DECISION_LOG.md` (PD-8), the slice-1 approvals
> (`arch-slice1.md`, `secops-slice1.md`), and the live Core: `hub/server.js` +
> `hub/lib/{state,projects,registry,analyze,api,guard,http-body,project-id}.js`.

**Verdict (summary up top): `ARCH_APPROVED` — CONDITIONAL** for all three tickets.
- **ADT-218** — APPROVED. `taskSummary` is a pure projection in `state.js`; a compact
  `{open, needsYou}` rides the LIST endpoint so the home view does no N+1.
- **ADT-219** — APPROVED. `workflowView` and `base` are pure projections in `state.js`,
  read-only, no editing surface this slice.
- **ADT-220** — APPROVED **as a precise design for /secops to hard-gate**. The
  containment model is specified below in behavioral (WHAT) terms; the hard SECOPS pass
  must ratify it before any code lands. ARCH does not waive that gate.

The governance/security-reviewed badge (Apex §3.3) is approved as a **pure
ledger-derived projection** — no new Core data; wording is /secops's to ratify.

---

## 0. Architectural constraints carried into all three tickets (non-negotiable)

These are inherited from the locked DART architecture and slice-1 approvals and bound
every decision below:

- **Zero new runtime dependencies.** Node core only; no new npm deps in `hub/`. (DECISIONS, hub charter.)
- **Same-origin, loopback-by-default.** No new bind behaviour; no permissive CORS. (C15, guard.js.)
- **Reuse, don't reinvent.** New reads reuse `state.js` projection helpers and the
  `confinedPath`/realpath containment model already proven in `analyze.js`. New writes —
  there are **none** in this slice — would go through `guard.js` + `write.js`; the only
  new endpoint (fs/list) is a **read**, but because it discloses filesystem structure it
  still carries the write-guard header + Host/Origin checks (§3.2, C-FS conditions).
- **Derived, not stored.** `taskSummary`, `workflowView`, `base`, the badge, and the fs
  listing are all computed on read from existing inputs. Nothing new is persisted to
  disk; no new file format; the ledger/registry contracts are unchanged and
  backward-compatible.
- **Absent-not-zero (Apex §3, Aura §1.2).** A projection that cannot be computed (no
  ledger, unanalyzed project) returns the field **absent/null**, never a fabricated zero.
  This is an architectural contract on the projection shape, not just a UI rule.
- **Untrusted text stays untrusted (C13, slice-1 forward-carry).** Project-derived
  strings (titles, descriptions, **folder names**, doc names) remain inert text; the UI
  escapes on render. The Core never executes file contents and the new fs/list returns
  **names + type only**, never file contents.

---

## 1. ADT-218 — Task-status summary (`taskSummary` + compact LIST form)

### 1.1 Context
The enriched card (Aura §1) and the global needs-you strip (Apex §3.1) need a per-project
status roll-up. The home/LIST view shows many projects; fetching every ticket of every
project to count statuses would be an N+1 over `GET /api/projects/:id`. The shell (§3.4)
needs the full breakdown for one project.

### 1.2 Decision
**Compute the summary in `hub/lib/state.js` as a projection over the already-built
`tickets[]`** — *not* a new route. `buildState()` already classifies every ticket's
`status` (`done | blocked | in_progress | waiting`) and resolves `expectedOwner` and the
per-ticket merged `gates[]`. The summary is a fold over that same array, so it is
exact-by-construction with the board and costs one extra pass over data already in memory.

Add to the project-detail state:
```jsonc
"taskSummary": {
  "total": 14,
  "byStatus": { "in_progress": 8, "waiting": 0, "needsYou": 2, "blocked": 1, "done": 3 }
}
```

**`needsYou` derivation (from EXISTING signals only — no new state):** a ticket counts as
`needsYou` when **either**
  (a) it has a **hard gate in `rejected` state** (a gate with `refusal: 'hard'` whose
      per-ticket `state === 'rejected'`) — the work is blocked awaiting a human/owner
      decision; **or**
  (b) its `status === 'waiting'` **and** it has an `expectedOwner` **and** it has no live
      `active` agent (no current heartbeat) — the workflow is parked on an owner who has
      not picked it up.
Both signals are already present on each projected ticket (`gates[].refusal`/`.state`,
`status`, `expectedOwner`, `active`). Core owns this rule; the UI only renders counts.

**Disjointness rule (so the bar/total are honest):** `byStatus` buckets are derived from
the single `status` field so they sum to `total`; `needsYou` is an **overlay** computed
in addition (a `needsYou` ticket is also counted in its base `blocked`/`waiting` bucket).
The card pulse and shell render `needsYou` as a separate emphasis chip, not as a sixth
mutually-exclusive bucket — this matches Aura §3.4 ("waiting … folded into in progress or
shown if non-zero") and keeps the proportion bar summing to total without double-display.
`/be` documents this in the projection so `/rev` can assert `sum(byStatus core buckets) === total`.

### 1.3 LIST endpoint compact form (kills the N+1)
`GET /api/projects` today returns registry records only (no state). **Enrich each LIST
record with a compact, cheap roll-up** so the home grid renders cards + the global strip
without a per-project round-trip:
```jsonc
{ "id": "...", "path": "...", "label": "...", "status": "connected",
  "taskSummary": { "open": 12, "needsYou": 2 }   // compact; omitted entirely when unknown
}
```
- `open` = `total - done`; `needsYou` as in §1.2.
- **Cost trade-off (the one real risk here):** producing this on LIST means
  `buildState()` runs once per connected project per list call. That is the same cost the
  detail view already pays per project, but now amortized across the roster. **Mitigation:**
  (i) it is **read-only and bounded** by the registry size (single-developer, a handful of
  projects); (ii) `buildState` is already the hot path and tolerant (never throws); (iii) a
  project whose state cannot be built (no ledger / unanalyzed / read error) **omits**
  `taskSummary` entirely (absent-not-zero) rather than failing the list. If the roster ever
  grows large enough to matter, a short-TTL memo keyed on the project's `rev`
  (`state.js::fileRev`) is the documented follow-up — **not** built now (YAGNI; no evidence
  it is needed for the single-dev model).
- **Per-project error isolation:** one project's failed `buildState` must not blank the
  whole list — that record returns without `taskSummary`, the others are unaffected.

### 1.4 Reuse / containment
No new file reads beyond what `buildState` already does (it reads the project's ledger /
markdown tickets / workflow under the existing tolerant readers). No new write surface. No
guard change — LIST stays an open GET like `/api/state`. Backward-compatible: adding
fields to the LIST records and the detail state does not break existing consumers.

---

## 2. ADT-219 — `workflowView` + `base` facts (read-only projections)

### 2.1 Context
The shell's Workflow rail (§3.3) and Base panel (§3.5) need render-ready shapes. The raw
data already exists on the detail state (`tracks{}`, `gateDefs[]`, `stageOwners{}`,
`kb[]`), but the cockpit would otherwise re-join three maps and re-derive index facts.

### 2.2 Decision — `workflowView` (flattened, render-ready)
**Project it in `state.js`** from `tracks` + `gateDefs` + `stageOwners` — the three maps
`buildState` already computes:
```jsonc
"workflowView": {
  "activeTrack": "full",
  "stages": [
    { "stage": "vision",       "owner": "/po",     "gate": null },
    { "stage": "architecture", "owner": "/arch",   "gate": { "name": "ARCH_APPROVED",   "refusal": "hard" } },
    { "stage": "security",     "owner": "/secops", "gate": { "name": "SECOPS_APPROVED", "refusal": "hard" } },
    { "stage": "done",         "owner": null,      "gate": null }
  ]
}
```
- **`activeTrack` resolution:** the track of the currently-selected/active ticket if one is
  resolvable; else the longest defined track (deterministic tie-break: longest, then
  first by definition order) — matching Aura §3.3 ("if `track` unknown, default to the
  longest defined track"). When no workflow resolves at all, `stages` derives from the
  `floor`/solo track (Aura: "Using the default solo workflow").
- **`owner`** per stage = `stageOwners[stage]` (already `expectedOwner(stage, wf)`).
- **`gate`** per stage = the gate whose stage maps to it, carrying **only** `name` +
  `refusal` (hard/soft drives the shield solid/dashed shape — colour-independent, Aura
  §3.3/§5). Stages with no governing gate → `gate: null`.
- **Read-only. No editing endpoints in this slice** (the editable builder is D-B, a later
  ticket). This projection adds zero write surface.

### 2.3 Decision — `base` facts (index status + method)
**Extend the existing `kb[]` projection** (today `{name, file}`) into a `base` shape:
```jsonc
"base": {
  "method": "local-embeddings",          // or "filename-only" when no embedder is configured
  "counts": { "indexed": 8, "indexing": 0, "failed": 0 },
  "docs": [{ "name": "code-rules", "file": "docs/code-rules.md", "index": "indexed" }]
}
```
- **Method (honest, not faked):** `method` is **`'filename-only'`** unless a real embedder
  is configured for this project (an embedder selection discoverable from
  `~/.aidevteam/config.json` / the memory config the slice-1 install wired — read-only,
  no secrets, never the API key itself, only the *presence/selection* of an embedder).
  When no embedder is wired, `counts.indexed` = the file count and the panel says
  "Filename index only" (Aura §3.5 edge) — **the Core must not report `local-embeddings`
  or a semantic index state it cannot substantiate.** This is the honesty contract; `/rev`
  verifies the method line reflects actual configuration.
- **Counts:** for the filename-only floor, `indexed` = number of known docs, `indexing` =
  `failed` = 0 (these are genuinely 0 by construction, not fabricated — there is no async
  indexing pipeline in this slice, so 0 is a true count, permitted). When/if a real
  embedder pipeline lands, the counts reflect its actual per-doc index state.
- **`docs[]`** carries `name`, `file` (relative path, as today), and an `index` status per
  doc. Read-only; **no add-document write endpoint in this slice** (that is a later
  ticket; the UI Add button links to the docs folder per Aura §3.5).

### 2.4 Reuse / placement / isolation
Both projections live in `state.js` alongside `taskSummary` and are returned on the
detail state (and SSE payload, which is the same `buildState` output). They reuse the
existing tolerant readers; a project with no workflow / no docs yields an empty-but-honest
shape (absent-not-zero). **Per-panel isolation** (Aura §3.6): each projection is computed
independently so one failing (e.g. `base` read error) does not blank `workflowView` or
`taskSummary` — `/be` wraps each in its own try and omits on failure.

---

## 3. ADT-220 — Read-only directory-browser endpoint (the one new surface)

### 3.1 Context & decision
The folder picker (Aura §2) needs a Core-served directory browser because a browser cannot
read an absolute FS path. **Add two read-only endpoints** mounted in `server.js` /
`hub/lib/projects.js` (same module that owns `/api/projects/*`), backed by a new
`hub/lib/fs-browse.js` that **reuses the exact realpath-containment model proven in
`analyze.js`** (`confinedPath` style) and the DoS caps already there:

```
GET /api/fs/roots
  → { ok:true, roots:[{ label:"Home", path:"<$HOME>" }],
              recent:[{ label, path }] }     // recent from the registry (canonical roots)

GET /api/fs/list?path=<absDir>
  → { ok:true, path:"<realDir>", parent:"<realParent|null>",
      entries:[ { name:"ai-dev-team", type:"dir", hasProject:true }, … ] }
```

**Per PD-8: roots are confined to `$HOME` only this slice.** The admin-configurable
allowlist is explicitly **deferred, not shipped** — this keeps the new attack surface
minimal for the hard SECOPS gate.

### 3.2 The containment design — in behavioral (WHAT) terms (for /secops to hard-gate)

This is the precise contract /secops must ratify. It is stated as behaviours, not code:

**The allowed root.** There is exactly one allowed root this slice: the **realpath of
`$HOME`** (`fs.realpathSync(os.homedir())`), computed once. Call it `REAL_HOME`. Every
listing must be confined to `REAL_HOME` or a descendant of it.

**Canonical-containment algorithm for a requested `path` (applies to BOTH `/list` and any
path echoed back):**
1. **Reject bad input before any FS work** (mirrors C2): `path` must be present, a string,
   **absolute**, contain **no NUL byte**, be non-empty. On failure → `400` with a clear
   machine-readable reason; nothing is read.
2. **Default when omitted:** a missing `path` on `/list` defaults to `REAL_HOME` (the
   picker opens at Home).
3. **Resolve to a real path:** `real = fs.realpathSync(path)`. If it does not exist or is
   not a directory (`statSync(real).isDirectory()` false) → `400`/`404`; nothing is listed.
   The realpath resolution means a **symlink in the path is followed to its true target
   before the containment check** — so a symlink that escapes `$HOME` is caught at step 4,
   never listed.
4. **Containment assertion (the core check):** the listing proceeds **only if**
   `real === REAL_HOME || real.startsWith(REAL_HOME + path.sep)`. Otherwise → refuse
   (`403`/`400`, no contents), exactly the `analyze.js::confinedPath` rule. A `..` that
   climbs out of `$HOME`, an absolute path outside `$HOME` (e.g. `/etc`), or a symlink
   whose target escapes `$HOME` all fail this assertion and are refused.
5. **`parent`:** the parent is returned **only if it too is contained** in `REAL_HOME`
   (i.e. `real !== REAL_HOME`); at `REAL_HOME` the `parent` is `null` so the UI cannot
   navigate above Home.

**Per-entry rules (what a directory listing returns):**
6. **Folders only.** Only entries that are directories are returned; files are **omitted
   entirely** (not just hidden in the UI — the Core never emits them).
7. **Each returned entry is itself containment-checked.** For every child dir, resolve its
   realpath and include it **only if it stays within `REAL_HOME`**. A child that is a
   **symlink escaping `$HOME` is skipped, not listed** (mirrors C4). Symlink loops must not
   hang the scan (the listing is **non-recursive** — one directory level per request — and
   resolves each child without descending, so there is no loop to chase).
8. **Names + type only — NEVER file contents.** An entry is `{ name, type:'dir',
   hasProject }`. The endpoint reads **directory entries** (`readdir`), never file bytes.
   No file is ever opened or read by this endpoint. `name` is the basename (inert
   untrusted text; the UI escapes it).
9. **`hasProject` hint** = the child directory already contains ADT artefacts — derived by
   reusing `analyze.js::hasArtefacts` / the `ARTEFACT_MARKERS` set (`.aidevteam/`, a
   `.workflow-state.json` ledger, etc.). This is an **existence check only** (does the
   marker path exist), still containment-checked, still no file contents read. It drives
   the "● has project" badge and the init-vs-adopt hint.

**Anti-CSRF / transport (mirrors guard.js, even though this is a GET):**
10. **The fs/* reads carry the write-guard gauntlet.** Although `/api/state` and
    `/api/projects` GETs are open, **fs/list and fs/roots disclose local filesystem
    structure to the browser**, so they MUST require **`guard.js::writeAllowed`** — the
    `X-AIDT` header + Host pinned to loopback + Origin (when present) pinned to loopback +
    loopback socket unless `--allow-remote-writes`. A hostile website the operator visits
    cannot set `X-AIDT` without a CORS preflight this server never grants, so it cannot
    enumerate the operator's home directory. **No permissive CORS** is ever emitted.
    (This is the one place I extend the guard to a GET — justified because the read is a
    capability disclosure, not public data. /secops to confirm this is the right control.)

**DoS caps (mirror analyze.js `CAPS`):**
11. **Bounded listing.** A single `/list` returns at most a capped number of entries (e.g.
    the existing `maxFiles`-style cap), within a wall-clock budget, reading a single
    directory level only (no recursion, no glob). A directory with an enormous number of
    children is truncated to the cap (with a `truncated:true` flag), never read unbounded.
    `readdir` is the only FS traversal call; no `readFile`. Request `path` length is bounded.

**What this endpoint must NOT do (explicit non-goals for the gate):**
- Never return file contents, file sizes-from-read, or any non-directory entry.
- Never list outside `REAL_HOME` (no allowlist this slice — PD-8).
- Never write anything (pure read; no registry/profile mutation).
- Never follow a symlink out of `$HOME` (skip-not-follow).
- Never construct a path from request data without the realpath+containment assertion.

### 3.3 PlatformBridge — `pickDirectory()` seam (no downstream change later)
Add `pickDirectory(): Promise<string | null>` to the `PlatformBridge` interface
(`studio/cockpit/src/app/core/platform-bridge.ts`). The **browser/Core impl** resolves it
to the Core-directory-browser dialog driving `/api/fs/*`; the **future Tauri impl** calls
the native OS folder picker and returns the absolute path directly. The downstream Connect
flow (`POST /api/projects/connect { path }`) is **identical** in both hosts — only the
*picking* mechanism swaps. This keeps the native-picker upgrade a pure adapter swap with no
change to the connect/analyze contract.

### 3.4 What /secops must verify for the ADT-220 hard gate
The directory browser is the **single new attack surface** in this slice and is the
`/secops` hard gate (safety override). The conditions above (§3.2 items 1–11) are the
acceptance criteria; /secops must prove **the NEGATIVE**, not just the happy path:
- **Escape confined:** `..` traversal out of `$HOME`, an absolute path outside `$HOME`
  (`/etc`, `/`), and a **symlink inside a listed dir whose target escapes `$HOME`** are all
  refused / skipped — proven with negative tests.
- **No contents leak:** the endpoint never returns file contents, only `{name, type:'dir',
  hasProject}`; a directory containing secrets (e.g. `~/.ssh`) lists the *folder name* at
  most (and only if within `$HOME`) but never any file or file content.
- **Guard required:** a request missing `X-AIDT`, or with a non-loopback Host/Origin, or
  (without `--allow-remote-writes`) from a non-loopback socket, is rejected `403` — proven
  with a guard test, same as the write endpoints.
- **DoS bounded:** a directory with a huge number of children is capped/`truncated`, the
  scan is non-recursive, no file is read, wall-clock bounded — proven with a cap test.
- **Containment is real code, not a hope** (the slice-1 headline): the realpath+containment
  helper is reused from / equivalent to `analyze.js::confinedPath` and has its own proving
  tests for `$HOME` boundary, symlink-escape, and `..`-climb.

ARCH approves the **design**; this does **not** waive `SECOPS_APPROVED`. Implementation is
blocked until the hard SECOPS gate passes on the above.

---

## 4. Cross-cutting — the governance / security-reviewed badge (Apex §3.3)

**Decision: the badge is a PURE ledger-derived projection — no new Core data.** It is a
documented *mapping* from existing ledger gate labels to a display state; the Cockpit (or
a thin Core helper over the already-projected per-ticket `gates[]`) derives it. No new
endpoint, no new persisted field.

**The honest mapping (behavioural):**
- **`Security-reviewed`** (solid shield) when the project's relevant gated work has
  `SECOPS_APPROVED` in `state === 'passed'` (a real, attributed ledger fact). Never a
  default decoration — absent unless the gate actually passed.
- **`N/M gates passing`** counts **only gates DEFINED for this project's active track**
  (`gateDefs[].required` / the track's stages) — never invents gates that do not apply.
- **`blocked at {stage}`** (danger shield) when a **hard** gate is currently `rejected` —
  which is itself a positive, on-brand signal that the gate has teeth (Apex §3.3).
- **Absent-not-zero:** a project with no gate data shows **no badge**, not "0 gates".

**Honesty caveat (binding on the copy, not the data):** a passed gate means *the security
stage ran and approved this change*, **not** "this code is secure". **The exact wording**
of the badge label and its tooltip (Apex §3.3/§5.5) is a **technical security claim** and
is **/secops's to ratify** (jointly noted on ADT-218's SECOPS gate, soft for rendering but
the claim wording is gated). ARCH confirms the *data derivation* is sound and adds nothing
new; ARCH does not set the words. Same for the trust-strip / local-first / no-egress copy
(Apex §4): the data behind it (loopback-default, DART uploads no code, host AI tool still
sends prompts) is architecturally accurate — the precise phrasing is /secops + /legal.

---

## 5. Risks & mitigations (ATAM-style)

| ID | Risk | Sev | Mitigation |
|---|---|---|---|
| R-1 | `taskSummary` on LIST recomputes `buildState` per project → cost on a large roster. | LOW | Single-dev model; bounded by registry size; read-only & tolerant; per-project omit-on-failure. Documented `rev`-keyed memo as a follow-up only if it ever bites (YAGNI now). |
| R-2 | `needsYou` double-counting makes the proportion bar lie. | MED | `needsYou` is an explicit **overlay** chip, not a sixth bucket; core `byStatus` buckets sum to `total`. `/rev` asserts the sum. |
| R-3 | `base.method` claims a semantic index it cannot substantiate. | MED | Method is `filename-only` unless a real embedder is configured; the honesty contract is a `/rev` check; counts for the floor are true-by-construction. |
| R-4 | **fs/list = the one new attack surface** — local FS read exposed to the browser. | **HIGH** | Minimal, read-only, **$HOME-confined** (PD-8), names+type only, realpath+containment reused from analyze.js, write-guard required on the GET, DoS caps, non-recursive. **Hard SECOPS gate** (§3.4) before any code. |
| R-5 | A symlink inside a listed dir escapes `$HOME` and leaks structure outside Home. | **HIGH** | Skip-not-follow on every child (C4-equivalent); realpath each entry; containment assertion; negative test required. |
| R-6 | The fs guard-on-GET extension is a novel control — could be mis-applied. | MED | Stated explicitly as a condition (§3.2 #10) for /secops to confirm; it reuses `guard.js::writeAllowed` unchanged, not a new guard. |
| R-7 | Badge copy overclaims ("Security-reviewed" implies "secure"). | MED | Data derivation only by ARCH; **wording ratified by /secops** (and /legal for privacy copy) before shipping. |

**Non-risks (safe):** the three projections add no write surface, no new file format, no
new dependency, no bind change; they are backward-compatible additive fields on existing
read payloads; a project that cannot produce a projection omits it (no fabricated data).

---

## 6. Gate decision & handoffs

**`ARCH_APPROVED` — CONDITIONAL** for ADT-218, ADT-219, ADT-220.

- **ADT-218 / ADT-219:** approved; projections live in `state.js`, read-only, additive,
  absent-not-zero, per-panel isolated. No security hard gate triggered by these
  (no new attack surface) — `SECOPS_APPROVED` on ADT-218 is the **claim-wording** ratification
  only (soft for rendering), jointly with ARCH on the copy.
- **ADT-220:** approved **as a design** with the precise containment contract in §3.2; the
  **hard `SECOPS_APPROVED` gate (§3.4) must pass before implementation** — ARCH does not
  waive it. PlatformBridge gains `pickDirectory()` so the native picker swaps in later with
  no downstream change.

**Conditions carried to implementation/review (binding ACs for `/rev` + `/verify`):**
- **A-1** `taskSummary` and the LIST `{open, needsYou}` are derived in `state.js` from the
  existing projected `tickets[]`; core `byStatus` buckets sum to `total`; `needsYou` from
  hard-gate-rejected **or** waiting+expectedOwner+no-active; absent (not zero) when state
  is unavailable; per-project omit-on-failure on LIST.
- **A-2** `workflowView` + `base` are read-only `state.js` projections; no editing
  endpoint added; `base.method` honestly reflects embedder configuration
  (`filename-only` when none); per-panel isolation.
- **A-3** `/api/fs/list` + `/api/fs/roots` satisfy every §3.2 containment condition,
  reuse the analyze.js realpath model, carry the write-guard on the GET, DoS-cap, return
  names+type only, $HOME-confined (PD-8). **Negative tests required.**
- **A-4** The governance badge derives purely from ledger gate labels; no new Core data;
  exact wording ratified by /secops before ship.
- **A-5** Zero new runtime deps; same-origin/loopback default unchanged; all new fields
  additive and backward-compatible.

**Next:** ADT-218 / ADT-219 → `/be` (projections) + `/fe` (panels) once the claim wording
is ratified. **ADT-220 → `/secops` (hard gate on §3.2/§3.4) FIRST**, then `/be` + `/fe`.
Then `/sm` — please update sprint status.

**Reviewed by:** /arch (Jorge) · **Date:** 2026-06-07 · **Status:** APPROVED WITH CONDITIONS.
