# CLAUDE.md - AI Development Team Framework

This file provides context to Claude Code when working in this repository.

## Project Purpose

This is a **reusable AI Development Team framework** - a collection of specialized Claude Code skills that simulate a complete software development team. Each skill file represents a team member with deep domain expertise.

## Repository Structure

```
ai-dev-team/
├── README.md              # Installation & usage guide
├── install.sh             # One-command installer
├── CLAUDE.md              # This file
│
├── claude/                # Deployable content (copy to ~/.claude)
│   ├── CLAUDE.md          # Global instructions for Claude Code
│   ├── TEAM_WORKFLOW.md   # Complete team workflow documentation
│   │
│   ├── skills/            # 33 AI agent skills (categorized)
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
│   ├── commands/          # 16 slash commands (/max, /jorge, /finn, etc.)
│   │
│   └── templates/         # Document templates (ADR, Sprint, User Story, etc.)
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
/max → /luda → /jorge → [/inga] → [/alex] → [/aura] → /finn|/james → /rev → /rob + /adam
```

All features require `/jorge` architecture approval before implementation.

## Version

- **Version**: 4.0.0
- **Release Date**: 2025-01-02
- **Skills**: 33 (categorized by technology)
- **Commands**: 16 slash commands
- **Templates**: 5 document templates
