# AGENTS.md — AI Development Team Framework

This file mirrors CLAUDE.md and provides context to AI coding assistants (Claude Code, Cursor, Kiro, VS Code) working in this repository — editors read whichever filename they support.

## Project Purpose

This is a **reusable AI Development Team framework** - a collection of specialized Claude Code skills that simulate a complete software development team. Each skill file represents a team member with deep domain expertise.

## Repository Structure

```
ai-dev-team/
├── README.md              # Installation & usage guide
├── install.sh             # One-command installer
├── CLAUDE.md / AGENTS.md   # agent/assistant instructions (this file = AGENTS.md, mirrors CLAUDE.md)
│
├── claude/                # Deployable content (copy to ~/.claude)
│   ├── CLAUDE.md          # Global instructions for Claude Code
│   ├── TEAM_WORKFLOW.md   # Complete team workflow documentation
│   │
│   ├── skills/            # 29 agent skills: 15-agent core team + specialists (tech stacks as references)
│   │   ├── management/    # Product Owner, Scrum Master, Business Analyst
│   │   ├── architecture/  # Solution Architect, GraphQL
│   │   ├── development/   # Backend (Java/Kotlin/Python), Frontend (React/Angular/Vue/Flutter)
│   │   ├── quality/       # Reviewers and Testers
│   │   ├── operations/    # DevOps, SecOps, MLOps
│   │   ├── design/        # UI Designer
│   │   ├── compliance/    # Accountant, Legal (generic + regional)
│   │   ├── marketing/     # Marketing Strategist
│   │   └── specialized/   # Technical Writer
│   │
│   ├── commands/          # 47 slash commands (/max, /jorge, /finn, /memory, etc.)
│   │
│   ├── templates/         # Document templates (ADR, Sprint, User Story, etc.)
│   │
│   └── rag/               # RAG Knowledge Base (Phase 3)
│       ├── mcp-server/    # Custom MCP server (voyage-code-3 + Qdrant)
│       ├── ingestion/     # SKILL.md chunking & embedding pipeline
│       └── management/    # Stats, backup, prune, reindex scripts
│
└── docs/                  # Extended documentation
    ├── TEAM_WORKFLOW.md
    ├── agent-communication.md
    └── skill-extension-guide.md
```

## Installation

```bash
./install.sh              # Interactive installation
./install.sh --merge      # Merge with existing ~/.claude
./install.sh --replace    # Backup and replace
./install.sh --link       # Symlink for development
```

## Development Guidelines

### When Improving This Repository

1. **Extending existing skills**: Add new technologies to skill files in `claude/skills/`
2. **Creating new agents**: Add new skill directories with `SKILL.md`
3. **Adding commands**: Create `.md` files in `claude/commands/`
4. **Updating templates**: Edit files in `claude/templates/`

### Quality Standards for Skills

- Include specific version numbers (e.g., "Spring Boot 4.0+")
- Provide complete, working code templates
- Define measurable standards (">80% coverage")
- Test templates before committing

### Testing Changes

```bash
./install.sh --link       # Creates symlink to test changes immediately
```

## The AI Development Team

| Category | Agents |
|----------|--------|
| Management | Product Owner (/max), Scrum Master (/luda), Business Analyst (/anna) |
| Architecture | Solution Architect (/jorge), GraphQL Developer |
| Development | Frontend (/finn), Backend (/james), + technology extensions |
| Quality | Reviewer (/rev), QA (/rob), E2E (/adam) |
| Operations | DevOps, SecOps, MLOps |
| Compliance | Accountant (/inga), Legal (/alex) |
| Design | UI Designer (/aura) |
| Marketing | Strategist (/apex) |
| Specialized | Technical Writer |

## Workflow

```
/po+/ba → /arch → /secops → [/fin] → [/legal] → [/ui] → /fe|/be → /rev → /qa+/e2e → /verify
```

Gates fire **proportionally** (by change-class / trigger / preset) via the `workflow-engine` — `/arch` and `/secops` apply when triggered, not on every change.

## Version

- **Version**: 4.1.0
- **Release Date**: 2026-02-23
- **Skills**: 29 (15-agent core team + optional specialists; tech stacks as references)
- **Commands**: 47 slash commands
- **Templates**: 6 document templates
- **RAG**: AI Team Memory (Qdrant + voyage-code-3)
