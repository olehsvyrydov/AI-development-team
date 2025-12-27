# AI Development Team

A reusable repository of specialized Claude Code skills that work together like a real software development team. Each "agent" has deep expertise, follows best practices, and can be invoked for specific tasks.

## Team Overview

```
                              MANAGEMENT LAYER
           ┌─────────────────────┬─────────────────────┐
           │                     │                     │
    ┌──────▼──────┐      ┌───────▼───────┐     ┌──────▼──────┐
    │   PRODUCT   │      │    SCRUM      │     │  BUSINESS   │
    │    OWNER    │      │   MASTER      │     │  ANALYST    │
    └──────┬──────┘      └───────┬───────┘     └──────┬──────┘
           └─────────────────────┼─────────────────────┘
                                 │
                        ARCHITECTURE LAYER
                      ┌──────────▼──────────┐
                      │     SOLUTION        │
                      │    ARCHITECT        │
                      └──────────┬──────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼───────┐    ┌─────────▼────────┐    ┌─────────▼────────┐
│    BACKEND     │    │    FRONTEND      │    │     DEVOPS       │
│   DEVELOPER    │    │   DEVELOPER      │    │    ENGINEER      │
└───────┬────────┘    └────────┬─────────┘    └────────┬─────────┘
        │                      │                       │
        │   QUALITY LAYER      │                       │
        ▼                      ▼                       ▼
┌───────────────┐      ┌───────────────┐       ┌───────────────┐
│    BACKEND    │      │   FRONTEND    │       │    SECOPS     │
│   REVIEWER    │      │   REVIEWER    │       │   ENGINEER    │
└───────┬───────┘      └───────┬───────┘       └───────────────┘
        ▼                      ▼
┌───────────────┐      ┌───────────────┐       ┌───────────────┐
│    BACKEND    │      │   FRONTEND    │       │     E2E       │
│    TESTER     │      │    TESTER     │       │    TESTER     │
└───────────────┘      └───────────────┘       └───────────────┘

                         SPECIALIZED LAYER
      ┌──────────────┬──────────────┬──────────────┐
      │              │              │              │
┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
│   MLOPS   │  │ TECHNICAL │  │    UI     │  │           │
│  ENGINEER │  │   WRITER  │  │  DESIGNER │  │  (more)   │
└───────────┘  └───────────┘  └───────────┘  └───────────┘
```

---

## Installation

### Prerequisites

- [Claude Code CLI](https://claude.ai/code) installed and configured
- Git

### Option 1: Global Installation (Recommended)

Install all agents at the user level so they're available in **every project**:

```bash
# Clone the repository
git clone https://github.com/olehsvyrydov/AI-development-team.git
cd AI-development-team

# Copy all skills to user-level Claude directory
cp -r .claude/skills/* ~/.claude/skills/

# Copy the /agents command
mkdir -p ~/.claude/commands
cp .claude/commands/agents.md ~/.claude/commands/

# Verify installation
ls ~/.claude/skills/
ls ~/.claude/commands/
```

After installation, you can use `/agents` command in any project to see all available agents.

> **Note:** Skills (in `.claude/skills/`) are model-invoked (Claude decides when to use them).
> Commands (in `.claude/commands/`) are user-invoked (you type `/command` directly).

#### What Gets Installed

```
~/.claude/
├── commands/
│   └── agents.md              # /agents command - shows all agents
│
└── skills/
    ├── backend-developer/     # Core agent
    ├── frontend-developer/    # Core agent
    ├── devops-engineer/       # Core agent
    ├── solution-architect/    # Core agent
    ├── ...                    # (18 core agents total)
    ├── angular-developer/     # Extended skill
    ├── vue-developer/         # Extended skill
    ├── spring-kafka-integration/  # Extended skill
    └── ...                    # (10 extended skills total)
```

#### Updating Skills

To update your global skills to the latest version:

```bash
cd AI-development-team
git pull origin main
cp -r .claude/skills/* ~/.claude/skills/
cp .claude/commands/agents.md ~/.claude/commands/
```

### Option 2: Project-Level Installation

Install skills for a specific project only:

```bash
# In your project root
git clone https://github.com/olehsvyrydov/AI-development-team.git .ai-team

# Copy skills to project's Claude directory
mkdir -p .claude/skills
cp -r .ai-team/.claude/skills/* .claude/skills/

# Optional: remove the cloned repo
rm -rf .ai-team
```

### Option 3: Clone as Submodule

Add this repository as a git submodule to your project:

```bash
# In your project root
git submodule add https://github.com/olehsvyrydov/AI-development-team.git .ai-team

# Initialize submodule (for cloning existing repos)
git submodule update --init --recursive
```

Then reference the skills in your project's `CLAUDE.md`:

```markdown
# CLAUDE.md

## AI Team Skills

This project uses the AI Development Team for development assistance.
Skills are located in `.ai-team/skills/`.

### Available Skills
See `.ai-team/README.md` for the full list of available agents.
```

### Option 2: Copy Skills Directly

Copy only the skills you need to your project:

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ai-dev-team.git

# Copy specific skills to your project
cp -r ai-dev-team/skills/development/backend-developer.md your-project/.claude/skills/
cp -r ai-dev-team/skills/quality/backend-tester.md your-project/.claude/skills/
```

### Option 3: Reference Remotely

Add this to your project's `CLAUDE.md`:

```markdown
## External Skills Repository

For specialized agent skills, reference:
https://github.com/olehsvyrydov/AI-development-team

Clone locally and use skills as needed.
```

---

## Usage

### How to Invoke Agents

There are four ways to use the AI agents:

#### 0. List All Agents

Use the `/agents` command to see all available agents and their specializations:

```
/agents
```

This displays the full agent directory with core agents, extended skills, and how they work together.

#### 1. Explicit Skill Invocation

Use the `/skill-name` pattern to explicitly invoke an agent:

```
/backend-developer implement user authentication with JWT
/solution-architect design the database schema for user management
/backend-reviewer review the UserService.java file
/scrum-master create sprint plan for user authentication epic
```

#### 2. Context-Based Auto-Detection

Simply describe what you need, and Claude will select the appropriate agent:

```
"I need to implement a REST API for user registration"
→ Claude invokes backend-developer

"Review this code for security issues"
→ Claude invokes backend-reviewer + secops-engineer

"Create user stories for the payment feature"
→ Claude invokes product-owner
```

#### 3. Multi-Agent Workflows

For complex tasks, chain multiple agents:

```
"Implement and test user authentication"
→ solution-architect (design)
→ backend-developer (implement)
→ backend-tester (test)
→ backend-reviewer (review)
→ technical-writer (document)
```

### Core Agents (18 Total)

| # | Agent | Skill Name | When to Use |
|---|-------|------------|-------------|
| 1 | **Product Owner (Max)** | `product-owner` | User stories, backlog, acceptance criteria |
| 2 | Scrum Master | `scrum-master` | Sprint planning, retrospectives, velocity |
| 3 | Business Analyst | `business-analyst` | Market research, requirements, SWOT analysis |
| 4 | Solution Architect | `solution-architect` | System design, ADRs, technology decisions |
| 5 | Backend Developer | `backend-developer` | Spring Boot, Java, APIs, business logic |
| 6 | Frontend Developer | `frontend-developer` | React, Next.js, React Native, UI |
| 7 | **UI/UX Designer (Aura)** | `ui-designer` | Landing pages, design systems, mobile UI, brand design |
| 8 | Backend Reviewer | `backend-reviewer` | Java code review, quality, style |
| 9 | Frontend Reviewer | `frontend-reviewer` | TypeScript review, ESLint, a11y |
| 10 | Backend Tester | `backend-tester` | JUnit, Testcontainers, integration tests |
| 11 | Frontend Tester | `frontend-tester` | Jest, React Testing Library |
| 12 | E2E Tester | `e2e-tester` | Playwright, Detox, user flows |
| 13 | DevOps Engineer | `devops-engineer` | Terraform, Kubernetes, CI/CD |
| 14 | SecOps Engineer | `secops-engineer` | Security, OWASP, GDPR, auth |
| 15 | MLOps Engineer | `mlops-engineer` | AI/ML integration, LLM orchestration |
| 16 | Technical Writer | `technical-writer` | Documentation, C4 diagrams, changelogs |
| 17 | **UK Legal Counsel (Alex)** | `uk-legal-counsel` | UK law, contracts, GDPR, employment, compliance, penalties |
| 18 | **UK Accountant (Inga)** | `uk-accountant` | Tax planning, VAT, R&D credits, financial forecasting, IR35 |

### Extended Skills (10 Total)

Extended skills provide specialized expertise and are automatically invoked alongside their parent agent:

| Extended Skill | Extends | Specialization |
|----------------|---------|----------------|
| `kotlin-developer` | backend-developer | Kotlin 2.1, Coroutines, Ktor, KMP |
| `angular-developer` | frontend-developer | Angular 21, Signals, NgRx SignalStore |
| `vue-developer` | frontend-developer | Vue 3, Composition API, Pinia, Nuxt 3 |
| `flutter-developer` | frontend-developer | Flutter 3.27, Dart 3.6, Riverpod |
| `spring-kafka-integration` | backend-developer | Kafka, Reactor Kafka, Event-driven |
| `quarkus-developer` | backend-developer | Quarkus 3.17, GraalVM native builds |
| `fastapi-developer` | backend-developer | FastAPI, Python async, Pydantic |
| `terraform-specialist` | devops-engineer | Terraform 1.10, GCP, modules |
| `cucumber-bdd` | e2e-tester | Cucumber 7, Gherkin, BDD |
| `graphql-developer` | solution-architect | Apollo Federation, DataLoader |

### How Skill Hierarchy Works

```
Task: "Build Angular dashboard with Kafka real-time updates"
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│ frontend │  │ backend  │  │  solution    │
│developer │  │developer │  │  architect   │
└────┬─────┘  └────┬─────┘  └──────────────┘
     │             │
     ▼             ▼
┌──────────┐  ┌───────────────────┐
│ angular  │  │ spring-kafka      │
│developer │  │ integration       │
└──────────┘  └───────────────────┘
```

Each core agent has a **Related Skills** section that references other agents for cross-cutting concerns, enabling automatic skill chaining.

### Example Workflows

#### Starting a New Feature

```
1. /product-owner "Create user stories for payment integration"
2. /solution-architect "Design payment integration architecture"
3. /backend-developer "Implement Stripe payment service"
4. /backend-tester "Write tests for payment service"
5. /backend-reviewer "Review payment service implementation"
6. /technical-writer "Document payment API"
```

#### Code Review

```
/backend-reviewer "Review src/main/java/com/example/PaymentService.java"
```

#### Sprint Planning

```
/scrum-master "Plan sprint 5 with payment and notification features"
```

#### Security Audit

```
/secops-engineer "Audit the authentication module for security issues"
```

---

## Agent Expertise Summary

### Management Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| Product Owner (Max) | INVEST criteria, MoSCoW, user story mapping, OKRs |
| Scrum Master | Scrum framework, Kanban, velocity tracking, retrospectives |
| Business Analyst | SWOT, Porter's Five Forces, BPMN, web research |

### Architecture Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| Solution Architect | C4 model, Saga, CQRS, Event Sourcing, Outbox pattern, ADRs |

### Development Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| Backend Developer | Spring Boot 4, Java 25, WebFlux, R2DBC, TDD |
| Frontend Developer | Next.js 15, React 19, React Native, Expo SDK 52, TypeScript 5 |
| UI/UX Designer (Aura) | React, Tailwind CSS 4, Framer Motion, Atomic Design, WCAG 2.1 |

### Quality Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| Backend Reviewer | Checkstyle 12.3, SpotBugs 4.8, SonarQube 10, Google Java Style |
| Frontend Reviewer | ESLint 9, Prettier 3, TypeScript strict, WCAG 2.1 AA |
| Backend Tester | JUnit 6, Mockito 5, Testcontainers, StepVerifier |
| Frontend Tester | Jest, React Testing Library, MSW |
| E2E Tester | Playwright, Detox, visual regression |

### Operations Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| DevOps Engineer | Terraform 1.6+, GKE Autopilot, Helm 3, GitHub Actions |
| SecOps Engineer | JWT RS256, OWASP Top 10, GDPR, Spring Security 6 |
| MLOps Engineer | Spring AI, Gemini, OpenAI, Groq, multi-provider fallback |

### Documentation Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| Technical Writer | C4 model, Mermaid diagrams, Diátaxis, API documentation |

### Legal & Compliance Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| UK Legal Counsel (Alex) | English & Welsh Law, GDPR, Employment Rights Act, Companies Act, Contract Law |

### Financial Layer
| Agent | Key Technologies & Knowledge |
|-------|------------------------------|
| UK Accountant (Inga) | Corporation Tax, VAT, PAYE, R&D Tax Credits, IR35, UK GAAP, HMRC Compliance |

### Visual Inspection Capability

8 frontend-related agents have **MCP Browser/Playwright** integration for visual inspection and screenshot capabilities:

| Agent | Visual Workflows |
|-------|------------------|
| Frontend Developer | Debug UI issues, responsive testing, component verification |
| Frontend Tester | Screenshot baselines, multi-device testing, console error detection |
| Frontend Reviewer | Accessibility audits, semantic HTML analysis, color contrast |
| E2E Tester | Visual regression, cross-device validation |
| UI/UX Designer (Aura) | Design verification, responsive breakpoint testing, animation preview |
| Angular Developer | Zoneless verification, Angular Material testing |
| Vue Developer | Pinia state verification, Nuxt SSR testing |
| Flutter Developer | Flutter Web inspection, Material 3 theming |

**Device Simulation**: 143+ device presets including iPhone, iPad, Android phones/tablets, and Desktop browsers.

**Available Actions**:
- `playwright_navigate` - Open URLs
- `playwright_screenshot` - Capture full page or elements
- `playwright_get_visible_html` - Inspect DOM structure
- `playwright_console_logs` - Debug JavaScript errors
- `playwright_resize` - Test responsive layouts
- `playwright_click`, `playwright_fill` - Test interactions

---

## Quality Standards

All agents enforce these standards:

| Standard | Target |
|----------|--------|
| TDD | Tests before implementation |
| Unit test coverage | >80% |
| Integration test coverage | >60% |
| Security | OWASP Top 10 prevention |
| Code style | Google Java / Airbnb JS |
| Documentation | Always current |

---

## Templates

Use the templates in `/templates/` for consistent documentation:

- **sprint-template.md** - Sprint planning and tracking
- **user-story-template.md** - User stories with acceptance criteria
- **adr-template.md** - Architecture Decision Records
- **code-review-template.md** - Structured code review feedback

---

## Extending Skills

Want to add new technologies to existing agents? See the **[Skill Extension Guide](docs/skill-extension-guide.md)**.

### Common Extensions

| I want to add... | Extend this agent | Section to add |
|------------------|-------------------|----------------|
| Angular | Frontend Developer | Angular Ecosystem |
| Vue.js | Frontend Developer | Vue.js Ecosystem |
| Quarkus | Backend Developer | Quarkus Framework |
| Go/Golang | (Create new agent) | Backend Developer - Go |
| MongoDB | Backend Developer | NoSQL Databases |
| AWS | DevOps Engineer | AWS Services |

### Quick Extension Example

To add Angular support, edit `skills/development/frontend-developer.md`:

```markdown
### Angular Ecosystem (add under Expertise)

- **Angular 18+**: Standalone components, signals
- **Angular Material**: Component library
- **NgRx**: Signal-based state management
- **Angular Universal**: Server-side rendering
```

---

## Adding New Agents

1. Create skill file in appropriate category folder
2. Follow the skill template structure (see [Skill Extension Guide](docs/skill-extension-guide.md))
3. Add to README table
4. Test with sample tasks

### Skill Template Structure

```markdown
# Agent Name

## Trigger
Use this skill when: ...

## Context
You are a Senior ... with X years experience...

## Expertise
### Area 1
- Technology 1
- Technology 2

## Standards
- Standard 1
- Standard 2

## Templates
[Code or document templates]

## Checklist
- [ ] Check 1
- [ ] Check 2

## Anti-Patterns to Avoid
1. Anti-pattern 1
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add or improve agents
4. Submit a pull request

---

## License

MIT - Use freely in your projects.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.6.0 | 2025-12-27 | Added UK Accountant (Inga/Ledger-AI) as 18th core agent |
| 1.5.0 | 2025-12-27 | Added UK Legal Counsel (Alex/Legis-AI) as 17th core agent |
| 1.4.0 | 2025-12-26 | Added kotlin-developer extended skill with Coroutines, Ktor, KMP expertise |
| 1.3.0 | 2025-12-26 | Added Visual Inspection (MCP Browser/Playwright) to 8 frontend agents |
| 1.2.0 | 2025-12-24 | Added UI/UX Designer (Aura) as 16th agent |
| 1.1.0 | 2025-12-24 | Added hierarchical skill structure, /agents command, global installation |
| 1.0.0 | 2025-12-23 | Initial release with 15 agents |

---

*Created by: AI Development Team Project*
*Repository: https://github.com/olehsvyrydov/AI-development-team*
