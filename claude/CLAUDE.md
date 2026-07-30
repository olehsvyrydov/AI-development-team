# AI Development Team

A team of ~29 specialist AI agents (a 15-agent core team + optional specialists) + an enforced, proportional dev workflow. Open-source, vendor-neutral, works in Claude Code / Cursor / Kiro / VS Code, free by default.

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

## Process skills — load these, they are not optional extras
Beside the role agents, six **cross-cutting process skills** cover how work is decided, checked and paid for. They self-trigger from their descriptions; know they exist so you reach for them deliberately.
- **`workflow-engine`** — the gate contract. Consult first, on every task.
- **`fid-lifecycle`** — moving work Backlog → investigation → design doc / epic → tickets → Done without orphans or two disagreeing records. Delete the backlog item once its design doc exists; one epic per design doc, titled to correspond; every ticket parented to it and listed in its registry; **the tracker is authoritative for status** when the two disagree.
- **`verify-landed`** — after any behaviour-changing edit, and before claiming a finding fixed or a criterion met. A green build is not evidence your change exists: *removing nothing breaks nothing*, so a no-op edit compiles and passes every test.
- **`review-tier`** — how much code review to buy and how to scope it. Free gates green first; on a follow-up round review *the fix and the prior findings*, not the whole PR again.
- **`model-selection`** — which model tier to spend. The test is whether a cheap verifier exists downstream: if a mistake would be caught mechanically, go cheaper; if this output is the last line of defence, spend.
- **`research-method`** — for questions that need measuring rather than deciding, and for writing results up so they survive a hostile reader.

**The rule they enforce**, because it is the most expensive lesson so far: a ticket is Done only when its *negative* criteria are met — the guard, the refusal, the "cannot bypass" — and each names the **symbol** that enforces it. An audit of one project's 30 open tickets found 13 with an unmet criterion, nearly always the negative case, several treated as complete because the feature existed. Happy paths ship; the things that stop bad outcomes do not, unless someone checks.

## Tickets & docs — no Jira required
Default is **file-based**: markdown tickets (**Backlog.md**) + a markdown knowledge base (Obsidian-compatible). Jira/Confluence and other backends (a knowledge-graph backend) are **optional MCP overlays**, enabled only in `workflow.yaml`.

Where progress is tracked — a local folder or an external tracker — is a **convenience call**, decided by project size. Never run both for the same thing: two trackers become two answers to "what is the state?", and the stale one is always the one someone reads.

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
| `/be` | james | Backend | · | `/devops` | — | DevOps |
| `/fin` | inga | Accountant | · | `/legal` | alex | Legal |
| `/mkt` | apex | Marketing | · |  |  |  |

Two special-purpose agents sit outside the core 15: `/verify` (completion auditor / workflow gate) and `/kai` (self-improving meta-agent).

Optional specialists (AI/LLM, Data, DBA, SRE, MLOps, UX research, Performance, Native mobile, Technical writer (`/tw`), …) load on demand. **Technology stacks are not separate agents** — a role agent detects the project's stack and loads the matching `references/<stack>.md` (Angular/Vue/Flutter/JavaFX → `/fe`; Kotlin/FastAPI/Laravel/Quarkus/Kafka/HMRC → `/be`; GraphQL → `/arch`; Terraform → `/devops`; Cucumber → `/e2e`; UK law/tax → `/legal`,`/fin`). Full roster: `/agents`. Role commands are standard; persona aliases invoke the same agent.

## Git
Branch `feature/<KEY>-desc` · commit `<KEY>: message` · PR `<KEY>: title`. Run tests before committing.
