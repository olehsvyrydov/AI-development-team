# AI Development Team Workflow

This document defines the standard workflow for the AI development team, ensuring quality, accountability, and proper handoffs between team members.

## Team Roles Overview

| Agent | Name | Role | Responsibility |
|-------|------|------|----------------|
| `/max` | Max | Product Owner | Vision, backlog, feature prioritization |
| `/luda` | Luda | Scrum Master | Sprint planning, acceptance criteria, status tracking |
| `/aura` | Aura | UI Designer | Design specs, UI components, visual assets |
| `/jorge` | Jorge | Solution Architect | Architecture, patterns, technical decisions |
| `/finn` | Finn | Frontend Developer | React/TypeScript implementation + unit/integration tests |
| `/james` | James | Backend Developer | Java/Kotlin/Spring implementation + unit/integration tests |
| `/rev` | Rev | Code Reviewer | Code quality, security, style, vulnerability scanning |
| `/rob` | Rob | QA Tester | Black-box testing, feature validation against AC |
| `/adam` | Adam | E2E Tester | End-to-end tests, performance tests |
| `/anna` | Anna | Business Analyst | Market research, requirements analysis |
| `/apex` | Apex | Marketing Strategist | GTM strategy, product positioning |

## Development Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FEATURE DEVELOPMENT FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────┐      ┌─────────┐      ┌─────────┐
   │  /max   │─────▶│ /luda   │─────▶│ /aura   │
   │ Vision  │      │Sprint AC│      │ Design  │
   └─────────┘      └────┬────┘      └────┬────┘
                         │                 │
                         ▼                 ▼
              ┌──────────────────┐    ┌─────────┐
              │ Feature + AC     │◀───│ Approved│
              │ Ready for Dev    │    │ Design  │
              └────────┬─────────┘    └─────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
   ┌───────────┐              ┌───────────┐
   │  /finn    │              │  /james   │
   │ Frontend  │              │ Backend   │
   │ TDD Cycle │              │ TDD Cycle │
   └─────┬─────┘              └─────┬─────┘
         │                           │
         └─────────────┬─────────────┘
                       │
                       ▼
                 ┌───────────┐
                 │   /rev    │
                 │Code Review│
                 └─────┬─────┘
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
      ┌──────────┐          ┌──────────┐
      │ Approved │          │ Rejected │
      └────┬─────┘          └────┬─────┘
           │                     │
           │                     └──▶ Back to /finn or /james
           ▼
     ┌───────────┐
     │   /rob    │
     │Black Box  │
     │  Testing  │
     └─────┬─────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐   ┌────────┐
│ PASSED │   │ FAILED │
└───┬────┘   └───┬────┘
    │            │
    │            └──▶ /rob reports to /luda
    │                 /luda creates fix tickets
    ▼                 Back to development
┌───────────┐
│  /luda    │
│Update     │
│Sprint     │
└─────┬─────┘
      │
      ├──▶ /technical-writer updates docs
      │
      └──▶ /adam writes E2E/perf tests (parallel)
```

## Phase 1: Planning & Design

### 1.1 Product Owner (/max)
- Defines product vision and goals
- Creates and prioritizes backlog
- Provides business context for features

### 1.2 Scrum Master (/luda)
**CRITICAL**: Must provide for each feature:
- [ ] **Feature Description**: Clear explanation of what the feature does
- [ ] **Acceptance Criteria**: Specific, testable criteria (Given/When/Then)
- [ ] **Test Scenarios**: Key scenarios to validate

```markdown
## Feature: User Login

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

### 1.3 UI Designer (/aura)
- Creates design specs based on /max vision
- Gets approval from /max before handoff
- Provides specifications to /finn

## Phase 2: Development (TDD)

### 2.1 Developers (/finn, /james)
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
- **Approved**: Code proceeds to QA testing
- **Changes Requested**: Back to developer with specific feedback

## Phase 4: QA Testing (Black Box)

### 4.1 QA Tester (/rob)

**PREREQUISITE CHECK**:
Before testing, /rob MUST verify:
- [ ] Feature description exists from /luda
- [ ] Acceptance criteria are defined
- [ ] Test scenarios are documented

**If Missing Information**:
```
/rob → /max: "Feature [X] cannot be tested - missing acceptance criteria"
/luda → Adds missing information
/rob → Proceeds with testing
```

**Testing Approach**:
- Black-box testing (no code knowledge required)
- Test against acceptance criteria
- Test based on feature description
- Report defects with reproduction steps

**Test Report Format**:
```markdown
## QA Test Report: [Feature Name]

**Tested By**: Rob
**Date**: YYYY-MM-DD
**Build**: [version/commit]

### Summary
| Total Tests | Passed | Failed | Blocked |
|-------------|--------|--------|---------|
| X           | Y      | Z      | W       |

### Results by Acceptance Criteria
| AC | Description | Status | Notes |
|----|-------------|--------|-------|
| AC-1 | Valid login redirects | PASS | - |
| AC-2 | Invalid credentials error | FAIL | See DEF-001 |

### Defects Found
#### DEF-001: Error message not displayed
- **Severity**: High
- **Steps to Reproduce**:
  1. Enter invalid password
  2. Click login
- **Expected**: Error message shown
- **Actual**: No message, form clears
- **Screenshot**: [link]

### Recommendation
[ ] PASS - Ready for release
[X] FAIL - Requires fixes before release
```

### 4.2 After QA Testing

**If PASSED**:
```
/rob → /luda: "Feature [X] QA testing PASSED"
/luda → Updates sprint status
/luda → Triggers /technical-writer for documentation
/adam → Writes E2E tests (can be parallel)
```

**If FAILED**:
```
/rob → /luda: "Feature [X] QA testing FAILED - see report"
/luda → Creates fix tickets from defects
/luda → Adds tickets to current/next sprint
→ Back to Phase 2 (Development)
```

## Phase 5: E2E & Performance Testing

### 5.1 E2E Tester (/adam)
**Can run in parallel with QA testing**

- Writes Playwright/Detox E2E tests
- Tests critical user journeys
- Runs performance tests (k6, Lighthouse)
- Validates cross-browser compatibility

## Phase 6: Documentation & Release

### 6.1 Technical Writer (/technical-writer)
- Updates API documentation
- Updates user guides
- Creates release notes

### 6.2 Scrum Master (/luda)
- Updates sprint status
- Marks feature as complete
- Updates velocity metrics

## Workflow Rules

### Rule 1: No Feature Without Acceptance Criteria
Features cannot proceed to QA without documented acceptance criteria from /luda.

### Rule 2: Developers Own Their Tests
Unit and integration tests are written BY developers, not QA. Developers are accountable for code quality.

### Rule 3: Black Box QA
/rob tests features without code knowledge, purely against requirements. This validates that the feature works for end users.

### Rule 4: Security is Non-Negotiable
/rev must run security scans on every code review. Critical vulnerabilities block release.

### Rule 5: Reports Close the Loop
Every phase produces a report/status update that triggers the next phase.

## Quick Reference: Who Does What

| Task | Agent |
|------|-------|
| Write user stories | /max + /luda |
| Write acceptance criteria | /luda |
| Design UI | /aura |
| Write unit tests | /finn or /james |
| Write integration tests | /finn or /james |
| Implement feature | /finn or /james |
| Review code quality | /rev |
| Review security | /rev |
| Black-box testing | /rob |
| E2E tests | /adam |
| Performance tests | /adam |
| Documentation | /technical-writer |
| Sprint tracking | /luda |
