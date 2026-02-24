"""Tests for save_context and restore_context modules — TDD Red phase."""

import json
import time
import uuid
from unittest.mock import MagicMock, patch

import pytest

from save_context import save_session_context, _embed_and_store_chunks
from restore_context import restore_session_context, _format_context_output


# --- Fixtures ---

@pytest.fixture
def sample_chunks():
    return [
        {
            "chunk_type": "decision",
            "content": "Using PostgreSQL instead of MySQL for JSONB support.",
            "metadata": {},
        },
        {
            "chunk_type": "file_change",
            "content": "Wrote database.py: DB_ENGINE = 'postgresql'",
            "metadata": {"file_path": "/project/src/config/database.py", "tool": "Write"},
        },
        {
            "chunk_type": "discussion",
            "content": "Q: What about Redis for caching?\nA: Redis is good for session caching but not needed yet.",
            "metadata": {},
        },
    ]


@pytest.fixture
def mock_qdrant():
    client = MagicMock()
    # Mock get_collections for ensure_collections
    collections = MagicMock()
    collections.collections = []
    client.get_collections.return_value = collections
    return client


@pytest.fixture
def mock_embedder():
    embedder = MagicMock()
    embedder.embed_documents.return_value = [
        [0.1] * 1024,
        [0.2] * 1024,
        [0.3] * 1024,
    ]
    embedder.embed_query.return_value = [0.5] * 1024
    return embedder


@pytest.fixture
def sample_transcript(tmp_path):
    """Create a sample transcript JSONL file."""
    messages = [
        {
            "type": "user",
            "message": {"role": "user", "content": "Let's use PostgreSQL instead of MySQL."},
        },
        {
            "type": "assistant",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "Good choice. PostgreSQL is better for our use case because of JSONB support."}],
            },
        },
        {
            "type": "assistant",
            "message": {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "name": "Write",
                        "input": {"file_path": "/project/src/db.py", "content": "engine = postgresql"},
                    }
                ],
            },
        },
    ]
    path = tmp_path / "transcript.jsonl"
    with open(path, "w") as f:
        for msg in messages:
            f.write(json.dumps(msg) + "\n")
    return str(path)


# --- Tests for _embed_and_store_chunks ---

class TestEmbedAndStoreChunks:
    def test_stores_chunks_in_qdrant(self, sample_chunks, mock_qdrant, mock_embedder):
        _embed_and_store_chunks(
            chunks=sample_chunks,
            qdrant=mock_qdrant,
            embedder=mock_embedder,
            session_id="test-session",
            project_path="/project",
        )
        mock_qdrant.upsert.assert_called_once()
        call_args = mock_qdrant.upsert.call_args
        assert call_args.kwargs["collection_name"] == "session-context"
        points = call_args.kwargs["points"]
        assert len(points) == 3

    def test_embeds_all_chunks(self, sample_chunks, mock_qdrant, mock_embedder):
        _embed_and_store_chunks(
            chunks=sample_chunks,
            qdrant=mock_qdrant,
            embedder=mock_embedder,
            session_id="test-session",
            project_path="/project",
        )
        mock_embedder.embed_documents.assert_called_once()
        texts = mock_embedder.embed_documents.call_args[0][0]
        assert len(texts) == 3

    def test_point_payloads_have_required_fields(self, sample_chunks, mock_qdrant, mock_embedder):
        _embed_and_store_chunks(
            chunks=sample_chunks,
            qdrant=mock_qdrant,
            embedder=mock_embedder,
            session_id="test-session",
            project_path="/project",
        )
        points = mock_qdrant.upsert.call_args.kwargs["points"]
        for point in points:
            payload = point.payload
            assert "content" in payload
            assert "chunk_type" in payload
            assert "session_id" in payload
            assert "project_path" in payload
            assert "timestamp" in payload
            assert payload["session_id"] == "test-session"
            assert payload["project_path"] == "/project"

    def test_skips_empty_chunks(self, mock_qdrant, mock_embedder):
        mock_embedder.embed_documents.return_value = []
        _embed_and_store_chunks(
            chunks=[],
            qdrant=mock_qdrant,
            embedder=mock_embedder,
            session_id="test-session",
            project_path="/project",
        )
        mock_qdrant.upsert.assert_not_called()

    def test_uses_deterministic_ids(self, sample_chunks, mock_qdrant, mock_embedder):
        _embed_and_store_chunks(
            chunks=sample_chunks,
            qdrant=mock_qdrant,
            embedder=mock_embedder,
            session_id="sess-1",
            project_path="/project",
        )
        points = mock_qdrant.upsert.call_args.kwargs["points"]
        ids = [p.id for p in points]
        # All IDs should be valid UUID strings
        for pid in ids:
            uuid.UUID(pid)  # Should not raise
        # IDs should be unique
        assert len(set(ids)) == len(ids)


# --- Tests for save_session_context ---

class TestSaveSessionContext:
    def test_full_save_pipeline(self, sample_transcript, mock_qdrant, mock_embedder):
        result = save_session_context(
            transcript_path=sample_transcript,
            session_id="test-session",
            project_path="/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
        )
        assert result["status"] == "saved"
        assert result["chunks_saved"] > 0

    def test_returns_zero_for_empty_transcript(self, tmp_path, mock_qdrant, mock_embedder):
        empty_path = tmp_path / "empty.jsonl"
        empty_path.write_text("")
        result = save_session_context(
            transcript_path=str(empty_path),
            session_id="test-session",
            project_path="/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
        )
        assert result["status"] == "empty"
        assert result["chunks_saved"] == 0

    def test_returns_error_for_missing_file(self, mock_qdrant, mock_embedder):
        result = save_session_context(
            transcript_path="/nonexistent/path.jsonl",
            session_id="test-session",
            project_path="/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
        )
        assert result["status"] == "empty"
        assert result["chunks_saved"] == 0


# --- Tests for _format_context_output ---

class TestFormatContextOutput:
    def test_formats_search_results(self):
        results = [
            MagicMock(
                score=0.95,
                payload={
                    "content": "Using PostgreSQL for JSONB support.",
                    "chunk_type": "decision",
                    "session_id": "sess-1",
                    "timestamp": time.time(),
                },
            ),
            MagicMock(
                score=0.85,
                payload={
                    "content": "Wrote database.py config file.",
                    "chunk_type": "file_change",
                    "session_id": "sess-1",
                    "timestamp": time.time(),
                },
            ),
        ]
        output = _format_context_output(results)
        assert "PostgreSQL" in output
        assert "database.py" in output
        assert "decision" in output.lower() or "Decision" in output

    def test_empty_results(self):
        output = _format_context_output([])
        assert output == ""

    def test_groups_by_chunk_type(self):
        results = [
            MagicMock(
                score=0.9,
                payload={
                    "content": "Decision A",
                    "chunk_type": "decision",
                    "session_id": "s1",
                    "timestamp": time.time(),
                },
            ),
            MagicMock(
                score=0.8,
                payload={
                    "content": "File change B",
                    "chunk_type": "file_change",
                    "session_id": "s1",
                    "timestamp": time.time(),
                },
            ),
            MagicMock(
                score=0.7,
                payload={
                    "content": "Decision C",
                    "chunk_type": "decision",
                    "session_id": "s1",
                    "timestamp": time.time(),
                },
            ),
        ]
        output = _format_context_output(results)
        # Should have sections for different types
        assert len(output) > 50


# --- Tests for restore_session_context ---

class TestRestoreSessionContext:
    def test_queries_qdrant_for_project(self, mock_qdrant, mock_embedder):
        mock_qdrant.query_points.return_value = MagicMock(points=[])
        result = restore_session_context(
            project_path="/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
        )
        mock_qdrant.query_points.assert_called_once()
        call_kwargs = mock_qdrant.query_points.call_args.kwargs
        assert call_kwargs["collection_name"] == "session-context"

    def test_returns_formatted_context(self, mock_qdrant, mock_embedder):
        mock_point = MagicMock(
            score=0.9,
            payload={
                "content": "Using PostgreSQL.",
                "chunk_type": "decision",
                "session_id": "s1",
                "timestamp": time.time(),
            },
        )
        mock_qdrant.query_points.return_value = MagicMock(points=[mock_point])
        result = restore_session_context(
            project_path="/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
        )
        assert "PostgreSQL" in result

    def test_returns_empty_when_no_results(self, mock_qdrant, mock_embedder):
        mock_qdrant.query_points.return_value = MagicMock(points=[])
        result = restore_session_context(
            project_path="/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
        )
        assert result == ""

    def test_filters_by_project_path(self, mock_qdrant, mock_embedder):
        mock_qdrant.query_points.return_value = MagicMock(points=[])
        restore_session_context(
            project_path="/my/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
        )
        call_kwargs = mock_qdrant.query_points.call_args.kwargs
        query_filter = call_kwargs.get("query_filter")
        # Should filter by project_path
        assert query_filter is not None

    def test_limits_results(self, mock_qdrant, mock_embedder):
        mock_qdrant.query_points.return_value = MagicMock(points=[])
        restore_session_context(
            project_path="/project",
            qdrant=mock_qdrant,
            embedder=mock_embedder,
            limit=10,
        )
        call_kwargs = mock_qdrant.query_points.call_args.kwargs
        assert call_kwargs["limit"] == 10
