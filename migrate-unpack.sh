#!/usr/bin/env bash
# migrate-unpack.sh — Unpack and install the AI Dev Team framework + RAG
# Run on the TARGET laptop. Requires: Docker, Python 3.11+, Claude Code CLI.
set -euo pipefail

ARCHIVE=""
REPO_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --repo-dir) REPO_DIR="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: ./migrate-unpack.sh <archive.tar.gz> [--repo-dir DIR]"
            echo ""
            echo "Options:"
            echo "  --repo-dir DIR   Where to place the repo (default: current directory)"
            exit 0 ;;
        -*) echo "Unknown option: $1"; exit 1 ;;
        *)
            if [ -z "$ARCHIVE" ]; then
                ARCHIVE="$1"; shift
            else
                echo "Unexpected argument: $1"; exit 1
            fi ;;
    esac
done

if [ -z "$ARCHIVE" ]; then
    echo "Usage: ./migrate-unpack.sh <archive.tar.gz> [--repo-dir DIR]"
    echo ""
    echo "Options:"
    echo "  --repo-dir DIR   Where to place the repo (default: current directory)"
    exit 1
fi

# Default: install into current directory / ai-dev-team
if [ -z "$REPO_DIR" ]; then
    REPO_DIR="$(pwd)/ai-dev-team"
fi
# Resolve to absolute path
REPO_DIR="$(cd "$(dirname "$REPO_DIR")" 2>/dev/null && pwd)/$(basename "$REPO_DIR")"

CLAUDE_DIR="$HOME/.claude"
STAGING_DIR=$(mktemp -d)
trap 'rm -rf "$STAGING_DIR"' EXIT

echo "=== AI Dev Team Migration — Unpack & Install ==="
echo ""
echo "Target repo:   $REPO_DIR"
echo "Claude config: $CLAUDE_DIR"
echo ""

# ── Pre-flight checks ──
echo "[Pre-flight] Checking requirements..."
MISSING=""
command -v docker >/dev/null 2>&1 || MISSING="$MISSING docker"
command -v python3 >/dev/null 2>&1 || MISSING="$MISSING python3"
command -v claude >/dev/null 2>&1 || MISSING="$MISSING claude-code"

if [ -n "$MISSING" ]; then
    echo "  ERROR: Missing required tools:$MISSING"
    echo "  Please install them first."
    exit 1
fi

PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.minor}")')
if [ "$PY_VERSION" -lt 11 ]; then
    echo "  ERROR: Python 3.11+ required (found 3.$PY_VERSION)"
    exit 1
fi
echo "  All requirements met."

# ── 1. Unpack archive ──
echo ""
echo "[1/7] Unpacking archive..."
tar xzf "$ARCHIVE" -C "$STAGING_DIR"
echo "  Done."

# ── 2. Install repo ──
echo "[2/7] Installing repository to $REPO_DIR..."
if [ -d "$REPO_DIR" ]; then
    BACKUP="$REPO_DIR.backup-$(date +%Y%m%d-%H%M%S)"
    echo "  Existing repo found — backing up to $BACKUP"
    mv "$REPO_DIR" "$BACKUP"
fi
mkdir -p "$(dirname "$REPO_DIR")"
cp -r "$STAGING_DIR/repo" "$REPO_DIR"
echo "  Done."

# ── 3. Restore ~/.claude config ──
echo "[3/7] Restoring Claude Code config..."
mkdir -p "$CLAUDE_DIR"

# Backup existing config
if [ -d "$CLAUDE_DIR/skills" ] || [ -f "$CLAUDE_DIR/CLAUDE.md" ]; then
    CLAUDE_BACKUP="$CLAUDE_DIR/backups/pre-migration-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$CLAUDE_BACKUP"
    for item in CLAUDE.md TEAM_WORKFLOW.md skills commands templates settings.json; do
        if [ -e "$CLAUDE_DIR/$item" ]; then
            cp -r "$CLAUDE_DIR/$item" "$CLAUDE_BACKUP/"
        fi
    done
    echo "  Existing config backed up to $CLAUDE_BACKUP"
fi

# Copy config files
for f in CLAUDE.md TEAM_WORKFLOW.md settings.json; do
    if [ -f "$STAGING_DIR/claude-config/$f" ]; then
        cp "$STAGING_DIR/claude-config/$f" "$CLAUDE_DIR/"
    fi
done

# Merge skills, commands, templates (archive wins on conflicts, keeps extras on target)
for d in skills commands templates; do
    if [ -d "$STAGING_DIR/claude-config/$d" ]; then
        mkdir -p "$CLAUDE_DIR/$d"
        # rsync merges: updates existing, adds new, keeps files only on target
        rsync -a "$STAGING_DIR/claude-config/$d/" "$CLAUDE_DIR/$d/"
        # Count what came from archive vs what was already there
        ARCHIVE_COUNT=$(find "$STAGING_DIR/claude-config/$d" -type f | wc -l)
        TOTAL_COUNT=$(find "$CLAUDE_DIR/$d" -type f | wc -l)
        KEPT_EXTRA=$((TOTAL_COUNT - ARCHIVE_COUNT))
        if [ "$KEPT_EXTRA" -gt 0 ]; then
            echo "  $d: synced $ARCHIVE_COUNT from archive, kept $KEPT_EXTRA extra on this laptop"
        else
            echo "  $d: synced $ARCHIVE_COUNT from archive"
        fi
    fi
done

# Restore project memory + settings
# Compute the project dir name based on actual REPO_DIR
ESCAPED_REPO_DIR=$(echo "$REPO_DIR" | sed 's|/|-|g; s|^-||')
PROJ_DIR="$CLAUDE_DIR/projects/$ESCAPED_REPO_DIR"
mkdir -p "$PROJ_DIR"

if [ -d "$STAGING_DIR/claude-config/project/memory" ]; then
    rm -rf "$PROJ_DIR/memory"
    cp -r "$STAGING_DIR/claude-config/project/memory" "$PROJ_DIR/"
    echo "  Project memory restored."
fi

# Restore and fix paths in settings.local.json
if [ -f "$STAGING_DIR/claude-config/project/settings.local.json" ]; then
    # Detect the old repo path from the file (find first absolute path ending before /claude/)
    OLD_PATH=$(grep -oP '[a-zA-Z/][^\s"]*(?=/claude/rag)' \
        "$STAGING_DIR/claude-config/project/settings.local.json" | head -1)
    if [ -n "$OLD_PATH" ]; then
        sed "s|$OLD_PATH|$REPO_DIR|g" \
            "$STAGING_DIR/claude-config/project/settings.local.json" \
            > "$PROJ_DIR/settings.local.json"
    else
        cp "$STAGING_DIR/claude-config/project/settings.local.json" \
            "$PROJ_DIR/settings.local.json"
    fi
    echo "  Project settings restored (paths updated)."
fi

echo "  Done."

# ── 4. Start Qdrant ──
echo "[4/7] Starting Qdrant..."
cd "$REPO_DIR/claude/rag"
docker compose up -d
echo "  Waiting for Qdrant to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:6333/healthz >/dev/null 2>&1; then
        echo "  Qdrant is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  WARNING: Qdrant didn't start in 30s. Check: docker compose logs"
    fi
    sleep 1
done

# ── 5. Restore Qdrant data ──
if [ -f "$STAGING_DIR/qdrant-data/qdrant-volume.tar.gz" ]; then
    echo "[5/7] Restoring Qdrant data..."
    docker compose down
    docker run --rm \
        -v ai-team-qdrant-data:/target \
        -v "$STAGING_DIR/qdrant-data":/backup:ro \
        alpine sh -c "cd /target && tar xzf /backup/qdrant-volume.tar.gz"
    docker compose up -d
    # Wait for Qdrant again after restart
    for i in $(seq 1 30); do
        if curl -sf http://localhost:6333/healthz >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    echo "  Qdrant data restored."
else
    echo "[5/7] No Qdrant data to restore (was not exported)."
    echo "  Collections will be initialized and skills re-ingested in step 6."
fi

# ── 6. Set up Python venvs ──
echo "[6/7] Setting up Python virtual environments..."

# RAG MCP server
echo "  Creating RAG MCP venv..."
cd "$REPO_DIR/claude/rag/mcp-server"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -e ".[dev]"
echo "  RAG MCP venv ready."

# Multi-LLM MCP server
echo "  Creating Multi-LLM MCP venv..."
cd "$REPO_DIR/multi-llm/mcp"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -e ".[dev]"
echo "  Multi-LLM MCP venv ready."

# Initialize collections + ingest if no data was restored
if [ ! -f "$STAGING_DIR/qdrant-data/qdrant-volume.tar.gz" ]; then
    echo "  Initializing Qdrant collections..."
    cd "$REPO_DIR/claude/rag"
    "$REPO_DIR/claude/rag/mcp-server/.venv/bin/python3" -m management.stats 2>/dev/null || true
    echo "  NOTE: Run the following to ingest skills (requires VOYAGE_API_KEY):"
    echo "    cd $REPO_DIR/claude/rag"
    echo "    VOYAGE_API_KEY=<key> .venv/bin/python3 -m ingestion.ingest ~/.claude/skills/"
fi

echo "  Done."

# ── 7. Register MCP servers ──
echo "[7/7] Registering MCP servers with Claude Code..."
echo ""

# IMPORTANT: cd to HOME so claude mcp add registers globally, not project-scoped
cd "$HOME"

RAG_PYTHON="$REPO_DIR/claude/rag/mcp-server/.venv/bin/python3"
MLM_PYTHON="$REPO_DIR/multi-llm/mcp/.venv/bin/python3"

# Prompt for API keys
read -rp "  Enter VOYAGE_API_KEY (for AI Team Memory, or press Enter to skip): " VOYAGE_KEY
read -rp "  Enter OPENROUTER_API_KEY (for Multi-LLM, or press Enter to skip): " OPENROUTER_KEY

# Remove any existing registrations to avoid duplicates
claude mcp remove ai-team-memory 2>/dev/null || true
claude mcp remove multi-llm 2>/dev/null || true
claude mcp remove atlassian 2>/dev/null || true

if [ -n "$VOYAGE_KEY" ]; then
    claude mcp add --scope user --transport stdio ai-team-memory \
        -e "VOYAGE_API_KEY=$VOYAGE_KEY" \
        -- "$RAG_PYTHON" -m memory_mcp
    echo "  ai-team-memory MCP registered."
else
    echo "  Skipped ai-team-memory. Register later with:"
    echo "    claude mcp add --scope user --transport stdio ai-team-memory \\"
    echo "      -e VOYAGE_API_KEY=<key> \\"
    echo "      -- $RAG_PYTHON -m memory_mcp"
fi

if [ -n "$OPENROUTER_KEY" ]; then
    claude mcp add --scope user --transport stdio multi-llm \
        -e "OPENROUTER_API_KEY=$OPENROUTER_KEY" \
        -- "$MLM_PYTHON" -m consult_mcp
    echo "  multi-llm MCP registered."
else
    echo "  Skipped multi-llm. Register later with:"
    echo "    claude mcp add --scope user --transport stdio multi-llm \\"
    echo "      -e OPENROUTER_API_KEY=<key> \\"
    echo "      -- $MLM_PYTHON -m consult_mcp"
fi

# Atlassian MCP (no key needed at registration time)
claude mcp add --scope user --transport http atlassian https://mcp.atlassian.com/v1/mcp 2>/dev/null || true
echo "  atlassian MCP registered."

echo ""
echo "=== Installation complete ==="
echo ""
echo "Installed:"
echo "  - Repository:     $REPO_DIR"
echo "  - Skills:         $CLAUDE_DIR/skills/ ($(ls "$CLAUDE_DIR/skills/" 2>/dev/null | wc -l) agents)"
echo "  - Commands:       $CLAUDE_DIR/commands/ ($(ls "$CLAUDE_DIR/commands/" 2>/dev/null | wc -l) commands)"
echo "  - Qdrant:         http://localhost:6333"
echo "  - MCP servers:    ai-team-memory, multi-llm, atlassian"
echo ""
echo "To verify, run:"
echo "  cd $REPO_DIR && claude"
echo ""
echo "Then in Claude Code, try:"
echo "  /agents           — list all team agents"
echo "  /memory stats     — check RAG knowledge base"
