# RAG Architecture — System Design, Topology & Trade-offs

The **system-design** view of Retrieval-Augmented Generation: pipeline shapes,
index topology, retrieval-time services, serving, governance, and cost. This is
*not* a chunking/embedding tutorial — the mechanics (chunk strategies, embedding
models, hybrid retrieval, reranking, eval metrics) live in the implementation
reference [`rag-patterns.md`](../../../development/ai/ai-engineer/references/rag-patterns.md).
Read that for the *how*; read this for the *where it runs, how it scales, and what
to decide*. Vendor and product names are examples — the patterns outlive them.

**Mental model — RAG is two pipelines that meet at an index.** A **write path**
(ingest → chunk → embed → upsert) runs mostly asynchronously and offline; a
**read path** (query → retrieve → rerank → assemble → generate) runs synchronously
under a latency SLO. They are coupled only through the index and its schema.
Design them as separate services with separate scaling profiles — the write path
is throughput-bound and bursty; the read path is latency-bound and steady.

```
   WRITE PATH (async, throughput-bound)         READ PATH (sync, latency-bound)
 ┌──────────────────────────────────────┐    ┌──────────────────────────────────┐
 │ source → queue → worker:              │    │ query → retrieval service:        │
 │   parse · chunk · embed · upsert      │    │   embed-query · ANN+BM25 · fuse   │
 └───────────────────┬──────────────────┘    │   · rerank · assemble · generate  │
                     │                        └─────────────────┬────────────────┘
                     ▼                                          ▼
              ┌────────────────────────────────────────────────────┐
              │   INDEX  (vectors + sparse + metadata + blob refs)   │
              └────────────────────────────────────────────────────┘
```

---

## 1. Ingestion / indexing pipeline architecture

### Batch vs streaming / CDC

| Mode | How | Best for | Cost of freshness |
|------|-----|----------|-------------------|
| **Batch** | Periodic full or delta re-index (nightly/hourly) | Static corpora; simple ops | Stale between runs |
| **Incremental delta** | Poll/diff changed docs, re-index only those | Most systems | Minutes–hours lag |
| **Streaming / CDC** | Change Data Capture (WAL/log, event bus) triggers per-doc re-index on edit | Live data, freshness SLA | Near-real-time; more infra |

The 2026 direction is away from nightly full rebuilds toward **event-driven
incremental indexing**: a document edit emits an event, only that document is
re-chunked and re-embedded. CDC off a source's change log (or an outbox/event bus)
is the low-friction way to get there without manual re-index triggers. Reserve full
re-index for embedding-model changes and schema migrations (see below).

### Where chunking/embedding run — sync vs async

Never embed on the ingest request thread. The canonical shape:

```
ingest API ──► durable queue ──► pool of stateless workers
  (validate,     (per-doc job,      (parse → chunk → embed → upsert)
   dedup-hash)    at-least-once)      scale workers on queue depth
```

- **Decouple with a queue** so ingest accepts fast and absorbs bursts; workers
  drain at their own rate. Queue depth is your autoscaling signal and your
  **backpressure** mechanism — when embedding (API rate limits) or the vector
  store (write throughput) saturates, the queue grows instead of dropping work.
- **Idempotency is mandatory.** Jobs are at-least-once; a worker may run twice.
  Key each chunk by `content_hash(source_id, chunk_index, text)` so a redelivery
  is a no-op upsert. Re-ingesting an unchanged document must cost nothing.
- **Per-document transactionality.** Treat a document's chunk set as a unit:
  on re-ingest, upsert new chunks then delete orphaned old ones (by `source_id`),
  so a doc never half-updates and leaves stale chunks retrievable.

### Re-embedding on model change

Swapping the embedding model (or its version) **invalidates the entire index** —
query and document vectors must come from the same model. This is the most
expensive RAG operation; never do it synchronously in place. Use a
**blue/green (shadow) reindex**:

```
 build GREEN index with new model  ──►  validate recall on golden set
        (BLUE keeps serving)                       │
                                                    ▼
                              canary % of read traffic → GREEN
                                  measure recall/precision delta
                                                    │
                                          cut over fully ─► retire BLUE
```

Shadow-rebuild + canary read routing lets you measure the quality delta before
cutover and roll back instantly. Version the index name with the model id
(`idx_v_<model>@<dim>`) so the read path binds to a known embedding contract.

---

## 2. Index topology

### Single shared index vs per-tenant / per-domain

| Topology | Isolation | Cost / ops | Best for |
|----------|-----------|-----------|----------|
| **Pool** — one index, `tenant_id` filter on every query | Logical (filter) | Cheapest; one thing to run | Many small tenants; SMB SaaS |
| **Silo** — one index/collection per tenant | Physical | Highest mgmt overhead | Regulated / large / "noisy-neighbour" tenants |
| **Bridge** — pool the long tail, silo the whales | Mixed | Balanced | Mixed customer base |

**Multi-tenancy is a correctness boundary, not a feature.** The Pool model's
`tenant_id` pre-filter must be **enforced at the query layer, applied always** —
a missing filter is a cross-tenant data leak, not a bug ticket. Prefer engines
that integrate the filter into the ANN traversal (pre-filter) over post-filter
(see `rag-patterns.md` §3). Silo gives blast-radius isolation and per-tenant
re-index/delete (and clean "right to be forgotten"), at the cost of N indices to
operate and weaker resource pooling — a single large tenant can also overwhelm a
shared Pool index, which is the usual trigger to promote it to a Silo.

```
   POOL                          SILO                      BRIDGE
 ┌──────────────┐        ┌──────┐ ┌──────┐ ┌──────┐    ┌──────────┐ ┌──────┐
 │ all tenants  │        │ T1   │ │ T2   │ │ T3   │    │ pooled   │ │ whale│
 │ +tenant_id   │        │ idx  │ │ idx  │ │ idx  │    │ (T1..Tn) │ │  T0  │
 └──────────────┘        └──────┘ └──────┘ └──────┘    └──────────┘ └──────┘
 cheap, leak-risk        isolated, costly           promote tenants on size
```

Per-**domain** (not per-tenant) splits — separate indices per corpus/knowledge
domain — are a different axis: they let you tune chunking/embedding per domain and
route a query to the right index, at the cost of cross-domain queries needing
fan-out + merge.

### Sharding, replication, hybrid infra

- **Shard** when the vector set outgrows one node's RAM (HNSW is memory-resident);
  shard by tenant or by hash, scatter-gather at query time. **Replicate** for read
  QPS and availability — vector reads are read-heavy and replicate cleanly.
- **Hybrid (vector + keyword)** is two indices logically: a dense ANN index and a
  sparse/BM25 index, fused at query time (RRF — see `rag-patterns.md` §4). They can
  be one engine (native hybrid) or two (e.g. vector store + a text engine);
  co-locating them avoids a cross-service hop per query.

---

## 3. Retrieval-time architecture

### Query service shape & reranker placement

The read path is a pipeline of stages, each a potential service boundary:

```
query ─► [embed query] ─► [ANN + BM25 retrieve] ─► [fuse] ─► [rerank] ─► [assemble] ─► [LLM] ─► answer+citations
            cache?            cache?                            ▲                          ▲
                                                          in-line OR                  streaming
                                                       separate rerank svc
```

- **Reranker placement.** In-line (a library/cross-encoder in the query service)
  minimises latency and ops for small/medium load. A **separate rerank service**
  (often GPU-backed) is worth it when the model is heavy, GPU-bound, or shared
  across query services — it scales independently and isolates GPU cost. Default
  in-line; extract when the reranker becomes the bottleneck or needs its own iron.

### Caching layers

| Cache | Keyed on | Hit saves | Invalidation |
|-------|----------|-----------|--------------|
| **Embedding cache** | text/content hash | re-embedding identical text | content-addressed → never stale |
| **Retrieval cache** | normalized query (+ filters + tenant) | ANN + fusion + rerank | TTL, or bust on index write to that tenant/domain |
| **Answer cache** | query (+ context fingerprint) | the whole pipeline incl. LLM | TTL; bust when sources change |
| **Semantic cache** | *embedding* of query (near-match) | pipeline on paraphrases | similarity threshold + TTL |

Semantic caching (serve a prior answer when a new query is near-identical in
embedding space) is a large lever — it can reduce LLM cost on repeat/similar
queries (savings are workload-dependent) — but it trades **freshness for cost**: a
cached answer can outlive the sources it cited.

### Freshness vs consistency

RAG is **eventually consistent** by nature: a document edited now is not retrievable
until re-embedded and upserted. Make that lag explicit and bounded:

- Pick a **freshness SLO** (e.g. "edits visible within N minutes") and size the
  ingest pipeline / choose batch-vs-CDC to meet it.
- Key caches so an index write **busts** dependent retrieval/answer entries for that
  tenant/domain — otherwise caches hide fresh data.
- Surface the **source date** in answers and carry a supersession story so a newer
  doc wins over a stale one (see `rag-patterns.md` §6) — the cheapest consistency
  story is making staleness *visible* rather than guaranteeing it away.

### Fallbacks — the "no answer" path

Retrieval can return nothing relevant; the LLM can be down or rate-limited. Design
the degraded paths explicitly:

- **Empty/low-confidence retrieval →** return "no sources found", never let the model
  answer ungrounded (the top RAG failure mode — `rag-patterns.md` §6/§9).
- **Reranker unavailable →** fall back to fused order (degrade precision, stay up).
- **LLM unavailable →** return ranked source snippets with citations (retrieval still
  has value without generation), and a clear error — not a fabricated answer.

---

## 4. Serving & integration

### RAG behind an API / gateway

Front the read path with an API gateway for **auth, rate limits, and per-tenant
quotas** — RAG queries are expensive (embed + ANN + rerank + LLM tokens), so quota
and rate limiting are cost-control, not just abuse-control. Meter per tenant and
attribute spend (see §6).

### Sync request/response vs streaming

- **Sync** (one response) is simplest; fine when generation is short and latency
  budget is loose.
- **Streaming** (SSE / chunked / WebSocket) ships tokens as the LLM produces them —
  much better perceived latency for long answers; citations stream or trail the text.
  Retrieval and rerank complete *before* the first token, so only the generation
  stage streams.

### The read path as a port/adapter

Keep the vector store and the LLM behind **ports** (interfaces) so the engine and the
model vendor are swappable — the business logic must not know whether it talks to
Qdrant or pgvector, Anthropic or a local model. This is the same boundary discipline
as [`architecture-patterns.md`](./architecture-patterns.md) §"leaky port boundary":
resolve auth/tenant/supersession facts **at the edge** and pass the retrieval port a
neutral, already-resolved value (ids, tenant, filters), not live RBAC/persistence
types. Re-embedding aside, switching vector engine or model becomes an adapter swap,
not a rewrite.

---

## 5. Governance & quality at scale

### Authorization on retrieved content — the hard one

**The retriever must never surface a chunk the caller is not allowed to read.**
This is the single most under-built RAG control. Two enforcement models:

| Model | How | Trade-off |
|-------|-----|-----------|
| **Pre-filter by ACL** | stamp each chunk with its doc's ACL (groups/roles); inject the caller's principals as a mandatory retrieval filter | Correct, scales; needs ACLs synced into index metadata at ingest |
| **Post-filter** | retrieve broadly, drop unauthorized hits after | Leaks via ranking/counts; can starve results; avoid as the *only* control |

Default to **pre-filter on ACL metadata**, resolved at the edge from the caller's
identity and passed into the query as a filter (same value-object discipline as §4).
Keep ACLs fresh in the index — a doc whose permissions changed must not remain
retrievable under the old ACL (re-index on permission change, or store a permission
version and re-check at the edge).

### Provenance, PII, audit

- **Provenance / citations propagate end-to-end.** Carry `source_id · title · page ·
  version · date` from chunk → context → answer so every claim is traceable. Citations
  are a governance artifact, not just UX.
- **PII:** detect/redact at ingest (it is cheaper and safer to never index PII than to
  filter it at read time); tag chunks carrying sensitive classes for policy filtering.
- **Audit:** log who queried what, which sources were retrieved, and what was answered —
  required for incident review and access-control proof. Treat the audit log as
  append-only.

### Eval & online-quality monitoring

Offline eval mechanics live in `rag-patterns.md` §7. At the system level, run
**continuous online monitoring** because RAG quality regresses silently:

- **Retrieval-quality regression:** track recall@k / "no-answer" rate against a golden
  set in CI as a release gate; alert on production drift.
- **Drift:** corpus drift (new doc types the chunker mishandles), query drift (users
  ask new things), embedding drift (model/version change). Watch citation
  click-through, thumbs, and "no sources found" rate as live signals.
- **Cost/latency SLOs** per stage as first-class telemetry.

---

## 6. Cost model

RAG cost is the sum of five drivers, two on the write path (mostly fixed/amortised)
and three on the read path (per-query, the ones that scale with traffic):

| Driver | Path | Scales with | Primary lever |
|--------|------|-------------|---------------|
| **Embedding compute (ingest)** | write | corpus size × re-embed frequency | content-hash dedup; avoid needless model swaps |
| **Vector + metadata storage** | write | chunks × dimension × replicas | smaller dims (MRL), quantization, fewer replicas |
| **Query embedding + ANN** | read | QPS | retrieval cache; `ef_search` tuning |
| **Rerank** | read | QPS × top-k | shrink top-k; cheaper reranker; cache |
| **Generation (LLM tokens)** | read | QPS × context size × model tier | the dominant cost — cut top-n, model-tier, semantic cache |

**Levers, by impact (re-measure quality after each — every cut trades against
recall):** raise **cache hit rate** (semantic/answer/retrieval) → cut **top-k/top-n**
(fewer passages into the LLM) → **tier models** (cheap model for easy queries, escalate
on demand) → shrink **index size** (dims, quantization). Generation tokens usually
dominate per-query spend, so anything that reduces context size or LLM calls (caching,
fewer/shorter passages) has outsized effect.

---

## 7. Architecture decision checklist

Run this when designing a RAG system:

- [ ] **Freshness SLO** stated → picks batch vs incremental vs CDC indexing.
- [ ] **Write path async** behind a durable queue; workers autoscale on depth.
- [ ] **Idempotent ingest** via content hash; per-document atomic upsert+orphan-delete.
- [ ] **Re-embedding plan**: blue/green shadow index + canary cutover; index name
      versioned with model id. (Never re-embed synchronously in place.)
- [ ] **Index topology** chosen: Pool / Silo / Bridge — justified by tenant size,
      isolation/compliance needs, and noisy-neighbour risk.
- [ ] **Tenant isolation** enforced at the query layer, always-applied — not by
      convention. Pre-filter, not post-filter.
- [ ] **Authorization on retrieval**: ACL pre-filter from caller identity; ACLs kept
      fresh in the index. Verified the retriever cannot leak unreadable docs.
- [ ] **Caching layers** defined with **invalidation/bust** rules tied to index writes.
- [ ] **Fallbacks**: "no sources found" path; reranker/LLM degradation paths.
- [ ] **Store + model behind ports**; facts resolved at the edge, neutral values passed in.
- [ ] **Gateway**: auth, per-tenant rate limit + quota; sync vs streaming decided.
- [ ] **Provenance** propagated end-to-end; PII handled at ingest; audit append-only.
- [ ] **Online monitoring**: retrieval-quality regression gate + drift + cost/latency SLOs.
- [ ] **Cost attribution** by stage; primary lever identified.

---

## 8. Anti-patterns

| Anti-pattern | Why it bites | Do instead |
|--------------|--------------|------------|
| **One giant index for all tenants, no enforced filter** | cross-tenant data leak; noisy-neighbour blast radius | Pool with always-applied `tenant_id` pre-filter, or Silo |
| **Re-embedding everything synchronously / in place** | corpus offline for hours; no rollback; invalidates live queries mid-run | blue/green shadow reindex + canary cutover |
| **Embedding on the request thread** | ingest blocks; no backpressure; bursts drop work | queue + async workers, autoscale on depth |
| **No freshness story** | answers silently stale; users lose trust | freshness SLO + CDC/incremental + cache-bust on write + visible source dates |
| **Retrieval that ignores caller authorization** | leaks documents the caller can't read | ACL pre-filter from identity; ACLs fresh in index |
| **Post-filter-only authorization** | leaks via counts/ranking; starves result sets | pre-filter integrated into ANN traversal |
| **No retrieval-quality monitoring** | quality regresses silently after a chunk/embed/prompt change | golden-set gate in CI + online drift alerts |
| **Caches with no invalidation** | serve stale answers past their source's edit | bust on index write; TTL; content-fingerprint answer cache |
| **Vector DB / model hard-wired into business logic** | engine/vendor switch becomes a rewrite | port + adapter; resolve facts at the edge |
| **Non-idempotent ingest** | at-least-once redelivery duplicates or half-updates docs | content-hash keys; per-document atomic replace |
| **Ungrounded fallback on empty retrieval** | model fabricates from parametric memory | return "no sources found" |
