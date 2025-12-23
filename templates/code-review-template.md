# Code Review: {PR Title}

## Review Information

| Field | Value |
|-------|-------|
| PR | #{number} |
| Title | {title} |
| Author | @{author} |
| Reviewer | @{reviewer} |
| Date | {YYYY-MM-DD} |
| Branch | {feature-branch} → {target-branch} |
| Related Issue | #{issue_number} |

## Summary

{Brief summary of what this PR does and why}

## Review Checklist

### Code Quality

- [ ] Code follows project style guidelines
- [ ] No code smells (long methods, large classes, etc.)
- [ ] No duplicate code
- [ ] No dead code or commented-out code
- [ ] Variable and function names are clear and descriptive
- [ ] Complex logic is documented with comments

### Architecture & Design

- [ ] Single Responsibility Principle followed
- [ ] Dependencies are injected (not created internally)
- [ ] No circular dependencies introduced
- [ ] Proper layer separation (Controller → Service → Repository)
- [ ] DTOs used for API (not entities)

### Testing

- [ ] Unit tests exist for new code
- [ ] Test coverage meets requirements (>80%)
- [ ] Edge cases are covered
- [ ] Mocks used appropriately
- [ ] Integration tests for critical paths
- [ ] Tests are readable and maintainable

### Security

- [ ] No secrets or credentials in code
- [ ] Input validation on all user input
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Authentication/authorization checks in place
- [ ] Sensitive data not logged

### Performance

- [ ] No N+1 query issues
- [ ] Appropriate use of caching
- [ ] No unbounded collections
- [ ] Pagination for list endpoints
- [ ] No blocking calls in reactive code

### Documentation

- [ ] Public APIs have documentation
- [ ] Complex logic has comments
- [ ] README updated if needed
- [ ] API documentation (OpenAPI) matches implementation
- [ ] Changelog updated

### Error Handling

- [ ] Exceptions are specific (not generic)
- [ ] Errors are logged with context
- [ ] User-facing errors are safe (no stack traces)
- [ ] Recovery logic where appropriate

## Feedback

### Blocking Issues

{Issues that must be fixed before approval}

#### 🚫 Issue 1: {Brief description}

**Location**: `{file}:{line}`

**Problem**: {Explanation of why this is a problem}

**Fix Required**:
```java
// Before
{problematic code}

// After
{suggested fix}
```

---

#### 🚫 Issue 2: {Brief description}

**Location**: `{file}:{line}`

**Problem**: {Explanation}

**Fix Required**: {Description or code sample}

---

### Suggestions

{Non-blocking improvements that would enhance the code}

#### 💡 Suggestion 1: {Brief description}

**Location**: `{file}:{line}`

**Rationale**: {Why this would improve the code}

**Consider**:
```java
// Could be improved to
{suggested improvement}
```

---

#### 💡 Suggestion 2: {Brief description}

**Location**: `{file}:{line}`

**Rationale**: {Why this would improve the code}

---

### Questions

{Questions about design decisions or implementation choices}

#### ❓ Question 1: {Question}

**Location**: `{file}:{line}`

**Context**: {Why you're asking this question}

---

### Praise

{Positive feedback on good code}

#### ✅ Nice: {What's good}

**Location**: `{file}:{line}`

{Why this is exemplary code that others should learn from}

---

## Test Results

### Unit Tests
- [ ] All passing
- [ ] Coverage: {X}%

### Integration Tests
- [ ] All passing

### E2E Tests
- [ ] All passing (if applicable)

### Manual Testing
- [ ] Tested locally
- [ ] Tested in staging (if applicable)

## Review Decision

- [ ] **Approved** - Ready to merge
- [ ] **Approved with suggestions** - Can merge, consider suggestions
- [ ] **Request changes** - Must address blocking issues
- [ ] **Comment** - Feedback only, no approval decision

## Notes

{Any additional notes, context, or follow-up items}

---

## Follow-up Items

{Items to track after this PR is merged}

| Item | Owner | Priority | Issue |
|------|-------|----------|-------|
| {follow-up task} | @{owner} | P0/P1/P2 | #{issue} |
