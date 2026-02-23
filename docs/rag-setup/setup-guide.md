# Setup Guide — AI Team Memory

Complete step-by-step guide to install, configure, and run the RAG knowledge base.

## Prerequisites

- Python 3.11+
- Docker (for Qdrant)
- Claude Code CLI (`claude` command available)
- API key for embedding provider (Voyage AI or Google Gemini — see [embedding-providers.md](embedding-providers.md))

## 1. Start Qdrant Vector Database

```bash
cd claude/rag
docker compose up -d
```

Verify it's running:

```bash
curl http://localhost:6333/healthz
# Expected: "ok"
```

**What this runs:**
- `qdrant/qdrant:v1.13.2` container named `ai-team-qdrant`
- REST API on port `6333`, gRPC on port `6334`
- Persistent named volume `ai-team-qdrant-data` (survives container restarts)

To stop: `docker compose -f claude/rag/docker-compose.yml down`
To stop and delete data: `docker compose -f claude/rag/docker-compose.yml down -v`

## 2. Install MCP Server

```bash
cd claude/rag/mcp-server
python3 -m venv .venv
.venv/bin/pip install -e .
```

This installs:
- `mcp>=1.12` — Model Context Protocol framework (FastMCP)
- `voyageai>=0.3` — Voyage AI embedding client
- `qdrant-client>=1.13` — Qdrant Python client
- `python-dotenv>=1.0` — Environment variable management

> If using Gemini instead of Voyage AI, see [embedding-providers.md](embedding-providers.md) for additional dependencies.

## 3. Initialize Qdrant Collections

```bash
cd claude/rag/management
python3 stats.py init
```

This creates 4 collections in Qdrant with proper vector config and payload indexes:

| Collection | Vector Size | Indexed Fields |
|------------|-------------|----------------|
| `agent-knowledge` | 1024 | agent_name, agent_command, category, section_type, source_file |
| `code-patterns` | 1024 | language, framework, pattern_type, agent_name, source_file |
| `decisions` | 1024 | project, status, decision_type, source_file |
| `learnings` | 1024 | agent_name, learning_type, sprint_number, source_file |

Verify:

```bash
python3 stats.py stats
```

Expected output:

```
Collection           Status     Points     Description
agent-knowledge      green      0          SKILL.md sections
code-patterns        green      0          Reusable code templates
decisions            green      0          ADRs, architecture decisions
learnings            green      0          Sprint retrospective insights
```

## 4. Ingest SKILL.md Files

This is where your skill files get chunked, embedded, and stored in Qdrant.

### Dry run first (no API calls, no cost)

```bash
cd claude/rag/ingestion
python3 ingest.py --skills-dir ../../skills --dry-run
```

This shows what _would_ be ingested without calling the embedding API:

```
DRY RUN — no embeddings or upserts will be made
Processing: claude/skills/architecture/solution-architect/SKILL.md
  → agent: solution-architect, category: architecture
  → 42 knowledge chunks, 8 code patterns
...
Total: 1510 chunks from 37 files (1289 knowledge + 221 code patterns)
```

### Run the actual ingestion

```bash
cd claude/rag/ingestion
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
```

Options:

```bash
# Ingest a single file
VOYAGE_API_KEY=your-key python3 ingest.py --file ../../skills/architecture/solution-architect/SKILL.md

# Custom Qdrant URL (default: http://localhost:6333)
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills --qdrant-url http://remote-host:6333
```

### How chunking works

The ingestion pipeline splits each SKILL.md into semantic chunks:

```
SKILL.md file
    |
    +-- Parse YAML frontmatter (name, description)
    +-- Extract metadata from file path
    |     claude/skills/{category}/{agent-name}/SKILL.md
    |     → agent_name: "solution-architect"
    |     → category: "architecture"
    |     → agent_command: "/arch" (from frontmatter)
    |
    +-- Split at ## headings (level 2)
    |     Each ## section → one chunk
    |
    +-- If section > 2000 chars AND has ### subsections
    |     Split further at ### headings (level 3)
    |
    +-- Extract code blocks > 500 chars
    |     Each large code block → separate "code-pattern" chunk
    |
    +-- Generate deterministic UUID for each chunk
    |     uuid5(namespace, "{source_file}::{heading}")
    |     → Safe to re-run (idempotent upserts)
    |
    +-- Embed with voyage-code-3 (batch size: 64)
    |
    +-- Upsert to Qdrant
          knowledge chunks → agent-knowledge collection
          code blocks      → code-patterns collection
```

**Chunking thresholds:**
- `MAX_SECTION_CHARS = 2000` — sections larger than this get sub-split at ### headings
- `MIN_CODE_PATTERN_CHARS = 500` — code blocks smaller than this stay inline

**Example:** A SKILL.md with this structure:

```markdown
---
name: solution-architect
description: "Solution Architect (/arch, alias: Jorge)"
---

## Core Architecture Patterns       → chunk 1 (agent-knowledge)
CQRS, Event Sourcing, Saga...

## Security Architecture            → chunk 2 (agent-knowledge)
### Authentication                  → chunk 2a (sub-split if parent > 2000 chars)
### Authorization                   → chunk 2b

## Code Templates                   → chunk 3 (agent-knowledge)
```java                             → separate chunk (code-patterns)
@Configuration                         if code block > 500 chars
public class SecurityConfig { ... }
​```
```

### Re-ingesting after skill changes

Ingestion is **idempotent** — chunk IDs are deterministic based on file path + heading.
Running `ingest.py` again will update existing chunks and add new ones.

```bash
# After editing skills, just re-run:
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
```

To do a full clean reindex instead:

```bash
cd claude/rag/management
python3 reindex.py --skills-dir ../../skills --yes
# Then re-ingest
cd ../ingestion
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
```

## 5. Register MCP Server with Claude Code

### User scope (recommended — available in all projects)

```bash
claude mcp add -s user \
  -e VOYAGE_API_KEY=your-key \
  -- /absolute/path/to/claude/rag/mcp-server/.venv/bin/python3 -m memory_mcp
```

### Project scope (only available in one project)

```bash
claude mcp add \
  -e VOYAGE_API_KEY=your-key \
  -- /absolute/path/to/claude/rag/mcp-server/.venv/bin/python3 -m memory_mcp
```

> **Important:** Use the absolute path to the `.venv/bin/python3` inside the MCP server directory.
> The module `memory_mcp` must be importable from that venv.

### Verify

```bash
claude mcp list
# Should show: ai-team-memory (stdio)
```

### Remove

```bash
claude mcp remove -s user ai-team-memory    # user scope
claude mcp remove ai-team-memory             # project scope (run from project dir)
```

## 6. Verify Everything Works

Restart Claude Code, then test:

```
/memory search "webhook security patterns"
```

Or use the tools directly in conversation:
- "What does Jorge know about CQRS?"
- "Search for React state management patterns"

### From the command line

```bash
cd claude/rag/management
python3 stats.py health    # Qdrant connectivity
python3 stats.py stats     # Collection point counts
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VOYAGE_API_KEY` | Yes (if using Voyage) | — | Voyage AI API key |
| `GOOGLE_API_KEY` | Yes (if using Gemini) | — | Google AI Studio API key |
| `QDRANT_URL` | No | `http://localhost:6333` | Qdrant REST API endpoint |

You can also create a `.env` file in `claude/rag/`:

```bash
cp claude/rag/.env.example claude/rag/.env
# Edit with your keys
```

## Moving to Another Machine

1. Install Docker, Python 3.11+, Claude Code on the new machine
2. Clone the `ai-dev-team` repository
3. Follow steps 1-6 above
4. The ingestion pipeline will re-create all embeddings from the SKILL.md source files

**To migrate existing Qdrant data instead of re-ingesting:**

```bash
# On old machine — export snapshots
cd claude/rag/management
python3 backup.py export --output-dir ./backups

# Copy backups/ folder to new machine
# On new machine — restore (see management.md)
```

## Running Tests

```bash
cd claude/rag/mcp-server
.venv/bin/python3 -m pytest ../ingestion/tests/ -v
```

20 tests: 10 chunker tests + 10 metadata tests.
