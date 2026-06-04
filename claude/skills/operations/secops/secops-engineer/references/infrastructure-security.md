# Security — Infrastructure (Container/K8s · Zero Trust)

## Container & Kubernetes Security

### Secure Dockerfile Template

```dockerfile
# Stage 1: Build
FROM eclipse-temurin:21-jdk-jammy@sha256:<pin-digest> AS build
WORKDIR /app
COPY pom.xml mvnw ./
COPY .mvn .mvn
RUN ./mvnw dependency:go-offline -B
COPY src src
RUN ./mvnw package -DskipTests -B

# Stage 2: Runtime — distroless, non-root
FROM gcr.io/distroless/java21-debian12:nonroot
WORKDIR /app

# Copy only the JAR — no source code, no build tools
COPY --from=build /app/target/*.jar app.jar

# Run as non-root user (65532 = nonroot in distroless)
USER 65532:65532

# Read-only filesystem where possible
# (configure writable volumes for /tmp if needed)

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Docker security rules**:
- Multi-stage builds — separate build and runtime
- Distroless or Alpine base images — minimal attack surface
- Pin images by digest — prevent supply chain attacks via tag mutation
- Non-root user — never run as root
- No secrets in image layers — use runtime injection
- `.dockerignore` — exclude `.git`, `.env`, `node_modules`, etc.
- Read-only filesystem — mount writable volumes only where needed

### Kubernetes Pod Security Standards

| Level | Description | Use Case |
|-------|-------------|----------|
| **Privileged** | Unrestricted | System-level pods only (monitoring agents) |
| **Baseline** | Prevents known privilege escalations | Default for most workloads |
| **Restricted** | Hardened, best practices | Security-sensitive workloads |

### Pod Security Admission Configuration

```yaml
# Namespace label enforcement
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### Restricted Pod Security Context Template

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-app
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: myregistry.com/myapp@sha256:<digest>
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          resources:
            limits:
              cpu: "500m"
              memory: "512Mi"
            requests:
              cpu: "100m"
              memory: "256Mi"
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 100Mi
      automountServiceAccountToken: false
```

### Policy-as-Code

| Tool | Approach | Best For |
|------|----------|----------|
| **OPA Gatekeeper** | Rego policies, ConstraintTemplates | Complex policies, multi-cluster |
| **Kyverno** | YAML-native policies, no new language | Simple policies, quick adoption |
| **Kubescape** | NSA/CISA hardening checks | Compliance scanning |

### Network Policies (Default Deny)

```yaml
# Default deny all ingress and egress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

---
# Allow specific service communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-to-db
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: database
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-server
      ports:
        - protocol: TCP
          port: 5432
```

### Secrets Management

| Solution | Type | Best For |
|----------|------|----------|
| **External Secrets Operator** | K8s operator syncing from vault | Multi-cloud, existing vaults |
| **Sealed Secrets** | Encrypted secrets in Git | GitOps workflows |
| **CSI Secret Store** | Mount secrets as volumes | Cloud-native (GCP, AWS, Azure) |
| **HashiCorp Vault** | Full secrets lifecycle | Enterprise, dynamic secrets |

**Rule**: Never store secrets in ConfigMaps, environment variables baked into images, or Git repositories. Always use a secrets management solution.

---

## Zero Trust Architecture

### NIST SP 800-207 Principles

1. **All data sources and computing services are considered resources**
2. **All communication is secured regardless of network location**
3. **Access to individual resources is granted on a per-session basis**
4. **Access is determined by dynamic policy** (identity, device, behavior, environment)
5. **Enterprise monitors and measures integrity and security posture of all assets**
6. **All resource authentication and authorization is dynamic and strictly enforced**
7. **Enterprise collects information about network assets and uses it to improve security**

### Microsegmentation Patterns

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **Service Mesh (Istio)** | Sidecar proxies, automatic mTLS | Zero-code, traffic observability | Resource overhead |
| **Network Policy (K8s)** | CNI-level enforcement | No sidecar overhead | Limited to L3/L4 |
| **eBPF (Cilium)** | Kernel-level enforcement | High performance, L7 visibility | Requires newer kernels |

### mTLS with Istio

```yaml
# Enforce strict mTLS for entire mesh
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT

---
# Authorization policy — only allow specific service calls
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payment-service-policy
  namespace: production
spec:
  selector:
    matchLabels:
      app: payment-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/production/sa/order-service"]
      to:
        - operation:
            methods: ["POST"]
            paths: ["/api/v1/payments"]
```

### Workload Identity with SPIFFE/SPIRE

**SPIFFE** (Secure Production Identity Framework for Everyone) provides cryptographic identity to every workload:
- Each workload gets a **SPIFFE ID**: `spiffe://trust-domain/workload-identifier`
- Identity is attested via platform-specific mechanisms (K8s service accounts, AWS IAM roles)
- Short-lived X.509 SVIDs (SPIFFE Verifiable Identity Documents) for mTLS
- No static credentials — identity is dynamic and rotated automatically

### API Gateway Security Layer

```yaml
# Example: Kong or similar API gateway security configuration
- Authentication: OAuth 2.1 / API key validation
- Rate limiting: Per-consumer, per-IP, per-route
- Request size limits: Max body size, max header size
- IP allowlisting/blocklisting
- WAF rules: OWASP Core Rule Set
- Request/response transformation: Strip internal headers
- mTLS termination: Verify client certificates
- Logging: Full request/response audit trail
```

---

