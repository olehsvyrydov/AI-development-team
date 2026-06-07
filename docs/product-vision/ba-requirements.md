# BA Requirements — Multi-Project ADT Control Plane ("ADT Studio")

**Author:** /ba (Anna) · **Status:** Draft for /arch, /aura, /sm · **Date:** 2026-06-07
**Feeds:** /arch (architecture decisions), /aura (UI/UX), /sm (story breakdown & sprint)
**Builds on:** the existing zero-dependency Node hub (`hub/server.js`), the file-based workflow ledger (`.workflow-state.json`), the TypeScript memory subsystem (`claude/memory/`), the ADT agent skills (`claude/skills/`), and the locked plan in `~/.claude/plans/imperative-mapping-prism.md`.

> **Scope note.** This document describes WHAT and WHY in behavior-only terms. It deliberately avoids file paths, schemas, and code in the acceptance criteria. Where it references existing artefacts (hub, ledger, memory), that is context for /arch — not a design mandate. All Given/When/Then criteria are testable and free of implementation detail.

---

## 1. Problem Statement & Users

### 1.1 Problem

A solo developer (or a small team) increasingly runs **multiple software projects** through the ADT agent workflow — locally and on remote machines. Today the tooling is **single-project and read-mostly**: the hub mirrors one project's board, memory is wired per session, and the workflow that governs each project is an opaque YAML the user edits by hand. There is **no single place** to:

- register and switch between many projects,
- understand a project the team has never seen (auto-analyze on connect),
- *visually* design and modify the agent process that governs each project,
- read the full, human-readable history of what every agent did on every ticket,
- curate the rules and context the agents must obey, and
- do all of this from any host tool (Kiro / Claude Code / Cursor) without re-entering API keys, locally or remotely.

The result: context is lost between sessions and machines, the workflow is hard to reason about, agent work is invisible after the fact, and onboarding a new project is manual.

### 1.2 Primary user & secondary users

| User | Description | Why they care |
|------|-------------|---------------|
| **Primary — The Operator** | A developer/architect running ADT agents across several personal or client projects, often switching machines. | Wants one cockpit to see, govern, and steer every project's AI team. |
| **Secondary — The Reviewer/Stakeholder** | A teammate or client who wants to *see* progress and history without running agents. | Wants read-only, human-readable visibility into tasks and decisions. |
| **Secondary — The Agents themselves** | The ADT subagents are first-class "users" of the BASE and TASKS surfaces. | They read BASE rules, write TASKS history, and are triggered by WORKFLOW. |

### 1.3 Jobs To Be Done (JTBD)

1. *When I start work on a project I haven't onboarded, I want the tool to understand it for me, so that the team can begin without me writing a brief from scratch.*
2. *When I switch between projects, I want each one's full state mirrored live, so that I never lose context across sessions or machines.*
3. *When the default agent process doesn't fit a project, I want to redesign the process visually, so that I can express bespoke automation without hand-editing config.*
4. *When I review what happened, I want the complete, readable story of every ticket, so that I can audit decisions and trust the output.*
5. *When agents act, I want them to obey my code rules, policies, and project context, so that output is consistent and compliant.*
6. *When I run this on another machine or remotely, I want the same experience without re-keying secrets, so that setup friction is near zero.*

### 1.4 Success signals (outcome metrics for /po to ratify)

- Time-to-first-useful-state for a newly connected project (target: a usable title/description/context summary without manual authoring).
- Number of projects an Operator keeps registered and actively switches between (multi-project adoption).
- Proportion of workflow changes made via the visual builder vs. hand-editing config (builder adoption).
- Audit completeness: proportion of ticket state changes that carry an attributable history entry (target: 100%).
- Zero secret re-entry: API keys reused from the host with no additional key prompts.

---

## 2. Epics, Stories & Behavioral Acceptance Criteria

Eight epics. Each story is behavior-only; each AC is Given/When/Then and testable.

### EPIC A — Project Registration, Connection & Auto-Analysis

*Goal: an Operator can add a project by pointing at a folder; the tool analyzes it (or ingests existing ADT files) and produces a stored title, description, and context summary.*

**A1 — Connect a project from the UI**
> As an Operator, I want to register a project by selecting its folder, so that the ADT team can work on it.

- **AC-A1.1** Given I am in the tool with no projects, When I choose to add a project and provide a valid project folder, Then the project appears in my project list as "connecting" and then "connected", and persists across restarts of the tool.
- **AC-A1.2** Given I provide a folder that does not exist or that I cannot read, When I attempt to connect it, Then connection is refused with a clear, human-readable reason and no partial project is created.
- **AC-A1.3** Given a project is already registered for a given folder, When I try to add the same folder again, Then the tool informs me it is already registered and offers to open it rather than creating a duplicate.

**A2 — Auto-analyze a new project on connect**
> As an Operator, I want a freshly connected project to be automatically investigated, so that I get a title, description, and context without writing them myself.

- **AC-A2.1** Given I connect a folder that contains no prior ADT artefacts, When connection completes, Then the tool produces a project **title** and **description** derived from the investigation and stores them locally, and I can view them in the project's header.
- **AC-A2.2** Given an analysis is running, When I view the project, Then its status indicates analysis is in progress, and the project becomes fully usable only after analysis completes or is explicitly skipped.
- **AC-A2.3** Given analysis produced a title/description, When I disagree with them, Then I can edit the title and description and my edits are preserved over any later re-analysis unless I explicitly request regeneration.
- **AC-A2.4** Given analysis cannot complete (e.g., the project is empty, unreadable, or analysis is unavailable), When it fails, Then the project still connects with a safe placeholder title/description and a clear note that analysis was incomplete, and I can re-run analysis later.

**A3 — Ingest existing ADT artefacts**
> As an Operator, I want a project that already has ADT files to be recognized rather than re-derived, so that prior workflow, tasks, and context are not lost.

- **AC-A3.1** Given I connect a folder that already contains ADT workflow/task/knowledge artefacts, When connection completes, Then the tool reads and reflects the existing workflow, tasks, and knowledge instead of overwriting them, and the title/description are taken from the existing artefacts where present.
- **AC-A3.2** Given existing artefacts are partially present (e.g., tasks but no workflow), When connection completes, Then present artefacts are ingested as-is and missing parts fall back to defaults (e.g., the default workflow), with the source of each part visible to me.
- **AC-A3.3** Given existing artefacts and analysis disagree, When connection completes, Then existing on-disk artefacts take precedence and any analysis-derived values are offered as non-destructive suggestions, never silent overwrites.

**A4 — Disconnect / remove a project**
> As an Operator, I want to remove a project from the tool, so that my project list stays relevant.

- **AC-A4.1** Given a registered project, When I remove it from the tool, Then it disappears from my project list but its on-disk files (workflow, tasks, knowledge) are left intact, and I am told they were left in place.
- **AC-A4.2** Given I removed a project, When I re-connect the same folder later, Then its prior on-disk history is recognized and restored into the view.

---

### EPIC B — Per-Project Shell (Title · Description · Workflow · Tasks · Base)

*Goal: each connected project opens into a consistent view with a header (title/description) and three sections.*

**B1 — Open a project into its three-part view**
> As an Operator, I want each project to present a consistent layout, so that I always know where to find Workflow, Tasks, and Base.

- **AC-B1.1** Given a connected project, When I open it, Then I see its title and description in a header and three navigable sections labelled WORKFLOW, TASKS, and BASE.
- **AC-B1.2** Given I am viewing one section, When I switch sections, Then unsaved edits in the section I leave are either preserved or I am prompted before losing them — never lost silently.
- **AC-B1.3** Given I have multiple projects connected, When I switch the active project, Then the entire three-part view reflects the newly selected project and the previously selected project keeps its state.

**B2 — Live, multi-project mirroring**
> As an Operator/Reviewer, I want every project's state mirrored in real time, so that I see changes as agents make them without manual refresh.

- **AC-B2.1** Given a project is connected and an agent changes a task or workflow state, When the change occurs, Then the change appears in the tool within a few seconds without me refreshing.
- **AC-B2.2** Given multiple projects are connected, When any of them changes, Then I can see an at-a-glance indication of which project changed, even when I am not currently viewing it.
- **AC-B2.3** Given a project's underlying source becomes unavailable (folder moved/unmounted), When mirroring cannot continue, Then the project is shown as stale/unavailable with a clear indicator rather than showing silently outdated data.

---

### EPIC C — WORKFLOW: Visual Agent-Process Builder

*Goal: an Operator visually builds and edits the agent process for a project — events that trigger subagents, loops, background agents, and conditionals — as a visual program expressible in code.*

**C1 — View the default workflow for a project**
> As an Operator, I want each connected project to start from a sensible default workflow, so that I can run agents immediately and customize later.

- **AC-C1.1** Given a newly connected project, When I open WORKFLOW, Then I see the default ADT workflow rendered visually as a sequence of steps with their triggering agents and gates.
- **AC-C1.2** Given the default workflow, When I view a step, Then I can see which agent/subagent it triggers and any condition or gate attached to it.

**C2 — Create, edit, delete workflow steps**
> As an Operator, I want to add, modify, and remove steps that trigger subagents, so that the process fits this project.

- **AC-C2.1** Given the WORKFLOW builder, When I add a step and assign it an agent and a trigger, Then the step appears in the visual graph and is persisted to this project (not to other projects).
- **AC-C2.2** Given an existing step, When I edit its agent, trigger, or condition, Then the change is reflected visually and persisted, and the project's running process uses the new definition for subsequent runs.
- **AC-C2.3** Given an existing step, When I delete it, Then it is removed from the graph and any references to it (e.g., loop targets) are either updated or flagged as invalid before I can save.
- **AC-C2.4** Given I reorder steps, When I save, Then the execution order reflects the new arrangement.

**C3 — Loops, conditionals, and background agents**
> As an Operator, I want loops, conditional branches, and background agents in the workflow, so that I can express real automation, not just a linear pipeline.

- **AC-C3.1** Given two steps, When I define a loop that returns from a later step to an earlier step, Then the visual graph shows the loop and the process can repeat that segment until its exit condition is met.
- **AC-C3.2** Given a step, When I attach a conditional, Then the process follows one branch or another based on that condition at runtime, and both branches are visible in the graph.
- **AC-C3.3** Given a project, When I define a **background agent** that collects information or runs when a condition becomes true, Then it operates independently of the main sequence and its activity is visible without blocking the main flow.
- **AC-C3.4** Given a loop with no reachable exit condition, When I attempt to save, Then the tool warns me about the potential infinite loop before saving.

**C4 — Workflow as a code-expressible program**
> As an Operator, I want the visual workflow to correspond to an explicit, code-expressible definition, so that it is portable, reviewable, and not locked into a GUI.

- **AC-C4.1** Given a workflow built visually, When I inspect its underlying definition, Then there is a deterministic, human-readable representation that fully captures the steps, loops, conditionals, and background agents I configured.
- **AC-C4.2** Given a workflow definition authored or edited outside the GUI, When I open WORKFLOW, Then the visual builder renders it faithfully, and round-tripping (visual → definition → visual) does not lose or alter my configuration.
- **AC-C4.3** Given an invalid workflow definition, When the tool loads it, Then it reports the specific problem and does not silently drop steps.
- **AC-C4.4** Given I have customized a project's workflow, When the tool's bundled default workflow later changes, Then my project-specific customizations are preserved and not overwritten by the new default.

---

### EPIC D — TASKS: Agent-Managed, Human-Readable Task Board

*Goal: a task board that agents manage and humans read — full history, clickable tickets, comment timelines, sorting by status, and archival of done items with history retained.*

**D1 — See tasks and their status**
> As an Operator/Reviewer, I want a board of the project's tasks by status, so that I can see what the team is doing.

- **AC-D1.1** Given a project with tasks, When I open TASKS, Then I see each task with a human-readable title and a clearly indicated status.
- **AC-D1.2** Given the task board, When I sort by status, Then tasks are grouped/ordered by status and the ordering is stable and predictable.
- **AC-D1.3** Given a task changes status because an agent advanced it, When the change occurs, Then the board reflects the new status in near-real-time.

**D2 — Open a ticket and read its full history**
> As an Operator/Reviewer, I want to click a ticket and read everything that happened to it, so that I can audit the team's work.

- **AC-D2.1** Given a task, When I click it, Then I see its description and a chronological history of comments and events (e.g., what the reviewer found, what the developer did, gate approvals/rejections, hand-offs).
- **AC-D2.2** Given a history entry, When I read it, Then it is attributed to the agent (or human) who produced it and timestamped.
- **AC-D2.3** Given an agent performs an action on a task (advance, approve, reject, hand off, comment), When the action completes, Then a corresponding human-readable history entry is recorded automatically — the history is a faithful record, not a manual afterthought.
- **AC-D2.4** Given two actors update a ticket at nearly the same time, When both updates are recorded, Then no history entry is lost or overwritten and the order is preserved.

**D3 — Archive done tasks while retaining history**
> As an Operator, I want completed tasks archived but still readable, so that the active board stays focused without losing the record.

- **AC-D3.1** Given a task reaches "done", When it is archived, Then it leaves the active board view but remains retrievable from an archive.
- **AC-D3.2** Given an archived task, When I open it, Then I can still read its full description and complete history.
- **AC-D3.3** Given an archive of done tasks, When I look at it, Then I can tell when each task was completed.

**D4 — Creative, non-Jira presentation**
> As an Operator, I want the task presentation to be readable and pleasant, not necessarily a Jira clone, so that the experience is approachable.

- **AC-D4.1** Given the TASKS view, When I look at it, Then status and progress are conveyed clearly using more than color alone (e.g., labels/glyphs), so meaning survives for color-blind users and in monochrome.
- **AC-D4.2** Given a long history, When I open a busy ticket, Then the history remains readable (e.g., scannable timeline) without overwhelming me.

> **Note for /aura:** "creative presentation" is encouraged but must not sacrifice the audit-readability and accessibility AC above. Color is decorative; labels/glyphs are authoritative.

---

### EPIC E — BASE: Governing Knowledge Store (Indexed + Memory-Triggered)

*Goal: a per-project store of documents the agents MUST follow — code rules, company policies, copyright, code style, project context — editable as text, indexed, and surfaced to agents via semantic recall.*

**E1 — Curate the governing documents**
> As an Operator, I want to add, edit, and remove the rules and context the agents must obey, so that agent output stays consistent and compliant.

- **AC-E1.1** Given a project's BASE, When I add a text document (e.g., a code-style rule or company policy), Then it is saved to this project and listed in BASE.
- **AC-E1.2** Given an existing BASE document, When I edit or remove it, Then the change is persisted and the agents stop or start being governed by it accordingly on subsequent runs.
- **AC-E1.3** Given BASE documents exist, When I view BASE, Then I can distinguish categories of content (e.g., code rules vs. policy vs. copyright vs. project context).

**E2 — Index and recall BASE via memory**
> As an Operator, I want BASE content indexed and recalled at the right moments, so that agents actually apply the relevant rules instead of ignoring them.

- **AC-E2.1** Given a BASE document is added or edited, When indexing completes, Then its content becomes available to agents through semantic recall for this project.
- **AC-E2.2** Given an agent is performing a task whose context matches a BASE rule, When the agent runs, Then the relevant BASE content is surfaced to it (semantic trigger), and I can see that it was applicable.
- **AC-E2.3** Given the indexing/recall backend is unavailable, When an agent runs, Then BASE governance degrades gracefully (e.g., core rules still injected deterministically) and the agent run is never blocked solely because semantic recall is down.
- **AC-E2.4** Given BASE content for one project, When agents work on a different project, Then that content is not applied to the other project (per-project isolation), except for content the Operator explicitly marks as global.

**E3 — Plan for richer content (future)**
> As an Operator, I want a clear path to add images and URLs to BASE later, so that today's text-only store is not a dead end.

- **AC-E3.1** Given the BASE supports text today, When I look for richer content support (images/URLs), Then the product documents that this is planned and not yet available, rather than implying it works.

> **Note for /arch:** AC-E3 is explicitly a *plan-only* requirement for this release. Images/URLs in BASE are **Won't (this release)** in MoSCoW (§5).

---

### EPIC F — Host-Tool Integration & API-Key Reuse

*Goal: the tool works as a single whole with the host (Kiro / Claude Code / Cursor) and reuses the host's API keys so the Operator sets up no extra keys.*

**F1 — Operate as part of the host tool**
> As an Operator, I want this to feel like one tool with my host editor, so that I don't context-switch into a disconnected app.

- **AC-F1.1** Given I am working in a supported host (Kiro / Claude Code / Cursor), When I launch the multi-project tool, Then it integrates with my host environment rather than requiring a wholly separate, disconnected setup.
- **AC-F1.2** Given the host knows the current project/workspace, When I open the tool, Then it can offer that project for connection without me re-typing the path.

**F2 — Reuse host API keys (no extra key setup)**
> As an Operator, I want the tool to reuse the keys my host already has, so that I never re-enter secrets.

- **AC-F2.1** Given my host tool already holds the credentials/keys needed for agent and embedding operations, When the tool needs them, Then it reuses those credentials without prompting me to enter new keys.
- **AC-F2.2** Given no reusable host credentials are available, When the tool needs a key, Then it tells me exactly which capability is degraded and offers a non-blocking path (e.g., a no-key/offline mode) rather than failing hard.
- **AC-F2.3** Given the tool reuses host credentials, When secrets are handled, Then secrets are never written into project files, the project knowledge store, or the workflow definition, and are not exposed in the UI or logs.

> **Note for /secops:** AC-F2.3 is a hard security requirement and must be validated at the gate. See §4 NFRs.

---

### EPIC G — Local & Remote Operation

*Goal: if it works locally, it works remotely; cross-platform (Windows + Mac); a browser UI is acceptable as the simplest surface.*

**G1 — Local-first operation**
> As an Operator, I want everything to work fully on my own machine with no external service required, so that I can work offline and privately.

- **AC-G1.1** Given no network and no remote services, When I run the tool locally, Then I can connect projects, view all three sections, and run the local agent workflow.
- **AC-G1.2** Given I run locally, When the tool is reachable, Then by default it is bound to my machine only (not exposed to the network) unless I deliberately enable remote access.

**G2 — Remote operation parity**
> As an Operator, I want to reach and operate the same tool from another machine when I choose, so that I can supervise projects running elsewhere.

- **AC-G2.1** Given I deliberately enable remote access, When I connect from another machine, Then I can view projects and their three sections remotely, mirrored live.
- **AC-G2.2** Given remote access is enabled, When a remote client attempts a state-changing action, Then that action is subject to explicit authorization, and read-only remote viewing is possible without granting write access.
- **AC-G2.3** Given remote access is *not* enabled, When a remote client attempts to connect, Then the connection is refused.

**G3 — Cross-platform**
> As an Operator, I want identical behavior on Windows and Mac, so that my team isn't constrained by OS.

- **AC-G3.1** Given the tool runs on Windows or on Mac, When I connect a project and use all three sections, Then behavior is functionally equivalent across both, including folder selection and path handling.
- **AC-G3.2** Given platform-specific path or filesystem conventions, When a project is connected on either OS, Then the tool handles them correctly without the Operator needing to adjust paths manually.

---

### EPIC H — Knowledge/Governance Integration (KGB/Canon, Bumbl) — Conditional

*Goal: evaluate and, where it adds value (especially for BASE/knowledge), reuse existing OSS — KGB/Canon (knowledge + governance backbone) and Bumbl (personal stack) — to avoid duplicated work.*

**H1 — Reuse OSS for BASE/knowledge where it adds value**
> As an Operator, I want the tool to reuse a knowledge/governance backbone rather than reinvent it, so that BASE is robust and we don't build twice.

- **AC-H1.1** Given a candidate knowledge/governance backbone (e.g., KGB/Canon) is available, When BASE indexing/recall is configured to use it, Then BASE governance functions through that backbone with the same behavioral guarantees (AC-E2) and per-project isolation (AC-E2.4).
- **AC-H1.2** Given such a backbone is *not* available or not chosen, When I use BASE, Then the tool still delivers BASE governance using its built-in store, with no loss of core function (graceful default).
- **AC-H1.3** Given an integration with an external stack (e.g., Bumbl), When it is enabled, Then it is additive and optional, and disabling it leaves the tool fully functional.

> **Note for /arch:** Epic H is an **evaluate-then-integrate** epic. The behavioral guarantee is "reuse must not weaken isolation/graceful-degradation, and must be optional." Whether to integrate at all is an architecture decision (§3, D7). BA recommendation: integrate only if the backbone measurably reduces build effort for indexed, isolated, memory-triggered recall (Epic E) without adding a mandatory external dependency.

---

## 3. Open Decisions for /arch (with BA recommendation criteria)

These are the questions the user explicitly raised. They are **architecture decisions**, not requirements. For each, the BA frames the decision and the criteria by which /arch should choose — but does not pre-decide.

| # | Decision | Options | BA recommendation criteria (choose the option that best satisfies these) |
|---|----------|---------|--------------------------------------------------------------------------|
| **D1** | **Packaging / surface** | (a) Browser UI served by a local process; (b) Desktop app; (c) IDE/host extension; (d) hybrid (local process + thin browser UI, host extension as a launcher) | Prefer the option that: reuses the existing local Node hub; satisfies "works locally → works remotely" (Epic G) with least added surface; requires no extra install on top of the host; and keeps the door open to host integration (Epic F). *BA leans toward (a)/(d): browser UI over the existing local process is the lowest-friction way to get "local then remote for free," and the user already noted the browser is simplest.* |
| **D2** | **How subagents run (local vs remote)** | (a) Always local to the project's machine; (b) local with optional remote execution; (c) remote-first | Prefer the option that: preserves local-first/offline (AC-G1.1); keeps secrets off the wire and out of files (AC-F2.3); reuses host credentials (Epic F); and makes "who's running now" observable (Epic D/B). *BA leans toward (b): subagents execute where the project lives; remote is supervision/control, not necessarily remote execution — but /arch to confirm whether remote *execution* is in scope or only remote *viewing/control*.* |
| **D3** | **Cross-platform strategy** | (a) Single Node runtime everywhere; (b) per-OS native packaging; (c) browser-only to sidestep OS differences | Prefer the option that: gives functional parity on Windows + Mac (Epic G3); handles path/filesystem differences centrally; and reuses the existing Node codebase. *BA leans toward (a): one Node runtime + a browser UI minimizes OS-specific code; /arch to confirm path-handling and folder-picker behavior per OS.* |
| **D4** | **Project analysis engine** | (a) Reuse an existing analyzer pattern ("like Kiro"); (b) drive analysis through ADT agents; (c) hybrid (cheap deterministic scan + agent enrichment) | Prefer the option that: produces a useful title/description with no keys when possible (degrade-gracefully, AC-A2.4); is fast enough not to block connect (AC-A2.2); and respects existing ADT artefacts (Epic A3). *BA leans toward (c).* |
| **D5** | **Workflow definition language** | The user suggested "expressible in code, e.g. TypeScript." Options: (a) declarative data definition rendered as a graph; (b) actual TS program; (c) declarative-with-escape-hatch | Prefer the option that: guarantees lossless round-trip with the visual builder (AC-C4.2); is reviewable and portable (AC-C4.1); preserves project customizations over default upgrades (AC-C4.4); and aligns with the existing workflow ledger/overlay model. *BA leans toward (a)/(c): a declarative definition is safer to round-trip and version than executable code; "expressible in code" is satisfied by a deterministic textual form.* |
| **D6** | **Remote access & auth model** | (a) Loopback-only by default, explicit opt-in to remote with auth; (b) always-on networked with auth | Must satisfy AC-G1.2, AC-G2.2, AC-G2.3 and §4 security NFRs. *BA strongly recommends (a): off by default, explicit opt-in, read-only remote possible without write grant.* → routes to **/secops gate**. |
| **D7** | **KGB/Canon & Bumbl integration** | (a) Integrate as the BASE backbone; (b) integrate as optional overlay; (c) defer | Choose (a)/(b) only if it reduces build effort for Epic E without adding a mandatory external dependency and without weakening isolation/graceful-degradation (Epic H). *BA leans toward (b) or (c) for MVP; revisit post-MVP.* |

**Hand-off:** D1–D5 and D7 → **/arch**. D6 and all secrets/remote items → **/arch + /secops** (security gate is mandatory before any remote-write capability ships).

---

## 4. Edge Cases & Non-Functional Requirements

### 4.1 Edge cases (testable, behavior-only)

- **Multi-project isolation:** BASE rules, workflow customizations, tasks, and memory of one project never leak into another (AC-E2.4, AC-C2.1). A change in project X must not alter project Y.
- **Empty / unreadable project:** connecting an empty or permission-denied folder degrades gracefully with placeholders, never crashes (AC-A2.4, AC-A1.2).
- **Folder moved/renamed/unmounted:** the project shows as stale/unavailable and its prior history is recoverable when the folder returns (AC-B2.3, AC-A4.2).
- **Concurrent writers (agent + human, or two agents):** no lost updates to tasks/history/workflow; ordering preserved; stale-state writes are detected and reconciled rather than silently overwriting (AC-D2.4).
- **Invalid workflow (dangling loop target, unreachable exit condition, missing agent):** flagged before save; never silently dropped (AC-C2.3, AC-C3.4, AC-C4.3).
- **Backend down (embeddings/index/remote service):** core flows continue; only enhanced recall degrades, with a visible indicator (AC-E2.3, AC-F2.2).
- **Default-workflow upgrade:** project customizations survive a bundled-default change (AC-C4.4).
- **Many projects open at once:** the tool remains responsive and does not exhaust system resources (see performance NFR).

### 4.2 Non-functional requirements

| Category | Requirement |
|----------|-------------|
| **Multi-project isolation** | Per-project data and governance are strictly partitioned; only content explicitly marked global is shared. No cross-project read/write by default. |
| **Offline / local-first** | All core functions (connect, view three sections, run local workflow) work with no network. Enhanced features (semantic recall, remote viewing) degrade gracefully when unavailable. |
| **Security / secrets** | Secrets are reused from the host and never persisted in project files, the knowledge store, the workflow definition, the UI, or logs (AC-F2.3). Remote access is off by default; remote writes require explicit authorization (AC-G2.2/3). → **/secops gate mandatory.** |
| **History / audit completeness** | Every state change (task advance, gate approve/reject, hand-off, comment) produces an attributable, timestamped, human-readable history entry — automatically. History is append-only in effect: nothing is silently lost or overwritten. Archived items retain full history. |
| **Performance / responsiveness** | Live changes appear within a few seconds. Project connect/analyze does not block the rest of the tool. Many concurrent projects do not degrade responsiveness below a usable threshold or exhaust file handles/memory. (Exact targets → /arch.) |
| **Reliability / safety** | A failure in analysis, indexing, or a remote backend never blocks a local agent run or corrupts on-disk artefacts. |
| **Accessibility** | Status/progress conveyed by more than color (labels/glyphs); modals/keyboard navigation usable; readable busy histories (AC-D4.1, AC-D4.2). → input to /aura. |
| **Portability** | Functional parity on Windows and Mac, including folder selection and path handling (Epic G3). |
| **No lock-in** | External knowledge/governance backbones and remote execution are optional; the built-in defaults deliver core function without them (Epic H, OSS-first principle). |

---

## 5. MoSCoW Prioritization & Thin MVP

### 5.1 MoSCoW

**Must have**
- A: Connect a project from the UI; auto-analyze producing title/description; ingest existing ADT artefacts (A1, A2, A3).
- B: Per-project three-part shell; multi-project switching; live mirroring (B1, B2).
- D: Task board with status, clickable ticket → full attributed history, sort by status, archive-with-history (D1, D2, D3).
- E: BASE add/edit/remove text; per-project isolation; deterministic governance with graceful degradation (E1, E2 with E2.3 degradation).
- F: Reuse host credentials with no extra key setup; secrets never persisted (F2, esp. F2.3).
- G: Local-first, loopback-by-default; cross-platform parity (G1, G3).
- Audit completeness + multi-project isolation NFRs (§4).

**Should have**
- C: Visual workflow builder — view default, create/edit/delete/reorder steps, code-expressible round-trip (C1, C2, C4).
- D4: Creative, accessible task presentation.
- G2: Remote viewing with explicit opt-in + read-only remote.
- F1: Deep host-tool integration (single-whole feel, project auto-offered from host).

**Could have**
- C3: Loops, conditionals, background agents in the builder.
- G2 write: remote *control* (state-changing) with authorization.
- E2.2 visible "rule was applied" provenance surfacing.

**Won't have (this release)**
- E3: Images/URLs in BASE — **plan only**, documented as not-yet-available.
- D2/remote *execution* of subagents on a different machine (vs. local execution + remote supervision) — pending D2 decision.
- H1 full KGB/Canon/Bumbl backbone integration — evaluate-then-decide; default built-in store ships first.

### 5.2 Proposed thin MVP slice

**"Connect → See → Govern" — one Operator, local, multiple projects, read-rich + minimal write.**

1. **Connect & analyze (A1, A2, A3):** add a project by folder; auto-derive title/description (degrading to placeholder without keys); ingest existing ADT artefacts.
2. **Per-project shell + live mirror (B1, B2):** open into WORKFLOW (read-only view of the default), TASKS, BASE; switch between several projects; changes appear live.
3. **TASKS — read the story (D1, D2, D3):** board by status; click a ticket to read its full attributed, timestamped history; archive done items with history retained. (Writes from agents flow in; human writes minimal — e.g., comments.)
4. **BASE — govern (E1, E2 incl. E2.3):** add/edit/remove text rules per project, indexed for recall, isolated per project, degrading gracefully without the index.
5. **Host key reuse + local-first + cross-platform (F2, G1, G3):** no extra keys; loopback-only; works on Windows and Mac.

**Explicitly deferred from MVP:** the visual *editing* of the workflow (Epic C create/edit — render default read-only first), loops/conditionals/background agents (C3), remote access (G2), and any KGB/Bumbl backbone (H). These are the highest-uncertainty, highest-build-cost items and depend on /arch decisions D1, D2, D5, D6, D7.

**Why this slice:** it delivers JTBD #1 (auto-understand a new project), #2 (multi-project continuity), #4 (readable audit), and #5 (governance) — the durable, defensible value — while pushing the visual-builder and remote-execution complexity behind explicit architecture decisions. It also maps cleanly onto what already exists (local Node hub, ledger, comments, memory subsystem), so the MVP extends rather than rebuilds.

---

## 6. Hand-offs

- **→ /arch (Jorge):** Resolve D1–D7 (§3); confirm performance targets and remote-execution scope (D2); decide workflow definition form (D5) ensuring lossless round-trip (AC-C4.2); decide KGB/Canon/Bumbl (D7). Mandatory ARCH gate.
- **→ /secops (Soren):** Validate secrets-never-persisted (AC-F2.3), remote-off-by-default and remote-write authorization (D6, AC-G2.2/3), and project-path/folder-access safety. Mandatory SECOPS gate before any remote-write capability.
- **→ /aura (Aura):** Design the per-project three-part shell, the project switcher + live multi-project indicators, the creative-yet-accessible TASKS timeline, the visual WORKFLOW builder, and the BASE editor — honoring "more than color" and busy-history readability (AC-D4).
- **→ /sm (Luda):** Convert these epics/ACs into behavior-only, INVEST-sized stories; sequence MVP (§5.2) first; carry the open decisions as blocking dependencies on the relevant stories.

---

## 7. Open Questions for /po (value & priority)

1. Is remote *execution* of subagents in scope for v1, or only remote *viewing/control* of locally-run agents? (Drives D2 and MVP scope.)
2. Are the secondary users (Reviewer/Stakeholder) a v1 audience, or is v1 single-Operator only? (Drives read-only-remote priority.)
3. Which hosts must v1 support — Claude Code only, or Kiro/Cursor too? (Drives Epic F effort.)
4. Is the visual workflow *builder* (editing) a v1 differentiator, or acceptable as a fast-follow after the read-only view? (BA assumes fast-follow in the MVP slice.)
