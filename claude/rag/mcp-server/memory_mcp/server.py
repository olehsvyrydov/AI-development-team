"""MCP server entry point for AI Team Memory.

Exposes 4 tools via stdio transport:
- memory_search: Semantic search across collections
- memory_store: Store new knowledge at runtime
- memory_agent_expertise: Agent-specific knowledge lookup
- memory_stats: Collection health and sizes

Usage:
    python3 -m memory_mcp.server
"""

import json
import os

from mcp.server.fastmcp import FastMCP

from .collections import COLLECTIONS

# Lazy-initialized clients (created on first tool call)
_embedder = None
_qdrant = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        from .embeddings import VoyageEmbeddingProvider
        _embedder = VoyageEmbeddingProvider()
    return _embedder


def _get_qdrant():
    global _qdrant
    if _qdrant is None:
        from qdrant_client import QdrantClient
        url = os.environ.get("QDRANT_URL", "http://localhost:6333")
        _qdrant = QdrantClient(url=url)
    return _qdrant


mcp = FastMCP(
    "ai-team-memory",
    instructions=(
        "AI Team Memory — semantic knowledge retrieval for the AI Development Team framework. "
        "Search agent expertise, architecture decisions, sprint learnings, and code patterns. "
        "Use memory_agent_expertise to ask 'What does Jorge know about X?'. "
        "Use memory_search for broader cross-collection queries. "
        "Use memory_store to persist new learnings at runtime."
    ),
)


@mcp.tool()
def memory_search(
    query: str,
    collection: str = "agent-knowledge",
    filters: str | None = None,
    limit: int = 5,
) -> str:
    """Semantic search across AI Team Memory collections.

    Args:
        query: Natural language search query (e.g., "webhook security patterns")
        collection: Collection to search. One of: agent-knowledge, decisions, learnings, code-patterns
        filters: Optional JSON string of field filters (e.g., '{"agent_name": "solution-architect"}')
        limit: Max results (1-20, default 5)
    """
    from .tools import memory_search as _search

    filter_dict = json.loads(filters) if filters else None
    limit = max(1, min(20, limit))

    results = _search(
        query=query,
        collection=collection,
        embedder=_get_embedder(),
        qdrant=_get_qdrant(),
        filters=filter_dict,
        limit=limit,
    )
    return json.dumps(results, indent=2)


@mcp.tool()
def memory_store(
    content: str,
    collection: str = "learnings",
    metadata: str | None = None,
) -> str:
    """Store a new learning, decision, or code pattern in AI Team Memory.

    Args:
        content: Text content to store
        collection: Target collection. One of: decisions, learnings, code-patterns
        metadata: Optional JSON string with additional fields (e.g., '{"agent_name": "solution-architect", "learning_type": "anti-pattern"}')
    """
    from .tools import memory_store as _store

    meta = json.loads(metadata) if metadata else None

    result = _store(
        content=content,
        collection=collection,
        embedder=_get_embedder(),
        qdrant=_get_qdrant(),
        metadata=meta,
    )
    return json.dumps(result, indent=2)


@mcp.tool()
def memory_agent_expertise(
    agent: str,
    query: str,
    limit: int = 5,
) -> str:
    """Ask what a specific agent knows about a topic. Supports both names and aliases.

    Examples:
        - agent="jorge", query="webhook security"
        - agent="solution-architect", query="CQRS patterns"
        - agent="finn", query="React state management"

    Args:
        agent: Agent name or alias (e.g., "jorge", "solution-architect", "/arch")
        query: What you want to know about
        limit: Max results (1-20, default 5)
    """
    from .tools import memory_agent_expertise as _expertise

    limit = max(1, min(20, limit))

    results = _expertise(
        agent=agent,
        query=query,
        embedder=_get_embedder(),
        qdrant=_get_qdrant(),
        limit=limit,
    )
    return json.dumps(results, indent=2)


@mcp.tool()
def memory_stats() -> str:
    """Show AI Team Memory collection sizes and health status."""
    from .tools import memory_stats as _stats

    results = _stats(qdrant=_get_qdrant())
    return json.dumps(results, indent=2)


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
