# Code Review — Feedback Format & Report Template

## Review Feedback Format

### Blocking Issues (Must Fix)
````markdown
#### BLOCKING: [Brief description]
**Location**: `[file]:[line]`
**AC Reference**: [Which acceptance criterion this violates, if applicable]
**Problem**: [Explanation of the issue]
**Security Risk**: [If applicable]
**Fix Required**:
```[language]
// Before
[problematic code]

// After
[code fix]
```
````

### Warnings (Should Fix)
````markdown
#### WARNING: [Brief description]
**Location**: `[file]:[line]`
**Problem**: [Explanation -- why this matters for code health]
**Recommended Change**:
```[language]
[suggested code]
```
````

### Suggestions (Could Improve)
````markdown
#### SUGGESTION: [Brief description]
**Location**: `[file]:[line]`
**Rationale**: [Why this would improve the code]
**Consider**:
```[language]
[suggested code]
```
````

### Nits (Minor/Optional)
```markdown
#### NIT: [Brief description]
**Location**: `[file]:[line]`
**Note**: [Style preference or minor improvement]
```

### Questions (Need Clarification)
```markdown
#### QUESTION: [Question]
**Location**: `[file]:[line]`
**Context**: [Why you need this answered to continue the review]
```

### Praise (Good Practices)
```markdown
#### PRAISE: [Brief description]
**Location**: `[file]:[line]`
**Why**: [What makes this good -- helps reinforce positive patterns]
```

## Review Report Template

```markdown
# Code Review Report

**Reviewer**: /rev
**Date**: YYYY-MM-DD
**PR/Branch**: [link or name]
**Developer**: [/fe or /be]
**Jira Ticket**: [TICKET-ID]

## Requirements Verification

| Source | Reviewed | Status |
|--------|----------|--------|
| Behavioral AC (Jira) | Y/N | All covered / Gaps found |
| Architecture (/arch Jira comment) | Y/N | Compliant / Deviations found |
| Architecture (Confluence ADR) | Y/N/N/A | Compliant / Deviations found |
| Finance (/fin) | Y/N/N/A | Rules implemented correctly |
| Legal (/legal) | Y/N/N/A | Compliance verified |
| UI Design (/ui) | Y/N/N/A | Matches specs |

### Architecture Compliance Check

| /arch Recommendation | Implementation | Status |
|---------------------|----------------|--------|
| [recommendation] | [what was implemented] | COMPLIANT / DEVIATION (documented) / DEVIATION (undocumented - BLOCKING) |

### AC Coverage Matrix

| AC # | Description (Given/When/Then) | Implemented | Tested | Notes |
|------|-------------------------------|-------------|--------|-------|
| AC-1 | [behavioral criterion] | Y/N | Y/N | [notes] |
| AC-2 | [behavioral criterion] | Y/N | Y/N | [notes] |

## Code Quality Summary

| Category | Status |
|----------|--------|
| Requirements Match | PASS / GAPS / FAIL |
| Code Quality | PASS / ISSUES / FAIL |
| Security | PASS / ISSUES / FAIL |
| Tests | PASS / ISSUES / FAIL |
| Style | PASS / ISSUES / FAIL |
| Architecture Compliance | PASS / ISSUES / FAIL |

## Blocking Issues (X)

[List blocking issues with severity labels]

## Warnings (X)

[List warnings]

## Suggestions (X)

[List suggestions]

## Nits (X)

[List minor items]

## Praise (X)

[Acknowledge good code and patterns]

## Security Scan Results

| Scanner | Status | Findings |
|---------|--------|----------|
| Grype | PASS/FAIL | X critical, Y high |
| Trivy | PASS/FAIL | X findings |
| npm audit | PASS/FAIL | X vulnerabilities |

## Review Assumptions

- [What I assumed about the AC's correctness]
- [What I could NOT verify without running the code]
- [Adjacent code I did NOT review but has potential concerns]

## Verdict

- [ ] **APPROVED** -- Code improves system health. Ready for QA (/qa, /e2e)
- [ ] **APPROVED WITH SUGGESTIONS** -- Can merge; consider non-blocking feedback
- [ ] **CHANGES REQUESTED** -- Fix blocking issues and re-submit
- [ ] **NEEDS DISCUSSION** -- Escalate to /arch or /po for decision
```

