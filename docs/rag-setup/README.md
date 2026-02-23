# AI Team Memory — RAG Knowledge Base

Semantic knowledge retrieval for the AI Development Team framework.
Agents can search expertise, architecture decisions, sprint learnings, and code patterns
using natural language queries.

## Architecture

```
Claude Code (MCP client, stdio)
    |
FastMCP Server (python3 -m memory_mcp)
    |
    +-- voyage-code-3 embeddings (1024 dims)    # or gemini-embedding-001
    +-- Qdrant v1.13.2 (vector DB, Docker)
```

**4 Qdrant Collections:**

| Collection | Contents | Source |
|------------|----------|--------|
| `agent-knowledge` | SKILL.md sections (expertise, checklists, templates) | Ingestion pipeline |
| `code-patterns` | Code blocks >500 chars from SKILL.md | Ingestion pipeline |
| `decisions` | ADRs, architecture decisions | Runtime (`memory_store`) |
| `learnings` | Sprint retrospective insights | Runtime (`memory_store`) |

**4 MCP Tools:**

| Tool | Description |
|------|-------------|
| `memory_search` | Semantic search across any collection with optional filters |
| `memory_store` | Store new learning/decision/pattern at runtime |
| `memory_agent_expertise` | "What does Jorge know about X?" with alias resolution |
| `memory_stats` | Collection health and point counts |

## Quick Start

```bash
# 1. Start Qdrant
docker compose -f claude/rag/docker-compose.yml up -d

# 2. Install MCP server
cd claude/rag/mcp-server
python3 -m venv .venv
.venv/bin/pip install -e .

# 3. Initialize collections
cd ../management
python3 stats.py init

# 4. Ingest skills (get key from https://dash.voyageai.com/)
cd ../ingestion
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills

# 5. Register with Claude Code (user scope = all projects)
claude mcp add -s user \
  -e VOYAGE_API_KEY=your-key \
  -- /absolute/path/to/claude/rag/mcp-server/.venv/bin/python3 -m memory_mcp

# 6. Restart Claude Code
```

See detailed guides:

- **[setup-guide.md](setup-guide.md)** — Full installation, ingestion pipeline, and chunking strategy
- **[embedding-providers.md](embedding-providers.md)** — Voyage AI vs Gemini (free alternative)
- **[management.md](management.md)** — Backup, prune, reindex, troubleshooting
