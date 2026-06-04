# Security — Code Review Checklists

## Security Code Review Checklists

### General Security Review

- [ ] **Input validation**: All user input validated (type, length, format, range)
- [ ] **Output encoding**: Context-appropriate encoding (HTML, URL, JS, SQL)
- [ ] **Authentication**: Endpoints require authentication where expected
- [ ] **Authorization**: Object-level authorization enforced (BOLA prevention)
- [ ] **Cryptography**: No deprecated algorithms (MD5, SHA-1, DES, RC4)
- [ ] **Secrets**: No hardcoded credentials, API keys, or tokens
- [ ] **Logging**: Security events logged, no PII in logs
- [ ] **Error handling**: Generic error messages to clients, detailed logs internally
- [ ] **Dependencies**: No known CVEs in HIGH/CRITICAL severity
- [ ] **CSRF**: Protection enabled for state-changing operations

### API Security Review

- [ ] **BOLA**: Every endpoint validates object ownership
- [ ] **Rate limiting**: Configured on all public endpoints
- [ ] **Schema validation**: Request bodies validated against schema
- [ ] **Mass assignment**: DTOs used, no direct entity binding
- [ ] **CORS**: Restrictive origin policy, no wildcards
- [ ] **Pagination**: Max page size enforced
- [ ] **Versioning**: Old API versions deprecated/removed
- [ ] **Content-Type**: Validated on all requests
- [ ] **Response filtering**: No sensitive fields in responses

### Frontend Security Review

- [ ] **XSS**: No `dangerouslySetInnerHTML` or equivalent without sanitization
- [ ] **CSRF**: Tokens included in state-changing requests
- [ ] **Cookies**: HttpOnly, Secure, SameSite=Strict for auth cookies
- [ ] **CSP**: Content Security Policy header configured
- [ ] **SRI**: Subresource Integrity on external scripts/styles
- [ ] **Storage**: No sensitive data in localStorage (use httpOnly cookies)
- [ ] **Redirects**: Open redirect prevention (validate redirect URLs)
- [ ] **Dependencies**: No known XSS-vulnerable libraries

### Infrastructure Review

- [ ] **Dockerfile**: Non-root user, multi-stage, distroless/minimal base, digest pinned
- [ ] **Kubernetes**: Pod Security Standards (restricted), network policies, no automountServiceAccountToken
- [ ] **Terraform**: No hardcoded secrets, encrypted state, least-privilege IAM
- [ ] **CI/CD**: No secrets in logs, minimal permissions, signed artifacts
- [ ] **Network**: TLS everywhere, no plaintext protocols, mTLS for service-to-service

### Incident Response Checklist

- [ ] **Detect**: Alert triggered and acknowledged
- [ ] **Contain**: Affected systems isolated, credentials rotated
- [ ] **Eradicate**: Root cause identified and removed
- [ ] **Recover**: Systems restored from clean state, monitoring enhanced
- [ ] **Post-incident**: Blameless review conducted, timeline documented
- [ ] **Notify**: Affected parties notified within regulatory timeframe (72h GDPR)
- [ ] **Improve**: Controls updated to prevent recurrence

---

