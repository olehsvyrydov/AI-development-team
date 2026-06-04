# Checkpoint 3: Implementation Audit

> Run after code is written, BEFORE marking the feature as "done."
> CRITICAL: This checkpoint uses ACTUAL codebase inspection. Run real commands. Never trust claims.

## 3.1 Code vs Specification

For each item in the dev feature document, run verification:

### §6.1 New Classes
```bash
# For each class listed, verify it exists
find . -type f -name "ClassName.*" | grep -v node_modules | grep -v target
```

### §6.2 Modified Classes
```bash
# Verify modifications were made
git diff --name-only $(git merge-base HEAD main)..HEAD | grep "ClassName"
```

### §6.3 Configuration
```bash
# Verify config properties exist
grep -rn "property.name" src/ config/ *.yml *.el *.json
```

### §6.4 Dependencies
```bash
# Verify in build file
grep "dependency-name" pom.xml package.json Cask Makefile requirements.txt
```

### §6.5 Database Migrations
```bash
# Verify migration files exist
find . -name "V*__*" -o -name "*migration*" | grep -v node_modules
```

### §6.6 API Endpoints
```bash
# Verify controller/handler methods
grep -rn "endpoint-path\|@PostMapping\|@GetMapping\|defun.*handler" src/ *.el
```

**Report format for each item:**
```
[FOUND] ClassName.java at src/main/java/.../ClassName.java
[MISSING] ClassName.java — not found in codebase
```

## 3.2 E2E Test Coverage Audit

For every scenario in §3b:

```bash
# Search for scenario references in test files
grep -rn "SC-HP-01\|scenario_name\|test_name" test/ src/test/ spec/
```

Build the matrix:

| Scenario ID | Priority | Test File | Test Method | Found | Passes |
|-------------|----------|-----------|-------------|-------|--------|
| SC-HP-01 | Must | ? | ? | Yes/No | ? |
| SC-ERR-01 | Must | ? | ? | Yes/No | ? |
| SC-SEC-01 | Must | ? | ? | Yes/No | ? |

**Rules:**
- ALL "Must" scenarios must have passing tests
- "Should" scenarios need justification if skipped
- Missing "Must" test = ❌ BLOCKER

## 3.3 Unit Test Audit

Cross-reference §8.1 (unit test plan) with actual tests:

| Class Under Test | Scenario | Test Exists | Passes |
|------------------|----------|-------------|--------|
| ServiceClass | Happy path | ? | ? |
| ServiceClass | Error case | ? | ? |
| MapperClass | All fields | ? | ? |

```bash
# Search for test classes
find . -name "*Test.java" -o -name "*test.el" -o -name "*.test.ts" | grep -v node_modules
# Then grep for specific test methods/scenarios
grep -rn "@Test\|@DisplayName\|ert-deftest\|describe\|it(" [test-file]
```

## 3.4 Edge Case Audit (10 Standard Checks)

These are the items MOST OFTEN SKIPPED:

| # | Edge Case | Search Patterns | Found |
|---|-----------|----------------|-------|
| 1 | Null/empty input | `null`, `empty`, `blank`, `nil` in test files | ? |
| 2 | Duplicate (idempotency) | `duplicate`, `idempoten`, `already exists`, `conflict` | ? |
| 3 | External service 5xx | `5xx`, `500`, `service unavailable`, `WireMock`, `mock-server` | ? |
| 4 | Timeout | `timeout`, `timed out`, `deadline` | ? |
| 5 | Payload too large | `too large`, `max size`, `payload`, `413` | ? |
| 6 | Concurrent requests | `concurrent`, `parallel`, `thread`, `race` | ? |
| 7 | Invalid auth token | `unauthorized`, `401`, `invalid token`, `expired` | ? |
| 8 | Insufficient role | `forbidden`, `403`, `insufficient`, `denied` | ? |
| 9 | Kafka offset failure | `offset`, `commit fail`, `rebalance` | ? |
| 10 | DB pool exhausted | `pool`, `connection`, `exhausted`, `max active` | ? |

```bash
# Run for each edge case
grep -rn "PATTERN" test/ src/test/ spec/
```

## 3.5 "Done When" Verification

For EACH criterion in §3 (Done Criteria):

| Done Criterion | Evidence Type | Evidence | Status |
|----------------|--------------|----------|--------|
| "User can submit X" | Test SC-HP-01 passes | `grep -rn "SC-HP-01" test/` | ? |
| "Event published to Kafka" | Integration test | `grep -rn "kafka\|publish" test/` | ? |
| "API < 200ms p95" | SC-PERF-01 result | Performance test output | ? |
| "JWT required" | SC-SEC-01 + SC-SEC-02 | `grep -rn "401\|403" test/` | ? |

**Rule: Every item needs CONCRETE evidence. "I think it works" is NOT evidence.**

## 3.6 Security Audit

```bash
# 1. Auth on endpoints
grep -rn "@PreAuthorize\|@Secured\|@RolesAllowed\|auth.*middleware\|:auth" src/ *.el

# 2. Hardcoded secrets (MUST find 0 results)
grep -rni "password\s*=\|secret\s*=\|api.key\s*=\|api_key\s*=\|token\s*=" src/ *.el \
  --include="*.java" --include="*.el" --include="*.ts" --include="*.py" \
  | grep -v test | grep -v ".class" | grep -v "node_modules"

# 3. Input validation
grep -rn "@Valid\|@NotNull\|@NotBlank\|@Size\|cl-check-type\|zod\.\|yup\." src/

# 4. SQL injection risk (string concatenation in queries)
grep -rn "\".*+.*sql\|format.*sql\|concat.*query\|string-append.*sql" src/ *.el
```

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Auth on all endpoints | All controllers | ? | ? |
| No hardcoded secrets | 0 matches | ? | ? |
| Input validation present | All DTOs/inputs | ? | ? |
| No SQL injection risk | 0 matches | ? | ? |

## 3.7 Observability Audit

For each metric in §10:
```bash
grep -rn "metric.name" src/ *.el
```

For structured logging:
```bash
grep -rn "MDC\|log\.info\|log\.error\|log\.warn\|message.*log" src/ *.el
```

| Metric/Log | Expected | Found In Code | Status |
|------------|----------|---------------|--------|
| metric.name.1 | Counter | ? | ? |
| metric.name.2 | Timer | ? | ? |
| INFO: request received | Log entry | ? | ? |
| ERROR: processing failed | Log entry | ? | ? |

## 3.8 Deployment Readiness

| # | Check | How to Verify | Status |
|---|-------|---------------|--------|
| 1 | Migration files exist | `find . -name "V*__*"` | ? |
| 2 | Env vars documented in §11 | Compare §11 with actual config | ? |
| 3 | Kafka topics listed | §11 vs config files | ? |
| 4 | Secrets provisioned | §11 lists all secrets needed | ? |
| 5 | Feature flag configured | §11 flag name if applicable | ? |
| 6 | Rollback documented | §11 rollback plan present | ? |
| 7 | E2E tests pass | Run `make test` or equivalent | ? |
| 8 | Dashboards referenced | §10 links to monitoring | ? |
| 9 | Alert rules defined | §10 alerting section filled | ? |
