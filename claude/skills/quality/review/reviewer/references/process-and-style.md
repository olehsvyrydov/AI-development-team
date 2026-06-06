# Code Review — Three-Pass Process, Pre-Approval Checklist & Self-Documenting Code

## Three-Pass Review Process (DEFAULT)

Every code review uses three passes:

### Pass 0: Automated Static Analysis (MANDATORY — Run Before Manual Review)

**Run automated tools FIRST** to catch mechanical bugs that are difficult to detect by eye. This is non-negotiable — tools catch bugs that even senior reviewers miss (e.g., NPE on `@Nullable` returns, resource leaks, threading issues).

**For Java/Kotlin projects** (detected by `pom.xml` or `build.gradle`):

1. **SpotBugs** — bytecode analysis for bugs, NPE, threading, resource leaks:
   ```bash
   mvn compile test-compile com.github.spotbugs:spotbugs-maven-plugin:4.9.8.0:check \
     -Dspotbugs.includeTests=true -Dspotbugs.effort=Max -Dspotbugs.threshold=Low
   ```
   If SpotBugs fails due to unsupported class file version, try the latest plugin version.

2. **Nullable dereference grep scan** — catches framework-specific NPE that SpotBugs misses:
   SpotBugs does NOT detect NPE from Spring/framework `@Nullable` returns (e.g., `ResponseEntity.getBody()`, `HttpHeaders.getContentType()`, `Map.get()`). Use grep to find these patterns in BOTH production and test code:
   ```bash
   # Search changed files for nullable dereference patterns
   grep -rn '\.getBody()\.' src/
   grep -rn '\.getContentType()\.' src/
   grep -rn '\.get(".*")\.' src/   # Map.get() returns @Nullable
   ```
   Every hit must have a preceding null check or `assertNotNull()`. Flag violations as BLOCKING.

3. **PMD** — source-code analysis (works regardless of Java version):
   ```bash
   mvn org.apache.maven.plugins:maven-pmd-plugin:3.26.0:check -Dpmd.includeTests=true
   ```

**For TypeScript/React projects** (detected by `package.json`):
- `npm audit` / `pnpm audit` for dependency vulnerabilities
- ESLint with strict null checks enabled

**For PHP/Laravel projects** (detected by `composer.json`):
- PHPStan at level 8+ for null safety
- `composer audit` for dependency vulnerabilities

**Report all tool findings** in the "Static Analysis Results" section of the review report.
If tools cannot run (version incompatibility, missing config), document the failure and **intensify manual null-safety review in Pass 2**.

### Pass 1: Logic, Security, Code Quality
- Code correctness and readability
- Security vulnerabilities (OWASP Top 10)
- Code smells and anti-patterns
- Test quality and coverage
- Style compliance

### Pass 2: Conditions, Boundaries, Schema
- Architecture conditions verified with explicit file:line references
- Finance/domain conditions verified against expert approvals
- Boundary values tested (empty, null, max, negative)
- Schema compliance: all queries on modified tables respect new filters
- Dead code sweep: no unused parameters, unreachable branches, or speculative utilities
- **Nullable dereference manual scan** — verify grep findings from Pass 0 and scan for patterns tools missed

**Exit Criteria for Pass 2:**
- [ ] Static analysis tools ran (Pass 0) — results documented
- [ ] Nullable dereference scan completed (automated + manual)
- [ ] Dead code sweep performed (flag unused parameters, unreachable code)
- [ ] All filter/exclusion criteria have corresponding negative tests
- [ ] Schema changes audited: all queries on affected tables verified

---

## Checklist Before Approving

- [ ] All behavioral acceptance criteria verified as implemented and tested
- [ ] Architecture compliance checked (/arch guidance followed or deviation documented in Jira)
- [ ] All blocking issues resolved
- [ ] Security scan clean (no critical/high findings)
- [ ] Test coverage meets threshold (>80% unit, >60% integration)
- [ ] Code style compliant with language style guide
- [ ] No code smells remain
- [ ] Documentation updated (if behavior changed)
- [ ] No degradation of overall system code health
- [ ] Three-pass review completed (Pass 0: static analysis tools, Pass 1: logic/security, Pass 2: conditions/boundaries/schema)
- [ ] Static analysis ran and findings documented (SpotBugs, grep nullable scan, PMD)
- [ ] Dead code sweep completed (no unused parameters or speculative utilities)
- [ ] Review report posted as Jira comment AND saved to Git file

### Integration Boundary Checklist (for External APIs)
- [ ] External ID formats validated against official API spec
- [ ] All error paths produce appropriate UI feedback (no success on failure)
- [ ] New data has explicit persistence strategy (not in-memory only)
- [ ] Interface implementations verified complete (all abstract methods)
- [ ] New dependencies in BOTH compile and runtime scopes
- [ ] Soft-delete: all SELECT/DELETE queries on table filter `deleted_at IS NULL`
- [ ] Input filtering: test each filter condition with "filtered item should NOT appear in output"

### Commit Size & Review Threshold
- [ ] Every commit >100 insertions has formal code review
- [ ] No commit exceeds 1,000 insertions or 10 files (split into logical units)
- [ ] Implementation notes exist for non-trivial tickets

### Architecture Condition Verification
- [ ] All architecture conditions from /arch guidance have explicit file:line verification
- [ ] Conditions are checked as individual items, not assumed from general review
- [ ] If developer deviated from /arch recommendation, Jira comment documents reasoning

## Code Quality: Self-Documenting Code

When reviewing code, enforce self-documenting code principles:

### What to Flag as `WARNING`:
- **Obvious comments** -- code like `// increment counter` before `counter++`
- **Commented-out code** -- delete it; version control preserves history
- **Comment noise in tests** -- tests should be readable without inline explanations
- **Comments explaining "what"** -- the code should show what; comments should explain "why" only

### What to Accept:
- **Javadoc on public APIs** -- documents contract, parameters, return values, exceptions
- **"Why" comments** -- explains non-obvious business rules or workarounds
- **TODO with ticket** -- `// TODO: PROJ-123 refactor after X` is acceptable

### Example:
```java
// BAD - obvious comments cluttering code
// Get the user's name
String userName = user.getName();
// Check if name is null
if (userName != null) {
    // Log the name
    log.info("Name: " + userName);
}

// GOOD - self-documenting, no comments needed
String userName = user.getName();
if (userName != null) {
    log.info("Name: {}", userName);
}

// GOOD - "why" comment for non-obvious business rule
// HMRC requires amounts rounded down to whole pence (not standard rounding)
BigDecimal taxableAmount = income.setScale(2, RoundingMode.DOWN);
```

---

