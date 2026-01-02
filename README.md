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
    │     /po     │      │     /sm       │     │    /ba      │
    └──────┬──────┘      └───────┬───────┘     └──────┬──────┘
           └─────────────────────┼─────────────────────┘
                                 │
                        ARCHITECTURE LAYER
                      ┌──────────▼──────────┐
                      │     SOLUTION        │
                      │    ARCHITECT        │
                      │       /arch         │
                      └──────────┬──────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼───────┐    ┌─────────▼────────┐    ┌─────────▼────────┐
│    BACKEND     │    │    FRONTEND      │    │     DEVOPS       │
│   DEVELOPER    │    │   DEVELOPER      │    │    ENGINEER      │
│      /be       │    │      /fe         │    │                  │
└───────┬────────┘    └────────┬─────────┘    └────────┬─────────┘
        │                      │                       │
        │   QUALITY LAYER      │                       │
        ▼                      ▼                       ▼
┌───────────────┐      ┌───────────────┐       ┌───────────────┐
│     CODE      │      │   UI/UX       │       │    SECOPS     │
│   REVIEWER    │      │   DESIGNER    │       │   ENGINEER    │
│     /rev      │      │     /ui       │       │               │
└───────┬───────┘      └───────┬───────┘       └───────────────┘
        ▼                      ▼
┌───────────────┐      ┌───────────────┐
│  QA / TEST    │      │     E2E       │
│   DESIGNER    │      │    TESTER     │
│     /qa       │      │     /e2e      │
└───────────────┘      └───────────────┘

                         COMPLIANCE LAYER
      ┌──────────────┬──────────────┬──────────────┐
      │              │              │              │
┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
│ACCOUNTANT │  │   LEGAL   │  │ MARKETING │  │ TECHNICAL │
│   /fin    │  │  /legal   │  │   /mkt    │  │  WRITER   │
└───────────┘  └───────────┘  └───────────┘  └───────────┘
```

---

## Quick Start

### Installation (One Command)

```bash
# Clone and install
git clone https://github.com/your-org/ai-dev-team.git
cd ai-dev-team
./install.sh
```

The installer will:
- Detect existing `~/.claude` directory
- Offer merge or replace options
- Backup existing configuration if replacing
- Install all skills, commands, and templates

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/your-org/ai-dev-team.git
cd ai-dev-team

# Copy to ~/.claude
cp -r claude/* ~/.claude/
```

### Verify Installation

```bash
# List installed skills
ls ~/.claude/skills/

# List commands
ls ~/.claude/commands/

# In Claude Code, try:
/agents
```

---

## What Gets Installed

```
~/.claude/
├── CLAUDE.md                    # Global instructions (TDD, workflow)
├── TEAM_WORKFLOW.md             # Complete team workflow documentation
│
├── skills/                      # 33 AI agent skills
│   ├── management/              # Product Owner, Scrum Master, Business Analyst
│   ├── architecture/            # Solution Architect, GraphQL Developer
│   ├── development/
│   │   ├── backend/             # Java, Kotlin, Python specialists
│   │   └── frontend/            # React, Angular, Vue, Flutter
│   ├── quality/
│   │   ├── review/              # Code reviewers
│   │   └── testing/             # QA, E2E, BDD testers
│   ├── operations/              # DevOps, SecOps, MLOps
│   ├── design/                  # UI/UX Designer
│   ├── compliance/              # Accountant, Legal (generic + UK)
│   ├── marketing/               # Product Marketing
│   └── specialized/             # Technical Writer
│
├── commands/                    # 16 slash commands
│   ├── agents.md                # /agents - list all agents
│   ├── po.md                    # /po - Product Owner
│   ├── sm.md                    # /sm - Scrum Master
│   ├── arch.md                  # /arch - Solution Architect
│   ├── fe.md                    # /fe - Frontend Developer
│   ├── be.md                    # /be - Backend Developer
│   ├── rev.md                   # /rev - Code Reviewer
│   ├── qa.md                    # /qa - QA/Test Designer
│   ├── e2e.md                   # /e2e - E2E Tester
│   ├── ui.md                    # /ui - UI Designer
│   ├── ba.md                    # /ba - Business Analyst
│   ├── fin.md                   # /fin - UK Accountant
│   ├── legal.md                 # /legal - UK Legal
│   ├── mkt.md                   # /mkt - Marketing
│   ├── bug.md                   # /bug - Report bugs
│   └── issue.md                 # /issue - Report issues
│
└── templates/                   # Document templates
    ├── adr-template.md
    ├── user-story-template.md
    ├── sprint-template.md
    ├── code-review-template.md
    └── investigation-report-template.md
```

---

## Agent Reference

### Core Agents (18)

| Command | Role | Expertise |
|---------|------|-----------|
| `/po` | Product Owner | Vision, backlog, user stories |
| `/sm` | Scrum Master | Sprints, AC, status tracking |
| `/ba` | Business Analyst | Research, requirements |
| `/arch` | Solution Architect | System design, patterns, ADRs |
| `/fe` | Frontend Developer | React, TypeScript, Next.js |
| `/be` | Backend Developer | Java, Spring Boot, APIs |
| `/rev` | Code Reviewer | Quality, security, style |
| `/qa` | QA Engineer | Test design, bug investigation |
| `/e2e` | E2E Tester | Playwright, Detox, performance |
| `/ui` | UI Designer | Design systems, prototypes |
| `/fin` | UK Accountant | Tax, VAT, R&D credits |
| `/legal` | UK Legal | GDPR, contracts, compliance |
| `/mkt` | Marketing | GTM, positioning, content |
| - | DevOps Engineer | Terraform, K8s, CI/CD |
| - | Security Engineer | OWASP, auth, security |
| - | ML Engineer | AI/ML, LLM integration |
| - | Technical Writer | Docs, diagrams, guides |
| - | Generic Accountant | Multi-jurisdiction finance |
| - | Generic Legal | Multi-jurisdiction legal |

### Extended Skills (14)

Technology-specific extensions that activate alongside core agents:

| Skill | Extends | Technology |
|-------|---------|------------|
| angular-developer | frontend-developer | Angular 21 |
| vue-developer | frontend-developer | Vue 3 |
| flutter-developer | frontend-developer | Flutter/Dart |
| kotlin-developer | backend-developer | Kotlin 2.1 |
| quarkus-developer | backend-developer | Quarkus |
| fastapi-developer | backend-developer | Python FastAPI |
| spring-kafka | backend-developer | Kafka integration |
| graphql-developer | solution-architect | GraphQL APIs |
| terraform-specialist | devops-engineer | Terraform/OpenTofu |
| cucumber-bdd | e2e-tester | BDD/Cucumber |
| backend-reviewer | reviewer | Java/Kotlin focus |
| frontend-reviewer | reviewer | TypeScript focus |
| backend-tester | tester | JUnit, Testcontainers |
| frontend-tester | tester | Jest, RTL |

---

## Workflow

### Development Sequence

```
/po → /sm → /arch → [/fin] → [/legal] → [/ui] → /fe|/be → /rev → /qa + /e2e
Vision  AC   Arch.   Finance  Legal    Design   TDD Dev   Review  Testing
```

### Approval Gates

| Gate | Agent | When Required |
|------|-------|---------------|
| Architecture | /arch | **ALWAYS** |
| Finance | /fin | Payments, billing, tax |
| Legal | /legal | GDPR, privacy, contracts |
| UI Design | /ui | Frontend features |

### Bug Workflow

```bash
/bug Login button doesn't work on mobile Safari
```

Creates structured bug report → Investigation → Reproduction test → TDD fix → Review → Tests

---

## Key Principles

### TDD (Mandatory)

All development follows Test-Driven Development:
1. Write tests first (RED)
2. Implement minimum code (GREEN)
3. Refactor (REFACTOR)

### Architecture First

ALL features require `/arch` approval before implementation.

### Developers Own Tests

- `/fe` and `/be` write unit and integration tests
- `/qa` designs test cases from acceptance criteria
- `/e2e` implements automated E2E and performance tests

---

## Installation Options

### Interactive Installation

```bash
./install.sh
```

### Command-Line Options

```bash
./install.sh --merge    # Merge with existing ~/.claude
./install.sh --replace  # Backup and replace ~/.claude
./install.sh --link     # Create symlink (for development)
./install.sh --help     # Show help
```

### Development Mode

For contributing to this repository:

```bash
./install.sh --link
```

This creates a symlink so changes in the repo are immediately reflected.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes to skills in `claude/skills/`
4. Test with `./install.sh --link`
5. Submit a pull request

See `docs/skill-extension-guide.md` for adding new technologies.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 4.0.0 | 2025-01-02 | Restructured for easy ~/.claude deployment |
| 3.1.0 | 2024-12-27 | Added approval gates and Aura design verification |
| 3.0.0 | 2024-12-26 | TDD workflow, unified QA agents |
| 2.0.0 | 2024-12-25 | Performance testing modules |
| 1.0.0 | 2024-12-23 | Initial release with 15 agents |

---

## License

MIT License - See LICENSE file for details.
