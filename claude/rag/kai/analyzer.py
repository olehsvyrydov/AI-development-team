"""Pattern detection: scan learnings, cluster similar, detect recurring patterns."""

import math
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from qdrant_client.models import Filter, FieldCondition, MatchValue, Range

from models import Learning, Pattern

NAMESPACE_UUID = uuid.UUID("e5f6a7b8-c9d0-1234-ef01-456789012cde")

# Collections to scan for learnings
_COLLECTIONS = ["learnings", "agent-knowledge"]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def fetch_recent_learnings(
    qdrant,
    max_age_days: int = 30,
    agent_name: str | None = None,
) -> list[Learning]:
    """Fetch recent learnings from both learnings and agent-knowledge collections.

    Filters to entries sourced from session-context (distilled learnings).
    """
    all_learnings = []

    for collection in _COLLECTIONS:
        conditions = [
            FieldCondition(key="source_file", match=MatchValue(value="session-context")),
        ]
        if agent_name:
            conditions.append(
                FieldCondition(key="agent_name", match=MatchValue(value=agent_name))
            )

        scroll_filter = Filter(must=conditions)

        points, _ = qdrant.scroll(
            collection_name=collection,
            scroll_filter=scroll_filter,
            limit=200,
            with_payload=True,
            with_vectors=True,
        )

        for p in points:
            payload = p.payload
            all_learnings.append(Learning(
                point_id=str(p.id),
                content=payload.get("content", ""),
                agent_name=payload.get("agent_name"),
                learning_type=payload.get("learning_type"),
                stored_at=payload.get("stored_at"),
                score=getattr(p, "score", 0.0) or 0.0,
            ))

    return all_learnings


def cluster_similar_learnings(
    learnings: list[Learning],
    embedder,
    min_similarity: float = 0.7,
) -> list[list[Learning]]:
    """Cluster learnings by embedding similarity.

    Uses greedy clustering: assign each learning to the first cluster
    whose centroid is above the similarity threshold.
    """
    if not learnings:
        return []

    # Get embeddings
    vectors = [embedder.embed_query(l.content) for l in learnings]

    clusters: list[list[int]] = []  # indices
    cluster_centroids: list[list[float]] = []

    for i, vec in enumerate(vectors):
        assigned = False
        for ci, centroid in enumerate(cluster_centroids):
            if _cosine_similarity(vec, centroid) >= min_similarity:
                clusters[ci].append(i)
                assigned = True
                break
        if not assigned:
            clusters.append([i])
            cluster_centroids.append(vec)

    return [[learnings[i] for i in cluster] for cluster in clusters]


def detect_patterns(
    qdrant,
    embedder,
    agent_name: str | None = None,
    min_frequency: int = 3,
    max_age_days: int = 30,
) -> list[Pattern]:
    """Detect recurring patterns in learnings.

    Fetches recent learnings, clusters by similarity, filters by frequency threshold.
    """
    learnings = fetch_recent_learnings(qdrant, max_age_days=max_age_days, agent_name=agent_name)
    if not learnings:
        return []

    # Group by agent
    by_agent: dict[str, list[Learning]] = defaultdict(list)
    for l in learnings:
        key = l.agent_name or "_general"
        by_agent[key].append(l)

    patterns = []
    for agent, agent_learnings in by_agent.items():
        clusters = cluster_similar_learnings(agent_learnings, embedder)
        for cluster in clusters:
            if len(cluster) >= min_frequency:
                # Use the longest content as summary
                summary = max(cluster, key=lambda l: len(l.content)).content
                pattern_id = str(uuid.uuid5(
                    NAMESPACE_UUID,
                    f"{agent}::{summary[:100]}",
                ))

                # Calculate recency
                recency_days = 0
                now = datetime.now(timezone.utc)
                for l in cluster:
                    if l.stored_at:
                        try:
                            stored = datetime.fromisoformat(l.stored_at)
                            days = (now - stored).days
                            recency_days = max(recency_days, days)
                        except (ValueError, TypeError):
                            pass

                # Confidence = frequency / total * cluster_tightness
                confidence = min(1.0, len(cluster) / max(len(agent_learnings), 1))

                patterns.append(Pattern(
                    pattern_id=pattern_id,
                    summary=summary,
                    learnings=cluster,
                    agent_name=agent,
                    frequency=len(cluster),
                    confidence=confidence,
                    recency_days=recency_days,
                ))

    # Sort by confidence descending
    patterns.sort(key=lambda p: p.confidence, reverse=True)
    return patterns


def analyze(
    qdrant,
    embedder,
    agent_name: str | None = None,
    min_frequency: int = 3,
    max_age_days: int = 30,
) -> dict:
    """Full analysis: fetch, cluster, detect patterns. Returns summary dict."""
    learnings = fetch_recent_learnings(qdrant, max_age_days=max_age_days, agent_name=agent_name)

    if not learnings:
        return {
            "total_learnings_scanned": 0,
            "patterns_found": 0,
            "patterns": [],
            "agents": [],
        }

    patterns = detect_patterns(
        qdrant, embedder,
        agent_name=agent_name,
        min_frequency=min_frequency,
        max_age_days=max_age_days,
    )

    agents = list({l.agent_name for l in learnings if l.agent_name})

    return {
        "total_learnings_scanned": len(learnings),
        "patterns_found": len(patterns),
        "patterns": patterns,
        "agents": agents,
    }
