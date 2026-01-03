# AI Development Team Workflow

This document defines the standard workflow for the AI development team, ensuring quality, accountability, and proper handoffs between team members.

## Team Roles Overview

| Agent | Role | Responsibility |
|-------|------|----------------|
| `/po` | Product Owner | Vision, backlog, feature prioritization |
| `/sm` | Scrum Master | Sprint planning, acceptance criteria, status tracking |
| `/ui` | UI Designer | Design specs, UI components, visual assets |
| `/arch` | Solution Architect | Architecture, patterns, technical decisions |
| `/fe` | Frontend Developer | React/TypeScript implementation + unit/integration tests |
| `/be` | Backend Developer | Java/Kotlin/Spring implementation + unit/integration tests |
| `/rev` | Code Reviewer | Code quality, security, style, vulnerability scanning |
| `/qa` | Test Case Designer & QA | Test specs, reproduction tests, coverage review, manual testing when requested |
| `/e2e` | Test Automation Engineer | Integration, E2E, performance tests implementation |
| `/ba` | Business Analyst | Market research, requirements analysis |
| `/mkt` | Marketing Strategist | GTM strategy, product positioning |

---

## Context Preservation System (CRITICAL)

**Purpose**: All approvals, decisions, and reports MUST be saved to files to preserve context across conversations. This is mandatory for team continuity.

### Sprint Folder Structure

Every sprint gets a dedicated working folder:

```
docs/sprints/
├── sprint-{N}-{feature-name}/              # Sprint working folder
│   ├── README.md                           # Sprint overview + live status
│   ├── DECISION_LOG.md                     # All key decisions with rationale (REQUIRED)
│   │
│   ├── approvals/                          # Gate approvals (REQUIRED)
│   │   ├── arch-architecture.md            # /arch decisions
│   │   ├── fin-finance.md                  # /fin (if needed)
│   │   ├── legal-compliance.md             # /legal (if needed)
│   │   ├── ba-gap-analysis.md              # /ba pre-implementation review (for P0/P1)
│   │   └── ui-designs/                     # /ui designs
│   │       ├── {TICKET}-{feature}.md
│   │       └── ...
│   │
│   ├── implementation/                     # Dev notes per ticket
│   │   ├── {TICKET}-{feature}.md
│   │   ├── TECH-001-{description}.md       # Technical debt tickets from /rev
│   │   └── ...
│   │
│   ├── reviews/                            # Code review reports
│   │   ├── rev-{TICKET}.md
│   │   └── ...
│   │
│   └── testing/                            # QA & E2E reports
│       ├── qa-{TICKET}.md
│       ├── e2e-{TICKET}.md
│       ├── qa-e2e-review-{TICKET}.md       # /qa E2E review reports
│       └── ...
│
└── SPRINT-STATUS.md                        # Overall sprint tracking
```

### Decision Logging (MANDATORY)

Every sprint folder MUST include a `DECISION_LOG.md` tracking key decisions:

```markdown
# Decision Log: Sprint {N}

| ID | Decision | Category | Rationale | Approved By | Date |
|----|----------|----------|-----------|-------------|------|
| D-001 | Use REST over GraphQL | Architecture | Team familiarity, simpler tooling | /arch | YYYY-MM-DD |
| D-002 | Authorization/capture for payments | Finance | Saves fees on cancellations | /fin | YYYY-MM-DD |
| D-003 | User-sets-price model | Legal | Avoids price-fixing concerns | /legal | YYYY-MM-DD |
```

**Categories**: Architecture, Finance, Legal, Product, Security, Performance

### Agent File Conventions

| Agent | Writes To | When | Triggers /sm |
|-------|-----------|------|--------------|
| `/po` | README.md (goals section) | Sprint planning | Yes |
| `/sm` | README.md, SPRINT-STATUS.md | After each approval, status change | N/A |
| `/arch` | `approvals/arch-architecture.md` | Architecture decisions | **YES** |
| `/fin` | `approvals/fin-finance.md` | Finance/payment approvals | **YES** |
| `/legal` | `approvals/legal-compliance.md` | Legal/compliance approvals | **YES** |
| `/ui` | `approvals/ui-designs/{ticket}.md` | UI specifications | **YES** |
| `/be` | `implementation/{ticket}.md` | Backend implementation notes | Yes (on complete) |
| `/fe` | `implementation/{ticket}.md` | Frontend implementation notes | Yes (on complete) |
| `/rev` | `reviews/rev-{ticket}.md` | Code review reports | Yes |
| `/qa` | `testing/qa-{ticket}.md` | QA test reports | Yes |
| `/e2e` | `testing/e2e-{ticket}.md` | E2E test reports | Yes |

### Auto-Save Rules (MANDATORY)

**Rule 1: Every Approval Must Be Saved**
```
After ANY approval gate completes:
1. Agent saves decision to their designated file
2. Agent explicitly triggers: "/sm - please update sprint status"
3. /sm updates README.md with approval status
```

**Rule 2: Implementation Notes Required**
```
When starting implementation:
1. /fe or /be creates implementation/{ticket}.md
2. Notes include: approach, key decisions, blockers
3. On completion: update file with results + trigger /sm
```

**Rule 3: Reports Are Persistent**
```
All reports (review, QA, E2E) MUST:
1. Be saved to the designated file
2. Include date, status, and findings
3. Trigger /sm to update sprint status
```

### Sprint README.md Template

```markdown
# Sprint {N}: {Feature Name}

**Started**: YYYY-MM-DD
**Status**: 🟡 In Progress | 🟢 Complete | 🔴 Blocked

## Goals
- [ ] Goal 1
- [ ] Goal 2

## Approval Status

| Gate | Agent | Status | File | Date |
|------|-------|--------|------|------|
| Architecture | /arch | ✅ Approved | [Link](approvals/arch-architecture.md) | YYYY-MM-DD |
| Finance | /fin | ⏳ Pending | - | - |
| Legal | /legal | N/A | - | - |
| UI Design | /ui | ✅ Approved | [Link](approvals/ui-designs/) | YYYY-MM-DD |

## Tickets

| Ticket | Description | Dev | Status | Review | QA | E2E |
|--------|-------------|-----|--------|--------|-----|-----|
| ABC-123 | Feature X | /fe | ✅ Done | ✅ | ⏳ | ⏳ |
| ABC-124 | API Y | /be | 🔄 In Progress | - | - | - |

## Blockers
- None currently

## Notes
- Key decisions or context for future reference
```

### Approval File Templates

**Architecture Approval (`approvals/arch-architecture.md`)**:
```markdown
# Architecture Approval: {Feature Name}

**Reviewed By**: /arch
**Date**: YYYY-MM-DD
**Status**: ✅ Approved | ❌ Rejected | ⚠️ Approved with conditions

## Summary
Brief description of architectural decision

## Key Decisions
1. Decision 1 - rationale
2. Decision 2 - rationale

## Patterns Selected
- Pattern 1: Reason
- Pattern 2: Reason

## Database Changes
- Table/field changes if any

## API Changes
- Endpoint changes if any

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Risk 1 | How we handle it |

## Dependencies
- External service X
- Library Y

## Next Steps
- [ ] Proceed to /fin approval (if finance)
- [ ] Proceed to /ui design (if frontend)
- [ ] Proceed to implementation
```

---

## Development Workflow

### Workflow Summary

```
/po → /sm → /arch → [/fin] → [/legal] → [/ui] → /fe and/or /be → /rev + [/ui verify] → /qa + /e2e
Vision  AC   Arch.   Finance  Legal    Design   TDD Dev            Review           Automated Testing

[ ] = Conditional participation based on feature type

**NEW (v4.0)**: Testing workflow updated:
- /qa designs test cases from AC, writes reproduction tests for bugs, reviews coverage
- /e2e implements ALL automated tests (integration, E2E, performance)
- /qa can perform manual testing when requested by anyone (collaborates with /po, /arch)
- Automated tests are preferred - must be repeatable and CI/CD ready
```

### Approval Gates (Before Implementation)

| Gate | Agent | When Required |
|------|-------|---------------|
| Architecture | /arch | **ALWAYS** - all features need architectural approval |
| Finance | /fin | Features involving: payments, billing, accounting, VAT, tax, invoicing |
| Legal | /legal | Features involving: GDPR, privacy, terms, contracts, compliance |
| Gap Analysis | /ba | P0/P1 features - pre-implementation review |
| UI Design | /ui | Features with frontend/UI changes only |

### Gap Analysis Gate (/ba)

For P0/P1 priority features, /ba performs a pre-implementation review:

**Gap Analysis Checklist**:
- [ ] All requirements documented
- [ ] Success metrics defined
- [ ] Edge cases identified
- [ ] Competitive context understood
- [ ] User impact assessed
- [ ] Rollback strategy defined

**Gap Analysis Report Format**:
```markdown
## Pre-Implementation Review: [Feature Name]

**Reviewed By**: /ba
**Date**: YYYY-MM-DD
**Priority**: P0/P1
**Quality Score**: X/10

### Gaps Identified

| Gap | Priority | Status | Resolution |
|-----|----------|--------|------------|
| Missing success metrics | P1 | OPEN | Define before implementation |
| No rollback strategy | P0 | RESOLVED | /arch defined in ADR |

### Recommendations
1. [Recommendation]
2. [Recommendation]

### Verdict
- [ ] **PROCEED** - Ready for implementation (Score >= 8/10)
- [ ] **GAPS TO ADDRESS** - Resolve issues before implementation
```

**Quality Score Threshold**: Features must achieve 8/10 or higher to proceed.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FEATURE DEVELOPMENT FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────┐      ┌─────────┐      ┌─────────┐
   │  /po    │─────▶│  /sm    │─────▶│ /arch   │ ◀── ALWAYS REQUIRED
   │ Vision  │      │Sprint AC│      │Arch.Appr│
   └─────────┘      └─────────┘      └────┬────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │ (if finance)        │                     │ (if legal)
                    ▼                     │                     ▼
              ┌─────────┐                 │               ┌─────────┐
              │  /fin   │                 │               │ /legal  │
              │Finance  │                 │               │ Legal   │
              │Approval │                 │               │Approval │
              └────┬────┘                 │               └────┬────┘
                   │                      │                    │
                   └──────────────────────┼────────────────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │  Ready for Design/Dev │
                              └───────────┬───────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │ (if frontend)                             │ (backend only)
                    ▼                                           │
              ┌─────────┐                                       │
              │  /ui    │                                       │
              │ Design  │────▶ /po approves                     │
              └────┬────┘                                       │
                   │                                            │
                   └──────────────────────┬────────────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │ (frontend)                                │ (backend)
                    ▼                                           ▼
              ┌───────────┐                              ┌───────────┐
              │   /fe     │                              │   /be     │
              │ Frontend  │                              │ Backend   │
              │ TDD Cycle │                              │ TDD Cycle │
              └─────┬─────┘                              └─────┬─────┘
                    │                                          │
                    └──────────────────────┬───────────────────┘
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     │                                           │ (if frontend)
                     ▼                                           ▼
               ┌───────────┐                              ┌───────────┐
               │   /rev    │                              │   /ui     │
               │Code Review│                              │Design QA  │
               │Quality+Sec│                              │Browser MCP│
               └─────┬─────┘                              └─────┬─────┘
                     │                                          │
                     └──────────────────────┬───────────────────┘
                                            │
                             ┌──────────────┴──────────────┐
                             │                             │
                             ▼                             ▼
                       ┌──────────┐                  ┌──────────┐
                       │ Approved │                  │ Rejected │
                       └────┬─────┘                  └────┬─────┘
                            │                             │
                            │                             └──▶ Back to /fe or /be
                            ▼
                      ┌───────────────────────────────────────┐
                      │        AUTOMATED TESTING PHASE        │
                      ├───────────────────────────────────────┤
                      │  /qa designs test cases from AC       │
                      │  /e2e implements automated tests:     │
                      │  • Integration tests (Testcontainers) │
                      │  • E2E tests (Playwright/Cucumber)    │
                      │  • Performance tests (k6)             │
                      │  /qa reviews test coverage            │
                      └─────────────┬─────────────────────────┘
                                    │
                             ┌──────┴──────┐
                             │             │
                             ▼             ▼
                         ┌────────┐   ┌────────┐
                         │ PASSED │   │ FAILED │
                         └───┬────┘   └───┬────┘
                             │            │
                             │            └──▶ /e2e reports to /sm
                             │                 /sm creates fix tickets
                             ▼                 Back to development
                         ┌───────────┐
                         │   /sm     │
                         │Update     │
                         │Sprint     │
                         └─────┬─────┘
                               │
                               └──▶ Technical Writer updates docs
```

## Phase 1: Planning & Design

### 1.1 Product Owner (/po)
- Defines product vision and goals
- Creates and prioritizes backlog
- Provides business context for features
- **Approves UI designs** from /ui before implementation

### 1.2 Scrum Master (/sm)
**CRITICAL**: Must provide for each feature:
- [ ] **Feature Description**: Clear explanation of what the feature does
- [ ] **Acceptance Criteria**: Specific, testable criteria (Given/When/Then)
- [ ] **Test Scenarios**: Key scenarios to validate
- [ ] **Feature Type Tags**: `[frontend]`, `[backend]`, `[finance]`, `[legal]`

```markdown
## Feature: User Login [frontend] [backend]

### Description
Users can log in using email and password to access their account.

### Acceptance Criteria
- [ ] AC-1: Given valid credentials, When user submits login form, Then user is redirected to dashboard
- [ ] AC-2: Given invalid credentials, When user submits login form, Then error message is displayed
- [ ] AC-3: Given 5 failed attempts, When user fails again, Then account is locked for 15 minutes

### Test Scenarios
- Happy path: Valid login
- Error: Invalid email format
- Error: Wrong password
- Error: Non-existent user
- Security: Account lockout
```

### 1.3 Solution Architect (/arch) - ALWAYS REQUIRED
**MANDATORY**: All features require /arch approval before implementation.

- Reviews architectural impact
- Validates patterns and design decisions
- Approves database schema changes
- Approves API contract changes
- Identifies cross-cutting concerns

### 1.4 Conditional Approvals

#### Finance Approval (/fin)
**Required for features involving**: payments, billing, subscriptions, VAT, tax calculations, invoicing, financial reporting, accounting integrations.

- Reviews tax implications
- Validates VAT handling
- Approves payment flows
- Reviews financial calculations

#### Legal Approval (/legal)
**Required for features involving**: GDPR, privacy policies, terms of service, user consent, data retention, contracts, compliance.

- Reviews GDPR compliance
- Validates consent mechanisms
- Approves data handling
- Reviews legal copy

### 1.5 UI Designer (/ui) - Frontend Features Only
**Only involved when feature has `[frontend]` tag**

- Creates design specs based on /po vision
- Gets approval from /po before handoff
- Provides specifications to /fe
- **After implementation**: Verifies UI using Browser MCP

## Phase 2: Development (TDD)

### 2.1 Developers (/fe, /be)
Developers are responsible for ALL tests related to their code:
- **Unit Tests**: Test individual functions/components
- **Integration Tests**: Test component interactions

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

**Developer Testing Standards**:
- Unit test coverage: >80%
- Integration test coverage: >60%
- All tests must pass before code review
- Tests are documentation - write clear test names

## Phase 3: Code Review

### 3.1 Code Reviewer (/rev)
Reviews all code for:

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

**Test Review**:
- [ ] Tests exist and are meaningful
- [ ] Coverage meets threshold
- [ ] Tests follow AAA pattern
- [ ] No test implementation details

**Review Outcomes**:
- **Approved**: Code proceeds to Design QA (if frontend) or QA testing
- **Changes Requested**: Back to developer with specific feedback

### Technical Debt from Code Reviews

Non-blocking suggestions from /rev should be logged as technical debt:

**Process**:
1. /rev identifies improvement that isn't blocking (e.g., "consider extracting utility")
2. /rev marks as "SUGGESTION" in review report
3. /sm creates TECH-XXX ticket in sprint folder
4. Technical debt is prioritized for future sprints

**TECH Ticket Format**:
```markdown
# TECH-XXX: [Description]

**Source**: /rev code review for [TICKET]
**Priority**: Low/Medium/High
**Effort**: Small/Medium/Large
**Sprint**: Backlog

## Description
[What improvement is suggested]

## Files Affected
- `path/to/file.ts` - [specific location]

## Rationale
[Why this would improve the codebase]

## Acceptance Criteria
- [ ] [Criteria]
```

**Technical Debt Rules**:
- Never block a review for Low priority suggestions
- Track all suggestions to prevent accumulation
- Review tech debt backlog at sprint planning

## Phase 3.5: Design QA (Frontend Only)

### 3.5.1 UI Designer (/ui) - Design Verification
**Only for features with frontend changes**

After /fe completes implementation and /rev approves code:

**Using Browser MCP Tools**:
```
1. playwright_navigate → Open deployed/local feature URL
2. playwright_screenshot → Capture current implementation
3. playwright_resize → Test responsive breakpoints (mobile/tablet/desktop)
4. playwright_get_visible_html → Verify component structure
```

**Design QA Checklist**:
- [ ] Layout matches design spec
- [ ] Colors match design system (use color picker if needed)
- [ ] Typography is correct (font, size, weight, line-height)
- [ ] Spacing/margins match design
- [ ] Responsive breakpoints work correctly
- [ ] Animations/transitions as specified
- [ ] Empty/loading/error states implemented
- [ ] Accessibility: focus states, contrast, touch targets

**Design QA Report**:
```markdown
## Design QA Report: [Feature Name]

**Verified By**: Aura
**Date**: YYYY-MM-DD
**Design Spec**: [link to design spec]

### Visual Verification
| Element | Status | Notes |
|---------|--------|-------|
| Layout | ✅/❌ | |
| Colors | ✅/❌ | |
| Typography | ✅/❌ | |
| Spacing | ✅/❌ | |
| Responsive | ✅/❌ | |
| Animations | ✅/❌ | |

### Screenshots
- Desktop: [screenshot]
- Tablet: [screenshot]
- Mobile: [screenshot]

### Issues Found
| Issue | Severity | Description |
|-------|----------|-------------|
| DES-001 | Minor | Button padding too small on mobile |

### Verdict
- [ ] **APPROVED** - Matches design spec
- [ ] **CHANGES NEEDED** - See issues above
```

**Design QA Outcomes**:
- **Approved**: Feature proceeds to /qa QA testing
- **Changes Needed**: Back to /fe with specific visual fixes

## Phase 4: Automated Testing (No Manual Testing)

### 4.1 Test Case Designer (/qa) - NEW ROLE

**PREREQUISITE CHECK**:
Before testing, /qa MUST verify:
- [ ] Feature description exists from /sm
- [ ] Acceptance criteria are defined
- [ ] Test scenarios are documented

**If Missing Information**:
```
/qa → /po: "Feature [X] cannot be tested - missing acceptance criteria"
/sm → Adds missing information
/qa → Proceeds with test design
```

**QA New Responsibilities**:
- Design test cases from acceptance criteria
- Write test specifications for /e2e to implement
- Write reproduction tests for bugs (during investigation)
- Review test coverage after /e2e implements tests
- Validate that tests properly cover acceptance criteria

**Test Case Specification Format**:
```markdown
## Test Specification: [Feature Name]

**Designed By**: QA
**Date**: YYYY-MM-DD
**For Implementation By**: /e2e

### Test Cases from Acceptance Criteria

| Test ID | AC | Test Description | Type | Priority |
|---------|-----|-----------------|------|----------|
| TC-001 | AC-1 | Valid login redirects to dashboard | E2E | High |
| TC-002 | AC-2 | Invalid credentials shows error | E2E | High |
| TC-003 | AC-2 | Email validation error message | Integration | Medium |
| TC-004 | AC-3 | Account lockout after 5 attempts | Integration | High |

### Test Implementation Notes
- TC-001: Use Playwright, verify URL change
- TC-004: Requires test container for database reset

### Edge Cases to Cover
- Empty email/password
- SQL injection attempt
- XSS in error message
```

### 4.2 Test Automation Engineer (/e2e) - EXPANDED ROLE

**E2E Tester now implements ALL automated tests**:

| Test Type | Framework | When |
|-----------|-----------|------|
| **Integration Tests** | JUnit + Testcontainers (backend) | Always |
| **Integration Tests** | Jest + Testing Library (frontend) | Always |
| **E2E Tests** | Playwright (web) | Critical paths |
| **E2E Tests** | Detox (mobile) | Critical paths |
| **Performance Tests** | k6, Artillery | As needed |
| **Visual Regression** | Playwright screenshots | Frontend features |

**E2E Tester's Workflow**:
1. Receive test specifications from /qa
2. Implement automated tests
3. Run tests in CI/CD pipeline
4. Report results with pass/fail status
5. Work with developers to fix flaky tests
6. Maintain DISABLED_TESTS_TRACKER.md for any disabled tests

**Disabled Tests Tracker (MANDATORY)**:
When tests must be disabled, /e2e maintains a DISABLED_TESTS_TRACKER.md:

```markdown
# Disabled Tests Tracker

## Active Disabled Tests

| Test File | Test Name | Disabled Date | Reason | Dependency/Blocker | Target Sprint |
|-----------|-----------|---------------|--------|-------------------|---------------|
| login.spec.ts | TC-003 | 2024-01-01 | Mobile keyboard | Backend API | Sprint X |

## Re-enabled Tests

| Test File | Test Name | Re-enabled Date | Notes |
|-----------|-----------|-----------------|-------|
| checkout.spec.ts | TC-007 | 2024-01-15 | Backend deployed |
```

**Automated Test Report Format**:
```markdown
## Automated Test Report: [Feature Name]

**Implemented By**: E2E Tester
**Date**: YYYY-MM-DD
**Build**: [version/commit]
**CI/CD Run**: [link]

### Test Summary
| Type | Total | Passed | Failed | Skipped |
|------|-------|--------|--------|---------|
| Integration | X | Y | Z | W |
| E2E | X | Y | Z | W |
| Performance | X | Y | Z | W |

### Acceptance Criteria Coverage
| AC | Test IDs | Status |
|----|----------|--------|
| AC-1 | TC-001, TC-002 | ✅ COVERED |
| AC-2 | TC-003, TC-004 | ✅ COVERED |

### Failed Tests
| Test ID | Test Name | Error | Link |
|---------|-----------|-------|------|
| TC-003 | Email validation | Timeout | [trace] |

### Performance Results (if applicable)
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| p95 Response | <500ms | 320ms | ✅ |
| Throughput | >100 rps | 150 rps | ✅ |

### Recommendation
- [X] **PASS** - All automated tests passing
- [ ] **FAIL** - See failed tests above
```

### 4.3 E2E Review by QA

After /e2e implements tests, /qa performs E2E Review to validate coverage:

**E2E Review Checklist**:
- [ ] Test count matches QA specification
- [ ] All acceptance criteria have corresponding tests
- [ ] Disabled tests have valid justification documented
- [ ] Legal/compliance requirements are covered (if applicable)
- [ ] Edge cases are covered

**E2E Review Report Format**:
```markdown
## E2E Review Report: [Feature Name]

**Reviewed By**: /qa
**Date**: YYYY-MM-DD
**E2E Author**: /e2e
**QA Spec**: [link to QA test spec]

### Coverage Verification

| AC | QA Test Cases | E2E Tests | Status |
|----|---------------|-----------|--------|
| AC-1 | 5 | 5 | COVERED |
| AC-2 | 3 | 3 | COVERED |

### Disabled Tests

| Test | Disabled Reason | Acceptable? |
|------|-----------------|-------------|
| TC-X | [justification] | Yes/No |

### Verdict
- [ ] **APPROVED** - E2E tests meet QA coverage requirements
- [ ] **NEEDS MORE TESTS** - See gaps above
```

### 4.4 After Automated Testing

**If ALL TESTS PASS AND E2E REVIEW APPROVED**:
```
/e2e → /qa: "Feature [X] automated tests PASSED"
/qa → Reviews E2E coverage (E2E Review)
/qa → /sm: "Feature [X] E2E review APPROVED"
/sm → Updates sprint status
/sm → Triggers Technical Writer for documentation
```

**If TESTS FAIL**:
```
/e2e → /sm: "Feature [X] automated tests FAILED - see report"
/sm → Creates fix tickets from failures
/sm → Adds tickets to current/next sprint
→ Back to Phase 2 (Development)
```

**If E2E REVIEW FINDS GAPS**:
```
/qa → /e2e: "E2E review - missing tests for [ACs]"
/e2e → Adds missing tests
/e2e → /qa: "Tests added, please re-review"
```

## Phase 5: Test Coverage Review

### 5.1 Test Case Designer (/qa) - Coverage Review

After /e2e implements tests:
- [ ] Verify all AC are covered by tests
- [ ] Verify edge cases are tested
- [ ] Verify error paths are tested
- [ ] Sign off on test coverage

**Coverage Sign-off**:
```markdown
## Test Coverage Sign-off: [Feature Name]

**Reviewed By**: QA
**Date**: YYYY-MM-DD

### Coverage Assessment
| AC | Tests | Edge Cases | Error Paths | Status |
|----|-------|------------|-------------|--------|
| AC-1 | ✅ | ✅ | ✅ | COMPLETE |
| AC-2 | ✅ | ⚠️ Missing | ✅ | NEEDS WORK |

### Verdict
- [ ] **APPROVED** - Test coverage is sufficient
- [ ] **NEEDS MORE TESTS** - See gaps above
```

## Phase 6: Documentation & Release

### 6.1 Technical Writer
- Updates API documentation
- Updates user guides
- Creates release notes

### 6.2 Scrum Master (/sm)
- Updates sprint status
- Marks feature as complete
- Updates velocity metrics

## Workflow Rules

### Rule 1: Architecture Approval Required
All features MUST be approved by /arch before implementation begins.

### Rule 2: No Feature Without Acceptance Criteria
Features cannot proceed to QA without documented acceptance criteria from /sm.

### Rule 3: Developers Own Their Tests
Unit and integration tests are written BY developers, not QA. Developers are accountable for code quality.

### Rule 4: Black Box QA
/qa tests features without code knowledge, purely against requirements. This validates that the feature works for end users.

### Rule 5: Security is Non-Negotiable
/rev must run security scans on every code review. Critical vulnerabilities block release.

### Rule 6: Design QA for Frontend
Frontend features require /ui to verify UI implementation using Browser MCP tools before /qa QA.

### Rule 7: Domain Expert Approval
- Finance features → /fin approval required
- Legal features → /legal approval required

### Rule 8: Reports Close the Loop
Every phase produces a report/status update that triggers the next phase.

## Quick Reference: Who Does What

| Task | Agent | When |
|------|-------|------|
| Write user stories | /po + /sm | Always |
| Write acceptance criteria | /sm | Always |
| Approve architecture | /arch | **Always** |
| Approve finance features | /fin | If `[finance]` tag |
| Approve legal features | /legal | If `[legal]` tag |
| Design UI | /ui | If `[frontend]` tag |
| Write unit tests | /fe or /be | Always (TDD) |
| Write integration tests | /fe or /be | Always (TDD) |
| Implement feature | /fe or /be | Always |
| Review code quality | /rev | Always |
| Review security | /rev | Always |
| Verify UI implementation | /ui | If `[frontend]` tag |
| Black-box testing | /qa | Always |
| E2E tests | /e2e | Always |
| Performance tests | /e2e | As needed |
| Documentation | Technical Writer | After QA pass |
| Sprint tracking | /sm | Always |

## Bug / Issue Workflow

### Reporting a Bug

Use the `/bug` or `/issue` command with a simple description:

```
/bug I see internal server error in /approval page when I move from dashboard to users menu item
/bug Login button doesn't work on mobile Safari
/bug Performance is slow when loading users list with more than 100 entries
```

### Bug Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BUG WORKFLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

   /bug [description] or /issue [description]
         │
         ▼
   ┌─────────────────────────┐
   │ Creates structured bug  │
   │ report (BUG-XXX)        │
   └───────────┬─────────────┘
               │
               ▼
   ┌─────────────────────────┐
   │ /sm creates ticket      │
   │ • Sets priority (P0-P3) │
   │   (consults /po,/arch,  │
   │    user, or suggests    │
   │    based on load)       │
   │ • Assigns investigator: │
   │   /fe, /be, /e2e        │
   │ • Schedules in sprint   │
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
   └─────┬─────┘  │ /qa recommends:      │
         │        │ • Close as "works as  │
         │        │   designed" OR        │
         │        │ • Request more info   │
         │        │   from reporter OR    │
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
   │ Investigation Report    │
   │ created and saved       │
   │ (root cause, fix plan)  │
   └───────────┬─────────────┘
               │
               ▼
   ┌─────────────────────────┐
   │ FIX PHASE (TDD)         │
   │ • Read investigation    │
   │ • Verify repro test     │
   │   still fails           │
   │ • Write unit tests      │
   │   (RED - tests fail)    │
   │ • Implement fix         │
   │   (GREEN - tests pass)  │
   │ • Refactor code         │
   │ • All tests pass        │
   └───────────┬─────────────┘
               │
               ▼
   ┌─────────────────────────┐
   │ /rev reviews fix        │
   │ /e2e runs automated     │
   │ tests (verifies fix)    │
   │ /sm closes ticket       │
   └─────────────────────────┘
```

### Bug Priority Levels

| Priority | Criteria | Response Time |
|----------|----------|---------------|
| **P0** | System down, data loss, security breach | Immediate - drop everything |
| **P1** | Major feature broken, no workaround | Same day fix |
| **P2** | Feature impaired, workaround exists | Current sprint |
| **P3** | Minor issue, cosmetic | Backlog |

### Cannot Reproduce Scenarios

When a bug cannot be reproduced, /qa has several options:

| Scenario | Recommendation | Action |
|----------|----------------|--------|
| **Works as designed** | Close bug | Document why behavior is correct |
| **Insufficient info** | Request more details | Ask reporter for exact steps, environment, data |
| **Environment-specific** | Additional investigation | Check reporter's specific config, device, browser |
| **Intermittent/Flaky** | Mark for monitoring | Add logging, set up alerts, wait for recurrence |
| **Stale report** | Close as outdated | Bug may have been fixed in recent changes |

**Cannot Reproduce Report**:
```markdown
## Cannot Reproduce Report: BUG-XXX

**Reported**: YYYY-MM-DD
**Investigated By**: /qa
**Attempts**: [number of reproduction attempts]
**Environment Tested**: [browsers, devices, data sets]

### Investigation Summary
[What was tried to reproduce the issue]

### Recommendation
- [ ] **CLOSE** - Works as designed / Cannot reproduce
- [ ] **MORE INFO NEEDED** - Request from reporter: [specific questions]
- [ ] **MONITOR** - Add logging and wait for recurrence
- [ ] **FURTHER INVESTIGATION** - Escalate to /arch for architecture review

### Notes
[Any additional context or observations]
```

### Bug Investigation Report Template

```markdown
# Bug Investigation Report: BUG-XXX

**Reported**: YYYY-MM-DD
**Investigated By**: [agent]
**Priority**: P0/P1/P2/P3
**Component**: Frontend / Backend / Mobile / API

## Summary
[Brief description of the bug]

## Root Cause Analysis
[Technical explanation of what's causing the bug]

## Affected Files
- `path/to/file1.ts` - [description of involvement]
- `path/to/file2.kt` - [description of involvement]

## Reproduction Steps
1. Step 1
2. Step 2
3. Expected: [what should happen]
4. Actual: [what happens]

## Reproduction Test (Written by /qa)
```typescript
describe('BUG-XXX', () => {
  it('should [expected behavior]', () => {
    // This test currently FAILS - proves the bug exists
    // After fix, this test MUST pass
  });
});
```

## Proposed Fix
[Description of how to fix the issue]

## Risk Assessment
- **Impact**: Low / Medium / High
- **Regression Risk**: Low / Medium / High
- **Testing Required**: Unit / Integration / E2E / Manual

## Evidence
- Logs: [relevant log snippets]
- Screenshots: [if applicable]
- Network traces: [if applicable]
```

### Bug Workflow Roles

| Phase | Agent | Responsibility |
|-------|-------|----------------|
| Report | User/Any Agent | Describe the issue with `/bug` command |
| Investigation | Claude + Component Expert | Reproduce, find root cause |
| Reproduction Test | /qa | Write failing test that proves bug exists |
| Cannot Reproduce | /qa | Recommend: close, more info, or monitor |
| Ticket Creation | /sm | Prioritize and assign to developer |
| Fix | /fe or /be | Implement fix, ensure test passes |
| Review | /rev | Code quality and security review |
| Verification | /e2e | Run automated tests, confirm fix |
| Closure | /sm | Update sprint, close ticket |

### Bug vs Feature Request

| Type | Command | Workflow |
|------|---------|----------|
| **Bug** | `/bug` or `/issue` | Investigation → Reproduction Test → Fix → Verify |
| **Feature** | Talk to /po | Full feature workflow (design → implement → test) |
| **Enhancement** | Talk to /po | Add to backlog → prioritize → implement |

### Best Practices for Bug Reports

1. **Be Specific**: Include exact steps to reproduce
2. **Include Context**: Browser, device, user role, test data
3. **Expected vs Actual**: What should happen vs what happens
4. **Evidence**: Screenshots, console errors, network responses
5. **Severity**: Is it blocking work? Is there a workaround?
