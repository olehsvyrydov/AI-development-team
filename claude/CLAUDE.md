# AI Development Team

A team of ~48 specialist AI agents + an enforced, proportional dev workflow. Open-source, vendor-neutral, works in Claude Code / Cursor / Kiro / VS Code, free by default.

## Principles
- **Proportional process.** Right-size the workflow to the change — a typo is not a feature. Don't over-process; don't skip what matters.
- **TDD.** Behavior → failing test → minimal code → green → refactor → commit. Targets: >80% unit, >60% integration.
- **Behavior-only tickets.** Stories say WHAT, not HOW (no file paths/line numbers).
- **OSS-first, no lock-in.** Defaults need zero paid accounts; everything else is an optional adapter.
- **Reusable skills.** Agent skills hold universal knowledge — no project/ticket/sprint specifics.

## Workflow (consult before any task)
**Before starting any development task and before every handoff, consult the `workflow-engine` skill.** It loads `workflow.yaml`, classifies the change, decides which approval gates apply, and may **refuse** to proceed past an unmet gate. Do not paraphrase the process from memory.
- Default `preset: solo` — gates fire only on trigger/change-class (light path for one dev). `small-team` adds code review; `regulated` runs the full gauntlet. Edit `workflow.yaml` to change it.
- **Gates** (set as labels in the ledger): `ARCH_APPROVED`, `SECOPS_APPROVED`, `DESIGN_APPROVED`, `APPROVAL_GATE`, `CODE_REVIEWED`, `PERF_OK`, `VERIFIED`, `RELIABILITY_OK`. Security gates are a safety override — never skipped for being "small."
- Full detail: `TEAM_WORKFLOW.md` (on-demand). Definition: `workflow/workflow.yaml`.

## Tickets & docs — no Jira required
Default is **file-based**: markdown tickets (**Backlog.md**) + a markdown knowledge base (Obsidian-compatible). Jira/Confluence and other backends (KGB/Canon) are **optional MCP overlays**, enabled only in `workflow.yaml`.

## Memory (optional)
Native files by default. Optional OSS memory MCP (OpenMemory / mem0). No memory backend is required.

## Team quick reference
| Cmd | Alias | Role | · | Cmd | Alias | Role |
|---|---|---|---|---|---|---|
| `/po` | max | Product Owner | · | `/secops` | soren | Security |
| `/sm` | luda | Scrum Master | · | `/rev` | — | Code Reviewer |
| `/ba` | anna | Business Analyst | · | `/qa` | rob | Test Designer |
| `/arch` | jorge | Architect | · | `/e2e` | adam | E2E Automation |
| `/fe` | finn | Frontend | · | `/ui` | aura | UI/UX Designer |
| `/be` | james | Backend | · | `/verify` | — | QA Auditor (gate) |
| `/fin` | inga | Accountant | · | `/legal` | alex | Legal |
| `/mkt` | apex | Marketing | · | `/kai` | — | Self-improvement |

Specialists (AI/LLM, Data, SRE, Native mobile, UX research, Performance, DBA, DevOps, MLOps, framework extensions) load on demand. Full roster: `/agents`. Role commands are standard; persona aliases invoke the same agent.

## Git
Branch `feature/<KEY>-desc` · commit `<KEY>: message` · PR `<KEY>: title`. Run tests before committing.
