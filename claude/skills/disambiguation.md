# Agent Disambiguation Matrix

With ~48 agents, several domains overlap. Use this matrix to pick the **right** specialist and avoid mis-triggering. When in doubt, prefer the most specific agent for the task's *primary* concern; invoke a second agent only for a genuinely separate concern.

## By task → agent

| If the task is primarily about… | Use | Not |
|---|---|---|
| LLM features in an app (RAG, agents, prompts, evals, guardrails) | **/ai** | MLOps (training/serving infra), /be (CRUD) |
| Training/fine-tuning models, model serving, ML infra | **MLOps** | /ai (app-level LLM features) |
| Analytics pipelines, ETL/ELT, dbt, warehouse, streaming | **/data** | /dba (OLTP), /be (app logic) |
| OLTP schema, indexing, query tuning, migrations, replication | **/dba** | /data (analytics), /perf (whole-request latency) |
| App/business logic, REST APIs, server code | **/be** | /data, /dba, /ai |
| React/Next or React Native/Expo, web/TS UI | **/fe** | native iOS/Android, Flutter |
| Native iOS (Swift/SwiftUI) or Android (Kotlin/Compose) | **/ios · /android** | /fe (RN), Flutter specialist |
| Flutter / Dart cross-platform | **Flutter specialist** | /fe, native mobile |
| Reliability: SLOs, monitoring, alerting, incidents, runbooks | **/sre** | DevOps (infra/CI-CD), /perf (speed) |
| Infra provisioning, IaC, Kubernetes, CI/CD pipelines | **DevOps** | /sre (reliability), /secops (hardening) |
| Speed/efficiency: Web Vitals, profiling, latency, budgets, load tests | **/perf** | /sre (uptime), /dba (schema) |
| Security review, threat modeling, auth, secrets, supply chain | **/secops** | /sre, DevOps |
| Visual/UI design, design systems, prototypes | **/ui (Aura)** | /ux (research) |
| User research, usability tests, personas, journeys, IA | **/ux** | /ui (visual), /ba (business reqs) |
| Business/market requirements, AC, process models | **/ba** | /ux (user research), /po (vision) |
| Completeness audit + workflow gates (APPROVAL_GATE/VERIFIED) | **/verify** | /rev (code quality), /qa (test design) |
| Code quality review | **/rev** | /verify (completeness), /perf (speed) |
| Test case design / BDD | **/qa** | /e2e (automation), /verify |
| E2E test automation | **/e2e** | /qa (design) |

## Common confusions (rules of thumb)
- **/ai vs MLOps:** does the task ship an LLM *feature in the product* (→ /ai) or *operate ML infrastructure* (→ MLOps)?
- **/data vs /dba:** is the database for *analytics* (→ /data) or the *application's live OLTP store* (→ /dba)?
- **/sre vs /perf:** is the goal *staying up* (→ /sre) or *being fast* (→ /perf)? vs **DevOps** = *standing it up*.
- **/ux vs /ui:** *evidence about users* (→ /ux) vs *the visual design* (→ /ui).
- **native mobile vs /fe:** *Swift/Kotlin native* (→ /ios·/android) vs *React Native/Flutter cross-platform* (→ /fe / Flutter).
