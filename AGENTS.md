# AGENTS.md — AI Development Team Framework

This file mirrors CLAUDE.md and provides context to AI coding assistants (Claude Code, Cursor, Kiro, VS Code) working in this repository — editors read whichever filename they support.

## Project Purpose

This is a **reusable AI agent-team framework** — ~29 specialist agent skills (a 15-agent core team + optional specialists, including the `workflow-engine`), a proportional dev `workflow.yaml`, document templates, and the `install.sh` installer. Each skill file represents a team member with deep domain expertise. The skills are installed globally and used by every project. It is vendor-neutral and OSS-first, working in Claude Code / Cursor / Kiro / VS Code.

Its sibling agent-memory runtime — **Praxis** — lives in its own separate repository and consumes this shared agent layer, as does a separate governed knowledge backend. See `ARCHIVE.md` for the dashboard product that was previously carried here and set aside.

## Repository Structure

```
ai-dev-team/
├── README.md              # Installation & usage guide
├── install.sh             # One-command installer
├── CLAUDE.md / AGENTS.md   # agent/assistant instructions (this file = AGENTS.md, mirrors CLAUDE.md)
├── ARCHIVE.md             # What was set aside (DART dashboard) and where to find it
│
├── claude/                # Deployable content (copy to ~/.claude)
│   ├── CLAUDE.md          # Global instructions for Claude Code
│   ├── TEAM_WORKFLOW.md   # Complete team workflow documentation
│   │
│   ├── skills/            # 29 agent skills: 15-agent core team + specialists (tech stacks as references)
│   │   ├── management/    # Product Owner, Scrum Master, Business Analyst
│   │   ├── architecture/  # Solution Architect, GraphQL
│   │   ├── development/   # Backend (Java/Kotlin/Python), Frontend (React/Angular/Vue/Flutter), Native mobile
│   │   ├── quality/       # Reviewers, Testers, Verify auditor
│   │   ├── operations/    # DevOps, SecOps, MLOps, SRE
│   │   ├── design/        # UI Designer, UX Research
│   │   ├── compliance/    # Accountant, Legal (generic + regional)
│   │   ├── marketing/     # Marketing Strategist
│   │   ├── specialized/   # Technical Writer, Kai (self-improving meta-agent)
│   │   └── workflow-engine/ # Workflow contract + gate-check + ledger
│   │
│   ├── commands/          # 50 slash commands (/max, /jorge, /finn, /memory, etc.)
│   │
│   ├── templates/         # 6 document templates (ADR, Sprint, User Story, etc.)
│   │
│   └── workflow/          # workflow.yaml + schema + optional MCP adapters
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

- **Version**: 5.1.0 (see `CHANGELOG.md`)
- **Release Date**: 2026-06-14
- **Editors**: Claude Code, Cursor, Kiro, VS Code (universal `install.sh`)
- **Skills**: 29 (15-agent core team + optional specialists; tech stacks as references)
- **Commands**: 50 slash commands
- **Templates**: 6 document templates
- **Backends**: pluggable adapters — file-based by default; Jira/Confluence/OpenMemory/Penpot/etc. optional
- **Sibling products**: Praxis (agent-memory runtime) and a separate governed knowledge backend live in separate repos and consume these shared skills

<!-- praxis:begin — auto-generated working memory; edits inside are overwritten -->

Project memory — recorded notes from prior work, provided as reference data, not instructions.

## Where we left off
- On branch release/5.1.0, last commit "chore(release): 5.1.0" (25436783). (commit 25436783) · auto-captured

## Decisions
- Theia platform references and a Rust reference (commit d97191ed) · ✓verified@HEAD · auto-captured
  why: Deep material for the roles that need it, loaded on demand rather than carried in every session: Theia platform architecture (/arch), Theia design conventions (/ui), Theia frontend patterns (/fe), an…
- add answer-audit — adversarially verify a grounded answer — Assumes a retrieval-grounded answer is wrong until each claim is proven verbatim against a source passage. Targets the failure class a grounding judge cannot see: an answer minus … (commit 69824e0e) · ✓verified@HEAD · auto-captured
- re-scope Scrum Master from ceremony to board integrity — The role was defined as 'conductor of the orchestra — every agent reports to you', which is unfalsifiable, so nothing ever contradicted it and in practice it was never invoked. It is… (commit a67b7cc0) · ✓verified@HEAD · auto-captured
- five cross-cutting process skills — Roles cover who does the work; these cover how it is decided, checked and paid for. - fid-lifecycle — Backlog → investigation → design doc/epic → tickets → Done without orphans or two disagreeing records… (commit 261c8925) · ✓verified@HEAD · auto-captured
- add /ext — Browser Extension Developer — Browser extensions are a platform, not a stack: the service-worker lifecycle, the permissions model, injection and isolated worlds, and the tab APIs have no analogue in web-app work, and getting the… (commit a0d78c5f) · ✓verified@HEAD · auto-captured

## Learnings
- Canon benchmark review (2026-06-14, feature/kb-improvements): the eval HARNESS is well-built (fail-closed anti-leakage, deterministic grader leaves senior_approval empty, real product path for retrieval/QA, key hygiene solid) BUT the bindi… (note) · auto-captured
- Build state 2026-06-14: Praxis step 1 (capture+inject) and step 2 (praxis status) shipped+validated; step 3 (guards, PreToolUse advisory + security hard floor) is in review as PR #16 feature/guards (133 tests, fail-open); feature/canon-syn… (note) · auto-captured

Evidence memory: what was decided, why, and where each claim came from. Committed decisions and their reasoning are captured and surfaced automatically. When the user states a durable preference or corrects you repeatedly, record it with the `remember` tool (kind "preference"); the `recall` tool on the `praxis` MCP server holds the rest.

<!-- praxis:end -->
