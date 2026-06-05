# QA — Templates (test plan · execution report · defect ticket)

## Test Plan Template (Confluence)

```markdown
# Test Plan: [Feature Name]

**QA Engineer**: /qa
**Date**: YYYY-MM-DD
**Jira Story**: [TICKET-ID]
**Feature Vision**: [Confluence link]

## Scope

### In Scope
- [What will be tested]

### Out of Scope
- [What will NOT be tested and why]

## BDD Specs (from Behavioral AC)

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
Given [initial context/state]
When [boundary action is performed]
Then [expected boundary behavior]

## Test Cases

| ID | Scenario | Steps | Expected Result | Type | BDD Spec |
|----|----------|-------|-----------------|------|----------|
| TC-01 | [scenario] | 1. ... 2. ... | [expected] | Happy path | Scenario 1 |
| TC-02 | [error scenario] | 1. ... 2. ... | [expected error] | Error path | Scenario 2 |
| TC-03 | [edge case] | 1. ... 2. ... | [expected boundary] | Edge case | Scenario 3 |

## Test Data Requirements
- [What test data is needed]

## Environment
- [Required environment setup]
```

## Test Execution Report Template (Jira Comment)

```markdown
# QA Test Report: [Feature Name]

**QA Engineer**: /qa
**Date**: YYYY-MM-DD
**Jira Story**: [TICKET-ID]
**Build/Commit**: [version]
**Environment**: [staging/dev/prod]
**Test Plan**: [Confluence link]

## Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | X |
| Passed | Y |
| Failed | Z |
| Blocked | W |
| Pass Rate | Y/X % |

## Acceptance Criteria Results

| AC ID | Description (Given/When/Then) | Status | Notes |
|-------|-------------------------------|--------|-------|
| AC-1 | [Behavioral criteria] | PASS/FAIL | [Notes] |
| AC-2 | [Behavioral criteria] | PASS/FAIL | [Notes] |

## /e2e Test Review

| Test File | Covers TC | AC Coverage | Status | Notes |
|-----------|-----------|-------------|--------|-------|
| [test file] | TC-01, TC-02 | AC-1, AC-2 | APPROVED / GAPS | [notes] |

**Coverage Assessment**: X/Y test cases covered by automation. [Gaps identified].

## Defects Found

[Link to Jira Bug tickets created]

### BUG-001: [Defect Title] ([TICKET-ID])
- **Severity**: Critical / High / Medium / Low
- **Priority**: Draft (pending /po review)
- **Jira**: [link to Bug ticket]

## Exploratory Testing Notes

[Any additional findings from exploratory testing]

## Recommendation

- [ ] **PASS** - Feature meets acceptance criteria, ready for release
- [ ] **FAIL** - Feature requires fixes (see defects above)
- [ ] **BLOCKED** - Testing blocked by [reason]

## Next Steps

[For PASS]: Tests complete. /sm transition to Done.
[For FAIL]: Bug tickets created in Jira. /sm to manage fix cycle.
```

## Defect Template (Jira Bug Ticket)

```markdown
## Bug Report

**Found By**: /qa
**Story**: [TICKET-ID]
**Environment**: [staging/dev]
**Severity**: Critical / High / Medium / Low
**Priority**: Draft (pending /po review)

## Description
[Brief description of the defect]

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Result
[What should happen]

## Actual Result
[What actually happened]

## Evidence
[Screenshots, logs, error messages]

## Reproduction Test
[If applicable: the failing test that reproduces this bug]

## Related
- Story: [TICKET-ID]
- Test Plan: [Confluence link]
```

