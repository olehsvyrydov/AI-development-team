# AI Team Memory — RAG Knowledge Base

Semantic knowledge retrieval for the AI Development Team framework. Agents can search across expertise, past decisions, retrospective learnings, and reusable code patterns.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Claude Code    │────>│  MCP Server  │────>│   Qdrant     │
│  (stdio)        │<────│  (Python)    │<────│   (Docker)   │
└─────────────────┘     └──────┬───────┘     └──────────────┘
                               │
                        ┌──────┴───────┐
                        │  Voyage AI   │
                        │  (embeddings)│
                        └──────────────┘
```

## Quick Start

### 1. Start Qdrant

```bash
cd claude/rag
docker compose up -d
curl http://localhost:6333/healthz  # Should return "ok"
```

### 2. Install Python Dependencies

```bash
cd mcp-server
python3 -m venv .venv
.venv/bin/pip install -e .
```

### 3. Initialize Collections

```bash
cd ../management
python3 stats.py init
python3 stats.py stats
```

### 4. Get Voyage AI API Key

Sign up at [dash.voyageai.com](https://dash.voyageai.com/) (free tier: 200M tokens).

### 5. Ingest SKILL.md Files

```bash
cd ../ingestion
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
```

### 6. Register MCP Server

```bash
claude mcp add ai-team-memory \
  -e VOYAGE_API_KEY=your-key \
  -- /path/to/claude/rag/mcp-server/.venv/bin/python3 -m memory_mcp
```

### 7. Verify

```bash
claude mcp list  # Should show ai-team-memory
```

Then in Claude Code:
- "What does Jorge know about webhook security?"
- `/memory Search for React state management patterns`

## Collections

| Collection | Contents | Key Filters |
|------------|----------|-------------|
| `agent-knowledge` | SKILL.md sections | `agent_name`, `category`, `section_type` |
| `decisions` | Architecture decisions, ADRs | `project`, `status` |
| `learnings` | Sprint retrospective insights | `agent_name`, `learning_type` |
| `code-patterns` | Reusable code templates | `language`, `framework` |
| `session-context` | Conversation context snapshots | `session_id`, `project_path`, `chunk_type` |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `memory_search` | Semantic search with optional collection and filters |
| `memory_store` | Store new knowledge at runtime |
| `memory_agent_expertise` | "What does [agent] know about X?" |
| `memory_stats` | Collection sizes and health |

## Management

```bash
cd management

# Health check
python3 stats.py health

# Collection stats
python3 stats.py stats

# Export snapshots
python3 backup.py export --output-dir ./backups

# Find stale points
python3 prune.py stale --base-dir /path/to/project --collection agent-knowledge

# Full reindex
python3 reindex.py --skills-dir ../../skills --yes
```

## Directory Structure

```
claude/rag/
├── README.md                 # This file
├── docker-compose.yml        # Qdrant container
├── .env.example              # API key template
│
├── mcp-server/               # Custom MCP server
│   ├── pyproject.toml
│   └── memory_mcp/
│       ├── __init__.py
│       ├── __main__.py
│       ├── server.py          # MCP entry point (stdio)
│       ├── embeddings.py      # Voyage AI provider
│       ├── collections.py     # 5 collection schemas
│       └── tools.py           # 4 MCP tool implementations
│
├── ingestion/                 # Ingestion pipeline
│   ├── ingest.py              # Main CLI
│   ├── chunker.py             # Markdown heading-based splitter
│   ├── metadata.py            # Agent/category extraction
│   └── tests/                 # 20 tests
│
├── context-cache/             # Session persistence
│   ├── transcript_parser.py   # Parse JSONL transcripts → chunks
│   ├── save_context.py        # PreCompact hook
│   ├── restore_context.py     # SessionStart hook
│   ├── distill_context.py     # Promote to long-term memory
│   └── tests/                 # 75 tests
│
├── kai/                       # Self-improving meta-agent
│   ├── models.py              # Data models
│   ├── skill_parser.py        # Parse SKILL.md sections
│   ├── quality.py             # SM quality rule validation
│   ├── analyzer.py            # Pattern detection
│   ├── proposer.py            # Proposal generation
│   ├── applier.py             # Apply proposals to SKILL.md
│   ├── cli.py                 # CLI entry point
│   ├── proposals/             # Stored proposal JSON files
│   └── tests/                 # 88 tests
│
└── management/                # Management scripts
    ├── stats.py               # Collection stats + init
    ├── backup.py              # Snapshot export
    ├── prune.py               # Stale/duplicate cleanup
    └── reindex.py             # Full re-ingestion
```

## Extended Documentation

| Guide | Description |
|-------|-------------|
| [Setup Guide](../docs/rag-setup/setup-guide.md) | Full installation and ingestion walkthrough |
| [Knowledge Management](../docs/knowledge-management-guide.md) | Collections, adding knowledge, data lifecycle |
| [Context Persistence](../docs/context-persistence-guide.md) | Session hooks, distillation |
| [Kai Guide](../docs/kai-guide.md) | Self-improving meta-agent |
| [Embedding Providers](../docs/rag-setup/embedding-providers.md) | Voyage AI vs Gemini |
| [Management](../docs/rag-setup/management.md) | Backup, prune, reindex |

## Technical Details

- **Embeddings**: voyage-code-3 (1024 dimensions, cosine distance)
- **Chunking**: Split at `##` headings, further at `###` for sections >2000 chars
- **Code extraction**: Code blocks >500 chars extracted as separate `code-patterns`
- **Idempotent**: Deterministic UUIDs from `source_file + heading` — safe to re-run
- **Estimated volume**: ~1500 chunks from 37 SKILL.md files
- **Total tests**: 203 (20 ingestion + 75 context-cache + 88 kai + 20 MCP server)
