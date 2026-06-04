# Security — Templates (threat-model · audit · incident reports + secure Dockerfile, rate-limiting)

## Templates

### Security Review Report Template

Output file: `approvals/secops-security.md` in the sprint folder + Confluence Approval Checklist.

```markdown
# Security Review: {Feature Name}

**Reviewed By**: /secops (Soren)
**Date**: YYYY-MM-DD
**Sprint**: {N}
**Ticket(s)**: {IDs}
**Status**: ✅ APPROVED | ⚠️ APPROVED WITH CONDITIONS | ❌ REJECTED

## Threat Model Summary

**Methodology**: STRIDE / PASTA / LINDDUN
**Assets**: {list of assets assessed}
**Trust Boundaries**: {identified boundaries}

## Findings

| # | Severity | Category | Description | Recommendation | Status |
|---|----------|----------|-------------|----------------|--------|
| 1 | 🔴 CRITICAL | {OWASP category} | {description} | {fix} | OPEN/FIXED |
| 2 | 🟠 HIGH | {category} | {description} | {fix} | OPEN/FIXED |
| 3 | 🟡 MEDIUM | {category} | {description} | {fix} | OPEN/FIXED |

## Scanning Results

| Tool | Type | Findings | Status |
|------|------|----------|--------|
| Semgrep | SAST | {count} | {pass/fail} |
| OSV-Scanner | SCA | {count} | {pass/fail} |
| Trivy | Container | {count} | {pass/fail} |
| Checkov | IaC | {count} | {pass/fail} |

## Authentication & Authorization Review

- {findings}

## Data Protection Review

- {findings}

## Compliance Check

| Framework | Requirement | Status |
|-----------|-------------|--------|
| {GDPR/PCI/SOC2} | {requirement} | ✅/❌ |

## Conditions for Approval

- [ ] {condition 1}
- [ ] {condition 2}

## Next Steps

- {action items}
```

### Threat Model Document Template

```markdown
# Threat Model: {System/Feature Name}

**Author**: /secops (Soren)
**Date**: YYYY-MM-DD
**Version**: 1.0
**Methodology**: STRIDE + PASTA

## 1. System Overview

### Description
{Brief description of the system/feature}

### Architecture Diagram
{Mermaid or C4 diagram}

### Data Flow Diagram
{DFD showing trust boundaries, data stores, processes, data flows}

## 2. Assets

| Asset | Classification | CIA Rating |
|-------|---------------|------------|
| {asset} | {Public/Internal/Confidential/Restricted} | C:{H/M/L} I:{H/M/L} A:{H/M/L} |

## 3. Trust Boundaries

| Boundary | From | To | Controls |
|----------|------|----|----------|
| {boundary} | {zone} | {zone} | {auth, encryption, etc.} |

## 4. Threat Analysis (STRIDE)

| ID | Threat | Category | Likelihood | Impact | Risk | Mitigation |
|----|--------|----------|------------|--------|------|------------|
| T-001 | {threat} | {S/T/R/I/D/E} | {H/M/L} | {H/M/L} | {H/M/L} | {control} |

## 5. Attack Scenarios

### Scenario 1: {Name}
- **Attacker profile**: {external/internal, skill level}
- **Attack vector**: {description}
- **Impact**: {description}
- **Mitigations**: {controls}

## 6. Residual Risks

| Risk | Accepted By | Justification | Review Date |
|------|-------------|---------------|-------------|
| {risk} | {person/role} | {why accepted} | {date} |

## 7. Recommendations

1. {Recommendation with priority}
```

### Incident Response Report Template

```markdown
# Incident Response Report: INC-{NNN}

**Severity**: P0/P1/P2/P3
**Date Detected**: YYYY-MM-DD HH:MM UTC
**Date Resolved**: YYYY-MM-DD HH:MM UTC
**Duration**: {hours/minutes}
**Responder**: /secops (Soren)

## 1. Executive Summary
{1-2 sentence summary}

## 2. Timeline

| Time (UTC) | Event |
|------------|-------|
| HH:MM | {event} |

## 3. Root Cause
{Technical root cause analysis}

## 4. Impact Assessment

| Category | Impact |
|----------|--------|
| Data affected | {description} |
| Users affected | {count/scope} |
| Services affected | {list} |
| Financial impact | {estimate} |

## 5. Containment Actions
{What was done to stop the incident}

## 6. Eradication Actions
{What was done to remove the threat}

## 7. Recovery Actions
{What was done to restore normal operations}

## 8. Lessons Learned
{What we learned and what changes}

## 9. Action Items

| # | Action | Owner | Due Date | Status |
|---|--------|-------|----------|--------|
| 1 | {action} | {owner} | YYYY-MM-DD | OPEN |

## 10. Regulatory Notifications

| Authority | Required | Notified | Date |
|-----------|----------|----------|------|
| ICO (GDPR) | Yes/No | Yes/No | YYYY-MM-DD |
| PCI Council | Yes/No | Yes/No | YYYY-MM-DD |
```

### Secure Dockerfile Template

```dockerfile
# Production-ready secure Dockerfile
# Multi-stage build: build stage + minimal runtime

# --- Build Stage ---
FROM eclipse-temurin:21-jdk-jammy@sha256:<pin-digest> AS build
WORKDIR /app

# Copy build files first (better layer caching)
COPY pom.xml mvnw ./
COPY .mvn .mvn
RUN ./mvnw dependency:go-offline -B

# Copy source and build
COPY src src
RUN ./mvnw package -DskipTests -B && \
    # Extract layered JAR for optimal Docker layers
    java -Djarmode=layertools -jar target/*.jar extract --destination extracted

# --- Runtime Stage ---
FROM gcr.io/distroless/java21-debian12:nonroot

WORKDIR /app

# Copy layered JAR (better caching)
COPY --from=build /app/extracted/dependencies/ ./
COPY --from=build /app/extracted/spring-boot-loader/ ./
COPY --from=build /app/extracted/snapshot-dependencies/ ./
COPY --from=build /app/extracted/application/ ./

# Non-root user (65532 = nonroot in distroless)
USER 65532:65532

EXPOSE 8080

# Health check via actuator
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["java", "-cp", "@/app/jib-classpath-file", "org.springframework.boot.loader.launch.JarLauncher", "--actuator-health"]

ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

### Rate Limiting Template (Bucket4j)

```java
@Configuration
public class RateLimitConfig {

    @Bean
    public Bucket4jAutoConfigurationCustomizer rateLimitCustomizer() {
        return configBuilder -> configBuilder
            .baselineBandwidths()
            .addLimit(
                BandwidthBuilder.builder()
                    .capacity(100)
                    .refillGreedy(100, Duration.ofMinutes(1))
                    .build()
            );
    }

    // Per-user rate limiter
    @Bean
    public KeyResolver userKeyResolver() {
        return exchange -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated()) {
                return auth.getName(); // Rate limit per authenticated user
            }
            return exchange.getRequest().getRemoteAddress().getAddress().getHostAddress();
        };
    }
}
```

---

