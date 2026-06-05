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

# run a mutating command (or just print it under --dry-run). Args passed directly — no eval.
run() { if [ "$DRY_RUN" = 1 ]; then printf '%s[dry-run]%s %s\n' "$DIM" "$NC" "$*"; else "$@"; fi; }

# print the leading comment block (after the shebang), stripping the '# ' prefix
show_help() { awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "${BASH_SOURCE[0]}"; }

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
  # fail fast on unknown editor names (typos)
  local e
  for e in ${EDITORS//,/ }; do
    case "$e" in claude|cursor|kiro|vscode) ;; *) die "Unknown editor: '$e' (valid: claude, cursor, kiro, vscode, all)" ;; esac
  done
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
  # Prerequisite: the framework content must be present next to this script
  local d
  for d in skills commands templates workflow; do
    [ -d "$SOURCE_DIR/claude/$d" ] || die "Framework content not found: $SOURCE_DIR/claude/$d — run install.sh from a full checkout of the repo."
  done
  # Guard: don't silently wipe existing content (especially ~/.claude in user scope)
  if [ "$DRY_RUN" != 1 ] && [ "$ASSUME_YES" != 1 ]; then
    local existing="" d
    for d in skills commands templates workflow; do [ -e "$dest/$d" ] && existing="$existing $d"; done
    if [ -n "$existing" ]; then
      warn "Existing framework content in $dest:$existing — it will be replaced."
      read -r -p "Continue? [y/N] " c; case "$c" in y|Y) ;; *) die "Aborted." ;; esac
    fi
  fi
  info "Installing framework content → $dest"
  run mkdir -p "$dest"
  for d in skills commands templates workflow; do
    run rm -rf "$dest/$d"
    if [ "$LINK" = 1 ]; then run ln -s "$SOURCE_DIR/claude/$d" "$dest/$d"
    else run cp -R "$SOURCE_DIR/claude/$d" "$dest/$d"; fi
  done
  # The active preset is set via the workflow OVERRIDE (workflow-engine reads it first),
  # NOT the shipped default — so this works even when the content is symlinked.
  local ov; ov="$(override_path)"
  run mkdir -p "$(dirname "$ov")"
  run cp "$SOURCE_DIR/claude/workflow/workflow.yaml" "$ov"
  # set only the preset VALUE, preserving the inline comment
  run sed -i.bak -E "s/^(preset:[[:space:]]*)[A-Za-z-]+/\\1$PRESET/" "$ov"
  run rm -f "$ov.bak"
  ok "Content installed; preset '$PRESET' written to $(override_ref)"
}

# relative path from project root to the content dir, for editor configs
content_ref() { if [ "$SCOPE" = user ]; then printf '~/.claude'; else printf '.claude'; fi; }

# The active workflow override — what workflow-engine resolves FIRST
# (./.aidevteam/workflow.yaml > ~/.aidevteam/workflow.yaml > the shipped default).
override_path() { if [ "$SCOPE" = user ]; then printf '%s/.aidevteam/workflow.yaml' "$HOME"; else printf '%s/.aidevteam/workflow.yaml' "$PWD"; fi; }
override_ref()  { if [ "$SCOPE" = user ]; then printf '~/.aidevteam/workflow.yaml'; else printf '.aidevteam/workflow.yaml'; fi; }

# ---- editor configs --------------------------------------------------------
write_file() { # path, heredoc-content via stdin
  local path="$1"
  if [ "$DRY_RUN" = 1 ]; then printf '%s[dry-run]%s write %s\n' "$DIM" "$NC" "$path"; cat >/dev/null; return; fi
  mkdir -p "$(dirname "$path")"; cat > "$path"
}

instructions_body() {
  local ref ovref; ref="$(content_ref)"; ovref="$(override_ref)"
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
- Tickets/docs are **file-based by default**; Jira/Confluence/MCP are optional overlays.
- The active workflow **and preset** are controlled by the override \`$ovref\`
  (resolved first; falls back to \`$ref/workflow/workflow.yaml\`).
EOF
}

# write the instructions file, but don't clobber a pre-existing file that isn't ours
write_instructions() {
  local path="$1"
  if [ "$DRY_RUN" != 1 ] && [ "$ASSUME_YES" != 1 ] && [ -f "$path" ] \
     && ! grep -q "AI Dev Team — agent & workflow instructions" "$path" 2>/dev/null; then
    warn "$path exists and isn't AI Dev Team-managed."
    read -r -p "Overwrite it? [y/N] " c; case "$c" in y|Y) ;; *) warn "Kept your $path (skipped)."; return 0 ;; esac
  fi
  instructions_body | write_file "$path"
}

emit_agents_and_claude() {
  # AGENTS.md (project root) — read by Cursor/Kiro/VS Code; mirrors CLAUDE.md.
  # Emit it for any of those editors, or for a project-scoped install.
  if [ "$SCOPE" = project ] || has_editor cursor || has_editor kiro || has_editor vscode; then
    write_instructions "$PWD/AGENTS.md"; ok "AGENTS.md (project root)"
  fi
  if has_editor claude; then
    if [ "$SCOPE" = user ]; then
      write_instructions "$HOME/.claude/CLAUDE.md"; ok "~/.claude/CLAUDE.md"
    else
      write_instructions "$PWD/CLAUDE.md"; ok "CLAUDE.md (project root)"
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
  # copilot-instructions.md is a generic filename — don't clobber a non-managed one
  write_instructions "$PWD/.github/copilot-instructions.md"
  ok ".github/copilot-instructions.md"
}

emit_mcp() {
  # A template of optional MCP overlays (the framework needs none by default).
  # Written as .mcp.json.example for project scope — copy to .mcp.json to enable.
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
  warn "This removes AI Dev Team content + editor configs (scope: $SCOPE), incl. $(content_dir)/{skills,commands,templates,workflow} and $(override_ref)."
  if [ "$DRY_RUN" != 1 ] && [ "$ASSUME_YES" != 1 ]; then
    read -r -p "Continue? [y/N] " c; case "$c" in y|Y) ;; *) die "Aborted." ;; esac
  fi
  local dest d f; dest="$(content_dir)"
  for d in skills commands templates workflow; do run rm -rf "$dest/$d"; done
  # the workflow override (+ its dir if now empty)
  run rm -f "$(override_path)"
  [ "$DRY_RUN" = 1 ] || rmdir "$(dirname "$(override_path)")" 2>/dev/null || true
  [ "$SCOPE" = user ] && run rm -f "$HOME/.claude/CLAUDE.md"
  # ai-dev-team-specific filenames — safe to remove
  run rm -f "$PWD/.cursor/rules/ai-dev-team.mdc" "$PWD/.kiro/steering/ai-dev-team.md" "$PWD/.mcp.json.example"
  # generic filenames — remove only if they carry our header (don't nuke unrelated files)
  for f in "$PWD/AGENTS.md" "$PWD/CLAUDE.md" "$PWD/.github/copilot-instructions.md"; do
    [ -f "$f" ] && grep -q "AI Dev Team — agent & workflow instructions" "$f" 2>/dev/null && run rm -f "$f"
  done
  ok "Uninstalled."
}

# ---- main ------------------------------------------------------------------
main() {
  parse_args "$@"
  log "${BOLD}AI Dev Team installer${NC}  ${DIM}(source: $SOURCE_DIR)${NC}"
  [ "$DRY_RUN" = 1 ] && warn "DRY RUN — no changes will be made"
  [ "$UNINSTALL" = 1 ] && { do_uninstall; exit 0; }

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
  log "  • Workflow preset is ${BOLD}$PRESET${NC} — edit $(override_ref) to change."
}

main "$@"
