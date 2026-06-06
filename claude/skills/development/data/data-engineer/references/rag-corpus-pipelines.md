# RAG Corpus Pipelines — Ingest · Incremental/CDC · Dedup · Lineage · Re-embed

The **data-engineering** view of Retrieval-Augmented Generation: the pipeline that
*builds and keeps current* a retrieval corpus, treated as a first-class data product
with sources, contracts, lineage, freshness SLAs, and quality gates. Pair with the
`data-engineer` SKILL.md (this expands its CDC / quality / freshness bullets to the
RAG case).

**Scope boundaries — read these first, this reference deliberately defers:**

- *Chunking & embedding mechanics* (strategies, sizes, model selection, hybrid
  retrieval, eval metrics) → [`rag-patterns.md`](../../../ai/ai-engineer/references/rag-patterns.md).
  This doc treats chunk/embed as **pipeline stages**, not as algorithms to tune.
- *System topology* (write/read split, index topology, serving, caching, governance) →
  [`rag-architecture.md`](../../../../architecture/solution-architect/references/rag-architecture.md).
  This doc owns the **write-path data engineering**, not the runtime shape.
- *Vector-index operations* (build/scale/rollout of the index) → mlops
  `vector-db-operations.md`. *Index tuning* (HNSW knobs, recall/latency) → dba
  `vector-db-tuning.md`. This doc *feeds* the index; it does not run or tune it.

Vendor and product names are examples, not endorsements — the patterns outlive them.

---

**Mental model — a RAG corpus is a derived dataset with a lineage chain.**

```
  SOURCE rows/docs ──► EXTRACT ──► NORMALIZE ──► DEDUP ──► CHUNK ──► EMBED ──► UPSERT
   (db/web/api/files)   (raw,        (clean text,  (hash/    (units)   (vectors) (index +
                         retained)    +metadata)    MinHash)                       tombstones)
        │                                                                            ▲
        └──────── change feed (CDC / poll-diff) detects new/changed/deleted ─────────┘
```

Every stage is a transform from an upstream artifact to a downstream one, and the
edge `source → chunk → embedding` is a **lineage chain you must be able to walk in
both directions**. "Re-index the doc that came from row 42" and "which source
produced this retrieved chunk?" are the two queries the whole pipeline exists to
serve. If you can't answer them, you have one-off scripts, not a pipeline.

---

## 1. Source connectors & ingestion

A connector's job: enumerate source objects, fetch content + native metadata, and
emit a normalized **raw record** (content bytes/text + source identity + change
marker). Keep extraction *separate* from chunk/embed — land raw first.

| Source class | Enumerate | Change signal | Watch out |
|--------------|-----------|---------------|-----------|
| **Files / object store** | list prefix | `mtime` + `etag` / size | renames look like delete+create; large blobs need streaming |
| **Web / crawl** | sitemap / frontier | `Last-Modified` / `ETag`, content hash | SSRF, robots, JS-rendered pages, soft-404s |
| **Relational DB** | table scan / query | **CDC** (WAL/binlog) or `updated_at` | hard deletes invisible without CDC; tx boundaries |
| **SaaS / REST APIs** | paginated list | webhooks, cursor, `updated_since` | rate limits, partial pages, no delete event |
| **Doc systems / wikis** | space/tree walk | revision id / version | ACLs change without content change |

**Land raw, then transform.** Persist the fetched bytes/text in a raw store
(object store or table) before chunking. This gives **traceability and audit**, lets
you **re-chunk/re-embed without re-fetching** the source (cheaper, and the source may
be gone), and makes the pipeline replayable. The raw record is the head of the
lineage chain.

**Normalize to text + metadata once.** Parse to clean text (strip boilerplate/nav,
keep structure markers like headings) and emit a uniform record so downstream stages
don't care whether a doc came from a PDF or an API. Parsing/layout extraction itself
belongs to ingest mechanics — keep it behind the connector.

---

## 2. Orchestrating chunk → embed → upsert as an idempotent pipeline

This is the core data-engineering job: turn a stream of raw records into index
mutations, **reliably, at-least-once, without duplicating or half-updating**.

```
 connector ─► [raw store] ─► durable queue ─► worker pool ─────────────► index
   (extract)   (audit/replay)  (per-doc job,   (normalize·dedup·chunk      (upsert +
                                at-least-once)   ·embed·upsert·tombstone)    delete)
                                    │                                         ▲
                              autoscale on depth ───────────► DLQ ◄───────────┘
                                                          (poison docs)
```

- **Queue + stateless workers.** Never chunk/embed on the ingest request thread
  (topology rationale lives in `rag-architecture.md` §1). Queue depth is both the
  **autoscaling signal** and **backpressure**: when the embedding API rate-limits or
  the index write saturates, the queue grows instead of dropping work.
- **Batch within a worker.** Embedding APIs and vector upserts are far cheaper per
  item in batches — accumulate chunks and call embed/upsert in batches (size to the
  provider's limit and your latency budget), not one HTTP call per chunk.
- **Idempotency is mandatory** (jobs are at-least-once; a worker may run twice). Key
  each chunk by a content-derived id, e.g. `chunk_id = hash(source_id, chunk_index,
  chunk_text)` (or `source_id:version:chunk_index`), so a redelivery is a **no-op
  upsert**. Re-ingesting an unchanged document must cost nothing.
- **Per-document atomic replace.** Treat a document's chunk set as a unit: upsert the
  new chunks, then **delete orphaned old chunks** for that `source_id` (those whose id
  is no longer in the new set). A doc must never half-update and leave stale chunks
  retrievable. Stamp each chunk's `doc_version` so the orphan-delete is a single
  "delete where source_id=X and doc_version<>current" sweep.
- **Retries with backoff + jitter** for transient failures (rate limit, 5xx, timeout);
  cap attempts.
- **Dead-letter queue (DLQ)** for poison records (unparseable doc, oversized blob,
  repeated failure). DLQ must be **monitored and replayable** — a silently growing DLQ
  is silent corpus rot. Record the failure reason for triage.

```
 retry(n<max & transient) ──► back to queue (backoff+jitter)
 retry exhausted | poison  ──► DLQ (reason, source_id, attempt) ──► alert + manual replay
```

---

## 3. Incremental & CDC indexing

A corpus that only ever full-rebuilds is stale between runs and expensive. The 2026
direction is firmly **incremental / event-driven**: re-embed only what changed, as
soon as it changes — at a fraction of the embedding cost. *(Trend; confirm cost
deltas against your own corpus — savings are workload-dependent.)*

**The three mutations you must handle — INSERT / UPDATE / DELETE:**

| Source event | Detect via | Index action |
|--------------|-----------|--------------|
| **New doc/row** | not seen before (id absent) | chunk → embed → upsert |
| **Changed doc/row** | change marker moved (see below) | re-chunk → re-embed → atomic replace |
| **Deleted doc/row** | absent in source / CDC delete | **delete chunks + write tombstone** |

### Change detection — the deterministic gate

A **change detector** decides whether a source object actually changed, so unchanged
docs cost zero embed calls:

1. **Trusted last-modified marker** (`updated_at`, ETag, revision id) — cheapest;
   compare against the value stored at last ingest.
2. **Content hash fallback** when the marker is absent or untrustworthy (many systems
   bump `mtime` on no-op saves). Hash the normalized content; re-embed only if the
   hash moved. This also guards against re-embedding on cosmetic-only changes.

Store, per source object, the last-seen `(marker, content_hash, doc_version)` in a
**watermark/state table**. Incremental sync = "list source → for each, ask the
detector → enqueue only the changed/new; diff the id set to find deletes."

### CDC vs poll-diff

- **CDC** (WAL/binlog, outbox, event bus, webhooks) is the clean way to get
  **deletes** and near-real-time freshness — the source emits INSERT/UPDATE/DELETE and
  the pipeline reacts per event. Structured sources (relational DBs) have mature CDC;
  apply it where available.
- **Poll-diff** (periodic list + change-detector + id-set diff) is the fallback for
  unstructured/file/SaaS sources with **no schema and no delete event** — you infer
  deletes from "present last run, absent now." More lag, simpler infra.
- **Hybrid is common at scale:** frequent incremental/CDC for day-to-day changes +
  an occasional full reconcile to catch missed events and drift. *(Common practice;
  the cadence is workload-specific.)*

### Deletes & tombstones — the most-skipped path

A deleted or unpublished source whose chunks remain retrievable is a **correctness and
compliance failure** (it can resurface retracted or "right-to-be-forgotten" content).

- **Hard delete** the chunks from the index on a confirmed source delete.
- **Write a tombstone** in the state table (`source_id`, `deleted_at`, reason) so the
  pipeline *remembers* the doc was deleted — without it, a stale CDC replay or a
  re-list race can resurrect chunks. The tombstone is the authority that says "this
  source must not exist in the index."
- **Soft-delete (flag, filter at query)** is acceptable as an interim only if the
  query layer *always* filters tombstoned chunks — otherwise prefer hard delete. Don't
  ship soft-delete without the enforced filter.

---

## 4. Deduplication at scale

Duplicate content wastes embedding spend and storage, and **poisons retrieval**
(the context fills with five copies of one fact; reranking can't fix what dedup
should have removed upstream).

| Level | Method | Catches | Cost |
|-------|--------|---------|------|
| **Exact** | SHA-256 of normalized content | byte-identical copies, redeliveries | trivial; do always |
| **Near-duplicate (doc)** | **MinHash + LSH** over shingles → Jaccard estimate | reposts, minor edits, templated boilerplate | near-linear via LSH banding |
| **Chunk-level** | hash/normalize chunk text | repeated headers/footers, shared snippets across docs | cheap; dedup after chunking |

- **Exact-hash dedup is free and non-negotiable** — it's the same content hash that
  drives idempotency (§2) and change detection (§3). One hash, three jobs.
- **Near-dup needs LSH to scale.** Pairwise comparison is O(n²); **MinHash signatures
  + Locality-Sensitive Hashing** reduce it to near-linear by only comparing items that
  land in the same hash band. This is the standard scalable near-dup technique; tune
  the shingle size and the bands/rows to your target Jaccard threshold. *(Threshold is
  corpus-dependent — validate on samples.)*
- **Decide what "duplicate" means for *your* corpus** before deleting: keep the newest
  version? the canonical source? Record *which* original a dropped duplicate mapped to
  (lineage), so a citation still resolves.

---

## 5. Metadata enrichment — and why it's load-bearing downstream

Metadata is **cheap to attach at ingest, expensive to retrofit**, and several
downstream guarantees are *impossible* without it. Enrich every chunk with at least:

| Field group | Examples | Powers downstream |
|-------------|----------|-------------------|
| **Source identity** | `source_id`, `uri`, `connector`, `doc_type` | lineage, dedup, re-index targeting, citation |
| **Temporal** | `created_at`, `modified_at`, `ingested_at`, `doc_version` | freshness/recency filtering, supersession, audit |
| **Authorization** | `acl_tags` / `groups` / `tenant_id` / sensitivity class | **access control at retrieval**, multi-tenant isolation, PII policy |
| **Structure** | `title`, `heading_path`, `page/slide`, `chunk_index`, `parent_id` | precise citation, layout-aware retrieval |
| **Lineage** | `raw_record_ref`, `embedding_model@version`, `pipeline_run_id` | re-embed coordination, debugging, reproducibility |

- **ACL tags are a security control, not a nice-to-have.** If a chunk lacks the ACL
  metadata of its source, the retriever **cannot pre-filter by the caller's
  permissions → downstream leak** (enforcement model lives in `rag-architecture.md`
  §5). The data engineer's obligation: stamp ACLs at ingest and **re-sync them when
  source permissions change even if content didn't** (a permission-only change is a
  re-index trigger).
- **Temporal metadata** is what lets the read path prefer recent sources and surface
  staleness; **`doc_version`** is what makes the atomic orphan-delete (§2) and
  supersession work.
- Stamp the **`embedding_model@version`** on every chunk — §7 depends on it to know
  what to backfill.

---

## 6. Corpus versioning, freshness SLAs & lineage

Treat the corpus as a **versioned data product**, not a mutable blob.

- **Lineage (`source → chunk → embedding`).** Persist the chain so you can walk it
  both ways: forward to **fan out a source change** to the right chunks, backward to
  **explain a retrieved chunk** ("which source, which version, which model, which
  run"). Lineage answers *where context came from, who owns it, and whether it's
  trusted* — increasingly a hard enterprise requirement, not just debugging.
- **Freshness SLA.** State an explicit target — "an edit/delete is reflected in the
  index within N minutes/hours" — and size the pipeline (batch vs incremental vs CDC)
  to meet it. Track **freshness as a metric** (`now − max(ingested_at)` per source,
  lag distribution) and alert on breach. A corpus with no freshness SLA silently rots.
- **Corpus / run versioning.** Tag each mutation with a `pipeline_run_id`; version the
  index name with the embedding contract (`idx_<model>@<dim>`, see §7). This makes
  rebuilds reproducible and lets you diff "what changed between run N and N+1."
- **Partitioning & archival of stale chunks.** Partition by source/domain/time so you
  can expire or cold-store chunks past a retention horizon without scanning everything.
  Archived chunks leave the hot index (cost, recall noise) but stay in the raw store
  for audit/replay.

---

## 7. Re-embedding on model change

Changing the embedding model **or its version invalidates the entire index** — query
and document vectors must come from the *same* model (query/doc asymmetry detail in
`rag-patterns.md` §2). This is the most expensive corpus operation. The *index*
rollout mechanics belong to mlops `vector-db-operations.md`; the **data engineer owns
the backfill job and the coordination**.

- **Never re-embed synchronously in place** — it takes the corpus offline, has no
  rollback, and corrupts live queries mid-run (vectors from two models in one space).
- **Backfill into a parallel (GREEN) index** built by re-reading from the **raw store**
  (§1) — not by re-fetching sources — keyed and chunked identically, embedded with the
  new model. BLUE keeps serving throughout.

```
 raw store ──► backfill workers ──► GREEN index (new model@version)
   (replay)     (chunk·embed)              │
                                  validate on golden set (quality gate, §8)
                                           │ pass
 alias  docs_current ──────────────────────┘  atomic swap BLUE→GREEN ─► retire BLUE
```

- **Coordinate the swap via an alias / pointer**, not a hard-coded index name. Apps
  read `docs_current`; the cutover is an atomic alias flip → **blue/green** with
  instant rollback. (Canary read-routing + recall delta before full cutover is the
  topology detail in `rag-architecture.md` §1 — coordinate with whoever owns the
  index.)
- **Backfill is throughput-bound and bursty** — reuse the §2 queue + autoscaling +
  DLQ machinery; checkpoint progress so a failed backfill resumes, not restarts.
- **Cost note:** maintaining BLUE+GREEN **doubles storage during migration**. Plan
  capacity and a teardown step.

---

## 8. Quality gates — validate before you promote

A corpus mutation that lands without validation can silently degrade retrieval.
Gate **before promotion** (before the chunks/index go live):

- **Schema / data-contract checks** (see §9): required metadata present (esp. ACL
  tags), types valid, `embedding_model@version` set, no null `source_id`.
- **Volume / anomaly checks:** chunk count per doc within expected range; a run that
  deletes 90% of the corpus or 10×'s it should **fail closed**, not auto-promote.
- **Dedup sanity:** duplicate rate below threshold after dedup.
- **Retrieval eval on a golden set** before a full reindex / model swap goes live —
  recall@k must not regress vs the current baseline (eval *mechanics* in
  `rag-patterns.md` §7; here it's a **release gate**, run in CI / before alias swap).
- **Freshness check:** the run actually advanced the watermark for changed sources.

Only promote (swap alias / mark chunks live) when gates pass; otherwise hold and
alert. This is the corpus equivalent of "don't deploy a failing build."

---

## 9. Data contracts

A **data contract** between each source connector and the pipeline pins the shape and
guarantees of incoming records so the corpus doesn't silently break when a source
changes. Specify:

- **Schema** of the raw/normalized record (required fields, types) — incl. the
  **mandatory metadata** of §5 (ACL tags, timestamps, source identity).
- **Change semantics:** does this source emit deletes? what's the trusted change
  marker? at-least-once vs exactly-once?
- **Freshness expectation** the source can support (feeds the §6 SLA).
- **Schema-evolution rules:** additive-only? how is a breaking change signalled?

Validate the contract at the connector boundary (§8 schema gate). A source that
violates its contract routes to DLQ / alerts — it must not poison the corpus.

---

## Decision checklist

- [ ] **Land raw before transform** — raw store enables replay, re-chunk, audit, lineage head.
- [ ] **Chunk/embed/upsert behind a durable queue**; stateless workers autoscale on depth; **batch** embed/upsert calls.
- [ ] **Idempotent** via content-hash chunk ids; **per-doc atomic replace** (upsert new + orphan-delete by `doc_version`).
- [ ] **Retries** (backoff+jitter, capped) → **DLQ** (monitored, replayable, reasoned).
- [ ] **Change detector** chosen per source: trusted marker → content-hash fallback; watermark/state table persisted.
- [ ] **CDC where available, poll-diff fallback**; id-set diff to detect deletes.
- [ ] **Delete path + tombstones** implemented and enforced — no orphaned chunks of deleted sources.
- [ ] **Dedup**: exact hash always; **MinHash+LSH** for near-dup at scale; keep-rule + dup→original lineage.
- [ ] **Metadata enrichment** at ingest incl. **ACL tags, timestamps, doc_version, embedding_model@version**; re-sync ACLs on permission change.
- [ ] **Lineage** `source→chunk→embedding` walkable both ways; `pipeline_run_id` on every mutation.
- [ ] **Freshness SLA** stated + measured + alerted; partition/archive stale chunks.
- [ ] **Re-embed = blue/green backfill** from raw store, alias swap, never sync in-place; checkpointed; capacity for BLUE+GREEN.
- [ ] **Quality gates** (schema/volume/dedup/recall/freshness) **before promotion**; fail closed.
- [ ] **Data contract** per source; validated at the boundary; violations → DLQ/alert.

---

## Anti-patterns

| Anti-pattern | Why it bites | Do instead |
|--------------|--------------|------------|
| **One-off ingest scripts** | not idempotent, not replayable, no lineage; breaks the day the source changes | durable queue + workers + state/watermark table |
| **Full re-embed synchronously, in place** | corpus offline for hours, no rollback, two models in one vector space mid-run | blue/green backfill from raw store + alias swap |
| **No delete / tombstone path** | deleted or retracted sources stay retrievable — correctness + compliance leak | hard-delete chunks + persist tombstone; enforce filter if soft |
| **Embedding on the ingest request thread** | blocks ingest, no backpressure, bursts drop work | queue + async batched workers |
| **No change detector (re-embed everything every run)** | burns embedding spend; can't meet a freshness SLA | trusted marker → content-hash gate; enqueue only changes |
| **No dedup / pairwise dedup at scale** | duplicate hits poison retrieval; O(n²) never finishes | exact hash always; MinHash+LSH for near-dup |
| **ACL metadata missing on chunks** | retriever can't pre-filter by caller → **downstream data leak** | stamp ACL tags at ingest; re-sync on permission change |
| **No freshness SLA** | corpus rots silently; users lose trust | state + measure + alert on freshness lag |
| **Losing lineage** | can't fan a source change to chunks, can't explain a citation, can't reproduce a run | persist source→chunk→embedding + run id + model version |
| **No quality gate before promote** | a bad run (volume cliff, schema drift, recall drop) goes live silently | validate before alias swap; fail closed |
| **Re-fetching sources to re-embed** | source may be gone/rate-limited; slow and fragile | backfill from the raw store |
| **Unmonitored DLQ** | poison docs accumulate; silent corpus gaps | alert on DLQ depth; triage + replay |
