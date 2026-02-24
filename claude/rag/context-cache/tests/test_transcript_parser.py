"""Tests for transcript_parser module — TDD Red phase."""

import json
import tempfile
from pathlib import Path

import pytest

from transcript_parser import (
    parse_transcript,
    extract_decisions,
    extract_file_changes,
    extract_task_state,
    extract_key_discussions,
    load_messages,
    normalize_chunks,
    detect_agent,
)


# --- Fixtures ---

def _write_jsonl(lines: list[dict], path: Path) -> Path:
    """Write a list of dicts as JSONL to a file."""
    with open(path, "w") as f:
        for line in lines:
            f.write(json.dumps(line) + "\n")
    return path


@pytest.fixture
def tmp_dir(tmp_path):
    return tmp_path


# --- Transcript samples ---

SAMPLE_USER_MSG = {
    "type": "user",
    "message": {
        "role": "user",
        "content": "Let's use PostgreSQL instead of MySQL for the database.",
    },
}

SAMPLE_ASSISTANT_MSG = {
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": "Good choice. PostgreSQL is better for our use case because of its JSONB support and full-text search. I'll update the architecture decision.",
            }
        ],
    },
}

SAMPLE_TOOL_USE_WRITE = {
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "tool_use",
                "name": "Write",
                "input": {
                    "file_path": "/home/user/project/src/config/database.py",
                    "content": "DB_ENGINE = 'postgresql'",
                },
            }
        ],
    },
}

SAMPLE_TOOL_USE_EDIT = {
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "tool_use",
                "name": "Edit",
                "input": {
                    "file_path": "/home/user/project/src/models/user.py",
                    "old_string": "engine = mysql",
                    "new_string": "engine = postgresql",
                },
            }
        ],
    },
}

SAMPLE_TOOL_USE_READ = {
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "tool_use",
                "name": "Read",
                "input": {
                    "file_path": "/home/user/project/README.md",
                },
            }
        ],
    },
}

SAMPLE_TOOL_RESULT = {
    "type": "tool_result",
    "message": {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "content": "File written successfully",
            }
        ],
    },
}

SAMPLE_ERROR_MSG = {
    "type": "user",
    "message": {
        "role": "user",
        "content": "I'm getting 'connection refused' when connecting to the database.",
    },
}

SAMPLE_ERROR_RESOLUTION = {
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": "The issue is that PostgreSQL isn't running. Start it with `sudo systemctl start postgresql`. The connection string also needs to use port 5432 instead of 3306.",
            }
        ],
    },
}

SAMPLE_TASK_MSG = {
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "tool_use",
                "name": "TaskCreate",
                "input": {
                    "subject": "Migrate database schema",
                    "description": "Update all models to use PostgreSQL-compatible types",
                },
            }
        ],
    },
}

SAMPLE_TASK_UPDATE = {
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "tool_use",
                "name": "TaskUpdate",
                "input": {
                    "taskId": "1",
                    "status": "completed",
                },
            }
        ],
    },
}

# Non-message lines (file-history-snapshot, etc.)
SAMPLE_SNAPSHOT = {
    "type": "file-history-snapshot",
    "messageId": "abc123",
    "snapshot": {"trackedFileBackups": {}},
}


# --- Tests for load_messages ---

class TestLoadMessages:
    def test_loads_jsonl_file(self, tmp_dir):
        path = _write_jsonl([SAMPLE_USER_MSG, SAMPLE_ASSISTANT_MSG], tmp_dir / "t.jsonl")
        messages = load_messages(str(path))
        assert len(messages) == 2
        assert messages[0]["type"] == "user"
        assert messages[1]["type"] == "assistant"

    def test_skips_non_message_lines(self, tmp_dir):
        path = _write_jsonl([SAMPLE_SNAPSHOT, SAMPLE_USER_MSG], tmp_dir / "t.jsonl")
        messages = load_messages(str(path))
        assert len(messages) == 1
        assert messages[0]["type"] == "user"

    def test_skips_malformed_json(self, tmp_dir):
        path = tmp_dir / "t.jsonl"
        with open(path, "w") as f:
            f.write("not valid json\n")
            f.write(json.dumps(SAMPLE_USER_MSG) + "\n")
        messages = load_messages(str(path))
        assert len(messages) == 1

    def test_empty_file(self, tmp_dir):
        path = tmp_dir / "t.jsonl"
        path.write_text("")
        messages = load_messages(str(path))
        assert messages == []

    def test_handles_tool_result_lines(self, tmp_dir):
        path = _write_jsonl([SAMPLE_TOOL_RESULT], tmp_dir / "t.jsonl")
        messages = load_messages(str(path))
        assert len(messages) == 1


# --- Tests for extract_decisions ---

class TestExtractDecisions:
    def test_finds_decision_in_conversation(self):
        messages = [SAMPLE_USER_MSG, SAMPLE_ASSISTANT_MSG]
        decisions = extract_decisions(messages)
        assert len(decisions) >= 1
        # Should capture the PostgreSQL decision
        combined = " ".join(d["content"] for d in decisions)
        assert "PostgreSQL" in combined

    def test_decision_has_correct_chunk_type(self):
        messages = [SAMPLE_USER_MSG, SAMPLE_ASSISTANT_MSG]
        decisions = extract_decisions(messages)
        for d in decisions:
            assert d["chunk_type"] == "decision"

    def test_no_decisions_in_simple_messages(self):
        simple = {
            "type": "user",
            "message": {"role": "user", "content": "Hello, how are you?"},
        }
        decisions = extract_decisions([simple])
        assert len(decisions) == 0

    def test_captures_approach_choices(self):
        user_msg = {
            "type": "user",
            "message": {"role": "user", "content": "Should we use REST or GraphQL?"},
        }
        assistant_msg = {
            "type": "assistant",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "I recommend REST for this API because the data model is simple and we don't need flexible queries. GraphQL would add unnecessary complexity."}],
            },
        }
        decisions = extract_decisions([user_msg, assistant_msg])
        assert len(decisions) >= 1
        combined = " ".join(d["content"] for d in decisions)
        assert "REST" in combined


# --- Tests for extract_file_changes ---

class TestExtractFileChanges:
    def test_finds_write_operations(self):
        messages = [SAMPLE_TOOL_USE_WRITE]
        changes = extract_file_changes(messages)
        assert len(changes) == 1
        assert changes[0]["chunk_type"] == "file_change"
        assert "database.py" in changes[0]["content"]

    def test_finds_edit_operations(self):
        messages = [SAMPLE_TOOL_USE_EDIT]
        changes = extract_file_changes(messages)
        assert len(changes) == 1
        assert "user.py" in changes[0]["content"]

    def test_includes_file_path_in_metadata(self):
        messages = [SAMPLE_TOOL_USE_WRITE]
        changes = extract_file_changes(messages)
        assert changes[0]["metadata"]["file_path"] == "/home/user/project/src/config/database.py"

    def test_ignores_read_operations(self):
        messages = [SAMPLE_TOOL_USE_READ]
        changes = extract_file_changes(messages)
        assert len(changes) == 0

    def test_multiple_changes(self):
        messages = [SAMPLE_TOOL_USE_WRITE, SAMPLE_TOOL_USE_EDIT]
        changes = extract_file_changes(messages)
        assert len(changes) == 2

    def test_edit_captures_what_changed(self):
        messages = [SAMPLE_TOOL_USE_EDIT]
        changes = extract_file_changes(messages)
        assert "mysql" in changes[0]["content"] or "postgresql" in changes[0]["content"]


# --- Tests for extract_task_state ---

class TestExtractTaskState:
    def test_finds_task_creation(self):
        messages = [SAMPLE_TASK_MSG]
        tasks = extract_task_state(messages)
        assert len(tasks) >= 1
        assert tasks[0]["chunk_type"] == "task"
        assert "Migrate database schema" in tasks[0]["content"]

    def test_finds_task_completion(self):
        messages = [SAMPLE_TASK_MSG, SAMPLE_TASK_UPDATE]
        tasks = extract_task_state(messages)
        # Should capture both creation and completion
        combined = " ".join(t["content"] for t in tasks)
        assert "completed" in combined.lower() or "Migrate" in combined

    def test_no_tasks_in_plain_conversation(self):
        messages = [SAMPLE_USER_MSG, SAMPLE_ASSISTANT_MSG]
        tasks = extract_task_state(messages)
        assert len(tasks) == 0


# --- Tests for extract_key_discussions ---

class TestExtractKeyDiscussions:
    def test_finds_qa_exchanges(self):
        messages = [SAMPLE_USER_MSG, SAMPLE_ASSISTANT_MSG]
        discussions = extract_key_discussions(messages)
        assert len(discussions) >= 1
        assert discussions[0]["chunk_type"] == "discussion"

    def test_finds_error_resolution(self):
        messages = [SAMPLE_ERROR_MSG, SAMPLE_ERROR_RESOLUTION]
        discussions = extract_key_discussions(messages)
        assert len(discussions) >= 1
        combined = " ".join(d["content"] for d in discussions)
        assert "connection" in combined.lower() or "PostgreSQL" in combined

    def test_skips_trivial_messages(self):
        trivial_user = {
            "type": "user",
            "message": {"role": "user", "content": "ok"},
        }
        trivial_assistant = {
            "type": "assistant",
            "message": {"role": "assistant", "content": [{"type": "text", "text": "Done."}]},
        }
        discussions = extract_key_discussions([trivial_user, trivial_assistant])
        assert len(discussions) == 0

    def test_discussion_includes_both_sides(self):
        messages = [SAMPLE_ERROR_MSG, SAMPLE_ERROR_RESOLUTION]
        discussions = extract_key_discussions(messages)
        if discussions:
            content = discussions[0]["content"]
            # Should include question and answer context
            assert len(content) > 50  # Not trivially short


# --- Tests for parse_transcript (integration) ---

class TestParseTranscript:
    def test_full_parse(self, tmp_dir):
        all_messages = [
            SAMPLE_SNAPSHOT,  # should be skipped
            SAMPLE_USER_MSG,
            SAMPLE_ASSISTANT_MSG,
            SAMPLE_TOOL_USE_WRITE,
            SAMPLE_TOOL_USE_EDIT,
            SAMPLE_TOOL_RESULT,
            SAMPLE_TASK_MSG,
            SAMPLE_ERROR_MSG,
            SAMPLE_ERROR_RESOLUTION,
        ]
        path = _write_jsonl(all_messages, tmp_dir / "transcript.jsonl")
        chunks = parse_transcript(str(path))

        # Should have chunks of various types
        chunk_types = {c["chunk_type"] for c in chunks}
        assert "file_change" in chunk_types
        assert len(chunks) >= 3  # At least file changes, discussions, decisions

    def test_each_chunk_has_required_fields(self, tmp_dir):
        all_messages = [
            SAMPLE_USER_MSG,
            SAMPLE_ASSISTANT_MSG,
            SAMPLE_TOOL_USE_WRITE,
        ]
        path = _write_jsonl(all_messages, tmp_dir / "transcript.jsonl")
        chunks = parse_transcript(str(path))

        for chunk in chunks:
            assert "chunk_type" in chunk
            assert "content" in chunk
            assert "metadata" in chunk
            assert chunk["chunk_type"] in (
                "decision", "file_change", "task",
                "discussion", "error_resolution",
            )
            assert isinstance(chunk["content"], str)
            assert len(chunk["content"]) > 0

    def test_deduplicates_chunks(self, tmp_dir):
        # Same message repeated should not produce duplicates
        all_messages = [SAMPLE_TOOL_USE_WRITE, SAMPLE_TOOL_USE_WRITE]
        path = _write_jsonl(all_messages, tmp_dir / "transcript.jsonl")
        chunks = parse_transcript(str(path))
        file_changes = [c for c in chunks if c["chunk_type"] == "file_change"]
        # Should deduplicate same file path
        paths = [c["metadata"].get("file_path") for c in file_changes]
        assert len(set(paths)) == len(paths)

    def test_empty_transcript(self, tmp_dir):
        path = tmp_dir / "transcript.jsonl"
        path.write_text("")
        chunks = parse_transcript(str(path))
        assert chunks == []


# --- Tests for normalize_chunks ---

class TestNormalizeChunks:
    def test_splits_long_chunks(self):
        long_content = "Important detail. " * 50  # ~900 chars
        chunks = [{"chunk_type": "discussion", "content": long_content, "metadata": {}}]
        normalized = normalize_chunks(chunks, max_size=400)
        assert len(normalized) >= 2
        for chunk in normalized:
            assert len(chunk["content"]) <= 500  # max_size + tolerance for sentence boundary

    def test_preserves_short_chunks(self):
        chunks = [{"chunk_type": "decision", "content": "Use PostgreSQL.", "metadata": {}}]
        normalized = normalize_chunks(chunks, max_size=400)
        assert len(normalized) == 1
        assert normalized[0]["content"] == "Use PostgreSQL."

    def test_preserves_chunk_type_after_split(self):
        long_content = "Sentence one about architecture. " * 30
        chunks = [{"chunk_type": "decision", "content": long_content, "metadata": {"key": "val"}}]
        normalized = normalize_chunks(chunks, max_size=200)
        for chunk in normalized:
            assert chunk["chunk_type"] == "decision"
            assert chunk["metadata"]["key"] == "val"

    def test_splits_at_sentence_boundaries(self):
        content = "First sentence about the API design. Second sentence about database choice. Third sentence about caching strategy. Fourth sentence about deployment."
        chunks = [{"chunk_type": "discussion", "content": content, "metadata": {}}]
        normalized = normalize_chunks(chunks, max_size=80)
        # Each sub-chunk should end at a sentence boundary (period)
        for chunk in normalized:
            text = chunk["content"].strip()
            assert text.endswith(".") or len(text) <= 80

    def test_empty_list(self):
        assert normalize_chunks([], max_size=400) == []

    def test_does_not_create_empty_chunks(self):
        chunks = [{"chunk_type": "decision", "content": "Short.", "metadata": {}}]
        normalized = normalize_chunks(chunks, max_size=400)
        for chunk in normalized:
            assert len(chunk["content"].strip()) > 0


# --- Tests for detect_agent ---

class TestDetectAgent:
    def test_detects_skill_invocation(self):
        messages = [
            {
                "type": "user",
                "message": {"role": "user", "content": "/arch Review this architecture."},
            },
            {
                "type": "assistant",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "As Solution Architect, I recommend using event sourcing."}],
                },
            },
        ]
        agent = detect_agent(messages)
        assert agent == "solution-architect"

    def test_detects_persona_alias(self):
        messages = [
            {
                "type": "user",
                "message": {"role": "user", "content": "/jorge What pattern should we use?"},
            },
        ]
        agent = detect_agent(messages)
        assert agent == "solution-architect"

    def test_detects_skill_tool_use(self):
        messages = [
            {
                "type": "assistant",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "name": "Skill",
                            "input": {"skill": "arch"},
                        }
                    ],
                },
            },
        ]
        agent = detect_agent(messages)
        assert agent == "solution-architect"

    def test_returns_none_for_no_agent(self):
        messages = [
            {
                "type": "user",
                "message": {"role": "user", "content": "Just a normal question."},
            },
        ]
        agent = detect_agent(messages)
        assert agent is None

    def test_detects_frontend_developer(self):
        messages = [
            {
                "type": "user",
                "message": {"role": "user", "content": "/fe Build the login component."},
            },
        ]
        agent = detect_agent(messages)
        assert agent == "frontend-developer"

    def test_detects_finn_alias(self):
        messages = [
            {
                "type": "user",
                "message": {"role": "user", "content": "/finn Build the dashboard."},
            },
        ]
        agent = detect_agent(messages)
        assert agent == "frontend-developer"

    def test_parse_transcript_includes_agent_metadata(self, tmp_dir):
        """Integration: parsed chunks should have agent_name when agent detected."""
        messages = [
            {
                "type": "user",
                "message": {"role": "user", "content": "/arch Should we use REST or GraphQL?"},
            },
            {
                "type": "assistant",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "I recommend REST for this API because the data model is simple. GraphQL would add unnecessary complexity."}],
                },
            },
        ]
        path = _write_jsonl(messages, tmp_dir / "transcript.jsonl")
        chunks = parse_transcript(str(path))
        # At least some chunks should have agent_name
        agents = [c["metadata"].get("agent_name") for c in chunks if c["metadata"].get("agent_name")]
        assert "solution-architect" in agents
