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
    │    /max     │      │    /luda      │     │   /anna     │
    └──────┬──────┘      └───────┬───────┘     └──────┬──────┘
           └─────────────────────┼─────────────────────┘
                                 │
                        ARCHITECTURE LAYER
                      ┌──────────▼──────────┐
                      │     SOLUTION        │
                      │    ARCHITECT        │
                      │      /jorge         │
                      └──────────┬──────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼───────┐    ┌─────────▼────────┐    ┌─────────▼────────┐
│    BACKEND     │    │    FRONTEND      │    │     DEVOPS       │
│   DEVELOPER    │    │   DEVELOPER      │    │    ENGINEER      │
│    /james      │    │     /finn        │    │                  │
└───────┬────────┘    └────────┬─────────┘    └────────┬─────────┘
        │                      │                       │
        │   QUALITY LAYER      │                       │
        ▼                      ▼                       ▼
┌───────────────┐      ┌───────────────┐       ┌───────────────┐
│     CODE      │      │   UI/UX       │       │    SECOPS     │
│   REVIEWER    │      │   DESIGNER    │       │   ENGINEER    │
│     /rev      │      │    /aura      │       │               │
└───────┬───────┘      └───────┬───────┘       └───────────────┘
        ▼                      ▼
┌───────────────┐      ┌───────────────┐
│  QA / TEST    │      │     E2E       │
│   DESIGNER    │      │    TESTER     │
│    /rob       │      │    /adam      │
└───────────────┘      └───────────────┘

                         COMPLIANCE LAYER
      ┌──────────────┬──────────────┬──────────────┐
      │              │              │              │
┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
│ACCOUNTANT │  │   LEGAL   │  │ MARKETING │  │ TECHNICAL │
│   /inga   │  │   /alex   │  │   /apex   │  │  WRITER   │
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
│   ├── max.md                   # /max - Product Owner
│   ├── luda.md                  # /luda - Scrum Master
│   ├── jorge.md                 # /jorge - Solution Architect
│   ├── finn.md                  # /finn - Frontend Developer
│   ├── james.md                 # /james - Backend Developer
│   ├── rev.md                   # /rev - Code Reviewer
│   ├── rob.md                   # /rob - QA/Test Designer
│   ├── adam.md                  # /adam - E2E Tester
│   ├── aura.md                  # /aura - UI Designer
│   ├── anna.md                  # /anna - Business Analyst
│   ├── inga.md                  # /inga - UK Accountant
│   ├── alex.md                  # /alex - UK Legal
│   ├── apex.md                  # /apex - Marketing
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

| Command | Name | Role | Expertise |
|---------|------|------|-----------|
| `/max` | Max | Product Owner | Vision, backlog, user stories |
| `/luda` | Luda | Scrum Master | Sprints, AC, status tracking |
| `/anna` | Anna | Business Analyst | Research, requirements |
| `/jorge` | Jorge | Solution Architect | System design, patterns, ADRs |
| `/finn` | Finn | Frontend Developer | React, TypeScript, Next.js |
| `/james` | James | Backend Developer | Java, Spring Boot, APIs |
| `/rev` | Rev | Code Reviewer | Quality, security, style |
| `/rob` | Rob | QA Engineer | Test design, bug investigation |
| `/adam` | Adam | E2E Tester | Playwright, Detox, performance |
| `/aura` | Aura | UI Designer | Design systems, prototypes |
| `/inga` | Inga | UK Accountant | Tax, VAT, R&D credits |
| `/alex` | Alex | UK Legal | GDPR, contracts, compliance |
| `/apex` | Apex | Marketing | GTM, positioning, content |
| - | DevOps | DevOps Engineer | Terraform, K8s, CI/CD |
| - | SecOps | Security Engineer | OWASP, auth, security |
| - | MLOps | ML Engineer | AI/ML, LLM integration |
| - | Technical Writer | Documentation | Docs, diagrams, guides |
| - | Generic Accountant | Finance | Multi-jurisdiction finance |
| - | Generic Legal | Legal | Multi-jurisdiction legal |

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
/max → /luda → /jorge → [/inga] → [/alex] → [/aura] → /finn|/james → /rev → /rob + /adam
Vision   AC    Arch.    Finance   Legal    Design     TDD Dev        Review   Testing
```

### Approval Gates

| Gate | Agent | When Required |
|------|-------|---------------|
| Architecture | /jorge | **ALWAYS** |
| Finance | /inga | Payments, billing, tax |
| Legal | /alex | GDPR, privacy, contracts |
| UI Design | /aura | Frontend features |

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

ALL features require `/jorge` approval before implementation.

### Developers Own Tests

- `/finn` and `/james` write unit and integration tests
- `/rob` designs test cases from acceptance criteria
- `/adam` implements automated E2E and performance tests

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
