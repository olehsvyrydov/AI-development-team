#!/bin/bash
#
# AI Development Team Installer
# ==============================
# Installs the AI Development Team framework to ~/.claude
#
# Usage:
#   ./install.sh           # Interactive installation
#   ./install.sh --merge   # Merge without prompting
#   ./install.sh --replace # Replace without prompting
#   ./install.sh --link    # Create symlink (for development)
#   ./install.sh --help    # Show this help
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/claude"
TARGET_DIR="$HOME/.claude"
BACKUP_DIR="$HOME/.claude-backup-$(date +%Y%m%d-%H%M%S)"

# Version
VERSION="4.0.0"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════╗"
echo "║       AI Development Team Installer v$VERSION        ║"
echo "╚═══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Help message
show_help() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  --merge    Merge with existing ~/.claude (keep existing, add new)"
    echo "  --replace  Backup existing ~/.claude and replace completely"
    echo "  --link     Create symlink to source (for development)"
    echo "  --help     Show this help message"
    echo ""
    echo "If no option is provided, interactive mode is used."
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

# Merge installation
install_merge() {
    echo -e "${YELLOW}Merging with existing ~/.claude...${NC}"

    # Create target if doesn't exist
    mkdir -p "$TARGET_DIR"

    # Copy skills (don't overwrite existing)
    if [ -d "$SOURCE_DIR/skills" ]; then
        echo "  - Copying skills..."
        cp -rn "$SOURCE_DIR/skills" "$TARGET_DIR/" 2>/dev/null || true
        # For nested directories, we need to be more careful
        find "$SOURCE_DIR/skills" -name "SKILL.md" | while read src_skill; do
            rel_path="${src_skill#$SOURCE_DIR/}"
            target_path="$TARGET_DIR/$rel_path"
            target_dir=$(dirname "$target_path")
            if [ ! -f "$target_path" ]; then
                mkdir -p "$target_dir"
                cp "$src_skill" "$target_path"
            fi
        done
    fi

    # Copy commands (don't overwrite existing)
    if [ -d "$SOURCE_DIR/commands" ]; then
        echo "  - Copying commands..."
        mkdir -p "$TARGET_DIR/commands"
        for cmd in "$SOURCE_DIR/commands"/*.md; do
            if [ -f "$cmd" ]; then
                target_cmd="$TARGET_DIR/commands/$(basename "$cmd")"
                if [ ! -f "$target_cmd" ]; then
                    cp "$cmd" "$target_cmd"
                fi
            fi
        done
    fi

    # Copy templates (don't overwrite existing)
    if [ -d "$SOURCE_DIR/templates" ]; then
        echo "  - Copying templates..."
        mkdir -p "$TARGET_DIR/templates"
        for tmpl in "$SOURCE_DIR/templates"/*.md; do
            if [ -f "$tmpl" ]; then
                target_tmpl="$TARGET_DIR/templates/$(basename "$tmpl")"
                if [ ! -f "$target_tmpl" ]; then
                    cp "$tmpl" "$target_tmpl"
                fi
            fi
        done
    fi

    # Copy CLAUDE.md if not exists
    if [ -f "$SOURCE_DIR/CLAUDE.md" ] && [ ! -f "$TARGET_DIR/CLAUDE.md" ]; then
        echo "  - Copying CLAUDE.md..."
        cp "$SOURCE_DIR/CLAUDE.md" "$TARGET_DIR/"
    fi

    # Copy TEAM_WORKFLOW.md if not exists
    if [ -f "$SOURCE_DIR/TEAM_WORKFLOW.md" ] && [ ! -f "$TARGET_DIR/TEAM_WORKFLOW.md" ]; then
        echo "  - Copying TEAM_WORKFLOW.md..."
        cp "$SOURCE_DIR/TEAM_WORKFLOW.md" "$TARGET_DIR/"
    fi

    echo -e "${GREEN}Merge complete!${NC}"
}

# Replace installation
install_replace() {
    if [ -d "$TARGET_DIR" ]; then
        echo -e "${YELLOW}Backing up existing ~/.claude to $BACKUP_DIR...${NC}"
        mv "$TARGET_DIR" "$BACKUP_DIR"
        echo -e "${GREEN}Backup created at: $BACKUP_DIR${NC}"
    fi

    echo -e "${YELLOW}Installing to ~/.claude...${NC}"
    cp -r "$SOURCE_DIR" "$TARGET_DIR"
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
        echo "  1) Merge - Add new skills/commands, keep existing (recommended)"
        echo "  2) Replace - Backup existing and replace completely"
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

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Installation Complete!               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to load new skills"
echo "  2. Try: /agents to see all available agents"
echo "  3. Try: /max, /jorge, /finn, /james for specific agents"
echo ""
echo "Documentation: https://github.com/your-org/ai-dev-team"
