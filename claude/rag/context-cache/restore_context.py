#!/usr/bin/env python3
"""SessionStart hook: restore relevant context from Qdrant after compaction/resume.

Queries Qdrant for recent context matching the current project,
formats it, and prints to stdout so it's injected into Claude's context.

Usage as hook:
    Receives JSON on stdin with session_id, cwd fields.
    Prints context to stdout.

Usage as library:
    restore_session_context(project_path, qdrant, embedder, limit=20)
"""

import json
import os
import sys
from collections import defaultdict

from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
)

COLLECTION = "session-context"

# Section headers for each chunk type
SECTION_HEADERS = {
    "decision": "Decisions & Approach Choices",
    "file_change": "Files Modified",
    "task": "Task Progress",
    "discussion": "Key Discussions",
    "error_resolution": "Error Resolutions",
}


def _format_context_output(results: list) -> str:
    """Format Qdrant search results into readable context for Claude."""
    if not results:
        return ""

    # Group by chunk_type
    grouped = defaultdict(list)
    for point in results:
        payload = point.payload
        chunk_type = payload.get("chunk_type", "other")
        grouped[chunk_type].append(payload["content"])

    sections = []
    for chunk_type, header in SECTION_HEADERS.items():
        items = grouped.get(chunk_type, [])
        if not items:
            continue
        section_lines = [f"### {header}"]
        for item in items:
            section_lines.append(f"- {item}")
        sections.append("\n".join(section_lines))

    if not sections:
        return ""

    header = "## Restored Context from Previous Session\n"
    return header + "\n\n".join(sections)


def restore_session_context(
    project_path: str,
    qdrant,
    embedder,
    limit: int = 20,
) -> str:
    """Query Qdrant for recent context matching the project.

    Returns formatted context string (empty string if nothing found).
    """
    # Use a generic query to get recent context for this project
    query_vector = embedder.embed_query(
        f"session context decisions files tasks discussions for {project_path}"
    )

    query_filter = Filter(
        must=[
            FieldCondition(
                key="project_path",
                match=MatchValue(value=project_path),
            )
        ]
    )

    results = qdrant.query_points(
        collection_name=COLLECTION,
        query=query_vector,
        query_filter=query_filter,
        limit=limit,
    ).points

    return _format_context_output(results)


def main():
    """Entry point for SessionStart hook. Reads hook input from stdin."""
    hook_input = json.load(sys.stdin)

    cwd = hook_input.get("cwd", os.getcwd())

    # Lazy imports
    from qdrant_client import QdrantClient
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))
    from memory_mcp.embeddings import VoyageEmbeddingProvider

    qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333")
    qdrant = QdrantClient(url=qdrant_url)
    embedder = VoyageEmbeddingProvider()

    context = restore_session_context(
        project_path=cwd,
        qdrant=qdrant,
        embedder=embedder,
    )

    if context:
        # Print to stdout — Claude Code injects this into context
        print(context)


if __name__ == "__main__":
    main()
