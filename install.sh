#!/usr/bin/env bash
#
# AI Dev Team — universal installer
# Sets up the framework for Claude Code, Cursor, Kiro, and/or VS Code (Copilot).
#
# Usage:
#   ./install.sh                                  # interactive
#   ./install.sh --editors=claude,cursor          # non-interactive
#   ./install.sh --editors=all --scope=project --preset=solo
#   ./install.sh --link                           # symlink content (dev mode)
#   ./install.sh --dry-run                        # print actions, change nothing
#   ./install.sh --uninstall                      # remove what we installed
#   ./install.sh --yes                            # accept defaults (CI)
#
# Flags:
#   --editors=claude,cursor,kiro,vscode|all   which editors to wire up
#   --scope=project|user                      project (./) or global (~/.claude); default project
#   --preset=solo|small-team|regulated        workflow preset; default solo
#   --link                                    symlink the content instead of copying (dev)
#   --dry-run                                 show actions only
#   --yes / -y                                non-interactive; accept defaults
#   --uninstall                               remove installed content + editor configs
#   --help / -h                               this help
#
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[0;32m'; BLUE=$'\033[0;34m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'

EDITORS=""; SCOPE="project"; PRESET="solo"; DRY_RUN=0; ASSUME_YES=0; LINK=0; UNINSTALL=0

log()  { printf '%s\n' "$*"; }
info() { printf '%s%s%s\n' "$BLUE" "$*" "$NC"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$NC" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$NC" >&2; exit 1; }

# run a mutating command (or just print it under --dry-run)
run() { if [ "$DRY_RUN" = 1 ]; then printf '%s[dry-run]%s %s\n' "$DIM" "$NC" "$*"; else eval "$@"; fi; }

show_help() { sed -n '3,28p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --editors=*) EDITORS="${arg#*=}" ;;
      --scope=*)   SCOPE="${arg#*=}" ;;
      --preset=*)  PRESET="${arg#*=}" ;;
      --link)      LINK=1 ;;
      --dry-run)   DRY_RUN=1 ;;
      --yes|-y)    ASSUME_YES=1 ;;
      --uninstall) UNINSTALL=1 ;;
      --help|-h)   show_help; exit 0 ;;
      *) die "Unknown option: $arg (try --help)" ;;
    esac
  done
  [ "$EDITORS" = "all" ] && EDITORS="claude,cursor,kiro,vscode"
  case "$SCOPE" in project|user) ;; *) die "--scope must be project or user" ;; esac
  case "$PRESET" in solo|small-team|regulated) ;; *) die "--preset must be solo, small-team, or regulated" ;; esac
}

has_editor() { case ",$EDITORS," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

prompt_editors() {
  [ -n "$EDITORS" ] && return
  if [ "$ASSUME_YES" = 1 ]; then EDITORS="claude"; return; fi
  log "${BOLD}Which editors should I wire up?${NC} (space-separated numbers, or 'a' for all)"
  log "  1) Claude Code   2) Cursor   3) Kiro   4) VS Code (Copilot)"
  read -r -p "Choose [1]: " ans; ans="${ans:-1}"
  [ "$ans" = "a" ] && { EDITORS="claude,cursor,kiro,vscode"; return; }
  local sel=""
  for n in $ans; do case "$n" in
    1) sel="$sel,claude" ;; 2) sel="$sel,cursor" ;; 3) sel="$sel,kiro" ;; 4) sel="$sel,vscode" ;;
  esac; done
  EDITORS="${sel#,}"; [ -z "$EDITORS" ] && EDITORS="claude"
}

# ---- content install -------------------------------------------------------
# Destination for the framework content (skills/commands/workflow/templates).
content_dir() {
  if [ "$SCOPE" = user ]; then printf '%s/.claude' "$HOME"; else printf '%s/.claude' "$PWD"; fi
}

install_content() {
  local dest; dest="$(content_dir)"
  info "Installing framework content → $dest"
  if [ "$LINK" = 1 ]; then
    run "mkdir -p '$dest'"
    for d in skills commands templates workflow; do
      run "rm -rf '$dest/$d'"
      run "ln -s '$SOURCE_DIR/claude/$d' '$dest/$d'"
    done
  else
    run "mkdir -p '$dest'"
    for d in skills commands templates workflow; do
      run "rm -rf '$dest/$d'"
      run "cp -R '$SOURCE_DIR/claude/$d' '$dest/$d'"
    done
  fi
  # apply the chosen preset to the workflow definition
  if [ "$LINK" != 1 ]; then
    run "sed -i.bak 's/^preset:.*/preset: $PRESET/' '$dest/workflow/workflow.yaml' && rm -f '$dest/workflow/workflow.yaml.bak'"
  fi
  ok "Content installed (preset: $PRESET)"
}

# relative path from project root to the content dir, for editor configs
content_ref() { if [ "$SCOPE" = user ]; then printf '~/.claude'; else printf '.claude'; fi; }

# ---- editor configs --------------------------------------------------------
write_file() { # path, heredoc-content via stdin
  local path="$1"
  if [ "$DRY_RUN" = 1 ]; then printf '%s[dry-run]%s write %s\n' "$DIM" "$NC" "$path"; cat >/dev/null; return; fi
  mkdir -p "$(dirname "$path")"; cat > "$path"
}

instructions_body() {
  local ref; ref="$(content_ref)"
  cat <<EOF
# AI Dev Team — agent & workflow instructions

This project uses the **AI Dev Team** framework. Specialist agent personas and an
enforced, proportional workflow live in \`$ref/\`.

**Before any development task and before every handoff**, consult the workflow:
\`$ref/skills/workflow-engine/SKILL.md\` (it classifies the change, decides which
approval gates apply, and may refuse to proceed past an unmet gate). Preset: **$PRESET**.

- **Roster (15 core + specialists):** \`$ref/commands/agents.md\`
- **Pick the right agent when domains overlap:** \`$ref/skills/disambiguation.md\`
- **Agent personas:** \`$ref/skills/**/SKILL.md\` — load the relevant one; it self-routes
  to deep \`references/\` (and, for multi-stack roles, to the matching tech reference).
- Tickets/docs are **file-based by default**; Jira/Confluence/MCP are optional overlays
  enabled in \`$ref/workflow/workflow.yaml\`.
EOF
}

emit_agents_and_claude() {
  # AGENTS.md (root) — read by Cursor/Kiro/VS Code; mirrors CLAUDE.md
  if [ "$SCOPE" = project ]; then
    instructions_body | write_file "$PWD/AGENTS.md"
    ok "AGENTS.md (project root)"
  fi
  if has_editor claude; then
    if [ "$SCOPE" = user ]; then
      instructions_body | write_file "$HOME/.claude/CLAUDE.md"; ok "~/.claude/CLAUDE.md"
    else
      instructions_body | write_file "$PWD/CLAUDE.md"; ok "CLAUDE.md (project root)"
    fi
  fi
}

emit_cursor() {
  has_editor cursor || return 0
  { printf -- '---\ndescription: AI Dev Team agents & workflow\nalwaysApply: true\n---\n\n'; instructions_body; } \
    | write_file "$PWD/.cursor/rules/ai-dev-team.mdc"
  ok ".cursor/rules/ai-dev-team.mdc"
}

emit_kiro() {
  has_editor kiro || return 0
  instructions_body | write_file "$PWD/.kiro/steering/ai-dev-team.md"
  ok ".kiro/steering/ai-dev-team.md"
}

emit_vscode() {
  has_editor vscode || return 0
  instructions_body | write_file "$PWD/.github/copilot-instructions.md"
  ok ".github/copilot-instructions.md"
}

emit_mcp() {
  local ref; ref="$(content_ref)"
  # A template; all servers optional. Project scope writes .mcp.json (Claude Code/Cursor read it).
  [ "$SCOPE" = project ] || return 0
  write_file "$PWD/.mcp.json.example" <<EOF
{
  "// note": "Optional MCP overlays. Copy to .mcp.json and fill in. The framework needs none of these by default.",
  "mcpServers": {
    "atlassian": { "type": "http", "url": "https://mcp.atlassian.com/v1/mcp" }
  }
}
EOF
  ok ".mcp.json.example (optional overlays)"
}

# ---- uninstall -------------------------------------------------------------
do_uninstall() {
  warn "Removing AI Dev Team content + editor configs (scope: $SCOPE)"
  local dest; dest="$(content_dir)"
  for d in skills commands templates workflow; do run "rm -rf '$dest/$d'"; done
  if [ "$SCOPE" = project ]; then
    run "rm -f '$PWD/AGENTS.md' '$PWD/CLAUDE.md' '$PWD/.mcp.json.example'"
    run "rm -f '$PWD/.cursor/rules/ai-dev-team.mdc' '$PWD/.kiro/steering/ai-dev-team.md' '$PWD/.github/copilot-instructions.md'"
  else
    run "rm -f '$HOME/.claude/CLAUDE.md'"
  fi
  ok "Uninstalled."
}

# ---- main ------------------------------------------------------------------
main() {
  parse_args "$@"
  log "${BOLD}AI Dev Team installer${NC}  ${DIM}(source: $SOURCE_DIR)${NC}"
  [ "$DRY_RUN" = 1 ] && warn "DRY RUN — no changes will be made"
  [ "$UNINSTALL" = 1 ] && { prompt_editors; do_uninstall; exit 0; }

  prompt_editors
  info "Editors: ${EDITORS:-none}   Scope: $SCOPE   Preset: $PRESET   Mode: $([ "$LINK" = 1 ] && echo symlink || echo copy)"
  [ -n "$EDITORS" ] || die "No editors selected."

  install_content
  emit_agents_and_claude
  emit_cursor
  emit_kiro
  emit_vscode
  emit_mcp

  log ""
  ok "${BOLD}Done.${NC}"
  if has_editor claude; then
    log "  • Claude Code: restart it, then try ${BOLD}/agents${NC}."
    log "  • Optional advanced backends (RAG memory, Atlassian, hooks): ${BOLD}scripts/setup-claude-backends.sh${NC}"
  fi
  has_editor cursor && log "  • Cursor: rules in .cursor/rules/ + AGENTS.md are active on next session."
  has_editor kiro   && log "  • Kiro: steering in .kiro/steering/ + AGENTS.md are active."
  has_editor vscode && log "  • VS Code: .github/copilot-instructions.md + AGENTS.md are active."
  log "  • Workflow preset is ${BOLD}$PRESET${NC} — edit $(content_ref)/workflow/workflow.yaml to change."
}

main "$@"
