# AI Development Team Workflow

This document defines the standard workflow for the AI development team, ensuring quality, accountability, and proper handoffs between team members.

**Version**: 7.0 — Jira/Confluence Integration, Behavior-Only Tickets, Collaborative Architecture

---

## Team Roles Overview

| Command | Alias | Name | Role | Responsibility |
|---------|-------|------|------|----------------|
| `/po` | `/max` | Max | Product Owner | Vision, backlog, Feature Visions in Confluence, Epics in Jira |
| `/sm` | `/luda` | Luda | Scrum Master | Stories in Jira, acceptance criteria, Ticket Approval Gate, ceremonies |
| `/ui` | `/aura` | Aura | UI Designer | Design specs in Confluence Feature Vision, design QA via Browser MCP |
| `/arch` | `/jorge` | Jorge | Solution Architect | Architecture recommendations in Confluence (ADRs, C4), Jira comments |
| `/secops` | `/soren` | Soren | Security Engineer | Security reviews, threat modeling, scanning pipelines, compliance |
| `/fe` | `/finn` | Finn | Frontend Developer | React/TypeScript implementation + TDD, Jira comments for decisions |
| `/be` | `/james` | James | Backend Developer | Java/Kotlin/Spring implementation + TDD, Jira comments for decisions |
| `/rev` | — | Rev | Code Reviewer | Code quality, security, review reports as Jira comments |
| `/qa` | `/rob` | Rob | Test Case Designer & QA | Test plans in Confluence, BDD specs, reports as Jira comments |
| `/e2e` | `/adam` | Adam | Test Automation Engineer | Integration, E2E, performance test implementation, reports as Jira comments |
| `/ba` | `/anna` | Anna | Business Analyst | Investigations in Confluence, requirements analysis |
| `/fin` | `/inga` | Inga | UK Accountant | Finance approval for payments, billing, VAT, tax |
| `/legal` | `/alex` | Alex | UK Legal Counsel | Legal approval for GDPR, privacy, contracts |
| `/mkt` | `/apex` | Apex | Marketing Strategist | GTM strategy, product positioning |

> **Both naming conventions are supported.** Role-based commands (`/arch`, `/be`, `/fe`) are the standard. Persona aliases (`/jorge`, `/james`, `/finn`) are team-specific names that invoke the same agent.

---

## Tooling Setup

### Atlassian MCP Server (REQUIRED)

All projects use Jira for issue tracking and Confluence for documentation via the Atlassian MCP server:

```bash
# Add Atlassian MCP server (user-scope, available for all projects)
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp
```

OAuth 2.1 authentication via browser on first use. Provides 48+ tools for Jira and Confluence.

**Key tools used by agents**:
- `createJiraIssue` / `editJiraIssue` / `transitionJiraIssue` — Issue CRUD
- `addCommentToJiraIssue` — Dev process tracking in tickets
- `searchJiraIssuesUsingJql` — Query tickets
- `createConfluencePage` / `updateConfluencePage` — Documentation
- `getConfluencePage` / `searchConfluenceUsingCql` — Read docs

### Context7 MCP (Recommended)

Agents should use Context7 to check actual framework documentation before writing code or tests.

---

## Multi-Project Setup

Each project gets its own Jira project and Confluence space. The AI dev team framework (skills, commands, TEAM_WORKFLOW.md) is shared across all projects via `~/.claude/`.

```
Jira Projects:              Confluence Spaces:
├── LEMMEJOB (LJ)           ├── Lemmejob
├── PROJECT-2 (P2)          ├── Project 2
└── PROJECT-N (PN)          └── Project N

Shared across all projects:
└── ~/.claude/
    ├── skills/             (agent skills — universal)
    ├── commands/           (agent commands — universal)
    ├── CLAUDE.md           (global instructions)
    └── TEAM_WORKFLOW.md    (this file — team process)
```

**Jira project key** (e.g., `LJ` for Lemmejob) is used in:
- Branch names: `feature/LJ-123-password-reset`
- Commit messages: `LJ-123: Implement token generation for password reset`
- PR titles: `LJ-123: Password reset via email`

---

## Board Type: Kanban (Not Sprint Board)

Traditional sprint dashboards are NOT useful for AI development because:
- AI dev completes in hours, not weeks — sprint boards go 0%→100% in one session
- Velocity charts measure team capacity — irrelevant when "capacity" = API budget
- Burndown charts assume gradual progress — AI development is bursty

**Use Kanban board** for continuous flow:

```
To Do | Investigation | Approved | In Progress | Review | Testing | Done
```

No sprint boundaries. Features flow through gates at AI speed. The board gives real-time visibility without artificial timebox constraints.

**Ceremonies** (planning, retro, refinement) happen at **natural breakpoints** — feature complete, investigation done, major milestone reached — not on a fixed schedule.

---

## Development Workflow

### Workflow Summary

```
PRODUCT DISCOVERY (User + /po + /ba)
─────────────────────────────────────
/po (PO)         → Works WITH the user (stakeholder) to understand business needs
                   Clarifies: what problem? who is the user? what does success look like?
                   Creates Feature Vision in Confluence (lightweight: goals, metrics, user needs)
                   Divides requirements into Epics/Stories describing expected system behavior
                   Orders backlog by value/risk/urgency
                   → USER APPROVES Feature Vision before proceeding

/ba (BA)         → Works closely WITH /po (thin border, tight collaboration)
                   Discovers and clarifies: rules, edge cases, data needs, process flows
                   Refines Stories: adds AC (Given/When/Then), examples, business rules
                   Maps business processes (as-is / to-be) when useful
                   Identifies dependencies, risks, integration points
                   Ensures stories are small, testable, and valuable
                   Makes items "ready" so the team can build without guessing

         ↓ Feature Vision approved, Stories refined ↓

ARCHITECTURE & SECURITY REVIEW
──────────────────────────────
/arch (Architect) → Reviews architecturally relevant stories
                    Provides guardrails: patterns, constraints, boundaries, NFRs
                    Creates ADR in Confluence (C4, Mermaid) for significant decisions
                    Adds recommendations as Jira comments (devs may deviate with reasoning)
                    Does NOT dictate implementation — developers decide HOW
/secops (SecOps)  → Security review, threat modeling, Confluence Approval Checklist
[/fin, /legal, /ui, /mkt] → Specialist approval when needed

         ↓ Feature approved ↓

TICKET APPROVAL GATE
────────────────────
/sm (SM)         → Manages Kanban board, facilitates Ticket Approval Gate
                   Creates Approval Checklist in Confluence
ALL team members → Ticket Approval Gate (see below):
  - /arch confirms architecture guidance is clear
  - /po confirms business intent is preserved
  - /ba confirms requirements are complete, edge cases covered
  - /be or /fe confirms they understand what to build
  - /ui confirms UX spec is clear (if frontend)
  - /qa confirms AC are testable and complete for BDD

         ↓ All approve ↓

PARALLEL IMPLEMENTATION
───────────────────────
/qa (QA)         → Write test cases + BDD specs from behavioral AC (Confluence)
/e2e (E2E)       → Implement automated tests from /qa specs
/be or /fe       → Implement feature (TDD), create Subtasks in Jira
                   Developers and testers work IN PARALLEL

         ↓ Implementation complete ↓

REVIEW & VERIFICATION
─────────────────────
/rev             → Code review (report as Jira comment)
/secops          → Security review of implementation (if needed)
/ui              → Design QA via Browser MCP (if frontend, report as Jira comment)
/qa              → Reviews /e2e tests against approved test cases
/qa + /e2e       → Execute all tests, report results as Jira comments

         ↓ All pass ↓

RETROSPECTIVE (at natural breakpoints)
──────────────────────────────────────
ALL agents       → What went well? What to improve? What to change?
/sm              → Consolidate, update process, create improvement tickets
```

### Approval Gates (Before Implementation)

| Gate | Command | When Required |
|------|---------|---------------|
| Architecture | /arch | **ALWAYS** — all features need architectural review |
| Security | /secops | **ALWAYS** — all features need security review |
| Finance | /fin | Payments, billing, accounting, VAT, tax, invoicing |
| Legal | /legal | GDPR, privacy, terms, contracts, compliance |
| Requirements Review | /ba | **ALWAYS** — ensures stories are complete and testable |
| UI Design | /ui | Features with frontend/UI changes only |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FEATURE DEVELOPMENT FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌──────────────┐      ┌──────────────┐
   │  /po + User  │─────▶│    /ba       │
   │Feature Vision│      │Refine Stories│
   │Confluence    │      │Add AC, rules │
   │Epics/Stories │      │edge cases    │
   └──────────────┘      └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              ┌─────────┐            ┌─────────┐
              │  /arch  │            │ /secops │ ◀── ALWAYS REQUIRED
              │ADR in   │            │Security │
              │Confluenc│            │in Conflu│
              └────┬────┘            └────┬────┘
                   │                      │
                   └──────────┬───────────┘
                              │
                    ┌─────────┼─────────┐
                    │ (if)    │         │ (if)
                    ▼         │         ▼
              ┌─────────┐    │   ┌─────────┐
              │  /fin   │    │   │ /legal  │
              │Finance  │    │   │ Legal   │
              └────┬────┘    │   └────┬────┘
                   └─────────┼────────┘
                             │
                             ▼
               ┌──────────────────────────┐
               │  TICKET APPROVAL GATE     │
               │  /sm facilitates          │
               │  All team members approve │
               │  Story before impl starts │
               └────────────┬─────────────┘
                            │
                 ┌──────────┴──────────┐
                 │ (if frontend)       │ (backend only)
                 ▼                     │
           ┌─────────┐                │
           │  /ui    │                │
           │ Design  │──▶ /po approves│
           └────┬────┘                │
                └──────────┬──────────┘
                           │
                 ┌─────────┴─────────┐
                 │ (frontend)        │ (backend)
                 ▼                   ▼
           ┌───────────┐      ┌───────────┐
           │   /fe     │      │   /be     │
           │ Frontend  │ ◀──▶ │ Backend   │   IN PARALLEL
           │ TDD Cycle │      │ TDD Cycle │   with /qa + /e2e
           └─────┬─────┘      └─────┬─────┘
                 └────────┬─────────┘
                          │
                 ┌────────┴────────┐
                 │                 │ (if frontend)
                 ▼                 ▼
           ┌───────────┐    ┌───────────┐
           │   /rev    │    │   /ui     │
           │Code Review│    │Design QA  │
           └─────┬─────┘    └─────┬─────┘
                 └────────┬───────┘
                          │
               ┌──────────┴──────────┐
               │                     │
               ▼                     ▼
         ┌──────────┐         ┌──────────┐
         │ Approved │         │ Rejected │──▶ Back to /fe or /be
         └────┬─────┘         └──────────┘    (fix + Jira comment)
              │
              ▼
        ┌───────────────────────────────────────┐
        │        AUTOMATED TESTING PHASE        │
        ├───────────────────────────────────────┤
        │  /qa designs test cases from AC       │
        │  /e2e implements automated tests:     │
        │  • Integration tests (Testcontainers) │
        │  • E2E tests (Playwright/Cucumber)    │
        │  • Performance tests (k6)             │
        │  /qa reviews /e2e tests against specs │
        │  Reports as Jira comments             │
        └─────────────┬─────────────────────────┘
                      │
               ┌──────┴──────┐
               │             │
               ▼             ▼
           ┌────────┐   ┌────────┐
           │ PASSED │   │ FAILED │──▶ /e2e reports in Jira
           └───┬────┘   └────────┘    /sm creates fix tickets
               │                      Back to development
               ▼
           ┌───────────┐
           │   /sm     │
           │Transition │
           │to Done    │
           └───────────┘
```

---

## Jira Issue Hierarchy

### When to Use Each Type

| Type | Definition | When to Use | Created By | Status |
|------|-----------|-------------|------------|--------|
| **Epic** | Large feature spanning multiple stories | Complex features, multi-session work | /po | Ready |
| **Story** | User-facing behavior, completable in one session | Standard features | /po (draft) → /ba (refine AC) | Ready after /po + /ba |
| **Task** | Technical work not user-facing | CI/CD, ADR, infra, spikes | /arch, /be, /fe, /sm | Draft → /po confirms priority |
| **Subtask** | Atomic step within a Story | Complex stories needing decomposition | /be, /fe | Ready (devs own) |
| **Bug** | Defect found during testing or production | Defects, regressions | /qa, /e2e, /rev, any agent | Draft → /po confirms priority |

### Decision Guide

| Scenario | Use |
|----------|-----|
| Complex feature, multiple sessions, multiple stories | **Epic** with child Stories |
| Complex feature, one session, multiple phases | **Story with Subtasks** |
| Simple feature, one session, one story | **Story only** (no Epic needed) |
| Technical work, not user-facing | **Task** |

**Not everything needs an Epic.** A Story can stand alone for simple features.

### Example Hierarchy

```
EPIC: User Authentication System (/po)
├── STORY: User can log in with email and password (/po draft → /ba refines AC)
│   ├── Subtask: Implement auth token service (/be)
│   └── Subtask: Build login form (/fe)
├── STORY: User can reset password via email (/po draft → /ba refines AC)
│   ├── Subtask: Implement reset token service (/be)
│   └── Subtask: Build reset form (/fe)
└── STORY: User can enable 2FA (/po draft → /ba refines AC)
```

---

## Ticket Creation Model

### Principle: Anyone can draft, /po is accountable

Any agent can create a ticket in Jira, but the Product Owner is accountable that backlog items represent the right work and are ordered correctly.

### Who Creates What (Default)

| Agent | Creates | Initial Status | Becomes Ready When |
|-------|---------|---------------|-------------------|
| `/po` | Epics, Stories (behavior-focused) | **Ready** (PO owns these) | /ba refines AC |
| `/ba` | Stories (refined from /po vision) | **Ready** | After /po approves priority |
| `/arch` | Tasks, Spikes (technical research) | Draft | /po confirms priority |
| `/be`, `/fe` | Subtasks (under Stories) | **Ready** (devs own decomposition) | Immediately |
| `/qa`, `/e2e` | Bugs (found during testing) | Draft | /po confirms priority |
| `/rev` | Bugs, Tech Debt Tasks | Draft | /po confirms priority |
| `/sm` | Process Tasks, Ceremony tickets | **Ready** (SM owns process) | Immediately |

### "Ready" Definition

A Story is **Ready** for implementation when:
1. `/po` agreed on value + priority
2. AC are clear — Given/When/Then, edge cases, business rules (from `/po` + `/ba` collaboration)
3. Team has no major unknowns (or a Spike exists to resolve them)

### Kanban Board Columns

```
Backlog (drafts) | To Do | Investigation | Approved | In Progress | Review | Testing | Done
     ↑                ↑
  Any agent       /po orders
  creates         + /ba refines
```

Drafts sit in **Backlog** until `/po` reviews priority. `/po` + `/ba` refine and move to **To Do** when Ready.

### Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad |
|-------------|-------------|
| Only /po can write tickets | /po becomes bottleneck, other agents lose findings |
| Agents create tickets without /po clarity | Technically perfect tickets for the wrong outcome |
| Stories changed mid-implementation without agreement | Chaos — use /po + team conversation |
| Bugs created without reproduction context | Wastes investigation time |

---

## Feature Vision (Confluence)

For every feature (whether Epic or standalone Story), `/po` creates a **Feature Vision** document in Confluence from a template.

### Feature Vision Template

```markdown
# Feature Vision: [Feature Name]

## Overview
| Field | Value |
|-------|-------|
| Status | Draft / Under Review / Approved |
| Epic | [Jira Epic link] (if applicable) |
| Owner | /po |
| Architect | /arch |
| Developers | /be, /fe |

## Business Context
Why does this feature exist? What customer problem does it solve?

## Feature Goals (Checklist)
- [ ] Goal 1: [measurable outcome]
- [ ] Goal 2: [measurable outcome]
- [ ] Goal 3: [measurable outcome]

## Success Metrics
| Metric | Current | Target | How Measured |
|--------|---------|--------|--------------|

## User Stories (High-Level)
| As a ... | I want ... | So that ... | Priority |
|----------|------------|-------------|----------|

## Design
[/ui design specs, wireframes, mockups]

## Architecture Overview
[/arch C4 diagrams in Mermaid, high-level boundaries]

## Discussions & Decisions
| Date | Topic | Decision | Who |
|------|-------|----------|-----|

## Open Questions
| Question | Owner | Answer | Date |
|----------|-------|--------|------|

## Out of Scope
- What this feature will NOT do

## Related
- Investigation: [Confluence link]
- Approval Checklist: [Confluence link]
- Test Plan: [Confluence link]
```

---

## Confluence Space Structure

Each project's Confluence space follows this structure:

```
Confluence Space: [Product Name]
│
├── Product Vision & Strategy/
│   └── Feature Visions/
│       └── [Feature Name] Vision              ← /po creates from template
│
├── Architecture/
│   ├── C4 Context Diagram                     ← /arch
│   ├── C4 Container Diagram                   ← /arch
│   └── ADRs/
│       └── ADR-001: [Decision Name]           ← /arch (Mermaid diagrams)
│
├── Investigations/
│   └── [Feature Name] Investigation           ← /ba, /arch
│
├── Approvals/
│   └── [Feature Name] Approval Checklist      ← /sm
│       ├── ☑ Architecture reviewed (/arch)
│       ├── ☑ Security reviewed (/secops)
│       ├── ☐ Finance reviewed (/fin) — if applicable
│       ├── ☐ Legal reviewed (/legal) — if applicable
│       └── ☐ Design reviewed (/ui) — if applicable
│
├── Test Plans/
│   └── [Feature Name] Test Cases              ← /qa
│
├── Sprints/
│   ├── Sprint N — Planning                    ← /sm (linked to Jira)
│   ├── Sprint N — Review Notes                ← /sm
│   └── Sprint N — Retrospective               ← /sm + all agents
│
└── Knowledge Base/
    └── [Topic]                                ← any agent
```

---

## Ticket Model: Behavior-Only (CRITICAL)

### Principle: Describe WHAT the system should DO, not HOW to code it

**Stories describe behavior.** No file paths. No code snippets. No line numbers. Developers decide HOW to implement within architectural guidance.

### Story Template (Jira)

```
Title: [Brief description]
Type: Story
Epic: [Link if applicable]

## User Story
As a [role],
I want [capability],
So that [business value]

## Acceptance Criteria (Given/When/Then — BEHAVIOR ONLY)

### Scenario 1: [Happy path name]
Given [initial context/state]
When [action is performed]
Then [expected outcome]
And [additional outcome]

### Scenario 2: [Error case name]
Given [initial context/state]
When [invalid action is performed]
Then [error behavior]

### Scenario 3: [Edge case name]
...

## Non-Functional Requirements (measurable)
- Performance: [metric] < [target]
- Security: [requirement]
- Availability: [requirement]

## Architecture Guidance (/arch)
### Pattern: [recommended pattern]
### Constraints:
- [constraint 1]
- [constraint 2]
### Boundaries:
- [service boundary 1]
- [service boundary 2]
### Recommendations (developer may deviate with justification):
- [suggestion with reasoning]

## Security Requirements (/secops)
- [requirement if applicable]

## Links
- Feature Vision: [Confluence link]
- Approval Checklist: [Confluence link]
- Test Plan: [Confluence link]
```

### What Does NOT Belong in Stories

| DO NOT Include | Why |
|----------------|-----|
| File paths, line numbers | Developers choose implementation |
| Before/after code snippets | Developers decide how to code |
| Database column names | Architect recommends, developer decides |
| Specific library usage | Developer selects tools within constraints |
| Implementation steps | Developer plans their own approach |

---

## Architecture-Developer Collaboration Model

### Principle: Guide, Don't Dictate

The architect-developer relationship is **collaborative, not prescriptive**. The architect provides guardrails; developers own implementation.

### How /arch and Developers Work Together

1. **/arch recommends** — patterns, constraints, boundaries, C4 diagrams, NFRs. May suggest specific approaches or even code IF it explains WHY (e.g., "consider PersistentTokenRepository because it handles rotation automatically")
2. **Developer analyzes** — accepts, validates, or challenges /arch suggestions
3. **Developer decides** — follows recommendation OR deviates with justification
4. **Jira comments** — all reasoning captured so the user understands WHY decisions were made

### What /arch IS Responsible For (System-Level)

- Defines or guides **structure**: components/services/modules and how they connect
- Makes **tradeoffs** explicit: cost vs speed vs safety
- Sets **guardrails**: patterns, standards, constraints
- Ensures **NFRs** are addressed: security, performance, reliability
- Aligns **cross-team interfaces** and evolution plans
- Approves only **high-impact architectural changes** (not everything)

### What /arch is NOT Responsible For

- How the team builds it (coding, task assignment) — that's developers
- Approving every PR or technical decision
- Dictating code style or internal class design
- Designing without considering operations (deploy, monitoring, rollback)

### When to Involve /arch

| Involve /arch | Developer-Led |
|--------------|---------------|
| New service or database | Adding endpoints within existing boundary |
| Changing API contracts used by other teams | Internal refactoring (no external behavior change) |
| Switching sync → async messaging | UI feature (unless it changes backend contracts) |
| Security model changes (scopes/roles/PII) | Minor library upgrades |
| High-load features, performance constraints | Standard CRUD operations |
| Major refactors, migrations, schema changes | Bug fixes within existing architecture |

### If Developer Deviates from /arch Recommendation

The developer MUST comment in the Jira ticket explaining:
- What they chose instead
- Why it's better for this specific case
- Any trade-offs the team should know about

### /rev Verification

During code review, /rev checks:
- Are the architectural constraints met? (patterns, boundaries, NFRs)
- If developer deviated from /arch recommendation, is the reasoning documented and sound?
- Does the implementation satisfy the behavioral AC?

---

## Ticket Approval Gate (MANDATORY)

Before implementation begins, ALL relevant team members must approve the Story by commenting in Jira:

| Role | Command | Approves | What They Check |
|------|---------|----------|----------------|
| Architect | `/arch` | Architecture | Guidance is clear, fits system boundaries |
| Product Owner | `/po` | Business | Business intent preserved in AC |
| Business Analyst | `/ba` | Requirements | Requirements complete, edge cases covered |
| Developer | `/be` or `/fe` | Implementation | "I understand what to build" |
| Designer | `/ui` (if UI) | Design | UX spec is clear and complete |
| QA | `/qa` | Testability | AC are testable and complete for BDD |

**Process**:
1. /po + /ba create and refine Story in Jira with behavioral AC
2. /sm facilitates Ticket Approval Gate, tags team members
3. Each member reviews and comments "APPROVED" or raises concerns
4. /sm updates Confluence Approval Checklist
5. Only when all required approvals are in → Story moves to "In Progress"

---

## Full Dev Process in a Jira Ticket

The Jira ticket IS the single source of truth for the entire dev process. Every stage adds a comment. Reading a ticket top-to-bottom shows the full journey:

```
STORY: "As a user, I can reset my password via email"
│
├── Description: behavioral AC (Given/When/Then), NFRs, links to Confluence
│   Written by /po, AC refined by /ba
│
├── Comment 1 (/arch): Architecture suggestions
│   "I recommend token-based with TTL because... Consider
│    PersistentTokenRepository for automatic rotation.
│    Email via async event to decouple services."
│
├── Comment 2 (/qa): Ticket Approval — Testability
│   "APPROVED. AC are testable. I'll write BDD specs for all 3 scenarios."
│
├── Comment 3 (/be): Developer vision
│   "I'll follow /arch's token approach but use Redis TTL instead
│    of DB-based TTL because we already have Redis for sessions."
│
├── Comment 4 (/be): Implementation details (after coding)
│   "Implemented in PR #42. Key decisions:
│    - Used RedisTokenRepository with 24h TTL
│    - Rate limiting at 3/hour via @RateLimiter
│    - Email via Spring Events (not Kafka — overkill for this volume)"
│
├── Comment 5 (/rev): Code review report
│   "APPROVED with suggestions:
│    - Add null check on token lookup (line 45)
│    - Consider adding metrics for reset attempts"
│
├── Comment 6 (/be): Fix resolution
│   "Fixed: added null check + Micrometer counter. PR #42 updated."
│
├── Comment 7 (/qa): Test case review + execution report
│   "PASSED: 5/5 scenarios. /e2e tests reviewed against specs. Coverage: 94%."
│
├── Comment 8 (/e2e): E2E test report
│   "PASSED: Full flow in Playwright. Cross-browser: Chrome, Firefox, Safari."
│
└── Status: DONE ✅
```

---

## Phase 1: Product Discovery & Planning

### 1.1 Product Owner (/po)

/po advocates for the user/stakeholders. Works WITH the user to understand needs.

**Responsibilities**:
- Product **vision & outcomes**: What problem? Who is the user? What does success look like?
- **Backlog ownership**: Ordering items by value/risk/urgency. Deciding what's most important now.
- **Clarifying requirements**: Explaining intent and expected behavior. Making tradeoffs when constraints appear.
- **Acceptance of work**: Verifies delivered items meet acceptance criteria.
- **Stakeholder management**: Collects needs/feedback, aligns conflicting requests, communicates roadmap.

**Outputs**:
- **Feature Vision** in Confluence (lightweight: goals, metrics, user stories high-level)
- **Epics** in Jira (if feature is complex enough)
- **Stories** in Jira (behavior-focused drafts describing expected system behavior)
- Well-ordered **Product Backlog** — top items are clear, valuable, and small enough to plan
- **Approves UI designs** from /ui before implementation

**What /po is NOT responsible for**:
- How the team builds it (architecture, coding, task assignment)
- Running Scrum process (that's /sm)
- Writing every detail alone (supported by /ba, /ui, /arch)
- Approving every technical decision or PR

**User approves Feature Vision** before proceeding to refinement.

### 1.2 Business Analyst (/ba)

/ba works closely with /po (thin border, tight collaboration). Makes items "ready" so the team can build without guessing.

**Responsibilities**:
- **Clarifies "what problem are we solving?"** — helps stakeholders express goals, pain points, constraints
- **Shapes and refines requirements** — breaks big ideas into smaller slices (epics → stories), adds AC (Given/When/Then), examples, edge cases, business rules, data needs
- **Supports backlog refinement** — prepares items before refinement, helps team estimate, identifies dependencies and risks early
- **Aligns stakeholders** — runs workshops/discovery sessions, ensures team interpretation matches stakeholder intent, handles "we actually meant something else" before work starts
- **Helps with solution options** — maps business processes (as-is / to-be), clarifies integrations, data flows, reporting needs, supports UX flows
- **Validates outcomes** — checks delivered work against AC, supports UAT, collects feedback

**Outputs**:
- Well-formed **user stories + acceptance criteria** (Given/When/Then)
- **Process flows / user journeys** when useful
- **Business rules** documentation
- **Non-functional requirements** notes (security, audit, performance)
- **Investigation reports** in Confluence

**BA is doing well if**:
- The team rarely says: "we didn't know this requirement existed"
- Refinement sessions are productive (not confused debates)
- Stories entering implementation are small, clear, and testable
- Stakeholders agree: "yes, that's what we wanted"
- Rework caused by misunderstanding decreases over time

**Gap Analysis Checklist** (for P0/P1 features):
- [ ] All requirements documented
- [ ] Success metrics defined
- [ ] Edge cases identified
- [ ] Competitive context understood
- [ ] User impact assessed
- [ ] Rollback strategy defined

### 1.3 Scrum Master (/sm)

/sm manages process, not content. Facilitates, doesn't author requirements.

**Responsibilities**:
- Manages **Kanban board** and ticket workflow states
- Facilitates **Ticket Approval Gate** — tags team members, tracks approvals
- Creates **Approval Checklist** in Confluence
- Removes **blockers**, coaches team on process
- Facilitates **ceremonies** at natural breakpoints (planning, retro, refinement)
- Creates **fix tickets** when tests fail, **tech debt tickets** from review suggestions

### 1.4 Solution Architect (/arch) — ALWAYS REQUIRED
**MANDATORY**: All features with architectural relevance require /arch review before implementation.

/arch focuses on things that affect system shape: boundaries, data ownership, integration patterns, performance, security, operational concerns.

- Writes **ADR in Confluence** with C4 diagrams (Mermaid) for significant decisions
- Adds **architecture guidance** as Jira comment: patterns, constraints, boundaries, NFRs
- Comments **recommendations** — developer may deviate with justification
- Does **just enough design "ahead"**, keeps it iterative (spikes, architecture runway)
- Provides **guardrails**: recommended patterns, service boundaries, API guidelines, cross-cutting concerns
- Does NOT prescribe exact implementation — developers decide HOW within guardrails

**During sprint**: /arch is available for quick design validation, decisions when unknowns appear, reviewing PRs only where architectural constraints matter. Not a gate that blocks delivery.

### 1.5 Security Engineer (/secops) — ALWAYS REQUIRED
**MANDATORY**: All features require /secops security review before implementation.

- Conducts threat modeling (STRIDE/PASTA/LINDDUN)
- Reviews authentication and authorization design
- Updates Confluence **Approval Checklist** with security sign-off
- Adds security requirements to Jira Story if applicable

### 1.6 Conditional Approvals

#### Finance Approval (/fin)
**Required for**: payments, billing, subscriptions, VAT, tax, invoicing, financial reporting.

#### Legal Approval (/legal)
**Required for**: GDPR, privacy policies, terms of service, user consent, data retention, contracts.

### 1.7 UI Designer (/ui) — Frontend Features Only
- Adds design specs to **Confluence Feature Vision**
- Gets approval from /po before handoff to /fe
- **After implementation**: Verifies UI using Browser MCP, reports as Jira comment

### 1.8 Ticket Approval Gate
See "Ticket Approval Gate" section above. All relevant team members must approve before implementation starts.

---

## Phase 2: Development (TDD)

### 2.1 Developers (/fe, /be)
Developers are responsible for ALL tests related to their code:
- **Unit Tests**: Test individual functions/components
- **Integration Tests**: Test component interactions

**Before coding**: Add a **developer vision** comment in Jira explaining approach.

**TDD Cycle (Mandatory)**:
```
┌──────────────────────────────────────────┐
│            TDD CYCLE                     │
│                                          │
│    ┌───────┐                             │
│    │ RED   │ Write failing test          │
│    └───┬───┘                             │
│        │                                 │
│        ▼                                 │
│    ┌───────┐                             │
│    │ GREEN │ Write minimal code to pass  │
│    └───┬───┘                             │
│        │                                 │
│        ▼                                 │
│    ┌──────────┐                          │
│    │ REFACTOR │ Clean up code            │
│    └───┬──────┘                          │
│        │                                 │
│        ▼                                 │
│    ┌───────┐                             │
│    │ TEST  │ Verify all tests pass       │
│    └───┬───┘                             │
│        │                                 │
│        └────────▶ Repeat for next test   │
│                                          │
└──────────────────────────────────────────┘
```

**After coding**: Add **implementation details** comment in Jira (what was built, key decisions, PR link).

**Developer Testing Standards**:
- Unit test coverage: >80%
- Integration test coverage: >60%
- All tests must pass before code review
- Tests are documentation — write clear test names

### 2.2 Subtasks for Complex Stories

For complex Stories, developers create **Subtasks** in Jira:
- Each Subtask is an atomic piece of work
- Subtasks can be worked in parallel if independent
- Parent Story only moves to "Done" when all Subtasks complete

---

## Phase 3: Code Review

### 3.1 Code Reviewer (/rev)

Reviews all code and posts report as **Jira comment** on the Story.

**Quality Checks**:
- [ ] Code style compliance (ESLint, Checkstyle)
- [ ] Code smells (long methods, large classes, duplication)
- [ ] Design patterns correctly applied
- [ ] SOLID principles followed
- [ ] Clean code practices

**Security Checks**:
- [ ] OWASP Top 10 vulnerabilities
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Secrets not hardcoded
- [ ] Run security scanners (grype, Trivy, SonarQube)

**Architecture Verification**:
- [ ] Behavioral AC are satisfied by the implementation
- [ ] Architectural constraints are met (patterns, boundaries, NFRs)
- [ ] If developer deviated from /arch recommendation: reasoning is documented and sound
- [ ] Architecture conditions verified (from Confluence ADR)

**Test Review**:
- [ ] Tests exist and are meaningful
- [ ] Coverage meets threshold
- [ ] Tests follow AAA pattern
- [ ] No test implementation details

**Two-Pass Review (v15.1)**:
- Pass 1: Logic correctness, security, code quality
- Pass 2: Condition verification, boundary values, schema compliance

**Review Outcomes**:
- **Approved**: Code proceeds to Design QA (if frontend) or testing. Comment in Jira.
- **Changes Requested**: Back to developer with specific feedback. Comment in Jira.

### Technical Debt from Code Reviews

Non-blocking suggestions from /rev are logged as technical debt:
1. /rev marks as "SUGGESTION" in review comment
2. /sm creates Bug/Task ticket in Jira for tech debt
3. Technical debt is prioritized for future work

---

## Phase 3.5: Design QA (Frontend Only)

### 3.5.1 UI Designer (/ui) — Design Verification
**Only for features with frontend changes**

After /fe completes implementation and /rev approves code:

**Using Browser MCP Tools**:
```
1. playwright_navigate → Open deployed/local feature URL
2. playwright_screenshot → Capture current implementation
3. playwright_resize → Test responsive breakpoints
4. playwright_get_visible_html → Verify component structure
```

**Design QA Checklist**:
- [ ] Layout matches design spec
- [ ] Colors match design system
- [ ] Typography correct
- [ ] Spacing/margins match design
- [ ] Responsive breakpoints work
- [ ] Animations/transitions as specified
- [ ] Empty/loading/error states implemented
- [ ] Accessibility: focus states, contrast, touch targets

**Design QA Outcomes**: Report posted as **Jira comment**.
- **Approved**: Feature proceeds to testing
- **Changes Needed**: Back to /fe with specific visual fixes

---

## Phase 4: Automated Testing

### 4.1 Test Case Designer (/qa)

/qa writes **Test Plans** in Confluence and **BDD specs** from behavioral AC.

**PREREQUISITE CHECK**:
- [ ] Feature description exists from /po + /ba
- [ ] Acceptance criteria are defined (behavioral Given/When/Then)
- [ ] Test scenarios are documented

**/qa Responsibilities**:
- Design test cases from acceptance criteria
- Write test specifications for /e2e to implement
- Write reproduction tests for bugs
- **Review /e2e tests against approved test cases** (CRITICAL)
- Validate tests properly cover acceptance criteria
- Report results as **Jira comment**

### 4.2 Test Automation Engineer (/e2e)

/e2e implements ALL automated tests. Reports as **Jira comment**.

| Test Type | Framework | When |
|-----------|-----------|------|
| **Integration Tests** | JUnit + Testcontainers (backend) | Always |
| **Integration Tests** | Jest + Testing Library (frontend) | Always |
| **E2E Tests** | Playwright (web) | Critical paths |
| **E2E Tests** | Detox (mobile) | Critical paths |
| **Performance Tests** | k6, Artillery | As needed |
| **Visual Regression** | Playwright screenshots | Frontend features |

**CRITICAL (v4.2)**: /e2e MUST produce committed test script files — never just ad-hoc browser sessions or markdown-only reports. Tests must target staging and be re-runnable via CLI.

**After Testing**:
- **ALL TESTS PASS**: /e2e comments "PASSED" in Jira. /qa reviews tests against specs and signs off on coverage. /sm transitions to Done.
- **TESTS FAIL**: /e2e comments "FAILED" in Jira with details. /sm creates fix tickets.

---

## Phase 5: Test Coverage Review

### 5.1 /qa — Coverage Review

After /e2e implements tests, /qa reviews them against approved test cases:
- [ ] Verify all AC are covered by tests
- [ ] Verify edge cases are tested
- [ ] Verify error paths are tested
- [ ] Sign off on test coverage (Jira comment)

---

## Phase 6: Documentation & Release

### 6.1 Technical Writer
- Updates API documentation
- Updates user guides
- Creates release notes

### 6.2 Scrum Master (/sm)
- Transitions Jira ticket to Done
- Updates Confluence sprint notes if applicable

---

## Context Preservation (Git Files for Agent Memory)

While Jira and Confluence are the primary tools, **Git files** provide context preservation across Claude Code sessions. This is critical because agents lose context between sessions.

### Hybrid Model: What Goes Where

| Content | Primary Location | Git File (agent memory) |
|---------|-----------------|------------------------|
| Feature Vision | Confluence | — |
| Architecture Decision | Confluence ADR | `approvals/arch-architecture.md` |
| Security Review | Confluence Checklist | `approvals/secops-security.md` |
| Finance Review | Confluence Checklist | `approvals/fin-finance.md` (if needed) |
| Legal Review | Confluence Checklist | `approvals/legal-compliance.md` (if needed) |
| UI Design | Confluence Feature Vision | `approvals/ui-designs/{ticket}.md` |
| Implementation Notes | Jira comments | `implementation/{ticket}.md` |
| Code Review | Jira comments | `reviews/rev-{ticket}.md` |
| Test Report | Jira comments | `testing/qa-{ticket}.md` |
| E2E Report | Jira comments | `testing/e2e-{ticket}.md` |
| Decision Log | Confluence Discussions | `DECISION_LOG.md` |

### Sprint Folder Structure (Agent Memory)

```
docs/sprints/
├── sprint-{N}-{feature-name}/
│   ├── README.md                  # Sprint overview + status (for agents)
│   ├── DECISION_LOG.md            # Key decisions with rationale
│   ├── approvals/                 # Gate approvals (mirrors Confluence)
│   ├── implementation/            # Dev notes per ticket
│   ├── reviews/                   # Code review reports
│   └── testing/                   # QA & E2E reports
└── SPRINT-STATUS.md               # Overall sprint tracking
```

**Rule**: Agents write to BOTH Jira/Confluence AND Git files. Jira is for human visibility; Git files are for agent context across sessions.

### Decision Logging (MANDATORY)

Every sprint folder MUST include a `DECISION_LOG.md`:

```markdown
# Decision Log: Sprint {N}

| ID | Decision | Category | Rationale | Approved By | Date |
|----|----------|----------|-----------|-------------|------|
| D-001 | Use REST over GraphQL | Architecture | Team familiarity | /arch | YYYY-MM-DD |
| D-002 | Redis TTL over DB TTL | Implementation | Already have Redis | /be | YYYY-MM-DD |
```

---

## Workflow Rules

### Rule 1: Architecture Approval Required
All features MUST be reviewed by /arch before implementation.

### Rule 2: Security Review Required
All features MUST be reviewed by /secops before implementation.

### Rule 3: Ticket Approval Gate
All Stories MUST be approved by relevant team members before implementation starts.

### Rule 4: Behavior-Only Tickets
Stories describe WHAT the system should do, not HOW to code it. No file paths, code snippets, or line numbers in Stories.

### Rule 5: No Feature Without Acceptance Criteria
Features cannot proceed without behavioral AC from /po + /ba.

### Rule 6: Developers Own Their Tests
Unit and integration tests are written BY developers, not QA.

### Rule 7: Black Box QA

**The goal of all testing is absolutely predictable system behavior.** The system must behave exactly as specified — no surprises, no unintended side effects, no hidden failures.

#### /qa (Test Case Design + Manual Testing)
- /qa designs test cases from acceptance criteria covering **three mandatory categories**:
  1. **Positive cases (Happy Path)** — feature works as intended, all AC satisfied
  2. **Negative cases (Error Path)** — system handles misuse gracefully (invalid inputs, unauthorized access, expired entities)
  3. **Edge cases (Boundary Path)** — system handles extremes (empty values, max inputs, locale switching, double-clicks, browser back, legacy data)
- During manual testing, /qa follows ALL test case scenarios — no skipping
- /qa thinks like different users: first-time (confused), impatient (double-clicks), malicious (XSS, URL manipulation), power (multi-tab, shortcuts), mobile (small screen, slow network), legacy (old data)
- /qa actively tries to break things: wrong order, missing data, interrupted flows, rapid actions, cross-feature impact
- **A test plan without all three categories is INCOMPLETE**

#### /e2e (Test Automation)
- /e2e writes automated tests based on /qa's test cases (TC-XX) and behavioral AC — **NEVER from reading source code**
- /e2e is a black-box tester: the only inputs are test cases, AC, and the running application
- Every automated test MUST trace to a TC-XX ID from /qa's test plan
- /e2e delivers a **traceability matrix** mapping TC-XX → test file:line for every delivery
- Coverage target: **100% of /qa's test cases** — measured by TC completion, not lines of code
- These principles apply regardless of technology stack (Java, Python, Go, PHP, JavaScript, etc.)

#### /qa Reviews /e2e Tests
- /qa verifies /e2e tests against approved test cases — catches requirement drift
- Red flags: tests that verify internal behavior instead of user-visible outcomes, tests adapted to match code, missing TCs without justification, no adversarial tests

### Rule 8: Security is Non-Negotiable
/rev must run security scans on every code review.

### Rule 9: Design QA for Frontend
Frontend features require /ui verification using Browser MCP before testing.

### Rule 10: Domain Expert Approval
Finance features → /fin. Legal features → /legal.

### Rule 11: Reports as Jira Comments
Every phase produces a Jira comment that documents what was done and why.

### Rule 12: Dev Process in Tickets
The Jira ticket is the single source of truth. Read top-to-bottom = full journey.

---

## Bug / Issue Workflow

### Reporting a Bug

Use the `/bug` or `/issue` command:

```
/bug I see internal server error in /approval page when I move from dashboard
/bug Login button doesn't work on mobile Safari
```

### Bug Workflow

```
/bug [description] or /issue [description]
      │
      ▼
┌─────────────────────────┐
│ Creates structured bug  │
│ report → /sm creates    │
│ Bug ticket in Jira      │
│ • Sets priority (P0-P3) │
│ • Assigns investigator  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ INVESTIGATION PHASE     │
│ • Identify component    │
│ • Reproduce issue       │
│ • Find root cause       │
│ • Gather evidence       │
└───────────┬─────────────┘
            │
      ┌─────┴─────┐
      │           │
      ▼           ▼
┌───────────┐  ┌───────────────────────┐
│ REPRODUCED│  │ CANNOT REPRODUCE      │
└─────┬─────┘  │ /qa recommends:       │
      │        │ • Close as "works as  │
      │        │   designed" OR        │
      │        │ • Request more info   │
      │        │ • Mark for monitoring │
      │        └───────────────────────┘
      ▼
┌─────────────────────────┐
│ /qa writes failing      │
│ reproduction test       │
│ (MUST fail before fix,  │
│  pass after fix)        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ FIX PHASE (TDD)         │
│ • Write unit tests (RED)│
│ • Implement fix (GREEN) │
│ • Refactor              │
│ • All tests pass        │
│ • Comment fix in Jira   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ /rev reviews (Jira cmnt)│
│ /e2e runs tests (cmnt)  │
│ /sm transitions Done    │
└─────────────────────────┘
```

### Bug Priority Levels

| Priority | Criteria | Response |
|----------|----------|----------|
| **P0** | System down, data loss, security breach | Immediate |
| **P1** | Major feature broken, no workaround | Same day |
| **P2** | Feature impaired, workaround exists | Current cycle |
| **P3** | Minor issue, cosmetic | Backlog |

---

## Proposals System

**Purpose:** Structured process for complex features requiring cross-team input before implementation.

### When to Use Proposals

Use when a feature:
- Requires input from multiple domain experts
- Has significant business/technical impact
- Requires research before implementation
- Needs strategic alignment across the team

### Proposal Lifecycle

```
DRAFT → DISCUSSION → APPROVED → SCHEDULED → IMPLEMENTED
                                     │
                                     └── /po creates Epic/Stories in Jira
```

Proposals live in Confluence under the project's Product Vision & Strategy section.

---

## Retrospective Process (v6.0 — Full Team)

### When to Run

Retrospectives happen at **natural breakpoints**:
- Feature/Epic completion
- Major milestone reached
- Critical incident
- User requests one

### Participants

**Core Team (Always Required)**:

| Agent | Focus Area |
|-------|------------|
| /sm | Process, workflow, metrics, consolidation |
| /po | Product vision, priorities, user value |
| /arch | Technical decisions, patterns, quality |
| /ba | Requirements coverage, user value |
| /be | Backend implementation, TDD, patterns |
| /fe | Frontend implementation, component design |
| /rev | Quality gates, security, review process |
| /qa | Test design, coverage gaps, QA process |
| /e2e | CI/CD, test infrastructure, automation |

**Domain Experts (Conditional)**: /fin (finance), /legal (legal), /mkt (marketing)

### Three Questions Framework

Each agent answers:
1. **What went well?** — Successes, practices to continue
2. **What could be improved?** — Pain points, gaps
3. **What should change?** — Process updates, new practices

### Retrospective Outputs

1. **Agent reports** → Confluence (Sprint N — Retrospective)
2. **Consolidated report** → Confluence (by /sm)
3. **Tech debt tickets** → Created in Jira
4. **Process improvements** → Updated in this TEAM_WORKFLOW.md
5. **Skill updates** → Updated in `~/.claude/skills/` (universal knowledge only)
6. **Knowledge capture** → Key learnings stored in AI Team Memory via `memory_store` (if RAG is configured)

---

## Definition of Done

### Code Complete
- [ ] All acceptance criteria implemented (behavioral AC from Story)
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests written (>60% coverage)
- [ ] All tests passing locally
- [ ] All modules compile successfully
- [ ] No temporary types without consolidation ticket
- [ ] Developer vision and implementation details commented in Jira

### Code Review
- [ ] /rev approved (Jira comment)
- [ ] /rev passed security scan
- [ ] /ui verified UI (if frontend) — Jira comment
- [ ] Architecture constraints verified
- [ ] If deviated from /arch recommendation: reasoning documented in Jira
- [ ] Two-pass review completed (v15.1)

### Testing
- [ ] /qa designed test cases (Confluence Test Plan)
- [ ] /e2e implemented automated tests
- [ ] All E2E tests passing
- [ ] /qa reviewed /e2e tests against approved test cases (Jira comment)
- [ ] /qa signed off on test coverage (Jira comment)

### Documentation
- [ ] Implementation notes in Jira comments
- [ ] Review report in Jira comments
- [ ] Test report in Jira comments
- [ ] Git files updated for agent context preservation

---

## Process Improvements

### From Sprint 4 Retrospective (v4.1)
- Sprint start: Run full `mvn compile` to catch cross-module issues early
- Architecture conditions must have explicit checkboxes verified in code review
- Temporary types require immediate consolidation ticket
- Auth infrastructure first when building API clients
- WireMock stubs saved to `src/test/resources/wiremock/` for shared API mocking

### From Sprint 15 Retrospective (v15.1)
- Pre-implementation filter enumeration
- Post-schema-change query audit
- Two-pass code review as default
- Finance verification in Definition of Done
- Architecture conditions include negative cases
- Fail-loud for audit trail functions
- Feature sprints reserve 15-20% capacity for trailing tech debt

### From Sprint 51 Retrospective (v51.1)
- Widget registration audit for admin pages
- Translation key completeness gate
- Staging visual verification in code review
- Widget DOM count assertions in E2E
- 5 Questions retrospective framework

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 4.0 | 2026-01-10 | Testing workflow: /qa designs, /e2e implements |
| 4.1 | 2026-01-11 | Sprint 4 Retro: DoD, sprint checklists, testing standards |
| 6.0 | 2026-01-12 | Full team retrospectives |
| 15.1 | 2026-02-08 | Sprint 15 Retro: Filter enumeration, two-pass review |
| 51.1 | 2026-02-16 | Sprint 51 Retro: Widget audit, translation gate |
| **7.0** | **2026-02-23** | **Jira/Confluence integration, behavior-only tickets, Ticket Approval Gate, architecture-developer collaboration model, Kanban board, multi-project setup, Confluence space structure, Feature Vision template, full dev process in Jira comments** |
