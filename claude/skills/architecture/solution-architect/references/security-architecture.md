# Architecture — Security-First

## Security-First Architecture

### Threat Modeling with STRIDE

STRIDE is a mnemonic for security threats, developed at Microsoft.

| Threat | Description | Mitigation |
|--------|-------------|------------|
| **S**poofing | Pretending to be someone else | Authentication (MFA, certificates) |
| **T**ampering | Modifying data or code | Integrity checks (signatures, hashes) |
| **R**epudiation | Denying actions | Audit logging, digital signatures |
| **I**nformation Disclosure | Exposing data | Encryption, access control |
| **D**enial of Service | Making service unavailable | Rate limiting, redundancy |
| **E**levation of Privilege | Gaining unauthorized access | Principle of least privilege, AuthZ |

**STRIDE Threat Modeling Process:**
1. **Diagram the system**: DFD (Data Flow Diagram)
2. **Enumerate threats**: Apply STRIDE to each element
3. **Mitigate threats**: Design countermeasures
4. **Validate**: Review with security team (/secops)

### Threat Modeling Methodology Selection

STRIDE is the default; use alternatives when the context demands it:

| Method | Focus | Best For | Deliverable |
|--------|-------|----------|-------------|
| **STRIDE** | Six threat categories | General architectural review | Threat table + countermeasures |
| **PASTA** | Risk ranking, business context | Fintech, high-value targets, limited remediation budget | Risk-ranked threat list, prioritized fixes |
| **LINDDUN** | Privacy-specific threats | GDPR systems, healthcare, social/user-data apps | Privacy threat model + design fixes |
| **Attack Trees** | Specific attack scenarios | High-value single assets (e.g., payment flow) | Visual attack/mitigation tree |

**Decision guide:**
- Use **STRIDE** as default for every architecture review
- Add **PASTA** when you need business-driven risk prioritization (limited engineering time)
- Add **LINDDUN** when the system processes personal data and privacy is a first-class concern
- Use **Attack Trees** for focused analysis of a single critical path (e.g., "how could an attacker drain the payment account?")

**Delegate to /secops**: Detailed PASTA 7-stage execution, LINDDUN full analysis, attack tree construction, MITRE ATT&CK mapping.

### Zero Trust Architecture

**Principle: "Never trust, always verify."**

```
┌─────────────────────────────────────────────────────────────────┐
│                      Zero Trust Network                         │
│                                                                 │
│  ┌───────────┐    ┌───────────────────────┐    ┌───────────┐  │
│  │   User    │───►│   Policy Engine       │───►│  Resource │  │
│  │           │    │   - Identity verified │    │           │  │
│  │ Identity  │    │   - Device validated  │    │  Service  │  │
│  │ verified  │    │   - Context assessed  │    │   A       │  │
│  │ Device    │    │   - Least privilege   │    │           │  │
│  │ verified  │    └───────────────────────┘    └───────────┘  │
│  └───────────┘                                                 │
│                                                                 │
│  Every request is:                                             │
│  1. Authenticated (who are you?)                               │
│  2. Authorized (what can you do?)                              │
│  3. Encrypted (protected in transit)                           │
│  4. Logged (auditable)                                         │
└─────────────────────────────────────────────────────────────────┘
```

**NIST SP 800-207 Zero Trust Tenets:**
1. All data sources and services are considered resources
2. All communication is secured regardless of network location
3. Access is granted on a per-session basis
4. Access is determined by dynamic policy
5. Enterprise monitors and measures integrity of all assets
6. Authentication and authorization are strictly enforced
7. Enterprise collects information for improving security posture

### Authentication Patterns

#### OAuth 2.1 / OpenID Connect Flows

**OAuth 2.1** (RFC 6749bis) consolidates OAuth 2.0 best practices into a single specification:
- **PKCE is mandatory** for ALL public client grant types (was optional in 2.0)
- **Implicit grant removed** — no more token-in-URL
- **ROPC grant removed** — Resource Owner Password Credentials eliminated
- **Exact redirect URI matching** — no wildcard redirects
- **Refresh token rotation** — sender-constrained or rotated on each use

| Flow | Use Case | Client Type | OAuth 2.1 Status |
|------|----------|-------------|------------------|
| **Authorization Code + PKCE** | Web apps, mobile apps | Public | **REQUIRED** (was optional) |
| **Client Credentials** | Service-to-service | Confidential | Unchanged |
| **Device Authorization** | Smart TVs, CLI tools | Input-constrained | Unchanged |
| **Refresh Token** | Long-lived sessions | All | Sender-constrained (DPoP) |
| ~~Implicit~~ | ~~(DEPRECATED)~~ | ~~Public~~ | **REMOVED in OAuth 2.1** |

```
Authorization Code + PKCE Flow (OAuth 2.1):

┌────────┐                              ┌───────────────┐
│  User  │                              │ Authorization │
│        │                              │    Server     │
└───┬────┘                              └───────┬───────┘
    │                                           │
    │  1. Click "Login"                        │
    ▼                                           │
┌────────┐  2. Redirect with code_challenge    │
│  App   │─────────────────────────────────────►│
│        │                                      │
│        │◄──3. User authenticates, consents───│
│        │                                      │
│        │  4. Redirect with authorization_code │
│        │◄─────────────────────────────────────│
│        │                                      │
│        │  5. Exchange code + code_verifier    │
│        │─────────────────────────────────────►│
│        │                                      │
│        │◄──6. Access token + ID token────────│
└────────┘                                      │
```

#### Passkeys / WebAuthn (FIDO2)

**Architect's decision**: For greenfield systems, offer Passkeys as the primary authentication method. They are:
- **Phishing-resistant** — bound to the relying party origin (can't be used on fake sites)
- **No shared secrets** — public key cryptography; nothing to steal from the server
- **Cross-device** — synced via platform authenticators (iCloud Keychain, Google Password Manager)
- **Biometric-gated** — local unlock via fingerprint/face, private key never leaves device

**Architecture implications**:
- Requires WebAuthn backend (challenge generation, public key storage, attestation verification)
- Credential storage: one user can have multiple passkeys (phone, laptop, security key)
- Recovery flow needed: backup codes, recovery email, or alternate authenticator
- Progressive adoption: offer alongside password + MFA, promote migration

**Delegate to /secops**: Specific WebAuthn implementation, attestation verification, DPoP token binding configuration.

### API Security

| Control | Implementation |
|---------|----------------|
| **Authentication** | JWT, API keys, mTLS |
| **Authorization** | RBAC, ABAC, ReBAC |
| **Rate Limiting** | Token bucket, sliding window |
| **Input Validation** | Schema validation, sanitization |
| **Output Encoding** | Prevent injection in responses |
| **TLS** | TLS 1.3, strong ciphers |
| **CORS** | Restrict origins |
| **Security Headers** | CSP, HSTS, X-Content-Type-Options |

### Secrets Management

| Tool | Features | Best For |
|------|----------|----------|
| **HashiCorp Vault** | Dynamic secrets, PKI, encryption | Enterprise, multi-cloud |
| **AWS Secrets Manager** | Rotation, RDS integration | AWS workloads |
| **GCP Secret Manager** | Versioning, IAM integration | GCP workloads |
| **Azure Key Vault** | HSM-backed, certificates | Azure workloads |
| **Doppler** | Environment management | Developer experience |

**Secrets Management Principles:**
1. Never commit secrets to code
2. Rotate secrets regularly
3. Use short-lived credentials
4. Audit secret access
5. Encrypt at rest and in transit

### OWASP Top 10 (2025)

The 2025 edition reflects significant shifts — supply chain is now a dedicated category, SSRF merged into Broken Access Control, and exceptional condition handling is new.

| Rank | Category | Key Architectural Mitigation |
|------|----------|------------------------------|
| A01 | Broken Access Control (incl. SSRF) | Deny by default, RBAC/ABAC at service layer, BOLA prevention on every endpoint |
| A02 | Security Misconfiguration | IaC-managed config, security headers, remove unused features |
| A03 | **Software Supply Chain Failures (NEW)** | SBOM generation, dependency scanning (SCA), SLSA provenance, image signing |
| A04 | Injection | Parameterized queries, ORM parameter binding, input allowlisting |
| A05 | Insecure Design | Threat modeling (STRIDE/PASTA), secure design patterns, abuse case analysis |
| A06 | Cryptographic Failures | TLS 1.3, AES-256-GCM, Argon2id for passwords, no MD5/SHA-1 |
| A07 | Authentication Failures | OAuth 2.1, Passkeys/WebAuthn, MFA, rate limiting on auth endpoints |
| A08 | Software Integrity Failures | Code signing, SBOM verification, CI/CD pipeline security |
| A09 | Logging Failures | Structured audit logging, SIEM integration, no PII in logs |
| A10 | **Mishandling of Exceptional Conditions (NEW)** | Graceful error handling, generic error messages to clients, no stack traces |

**Delegate to /secops**: Detailed OWASP prevention techniques, scanning tool configuration, OWASP ASVS verification level selection and execution.

### OWASP Application Security Verification Standard (ASVS)

OWASP Top 10 lists vulnerabilities; **ASVS is the verification framework** that tells you what controls to validate.

| Level | Target | Examples |
|-------|--------|----------|
| **L1** | All applications | Basic input validation, session management, error handling |
| **L2** | Applications handling sensitive data | Full auth controls, logging, CORS, CSRF, API security |
| **L3** | High-security (finance, healthcare, government) | Cryptographic agility, defense-in-depth, advanced threat protection |

**Architect's decision**: Select ASVS level based on risk profile:
- Payment/billing systems → **Level 3**
- User-facing SaaS → **Level 2**
- Internal tools / public CMS → **Level 1**

**Delegate to /secops**: ASVS checklist verification for the selected level.

### Container & Kubernetes Security Architecture

**Design concern**: How do we secure containerized workloads at scale?

#### Image Security Strategy

```
Source Code → Build → Image Scan → Sign → Registry → Pod Security Policy → Runtime Monitor
```

| Layer | Architectural Decision | Implementation |
|-------|----------------------|----------------|
| **Build** | Multi-stage builds, distroless base images, no root user | Dockerfile best practices |
| **Registry** | Private registry, image signing (cosign/Sigstore) | Verify signatures at deploy time |
| **Deploy** | Pod Security Standards (Restricted level) | Pod Security Admission controller |
| **Runtime** | Runtime threat detection | Falco, Cilium Tetragon |

#### Kubernetes Workload Security Patterns

| Pattern | Description | When to Use |
|---------|-------------|-------------|
| **Workload Identity** (GKE/EKS) | Bind K8s ServiceAccount → Cloud IAM | Eliminates static credentials for cloud API access |
| **mTLS via Service Mesh** (Istio) | Auto-encrypt all pod-to-pod traffic | Zero Trust in-cluster communication |
| **Network Policies** (default deny) | Explicit allow rules per namespace/pod | Defense-in-depth, blast radius reduction |
| **External Secrets Operator** | Sync secrets from Vault/KMS into K8s | No secrets in Git, automatic rotation |
| **Pod Security Standards** (Restricted) | Non-root, read-only FS, no privilege escalation | All production workloads |

**Architect's decision**: Workload Identity + mTLS + NetworkPolicy + Restricted PSS = defense-in-depth by default.

**Delegate to /secops**: Pod security context YAML, network policy rules, Falco rule configuration, image scanning tool setup.

### Supply Chain Security Architecture

**Design concern**: How do we ensure dependencies and artifacts are trustworthy?

#### Dependency Risk Strategy

| Component | Architectural Decision | Rationale |
|-----------|----------------------|-----------|
| **SCA in CI/CD** | Mandatory — block PRs on HIGH/CRITICAL CVEs | Catch vulnerable dependencies before merge |
| **SBOM generation** | Generate CycloneDX SBOM for every release | Customer trust, regulatory compliance, incident response |
| **Lockfile enforcement** | All package managers must use lockfiles | Reproducible builds, prevent dependency confusion |
| **Transitive dependency monitoring** | Deep scan including indirect dependencies | A→B→C vulnerability chains are common attack vectors |
| **Update SLA** | Security patches: 7 days; minor: quarterly; major: planned | Balance security with stability |

#### SLSA Framework (Architect's Perspective)

| SLSA Level | What It Guarantees | When to Target |
|------------|-------------------|----------------|
| **L1** | Build provenance exists | Minimum for any production system |
| **L2** | Hosted, signed provenance | Standard for SaaS products |
| **L3** | Hardened, non-falsifiable builds | Regulated industries (finance, healthcare) |

**Architect's decision**: Target SLSA L2 minimum for production releases. Include SBOM as release artifact.

#### Third-Party Risk Assessment

When integrating external services (SaaS, APIs, libraries):
- [ ] Vendor security certifications (SOC 2 Type II, ISO 27001)?
- [ ] Data residency and processing location?
- [ ] Incident response SLA and breach notification timeline?
- [ ] Dependency on _their_ dependencies (transitive supply chain risk)?
- [ ] Exit strategy if vendor compromised or discontinued?

**Delegate to /secops**: OSV-Scanner/Grype/Snyk configuration, SBOM tooling setup, cosign signing workflow, SLSA verifier integration.

### Privacy by Design Architecture

**Design concern**: How do we build systems that minimize privacy risk from inception?

#### Data Minimization in Architecture

| Decision Point | Privacy Question | Architectural Pattern |
|---------------|------------------|----------------------|
| **Data collection** | Do we really need this field? | Collect only what's required for the stated purpose |
| **Data retention** | How long until auto-delete? | TTL policies: 90-day default, explicit justification for longer |
| **Data flows** | Who sees what? | Data classification: Public / Internal / Confidential / Restricted (PII) |
| **Subject Access Requests** | Can user export/delete their data? | User-ID-linked PII, fast export (JSON/CSV), cascade deletion |
| **Cross-border transfers** | Where is data processed? | Region-pinned storage, processing in EEA unless adequate decision |

#### Privacy Incident Architecture

When a data breach occurs, can we quantify exposure?

- [ ] **Data lineage**: Which services touch PII? Documented in data flow diagrams.
- [ ] **Encryption at rest**: If DB is breached, is PII intelligible without keys?
- [ ] **Pseudonymization**: PII separated from behavioral data? User ID ≠ real identity.
- [ ] **Affected user identification**: Can we quickly determine which users are impacted?
- [ ] **72-hour notification**: Automated alerting for GDPR breach reporting deadline.

**Delegate to /secops**: LINDDUN privacy threat modeling, GDPR technical control implementation, PII handling code patterns, DPA template review → /legal.

---

