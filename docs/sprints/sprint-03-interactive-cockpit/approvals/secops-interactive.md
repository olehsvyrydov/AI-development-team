# SECOPS — Sprint 03 Interactive Cockpit (ADT-223 HARD gate · ADT-221 / ADT-222 review)

> **/secops (Soren) — Principal Security Engineer.**
> Three gates in one pass:
> - **ADT-223 — `SECOPS_APPROVED` (HARD, safety-override).** One NEW write surface:
>   `POST /api/kb/add` → new `write.js addKbNote` writes **browser-supplied content to a
>   file inside the project**. This is the single new attack surface of the sprint.
>   Implementation is **BLOCKED** until C-1…C-12 ship with their negative tests N-1…N-13
>   green and pass `/rev`.
> - **ADT-221 / ADT-222 — `SECOPS_APPROVED` (review).** No new file-write surface; the
>   Cockpit drives EXISTING mutation routes (overlay-only + CAS ledger + append-only
>   comments). The one security-relevant delta is the **net-new `expectedRev` CAS** that
>   /be must add to `track/reorder` / `gate/trigger` / `preset` — an integrity control
>   that must ship WITH its negative tests.
>
> **Inputs read in full:** `approvals/arch-interactive.md` (the `POST /api/kb/add` contract
> §3, "what /secops MUST verify" §3.5, the CAS extension for the overlay routes §1 "Gap to
> close"); tickets `ADT-221/222/223`. **Existing machinery inspected IN SOURCE — I read the
> code, not the design's claim about it:** `hub/lib/guard.js` (`writeAllowed`),
> `hub/lib/write.js` (`readModifyWriteLedger` CAS, `writeOverlay`, `appendComment`,
> `atomicWriteJSON`), `hub/lib/api.js` (every route handler — `isPermutation`, `PRESETS`
> allowlist, `GATE_STATES`, the `gate/set` audit comment), `hub/lib/http-body.js`
> (`MAX_BODY` 64 KB), `hub/lib/analyze.js` (`confinedPath` realpath+containment, `CAPS`),
> `hub/lib/comments.js` (`safeId`, `readComments`), `hub/lib/state.js`
> (`readKb`, `buildBase`, `embedderConfigured`, `fileRev`, `applyOverlay`), `hub/server.js`
> (dispatch + where `writeAllowed` is applied). Prior gate style: `secops-cockpit-v2.md`
> (C-/N- format).

---

## Verdict (summary up top)

- **ADT-223 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate.** Binding on the **12
  numbered conditions C-1…C-12 (§2)**, proven by the negative tests **N-1…N-13 (§4)**. No
  CRITICAL/HIGH finding is left open — each is converted to a binding, testable condition.
  **Implementation is BLOCKED until C-1…C-12 ship with N-1…N-13 green and pass `/rev`.**
- **ADT-221 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.** Binding on **C-13…C-16
  (§3)**. The surface is the proven, guarded overlay control plane; the only security-relevant
  net-new code is the `expectedRev` CAS on the three overlay routes (C-13) — a lost-update /
  clobber integrity control that **must ship with the negative tests N-14…N-16**.
- **ADT-222 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.** Binding on **C-17…C-19
  (§3)**. Advance / gate-set are already CAS-guarded; comment is append-only and body-capped.
  The conditions pin comment-body cap + inert rendering + the typed-audit-comment invariant.

---

## 0. Verification of the controls these designs reuse (I read the source)

A gate that rubber-stamps "reuse the guarded control plane" without reading it ships a hole
when the "reused" control turns out to be net-new. Findings:

| Control the design leans on | Source (verified) | Verdict |
|---|---|---|
| **`writeAllowed`** anti-CSRF/DNS-rebinding (X-AIDT + loopback Host + loopback Origin + loopback socket) | `guard.js:53-59`, sound | **Real.** Applied to **every** `/api/*` POST in `server.js:177-180` (and to the `fs/*` GETs). So 221/222/223 routes inherit the guard **by placement** — no per-route wiring needed. Prove the negative anyway (N-7, N-15, N-18). |
| **Atomic CAS ledger** `readModifyWriteLedger(dir, expectedRev, mutator)` | `write.js:53-64` — `withLock` mutex + `expectedRev !== rev → {conflict}` + atomic tmp+fsync+rename | **Real and reusable.** `ticket/advance`, `ticket/assign`, `ticket/active`, `gate/set` already CAS through it (`api.js:36,44,56,70`). |
| **CAS on the overlay routes** (`track/reorder`, `gate/trigger`, `preset`) | `api.js:88-111` — call `writeOverlay` **with NO `expectedRev`** | **NET-NEW — does NOT exist today.** The three overlay routes currently destructure NO `expectedRev` and never CAS. The 409 re-sync the 221 AC and Jorge's D-005 require is **unwritten code**. **Do not credit it as reused** — C-13 makes it a tested net-new control. |
| **`writeOverlay`** overlay-only (never writes `workflow.yaml`) | `write.js:79-90` — writes only `.aidevteam/workflow.overrides.json` via `deepMerge`+atomic | **Real.** Base YAML is never opened for write anywhere in `write.js`. The "base byte-identical" AC holds by construction (C-14). |
| **Permutation validation** for reorder | `api.js:20-24` `isPermutation` (length + sorted-join equality) → `api.js:92` rejects non-permutations `400` | **Real.** Rejects add/drop/duplicate. (C-15.) |
| **Preset allowlist** | `api.js:13` `PRESETS=['solo','small-team','regulated']` → `api.js:108` `400` otherwise | **Real.** (C-16.) |
| **Gate-state allowlist + typed audit comment** | `api.js:14` `GATE_STATES`; `api.js:68` unknown-gate `400`; `api.js:78` emits typed `gate` comment | **Real.** The "same typed audit comment a CLI agent would" invariant is in source. (C-19.) |
| **Append-only comment, body-capped** | `write.js:93-112` `appendComment` — body `.slice(0, MAX_COMMENT_BODY=8192)`; `comments.js:13` `safeId` sanitizes ticket id into filename (no traversal) | **Real.** Cap is a server-side **slice** (silent truncation), not a reject — see C-17. |
| **64 KB body cap, clean 413 (no socket reset)** | `http-body.js:13,24-30` `MAX_BODY` | **Real.** Reachable for the KB body (C-7). |
| **`confinedPath(root, rel)`** realpath + `real===root \|\| real.startsWith(root+sep)` | `analyze.js:82-89`, **exported** (`analyze.js:400`) | **Real and reusable as the containment RULE.** But it confines a path **it then reads**; the KB write must confine the **parent dir of the target** and additionally enforce O_EXCL no-overwrite + symlink-as-target rejection — **net-new write-path code** (C-2/C-3/C-4). |
| **`readKb`** lists `*.md` via `readdirSync`, returns `{name,file}` only | `state.js:177-185` — never reads/executes file bytes | **Real.** First-existing of `docs`→`kb`→`.aidevteam/kb`. Confirms Jorge's R4 caveat: a note must be written to the dir `readKb` will actually scan, or it won't list (C-9, functional not security). |
| **`addKbNote` / `POST /api/kb/add`** | **absent** — no such route or function | **NET-NEW, entire HARD surface.** Everything in §2 is new code under TDD. |
| **Honest indexing** `buildBase`/`embedderConfigured` | `state.js:284-313` — `method` is `filename-only` unless a real embedder selector ≠ `none` | **Real.** The new note inherits the honest label; the route triggers no embedding job (C-12). |

**Headline:** the guard, the ledger CAS, overlay-only writes, permutation/preset/gate
allowlists, the body caps and the `confinedPath` *rule* are all real and verified. The
**KB-add route+`addKbNote`** and the **overlay-route `expectedRev` CAS** are **net-new code**
and each carries its own proving tests; neither may be counted as a passing mitigation until
written and tested.

---

## 1. Trust model & threat surface (delta)

**Trust model unchanged:** single-developer, localhost. The Operator is trusted; **the browser
the Operator also uses is NOT.** Any website the Operator visits can `fetch('http://127.0.0.1
:<port>/api/kb/add', {method:'POST', …})`. Loopback binding is **not** the access control —
`writeAllowed` is. The new KB-add route turns a hostile web page into a potential **arbitrary
file-writer inside (or, without containment, outside) the project** unless every control below
holds.

**STRIDE — `POST /api/kb/add` (the new surface):**

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Tampering (path traversal / absolute / extension injection)** | A `title` slugging to `../../etc/passwd`, `/abs`, `a/b`, or `x.md.sh` writes a file outside the KB dir or with an executable name. | **HIGH** | **C-1, C-2, C-3** — filename 100% server-derived from a sanitized slug; server-fixed `.md`; realpath-containment of the parent **before** write. |
| **Tampering (symlink escape)** | The KB dir, or a same-named entry, is a symlink whose target is outside the project; the write follows it out. | **HIGH** | **C-3, C-4** — realpath the resolved parent and assert containment; refuse if the target path pre-exists as an escaping symlink; `O_EXCL` never follows-and-truncates an existing symlink. |
| **Tampering (overwrite / TOCTOU)** | A duplicate title clobbers an existing KB file; or a race between the existence check and the write clobbers. | **HIGH** | **C-5** — `O_EXCL` create (or unique-suffix on collision); the existence check and create are the **same atomic** `O_EXCL` op — no check-then-write window. |
| **Spoofing / CSRF / DNS-rebinding / cross-site fetch** | A website the Operator visits drives the write. | **HIGH** | **C-6** — route requires `writeAllowed` (inherited by placement on the `/api/*` POST path); missing X-AIDT / non-loopback Host/Origin / non-loopback socket → `403`, nothing written. **No permissive CORS.** |
| **DoS / resource exhaustion** | A multi-MB body, or an enormous title, exhausts memory or the FS. | MED | **C-7** — body size cap (≤ 64 KB, ≤ the HTTP `MAX_BODY` so it returns a clean `400`/`413`, not a reset); title length cap; text/markdown allowlist (reject binary/oversize before write). |
| **XSS (stored)** | Stored body rendered as raw HTML executes script when the list/preview shows it. | **HIGH** | **C-8** — body stored as inert text; the FE **interpolates, never `[innerHTML]`/`bypassSecurityTrust*`**. `readKb` itself never executes content. |
| **Info-disclosure (error leak)** | A `400`/`409` echoes an absolute server path or stack trace, aiding recon. | MED | **C-11** — terse messages; no absolute paths, no stack traces. |
| **Integrity (write bypasses the chokepoint)** | A second write path mutates project files without the containment/atomic guarantees. | MED | **C-10** — the ONLY new mutation goes through `write.js addKbNote`; single chokepoint, atomic tmp+fsync+rename. |

No CRITICAL findings. Every HIGH is converted to a binding, tested condition.

---

## 2. BINDING conditions — ADT-223 `SECOPS_APPROVED` (HARD)

These are acceptance criteria. `/rev` verifies **each one in code with a proving negative
test** (§4); the gate is met only when N-1…N-13 ship green. Implementation is **BLOCKED** until
then.

**C-1 — Filename is 100 % server-derived from a title slug.** The client supplies **only**
`title` and `body` — never a path, filename, directory, or extension. The server slugs `title`:
lowercase, replace every non-`[a-z0-9]` run with `-`, trim leading/trailing `-`, cap length
(≤ 80). The resulting slug **cannot contain** `/`, `\`, `.`, `..`, a leading `/`, or a NUL — by
construction (the character class excludes them). The extension `.md` and the directory are
**server constants**, concatenated after slugging. If the slug is **empty** after sanitization
(e.g. a title of only punctuation/whitespace, or one that slugifies to `""`) → reject `400`,
write nothing. Inputs `"../../etc/passwd"`, `"/abs/path"`, `"a/b"`, `"x.md.sh"`, a NUL-bearing
title, and an empty-after-slug title each collapse to a single contained `*.md` slug **or are
rejected** — never a file outside the KB dir, never an alternate extension.

**C-2 — Resolve the KB dir server-side; client never names it.** The project directory is
**server-resolved** (from the registry `record.path` for `/api/projects/:id/kb`, or the
server's single `PROJECT` for `/api/kb/add`) — never client-supplied. The KB dir is the
first-existing of `docs`→`kb`→`.aidevteam/kb` (matching `readKb`, `state.js:178`), defaulting
to creating `.aidevteam/kb` when none exists (the contained default). The target is
`join(kbDir, slug + '.md')`.

**C-3 — Realpath-containment of the target's parent BEFORE writing, reusing the `analyze.js`
rule.** Compute `realParent = fs.realpathSync(dirname(target))` and assert
`realParent === realpath(kbDir) || realParent.startsWith(realpath(kbDir) + path.sep)` — the
exact rule in `analyze.js::confinedPath` (reuse the exported helper or a byte-identical
equivalent; **no looser prefix compare without the trailing separator** — `/p/kb` must not
admit `/p/kbevil`). If the parent does not resolve, or escapes the KB dir (traversal, absolute,
or a **symlinked KB dir / symlinked entry whose target is outside the project**) → reject
`400`, write nothing. The containment check runs **before** any write syscall.

**C-4 — Symlink-as-target is refused, not followed.** A pre-existing entry at the target path
that is a symlink pointing outside the KB dir must **not** be written through. `O_EXCL` (C-5)
already refuses to open any pre-existing entry (symlink included) for create; additionally, the
parent realpath check (C-3) catches a symlinked KB dir. Prove with a **real symlink** in the
test (both a symlinked KB dir and a planted symlink entry) → rejected, nothing written.

**C-5 — No overwrite; `O_EXCL` create; TOCTOU-safe.** The note is written to a **new** file. Use
`O_EXCL` (`wx`) create so an existing file is **never** truncated/clobbered, and the
existence-check and create are the **same atomic op** (no check-then-write window). On a name
collision (duplicate title) derive a **unique suffix** (`-2`, `-3`, …) and retry the `O_EXCL`
create — never replace. Write atomically (tmp + fsync + rename) consistent with `write.js`.

**C-6 — Write-guard required.** The route sits on the `/api/*` POST path that already runs
`writeAllowed` (`server.js:177-180`). A request **missing X-AIDT**, with a **non-loopback
Host/Origin**, or off a **non-loopback socket** (without `--allow-remote-writes`) → `403`,
nothing written. **No permissive CORS** is emitted. (Inherited by placement; prove the negative
in N-7.)

**C-7 — Size cap + text/markdown allowlist; reject before write.** Enforce a body size cap at
the route (≤ 64 KB, ≤ the existing `MAX_BODY` so an oversize body returns a clean `400`/`413`,
not a TCP reset) and a **text/markdown content-shape allowlist**: accept only a UTF-8
markdown/plain-text body; reject a non-text/binary body (NUL bytes / non-UTF-8 / control-char
soup) and an oversize body → `400`, write nothing. Title length capped (≤ 200). (No upload path
this MVP — D-003 — so this is a content-shape check, not MIME sniffing.)

**C-8 — Stored body rendered INERT downstream.** The stored markdown is **never** executed or
HTML-injected. The Cockpit FE **interpolates** title/body/name as escaped text and **must not**
use `[innerHTML]` / `bypassSecurityTrust*` / `v-html`-equivalent on KB content. A `<script>` /
`<img onerror>` / `javascript:` payload in the body is shown as literal text, never executed.
(`readKb` reads bytes but never executes; the obligation is on the renderer.)

**C-9 — Lists + counts by construction (functional, not security; record for /rev).** Because
the route writes to the **same dir `readKb` scans** (C-2), the new `*.md` appears in the list
and the count increases by one on the next `buildState`. The SSE watcher already covers
`.aidevteam/kb` (`server.js:111`), so the push fires.

**C-10 — Single mutation chokepoint, atomic.** The only new write goes through
`write.js addKbNote`. No other module touches project files for this feature. The write is
atomic (tmp + fsync + rename); a reader never sees a partial file. The KB add emits **no**
ledger/comment change and need not move `rev` (the `.aidevteam/kb` watcher still pushes).

**C-11 — No info leak in errors.** `400`/`409`/`413` messages are terse and **never** echo an
absolute server path or a stack trace (consistent with the other routes' `bad('…')` strings).

**C-12 — Honest indexing label; no fabricated semantic index.** The note's indexing method
comes from the existing `buildBase`/`embedderConfigured` (`state.js:304-313`): `filename-only`
unless a real embedder selector (≠ `none`) is configured. The route triggers **no** embedding
job (D-003). The label must not claim semantic/“indexed” unless an embedder is genuinely
configured. (Overclaiming an index is a dishonest-capability finding.)

---

## 3. BINDING conditions — ADT-221 / ADT-222 review

### ADT-221 — Editable Workflow builder

**C-13 — `expectedRev` CAS on `track/reorder`, `gate/trigger`, `preset` is a REQUIRED net-new
integrity control.** Today these three handlers (`api.js:88-111`) call `writeOverlay` with **no
`expectedRev`** — a stale browser model can silently overwrite a concurrent CLI/other-tab edit
(lost update). /be MUST thread `expectedRev` through all three: compute the overlay-aware `rev`
(`fileRev` already folds the overlay's mtime+size, `state.js:315`) under the same mutex, return
`409 {conflict, state}` on mismatch, else write. This is **security-relevant** (it prevents a
lost-update/clobber of governance configuration — who owns a gate, whether a gate is hard, which
preset is active) and **must ship WITH its negative tests** (N-14): a stale-rev save is rejected
`409`, **the overlay is byte-unchanged**, and the UI re-syncs rather than overwriting.

**C-14 — Base `workflow.yaml` is never machine-written (byte-identical, provable).** All three
edits go through `writeOverlay` → `.aidevteam/workflow.overrides.json` only (`write.js:79-90`).
Prove: hash the resolved `workflow.yaml` before/after a reorder/trigger/preset edit → identical
(N-16).

**C-15 — Reorder accepts a strict permutation only.** `isPermutation(base, stages)`
(`api.js:20-24,92`) rejects any add/drop/duplicate with `400`, writing nothing. Keep this; do
not relax it. (N-15.)

**C-16 — Preset is allowlisted.** Only `solo|small-team|regulated` (`api.js:13,108`); any other
value → `400`, nothing written. Keep this. No client value bypasses CAS or the allowlist.

### ADT-222 — Tasks board + task detail

**C-17 — Comment body cap enforced server-side + clear-message UX.** `appendComment` slices the
body at 8 KB server-side (`write.js:100`) — a hard backstop. The "over-long comment rejected
with a clear message" AC is met by the **UI enforcing the same 8 KB limit pre-send with a clear
message**, the server slice remaining the backstop. Comments are append-only and **not part of
`rev`** (cannot clobber); they need no CAS, but the UI re-syncs from the next SSE push. Empty
body / missing id → `400` (`api.js:83-84`).

**C-18 — Advance / gate-set are CAS-guarded (stale-rev → 409, no overwrite).** `ticket/advance`
and `gate/set` already CAS through `readModifyWriteLedger` (`api.js:36,70`) and return
`409 {conflict, state}` on stale `expectedRev`. The UI adopts the returned state and offers
retry. Prove the negative (N-17). The gate-state allowlist (`GATE_STATES`) and unknown-gate
`400` (`api.js:68-69`) stand.

**C-19 — Comment author/body rendered as escaped text; gate decision emits the typed audit
comment.** The comments timeline (author, kind, ts, body) renders as **escaped text** — no
`[innerHTML]`/bypass (no stored XSS via a crafted comment body or author). A hub gate
approve/reject still emits the **same typed `gate` audit comment a CLI agent would**
(`api.js:78`) — do not bypass `appendComment`.

---

## 4. Negative-test checklist `/rev` MUST confirm

The gate is met only when these ship green. `/rev` confirms **each is a real test that would
fail if its control were removed** — not a comment, not a happy-path assertion.

### ADT-223 (HARD — N-1…N-13)

- [ ] **N-1 (traversal slug contained/rejected):** `title:"../../etc/passwd"` → the write
      target is a contained `*.md` inside the KB dir (or rejected `400`); **no file at or above
      `/etc`**, no file outside the KB dir. Assert by listing the FS after.
- [ ] **N-2 (absolute-path slug contained/rejected):** `title:"/abs/path"` → contained `*.md`
      or `400`; nothing written outside the KB dir.
- [ ] **N-3 (separator slug contained):** `title:"a/b"` → single contained `*.md` (slug
      `a-b.md`), not a nested `a/b.md`.
- [ ] **N-4 (extension injection neutralised):** `title:"x.md.sh"` → server-fixed `.md`
      extension; the written file ends `.md`, never `.sh`; no executable-named file created.
- [ ] **N-5 (empty-after-slug rejected):** a title of only punctuation/whitespace (slugs to
      `""`) → `400`, nothing written.
- [ ] **N-6 (symlink escape rejected — REAL symlink):** (a) the KB dir is a symlink whose
      target is outside the project, and (b) a symlink planted at the target path points
      outside — each → rejected `400`, **nothing written** (assert via the real target dir).
- [ ] **N-7 (write-guard required):** `POST /api/kb/add` **without** `X-AIDT` → `403`; with a
      **non-loopback Host**, and a **cross-site Origin**, each → `403`; nothing written.
- [ ] **N-8 (no overwrite / collision):** adding two notes with the **same title** never
      replaces the first file — a second, unique-suffixed `*.md` is created (or the second is
      rejected); the first file's bytes are unchanged.
- [ ] **N-9 (TOCTOU / O_EXCL):** the create uses `O_EXCL` (`wx`) — assert that a pre-existing
      file at the computed name is **not** truncated (the create fails/retries with a new name),
      proving no check-then-write window.
- [ ] **N-10 (oversize rejected):** a body over the cap → `400`/`413`, nothing written, clean
      response (no socket reset).
- [ ] **N-11 (non-text/binary rejected):** a body with NUL bytes / non-UTF-8 / binary content →
      `400`, nothing written.
- [ ] **N-12 (inert rendering — no stored XSS):** a body containing `<script>…</script>` /
      `<img src=x onerror=…>` / `javascript:` is rendered as **literal escaped text** in the
      list/preview; assert the script does not execute (source-scan: no `[innerHTML]`/
      `bypassSecurityTrust*` on KB content + a behavioral non-execution assertion).
- [ ] **N-13 (no info leak in errors):** a rejected request's `400`/`409` body contains **no**
      absolute server path and **no** stack trace.

### ADT-221 (review — N-14…N-16)

- [ ] **N-14 (overlay CAS — stale rev → 409, no clobber):** a `track/reorder` /
      `gate/trigger` / `preset` save with a **stale `expectedRev`** → `409 {conflict, state}`;
      the overlay file is **byte-unchanged**; the concurrent edit survives. (Fails today —
      proves C-13 is net-new.)
- [ ] **N-15 (non-permutation rejected):** a reorder that adds / drops / duplicates a stage →
      `400`, overlay unchanged.
- [ ] **N-16 (base YAML byte-identical):** hash `workflow.yaml` before and after a reorder /
      trigger / preset edit → identical; only `.aidevteam/workflow.overrides.json` changed.

### ADT-222 (review — N-17…N-19)

- [ ] **N-17 (ledger CAS — stale rev → 409):** a `ticket/advance` and a `gate/set` against a
      stale `expectedRev` → `409 {conflict, state}`; the ledger is unchanged; no lost update.
- [ ] **N-18 (write-guard required):** `ticket/advance` / `ticket/comment` / `gate/set` without
      `X-AIDT` (or non-loopback Host/Origin) → `403`, nothing written.
- [ ] **N-19 (comment cap + inert render + typed audit comment):** an over-long comment body is
      capped (server slice ≤ 8 KB) and the UI rejects pre-send with a clear message; a comment
      body containing HTML/script renders as escaped text (no execution); a `gate/set` emits the
      typed `gate` audit comment recorded in the JSONL.

---

## 5. Gate decisions

**ADT-223 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** C-1…C-12 (§2), proven by N-1…N-13 (§4).
- **No CRITICAL/HIGH left open:** every HIGH (traversal, symlink escape, overwrite/TOCTOU,
  CSRF, stored XSS) is converted to a binding, tested condition.
- **Net-new code flagged (not free reuse):** `POST /api/kb/add` + `write.js addKbNote` are the
  entire surface; the `confinedPath` *rule* is reused, but the write-path containment, O_EXCL
  no-overwrite, and size/type caps are net-new and each carry a proving test.
- **BLOCKED until:** C-1…C-12 ship with N-1…N-13 green and pass `/rev`. ARCH approved the
  design; this gate does not waive — implementation is blocked until verified.

**ADT-221 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.**
- **Binding on:** C-13…C-16 (§3), proven by N-14…N-16. The `expectedRev` CAS on the three
  overlay routes (C-13) is a **net-new integrity control** and must ship WITH N-14; no client
  value bypasses CAS, the permutation check, or the preset allowlist; base `workflow.yaml` is
  never machine-written.

**ADT-222 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.**
- **Binding on:** C-17…C-19 (§3), proven by N-17…N-19. Existing CAS + guard hold; comment body
  is capped and rendered inert; the typed audit comment invariant is preserved.

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-08 · **Status:** APPROVED WITH CONDITIONS
(ADT-223 HARD gate conditional on C-1…C-12 + N-1…N-13; ADT-221 conditional on C-13…C-16 +
N-14…N-16; ADT-222 conditional on C-17…C-19 + N-17…N-19) · **Next:** ADT-223 → `/be` under TDD
(must ship N-1…N-13) → `/rev` verifies each condition in code; ADT-221/222 → `/be` adds overlay
CAS (C-13) + `/fe` builds the UI → `/rev`. Then `/sm` — please update sprint status.
