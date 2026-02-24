"""Parse Claude Code transcript JSONL into structured context chunks.

Extracts decisions, file changes, task state, and key discussions
from a conversation transcript for persistence in Qdrant.
"""

import json
import re
from pathlib import Path

# Decision indicator patterns
DECISION_PATTERNS = re.compile(
    r"(?i)(instead of|rather than|I recommend|let's use|should we use|"
    r"better (for|because|than)|I'll go with|decided to|"
    r"the (approach|choice|decision|strategy) is|"
    r"we('ll| will| should) (use|go with|choose|pick|adopt)|"
    r"approved|rejected|choosing .+ over)"
)

# Error/problem patterns
ERROR_PATTERNS = re.compile(
    r"(?i)(error|exception|failed|failing|broken|crash|bug|issue|"
    r"problem|not working|connection refused|timeout|"
    r"doesn't work|can't connect|permission denied)"
)

# Minimum content length to be considered "substantive"
MIN_SUBSTANTIVE_LENGTH = 30

# File-modifying tool names
FILE_WRITE_TOOLS = {"Write", "Edit", "NotebookEdit"}

# Agent command → canonical name mapping
COMMAND_TO_AGENT = {
    "po": "product-owner", "max": "product-owner",
    "sm": "scrum-master", "luda": "scrum-master",
    "arch": "solution-architect", "jorge": "solution-architect",
    "ba": "business-analyst", "anna": "business-analyst",
    "secops": "secops-engineer", "soren": "secops-engineer",
    "fin": "uk-accountant", "inga": "uk-accountant",
    "legal": "uk-legal-counsel", "alex": "uk-legal-counsel",
    "ui": "ui-designer", "aura": "ui-designer",
    "fe": "frontend-developer", "finn": "frontend-developer",
    "be": "backend-developer", "james": "backend-developer",
    "rev": "reviewer", "reviewer": "reviewer",
    "qa": "tester", "rob": "tester", "tester": "tester",
    "e2e": "e2e-tester", "adam": "e2e-tester",
    "mkt": "apex", "apex": "apex",
}

# Pattern to detect /command at start of user message
COMMAND_PATTERN = re.compile(r"^/(\w+)\b")


def load_messages(jsonl_path: str) -> list[dict]:
    """Load and filter message entries from a transcript JSONL file.

    Skips non-message lines (file-history-snapshot, etc.) and malformed JSON.
    """
    messages = []
    path = Path(jsonl_path)
    if not path.exists():
        return messages

    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            entry_type = entry.get("type", "")
            if entry_type in ("user", "assistant", "tool_result"):
                messages.append(entry)

    return messages


def _get_text_content(message: dict) -> str:
    """Extract text content from a message entry."""
    msg = message.get("message", {})
    content = msg.get("content", "")

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    texts.append(block.get("text", ""))
        return " ".join(texts)

    return ""


def _get_tool_uses(message: dict) -> list[dict]:
    """Extract tool_use blocks from an assistant message."""
    msg = message.get("message", {})
    content = msg.get("content", [])

    if not isinstance(content, list):
        return []

    return [
        block for block in content
        if isinstance(block, dict) and block.get("type") == "tool_use"
    ]


def extract_decisions(messages: list[dict]) -> list[dict]:
    """Find architectural decisions, approach choices, rejected alternatives."""
    decisions = []

    for i, msg in enumerate(messages):
        if msg.get("type") != "assistant":
            continue

        text = _get_text_content(msg)
        if not text or len(text) < MIN_SUBSTANTIVE_LENGTH:
            continue

        if not DECISION_PATTERNS.search(text):
            continue

        # Include the preceding user message for context
        context_parts = []
        if i > 0 and messages[i - 1].get("type") == "user":
            user_text = _get_text_content(messages[i - 1])
            if user_text:
                context_parts.append(f"Q: {user_text}")

        context_parts.append(f"A: {text}")

        decisions.append({
            "chunk_type": "decision",
            "content": "\n".join(context_parts),
            "metadata": {},
        })

    return decisions


def extract_file_changes(messages: list[dict]) -> list[dict]:
    """Find files that were written/edited and summarize what changed."""
    changes = []
    seen_paths = set()

    for msg in messages:
        if msg.get("type") != "assistant":
            continue

        for tool_use in _get_tool_uses(msg):
            tool_name = tool_use.get("name", "")
            if tool_name not in FILE_WRITE_TOOLS:
                continue

            tool_input = tool_use.get("input", {})
            file_path = tool_input.get("file_path", "")

            if not file_path or file_path in seen_paths:
                continue
            seen_paths.add(file_path)

            filename = Path(file_path).name
            if tool_name == "Write":
                content_preview = tool_input.get("content", "")[:200]
                summary = f"Wrote {filename}: {content_preview}"
            elif tool_name == "Edit":
                old = tool_input.get("old_string", "")[:100]
                new = tool_input.get("new_string", "")[:100]
                summary = f"Edited {filename}: '{old}' → '{new}'"
            else:
                summary = f"Modified {filename}"

            changes.append({
                "chunk_type": "file_change",
                "content": summary,
                "metadata": {
                    "file_path": file_path,
                    "tool": tool_name,
                },
            })

    return changes


def extract_task_state(messages: list[dict]) -> list[dict]:
    """Find TaskCreate/TaskUpdate tool uses and summarize task state."""
    tasks = []

    for msg in messages:
        if msg.get("type") != "assistant":
            continue

        for tool_use in _get_tool_uses(msg):
            tool_name = tool_use.get("name", "")
            tool_input = tool_use.get("input", {})

            if tool_name == "TaskCreate":
                subject = tool_input.get("subject", "")
                description = tool_input.get("description", "")
                tasks.append({
                    "chunk_type": "task",
                    "content": f"Task created: {subject}. {description}",
                    "metadata": {"action": "created"},
                })

            elif tool_name == "TaskUpdate":
                task_id = tool_input.get("taskId", "")
                status = tool_input.get("status", "")
                subject = tool_input.get("subject", "")
                parts = [f"Task #{task_id}"]
                if status:
                    parts.append(f"→ {status}")
                if subject:
                    parts.append(f"({subject})")
                tasks.append({
                    "chunk_type": "task",
                    "content": " ".join(parts),
                    "metadata": {"action": "updated", "task_id": task_id, "status": status},
                })

    return tasks


def extract_key_discussions(messages: list[dict]) -> list[dict]:
    """Find important Q&A exchanges and error resolutions."""
    discussions = []

    for i in range(len(messages) - 1):
        user_msg = messages[i]
        next_msg = messages[i + 1]

        if user_msg.get("type") != "user" or next_msg.get("type") != "assistant":
            continue

        user_text = _get_text_content(user_msg)
        assistant_text = _get_text_content(next_msg)

        if not user_text or not assistant_text:
            continue

        # Skip trivial exchanges
        if len(user_text) < MIN_SUBSTANTIVE_LENGTH and len(assistant_text) < MIN_SUBSTANTIVE_LENGTH:
            continue

        # Check if it's an error resolution
        if ERROR_PATTERNS.search(user_text) and len(assistant_text) >= MIN_SUBSTANTIVE_LENGTH:
            discussions.append({
                "chunk_type": "error_resolution",
                "content": f"Problem: {user_text}\nResolution: {assistant_text}",
                "metadata": {},
            })
            continue

        # Check if it's a substantive discussion (question with detailed answer)
        is_question = user_text.rstrip().endswith("?") or len(user_text) >= MIN_SUBSTANTIVE_LENGTH
        has_detailed_answer = len(assistant_text) >= 80

        if is_question and has_detailed_answer:
            discussions.append({
                "chunk_type": "discussion",
                "content": f"Q: {user_text}\nA: {assistant_text}",
                "metadata": {},
            })

    return discussions


def normalize_chunks(chunks: list[dict], max_size: int = 400) -> list[dict]:
    """Split oversized chunks at sentence boundaries, preserve short ones.

    Args:
        chunks: List of chunk dicts with content, chunk_type, metadata.
        max_size: Maximum content length before splitting.

    Returns:
        List of chunks where each content <= max_size (approximately,
        respects sentence boundaries).
    """
    if not chunks:
        return []

    normalized = []
    for chunk in chunks:
        content = chunk["content"]
        if len(content) <= max_size:
            normalized.append(chunk)
            continue

        # Split at sentence boundaries (period followed by space or end)
        sentences = re.split(r"(?<=\.)\s+", content)
        current_part = ""

        for sentence in sentences:
            if current_part and len(current_part) + len(sentence) + 1 > max_size:
                if current_part.strip():
                    normalized.append({
                        "chunk_type": chunk["chunk_type"],
                        "content": current_part.strip(),
                        "metadata": dict(chunk["metadata"]),
                    })
                current_part = sentence
            else:
                current_part = f"{current_part} {sentence}".strip() if current_part else sentence

        if current_part.strip():
            normalized.append({
                "chunk_type": chunk["chunk_type"],
                "content": current_part.strip(),
                "metadata": dict(chunk["metadata"]),
            })

    return normalized


def detect_agent(messages: list[dict]) -> str | None:
    """Detect which AI team agent was active in this conversation.

    Looks for /command invocations in user messages and Skill tool uses.
    Returns canonical agent name or None.
    """
    for msg in messages:
        # Check user messages for /command patterns
        if msg.get("type") == "user":
            text = _get_text_content(msg)
            match = COMMAND_PATTERN.match(text.strip())
            if match:
                command = match.group(1).lower()
                agent = COMMAND_TO_AGENT.get(command)
                if agent:
                    return agent

        # Check assistant messages for Skill tool uses
        if msg.get("type") == "assistant":
            for tool_use in _get_tool_uses(msg):
                if tool_use.get("name") == "Skill":
                    skill = tool_use.get("input", {}).get("skill", "").lower()
                    agent = COMMAND_TO_AGENT.get(skill)
                    if agent:
                        return agent

    return None


def parse_transcript(jsonl_path: str) -> list[dict]:
    """Parse a Claude Code transcript JSONL into structured context chunks.

    Returns list of dicts, each with:
      - chunk_type: "decision" | "file_change" | "task" | "discussion" | "error_resolution"
      - content: text content of the chunk
      - metadata: additional context (files_mentioned, tools_used, etc.)
    """
    messages = load_messages(jsonl_path)
    if not messages:
        return []

    chunks = []
    chunks.extend(extract_decisions(messages))
    chunks.extend(extract_file_changes(messages))
    chunks.extend(extract_task_state(messages))
    chunks.extend(extract_key_discussions(messages))

    # Normalize chunk sizes
    chunks = normalize_chunks(chunks)

    # Detect active agent and tag all chunks
    agent = detect_agent(messages)
    if agent:
        for chunk in chunks:
            chunk["metadata"]["agent_name"] = agent

    return chunks
