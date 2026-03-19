#!/usr/bin/env bash
# migrate-pack.sh — Pack the AI Dev Team framework + RAG for migration
# Run on the SOURCE laptop. Produces a single .tar.gz archive.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCHIVE_NAME="ai-dev-team-migration-$(date +%Y%m%d-%H%M%S).tar.gz"
STAGING_DIR=$(mktemp -d)
trap 'rm -rf "$STAGING_DIR"' EXIT

echo "=== AI Dev Team Migration — Pack ==="
echo ""

# ── 1. Pack the repo (exclude venvs, caches, large binaries) ──
echo "[1/4] Packing ai-dev-team repository..."
mkdir -p "$STAGING_DIR/repo"
rsync -a --progress \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    --exclude='*.egg-info' \
    --exclude='aura-skill.zip' \
    "$SCRIPT_DIR/" "$STAGING_DIR/repo/"
echo "  Done."

# ── 2. Pack ~/.claude essentials ──
echo "[2/4] Packing ~/.claude config (skills, commands, templates, settings)..."
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$STAGING_DIR/claude-config"

# Core config files
for f in CLAUDE.md TEAM_WORKFLOW.md settings.json; do
    if [ -f "$CLAUDE_DIR/$f" ]; then
        cp "$CLAUDE_DIR/$f" "$STAGING_DIR/claude-config/"
    fi
done

# Skills, commands, templates
for d in skills commands templates; do
    if [ -d "$CLAUDE_DIR/$d" ]; then
        cp -r "$CLAUDE_DIR/$d" "$STAGING_DIR/claude-config/"
    fi
done

# Project-level config (memory + settings for THIS project)
PROJ_DIR="$CLAUDE_DIR/projects/-home-oleh-Documents-my-ai-dev-team"
if [ -d "$PROJ_DIR" ]; then
    mkdir -p "$STAGING_DIR/claude-config/project"
    # Memory files
    if [ -d "$PROJ_DIR/memory" ]; then
        cp -r "$PROJ_DIR/memory" "$STAGING_DIR/claude-config/project/"
    fi
    # Project settings
    if [ -f "$PROJ_DIR/settings.local.json" ]; then
        cp "$PROJ_DIR/settings.local.json" "$STAGING_DIR/claude-config/project/"
    fi
fi
echo "  Done."

# ── 3. Export Qdrant data ──
echo "[3/4] Exporting Qdrant data..."
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'ai-team-qdrant'; then
    mkdir -p "$STAGING_DIR/qdrant-data"

    # Export via Docker volume tar
    docker run --rm \
        -v ai-team-qdrant-data:/source:ro \
        -v "$STAGING_DIR/qdrant-data":/backup \
        alpine tar czf /backup/qdrant-volume.tar.gz -C /source .

    echo "  Qdrant data exported ($(du -sh "$STAGING_DIR/qdrant-data/qdrant-volume.tar.gz" | cut -f1))."
else
    echo "  WARNING: Qdrant container 'ai-team-qdrant' is not running."
    echo "  Skipping Qdrant data export. You can still use the framework"
    echo "  on the new laptop — just re-ingest skills with:"
    echo "    python -m ingestion.ingest ~/.claude/skills/"
    touch "$STAGING_DIR/qdrant-data-skipped"
fi

# ── 4. Create the archive ──
echo "[4/4] Creating archive..."
tar czf "$SCRIPT_DIR/$ARCHIVE_NAME" -C "$STAGING_DIR" .
ARCHIVE_SIZE=$(du -sh "$SCRIPT_DIR/$ARCHIVE_NAME" | cut -f1)

echo ""
echo "=== Pack complete ==="
echo "Archive: $SCRIPT_DIR/$ARCHIVE_NAME ($ARCHIVE_SIZE)"
echo ""
echo "Next steps:"
echo "  1. Copy the archive to your new laptop"
echo "  2. Run: ./migrate-unpack.sh $ARCHIVE_NAME"
echo ""
echo "You will need these API keys on the new laptop:"
echo "  - VOYAGE_API_KEY (for AI Team Memory MCP)"
echo "  - OPENROUTER_API_KEY (for Multi-LLM Consultation MCP)"
