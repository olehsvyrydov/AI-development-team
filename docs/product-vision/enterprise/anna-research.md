# Enterprise Pipeline View + Enterprise Positioning — Research (Anna, /ba)

> **Lens:** research / requirements. **Stance:** skeptical, practical, competitive truth — not hype.
> **Scope:** (1) how the best tools visualize a pipeline; (2) epics→tasks across projects/flows + enterprise table-stakes; (3) the agent-control market and where DART honestly fits; (4) prioritized requirements with brutal-honesty gaps.
> **Date:** 2026-06-13. All claims cited inline; sources at the bottom.

---

## 0. Premise check (mandatory before recommending)

The user's premise — *"the pipeline we have now cannot be a commercial/enterprise solution"* — is **correct, but for a deeper reason than the visuals.** Two truths to hold at once:

1. **The visual redesign is real and necessary.** DART's current Pipeline is a horizontal "train": a Backlog bar → stage columns (one per workflow stage, in order) → a Done folder → an Off-track lane (`tasks-board.component.ts`). That is a *stage-partitioned Kanban*, not a *pipeline* in the sense every developer already knows from Jenkins/GitLab/GitHub. It duplicates Backlog and Done — exactly what the user wants gone. So the redesign brief is sound.
2. **But the redesign alone does not make DART "enterprise."** "Enterprise-grade" is overwhelmingly an *organizational-trust* property (SSO/SCIM, RBAC, audit, multi-tenancy, data residency, support SLAs), not a *prettier-graph* property — see §2 and §3. A beautiful pipeline on a local, single-user, file-based tool is still a single-user tool. **We must not let "make the pipeline enterprise-grade" quietly become "make the pipeline prettier" and call the enterprise box ticked.** Those are two different programs of work. This document keeps them separate and tells the truth about each.

**Net:** redesign the Pipeline because it is genuinely weak and undifferentiated — that is justified on its own merits (developer trust, clarity, the "show only in-pipeline work" ask). Position the *enterprise* claim carefully and honestly; most of what makes a buyer say "enterprise" is **not** in the Pipeline view at all.

---

## 1. Pipeline visualization — the conventions developers already expect

Every CI/CD and workflow tool a developer has used has trained them to expect the same handful of conventions. A "pipeline" that violates these reads as *not a pipeline*. This is the single most useful output for the redesign: **match the mental model, then differentiate inside it.**

### 1.1 Compact comparison

| Tool | Layout | Status semantics + colour | Approvals / gates | Drill-in | Empty / stalled |
|---|---|---|---|---|---|
| **Jenkins Blue Ocean** | Left→right linear stages; **parallel stages render as vertical branches** that fan out and rejoin | Per-stage status dot/edge; green pass / red fail / blue-or-spinner running; failed stage halts downstream | Manual `input` step shows as a paused stage awaiting action | Click a stage → step list + console log for that stage | A not-yet-run stage is shown but inert; failure stops the train and the failed node is the focus |
| **GitLab CI/CD** | Stages left→right; **two modes: stage view and a true DAG (`needs`) graph**. Mini-graph (status-sorted) embeds in MR/commit rows | passed / running / **created (waiting on deps)** / failed / **manual** / skipped — each a distinct icon+colour; mini-graph sorts failed-first | Manual jobs render as a distinct "play"/manual node you trigger | Click a job → log; in DAG, **selecting a node highlights its whole dependency path** | Jobs with no relationships are hidden from the DAG view; status is always explicit |
| **GitHub Actions** | Jobs as nodes, **lines = `needs` dependencies**; real-time graph per run | Icon left of each job: success / in-progress / failed, colour-coded; failed blocks dependents | **Environment with required reviewers → job status "Waiting"** until approved; clearly a distinct state | Click job → step-by-step logs | Real-time; a run that can't proceed sits visibly in "Waiting"/queued, not hidden |
| **CircleCI** | Workflow graph of jobs | pass/fail/running + **"on hold"** for approval | **Approval job pauses the whole workflow** ("hold-for-production"); you click Approve in the UI | Click job → steps/logs | Paused workflow sits at the hold job until acted on — the pause is the signal |
| **Azure DevOps / Pipelines** | Stages with **live per-stage status**; pre/post-deployment conditions | live status per stage | **Pre/post-deployment approvals + gates + Manual Validation task**; explicit approve/reject | Drill into stage → jobs → tasks → logs | Stage waits in a pending/approval state; conditions visibly gate the next stage |
| **Argo Workflows** | **DAG graph** (parallel + serial + conditional) | per-node status colour; bottlenecks visible at a glance | (conditionals/dependencies, not human gates by default) | **Drill into a node → that task's logs/diagnostics** | Live + completed runs both viewable; node states explicit |

### 1.2 The 4–5 conventions to honour (these are non-negotiable trust signals)

1. **Directional flow with explicit edges.** Left→right (or top→down) with **lines that mean "depends on / flows to."** A column layout with no edges is a board, not a pipeline. DART's stages are inherently *sequential and gated*, so a clean linear spine (with the occasional parallel/loop branch the workflow allows) is the right base — closer to Blue Ocean/Azure than to a full free-form DAG.
2. **A small, explicit status vocabulary with consistent colour — and "waiting/blocked" is a first-class state.** Passed / running / **waiting-on-gate** / failed-or-blocked / skipped. The single most copied idea worth stealing: GitLab's `created`/`manual` and GitHub's **"Waiting" for approval** and CircleCI's **"on hold"** are *distinct, named states*, not a generic "in progress." DART's gates map perfectly onto this — a ticket parked at a gate is "Waiting for /secops", and that must look different from "running."
3. **Gates/approvals are rendered as a distinct node/marker on the line, not buried in a card.** Every serious tool shows the approval *as a checkpoint on the pipeline itself* (a hold node, a diamond, a "required reviewers" badge). DART already draws gate glyphs (hard = filled diamond, soft = dashed diamond) at stage nodes — that instinct is correct and on-convention; it just needs to be the centrepiece, with who/what is required and one-click "this is the thing blocking you."
4. **Click a node → drill into *that node's* detail/log.** Universally, a stage/job is a door to its own evidence (steps, logs, the agent's work + history). DART's per-ticket attributed/timestamped history is the analogue of "console output" — wire the node→detail drill-in to it.
5. **A stalled/empty pipeline is shown honestly, with the blocker as the focus.** No tool hides the fact that nothing is moving; the *paused/failed/waiting node becomes the focal point* ("here's what's blocking you, here's the approve button"). DART's current "no tasks mid-pipeline" placeholder is the right instinct but should resolve to *"the pipeline is idle — here's the next thing that needs you,"* not an apology.

### 1.3 The differentiator the user is asking for (and a skeptical caveat)

**The honest "different":** every CI tool above visualizes **one run of one repo's pipeline**. DART can do something they structurally cannot: **a pipeline whose stages are a governed *human+agent* workflow, where the "jobs" are tickets and the gates are policy gates that can *refuse*, across many projects.** That framing — *"mission control for your work as it flows through a gated agent workflow"* — is genuinely distinct from "CI run viz."

**Skeptical caveat:** "different" is a liability if it's different *from what developers expect* (see §1.2). The win is **familiar grammar, novel content**: borrow the pipeline grammar wholesale (spine, status vocab, gate nodes, node→log drill-in), and let the novelty be *what flows through it* (tickets, agents, policy gates), **not** a reinvented visual language. A bespoke "train" metaphor that no other tool uses is the current trap.

**"Show only in-pipeline tasks" — endorsed, with one guardrail.** Removing the Backlog bar and Done folder from the Pipeline view is correct: a pipeline shows *work in flight*, and Backlog/Done belong to the Worklist/board. **Guardrail:** keep a tiny, non-duplicating *entry indicator* ("N waiting to enter") and *exit indicator* ("N shipped today") as counts/affordances at the ends of the spine — CI tools show the trigger and the final artifact without turning them into columns. Don't make the pipeline amnesiac about where work comes from and goes to; just don't re-list it.

---

## 2. Epics → tasks across multiple projects and multiple flows (the "lists with different projects and flows" ask)

The user wants DART to help control **tasks/epics across different projects and flows.** Here is the enterprise bar the incumbents have set, and where DART honestly sits.

### 2.1 What the leaders do

- **Hierarchy.** Jira (Advanced Roadmaps) supports a configurable hierarchy *above* Epic (Initiative → Epic → Story → sub-task), but **only on Premium/Enterprise plans.** Azure Boards ships Epic → Feature → Story/Task → Bug out of the box. **Linear** nests **Initiatives → sub-initiatives (5 levels)** and **teams → sub-teams (5 levels)**, with **sub-issues assignable to any team** — multi-level nesting is **Enterprise-plan-gated.**
- **Multiple projects, one view.** Jira Advanced Roadmaps explicitly builds a roadmap across **multiple boards/projects/filters.** Linear lets a **project belong to one team or be shared across many**, while an **issue is tied to a single team.** This cross-project roll-up is precisely the "across different projects" capability the user wants — and it is the paid tier in every case.
- **Different workflows per project/team.** Linear: **workflows customised per team** (engineering vs design vs marketing get different statuses); sub-teams **inherit parent workflow but can diverge.** Jira: **custom workflows per project/issue-type.** This is the "different flows" half of the ask, and it is *table-stakes* for these tools — DART's per-project `workflow.yaml` is conceptually aligned but is the floor, not the differentiator.

### 2.2 Enterprise table-stakes for a "manage epics/tasks across projects" tool

From the enterprise-readiness literature, the floor that survives an IT security review in 2026 is consistent: **RBAC first** (everything depends on roles), **audit logs second** (every enterprise buyer asks, and they must be *queryable via API*, not just generated), **SSO/SAML/OIDC third** (not supporting SSO "signals you're not enterprise-ready"), **SCIM last** (on request). Add to that **multi-tenancy, data residency, a real API/webhooks, and works-council/GDPR readiness.** Weighted scoring across SSO/SCIM/RBAC/GDPR/multi-tenancy is described as "the enterprise floor for any serious shortlist."

### 2.3 Brutally honest gap

DART, **as a local, file-based, single-user, zero-dependency tool, meets approximately none of the §2.2 table-stakes today**, because most of them are *meaningless for a single local user*: RBAC needs multiple users; SSO needs an IdP; audit-log-as-compliance needs a tamper-evident multi-user record; SCIM needs a directory. DART's file-based ledger is a *good audit trail for one operator* but is **not** an enterprise audit log (it's git-mutable, single-actor). **This is the central tension:** the user wants "enterprise," but DART's defining virtue (local, zero-dep, your-files, OSS) is in direct tension with the *organizational* features that define "enterprise." See §3 for the resolution.

---

## 3. The agent-driven market — is there a real category, and where does DART fit?

### 3.1 The skeptical headline: the category exists, and the incumbent just took the name

DART's own VISION calls the category **"Agentic Dev Governance — a control plane on top of your coding tool."** In **October 2025, GitHub shipped Agent HQ**: explicitly *"a control plane to govern AI access and agent behavior,"* with **Mission Control** (assign/steer/track multiple agents from web/VS Code/CLI/mobile), **agentic code review (CodeQL)**, **a metrics dashboard**, and **admin controls for agent permissions, security policy, and audit logs** — partner agents (Anthropic, OpenAI, Google, Cognition, xAI) bundled into the **existing Copilot subscription at no surcharge.** Microsoft is building the same shape into **Copilot Studio / Azure Agent Mesh** with Entra ID identity inheritance and policy enforcement (approved-libraries-only, mandatory SonarQube scans).

**So: yes, there is a real category — and the two largest dev platforms on earth now occupy it, for free, inside the tools enterprises already buy.** Any "DART is the control plane for AI dev agents" pitch now collides head-on with Agent HQ. We must be honest about this with /po and /mkt.

### 3.2 Where DART *cannot* realistically compete

- **The org-trust enterprise sale (the Fortune-500 "platform" deal).** Agent HQ/Copilot/Azure win this on identity (Entra), bundling, audit-at-scale, support, and procurement gravity. A local OSS tool **cannot** out-enterprise the platform the customer already pays Microsoft for. Chasing this is a losing battle.
- **Multi-user collaboration, real-time, hosted.** DART is local/single-user/file-based. Linear/Jira/GitHub own shared, hosted, multi-user planning. Re-platforming DART into a hosted multi-tenant SaaS to compete here would **abandon its only moat** (OSS, your-keys, your-files, zero-dep) and put it in a fight it can't win.
- **"Audit log" as a compliance artifact.** A git-mutable file ledger is not SOC2-grade tamper-evidence. Don't claim it.

### 3.3 Where DART *can* credibly win (the honest positioning)

- **Tool-agnostic, on-top-of-the-tool-you-already-use, with your own keys.** Agent HQ governs *GitHub's* agents inside *GitHub's* walls. DART's stated wedge — **govern Claude Code / Cursor / Kiro across many local + client projects, no vendor lock-in, no new model bill** — is a real gap Agent HQ structurally won't fill (it wants you in GitHub). This is the defensible story, *if told as "portable governance layer," not "enterprise platform."*
- **The solo operator / small agency, not the enterprise.** The VISION's own wedge user (the Operator running agents across personal/client projects; growth to teams of 2–15 and agencies) is **exactly the segment Agent HQ underserves** (it's built for orgs already standardised on GitHub Enterprise). DART should **double down on "many projects, many tools, one local control surface for the independent/agency developer"** — and treat "enterprise" as *a credibility posture* (looks governed, auditable, gated) rather than a *feature checklist it can't pass.*
- **The governance gap is real and unmet.** Gartner: **>40% of agentic-AI projects will be cancelled by 2027** over cost, unclear value, and **inadequate risk controls**; only ~21% of orgs have a mature governance model. "Bounded autonomy" (clear limits, escalation to humans, audit of agent actions, governance-agents-watching-agents) is named as the leading-org pattern. **DART's gates-that-refuse + attributed ticket history + rules-with-teeth are literally this pattern at the individual/team scale.** That's a credible, differentiated message — for the operator/agency, not the F500.

### 3.4 What an enterprise *buyer* would need (so we set expectations honestly)

If DART ever pursues even a *team/agency* "enterprise-lite" buyer, the literature says the minimum credible set is: **RBAC, queryable audit log, SSO (SAML/OIDC), data residency clarity, a real API, and a support/SLA story** — in that priority order. **Today DART has none of these in a multi-user sense.** Therefore the honest near-term framing is **"enterprise-*grade* experience for the independent operator"** (the *quality bar* — clarity, governance, auditability, polish), explicitly **not** "enterprise *platform*" (the org-trust feature set). Conflating the two will get DART laughed out of any real enterprise eval.

---

## 4. Prioritized requirements (MoSCoW) with skeptical gap flags

### 4.A — The Pipeline view redesign (the funded, justified work)

**MUST**
- **M1. Directional spine with explicit edges.** Stages flow left→right (or top→down) along a visible line; the line *means* "flows to / depends on." No edge-less columns. *(Convention §1.2.1.)*
- **M2. Explicit, small status vocabulary with a first-class "Waiting-on-gate / Blocked" state**, colour- and icon-coded distinctly from "running" and "done." *(§1.2.2 — the single highest-value steal.)*
- **M3. Gates rendered as checkpoint nodes on the spine**, each naming *what/who is required* and surfacing the one-click action when it's the blocker. *(§1.2.3; DART's existing gate glyphs are the seed.)*
- **M4. Click a stage/ticket node → drill into that node's attributed, timestamped agent history** (DART's analogue of console logs). *(§1.2.4.)*
- **M5. Show ONLY in-flight work.** Remove Backlog and Done as columns; keep them only as non-duplicating end-of-spine *count indicators* (entry "N waiting" / exit "N shipped"). *(User ask + §1.3 guardrail.)*
- **M6. Idle/stalled pipeline resolves to "what needs you next," not an apology.** The blocker is the focal point. *(§1.2.5.)*
- **M7. Familiar grammar, novel content.** Reuse the universal pipeline visual grammar; novelty lives in *what flows* (tickets/agents/policy gates), not a bespoke visual language. *(§1.3.)*

**SHOULD**
- **S1. Live updates** (the board already projects SSE pushes) so an agent's CLI move animates on the spine — match the "real-time run" feel of GitHub Actions/Azure.
- **S2. Off-track / re-home affordance** preserved (DART already has it) — render it as an honest "derailed" marker, not hidden.
- **S3. Parallel / loop branches** where the workflow allows them (Blue-Ocean-style fan-out/rejoin), since DART workflows can have conditionals/loops/background agents per VISION.
- **S4. A run/flow selector** so one project's pipeline can be scoped to a track/flow (aligns with §2's "different flows").

**COULD**
- **C1. Cross-project pipeline roll-up** (all projects' in-flight work on one spine or small-multiples) — this is the bridge to §2's "across different projects" and a genuine differentiator vs single-repo CI views.
- **C2. Mini-pipeline / status-strip** embeddable in the Projects Home cards (à la GitLab mini-graph).

### 4.B — The "enterprise positioning / epics-across-projects-and-flows" bar

**MUST (to make the claim *honest*, even at operator scale)**
- **M8. Epic→task hierarchy** (at least one level above ticket) so "epics across projects" is literally true, not aspirational. *(§2.1 — table-stakes everywhere.)*
- **M9. Multi-project, multi-flow first-class** — different `workflow.yaml` per project, viewable together. DART is close; make it explicit and visible. *(§2.1.)*
- **M10. Truth-in-labelling.** Market the *quality bar* ("enterprise-grade experience for the operator/agency"), not the *feature set* DART can't pass. *(§3.4 — non-negotiable to retain credibility.)*

**SHOULD (the credibility floor IF a team/agency buyer is ever targeted)**
- **S5. RBAC** (needs multi-user — a re-platform decision, flag to /arch + /po).
- **S6. Queryable audit log** (read-API, tamper-evidence) — the current git-mutable file ledger does **not** qualify. *(§2.2, §3.2.)*
- **S7. SSO (SAML/OIDC)** — only meaningful once multi-user exists.

**WON'T (now — and we should say so out loud)**
- **W1. Hosted multi-tenant SaaS re-platform** — abandons the OSS/local/your-keys moat to lose to Agent HQ/Linear/Jira. *(§3.2.)*
- **W2. SCIM, data-residency guarantees, SOC2** — premature; no single-user demand. *(§2.2.)*
- **W3. "We are the enterprise control plane for AI agents"** as a headline — collides directly with GitHub Agent HQ (bundled, free, inside the customer's existing tool). *(§3.1.)*

### 4.C — Brutal-honesty gap flags (table-stakes-but-missing)

| Gap | Severity | Reality |
|---|---|---|
| No edges/flow direction on the current "train" | **High** | Reads as a board, not a pipeline — fails the very first developer expectation. *(§1.2.1)* |
| No first-class "Waiting/Blocked-on-gate" status | **High** | The most universal, most-copied CI convention; DART's gates are tailor-made for it but it isn't surfaced as a status. *(§1.2.2)* |
| Pipeline duplicates Backlog + Done | Medium | Exactly the user's complaint; cheap to fix. *(M5)* |
| No epic-level hierarchy | **High** | "Manage epics across projects" is currently a claim without the data model behind it. *(M8)* |
| Audit log = git-mutable file ledger | **High (for enterprise claim)** | Good operator journal, **not** a compliance audit log. Don't market it as one. *(§3.2, S6)* |
| Category name collides with GitHub Agent HQ | **Critical (positioning)** | Incumbent owns "control plane for AI agents," bundled and free. DART must re-aim at *portable, tool-agnostic, operator/agency* governance, not enterprise-platform. *(§3.1, §3.3)* |
| RBAC/SSO/SCIM absent | Medium (deferred) | Meaningless single-user; required only if a team/agency buyer is pursued. Sequence: RBAC → audit → SSO → SCIM. *(§2.2)* |

---

## 5. Bottom line for /po, /arch, /ui

1. **Redesign the Pipeline — yes, it's justified.** Make it a *recognisable pipeline*: directional spine + edges, a tiny status vocab with a first-class **Waiting-on-gate** state, gate checkpoints as the centrepiece, node→history drill-in, and **only in-flight work** (Backlog/Done become end-of-spine counts). Borrow CI grammar wholesale; let the novelty be *tickets+agents+policy-gates flowing through it.*
2. **Tell the enterprise truth.** "Enterprise-grade" here means a *quality/governance bar for the independent operator and small agency* — clarity, auditability of agent actions, gates that refuse, epics across projects/flows. It does **not** mean the org-trust feature set (SSO/SCIM/RBAC/SOC2), which DART can't and shouldn't chase now.
3. **Re-aim the category before /mkt writes a line.** GitHub Agent HQ now *is* "the control plane for AI agents," bundled and free. DART's defensible wedge is **tool-agnostic, on-top-of-your-existing-tool, your-keys, many local/client projects** — the operator/agency Agent HQ structurally underserves — riding the real, unmet **agent-governance** gap (Gartner: >40% of agentic projects cancelled by 2027 on weak risk controls).

---

## Sources

**Pipeline visualization**
- Jenkins Blue Ocean — pipeline viz, parallel stages: https://www.jenkins.io/doc/book/blueocean/ ; https://www.jenkins.io/projects/blueocean/about/ ; parallel-stage rendering: https://wiki.jenkins-ci.org/JENKINS/Rationalising-parallel.html
- GitLab CI/CD pipelines + DAG + statuses: https://docs.gitlab.com/ci/pipelines/ ; https://docs.gitlab.com/ci/directed_acyclic_graph/ ; jobs/statuses: https://docs.gitlab.com/ci/jobs/ ; `needs`: https://docs.gitlab.com/ci/yaml/needs/
- GitHub Actions visualization graph + "Waiting" approvals/environments: https://docs.github.com/actions/managing-workflow-runs/using-the-visualization-graph ; deploying/environments: https://docs.github.com/en/actions/use-cases-and-examples/deploying/deploying-with-github-actions
- CircleCI approval / "on hold" jobs: https://circleci.com/docs/guides/orchestrate/workflows/
- Azure DevOps approvals, gates, Manual Validation, live stage status: https://learn.microsoft.com/en-us/azure/devops/pipelines/release/approvals/ ; https://learn.microsoft.com/en-us/azure/devops/pipelines/process/approvals
- Argo Workflows UI / DAG / node drill-in: https://argoproj.github.io/workflows/ ; https://komodor.com/learn/understanding-argo-workflows-practical-guide-2024/

**Epics / multi-project / multi-flow + enterprise table-stakes**
- Jira Advanced Roadmaps (cross-project, custom hierarchy, Premium/Enterprise): https://www.atlassian.com/software/jira/guides/advanced-roadmaps/overview ; https://www.atlassian.com/agile/teams/advanced-roadmaps-teams
- Linear sub-initiatives / sub-teams (5-level nesting, per-team workflows, Enterprise plan): https://linear.app/docs/sub-initiatives ; https://linear.app/docs/sub-teams ; https://linear.app/changelog/2026-04-09-multi-level-sub-teams ; projects/teams: https://linear.app/docs/projects ; https://linear.app/docs/teams
- Tool comparison (Jira/Linear/Shortcut/Azure DevOps): https://talentblocks.com/blog/linear-vs-shortcut-vs-jira-vs-azure-devops-which-tool-offers-the-best-flexibility-and
- Enterprise readiness order (RBAC→audit→SSO→SCIM), SSO as table-stakes, queryable audit: https://hashorn.com/blog/enterprise-ready-saas-sso-scim-audit-logs ; https://ssojet.com/blog/critical-audit-log-events-b2b-saas-enterprise ; https://guptadeepak.com/what-is-enterprise-identity-and-why-most-companies-get-sso-rbac-catastrophically-wrong/

**Agent-control market**
- GitHub Agent HQ (control plane, Mission Control, audit, bundled, partner agents): https://github.blog/news-insights/company-news/welcome-home-agents/ ; https://www.infoworld.com/article/4080888/github-launches-agent-hq-to-bring-order-to-ai-powered-coding.html ; https://venturebeat.com/ai/githubs-agent-hq-aims-to-solve-enterprises-biggest-ai-coding-problem-too
- Microsoft Copilot Studio / Azure Agent Mesh, Entra identity, policy enforcement: https://windowsnews.ai/article/top-ai-agent-platforms-in-2026-coding-agents-workflow-builders-and-orchestrators-compared-for-the-en.425091 ; https://www.techtimes.com/articles/317596/20260602/github-copilot-replaces-gpt-4-project-polaris-ships-multi-agent-vs-code-build.htm
- Governance gap, "bounded autonomy," Gartner cancellation/maturity stats, market size: https://joget.com/ai-agent-adoption-in-2026-what-the-analysts-data-shows/ ; https://www.firecrawl.dev/blog/agentic-ai-trends ; https://tech-insider.org/agentic-ai-enterprise-2026-market-analysis/

**DART internal**
- Current Pipeline "train" implementation: `studio/cockpit/src/app/shell/tasks-board.component.ts`
- Stated category + wedge user + OSS contract: `docs/product-vision/VISION.md`
