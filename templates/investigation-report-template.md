# Investigation Report Template

Use this template when investigating bugs/issues.

---

# Investigation Report: [Bug ID] - [Bug Title]

**Investigator**: [Agent Name]
**Date**: YYYY-MM-DD
**Bug Report**: [Link to original bug report]
**Status**: In Progress / Root Cause Found / Cannot Reproduce / Needs More Info

## Summary

[One paragraph summary of the investigation and findings]

## Root Cause Analysis

### Root Cause

[Detailed description of what is causing the bug]

### Affected Components

| Component | File(s) | Impact |
|-----------|---------|--------|
| [Component name] | `path/to/file.ts` | [Description of impact] |

### Code Location

```
File: path/to/problematic/file.ts
Lines: 45-67
```

```typescript
// Code snippet showing the issue
```

### Why This Happens

[Technical explanation of why the bug occurs]

## Reproduction Test

**Test Status**: Created / Verified Failing

```typescript
// Test that reproduces the bug
// This test MUST fail before the fix and PASS after

describe('Bug [ID]', () => {
  it('should [expected behavior]', async () => {
    // Arrange
    // Act
    // Assert - this currently fails
  });
});
```

**Test Location**: `path/to/test/file.spec.ts`

## Proposed Fix

### Approach

[Description of the fix approach]

### Changes Required

| File | Change Description |
|------|-------------------|
| `path/to/file.ts` | [What needs to change] |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | Low/Med/High | Low/Med/High | [Mitigation strategy] |

## Effort Estimation

| Task | Estimate |
|------|----------|
| Fix Implementation | [X hours] |
| Unit Tests | [X hours] |
| Integration Tests | [X hours] |
| Total | [X hours] |

## Recommendations

### Priority Recommendation

- [ ] **P0 - Critical**: Fix immediately
- [ ] **P1 - High**: Fix in current sprint
- [ ] **P2 - Medium**: Schedule for next sprint
- [ ] **P3 - Low**: Add to backlog

### Additional Notes

[Any other relevant information, related issues, technical debt implications, etc.]

## Checklist

- [ ] Root cause identified
- [ ] Reproduction test created and verified failing
- [ ] Proposed fix documented
- [ ] Risk assessment completed
- [ ] Effort estimated
- [ ] Priority recommended
- [ ] Report submitted to /luda
