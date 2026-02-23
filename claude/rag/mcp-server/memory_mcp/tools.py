"""MCP tool implementations for AI Team Memory.

4 tools:
- memory_search: Semantic search across any collection with optional filters
- memory_store: Store new learning/decision/pattern at runtime
- memory_agent_expertise: "What does Jorge know about X?" convenience tool
- memory_stats: Collection sizes, health check
"""

import uuid
from datetime import datetime, timezone

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
    PointStruct,
)

from .embeddings import VoyageEmbeddingProvider
from .collections import COLLECTIONS, get_collection_stats, VECTOR_SIZE

# Agent name -> command mapping for convenience lookups
AGENT_ALIASES = {
    "jorge": "solution-architect",
    "max": "product-owner",
    "luda": "scrum-master",
    "anna": "business-analyst",
    "soren": "secops-engineer",
    "inga": "uk-accountant",
    "alex": "uk-legal-counsel",
    "aura": "ui-designer",
    "finn": "frontend-developer",
    "james": "backend-developer",
    "rob": "tester",
    "adam": "e2e-tester",
    "apex": "apex",
}

NAMESPACE_UUID = uuid.UUID("b2c3d4e5-f6a7-8901-bcde-f12345678901")


def _build_filter(filters: dict | None) -> Filter | None:
    """Build a Qdrant filter from a dict of field -> value."""
    if not filters:
        return None

    conditions = []
    for key, value in filters.items():
        if value is not None:
            conditions.append(
                FieldCondition(key=key, match=MatchValue(value=value))
            )

    return Filter(must=conditions) if conditions else None


def memory_search(
    query: str,
    collection: str,
    embedder: VoyageEmbeddingProvider,
    qdrant: QdrantClient,
    filters: dict | None = None,
    limit: int = 5,
) -> list[dict]:
    """Semantic search across any collection with optional filters.

    Args:
        query: Natural language search query
        collection: Collection name (agent-knowledge, decisions, learnings, code-patterns)
        embedder: Embedding provider
        qdrant: Qdrant client
        filters: Optional dict of field -> value for filtering
        limit: Max results to return

    Returns:
        List of dicts with score, content, and metadata
    """
    if collection not in COLLECTIONS:
        return [{"error": f"Unknown collection: {collection}. Valid: {list(COLLECTIONS.keys())}"}]

    vector = embedder.embed_query(query)
    query_filter = _build_filter(filters)

    results = qdrant.query_points(
        collection_name=collection,
        query=vector,
        query_filter=query_filter,
        limit=limit,
    ).points

    return [
        {
            "score": point.score,
            "content": point.payload.get("content", ""),
            "heading": point.payload.get("heading", ""),
            "agent_name": point.payload.get("agent_name"),
            "source_file": point.payload.get("source_file"),
            "metadata": {
                k: v for k, v in point.payload.items()
                if k not in ("content", "heading", "agent_name", "source_file")
            },
        }
        for point in results
    ]


def memory_store(
    content: str,
    collection: str,
    embedder: VoyageEmbeddingProvider,
    qdrant: QdrantClient,
    metadata: dict | None = None,
) -> dict:
    """Store a new learning, decision, or pattern at runtime.

    Args:
        content: Text content to store
        collection: Target collection
        embedder: Embedding provider
        qdrant: Qdrant client
        metadata: Additional metadata fields

    Returns:
        Dict with point_id and status
    """
    if collection not in COLLECTIONS:
        return {"error": f"Unknown collection: {collection}. Valid: {list(COLLECTIONS.keys())}"}

    meta = metadata or {}
    meta["stored_at"] = datetime.now(timezone.utc).isoformat()
    meta["content"] = content

    point_id = str(uuid.uuid5(NAMESPACE_UUID, f"{collection}::{content[:200]}"))
    vector = embedder.embed_query(content)

    qdrant.upsert(
        collection_name=collection,
        points=[
            PointStruct(id=point_id, vector=vector, payload=meta)
        ],
    )

    return {"point_id": point_id, "collection": collection, "status": "stored"}


def memory_agent_expertise(
    agent: str,
    query: str,
    embedder: VoyageEmbeddingProvider,
    qdrant: QdrantClient,
    limit: int = 5,
) -> list[dict]:
    """Convenience: "What does Jorge know about X?"

    Resolves agent aliases and searches agent-knowledge collection
    filtered by agent_name.
    """
    # Resolve alias
    agent_lower = agent.lower().strip().lstrip("/")
    agent_name = AGENT_ALIASES.get(agent_lower, agent_lower)

    return memory_search(
        query=query,
        collection="agent-knowledge",
        embedder=embedder,
        qdrant=qdrant,
        filters={"agent_name": agent_name},
        limit=limit,
    )


def memory_stats(qdrant: QdrantClient) -> list[dict]:
    """Return collection sizes and health status."""
    return get_collection_stats(qdrant)
