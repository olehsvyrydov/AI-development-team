# Code Review — Full Checklist

## Review Checklist

### Code Quality
- [ ] Follows style guide (Google Java Style / Google TS Style)
- [ ] No code smells (see the Code Smells detection table in the main reviewer SKILL)
- [ ] Methods are focused and concise (<20 lines preferred)
- [ ] Classes have single responsibility (<200 lines preferred)
- [ ] SOLID principles followed
- [ ] Clean code practices (meaningful names, no dead code)
- [ ] No over-engineering (solves current problem, not hypothetical future ones)
- [ ] No premature abstraction (duplication is better than wrong abstraction)

### Design & Architecture
- [ ] Change belongs in this location (right module, right layer)
- [ ] Interactions between components are well-designed
- [ ] No circular dependencies introduced
- [ ] Proper layer separation (Controller -> Service -> Repository)
- [ ] DTOs used for API boundaries (not entities)
- [ ] Dependencies injected, not created internally
- [ ] Consistent with patterns established by /arch

### Functionality
- [ ] Code does what the developer intended
- [ ] Code does what the behavioral AC requires (see the AC Validation section in the main reviewer SKILL)
- [ ] Edge cases are handled
- [ ] Concurrency issues considered
- [ ] Error paths are handled gracefully
- [ ] UI changes verified (if applicable -- request /ui design QA)

### Complexity
- [ ] Code is immediately understandable by a new reader
- [ ] No over-engineering or speculative generality
- [ ] Abstractions are justified by actual usage (not future "might need")
- [ ] Functions do one thing well

### Security (CRITICAL -- Non-Negotiable)
- [ ] No SQL injection vulnerabilities (parameterized queries)
- [ ] No XSS vulnerabilities (output encoding, CSP)
- [ ] Input validation present on all boundaries
- [ ] Proper authentication/authorization checks
- [ ] Sensitive data not logged (PII, tokens, passwords)
- [ ] Secrets not hardcoded (use env vars, vaults)
- [ ] No deserialization of untrusted data
- [ ] XML parsers disable external entities (XXE)
- [ ] Dependencies have no known critical CVEs
- [ ] Proper audit logging without sensitive data
- [ ] Run security scanners (see tools)

### RBAC / Permission System Review (when auth/permissions are modified)
- [ ] **Mass assignment protection** -- role/permission fields must NOT be in mass-assignable properties (`$fillable`, `@Column(updatable)`, form inputs) without explicit authorization checks
- [ ] **Self-escalation guard** -- users must not be able to modify their own role or elevate privileges (disable role field when editing own account)
- [ ] **System entity protection** -- seeded/built-in records (system roles, core permissions) must be protected from deletion; bulk delete must skip system records
- [ ] **Permission enforcement completeness** -- every admin resource/page has permission checks; watch for copy-paste bugs where one resource uses another's permission prefix
- [ ] **Idempotent seeders** -- permission data seeders must use `updateOrCreate`/`upsert` patterns, never plain `create` (must be safe to re-run)
- [ ] **Admin role assignment restriction** -- non-admin users must not be able to assign the admin role to others
- [ ] **Dynamic panel access** -- admin panel access checks should query actual permissions, not use hardcoded role slug arrays

### Tests (Unit/Integration — Written by Developers)
- [ ] Unit tests exist (>80% line coverage target)
- [ ] Integration tests for critical paths (>60% coverage)
- [ ] Tests follow AAA pattern (Arrange-Act-Assert)
- [ ] Test names describe the behavior being tested
- [ ] Tests assert behavior, not implementation details
- [ ] Tests actually fail when code breaks (not tautological)
- [ ] Edge cases and error paths have test coverage
- [ ] Tests match acceptance criteria scenarios

### E2E Test Code (Written by /adam — ALSO Reviewed by /rev)
**Test scripts are code.** /adam's E2E test files go through /rev code review just like application code. /rev checks code quality, not test case coverage (that's /rob's job).
- [ ] No duplicated helper functions across spec files — extract to shared helpers
- [ ] No hardcoded credentials in committed files — use env vars loaded from `.env`
- [ ] No silent skipping via runtime `test.skip()` that hides regressions — use explicit `throw` or `test.fail()` when preconditions are missing
- [ ] Regex patterns are precise enough to avoid false positives (e.g., date regex requires 4-digit year)
- [ ] Shared helpers are imported, not copy-pasted between files
- [ ] Selectors are resilient — prefer `data-testid` over fragile DOM structure queries
- [ ] When /rob flags duplication, the fix must **extract and share**, not **copy and align**

### Integration Test Assertion Quality
- [ ] No `.getContentType().toString()` without null check — use `isCompatibleWith()` or null-safe wrapper
- [ ] No "could technically be the same" comments excusing weak assertions — strengthen or redesign
- [ ] No `assertTrue(status == A || status == B)` when implementation enforces one specific status
- [ ] No `assertTrue(a || b)` tautology — if at least one is always true, the assertion provides zero value; use `&&` or `assertEquals`
- [ ] No `assertNotNull(x)` when x should be validated as proper JSON — use `objectMapper.readValue()`
- [ ] Statistical tests (chaos error rates, nullable fields) use 100+ iterations with proper tolerance bands, not 20
- [ ] No duplicate helper methods across test classes — extract to shared utility class
- [ ] `junit-platform.properties` disables parallel execution when tests share server state
- [ ] Test cases designed in docs BEFORE implementation — serves as spec and review checklist

### Nullable Dereference Detection (CRITICAL — All Languages)

**Universal principle: never chain a method/property call on a nullable return value without a null guard first.** This applies to production code AND test code, in every language. A test that throws NPE/TypeError is a broken test, not a passing one.

During Pass 2, scan for chained calls on nullable returns. Language-specific patterns, tools, and commands are in the appropriate sub-skill (see Stack-Specific Sub-Skills below).

### Naming (All Languages)
- [ ] Names clearly communicate purpose
- [ ] Names are not overly abbreviated
- [ ] Names are not excessively long
- [ ] Consistent naming conventions within the codebase
- [ ] No Hungarian notation or type prefixes

### Comments & Documentation
- [ ] Comments explain "why", not "what"
- [ ] Complex algorithms have explanatory comments
- [ ] Regular expressions have comments explaining the pattern
- [ ] Public APIs have documentation
- [ ] README/changelog updated if behavior changes
- [ ] No commented-out code (delete it; git has history)
- [ ] TODOs have ticket numbers (not open-ended)

### Stack-Specific Checklist (MANDATORY)

/rev MUST load the appropriate sub-skill for the tech stack being reviewed. Stack-specific checklists, tools, nullable patterns, and static analysis commands live in these sub-skills:

| Tech Stack | Sub-Skill | File Indicators |
|-----------|-----------|-----------------|
| Java/Kotlin/Spring | `/backend-reviewer` | `.java`, `.kt`, `pom.xml`, `build.gradle` |
| TypeScript/React/Angular | `/frontend-reviewer` | `.ts`, `.tsx`, `.js`, `.jsx`, `package.json` |
| PHP/Laravel | `/php-reviewer` | `.php`, `composer.json` |

**Each sub-skill provides:** language-specific code quality checklist, nullable dereference patterns, static analysis tool commands, and language-specific code smells.

