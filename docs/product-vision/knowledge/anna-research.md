# Knowledge Page + Codebase-Connect + Storage Decision — BA Research (Anna)

Status: RESEARCH PROPOSAL (no code). Lens: requirements / market conventions / skeptical-practical.
Date: 2026-06-13. Author: /ba (Anna).
Scope: a dedicated **Knowledge** page for DART (add/edit/remove notes + connect an external codebase),
with an honest **files-vs-SQLite** storage recommendation. Open-source/local default stays simple;
**Canon** (Spring + Postgres + Qdrant + MCP) is an enterprise *overlay*, never a dependency of the default.

---

## 0. Premise check (challenge the ask before specifying it)

Per BA discipline, challenge the premise first:

- **"Connect an external codebase" is doing two jobs.** (a) point DART at *another* repo so its notes/AC are
  authored against it, and (b) *index* that repo so it becomes searchable "knowledge." Job (a) already
  exists in DART (the analyzer + registry connect a project on connect; `hub/lib/analyze.js`). Job (b) — a
  searchable index — is the genuinely new ask. **Keep them separate in the requirements** so we don't
  rebuild "connect" and under-build "index."
- **The current store is not a blank slate.** DART already persists knowledge as **markdown files with YAML
  front-matter** in per-project vaults plus a user-global common vault, with a scope/stack/kind/status model
  and a *parity-locked* recall predicate (`hub/lib/knowledge.js`, `scopeMatches`). Any storage change has a
  real **migration cost** and risks breaking the file-based, git-friendly, human-editable contract that is a
  stated product principle ("markdown knowledge base (Obsidian-compatible)", `claude/CLAUDE.md`). The user's
  SQLite preference must be weighed against that, not waved through.
- **The real metric** for a knowledge surface is *"does an agent retrieve the right note at the right
  moment?"* — i.e. recall quality and trust (provenance/freshness), **not** storage elegance. Optimizing the
  store without improving retrieval/trust is low-ROI. This reframes the priorities below.

---

## 1. Knowledge/docs CRUD + codebase-connect — the conventions

### 1a. Compact comparison (tool → add/edit/remove → codebase-connect → storage → cite)

| Tool | Add / Edit / Remove | Connect a codebase | Storage (source of truth) | Citations / provenance |
|---|---|---|---|---|
| **Obsidian** | Create/edit/delete `.md` notes; folders + tags; wikilinks | No native code index (community plugins only) | **Plain markdown files** on disk, local-first, no account | Backlinks/graph; no source citations |
| **Logseq** | Block-based add/edit/delete; pages + tags | No native code index | **Markdown files** today; **DB-first** mode in 2025–26 transition (still WIP) | Block refs; no source citations |
| **Outline** | Rich-text doc CRUD; collections + tags; search | No code index | **Postgres** (server app), markdown import/export | Doc links; basic |
| **GitBook** | Markdown + rich-text CRUD; spaces; **version history/restore** | Git-sync of docs repo (docs, not arbitrary code) | Hosted DB; **Git mirror** of content | Version history; page refs |
| **Notion** | Block CRUD; databases, properties, tags | No code index | Proprietary hosted DB | Mentions/links; no source provenance |
| **Confluence** | Page CRUD; spaces; labels; comments; permissions | No code index | Hosted DB | Page history; labels |
| **Cursor (@codebase / Docs)** | Implicit — you don't curate docs; you @-mention | **Auto-index on workspace open**; chunk→embed **locally**, vectors to cloud (Turbopuffer); re-sync ~5 min, changed files only; semantic available at ~80% | **Local source stays local**; only embeddings+metadata stored (encrypted, filenames obfuscated) | Returns file/line context as grounding |
| **Continue.dev (@codebase)** | Config-driven; @-mention context | Local index: **embeddings + keyword search**; incremental re-index by comparing FS state to catalog | **SQLite** (metadata/`tag_catalog`) **+ LanceDB** (vectors), under `~/.continue/index`; embeddings local by default | File-path grounding in answers |
| **Sourcegraph Cody** | Not a doc CRUD tool | RAG over code graph: **embeddings + precise code-intel + rerank**; explicit emphasis on **keeping the index fresh** | Server index (remote-repo aware) | Grounded answers with file/symbol refs |
| **GitHub Copilot** | **Knowledge bases SUNSET (retired Nov 1 2025)** → **Copilot Spaces**; grounding via **markdown files** (`copilot-instructions.md`, indexed `.md`) | **Semantic code search index** auto-triggered, no repo cap; indexes **all markdown** in selected repos | GitHub-hosted index; **markdown in-repo is the curated source** | Grounded answers w/ code refs |
| **Glean** | Connector-curated, not hand-CRUD | Many connectors; **"Items synced"** count + **change-rate (items/day)** + **hourly status refresh**; webhooks + periodic crawl | Hosted unified index | **Evidence set**: passages, metadata, **timestamps, source refs, access attrs** → grounded citations |
| **Dust** | Curated "data sources"/spaces | Connect repos/docs as data sources; sync status | Hosted index | Source attribution in answers |

### 1b. The conventions a developer expects (distilled)

1. **Markdown is the curated source of truth; the database is a derived index.** Across the spectrum —
   Obsidian, Copilot Spaces, Continue.dev — the *human-authored* unit is a markdown file; any DB/vector store
   is a rebuildable index *over* those files, not the canonical home. Even Copilot, after retiring its bespoke
   "knowledge base," **fell back to indexing plain markdown** for grounding. This is the single strongest
   convention and it directly validates DART's existing model.
2. **CRUD is list → open → edit → save, plus tag/scope and delete-with-undo.** A left rail of notes, a
   title + body editor, tag/scope/kind selectors, search box, and a soft-delete. Version history/restore is a
   *should* (GitBook, Confluence, Git itself give it for free when files are the store).
3. **Connecting a codebase is an explicit action with visible status.** Users expect: a "connect/index this
   repo" action, an **indexing progress state**, a count of **what's indexed** (files/chunks/"items synced"),
   and a **freshness/last-synced** indicator with incremental re-sync. Glean's "Items synced + change rate +
   last refresh" and Cursor's "~80% → searchable, re-sync every 5 min" are the canonical UX vocabulary.
4. **Freshness is a first-class, displayed property — staleness is the top failure mode.** Cody explicitly
   calls keeping the index fresh the critical challenge; stale context silently poisons answers. The UI must
   *show* freshness, not hide it.
5. **Answers cite sources.** The grounded-answer norm (Glean's evidence set, Cody/Continue file refs) is
   path + snippet + timestamp. DART's `knowledge-qa.js` already does this honestly ("filename/keyword, no
   embedder" label) — that honesty *is* the convention; keep it.
6. **Local-first, no account, you own the files.** Obsidian/Logseq/Continue all run with zero cloud and
   local storage. This matches DART's OSS-first principle and must remain the default.
7. **Scope/tag to filter retrieval.** Tags, collections, spaces, project-vs-common — every tool scopes.
   DART already has a richer-than-average scope/stack/kind/status model; surface it, don't reinvent it.

---

## 2. Files vs SQLite — the storage decision (honest)

### 2a. What comparable LOCAL tools actually do

| Tool | Source of truth | Index / search layer |
|---|---|---|
| Obsidian | **Markdown files** | In-memory/derived; no DB |
| Logseq | Markdown files (DB-first mode WIP 2025–26, still maturing) | Optional DB |
| Continue.dev | Markdown/code files on disk | **SQLite (metadata/FTS) + LanceDB (vectors)** — *derived, rebuildable* |
| Cursor | Local source files | Local embed → cloud vectors; cache keyed by chunk hash |
| Copilot Spaces | **Markdown in-repo** | Hosted semantic index (derived) |

**Pattern:** nobody who values git-friendliness and human-editability makes SQLite the *canonical* store.
SQLite/LanceDB appear as the **derived index**, with files as the source. Logseq's move *toward* DB-first is
the one counterexample and is explicitly still a work-in-progress with sync-reliability caveats — i.e. a
cautionary tale, not a model to copy.

### 2b. Tradeoffs (for a LOCAL, single-user, OSS dev tool)

| Dimension | Markdown files (current) | SQLite as source of truth | **Hybrid: files + SQLite index (derived)** |
|---|---|---|---|
| Human-editable | **Yes** — edit in any editor | No — needs the app/SQL | **Yes** (files unchanged) |
| Git-friendly / diffable / PR-reviewable | **Yes** (a core DART principle) | Poor — binary blob, merge conflicts, churn | **Yes** (index is gitignored, rebuildable) |
| Agent reads/writes notes as files | **Yes** (matches "agents write to git files") | Indirect | **Yes** |
| Structured query / filter | Weak (scan + parse front-matter) | **Strong** | **Strong** (query the index) |
| Full-text search at scale | O(n) file scan; fine ≤ low-thousands of notes | **FTS5** inverted index, BM25, O(log n) | **FTS5** over indexed files |
| Concurrent/transactional writes | Weak | **Strong** | Files for writes; index rebuilt/updated |
| Migration cost from today's vault | **Zero** | **High** — rewrite reader/writer/recall + parity tests + lose git contract | **Low–medium** — additive; reader unchanged |
| Risk to existing parity-locked recall | None | **High** (re-implement `scopeMatches` over SQL; re-prove parity) | Low (recall still over files; index is an accelerator) |
| Backup / portability | Copy a folder | Copy a DB file (less transparent) | Copy folder; index regenerates |

### 2c. Recommendation (decisive)

**Adopt the HYBRID: keep markdown files (with front-matter) as the canonical source of truth; add an
OPTIONAL, rebuildable SQLite index (FTS5 + a small metadata table) as a derived search/query accelerator —
gitignored and reconstructable from the files at any time.** Do **not** make SQLite the source of truth.

Why this respects the user's SQLite preference *and* the evidence:
- The user gets SQLite where it actually pays off — **fast FTS5/BM25 full-text search and structured
  filtering** — which is exactly the role SQLite plays in the only directly-comparable local tool
  (Continue.dev: SQLite metadata + vectors, files on disk). The user does **not** want SQLite for its own
  sake; they want fast, structured CRUD/search, and the hybrid delivers that.
- It preserves DART's hard-won, principle-level guarantees: human-editable, git-friendly, agent-writable
  markdown, and the **parity-locked recall** that already ships. Recall stays defined over the files (the
  authority), so the index can never silently diverge from what a project may see — the index is an
  *accelerator*, never the visibility authority.
- **Migration cost ≈ zero for users:** no file rewrite, no vault format change, no breaking the common-vault
  contract. The index builds *from* the existing vault on first run; deleting it is a no-op (it rebuilds).
- It contains blast radius: if the SQLite layer has a bug, worst case is a slow path (re-scan files), not
  data loss.

**Sequencing (skeptical):** ship the Knowledge page and codebase-connect first **on the existing file scan**
(it already works, ≤ low-thousands of notes is fine). Introduce the SQLite index **only when measured** note
count / search latency justifies it. Premature SQLite is the "analysis-paralysis / over-build" anti-pattern;
make it a **could/should**, gated on a real performance signal, not a day-one **must**.

**One caveat to validate with /arch + /secops:** SQLite adds a native/binary dependency (`better-sqlite3` or
`node:sqlite`). DART's stated identity is **zero-dependency hub** (`node hub/server.js`). Node 22+ ships an
experimental built-in `node:sqlite`; if DART's runtime floor allows it, the index can stay
dependency-free-ish. Otherwise the hybrid index must be **optional/lazy** so the zero-dep default still runs.
This is a genuine constraint, not a footnote — flag it to /arch.

---

## 3. Connect-external-codebase — realistic scope

DART has **no embedder by default** (confirmed in `knowledge-qa.js`: the lexical tier is labeled
"filename/keyword, no embedder"). So "index a codebase as knowledge" must mean, by default, a **deterministic,
no-LLM, no-network index** — consistent with the analyzer's existing security floor (realpath containment,
DoS caps; `hub/lib/analyze.js`).

**Table-stakes MVP (must):**
- Explicit **"connect / index this codebase"** action scoped to one repo/root.
- **Filename + keyword (FTS) index** over text/code files — path, language/stack, a snippet — reusing the
  analyzer's containment + caps (skip symlink-escapes, byte/file/depth/time budgets). No embeddings.
- **What's-indexed panel:** file/chunk count, languages detected, and a **last-indexed timestamp** (freshness).
- **Re-index / refresh** action; incremental is a *should*, full re-scan is acceptable at MVP given the caps.
- Search results that **cite** path + snippet, exactly as the Q&A path already does.
- Index is **derived & disposable** (rebuildable), honoring the hybrid above.

**Over-build to AVOID at MVP (don't):**
- Default embeddings / semantic search / a vector DB (Qdrant/LanceDB) — that's the **optional overlay**, not
  the default. Semantic is a *could*, behind an explicit, disclosed, opt-in embedder.
- Real-time file-watching / 5-min auto-sync à la Cursor — nice, but a *should*; manual + on-connect refresh
  is enough to start.
- Multi-repo / monorepo graph intelligence, code-graph/precise-intel (Cody-grade) — out of scope for a local
  OSS default.
- Any network egress by default. Egress only when an embedder/overlay is explicitly enabled+healthy — the
  exact contract `knowledge-qa.js` already enforces ("triggers no egress unless an overlay is enabled and
  healthy").

---

## 4. The Canon seam (overlay, never a dependency)

Canon is the enterprise governed KB (Spring + Postgres + Qdrant + MCP, RBAC, provenance/audit). The
open-source local default **must not depend on it** for any core function:

- **Default must work fully offline, no account, no Canon, no embedder** — add/edit/remove notes, connect &
  keyword-index a codebase, scoped lexical Q&A. Canon adds *capability* (semantic recall, org-wide governance,
  audit), never *availability*.
- Treat Canon as **one more optional memory/recall overlay behind the existing seam** (`hub/lib/overlay.js`,
  the overlay tier in `knowledge-qa.js`). It plugs in via **MCP/API**, is **disclosed** (egress labeled), and
  is **enabled only when configured + healthy** — identical contract to the current overlay tier. No new,
  second egress path.
- **No schema lock-in:** the local source of truth stays markdown-files-on-disk. Canon is *connected to*, not
  *migrated to*. A user can disable Canon and lose zero local knowledge.
- The hybrid SQLite index is **local-only** and unrelated to Canon's Postgres/Qdrant — do not conflate them;
  the local index is not a "mini-Canon."

---

## 5. Prioritized requirements (MoSCoW)

### MUST (MVP)
- M1. A dedicated **Knowledge page/view** (peer to Tasks/Workflow) listing the project's scoped notes
  (own vault ∪ matching approved-common), reusing the existing `scopeMatches` projection — no second
  visibility predicate.
- M2. **Add / Edit / Remove** a note: title + markdown body + scope + stack + kind; remove is a soft action
  with confirm. Writes go to the **existing markdown vault** with front-matter (no format change).
- M3. **Search** notes (lexical/keyword today), returning title + snippet, scoped identically to the panel.
- M4. **Connect/index an external codebase**: explicit action, deterministic filename+keyword index, reusing
  analyzer containment + DoS caps, **no embeddings, no egress**.
- M5. **What's-indexed + freshness**: show indexed file/chunk count, detected languages, and **last-indexed
  timestamp**; a manual **re-index** action.
- M6. **Cited results**: every answer/search hit shows path/source + snippet + an honest grounding label
  ("filename/keyword, no embedder"), matching `knowledge-qa.js`.
- M7. **Local-first, no account, no network by default**; markdown files remain the source of truth and stay
  git-friendly/human-editable.

### SHOULD
- S1. **Optional SQLite (FTS5) derived index** over the vault + codebase, gitignored and rebuildable, gated on
  a measured note-count/latency signal; recall authority stays the files. (Validate native-dep constraint
  with /arch.)
- S2. **Incremental re-index** (compare FS state to catalog, à la Continue.dev) instead of full re-scan.
- S3. **Version history / restore** for notes (largely free via Git when files are the store; surface it).
- S4. **Filter/scope chips** in the UI (project/common, stack, kind, status) over the existing model.
- S5. **Tag-based and path-based scoping** of which codebase files get indexed (include/exclude globs).

### COULD
- C1. **Optional embedder / semantic search** (LanceDB or external), opt-in + disclosed egress; the only path
  that touches embeddings.
- C2. **Auto-refresh on file change / periodic re-sync** (Cursor-style), behind a setting.
- C3. **Canon overlay**: connect to the governed KB via MCP/API as a disclosed, health-gated recall tier.
- C4. Inline backlinks / note graph (Obsidian-style) for human navigation.

### WON'T (this iteration)
- W1. Code-graph / precise code-intelligence (Cody-grade).
- W2. Multi-repo monorepo intelligence.
- W3. Any default cloud sync / account / egress.
- W4. SQLite as the canonical source of truth (replacing markdown).

---

## 6. Skeptical gaps & risks (for /po, /arch, /secops, /ui)

1. **Zero-dependency identity vs SQLite.** DART markets a "zero-dependency workflow dashboard." A native
   SQLite binding contradicts that unless `node:sqlite` (Node 22+, experimental) is acceptable or the index is
   strictly optional/lazy. **Decision needed from /arch before any SQLite work.**
2. **Migration & the common-vault contract.** Any store change risks the user-global common vault and the
   parity-locked recall. The hybrid avoids this *only if* the index never becomes the visibility authority.
   **Gap:** we need an explicit invariant test that the index can never widen/narrow scope vs `scopeMatches`.
3. **Freshness honesty.** If we show "indexed" without showing *staleness*, we recreate Cody's documented
   failure mode. **Requirement, not nicety:** last-indexed timestamp + a visible "stale" state when files
   changed after the last index.
4. **"Connect codebase" overlap.** Risk of duplicating the analyzer/registry "connect." **Gap:** define
   whether indexing reuses the connected project root or is a separate indexable source. Recommend: reuse the
   connected root; "index" is an additive pass over it.
5. **Scale assumption unverified.** The "file scan is fine ≤ low-thousands" claim is an assumption — set a
   measurable trigger (e.g. p95 search > Xms or > N notes) that promotes S1 from could→must. Don't build
   SQLite before that signal (anti-pattern: optimizing an unmeasured baseline).
6. **No-embedder expectations.** Users coming from Cursor/Copilot expect *semantic* "@codebase." We must set
   expectations in-UI that the default is **keyword/filename** (the honest label already exists) so we don't
   over-promise. **UX requirement for /ui.**
7. **Security of indexing arbitrary external repos.** Indexing a *new external* path (not the analyzed
   project) widens the containment surface. **/secops gate:** same realpath/caps floor must apply to any
   newly-connected codebase root; no following symlink escapes; explicit user consent per root.
8. **Soft-delete / data-loss.** "Remove knowledge" must not be a silent hard delete of a git-tracked file —
   confirm + (ideally) rely on Git history; define the delete semantics.

---

## 7. Acceptance-criteria seeds (behavioral, for /po to ratify)

- **Given** a connected project, **when** I open the Knowledge page, **then** I see exactly the notes the
  project may recall (own vault ∪ matching approved-common) and no others.
- **Given** I add a note with a scope/stack/kind, **when** I save, **then** a markdown file with matching
  front-matter is written to the correct vault and the note appears in the list and in scoped search.
- **Given** I connect/index an external codebase, **when** indexing completes, **then** I see the indexed file
  count, detected languages, and a last-indexed timestamp, **and** keyword search returns path+snippet hits
  with an honest grounding label — **with no network egress**.
- **Given** files changed after the last index, **when** I view the codebase source, **then** it is shown as
  **stale** until I re-index.
- **Given** no embedder/overlay is configured, **when** I search or ask, **then** the answer is local-only,
  labeled "filename/keyword, no embedder," and triggers no egress.
- **Given** an optional SQLite index exists, **when** it is deleted, **then** the system rebuilds it from the
  markdown vault and search results are unchanged (index is derived, not authoritative).

---

## Sources

- Cursor — codebase indexing (local chunk/embed, cloud vectors, ~5-min re-sync, ~80% searchable):
  <https://cursor.com/docs/context/codebase-indexing>, <https://cursor.com/blog/secure-codebase-indexing>,
  <https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/>
- Continue.dev — SQLite (metadata/`tag_catalog`) + LanceDB (vectors), local embeddings, incremental:
  <https://deepwiki.com/continuedev/continue/3.4-codebase-indexing>,
  <https://docs.continue.dev/guides/custom-code-rag>,
  <https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/>
- Sourcegraph Cody — RAG over code graph + embeddings; freshness as the critical challenge:
  <https://sourcegraph.com/blog/how-cody-understands-your-codebase>,
  <https://sourcegraph.com/blog/how-cody-provides-remote-repository-context>
- GitHub Copilot — knowledge bases sunset (Nov 1 2025) → Spaces; semantic index, all-markdown grounding:
  <https://github.blog/changelog/2025-08-20-sunset-notice-copilot-knowledge-bases/>,
  <https://github.blog/changelog/2025-03-12-instant-semantic-code-search-indexing-now-generally-available-for-github-copilot/>,
  <https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot>
- Glean — connector "Items synced", change-rate, hourly refresh, evidence set w/ timestamps + source refs:
  <https://docs.glean.com/connectors/monitoring>, <https://docs.glean.com/get-started/learn/crawling-and-learning>
- Obsidian vs Logseq — both markdown files; Logseq DB-first transition (WIP), Obsidian git-friendly:
  <https://productivitystack.io/compare/logseq-vs-obsidian/>, <https://speakwiseapp.com/blog/obsidian-vs-logseq>
- Outline / GitBook / Notion / Confluence — doc CRUD, tagging, version history conventions:
  <https://www.featurebase.app/blog/gitbook-alternatives>, <https://findpmsoftware.com/resources/gitbook-vs-notion>
- SQLite FTS5 — inverted index, BM25, O(log n) vs O(n) file scan; auto-updating virtual tables:
  <https://blog.sqlite.ai/fts5-sqlite-text-search-extension>, <https://www.hisqlboy.com/blog/sqlite-full-text-search-fts5>

(Accessed 2026-06-13. DART internals cited from repo: `hub/lib/knowledge.js`, `hub/lib/knowledge-qa.js`,
`hub/lib/analyze.js`, `hub/lib/overlay.js`, `claude/CLAUDE.md`.)
