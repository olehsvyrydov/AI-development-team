"""Qdrant collection schemas for AI Team Memory."""

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PayloadSchemaType

VECTOR_SIZE = 1024  # voyage-code-3 output dimensions

COLLECTIONS = {
    "agent-knowledge": {
        "description": "SKILL.md sections — expertise, templates, checklists",
        "payload_indexes": {
            "agent_name": PayloadSchemaType.KEYWORD,
            "agent_command": PayloadSchemaType.KEYWORD,
            "category": PayloadSchemaType.KEYWORD,
            "section_type": PayloadSchemaType.KEYWORD,
            "source_file": PayloadSchemaType.KEYWORD,
        },
    },
    "decisions": {
        "description": "ADRs, architecture decisions",
        "payload_indexes": {
            "project": PayloadSchemaType.KEYWORD,
            "status": PayloadSchemaType.KEYWORD,
            "decision_type": PayloadSchemaType.KEYWORD,
            "source_file": PayloadSchemaType.KEYWORD,
        },
    },
    "learnings": {
        "description": "Sprint retrospective insights",
        "payload_indexes": {
            "agent_name": PayloadSchemaType.KEYWORD,
            "learning_type": PayloadSchemaType.KEYWORD,
            "sprint_number": PayloadSchemaType.INTEGER,
            "source_file": PayloadSchemaType.KEYWORD,
        },
    },
    "code-patterns": {
        "description": "Reusable code templates and patterns",
        "payload_indexes": {
            "language": PayloadSchemaType.KEYWORD,
            "framework": PayloadSchemaType.KEYWORD,
            "pattern_type": PayloadSchemaType.KEYWORD,
            "agent_name": PayloadSchemaType.KEYWORD,
            "source_file": PayloadSchemaType.KEYWORD,
        },
    },
    "session-context": {
        "description": "Conversation context snapshots for session persistence",
        "payload_indexes": {
            "project_path": PayloadSchemaType.KEYWORD,
            "session_id": PayloadSchemaType.KEYWORD,
            "chunk_type": PayloadSchemaType.KEYWORD,
            "timestamp": PayloadSchemaType.FLOAT,
        },
    },
}


def ensure_collections(client: QdrantClient) -> dict[str, bool]:
    """Create collections if they don't exist. Returns {name: created}."""
    existing = {c.name for c in client.get_collections().collections}
    results = {}

    for name, schema in COLLECTIONS.items():
        if name in existing:
            results[name] = False
            continue

        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(
                size=VECTOR_SIZE,
                distance=Distance.COSINE,
            ),
        )

        for field_name, field_type in schema["payload_indexes"].items():
            client.create_payload_index(
                collection_name=name,
                field_name=field_name,
                field_schema=field_type,
            )

        results[name] = True

    return results


def get_collection_stats(client: QdrantClient) -> list[dict]:
    """Return stats for all managed collections."""
    stats = []
    existing = {c.name for c in client.get_collections().collections}

    for name, schema in COLLECTIONS.items():
        if name not in existing:
            stats.append({
                "name": name,
                "description": schema["description"],
                "exists": False,
                "points": 0,
            })
            continue

        info = client.get_collection(name)
        stats.append({
            "name": name,
            "description": schema["description"],
            "exists": True,
            "points": info.points_count,
            "status": info.status.value,
        })

    return stats
