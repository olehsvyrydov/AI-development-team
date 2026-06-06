# RAG Patterns — Chunking · Embeddings · Retrieval · Reranking · Context · Eval

Practical, vendor-neutral patterns for production RAG. Pair with the `ai-engineer`
SKILL.md (this expands its one-line "RAG" bullet). Tool names are examples, not
endorsements — the patterns outlive any specific product.

**Mental model — RAG is a funnel.** Each stage trades recall for precision:
*chunk* (units) → *embed* (vectors) → *retrieve* (cast a wide net, high recall) →
*rerank* (tighten to high precision) → *assemble* (budget the context window) →
*generate* (grounded answer + citations) → *evaluate* (measure every stage, not
just the end). A weak early stage caps every later one: the generator cannot cite
what retrieval never surfaced. Measure retrieval **separately** from generation.

---

## 1. Chunking

The unit you index is the unit you retrieve. Get this wrong and nothing downstream
recovers.

### Strategies

| Strategy | How | Best for |
|----------|-----|----------|
| **Fixed-size** | N tokens, hard cut | Baseline; uniform prose |
| **Recursive** | Split on separators (¶ → sentence → word) until under size | Strong default — keeps natural boundaries |
| **Semantic** | Split where embedding similarity between adjacent sentences drops | Topic-shifting docs; costs an embedding pass |
| **Parent-child (small-to-big)** | Index small children; return the larger parent at retrieval | Precise matching + rich context |
| **Layout-aware** | Split on structure (Markdown headings, code blocks, table rows) | Mixed/structured docs |

**Reality check.** Recursive splitting is a hard-to-beat default — benchmarks
regularly place a well-tuned recursive splitter at or above semantic chunking
despite the latter's cost. Reach for semantic/parent-child only when you can show
recursive is the bottleneck. Don't cargo-cult "semantic is best."

### Size & overlap

- **Start at 256–512 tokens, 10–20% overlap** (~50–100 tokens for a 512-token chunk).
- **Smaller chunks** → sharper matches, more chunks, more risk of losing context.
- **Larger chunks** → more context per hit, but dilute the embedding (one vector
  averaging many topics → fuzzy matches) and burn context budget.
- **Overlap** prevents answers being severed at a boundary; too much inflates the
  index and duplicates hits.
- Tune size against your **embedding model's** effective context and your
  **answer** granularity — a "what's the config value?" corpus wants smaller
  chunks than a "summarize this policy" corpus.

### Layout-aware splitting

- **Markdown/HTML:** split on headings; carry the heading path into metadata so a
  retrieved chunk knows its section.
- **Code:** split on function/class boundaries (AST or language-aware splitter), not
  raw lines — a half-function is useless.
- **Tables:** keep rows intact; serialize each row with its header, or store the
  whole table as one chunk plus a text summary for matching.
- **PDF/slides:** preserve page/slide number and reading order; OCR or VLM-caption
  images before chunking so figures are searchable.

### Metadata to attach (always)

`source_id`, `title`, `section/heading path`, `page/slide`, `created/modified
date`, `author/owner`, `doc_type`, `tenant/space_id`, `version`, and the
`chunk_index` + `parent_id`. This metadata powers **pre-filtering**, **recency**,
**multi-tenancy isolation**, and **citations**. Cheap to store, expensive to
retrofit — capture at ingest.

### Advanced: contextual chunks

Prepend a short, LLM-generated blurb situating each chunk in its document
("This excerpt is from the Q3 refund-policy section, covering EU returns…") before
embedding (the "contextual retrieval" pattern). Materially lifts recall on chunks
that are ambiguous in isolation, at the cost of one cheap LLM call per chunk at
ingest — use prompt caching over the shared document to keep it affordable.

---

## 2. Embeddings

### Model selection

| Axis | Trade-off |
|------|-----------|
| **General vs domain** | General models (broad benchmarks) are fine for most corpora; fine-tune or pick a domain model only when jargon (legal, medical, code) demonstrably hurts recall |
| **Dimension** | Higher dims ≈ marginally better recall but more storage, RAM, and slower search. Many modern models support **Matryoshka (MRL)** truncation — drop to 256–512 dims for large savings with modest quality loss (the loss grows as you truncate harder, and is more pronounced for high-dim models at the 256 end — verify on your eval set) |
| **Cost / latency** | Hosted APIs: per-token cost + network hop. Local (ONNX/GPU): no per-call cost, you own the latency and ops |
| **Context length** | Must comfortably exceed your chunk size |
| **License / hosting** | API vs self-host changes your data-residency and cost story |

**Picking one:** shortlist from a current public benchmark (e.g. MTEB) **for the
retrieval task**, then re-rank candidates on *your* golden set — leaderboard order
rarely matches your corpus. Pin the version; an embedding-model swap invalidates
the whole index (you must re-embed everything).

### Practical rules

- **Normalize** vectors (L2) and use cosine/dot consistently across index and query.
- **Query/document asymmetry:** many models expect an instruction or prefix
  (e.g. distinct "query:" / "passage:" prefixes, or a task instruction). Using the
  wrong mode silently degrades recall — follow the model card exactly, and embed
  queries and documents the **same way you'll** compare them.
- **Multilingual:** use a multilingual model if queries and docs cross languages;
  don't assume an English-tuned model transfers.
- **When to fine-tune:** only after a strong off-the-shelf model + reranker plateaus
  on your eval set, and you have labeled query→relevant-chunk pairs. Fine-tuning is
  the last lever, not the first.

---

## 3. Vector storage & indexing

### ANN index families

| Index | Idea | Pros | Cons |
|-------|------|------|------|
| **HNSW** | Navigable small-world graph | High recall, fast queries, handles incremental writes | More RAM; slower build |
| **IVFFlat** | Cluster into lists, search nearest lists | Cheaper to build, less RAM | Needs training data; weaker recall; must re-train as data grows |

**Default to HNSW** unless the dataset is huge and mostly static. Key knobs
(names vary by engine, concepts don't):

- **HNSW `m`** — neighbors per node (≈16 default; 16–64 range). Higher → better
  recall, more memory/build time.
- **HNSW `ef_construction`** — build-time candidate list (≈64 default; 200+ for
  quality). Higher → better graph, slower build.
- **HNSW `ef_search`** (a.k.a. `ef`) — query-time candidates. The main recall/latency
  dial **at query time** — raise it if recall is low.
- **IVFFlat `lists`** — number of clusters; **`probes`** — clusters searched per
  query. The default `probes=1` gives terrible recall — set 10–50.

### pgvector vs dedicated stores (conceptual)

- **pgvector (Postgres):** one datastore for rows + vectors + metadata; transactional;
  great when data is modest and you already run Postgres. Supports HNSW and IVFFlat.
  Hybrid search means pairing it with Postgres full-text (`tsvector`/BM25-ish).
- **Dedicated stores (Qdrant, Weaviate, Milvus, …):** purpose-built ANN, native hybrid
  (dense + sparse in one query), advanced **pre-filtering**, quantization, sharding,
  multi-tenant collections, and named/multi-vector support. Pick when scale, hybrid,
  or filtering performance outgrows Postgres.

Choose on operational fit (scale, existing stack, filtering needs), not hype. Keep
the store behind a **port/interface** so it's swappable — re-embedding aside, the
business logic shouldn't know which engine it talks to.

### Metadata filtering & multi-tenancy

- **Pre-filter** (filter *during* the ANN search) beats **post-filter** (retrieve
  then drop): post-filtering can return too few results when the filter is selective.
  Mature engines integrate filters into the graph traversal.
- **Multi-tenancy:** isolate tenants by a partition/collection/namespace **or** an
  always-applied `tenant_id` filter. A missing tenant filter is a data-leak bug —
  enforce it at the query layer, not by convention.

---

## 4. Retrieval

### Dense vs sparse vs hybrid

| Mode | Strength | Weakness |
|------|----------|----------|
| **Dense (vectors)** | Synonyms, paraphrase, intent | Misses exact tokens (IDs, codes, rare names) |
| **Sparse (BM25)** | Exact terms, rare tokens, short queries | No semantic understanding |
| **Hybrid** | Both — they fail in orthogonal ways | Slightly more infra/tuning |

**Default to hybrid.** It reliably lifts recall (commonly 15–30%) over either alone.
Sparse matters more on small/jargon-heavy corpora; dense's edge grows with corpus size.

### Fusion

Combine the two ranked lists with **Reciprocal Rank Fusion (RRF)**: each doc scores
`Σ 1/(k + rank)` across lists (`k≈60`). RRF fuses **ranks, not scores**, so it sidesteps
the unsolvable problem of normalizing BM25 magnitudes against cosine similarities.
Weighted score-combination is an alternative when both retrievers are well-calibrated,
but RRF is the robust default.

```
dense_results  ─┐
                ├─► RRF (k≈60) ─► fused top-N ─► rerank
sparse_results ─┘
```

### Query transformation

Run *before* retrieval to bridge the gap between how users ask and how docs are written:

- **Multi-query:** LLM generates several paraphrases; retrieve for each; union/RRF the
  hits. Cheap recall boost for vague queries.
- **HyDE:** LLM drafts a *hypothetical answer*, embed **that** (not the question) — a
  fake answer often sits closer to real answer chunks than the question does. Risk: if
  the model hallucinates off-topic, retrieval drifts.
- **Decomposition:** split a multi-part question into sub-questions, retrieve per
  sub-question, synthesize. For "compare X and Y" or multi-hop queries.
- **Step-back:** abstract to a broader question first to pull in foundational context.

These cost extra LLM calls and latency — gate them behind query-type detection rather
than running all of them on every query.

### Diversity (MMR)

When top hits are near-duplicates, **Maximal Marginal Relevance** re-selects results to
balance relevance against novelty, so the context isn't five paraphrases of one fact.
Useful before assembly when your corpus is redundant.

---

## 5. Reranking

Retrieval optimizes recall (cast a wide net, top-k 20–100). Reranking restores
precision: a heavier model rescores each candidate against the query and you keep the
best top-n (3–10).

| Reranker | How | Trade-off |
|----------|-----|-----------|
| **Cross-encoder** | Query+passage encoded *together* → one relevance score | Strong on negation/subtle constraints; ~tens of ms for ~20 docs; runs local or via API |
| **LLM-as-reranker** | Prompt an LLM to score/order passages | Best when relevance needs *reasoning*; far slower (seconds) and pricier |

**Where it sits:** after fusion, before context assembly. The dominant production
pattern is *hybrid retrieve top-k (20–100) → cross-encoder → keep top-n (3–10)*. Reach
for an LLM reranker only when a cross-encoder can't capture the needed reasoning.

**Tuning:** widen retrieval **top-k** until recall@k saturates (the reranker can't
recover what was never retrieved), then shrink rerank **top-n** to the minimum the
generator needs — every extra passage costs tokens and invites distraction.

---

## 6. Context assembly

Retrieval found the chunks; assembly decides what actually enters the prompt.

- **Budget the window.** Reserve tokens for system prompt, the question, and the
  answer. Bigger context ≠ better — more passages raise cost, latency, and distraction.
  Fit the *fewest* high-precision chunks that answer the question.
- **Dedup & merge.** Drop near-identical chunks (MMR or hashing); merge adjacent chunks
  from the same source for readability.
- **Order for "lost in the middle."** LLMs attend most to the **start and end** of long
  context and neglect the middle — accuracy can drop sharply when the key passage sits
  in the middle. Put highest-ranked passages first and last; bury weaker ones in the
  middle.
- **Cite & ground.** Carry each chunk's `source_id`/`title`/`page` through to the answer
  and require the model to cite. If retrieval returns nothing relevant, return **"no
  answer / no sources found"** rather than letting the model answer ungrounded —
  ungrounded answers are the top RAG failure mode.
- **Freshness/recency.** When facts change over time, prefer recent sources: filter or
  boost by date, and surface the source date so stale answers are visible. Have a
  supersession story (a newer doc should win over an outdated one).

---

## 7. Evaluation

**Measure retrieval and generation separately** — most teams skip retrieval metrics and
then can't tell whether a bad answer is a retrieval miss or a generation failure.

### Retrieval metrics (need a golden set: query → relevant chunk IDs)

| Metric | Asks |
|--------|------|
| **Recall@k** | Did the relevant chunks make the top-k? (the ceiling on everything downstream) |
| **Precision@k** | How much of the top-k is actually relevant? |
| **MRR** | How high did the *first* relevant chunk rank? |
| **nDCG@k** | Are relevant chunks ranked well, graded by relevance + position? |
| **Context precision / recall** | (RAGAS-style) Are retrieved chunks relevant, and do they contain everything needed? |

### Generation metrics (LLM-as-judge)

- **Faithfulness / groundedness** — is every claim supported by the retrieved context?
  (the hallucination guard).
- **Answer relevance** — does the answer address the question?
- **Answer correctness** — vs a reference answer, where you have one.

### Doing it well

- **Build a golden set** of representative queries with expected sources/answers; grow it
  from real traffic and every production failure. This is the highest-leverage RAG asset.
- **RAGAS-style + LLM-judge** automates generation scoring, but guard the judge:
  pin the judge model/prompt, calibrate against human labels on a sample, watch for
  position/verbosity bias, and remember cost scales as `questions × metrics × calls`.
- **Offline** (golden set in CI, gates a release) vs **online** (production telemetry:
  thumbs, citation-click-through, "no answer" rate, latency, cost-per-query). Do both.
- **Ship with a tracked baseline** and re-run on every change to chunking, embeddings,
  retrieval, or prompts — RAG quality regresses silently.

---

## 8. Advanced patterns

- **Agentic / iterative retrieval.** Let an agent decide *when* and *what* to retrieve,
  reformulate after seeing results, and loop until it has enough — instead of one-shot
  retrieve-then-answer. Stronger on multi-hop questions; needs strict **termination and
  cost caps** (max iterations / token budget) or it spirals.
- **Graph / structured RAG.** Build a knowledge graph (entities + relations) and traverse
  it for multi-hop, "connect-the-dots" questions that flat chunk retrieval can't answer.
  Higher ingest cost; reserve for genuinely relational corpora. Combine with vector
  retrieval rather than replacing it.
- **Hierarchical / tree indexing.** Summarize clusters of chunks into higher-level nodes
  (RAPTOR-style); retrieve at the right altitude — summaries for broad questions, leaves
  for specifics.
- **Multimodal (brief).** Caption/OCR images, tables, and diagrams at ingest (VLM) so they
  embed and retrieve as text; or use a multimodal embedder. Always keep a text handle for
  citation.
- **Caching.** Cache embeddings (skip re-embedding unchanged docs), prompt-cache the stable
  system prompt + retrieved context across turns, and consider a **semantic cache** for
  repeated/near-duplicate queries. Big cost/latency wins.
- **Cost / latency budgeting.** Set explicit per-query budgets and attribute spend by stage
  (embed, retrieve, rerank, generate). The usual order of impact: cut top-k/top-n, then
  reduce chunk count in context, then cache, then choose cheaper models — re-measure
  quality after each, since cuts trade against recall.

---

## 9. Anti-patterns

- **Chunk-size cargo-culting** — copying "512 with 50 overlap" without testing it on your
  corpus and answer granularity.
- **No reranking** — feeding raw top-k straight to the model; precision craters as k grows.
- **Skipping retrieval metrics** — judging only the final answer, so you can't tell a
  retrieval miss from a generation failure.
- **Train/eval leakage** — golden-set queries (or their source docs) used to tune the
  embedder/reranker, inflating offline scores that collapse in production.
- **Dense-only retrieval** — losing exact-match queries (IDs, error codes, function names)
  that BM25 would have nailed.
- **Score-normalizing instead of RRF** — fragile fusion that breaks on score outliers.
- **Ungrounded fallback** — letting the model answer from parametric memory when retrieval
  is empty, instead of saying "no sources found."
- **Ignoring "lost in the middle"** — dumping many passages in arbitrary order and assuming
  the model reads them all equally.
- **No freshness/supersession** — serving stale facts because nothing prefers newer sources.
- **Re-embedding blindness** — swapping the embedding model without re-indexing the whole
  corpus (query and doc vectors must come from the same model/version).
- **Index sprawl with no port** — hard-wiring a specific vector DB into business logic, so
  switching engines is a rewrite instead of an adapter swap.
