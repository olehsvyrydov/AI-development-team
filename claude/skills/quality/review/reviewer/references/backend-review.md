# Code Review — Backend (Java/Kotlin)

> Loaded by /rev for backend code review (SpotBugs, Checkstyle, SonarQube; Java/Kotlin patterns).


# Backend Code Reviewer [Extends /rev]

## Trigger

Use this skill when /rev is reviewing:
- Java/Kotlin/Spring backend code (`.java`, `.kt`, `pom.xml`, `build.gradle`)
- Backend test code (JUnit, TestRestTemplate, MockMvc)
- Maven or Gradle build configurations

## Context

You are a Senior Backend Code Reviewer with 12+ years of Java experience and deep expertise in static analysis tools. This skill extends `/rev` with Java/Kotlin-specific checklists, nullable dereference patterns, and static analysis tool commands.

## Documentation Lookup (MANDATORY)

Use Context7 MCP and WebSearch before reviewing — see `/rev` for details.

**Example queries:**
- "Spring Boot 4 auto-configuration best practices"
- "JPA 3 query optimization patterns"
- "Spring Security 6 method-level authorization"
- "Jackson 2 serialization configuration"

## Code Quality Tools

### Checkstyle (Style Enforcement)
- **Version**: 12.3.0+
- **Purpose**: Enforce Google Java Style Guide
- **Key Rules**: PascalCase classes, camelCase methods, 4-space indent, 100 char line limit, no wildcard imports

### SpotBugs (Bug Detection)
- **Version**: 4.9.x+
- **Purpose**: Find potential bugs via bytecode analysis
- **Detects**: Null pointer dereferences, infinite loops, resource leaks, synchronization issues, SQL injection patterns

### SonarQube (Comprehensive Analysis)
- **Version**: 10.x+
- **Metrics**: Coverage >80%, duplication <3%, complexity <10/method, tech debt <5%, 0 critical security hotspots

## Static Analysis Commands (/rev runs these in Pass 0 — no project config changes needed)

### SpotBugs (Maven — ad-hoc, no plugin in pom.xml required)
```bash
mvn compile test-compile com.github.spotbugs:spotbugs-maven-plugin:4.9.8.0:check \
  -Dspotbugs.includeTests=true -Dspotbugs.effort=Max -Dspotbugs.threshold=Low
```
Detects: `NP_NULL_ON_SOME_PATH`, `NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE`, `NP_NULL_PARAM_DEREF`, `EI_EXPOSE_REP`, `REC_CATCH_EXCEPTION`, threading issues, resource leaks.

**Java version compatibility:**
- SpotBugs 4.9.8.0+ supports Java 25 (class file version 69)
- SpotBugs 4.9.3.0 does NOT support Java 25 — fails with "Unsupported class file major version 69"
- If SpotBugs fails with class file version error, upgrade the plugin version

**IMPORTANT LIMITATION:** SpotBugs does NOT detect NPE from Spring/framework `@Nullable` returns (e.g., `ResponseEntity.getBody()`, `HttpHeaders.getContentType()`, `Map.get()`). These require the grep-based scan below.

### Nullable Dereference Grep Scan (MANDATORY — SpotBugs misses these)
```bash
# Run on ALL source including tests — these patterns cause NPE at runtime
grep -rn '\.getBody()\.' src/
grep -rn '\.getContentType()\.' src/
grep -rn '\.get("[^"]*")\.' src/          # Map.get() returns @Nullable
```
Every hit must have a preceding `assertNotNull()` or null check on a separate line. If the `.getBody()` call is directly chained with `.get()`, `.contains()`, `.isEmpty()`, `.toString()`, etc., it is a **BLOCKING** finding.

### SpotBugs (Gradle — requires plugin in build.gradle)
```bash
./gradlew spotbugsMain spotbugsTest
```

### PMD (Maven — ad-hoc, source-based — no Java version issues)
```bash
mvn org.apache.maven.plugins:maven-pmd-plugin:3.26.0:check -Dpmd.includeTests=true
```

### Dependency vulnerabilities
```bash
mvn org.owasp:dependency-check-maven:11.1.1:check
```

## Nullable Dereference Detection (CRITICAL)

### Why Two Detection Methods Are Required

1. **SpotBugs** analyzes bytecode and catches NPE patterns where null flows through code. However, it does NOT recognize Spring Framework's `@Nullable` annotations on methods like `ResponseEntity.getBody()`, `HttpHeaders.getContentType()`, or `Map.get()`.

2. **Grep patterns** catch framework-specific nullable returns that SpotBugs misses. This is the PRIMARY defense against the most common NPE pattern in Spring test code.

Both methods are **mandatory** during Pass 0. Neither alone is sufficient.

### Dangerous Patterns — Flag as BLOCKING

| Pattern | Risk | Fix |
|---------|------|-----|
| `response.getBody().method()` | `getBody()` returns `@Nullable` | Extract to var, `assertNotNull()` first |
| `response.getBody().get("key")` | NPE if body is null | Same: assert non-null first |
| `response.getBody().contains("x")` | NPE on null body | Same |
| `response.getBody().isEmpty()` | NPE on null body | Same |
| `response.getHeaders().getContentType().toString()` | `getContentType()` is `@Nullable` | Null-check or use `isCompatibleWith()` |
| `map.get("key").toString()` | `Map.get()` returns `@Nullable` | Null-check or `assertNotNull` |
| `((Type) obj.get("k")).method()` | Chained nullable cast + call | Extract, assert, then cast |
| `optional.get()` without `isPresent()` | NoSuchElementException | Use `orElseThrow()` or check first |

### Correct Pattern
```java
// BAD — NPE if getBody() returns null
assertEquals("UP", response.getBody().get("status"));

// GOOD — null-safe with clear assertion
var body = response.getBody();
assertNotNull(body, "Response body should not be null");
assertEquals("UP", body.get("status"));
```

### How to Detect (Multi-Layered — All Steps Required)
1. **Run SpotBugs** with `includeTests=true` (see command above) — catches bytecode-level NPE, resource leaks, threading bugs
2. **Run grep scan** (see grep commands above) — catches framework `@Nullable` return dereferences that SpotBugs misses
3. **Manual review** during Pass 2 — verify grep findings, catch complex patterns (e.g., nullable stored in variable, then dereferenced later)
4. Report ALL findings in review report under "Static Analysis Results"

### Recommended Project-Level Improvement
For compile-time null safety, recommend projects adopt **NullAway + Error Prone + JSpecify**:
- Spring Boot 4 / Spring Framework 7 uses JSpecify annotations throughout
- NullAway catches null dereferences at compile time with <10% build overhead
- See: spring.io/blog/2025/03/10/null-safety-in-spring-apps-with-jspecify-and-null-away/

## Engineering Standards Enforcement (BLOCKING + Flag)

Enforce these on every backend review. Severity is fixed — do not downgrade.

### 1. Process artifacts in code/Javadoc — BLOCKING

Code and Javadoc must state **facts only**: what the code does, how to use it, parameters, returns, exceptions, side effects. Any internal process reference inside source or Javadoc is a **BLOCKING** finding:

- ticket / issue IDs (e.g. `ABC-1421`)
- decision-record numbers or letters (e.g. `ADR-12`, `ADR-D4`)
- review-condition codes (e.g. `C1`, `D4`)
- agent / persona names, sprint or milestone names, "as discussed in round N"

Grep scan:
```bash
grep -rniE '(//|/\*|\*).*([A-Z]{2,}-[0-9]+|ADR[- ]?[0-9A-Z]+|condition [A-Z][0-9]|sprint [0-9]|round [0-9])' src/
```
Every hit in a comment/Javadoc is BLOCKING — the fact belongs in the commit message or PR, not the artifact.

> **Not a finding:** ticket keys in commit messages or PR descriptions are correct VCS practice — review those, do not block them.

#### BAD vs GOOD Javadoc

```java
// BAD — process artifacts leak into the contract (BLOCKING)
/**
 * Resolves the active tenant for a request (added under ABC-1421, see ADR-D4).
 * Reworked in sprint 7 per review condition C2.
 */
TenantId resolveTenant(HttpServletRequest request);

// GOOD — facts only: behaviour, inputs, outputs, failure mode
/**
 * Resolves the active tenant from the request's authenticated principal.
 *
 * @param request the inbound request; must carry an authenticated principal
 * @return the resolved tenant identifier
 * @throws TenantUnresolvedException if no tenant maps to the principal
 */
TenantId resolveTenant(HttpServletRequest request);
```

### 2. Narration comments — flag

Flag comments that merely restate the next line (`// loop over users`, `// set the flag`). Self-explanatory code needs no narration; keep only non-obvious WHY-comments (workarounds, surprising constraints, deliberate deviations). Require the author to delete the narration or replace it with a genuine WHY.

### 3. Cryptic names — flag

Flag single-letter or abbreviated identifiers outside tiny lambda/loop scope (`d`, `l`, `proc`, `mgr`, `tmp`). Names must carry value/role + action so intent is clear without chasing the definition.

### 4. Non-facts Javadoc — flag

Beyond process artifacts (BLOCKING above), flag Javadoc that narrates history, restates the method name, or omits the actual contract (missing `@param`/`@return`/`@throws` on a non-trivial public API). Javadoc must document the contract, not the journey.

### 5. >6-param constructor without builder — flag

Flag any constructor or record canonical constructor with **more than 6 parameters** that lacks a builder. Require a builder (static builder for records) so call sites are readable and order-independent. Verify the builder validates before invoking the canonical constructor.

### 6. Stream vs loop / algorithmic complexity — flag

Flag an accidental O(n²) (nested `contains` over lists, repeated linear scans) where a `Set`/`Map` lookup applies. Flag eager materialisation of huge inputs. Note: do NOT demand Streams in measured hot paths — an explicit loop there is correct; flag the reverse (a Stream chain in an allocation-sensitive inner loop) only with a performance rationale.

### 7. `static` logic on a DI bean — flag

Flag `static` methods that carry **logic** on a class wired as a DI bean/service. Service logic should be an instance method (polymorphic, mockable, injectable). `static` is acceptable only for genuinely stateless pure utilities (with a documented reason), idiomatic record/value static factories (`builder()`/`from()`/`of()`), and the JVM `main` family. A bean retaining `static` logic helpers is a misplaced-responsibility smell.

### 8. Per-call `Pattern.compile` / unseedable reproducible RNG — flag

Flag `Pattern.compile(...)` invoked per call on a hot path — require a cached `static final`/field/`computeIfAbsent` `Pattern`. Flag `ThreadLocalRandom` used where a reproducible (seeded) sequence is intended — it cannot be seeded; require `SplittableRandom(seed)`. Flag `SecureRandom` used for reproducible (non-security) sequences. Where a reviewer questions a stdlib call's portability, prefer an explicit deterministic algorithm (e.g. Fisher–Yates) over a subtle overload.

## Resolving inline review comments (process)

When a PR already carries **inline review comments**, those comments are the **authoritative checklist** — not a maintainer's higher-level chat themes. Pull every inline comment and resolve each **one-by-one**: either apply the change, or reply on that specific thread with a reasoned explanation. Do this **before or alongside** any holistic refactor — never let a sweeping rewrite silently skip individual threads.

- Treating a chat-level summary as the complete spec **misses** comments that were only raised inline.
- Every inline thread gets a per-thread outcome: a commit that addresses it, or a reply explaining why it stands.
- Reconcile at the end: every open thread is either resolved by a change or answered.

## Java/Kotlin Code Quality Checklist

### Java Specific
- [ ] No Checkstyle violations (Google Java Style)
- [ ] No SpotBugs findings (run with `includeTests=true`)
- [ ] Proper exception handling (specific exceptions, not generic)
- [ ] Transaction boundaries correct
- [ ] No N+1 queries
- [ ] `@Override` annotation on all overriding methods
- [ ] Never ignore caught exceptions (log or rethrow)
- [ ] Static members accessed via class name, not instance
- [ ] No finalizers
- [ ] Null safety: use `Objects.requireNonNull()`, `Optional`, or `@NotNull`
- [ ] String operations in loops use `StringBuilder`
- [ ] Polymorphism preferred over type-checking if/switch chains
- [ ] Resources properly closed (try-with-resources)
- [ ] Class visibility minimized (package-private by default)
- [ ] Check existing framework APIs before adding dependencies
- [ ] No debug statements in production code
- [ ] Incomplete code marked with TODO/FIXME + ticket number

### Kotlin Specific
- [ ] Safe calls (`?.`) instead of `!!` assertions
- [ ] Structured concurrency (no `GlobalScope`)
- [ ] Correct dispatcher usage (IO/Default/Main)
- [ ] No blocking calls on wrong dispatcher (`delay()` not `Thread.sleep()`)
- [ ] Data classes for DTOs and value objects
- [ ] Sealed classes for type-safe hierarchies
- [ ] `let`/`run`/`also`/`apply` used appropriately
- [ ] Value classes for domain primitives (UserId, Price)
- [ ] `asSequence()` for large collection chains
- [ ] Minimal nullable primitives (avoid boxing)

### Kotlin Coroutine Health Audit
- [ ] Structured concurrency (no GlobalScope)
- [ ] Correct dispatcher usage (IO/Default/Main)
- [ ] No blocking calls on wrong dispatcher
- [ ] Proper cancellation handling
- [ ] SupervisorJob for independent failures

## Code Smells (Backend-Specific)

| Smell | Detection | Action |
|-------|-----------|--------|
| N+1 Queries | Loop with DB calls | Use batch/join/fetch join |
| !! Assertion (Kotlin) | Null assertion | Use safe call (?.) or require() |
| GlobalScope (Kotlin) | Unstructured coroutine | Use proper CoroutineScope |
| Mutable shared state | `var` in concurrent code | Use StateFlow/SharedFlow |
| Wrong Dispatcher | IO work on Default | Match dispatcher to workload |
| Nullable primitives | `Int?`, `Long?` | Use non-nullable to avoid boxing |
| Eager collections | map/filter on large lists | Use `asSequence()` |
| Thread.sleep() in coroutine | Blocking call | Replace with `delay()` |

## Security Checklist (Backend)

- [ ] No SQL injection (use parameterized queries)
- [ ] No XSS (sanitize output)
- [ ] Proper authentication/authorization checks
- [ ] Sensitive data not logged (PII, tokens, passwords)
- [ ] Input validation on all endpoints
- [ ] Secrets not hardcoded
- [ ] XML parsers disable external entities (XXE)
- [ ] No deserialization of untrusted data

## Testing Checklist (Backend)

- [ ] Unit tests exist (>80% coverage)
- [ ] Integration tests for critical paths (>60% coverage)
- [ ] Mocks used appropriately
- [ ] No nullable dereference in test assertions (see patterns above)
- [ ] `.getContentType().toString()` guarded with null check — use `isCompatibleWith()` or null-safe wrapper

## A documented pagination cap must be an enforced cap

When a list endpoint's contract (Javadoc, OpenAPI, "returns at most N") claims a bounded result, verify the code path actually clamps: a `null`/missing limit falls back to a default, an over-cap limit is **clamped down** (not rejected with 400 — clamp, don't error), and the underlying query carries a `Pageable`/`LIMIT`. The anti-pattern is a comment promising "bounded" over a `findAllBy…` with no limit (an honesty + DoS gap). Require a test that seeds **more than the cap** and asserts the response size is `≤ cap`, plus one asserting an explicit small limit narrows the page.

## Audit/decision-row review checks

When a feature persists an audit or decision row about some evaluated input (a verdict, a moderation decision, a policy outcome):

- [ ] The row carries the **outcome only** — decision, score, enumerated signal/reason **NAMES** — never the raw evaluated title/body/payload. Long-retention audit tables must not become a copy of sensitive input.
- [ ] A **leak test** queries the row back from the DB and asserts `payload::text` does **not** contain a known-sensitive substring of the input — prove non-leakage at the DB level, not by reading the code.

**Anti-pattern — "auditing the payload, not the verdict":** storing the raw evaluated body/title in the audit row leaks sensitive content into a long-retention table. Persist enumerated names + scores; back it with a DB-level `doesNotContain` assertion.

## Related Skills

- **backend-developer**: Spring Boot best practices, implementation patterns
- **backend-tester**: Test quality review, coverage analysis
- **secops-engineer**: Security review, vulnerability assessment
- **solution-architect**: Architecture pattern validation
