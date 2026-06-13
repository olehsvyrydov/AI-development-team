# SECOPS Gate — ADT-249: optional SQLite FTS index for Knowledge · HARD gate (safety-override)

> **/secops (Soren) — Principal Security Engineer.**
> A HARD `SECOPS_APPROVED` gate (never downgraded) on the OPTIONAL SQLite full-text index that indexes Knowledge
> note **bodies + metadata** to accelerate full-text search/recall. The index lives in the optional `claude/memory`
> package (`node:sqlite`); files stay canonical; the index is derived / gitignored / rebuildable / non-authoritative;
> the hub stays zero-dependency and degrades to the file scan when the index is absent or unusable.
>
> **The headline risk is a SCOPE LEAK AT QUERY TIME** — a full-text query from project A returning project B's
> project-scoped notes, or common notes A is not entitled to under `scopeMatches`. A cross-project leak through a
> shared search index is the exact failure DART's local-first honesty exists to prevent. The load-bearing condition
> (**K-FTS-1**) is that the index NEVER becomes a second, divergent scope authority.

## Verdict

**SECOPS = APPROVED-WITH-CONDITIONS — HARD gate (safety-override).**

Implementation is **BLOCKED until K-FTS-1 … K-FTS-12 ship with their negative tests green and pass `/rev`.** No
CRITICAL/HIGH is left open — each is converted into a concrete, testable invariant `/be` MUST hold. The single
load-bearing condition is **K-FTS-1 (one shared scope predicate, applied at query time, index never widens scope)**;
the rest harden trash-invalidation, data-at-rest, path/info leak, (re)index containment, and degradation.

## What I read (source, not the design's claim about it)

- `hub/lib/knowledge.js` — `scopeMatches` (`:169`) the single visibility/recall predicate; `parseFrontMatter`
  (`:110`, bounded/never-throws/proto-safe/closed-vocab); `commonVaultRoot` (`:244`, bounded override → absolute,
  no-NUL, else default); `aidevteamHome` (`:264`).
- `hub/lib/state.js` — `readVault` (`:302`, non-recursive `readdirSync(dir).filter(*.md)` → **structurally excludes
  `.trash/`**; the HOLDING VAULT decides `enforcedScope`, front-matter is intent only); `containedCommonVaultDir`
  (`:364`, realpath the resolved common root and require it `isContained` within the realpath'd `~/.aidevteam` — the
  prior-leak fix); `isContained` (`:353`, trailing-separator guard rejecting the `/home` vs `/home-evil` sibling
  trap); `buildKnowledge` (`:403`, the authority — `own` ∪ `visibleCommon` filtered by `scopeMatches`).
- `claude/memory/src/lib/knowledge-match.ts` — the **byte-for-byte TS MIRROR** of `scopeMatches`, locked to the JS
  hub by a parity test over the shared `hub/lib/scope-fixtures.json`.
- `claude/memory/src/stores/sqlite-vec.ts` — the existing `node:sqlite` store: vendored-only extension path +
  `enableLoadExtension(false)` immediately after load (`:39-42`); DB created 0600 under a 0700 dir (`:38,45`);
  `vecTable()` allowlist validation as the SQL-injection guard for the only identifier that reaches SQL (`:207-211`);
  parameterised statements everywhere; dim-mismatch → refuse + reindex (`:59-62`); `project_id`/`scope`/`chunk_type`
  filter columns already carried per row and applied in `query`/`scroll` WHERE clauses.
- `claude/memory/src/lib/paths.ts` — `defaultDbPath()` = `~/.aidevteam/memory/memory.db` (outside any repo, under
  the user-global state root); `aidevteamHome()`.
- `claude/memory/src/lib/project-id.ts` — `projectId(cwd)` = sha1(git-toplevel | realpath), the stable per-project id
  the rows must carry.
- Prior HARD gate inherited as baseline: `docs/product-vision/knowledge/secops-knowledge-page.md` (ADT-247/248,
  K-1…K-16) and `docs/sprints/sprint-06-knowledge-scopes/approvals/secops-knowledge-scopes.md`.
- Decisions: `docs/product-vision/knowledge/DECISIONS.md` D-K01/K02/K04/K06/K10 + the ADT-249 gate row.

### Grep evidence captured this pass (the negatives the conditions preserve)

- `grep -rnE 'fetch\(|http.request|https.request|net.connect|dns\.' hub/lib` → **only `projects.js`** (the unrelated
  registry probe). The write/knowledge/state path makes **zero** outbound I/O today — **K-FTS-7 keeps it zero** when
  the index is added.
- `grep -rnE 'fetch\(|http.request|https.request' claude/memory/src/stores claude/memory/src/lib` → **(none).** The
  store + scope-match libs do zero network I/O — **K-FTS-7** proves the FTS build/query add none.
- `grep -rnE 'unlink|rmSync|rmdirSync' hub/lib` → only `sources.js:238` (contained derived-facet cleanup, inside
  `.aidevteam`, realpath-checked) and doc-comments in `api.js`/`write.js`. The note vault has **no hard unlink** — the
  FTS index MUST NOT add one against a vault file, and its "discard corrupt db" cleanup (K-FTS-12) is bounded to the
  realpath-contained db file under `~/.aidevteam`, exactly like `removeIndexFacet`.
- `.gitignore:60` ignores `.aidevteam/` at repo root; `defaultDbPath()` is `~/.aidevteam/memory/…` — the index is
  **outside any repo working tree by construction**. K-FTS-5 proves no code path relocates it into the repo.

## Trust model (delta)

Trust model unchanged: single-developer, localhost; the Operator is trusted, **the browser the Operator also uses is
NOT**, and the machine is **multi-project**. The new asset this ticket introduces is a **single derived store that
aggregates note BODIES across scopes — project-scoped notes for potentially many projects PLUS common notes — into one
queryable place.** That aggregation is the whole threat: the file scan never crosses a project boundary because each
project scans only its own vault + the common vault gated by `scopeMatches`; a shared index that pre-mixes bodies makes
a boundary-crossing query a single missing `WHERE` clause away. Assume a malicious concurrent client issuing queries as
project A on a machine that also hosts project B.

**STRIDE — the new surface:**

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Information disclosure (cross-project / over-scope at QUERY time)** | A query from A returns B's project-scoped notes, or common notes not visible to A, because the index lacks per-row scope+project_id, or its query filter diverges from `scopeMatches`. | 🔴 CRITICAL | **K-FTS-1, K-FTS-2, K-FTS-3** — every row carries `project_id` + `scope` (+ stack/status); every query is filtered by the SAME predicate the hub enforces; the index is a candidate generator, the authoritative `scopeMatches` is the final filter; index never widens scope. |
| **Information disclosure (stale = deleted content served)** | A soft-deleted (`.trash`) note still answers as a search hit because the index was not invalidated. | 🟠 HIGH | **K-FTS-4** — a note absent from the canonical `readVault` scan (moved to `.trash`, edited, re-scoped) is removed/updated in the index before it can be served; freshness keyed on `path\|mtime\|size`, drift → row dropped, never trusted. |
| **Information disclosure (data-at-rest egress / commit)** | The db (full note bodies) is committed to git, written into the repo or a synced/cloud dir, or read-leaked off the box. | 🟠 HIGH | **K-FTS-5, K-FTS-6, K-FTS-7** — db lives only under `~/.aidevteam` (gitignored, outside repo), 0600 under 0700, never in repo/synced location; build+query do ZERO network I/O. |
| **Information disclosure (path / fs-layout leak)** | Absolute index/vault paths leak through hub API responses or error text beyond the `{file, scope}` refs already exposed. | 🟡 MEDIUM | **K-FTS-8** — the query bridge returns server-known `{file (vault-relative), scope}`, never `path\|mtime\|size` keys, never an absolute path or a raw db error. |
| **Tampering / elevation ((re)index escape via symlink)** | The indexer follows a symlink inside a vault to `~/.ssh`/`/etc` and indexes (then serves) content outside the vault. | 🟠 HIGH | **K-FTS-9, K-FTS-10** — the indexer realpath-contains every indexed file to its vault root and SKIPS (never follows) an escaping symlink — the same discipline `readVault`/`containedCommonVaultDir`/`analyze.js` use; the common vault is gated by `containedCommonVaultDir` before it is walked. |
| **Denial of service / corruption (poisoned or locked index)** | A corrupt/locked/foreign-schema db crashes the hub or serves partial/wrong results. | 🟡 MEDIUM | **K-FTS-11, K-FTS-12** — absent/corrupt/locked/dim-or-schema-mismatched index ⇒ silent fallback to the file scan (no crash, no partial-leak); a corrupt index is discarded + rebuilt, never trusted. |

---

## Binding conditions — concrete invariants `/be` MUST hold

Each closes a specific risk and is proven by a named negative test. **The first is load-bearing.**

### K-FTS-1 — ONE shared scope predicate; the index is filtered by it at query time and NEVER widens scope (load-bearing)

The FTS scope filter and the hub's `scopeMatches` MUST NOT become two implementations — that drift IS the leak class.
Concretely:

1. **One predicate, reused.** The query path MUST resolve visibility through the SAME `scopeMatches` already mirrored
   byte-for-byte in `claude/memory/src/lib/knowledge-match.ts` and locked to the hub JS by the
   `hub/lib/scope-fixtures.json` parity test. `/be` MUST NOT hand-roll a scope `WHERE` clause that re-encodes the
   project/common/status/stack rules inline in SQL. **If** a SQL pre-filter is used for performance, it is a
   **narrowing candidate generator only** (`project_id = ? OR (scope='common' AND status='approved-common')`), and
   every returned candidate is then passed through `scopeMatches(doc, projectMeta)` as the FINAL authority before any
   row leaves the process. The SQL filter may only ever be a SUBSET of what `scopeMatches` admits — never a superset.
2. **The parity fixture is extended, not forked.** The FTS candidate predicate is added to the SAME
   `scope-fixtures.json` parity suite, so a fixture that `scopeMatches` rejects and the SQL filter would admit FAILS
   the build. The index can never out-vote the canonical predicate.
3. **Index never widens scope.** A row's effective visibility is `min(SQL filter, scopeMatches)` — the index is only
   ever allowed to HIDE a visible note (a stale miss, acceptable: degrades to the file scan), never to REVEAL a note
   the file-scan path would not. There is exactly one direction of safe error.

**Closes:** the headline cross-project / over-scope leak — A querying and receiving B's project notes or
non-entitled common notes.
**Negatives (N-FTS-1…4):** ① index built with A's + B's project notes + common notes → query as A returns A's own +
only A-entitled common, **never** any B project-scoped row, never a non-matching-stack common row. ② a hand-crafted
SQL pre-filter that admits a row `scopeMatches` rejects → the final filter drops it (assert the row is absent from the
response). ③ the parity suite fails if the candidate predicate diverges from `scopeMatches` on ANY fixture row.
④ a common note with `status != approved-common` indexed → never returned to any project.

### K-FTS-2 — every row carries `project_id` + `scope` (+ `status`, `stack`) as filterable columns

Mirror the established `sqlite-vec` schema: `project_id`, `scope`, `status`, `stack` are first-class columns on every
indexed row (the same columns `query`/`scroll` already filter on). `project_id` = `projectId(root)` for project-scoped
rows; common rows carry the common scope + their `approved-common` status + stack. A row with no resolvable
`project_id` for a project-scoped note is NOT indexed (fail-closed). **Closes:** a row that cannot be scope-filtered at
all. **Negative (N-FTS-5):** a project-scoped row missing `project_id` is rejected at upsert, not stored unfiltered.

### K-FTS-3 — the holding vault decides scope at INDEX time (front-matter is intent only)

Exactly as `readVault` does (`state.js:320` — `enforcedScope` from the holding vault, status clamped per vault), the
indexer MUST stamp each row's `scope`/`status` from the VAULT it was read from, never from the note's own
front-matter. A note physically in the project vault is `project` even if its front-matter says `scope: common`. This
prevents a hand-edited note widening its own index reach. **Closes:** front-matter-driven self-promotion across the
index boundary. **Negative (N-FTS-6):** a project-vault note with `scope: common` front-matter is indexed as
`project`, `ownProject`-only, invisible to other projects' queries.

### K-FTS-4 — trash / edit / re-scope invalidation: a stale index never serves deleted or moved content

The canonical truth is the `readVault` `*.md` scan; the index is a cache of it. `/be` MUST keep them consistent so a
note that the file scan would NOT return is never returned from the index:

- A soft-deleted note (moved to `<vault>/.trash/`) MUST be removed from the index before the next query can serve it.
  Because `readVault` is `*.md`-only and non-recursive, a `.trash` file is structurally invisible to the scan — the
  index must match that: a path no longer present as a live `*.md` in its vault is dropped.
- An edited note (new `mtime`/`size`) MUST be re-indexed or its stale body dropped — the `path\|mtime\|size` key is the
  freshness check; on mismatch the row is rebuilt or removed, never served as-is.
- A re-scoped note (project↔common MOVE) MUST update `scope`/`project_id`/`status` to the NEW holding vault, so it is
  neither double-counted nor served under its old scope.
- The reconcile MUST run such that a query cannot observe a deleted/moved note (rebuild-before-serve, or a freshness
  check that drops a row whose `path|mtime|size` no longer matches a live vault file). A stale index is DISCARDED in
  favour of the file scan, never trusted to serve removed content.

**Closes:** deleted/edited/moved content surviving as a search hit.
**Negatives (N-FTS-7…9):** ① soft-delete a note → it is absent from index results on the next query. ② edit a note's
body → the old body never returned; only the new body (or a file-scan fallback) answers. ③ re-scope project→common →
the note is not served to its old project under the old scope, and (if entitled) only under the new scope.

### K-FTS-5 — the index file lives ONLY under `~/.aidevteam`, gitignored, never in the repo or a synced/cloud location

The db path is `defaultDbPath()` = `~/.aidevteam/memory/…` (the established home; `.aidevteam/` is gitignored at repo
root). `/be` MUST NOT add any code path that writes the index into the project repo, into a vault dir, or into a
known-synced location; the path is realpath-contained to `~/.aidevteam` before opening (a `commonVaultDir`-style
override, if any, is absolute + no-NUL + contained-or-default, mirroring `commonVaultRoot`). **Closes:** committing
note bodies to git / placing them in a cloud-synced dir. **Negatives (N-FTS-10…11):** ① the resolved db path is under
realpath'd `~/.aidevteam` or the index is not created; an override escaping it falls back to the default. ② a repo-tree
git-ignore/status assertion shows no `.db`/`.db-wal` under the project tree after a build.

### K-FTS-6 — data-at-rest permissions: db (and WAL/SHM sidecars) 0600 under a 0700 dir

Reuse the existing `SqliteVecStore.open` posture verbatim: `mkdir … {mode:0o700}`, `chmod 0o600` the db. The index
holds full note bodies (potentially sensitive) — it MUST NOT be group/world-readable. The WAL/SHM sidecars inherit the
0700 dir. **Closes:** another local account reading the aggregated bodies. **Negative (N-FTS-12):** post-build, the db
file mode is 0600 and the containing dir 0700 (best-effort on platforms without POSIX modes, asserted where supported).

### K-FTS-7 — building AND querying the index do ZERO outbound network I/O (D-K04)

With nothing configured, every operation does zero outbound network I/O. The FTS build (scan + tokenise + write) and
query (read + filter) MUST be purely local: no `fetch`/`http(s).request`/`net.connect`/`dns` on either path. The
sqlite-vec extension is loaded from the vendored package path ONLY, never a user/env path, with
`enableLoadExtension(false)` immediately after (reuse `sqlite-vec.ts:39-42`). Egress remains possible ONLY through an
already-configured + enabled + healthy memory overlay — the FTS index adds NO second egress path. **Closes:** silent
exfiltration of bodies via the indexer. **Negatives (N-FTS-13…14):** ① a network-blocking harness over the build path
makes zero connection attempts. ② same over the query path. (Mirrors the K-13 zero-egress negative from the prior
gate.)

### K-FTS-8 — the query bridge returns server-known `{file, scope}`, never raw fs layout

A hub/recall response built from index hits MUST expose only the same refs the file-scan path already exposes:
`file` (vault-RELATIVE, as `readVault` emits via `path.relative`) and `scope`. It MUST NOT leak the index keys
(absolute `path`, `mtime`, `size`), the db file path, the common-vault absolute root, or a raw SQLite error string in
any API response or error message. On any index error the bridge degrades silently to the file scan and surfaces no
internal path. **Closes:** fs-layout / home-dir disclosure to the untrusted browser. **Negatives (N-FTS-15…16):**
① an index-backed search response contains no absolute path and no `mtime`/`size` key. ② a forced index error produces
a file-scan result with no db path / SQLite error text in the payload.

### K-FTS-9 — (re)index realpath-contains every indexed file to its vault root; escaping symlinks are SKIPPED, not followed

The indexer walks the project vault AND the common vault. For EVERY file it indexes it MUST realpath the entry and
require `isContained(vaultRoot, real)` (the trailing-separator rule, `state.js:353`) BEFORE reading/indexing — the
prior knowledge leak was a resolved-root used without per-file containment. A symlink whose realpath escapes the vault
is SKIPPED (logged-as-skipped at most), NEVER followed/indexed — the same skip-not-follow discipline as
`analyze.js confinedPath` and the vault readers. The common vault is resolved through `containedCommonVaultDir` (or its
equivalent: realpath the resolved root, require containment within realpath'd `~/.aidevteam`) before it is walked at
all. **Closes:** indexing — and then serving as a "note" — content outside the vault (e.g. `~/.ssh/id_rsa` via a
planted symlink). **Negatives (N-FTS-17…19):** ① a symlink in the project vault pointing outside it is not indexed and
never appears in results. ② a `commonVaultDir` override resolving outside `~/.aidevteam` indexes no common rows. ③ a
hardlink/`..` traversal in a name resolves under the vault or is skipped — nothing outside the vault root is read.

### K-FTS-10 — the indexer is READ-ONLY over the vaults; it never mutates, moves, or unlinks a note

The build path reads `*.md` files; it MUST NOT write, rename, truncate, or unlink any vault file (the note vault has no
hard unlink today — keep it that way). The only thing the indexer WRITES is its own db under `~/.aidevteam`. **Closes:**
an indexing bug corrupting/destroying canonical notes. **Negative (N-FTS-20):** a build run leaves every vault file
byte-identical (content + mtime unchanged except where the Operator edited it); `grep` proves no `unlink`/`rename`/
`writeFile` targets a vault path on the index path.

### K-FTS-11 — absent / corrupt / locked / mismatched index ⇒ silent, complete fallback to the file scan

The hub MUST degrade to today's `readVault`/`buildKnowledge` file scan when: the `claude/memory` package / node:sqlite
/ the extension is unavailable (the established `open() → null` degrade, `sqlite-vec.ts:29-53`); the db is missing,
corrupt, locked (busy_timeout exceeded), or has a foreign/incompatible schema or dim mismatch
(`sqlite-vec.ts:59-62`). Fallback MUST be COMPLETE — never a partial result set that silently omits notes (a partial
result is a silent under-disclosure that hides a note the Operator wrote) and never a crash. The file scan remains the
correctness baseline; the index is strictly an accelerator. **Closes:** an unavailable/locked index producing a crash
or a partial (leak-by-omission or leak-by-staleness) answer. **Negatives (N-FTS-21…23):** ① delete the db → search
returns the full file-scan result, no crash. ② corrupt the db bytes → same. ③ hold an exclusive lock past
`busy_timeout` → same.

### K-FTS-12 — a corrupt index is DISCARDED + rebuilt within the contained db dir, never trusted

On detected corruption/incompatibility, the index file (and its WAL/SHM sidecars) is removed and rebuilt from the
canonical files — but ONLY after realpath-confirming the target is contained within `~/.aidevteam/memory` (mirror
`removeIndexFacet`/`sources.js:238`: realpath, `isContained`, `force` remove only the contained derived artefact).
The rebuild reads the same realpath-contained vaults (K-FTS-9). A corrupt index is NEVER queried as authoritative.
**Closes:** trusting poisoned/partial index state, and an uncontained delete during recovery. **Negatives
(N-FTS-24…25):** ① a corrupt db is discarded and a fresh, correct index rebuilt; results match the file scan. ② the
discard targets only a realpath-contained path under `~/.aidevteam/memory` — a symlinked/relocated db path is not
followed outside that root.

---

## Cross-cutting honesty conditions (inherited from the prior HARD gate, still binding)

- **Render-inert (K-15 inherited).** Untrusted note bodies surfaced via index hits are carried verbatim as DATA and
  escaped by the front end on render; DART never interpolates a body/excerpt into an instruction. The excerpt
  derivation reuses `excerptOf` (`state.js:287`) — markup reduced to readable text, no `<script>` survives.
- **Zero-egress-honest (K-16 / D-K04 inherited).** The "local default is complete and zero-egress" claim stays true:
  the index is local-only; the ONLY egress remains a configured+enabled+healthy memory overlay; this ticket adds no
  banner, no tease, and no second outbound path.

## Required tests before this gate flips to PASS

`/be` (TDD) owns the negatives **N-FTS-1 … N-FTS-25** above, plus:
- The **`scope-fixtures.json` parity suite is EXTENDED** to cover the FTS candidate predicate (K-FTS-1.2) — a divergence
  from `scopeMatches` fails CI.
- A **cross-project leak negative is mandatory and load-bearing** (N-FTS-1): two projects' bodies in one db, a query as
  A must never return B's project-scoped rows. This test is the gate's centre of gravity.
- Grep-negatives re-run on the index path: **no** `fetch|http(s).request|net.connect` (K-FTS-7); **no** vault-targeted
  `unlink|rename|writeFile` (K-FTS-10); extension loaded from the vendored path only with `enableLoadExtension(false)`
  after (K-FTS-7).

**Gate stays HARD (safety-override). Implementation is BLOCKED until K-FTS-1 … K-FTS-12 ship with N-FTS-1 … N-FTS-25
green and `/rev` confirms the index is filtered by the SHARED `scopeMatches` (not a forked SQL predicate) at query
time.**

— Soren, Principal Security Engineer
