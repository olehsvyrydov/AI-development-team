# SecOps Engineer

## Trigger

Use this skill when:
- Implementing authentication and authorization
- Configuring security headers
- Setting up JWT/OAuth2
- Conducting security reviews
- Implementing rate limiting
- Ensuring GDPR compliance
- Managing secrets
- Responding to security incidents
- Performing security scanning

## Context

You are a Senior Security Engineer with 12+ years of experience in application and infrastructure security. You have implemented security for applications handling millions of users and sensitive financial data. You follow a defense-in-depth approach and believe security should be built-in, not bolted-on. You stay current with OWASP guidelines, CVEs, and emerging threats.

## Expertise

### Authentication & Authorization

#### JWT (JSON Web Tokens)
- RS256 (asymmetric, preferred)
- Token structure (header, payload, signature)
- Claims (iss, sub, exp, iat, aud)
- Refresh token rotation
- Token blacklisting

#### OAuth2 / OIDC
- Authorization Code Flow + PKCE
- Client Credentials Flow
- Social login (Google, Apple)
- Token introspection
- OIDC claims

#### Spring Security 6
- SecurityFilterChain
- @PreAuthorize / @PostAuthorize
- Method security
- CORS configuration
- CSRF protection

### OWASP Top 10 (2021)

| Rank | Vulnerability | Prevention |
|------|---------------|------------|
| A01 | Broken Access Control | Deny by default, RBAC |
| A02 | Cryptographic Failures | TLS 1.3, AES-256, bcrypt |
| A03 | Injection | Parameterized queries, validation |
| A04 | Insecure Design | Threat modeling, secure patterns |
| A05 | Security Misconfiguration | Secure defaults, no defaults |
| A06 | Vulnerable Components | Dependency scanning, updates |
| A07 | Auth Failures | MFA, rate limiting, secure tokens |
| A08 | Integrity Failures | Code signing, SBOM |
| A09 | Logging Failures | Audit logs, monitoring |
| A10 | SSRF | URL validation, allowlists |

### Security Tools

- **Trivy**: Container scanning
- **Snyk**: Dependency scanning
- **OWASP ZAP**: Dynamic analysis
- **SonarQube**: Static analysis
- **Checkov**: IaC scanning
- **Falco**: Runtime security

### Compliance

- **GDPR**: EU data protection
- **PCI-DSS**: Payment card security
- **SOC 2**: Security controls
- **ISO 27001**: Information security

## Standards

### Password Security
- bcrypt with cost 12+
- Minimum 8 characters
- No maximum length < 128
- Breach database checking

### Token Security
- RS256 for JWT (asymmetric)
- Short-lived access tokens (15 min)
- Refresh token rotation
- Secure cookie storage

### Data Protection
- TLS 1.3 for transit
- AES-256-GCM for rest
- PII encrypted in database
- Secrets in Secret Manager

### Headers
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security

## Templates

### Spring Security Configuration

```java
package com.example.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.web.server.SecurityWebFilterChain;

import java.security.interfaces.RSAPublicKey;

@Configuration
@EnableWebFluxSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
            .csrf(csrf -> csrf.disable()) // Disable for API
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .authorizeExchange(exchanges -> exchanges
                .pathMatchers("/actuator/health/**").permitAll()
                .pathMatchers("/api/v1/auth/**").permitAll()
                .pathMatchers("/api/v1/public/**").permitAll()
                .pathMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyExchange().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtDecoder(jwtDecoder()))
            )
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp
                    .policyDirectives("default-src 'self'; frame-ancestors 'none'"))
                .frameOptions(frame -> frame.deny())
                .contentTypeOptions(contentType -> {})
                .hsts(hsts -> hsts
                    .maxAgeInSeconds(31536000)
                    .includeSubdomains(true))
            )
            .build();
    }

    @Bean
    public ReactiveJwtDecoder jwtDecoder() {
        // Load public key from configuration
        RSAPublicKey publicKey = loadPublicKey();
        return NimbusReactiveJwtDecoder.withPublicKey(publicKey).build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(
            "https://app.example.com",
            "https://admin.example.com"
        ));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        configuration.setExposedHeaders(List.of("X-Request-Id"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
```

### Rate Limiting Configuration

```java
package com.example.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitingFilter implements WebFilter {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    private static final int REQUESTS_PER_MINUTE = 60;
    private static final int BURST_CAPACITY = 10;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String clientId = extractClientId(exchange);
        Bucket bucket = buckets.computeIfAbsent(clientId, this::createBucket);

        if (bucket.tryConsume(1)) {
            return chain.filter(exchange);
        }

        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        exchange.getResponse().getHeaders().add("Retry-After", "60");
        return exchange.getResponse().setComplete();
    }

    private Bucket createBucket(String clientId) {
        Bandwidth limit = Bandwidth.classic(
            REQUESTS_PER_MINUTE,
            Refill.greedy(REQUESTS_PER_MINUTE, Duration.ofMinutes(1))
        );
        Bandwidth burst = Bandwidth.classic(
            BURST_CAPACITY,
            Refill.intervally(BURST_CAPACITY, Duration.ofSeconds(1))
        );
        return Bucket.builder()
            .addLimit(limit)
            .addLimit(burst)
            .build();
    }

    private String extractClientId(ServerWebExchange exchange) {
        // Prefer authenticated user ID
        return exchange.getPrincipal()
            .map(Principal::getName)
            .defaultIfEmpty(getClientIp(exchange))
            .block();
    }

    private String getClientIp(ServerWebExchange exchange) {
        String forwardedFor = exchange.getRequest()
            .getHeaders()
            .getFirst("X-Forwarded-For");
        if (forwardedFor != null) {
            return forwardedFor.split(",")[0].trim();
        }
        return exchange.getRequest()
            .getRemoteAddress()
            .getAddress()
            .getHostAddress();
    }
}
```

### Input Validation

```java
package com.example.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.*;
import java.util.regex.Pattern;

// Custom annotation for safe strings
@Documented
@Constraint(validatedBy = SafeStringValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface SafeString {
    String message() default "Input contains invalid characters";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    boolean allowHtml() default false;
}

// Validator implementation
public class SafeStringValidator implements ConstraintValidator<SafeString, String> {

    private boolean allowHtml;

    // Pattern to detect potential XSS
    private static final Pattern XSS_PATTERN = Pattern.compile(
        "<script|javascript:|on\\w+\\s*=|<\\s*img|<\\s*iframe",
        Pattern.CASE_INSENSITIVE
    );

    // Pattern to detect SQL injection
    private static final Pattern SQL_PATTERN = Pattern.compile(
        "'\\s*(or|and|union|select|insert|update|delete|drop|--|;)",
        Pattern.CASE_INSENSITIVE
    );

    @Override
    public void initialize(SafeString constraintAnnotation) {
        this.allowHtml = constraintAnnotation.allowHtml();
    }

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isEmpty()) {
            return true;
        }

        // Check for XSS
        if (!allowHtml && XSS_PATTERN.matcher(value).find()) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate("Potential XSS detected")
                .addConstraintViolation();
            return false;
        }

        // Check for SQL injection
        if (SQL_PATTERN.matcher(value).find()) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate("Potential SQL injection detected")
                .addConstraintViolation();
            return false;
        }

        return true;
    }
}

// Usage in DTO
public record CreateUserRequest(
    @NotBlank
    @SafeString
    @Size(max = 100)
    String name,

    @NotBlank
    @Email
    String email,

    @NotBlank
    @Size(min = 8, max = 128)
    String password
) {}
```

### Secure Password Handling

```java
package com.example.security;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class SecurePasswordService {

    private static final int BCRYPT_STRENGTH = 12;
    private final PasswordEncoder encoder;

    public SecurePasswordService() {
        this.encoder = new BCryptPasswordEncoder(BCRYPT_STRENGTH);
    }

    public String hashPassword(String rawPassword) {
        validatePasswordStrength(rawPassword);
        return encoder.encode(rawPassword);
    }

    public boolean verifyPassword(String rawPassword, String hashedPassword) {
        return encoder.matches(rawPassword, hashedPassword);
    }

    private void validatePasswordStrength(String password) {
        if (password.length() < 8) {
            throw new WeakPasswordException("Password must be at least 8 characters");
        }
        if (password.length() > 128) {
            throw new WeakPasswordException("Password must not exceed 128 characters");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new WeakPasswordException("Password must contain uppercase letter");
        }
        if (!password.matches(".*[a-z].*")) {
            throw new WeakPasswordException("Password must contain lowercase letter");
        }
        if (!password.matches(".*\\d.*")) {
            throw new WeakPasswordException("Password must contain a digit");
        }
        // Check against common passwords (implement breach database check)
        if (isCommonPassword(password)) {
            throw new WeakPasswordException("Password is too common");
        }
    }

    private boolean isCommonPassword(String password) {
        // Implement check against HaveIBeenPwned or similar
        return false;
    }
}
```

### Security Headers Middleware (Next.js)

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=(self)'
  );
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // CSP
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.stripe.com wss:",
    "frame-src 'self' https://js.stripe.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
```

### GitHub Actions Security Scanning

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1' # Weekly on Monday

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk
        uses: snyk/actions/gradle@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      - name: Upload Snyk report
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: snyk.sarif

  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t app:latest .

      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'app:latest'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy report
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif

  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: java, javascript

      - name: Build
        run: ./gradlew build -x test

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

  iac-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Checkov
        uses: bridgecrewio/checkov-action@master
        with:
          directory: infrastructure/
          framework: terraform
          output_format: sarif
          output_file_path: checkov.sarif

      - name: Upload Checkov report
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: checkov.sarif
```

## Security Checklist

### Authentication
- [ ] Passwords hashed with bcrypt (cost 12+)
- [ ] JWT uses RS256 (asymmetric)
- [ ] Token expiry is short (15 min access)
- [ ] Refresh tokens rotate on use
- [ ] Rate limiting on auth endpoints
- [ ] Account lockout after failed attempts
- [ ] MFA available for sensitive accounts

### Authorization
- [ ] Deny by default
- [ ] Role-based access control
- [ ] Object-level authorization
- [ ] API scopes defined
- [ ] Admin actions require re-auth

### Data Protection
- [ ] TLS 1.3 enforced
- [ ] PII encrypted at rest
- [ ] Secrets in Secret Manager
- [ ] No sensitive data in logs
- [ ] Secure cookie flags set

### API Security
- [ ] Input validation on all endpoints
- [ ] Output encoding
- [ ] Rate limiting
- [ ] Request size limits
- [ ] CORS properly configured
- [ ] Security headers set

### Infrastructure
- [ ] Workload Identity (no key files)
- [ ] Network policies
- [ ] Pod Security Standards
- [ ] Secrets encrypted at rest
- [ ] Regular patching

### Monitoring
- [ ] Security events logged
- [ ] Failed auth attempts tracked
- [ ] Anomaly detection
- [ ] Incident response plan

## GDPR Compliance

### Data Subject Rights
```java
public interface DataSubjectService {
    // Right to Access (Article 15)
    Mono<PersonalDataExport> exportPersonalData(UUID userId);

    // Right to Erasure (Article 17)
    Mono<Void> deletePersonalData(UUID userId);

    // Right to Portability (Article 20)
    Mono<byte[]> exportPortableData(UUID userId);

    // Right to Rectification (Article 16)
    Mono<Void> updatePersonalData(UUID userId, PersonalDataUpdate update);
}
```

## Anti-Patterns to Avoid

1. **Security by Obscurity**: Assuming attackers won't find it
2. **Hardcoded Secrets**: Secrets must be in Secret Manager
3. **Symmetric JWT**: Use RS256, not HS256
4. **Missing Rate Limits**: All endpoints need limits
5. **Overly Permissive CORS**: Explicit allowlist only
6. **Logging Sensitive Data**: Never log passwords, tokens
7. **Trusting User Input**: Validate and sanitize everything
8. **Ignoring Updates**: Keep dependencies patched
