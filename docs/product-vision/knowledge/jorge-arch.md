# Architecture — Dedicated Knowledge Page for DART (storage · CRUD · connect-codebase · Canon overlay)

**Lens:** Solution Architect (`/arch`). **Posture:** skeptical + practical. **Binding constraint:** D-009 — *local default stays local-first, dependency-light; everything external is a thin, off-by-default overlay over an existing OSS service. We do not build an engine.*

This is an architecture proposal (boundaries + guardrails), not an implementation. `/secops` owns the hard egress/containment gates called out in §6; `/fe`+`/be` own the code under TDD.

---

## 0. TL;DR — the decisive calls

1. **Files vs SQLite → keep markdown files as the source of truth. Add SQLite ONLY as an optional, rebuildable search/metadata index — and only in the `claude/memory` package, NOT in the zero-dep hub.** The user's "prefer sqlite" is honored where it actually pays off (search/index), and refused where it would cost us the two things the product sells: human-editable git-friendly notes, and a zero-dependency hub. This is a HYBRID, and it is decisive — not a fence-sit. See §1.
2. **CRUD → extend the existing single guarded writer (`addKbNote`) to `editKbNote` + `deleteKbNote`** through the *same* realpath-containment + O_EXCL + CAS-rev chain. No new write path, no bypass. Delete is move-to-trash inside the vault, audited, confirm-gated. See §2.
3. **Connect-external-codebase → a read-only "source" connection record + an honest filename/keyword index by default** (optional embedder later). Never mutate the external tree; containment-pin the connected path; default index method is `filename-only` and labeled as such. See §3.
4. **Canon overlay → a third `SERVICES` provider in the existing `overlay.js`**, config-URL-only, env-key-only, abortable, disclosed egress, off-by-default. Canon is reached by its **`/search` REST** (or its `kb_search` MCP tool) and returns its own cited/obligate context. The local default is unaffected when Canon is absent. See §4.

**Biggest architectural risk:** scope/identity drift between the markdown source of truth and the SQLite index — a note edited/deleted on disk (by hand, by git, by an agent) that the index still serves would silently violate the `scopeMatches` boundary. Mitigation: the index is a **pure cache keyed by file mtime+size+path**, never authoritative, rebuildable from files in one pass, and the read path falls back to the file scan when the index is stale/absent. See §7.

---

## 1. Files vs SQLite — the decision (honest, decisive)

### What exists today (the baseline I must not break)
- Knowledge is **markdown files with YAML-ish front-matter** in two vaults: the project vault (`docs/` → `kb/` → `.aidevteam/kb`, first-existing) and the user-global common vault (`~/.aidevteam/kb-common`). `hub/lib/knowledge.js` parses front-matter (`scope/stack/kind/status`) with a closed vocabulary and never throws; `state.js:buildKnowledge` is the **single scoped projection** (`own ∪ scopeMatches(common)`), and the memory recall path re-implements `scopeMatches` byte-for-byte under a parity test.
- The **hub is genuinely zero-dependency** (`node + fs` only). That is a stated product principle ("zero-dep hub"), not an accident.
- `claude/memory` **already uses `node:sqlite` (built-in, Node ≥ 22.5) + `sqlite-vec` as an *optional* dependency**, degrading to digest-only when the extension is absent (`claude/memory/src/stores/sqlite-vec.ts`). This is the established precedent for where SQLite is allowed to live and how it degrades.

### The three options, weighed for a *local single-user open-source dev tool*

| Criterion | (a) Files only (today) | (b) SQLite primary (user pref) | (c) **Hybrid: files = truth, SQLite = index** |
|---|---|---|---|
| Human-editable | ✅ open any note in an editor | ❌ rows in a binary DB; needs a tool | ✅ files stay primary |
| Git-friendly / diffable / reviewable | ✅ first-class | ❌ binary blob, merge conflicts unmanageable | ✅ files diff; DB is `.gitignore`d |
| CRUD ergonomics | ⚠️ fine for add/edit; list/search is a scan | ✅ structured update/delete | ✅ writes hit files; reads can hit index |
| Search (FTS / metadata filter) | ⚠️ linear scan, no FTS | ✅ FTS5 + indexed columns | ✅ FTS5 over the index |
| Migration cost from current vault | — (none) | **High** — convert + reconcile + keep editable | **Low** — index is *built from* the existing files; no data move |
| Dependency cost to the **hub** | ✅ zero | ❌ adds a native/dep surface to a zero-dep hub | ✅ **zero in the hub** (index lives in `claude/memory`) |
| Dogfood vs Canon (Canon = Postgres) | clean contrast: DART stays file-simple | muddies the "simple local" story | clean: local stays files; structure is an optional cache |
| Failure mode | a bad file degrades to defaults | a corrupt DB = data loss risk | **a corrupt/stale index is discarded and rebuilt from files** |

### Decision

**Keep markdown files as the canonical store. Introduce SQLite only as an OPTIONAL, rebuildable index for search and metadata — and physically locate it in the `claude/memory` package, never in the hub.**

Reasoning, stated plainly:
- The product's differentiators are *human-editable, git-friendly, reviewable* notes and a *zero-dependency hub*. SQLite-as-primary forfeits both for a single-user dev tool whose vault is dozens-to-low-hundreds of notes — a corpus a linear scan handles in milliseconds. We would be buying FTS we don't yet need at the cost of the two things we sell.
- The user's SQLite preference is real and worth honoring **where it pays off**: as the corpus grows, FTS5 + indexed metadata filtering is a genuine win over a linear scan, and it is the natural home for the optional embedder vectors (which `sqlite-vec` already serves in `claude/memory`). The hybrid gives the user SQLite *exactly there* and nowhere it would hurt.
- The hybrid's migration cost is near-zero **because the index is derived, not migrated**: it is `build(files) → rows`, a pure projection of what's already on disk, rebuildable any time, and `.gitignore`d. There is no "convert ADT-234/235 vault into a DB" project — the files stay exactly as they are.
- Failure containment is strictly better: a corrupt index is *thrown away and rebuilt*; a corrupt primary DB is *data loss*.

**Where SQLite lives:** in `claude/memory` (the existing optional package that already depends on `node:sqlite`/`sqlite-vec`). The hub stays zero-dep: `buildKnowledge` continues to scan files and is the authority; an **optional** index, when present and fresh, accelerates *search/Q&A* only. If `claude/memory` (and thus the index) is absent, the hub behaves exactly as today. This mirrors the established degrade-to-digest pattern.

**Migration sizing:** ~zero data migration. The work is additive: (1) an indexer in `claude/memory` that reads the two vaults and populates an FTS5 + metadata table keyed by `path|mtime|size`; (2) a freshness check; (3) a search read path that prefers the index and falls back to the file scan. Estimate: small — one new module + tests in `claude/memory`, no change to the file format, no change to `scopeMatches`, no change to the writers. **Do not** rewrite the vault. **Do not** make the hub depend on SQLite.

> Skeptical note for the record: if someone later argues "just make SQLite primary, it's simpler," the answer is no — it trades away git-diffability and the zero-dep hub for FTS we can get as a cache. Revisit *only* if the vault grows past the point where a file scan is a measured UX problem (thousands of notes), which is not the single-user reality today.

---

## 2. The CRUD backend — extend the one guarded writer, add a safe delete

**Principle:** there is exactly one module that mutates project files (`hub/lib/write.js`) and exactly one knowledge writer (`addKbNote`). CRUD must extend *that* chain — same containment, same atomicity, same CAS — and introduce **no second write path**.

### Add (exists)
`addKbNote(projectDir, {title, body, scope, stack, kind, status})` already: server-validates `scope` as a 2-value enum that *selects* a root (never concatenated into a path), slugifies the title server-side, realpath-contains the parent to the chosen vault, creates with `O_EXCL` (never clobbers), caps the body, emits the front-matter header. Route: `kb/add`. Keep as-is.

### Edit (new — `editKbNote`)
- **Identity:** the server resolves the target by its server-known `name` (slug) + `scope`, exactly as the read projection lists it. The client never supplies a path, directory, or filename — same rule as `addKbNote`'s scope enum.
- **Containment:** realpath the resolved file's parent and confirm `isContained(vaultRoot, parent)` **before** writing — the same gate `addKbNote` uses. A symlinked note escaping the vault is refused.
- **Atomicity + concurrency:** write via the existing atomic tmp+fsync+rename, under the in-process mutex, guarded by **CAS on `rev`** (the overlay-aware `fileRev`) so a stale client edit returns `{conflict:true}` rather than clobbering a concurrent agent edit. This is the same `readModifyWriteLedger`/`writeOverlayCAS` discipline already in the writer.
- **Front-matter:** edit re-emits the server-validated front-matter from the *current* values + the requested body change; `scope` is **not** silently moved by an edit (a scope change is a distinct, explicit operation, because it changes the visibility boundary — keep it out of the body-edit path).
- **Re-validation:** body re-runs `kbBodyError` (UTF-8 text, size cap, no control chars). Title is immutable on edit (changing the title = changing the slug = changing identity → that's add+delete, surfaced honestly, not a silent rename).
- Route: `kb/edit`.

### Delete (new — `deleteKbNote`) — the safety-critical one
- **Identity + containment:** same as edit — resolve by `name`+`scope`, realpath the file, confirm it is **strictly contained** in the chosen vault root (`isContained`, with the trailing-separator sibling-prefix guard already in `write.js`) *before* touching it. A resolution that escapes containment deletes **nothing** and returns an error with no path.
- **Soft delete, not unlink:** move the note to a contained, `.gitignore`d **trash** inside the same vault (`<vault>/.trash/<slug>-<ts>.md`) via atomic rename, rather than a hard `unlink`. Recoverable; survives a fat-finger. The trash is excluded from `readVault`/`buildKnowledge` (it is not a `*.md` under a scanned root — same "inert by location" technique as the `/kai` proposal store).
- **Confirm gate:** delete requires an explicit confirm flag in the request (the cockpit shows a confirm dialog). A delete request without confirmation is a no-op `{ok:false}`.
- **CAS + audit:** under the mutex with CAS-on-`rev`; on success append an audit comment via the existing `appendComment` JSONL (`kind:'kb-delete'`, the slug, scope, actor) — the same audit channel the rest of the workflow uses. The audit records *that* it happened and *what* slug/scope, never a filesystem path.
- Route: `kb/delete`.

### Projection + index follow automatically
`buildKnowledge` re-scans files, so add/edit/delete are reflected on the next read with no extra wiring. The optional SQLite index (when present) keys rows on `path|mtime|size`, so a deleted/edited file is detected as stale and dropped/refreshed on the next freshness pass — the index can never serve a note the file scan no longer sees (this is the §7 risk's primary mitigation).

**No new bypass:** all three of add/edit/delete go through `write.js`'s atomic+contained+CAS chokepoint. The cockpit and the CLI call the same routes; neither writes files directly.

---

## 3. Connect-external-codebase — read-only, contained, honest

**Scope skepticism first:** the realistic local MVP is *"point DART at a folder, let me ask keyword questions over its files."* It is **not** a code-intelligence engine, not an AST indexer, not a live file watcher. Build the smallest honest thing.

### The data model — a "source" connection record
A connection is a small JSON record (not a vault note — it is config, not knowledge), stored per-project under `.aidevteam/` (alongside the existing config), e.g. `sources.json`:
```
{ "id": <server-uuid>,
  "label": <free text, sanitized>,
  "root": <absolute, realpath-resolved, containment-pinned path>,
  "indexMethod": "filename-only",      // honest default; "embeddings" only if an embedder is configured
  "include": ["**/*.md","**/*.ts", …], // bounded allowlist of globs
  "exclude": ["node_modules/**",".git/**", …],  // always excludes VCS + deps + dotfiles
  "addedAt": <iso>, "addedBy": <actor> }
```
- The record is written through the **same guarded writer** (atomic, contained to `.aidevteam/`, CAS). The `root` is stored as a realpath; a `root` that does not resolve to a real directory is refused at connect time.

### The read-only ingest
- **Never mutate the external tree.** The connector opens files **read-only**; it never writes, renames, or deletes under `root`. This is an invariant `/secops` must verify.
- **Path containment on every read:** for every candidate file, realpath it and confirm `isContained(source.root, realpath(file))` before reading — exactly the `isContained` discipline already used for vaults. A symlink inside the connected tree pointing *outside* `root` is skipped, not followed. This stops a connected repo from exfiltrating `~/.ssh` via a planted symlink.
- **Bounded:** enforce include/exclude globs, a per-file size cap, a total-file-count cap, and skip binary/non-UTF-8 files (the same text-shape check `kbBodyError` uses). Always exclude `.git`, `node_modules`, and dotfiles by default.
- **Honest index method:** default is **`filename-only`** (filename + keyword/lexical match over file contents), surfaced with the *same honest grounding label* the Q&A already uses ("Filename/keyword match — no embedder configured, so this is not a semantic understanding check."). A semantic option exists **only** when an embedder is configured, and lives in the **optional `claude/memory` SQLite/sqlite-vec index** — never in the hub. No overclaiming.
- **Where the index lives:** connected-codebase content is **not** copied into the vault and is **not** run through `scopeMatches` (it isn't scoped knowledge — it's an external read surface). If indexed for search, it goes in the optional `claude/memory` SQLite index in its **own table**, tagged by `sourceId`, kept separate from the vault tables so it can never shadow or be confused with authored notes.

### What we explicitly do NOT build in the MVP
File watchers, incremental re-index, language-aware parsing, symbol graphs, git-history mining. Re-index is an explicit user action ("refresh source"). Keep it boring.

---

## 4. The Canon overlay adapter — extend `overlay.js`, don't reinvent it

### The existing seam (what I'm extending)
`hub/lib/overlay.js` is already a generic, contained overlay client with a `SERVICES` registry (`openmemory`, `mem0`). Each provider declares a `credentialEnv` + `residency` + `requiresCredential`. The contract is exactly what we want to reuse:
- URL **only** from `~/.aidevteam/config.json` (`memory.overlayUrl`), validated to http/https with a host, fails closed otherwise. Never derived from note bodies, front-matter, or overlay responses.
- Credential **only** from the declared env var, read at call time, never persisted/logged/echoed.
- Health probe + query are **abortable** (real `AbortController`, time-boxed), `redirect:'error'` (no cross-host redirect), response is **size-bounded + shape-validated** and carried as inert data.
- Off by default; the Q&A (`knowledge-qa.js`) only egresses when an overlay is **configured AND healthy**, and the `egressDisclosed` flag is the single source of truth for disclosure.

### Adding Canon as a provider
Register a third service:
```
canon: { credentialEnv: 'CANON_API_KEY', residency: 'cloud', requiresCredential: true }
```
Two integration shapes, both fitting the existing thin-client contract — recommend **REST first** (simpler, matches the existing fetch-based client):

- **REST (recommended MVP):** Canon exposes `GET /search?q=…&topK=…&spaceIds=…` returning cited hits (`SearchHitDto{docId,title,sourceUrl,content,score, homeSpaceId, sharedFrom}`) and richer obligate/layered context on the MCP shape. The Canon adapter maps `validateOverlayResponse`'s `{answer, matches:[{title,score}]}` onto Canon's hits (title = hit title, score = retrievalScore; an optional `answer` synthesized from top hits or left empty so the local tier still labels honestly). Auth is `Authorization: Bearer <CANON_API_KEY>` — **already exactly what `authHeaders` sends.** Egress body stays the existing minimal `{query, context, project}`, where `project` (DART's scopeKey, a basename) can map to Canon's `project_slug`/`spaceIds` hint.
- **MCP (later / enterprise):** Canon also serves a governed **MCP** surface (`kb_search`, `kb_search` + obligate, `get_document`, `list_spaces`) over **Streamable HTTP at `/mcp`** (opt-in, default-off) with the same Bearer-API-key principal. If/when DART speaks MCP client-side, the same provider record points at the MCP endpoint instead. The adapter seam is identical; only the transport/marshalling differs. Keep this as a documented extension, not MVP scope.

### What does NOT change (the load-bearing guarantees)
- **Local default is untouched.** With no `canon` overlay configured, nothing reaches Canon; the file-vault + lexical tier is the whole system. The OSS local default **must not depend on Canon** — Canon is one optional provider alongside `openmemory`/`mem0`, selected by config.
- **Egress stays disclosed + gated.** Canon answers ride the same `grounding.external = true`, `residency`, `egressDisclosed = true` path the Q&A already renders. A Canon query egresses **only** the existing minimal context (in-scope matching note *titles*, never bodies, never proposals, never out-of-scope notes, never a secret).
- **Canon's identifiers stay on Canon's side.** Canon's internal `kb.*`/`KB_*` identifiers and `space`/`obligate` concepts are *not* leaked into DART's local model; the adapter maps Canon hits → DART's existing `{name, scope:'overlay', score}` match shape. DART never adopts Canon's schema.

This is the Strangler/Anti-Corruption-Layer posture: Canon is reached only through the narrow, validated overlay seam; DART's local model is insulated from Canon's domain.

---

## 5. How the pieces compose (one projection, one writer, optional accelerators)

```
                 ┌────────────────────────── hub (ZERO-DEP) ──────────────────────────┐
  cockpit ─────▶ │  read:  buildKnowledge(project) = own vault ∪ scopeMatches(common)  │
  /dart CLI      │         (THE authority — file scan, never throws)                   │
                 │  write: write.js → addKbNote / editKbNote / deleteKbNote            │
                 │         (atomic + realpath-contained + O_EXCL + CAS-rev + audit)    │
                 │  Q&A:   knowledge-qa.ask() — local lexical tier, always on          │
                 └───────────────┬───────────────────────────┬────────────────────────┘
                                 │ (optional, off by default) │ (optional, absent ⇒ same as today)
                     overlay.js  ▼                            ▼  claude/memory (node:sqlite)
            ┌──────────────────────────────┐      ┌────────────────────────────────────────┐
            │ providers: openmemory | mem0 │      │ SQLite FTS5/metadata INDEX (cache only) │
            │            | CANON  ◀── new   │      │  + sqlite-vec embeddings (optional)     │
            │ config-URL-only, env-key-only │      │  vault table  +  connected-source table │
            │ abortable, disclosed egress   │      │  keyed by path|mtime|size, rebuildable  │
            └──────────────────────────────┘      └────────────────────────────────────────┘
```
- **Files are the single source of truth.** Index and overlays are *accelerators/extensions*; remove either and the system still works exactly as today.
- **One projection (`buildKnowledge`), one writer (`write.js`), one scope predicate (`scopeMatches`).** Nothing here adds a second one.

---

## 6. What `/secops` must hard-verify (gate items)

1. **CRUD delete containment + guard.** `deleteKbNote` resolves by `name`+`scope` (never a client path), realpaths the target, and refuses anything not strictly contained in the chosen vault (sibling-prefix guard intact). Soft-delete to a contained, scan-excluded trash; confirm-gated; CAS on `rev`; audited via `appendComment`. No hard `unlink` reachable from the API. No second write path.
2. **CRUD edit guard.** Same containment + CAS; body re-validated (UTF-8 text, size cap, control chars); scope/title not silently mutated by an edit; symlinked-out note refused.
3. **Connect-codebase read-only + path containment.** Connector never writes under `source.root`. Every file read is realpath-contained to `source.root`; symlinks escaping `root` are skipped, not followed. Default-exclude `.git`/`node_modules`/dotfiles; per-file size cap + total-count cap; binary/non-UTF-8 skipped. The `root` is realpath-pinned at connect time.
4. **Canon egress.** URL config-only + http/https-validated + fails closed; `CANON_API_KEY` env-only, never persisted/logged/echoed; abortable + `redirect:'error'`; response size-bounded + shape-validated + inert; egress body limited to the existing minimal `{query, context(=in-scope titles only), project}`; `egressDisclosed` gated on configured-AND-healthy; off by default. No note bodies, no proposals, no out-of-scope notes leave.
5. **Secrets env-only, everywhere.** No credential (overlay or Canon) is ever written to `config.json`, `sources.json`, the index DB, a log, or an error body.
6. **Index cannot widen scope.** The optional SQLite index is a cache keyed by `path|mtime|size`; it is never authoritative; a stale/missing/corrupt index is discarded and the file scan answers. The index must never surface a note the file-scan `scopeMatches` would exclude (connected-source rows live in a separate table, never merged into vault scope).
7. **No-egress invariant for the local default.** With no overlay configured, `add/edit/delete/ask/connect/search` perform **zero** outbound network I/O.

---

## 7. Risks, sensitivity points, trade-offs (ATAM-style)

| # | Risk | Severity | Mitigation |
|---|------|----------|-----------|
| R1 | **Index↔file drift** — index serves an edited/deleted/hand-moved note the file scan no longer sees → silent scope violation. *(biggest risk)* | High | Index is a non-authoritative cache keyed by `path|mtime|size`; freshness-checked; file scan is the authority and the fallback; rebuildable in one pass; connected-source rows kept in a separate table from vault rows. |
| R2 | **Delete data loss** (fat-finger / wrong scope). | High | Soft-delete to contained scan-excluded trash (not `unlink`); confirm-gated; audited; recoverable. |
| R3 | **Codebase-connect path traversal / symlink exfiltration** (connected repo plants a symlink to `~/.ssh`). | High | realpath + `isContained(source.root, …)` on every file; symlinks escaping `root` skipped; default-exclude dotfiles/VCS/deps. Read-only — never writes the external tree. |
| R4 | **Canon egress leaks** beyond minimal context, or local default starts depending on Canon. | High | Reuse the proven `overlay.js` containment; Canon is one optional provider; egress body unchanged (titles only); disclosed + health-gated + off by default. |
| R5 | **Scope-creep into a code-intelligence engine** for connect-codebase. | Medium | MVP = filename/keyword, explicit refresh, no watcher/AST/symbols. Semantic is opt-in via the existing optional embedder only. |
| R6 | **SQLite pulled into the hub**, breaking the zero-dep guarantee. | Medium | Architectural boundary: SQLite lives ONLY in `claude/memory`; the hub stays `node+fs`; absence of the index = today's behavior. Enforce with a dependency/arch test. |
| R7 | **Title/slug identity confusion** on edit (rename ≠ edit). | Low | Title immutable on edit; a rename is add+delete, surfaced honestly. |

**Non-risks (safe by construction):** the local-first default is unaffected (files remain the authority; index/overlay are removable accelerators); the scope boundary stays the single `scopeMatches` predicate (no second predicate introduced); the writers keep their atomic+contained+CAS discipline; Canon is reached only through the narrow validated overlay seam (ACL), so Canon's schema never infects DART's model.

**Sensitivity point:** the `path|mtime|size` cache key is the contract that keeps the index honest — it must be derived identically wherever the index is built and queried (a one-byte divergence serves a stale note). If the index is ever re-implemented elsewhere, lock the key derivation with a parity test, mirroring the existing `scopeMatches` parity test.

---

## 8. ADR summary

- **ADR-1 (storage):** *Accepted* — markdown files remain canonical; SQLite is an optional, rebuildable search/metadata index in `claude/memory` only; hub stays zero-dep. Rejected: SQLite-as-primary (forfeits git-diffability + zero-dep hub for FTS we can get as a cache; non-trivial migration; worse failure mode).
- **ADR-2 (CRUD):** *Accepted* — extend the single guarded writer with `editKbNote`/`deleteKbNote`; soft-delete to contained trash, confirm-gated, CAS-guarded, audited; no new write path.
- **ADR-3 (connect-codebase):** *Accepted* — read-only "source" record + containment-pinned, filename/keyword ingest by default; content indexed (if at all) in a separate optional-SQLite table, never merged into vault scope; no watcher/AST in MVP.
- **ADR-4 (Canon overlay):** *Accepted* — Canon as a third `overlay.js` provider (`CANON_API_KEY`, REST `/search` MVP, MCP `/mcp` later), config-URL-only, disclosed egress, off by default; local default independent of Canon.

**Gate:** `ARCH_APPROVED` recommended **conditional on** `/secops` verifying §6 (delete containment, codebase read-only + path containment, Canon egress, secrets env-only, index-cannot-widen-scope, no-egress local default).
