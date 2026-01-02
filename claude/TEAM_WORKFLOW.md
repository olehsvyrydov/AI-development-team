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
| `/rob` | Rob | Test Case Designer & QA | Test specs, reproduction tests, coverage review, manual testing when requested |
| `/adam` | Adam | Test Automation Engineer | Integration, E2E, performance tests implementation |
| `/anna` | Anna | Business Analyst | Market research, requirements analysis |
| `/apex` | Apex | Marketing Strategist | GTM strategy, product positioning |

## Development Workflow

### Workflow Summary

```
/max → /luda → /jorge → [/inga] → [/alex] → [/aura] → /finn and/or /james → /rev + [/aura verify] → /rob + /adam
Vision   AC    Arch.    Finance   Legal    Design     TDD Dev              Review            Automated Testing

[ ] = Conditional participation based on feature type

**NEW (v4.0)**: Testing workflow updated:
- /rob designs test cases from AC, writes reproduction tests for bugs, reviews coverage
- /adam implements ALL automated tests (integration, E2E, performance)
- /rob can perform manual testing when requested by anyone (collaborates with /max, /jorge)
- Automated tests are preferred - must be repeatable and CI/CD ready
```

### Approval Gates (Before Implementation)

| Gate | Agent | When Required |
|------|-------|---------------|
| Architecture | /jorge | **ALWAYS** - all features need architectural approval |
| Finance | /inga | Features involving: payments, billing, accounting, VAT, tax, invoicing |
| Legal | /alex | Features involving: GDPR, privacy, terms, contracts, compliance |
| UI Design | /aura | Features with frontend/UI changes only |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FEATURE DEVELOPMENT FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────┐      ┌─────────┐      ┌─────────┐
   │  /max   │─────▶│ /luda   │─────▶│ /jorge  │ ◀── ALWAYS REQUIRED
   │ Vision  │      │Sprint AC│      │Arch.Appr│
   └─────────┘      └─────────┘      └────┬────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │ (if finance)        │                     │ (if legal)
                    ▼                     │                     ▼
              ┌─────────┐                 │               ┌─────────┐
              │ /inga   │                 │               │ /alex   │
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
              │ /aura   │                                       │
              │ Design  │────▶ /max approves                    │
              └────┬────┘                                       │
                   │                                            │
                   └──────────────────────┬────────────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │ (frontend)                                │ (backend)
                    ▼                                           ▼
              ┌───────────┐                              ┌───────────┐
              │  /finn    │                              │  /james   │
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
               │   /rev    │                              │  /aura    │
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
                            │                             └──▶ Back to /finn or /james
                            ▼
                      ┌───────────────────────────────────────┐
                      │        AUTOMATED TESTING PHASE        │
                      ├───────────────────────────────────────┤
                      │  /rob designs test cases from AC      │
                      │  /adam implements automated tests:    │
                      │  • Integration tests (Testcontainers) │
                      │  • E2E tests (Playwright/Cucumber)    │
                      │  • Performance tests (k6)             │
                      │  /rob reviews test coverage           │
                      └─────────────┬─────────────────────────┘
                                    │
                             ┌──────┴──────┐
                             │             │
                             ▼             ▼
                         ┌────────┐   ┌────────┐
                         │ PASSED │   │ FAILED │
                         └───┬────┘   └───┬────┘
                             │            │
                             │            └──▶ /adam reports to /luda
                             │                 /luda creates fix tickets
                             ▼                 Back to development
                         ┌───────────┐
                         │  /luda    │
                         │Update     │
                         │Sprint     │
                         └─────┬─────┘
                               │
                               └──▶ /technical-writer updates docs
```

## Phase 1: Planning & Design

### 1.1 Product Owner (/max)
- Defines product vision and goals
- Creates and prioritizes backlog
- Provides business context for features
- **Approves UI designs** from /aura before implementation

### 1.2 Scrum Master (/luda)
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

### 1.3 Solution Architect (/jorge) - ALWAYS REQUIRED
**MANDATORY**: All features require /jorge approval before implementation.

- Reviews architectural impact
- Validates patterns and design decisions
- Approves database schema changes
- Approves API contract changes
- Identifies cross-cutting concerns

### 1.4 Conditional Approvals

#### Finance Approval (/inga)
**Required for features involving**: payments, billing, subscriptions, VAT, tax calculations, invoicing, financial reporting, accounting integrations.

- Reviews tax implications
- Validates VAT handling
- Approves payment flows
- Reviews financial calculations

#### Legal Approval (/alex)
**Required for features involving**: GDPR, privacy policies, terms of service, user consent, data retention, contracts, compliance.

- Reviews GDPR compliance
- Validates consent mechanisms
- Approves data handling
- Reviews legal copy

### 1.5 UI Designer (/aura) - Frontend Features Only
**Only involved when feature has `[frontend]` tag**

- Creates design specs based on /max vision
- Gets approval from /max before handoff
- Provides specifications to /finn
- **After implementation**: Verifies UI using Browser MCP

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
- **Approved**: Code proceeds to Design QA (if frontend) or QA testing
- **Changes Requested**: Back to developer with specific feedback

## Phase 3.5: Design QA (Frontend Only)

### 3.5.1 UI Designer (/aura) - Design Verification
**Only for features with frontend changes**

After /finn completes implementation and /rev approves code:

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
- **Approved**: Feature proceeds to /rob QA testing
- **Changes Needed**: Back to /finn with specific visual fixes

## Phase 4: Automated Testing (No Manual Testing)

### 4.1 Test Case Designer (/rob) - NEW ROLE

**PREREQUISITE CHECK**:
Before testing, /rob MUST verify:
- [ ] Feature description exists from /luda
- [ ] Acceptance criteria are defined
- [ ] Test scenarios are documented

**If Missing Information**:
```
/rob → /max: "Feature [X] cannot be tested - missing acceptance criteria"
/luda → Adds missing information
/rob → Proceeds with test design
```

**Rob's New Responsibilities**:
- Design test cases from acceptance criteria
- Write test specifications for /adam to implement
- Write reproduction tests for bugs (during investigation)
- Review test coverage after /adam implements tests
- Validate that tests properly cover acceptance criteria

**Test Case Specification Format**:
```markdown
## Test Specification: [Feature Name]

**Designed By**: Rob
**Date**: YYYY-MM-DD
**For Implementation By**: /adam

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

### 4.2 Test Automation Engineer (/adam) - EXPANDED ROLE

**Adam now implements ALL automated tests**:

| Test Type | Framework | When |
|-----------|-----------|------|
| **Integration Tests** | JUnit + Testcontainers (backend) | Always |
| **Integration Tests** | Jest + Testing Library (frontend) | Always |
| **E2E Tests** | Playwright (web) | Critical paths |
| **E2E Tests** | Detox (mobile) | Critical paths |
| **Performance Tests** | k6, Artillery | As needed |
| **Visual Regression** | Playwright screenshots | Frontend features |

**Adam's Workflow**:
1. Receive test specifications from /rob
2. Implement automated tests
3. Run tests in CI/CD pipeline
4. Report results with pass/fail status
5. Work with developers to fix flaky tests

**Automated Test Report Format**:
```markdown
## Automated Test Report: [Feature Name]

**Implemented By**: Adam
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

### 4.3 After Automated Testing

**If ALL TESTS PASS**:
```
/adam → /luda: "Feature [X] automated tests PASSED"
/rob → Reviews test coverage
/luda → Updates sprint status
/luda → Triggers /technical-writer for documentation
```

**If TESTS FAIL**:
```
/adam → /luda: "Feature [X] automated tests FAILED - see report"
/luda → Creates fix tickets from failures
/luda → Adds tickets to current/next sprint
→ Back to Phase 2 (Development)
```

## Phase 5: Test Coverage Review

### 5.1 Test Case Designer (/rob) - Coverage Review

After /adam implements tests:
- [ ] Verify all AC are covered by tests
- [ ] Verify edge cases are tested
- [ ] Verify error paths are tested
- [ ] Sign off on test coverage

**Coverage Sign-off**:
```markdown
## Test Coverage Sign-off: [Feature Name]

**Reviewed By**: Rob
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

### 6.1 Technical Writer (/technical-writer)
- Updates API documentation
- Updates user guides
- Creates release notes

### 6.2 Scrum Master (/luda)
- Updates sprint status
- Marks feature as complete
- Updates velocity metrics

## Workflow Rules

### Rule 1: Architecture Approval Required
All features MUST be approved by /jorge before implementation begins.

### Rule 2: No Feature Without Acceptance Criteria
Features cannot proceed to QA without documented acceptance criteria from /luda.

### Rule 3: Developers Own Their Tests
Unit and integration tests are written BY developers, not QA. Developers are accountable for code quality.

### Rule 4: Black Box QA
/rob tests features without code knowledge, purely against requirements. This validates that the feature works for end users.

### Rule 5: Security is Non-Negotiable
/rev must run security scans on every code review. Critical vulnerabilities block release.

### Rule 6: Design QA for Frontend
Frontend features require /aura to verify UI implementation using Browser MCP tools before /rob QA.

### Rule 7: Domain Expert Approval
- Finance features → /inga approval required
- Legal features → /alex approval required

### Rule 8: Reports Close the Loop
Every phase produces a report/status update that triggers the next phase.

## Quick Reference: Who Does What

| Task | Agent | When |
|------|-------|------|
| Write user stories | /max + /luda | Always |
| Write acceptance criteria | /luda | Always |
| Approve architecture | /jorge | **Always** |
| Approve finance features | /inga | If `[finance]` tag |
| Approve legal features | /alex | If `[legal]` tag |
| Design UI | /aura | If `[frontend]` tag |
| Write unit tests | /finn or /james | Always (TDD) |
| Write integration tests | /finn or /james | Always (TDD) |
| Implement feature | /finn or /james | Always |
| Review code quality | /rev | Always |
| Review security | /rev | Always |
| Verify UI implementation | /aura | If `[frontend]` tag |
| Black-box testing | /rob | Always |
| E2E tests | /adam | Always |
| Performance tests | /adam | As needed |
| Documentation | /technical-writer | After QA pass |
| Sprint tracking | /luda | Always |

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
   │ /luda creates ticket    │
   │ • Sets priority (P0-P3) │
   │   (consults /max,/jorge,│
   │    user, or suggests    │
   │    based on load)       │
   │ • Assigns investigator: │
   │   /finn, /james, /adam  │
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
   └─────┬─────┘  │ /rob recommends:      │
         │        │ • Close as "works as  │
         │        │   designed" OR        │
         │        │ • Request more info   │
         │        │   from reporter OR    │
         │        │ • Mark for monitoring │
         │        └───────────────────────┘
         ▼
   ┌─────────────────────────┐
   │ /rob writes failing     │
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
   │ /adam runs automated    │
   │ tests (verifies fix)    │
   │ /luda closes ticket     │
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

When a bug cannot be reproduced, /rob has several options:

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
**Investigated By**: /rob
**Attempts**: [number of reproduction attempts]
**Environment Tested**: [browsers, devices, data sets]

### Investigation Summary
[What was tried to reproduce the issue]

### Recommendation
- [ ] **CLOSE** - Works as designed / Cannot reproduce
- [ ] **MORE INFO NEEDED** - Request from reporter: [specific questions]
- [ ] **MONITOR** - Add logging and wait for recurrence
- [ ] **FURTHER INVESTIGATION** - Escalate to /jorge for architecture review

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

## Reproduction Test (Written by /rob)
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
| Reproduction Test | /rob | Write failing test that proves bug exists |
| Cannot Reproduce | /rob | Recommend: close, more info, or monitor |
| Ticket Creation | /luda | Prioritize and assign to developer |
| Fix | /finn or /james | Implement fix, ensure test passes |
| Review | /rev | Code quality and security review |
| Verification | /adam | Run automated tests, confirm fix |
| Closure | /luda | Update sprint, close ticket |

### Bug vs Feature Request

| Type | Command | Workflow |
|------|---------|----------|
| **Bug** | `/bug` or `/issue` | Investigation → Reproduction Test → Fix → Verify |
| **Feature** | Talk to /max | Full feature workflow (design → implement → test) |
| **Enhancement** | Talk to /max | Add to backlog → prioritize → implement |

### Best Practices for Bug Reports

1. **Be Specific**: Include exact steps to reproduce
2. **Include Context**: Browser, device, user role, test data
3. **Expected vs Actual**: What should happen vs what happens
4. **Evidence**: Screenshots, console errors, network responses
5. **Severity**: Is it blocking work? Is there a workaround?
