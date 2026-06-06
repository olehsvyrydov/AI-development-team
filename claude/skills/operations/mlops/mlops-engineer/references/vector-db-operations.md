# Vector DB Operations — Running Vector Infra in Production

Operational playbook for the team that **keeps the vector store and embedding
serving alive**: deployment topology, sharding/replication, backup & DR, index
build/rebuild, capacity planning, embedding-model serving, monitoring, rollout,
and cost. Vendor-neutral; product names are examples, not endorsements, and
ops surfaces move fast — **verify volatile numbers against current docs** before
you size a cluster on them.

**This file is the OPS lane only.** It deliberately does *not* re-teach:

- **Retrieval mechanics** (chunking, embeddings, rerank, the RAG funnel) →
  `../../../../development/ai/ai-engineer/references/rag-patterns.md`
- **System topology / where the vector store sits in the larger design** →
  `../../../../architecture/solution-architect/references/rag-architecture.md`
- **Corpus ingestion / CDC / re-embedding data pipelines** →
  `../../../../development/data/data-engineer/references/rag-corpus-pipelines.md`
- **Index *parameter* tuning** (`m`, `ef_construction`, `ef_search`, recall/latency
  knobs) → `../../../../development/data/dba/dba/references/vector-db-tuning.md`

If your question is "what value should `ef_search` be?" you are in the wrong file
(go to tuning). If it is "how do I rebuild the index without taking the node
down?" you are in the right one.

---

## 1. Deployment topology — embedded vs. dedicated

The first operational fork: vectors **inside your existing OLTP database**
(pgvector in Postgres) vs. a **dedicated vector engine** (Qdrant, Weaviate,
Milvus, …). This is an *ops* decision before it is a performance one.

| Concern | pgvector-in-Postgres | Dedicated vector engine |
|---|---|---|
| Backup / PITR | Reuses existing Postgres backups & WAL/PITR | New, separate backup tooling to learn & test |
| HA / replication | Existing streaming replication & failover apply | Engine-native replication factor / Raft / CDC standby |
| Resource isolation | Index build & ANN queries **compete** with OLTP load | Vector workload isolated on its own nodes |
| Operational surface | One system to monitor, patch, secure | Two systems; two on-call runbooks |
| Scale ceiling | Comfortable into **low-to-mid single-digit millions** of vectors (verify for your dims/index) | Built for very large ANN, horizontal sharding |
| Transactional joins | Vectors + relational rows in one ACID query | Cross-store joins must be done in the app |

**Rule of thumb (hedge it):** if you are *already on Postgres*, your corpus is in
the low millions, and you want minimal new ops surface → start with pgvector and
inherit its backup/HA/monitoring for free. Move to a dedicated engine when vector
queries **dominate** the workload, you are pushing well past single-host RAM, or
index builds are starving OLTP latency. Don't run two databases until one
genuinely can't cope — the second system is permanent ops cost, not a free lunch.

---

## 2. Sharding & replication

Two orthogonal axes — keep them separate in your head:

- **Sharding** = split *one* logical collection across nodes → scales **capacity**
  and write/query throughput. Costs cross-shard fan-out per query.
- **Replication** = keep *N copies* of each shard → buys **availability** and read
  throughput. Costs N× storage and write amplification.

**Operational guidance**

- **Replication factor ≥ 2 in production** is the common floor; with 3+ nodes and
  RF ≥ 2 the cluster typically survives a single node loss without restoring from
  backup. Replication is **not** a backup — it faithfully replicates a bad delete.
- **Over-shard early.** Choose a shard count that factorizes into your likely node
  counts (e.g. a 12-shard collection rebalances cleanly across 1/2/3/4/6/12 nodes)
  so you can scale out **without resharding**. Resharding a live collection is
  expensive and often a managed-tier-only or manual-migration operation.
- **Distributed engines run consensus** (e.g. Raft) for cluster/metadata state;
  understand that membership changes, snapshot transfer, and rebalancing are
  consensus operations that consume IO/CPU — schedule them off-peak.
- pgvector "sharding" is **Postgres sharding** (partitioning / Citus-style), with
  all the usual relational-shard caveats — there is no vector-specific magic.

---

## 3. Backup / restore + disaster recovery

The single most-skipped, most-regretted area. **A backup you have never restored
is a rumor.**

### Mechanisms

| Mechanism | What it gives you | Cost / caveat |
|---|---|---|
| **Snapshots** | Point-in-time copy of collection/shard data + index | Per-snapshot storage; engine may pause/affect IO during capture |
| **Incremental snapshots** | Only changed data since last snapshot | Cheaper retention; restore chains a base + deltas |
| **PITR (pgvector)** | Restore Postgres to any second via WAL | Inherited free if you already run Postgres PITR |
| **CDC / standby cluster** | Warm replica seconds behind primary | Near-zero RPO; standby can also serve reads |
| **Rebuild-from-source** | Re-embed + re-index from the source corpus | Slowest RTO; the **ultimate** backstop — see below |

### DR posture

- Define **RPO** (how much data you can lose) and **RTO** (how long to recover)
  *before* picking a mechanism. Snapshots → minutes-to-hours RPO; CDC standby →
  seconds RPO; rebuild-from-source → hours-to-days RTO but near-zero data-loss if
  the source corpus is itself durable.
- **The vector store is usually a derived store.** If you retain the source
  documents *and their embeddings input* durably (object store, OLTP), you can
  always rebuild — treat the vector index as a **cache you can regenerate**, not
  the system of record. This dramatically de-risks DR, but only if rebuild is
  rehearsed and its cost/time is known.
- **Restore-test on a cadence** (e.g. quarterly): restore a snapshot into an
  isolated env, run a held-out recall check, confirm row counts and dimensions.
- Keep backups **off the primary host / cross-region** for real disaster coverage;
  a snapshot on the same disk that died protects nothing.

---

## 4. Index build / rebuild operations

When do you pay the build cost, and where?

### Build-time vs. query-time trade-off (ops framing)

- A richer graph (more neighbors / higher construction effort) → **slower, more
  RAM-hungry build** but faster, higher-recall queries. The *parameters* live in
  the tuning ref; the **operational fact** is that a rebuild is a heavy,
  memory-intensive batch job that can run for hours and contend with live traffic.
- **HNSW builds are memory-intensive** — they hold the graph in RAM; an
  under-provisioned build OOMs or spills. Size build RAM separately from steady
  state.

### Online vs. offline rebuild

| Strategy | Pro | Con |
|---|---|---|
| **In-place rebuild on live node** | Simplest | Starves production queries of CPU/RAM; **anti-pattern** for large indexes |
| **Build offline, then swap (alias/blue-green)** | No live contention; clean rollback | Window where new writes miss the building index; needs a catch-up step |
| **Dual-write to old + new index** | No miss window | Doubles write cost + memory during transition |
| **Incremental insert** (some engines / HNSW) | No big-bang rebuild | Graph quality can drift; periodic full rebuild still advisable |

**Operational defaults**

- For anything beyond a toy index, **build off the hot path**: a staging
  table/collection or a replica, then atomically swap via an alias. Don't `REINDEX`
  the table production is reading from.
- **Parallelize the build** where the engine supports it (e.g. pgvector parallel
  workers materially cut build time) — but each worker adds RAM pressure, so
  budget `workers × per-worker memory`.
- A rebuild is triggered by: parameter retune, dimensionality/model change, recall
  decay, or corruption. Treat each as a **planned, monitored operation**, not an
  ad-hoc `CREATE INDEX` at 2pm.

---

## 5. Capacity planning

Get RAM right and everything else follows; get it wrong and queries silently fall
off a cliff when the graph spills to disk.

### RAM for HNSW (rough, verify per engine/dims)

A first-order estimate for keeping vectors **in memory**:

```
raw_vectors ≈ N × D × bytes_per_component
   f32 → 4 bytes/component;  int8 → 1;  binary → 1 bit
graph_overhead ≈ N × M × (link size)   # neighbor links + metadata
total ≈ (raw_vectors + graph_overhead) × headroom_factor   # ~1.5–2× for metadata/temp segments
```

- A common shorthand is **f32 footprint ≈ N · D · 4 bytes, then ×1.5–2** for graph
  + metadata + build temporaries. Treat as an **order-of-magnitude** figure and
  measure your own.
- **Graph overhead is independent of quantization** — quantizing vectors to int8
  shrinks the *vector* bytes (~4× smaller) but the neighbor-link graph stays the
  same size. Don't assume int8 cuts total RAM by 4×.
- When the graph **exceeds RAM**, every traversal hits disk and p99 explodes. The
  saturation point is a cliff, not a slope — alert *before* you reach it.

### Quantization for footprint (ops view)

| Mode | Approx. RAM vs. f32 | Trade |
|---|---|---|
| f32 | 1× (baseline) | Highest recall, highest RAM |
| int8 (scalar) | ~¼ of vector bytes | Small recall hit; common production default |
| binary (1-bit) | drastic reduction | Large recall hit; usually paired with a rescoring pass |

Quantization is a **capacity lever**, not free — it trades recall for footprint.
Validate recall on a held-out set after enabling it (see §7). Disk and the source
corpus also need planning; the index is only one tier.

---

## 6. Embedding-model serving

The vector store is half the system; the **embedder** that turns text into vectors
is the other half, and it has its own ops profile.

### Self-host vs. API

| Axis | Self-host (vLLM / TEI / TGI / TensorRT-LLM …) | Managed API |
|---|---|---|
| Cost at scale | Lower $/token at high, steady volume | Pay-per-call; cheap at low/bursty volume |
| Latency control | You own batching, hardware, SLO | Subject to provider latency & limits |
| Ops burden | GPU fleet, autoscaling, upgrades, on-call | Provider runs it |
| Data residency | Stays in your boundary | Leaves your boundary |
| Cold start | You manage warm pools | Provider's problem |

**Serving guidance**

- **Batch for throughput.** Embedding is embarrassingly batchable; dynamic/inflight
  batching on a GPU server (TEI, vLLM, TensorRT-LLM) lifts throughput several-fold
  over one-at-a-time calls. Separating tokenization from inference (pipeline the
  two stages) is a known throughput win.
- **Quantize the serving model** (int8/fp8/bf16) to raise throughput and cut GPU
  RAM, **after** confirming embedding quality holds on your eval set.
- **Set a latency SLO and a fallback.** Self-hosting an embedder with no SLO and no
  fallback is an availability time-bomb: a GPU node dies and ingestion + query
  embedding both stall. Always have a **fallback model/provider** (even a slower
  hosted API) and a circuit breaker.
- **Pin the embedding model version** and record it alongside every vector —
  query-time and index-time embeddings **must** come from the same model or recall
  collapses (see §8 versioning).

> Throughput multipliers between serving stacks (TEI vs. vLLM vs. TensorRT-LLM)
> move with every release and depend heavily on GPU + sequence length — benchmark
> on **your** workload, don't trust a blog's headline number.

---

## 7. Monitoring & alerting

You cannot operate what you don't measure. Vector infra needs **both** systems
metrics and **quality** metrics — the latter is the one teams forget.

### Signals to track

| Category | Metric | Why / alert on |
|---|---|---|
| Latency | query **p50 / p95 / p99** | SLA baseline is usually p95 or p99; alert on sustained breach |
| Quality | **recall@k vs. held-out set** | Catches silent retrieval rot; alert on drift below threshold |
| Quality | **mean/variance of top-k similarity scores** over time | Cheap drift proxy — falling mean / rising variance = degrading |
| Capacity | **index size / RAM resident vs. host RAM** | Alert *before* the graph spills to disk |
| Saturation | CPU, RAM, disk IO, GPU util (embedder) | Classic saturation alerts |
| Throughput | queries/s, ingest/s, embed batch latency | Capacity trend + regressions |
| Replication | replica lag, shard health, consensus state | Detect split-brain / failover readiness |

### Quality drift (the hard one)

- Keep a **golden held-out eval set** (queries with known-relevant docs) and run
  recall@k on a schedule. A drop means *something* shifted: corpus distribution,
  embedding model, index params, or data corruption.
- Watch the **similarity-score distribution** of live queries as a no-labels proxy
  — it's cheaper than a labeled set and catches gross drift early.
- Drift sources: data distribution shift, an embedding-model change, index
  degradation from heavy incremental inserts. Diagnose before you reach for a full
  re-embed (which is the expensive hammer).

---

## 8. Rollout & versioning of indexes

Treat an index like a deployable artifact, not a mutable blob.

- **Alias / blue-green indexes.** Name indexes with `model_version + date`
  (e.g. `docs_v2_2026_06`) and point a stable **alias** at the live one. Promote by
  flipping the alias; roll back by flipping it back. Mutating in place destroys your
  rollback target — **anti-pattern**.
- **Model upgrades need a re-embed.** A new embedding model = new vector space;
  v1 and v2 vectors are **not comparable**. Options, cheapest-RTO last:
  - **Dual-index serving** during transition (run v1 + v2, route by doc age or
    cohort, sunset v1 only after v2 wins in production).
  - **Rolling reindex** (re-embed by activity/recency over a window).
  - **Full re-embed + swap** (simplest mental model, highest compute cost).
- **Carry the model version in metadata** on every vector so you can audit which
  embedder produced it and detect mixed-version contamination.

---

## 9. Cost optimization levers

Ordered roughly cheapest-to-apply first:

1. **Quantize** vectors (int8/binary) → less RAM/disk, smaller (cheaper) nodes.
2. **Right-size replication factor** — RF=3 triples storage; use 2 unless
   availability math demands more.
3. **Tier storage** — keep hot vectors in RAM, push cold/archival to disk-backed
   or on-demand tiers where the engine supports it.
4. **Batch embedding** to maximize GPU/throughput per dollar; avoid one-call-per-doc.
5. **Self-host the embedder only at sustained high volume** — below the break-even,
   a pay-per-call API is cheaper and has no idle GPU bill.
6. **Use DR/standby for reads** — route batch/analytics or low-priority reads to the
   standby so the DR box isn't idle insurance.
7. **Cap index growth** — TTL/prune stale vectors; an unbounded index is unbounded
   RAM spend (see anti-patterns).

---

## 10. Multi-tenant operational isolation

When many tenants share one cluster, isolation is an **ops + cost** problem, not
just a security one (security boundary lives in the architecture/security refs).

- **Logical isolation** — namespaces / partitions / per-tenant filters in a shared
  collection. Cheapest; scales to many tenants; risks the **noisy-neighbor**
  problem (one heavy tenant degrades everyone and forces the *whole* cluster to
  scale).
- **Physical isolation** — dedicated shard/replica/cluster per tenant. Strong
  isolation and per-tenant SLA, but worst density/cost and operationally heavy.
- **Tiered / hybrid** — keep most tenants in a shared pool, **promote** a large or
  latency-sensitive tenant to a dedicated shard on demand. Best density-vs-isolation
  balance; increasingly the recommended pattern.
- **Guardrails regardless of model:** per-tenant **rate limiting**, **priority
  queues**, and **quotas** so no single tenant monopolizes CPU/RAM or triggers
  cluster-wide autoscaling on everyone else's bill.

---

## Runbook checklist (pre-prod / steady-state)

**Before going live**
- [ ] Backup mechanism chosen, automated, **and a restore actually rehearsed**
- [ ] RPO/RTO written down and matched to the backup/DR mechanism
- [ ] Replication factor ≥ 2 (or documented justification)
- [ ] RAM sized for vectors + graph + build headroom; alert set *below* spill point
- [ ] Index rebuild runs **off the hot path** (staging/replica + alias swap)
- [ ] Embedding model **version pinned** and stored in vector metadata
- [ ] Embedder has a **latency SLO + fallback** model/provider + circuit breaker
- [ ] Golden held-out recall eval wired into monitoring
- [ ] p50/p95/p99, index size, replica lag, saturation dashboards + alerts live
- [ ] Index uses **alias/blue-green** naming for swap & rollback
- [ ] Multi-tenant rate limits / quotas in place (if shared cluster)

**On a cadence**
- [ ] Restore-test from backup into an isolated env (e.g. quarterly)
- [ ] Recall@k vs. golden set reviewed for drift
- [ ] Capacity trend reviewed vs. RAM ceiling; plan shard/quantize before the cliff
- [ ] Stale-vector pruning / TTL confirmed working

---

## Anti-patterns

1. **No backups / no DR.** Replication is not a backup; it replicates your mistakes.
   A snapshot never restore-tested is a rumor.
2. **Rebuilding the index on the live node.** A multi-GB, multi-hour, RAM-hungry
   build contending with production queries — build offline and swap.
3. **No recall monitoring.** Tracking only latency lets retrieval quality rot
   silently; users get worse answers and your dashboards stay green.
4. **Unbounded index growth.** No TTL/pruning → RAM creeps until the graph spills to
   disk and p99 falls off a cliff overnight.
5. **Self-hosting an embedder with no latency SLO / no fallback.** One GPU node dies
   and both ingestion and query-embedding stall with no escape hatch.
6. **Mutating an index in place** with no alias/versioning → no rollback target when
   a rebuild or model swap goes wrong.
7. **Mixing embedding-model versions** in one index → silent recall collapse from
   incompatible vector spaces.
8. **Assuming quantization quarters total RAM.** Graph overhead doesn't shrink; only
   the vector bytes do — and recall drops, so validate it.
9. **Running two databases (OLTP + dedicated vector) before one actually can't
   cope.** The second system is permanent ops cost, not a free performance upgrade.
10. **Ignoring the noisy neighbor** in shared multi-tenant clusters — no per-tenant
    rate limits/quotas means one tenant scales the bill for all.

---

*Cross-references (read, don't duplicate): retrieval mechanics →
`../../../../development/ai/ai-engineer/references/rag-patterns.md`; system topology →
`../../../../architecture/solution-architect/references/rag-architecture.md`;
corpus/CDC pipelines → `../../../../development/data/data-engineer/references/rag-corpus-pipelines.md`;
index parameter tuning → `../../../../development/data/dba/dba/references/vector-db-tuning.md`.*
