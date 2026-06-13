# Tasks view redesign — Product proposal (Max, /po)

**Author:** Max (`/po`) — Senior Product Owner
**Type:** Product proposal. No code. The product-vision lens of a five-agent parallel investigation.
**Date:** 2026-06-13
**Companion docs:** [strategy-apex.md](../strategy-apex.md) (positioning — control made visible) · [research-anna.md](../research-anna.md) (rule + label model) · [redesign-home-tasks-knowledge-aura.md](../redesign-home-tasks-knowledge-aura.md) §2 (the current "train" refinement) · [rev-tasks-adaptive.md](../rev-tasks-adaptive.md) (the adaptive-station code state) · [VISION.md](../../VISION.md) (MVP scope; Recall; control plane).

---

## 0. The confirmed problem, reframed as a product problem

The Tasks board organises its centre by **workflow STAGE** (vision → arch → secops → … → done). Tasks cluster in `backlog` and `done`, so the middle is empty — and the user dislikes it. The adaptive refinement (`tasks-adaptive-aura.md` / `rev-tasks-adaptive.md`) collapses empty stages to thin "stations" so the empty middle is *tidier* — but it keeps **STAGE as the organising principle**. That is the real issue.

**The product diagnosis:** the board answers a question the user is rarely asking. "Which stage is each task in?" is a *pipeline-shaped* question — interesting when work is flowing evenly across many stages, which is exactly **not** how an AI-agent dev flow looks. In an autonomous flow, stages are transited in seconds by agents; the human doesn't watch a task crawl down a pipeline. The human shows up at **decision points** — and between those, the pipeline is empty because the agents already moved the work through it. **An empty centre is not a layout bug; it is the stage-pipeline answering the wrong question.** The fix is to change the question the default view answers, not to shrink the empty columns.

This proposal defines that question (the job), what makes DART's answer different from a generic board, the decisive DEFAULT, and the MVP scope.

---

## 1. The job of the Tasks view (ranked jobs-to-be-done)

The Tasks view is **the human's window into, and steering wheel over, an autonomous agent flow they configured.** DART records intent; the host tool's agents execute (Apex §1.4; Jorge §2.1). So the view's job is *not* to do the work — it is to make the **human's part** of the loop effortless and the **agents' part** legible. Ranked by value:

| Rank | Job (JTBD) | The user's words for it | Why this rank |
|---|---|---|---|
| **#1** | **"What needs ME right now?"** — surface every task the autonomous flow is *waiting on a human for*: a gate to approve, a rejection to redirect, a blocked task, a decision, a directive the agent is awaiting. | *"As soon as I add a comment, the triggered agent pays attention"* — and conversely, the flow pauses at the gates I own until I act. | This is the **killer job**. In an autonomous flow the human is the *bottleneck-by-design* at exactly the human-in-the-loop points. Every second a "needs-you" item sits unseen, the whole flow for that ticket is stalled. Nothing else the view does creates more value than collapsing the time-to-notice on these. |
| **#2** | **"What's in flight, and which agent is on it?"** — the live read of autonomous work: which tickets are moving, who (which `/agent`) owns each, what just routed it there. | *"the dev flow runs automatically"* — I want to *watch* it run, confirm it's healthy, catch a wrong turn. | The trust/legibility job. The user delegated control to rules + agents; they need to *see* the delegation working (and spot a loop or a stuck ticket) without micromanaging. Second only to acting, because seeing precedes intervening. |
| **#3** | **"What just finished / what's next?"** — recently completed work (the throughput/accomplishment read) and what the flow will pick up next. | *"the dev flow runs automatically… done"* | Momentum + closure. Lower than #1/#2 because it is retrospective/anticipatory, not actionable *now* — but it is where most tasks actually live (backlog/done), so the default must handle it gracefully, not hide it. |
| **#4** | **"Drill into one ticket"** — open a task to read its description, comments, gates, routing labels, and act: approve, advance, comment, redirect. | *"I add a comment in DART"* | The execution surface for jobs #1–#3. Ranked last only because it is the *destination* of the first three, not the at-a-glance read — but it is where the actual steering happens, so it must be one click from every list. |

**The #1 job is the product.** A Tasks view that nails "what needs me right now" — and lets me act on it in one click — is a better tool than a beautiful pipeline that buries the two approvals I owe behind a tidy row of empty stations. Everything else is in service of, or secondary to, #1.

---

## 2. What makes DART's Tasks view DIFFERENT (vs generic Jira/Linear/Trello)

A generic board assumes **humans do the work and the board tracks it**. DART inverts this: **agents do the work; the human governs it.** That inversion is the entire differentiation. Concretely:

| # | Differentiator | A generic PM board | DART's Tasks view |
|---|---|---|---|
| **D1** | **Needs-you is the first-class citizen, not a filter.** | "Assigned to me" is one saved filter among many; the board's spine is status columns. | The human's pending decisions are the **default, top-of-view content**. The board is built *around* the handful of items the autonomous flow is waiting on a human for — because that is the human's whole role. |
| **D2** | **The actor is an AGENT, and that's visible.** | Avatars are humans; "who's working on it" is social. | Each in-flight ticket shows the **`/agent`** driving it (`/be`, `/rev`, `/ui`) and *why it routed there* (the rule/label that moved it — Anna AC-W1; Apex §4.1). The board makes *delegated, automated* work legible — a generic board has no concept of "a rule routed this." |
| **D3** | **Steering is comment + approve, not drag.** | You drag cards between columns; movement *is* the work. | The flow moves itself; the human **approves a gate, redirects via a routing label, or drops a comment that a triggered agent picks up** (`TO_DEV_BE` → routes to `/be`). No card-drag — advancing past a gate is a guarded decision, not a free gesture (Aura §2.4). The view's verbs are *approve / redirect / comment*, not *move*. |
| **D4** | **Gates and loops are part of the model.** | No notion of a refusable gate or a loop budget. | A ticket can be **blocked by a hard gate that's never skipped**, or **looped back N times until it needs you** (Apex "looped 3× → needs you"; Anna §5 loop safety). These autonomous-flow states are first-class signals the view must surface — a generic board can't represent them. |
| **D5** | **It mirrors a flow YOU programmed.** | The columns are a generic lifecycle the tool ships. | The stages, gates, labels, and routing are **the user's own `when → do` rules** (Apex §1.1). The Tasks view is the *runtime* of the workflow the user authored in the builder — operating and authoring are two views of one program. |

**The defensible seam:** nobody else makes *the human's governance role over autonomous agent work* the centre of the board. That is the product. The generic board tracks *where work is*; DART surfaces *where the human is needed* and *what the agents are doing* — monitoring + steering, not tracking.

---

## 3. The recommended DEFAULT view + MVP scope

### 3.1 The decision (decisive)

> **The DEFAULT Tasks view is a needs-you-first WORKLIST, not a stage pipeline.**
> When you open Tasks, you land on **"what needs you"** at the top (the queue of human-in-the-loop items, each one-click-actionable), then **"in flight"** (live agent work with the owning `/agent` and what routed it), then **"recently done"** (collapsed). The **stage pipeline becomes an optional MODE you switch to**, not the thing you land on.

**Rationale (why this, not the adaptive-station refinement):**
- It answers the **#1 job** the instant the view opens, with zero scrolling past empty stations.
- It is **useful precisely when most tasks are backlog/done** — the exact condition that breaks the pipeline. A worklist with "nothing needs you · 3 in flight · 27 done" is a *calm, true, satisfying* read; an empty pipeline centre is a *wasted* read.
- It is **honest to the autonomous flow**: the human's role is the queue, so the queue is the view.
- It **reuses the data we already produce.** The Core already emits a canonical `taskSummary.byStatus.needsYou` count and per-ticket `needsYou`, `labels`, gates, `expectedOwner`/`assignee`, and status (confirmed in `tasks-board.component.ts` and `tasks-panel.component.ts`). The worklist is a **new projection over the same ticket list** — no new backend contract for v1.
- The stage pipeline is **not thrown away** — it is preserved as a mode (it is genuinely the best view when you *are* curious about flow, or when many stages are simultaneously active). The adaptive-station work is the right *implementation of that mode*; this proposal demotes it from default to optional.

### 3.2 MVP scope (MoSCoW)

**MUST have (v1 default — useful, honest, actionable):**

- **M1 — Needs-you queue as the default landing section.** Top of the view lists every task that needs the human: a gate awaiting your approval, a rejection routed back, a `BLOCKED_*` ticket, a loop that exceeded its budget, a directive awaiting your tool. Ordered most-urgent-first. Each row states **why** it needs you in plain words ("`/arch` approval pending", "looped 3× — needs you", "blocked: external dependency").
- **M2 — One-click act from the queue.** Each needs-you row exposes its primary action inline — **approve the gate / advance / open to redirect or comment** — routed through the existing guarded control plane (expectedRev, 409-aware). The human resolves the item without leaving the list where possible; otherwise one click opens the detail.
- **M3 — In-flight section: live agent work, legibly.** Below the queue, the tasks currently moving, each showing the **owning `/agent`**, its status, its current stage, and **what routed it there** (the label/rule) when present. This is the "the flow is running" read.
- **M4 — Recently-done, collapsed.** A compact "Done × N" affordance (the folder idea from Aura §2.5) — present, celebratory, not dominating. Expands on click. Most tasks live here; the default must hold them without clutter.
- **M5 — Backlog stays accessible.** The not-yet-started tasks remain reachable (a section or the left bar) — the user explicitly asked to keep a backlog. It need not be the focus; it must not be lost.
- **M6 — Empty/all-clear is a *good* state, not a void.** "Nothing needs you right now — 3 in flight, 27 done" reads as calm success (absent-not-zero discipline — Aura). The default must *never* present an empty centre as the headline.
- **M7 — One click to the ticket detail** from every row (description, comments, gates, routing labels, advance/approve/comment) — unchanged `TaskDetailComponent`.

**SHOULD have (fast-follow):**

- **S1 — Stage-pipeline as a switchable MODE.** A view toggle (Worklist · Pipeline) that swaps to the adaptive-station "train" for users who want the flow read. Default = Worklist; the choice persists per project.
- **S2 — Group/By-owner mode.** Group in-flight work by `/agent` ("what is `/be` doing", "what is `/rev` waiting on") — the agent-centric read of an agent-driven flow.
- **S3 — Routing-label visibility in the worklist** — show the chip that explains *why* a ticket sits where it does (`TO_DEV_BE`), and surface a "routed by rule X" trace on the row (Apex §4.1; Anna AC-W1).
- **S4 — Filter/scope the worklist** (by stage, by owner, by needs-you reason) for larger projects.

**COULD have (later):**

- **C1 — Timeline / activity mode** — a chronological "what happened" read of agent + human actions.
- **C2 — Inline comment from the queue row** — drop a comment a triggered agent picks up without opening detail (the user's "as soon as I add a comment" loop, made one-gesture).
- **C3 — Cross-project needs-you roll-up** — one queue across all projects (the Projects-Home needs-you strip already gestures at this — Aura §1.1).
- **C4 — Parallel-stage / fan-out visualisation** in the pipeline mode (split nodes, join captions — Aura §2.3).

**WON'T (this release):** remote execution of agents from the view (VISION D-B / R4 — Won't this release); any view that implies DART *runs* the agents itself (honesty guardrail — Apex §1.4); card-drag to advance past a gate (Aura §2.4).

---

## 4. Behavioural acceptance outcomes

Behaviour only (WHAT, not HOW). These are the outcomes the redesign must satisfy; `/ba` refines edge cases, `/arch` confirms feasibility against the ticket/ledger model, `/ui` owns the visual form.

**AC-1 — Needs-you is the default landing content.**
Given a project whose tasks are mostly in backlog and done, with two tasks awaiting a human (one gate approval, one rejection routed back),
When the user opens the Tasks view,
Then the first thing shown is the two needs-you tasks, each labelled with *why* it needs the human, **without** the user scrolling past empty stage columns.

**AC-2 — Act on a needs-you item in one click.**
Given a needs-you row whose item is a gate awaiting the user's approval,
When the user activates the row's primary action,
Then the gate is approved (or the task advanced) through the guarded control plane with the current rev, the row leaves the queue on success, and a 409 conflict resyncs to server truth and is surfaced — never a silent overwrite.

**AC-3 — In-flight work shows the agent and why it's there.**
Given tasks currently being driven by agents,
When the user views the in-flight section,
Then each task shows the owning `/agent`, its status, and — when a routing label or rule moved it there — what routed it, so the user can see the autonomous flow's decisions without opening the task.

**AC-4 — A loop hand-back surfaces as needs-you, not a silent block.**
Given a task whose rules looped back to a developer more times than the loop budget allows,
When that budget is exceeded,
Then the task appears in the needs-you queue marked as a loop hand-back ("looped N× — needs you"), and is one click from the detail to redirect or comment.

**AC-5 — All-clear is a positive, true state.**
Given a project with zero tasks needing the human, some in flight, and many done,
When the user opens Tasks,
Then the view reads as a calm success state (e.g. "Nothing needs you — N in flight, M done"), and **never** presents an empty stage centre as the headline.

**AC-6 — The stage pipeline remains available as a mode (no capability lost).**
Given the user wants the flow/pipeline read,
When the user switches to the Pipeline mode,
Then the existing stage-aligned board (with off-track lane, advance, gates, live SSE re-layout) is shown unchanged in behaviour, and the choice persists for that project.

**AC-7 — Backlog is preserved and reachable.**
Given not-yet-started tasks,
When the user opens the Tasks view in the default mode,
Then those tasks are reachable from the default view (not only from the pipeline mode), honouring the user's request to keep a backlog.

**AC-8 — A comment routes to the triggered agent (intent recorded, host acts).**
Given the user adds a comment to a task from the Tasks view that a rule treats as a trigger,
When the comment is saved,
Then DART records the routing intent (the directive/label per the rule), the board reflects it, and the view never implies DART itself executed the agent's work — the host tool acts on the recorded intent.

---

## 5. Hand-offs

- **→ `/ba` (Anna):** refine AC edge cases — the exact predicate for "needs you" (which gate states, blocked reasons, loop hand-backs, pending directives qualify), and the ordering rule for the queue (urgency).
- **→ `/arch` (Jorge):** confirm the worklist is a pure projection over the existing ticket list + `taskSummary` (no new backend contract for the MUST scope); confirm where the per-project view-mode preference persists (S1).
- **→ `/ui` (Aura):** design the Worklist default (needs-you queue → in-flight → done-collapsed → backlog), the one-click row actions (M2), the all-clear state (M6), and the Worklist · Pipeline mode toggle (S1) — reusing the existing card/chip language and absent-not-zero discipline. The adaptive-station "train" becomes the Pipeline *mode*, not the default.
- **→ `/secops` (Soren) + `/apex`:** keep the honesty line — the view shows the human's decisions and the agents' progress; it never implies DART runs the agents (AC-8; Apex §1.4).

---

*Product proposal only. No code. Invents no metrics. The load-bearing product claim: in an autonomous agent flow the human's job is the needs-you queue, so the default Tasks view must BE that queue — the stage pipeline is a mode, not the landing.*
