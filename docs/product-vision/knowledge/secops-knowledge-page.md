# SECOPS — Knowledge Page + CRUD (ADT-247) & Connect-an-External-Codebase (ADT-248) · HARD gate

> **/secops (Soren) — Principal Security Engineer.**
> Two HARD `SECOPS_APPROVED` (safety-override) gates in one pass against the §6 hard-verify list of
> `docs/product-vision/knowledge/arch-knowledge-page.md`:
> - **ADT-247 — Knowledge page + full CRUD.** `add` exists; **edit (`kb/update`) + soft-delete (`kb/remove`) are NEW.**
>   New trust surfaces: a CAS-guarded edit writer, a **scope-change vault MOVE across the visibility boundary**,
>   and a **soft-delete** that must move a file into a contained, scan-excluded `.trash/` **without any reachable hard `unlink`**.
> - **ADT-248 — connect-an-external-codebase.** A **read-only** source record + a **per-file realpath-contained, bounded**
>   ingest over an external tree the user points DART at — the new **filesystem-READ + exfiltration** surface. Connected
>   content is a **separate facet** that must NEVER widen authored-note scope, never enter `scopeMatches`, never recall as a note.
>
> **ADT-249 (SQLite FTS index) and ADT-250 (Canon overlay) are OUT OF SCOPE here.** ADT-249 is SHOULD/later with its
> own HARD gate; ADT-250 is DEFERRED and ships NO control (no egress is approved by this pass). No index and no overlay
> may be counted as a mitigation in this MVP — both arms must be ABSENT here, and that absence is itself tested (K-9, K-13).
>
> **Inputs read in full:** `arch-knowledge-page.md` (§0–§8, esp. **§6 the ten hard-verify items**); `DECISIONS.md`
> (D-K01..D-K10); `KNOWLEDGE-BUILD-SPEC.md` (/aura §1–§12, esp. §3 CRUD, §4 connect, §7 wire contract).
> **Existing machinery inspected IN SOURCE (I read the code, not the design's claim about it):**
> `hub/lib/write.js` (`addKbNote` chain — `isContained` trailing-sep guard `:137`, `resolveKbDir`/`resolveCommonKbDir`,
> `writeNewFileExclusive` O_EXCL `wx` `:293`, `kbBodyError` 64KB+text+surrogate `:206`, `slugify` path-free `:126`,
> `SCOPE_ENUM` `:186`, `frontMatterHeader` server-emitted, `FORBIDDEN_KEYS`, `appendComment` `:304`, `withLock`+CAS),
> `hub/lib/knowledge.js` (`parseFrontMatter` bounded/never-throws/proto-safe `:110`, `scopeMatches` `:169`,
> `containedCommonVaultDir` user-home gate, closed vocabularies), `hub/lib/state.js` (`readVault` **non-recursive
> `readdirSync(dir).filter(*.md)` `:287` — structurally excludes `.trash/`**, `buildKnowledge` `:370` the authority,
> `fileRev` `:593` the CAS rev source), `hub/lib/analyze.js` (`CAPS` `:31`, `confinedPath`/`confinedRead` realpath +
> skip-not-follow `:83`/`:92`), `hub/lib/guard.js` (`writeAllowed` `:53`), `hub/lib/api.js` (the `kb/*` switch `:253`),
> `hub/lib/fs-browse.js` (`/api/fs/*` read-only picker, `confinedHome` skip-not-follow `:107`), `hub/server.js`
> (**every `POST /api/*` runs `writeAllowed` at `:214` BEFORE project resolve + dispatch** — new routes inherit the guard
> by placement). Prior knowledge-write gate inherited verbatim as the per-vault baseline:
> `docs/sprints/sprint-06-knowledge-scopes/approvals/secops-knowledge-scopes.md` (**C-201..C-214 / C-220..C-229 /
> N-201..N-233**).
>
> **Grep evidence captured this pass (the negatives some conditions prove):**
> - `grep -rn 'unlink|rmSync|rmdirSync' hub/lib` → **(none).** No hard delete exists anywhere in `hub/lib` today — the
>   soft-delete (K-3) must keep it that way; K-4 proves the negative remains true after ADT-247 lands.
> - `grep -rn 'fetch(|http.request|https.request|net.connect' hub/lib` → only `projects.js` (the unrelated registry probe).
>   The write/knowledge/analyze/state path makes **zero** outbound I/O today — K-13 proves the writers + ingest add none.
> - `grep -rn 'child_process|spawn|exec' hub/lib` (ingest path) → `analyze.js` uses **`execFileSync('git', […])`** with a
>   fixed argv (no shell, no interpolation) only for a remote-name probe. The ADT-248 ingest must add **no** exec surface —
>   K-14 proves it (gate execution/RCE-class surfaces separately; here, prove the negative).

---

## Verdict (summary up top)

- **ADT-247 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).** Binding on **K-1…K-7 + K-15…K-16**,
  proven by the negative tests **N-1…N-18 + N-31…N-35**. No CRITICAL/HIGH left open — each is converted to a binding,
  testable condition. **Implementation is BLOCKED until K-1…K-7 / K-15…K-16 ship with their negative tests green and pass `/rev`.**
- **ADT-248 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).** Binding on **K-8…K-14**,
  proven by **N-19…N-30**. The read-only-ingest invariant (K-10), per-file realpath-containment + symlink-escape-skip
  (K-11), and the no-scope-widening separation (K-12) are the load-bearing controls. **BLOCKED until K-8…K-14 ship green.**

**Cross-cutting honesty conditions K-15…K-16 (render-inert / zero-egress-honest) apply to both tickets.**

**Net-new code flagged (NOT free reuse — do not credit until written + tested):** `editKbNote`, `deleteKbNote`, the
soft-delete rename-to-`.trash` + its containment, the scope-change vault MOVE (a second containment root per call), the
CAS `expectedRev` forwarding on both writers, the entire `kb/source/{connect,reindex,disconnect}` surface, `sources.json`
+ its containment, and the read-only contained per-file ingest. The per-vault baseline (`isContained` rule,
`writeNewFileExclusive` O_EXCL, `kbBodyError`, `slugify`, `writeAllowed`, `appendComment`, `parseFrontMatter`,
`scopeMatches`, the `analyze.js` CAPS + `confinedPath`) is **real and verified**, reused verbatim, and **re-proven on each
new path**.

---

## 0. Verification of the controls these designs reuse (I read the source)

A gate that rubber-stamps "extend the one guarded writer" without reading it ships a hole when the reused control turns
out to be net-new. Findings against the ADR's §2/§3 claims:

| Control the design leans on | Source (verified) | Verdict |
|---|---|---|
| **`writeAllowed`** anti-CSRF/DNS-rebinding (X-AIDT + loopback Host + loopback Origin + loopback socket), no permissive CORS | `guard.js:53-59`; applied at `server.js:214` to **every** `POST /api/*` **before** project-resolve + dispatch | **Real.** `kb/update`, `kb/remove`, `kb/source/*` inherit it **by placement** — but prove the negative for each (N-5, N-18, N-27). |
| **`isContained(root, child)`** trailing-separator containment (rejects `/p/kb` vs `/p/kbevil`) | `write.js:137-139` | **Real and reusable as the RULE.** But edit/delete add NEW callers (`.trash` target, the scope-MOVE destination, the ingest per-file check) — each is **net-new wiring** of the rule, proven separately (K-2, K-3, K-7, K-11). |
| **`resolveKbDir` / `resolveCommonKbDir`** realpath'd, containment-checked vault roots; common gated by `containedCommonVaultDir` to `~/.aidevteam` | `write.js:144-184`, `state.js:341-352` | **Real** for `add`. The scope-MOVE re-uses BOTH; the move must be contained on **source AND destination** (K-7). |
| **`writeNewFileExclusive`** O_EXCL `wx` (never follows/truncates a pre-existing entry, symlink included) + fsync | `write.js:293-301` | **Real and reusable** on the edit-write where it creates (e.g. the new file on a scope-MOVE). The in-place body edit is **net-new** (it cannot be `wx` — it overwrites the SAME slug) and must be an atomic tmp+fsync+rename within the contained vault, never a follow-through to a symlink target — K-1/K-6. |
| **`kbBodyError`** non-empty UTF-8 text, no C0 control (bar tab/CR/LF), ≤ 64 KB, surrogate-safe | `write.js:206-213` | **Real and reusable** unchanged on the edit write — K-1. |
| **`slugify` + server-derived `<slug>.md`** (client never supplies a path/dir/filename/ext; scope is an enum) | `write.js:126-133,186` | **Real.** Edit/delete resolve the target by server-known `id`/`name` + the **enum** scope — **never** a client path. Title immutable on edit, so the slug/identity is fixed; a "rename" is honestly add+delete — K-1, K-5. |
| **`parseFrontMatter`** bounded (8 KB), schema-keys-only, `FORBIDDEN_KEYS` dropped, scalars/flat-lists, closed vocab, **never throws**, degrades to defaults | `knowledge.js:110-157` | **Real and reusable** unchanged on edit re-emit and on connected-file reads where front-matter is parsed — K-15. |
| **`readVault` non-recursive `*.md`-only scan** (the structural `.trash/` exclusion) | `state.js:287` `readdirSync(dir).filter(f => f.endsWith('.md'))` | **Real.** A `.trash` directory entry is not a `*.md` file and is never recursed — so a trashed note disappears from `buildKnowledge` with **no extra wiring**. K-3 binds this (and tests that the `.trash` target is itself contained, so the soft-delete cannot escape the vault). |
| **`scopeMatches`** the single visibility/recall predicate | `knowledge.js:169-182` | **Real and tested.** ADT-248 must **not** add a second predicate and must **not** route connected content through it — K-12. |
| **`analyze.js` CAPS + `confinedPath`/`confinedRead`** realpath-before-containment, skip-not-follow escaping symlinks, per-file/total-bytes/files/depth/time caps, read-only | `analyze.js:31-38,83-109` | **Real and reusable as the ingest DISCIPLINE.** But the connect ingest is a **net-new caller** rooted at the **external `source.root`** (not the project root) — every per-file realpath check, every cap, and the read-only invariant are re-proven against that external root (K-10, K-11). |
| **No hard delete anywhere in `hub/lib`** | grep `unlink|rmSync|rmdirSync` → **(none)** | **Real today.** The soft-delete must NOT introduce one — K-4 proves the negative survives ADT-247. |
| **Zero outbound I/O on the write/knowledge/analyze path** | grep `fetch|http.request|https.request` → only `projects.js` (unrelated) | **Real today.** The new writers + ingest add none — K-13. |
| **No exec surface on the ingest path** | grep on `analyze.js`: only `execFileSync('git', […])` fixed-argv | **Real.** The ADT-248 ingest must add **no** `spawn`/`child_process`/`exec` — K-14 (prove the no-exec negative). |

**Headline:** the per-vault write baseline, the front-matter reader, the visibility predicate, the read picker, the
analyzer's containment + caps, the write-guard, the structural `.trash` exclusion, the no-`unlink`/no-egress/no-exec
posture are **real and verified**. The **edit/delete writers, the soft-delete + its trash containment, the scope-MOVE
(two roots per call), the CAS forwarding on both, and the entire connect-codebase source + ingest surface** are
**net-new** — none counts as a passing mitigation until written and tested with the negatives in §"Negative tests".

---

## 1. Trust model & threat surface (delta)

**Trust model unchanged:** single-developer, localhost. The Operator is trusted; **the browser the Operator also uses is
NOT** — any website the Operator visits can `fetch('http://127.0.0.1:<port>/…')`. Loopback binding is not the access
control; `writeAllowed` is. Three deltas this slice introduces:

1. **Two NEW mutating writers that can DESTROY/MOVE existing data** (`kb/update`, `kb/remove`) — the prior knowledge gate
   only ever proved *additive* writes (`add`, `approve`, `reject`). Edit overwrites a note (a rule the agents obey);
   delete removes one; a scope change **moves a note across the visibility boundary** (project→common widens it to every
   other project on the machine). These are the first knowledge writes that can **lose data** or **over-share** — so CAS
   (lost-update), soft-delete (fat-finger), and contained-both-sides MOVE (over-share) are load-bearing.
2. **A NEW filesystem-READ surface over a tree the user points DART at** (`kb/source/connect` + the ingest). This is the
   classic **exfiltration** vector: a planted symlink inside the connected repo pointing at `~/.ssh` / `/etc` must be
   **skipped, not followed**; a `..`/absolute escape must not read outside `source.root`; the external tree must never be
   mutated; and the read must be bounded against DoS.
3. **A NEW separate projection facet** (connected-source content) that must NEVER cross into the authored-note
   `scopeMatches` authority — it is an external read surface, not scoped knowledge.

**STRIDE — the new surfaces:**

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Tampering (edit-write escape)** | A crafted `id`/`file` in `kb/update` edits/overwrites a file OUTSIDE the contained vault; or the in-place write follows a symlink to a target outside the vault. | **HIGH** | **K-1, K-6** — resolve by server-known id+enum-scope; realpath the parent and `isContained(vaultRoot, parent)` **before** any write; atomic tmp+fsync+rename, never follow a symlink; no path leak. |
| **Destruction / data-loss (hard unlink / trash escape)** | `kb/remove` `unlink`s a file (irrecoverable), or renames it outside the vault, or a crafted id deletes a file outside the vault. | **HIGH** | **K-3, K-4** — soft-delete is an atomic RENAME into `<vault>/.trash/`; the `.trash` target is realpath-contained; **no hard `unlink` reachable from the API** (grep-proven absent + a source-scan negative); a containment-escaping resolution deletes NOTHING. |
| **Elevation / over-share (silent re-scope MOVE)** | A scope change moves a project note to an arbitrary/out-of-vault location, or silently widens visibility to all projects. | **HIGH** | **K-7** — scope is the **enum** (never a client path); the MOVE goes through the same guarded/contained/CAS path; destination realpath-contained on the OTHER vault root too; old location soft-deleted (recoverable); UI discloses the move (D-K05, render control). |
| **Lost-update (concurrent edit/delete)** | Two sessions / an agent mid-run edit or delete the same note; one silently clobbers the other (destroys a rule the agents obey — R2). | **HIGH** | **K-2** — both writers forward `expectedRev`; a stale rev → **409/`conflict`**, **NOTHING written/moved** (byte-identical), fresh state returned. |
| **Exfiltration (symlink/traversal in connected tree)** | A symlink inside the connected root → `~/.ssh`/`/etc` is followed and read; a `..`/absolute path reads outside `source.root`. | **HIGH** | **K-11** — per-file `realpath` + `isContained(source.root, realpath(file))` **before** read; an escaping symlink is **skipped, not followed**; reuse `analyze.js confinedPath` discipline against the external root. |
| **Tampering (mutate the external tree)** | The ingest writes/renames/deletes/creates under the connected `source.root`. | **HIGH** | **K-10** — ingest opens files **read-only**; no write call on the ingest path; snapshot the external dir byte-identical after connect/reindex. |
| **Elevation (connected content widens authored scope)** | Indexed codebase content is recalled/surfaced as an authored note, merged into `scopeMatches`, or injected into the digest/recall as a vault note. | **HIGH** | **K-12** — connected content is a SEPARATE facet: not copied into a vault, not written via `addKbNote`, not run through `scopeMatches`; a connected-source row never appears in authored-note recall. |
| **Tampering / spoofing (connect path)** | `kb/source/connect` records a file/device/symlink-to-elsewhere as a root, or a traversal in the recorded root. | **HIGH** | **K-8** — realpath-validate the path is a **real directory** (not a file/device, no traversal); record the **canonical** realpath; a non-dir/unresolvable path records NOTHING; `sources.json` contained to `.aidevteam/`. |
| **DoS (ingest)** | A huge/deep/binary tree exhausts memory/time. | **MED** | **K-11** — per-file + total-bytes + max-files + max-depth + time-budget caps (reuse `analyze.js CAPS`); binary/non-UTF-8 + `.git`/`node_modules`/dotfiles skipped. |
| **Egress / secret leak** | A connect/index/search makes a network call, or a secret is read/persisted. | **HIGH** | **K-13** — ZERO outbound I/O on `add/update/remove/ask/connect/reindex/disconnect/search` with no overlay configured; no secret read/written (Canon `CANON_API_KEY` is env-only **only** when ADT-250 lands — out of scope, ships nothing here). |
| **Stored XSS / proto-pollution (untrusted note + file text + paths)** | A note body, front-matter value, source path/label, or connected-file text renders as live HTML/script, or a `__proto__` key pollutes. | **HIGH** | **K-15** — interpolation-only render (no `[innerHTML]`/`bypassSecurityTrust*`); `parseFrontMatter` proto-safe + bounded + never-throws; source-scan + behavioral non-execution. |
| **Info-disclosure (error leak)** | A refusal echoes an absolute server path (esp. `$HOME`-rooted), a connected-root path, or a stack trace. | **MED** | **K-1, K-8** — terse messages; no absolute path, no `$HOME`/connected-root path, no stack trace. |

No CRITICAL findings. Every HIGH is converted to a binding, tested condition.

---

## 2. BINDING conditions — ADT-247 (Knowledge page + CRUD) · `SECOPS_APPROVED` (HARD)

Each `kb/update` / `kb/remove` write **re-satisfies the inherited per-vault baseline C-201…C-214 / C-220…C-229** from the
sprint-06 gate, with the containment root set to the *target* vault. This pass binds them onto the two new writers and
re-proves them in §"Negative tests".

**K-1 — edit inherits ALL `addKbNote` conditions.** `editKbNote` (the `kb/update` handler) goes through the **same one**
guarded chain: the target is resolved by its **server-known `id`/`name` (slug) + enum `scope`** — **the client never
supplies a path, directory, filename, or extension** (`SCOPE_ENUM`, server `slugify`); the resolved file's parent is
realpathed and `isContained(vaultRoot, realParent)` is asserted **before** any write (trailing-sep rule, `write.js:137`);
the body re-runs `kbBodyError` (non-empty, UTF-8 text, ≤ 64 KB, no NUL/C0-control, surrogate-safe) and the ≤ 200-char
title cap; front-matter is **re-emitted server-side** from current+validated values (never echoed from the client);
errors are terse and leak **no** path or stack. **No second write path** — the only module that mutates vault files stays
`write.js`. A crafted `id`/`file`/`scope` that resolves outside the contained vault edits **nothing**.

**K-2 — CAS prevents lost-update on both writers.** `kb/update` and `kb/remove` forward `expectedRev` (= `state.rev`,
`fileRev`); under the in-process mutex, a stale `expectedRev` ≠ current rev → **409 / `ok:'conflict'`** carrying fresh
state, and **NOTHING is written, moved, or trashed** (the vault/files are byte-identical after). The conflict branch is a
first-class outcome (re-fill the drawer / hold the confirm), never an optimistic clobber of a concurrent agent/session edit (R2/R2b).

**K-3 — delete is a contained, scan-excluded SOFT-delete; the trash cannot escape the vault.** `deleteKbNote` (the
`kb/remove` handler) resolves the target by `id`/`name` + enum scope, realpaths it, and confirms it is **strictly
contained** in the chosen vault **before** touching it. The delete is an **atomic RENAME** to `<vault>/.trash/<slug>-<ts>.md`;
the `.trash/` target's parent is **itself realpath-contained** to the vault (`isContained`, trailing-sep) — a crafted
path cannot rename the file outside the vault. The `.trash/` is excluded from the projection **structurally** (the
`readVault` non-recursive `*.md`-only scan never sees the `.trash` directory entry, `state.js:287`) — a trashed note
disappears from `buildKnowledge` on the next read with no extra wiring, and is **recoverable**.

**K-4 — no hard `unlink` is reachable from the API.** Delete never calls `fs.unlink*`/`fs.rm*`/`fs.rmdir*` on a vault
file. (Grep-verified absent across `hub/lib` today; a source-scan keeps it absent.) The destructive primitive the API
exposes is the contained, recoverable RENAME of K-3 — nothing irrecoverable.

**K-5 — delete + edit are confirm/CAS-gated and audited; title immutable on edit.** A `kb/remove` is confirm-gated
(server-side: an unconfirmed request is a no-op) and, on success, appends an audit record via the append-only
`appendComment` JSONL (`kind:'kb-delete'`, **slug + scope + actor — never a filesystem path**). On `kb/update`, the
**title (slug = identity) is immutable**: a title change is surfaced honestly as add+delete, **never** a silent rename
that would orphan a referenced note.

**K-6 — the edit in-place write is atomic and never follows a symlink out of the vault.** Because an in-place body edit
overwrites the SAME slug (it cannot use `wx`/O_EXCL), it MUST be an **atomic tmp-write + fsync + rename** performed
**inside** the contained vault directory, with the destination parent realpath-contained **before** the rename — so a
pre-existing symlink at the note's path is never followed to an out-of-vault target. Where the edit creates a new file
(the scope-MOVE destination), `writeNewFileExclusive` (`wx`) is used (never follows/truncates a pre-existing entry).

**K-7 — the scope-change MOVE is contained on BOTH source and destination vault.** A `kb/update` scope change is **not a
body edit** — it MOVES the file across the two **server-known** vault roots (project vault ↔ contained common vault). The
move goes through the same guarded / CAS / mutex path; the destination is realpath-contained to the OTHER root
(project → `containedCommonVaultDir` user-home gate; common → `resolveKbDir(project)`); a project note **cannot** be moved
to an arbitrary or out-of-vault location; scope is the **enum**, never a client path. The old-location removal uses the
K-3 soft-delete discipline (recoverable). project→common is the authorization-boundary widening change — server-validated,
CAS-guarded, and disclosed in the UI (D-K05) so it is never silent.

**K-15 — all note + front-matter content is rendered escaped (FE) and stored inert (cross-cutting, see §4).**
**K-16 — zero-egress honesty preserved (cross-cutting, see §4).**

---

## 3. BINDING conditions — ADT-248 (connect-an-external-codebase) · `SECOPS_APPROVED` (HARD)

**K-8 — connect path validation + `sources.json` containment.** `kb/source/connect` realpath-validates that the supplied
`path` resolves to a **real directory** (not a file, device, or symlink-to-elsewhere; no traversal surviving in the
recorded root) and records the **canonical realpath** as `source.root`. A path that does not resolve to a real directory
records **NOTHING**. `sources.json` is written through the **same guarded writer**, atomic, **contained to `.aidevteam/`**
(realpath the parent + `isContained` before write), CAS on `expectedRev`. The route is write-guarded (403 without X-AIDT —
N-27). `path`/`label` are untrusted on render (K-15). The connect surface reuses the **existing** `/api/fs/*` read-only
picker — **no new picker** is built (`fs-browse.js` already realpath-confines to `$HOME`, skips escaping symlinks, returns
names/types only).

**K-9 — `sources.json` carries NO secret; the source record is configuration, not knowledge.** The MVP record holds
`{id, label, root, indexMethod:"filename-only", include, exclude, status, freshness, addedAt, addedBy}` — **no credential,
no API key, no token** (none exist in this MVP). `indexMethod` defaults to the honest `"filename-only"`; `"embeddings"`
appears only when an embedder is configured (ADT-249, out of scope), and that embedder config lives in `claude/memory`,
never in `sources.json`.

**K-10 — codebase ingest is READ-ONLY.** Indexing a connected codebase **never** writes/renames/deletes/creates under
`source.root`: the ingest opens files **read-only** (`fs.openSync(real,'r')` / `confinedRead` discipline) and there is
**no** write call on the ingest path. It writes only (a) the `sources.json` record and (b) the index facet inside
`.aidevteam/` (contained). Proven by snapshotting the external dir byte-identical after connect AND after reindex (N-19),
plus a source-scan that no write primitive (`writeFile`/`rename`/`mkdir`/`unlink`/`rm`/`openSync('w'…)`) targets a path
under `source.root` on the ingest path.

**K-11 — ingest is realpath-contained per file + symlink-escape skipped + bounded.** For **every** candidate file the
ingest realpaths it and confirms `isContained(source.root, realpath(file))` **before** reading (the same `confinedPath`
discipline `analyze.js:83` uses, rooted at the **external** `source.root`). A symlink inside the connected tree pointing
**outside** `root` is **skipped, not followed** (the exfiltration guard — a planted symlink to `~/.ssh` is never read). A
`..` or absolute path cannot make the ingest read outside `source.root`. DoS caps are enforced (reuse `analyze.js CAPS`:
per-file byte cap, total-bytes cap, max-files, max-depth, wall-clock time budget); binary/non-UTF-8 files are skipped
(the same text-shape check `kbBodyError`/`confinedRead` use); `.git`, `node_modules`, and dotfiles are excluded by
default, plus the source's `exclude` globs, honoring the `include` allowlist.

**K-12 — connected content NEVER widens authored-note scope / never injects into recall as an authored note.** Indexed
codebase content is a **SEPARATE projection facet**: it is **not** copied into a vault, **not** written through
`addKbNote`, and **not** run through `scopeMatches`. The authored-note `scopeMatches` authority (`knowledge.js:169`) is
**completely unaffected** by ADT-248 (no second predicate, no new match term on the authored path). A connected-source
row **never** appears in the authored-note recall/digest as if it were a vault note. (When ADT-249 ships, connected
content lives in its own `sourceId`-tagged table, separate from vault rows so it can never shadow an authored note — but
that is out of scope here; in the MVP there is no index and the facet is simply never merged.)

**K-13 — ZERO-egress local default; no secret read/persisted.** With no overlay configured, every operation
(`add/update/remove/ask/source connect/reindex/disconnect/search`) performs **ZERO** outbound network I/O. (Grep-verified:
the write/knowledge/analyze/state path has no `fetch`/`http.request`/`https.request`/`net.connect`.) No credential is read
from or written to `config.json`, `sources.json`, the (absent) index, a log, or an error body. Canon's `CANON_API_KEY` is
env-only **only** when ADT-250 lands (out of scope; this slice ships no overlay control, no "Connect Canon" button — a
dead control is the anti-pattern to avoid, D-K03).

**K-14 — the ingest adds NO execution / RCE-class surface.** The connect/index path introduces **no** `spawn`,
`child_process`, `exec*`, dynamic `eval`, or deserialization of untrusted data. (Today the only `execFileSync` on the
analyze path is a fixed-argv `git config` remote-name probe — no shell, no interpolation; the ingest must not extend it
or add a new exec call.) Prove the no-exec negative by source-scan over the ingest path (execution surfaces are gated
separately and never ride along on a no-exec feature — prove the negative rather than assume it).

---

## 4. Cross-cutting honesty conditions (BOTH tickets)

**K-15 — all note + connected-file content + paths/labels are UNTRUSTED → stored inert, rendered escaped, never
executed.** Note bodies, front-matter values, source paths, source labels, status reasons, residency, and connected-file
text are escaped on render (interpolation only — **no** `[innerHTML]`/`bypassSecurityTrust*`/`v-html`), never interpreted
as control input. Enforced by the repo's existing `no-unsafe-binding` source-scan **plus** a behavioral non-execution
test on a `<script>`/`<img onerror>`/`javascript:` payload in a body, a tag, a `by:` front-matter value, and a source
`label`/`path`. Front-matter parsing stays the bounded, never-throwing, defaults-on-hostile-input reader
(`parseFrontMatter` — schema-keys-only, `FORBIDDEN_KEYS` dropped, scalars/flat-lists, size-bounded, proto-safe). Content
is stored **RAW** on disk (git-friendly) and escaped at the FE boundary.

**K-16 — honest indexing + honest privacy copy; gate-pass means "the gate ran," never "this is secure."** The `method`
line stays `filename-only` unless a **real** embedder is configured (`embedderConfigured` reads **only** the
`memory.embeddings` selector — never a secret). Connecting a codebase claims **filename/keyword match**, never "semantic
understanding," unless an embedder is genuinely wired. Any user-facing privacy string ("nothing is uploaded",
"never writes outside that folder", "stays on your machine") is a technical assertion bound to real behaviour: reject any
strengthened absolute ("100% private", "verified secure", "synced to the cloud"); scope every claim to DART's local
behaviour (no third-party processing claim). Ship the ratified strings verbatim from a single source-of-truth so a grep
proves no rejected phrasing slipped in.

---

## 5. Negative-test checklist `/rev` MUST confirm

The gate is met only when these ship green. `/rev` confirms **each is a real test that would FAIL if its control were
removed** — not a comment, not a happy-path assertion. **Method for every write/delete/move-refusal test: snapshot the
relevant vault/store (file list + bytes) before the refused request and assert it is BYTE-IDENTICAL after** — assert
*nothing was written/moved/trashed*, not merely the error code.

### ADT-247 — edit / soft-delete / scope-move / CAS (N-1…N-18 + N-31…N-35)

- [ ] **N-1 (edit containment — crafted id/file cannot escape):** a `kb/update` whose `id`/`file`/`scope` resolves a file
      OUTSIDE the contained vault (traversal-shaped id, a sibling-prefix `kb-evil` path, an absolute path) edits
      **nothing**; the targeted out-of-vault file is byte-identical after; the response carries no path/stack.
- [ ] **N-2 (edit re-validates body — cap/text):** a `kb/update` with an over-64 KB body, a NUL/binary body, or an empty
      body → `400`, the existing note byte-unchanged.
- [ ] **N-3 (server-derived slug on edit; no client path):** a `kb/update` attempting to set the filename/dir/extension
      (e.g. a `file:"../x.md.sh"`) cannot relocate or rename the file; the slug/identity stays server-fixed.
- [ ] **N-4 (title immutable on edit):** a `kb/update` changing the title does not rename the on-disk slug — it is either
      refused or surfaced as add+delete; no silent identity change orphaning the note.
- [ ] **N-5 (write-guard on edit):** `kb/update` **without** X-AIDT, with a non-loopback Host, and with a cross-site
      Origin → each `403`; the note byte-unchanged.
- [ ] **N-6 (edit never follows a symlink out of vault):** with the note's on-disk path replaced by a symlink to a file
      OUTSIDE the vault, a `kb/update` does **not** write through the symlink to the external target (the external file
      byte-identical after); the write is contained or refused.
- [ ] **N-7 (CAS on edit — lost-update):** a `kb/update` with a stale `expectedRev` → `409`/`conflict` with fresh state,
      **nothing written**; the note byte-unchanged.
- [ ] **N-8 (soft-delete moves to contained `.trash`, not unlink):** `kb/remove` moves the file to
      `<vault>/.trash/<slug>-<ts>.md` (the file still exists on disk under `.trash`); it is **not** unlinked; it is
      recoverable.
- [ ] **N-9 (`.trash` scan-excluded):** after a `kb/remove`, `buildKnowledge`/`readVault` no longer surfaces the note, and
      the `.trash/` directory and its contents are never scanned/recalled by any project.
- [ ] **N-10 (no hard `unlink` reachable):** a source-scan over the delete path finds **no** `fs.unlink*`/`fs.rm*`/
      `fs.rmdir*` on a vault file; (the `grep` is clean today — the test keeps it clean). Removing the soft-delete and
      substituting `unlink` would make this fail.
- [ ] **N-11 (delete containment — crafted id cannot delete outside vault):** a `kb/remove` whose id/scope resolves
      outside the contained vault deletes/moves **nothing**; the targeted out-of-vault file is byte-identical after.
- [ ] **N-12 (`.trash` target cannot escape the vault):** a crafted resolution cannot rename the file to a `.trash` path
      outside the vault (e.g. a symlinked `.trash` → elsewhere); the move is refused; nothing lands outside the vault.
- [ ] **N-13 (CAS on delete — lost-update):** a `kb/remove` with a stale `expectedRev` → `409`/`conflict`, **nothing
      moved/trashed**; both the note and `.trash` byte-unchanged.
- [ ] **N-14 (delete confirm-gated + audited):** an unconfirmed `kb/remove` is a no-op (nothing moved); a confirmed one
      appends a `kb-delete` audit record (slug + scope + actor) via `appendComment` — and the record carries **no
      filesystem path**.
- [ ] **N-15 (write-guard on delete):** `kb/remove` without X-AIDT / non-loopback Host/Origin / off a non-loopback socket
      → `403`; nothing moved.
- [ ] **N-16 (scope-MOVE contained on BOTH sides):** a `kb/update` that changes scope project→common (and common→project)
      moves the file to the OTHER **server-known** vault only; the destination is realpath-contained; a crafted scope or a
      symlinked destination cannot land the file outside the two vaults; the old location is soft-deleted (recoverable).
- [ ] **N-17 (scope is an enum, not a path):** a `kb/update` supplying `scope:"../x"`, `scope:"/abs"`,
      `scope:"common/../.."`, or `scope:"bogus"` → refused on write; nothing moved/written; **no path detail** in the error.
- [ ] **N-18 (CAS on the MOVE):** a scope-changing `kb/update` with a stale `expectedRev` → `409`/`conflict`, the file
      stays in its original vault byte-unchanged; nothing in the destination vault.

### ADT-248 — read-only ingest / containment / no-scope-widening / connect validation / zero-egress (N-19…N-30)

- [ ] **N-19 (ingest is read-only — external tree byte-identical):** snapshot the connected external dir (recursive file
      list + bytes) before connect; after connect AND after `reindex`, it is **byte-identical** — no file created,
      written, renamed, or deleted under `source.root`. A source-scan finds no write primitive targeting a path under
      `source.root`.
- [ ] **N-20 (symlink-escape skipped — the exfiltration guard):** a symlink inside the connected root pointing OUTSIDE it
      (e.g. → `~/.ssh/id_rsa` or `/etc/passwd`, planted as a fixture with real bytes) is **skipped, never read**; its
      content never enters the index/search results. Removing the per-file realpath check would surface the secret bytes —
      the test must fail then.
- [ ] **N-21 (per-file containment — `..`/absolute cannot escape):** a candidate path using `..`/an absolute path cannot
      make the ingest read a file outside `source.root`; only files realpath-contained to `root` are read.
- [ ] **N-22 (DoS caps enforced):** a tree exceeding the per-file / total-bytes / max-files / max-depth / time-budget caps
      stops scanning at the cap and still returns a usable index (no unbounded read, no hang).
- [ ] **N-23 (binary / VCS / deps skipped):** `.git`, `node_modules`, dotfiles, and binary/non-UTF-8 files are excluded by
      default; the `include` allowlist + `exclude` globs are honored.
- [ ] **N-24 (no scope-widening — connected ≠ authored note):** a connected-source item does **not** appear in any
      project's authored-note recall/list, is **not** written into a vault, and is **not** run through `scopeMatches`; the
      authored-note `scopeMatches` results are identical with and without a connected source (assert the connected row is
      absent from the authored recall).
- [ ] **N-25 (connect validates a real directory):** `kb/source/connect` with a path that is a file, a device, a
      symlink-to-elsewhere, a non-existent path, or a traversal → records **NOTHING** (`sources.json` byte-unchanged); a
      valid directory records its **canonical realpath** as `root`.
- [ ] **N-26 (`sources.json` contained + carries no secret):** the written `sources.json` is inside `.aidevteam/`
      (realpath-contained); it contains no credential/API-key/token field; a symlinked `.aidevteam` escaping the project
      root is refused, not followed.
- [ ] **N-27 (write-guard on `kb/source/*`):** `connect`, `reindex`, and `disconnect` without X-AIDT / non-loopback
      Host/Origin / off a non-loopback socket → `403`; nothing recorded; no ingest run.
- [ ] **N-28 (disconnect removes only the registration):** `kb/source/disconnect` removes the source record only; **no**
      file under the user's connected `source.root` is touched (external tree byte-identical after).
- [ ] **N-29 (zero-egress on every operation):** with no overlay configured, `add/update/remove/ask/connect/reindex/
      disconnect/search` make **zero** outbound network I/O (assert via a network-call spy / no socket opened); no secret
      is read or written on any of them.
- [ ] **N-30 (no exec surface on ingest):** a source-scan over the connect/index path finds **no** `spawn`/
      `child_process`/`exec*`/`eval`/untrusted-deserialization; the no-exec negative holds.

### Cross-cutting render/honesty (N-31…N-35)

- [ ] **N-31 (inert render — note + front-matter, no stored XSS):** a `<script>`/`<img onerror>`/`javascript:` payload in
      a note body, a `stack`/`kind` tag, and a `by:` front-matter value renders as **escaped text** (source-scan: no
      `[innerHTML]`/`bypassSecurityTrust*` on KB content + behavioral non-execution).
- [ ] **N-32 (inert render — source path/label/reason):** the same payload in a source `label`, `path`, or status
      `reason` renders escaped; no execution.
- [ ] **N-33 (front-matter proto-pollution / never-throws):** a note whose front-matter carries
      `__proto__:`/`constructor:`/`prototype:`, a nested-object value, a giant block, and a truncated `---` fence → keys
      dropped (`({}).polluted` undefined after), degrades to defaults, parser **does not throw**.
- [ ] **N-34 (honest indexing):** with no embedder configured, the note method line and every source method label read
      `filename`/`filename-only` (never "semantic"); the selector read touches no secret; no add/edit/connect triggers an
      embedding job.
- [ ] **N-35 (honest privacy copy):** the editor's local-write line, the connect picker copy, and the remove-confirm copy
      carry the ratified strings verbatim from a single source-of-truth; a grep finds **no** strengthened absolute
      ("100% private", "verified secure", "synced to the cloud", "shared with your team").

---

## 6. Gate decisions

**ADT-247 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** K-1…K-7 (§2) + K-15…K-16 (§4), proven by N-1…N-18 + N-31…N-35 (§5).
- **Load-bearing controls:** edit-write containment + atomic in-place write that never follows a symlink (K-1/K-6);
  soft-delete to a contained scan-excluded `.trash` with **no reachable hard `unlink`** (K-3/K-4); the scope-MOVE
  contained on BOTH vault roots (K-7); CAS lost-update refusal on both writers (K-2).
- **Net-new (not free reuse):** `editKbNote`, `deleteKbNote`, the soft-delete + trash containment, the scope-MOVE
  (two roots per call), the CAS forwarding — each carries a proving negative; the per-vault baseline is reused but
  re-proven on each new path.
- **BLOCKED until:** K-1…K-7 + K-15…K-16 ship with N-1…N-18 + N-31…N-35 green and pass `/rev`.

**ADT-248 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** K-8…K-14 (§3) + K-15…K-16 (§4), proven by N-19…N-30 + N-31…N-35 (§5).
- **Load-bearing controls:** read-only ingest (K-10), per-file realpath-containment + symlink-escape-skip + DoS caps
  (K-11), connected-content-never-widens-scope (K-12), connect path validation + `sources.json` containment (K-8),
  zero-egress + no secret + no exec (K-13/K-14).
- **Net-new (not free reuse):** the entire `kb/source/{connect,reindex,disconnect}` surface, `sources.json` + its
  containment, and the read-only contained per-file ingest — each carries a proving negative; the `analyze.js` CAPS +
  `confinedPath` discipline is reused but re-rooted at and re-proven against the external `source.root`.
- **BLOCKED until:** K-8…K-14 + K-15…K-16 ship with N-19…N-30 + N-31…N-35 green and pass `/rev`.

**ADT-249 (SQLite FTS index) — NOT in scope.** No index is approved or required by this pass; the hub stays zero-dep; the
MVP ships no index and that absence is part of the model (K-12/K-13). ADT-249 carries its own HARD SECOPS gate.

**ADT-250 (Canon overlay) — NOT in scope (DEFERRED).** No egress surface is approved by this pass; the slice ships **no**
"Connect Canon" control and **no** secret. Canon's `CANON_API_KEY` env-only handling is gated separately when the adapter
is real.

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-13 · **Status:** APPROVED WITH CONDITIONS
(ADT-247 HARD conditional on K-1…K-7 + K-15…K-16, proven by N-1…N-18 + N-31…N-35; ADT-248 HARD conditional on
K-8…K-14 + K-15…K-16, proven by N-19…N-30 + N-31…N-35) · **Next:** ADT-247/248 → `/be` (`editKbNote` + `deleteKbNote`
soft-delete + scope-MOVE + CAS; the read-only contained source model + ingest) + `/fe` (page, editor drawer, remove
confirm, connect flow over the existing picker) under TDD — must ship the N-tests above → `/rev` verifies each K-condition
in code → `/verify`. Then `/sm` — please update sprint status.
</content>
</invoke>
