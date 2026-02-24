"""Tests for distill_context module — agent learning pipeline."""

import time
from unittest.mock import MagicMock, call

import pytest

from distill_context import (
    fetch_undistilled,
    group_by_agent,
    promote_to_learnings,
    promote_to_agent_knowledge,
    mark_as_distilled,
    distill,
)


# --- Fixtures ---

def _make_point(content, chunk_type, agent_name=None, distilled=False, score=0.9):
    """Create a mock Qdrant point."""
    payload = {
        "content": content,
        "chunk_type": chunk_type,
        "session_id": "sess-1",
        "project_path": "/project",
        "timestamp": time.time(),
    }
    if agent_name:
        payload["agent_name"] = agent_name
    if distilled:
        payload["distilled"] = True
    point = MagicMock()
    point.id = f"point-{hash(content) % 10000}"
    point.payload = payload
    point.score = score
    return point


@pytest.fixture
def mock_qdrant():
    client = MagicMock()
    return client


@pytest.fixture
def mock_embedder():
    embedder = MagicMock()
    embedder.embed_query.return_value = [0.5] * 1024
    return embedder


@pytest.fixture
def sample_points():
    return [
        _make_point("Use PostgreSQL for JSONB support", "decision", "solution-architect"),
        _make_point("Use Redis for caching", "decision", "solution-architect"),
        _make_point("Wrote database.py config", "file_change", "backend-developer"),
        _make_point("Fixed connection timeout by increasing pool size", "error_resolution", "backend-developer"),
        _make_point("React hook pattern for forms", "discussion", "frontend-developer"),
    ]


# --- Tests for fetch_undistilled ---

class TestFetchUndistilled:
    def test_queries_session_context_collection(self, mock_qdrant):
        mock_qdrant.scroll.return_value = ([], None)
        fetch_undistilled(mock_qdrant)
        mock_qdrant.scroll.assert_called_once()
        call_kwargs = mock_qdrant.scroll.call_args.kwargs
        assert call_kwargs["collection_name"] == "session-context"

    def test_filters_out_already_distilled(self, mock_qdrant):
        mock_qdrant.scroll.return_value = ([], None)
        fetch_undistilled(mock_qdrant)
        call_kwargs = mock_qdrant.scroll.call_args.kwargs
        query_filter = call_kwargs.get("scroll_filter")
        assert query_filter is not None

    def test_returns_points(self, mock_qdrant, sample_points):
        mock_qdrant.scroll.return_value = (sample_points, None)
        result = fetch_undistilled(mock_qdrant)
        assert len(result) == 5

    def test_filters_by_project_path(self, mock_qdrant):
        mock_qdrant.scroll.return_value = ([], None)
        fetch_undistilled(mock_qdrant, project_path="/my/project")
        call_kwargs = mock_qdrant.scroll.call_args.kwargs
        assert call_kwargs.get("scroll_filter") is not None


# --- Tests for group_by_agent ---

class TestGroupByAgent:
    def test_groups_correctly(self, sample_points):
        groups = group_by_agent(sample_points)
        assert "solution-architect" in groups
        assert "backend-developer" in groups
        assert "frontend-developer" in groups
        assert len(groups["solution-architect"]) == 2
        assert len(groups["backend-developer"]) == 2

    def test_untagged_go_to_general(self):
        points = [
            _make_point("Some general discussion", "discussion"),
        ]
        groups = group_by_agent(points)
        assert "_general" in groups
        assert len(groups["_general"]) == 1

    def test_empty_input(self):
        groups = group_by_agent([])
        assert groups == {}


# --- Tests for promote_to_learnings ---

class TestPromoteToLearnings:
    def test_stores_decisions_as_learnings(self, mock_qdrant, mock_embedder):
        points = [
            _make_point("Use PostgreSQL for JSONB support", "decision", "solution-architect"),
            _make_point("Fixed N+1 query by using fetch join", "error_resolution", "backend-developer"),
        ]
        count = promote_to_learnings(points, mock_qdrant, mock_embedder)
        assert count == 2
        mock_qdrant.upsert.assert_called_once()
        call_kwargs = mock_qdrant.upsert.call_args.kwargs
        assert call_kwargs["collection_name"] == "learnings"

    def test_skips_file_changes(self, mock_qdrant, mock_embedder):
        points = [
            _make_point("Wrote config.py", "file_change", "backend-developer"),
        ]
        count = promote_to_learnings(points, mock_qdrant, mock_embedder)
        assert count == 0

    def test_preserves_agent_name(self, mock_qdrant, mock_embedder):
        points = [
            _make_point("Use event sourcing pattern", "decision", "solution-architect"),
        ]
        promote_to_learnings(points, mock_qdrant, mock_embedder)
        stored_points = mock_qdrant.upsert.call_args.kwargs["points"]
        assert stored_points[0].payload["agent_name"] == "solution-architect"

    def test_empty_input(self, mock_qdrant, mock_embedder):
        count = promote_to_learnings([], mock_qdrant, mock_embedder)
        assert count == 0
        mock_qdrant.upsert.assert_not_called()


# --- Tests for promote_to_agent_knowledge ---

class TestPromoteToAgentKnowledge:
    def test_stores_agent_specific_knowledge(self, mock_qdrant, mock_embedder):
        points = [
            _make_point("Always validate JWT tokens on API gateway", "decision", "solution-architect"),
        ]
        count = promote_to_agent_knowledge(points, "solution-architect", mock_qdrant, mock_embedder)
        assert count == 1
        call_kwargs = mock_qdrant.upsert.call_args.kwargs
        assert call_kwargs["collection_name"] == "agent-knowledge"

    def test_tags_with_learning_type(self, mock_qdrant, mock_embedder):
        points = [
            _make_point("Fixed memory leak by closing connections", "error_resolution", "backend-developer"),
        ]
        promote_to_agent_knowledge(points, "backend-developer", mock_qdrant, mock_embedder)
        stored_points = mock_qdrant.upsert.call_args.kwargs["points"]
        assert stored_points[0].payload["section_type"] == "learned-pattern"
        assert stored_points[0].payload["agent_name"] == "backend-developer"

    def test_skips_general_group(self, mock_qdrant, mock_embedder):
        points = [_make_point("General discussion", "discussion")]
        count = promote_to_agent_knowledge(points, "_general", mock_qdrant, mock_embedder)
        assert count == 0

    def test_empty_input(self, mock_qdrant, mock_embedder):
        count = promote_to_agent_knowledge([], "solution-architect", mock_qdrant, mock_embedder)
        assert count == 0


# --- Tests for mark_as_distilled ---

class TestMarkAsDistilled:
    def test_sets_distilled_flag(self, mock_qdrant):
        point_ids = ["point-1", "point-2", "point-3"]
        mark_as_distilled(point_ids, mock_qdrant)
        mock_qdrant.set_payload.assert_called_once()
        call_kwargs = mock_qdrant.set_payload.call_args.kwargs
        assert call_kwargs["collection_name"] == "session-context"
        assert call_kwargs["payload"]["distilled"] is True

    def test_empty_ids(self, mock_qdrant):
        mark_as_distilled([], mock_qdrant)
        mock_qdrant.set_payload.assert_not_called()


# --- Tests for distill (integration) ---

class TestDistill:
    def test_full_pipeline(self, mock_qdrant, mock_embedder, sample_points):
        mock_qdrant.scroll.return_value = (sample_points, None)
        result = distill(mock_qdrant, mock_embedder)
        assert result["status"] == "distilled"
        assert result["points_processed"] == 5
        assert result["learnings_created"] > 0

    def test_nothing_to_distill(self, mock_qdrant, mock_embedder):
        mock_qdrant.scroll.return_value = ([], None)
        result = distill(mock_qdrant, mock_embedder)
        assert result["status"] == "empty"
        assert result["points_processed"] == 0

    def test_marks_processed_points(self, mock_qdrant, mock_embedder, sample_points):
        mock_qdrant.scroll.return_value = (sample_points, None)
        distill(mock_qdrant, mock_embedder)
        mock_qdrant.set_payload.assert_called()
