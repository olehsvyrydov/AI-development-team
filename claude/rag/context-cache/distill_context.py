#!/usr/bin/env python3
"""Distill session context into long-term agent knowledge.

Reads undistilled entries from the session-context collection,
groups them by agent, and promotes valuable patterns to:
- learnings: decisions, error resolutions (cross-agent)
- agent-knowledge: agent-specific patterns (per-agent)

Then marks the original entries as distilled to avoid reprocessing.

Usage:
    python3 distill_context.py [--project-path /path] [--dry-run]
"""

import argparse
import json
import os
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
    PointStruct,
    PointIdsList,
)

NAMESPACE_UUID = uuid.UUID("d4e5f6a7-b8c9-0123-def0-345678901bcd")

# Chunk types worth promoting to long-term memory
PROMOTABLE_TYPES = {"decision", "error_resolution", "discussion"}


def fetch_undistilled(qdrant, project_path: str | None = None, limit: int = 200) -> list:
    """Fetch session-context entries that haven't been distilled yet.

    Args:
        qdrant: Qdrant client
        project_path: Optional project path filter
        limit: Max entries to fetch

    Returns:
        List of Qdrant points
    """
    conditions = [
        FieldCondition(
            key="distilled",
            match=MatchValue(value=True),
        )
    ]

    # We want entries where distilled is NOT true
    must_not = conditions

    must = []
    if project_path:
        must.append(
            FieldCondition(
                key="project_path",
                match=MatchValue(value=project_path),
            )
        )

    scroll_filter = Filter(must=must if must else None, must_not=must_not)

    points, _next = qdrant.scroll(
        collection_name="session-context",
        scroll_filter=scroll_filter,
        limit=limit,
        with_payload=True,
        with_vectors=False,
    )
    return points


def group_by_agent(points: list) -> dict[str, list]:
    """Group points by agent_name. Untagged go to '_general'."""
    if not points:
        return {}

    groups = defaultdict(list)
    for point in points:
        agent = point.payload.get("agent_name", "_general") or "_general"
        groups[agent].append(point)
    return dict(groups)


def promote_to_learnings(points: list, qdrant, embedder) -> int:
    """Promote decisions and error resolutions to the learnings collection.

    Returns count of entries promoted.
    """
    promotable = [
        p for p in points
        if p.payload.get("chunk_type") in PROMOTABLE_TYPES
    ]
    if not promotable:
        return 0

    texts = [p.payload["content"] for p in promotable]
    vectors = embedder.embed_query(texts[0])  # Embed individually for accuracy
    # Actually embed all at once for efficiency
    all_vectors = [embedder.embed_query(t) for t in texts]

    now = datetime.now(timezone.utc).isoformat()
    new_points = []
    for point, vector in zip(promotable, all_vectors):
        payload = point.payload
        point_id = str(uuid.uuid5(
            NAMESPACE_UUID,
            f"learning::{payload['content'][:200]}"
        ))
        new_points.append(PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "content": payload["content"],
                "agent_name": payload.get("agent_name"),
                "learning_type": _chunk_type_to_learning(payload["chunk_type"]),
                "source_file": "session-context",
                "stored_at": now,
            },
        ))

    qdrant.upsert(collection_name="learnings", points=new_points)
    return len(new_points)


def promote_to_agent_knowledge(
    points: list,
    agent_name: str,
    qdrant,
    embedder,
) -> int:
    """Promote agent-specific patterns to agent-knowledge collection.

    Returns count of entries promoted.
    """
    if agent_name == "_general" or not points:
        return 0

    promotable = [
        p for p in points
        if p.payload.get("chunk_type") in PROMOTABLE_TYPES
    ]
    if not promotable:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    new_points = []
    for point in promotable:
        payload = point.payload
        vector = embedder.embed_query(payload["content"])
        point_id = str(uuid.uuid5(
            NAMESPACE_UUID,
            f"agent-knowledge::{agent_name}::{payload['content'][:200]}"
        ))
        new_points.append(PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "content": payload["content"],
                "agent_name": agent_name,
                "section_type": "learned-pattern",
                "category": _chunk_type_to_category(payload["chunk_type"]),
                "source_file": "session-context",
                "stored_at": now,
            },
        ))

    qdrant.upsert(collection_name="agent-knowledge", points=new_points)
    return len(new_points)


def mark_as_distilled(point_ids: list[str], qdrant) -> None:
    """Mark session-context entries as distilled to prevent reprocessing."""
    if not point_ids:
        return

    qdrant.set_payload(
        collection_name="session-context",
        payload={"distilled": True},
        points=point_ids,
    )


def distill(
    qdrant,
    embedder,
    project_path: str | None = None,
) -> dict:
    """Full distillation pipeline: fetch → group → promote → mark.

    Returns summary dict with counts.
    """
    points = fetch_undistilled(qdrant, project_path=project_path)
    if not points:
        return {"status": "empty", "points_processed": 0, "learnings_created": 0, "knowledge_created": 0}

    groups = group_by_agent(points)

    total_learnings = 0
    total_knowledge = 0

    for agent_name, agent_points in groups.items():
        total_learnings += promote_to_learnings(agent_points, qdrant, embedder)
        total_knowledge += promote_to_agent_knowledge(agent_points, agent_name, qdrant, embedder)

    # Mark all processed points
    all_ids = [p.id for p in points]
    mark_as_distilled(all_ids, qdrant)

    return {
        "status": "distilled",
        "points_processed": len(points),
        "learnings_created": total_learnings,
        "knowledge_created": total_knowledge,
        "agents": list(groups.keys()),
    }


def _chunk_type_to_learning(chunk_type: str) -> str:
    """Map chunk type to learning type label."""
    return {
        "decision": "architecture-decision",
        "error_resolution": "debugging-insight",
        "discussion": "domain-knowledge",
    }.get(chunk_type, "general")


def _chunk_type_to_category(chunk_type: str) -> str:
    """Map chunk type to agent-knowledge category."""
    return {
        "decision": "decision-pattern",
        "error_resolution": "troubleshooting",
        "discussion": "expertise",
    }.get(chunk_type, "general")


def main():
    parser = argparse.ArgumentParser(description="Distill session context into agent knowledge")
    parser.add_argument("--project-path", help="Filter by project path")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be distilled")
    args = parser.parse_args()

    from qdrant_client import QdrantClient
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))
    from memory_mcp.embeddings import VoyageEmbeddingProvider

    qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333")
    qdrant = QdrantClient(url=qdrant_url)
    embedder = VoyageEmbeddingProvider()

    if args.dry_run:
        points = fetch_undistilled(qdrant, project_path=args.project_path)
        groups = group_by_agent(points)
        print(f"Found {len(points)} undistilled entries:")
        for agent, agent_points in groups.items():
            types = defaultdict(int)
            for p in agent_points:
                types[p.payload["chunk_type"]] += 1
            print(f"  {agent}: {dict(types)}")
        return

    result = distill(qdrant, embedder, project_path=args.project_path)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
