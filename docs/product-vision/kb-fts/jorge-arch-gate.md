# /arch ARCHITECTURE Gate — ADT-249: Optional SQLite FTS index for the Knowledge vault

**Ticket:** ADT-249 (HARD arch gate) · **Track:** full · **Priority:** SHOULD (fast-follow accelerator)
**Architect:** Jorge (/arch) · **Date:** 2026-06-13
**Binding inputs:** `docs/product-vision/knowledge/DECISIONS.md` D-K01, D-K02 (locked)

---

## DECISION: APPROVED-WITH-CONDITIONS

The feature is a sound, bounded accelerator that honours every locked invariant. It is **not** a rebuild — it adds one derived table family to the *existing* `memory.db` and one optional, lazily-required bridge the hub may consult. Approval is conditioned on the items in **§7 Conditions**; the load-bearing ones are: the bridge degrades silently and additively (never replaces the file scan, only re-ranks within it), the scope boundary is enforced at QUERY time using the SAME predicate as the hub (no second source of truth), and a `.trash` note is structurally unindexable.

This is a hard gate. SECOPS_APPROVED is a parallel hard gate (scope-widening at query time, an external read surface, and a new on-disk index are security-relevant); this decision does not substitute for it.

---

## 1. What this is and is NOT (scope discipline)

- **IS:** a lexical (BM25/FTS5) accelerator over note **bodies**, so search/recall ranks on full text instead of today's filename + 160-char excerpt. Derived, gitignored, rebuildable, non-authoritative.
- **IS NOT:** a new store technology (reuse `node:sqlite` + the existing `memory.db`), a new embeddings path (FTS5 is lexical — **no vectors, no Voyage/Gemini, no egress**), a hub dependency (hub stays zero-dep), or the source of truth (markdown files remain canonical per D-K01).

**Smallest-change ruling:** extend the existing `claude/memory` sqlite database with FTS5 virtual tables. Do **not** add a new store module class, a new db file, or a per-project db. FTS5 is bundled in SQLite — **no new npm dependency** (unlike sqlite-vec, which is an optional native extension). One module `src/stores/kb-fts.ts` owns the table lifecycle; it does not implement the `VectorStore` interface (different shape — lexical, no `dims`), so it is a sibling store, not a `factory.ts` ladder entry.

---

## 2. Index schema

One database — the existing `memory.db` at `cfg.dbPath` (default `~/.aidevteam/memory/memory.db`, per `lib/paths.ts defaultDbPath()`). **Not** per-project: a single db holds all projects' rows, partitioned by `project_id`, exactly like the vec0 tables. `~/.aidevteam/` is the user-global home and lives outside any repo (and `.aidevteam/` is gitignored in-repo), so the index is gitignored by construction — no new ignore rule needed.

Two tables (FTS5 external-content is overkill here; use a plain contentless-paired design):

```sql
-- Metadata + drift keys + scope dimensions. One row per live note.
CREATE TABLE IF NOT EXISTS kb_note (
  rowid      INTEGER PRIMARY KEY,         -- ties to kb_fts rowid
  project_id TEXT NOT NULL,               -- owning project (lib/project-id.ts); '' for the shared common vault
  path       TEXT NOT NULL,               -- absolute realpath of the .md file (drift key)
  mtime_ms   REAL NOT NULL,               -- drift key (matches hub rev: mtimeMs)
  size       INTEGER NOT NULL,            -- drift key (matches hub rev: size)
  scope      TEXT NOT NULL,               -- 'project' | 'common' (the HOLDING-VAULT scope, authoritative)
  status     TEXT,                        -- 'approved-common' | 'approved-project' | 'pending' | 'rejected'
  stack      TEXT,                        -- JSON array of stack tokens (for the common-stack predicate)
  kind       TEXT,
  title      TEXT,                        -- note name (filename stem)
  UNIQUE(project_id, path)
);

-- The full-text index over the BODY (and title, lightly weighted). Contentless-paired
-- to kb_note by rowid. `unindexed`-style metadata is NOT duplicated here — filtering
-- happens by JOIN to kb_note, so the scope/drift facts have ONE home.
CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
  body,
  title,
  content='',                            -- contentless: we store the text only in the FTS index
  tokenize='unicode61 remove_diacritics 2'
);
```

Notes:
- `scope/status/stack/kind/title` are mirrored into `kb_note` (not `kb_fts`) so a query can filter by scope/project **and** re-run the cross-type predicate at query time. `scope` is the **holding-vault** scope (the same authority rule as `readVault`'s `enforcedScope`) — front-matter is intent only.
- `path|mtime_ms|size` are the drift triple from D-K01, byte-aligned to the hub's per-note `rev = \`${mtimeMs}:${size}\`` so the two systems compute drift identically.
- `body` is the **plain-text** body (front-matter and leading title stripped) — reuse the hub's `markdownBody`/`excerptOf` reduction so an indexed body can never carry raw markup. The indexer is in TS, so this reduction is a small ported helper in `kb-fts.ts` (see §6 condition C4 — parity-tested against the hub).
- A `_meta` row `kb_fts_schema=1` (reuse the existing `_meta` table) versions the schema; a mismatch ⇒ drop + rebuild (it's a cache).

---

## 3. Build / rebuild / invalidation model

**Who builds:** a CLI in `claude/memory`, reusing the `import.meta.url === \`file://${process.argv[1]}\`` entry pattern already in `digest.ts`, exposed as an npm script (e.g. `npm run kb-index`). The MCP server MAY call the same builder function on demand. **No build at hub request time** — the hub never triggers indexing (that would couple the zero-dep hub to node:sqlite). Lazy-on-first-query is rejected: it puts write/index latency on the read path and needs a writer in the query bridge. Keep build and query separate.

**What it indexes:** for a given project cwd it resolves, with the EXISTING libs:
- `project_id` via `lib/project-id.ts`,
- the project vault dir (same resolution order the hub uses: `docs` / `kb` / `.aidevteam/kb`) → `scope='project'`,
- the contained common vault (same containment rule as the hub's `containedCommonVaultDir`) → `scope='common'`.

It scans `*.md` **non-recursively** (so `.trash/` — a subdirectory — is structurally excluded, exactly as `readVault` excludes it; see §5 invariant). For each file it parses front-matter (port/reuse `parseFrontMatter` parity), computes the drift triple, reduces the body, and upserts.

**Reconciliation (cheap, idempotent — a sync, not a rebuild):**
1. List live files in scope. For each: if `kb_note` has no row, or `mtime_ms`/`size` differ → re-index that note (DELETE its `kb_fts` rowid + re-INSERT, UPDATE `kb_note`).
2. For each `kb_note` row whose `path` no longer exists on disk (deleted, or **moved into `.trash`** which the non-recursive scan won't list) → **DROP** the row + its `kb_fts` entry.
3. Unchanged rows (drift triple matches) are skipped — O(changed), not O(corpus).

A full `--rebuild` flag drops both tables and re-scans (used on schema-version bump or when the operator suspects corruption). Because the index is a cache, **any** read-time inconsistency is allowed to degrade to "drop the row / fall back to file scan" — never to serve stale or out-of-scope content.

**Trash safety (hard):** a soft-deleted note lives under `<vault>/.trash/`. The non-recursive scan never lists it, and reconciliation step 2 actively drops a row whose file vanished from the live dir. The index therefore can NEVER serve a `.trash` note. This is asserted by a test (C3).

---

## 4. Hub consumption — the zero-dep degradation seam (RECOMMENDED: option (a))

**Recommendation: (a) a lazy `require` of a thin BUILT bridge from `claude/memory`, wrapped in try/catch, degrading to the file scan** — the same pattern `buildKnowledge` already uses for `./sources` and `state.js` uses for memory config. Rejected alternatives: (b) child-process per query adds spawn latency + a second runtime contract on the read path; (c) a new hub route still needs *something* to read sqlite and just moves the seam without removing the dependency question.

**Why (a) is zero-dep-safe:** the hub `require`s a small JS shim (`claude/memory/dist/kb-fts-bridge.js` or an equivalent built artifact path) **inside try/catch**. The shim is the only thing that touches `node:sqlite`. If `claude/memory` is absent, unbuilt, the db is missing, FTS errors, or the require throws — the hub catches and **falls back to exactly today's behaviour** (filename + excerpt scan). The hub's own `package.json` gains **no** dependency; `node:sqlite` is a Node built-in reached only through the optional bridge that may not exist. This preserves D-K02.

**The seam lives in a NEW `hub/lib/kb-search.js`** (not inline in `state.js`) so the fallback is one well-tested unit:

```
// hub/lib/kb-search.js  (behavioural contract — not an implementation)
ftsSearch(project, { query, projectId, scope }) -> { available: boolean, hits: [{ file, scope, score }] } | null
```

- On any failure / absence → returns `null` (or `{available:false}`); the caller keeps the file scan.
- The bridge is consulted **additively**: the hub still builds `docs[]` from the file scan (that list defines what EXISTS and is in-scope). FTS only supplies a **ranking/match signal** over that set — the hub intersects FTS hits with the file-scan `docs[]` by `file`. **The file scan remains the authority on which notes exist and are visible; FTS never introduces a file the scan didn't.** This makes a stale index harmless: a stale extra hit is dropped by the intersection; a missing hit just means that note isn't body-ranked this turn.

### Query contract

- **Input:** `{ query: string, projectId: string, scope?: 'project'|'common'|'all' }`.
- **Output:** ranked `[{ file, scope, score }]`, `file` relative to the same root the hub uses (so intersection by `file` is exact), `score` = BM25 rank (normalized, higher = better).
- **Scope enforcement at QUERY time (hard):** the bridge filters `kb_note` by `project_id = :projectId` for project scope, and for common scope re-applies the cross-type predicate **using `claude/memory`'s `lib/knowledge-match.ts scopeMatches`** — the memory-side mirror that is already parity-locked to the hub's `scopeMatches` via `hub/lib/scope-fixtures.json`. The query **WHERE** clause restricts to the caller's `project_id` and `scope IN (...)`; the common-stack match is finished post-fetch with `scopeMatches`, exactly as the hub and the recall hook already do. A note outside the caller's scope is never returned — enforced in SQL + predicate, not by trusting the index contents.

### Method-label honesty

`buildKnowledge` returns `method` today as `configured ? 'local-embeddings' : 'filename-only'`. Extend to a three-state honest label, decided at projection time by what is *actually* serving the search:

| Condition | `method` |
|---|---|
| embedder configured (vectors live) | `'local-embeddings'` (unchanged) |
| no embedder, **FTS bridge available + healthy for this project** | `'full-text'` |
| no embedder, no/failed FTS index | `'filename-only'` (unchanged — today's behaviour) |

The label is derived from a **live probe** (did the bridge return `available:true` this build?), not from "is the package installed" — so a present-but-unbuilt or errored index honestly reads `filename-only`. Precedence: embeddings > full-text > filename-only. This keeps the provenance-first honesty principle (D-K09): the UI states the actual recall mechanism, never an aspirational one.

---

## 5. Invariants — confirmed

| Invariant | How it holds |
|---|---|
| **Files canonical** (D-K01) | The indexer only READS `*.md`; it never writes a note. CRUD stays the single guarded writer (D-K07). |
| **Index derived / gitignored / rebuildable / non-authoritative** | Lives in `~/.aidevteam/memory/memory.db` (outside repos; `.aidevteam/` gitignored in-repo). Keyed `path|mtime|size`; `--rebuild` reconstructs it from files; the file scan is always the existence authority. |
| **Hub zero-dep default unchanged** (D-K02) | Hub gains no dependency; `node:sqlite` is reached only via an optional lazy-`require`d bridge inside try/catch; absent/broken ⇒ today's file-scan. |
| **Absent/broken index degrades silently** | `kb-search.js` returns `null` on any error; `buildKnowledge` keeps the file-scan `docs[]` and labels `filename-only`. No user-visible failure. |
| **`.trash` never served** | Non-recursive scan excludes the `.trash` subdir; reconciliation drops rows whose file vanished. Test-asserted. |
| **Scope boundary one source of truth** | Query-time filter reuses `lib/knowledge-match.ts scopeMatches`, already parity-locked to the hub via `scope-fixtures.json`. |

---

## 6. Reuse map (don't duplicate)

| Need | Reuse | Notes |
|---|---|---|
| Project identity | `claude/memory/src/lib/project-id.ts` `projectId()` | Same id the vec rows and hub registry use. |
| DB path / home | `lib/paths.ts` `defaultDbPath()`, `aidevteamHome()` | Same db file as sqlite-vec. |
| Config (backend selector) | `lib/config.ts` `loadMemoryConfig()` | FTS is independent of `embeddings` selector — it has no embedder; gate FTS on its own table presence, not on `embeddings != none`. |
| Scope predicate | `lib/knowledge-match.ts` `scopeMatches`/`aliasScope` | The single boundary; already mirrors the hub and is fixture-locked. |
| DB open / hardening | mirror `stores/sqlite-vec.ts` open (0700 dir / 0600 file, WAL, busy_timeout) | FTS needs **no** `allowExtension` / no `loadExtension` (FTS5 is built into SQLite) — a smaller, safer open than the vec store. |
| Front-matter + body reduction | port-with-parity of hub `parseFrontMatter` + `markdownBody`/`excerptOf` | See C4. |

---

## 7. Conditions (all must hold for the gate to stay green)

- **C1 — No new dependency.** Use built-in FTS5 via `node:sqlite`. Do not add an npm package. Do not touch the hub's dependency set.
- **C2 — One source of truth for scope.** Query-time scope/stack filtering MUST call `lib/knowledge-match.ts scopeMatches`; do not re-implement the predicate in the bridge. If you must denormalize `scope/status/stack` into `kb_note` for the SQL prefilter, the FINAL visibility decision is still `scopeMatches` post-fetch (defence in depth, no widening).
- **C3 — `.trash` unindexable, test-proven.** A test must create a note, soft-delete it (move to `.trash`), reconcile, and assert the FTS query returns it ZERO times; and that a trashed file present on disk is dropped from `kb_note`.
- **C4 — Body/front-matter parity.** The TS body-reduction + front-matter parse used by the indexer must be parity-tested against the hub's `markdownBody`/`excerptOf`/`parseFrontMatter` over a shared fixture, so an indexed body and a displayed excerpt derive from the same text (no markup leaks into the index; no scope drift from front-matter parsing differences).
- **C5 — Additive ranking only.** The hub MUST intersect FTS hits with the file-scan `docs[]` by `file`; FTS may reorder/score but MUST NOT add a note the scan didn't surface, nor remove one. A stale index is thereby harmless.
- **C6 — Honest method label.** `method` flips to `'full-text'` ONLY on a live `available:true` probe for that project; otherwise it stays `'filename-only'`. Never label `full-text` from mere package presence.
- **C7 — Silent degradation, test-proven.** A test must run `buildKnowledge`/`kb-search` with the bridge absent and with it throwing, asserting identical output to today's file-scan path and `method:'filename-only'`.
- **C8 — SECOPS sign-off.** This decision is paired with SECOPS_APPROVED (hard). The query-time scope enforcement, the external read surface (vault paths), db file perms (0600/0700), and FTS query construction (parameterized; never string-concatenate the user query into SQL — FTS5 `MATCH` takes a bound parameter, and consider a query sanitizer for FTS operators) are SECOPS's call. Do not merge without it.

---

## 8. Build-spec for /be (James)

**Module:** `claude/memory/src/stores/kb-fts.ts` — a `KbFtsStore` class (NOT implementing `VectorStore`):
- `static async open(dbPath): Promise<KbFtsStore | null>` — open `node:sqlite` `DatabaseSync` at `dbPath`; 0700 dir / 0600 file; `PRAGMA journal_mode=WAL; busy_timeout=5000`. No extension loading. Return `null` on any failure.
- `ensureSchema()` — create `kb_note` + `kb_fts` (§2); check/set `_meta.kb_fts_schema`; on mismatch drop+recreate.
- `sync(project)` — resolve `projectId` + project vault dir + contained common vault (reuse the hub's resolution rules / shared libs); non-recursive `*.md` scan; reconcile per §3 (re-index changed, drop missing/trashed); idempotent.
- `search({ projectId, scope, query, limit })` — bound-parameter FTS5 `MATCH`; JOIN `kb_fts`→`kb_note`; SQL prefilter `project_id` + `scope IN (...)`; finish common-stack visibility with `scopeMatches` post-fetch; return `[{ file, scope, score }]` ordered by BM25.
- `close()`.

**CLI:** `src/kb-index.ts` (entry-guarded like `digest.ts`), `npm run kb-index [-- --project <cwd>] [--rebuild]`. Default `--project` = cwd. Opens the store, `ensureSchema()`, `sync(project)`, prints a one-line summary (indexed/updated/dropped counts). Exits non-zero only on a hard open failure.

**Bridge:** a thin built artifact the hub can `require` (CommonJS-reachable) exposing `ftsSearch(project, { query, projectId, scope }) -> { available, hits } | null`. It opens the store read-only-ish (query path only — it MUST NOT write/index), calls `search`, returns `available:false`/`null` on any miss. (Built output path under `claude/memory/dist/` per the package's `dist/` gitignore; confirm the build/type-strip story with the package's existing run model — the package runs on Node type-stripping with no build step today, so the bridge may need to be plain `.js` or a type-strippable entry the hub can require. Resolve this packaging detail in implementation; it does not change the architecture.)

**Hub:** new `hub/lib/kb-search.js` — lazy-`require` the bridge in try/catch; expose `ftsSearch(project, opts)` returning `null` on absence/error. In `state.js buildKnowledge`: after building `docs[]`, call `kb-search`; if `available`, reorder/annotate `docs` by intersected FTS score and set `method` per §4; else leave today's behaviour untouched. Keep the change surgical — `docs[]` content/visibility is unchanged; only ordering + `method` may change.

**Tests (TDD):** schema create/version-bump-drop; sync upsert + drift re-index + missing/trash drop (C3); scope isolation (a project-B query never returns project-A or non-matching common notes — C2); parity of body/front-matter helpers (C4); bridge-absent and bridge-throws degradation (C7); method-label three-state (C6); FTS `MATCH` parameter binding / injection guard (C8).

---

## 9. Ledger

- **ARCH_APPROVED = APPROVED-WITH-CONDITIONS** (ADT-249) — conditions C1–C8 above; C8 ties to the parallel hard SECOPS gate.
- Next: `/secops` (Soren) for SECOPS_APPROVED; then APPROVAL_GATE before /be implementation. `/sm` — please record this gate result and conditions in the ledger.
