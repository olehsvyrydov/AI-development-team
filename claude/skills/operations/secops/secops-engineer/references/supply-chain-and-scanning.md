# Security — Supply Chain & Scanning Pipeline

## Supply Chain Security

### SBOM (Software Bill of Materials)

An SBOM lists every component in your software — critical for vulnerability management and compliance.

**Formats**:
- **CycloneDX** (OWASP) — preferred for security use cases, supports VEX
- **SPDX** (Linux Foundation) — preferred for license compliance

**Generation with Syft** (Linux):
```bash
# Install Syft
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin

# Generate SBOM from source directory
syft dir:. -o cyclonedx-json > sbom.cdx.json

# Generate SBOM from container image
syft docker:myapp:latest -o cyclonedx-json > sbom.cdx.json

# Generate SBOM from JAR file
syft file:target/myapp.jar -o cyclonedx-json > sbom.cdx.json
```

**CI/CD Integration**: Generate SBOM in build pipeline, store as artifact, scan with Grype.

### SLSA Framework (Supply-chain Levels for Software Artifacts)

| Level | Requirements | Verification |
|-------|--------------|--------------|
| **SLSA 0** | No guarantees | — |
| **SLSA 1** | Build provenance exists | Build service generates provenance |
| **SLSA 2** | Hosted build, signed provenance | Tamper-resistant build service |
| **SLSA 3** | Hardened builds, non-falsifiable provenance | Isolated, hermetic builds |

**Provenance verification with SLSA Verifier**:
```bash
# Install SLSA verifier
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@latest

# Verify provenance
slsa-verifier verify-artifact myapp.jar \
  --provenance-path myapp.jar.intoto.jsonl \
  --source-uri github.com/myorg/myapp
```

### Dependency Scanning

| Tool | Type | Install (Linux) | Key Command |
|------|------|-----------------|-------------|
| **OSV-Scanner** | SCA (Google) | `go install github.com/google/osv-scanner/cmd/osv-scanner@latest` | `osv-scanner --lockfile pom.xml` |
| **Grype** | SCA (Anchore) | `curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh \| sh -s -- -b /usr/local/bin` | `grype sbom:sbom.cdx.json` |
| **Snyk** | SCA (commercial) | `npm install -g snyk` | `snyk test --all-projects` |
| **Dependabot** | SCA (GitHub) | Built into GitHub | `.github/dependabot.yml` |

**Automated PR blocking**: Configure CI to fail on HIGH/CRITICAL findings.

### Container Image Supply Chain

```bash
# Use distroless base images (no shell, no package manager)
FROM gcr.io/distroless/java21-debian12:nonroot

# Pin images by digest (not tag)
FROM eclipse-temurin:21-jre-jammy@sha256:abc123...

# Sign images with cosign
cosign sign --key cosign.key myregistry.com/myapp:v1.0.0

# Verify signatures
cosign verify --key cosign.pub myregistry.com/myapp:v1.0.0
```

---

## Security Scanning Pipeline

### Pipeline Overview

| Phase | Tools | When | Blocks PR |
|-------|-------|------|-----------|
| **Pre-commit** | Gitleaks, ESLint security, SpotBugs+FindSecBugs, Bandit | Before commit | Developer choice |
| **CI (every PR)** | Semgrep (SAST), OSV-Scanner (SCA), Checkov (IaC), TruffleHog (secrets), Trivy | On PR | Yes (HIGH+) |
| **Build** | Syft + Grype (SBOM + vuln scan), Trivy image scan | On build | Yes (CRITICAL) |
| **Post-deploy** | OWASP ZAP baseline/API scan (DAST) | After staging deploy | Informational |
| **Scheduled** | Nuclei, ZAP full scan, nmap, testssl.sh | Weekly/nightly | Alert |
| **Runtime** | Falco, Cilium Tetragon, AppArmor | Continuous | Alert + contain |

### Tool Details

#### Gitleaks (Secrets Detection — Pre-commit)
```bash
# Install
brew install gitleaks  # macOS
# or
wget https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks-linux-amd64 -O /usr/local/bin/gitleaks

# Pre-commit hook
gitleaks git --pre-commit --staged --verbose

# Scan full repo history
gitleaks git --repo-path=. --verbose --report-format=json --report-path=gitleaks-report.json

# .gitleaks.toml — custom rules
[extend]
useDefault = true

[[rules]]
id = "custom-api-key"
description = "Custom API key pattern"
regex = '''(?i)api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{32,}['"]'''
```

#### Semgrep (SAST — CI)
```bash
# Install
pip install semgrep

# Run with OWASP rules
semgrep scan --config p/owasp-top-ten --config p/java-security-audit --config p/typescript

# Run with custom rules
semgrep scan --config .semgrep/ --sarif -o semgrep-results.sarif

# Key rulesets
# p/owasp-top-ten — OWASP Top 10 rules
# p/java-security-audit — Java-specific security
# p/typescript — TypeScript security
# p/secrets — Secrets detection
# p/supply-chain — Supply chain rules
```

#### Trivy (Container + IaC + SBOM Scanner)
```bash
# Install
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Scan container image
trivy image --severity HIGH,CRITICAL --exit-code 1 myapp:latest

# Scan filesystem (IaC + secrets)
trivy fs --security-checks vuln,secret,misconfig .

# Scan Kubernetes manifests
trivy config --severity HIGH,CRITICAL k8s/

# Scan SBOM
trivy sbom sbom.cdx.json
```

#### OWASP ZAP (DAST)
```bash
# Run baseline scan against staging
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://staging.yourdomain.com

# Run API scan with OpenAPI spec
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-api-scan.py \
  -t https://staging.yourdomain.com/v3/api-docs \
  -f openapi

# Run full scan (scheduled/nightly)
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py \
  -t https://staging.yourdomain.com
```

#### Additional Tools

| Tool | Purpose | Install | Command |
|------|---------|---------|---------|
| **TruffleHog** | Deep secrets scanning | `pip install trufflehog` | `trufflehog git file://. --only-verified` |
| **Checkov** | IaC scanning (Terraform, K8s, Docker) | `pip install checkov` | `checkov -d . --framework terraform` |
| **Nuclei** | Network vulnerability scanner | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` | `nuclei -u https://yourdomain.com -t cves/` |
| **testssl.sh** | TLS configuration testing | `git clone https://github.com/drwetter/testssl.sh` | `./testssl.sh https://yourdomain.com` |
| **SpotBugs+FindSecBugs** | Java SAST | Maven plugin | `mvn spotbugs:check` |
| **Bandit** | Python SAST | `pip install bandit` | `bandit -r src/ -f json` |
| **gosec** | Go SAST | `go install github.com/securego/gosec/v2/cmd/gosec@latest` | `gosec ./...` |
| **Falco** | Kubernetes runtime security | Helm chart | `helm install falco falcosecurity/falco` |

### GitHub Actions Security Workflow Template

```yaml
name: Security Scanning Pipeline
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1'  # Weekly Monday 2 AM

permissions:
  contents: read
  security-events: write

jobs:
  secrets-scan:
    name: Secrets Detection
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  sast:
    name: Static Analysis (SAST)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/owasp-top-ten
            p/java-security-audit
            p/typescript
            p/secrets

  sca:
    name: Dependency Scanning (SCA)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: OSV-Scanner
        uses: google/osv-scanner-action@v1
        with:
          scan-args: |-
            --lockfile=pom.xml
            --lockfile=package-lock.json

  container-scan:
    name: Container Image Scan
    runs-on: ubuntu-latest
    needs: [sast, sca]
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t myapp:${{ github.sha }} .
      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: myapp:${{ github.sha }}
          format: cyclonedx-json
          output-file: sbom.cdx.json
      - name: Scan with Trivy
        uses: aquasecurity/trivy-action@0.28.0  # pin to a release tag or, better, a commit SHA; bump deliberately
        with:
          image-ref: myapp:${{ github.sha }}
          severity: HIGH,CRITICAL
          exit-code: 1
          format: sarif
          output: trivy-results.sarif
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif

  iac-scan:
    name: Infrastructure as Code Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Checkov
        uses: bridgecrewio/checkov-action@v12  # pin to a release tag or, better, a commit SHA; bump deliberately
        with:
          directory: .
          framework: terraform,kubernetes,dockerfile
          soft_fail: false

  dast:
    name: Dynamic Analysis (DAST)
    runs-on: ubuntu-latest
    needs: [container-scan]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.13.0
        with:
          target: https://staging.yourdomain.com
          rules_file_name: .zap/rules.tsv
          cmd_options: '-a'
```

---

