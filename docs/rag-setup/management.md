# Management — Backup, Maintenance & Troubleshooting

All management scripts are in `claude/rag/management/`.

## Health Check

```bash
cd claude/rag/management
python3 stats.py health
```

Checks Qdrant connectivity and returns server version.

## Collection Stats

```bash
python3 stats.py stats
```

Shows point counts and status for all 4 collections:

```
Collection           Status     Points     Description
agent-knowledge      green      1289       SKILL.md sections
code-patterns        green      221        Reusable code templates
decisions            green      0          ADRs, architecture decisions
learnings            green      3          Sprint retrospective insights
```

## Initialize Collections

```bash
python3 stats.py init
```

Creates any missing collections with proper vector config and payload indexes.
Safe to run multiple times — skips collections that already exist.

## Backup

### Export snapshots

```bash
python3 backup.py export --output-dir ./backups
```

Creates Qdrant native snapshots for each collection.
Files are named `{collection}_{YYYYMMDD-HHMMSS}.snapshot`.

### List existing snapshots

```bash
python3 backup.py list
```

## Find and Remove Duplicates

```bash
# List duplicates (same source_file + heading)
python3 prune.py duplicates --collection agent-knowledge

# Also check code-patterns
python3 prune.py duplicates --collection code-patterns
```

Duplicates shouldn't occur with the deterministic UUID scheme,
but can happen if chunk IDs were manually modified.

## Find Stale Points

Points whose source SKILL.md file no longer exists:

```bash
# Dry run — list stale points
python3 prune.py stale --collection agent-knowledge --base-dir /path/to/ai-dev-team

# Delete stale points
python3 prune.py stale --collection agent-knowledge --base-dir /path/to/ai-dev-team --delete
```

## Full Reindex

Deletes and recreates collections, then requires re-ingestion:

```bash
# Recreate all collections
python3 reindex.py --skills-dir ../../skills --yes

# Selective reindex (only specific collections)
python3 reindex.py --skills-dir ../../skills --collections agent-knowledge code-patterns --yes

# Then re-ingest
cd ../ingestion
VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
```

> **Warning:** `reindex.py` deletes all points in the specified collections.
> Always back up first with `backup.py export`.

## Troubleshooting

### MCP server won't connect

**Symptom:** `ai-team-memory` doesn't appear in Claude Code tools.

1. Check Qdrant is running:
   ```bash
   curl http://localhost:6333/healthz
   ```

2. Check the MCP server starts manually:
   ```bash
   VOYAGE_API_KEY=your-key /path/to/.venv/bin/python3 -m memory_mcp
   ```
   It should hang (waiting for stdio input). Ctrl+C to stop.

3. Check Claude Code registration:
   ```bash
   claude mcp list
   ```

4. If registered at wrong scope, remove and re-add:
   ```bash
   claude mcp remove ai-team-memory              # project scope
   claude mcp remove -s user ai-team-memory       # user scope
   claude mcp add -s user -e VOYAGE_API_KEY=key -- /path/to/.venv/bin/python3 -m memory_mcp
   ```

### "Module not found: memory_mcp"

The venv doesn't have the package installed:

```bash
cd claude/rag/mcp-server
.venv/bin/pip install -e .
```

### Qdrant client version warning

If you see `qdrant_client version X.Y doesn't match server version 1.13.2`:

```bash
.venv/bin/pip install "qdrant-client>=1.13,<1.14"
```

Or suppress the warning — it's non-fatal for minor version mismatches.

### Empty search results

1. Check collections have points:
   ```bash
   cd claude/rag/management
   python3 stats.py stats
   ```

2. If points are 0, run ingestion:
   ```bash
   cd claude/rag/ingestion
   VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
   ```

3. If points exist but searches return nothing, the embedding model may have changed.
   Reindex:
   ```bash
   cd claude/rag/management
   python3 reindex.py --skills-dir ../../skills --yes
   cd ../ingestion
   VOYAGE_API_KEY=your-key python3 ingest.py --skills-dir ../../skills
   ```

### Qdrant container won't start

Check if port 6333 is already in use:

```bash
sudo lsof -i :6333
```

Check Docker logs:

```bash
docker logs ai-team-qdrant
```

### Moving to a remote Qdrant instance

Set `QDRANT_URL` environment variable:

```bash
# In .env file
QDRANT_URL=http://remote-server:6333

# Or when running scripts
QDRANT_URL=http://remote-server:6333 python3 stats.py stats

# For MCP server, add the env var to the registration
claude mcp add -s user \
  -e VOYAGE_API_KEY=your-key \
  -e QDRANT_URL=http://remote-server:6333 \
  -- /path/to/.venv/bin/python3 -m memory_mcp
```

## File Reference

```
claude/rag/
├── docker-compose.yml          # Qdrant container (v1.13.2)
├── .env.example                # Environment variable template
│
├── mcp-server/                 # MCP server (python3 -m memory_mcp)
│   ├── pyproject.toml          # Dependencies
│   └── memory_mcp/
│       ├── __main__.py         # Entry point
│       ├── server.py           # FastMCP + tool registration
│       ├── embeddings.py       # VoyageEmbeddingProvider
│       ├── collections.py      # Qdrant collection schemas
│       └── tools.py            # Tool implementations + agent aliases
│
├── ingestion/                  # Batch ingestion pipeline
│   ├── ingest.py               # CLI: --skills-dir, --file, --dry-run
│   ├── chunker.py              # Markdown → chunks (## split, code extraction)
│   ├── metadata.py             # File path → agent metadata
│   └── tests/                  # 20 pytest tests
│
└── management/                 # Maintenance scripts
    ├── stats.py                # init, stats, health
    ├── backup.py               # export, list snapshots
    ├── prune.py                # duplicates, stale point cleanup
    └── reindex.py              # Full collection rebuild
```
