# Scrum Master — Templates

## Templates

### Sprint Planning Document

```markdown
# Sprint {N}: {Sprint Name}

## Sprint Overview
| Field | Value |
|-------|-------|
| Sprint Number | {N} |
| Start Date | {YYYY-MM-DD} |
| End Date | {YYYY-MM-DD} |
| Working Days | {N} |
| Team Capacity | {hours or points} |

## Sprint Goal
{One clear, measurable goal that the sprint aims to achieve}

## Committed Stories

| Priority | ID | Story | Points | Owner | Status |
|----------|-------|-------|--------|-------|--------|
| P0 | US-001 | {title} | {pts} | {name} | Not Started |

**Total Committed**: {points} points
```

### SPRINT-STATUS.md Template

```markdown
# Sprint Status Tracker

**Project**: {Project Name}
**Current Sprint**: {N}
**Last Updated**: {timestamp}

## Story Progress

| ID | Story | Status | Assignee | Notes |
|----|-------|--------|----------|-------|
| US-001 | {title} | Not Started / In Progress / Done | {name} | {notes} |

## Approval Gates

| Gate | Agent | Status | Date |
|------|-------|--------|------|
| Architecture | /arch | PENDING / APPROVED | |
| Finance | /fin | N/A / PENDING / APPROVED | |
| Legal | /legal | N/A / PENDING / APPROVED | |
| UI Design | /ui | N/A / PENDING / APPROVED | |

## Workflow Progress

| Ticket | AC | Arch | Impl | Review | QA | E2E | Done |
|--------|----|------|------|--------|----|-----|------|
| US-001 | | | | | | | |

## Blockers

| ID | Blocker | Raised | Owner | Status | Resolved |
|----|---------|--------|-------|--------|----------|
| B-001 | {description} | {date} | {name} | Open/Resolved | {date} |

## Activity Log

| Date | Agent | Action | Notes |
|------|-------|--------|-------|
| {date} | /sm | Sprint started | {notes} |
```

### Ticket Template

```markdown
# {TICKET-ID}: {Title}

**Priority**: P0/P1/P2
**Type**: Feature / Bug / Spike / Tech Debt
**Assigned To**: /fe or /be
**Sprint**: {N}
**Depends On**: {other ticket IDs or "None"}
**Source**: {investigation report, expert recommendation, user request}

## Description
{Clear, self-contained description of what needs to be done}

## Acceptance Criteria
- [ ] AC-1: {criterion} [Source: Per /arch R1]
- [ ] AC-2: {criterion} [Source: Per /fin C1]
- [ ] AC-3: {criterion}
- [ ] AC-N: All existing tests pass (regression safety)

## Implementation Details

### Files to Modify
| File | Line(s) | Change |
|------|---------|--------|
| `src/path/to/File.java` | 45-52 | Replace X with Y |

### Before/After

**`src/path/to/File.java:45`**
```java
// Before
{current code}

// After
{new code}
```

### Architecture Conditions (/arch)
- [ ] {condition from architecture approval}
- [ ] {condition from architecture approval}

### Expert Conditions
- [ ] Per /fin: {financial requirement}
- [ ] Per /legal: {legal requirement}

## Test Cases
| ID | Description | Type | Expected Result |
|----|-------------|------|-----------------|
| T-1 | {test} | Unit | {result} |
| T-2 | {test} | Integration | {result} |
| T-3 | {negative test} | Unit | {should NOT happen} |

## Definition of Done
- [ ] All ACs implemented
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] /rev code review passed
- [ ] /qa test cases pass
- [ ] /e2e automated tests pass
```

---

