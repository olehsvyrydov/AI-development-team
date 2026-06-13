# Tasks View Redesign — Research & Requirements (the research/requirements lens)

**Author:** Anna (`/ba`) · **Type:** Research / requirements investigation (no code, no gate)
**Date:** 2026-06-13
**Scope:** Competitive analysis of how the best 2025–2026 task tools display tasks (and handle the "mostly backlog or done, little in-progress" reality); jobs-to-be-done for an AI-dev-team control surface; the stage-vs-lifecycle grouping question. Output is a research proposal — WHAT, not HOW.

One of five parallel investigations (Anna = research/requirements). Companion lenses: architecture (`/arch`), UX/UI (`/ui`/Aura), strategy (`/mkt`/Apex), and review (`/rev`).

---

## The confirmed problem (grounded in the actual artifact)

`studio/cockpit/src/app/shell/tasks-board.component.ts` documents its own design: *"columns are the active track's workflow STAGES, in order, each holding the tickets whose current stage matches (an empty stage still renders a placeholder column)."* There is a separate Backlog bar and an off-track lane.

So the centre of the board is **one column per workflow stage** (vision → arch → secops → … → done). In the real distribution of a local AI-dev project, tickets cluster at the **ends** — a pile in BACKLOG and a growing pile in DONE — with **at most one or two tickets** anywhere mid-pipeline (an AI team typically advances one ticket through the gauntlet at a time). The result is a row of mostly-empty placeholder columns: a structural void that scales with how many stages the workflow defines. The more rigorous the workflow, the emptier the board. This is not a styling bug; it is a **grouping-dimension mismatch** — the board groups by a *fine-grained stage* that is sparse by construction, instead of by something that is always populated.

The redesign must serve **both** project types:
- **Pipeline projects** — tickets genuinely flow through gated stages; the operator cares about *where in the pipeline* and *which gate is pending*.
- **Lifecycle projects** — tickets sit in coarse states (backlog / doing / done); stage is noise.

---

## 1. Competitive analysis (current, 2025–2026)

### How the leading tools display tasks and avoid empty-column waste

| Tool | Default view & primary grouping | How it avoids empty-column / sparse-WIP waste | How it surfaces "what needs me / what's next" |
|---|---|---|---|
| **Linear** | Board & list both **default to group-by-Status** (To Do / In Progress / Done — coarse lifecycle, *not* fine sub-stages). Grouping is freely changeable (project, priority, cycle, label, assignee). | **"Show empty groups" toggle** hides empty columns; **individual columns can be collapsed/hidden** ("if your team mostly works out of a few columns"); swimlanes collapse too. Sub-stage detail lives in a per-issue field, not as its own column. | **Inbox + "My Issues"** is a dedicated personal surface (Assigned / Created / Subscribed / Activity), ordered by priority with started issues first. The personal "what needs me" view is a *first-class destination*, separate from the board. |
| **Jira** | Board defaults to a **small set of lifecycle columns** (Backlog, Selected for Dev, In Progress, Done). **"Kanplan"** splits backlog (scannable list) from the board (active flow only). | Backlog is a **list, not a column** — heavy backlog never bloats the board. Swimlanes (assignee/epic/query) add a second dimension without more columns. WIP limits keep mid-board sparse *by design*, not by accident. | Query-based swimlanes and assignee swimlanes; personal filters ("assigned to me"). |
| **GitHub Projects** | **Configurable `group-by` field** across all three layouts (table / board / roadmap). Board column field is *chosen* (Status, or any single-select/iteration field). **Table (list) is a co-equal default**, not a fallback. | You pick the column field; a sparse field simply isn't used as columns. Table/roadmap show field sums per group, so a sparse dimension reads as a list with subtotals rather than empty lanes. | Per-view filters (`assignee:@me`); saved personal views. |
| **Height** | **List-first**, with **smart lists** (saved searches across lists) and **"subsection by"** any attribute for a birds-eye grouping. | Grouping is an attribute applied to a list, so an empty group is a collapsed/absent subsection — never a wasted column. | Smart lists are essentially "saved filters" → an "assigned to me / needs me" smart list is trivial. |
| **Asana** | **"My Tasks" is list-default**, grouped by section; project default is List, Board optional. Sort/Filter/View preferences are **remembered**. | Sections collapse in List and appear as columns only in Board; an empty section is a one-line collapsed header, not a void. | **"My Tasks"** is the canonical personal home; group-by-section/field; remembered preferences. |
| **ClickUp** | Board group-by is selectable (status / assignee / tag / due date / priority). | **"Default to Me" mode** narrows the board to the viewer's tasks; long-standing user demand to **hide empty columns**. | **"Default to Me"**; Workload view groups by assignee by default. |
| **Trello** | Board of **user-defined lists** (To Do / Doing / Done by default); no enforced stages. | Teams add stage-lists *only* when work genuinely passes through many steps ("break Doing into lists reflecting those steps") — i.e. stages are opt-in, not imposed. | Filters + "cards assigned to me." |
| **Notion** | Board **defaults to group-by Status** if a status property exists; group-by status/assignee/priority/etc. | Empty groups collapse; the database is fundamentally a list/table that can be *viewed* as a board. | Filtered views ("assignee = me"). |

**Sources:** see the Sources section at the end.

### The four strongest competitive insights

1. **Coarse status is the universal default; fine stage is an opt-in dimension.** Linear, Notion, Jira, Asana, ClickUp all **default to grouping by a coarse lifecycle status** (To Do / In Progress / Done or sections), *not* by a long chain of fine-grained workflow steps. Fine stage lives in a *field on the card*, surfaced as a chip or an optional grouping — never as the always-present column skeleton. DART has inverted this: it makes the sparse fine-stage the column skeleton and the coarse status a chip. **The fix is to flip them.**

2. **Empty columns are a solved problem — you hide or collapse them.** Linear's **"Show empty groups" off** and **collapse-rarely-used-columns** are the canonical answer; ClickUp users demand the same; GitHub avoids it by letting you pick the column field. The board should **render only stages that currently hold tickets** (plus the immediate "next" target when advancing), not a placeholder per declared stage. An empty stage is a zero in a rollup, not a column of whitespace.

3. **Heavy backlog belongs in a list, not on the board ("Kanplan").** Atlassian's own guidance: as a backlog grows, **a list view is the right tool**; the board is for the *active* flow only. The Kanplan pattern **physically separates** the scannable backlog (list) from the workflow board. DART already half-does this (a Backlog bar beside stage columns) but still pays the full empty-stage tax in the centre. The principled version: **backlog = list, done = collapsed/archived list, board = only what is genuinely in flight.**

4. **"What needs me" is a first-class personal destination, not a board chip.** Linear's **Inbox / My Issues**, Asana's **My Tasks**, ClickUp's **"Default to Me"** — every leading tool gives the individual a dedicated, filtered home that answers *"what is mine / what is waiting on me / what is next"* without scanning the whole board. DART's `needsYouCount` rollup and per-card "needs-you" chip are necessary but **not sufficient**: the operator of an AI dev team should land on a **"Needs you / In flight" view first**, and reach for the full pipeline only when they want the map.

---

## 2. What a user of an AI-dev-team control tool actually NEEDS — Jobs-To-Be-Done

DART's operator is not a team of humans dragging cards. They are a **single human supervising autonomous agents** across multiple local projects. The board is a *control surface*, not a planning canvas. The core JTBD:

| # | When I… | I want to… | so that… | Priority |
|---|---|---|---|---|
| J1 | sit down at DART | **immediately see what is waiting on ME** (gate to approve, decision, rejected work, "needs-you") across the project | I can unblock the agents without hunting | **Must** |
| J2 | glance at the board | **see what is actively in flight and which agent/stage owns it right now** | I know the team is making progress and on what | **Must** |
| J3 | review a ticket | **drill into its gates, owner, comments, and current stage** | I can make the gate decision with full context | **Must** |
| J4 | decide work is good | **advance it to the next stage** (and see what that next stage is) | the pipeline keeps moving | **Must** |
| J5 | scan the project | **see the whole pile of backlog and the pile of done without them crowding the active work** | I can groom/triage without the active view turning into a void | **Must** |
| J6 | run a strict-gated vs a loose project | **have the view fit the project's reality** (pipeline map for one, coarse lanes for the other) | neither project type gets a wrong-shaped, mostly-empty screen | **Must** |
| J7 | check a busy moment | **see what is BLOCKED / rejected and why** | I intervene on the right thing first | **Should** |
| J8 | want the pipeline map | **see the stage pipeline on demand** (where things are along the gauntlet) | I get the flow picture when I actually want it | **Should** |
| J9 | groom | **add an idea / triage backlog → ready** | the agents have well-formed work queued | **Could** (backlog-add is already stubbed "soon") |
| J10 | switch projects | **carry the same mental model and remembered view preference** | I'm not re-learning a layout per project | **Should** |

**The non-obvious JTBD:** the highest-value job is **J1 (what needs me)**, not **J2/J8 (where is everything in the pipeline)**. The current design optimises the *pipeline map* (the thing the operator wants occasionally) at the cost of the *needs-me/in-flight* answer (the thing they want every single time). This is the value-proposition health check from my own method: the board's core job is *control* (act on what's waiting), and that job is currently buried under a sparse map.

---

## 3. The stage-vs-lifecycle insight — assessment & recommendation

**The pattern across the whole market is unambiguous:** tools group by **coarse status** by default and expose **fine workflow position as either a card field or an opt-in grouping/mode**. They also make the **grouping field configurable** so the same data can be a status board, an assignee board, or a list. DART should adopt both halves.

### (a) Default to a status/lane view, offer the stage pipeline as a mode — **YES, recommended.**

The default Tasks view should group by **coarse lifecycle lane**, not by fine stage:

- **Needs you** (gate pending / rejected / decision required) — answers J1, surfaced first.
- **In flight** (anything genuinely mid-workflow, with its **stage and owning agent as a chip** on the card) — answers J2; this is where the *single* active ticket lives, no longer alone in a row of empties.
- **Backlog** (a scannable **list**, not columns) — answers J5/J9.
- **Done** (collapsed list / archive, expandable) — answers J5 without the done-pile eating the screen.

This collapses 6–10 sparse stage columns into ~4 always-meaningful lanes. The fine stage never disappears — it becomes a **chip** on the in-flight card (exactly how Linear/Notion keep sub-status on the card). The **stage pipeline** becomes an explicit **"Pipeline" mode** (J8): when the operator wants the gauntlet map, they switch to it, and **only the stages that hold tickets render** (Linear's "hide empty groups"), with advance still moving to the next stage in order.

### (b) Make the grouping field configurable — **YES, recommended (as the mechanism, with a sensible default).**

Rather than hard-code "lanes vs pipeline" as two bespoke screens, the durable design is GitHub-Projects-style: a **`group by` selector** over the existing ticket fields — **Lane (default)**, **Stage** (= today's pipeline), **Owner/agent**, **Gate state**. This single mechanism:
- gives lifecycle projects the coarse Lane default,
- gives pipeline projects the Stage view in one click,
- and inherently kills empty columns via a shared **"hide empty groups"** rule applied to whatever the grouping is.

**Recommended direction (one line):** **Default the Tasks view to a coarse, always-populated "Needs-you / In-flight / Backlog / Done" lane layout (with stage + owning-agent as card chips), make the grouping field user-selectable, expose the stage pipeline as an opt-in "Pipeline" mode, and never render empty groups — backlog and done as scannable lists, not columns.**

This serves both project types from one mechanism, eliminates the structural void by construction, and re-centres the board on its real job: *act on what needs you*.

---

## 4. Prioritized requirements (MoSCoW) — behavioral, WHAT not HOW

### Must
- **M1 — No empty groups.** The Tasks view MUST NOT render a column/lane that contains zero tickets (except, in Pipeline mode, the single "next" target highlighted during an advance). *Given* a workflow with N stages and tickets only in backlog/done, *when* the operator opens Tasks, *then* no empty stage column is shown.
- **M2 — Default lane layout.** The default Tasks view MUST group tickets into coarse lanes that are populated for the common case: at minimum **Needs-you**, **In-flight**, **Backlog**, **Done**. *Given* a typical project (mostly backlog + done, ≤1 in flight), *when* Tasks opens, *then* the screen is substantially filled, not mostly whitespace.
- **M3 — Needs-you first.** Tickets requiring the operator (gate pending, rejected, decision) MUST be visually surfaced first/most-prominently. *Given* a ticket with a pending gate, *when* Tasks opens, *then* it appears in the Needs-you lane and is counted in the needs-you rollup.
- **M4 — Stage + owner visible without a stage column.** For an in-flight ticket, its current **workflow stage** and **owning agent** MUST be visible on the card (chip), so removing stage columns loses no information. *Given* an in-flight ticket at `secops` owned by `/soren`, *when* shown in the In-flight lane, *then* both are legible on the card.
- **M5 — Drill-in preserved.** Opening a ticket MUST still expose its gates, owner, comments, and stage (existing task-detail behaviour). *Given* any ticket, *when* opened, *then* gate states and comments are shown.
- **M6 — Advance preserved.** The operator MUST be able to advance a ticket to the next workflow stage from the new layout, with the same guarded/conflict-safe semantics as today. *Given* an in-flight ticket, *when* advanced, *then* it moves to the next stage in order and the view reflects it live (SSE), surfacing a conflict inline on 409.
- **M7 — Serves both project types.** The view MUST be usable for a strict-gated pipeline project AND a coarse-lifecycle project without either producing a mostly-empty screen. (Validated by M1+M2 against both distributions.)
- **M8 — Off-track tickets still surfaced.** A ticket whose stage is no longer in the active track MUST remain visible, openable, and advanceable (preserve today's off-track guarantee). *Given* a ticket on a removed stage, *when* Tasks opens, *then* it is shown in a distinct lane, never dropped.

### Should
- **S1 — Selectable grouping.** The operator SHOULD be able to change the grouping field (Lane / Stage / Owner / Gate state) from a display-options control, with the choice remembered per project.
- **S2 — Pipeline mode on demand.** The stage pipeline (today's behaviour, minus empty columns) SHOULD be available as an explicit mode for operators who want the gauntlet map.
- **S3 — Blocked/rejected legibility.** Blocked/rejected tickets SHOULD be visually distinct and reasoned (why it's blocked), within Needs-you.
- **S4 — Backlog & Done as lists.** Backlog SHOULD render as a scannable list, and Done SHOULD be collapsible/archived so it never dominates the active area.
- **S5 — Remembered view.** Sort/filter/grouping/mode preferences SHOULD persist across sessions and projects (matching Asana/Linear behaviour).
- **S6 — Live updates.** All of the above MUST keep reflecting CLI-agent changes live via SSE with no reload (preserve today's projection model). *(Promoted-Must in practice; listed here as it's an existing guarantee to retain.)*

### Could
- **C1 — Add-idea / triage.** Allow adding an idea to Backlog and promoting backlog → ready (the board already stubs "+ idea · soon").
- **C2 — Swimlanes / second dimension.** A secondary grouping (e.g. lanes × owner) for power users, à la Linear/Jira swimlanes.
- **C3 — Multi-project "needs-you" roll-up.** A cross-project Needs-you surface (Linear-Inbox-style) so the operator sees what's waiting across all local projects at once.

---

## Open questions for the parallel lenses

- **(→ /arch)** Is grouping a pure client-side projection over the existing single `state` input + ticket fields (stage, gate, owner, status), or does any new field/derivation need to be persisted? My read of `partitionBoard`/`statusChip`/`ticketNeedsYou` in `board.ts` suggests Lane can be derived client-side from existing data — worth confirming.
- **(→ /ui/Aura)** Visual treatment of "no empty groups" + stage-as-chip + Done-collapse, and where "Pipeline mode" / group-by control lives.
- **(→ /mkt/Apex)** Does "control surface that shows what needs you" sharpen DART's positioning vs a generic kanban?
- **(→ /rev)** Whether "selectable grouping" (S1) is in-scope now or a follow-up after the default-lane Must-haves land.

---

## Sources (accessed 2026-06-13)

- Linear — Board layout: https://linear.app/docs/board-layout
- Linear — Display options (group-by, board/list, show/hide info): https://linear.app/docs/display-options
- Linear — My Issues (personal "what needs me" surface): https://linear.app/docs/my-issues
- Linear — Hide board columns (changelog): https://linear.app/changelog/2020-06-17
- Linear — Collapsible sections (changelog, 2025): https://linear.app/changelog/2025-03-19-collapsible-sections
- Jira — Use your kanban backlog (list vs board): https://support.atlassian.com/jira-software-cloud/docs/use-your-kanban-backlog/
- Jira — Workflows and statuses for boards: https://support.atlassian.com/jira-software-cloud/docs/workflows-and-statuses-for-boards-in-business-projects/
- Atlassian — Kanplan (backlog meets kanban): https://www.atlassian.com/agile/kanban/kanplan
- Atlassian — WIP limits (why mid-board stays sparse by design): https://www.atlassian.com/agile/kanban/wip-limits
- GitHub Docs — Changing the layout of a view (table/board/roadmap, group-by field): https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/changing-the-layout-of-a-view
- GitHub Docs — Customizing the board layout (column field = chosen): https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout
- Height — Overview (smart lists, subsection-by, group by any attribute): https://help.height.app/en/articles/3606831-height-overview
- Asana — My Tasks (list default, group-by section, remembered prefs): https://help.asana.com/s/article/my-tasks
- Asana — Manage workflow with Lists, Boards, Calendar, Timeline: https://asana.com/inside-asana/manage-workflow-project-views
- ClickUp — Customize Board view (group-by, Default-to-Me): https://help.clickup.com/hc/en-us/articles/35342044832279-Customize-Board-view
- ClickUp — Hide empty columns (user feature request): https://feedback.clickup.com/feature-requests/p/hide-empty-columns-on-me-and-all-spaces
- Notion — Board view (defaults to group-by Status): https://www.notion.com/help/boards
- Trello — Setup workflow / stages are opt-in lists: https://screenful.com/guide/setup-workflow-in-trello
- Bridge24 — Kanban boards vs task lists (when list wins for heavy backlog): https://bridge24.com/kanban-boards-or-task-lists-which-is-better-for-your-team/

**Grounding artifact (in-repo):** `studio/cockpit/src/app/shell/tasks-board.component.ts` (current stage-column design + off-track lane), `studio/cockpit/src/app/shell/board.ts` (`partitionBoard`, `statusChip`, `ticketNeedsYou`, `nextStageInOrder`).
