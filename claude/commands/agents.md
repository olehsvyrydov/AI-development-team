---
description: List all available AI Development Team agents and their specializations
---

# AI Development Team - Agent Directory

> **Both naming conventions are supported.** Role-based commands (`/arch`, `/be`, `/fe`) are the standard. Persona aliases (`/jorge`, `/james`, `/finn`) are team-specific names that invoke the same agent.

## Quick Reference

| Role Command | Alias | Name | Role |
|-------------|-------|------|------|
| `/po` | `/max` | Max | Product Owner - vision, backlog, Epics |
| `/sm` | `/luda` | Luda | Scrum Master - orchestration, ceremonies |
| `/ba` | `/anna` | Anna | Business Analyst - research, requirements |
| `/arch` | `/jorge` | Jorge | Solution Architect - architecture (**MANDATORY**) |
| `/secops` | `/soren` | Soren | Security Engineer - security (**MANDATORY**) |
| `/fin` | `/inga` | Inga | UK Accountant - finance, tax, VAT |
| `/legal` | `/alex` | Alex | UK Legal Counsel - compliance, GDPR |
| `/ui` | `/aura` | Aura | UI/UX Designer - design systems |
| `/fe` | `/finn` | Finn | Frontend Dev - React/TS/Next.js |
| `/be` | `/james` | James | Backend Dev - Java/Spring Boot |
| `/rev` | — | Rev | Code Reviewer - quality, security |
| `/qa` | `/rob` | Rob | QA Engineer - test cases, manual testing |
| `/e2e` | `/adam` | Adam | E2E Tester - Playwright, performance |
| `/mkt` | `/apex` | Apex | Marketing - GTM, positioning |

## Additional Commands

| Command | Description |
|---------|-------------|
| `/bug` or `/issue` | Report a bug — triggers investigation workflow |
| `/design-sprint` | Orchestrate UI design -> frontend implementation |
| `/reviewer` | Alias for `/rev` |
| `/tester` | Alias for `/qa` |
| `/agents` | This directory |

---

## Core Agents (18)

### Development Team

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **backend-developer** | Spring Boot 4, Java 25, WebFlux, JPA | Backend APIs, microservices, database |
| **frontend-developer** | React 19, TypeScript 5.8, Zustand, TanStack | UI components, state management, SPA |
| **devops-engineer** | Kubernetes, GKE, Helm, CI/CD, Docker | Deployment, infrastructure, pipelines |
| **solution-architect** | System design, CQRS, Saga, Event Sourcing | Architecture decisions, patterns, ADRs |
| **mlops-engineer** | Spring AI, LLM integration, Gemini, OpenAI | AI features, prompt engineering, ML ops |

### Quality Assurance Team

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **backend-tester** | JUnit 6, Mockito, Testcontainers, StepVerifier | Java unit/integration tests, TDD |
| **frontend-tester** | Vitest, React Testing Library, MSW | React component tests, hook tests |
| **e2e-tester** | Playwright, cross-browser, visual testing | End-to-end tests, user flows |
| **backend-reviewer** | Checkstyle, SpotBugs, SonarQube | Java code review, quality gates |
| **frontend-reviewer** | ESLint, Prettier, accessibility | React/TS code review, a11y |

### Security & Operations

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **secops-engineer** | OWASP Top 10:2025, Threat Modeling, OAuth 2.1, Supply Chain, Zero Trust, AI/LLM Security | Security reviews, threat modeling, auth, compliance |
| **technical-writer** | C4 diagrams, ADRs, API docs, Mermaid | Documentation, changelogs, README |

### Design

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **ui-designer** | React, Tailwind v4, Framer Motion, Design Systems | Landing pages, dashboards, mobile UI, brand design |

### Product & Process

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **product-owner** | User stories, backlog, prioritization | Sprint planning, acceptance criteria |
| **scrum-master** | Agile ceremonies, orchestration, retrospectives | Sprint management, blockers |
| **business-analyst** | SWOT, market research, requirements | Competitive analysis, BRDs |

### Legal & Compliance

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **uk-legal-counsel** | UK Law, GDPR, Employment, Contracts, Penalties | Legal advice, contracts, compliance, risk |

### Finance & Accounting

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **uk-accountant** | Corporation Tax, VAT, PAYE, R&D Credits, IR35, UK GAAP | Tax planning, financial forecasting, compliance |

### Marketing

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **apex** | Go-To-Market, Positioning, Growth Funnels, SEO | Product launches, marketing strategy |

---

## Extended Skills (15)

Specialized skills that extend core agents:

### Frontend Extensions (extend frontend-developer)

| Skill | Specialization |
|-------|----------------|
| **angular-developer** | Angular 21, Signals, NgRx SignalStore, zoneless |
| **vue-developer** | Vue 3, Composition API, Pinia, Nuxt 3 |
| **flutter-developer** | Flutter 3.27, Dart 3.6, Riverpod, cross-platform |

### Backend Extensions (extend backend-developer)

| Skill | Specialization |
|-------|----------------|
| **kotlin-developer** | Kotlin 2.1, Coroutines, Ktor, KMP |
| **spring-kafka-integration** | Kafka producers/consumers, Reactor Kafka, DLT |
| **quarkus-developer** | Quarkus 3.17, native builds, Panache, GraalVM |
| **fastapi-developer** | FastAPI, Python async, Pydantic, SQLAlchemy |
| **hmrc-api-specialist** | MTD API, OAuth2 Gov Gateway, SA103 |

### Desktop Extensions

| Skill | Specialization |
|-------|----------------|
| **javafx-developer** | JavaFX 21+, FXML, MVVM, Scene Builder |
| **javafx-designer** | JavaFX CSS styling, Ikonli icons, component design |

### DevOps Extensions (extend devops-engineer)

| Skill | Specialization |
|-------|----------------|
| **terraform-specialist** | Terraform 1.10, GCP provider, modules, state |

### Testing Extensions (extend e2e-tester)

| Skill | Specialization |
|-------|----------------|
| **cucumber-bdd** | Cucumber 7, Gherkin, BDD, living documentation |

### Architecture Extensions (extend solution-architect)

| Skill | Specialization |
|-------|----------------|
| **graphql-developer** | Apollo Server/Federation, DataLoader, subscriptions |

### Compliance Extensions

| Skill | Specialization |
|-------|----------------|
| **uk-self-employment** | SA103, Class 4 NI, allowable expenses, MTD |

---

## Workflow

```
/po+/ba -> /arch -> /secops -> [/fin] -> [/legal] -> [/ui] -> /fe|/be -> /rev -> /qa + /e2e
Vision+AC  Arch.   Security  Finance   Legal     Design  TDD Dev    Review  Testing
```

## Skill Locations

- **User-level** (global): `~/.claude/skills/`
- **Project-level**: `.claude/skills/`

Project skills override user skills with the same name.
