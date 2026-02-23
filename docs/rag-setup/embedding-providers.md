# Embedding Providers — Voyage AI vs Google Gemini

The RAG knowledge base needs an embedding model to convert text into vectors for semantic search.
Two providers are supported: **Voyage AI** (default) and **Google Gemini** (free alternative).

## Comparison

| Feature | voyage-code-3 | gemini-embedding-001 |
|---------|---------------|----------------------|
| **Specialization** | Code & technical docs | General purpose |
| **Default dimensions** | 2,048 | 3,072 |
| **Configurable dimensions** | 256, 512, 1024, 2048 | 128 — 3,072 |
| **Max input tokens** | 32,000 | 2,048 |
| **Free tier** | 200M tokens, then $0.18/1M | Unlimited (rate-limited) |
| **Code retrieval quality** | Best-in-class (+13.8% vs OpenAI) | Good (CODE_RETRIEVAL_QUERY task type) |
| **Python SDK** | `voyageai` | `google-genai` |
| **API key source** | [dash.voyageai.com](https://dash.voyageai.com/) | [aistudio.google.com](https://aistudio.google.com/) |

### When to use which

**Voyage AI (`voyage-code-3`)** — Best choice when:
- Your content is primarily code and technical documentation
- You need long-context embedding (up to 32K tokens per chunk)
- You want the highest code retrieval accuracy
- 200M free tokens is enough (it is for this framework — ~1500 chunks costs ~$0.01)

**Google Gemini (`gemini-embedding-001`)** — Best choice when:
- You want zero-cost embeddings with no token limit
- You're running on a personal/dev machine and want to avoid API costs
- Your content is mixed (docs, decisions, learnings — not just code)
- You're fine with 2,048 token input limit (our chunks are ~2000 chars, fits within limit)

## Current Setup (Voyage AI)

The MCP server uses Voyage AI by default:

```
embeddings.py → VoyageEmbeddingProvider
    model: voyage-code-3
    dimensions: 1024
    distance: cosine
```

**API key:** Set via `VOYAGE_API_KEY` environment variable.

## Switching to Gemini

### Step 1: Get a Google API key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Create API Key"
3. Save the key

### Step 2: Install the Google SDK

```bash
cd claude/rag/mcp-server
.venv/bin/pip install google-genai
```

### Step 3: Modify `embeddings.py`

Replace the Voyage AI provider with a Gemini provider. The interface stays the same —
only the embedding call changes:

```python
"""Embedding provider using Google Gemini (gemini-embedding-001)."""

import os
import numpy as np
from google import genai
from google.genai import types


class GeminiEmbeddingProvider:
    """Google Gemini embedding provider for AI Team Memory."""

    MODEL = "gemini-embedding-001"
    DIMENSIONS = 1024  # Match existing Qdrant collection config
    DISTANCE = "Cosine"

    def __init__(self, api_key: str | None = None):
        key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not key:
            raise ValueError("GOOGLE_API_KEY environment variable is required")
        self.client = genai.Client(api_key=key)

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query."""
        result = self.client.models.embed_content(
            model=self.MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=self.DIMENSIONS,
            ),
        )
        vec = np.array(result.embeddings[0].values)
        vec = vec / np.linalg.norm(vec)  # L2 normalize (recommended for reduced dims)
        return vec.tolist()

    def embed_documents(self, texts: list[str], batch_size: int = 64) -> list[list[float]]:
        """Embed a batch of documents for indexing."""
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            result = self.client.models.embed_content(
                model=self.MODEL,
                contents=batch,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=self.DIMENSIONS,
                ),
            )
            for emb in result.embeddings:
                vec = np.array(emb.values)
                vec = vec / np.linalg.norm(vec)
                all_embeddings.append(vec.tolist())
        return all_embeddings
```

### Step 4: Update `server.py` to use the new provider

In `server.py`, change the import:

```python
# Before
from .embeddings import VoyageEmbeddingProvider as EmbeddingProvider

# After
from .embeddings import GeminiEmbeddingProvider as EmbeddingProvider
```

### Step 5: Re-register the MCP server with the new env var

```bash
# Remove old
claude mcp remove -s user ai-team-memory

# Add with Google API key
claude mcp add -s user \
  -e GOOGLE_API_KEY=your-google-key \
  -- /absolute/path/to/claude/rag/mcp-server/.venv/bin/python3 -m memory_mcp
```

### Step 6: Re-ingest (embeddings are different, must rebuild)

```bash
# Delete and recreate collections
cd claude/rag/management
python3 reindex.py --skills-dir ../../skills --yes

# Re-ingest with new embeddings
cd ../ingestion
GOOGLE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
```

> **Important:** You cannot mix embeddings from different models in the same collection.
> When switching providers, you must reindex everything.

## Gemini Rate Limits (Free Tier)

| Metric | Limit |
|--------|-------|
| Requests per minute | ~100 |
| Requests per day | ~1,000 |

For the initial ingestion of ~1500 chunks at batch size 64, that's ~24 API calls — well within limits.

Runtime queries (one at a time via MCP tools) will never hit rate limits.

## Gemini Task Types

Gemini supports specialized task types that improve retrieval quality:

| Task Type | When to Use |
|-----------|-------------|
| `RETRIEVAL_DOCUMENT` | Indexing documents (ingestion) |
| `RETRIEVAL_QUERY` | Search queries (runtime) |
| `CODE_RETRIEVAL_QUERY` | Code-specific search queries |
| `SEMANTIC_SIMILARITY` | Comparing two texts |

The implementation above uses `RETRIEVAL_DOCUMENT` for ingestion and `RETRIEVAL_QUERY` for search.
For code-heavy queries, you could add logic to detect code queries and use `CODE_RETRIEVAL_QUERY`.

## Input Token Limit

Gemini's 2,048 token limit is the main constraint compared to Voyage's 32K.
The chunker splits at ~2000 characters, which typically fits within 2,048 tokens.
If you have very long chunks, they will be silently truncated by the Gemini API.

To be safe, you can lower the chunker threshold in `chunker.py`:

```python
MAX_SECTION_CHARS = 1500  # More conservative for Gemini's 2K token limit
```
