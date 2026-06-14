#!/bin/bash
#
# AI Dev Team — Claude Code advanced backend setup (venvs, Multi-LLM, Atlassian)
# ==============================
# Optional setup beyond the core install: Python venvs, the Multi-LLM MCP,
# and the Atlassian MCP. Run after ./install.sh.
#
# Usage:
#   scripts/setup-claude-backends.sh            # interactive
#   scripts/setup-claude-backends.sh --merge    # merge content into ~/.claude without prompting
#   scripts/setup-claude-backends.sh --replace  # replace content in ~/.claude
#   scripts/setup-claude-backends.sh --link     # symlink content (dev)
#   scripts/setup-claude-backends.sh --help     # show help
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Repo root (this script lives in scripts/, so go up one level)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$SCRIPT_DIR/claude"
TARGET_DIR="$HOME/.claude"
BACKUP_DIR="$HOME/.claude-backup-$(date +%Y%m%d-%H%M%S)"

# Version
VERSION="5.0.0"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════╗"
echo "║        AI Dev Team — Backend Setup  v$VERSION       ║"
echo "╚═══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Help message
show_help() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  --merge    Merge with existing ~/.claude (add new, update existing)"
    echo "  --replace  Backup skills/commands/templates and replace"
    echo "  --link     Create symlink to source (for development)"
    echo "  --help     Show this help message"
    echo ""
    echo "If no option is provided, interactive mode is used."
    echo ""
    echo "After installation, optional Multi-LLM setup is offered"
    echo "(requires Python 3.11+ and an API key)."
}

# Check prerequisites
check_prerequisites() {
    if [ ! -d "$SOURCE_DIR" ]; then
        echo -e "${RED}Error: Source directory '$SOURCE_DIR' not found.${NC}"
        echo "Please run this script from the ai-dev-team repository root."
        exit 1
    fi

    if [ ! -d "$SOURCE_DIR/skills" ]; then
        echo -e "${RED}Error: Skills directory not found in source.${NC}"
        exit 1
    fi
}

# Count items
count_items() {
    local skills=$(find "$SOURCE_DIR/skills" -name "SKILL.md" | wc -l)
    local commands=$(ls "$SOURCE_DIR/commands"/*.md 2>/dev/null | wc -l)
    local templates=$(ls "$SOURCE_DIR/templates"/*.md 2>/dev/null | wc -l)
    echo "$skills skills, $commands commands, $templates templates"
}

# Merge installation — adds new files, updates existing ones
install_merge() {
    echo -e "${YELLOW}Merging with existing ~/.claude...${NC}"

    # Create target if doesn't exist
    mkdir -p "$TARGET_DIR"

    # Copy skills (update existing, add new, keep extras)
    if [ -d "$SOURCE_DIR/skills" ]; then
        echo "  - Syncing skills..."
        mkdir -p "$TARGET_DIR/skills"
        find "$SOURCE_DIR/skills" -name "SKILL.md" -print0 | while IFS= read -r -d '' src_skill; do
            rel_path="${src_skill#$SOURCE_DIR/}"
            target_path="$TARGET_DIR/$rel_path"
            target_dir=$(dirname "$target_path")
            mkdir -p "$target_dir"
            cp "$src_skill" "$target_path"
        done
    fi

    # Copy commands (update existing, add new, keep extras)
    if [ -d "$SOURCE_DIR/commands" ]; then
        echo "  - Syncing commands..."
        mkdir -p "$TARGET_DIR/commands"
        for cmd in "$SOURCE_DIR/commands"/*.md; do
            if [ -f "$cmd" ]; then
                cp "$cmd" "$TARGET_DIR/commands/"
            fi
        done
    fi

    # Copy templates (update existing, add new, keep extras)
    if [ -d "$SOURCE_DIR/templates" ]; then
        echo "  - Syncing templates..."
        mkdir -p "$TARGET_DIR/templates"
        for tmpl in "$SOURCE_DIR/templates"/*.md; do
            if [ -f "$tmpl" ]; then
                cp "$tmpl" "$TARGET_DIR/templates/"
            fi
        done
    fi

    # Always update CLAUDE.md and TEAM_WORKFLOW.md (these define the workflow)
    if [ -f "$SOURCE_DIR/CLAUDE.md" ]; then
        echo "  - Updating CLAUDE.md..."
        cp "$SOURCE_DIR/CLAUDE.md" "$TARGET_DIR/"
    fi

    if [ -f "$SOURCE_DIR/TEAM_WORKFLOW.md" ]; then
        echo "  - Updating TEAM_WORKFLOW.md..."
        cp "$SOURCE_DIR/TEAM_WORKFLOW.md" "$TARGET_DIR/"
    fi

    echo -e "${GREEN}Merge complete!${NC}"
}

# Replace installation — only replaces skills/commands/templates, keeps system dirs
install_replace() {
    mkdir -p "$TARGET_DIR"

    # Backup only the content we're replacing
    if [ -d "$TARGET_DIR/skills" ] || [ -d "$TARGET_DIR/commands" ] || [ -d "$TARGET_DIR/templates" ]; then
        echo -e "${YELLOW}Backing up existing content to $BACKUP_DIR...${NC}"
        mkdir -p "$BACKUP_DIR"
        for item in skills commands templates CLAUDE.md TEAM_WORKFLOW.md; do
            if [ -e "$TARGET_DIR/$item" ]; then
                cp -r "$TARGET_DIR/$item" "$BACKUP_DIR/"
            fi
        done
        echo -e "${GREEN}Backup created at: $BACKUP_DIR${NC}"
    fi

    # Remove and replace skills/commands/templates
    echo -e "${YELLOW}Installing to ~/.claude...${NC}"
    for d in skills commands templates; do
        rm -rf "$TARGET_DIR/$d"
        if [ -d "$SOURCE_DIR/$d" ]; then
            cp -r "$SOURCE_DIR/$d" "$TARGET_DIR/"
        fi
    done

    # Copy CLAUDE.md and TEAM_WORKFLOW.md
    if [ -f "$SOURCE_DIR/CLAUDE.md" ]; then
        cp "$SOURCE_DIR/CLAUDE.md" "$TARGET_DIR/"
    fi
    if [ -f "$SOURCE_DIR/TEAM_WORKFLOW.md" ]; then
        cp "$SOURCE_DIR/TEAM_WORKFLOW.md" "$TARGET_DIR/"
    fi

    echo -e "${GREEN}Installation complete!${NC}"
}

# Symlink installation (for development)
install_link() {
    if [ -d "$TARGET_DIR" ]; then
        if [ -L "$TARGET_DIR" ]; then
            echo -e "${YELLOW}Removing existing symlink...${NC}"
            rm "$TARGET_DIR"
        else
            echo -e "${YELLOW}Backing up existing ~/.claude to $BACKUP_DIR...${NC}"
            mv "$TARGET_DIR" "$BACKUP_DIR"
            echo -e "${GREEN}Backup created at: $BACKUP_DIR${NC}"
        fi
    fi

    echo -e "${YELLOW}Creating symlink ~/.claude -> $SOURCE_DIR...${NC}"
    ln -s "$SOURCE_DIR" "$TARGET_DIR"
    echo -e "${GREEN}Symlink created!${NC}"
    echo -e "${BLUE}Note: Changes in the repository will be reflected immediately.${NC}"
}

# Interactive mode
interactive_install() {
    echo "Source: $SOURCE_DIR"
    echo "Target: $TARGET_DIR"
    echo "Content: $(count_items)"
    echo ""

    if [ -d "$TARGET_DIR" ]; then
        echo -e "${YELLOW}Existing ~/.claude directory found.${NC}"
        echo ""
        echo "Options:"
        echo "  1) Merge - Add new, update existing, keep your extras (recommended)"
        echo "  2) Replace - Backup skills/commands/templates and replace"
        echo "  3) Link - Create symlink to source (for development)"
        echo "  4) Cancel"
        echo ""
        read -p "Choose [1/2/3/4]: " choice

        case $choice in
            1)
                install_merge
                ;;
            2)
                install_replace
                ;;
            3)
                install_link
                ;;
            *)
                echo "Cancelled."
                exit 0
                ;;
        esac
    else
        echo "No existing ~/.claude found."
        echo ""
        echo "Options:"
        echo "  1) Install - Copy to ~/.claude (recommended)"
        echo "  2) Link - Create symlink to source (for development)"
        echo "  3) Cancel"
        echo ""
        read -p "Choose [1/2/3]: " choice

        case $choice in
            1)
                install_replace
                ;;
            2)
                install_link
                ;;
            *)
                echo "Cancelled."
                exit 0
                ;;
        esac
    fi
}

# Set up Python virtual environments (NOT optional — MCP servers need these)
setup_venvs() {
    if ! command -v python3 &>/dev/null; then
        echo -e "${YELLOW}Python 3 not found. Skipping venv setup.${NC}"
        echo "Install Python 3.11+ and re-run to enable Multi-LLM features."
        return 1
    fi

    local PY_MINOR
    PY_MINOR=$(python3 -c 'import sys; print(sys.version_info.minor)')
    if [ "$PY_MINOR" -lt 11 ]; then
        echo -e "${YELLOW}Python 3.11+ required (found 3.$PY_MINOR). Skipping venv setup.${NC}"
        return 1
    fi

    local MLM_DIR="$SCRIPT_DIR/multi-llm/mcp"

    if [ -d "$MLM_DIR" ]; then
        echo "  Creating Multi-LLM MCP venv..."
        cd "$MLM_DIR"
        python3 -m venv .venv
        .venv/bin/pip install -q --upgrade pip
        .venv/bin/pip install -q -e . || return 1
        echo -e "${GREEN}  Multi-LLM MCP venv ready: $MLM_DIR/.venv${NC}"
    fi

    cd "$SCRIPT_DIR"
    return 0
}

# Multi-LLM Consultation setup (API key + MCP registration)
setup_multi_llm() {
    local MLM_DIR="$SCRIPT_DIR/multi-llm/mcp"
    local MLM_PYTHON="$MLM_DIR/.venv/bin/python3"

    if [ ! -f "$MLM_PYTHON" ]; then
        echo -e "${YELLOW}Multi-LLM venv not found, skipping...${NC}"
        return
    fi

    echo ""
    echo -e "${BLUE}=== Multi-LLM Consultation ===${NC}"
    echo ""
    echo "Register MCP server for /all command (GPT, Gemini, Grok)."
    echo "Requirements: OpenRouter API key"
    echo ""

    read -p "Set up Multi-LLM Consultation? [y/N] " mlm_choice
    if [ "$mlm_choice" != "y" ] && [ "$mlm_choice" != "Y" ]; then
        echo "Skipping Multi-LLM setup."
        echo "To set up later: see docs/multi-llm-guide.md"
        return
    fi

    # Prompt for OpenRouter key
    read -rsp "  Enter OPENROUTER_API_KEY (or press Enter to skip): " OPENROUTER_KEY; echo

    if [ -n "$OPENROUTER_KEY" ]; then
        # Register MCP server (cd HOME to avoid project-scoped registration)
        if command -v claude &>/dev/null; then
            cd "$HOME"
            claude mcp remove multi-llm 2>/dev/null || true
            claude mcp add --scope user --transport stdio multi-llm \
                -e "OPENROUTER_API_KEY=$OPENROUTER_KEY" \
                -- "$MLM_PYTHON" -m consult_mcp
            echo -e "${GREEN}multi-llm MCP registered.${NC}"
        fi
    else
        echo ""
        echo "  Register MCP server later with:"
        echo "    claude mcp add --scope user multi-llm \\"
        echo "      -e OPENROUTER_API_KEY=your-key \\"
        echo "      -- $MLM_PYTHON -m consult_mcp"
    fi

    cd "$SCRIPT_DIR"
}

# Atlassian MCP setup
setup_atlassian() {
    echo ""
    echo -e "${BLUE}=== Atlassian Integration (Optional) ===${NC}"
    echo ""
    echo "Jira + Confluence integration for ticket management and documentation."
    echo ""

    read -p "Register Atlassian MCP server? [y/N] " atl_choice
    if [ "$atl_choice" != "y" ] && [ "$atl_choice" != "Y" ]; then
        echo "Skipping. Register later with:"
        echo "  claude mcp add --scope user --transport http atlassian https://mcp.atlassian.com/v1/mcp"
        return
    fi

    if command -v claude &>/dev/null; then
        cd "$HOME"
        claude mcp remove atlassian 2>/dev/null || true
        claude mcp add --scope user --transport http atlassian https://mcp.atlassian.com/v1/mcp 2>/dev/null || true
        echo -e "${GREEN}atlassian MCP registered.${NC}"
        cd "$SCRIPT_DIR"
    else
        echo -e "${YELLOW}Claude Code CLI not found. Register manually after installing Claude Code.${NC}"
    fi
}

# Main
check_prerequisites

case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --merge)
        install_merge
        ;;
    --replace)
        install_replace
        ;;
    --link)
        install_link
        ;;
    "")
        interactive_install
        ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        show_help
        exit 1
        ;;
esac

# Show what was installed
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Core Installation Complete!              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
SKILL_COUNT=$(find "$TARGET_DIR/skills" -name "SKILL.md" 2>/dev/null | wc -l)
CMD_COUNT=$(ls "$TARGET_DIR/commands"/*.md 2>/dev/null | wc -l)
TMPL_COUNT=$(ls "$TARGET_DIR/templates"/*.md 2>/dev/null | wc -l)
echo "Installed: $SKILL_COUNT skills, $CMD_COUNT commands, $TMPL_COUNT templates"
echo ""

# Always create Python venvs — MCP servers need them to run
echo -e "${BLUE}=== Setting up Python environments ===${NC}"
echo ""
setup_venvs || true   # tolerate a skip (e.g. Python missing) without aborting the script
echo ""

# Offer optional platform setup (API keys, MCP registration)
echo -e "${BLUE}=== Optional: API Keys & MCP Registration ===${NC}"
echo ""
echo "Register MCP servers for Multi-LLM and Atlassian."
echo "Requires API keys. You can skip and set up later."
echo ""

read -p "Configure now? [y/N] " optional_choice
if [ "$optional_choice" = "y" ] || [ "$optional_choice" = "Y" ]; then
    setup_multi_llm
    setup_atlassian
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              All Done!                            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to load new skills"
echo "  2. Try: /agents to see all available agents"
echo "  3. Try: /po, /arch, /fe, /be for specific agents"
echo "  4. Try: /all for multi-LLM consultation (requires Multi-LLM)"
echo ""
echo "Documentation: https://github.com/olehsvyrydov/AI-development-team"
