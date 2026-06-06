# Vector DB Tuning — Index Choice · Parameters · Filtered Recall · EXPLAIN

The **DBA tuning view** of similarity search: getting an ANN index to return the
*right* rows *fast*, and reading the plan to prove it. Primarily **pgvector** (the
most common target), with notes on dedicated engines. Vendor-neutral; tool names
are examples, not endorsements.

This reference is about **index correctness + query latency/recall**. It does *not*
re-teach retrieval mechanics (chunking, embeddings, rerank, RRF) — see
[`rag-patterns.md`](../../../../ai/ai-engineer/references/rag-patterns.md) — nor
operational concerns (snapshots, replication, rebuild-under-load, capacity) — see
mlops [`vector-db-operations.md`](../../../../../operations/mlops/mlops-engineer/references/vector-db-operations.md).

**Mental model.** ANN trades exactness for speed: it returns *approximately* the
nearest neighbours. Every tuning knob moves a single slider — **recall ↔ latency**
(and, at build time, **build cost ↔ query speed**). There is no free recall; you pay
in build time, memory, or query latency. Tune against measured recall on *your*
data, not vendor defaults.

> **Volatility note.** pgvector defaults and feature availability change between
> releases. Figures below are current as of **pgvector 0.8.x** (mid-2026). Always
> re-confirm `SHOW <param>;` on your installed version before quoting a default —
> managed platforms (RDS/Aurora, Cloud SQL, Supabase, Neon) often ship older builds
> or pre-tuned GUCs.

---

## 1. HNSW vs IVFFlat — when each

Two index families ship with pgvector. Pick by **write pattern** and **memory budget**,
not by which benchmarks better in isolation.

| Dimension | **HNSW** (graph) | **IVFFlat** (inverted lists) |
|---|---|---|
| Recall/latency at a given QPS | Generally better | Lower |
| Build time | Slower | Faster |
| Build memory | Higher (graph in `maintenance_work_mem`) | Lower |
| Index size on disk | Larger | Smaller |
| **Needs data present to build well** | No — builds on empty/growing tables | **Yes** — `lists` clusters are learned from existing rows; build on a populated table |
| Incremental inserts after build | Handled natively | New rows go to nearest existing centroid; **cluster quality drifts**, eventually rebuild |
| Query knob | `hnsw.ef_search` | `ivfflat.probes` |

**Default to HNSW** for most workloads (read-heavy, quality-sensitive, growing
tables). **Reach for IVFFlat** when build time / index size / build memory are the
binding constraint *and* the dataset is large and relatively static, so you can
afford an occasional rebuild. Don't build IVFFlat on an empty table — the clusters
won't reflect the data.

---

## 2. HNSW parameters

| Param | Phase | Default (0.8.x) | Effect of raising |
|---|---|---|---|
| `m` | build | **16** | More neighbours per node → better recall, larger index, slower build |
| `ef_construction` | build | **64** | Larger build-time candidate list → better graph quality + recall, slower build. Must be ≥ `2 * m` |
| `hnsw.ef_search` | **query** | **40** | Larger query-time candidate list → higher recall, higher latency |

```sql
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Query-time recall/latency dial — session or transaction scoped:
SET hnsw.ef_search = 100;        -- raise until measured recall plateaus
```

- **`ef_search` is your primary live dial.** It is set *per session/transaction*, so
  you tune recall without rebuilding. Sweep it (e.g. 40 → 100 → 200), measure recall
  against an exact-kNN ground truth, and stop where recall plateaus — extra `ef_search`
  past that point is pure latency. `ef_search` must be ≥ `LIMIT` (k).
- **`m` and `ef_construction` are baked at build time.** Higher values cost build
  time and index size but raise the recall *ceiling*. Common stronger preset for
  high-recall needs: `m = 32, ef_construction = 128` (verify the cost on your data).
- Increasing `ef_search` can partly compensate for a cheaply-built graph at query
  time, but cannot fully recover recall lost to a too-small `m`.

---

## 3. IVFFlat parameters

| Param | Phase | Default (0.8.x) | Effect |
|---|---|---|---|
| `lists` | build | (none — you must choose) | Number of cluster centroids. More lists → finer clusters, fewer rows scanned per probe |
| `ivfflat.probes` | **query** | **1** | How many clusters are scanned per query → recall vs latency |

**`lists` rule of thumb (per pgvector docs):**

- Up to **~1M rows:** `lists ≈ rows / 1000`
- Above ~1M rows: `lists ≈ sqrt(rows)`

```sql
-- Build AFTER the table is populated:
CREATE INDEX ON items USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 1000);            -- ~1M rows

SET ivfflat.probes = 10;          -- query-time recall dial
```

- **`probes = 1` (the default) is almost always wrong for recall.** With one probe
  you scan a single cluster and miss neighbours that fell into adjacent clusters.
  A frequently-cited starting point is `probes ≈ sqrt(lists)`; tune up against
  measured recall.
- `lists` and `probes` interact: more `lists` means each cluster is smaller, so you
  generally need *more* probes for the same recall, but each probe is cheaper.
- IVFFlat recall degrades as the table grows away from the centroids learned at
  build time — schedule periodic `REINDEX` (an ops concern → see the mlops ref).

---

## 4. Distance operators — match the op to the model

The operator class in the index **must** match the operator in the query, and both
must match how the **embedding model** was trained (its intended distance metric and
whether vectors are normalized).

| Operator | Distance | Index op class (`vector`) | Use when the model… |
|---|---|---|---|
| `<->` | L2 (Euclidean) | `vector_l2_ops` | …is trained for Euclidean distance |
| `<=>` | Cosine | `vector_cosine_ops` | …measures angle / vectors not unit-normalized |
| `<#>` | **Negative** inner product | `vector_ip_ops` | …uses dot product (often with normalized vectors) |
| `<+>` | L1 (taxicab/Manhattan) | `vector_l1_ops` | …is trained for L1 |
| `<~>` / `<%>` | Hamming / Jaccard | (binary types) | binary/bit embeddings |

```sql
-- cosine model → cosine op class → cosine operator. All three agree:
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops);
SELECT id FROM items ORDER BY embedding <=> $1 LIMIT 10;
```

- **`<#>` returns the *negative* inner product** so that `ORDER BY ... <#> $1` still
  sorts ascending = "most similar first." Don't be surprised by negative scores.
- **Normalization matters.** If your model emits unit-normalized vectors, cosine and
  (negative) inner product rank identically — inner product is cheaper. If they are
  *not* normalized, cosine and dot product give **different** rankings; using the
  wrong one silently returns worse neighbours with no error.
- **A mismatched op is the single most common silent-quality bug.** The query runs,
  the index is used, results look plausible — and recall is quietly poor.

---

## 5. Hybrid search — index design (dense + lexical)

Hybrid = a **vector** path plus a **lexical** (full-text / BM25) path, results fused.
The DBA job is to provide *both* indexes and let the app fuse; the fusion math (RRF)
is a retrieval concern — see [`rag-patterns.md`](../../../../ai/ai-engineer/references/rag-patterns.md),
don't re-derive it here.

```sql
-- Vector path:
CREATE INDEX idx_items_vec ON items USING hnsw (embedding vector_cosine_ops);

-- Lexical path (Postgres native FTS):
ALTER TABLE items ADD COLUMN ts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', body)) STORED;
CREATE INDEX idx_items_ts ON items USING gin (ts);
```

- Run the two retrievals **separately**, each with its own `LIMIT` (over-fetch, e.g.
  top-50 each), then fuse the ranked lists in the app. Fusing *ranks* (RRF) avoids
  having to normalize incompatible score scales.
- For BM25-grade lexical scoring inside Postgres, extensions like `pg_search`/`VectorChord-bm25`
  exist; native `tsvector` + GIN is the dependency-free baseline. (Verify extension
  availability on your platform — many managed offerings restrict extensions.)
- **Don't try to express fusion as one clever SQL `ORDER BY`** mixing distance and
  `ts_rank` — the scales are incomparable and the planner can't use both indexes for
  one ordering. Two queries + RRF is the robust pattern.

---

## 6. Metadata pre-filtering — index design + the recall trap

The headline pitfall: **does the filter run before or after the ANN search?**

- **Post-filter (search-then-filter):** ANN returns its top-k by distance, *then* the
  `WHERE` drops rows that don't match. If the filter is selective, most of the k get
  thrown away and you return **far fewer than k** rows — silently starved recall.
  This is the classic "ANN index + selective `WHERE` = empty-ish result" trap.
- **Pre-filter (filter-then-search):** restrict the candidate set first, then do
  similarity. Correct for recall, but a plain ANN index can't natively restrict its
  graph/clusters to a subset.

pgvector's behaviour: with a `WHERE`, filtering is applied **after** the index scan,
so a selective filter starves results — *unless* you use **iterative scans** (§7).
Provide B-tree / partial indexes so the planner *can* choose to filter first when the
predicate is selective enough:

```sql
-- B-tree on the filter column (planner may pre-filter, then exact-scan if cheap):
CREATE INDEX idx_items_tenant ON items (tenant_id);

-- Partial vector index when one filter value dominates queries:
CREATE INDEX idx_items_vec_active ON items
  USING hnsw (embedding vector_cosine_ops)
  WHERE status = 'active';
```

- **Partial indexes** are the cleanest pre-filter for a small, fixed set of filter
  values (tenant, status, language): the ANN structure only ever contains matching
  rows, so post-filtering can't starve it.
- For **high-cardinality / arbitrary** filters, partial indexes don't scale (you'd
  need one per value) — lean on iterative scans (§7) plus over-fetch instead.
- A B-tree on the filter column lets the planner choose an exact filter-then-sort
  path when the predicate is selective *enough* that brute-forcing the survivors
  beats an ANN scan.

---

## 7. Iterative scans + over-fetch for filtered queries (pgvector 0.8+)

**Iterative index scans** (added in pgvector **0.8.0**) directly address the
post-filter starvation in §6: when a filtered query returns too few rows, the index
keeps fetching more candidates instead of giving up after one batch.

| Param | Default | Notes |
|---|---|---|
| `hnsw.iterative_scan` | `off` | `off` \| `strict_order` \| `relaxed_order` |
| `ivfflat.iterative_scan` | `off` | `off` \| `relaxed_order` (no strict mode) |
| `hnsw.max_scan_tuples` | ~20000 | Soft cap on tuples scanned per query |
| `hnsw.scan_mem_multiplier` | 1 | × `work_mem` budget; raise if `max_scan_tuples` alone doesn't recover recall |
| `ivfflat.max_probes` | (cap on probe growth) | If set below `ivfflat.probes`, the latter wins |

```sql
SET hnsw.iterative_scan = relaxed_order;   -- expand search until enough rows match
SET hnsw.max_scan_tuples = 40000;          -- allow scanning more before stopping
```

- **`relaxed_order`** — results are *approximately* distance-ordered; faster, good
  recall, the usual choice. **`strict_order`** — exact distance order, slightly slower,
  may yield fewer rows under filtering; use only when ranking precision is critical.
  (To re-impose exact order on a relaxed scan, wrap it in a materialized CTE and
  `ORDER BY` the distance in the outer query — verify on your version.)
- **Over-fetch regardless:** request more than you need (`LIMIT 50` for a top-10 UI)
  and trim after filtering/reranking. Over-fetch is the cheap, version-independent
  insurance against post-filter starvation.
- Place a **distance threshold** predicate *outside* a materialized CTE that contains
  the index scan (keep equality filters inside) — current docs recommend this shape
  so the executor doesn't fight the index. Confirm the exact phrasing for your release.

---

## 8. Reading EXPLAIN (ANALYZE) for vector queries

Always `EXPLAIN (ANALYZE, BUFFERS)`. The questions to answer, in order:

1. **Did the ANN index get used at all?** Look for `Index Scan using <hnsw/ivfflat index>`.
   A `Seq Scan` + `Sort` means brute-force exact kNN — correct but O(n); fine for tiny
   tables, a red flag at scale.
2. **Is the `ORDER BY ... <op> $1` the index's order?** The distance operator must
   match the index op class (§4) or the planner won't use the index for ordering.
3. **Where did the filter run?** A `Filter:` line *under* the index scan with a large
   `Rows Removed by Filter` is post-filter starvation (§6) — the count dropped after
   the ANN scan. Move toward partial index / pre-filter / iterative scan.

```text
Limit  (actual rows=4 loops=1)              -- asked for 10, got 4 → starved!
  ->  Index Scan using idx_items_vec on items
        Order By: (embedding <=> $1)
        Filter: (tenant_id = 42)
        Rows Removed by Filter: 36          -- 36 of 40 ANN hits discarded post-scan
```

- `actual rows` < your `LIMIT` on a `Limit`/`Index Scan` = the filter starved the ANN
  result. Fix with iterative scan, a partial index, or over-fetch.
- A `Seq Scan` where you expected the index → op-class/operator mismatch, or the
  planner judged seq cheaper (small table, or stats stale → `ANALYZE`).
- EXPLAIN shows the plan, **not recall**. Latency in the plan tells you nothing about
  whether the *right* neighbours came back — always pair EXPLAIN with a recall@k
  measurement against exact kNN.

---

## 9. Build-time tuning — memory & parallelism

| Setting | Why it matters for vector indexes |
|---|---|
| `maintenance_work_mem` | HNSW builds the graph in this budget. If it's too small, pgvector spills to **on-disk** graph construction — dramatically slower. Size it so the graph fits (commonly several GB for large tables). |
| `max_parallel_maintenance_workers` | Parallel HNSW build (pgvector 0.6+). More workers → much faster build (default workers = 2). A sensible target is ~½ CPU count. |
| `max_parallel_workers` / `max_parallel_workers_per_gather` | Ceilings the maintenance workers draw from — raise if you bump maintenance workers high. |

```sql
SET maintenance_work_mem = '8GB';
SET max_parallel_maintenance_workers = 7;   -- + the leader
CREATE INDEX CONCURRENTLY ... USING hnsw (...);   -- avoid the table-level write lock
```

- Build the index **after** bulk-loading rows, not before — building incrementally
  during a load is far slower.
- Parallel build has negligible effect on recall; it's a pure build-time win.
- IVFFlat builds are cheaper and memory-light but still benefit from running
  post-load (clusters need the data). `CONCURRENTLY` avoids blocking writes during
  the build (slower, but online).

---

## 10. Connection pooling for vector workloads

Vector queries are often **CPU-heavy** (distance math) and can hold larger `work_mem`
(iterative scans). That changes pooling math vs typical OLTP:

- A single high-`ef_search` / high-`probes` query can saturate a core. **Cap pool size
  near the box's core count**, not the hundreds of connections an I/O-bound OLTP app
  tolerates — otherwise concurrent vector scans thrash the CPU and tail latency explodes.
- Use a pooler (PgBouncer / built-in) in **transaction** mode, but remember
  session-scoped GUCs (`SET hnsw.ef_search`, `SET ivfflat.probes`) don't persist across
  transaction-pooled checkouts — set them **per transaction** (e.g. `SET LOCAL`) or
  bake them into the query path, or they silently fall back to defaults.
- Keep build-time GUCs (`maintenance_work_mem`) out of the app pool — set them on the
  maintenance connection that runs `CREATE INDEX`, not globally.

---

## 11. Tuning checklist

- [ ] Op class matches the operator matches the **model's** metric + normalization (§4).
- [ ] Index family chosen by write pattern + memory budget, not benchmark folklore (§1).
- [ ] **HNSW:** `ef_search` swept against measured recall@k; not left at 40 (§2).
- [ ] **IVFFlat:** `lists` by the rule of thumb; `probes` **raised off the default 1** (§3).
- [ ] Filtered queries: partial/B-tree index present, and iterative scan or over-fetch
      guards against post-filter starvation (§6, §7).
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` confirms the ANN index is used and `actual rows`
      meets the `LIMIT` after filtering (§8).
- [ ] Index built post-load with adequate `maintenance_work_mem` + parallel workers (§9).
- [ ] Pool size capped near core count; session GUCs set per-transaction under a pooler (§10).
- [ ] Recall measured against **exact kNN** ground truth — not assumed from latency (§8).

---

## 12. Anti-patterns

- **Leaving `ivfflat.probes = 1`** (the default). One cluster scanned → neighbours in
  adjacent clusters silently missed. Single biggest IVFFlat recall bug.
- **Tiny `ef_search`** (or never raising it past 40). Caps HNSW recall regardless of
  how well the graph was built.
- **Building HNSW with too-low `maintenance_work_mem`.** Spills to on-disk graph
  construction; builds crawl. Size the budget to the graph.
- **Post-filtering that starves recall.** Selective `WHERE` after an ANN scan returns
  far fewer than `LIMIT`. Fix with partial index / pre-filter / iterative scan / over-fetch.
- **Wrong distance op for the model** (cosine model queried with `<->`, or dot-product
  on un-normalized vectors). No error — just quietly worse neighbours.
- **Building IVFFlat on an empty/under-filled table.** Centroids learned from no data;
  recall is poor until rebuilt.
- **One mega-`ORDER BY` for hybrid** mixing distance and text rank. Incomparable scales;
  planner can't use both indexes. Two queries + RRF instead (§5).
- **Pooling vector workloads like OLTP** — hundreds of connections on a CPU-bound scan
  saturates cores and blows up tail latency (§10).
- **Trusting EXPLAIN latency as a quality signal.** Fast and wrong is still wrong;
  measure recall separately.
