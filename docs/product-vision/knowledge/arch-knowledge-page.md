# ADR — Knowledge Page + CRUD (ADT-247) & Connect-an-External-Codebase (ADT-248)

**Lens:** Solution Architect (`/arch`, Jorge). **Status:** **ARCH_APPROVED — conditional** on `/secops` verifying the hard-verify list in §6.
**Sprint:** sprint-13-knowledge-page. **Branch:** `feat/dart-knowledge-page`. **Date:** 2026-06-13.
**Ratifies:** `jorge-arch.md` (the investigation), `DECISIONS.md` (D-K01..K10), `KNOWLEDGE-BUILD-SPEC.md` (the `/aura` build spec).
**Binding constraint (D-009):** the local default stays local-first and dependency-light; everything external is a thin, off-by-default overlay over an existing OSS service. We do not build an engine.

This ADR confirms boundaries + guardrails + the wire contracts. It is not an implementation. `/secops` owns the hard egress/containment gate (§6). `/fe`+`/be` own the code under TDD.

---

## 0. Scope of this approval

| Ticket | Scope | This ADR |
|---|---|---|
| **ADT-247** | Knowledge page + full CRUD (add exists; **edit + soft-delete are new**) over the merged `KnowledgeView`; storage stays files. | **APPROVED** (conditional, §6) |
| **ADT-248** | Connect-an-external-codebase: read-only, realpath-contained source record + honest filename/keyword index; never merged into vault scope. | **APPROVED** (conditional, §6) |
| ADT-249 | Optional SQLite FTS index in `claude/memory` (node:sqlite), derived/gitignored/rebuildable, non-authoritative. | **Noted — SHOULD/later. NOT gated here.** Design is forward-compatible (§1, §3). |
| ADT-250 | Canon governed-KB overlay (a third `overlay.js` provider). | **Noted — DEFERRED. NOT gated here.** Seam confirmed; ships NO control (§4). |

---

## 1. Storage — HYBRID, confirmed (ADR-1, D-K01/D-K02)

**Decision (ratified):** markdown files are the **canonical** store; **for the MVP (ADT-247/248) the system is files + the existing file-scan projection** (`state.js:buildKnowledge`). The SQLite FTS/metadata index is **ADT-249 only** — optional, derived, gitignored, rebuildable, non-authoritative, keyed by `path|mtime|size`, and physically resident **only in the optional `claude/memory` package** (which already depends on `node:sqlite` and degrades to digest-only). **It is NOT part of this MVP.**

- **The hub stays zero-dependency (`node + fs`) for the MVP.** No SQLite, no native addon, no new runtime dep enters `hub/`. Absent index ⇒ exactly today's file-scan behaviour. This is an architectural boundary, not a preference: SQLite is permitted to live **only** in `claude/memory` (enforce with an arch/dependency test when ADT-249 lands).
- **Why files-canonical wins** (settled, not a fence-sit): the product sells human-editable + git-diffable notes and a zero-dep hub. SQLite-as-truth forfeits both for FTS we can get as a *cache*; the corpus (dozens-to-low-hundreds of notes) is answered by a linear scan in milliseconds today. Failure containment is strictly better: a corrupt index is discarded + rebuilt from files; a corrupt primary DB is data loss.
- **Forward-compatibility for ADT-249 (designed now, built later):** the read path's authority is `buildKnowledge` (the file scan) and the **`KnowledgeView` shape is unchanged**; any future index is a *prefer-if-fresh-else-fall-back-to-scan* accelerator behind that same view. The `path|mtime|size` key is the honesty contract — if the index is ever re-implemented elsewhere, lock the key derivation with a parity test mirroring the existing `scopeMatches` parity test. Connected-source rows (ADT-248) land in a **separate table** from vault rows so the index can never shadow an authored note (see §3, §6).

**Biggest architectural risk (carried):** index↔file drift serving a note the scan no longer sees → a silent `scopeMatches` boundary violation. Fully mitigated by the cache-key + scan-authority + separate-table design. It does not arise in the MVP at all because the MVP ships no index.

---

## 2. CRUD writers (ADT-247) — extend the ONE guarded writer (ADR-2, D-K05/D-K06/D-K07)

**Principle:** exactly one module mutates project files (`hub/lib/write.js`); exactly one knowledge writer chain exists (`addKbNote`). Edit and delete **extend that chain** — same `resolveKbDir`/`resolveCommonKbDir` → realpath-containment (`isContained`, with the trailing-separator sibling-prefix guard) → `writeNewFileExclusive` (`O_EXCL`, never clobbers/truncates/follows a symlink) where creating → atomic tmp+fsync+rename → in-process `withLock` mutex → **CAS on the overlay-aware `rev`**. **No second write path.** The cockpit and the CLI call the same routes; neither writes files directly.

### `editKbNote` (new)
- **Identity:** server resolves the target by its server-known `id`/`name` (slug) + `scope` exactly as the read projection lists it. **The client never supplies a path, directory, or filename** — the same rule `addKbNote`'s scope enum enforces.
- **Containment:** realpath the resolved file's parent and confirm `isContained(vaultRoot, parent)` **before** writing. A symlinked note escaping the vault is refused (no write, no path leaked).
- **Re-validation:** body re-runs `kbBodyError` (non-empty, UTF-8 text, size cap `MAX_KB_BODY`, no NUL/C0 control chars). Front-matter is re-emitted server-side from the current+requested validated values.
- **Title immutable on edit:** changing the title changes the slug = changes identity = add+delete, surfaced honestly — never a silent rename.
- **Scope change = an authorization-boundary MOVE (D-K05):** a scope change is **not** a body edit; it **moves the file across vaults** (project vault ↔ contained common vault). The move is performed by the server through the **same** guarded, contained, CAS-checked path; it must be **realpath-contained on BOTH the source vault and the destination vault** (a project note can never land outside the contained vaults; common-side containment is the existing `containedCommonVaultDir` user-home gate). The UI **discloses the move inline before save** ("Moving from Project to Common") so a re-scope is never silent (an over-share guard). Old-location removal uses the same soft-delete discipline (§ delete) so a mis-scope is recoverable.
- **Concurrency:** CAS on `expectedRev`; a stale client edit returns **409 → `conflict`** carrying fresh state, never a clobber.

### `deleteKbNote` (new — the safety-critical one)
- **Identity + containment:** resolve by `id`/`name` + `scope`; realpath the file; confirm it is **strictly contained** in the chosen vault root **before** touching it. A resolution that escapes containment deletes **nothing** and returns an error with no path.
- **SOFT-delete, NOT `unlink` (D-K06):** move the note via **atomic rename** into a contained, gitignored, **scan-excluded** trash inside the same vault — `<vault>/.trash/<slug>-<ts>.md`. Recoverable; survives a fat-finger. *Scan-exclusion is structural and already guaranteed:* `readVault` does a single non-recursive `readdirSync(dir).filter(f => f.endsWith('.md'))` at the vault top level — the `.trash` directory entry is not a `*.md` file and is never recursed into, so a trashed note disappears from `buildKnowledge` on the next read with no extra wiring (the same "inert by location" technique as the `/kai` proposal store). The trash target must itself be realpath-contained to the vault (it cannot escape).
- **Confirm-gated:** delete requires an explicit confirm in the request (the cockpit shows a confirm dialog, Cancel holding initial focus). A delete request without confirmation is a no-op.
- **CAS + audit:** under the mutex with CAS-on-`rev`; on success append an audit record via the existing `appendComment` JSONL (`kind:'kb-delete'`, slug, scope, actor). The audit records *that* it happened and *what* slug/scope — **never a filesystem path**.
- **No hard `unlink` reachable from the API.**

### Projection follows automatically
`buildKnowledge` re-scans files, so add/edit/delete/move are reflected on the next read with no extra wiring; the `.trash/` is never scanned. (When ADT-249 ships, its `path|mtime|size` freshness check drops/refreshes the stale row; the MVP has no index to keep in sync.)

### Route contract (ratified wire names — `/be` + `/fe` MUST agree)
| Route | Request | Behaviour | Conflict |
|---|---|---|---|
| `kb/add` *(exists, unchanged)* | `{ title, body, scope, stack, kind }` | additive; no `expectedRev` | — |
| **`kb/update`** | `{ id\|file, title, body, scope, stack, kind, expectedRev }` | guarded CAS write through `editKbNote`; re-validates (same caps as add); **scope change ⇒ vault MOVE** (contained both sides); title immutable; returns fresh `state` (new `rev`) | **409** on stale `rev` → `ok:'conflict'` with fresh state |
| **`kb/remove`** | `{ id\|file, expectedRev }` (server-side confirm-gated) | guarded CAS **soft-delete** to contained scan-excluded `.trash`, audited; returns fresh `state` | **409** on stale `rev` → `ok:'conflict'` with fresh state |

Both ride the existing one `ControlPlaneService.mutate()` 409-decode chokepoint (decodes 409 → `conflict` with fresh state). `expectedRev = state.rev` on every call. **The conflict branch is a first-class outcome, not an error toast** — re-fill the drawer / hold the confirm from the fresh `state`, then re-derive. Build the conflict path test first (carries R2: a lost-update silently destroys a rule the agents obey — the exact failure DART exists to prevent).

---

## 3. Connect-external-codebase (ADT-248) — read-only, contained, honest (ADR-3, D-K08)

**Scope skepticism (held):** the MVP is *"point DART at a local folder, ask keyword questions over its files."* It is **not** a code-intelligence engine — no AST, no symbol graph, no file watcher, no incremental re-index, no git-history mining. Re-index is an explicit user action. Build the smallest honest thing.

### The data model — a read-only "source" record
A connection is a small JSON **config** record (not a vault note — it is configuration, not knowledge), stored per-project under `.aidevteam/sources.json`, written through the **same guarded writer** (atomic, contained to `.aidevteam/`, CAS):
```
{ "id": <server-assigned id>,
  "label": <free text, sanitized>,
  "root": <absolute, realpath-resolved, containment-pinned directory>,
  "indexMethod": "filename-only",            // honest default; "embeddings" only when an embedder is configured (ADT-249)
  "include": ["**/*.md","**/*.ts", …],       // bounded allowlist of globs
  "exclude": ["node_modules/**",".git/**", …],// always excludes VCS + deps + dotfiles
  "status": <"indexing"|"ready"|"error">, "freshness": <iso>,
  "addedAt": <iso>, "addedBy": <actor> }
```
At **connect** time the server realpath-validates that `path` resolves to a **real directory** (not a file, device, or symlink-to-elsewhere), and records the **canonical realpath** as `root`. A `path` that does not resolve to a real directory is refused — nothing is recorded. `sources.json` itself is contained to `.aidevteam/` and carries **no secret** (none exist in this MVP).

### The read-only ingest (reuse `analyze.js`'s proven discipline)
- **Never mutates the external tree** — opens files **read-only**; never writes/renames/deletes/creates under `root`. An invariant `/secops` verifies.
- **Per-file realpath-containment to `source.root`** — for every candidate file, realpath it and confirm `isContained(source.root, realpath(file))` **before** reading (the same `confinedPath`/`isContained` discipline `analyze.js` already uses for the stack scan). A symlink inside the connected tree pointing **outside** `root` is **skipped, not followed** — this is the exfiltration guard (a planted symlink to `~/.ssh` is never read).
- **Bounded (reuse `analyze.js` CAPS):** per-file byte cap, total-bytes cap, max-files cap, max-depth, wall-clock time budget; skip binary/non-UTF-8 files (the same text-shape check `kbBodyError`/`confinedRead` use). **Always exclude** `.git`, `node_modules`, and dotfiles by default, plus the source's `exclude` globs; honor the `include` allowlist.
- **Honest index method:** default **`filename-only`** (filename + lexical/keyword match over file contents), surfaced with the **same honest grounding label** the Q&A already uses (*"Filename/keyword match — no embedder configured, so this is not a semantic understanding check."*). A semantic option exists **only** when an embedder is configured, and lives in the optional `claude/memory` SQLite/sqlite-vec index (ADT-249) — **never** in the hub. No overclaiming.

### The containment boundary that matters most
Connected-codebase content is a **SEPARATE projection facet — NEVER merged into the authored-note vault scope.** It is **not** copied into a vault, **not** written through `addKbNote`, and **not** run through `scopeMatches` (it is an external *read surface*, not scoped knowledge). The authored-note `scopeMatches` authority is **completely unaffected** by ADT-248. When indexed (ADT-249 only), connected content goes in its **own table** tagged by `sourceId`, kept separate from vault tables so it can never shadow, widen, or be confused with an authored note, and can **never inject into recall as if it were an authored note**.

### Route contract (ratified)
| Route | Request | Behaviour |
|---|---|---|
| **`kb/source/connect`** | `{ path, globs?, expectedRev }` | realpath-validate `path` is a real dir → record realpath-pinned read-only source (server assigns `id`); start (read-only, contained, bounded) indexing; returns fresh `state` |
| **`kb/source/reindex`** | `{ sourceId, expectedRev }` | re-run the read-only contained ingest for that source; returns fresh `state` |
| **`kb/source/disconnect`** | `{ sourceId, expectedRev }` | remove the **registration** only — **never** touches the user's files; returns fresh `state` |

All three are **guarded** (the existing control-plane write guard: `X-AIDT` header + loopback Host + same-origin + loopback socket) and CAS on `expectedRev` (409 → `conflict`). **`/secops` hard-gates `kb/source/*`** — it registers filesystem paths and is the read surface. The FE **reuses the existing `dart-folder-picker` over `/api/fs/*`** (read-only directory browser rooted at realpath($HOME)); **build no new picker.** Connected `state.knowledge.sources` drives the sources strip (label · path · status/freshness · honest index method · re-index · disconnect).

---

## 4. Canon seam (ADT-250) — noted only, ships NOTHING here (ADR-4, D-K03/D-K04)

Confirmed as a **deferred seam**, not a feature in this MVP:
- Canon is designed to land later as a **third provider in the existing `hub/lib/overlay.js`** `SERVICES` registry (alongside `openmemory`/`mem0`): `canon: { credentialEnv:'CANON_API_KEY', residency:'cloud', requiresCredential:true }`, REST `/search` first (MCP `/mcp` later). It reuses the proven overlay contract verbatim — config-URL-only (http/https-validated, fails closed), env-key-only, abortable, `redirect:'error'`, response size-bounded + shape-validated + inert, disclosed egress via the existing `egressDisclosed`/`residency` fields, off by default.
- **The MVP designs the sources/overlay projection so an external overlay COULD appear** (the connected-sources strip + the existing Q&A egress-honesty fields are the seam), but **ships NO "Connect Canon" control** — a dead control that promises a capability the backend cannot honour is the anti-pattern to avoid. Lighting Canon up later is a backend wiring change, not a UI rebuild.
- **Local-default egress = ZERO without Canon (confirmed).** With no overlay configured, every operation (`add/update/remove/ask/source connect/reindex/disconnect/search`) performs **zero** outbound network I/O. The OSS local default does **not** depend on Canon. The `CANON_API_KEY` is env-only when ADT-250 lands; no secret exists in the MVP.

This is the Strangler/Anti-Corruption-Layer posture: Canon is reached only through the narrow validated overlay seam; DART's local model is insulated from Canon's schema. **Not gated by this ADR.**

---

## 5. How the pieces compose (one projection, one writer, optional accelerators)

```
                 ┌────────────────────────── hub (ZERO-DEP, MVP) ─────────────────────────┐
  cockpit ─────▶ │  read:  buildKnowledge(project) = own vault ∪ scopeMatches(common)      │
  /dart CLI      │         (THE authority — file scan, never throws)                       │
                 │  write: write.js → addKbNote / editKbNote / deleteKbNote                │
                 │         (atomic + realpath-contained + O_EXCL-where-creating + CAS + audit)
                 │         scope-change = contained vault MOVE (both sides) · delete = soft │
                 │  sources: .aidevteam/sources.json (read-only, contained, separate facet) │
                 │  Q&A:   knowledge-qa.ask() — local lexical tier, always on, zero-egress  │
                 └───────────────┬───────────────────────────────┬───────────────────────┘
                  (DEFERRED 250)  │ off by default                 │ (SHOULD 249, absent ⇒ today)
                      overlay.js  ▼                                ▼  claude/memory (node:sqlite)
            ┌──────────────────────────────┐          ┌────────────────────────────────────────┐
            │ providers: openmemory | mem0 │          │ SQLite FTS5/metadata INDEX (cache only) │
            │            | CANON  ◀── later │          │  vault table  +  SEPARATE source table  │
            └──────────────────────────────┘          │  keyed path|mtime|size, rebuildable     │
                                                       └────────────────────────────────────────┘
```
Files are the single source of truth. The index (249) and overlays (250) are removable accelerators/extensions — remove either and the system behaves exactly as the MVP. One projection (`buildKnowledge`), one writer (`write.js`), one scope predicate (`scopeMatches`). Nothing here adds a second one.

---

## 6. What `/secops` MUST hard-verify (the precise gate list)

`ARCH_APPROVED` is granted **conditional on `/secops` confirming all of the following** (`SECOPS_APPROVED`, hard, safety-override). Each maps to a verifiable invariant:

1. **edit/delete inherit ALL `addKbNote` conditions.** `editKbNote` + `deleteKbNote` go through the same chain: realpath-containment (`isContained`, sibling-prefix guard) to the chosen vault **before** any write; `O_EXCL`/`writeNewFileExclusive` where creating (never clobbers/truncates/follows a symlink); body re-validated (non-empty, UTF-8 text, size cap, no NUL/C0 controls); server-derived slug (client never supplies a path/dir/filename); the control-plane write-guard 403s a non-loopback/cross-site/header-less request; errors leak **no** path or stack. **No second write path.**
2. **Soft-delete is contained + scan-excluded + cannot escape the vault.** Delete is an atomic rename to `<vault>/.trash/…` that is itself realpath-contained to the vault; the `.trash` is excluded from `readVault`/`buildKnowledge` (non-recursive `*.md`-only scan); **no hard `unlink` is reachable from the API**; a resolution escaping containment deletes nothing; the action is confirm-gated and audited via `appendComment` (slug/scope/actor, **no path**).
3. **The scope-change MOVE is contained on BOTH source and destination vault.** A `kb/update` scope change moves the file through the same guarded/contained/CAS path; the destination is realpath-contained (project vault ↔ `containedCommonVaultDir` user-home gate); a project note **cannot** be moved outside the contained vaults; the old-location removal uses the soft-delete discipline; the move respects the same authorization boundary `scopeMatches` enforces.
4. **CAS prevents lost-update on both writes.** `kb/update` and `kb/remove` refuse a stale `expectedRev` with **409**/`conflict` and write nothing — no optimistic clobber of a concurrent agent/session edit (R2).
5. **Codebase ingest is READ-ONLY.** The connector never writes/renames/deletes/creates under `source.root` (verify there is no write call on the ingest path).
6. **Ingest is realpath-contained per file + symlink-escape skipped + bounded.** Every file is realpath-checked `isContained(source.root, realpath(file))` before read; a symlink escaping `root` is **skipped, not followed** (no `~/.ssh` exfiltration); per-file + total-bytes + max-files + max-depth + time-budget caps applied (reuse `analyze.js` CAPS); binary/non-UTF-8 skipped; `.git`/`node_modules`/dotfiles excluded by default.
7. **Connected content never widens authored-note scope / never injects into recall as an authored note.** Connected content is a separate facet — not copied into a vault, not written via `addKbNote`, not run through `scopeMatches`; (when ADT-249 ships) it lives in a separate `sourceId`-tagged table that can never shadow a vault row. `scopeMatches` authority is unaffected by ADT-248.
8. **Connect path validation + `sources.json` containment.** `kb/source/connect` realpath-validates `path` is a **real directory** (not a file/device, no traversal in the recorded root) and records the **canonical** realpath; a non-directory/unresolvable path records nothing; `sources.json` is itself contained to `.aidevteam/`.
9. **Secrets env-only; ZERO-egress local default.** No credential is ever written to `config.json`, `sources.json`, the index DB, a log, or an error body. With no overlay configured, `add/update/remove/ask/connect/reindex/disconnect/search` perform **zero** outbound network I/O. (Canon's `CANON_API_KEY` is env-only when ADT-250 lands; no secret exists in the MVP.)
10. **All note + codebase content is rendered escaped (FE) and stored inert.** Untrusted note bodies and connected-file text are escaped on render (no HTML/script execution) and never interpreted as control input (front-matter parsing stays the bounded, never-throwing, defaults-on-hostile-input reader).

---

## 7. Risks, sensitivity points, trade-offs (ATAM-style)

| # | Risk | Severity | Mitigation | MVP-relevant? |
|---|------|----------|-----------|---|
| R1 | Index↔file drift serves a stale/edited/deleted note → silent `scopeMatches` violation. | High | Index is a non-authoritative cache keyed `path\|mtime\|size`; file scan is authority + fallback; rebuildable; source rows in a separate table. | **No** — MVP ships no index; arises only in ADT-249. |
| R2 | Delete data loss (fat-finger / wrong scope). | High | Soft-delete to contained scan-excluded `.trash` (not `unlink`); confirm-gated; CAS; audited; recoverable. | **Yes** |
| R2b | Lost-update: two sessions/an agent edit/delete the same note. | High | CAS on `expectedRev` → 409/`conflict` first-class (reconcile from fresh state, conflict-path test first). | **Yes** |
| R3 | Codebase-connect path traversal / symlink exfiltration. | High | realpath + `isContained(source.root,…)` per file; escaping symlinks skipped; dotfiles/VCS/deps excluded; read-only — never writes the external tree. | **Yes** |
| R3b | Mis-scope over-share via a silent re-scope move. | High | Scope change = an explicit, disclosed, contained-both-sides vault move; CAS; old location soft-deleted (recoverable). | **Yes** |
| R4 | Canon egress leaks beyond minimal context / local default depends on Canon. | High | Reuse proven `overlay.js`; one optional provider; disclosed + health-gated + off by default; titles-only egress body. | **No** — DEFERRED; not in MVP. |
| R5 | Scope-creep into a code-intelligence engine. | Medium | MVP = filename/keyword, explicit refresh, no watcher/AST/symbols. | **Yes** |
| R6 | SQLite pulled into the hub, breaking zero-dep. | Medium | Boundary: SQLite lives ONLY in `claude/memory`; hub stays `node+fs`; absence = today's behaviour; enforce with an arch test in ADT-249. | **Yes (boundary held in MVP)** |
| R7 | Title/slug identity confusion on edit (rename ≠ edit). | Low | Title immutable on edit; a rename is add+delete, surfaced honestly. | **Yes** |

**Non-risks (safe by construction):** the local-first default is unaffected (files remain authority; index/overlay are removable); the scope boundary stays the single `scopeMatches` predicate (no second predicate introduced; connect adds a separate facet, not a scope); the writers keep their atomic+contained+CAS discipline; Canon is reached only through the narrow validated overlay seam (ACL), so Canon's schema never infects DART's model.

**Sensitivity point:** the `path|mtime|size` cache key (ADT-249) is the contract that keeps a future index honest — derive it identically wherever built/queried; lock with a parity test, mirroring the `scopeMatches` parity test. Not exercised in the MVP.

---

## 8. ADR summary + gate

- **ADR-1 (storage):** *Accepted* — markdown files canonical; the MVP is files + the file-scan projection; the hub stays zero-dep; SQLite is ADT-249 only (optional, derived, rebuildable, in `claude/memory`). Rejected: SQLite-as-primary.
- **ADR-2 (CRUD):** *Accepted* — extend the one guarded writer with `editKbNote`/`deleteKbNote`; soft-delete to contained scan-excluded `.trash` (confirm-gated, CAS, audited); scope change = a disclosed, contained-both-sides vault move; title immutable; no new write path. Routes `kb/update` / `kb/remove`, CAS + 409.
- **ADR-3 (connect-codebase):** *Accepted* — read-only `.aidevteam/sources.json` source record, realpath-pinned root; read-only + per-file realpath-contained + bounded ingest (reuse `analyze.js` CAPS); honest `filename-only` method; a separate facet never merged into vault scope / `scopeMatches`. Routes `kb/source/{connect,reindex,disconnect}`, guarded + CAS. No watcher/AST in MVP.
- **ADR-4 (Canon overlay):** *Noted / DEFERRED* — a third `overlay.js` provider later; the MVP designs the seam but ships NO control; local default zero-egress without it. Not gated here.

**Gate decision:** **`ARCH_APPROVED` for ADT-247 + ADT-248 — PASSED, conditional on `/secops` verifying §6** (the ten hard-verify items). ADT-249 noted as SHOULD/later; ADT-250 noted as DEFERRED — neither is gated by this ADR. Next: `/secops` runs `SECOPS_APPROVED` against §6; `/ui` signs `DESIGN_APPROVED` against the locked `/aura` spec; then the `APPROVAL_GATE` before implementation.
