# Changelog

All notable changes to this project. Roughly [semver](https://semver.org); dates are ISO-8601.

## [5.0.0] — 2026-06-06

The **OSS-first, vendor-neutral** release: a proportional enforced workflow, a leaner roster, a universal installer, pluggable backends, and a local dashboard. No paid accounts required by default; works in **Claude Code, Cursor, Kiro, and VS Code**.

### Added
- **Proportional workflow engine** — a versioned `workflow.yaml` + a `workflow-engine` skill + presets (`solo` / `small-team` / `regulated`). Gates fire by change-class / trigger / preset and can **refuse** to proceed; security gates are a safety override that's never skipped for being "small".
- **Universal installer** — one `install.sh` wires up any of four editors and emits the right config for each (`.claude/` + `CLAUDE.md`, `.cursor/rules/`, `.kiro/steering/`, `.github/copilot-instructions.md`, all alongside `AGENTS.md`). Flags: `--editors/--scope/--preset/--dry-run/--yes/--link/--uninstall`. (#26)
- **Pluggable OSS-first adapters** — tickets / knowledge base / memory / design as swappable backends with a documented contract (capabilities / health-check / fallback / data-residency) and ready-to-paste `.mcp.json` overlays: atlassian, backlog, openmemory, mem0, penpot, figma, canva, obsidian. (#27)
- **Local Hub** — a zero-dependency dashboard (`node hub/server.js`) showing the live gate board, tickets, and knowledge base over SSE; reads the file-based defaults, no `npm install`. (#28)
- **Bundled demo** — `examples/demo/` for an instant, populated Hub preview. (#29)
- `AGENTS.md` (root + `claude/`), `CONTRIBUTING.md`, and GitHub issue/PR templates.

### Changed
- **Roster consolidated 48 → 29 agents** (a 15-agent core team + optional specialists). Technology stacks are now `references/` that a role agent self-routes to — not separate agents. (#24)
- **All agent skills modernized** to progressive disclosure: a lean `SKILL.md` (< ~500 lines, sharp `description`) + deep `references/` loaded on demand. (#5–#22)
- **File-based by default** — markdown tickets (Backlog.md) + a markdown knowledge base; Jira/Confluence and MCP memory are optional overlays enabled in `workflow.yaml`. Agent skills decoupled from hard-coded Jira. (#25)
- **README** rewritten — editor-neutral hero, proportional-gates framing, "process, not prompts", no-lock-in positioning.

## [4.1.0] — 2026-02-24
- Kai meta-agent, multi-LLM consultation, context persistence, RAG knowledge base, migration scripts.

## [4.0.0] — 2025-01-02
- Restructured for easy `~/.claude` deployment; one-command installer.
