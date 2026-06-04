# Security — OWASP Top 10 (Web · API · LLM)

## OWASP Top 10:2025 (Web Applications)

The OWASP Top 10:2025 reflects significant changes from the 2021 edition — supply chain attacks are now a dedicated category, security misconfiguration has moved up, and SSRF has been merged into Broken Access Control.

| Rank | Category | Change from 2021 |
|------|----------|-----------------|
| **A01** | Broken Access Control | Stays #1, now includes SSRF |
| **A02** | Security Misconfiguration | Moved up from #5 |
| **A03** | Software Supply Chain Failures | **NEW** — replaces Injection at #3 |
| **A04** | Injection | Moved down from #3 |
| **A05** | Insecure Design | Same position |
| **A06** | Cryptographic Failures | Moved down from #2 |
| **A07** | Identification and Authentication Failures | Same position |
| **A08** | Software and Data Integrity Failures | Same position |
| **A09** | Security Logging and Monitoring Failures | Same position |
| **A10** | Mishandling of Exceptional Conditions | **NEW** — replaces SSRF |

### A01: Broken Access Control (includes SSRF)

**Description**: Failures in enforcing access policies — users can act outside their intended permissions. SSRF is now included as it's fundamentally an access control failure at the server level.

**Prevention**:
- Deny by default — require explicit grants
- Implement RBAC/ABAC at the service layer, not just UI
- Validate object ownership on every request (prevent IDOR/BOLA)
- Disable directory listing and restrict metadata access
- Rate-limit API requests to reduce automated abuse
- Log and alert on access control failures
- For SSRF: validate and allowlist URLs, block internal ranges (169.254.x.x, 10.x.x.x, etc.)

**Detection**: Semgrep (authorization rules), Burp Suite, OWASP ZAP, custom test cases

### A02: Security Misconfiguration

**Description**: Missing security hardening, unnecessary features enabled, default credentials, overly permissive configurations, missing security headers.

**Prevention**:
- Automate environment configuration (IaC)
- Remove unused features, frameworks, and dependencies
- Review cloud permissions (principle of least privilege)
- Set secure defaults in all environments
- Disable DEBUG mode and detailed error messages in production
- Apply security headers (CSP, HSTS, X-Content-Type-Options)
- Regular configuration audits with Checkov, tfsec, ScoutSuite

**Detection**: Checkov (IaC), ScoutSuite (cloud), Trivy (containers), Nuclei (network)

### A03: Software Supply Chain Failures (NEW)

**Description**: Failures related to insecure dependencies, build pipeline compromise, lack of integrity verification, and malicious packages.

**Prevention**:
- Generate and verify SBOMs (Syft + CycloneDX)
- Implement SLSA framework (provenance + build integrity)
- Pin dependency versions and verify checksums
- Use dependency scanning (OSV-Scanner, Grype, Snyk)
- Sign container images (cosign/sigstore)
- Use lockfiles and verify their integrity
- Monitor for dependency confusion attacks
- Review transitive dependencies

**Detection**: OSV-Scanner, Grype, Snyk, Dependabot, Socket.dev

### A04: Injection

**Description**: User-supplied data sent to an interpreter as part of a command or query — SQL, NoSQL, LDAP, OS command, ORM, expression language.

**Prevention**:
- Use parameterized queries / prepared statements exclusively
- Use ORM frameworks with proper parameter binding
- Allowlist input validation (not blocklist)
- Escape special characters for the specific interpreter
- Apply least-privilege database accounts
- Use LIMIT clauses to prevent mass disclosure

```java
// WRONG — SQL injection vulnerable
String query = "SELECT * FROM users WHERE id = " + userId;

// CORRECT — parameterized query
@Query("SELECT u FROM User u WHERE u.id = :id")
Optional<User> findById(@Param("id") UUID id);
```

**Detection**: Semgrep, SpotBugs+FindSecBugs, SonarQube, SQLMap (DAST)

### A05: Insecure Design

**Description**: Design-level flaws that cannot be fixed by implementation alone — missing threat models, insecure business logic, lack of security requirements.

**Prevention**:
- Threat model every feature before implementation (STRIDE/PASTA)
- Define security user stories alongside functional ones
- Use secure design patterns (defense in depth, fail-safe defaults)
- Apply reference architectures for common security patterns
- Perform abuse case analysis during design

**Detection**: Architecture reviews (/arch + /secops co-advisory), threat model documents

### A06–A10: Summary Table

| Category | Key Prevention | Detection Tool |
|----------|---------------|----------------|
| **A06: Cryptographic Failures** | TLS 1.3, AES-256-GCM, Argon2id, no MD5/SHA-1 | TruffleHog, testssl.sh, Semgrep |
| **A07: Auth Failures** | MFA, rate limiting, credential stuffing protection | Nuclei, custom E2E tests |
| **A08: Integrity Failures** | Code signing, SRI, SBOM verification | cosign, Syft, Sigstore |
| **A09: Logging Failures** | Structured audit logs, SIEM integration, no PII in logs | ELK/Loki queries, log review |
| **A10: Exceptional Conditions** | Graceful error handling, no stack traces in responses, generic error messages | Semgrep, code review |

---

## OWASP API Security Top 10 (2023)

APIs have distinct threat models from web applications. This list applies to REST, GraphQL, gRPC, and WebSocket APIs.

| Rank | Category | Description |
|------|----------|-------------|
| **API1** | Broken Object Level Authorization (BOLA) | Accessing other users' objects by manipulating IDs |
| **API2** | Broken Authentication | Weak auth mechanisms, missing token validation |
| **API3** | Broken Object Property Level Authorization | Exposing sensitive properties, mass assignment |
| **API4** | Unrestricted Resource Consumption | No rate limits, large payloads, expensive queries |
| **API5** | Broken Function Level Authorization | Accessing admin functions as regular user |
| **API6** | Unrestricted Access to Sensitive Business Flows | Automating abuse of business logic (scalping, scraping) |
| **API7** | Server-Side Request Forgery (SSRF) | Making server send requests to unintended locations |
| **API8** | Security Misconfiguration | Missing headers, verbose errors, CORS misconfiguration |
| **API9** | Improper Inventory Management | Undocumented endpoints, old API versions exposed |
| **API10** | Unsafe Consumption of APIs | Trusting third-party API responses without validation |

### API1: BOLA Prevention (Critical)

BOLA is the #1 API vulnerability. Every API endpoint that accepts an object ID must verify ownership.

```java
// WRONG — trusts client-provided ID
@GetMapping("/api/v1/orders/{orderId}")
public OrderResponse getOrder(@PathVariable UUID orderId) {
    return orderService.findById(orderId); // No ownership check!
}

// CORRECT — enforces ownership
@GetMapping("/api/v1/orders/{orderId}")
public OrderResponse getOrder(
        @PathVariable UUID orderId,
        @AuthenticationPrincipal JwtAuthenticationToken token) {
    UUID userId = UUID.fromString(token.getToken().getSubject());
    return orderService.findByIdAndUserId(orderId, userId)
        .orElseThrow(() -> new AccessDeniedException("Not authorized"));
}
```

### API4: Resource Consumption Controls

```java
// Rate limiting per user
@Bean
public RateLimiter userRateLimiter() {
    return RateLimiterConfig.custom()
        .limitForPeriod(100)           // 100 requests
        .limitRefreshPeriod(Duration.ofMinutes(1))
        .timeoutDuration(Duration.ZERO) // Fail fast
        .build();
}

// Request size limits
spring:
  codec:
    max-in-memory-size: 1MB
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 10MB

// Query depth limiting (GraphQL)
// Max depth: 7, max complexity: 200
```

### API Security Checklist

- [ ] BOLA: Every endpoint validates object ownership
- [ ] Authentication: Token validation on every request (not just presence)
- [ ] Mass assignment: Use DTOs, never bind directly to entities
- [ ] Rate limiting: Per-user and per-IP limits on all endpoints
- [ ] Pagination: Enforce max page size (e.g., 100 items)
- [ ] Schema validation: Validate request body against OpenAPI spec
- [ ] CORS: Restrictive origin policy, no wildcards in production
- [ ] Versioning: Deprecate and remove old API versions
- [ ] Input validation: Validate path params, query params, headers
- [ ] Error responses: Generic messages, no internal details

---

## OWASP LLM Top 10 (2025)

AI/LLM applications introduce novel attack vectors. These risks apply to any application integrating LLM APIs, RAG pipelines, or AI agents.

| Rank | Category | Description |
|------|----------|-------------|
| **LLM01** | Prompt Injection | Manipulating LLM behavior via crafted inputs |
| **LLM02** | Sensitive Information Disclosure | LLM revealing confidential training or context data |
| **LLM03** | Supply Chain Vulnerabilities | Compromised models, plugins, or training data |
| **LLM04** | Data and Model Poisoning | Manipulating training data to influence outputs |
| **LLM05** | Improper Output Handling | Trusting LLM output without validation |
| **LLM06** | Excessive Agency | Granting LLM too many permissions or capabilities |
| **LLM07** | System Prompt Leakage | Exposing system instructions to users |
| **LLM08** | Vector and Embedding Weaknesses | Poisoning or manipulating RAG vector stores |
| **LLM09** | Misinformation | LLM generating plausible but false information |
| **LLM10** | Unbounded Consumption | Excessive token usage, resource exhaustion |

### LLM01: Prompt Injection Defense

**Direct injection**: User crafts input that overrides system instructions.
**Indirect injection**: Malicious content in retrieved documents (RAG) influences behavior.

**Defenses**:
- Separate system prompts from user input at the API level
- Input sanitization — strip known injection patterns
- Output filtering — validate LLM responses before presenting to users
- Privilege separation — LLM operates with minimal permissions
- Canary tokens — detect when system prompts are being extracted
- Content Security Policy for LLM outputs (no raw HTML rendering)

### LLM06: Excessive Agency Controls

- **Principle of least privilege**: LLM tools should have minimal permissions
- **Human-in-the-loop**: Require approval for destructive operations
- **Scope limitation**: Restrict which APIs/databases the LLM can access
- **Action logging**: Log every tool call with full context
- **Rate limiting**: Cap the number of actions per session
- **Sandboxing**: Execute LLM-generated code in isolated environments

### LLM Security Checklist

- [ ] System prompts cannot be extracted via user input
- [ ] LLM output is sanitized before rendering (no raw HTML/JS)
- [ ] Tool calls require explicit permission grants
- [ ] Token usage is capped per user/session
- [ ] RAG data sources are trusted and integrity-verified
- [ ] Model versions are pinned and checksummed
- [ ] Fallback behavior defined for when LLM is unavailable
- [ ] PII filtering applied to both inputs and outputs

---

