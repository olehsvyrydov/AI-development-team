# Knowledge Management — Adding and Managing Knowledge in Qdrant

This guide covers the complete data lifecycle: how knowledge enters the system, how to add your own, how it's organized, and how it flows through the pipeline.

## Knowledge Sources

Knowledge enters Qdrant through four paths:

| Source | How | Destination Collection | Automated? |
|--------|-----|----------------------|------------|
| SKILL.md files | Ingestion pipeline (`ingest.py`) | `agent-knowledge`, `code-patterns` | Manual |
| Session context | PreCompact hook (`save_context.py`) | `session-context` | Automatic |
| Runtime storage | MCP tool (`memory_store`) | Any collection | Manual (via Claude) |
| Distillation | `distill_context.py` | `learnings`, `agent-knowledge` | Manual |

## Qdrant Collections

### `agent-knowledge` — Agent Expertise

SKILL.md sections: expertise, checklists, templates, anti-patterns.

| Payload Field | Type | Description |
|---------------|------|-------------|
| `content` | text | The knowledge chunk text |
| `heading` | text | Section heading from SKILL.md |
| `agent_name` | keyword | Agent identifier (e.g., `solution-architect`) |
| `agent_command` | keyword | Slash command (e.g., `/arch`) |
| `category` | keyword | Skill category (e.g., `architecture`) |
| `section_type` | keyword | Heading type (e.g., `expertise`, `checklist`) |
| `source_file` | keyword | Origin file path or `session-context` for distilled entries |

### `code-patterns` — Reusable Code Templates

Code blocks >500 chars extracted from SKILL.md files.

| Payload Field | Type | Description |
|---------------|------|-------------|
| `content` | text | The code snippet |
| `language` | keyword | Programming language |
| `framework` | keyword | Framework (e.g., `spring-boot`, `react`) |
| `pattern_type` | keyword | Pattern category |
| `agent_name` | keyword | Source agent |
| `source_file` | keyword | Origin file path |

### `learnings` — Retrospective Insights

Sprint learnings, debugging insights, domain knowledge.

| Payload Field | Type | Description |
|---------------|------|-------------|
| `content` | text | The learning text |
| `agent_name` | keyword | Agent that generated this |
| `learning_type` | keyword | `architecture-decision`, `debugging-insight`, `domain-knowledge` |
| `sprint_number` | integer | Sprint number (if applicable) |
| `source_file` | keyword | `session-context` for distilled, file path for ingested |

### `decisions` — Architecture Decision Records

ADRs and significant architecture decisions.

| Payload Field | Type | Description |
|---------------|------|-------------|
| `content` | text | Decision description |
| `project` | keyword | Project name |
| `status` | keyword | Decision status |
| `decision_type` | keyword | Type of decision |
| `source_file` | keyword | Origin file path |

### `session-context` — Session Snapshots

Temporary conversation context for session continuity.

| Payload Field | Type | Description |
|---------------|------|-------------|
| `content` | text | Context chunk text |
| `chunk_type` | keyword | `decision`, `file_change`, `error_resolution`, `task`, `discussion` |
| `session_id` | keyword | Claude Code session ID |
| `project_path` | keyword | Working directory path |
| `timestamp` | float | Unix timestamp |
| `distilled` | boolean | Whether promoted to long-term memory |

## How to Add Knowledge

### Method 1: Edit SKILL.md and Re-ingest

The primary way to add permanent knowledge. Edit a SKILL.md file and re-ingest.

```bash
# 1. Edit the skill file
# Example: add a new anti-pattern to the backend developer skill
vim claude/skills/development/backend-developer/SKILL.md

# 2. Re-ingest (idempotent — updates existing, adds new)
cd claude/rag/ingestion
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills

# Or ingest just the changed file:
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills \
  --file ../../skills/development/backend-developer/SKILL.md
```

### Method 2: Store at Runtime via MCP

Use the `memory_store` MCP tool during a Claude Code session to persist learnings, decisions, or patterns.

In conversation:
```
Store this learning: Always use value objects for external IDs to prevent type confusion
```

Or use the `/memory` command:
```
/memory Store learning: Always use value objects for external IDs
```

Programmatically (from agent skills):
```python
memory_store(
    content="Always use value objects for external IDs to prevent type confusion",
    collection="learnings",
    metadata='{"agent_name": "backend-developer", "learning_type": "architecture-decision"}'
)
```

### Method 3: Automatic Session Context

Context is saved automatically when Claude Code compacts a conversation (if hooks are configured). No manual action needed. See [context-persistence-guide.md](context-persistence-guide.md).

### Method 4: Distillation Pipeline

Promotes session context to long-term knowledge:

```bash
cd claude/rag/context-cache

# Dry run — see what would be promoted
../mcp-server/.venv/bin/python3 distill_context.py --dry-run

# Run distillation
VOYAGE_API_KEY=your-key ../mcp-server/.venv/bin/python3 distill_context.py
```

### Method 5: Kai Proposals (Automated)

Kai analyzes accumulated learnings and proposes SKILL.md updates. See [kai-guide.md](kai-guide.md).

## Querying Knowledge

### Via MCP Tools (in Claude Code)

```
# Search across any collection
/memory Search for React state management patterns

# Ask what an agent knows
/memory What does Jorge know about webhook security?

# Check collection health
/memory Show stats
```

### Via Python (programmatic)

```python
from qdrant_client import QdrantClient
from memory_mcp.embeddings import VoyageEmbeddingProvider

qdrant = QdrantClient(url="http://localhost:6333")
embedder = VoyageEmbeddingProvider()

# Semantic search
vector = embedder.embed_query("webhook security patterns")
results = qdrant.query_points(
    collection_name="agent-knowledge",
    query=vector,
    limit=5,
).points

for point in results:
    print(f"[{point.score:.2f}] {point.payload['content'][:100]}")
```

### Via REST API (curl)

```bash
# Collection stats
curl http://localhost:6333/collections/agent-knowledge

# Scroll all points
curl -X POST http://localhost:6333/collections/learnings/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"limit": 10, "with_payload": true}'
```

## Full Data Lifecycle

```
                          INGESTION
SKILL.md files ──────────────────────────────> agent-knowledge
                  ingest.py                    code-patterns
                  (chunking + embedding)


                        RUNTIME STORAGE
Claude conversation ────────────────────────> learnings
                      memory_store MCP         decisions
                      (direct embedding)       code-patterns


                      SESSION PERSISTENCE
Claude conversation ────────────────────────> session-context
                      save_context.py
                      (PreCompact hook)

                                                    ↓

                        DISTILLATION
session-context ────────────────────────────> learnings
                  distill_context.py           agent-knowledge
                  (promote patterns)

                                                    ↓

                      SELF-IMPROVEMENT
learnings + agent-knowledge ────────────────> SKILL.md updates
                              Kai                   ↓
                              (pattern detection)   ↓
                                                    ↓
                                              Re-ingestion
                                              (ingest.py --file)
                                                    ↓
                                              agent-knowledge
                                              (updated embeddings)
```

## Management Operations

### Check Health

```bash
cd claude/rag/management
python3 stats.py health    # Qdrant connectivity
python3 stats.py stats     # Collection point counts
```

### Initialize Collections

```bash
python3 stats.py init      # Create collections with proper schemas
```

### Backup

```bash
python3 backup.py export --output-dir ./backups
```

### Find Stale Points

```bash
# Points whose source files no longer exist
python3 prune.py stale --base-dir /path/to/project --collection agent-knowledge
```

### Full Reindex

```bash
# Delete and recreate a collection, then re-ingest
python3 reindex.py --skills-dir ../../skills --yes
cd ../ingestion
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
```

## Embedding Details

- **Model**: `voyage-code-3` (Voyage AI)
- **Dimensions**: 1024
- **Distance**: Cosine similarity
- **Batch size**: 64 (ingestion), 1 (runtime queries)
- **Cost**: Free tier includes 200M tokens (~130K SKILL.md ingestions)

Alternative: Gemini `text-embedding-004` — free, 768 dimensions. See [embedding-providers.md](rag-setup/embedding-providers.md).

## Testing

```bash
# Ingestion tests (chunking + metadata)
cd claude/rag/mcp-server
.venv/bin/python3 -m pytest ../ingestion/tests/ -v     # 20 tests

# Context persistence tests
.venv/bin/python3 -m pytest ../context-cache/tests/ -v  # 75 tests

# Kai tests
.venv/bin/python3 -m pytest ../kai/tests/ -v            # 88 tests

# MCP server tests
.venv/bin/python3 -m pytest tests/ -v                   # 20 tests

# All RAG tests
.venv/bin/python3 -m pytest ../ingestion/tests/ ../context-cache/tests/ ../kai/tests/ tests/ -v
```
