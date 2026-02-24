"""Tests for pattern detection analyzer."""

from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta

from models import Learning, Pattern
from analyzer import (
    fetch_recent_learnings,
    cluster_similar_learnings,
    detect_patterns,
    analyze,
)


def _make_point(point_id, content, agent_name=None, learning_type=None, stored_at=None, vector=None):
    """Create a mock Qdrant point."""
    if stored_at is None:
        stored_at = datetime.now(timezone.utc).isoformat()
    p = MagicMock()
    p.id = point_id
    p.payload = {
        "content": content,
        "agent_name": agent_name,
        "learning_type": learning_type,
        "stored_at": stored_at,
        "source_file": "session-context",
    }
    p.score = 0.9
    p.vector = vector or [0.1] * 10
    return p


class TestFetchRecentLearnings:
    def test_fetches_from_learnings_collection(self):
        qdrant = MagicMock()
        points_learnings = [
            _make_point("1", "Learning A", "backend-developer"),
            _make_point("2", "Learning B", "frontend-developer"),
        ]
        # First call (learnings) returns points, second (agent-knowledge) returns empty
        qdrant.scroll.side_effect = [
            (points_learnings, None),
            ([], None),
        ]

        result = fetch_recent_learnings(qdrant, max_age_days=30)

        assert len(result) == 2
        assert isinstance(result[0], Learning)
        assert result[0].content == "Learning A"
        assert result[0].agent_name == "backend-developer"

    def test_filters_by_agent(self):
        qdrant = MagicMock()
        qdrant.scroll.return_value = ([], None)

        fetch_recent_learnings(qdrant, agent_name="backend-developer")

        call_args = qdrant.scroll.call_args
        scroll_filter = call_args.kwargs.get("scroll_filter") or call_args[1].get("scroll_filter")
        # Should have filter conditions including agent_name
        assert scroll_filter is not None

    def test_empty_results(self):
        qdrant = MagicMock()
        qdrant.scroll.return_value = ([], None)

        result = fetch_recent_learnings(qdrant)
        assert result == []

    def test_queries_both_collections(self):
        qdrant = MagicMock()
        qdrant.scroll.return_value = ([], None)

        fetch_recent_learnings(qdrant)

        # Should query both learnings and agent-knowledge
        collection_names = [
            call.kwargs.get("collection_name") or call.args[0]
            for call in qdrant.scroll.call_args_list
        ]
        assert "learnings" in collection_names
        assert "agent-knowledge" in collection_names


class TestClusterSimilarLearnings:
    def test_clusters_identical_vectors(self):
        learnings = [
            Learning("1", "Use DTOs for API responses", "be"),
            Learning("2", "Always use DTOs in REST APIs", "be"),
            Learning("3", "Completely different topic about caching", "be"),
        ]
        # Embedder returns similar vectors for first two, different for third
        embedder = MagicMock()
        vectors = {
            "1": [1.0, 0.0, 0.0],
            "2": [0.99, 0.1, 0.0],
            "3": [0.0, 0.0, 1.0],
        }
        embedder.embed_query.side_effect = lambda text: vectors.get(
            next(l.point_id for l in learnings if l.content == text),
            [0.5, 0.5, 0.5],
        )

        clusters = cluster_similar_learnings(learnings, embedder, min_similarity=0.9)

        # Should have at least one cluster with the two similar learnings
        assert len(clusters) >= 1
        big_cluster = max(clusters, key=len)
        assert len(big_cluster) >= 2

    def test_no_clusters_for_dissimilar(self):
        learnings = [
            Learning("1", "Topic A"),
            Learning("2", "Topic B"),
        ]
        embedder = MagicMock()
        embedder.embed_query.side_effect = [
            [1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0],
        ]

        clusters = cluster_similar_learnings(learnings, embedder, min_similarity=0.9)

        # Each learning in its own cluster, all clusters size 1
        for cluster in clusters:
            assert len(cluster) == 1

    def test_empty_input(self):
        clusters = cluster_similar_learnings([], MagicMock())
        assert clusters == []


class TestDetectPatterns:
    def test_detects_pattern_above_threshold(self):
        qdrant = MagicMock()
        now = datetime.now(timezone.utc).isoformat()
        points = [
            _make_point("1", "Validate external IDs", "be", stored_at=now),
            _make_point("2", "Always validate external IDs before API", "be", stored_at=now),
            _make_point("3", "External ID validation is critical", "be", stored_at=now),
        ]
        qdrant.scroll.return_value = (points, None)

        embedder = MagicMock()
        # All return similar vectors
        embedder.embed_query.return_value = [1.0, 0.0, 0.0]

        patterns = detect_patterns(qdrant, embedder, min_frequency=2)

        assert len(patterns) >= 1
        assert all(isinstance(p, Pattern) for p in patterns)
        assert patterns[0].frequency >= 2

    def test_no_patterns_below_threshold(self):
        qdrant = MagicMock()
        now = datetime.now(timezone.utc).isoformat()
        points = [
            _make_point("1", "Topic A", "be", stored_at=now),
        ]
        qdrant.scroll.return_value = (points, None)

        embedder = MagicMock()
        embedder.embed_query.return_value = [1.0, 0.0, 0.0]

        patterns = detect_patterns(qdrant, embedder, min_frequency=3)
        assert patterns == []


class TestAnalyze:
    def test_returns_summary(self):
        qdrant = MagicMock()
        now = datetime.now(timezone.utc).isoformat()
        points = [
            _make_point("1", "Pattern A1", "be", stored_at=now),
            _make_point("2", "Pattern A2", "be", stored_at=now),
            _make_point("3", "Pattern A3", "be", stored_at=now),
        ]
        qdrant.scroll.return_value = (points, None)

        embedder = MagicMock()
        embedder.embed_query.return_value = [1.0, 0.0, 0.0]

        result = analyze(qdrant, embedder, min_frequency=2)

        assert "total_learnings_scanned" in result
        assert "patterns_found" in result
        assert "patterns" in result
        assert "agents" in result
        assert result["total_learnings_scanned"] >= 0

    def test_empty_knowledge_base(self):
        qdrant = MagicMock()
        qdrant.scroll.return_value = ([], None)

        embedder = MagicMock()

        result = analyze(qdrant, embedder)
        assert result["total_learnings_scanned"] == 0
        assert result["patterns_found"] == 0
