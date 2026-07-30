# Agent Disambiguation Matrix

The roster is a **15-agent core team + optional specialists** (see `commands/agents.md`). Use this matrix to pick the **right** agent when domains overlap — prefer the most specific agent for the task's *primary* concern; invoke a second only for a genuinely separate concern.

**Technology stacks are NOT separate agents.** The role agent detects the stack and loads the matching reference — so this matrix is about *roles*, not stacks:
`Angular/Vue/Flutter/JavaFX → /fe` · `Kotlin/FastAPI/Laravel/Quarkus/Kafka/HMRC → /be` · `GraphQL → /arch` · `Terraform → /devops` · `Cucumber/BDD → /e2e` · `language reviewers → /rev` · `UK law/tax → /legal, /fin`.

## By task → agent

| If the task is primarily about… | Use | Not |
|---|---|---|
| LLM features in an app (RAG, agents, prompts, evals, guardrails) | **/ai** | mlops-engineer (training/serving infra), /be (CRUD) |
| Training/fine-tuning models, model serving, ML infra | **mlops-engineer** | /ai (app-level LLM features) |
| Analytics pipelines, ETL/ELT, dbt, warehouse, streaming | **/data** | /dba (OLTP), /be (app logic) |
| OLTP schema, indexing, query tuning, migrations, replication | **/dba** | /data (analytics), /perf (whole-request latency) |
| App/business logic, REST APIs, server code (any backend stack) | **/be** | /data, /dba, /ai |
| Web or cross-platform UI — React/Next, Angular, Vue, Flutter, JavaFX | **/fe** | native iOS/Android (Swift/Kotlin) |
| Native iOS (Swift/SwiftUI) or Android (Kotlin/Compose) | **/ios · /android** | /fe (web / React-Native / Flutter) |
| A browser extension — manifest, permissions, service worker, content scripts, tabs/groups | **/ext** | /fe (the extension's own page UI), /e2e (driving a browser to test a site) |
| Reliability: SLOs, monitoring, alerting, incidents, runbooks | **/sre** | /devops (infra/CI-CD), /perf (speed) |
| Infra provisioning, IaC (Terraform), Kubernetes, CI/CD pipelines | **/devops** | /sre (reliability), /secops (hardening) |
| Speed/efficiency: Web Vitals, profiling, latency, budgets, load tests | **/perf** | /sre (uptime), /dba (schema) |
| Security review, threat modeling, auth, secrets, supply chain | **/secops** | /sre, /devops |
| Visual/UI design, design systems, prototypes | **/ui (Aura)** | /ux (research) |
| User research, usability tests, personas, journeys, IA | **/ux** | /ui (visual), /ba (business reqs) |
| Business/market requirements, AC, process models | **/ba** | /ux (user research), /po (vision) |
| Completeness audit + workflow gates (APPROVAL_GATE/VERIFIED) | **/verify** | /rev (code quality), /qa (test design) |
| Code quality review (any language) | **/rev** | /verify (completeness), /perf (speed) |
| Test case design / BDD specs | **/qa** | /e2e (automation), /verify |
| E2E test automation (Playwright, Cucumber) | **/e2e** | /qa (design) |

## Common confusions (rules of thumb)
- **/ai vs mlops-engineer:** does the task ship an LLM *feature in the product* (→ /ai) or *operate ML infrastructure* (→ mlops-engineer)?
- **/data vs /dba:** is the database for *analytics* (→ /data) or the *application's live OLTP store* (→ /dba)?
- **/sre vs /perf:** is the goal *staying up* (→ /sre) or *being fast* (→ /perf)? vs **/devops** = *standing it up*.
- **/ux vs /ui:** *evidence about users* (→ /ux) vs *the visual design* (→ /ui).
- **native mobile vs /fe:** *Swift/Kotlin native* (→ /ios·/android) vs *web / React-Native / Flutter cross-platform* (→ /fe, which loads the matching stack reference).
- **/ext vs /fe:** is the difficulty the *browser-extension platform* — manifest, permissions, worker lifecycle, injection, tabs (→ /ext) — or ordinary component/state work that happens to sit inside an extension page (→ /fe)? A `manifest.json` with `manifest_version` is the tell.
