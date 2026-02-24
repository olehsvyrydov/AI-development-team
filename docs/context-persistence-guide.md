# Context Persistence — Session Continuity

The context persistence system preserves important decisions, file changes, and error resolutions across Claude Code sessions. When a conversation is compacted or resumed, the system automatically saves and restores relevant context via Qdrant.

## How It Works

```
                    SAVE (PreCompact)                    RESTORE (SessionStart)

Claude conversation                                 New/resumed session
        ↓                                                   ↓
JSONL transcript                                    Read hook input (stdin)
        ↓                                                   ↓
transcript_parser.py                                restore_context.py
  ├── decisions                                       ├── Query Qdrant for project
  ├── file_changes                                    ├── Filter by project_path
  ├── error_resolutions                               └── Format as markdown
  ├── tasks                                                 ↓
  └── discussions                                   Print to stdout
        ↓                                                   ↓
save_context.py                                     Claude reads context
  ├── Embed with voyage-code-3                      (injected into conversation)
  └── Store in Qdrant "session-context"
```

## Architecture

### Save Pipeline (PreCompact Hook)

When Claude Code compacts a conversation, the `save_context.py` hook runs automatically:

1. Reads the JSONL transcript from the path provided by Claude Code
2. `transcript_parser.py` extracts 5 types of context chunks:
   - **Decisions** — approach choices, technology selections, architectural decisions
   - **File changes** — files created, modified, or deleted
   - **Error resolutions** — problems encountered and how they were fixed
   - **Tasks** — task progress and completions
   - **Discussions** — substantive technical discussions
3. Each chunk is embedded with `voyage-code-3` (1024 dimensions)
4. Stored in Qdrant's `session-context` collection with metadata

### Restore Pipeline (SessionStart Hook)

When Claude Code starts a new session after compaction or resume:

1. `restore_context.py` reads hook input from stdin (session_id, cwd)
2. Queries Qdrant for recent context matching the project path
3. Formats results as markdown grouped by type
4. Prints to stdout — Claude Code injects this into the conversation context

### Distillation Pipeline (Manual)

Long-term knowledge extraction from session context:

1. `distill_context.py` fetches undistilled entries from `session-context`
2. Groups entries by agent name
3. Promotes decisions and error resolutions to:
   - `learnings` collection (cross-agent insights)
   - `agent-knowledge` collection (agent-specific patterns)
4. Marks processed entries as `distilled` to prevent reprocessing

```bash
cd claude/rag/context-cache
../mcp-server/.venv/bin/python3 distill_context.py [--project-path /path] [--dry-run]
```

## Setup

### Prerequisites

- Qdrant running (`docker compose up -d` in `claude/rag/`)
- AI Team Memory MCP server installed (`claude/rag/mcp-server/.venv/`)
- `VOYAGE_API_KEY` environment variable set

### Configure Hooks

Add the following to your Claude Code project settings (`.claude/projects/<project-hash>/settings.local.json`):

```json
{
  "hooks": {
    "PreCompact": [
      {
        "type": "command",
        "command": "/path/to/claude/rag/mcp-server/.venv/bin/python3 /path/to/claude/rag/context-cache/save_context.py"
      }
    ],
    "SessionStart": [
      {
        "type": "command",
        "command": "/path/to/claude/rag/mcp-server/.venv/bin/python3 /path/to/claude/rag/context-cache/restore_context.py",
        "triggers": ["compact", "resume"]
      }
    ]
  }
}
```

Replace `/path/to/` with the actual absolute paths on your machine.

### Hook Input/Output

**PreCompact hook** receives on stdin:

```json
{
  "session_id": "abc-123-def",
  "transcript_path": "/tmp/claude-transcript-xyz.jsonl",
  "cwd": "/home/user/my-project"
}
```

**SessionStart hook** receives on stdin:

```json
{
  "session_id": "abc-123-def",
  "cwd": "/home/user/my-project"
}
```

**SessionStart hook** prints restored context to stdout (injected into Claude's context):

```markdown
## Restored Context from Previous Session

### Decisions & Approach Choices
- Decided to use CQRS for the payment module
- Chose PostgreSQL over MongoDB for transaction safety

### Files Modified
- src/main/java/PaymentService.java — added refund logic
- src/test/java/PaymentServiceTest.java — TDD tests

### Error Resolutions
- Fixed connection pool exhaustion by setting maxPoolSize=20
```

## Transcript Parser

The `transcript_parser.py` module extracts structured chunks from Claude Code's JSONL transcript format:

### Chunk Types

| Type | Detection | Examples |
|------|-----------|---------|
| `decision` | Keywords: "instead of", "I recommend", "decided to", "choosing X over Y" | Technology choices, approach selections |
| `file_change` | Tool calls: Write, Edit, NotebookEdit | File paths, what was changed |
| `error_resolution` | Keywords: "error", "failed", "fixed", "resolved" | Bug fixes, debugging insights |
| `task` | Tool calls: TaskCreate, TaskUpdate | Task completions, status changes |
| `discussion` | Substantive text >30 chars not matching other types | Architecture discussions, requirements clarification |

### Agent Detection

The parser detects which agent was active by looking for `/command` invocations:

```python
# Maps both role-based and persona commands
"/arch" → "solution-architect"
"/jorge" → "solution-architect"
"/be" → "backend-developer"
"/james" → "backend-developer"
```

This metadata is preserved in Qdrant, enabling agent-specific queries.

### Smart Chunking

Content is normalized with `normalize_chunks()`:
- Splits at sentence boundaries
- Maximum 400 characters per chunk
- Preserves semantic coherence

## Qdrant Collection: `session-context`

| Field | Type | Description |
|-------|------|-------------|
| `content` | text | The context chunk text |
| `chunk_type` | keyword (indexed) | decision, file_change, error_resolution, task, discussion |
| `session_id` | keyword (indexed) | Claude Code session ID |
| `project_path` | keyword (indexed) | Working directory path |
| `timestamp` | float (indexed) | Unix timestamp |
| `agent_name` | keyword | Detected agent (if any) |
| `distilled` | boolean | Whether this entry has been promoted to long-term memory |

## Data Lifecycle

```
Session context lifecycle:

1. Conversation happens                  (Claude Code)
2. PreCompact saves chunks               (session-context collection)
3. SessionStart restores for next session (query + stdout)
4. distill_context.py promotes patterns   (learnings + agent-knowledge)
5. Kai detects recurring patterns         (analyzer.py)
6. Kai proposes SKILL.md updates          (proposer.py)
7. Human approves, Kai applies            (applier.py)

Time dimension:
├── Session-scoped (hours)  → session-context
├── Sprint-scoped (weeks)   → learnings
├── Permanent (forever)     → agent-knowledge, SKILL.md
```

## Troubleshooting

### Hooks not firing

Check hook configuration:
```bash
cat .claude/projects/*/settings.local.json | python3 -m json.tool
```

Verify the Python path is correct and the script is executable.

### No context restored

Check if `session-context` has entries:
```bash
cd claude/rag/management
python3 stats.py stats
# Look for session-context collection point count
```

If the collection is empty, the PreCompact hook may not have fired. Trigger a manual save:
```bash
echo '{"session_id": "test", "transcript_path": "/path/to/transcript.jsonl", "cwd": "/your/project"}' | \
  VOYAGE_API_KEY=your-key python3 claude/rag/context-cache/save_context.py
```

### Distillation not promoting

Run dry-run first to see what would be distilled:
```bash
python3 distill_context.py --dry-run
```

Only `decision`, `error_resolution`, and `discussion` chunk types are promotable. File changes and tasks are session-scoped only.

## Files

```
claude/rag/context-cache/
├── transcript_parser.py   # Parse JSONL transcripts → structured chunks
├── save_context.py        # PreCompact hook: parse → embed → store
├── restore_context.py     # SessionStart hook: query → format → stdout
└── distill_context.py     # Promote learnings to long-term memory
```

All scripts use the shared venv at `claude/rag/mcp-server/.venv/`.
