# AI Development Team

![Claude Code](https://img.shields.io/badge/Claude%20Code-ready-6E56CF) ![Cursor](https://img.shields.io/badge/Cursor-ready-111111) ![Kiro](https://img.shields.io/badge/Kiro-ready-9B59B6) ![VS Code](https://img.shields.io/badge/VS%20Code-ready-007ACC) ![License: MIT](https://img.shields.io/badge/License-MIT-green) ![Stars](https://img.shields.io/github/stars/olehsvyrydov/AI-development-team?style=social)

> **A reusable AI agent-team framework for your editor.** ~35 specialist agent skills (a 15-agent core team + optional specialists) plus a `workflow-engine` and an **enforced, proportional workflow** with approval gates — *process, not prompts*. Open-source, no lock-in; works in **Claude Code, Cursor, Kiro & VS Code**, free by default.

```
/po → /arch → /secops → [/fin] → [/legal] → [/ui] → /fe | /be → /rev → /qa + /e2e → /verify
```

The framework is a portable agent layer you install once and use across every project. It ships four things:

- **Agent skills** (`claude/skills/`) — lean `SKILL.md` personas that load deep `references/` on demand; tech stacks (React/Angular/Vue, Java/Kotlin/Python/PHP, …) are references the role *self-routes* to, not separate agents.
- **The `workflow-engine`** — a skill that classifies each change and **refuses** to skip a required gate.
- **`workflow.yaml`** — a versioned workflow definition, right-sized to the change via `solo` → `small-team` → `regulated` presets.
- **The installer** (`install.sh`) — wires the skills, commands, and templates into whichever editor(s) you use.

- **Process, not prompts.** Gates are enforced by the engine, not left to a model's memory — and right-sized so a typo isn't treated like a feature.
- **Roles, not micro-agents.** Each agent is a role persona; technology stacks are references the role loads on demand.
- **OSS-first, no lock-in.** Zero paid accounts by default: file-based tickets + a markdown knowledge base. Jira/Confluence, MCP memory, and design tools are optional overlays.

### vs. a single "do everything" agent

| | One mega-prompt | **AI Dev Team** |
|---|---|---|
| Process | hope it remembers | **enforced gates** that can refuse to proceed |
| Right-sizing | same weight for a typo and a feature | **proportional** (change-class + presets) |
| Expertise | one generalist | **role specialists** + on-demand stack references |
| Lock-in | often tool-specific | **vendor-neutral**, 4 editors, free defaults |

---

## Relationship to Praxis

The agent skills in this repo are the **shared agent layer** — installed globally and used by every project, including its sibling **Praxis** (an open agent-memory runtime) and a separate governed knowledge backend, which live in their own separate repositories.

This framework stays focused on the durable, reusable layer: the agent skills, the workflow engine, the workflow definition, the templates, and the installer. Product-specific surfaces (dashboards, knowledge backends, memory runtimes) live in Praxis and a separate knowledge backend, not here. The earlier dashboard product that this repo once carried has been set aside — see [`ARCHIVE.md`](ARCHIVE.md).

---

## Team at a Glance

```
                              MANAGEMENT LAYER
           ┌─────────────────────┬─────────────────────┐
           │                     │                     │
    ┌──────▼──────┐      ┌───────▼───────┐     ┌──────▼──────┐
    │   PRODUCT   │      │    SCRUM      │     │  BUSINESS   │
    │    OWNER    │      │   MASTER      │     │  ANALYST    │
    │   /po /max  │      │  /sm /luda    │     │  /ba /anna  │
    └──────┬──────┘      └───────┬───────┘     └──────┬──────┘
           └─────────────────────┼─────────────────────┘
                                 │
                        ARCHITECTURE LAYER
           ┌─────────────────────┼─────────────────────┐
    ┌──────▼──────────┐                       ┌────────▼────────┐
    │    SOLUTION     │                       │    SECURITY     │
    │   ARCHITECT     │                       │    ENGINEER     │
    │  /arch /jorge   │                       │ /secops /soren  │
    └──────┬──────────┘                       └────────┬────────┘
           └─────────────────────┬─────────────────────┘
                                 │
                        DEVELOPMENT LAYER
         ┌───────────────────────┼───────────────────────┐
  ┌──────▼────────┐    ┌────────▼─────────┐    ┌────────▼────────┐
  │    BACKEND    │    │    FRONTEND      │    │     DEVOPS      │
  │   DEVELOPER   │    │   DEVELOPER      │    │    ENGINEER     │
  │  /be /james   │    │   /fe /finn      │    │                 │
  └──────┬────────┘    └────────┬─────────┘    └─────────────────┘
         │                      │
         │        QUALITY LAYER │
         ▼                      ▼
  ┌──────────────┐     ┌───────────────┐     ┌───────────────┐
  │     CODE     │     │  QA ENGINEER  │     │   E2E TESTER  │
  │   REVIEWER   │     │   /qa /rob    │     │  /e2e /adam   │
  │     /rev     │     └───────────────┘     └───────────────┘
  └──────────────┘

                        SPECIALIST LAYER
  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
  │ UI/UX     │  │ACCOUNTANT │  │   LEGAL   │  │ MARKETING │
  │ /ui /aura │  │ /fin /inga│  │/legal/alex│  │ /mkt /apex│
  └───────────┘  └───────────┘  └───────────┘  └───────────┘
```

---

## Quick Start

### 1. Install

**Claude Code — as a plugin (recommended).** Nothing to clone, and no `~/.claude` setup: declare
it per project and it reaches every session, including cloud sessions and anyone else who clones
the repository.

```jsonc
// <your-project>/.claude/settings.json
{
  "extraKnownMarketplaces": {
    "aidevteam": {
      "source": { "source": "github", "repo": "olehsvyrydov/AI-development-team" }
    }
  },
  "enabledPlugins": { "ai-dev-team@aidevteam": true }
}
```

Trust the directory when prompted; the plugin installs on the next session. Verify with
`claude plugin details ai-dev-team`, which lists the component inventory and its token cost.

Skills arrive namespaced — `ai-dev-team:arch`, `ai-dev-team:rev` — and the short aliases (`/arch`,
`/rev`) keep working. The always-on contract ships as the `ai-dev-team` skill; a plugin cannot
install a global `CLAUDE.md`, so that skill carries what a session needs to know about how work
runs here.

To try it before declaring it: `claude --plugin-dir ./claude` from a clone of this repository.

**Any editor — the installer.** Still supported, and the only path for Cursor, Kiro and VS Code.

```bash
git clone https://github.com/olehsvyrydov/AI-development-team.git
cd AI-development-team
./install.sh                       # interactive: pick your editor(s)
```

The **universal installer** wires up whichever editors you choose and emits the right
config for each — no lock-in:

| Editor | What it installs |
|--------|------------------|
| **Claude Code** | `.claude/skills` + `.claude/commands` + `CLAUDE.md` |
| **Cursor** | `.cursor/rules/ai-dev-team.mdc` + `AGENTS.md` |
| **Kiro** | `.kiro/steering/ai-dev-team.md` + `AGENTS.md` |
| **VS Code (Copilot)** | `.github/copilot-instructions.md` + `AGENTS.md` |

```bash
./install.sh --editors=all --preset=solo --yes  # non-interactive (preset: solo|small-team|regulated)
./install.sh --editors=claude --scope=user    # global ~/.claude (Claude Code)
./install.sh --dry-run                        # preview, change nothing
./install.sh --link                           # symlink content (dev mode)
./install.sh --uninstall                      # remove what it installed
```

Optional advanced Claude backends (Atlassian, memory MCP, hooks): `scripts/setup-claude-backends.sh`.

### 2. Verify

```bash
# In Claude Code:
/agents         # List the team (15 core + specialists)
/po             # Start with Product Owner
/arch           # Get architecture review
```

---

## What Gets Installed

```
~/.claude/
├── CLAUDE.md                    # Global instructions (TDD workflow, approval gates)
├── TEAM_WORKFLOW.md             # Complete team process documentation
│
├── skills/                      # 29 agent skill files (15 core + specialists; stacks as references)
│   ├── management/              # Product Owner, Scrum Master, Business Analyst
│   ├── architecture/            # Solution Architect, GraphQL Developer
│   ├── development/
│   │   ├── backend/             # Java/Spring, Kotlin, PHP/Laravel, Python/FastAPI
│   │   ├── frontend/            # React/Next.js, Angular, Vue, Flutter
│   │   └── mobile/              # Native iOS/Android
│   ├── quality/
│   │   ├── review/              # Full-stack, Backend, Frontend, PHP reviewers
│   │   ├── testing/             # QA, E2E (Playwright/Detox), BDD/Cucumber, unit testers
│   │   └── verify/              # Completion auditor (gate)
│   ├── operations/              # DevOps, SecOps, MLOps, SRE, Terraform
│   ├── design/                  # UI/UX Designer, UX Research, JavaFX Designer
│   ├── compliance/              # Accountant, Legal (generic + UK regional variants)
│   ├── marketing/               # Product Marketing Strategist
│   ├── specialized/             # Technical Writer, Kai (self-improving meta-agent)
│   └── workflow-engine/         # Workflow contract + gate-check + ledger
│
├── commands/                    # 50 slash commands
│   ├── [role-based]             # /po, /sm, /ba, /arch, /fe, /be, /rev, /qa, /e2e ...
│   ├── [persona aliases]        # /max, /luda, /jorge, /finn, /james, /adam ...
│   └── [utility]                # /agents, /bug, /issue, /memory, /all, /kai ...
│
├── templates/                   # 6 document templates
│   ├── adr-template.md          # Architecture Decision Records
│   ├── user-story-template.md   # User stories with Given/When/Then AC
│   ├── sprint-template.md       # Sprint planning & tracking
│   ├── code-review-template.md  # Structured code review reports
│   ├── investigation-report-template.md
│   └── retrospective-template.md
│
└── workflow/                    # workflow.yaml + schema + optional MCP adapters
```

---

## Agent Reference

### Core Agents

| Command | Alias | Role | Key Expertise |
|---------|-------|------|---------------|
| `/po` | `/max` | Product Owner | Vision, backlog, user stories, prioritization |
| `/sm` | `/luda` | Scrum Master | Board integrity checks, AC refinement, team orchestration |
| `/ba` | `/anna` | Business Analyst | Market research, requirements, gap analysis |
| `/arch` | `/jorge` | Solution Architect | System design, patterns (CQRS, Saga), ADRs |
| `/fe` | `/finn` | Frontend Developer | React 19, Next.js, TypeScript, TailwindCSS |
| `/be` | `/james` | Backend Developer | Java 21+, Spring Boot 4, Kotlin, reactive APIs |
| `/rev` | — | Code Reviewer | Quality, security, style, requirements validation |
| `/qa` | `/rob` | QA Engineer | Test case design, BDD specs, exploratory testing |
| `/e2e` | `/adam` | E2E Tester | Playwright, Detox, performance testing |
| `/ui` | `/aura` | UI/UX Designer | Design systems, Figma-to-code, accessibility |
| `/secops` | `/soren` | Security Engineer | OWASP, threat modeling, Zero Trust, supply chain |
| `/fin` | `/inga` | UK Accountant | Tax planning, VAT, R&D credits, MTD compliance |
| `/legal` | `/alex` | UK Legal Counsel | GDPR, contracts, employment law, compliance |
| `/mkt` | `/apex` | Marketing Strategist | GTM strategy, positioning, content, SEO |
| `/devops` | — | DevOps Engineer | Terraform, Kubernetes, GitHub Actions, Docker |

> Both naming conventions work: `/arch` (role-based, primary) and `/jorge` (persona alias) invoke the same agent.

### On-Demand Specialists

These aren't part of the core 15 — they load on demand when their discipline is in play (invoke directly, or a core agent routes to them).

| Command | Role | Key Expertise |
|---------|------|---------------|
| `/ai` | AI/LLM Application Engineer | RAG, agents, prompt engineering, evals, tool use, guardrails |
| `/mlops` | MLOps Engineer | Model serving, ML/AI pipelines, deployment & monitoring |
| `/data` | Data Engineer | ETL/ELT, dbt, warehouses, streaming, orchestration |
| `/dba` | Database Administrator | Schema design, indexing, query tuning, safe migrations |
| `/sre` | SRE / Observability | SLOs, monitoring, alerting, incident response, runbooks |
| `/perf` | Performance Engineer | Web Vitals, profiling, caching, load testing, budgets |
| `/android` | Native Mobile — Android | Kotlin, Jetpack Compose, Play delivery |
| `/ios` | Native Mobile — iOS | Swift, SwiftUI, App Store delivery |
| `/ux` | UX Researcher | Interviews, usability testing, personas, journey maps |
| `/tw` | Technical Writer | API docs, Javadoc/JSDoc, READMEs, diagrams, onboarding |

Two special-purpose agents are documented in their own sections: `/kai` (self-improving meta-agent) and `/verify` (completion auditor / workflow gate).

### Process Skills

Role agents cover **who** does the work. These cover **how** it is decided, checked and paid for.
They live at the top level of `claude/skills/` and self-trigger from their descriptions — you
rarely invoke them by name, but knowing they exist lets you reach for one deliberately.

| Skill | Load it when |
|-------|--------------|
| `workflow-engine` | Before any task and before every handoff — the gate contract. It may refuse to proceed past an unmet gate |
| `ai-dev-team` | The always-on contract: principles, process, git conventions. What a global `CLAUDE.md` used to carry |
| `fid-lifecycle` | Moving work Backlog → design doc / epic → tickets → Done without orphans or two disagreeing records |
| `verify-landed` | After any behaviour-changing edit, before calling a fix done. *Removing nothing breaks nothing* — a green build is not evidence your change exists |
| `review-tier` | Before spending a review. Classifies the diff, picks the shape, and refuses to review a branch whose free gates are not green |
| `model-selection` | Before delegating work. Go cheaper when a mechanical verifier exists downstream; spend when this output is the last line of defence |
| `research-method` | A question that needs measuring rather than deciding, and writing the result so it survives a hostile reader |
| `answer-audit` | Checking a retrieval-grounded answer, assuming it is wrong until each claim is proven verbatim against a source |
| `pull-request` | Running a PR to a mergeable state — resolving every review thread, checking runs by SHA rather than the summary |

**The rule they exist to enforce:** a ticket is Done only when its **negative** criteria are met —
the guard, the refusal, the "cannot bypass" — and each names the **symbol** that enforces it. Happy
paths ship; the things that stop bad outcomes do not, unless someone checks.

### Technology Extensions

These activate alongside core agents when working with specific technologies:

| Skill | Extends | Technology |
|-------|---------|------------|
| Angular Developer | Frontend | Angular 21, Signals, NgRx SignalStore |
| Vue Developer | Frontend | Vue 3, Composition API, Pinia, Nuxt 3 |
| Flutter Developer | Frontend | Flutter/Dart, Riverpod, Material 3 |
| Kotlin Developer | Backend | Kotlin 2.1, Coroutines, KMP |
| Quarkus Developer | Backend | Quarkus, Panache, GraalVM Native |
| FastAPI Developer | Backend | Python FastAPI, async, Pydantic v2 |
| Laravel Developer | Backend | PHP/Laravel, Eloquent, Filament, Livewire 3 |
| Spring Kafka | Backend | Kafka 4.x, Reactor Kafka, DLT/retry |
| JavaFX Developer | Desktop | JavaFX 21+, FXML, Scene Builder |
| GraphQL Developer | Architect | Apollo, Federation, DataLoader |
| Terraform Specialist | DevOps | Multi-cloud IaC, state management |
| Cucumber BDD | E2E Tester | Gherkin, step definitions, Cucumber-JVM/JS |
| HMRC API | Backend | UK Making Tax Digital, OAuth2 Gateway |
| Backend Reviewer | Reviewer | Java/Kotlin focus, Checkstyle, SonarQube |
| Frontend Reviewer | Reviewer | TypeScript focus, ESLint, accessibility |
| PHP Reviewer | Reviewer | PHP/Laravel focus, PHPStan, Psalm |
| Backend Tester | Tester | JUnit 5, Testcontainers, StepVerifier |
| Frontend Tester | Tester | Jest, React Testing Library, Vitest |
| JavaFX Designer | UI Designer | JavaFX CSS, FXML layouts |
| UK Accountant | Accountant | UK-specific tax, HMRC, IR35 |
| UK Legal Counsel | Legal | English & Welsh Law, GDPR UK |
| UK Self-Employment | UK Accountant | SA103, Class 4 NI, MTD quarterly |

---

## Workflow

### Development Sequence

Every feature follows this pipeline:

```
1. /po + /ba    → Define vision, write user stories with behavioral AC
2. /arch        → Architecture review and ADR (when triggered)
3. /secops      → Security review (safety override — never skipped for size)
4. [/fin]       → Finance review (if payments, billing, tax)
5. [/legal]     → Legal review (if GDPR, privacy, contracts)
6. [/ui]        → UI design (if frontend feature)
7. /fe or /be   → TDD implementation (tests first, then code)
8. /rev         → Code review (quality + security + requirements)
9. /qa + /e2e   → Test case design + automated E2E tests
```

### Approval Gates

Gates are **proportional** — the `workflow-engine` decides which apply per change-class / trigger / preset (a typo isn't a feature). Security gates are a safety override: triggered by risk, never skipped for being "small".

| Gate | Agent | When Required |
|------|-------|---------------|
| Architecture | `/arch` | When triggered (new system / dependency / boundary) or forced by preset |
| Security | `/secops` | When triggered (auth / secrets / PII / external input) — never skipped for size |
| Finance | `/fin` | Payments, billing, VAT, tax features |
| Legal | `/legal` | GDPR, privacy, contracts, employment |
| UI Design | `/ui` | Frontend features |

### TDD (Mandatory)

All development follows strict Test-Driven Development:

1. **Red** — Write failing tests that define expected behavior
2. **Green** — Write minimum code to pass tests
3. **Refactor** — Clean up while keeping tests green
4. **Commit** — Git commit after successful test run

### Bug Workflow

```bash
/bug Login button doesn't work on mobile Safari
```

Creates a structured investigation → reproduction test → TDD fix → code review → E2E test.

### Jira & Confluence (optional overlay)

**By default the team is file-based** — Backlog.md tickets + a markdown knowledge base, zero paid accounts. Jira/Confluence are an **optional overlay**: enable them in `workflow.yaml` and connect the [Atlassian MCP server](https://mcp.atlassian.com):

```bash
claude mcp add --scope user --transport http atlassian https://mcp.atlassian.com/v1/mcp
```

- **Jira**: Kanban board for issue tracking, ticket lifecycle, sprint management
- **Confluence**: Architecture decisions, security reviews, investigation reports, sprint documentation
- **Git conventions**: Branch names (`feature/PROJ-123-description`), commit messages (`PROJ-123: Implement feature`)

---

## Optional Add-Ons

### Multi-LLM Consultation (`/all`)

Query multiple frontier models from within Claude Code and get consensus, divergent views, and synthesized recommendations.

```bash
/all Should we use event sourcing for our payment system?
/all Review this architecture for scalability issues
```

Routes through [OpenRouter](https://openrouter.ai) (single API key for all models) with direct OpenAI fallback.

```bash
cd multi-llm/mcp
python3 -m venv .venv && .venv/bin/pip install -e .

claude mcp add --scope user multi-llm \
  -e OPENROUTER_API_KEY=<your-key> \
  -- /path/to/multi-llm/mcp/.venv/bin/python3 -m consult_mcp
```

See: [Multi-LLM Guide](docs/multi-llm-guide.md)

### Self-Improving Meta-Agent (`/kai`)

Kai promotes working-rules you have already approved into permanent SKILL.md updates. It **emits a
diff and stops** — it never applies, stages, or commits a change.

Its input is working-rules **you have already approved** — from whatever the project uses: an
agent-memory MCP server, a file the team maintains, or nothing at all. Kai names no product and
depends on none; concrete backends are optional adapters documented in
`claude/skills/specialized/kai/references/rule-sources.md`. Kai reads only the approved rules,
drops any that are project-specific, duplicated or too vague, and proposes the rest.

```bash
/kai                       # review all approved rules, propose what qualifies
/kai --skill <path>        # restrict to rules routing to one skill
/kai --audience reviewer   # restrict by audience (reviewer|developer|tester|all)
```

**Pipeline:** session → rules mined automatically → **you approve** → Kai filters for universality
→ diff for review → you apply it, or you do not.

With no backend connected, `/kai` reports that there are no approved rules and stops. It does not
invent them.

---

## Extending the Framework

### Adding a New Agent

1. Create a skill directory under the appropriate category:
   ```
   claude/skills/development/backend/rust/rust-developer/SKILL.md
   ```

2. Follow the SKILL.md format (YAML frontmatter + structured Markdown sections):
   ```yaml
   ---
   name: rust-developer
   description: "Senior Rust Developer with 8+ years systems programming experience"
   ---

   # Rust Developer

   ## Trigger
   Use when working with Rust code, systems programming, or performance-critical services.

   ## Context
   You are a Senior Rust Developer...

   ## Expertise
   ### Rust 2024 Edition
   - Ownership, borrowing, lifetimes
   ...

   ## Anti-Patterns
   - Never use `unwrap()` in production code
   ...
   ```

3. Create a slash command in `claude/commands/rust.md`

4. Re-install / update: `./install.sh` (idempotent)

See: [Skill Extension Guide](docs/skill-extension-guide.md)

### Adding a New Technology to an Existing Agent

Edit the relevant `SKILL.md` and add a new subsection under `## Expertise`. Skills should contain universal, reusable knowledge — no project-specific references, ticket IDs, or sprint numbers.

---

## Requirements

| Component | Required | Version |
|-----------|----------|---------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Yes | Latest |
| Python | For Multi-LLM only | 3.11+ |
| [OpenRouter API key](https://openrouter.ai/) | For Multi-LLM only | Pay-per-use |

The core framework (15-agent core team + optional specialists) works with just Claude Code — no additional dependencies.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Team Workflow](docs/TEAM_WORKFLOW.md) | Complete phase-by-phase development process |
| [Context Persistence](docs/context-persistence-guide.md) | Session continuity notes |
| [Multi-LLM Guide](docs/multi-llm-guide.md) | `/all` command, model registry, API setup |
| [Skill Extension](docs/skill-extension-guide.md) | Adding new technologies and agents |
| [Agent Communication](docs/agent-communication.md) | Handoff specs, artifact flow between agents |
| [Archive](ARCHIVE.md) | What was set aside (the DART dashboard product) and where to find it |

---

## Version History

See [`CHANGELOG.md`](CHANGELOG.md) for full details.

| Version | Date | Changes |
|---------|------|---------|
| 5.1.0 | 2026-06-14 | Reference libraries (ai-engineer, architect, data/mlops/dba); /tw + /mlops wired up; roster reconciled to core 15; knowledge-backend naming generalized; DART dashboard + RAG subsystem + migration scripts removed |
| 5.0.0 | 2026-06-06 | **OSS-first release** — proportional workflow engine, 48→29 roster, universal multi-editor installer, pluggable adapters |
| 4.1.0 | 2026-02-24 | Kai meta-agent, multi-LLM consultation, migration scripts |
| 4.0.0 | 2025-01-02 | Restructured for easy `~/.claude` deployment, installer |
| 3.1.0 | 2024-12-27 | Approval gates, design verification |
| 3.0.0 | 2024-12-26 | TDD workflow, unified QA agents |
| 2.0.0 | 2024-12-25 | Performance testing modules |
| 1.0.0 | 2024-12-23 | Initial release with 15 agents |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Install in dev mode: `./install.sh --link`
4. Make changes to skills in `claude/skills/`
5. Submit a pull request

See [Skill Extension Guide](docs/skill-extension-guide.md) for detailed contribution guidelines.

---

## License

MIT License — See [LICENSE](LICENSE) file for details.
