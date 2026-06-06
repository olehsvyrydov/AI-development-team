# AI Development Team

![Claude Code](https://img.shields.io/badge/Claude%20Code-ready-6E56CF) ![Cursor](https://img.shields.io/badge/Cursor-ready-111111) ![Kiro](https://img.shields.io/badge/Kiro-ready-9B59B6) ![VS Code](https://img.shields.io/badge/VS%20Code-ready-007ACC) ![License: MIT](https://img.shields.io/badge/License-MIT-green) ![Stars](https://img.shields.io/github/stars/olehsvyrydov/AI-development-team?style=social)

> **An AI dev team in your editor.** ~29 specialist agents (a 15-agent core team + optional specialists) and an **enforced, proportional workflow** with approval gates — *process, not prompts*. Open-source, no lock-in; works in **Claude Code, Cursor, Kiro & VS Code**, free by default.

```
/po → /arch → /secops → [/fin] → [/legal] → [/ui] → /fe | /be → /rev → /qa + /e2e → /verify
```

- **Process, not prompts.** A versioned `workflow.yaml` + a `workflow-engine` skill that **refuses** to skip a required gate — right-sized to the change (`solo` → `small-team` → `regulated` presets).
- **Roles, not micro-agents.** Each agent is a lean `SKILL.md` persona that loads deep `references/` on demand; tech stacks (React/Angular/Vue, Java/Kotlin/Python/PHP, …) are references the role *self-routes* to — not separate agents.
- **OSS-first, no lock-in.** Zero paid accounts by default: file-based tickets + a markdown knowledge base. Jira/Confluence, MCP memory, and design tools are optional overlays.

### vs. a single "do everything" agent

| | One mega-prompt | **AI Dev Team** |
|---|---|---|
| Process | hope it remembers | **enforced gates** that can refuse to proceed |
| Right-sizing | same weight for a typo and a feature | **proportional** (change-class + presets) |
| Expertise | one generalist | **role specialists** + on-demand stack references |
| Lock-in | often tool-specific | **vendor-neutral**, 4 editors, free defaults |

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

Optional advanced Claude backends (RAG memory, Atlassian, hooks): `scripts/setup-claude-backends.sh`.

### 2. Verify

```bash
# In Claude Code:
/agents         # List the team (15 core + specialists)
/po             # Start with Product Owner
/arch           # Get architecture review
```

### 3. Optional: Enable RAG Knowledge Base

The installer will offer to set up the semantic knowledge base (requires Docker + Python 3.11+). You can also do it manually later — see [RAG Setup](#rag-knowledge-base-ai-team-memory).

### 4. Optional: launch the local Hub

A **zero-dependency** dashboard for the workflow — live gate board, tickets, and knowledge base, straight from the file-based defaults (no `npm install`, no Jira):

```bash
node hub/server.js examples/demo     # see it instantly with the bundled demo
node hub/server.js /path/to/project  # …or your own project — then open http://localhost:4477
# in a dev container / VM / for LAN access, add: --host 0.0.0.0
```

The [bundled demo](examples/demo/) shows three tickets and a live gate board (including a **rejected** code review the gate caught). See [`hub/README.md`](hub/README.md). It's **read-only** and live-updates over SSE as your `.workflow-state.json` / tickets change. Binds to `127.0.0.1` by default.

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
│   │   └── desktop/             # JavaFX
│   ├── quality/
│   │   ├── review/              # Full-stack, Backend, Frontend, PHP reviewers
│   │   └── testing/             # QA, E2E (Playwright/Detox), BDD/Cucumber, unit testers
│   ├── operations/              # DevOps, SecOps, MLOps, Terraform, HMRC API
│   ├── design/                  # UI/UX Designer, JavaFX Designer
│   ├── compliance/              # Accountant, Legal (generic + UK regional variants)
│   ├── marketing/               # Product Marketing Strategist
│   └── specialized/             # Technical Writer, Kai (self-improving meta-agent)
│
├── commands/                    # 47 slash commands
│   ├── [14 role-based]          # /po, /sm, /ba, /arch, /fe, /be, /rev, /qa, /e2e ...
│   ├── [13 persona aliases]     # /max, /luda, /jorge, /finn, /james, /adam ...
│   └── [10 utility]             # /agents, /bug, /issue, /memory, /all, /kai ...
│
└── templates/                   # 6 document templates
    ├── adr-template.md          # Architecture Decision Records
    ├── user-story-template.md   # User stories with Given/When/Then AC
    ├── sprint-template.md       # Sprint planning & tracking
    ├── code-review-template.md  # Structured code review reports
    ├── investigation-report-template.md
    └── retrospective-template.md
```

---

## Agent Reference

### Core Agents

| Command | Alias | Role | Key Expertise |
|---------|-------|------|---------------|
| `/po` | `/max` | Product Owner | Vision, backlog, user stories, prioritization |
| `/sm` | `/luda` | Scrum Master | Sprint ceremonies, AC refinement, team orchestration |
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
| — | — | DevOps Engineer | Terraform, Kubernetes, GitHub Actions, Docker |
| — | — | MLOps Engineer | LLM integration, AI pipelines, model serving |
| — | — | Technical Writer | API docs, architecture diagrams, onboarding guides |

> Both naming conventions work: `/arch` (role-based, primary) and `/jorge` (persona alias) invoke the same agent.

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
2. /arch        → Architecture review and ADR (MANDATORY for all features)
3. /secops      → Security review (MANDATORY for all features)
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
- **Git conventions**: Branch names (`feature/LJ-123-description`), commit messages (`LJ-123: Implement feature`)

---

## AI Platform Features

Beyond agent skills, the framework includes an intelligent knowledge platform with three systems:

### RAG Knowledge Base (AI Team Memory)

Semantic search across agent expertise, architecture decisions, sprint learnings, and code patterns — powered by [Qdrant](https://qdrant.tech) + [Voyage AI](https://voyageai.com).

```bash
# In Claude Code:
/memory What does Jorge know about CQRS?
/memory Search for React testing patterns
```

**4 MCP tools provided:**
- `memory_search` — semantic search across any collection
- `memory_store` — persist new learnings at runtime
- `memory_agent_expertise` — ask "What does [agent] know about X?"
- `memory_stats` — collection health and counts

**5 Qdrant collections:**

| Collection | Contents | Use Case |
|------------|----------|----------|
| `agent-knowledge` | SKILL.md sections indexed by agent | "What does Finn know about React Server Components?" |
| `decisions` | Architecture Decision Records | "Have we decided on an auth strategy?" |
| `learnings` | Sprint retrospective insights | "What did we learn about Playwright selectors?" |
| `code-patterns` | Reusable code templates | "Show me a Spring Boot pagination pattern" |
| `session-context` | Conversation snapshots | Automatic session continuity across compactions |

**Setup:**

```bash
# 1. Start Qdrant
cd claude/rag && docker compose up -d

# 2. Install Python dependencies
cd mcp-server && python3 -m venv .venv && .venv/bin/pip install -e .

# 3. Initialize collections
cd .. && mcp-server/.venv/bin/python3 -m management.stats

# 4. Ingest skills into Qdrant
VOYAGE_API_KEY=<key> mcp-server/.venv/bin/python3 -m ingestion.ingest ~/.claude/skills/

# 5. Register MCP server with Claude Code
claude mcp add --scope user ai-team-memory \
  -e VOYAGE_API_KEY=<your-key> \
  -- /path/to/claude/rag/mcp-server/.venv/bin/python3 -m memory_mcp
```

**Architecture:**

```
Claude Code ──(stdio)──> MCP Server ──> Qdrant (Docker, port 6333)
                              │
                         Voyage AI (voyage-code-3, 1024-dim embeddings)
```

See: [RAG Setup Guide](docs/rag-setup/setup-guide.md) | [Knowledge Management](docs/knowledge-management-guide.md)

### Context Persistence

Automatic session continuity — decisions, file changes, and error resolutions survive context compaction and are restored in future sessions.

**How it works:**

| Hook | Trigger | Action |
|------|---------|--------|
| `save_context.py` | PreCompact | Parse transcript → extract decisions, file changes, tasks, discussions, errors → embed → store in Qdrant |
| `restore_context.py` | SessionStart (compact/resume) | Query Qdrant for relevant session context → inject into system prompt |

**Distillation pipeline** (`distill_context.py`): Promotes raw session context into permanent `learnings` and `agent-knowledge` collections — turning temporary conversation artifacts into long-lived institutional knowledge.

See: [Context Persistence Guide](docs/context-persistence-guide.md)

### Multi-LLM Consultation (`/all`)

Query GPT-5-2, Gemini 3.1 Pro, Grok 4, and more from within Claude Code. Get consensus, divergent views, and synthesized recommendations.

```bash
/all Should we use event sourcing for our payment system?
/all Review this architecture for scalability issues
```

**9 models available** (3 defaults, 6 alternatives):

| Model | Context | Strengths |
|-------|---------|-----------|
| GPT-5-2 | 400K | Deepest reasoning, security analysis |
| Gemini 3.1 Pro | 1M | Large context, performance |
| Grok 4 | 256K | Parallel reasoning, unique perspectives |
| DeepSeek Chat | 163K | 90% quality at 1/50 cost |
| Llama 4 Scout | 10M | Open-source, largest context window |
| + 4 more | | Fast/Pro variants |

Routes through [OpenRouter](https://openrouter.ai) (single API key for all models) with direct OpenAI fallback.

**Setup:**

```bash
cd multi-llm/mcp
python3 -m venv .venv && .venv/bin/pip install -e .

claude mcp add --scope user multi-llm \
  -e OPENROUTER_API_KEY=<your-key> \
  -- /path/to/multi-llm/mcp/.venv/bin/python3 -m consult_mcp
```

See: [Multi-LLM Guide](docs/multi-llm-guide.md)

### Self-Improving Meta-Agent (`/kai`)

Kai detects recurring patterns in accumulated learnings and proposes permanent SKILL.md updates — with human approval before any changes are applied.

```bash
/kai analyze                    # Scan learnings for patterns
/kai propose                    # Generate SKILL.md update proposals
/kai list --status pending      # Review pending proposals
/kai approve <ID>               # Approve a proposal
/kai apply <ID>                 # Apply to SKILL.md files
/kai status                     # Summary of all proposals
```

**Pipeline:** `learnings` → pattern detection → proposal generation → quality validation → human approval → SKILL.md update → re-ingest to Qdrant.

See: [Kai Guide](docs/kai-guide.md)

---

## Migration Between Laptops

Two scripts to move the entire framework (repo + skills + Qdrant data + MCP config) between machines:

```bash
# On source laptop — creates a single archive
./migrate-pack.sh
# → ai-dev-team-migration-20260319-143022.tar.gz

# Copy archive to new laptop, then:
./migrate-unpack.sh ai-dev-team-migration-20260319-143022.tar.gz
# Installs to current directory by default

# Or specify a target:
./migrate-unpack.sh archive.tar.gz --repo-dir ~/projects/ai-dev-team
```

**What `migrate-pack.sh` archives:**
- The ai-dev-team repository (excluding venvs, caches)
- `~/.claude/` config (skills, commands, templates, CLAUDE.md, settings)
- Project memory files
- Qdrant Docker volume data (if Qdrant is running)

**What `migrate-unpack.sh` does:**
1. Pre-flight check (Docker, Python 3.11+, Claude Code CLI)
2. Restore repo to target directory
3. **Merge** skills/commands into `~/.claude/` (keeps your extra agents, updates shared ones)
4. Start Qdrant and restore data
5. Create Python venvs and install dependencies
6. Prompt for API keys and register MCP servers

Your existing agents on the new laptop are preserved — the unpack script uses `rsync` merge (adds and updates, never deletes).

---

## Repository Structure

```
ai-dev-team/
├── README.md                     # This file
├── CLAUDE.md                     # Repo-level instructions for Claude Code
├── install.sh                    # Interactive installer
├── migrate-pack.sh               # Pack for migration
├── migrate-unpack.sh             # Unpack on new laptop
│
├── claude/                       # Deployable content (installs to ~/.claude/)
│   ├── CLAUDE.md                 # Global instructions (TDD, approval gates)
│   ├── TEAM_WORKFLOW.md          # Complete team workflow spec
│   ├── skills/                   # 29 SKILL.md files (15-agent core + specialists; stacks as references)
│   ├── commands/                 # 37 slash command definitions
│   ├── templates/                # 6 document templates
│   │
│   └── rag/                      # RAG Knowledge Base system
│       ├── docker-compose.yml    # Qdrant v1.13.2
│       ├── mcp-server/           # Custom MCP server (FastMCP, 4 tools)
│       ├── ingestion/            # SKILL.md → Qdrant pipeline
│       ├── context-cache/        # Session persistence (PreCompact/SessionStart hooks)
│       ├── kai/                  # Self-improving meta-agent
│       └── management/           # Admin: stats, backup, prune, reindex
│
├── multi-llm/                    # Multi-LLM consultation system
│   └── mcp/                      # MCP server (FastMCP, 3 tools, 9 models)
│
└── docs/                         # Extended documentation
    ├── TEAM_WORKFLOW.md
    ├── multi-llm-guide.md
    ├── kai-guide.md
    ├── context-persistence-guide.md
    ├── knowledge-management-guide.md
    ├── skill-extension-guide.md
    ├── agent-communication.md
    └── rag-setup/                # Setup, management, embedding providers
```

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
| Python | For RAG/Multi-LLM only | 3.11+ |
| Docker | For RAG only | Latest |
| [Voyage AI API key](https://dash.voyageai.com/) | For RAG only | Free tier works |
| [OpenRouter API key](https://openrouter.ai/) | For Multi-LLM only | Pay-per-use |

The core framework (15-agent core team + optional specialists) works with just Claude Code — no additional dependencies.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Team Workflow](docs/TEAM_WORKFLOW.md) | Complete phase-by-phase development process |
| [RAG Setup](docs/rag-setup/setup-guide.md) | Install Qdrant, MCP server, ingest skills |
| [Knowledge Management](docs/knowledge-management-guide.md) | Collections, data lifecycle, search patterns |
| [Context Persistence](docs/context-persistence-guide.md) | Session hooks, distillation pipeline |
| [Multi-LLM Guide](docs/multi-llm-guide.md) | `/all` command, model registry, API setup |
| [Kai Guide](docs/kai-guide.md) | Self-improving meta-agent, proposals workflow |
| [Skill Extension](docs/skill-extension-guide.md) | Adding new technologies and agents |
| [Agent Communication](docs/agent-communication.md) | Handoff specs, artifact flow between agents |
| [RAG Management](docs/rag-setup/management.md) | Backup, prune, reindex, troubleshooting |
| [Embedding Providers](docs/rag-setup/embedding-providers.md) | Voyage AI vs Gemini comparison |

---

## Testing

The RAG platform includes 203+ tests:

```bash
# Activate the RAG venv
cd claude/rag/mcp-server && source .venv/bin/activate

# Run all test suites
pytest                              # 20 MCP server tests
pytest ../ingestion/tests/          # 20 ingestion pipeline tests
pytest ../context-cache/tests/      # 75 context persistence tests
pytest ../kai/tests/                # 88 Kai meta-agent tests

# Multi-LLM tests (separate venv)
cd ../../../multi-llm/mcp
source .venv/bin/activate && pytest
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 4.1.0 | 2026-02-24 | Kai meta-agent, multi-LLM consultation, context persistence, RAG knowledge base, migration scripts |
| 4.0.0 | 2025-01-02 | Restructured for easy `~/.claude` deployment, installer |
| 3.1.0 | 2024-12-27 | Approval gates, Aura design verification |
| 3.0.0 | 2024-12-26 | TDD workflow, unified QA agents |
| 2.0.0 | 2024-12-25 | Performance testing modules |
| 1.0.0 | 2024-12-23 | Initial release with 15 agents |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Install in dev mode: `./install.sh --link`
4. Make changes to skills in `claude/skills/`
5. Run tests if modifying RAG/Multi-LLM code
6. Submit a pull request

See [Skill Extension Guide](docs/skill-extension-guide.md) for detailed contribution guidelines.

---

## License

MIT License — See [LICENSE](LICENSE) file for details.
