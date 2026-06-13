# DART as an Enterprise Product — the Pipeline view, epics/flows, and the dual-audience MVP

> Product lens by **Max** (`/po`). Status: proposal draft. **No code.**
> Companion lenses (same investigation): `/arch`, `/ui`, `/secops`, `/ba` (their files alongside this one).
> Grounding (load-bearing, verified in-repo, do not re-litigate):
> - **Flows already exist** as `tracks` (per-project, named, gated) in `hub/lib/state.js` + `engine.js`. We are not inventing them; we are *naming and surfacing* them.
> - **Multi-project already exists** as the user-global registry (`~/.aidevteam/registry.json`). What is missing is a cross-project *view*, not the data.
> - **Epics do NOT exist** in the model. This is the one genuinely new product object.
> - **The agent control plane already exists**: the directive digest (`digest.js`) agents read each turn, the gate/advance/comment writes they make, and the deterministic `engine.js` that acts unattended. The board partition (`board.ts`) is already sophisticated.
> - **Monetization is already decided** in `strategy.md` (open-core: free single local project; paid multi-project control plane + enforced governance + audit/history/SSO). This document does not re-open that; it defines *what to build* to make those paid surfaces real.

---

## 1. The enterprise product — honestly, in one paragraph

**DART is the control plane for AI-agent software delivery: a local-first surface where a developer sees, steers, and *governs* a roster of specialist agents driving real work through a visible, gated pipeline — across every project they own — and where the agents themselves read their next move and report progress through the same governed surface.** It is bought by **engineering leads and senior/staff developers who already run AI coding agents and have lost the thread** — work scattered across repos and sessions, no shared answer to "what is each agent doing, what is stuck, and did it follow our rules." They pay because DART answers three questions nothing else does at once: *where is the work* (pipeline across projects), *who/what owns each step* (agent + gate), and *can I prove the process was followed* (enforced gates + audit history). 

**Skeptical verdict — is this a product or a power-user toy?** Today it is a power-user tool. It becomes a *product* only if it wins one sharp job: **"governed visibility and control over agent work across my projects."** It WINS in the narrow, defensible niche of **agent-control + gated governance for AI-native dev teams** — the seam no incumbent occupies (Cursor/Kiro are IDE-bound and single-project; Devin is a black box; Linear/Jira have no agent model or enforced gates). It must **NOT** pretend to be: a full Jira/ALM replacement (sprints, story points, capacity, reporting suites), a generic automation builder (n8n), a new IDE/model, or a cloud SaaS hub. The honest TAM is **not** "all of project management" — it is the (fast-growing but bounded) population of teams running AI agents who need to *trust and control* them. That is a wedge, not an ocean. The strategy is right: free single-project to seed; the *enterprise* value is the multi-project, governed, auditable control plane.

---

## 2. The Pipeline view's product JOB

**The worklist answers "what should I touch next?" The Pipeline answers "is the work flowing, and where is it stuck?"** They are different jobs and both must exist. The worklist is a personal to-do triage (bands: needs-you → in-flight → backlog → done). The Pipeline is the **CI-pipeline mental model for agent work**: a left-to-right view of the gated stages with work *flowing through them*, so a lead can read **flow health at a glance** the way they read a Jenkins/GitLab pipeline — green flowing, red stuck, a gate blocking.

### What the Pipeline MUST do (ranked — this is the redesign brief)

1. **Show the gated stages as the spine, with live work on them.** Stage columns/lanes (vision → … → done), each showing the tickets currently *at* that stage. This is the "see the flow" job. (board.ts already partitions this — the redesign is making it *read as a pipeline*, not a generic kanban.)
2. **Make bottlenecks and blocks unmissable.** A stage where work is piling up, a *hard gate rejected*, a ticket looped back N times — these must shout. Flow health is the headline, not a detail. ("Needs you" and gate state already exist in the model; the Pipeline must *visualize concentration*, not just per-card chips.)
3. **Show who owns each stage and each gate.** Every stage has an owner agent (`/arch`, `/secops`, …) and possibly a gate. The Pipeline answers "who/what is responsible for this step" — the accountability view.
4. **Let a human act on a gate *from the pipeline*.** The #1 human action on a pipeline is *unblocking a gate* (approve/reject/redirect). The Pipeline must surface the gate and offer the decision in place — not bounce to a modal three clicks away.
5. **No duplication, in-pipeline tasks only.** The user's explicit constraint. A ticket appears **exactly once**, at its current stage. Backlog (not-yet-routed) and Done (terminal) are *holding pens*, not duplicated columns. Off-track work (stage deleted from the flow) is surfaced, never silently dropped. (board.ts already enforces single-region disjointness — keep and honor it.)

### The #1 job — explicit

> **See the health of work flowing through the gated stages and act on what's blocking it** — a CI-pipeline read for agent work, where a glance tells you "flowing" vs "stuck at the security gate," and one action unblocks it.

### When is the Pipeline actually used vs the worklist? (skeptical)

- **Worklist** — the *daily default* for an individual: "what needs me / what's in flight." Used many times a day, single-project. It should stay the default project landing.
- **Pipeline** — used when **work is genuinely mid-flow across multiple stages at once** (the repo already computes `populatedStageCount` for exactly this), and by the **lead/reviewer persona** asking "is the system healthy?" If a project has 3 tickets all in backlog, the Pipeline is theater — show the worklist. **Honest caveat:** for a *solo dev on one small project*, the Pipeline is often overkill; its real value appears with **volume and with the cross-project rollup** (§3). That is precisely why it is an *enterprise* surface, not the free-tier hero.

---

## 3. Epics, projects, flows — the practical product model

The user asked for "tasks/epics lists across different projects and flows." Mapping to what exists:

| Object | Status today | Product definition (decisive) |
|---|---|---|
| **Task (ticket)** | Exists, rich (stage/gate/owner/status). | The unit of work. No change to the atom. |
| **Flow (track)** | **Exists** as `tracks` — named, gated, per-project. | A named gated workflow for a *class* of work (e.g. `feature`, `hotfix`, `docs`). Already multi-per-project. **Job: name and surface them**, let a ticket declare its flow, let the Pipeline show *one flow at a time* (a hotfix pipeline ≠ a feature pipeline). |
| **Project** | **Exists** (registry). | A connected repo. Multi already works; the gap is a *cross-project view*. |
| **Epic** | **Does NOT exist.** | The one new object: a **named grouping of tasks toward a feature/outcome**, with a roll-up of progress. *Optionally* spans projects (a feature touching api + web). This is what makes "epics lists" real. |

### MVP — must / should / could (ruthless)

**MUST (this is the enterprise wedge — without these it is not enterprise):**
- **The redesigned single-project Pipeline** (§2) — flow-health read, gate action in place, in-pipeline tasks only, one flow at a time.
- **Named flows surfaced**: a flow switcher on the Pipeline (the data is already there as `tracks`; today it silently renders one). A ticket shows which flow it's on. This is *surfacing existing data*, near-zero model cost, high "enterprise" payoff.
- **Epics as a grouping with progress roll-up** — within a single project first. An epic = id + title + member tickets; its card shows `done/total + needs-you`. Reuses the exact progress primitives `board.ts` already computes (`worklistProgress`). This is the new object, kept minimal.

**SHOULD (credibility multipliers, fast-follow):**
- **Cross-project pipeline rollup** — the *portfolio* view: one screen, every connected project's flow-health summarized (flowing / stuck / needs-you count), drill into one. This is the literal "across different projects" ask and the clearest *enterprise* (vs solo) differentiator. Data exists per-project; this is an aggregation + a view.
- **Epics that span projects** — a feature touching two repos rolls up across both. Higher value, higher cost than single-project epics; defer until single-project epics prove the object earns its keep.

**COULD (only if pulled by evidence — resist):**
- Epic dependencies / ordering, swimlanes by epic, custom flow authoring UI beyond the existing builder, portfolio analytics/burndown. **These smell like the Jira-replacement trap.** Build only when usage demands.

**WON'T (explicit anti-scope):** sprints, story points, capacity planning, velocity charts, a reporting suite. DART is a *control plane*, not an ALM. Saying this out loud protects the product.

---

## 4. Dual audience — "fully controllable + interactive" for human AND agent

The product is only credible if **both** audiences are first-class. Concretely:

### The HUMAN must be able to (see + steer + govern):
- **See** flow health (Pipeline), the worklist, and the cross-project rollup — at a glance, honestly (absent-not-zero, no fake greens).
- **Steer**: redirect a ticket to another stage/flow, reassign an agent, re-prioritize the backlog.
- **Govern**: approve/reject a gate **from the pipeline**, with the decision recorded. This is the load-bearing human action — the whole "enforced gates" value collapses if approving is buried.
- **Plan**: create an epic, drop tasks into it, see it roll up. Create a ticket on a chosen flow.
- **Trust**: read the history/audit of who/what did what (already in the comment log; surface it).

### The AGENT must be able to (read + advance + report — fully + safely):
- **Read its state and directives** — the per-turn digest (`digest.js`) already projects "your tickets, stages, gates, pending directives." Enterprise bar: this must be **complete** (the agent never needs to guess) and **scope-correct** (it sees its project, not others').
- **Advance / gate / comment** via MCP writes — the existing gate/advance/directive surface. Enterprise bar: **safe by construction** — an agent can *never* pass a safety gate it doesn't own, route past an unmet hard gate, or escape its project scope. `engine.js` already enforces this closed-grammar safety; the product promise is that this *holds at the surface the agent touches*.
- **Be acted-on, not act-on-prompt**: directives are **DATA, not instructions** (digest.js already fences them). The product must never let a crafted ticket body command an agent. This is a *product* guarantee, not just a security detail — it is why a lead can trust DART with agents.

**Skeptical product test for every feature: "Can a human do this, AND can an agent do the equivalent through MCP, AND is the agent path safe?"** If a feature is human-only (a button with no agent equivalent) or agent-only (a write with no human visibility/override), it fails the dual-audience bar.

---

## 5. The enterprise MVP roadmap — sequenced, skeptical, decisive

Anchored to DART's **local/file-based reality** (don't fight it — the file-based ledger *is* the git-native audit trail that makes the governance story true).

**Phase 1 — The Pipeline redesign (the user's first ask; do this now).**
Redesign the single-project Pipeline to the §2 brief: stages-as-spine, flow-health-first, bottleneck/gate-block unmissable, **act-on-gate in place**, in-pipeline-tasks-only (no duplication), **flow switcher** surfacing the existing `tracks`. *Mostly a view over data that already exists* (`board.ts` partition, `workflowView`, gate state) — low backend cost, high "is this enterprise?" payoff. Ship this, validate the mental model, before building new objects.

**Phase 2 — Epics (single-project) — the new object, minimal.**
Introduce the epic: group tasks, roll up progress (reuse `worklistProgress`). An epics list and an epic card. This delivers the "epics lists" ask and is the smallest *new* thing that makes DART feel like it plans work, not just tracks it. Gate it behind real usage of Phase 1.

**Phase 3 — Cross-project rollup — the enterprise differentiator.**
The portfolio view: every connected project's flow-health on one screen, drill into one. This is the sharpest *enterprise-vs-solo* line and the literal "across different projects" ask. Aggregation over existing per-project state + the registry — no new source of truth.

### Top-3 enterprise capabilities (the credibility bets, in order)
1. **Pipeline-as-flow-health with in-place gate action** (Phase 1) — turns the weak board into the thing the user actually asked for and the thing only DART does.
2. **Cross-project rollup** (Phase 3 value, the differentiator) — "control across projects" is the enterprise promise; without it DART is a single-repo tool.
3. **A complete, safe, dual-audience agent surface** (cross-cutting, continuous) — the agent must read everything it needs and write only what's safe, on *every* surface above. This is the moat (governed agents), and it must be funded as a first-class capability, not assumed.

> Note the deliberate ordering: **epics rank below the cross-project rollup and the agent surface for *enterprise* credibility.** Epics make DART feel complete to a human planner; the rollup + the safe agent surface are what an engineering lead *pays* for. Build the wedge before the polish.

---

## Open questions for the team
1. **Flow scope on the Pipeline** — one flow at a time (my recommendation, matches the CI mental model) vs all flows interleaved? (`/arch` + `/ui`.)
2. **Epic as first-class ledger object vs a label/grouping over tickets?** Cheapest is a grouping; first-class costs a model change. (`/arch`.)
3. **Cross-project rollup — read-only aggregation only, or can a human act (gate-approve) on another project from the rollup?** Acting cross-project raises real scope/auth questions. (`/secops`.)
4. **Does an epic ever span projects in the MVP, or strictly single-project first?** (My call: single-project first.)
</content>
</invoke>
