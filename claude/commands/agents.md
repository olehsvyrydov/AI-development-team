---
description: List all available AI Development Team agents and their specializations
---

# AI Development Team — Agent Directory

> **Two-tier roster.** A **core team** (15) you'll use on most work, plus **optional specialists** loaded when a task needs them. **Technology stacks are not separate agents** — a role agent (e.g. `/be`) detects the project's stack and loads the matching `references/<stack>.md`. So "build a FastAPI endpoint" still routes to `/be`.
>
> **Naming:** role commands (`/arch`, `/be`, `/fe`) are standard; persona aliases (`/jorge`, `/james`, `/finn`) invoke the same agent.

## Core team (15)

| Role Command | Alias | Name | Role | Stacks / specializations (as references) |
|---|---|---|---|---|
| `/po` | `/max` | Max | Product Owner — vision, backlog, Epics | — |
| `/ba` | `/anna` | Anna | Business Analyst — research, requirements | — |
| `/sm` | `/luda` | Luda | Scrum Master — board integrity, retrospection | — |
| `/arch` | `/jorge` | Jorge | Solution Architect (**MANDATORY** gate) | GraphQL |
| `/secops` | `/soren` | Soren | Security Engineer (**MANDATORY** gate) | — |
| `/fe` | `/finn` | Finn | Frontend Developer | React/Next (default), Angular, Vue, Flutter, JavaFX desktop |
| `/be` | `/james` | James | Backend Developer | Java/Spring (default), Kotlin, Python/FastAPI, PHP/Laravel, Quarkus, Kafka, HMRC MTD |
| `/rev` | — | Rev | Code Reviewer | backend (Java/Kotlin), frontend (TS/React), PHP |
| `/qa` | `/rob` | Rob | Test Designer — test cases, BDD specs | — |
| `/e2e` | `/adam` | Adam | E2E Automation — Playwright | Cucumber/BDD |
| `/ui` | `/aura` | Aura | UI/UX Designer — design systems | JavaFX desktop design |
| `/devops` | — | — | DevOps Engineer — IaC, CI/CD, K8s | Terraform/OpenTofu |
| `/legal` | `/alex` | Alex | Legal Counsel — contracts, GDPR, risk | UK / English & Welsh law (persona Alex) |
| `/fin` | `/inga` | Inga | Accountant & CFO — tax, VAT, forecasting | UK tax (persona Inga), UK self-employment |
| `/mkt` | `/apex` | Apex | Marketing — GTM, positioning | — |


## Cross-cutting skills (no persona — load by name when the situation matches)

These are process skills rather than roles. They are picked up automatically from their descriptions, but can be invoked directly.

| Skill | Load it when |
|---|---|
| `workflow-engine` | Any development task, and before every handoff — decides which gates apply |
| `fid-lifecycle` | Moving work between Backlog → investigation → design doc/epic → tickets → Done; creating an epic; adding a ticket to an existing epic |
| `verify-landed` | After any behaviour-changing edit, and before claiming a finding fixed or a criterion met |
| `review-tier` | Before spending a multi-agent code review — decides how much review to buy and scopes it |
| `model-selection` | Before launching subagents or a workflow; whenever about to spend a strong model on volume |
| `research-method` | A question needs measuring rather than deciding; designing an experiment; writing up a result |

## Optional specialists (load on demand)

| Command | Agent | Domain |
|---|---|---|
| `/ai` | ai-engineer | LLM product features: RAG, agents, prompts, evals, guardrails |
| `/data` | data-engineer | Analytics pipelines: ETL/ELT, dbt, warehouse, streaming |
| `/dba` | dba | OLTP databases: schema, indexing, query tuning, migrations |
| `/sre` | sre-engineer | Reliability: SLOs, observability, incidents (owns `RELIABILITY_OK`) |
| — | mlops-engineer | ML/inference infra: model serving, pipelines, cost |
| `/ux` | ux-researcher | User research: interviews, usability, IA, personas |
| `/perf` | performance-engineer | Web Vitals, profiling, budgets, load testing (owns `PERF_OK`) |
| `/ios` `/android` | native-mobile-developer | Native iOS (Swift/SwiftUI) & Android (Kotlin/Compose) |
| `/ext` | browser-extension-developer | Browser extensions: MV3 manifest & permissions, service worker, injection, tabs/groups |
| `/verify` | verify | QA Auditor — completeness + workflow gates (`APPROVAL_GATE`, `VERIFIED`) |
| `/kai` | kai | Self-improving meta-agent (`/retro` learnings → skill updates) |
| — | technical-writer | C4 diagrams, ADRs, API docs, READMEs |
| — | backend-tester | Backend unit/integration TDD (JUnit, Testcontainers) |
| — | frontend-tester | Frontend unit/integration (Vitest, RTL) |

## Stacks & specializations live as references (not agents)

Folded into their parent role's `references/` — the role agent self-routes to them:

| Parent | References |
|---|---|
| `/fe` | `angular.md`, `vue.md`, `flutter.md`, `javafx-desktop/` |
| `/be` | `kotlin.md`, `fastapi.md`, `laravel.md`, `quarkus.md`, `spring-kafka.md`, `hmrc-api/` |
| `/rev` | `backend-review.md`, `frontend-review.md`, `php-review.md` |
| `/e2e` | `cucumber-bdd.md` |
| `/arch` | `graphql.md` |
| `/devops` | `terraform.md` |
| `/ui` | `javafx-design/` |
| `/legal` | `uk/` |
| `/fin` | `uk/`, `uk-self-employment.md` |

## Additional Commands

| Command | Description |
|---|---|
| `/bug` or `/issue` | Report a bug — triggers investigation workflow |
| `/retro` | Run a retrospective; capture reusable learnings to `.aidevteam/learnings/` |
| `/kai` | Propose `SKILL.md` updates from recurring learnings — human-approved (file-based; RAG optional) |
| `/design-sprint` | Orchestrate UI design → frontend implementation |
| `/reviewer` | Alias for `/rev` · `/tester` alias for `/qa` |
| `/agents` | This directory |

## Workflow

```
/po+/ba -> /arch -> /secops -> [/fin] -> [/legal] -> [/ui] -> /fe|/be -> /rev -> /qa + /e2e -> /verify
```
All gating is proportional and enforced by the `workflow-engine` skill. See `claude/skills/disambiguation.md` to pick the right agent when domains overlap.

## Skill Locations

- **User-level** (global): `~/.claude/skills/`
- **Project-level**: `.claude/skills/` (overrides user skills with the same name)
