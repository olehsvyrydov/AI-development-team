#!/usr/bin/env python3
"""PreCompact hook: save conversation context to Qdrant before compaction.

Reads JSONL transcript, extracts important context chunks,
embeds them with voyage-code-3, and stores in Qdrant "session-context" collection.

Usage as hook:
    Receives JSON on stdin with session_id, transcript_path, cwd fields.

Usage as library:
    save_session_context(transcript_path, session_id, project_path, qdrant, embedder)
"""

import json
import os
import sys
import time
import uuid

from qdrant_client.models import PointStruct

from transcript_parser import parse_transcript

COLLECTION = "session-context"
NAMESPACE_UUID = uuid.UUID("c3d4e5f6-a7b8-9012-cdef-234567890abc")


def _embed_and_store_chunks(
    chunks: list[dict],
    qdrant,
    embedder,
    session_id: str,
    project_path: str,
) -> int:
    """Embed context chunks and store them in Qdrant.

    Returns the number of chunks stored.
    """
    if not chunks:
        return 0

    texts = [c["content"] for c in chunks]
    vectors = embedder.embed_documents(texts)
    now = time.time()

    points = []
    for chunk, vector in zip(chunks, vectors):
        point_id = str(uuid.uuid5(
            NAMESPACE_UUID,
            f"{session_id}::{chunk['chunk_type']}::{chunk['content'][:200]}"
        ))

        payload = {
            "content": chunk["content"],
            "chunk_type": chunk["chunk_type"],
            "session_id": session_id,
            "project_path": project_path,
            "timestamp": now,
        }
        # Merge extra metadata
        for k, v in chunk.get("metadata", {}).items():
            if k not in payload:
                payload[k] = v

        points.append(PointStruct(id=point_id, vector=vector, payload=payload))

    qdrant.upsert(collection_name=COLLECTION, points=points)
    return len(points)


def save_session_context(
    transcript_path: str,
    session_id: str,
    project_path: str,
    qdrant,
    embedder,
) -> dict:
    """Parse transcript and save context chunks to Qdrant.

    Returns dict with status and chunks_saved count.
    """
    chunks = parse_transcript(transcript_path)
    if not chunks:
        return {"status": "empty", "chunks_saved": 0}

    count = _embed_and_store_chunks(
        chunks=chunks,
        qdrant=qdrant,
        embedder=embedder,
        session_id=session_id,
        project_path=project_path,
    )
    return {"status": "saved", "chunks_saved": count}


def main():
    """Entry point for PreCompact hook. Reads hook input from stdin."""
    hook_input = json.load(sys.stdin)

    transcript_path = hook_input.get("transcript_path", "")
    session_id = hook_input.get("session_id", "")
    cwd = hook_input.get("cwd", os.getcwd())

    if not transcript_path or not session_id:
        print(json.dumps({"error": "Missing transcript_path or session_id"}), file=sys.stderr)
        sys.exit(1)

    # Lazy imports to avoid import errors when used as library with mocks
    from qdrant_client import QdrantClient
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))
    from memory_mcp.embeddings import VoyageEmbeddingProvider
    from memory_mcp.collections import ensure_collections

    qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333")
    qdrant = QdrantClient(url=qdrant_url)
    embedder = VoyageEmbeddingProvider()

    ensure_collections(qdrant)

    result = save_session_context(
        transcript_path=transcript_path,
        session_id=session_id,
        project_path=cwd,
        qdrant=qdrant,
        embedder=embedder,
    )

    print(json.dumps(result), file=sys.stderr)


if __name__ == "__main__":
    main()
