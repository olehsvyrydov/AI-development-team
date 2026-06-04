# Security — Privacy, Compliance, Crypto & Headers

## Privacy Engineering

### Privacy by Design — 7 Principles

| # | Principle | Implementation |
|---|-----------|----------------|
| 1 | **Proactive, not reactive** | Threat model for privacy (LINDDUN) before building |
| 2 | **Privacy as default** | Opt-in consent, minimal data collection |
| 3 | **Privacy embedded in design** | Data minimization in schema design |
| 4 | **Full functionality** | Security AND privacy, not either/or |
| 5 | **End-to-end security** | Encryption in transit and at rest |
| 6 | **Visibility and transparency** | Clear privacy notices, consent management |
| 7 | **Respect for user privacy** | User controls, easy data export/deletion |

### Data Minimization Patterns

| Technique | Description | Use When |
|-----------|-------------|----------|
| **Pseudonymization** | Replace identifiers with tokens (reversible) | Analytics, internal processing |
| **Anonymization** | Remove all identifiers (irreversible) | Public datasets, aggregation |
| **Tokenization** | Replace sensitive data with non-sensitive tokens | Payment card data (PCI-DSS) |
| **Data masking** | Partially obscure data (e.g., ****1234) | Display, logs, support |
| **Aggregation** | Combine individual records into summaries | Reporting, analytics |
| **Retention limits** | Auto-delete data after defined period | All personal data |

### GDPR Technical Requirements

| Right | Technical Implementation |
|-------|--------------------------|
| **Right to Access** (Art. 15) | Export API endpoint, machine-readable format (JSON/CSV) |
| **Right to Erasure** (Art. 17) | Hard delete or crypto-shredding, cascade to backups |
| **Right to Portability** (Art. 20) | Standard format export (JSON, CSV), API endpoint |
| **Consent Management** (Art. 7) | Granular consent records, timestamp, purpose, withdrawal |
| **Breach Notification** (Art. 33) | 72-hour automated alerting, incident response playbook |
| **Data Protection by Design** (Art. 25) | Privacy impact assessments, data minimization |

### PII Handling Code Patterns

```java
// Value object for PII — clear classification
public record EmailAddress(String value) {
    public EmailAddress {
        Objects.requireNonNull(value);
        if (!EMAIL_PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid email format");
        }
    }

    // NEVER include PII in toString() — prevent log leakage
    @Override
    public String toString() {
        int atIndex = value.indexOf('@');
        return value.substring(0, Math.min(2, atIndex)) + "***@" +
               value.substring(atIndex + 1);
    }
}

// Audit logging — never log PII
log.info("User action completed: userId={}, action={}", userId, action);
// NEVER: log.info("User {} ({}) performed {}", name, email, action);
```

---

## Compliance Frameworks

| Framework | Scope | Key Requirements | Audit Type |
|-----------|-------|------------------|------------|
| **GDPR** | EU personal data | Consent, data minimization, breach notification (72h), DPO, DPIA | Self-assessment + supervisory authority |
| **PCI-DSS 4.0** | Payment card data | Network segmentation, encryption, access control, logging, vulnerability management | External QSA or SAQ |
| **SOC 2 Type II** | Service organizations | Security, availability, processing integrity, confidentiality, privacy (Trust Services Criteria) | Independent auditor (6–12 month period) |
| **ISO 27001** | Information security | Risk assessment, ISMS, 93 controls (Annex A), continuous improvement | Certification body audit |

### Control Mapping

| Control Area | GDPR | PCI-DSS 4.0 | SOC 2 | ISO 27001 |
|-------------|------|-------------|-------|-----------|
| Access Control | Art. 32 | Req. 7, 8 | CC6.1–6.3 | A.9 |
| Encryption | Art. 32 | Req. 3, 4 | CC6.7 | A.10 |
| Logging | Art. 30 | Req. 10 | CC7.2 | A.12.4 |
| Incident Response | Art. 33, 34 | Req. 12.10 | CC7.3–7.5 | A.16 |
| Vendor Management | Art. 28 | Req. 12.8 | CC9.2 | A.15 |
| Vulnerability Mgmt | Art. 32 | Req. 6, 11 | CC7.1 | A.12.6 |

---

## Cryptographic Standards

| Purpose | Algorithm | Key Size | Notes |
|---------|-----------|----------|-------|
| **Symmetric encryption** | AES-256-GCM | 256-bit | Authenticated encryption (AEAD) |
| **Password hashing** | **Argon2id** (preferred) | — | Memory-hard, CPU-hard, side-channel resistant |
| **Password hashing** | bcrypt (fallback) | cost 12+ | When Argon2 unavailable |
| **Key exchange** | X25519 | 256-bit | Modern ECDH |
| **Digital signatures** | Ed25519 | 256-bit | Fast, compact |
| **JWT signing** | RS256 or ES256 | 2048+ RSA / P-256 EC | Asymmetric, verifiable without shared secret |
| **TLS** | **1.3 minimum** | — | Perfect forward secrecy built-in |
| **Hashing (non-password)** | SHA-256 / SHA-3 | 256-bit | Integrity checks, checksums |

### NEVER Use (Deprecated)

| Algorithm | Why Deprecated |
|-----------|---------------|
| **MD5** | Collision attacks, broken |
| **SHA-1** | Collision attacks demonstrated (SHAttered) |
| **DES / 3DES** | 56-bit / 112-bit key, too small |
| **RC4** | Multiple biases, broken |
| **TLS 1.0 / 1.1** | POODLE, BEAST, no AEAD support |
| **HS256 (for multi-service JWT)** | Shared secret — any service can forge tokens |
| **ECB mode** | No semantic security, pattern leakage |

### Key Management

| Practice | Implementation |
|----------|----------------|
| **Use KMS** | AWS KMS, GCP Cloud KMS, Azure Key Vault — never manage keys in application code |
| **Envelope encryption** | Encrypt data with DEK, encrypt DEK with KEK (from KMS) |
| **Key rotation** | Rotate encryption keys every 90 days, signing keys every 90–365 days |
| **Key separation** | Different keys for different purposes (encryption vs signing vs auth) |
| **Hardware security** | HSM for root keys in high-security environments |

### Argon2id Configuration

```java
// Recommended Argon2id parameters (OWASP 2024)
// Memory: 19 MiB (19456 KiB), Iterations: 2, Parallelism: 1
// Minimum: 15 MiB memory, 2 iterations

import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

@Bean
public PasswordEncoder passwordEncoder() {
    // Parameters: saltLength, hashLength, parallelism, memory (KiB), iterations
    return new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
}
```

---

## Security Headers & Browser Security

### Complete Security Headers

```
# Mandatory headers
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; style-src 'self' 'nonce-{random}'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.yourdomain.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp

# Remove these headers (information leakage)
# X-Powered-By: (remove)
# Server: (remove or genericize)
```

### Nonce-Based CSP Template (Spring Boot)

```java
@Component
public class CspNonceFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String nonce = Base64.getUrlEncoder()
            .encodeToString(SecureRandom.getInstanceStrong()
            .generateSeed(16));
        request.setAttribute("cspNonce", nonce);
        response.setHeader("Content-Security-Policy",
            "default-src 'self'; " +
            "script-src 'self' 'nonce-" + nonce + "'; " +
            "style-src 'self' 'nonce-" + nonce + "'; " +
            "frame-ancestors 'none'");
        chain.doFilter(request, response);
    }
}
```

### Subresource Integrity (SRI)

```html
<!-- Always use SRI for external scripts and stylesheets -->
<script src="https://cdn.example.com/lib.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8w"
  crossorigin="anonymous"></script>
```

---

