# Architecture Decision — Tasks Pipeline Board

**Author:** Jorge (Solution Architect, `/arch`) · **Gate:** `ARCH_APPROVED`
**Ticket:** ADT-232 (Tasks pipeline board)
**Sprint:** sprint-05-cockpit-polish · **Branch:** feat/dart-tasks-pipeline
**Decision date:** 2026-06-08
**Status:** **ARCH_APPROVED — passed. PURE FRONTEND.** No new route, no new persistence, no new external input. **No `SECOPS_APPROVED` gate** (justification in §6).
**Philosophy:** *Architecture is about trade-offs, not silver bullets.* DART **records intent**; the host tool **executes**. The pipeline is a **re-projection of state the cockpit already holds** — chrome over `TasksBoardComponent`, not a rewrite.

This ADR answers the two questions Aura flagged for `/arch` (Backlog predicate; needs-you roll-up routing) and confirms the done-folder, off-track lane, and the pure-FE verdict against the real code in `hub/lib/{state,api,stage-map}.js` and `studio/cockpit/src/app/shell/{board.ts,tasks-board.component.ts}`.

---

## 0. What binds this design (the model, verified in source)

The single most important architectural fact, and the one the design specs got slightly wrong:

> **The board is stage-driven, not status-driven.** A ticket lives at a **`stage`** (a string, e.g. `vision`, `architecture`, `backlog`, `done`). The board derives **columns = the active track's stages in order** (`workflowView.stages`, via `stageColumns()`), and places each ticket in the column whose stage equals `ticket.stage`. The `status` field (`in_progress | waiting | blocked | done`) is **derived at projection time** by `statusOf(stage, gates, assignee)` in `state.js` — it is a *render hint shown as a card chip*, **not a stored lifecycle enum**.

Consequences that constrain every decision below:
- There is **no stored `idea / triage / unstarted` status** anywhere in the model (`grep` confirms: absent from `hub/lib`, `board.ts`, `core/`). Aura §2.2 and Apex §2.2 proposed `status: idea/triage/unstarted` as the Backlog predicate — **that field does not exist**, so the predicate must be **stage-based**, derived from the same `workflowView` + `tickets` projection the board already consumes.
- `workflowView.stages` is an **ordered** list (the active track flattened by `projectWorkflowView()`). "First stage" = `stages[0]`, "terminal stage" = `stages[stages.length - 1]`. These are positional facts already in the FE.
- The advance write is the **existing guarded control-plane route** `ticket/advance` (`api.js`): `{ id, toStage, expectedRev, by }`, CAS-guarded on `rev`, inline 409 on conflict, audit comment emitted. **No drag.** The pipeline changes *layout*, never the write.
- The list roll-up `listSummary(project)` already returns `{ open, needsYou }` per project (`state.js`); the detail view already has `taskSummary { total, byStatus{ in_progress, waiting, needsYou, blocked, done } }`. Both are exact-by-construction from the same projection.

**Net:** every fact the pipeline needs is already in the projection. The redesign is a **pure presentational re-grouping** of `workflowView.stages` + `tickets`.

---

## 1. Backlog predicate (§2.2) — **DECISION**

**The Backlog column shows tickets that have not yet entered the track's flow**, expressed as a pure FE projection over the data the board already has. Precisely:

> **`backlogTickets = tickets.filter(t => isBacklog(t, workflowView))`** where
> **`isBacklog(t, wf)` is true iff `normStage(t.stage)` is empty/unset OR equals the conventional first-stage token `"backlog"`** — i.e. the ticket carries no stage, or it sits at a stage literally named `backlog`.

Rationale and exactness:
- **Empty/unset stage** = a ticket that exists but has never been routed onto the track (a genuine holding-pen item). `state.js` defaults a missing stage to `t.track || 'unknown'`, so the FE predicate treats `''`, `'unknown'`, and nullish as Backlog.
- **Stage `"backlog"`** is the conventional intake-stage token (the ledger already uses `stage: "backlog"` in practice). When a track names its first stage `backlog`, those tickets belong in the left bar by name.
- **This is the ONLY split-out from the existing columns.** A Backlog ticket that *also* matches `stages[0]` must appear **once** — in the Backlog bar, not duplicated as the first stage column. So the rule is: **Backlog claims its tickets first; `stageColumns()` for the remaining stages must exclude tickets already claimed by Backlog** (a set-difference, identical in spirit to how `offTrackGroups()` already partitions). If the track's `stages[0]` is itself the literal `backlog` stage, the Backlog bar **replaces** that first column (do not render an empty `backlog` stage column behind the bar).

**How a ticket leaves Backlog:** the **same routed action as everywhere else** — `ticket/advance` to the next stage in track order (`nextStageInOrder(current, stageOrder)` already returns `stageOrder[0]` for an off-track/unstaged `current`, which is exactly "advance onto the track from the holding pen"). No new write. **No drag.** Until/unless a backlog-create endpoint exists, the `[+ idea]` affordance is an **inert "soon"** control (`aria-disabled`), per the placeholder rule — never a dead live button.

**This predicate is a pure FE projection** — no new field, no new endpoint, no backend change. It is computed from `tickets[].stage` + `workflowView.stages[0]`, both already on the wire.

---

## 2. Done folder (§2.5) — **DECISION**

> **"Done" = tickets at the terminal stage**, i.e. `normStage(t.stage) === last(workflowView.stages).stage` (equivalently the conventional `done` token — `statusOf()` already maps stage `done` → status `done`). The **stacked, clickable folder is pure FE presentation**: the terminal stage column is rendered as a collapsed folder that stacks its N done cards behind a folder face, expands in place (or in a focus-trapped sheet) on click/Enter/Space, and shows a live count.

- **No new backend.** The folder collapses cards the board *already* places in the terminal column; the count is `terminalColumn.tickets.length`. Increment animations and the count are derived locally.
- **Threshold:** render the folder for the terminal stage **unconditionally** (a folder of 0 still reads as "nothing shipped yet"; a folder of 1 still reads as a folder) — this keeps the terminus visually stable and sticky at the right edge regardless of throughput. (Apex §2.6 recommended *not* building a separate done-folder unless the column crowds; Aura's brief explicitly asks for the folder. The folder **is** the terminal stage column, just collapsed — so it is the same data with a different chrome, not a new concept. `/po` owns the "always a folder vs only above N" product call; architecturally either is a pure-FE threshold over the same set.)
- **Honesty:** the folder is a *view convenience*, never a delete/archive. Done tickets remain in the ledger at the terminal stage; collapsing them changes nothing in state.

---

## 3. Needs-you / activity roll-up for the header (§1.1) — **DECISION**

> **The board header's roll-ups derive entirely from the existing projection — no new endpoint.**

- **needs-you** per project and the count are already computed: `taskSummary.byStatus.needsYou` (detail view) and `listSummary().needsYou` (list view), both via `needsHumanDecision(ticket)` in `state.js` (hard-gate-rejected OR waiting-on-a-known-owner-with-no-heartbeat). The FE already has `ticketNeedsYou()` in `board.ts` for the per-card chip. The header rolls these up by **counting tickets where `ticketNeedsYou(t)` (or the `needsYou` overlay) is true** — a pure reduction over the already-loaded `tickets`.
- **No N+1.** The roll-up is computed **once** over the in-memory `tickets` array the board already holds; it is not a per-ticket fetch. The per-project list strip (Projects Home) reads the single `listSummary` roll-up already returned with the project record. Aura §7.2 item 2 is hereby confirmed: the per-project `needsYou` + name already reach the roll-up; no extra round-trip.
- **activity / "agent working":** derive from the existing `ticket.active` heartbeat (`{agent, since, heartbeat}`, idle after ~90s) already on each ticket — **absent-not-zero** (omit when nothing is live). No new endpoint.

---

## 4. Off-track lane (§2.6) — **DECISION (kept verbatim)**

> **The existing FE set-difference stays unchanged:** `offTrackGroups(workflowView, tickets)` groups tickets whose `stage ∉ workflowView.stages`, preserving first-seen order, never dropping, never re-keying. The pipeline keeps this lane below the train, warning-toned, with each task openable and advanceable (`nextStageInOrder` re-homes an orphan onto `stages[0]`).

No change. Backlog (§1) and off-track (§4) are **disjoint by construction**: Backlog claims *unstaged / first-stage* tickets; off-track claims tickets at a stage that *was* in the track but no longer is. A ticket is in exactly one of {Backlog, a stage column, the done folder, off-track}.

---

## 5. Verdict — **PURE FRONTEND**

**Yes. The Tasks pipeline is a pure frontend re-projection of existing per-project state.** Every element is presentational chrome over the projection `TasksBoardComponent` already consumes:

| Pipeline element | Source (already on the wire) | New backend? |
|---|---|---|
| Left Backlog bar | `tickets[].stage` ∈ {unset, `backlog`} (§1) | **No** |
| Stage train (columns + order) | `workflowView.stages` (ordered), `stageColumns()` | **No** |
| Connecting rail + gate-by-shape nodes | `workflowView.stages[].gate.refusal` (hard/soft) | **No** |
| Active-segment accent | furthest in-progress stage over `tickets[].status` | **No** |
| Done folder (stacked, clickable) | terminal stage column, collapsed (§2) | **No** |
| Header needs-you / activity roll-up | `taskSummary` / `ticketNeedsYou` / `ticket.active` (§3) | **No** |
| Off-track lane | `offTrackGroups()` set-difference (§4) | **No** |
| Advance (routed, no drag) | existing `ticket/advance` + `expectedRev` + 409 | **No** (existing route) |

**No new route, no new persistence, no new external input is required.** The one *forward* affordance — a backlog-create (`[+ idea]`) — is **out of scope for this ticket** and stays an inert "soon" control until a future ticket specifies it. If/when it is built, it would be a new mutating route (`ticket/create` or similar) and **would** carry `ARCH_APPROVED` + `SECOPS_APPROVED` (it accepts external free-text input under the guard); it is explicitly *not* part of ADT-232.

---

## 6. Security gate justification (why no `SECOPS_APPROVED`)

Per `workflow.yaml`, `SECOPS_APPROVED` triggers on: auth, secrets, PII, file_upload, external_input, network, crypto. **ADT-232 introduces none of these:**
- **No new external input.** The only write is the *pre-existing* `ticket/advance`, already behind `guard.writeAllowed` (X-AIDT + loopback Host/Origin) and already covered by the engine's safety-gate enforcement (`routePastUnmetSafetyGate`). The pipeline does not add, widen, or alter that surface.
- **No new untrusted-rendering path.** All untrusted strings (titles, stage names, owners, routing labels) reach the DOM by **interpolation only** — the redesign explicitly keeps `no-unsafe-binding` green (Aura §0, §6). No `[innerHTML]`, no new sink.
- **No new persistence, network, secrets, or PII.**

The `/kai` proposal-text rendering Aura §7.2 item 4 flags is a **Knowledge-panel concern, not ADT-232** — it is tracked under the separate Knowledge ticket and carries its own `/secops` confirmation there.

**Therefore no `SECOPS_APPROVED` gate is recorded on ADT-232.** Security is a safety override that is *never skipped when triggered* — here it is genuinely **not triggered**, and this note records why (not a silent omission).

---

## 7. Risks, sensitivity & trade-off points (ATAM-lite)

| # | Risk | Severity | Mitigation (binding on `/fe`) |
|---|---|---|---|
| R1 | **Double-placement** — a Backlog ticket also rendered as the first stage column → ticket appears twice. | Med | Backlog claims its set **first**; `stageColumns()` for the remaining stages must exclude Backlog-claimed tickets (set-difference). If `stages[0]` is the literal `backlog` stage, the bar **replaces** that column. **Parity test** required: every ticket appears in exactly one of {Backlog, stage column, done folder, off-track}. |
| R2 | **Stage-token assumption** — hard-coding `"backlog"` / `"done"` onto tracks that don't name stages that way (Apex §2.2). | Med | Predicate is `unset OR == "backlog"` and `== last(stages)`; it **degrades to "no Backlog bar / terminal-is-last-column"** when a track names neither — never mis-sorts. Generic help says "first/last stage," the real stage name shows on the column. |
| R3 | **Roll-up N+1** if the header re-fetches per ticket. | Low | Confirmed §3: reduce over the already-loaded `tickets`; reuse `taskSummary` / `listSummary`. No per-ticket fetch. |
| R4 | **Status carried by motion/colour alone** (advance slides, active-segment accent). | Low (a11y) | Non-negotiable: status = glyph + colour + **text** + count; motion only narrates. Reduced-motion fallbacks listed in Aura §2.4.1, §6. |
| R5 | Sticky Backlog bar / Done folder obscuring focus on horizontal scroll. | Low (a11y) | `scroll-margin` reserved so focused columns are never hidden behind the sticky edges (Aura §6 [2.4.11]). |

**Non-risks (safe by construction):** no new write surface; off-track logic unchanged; advance stays the guarded routed action with 409; no `[innerHTML]`.

---

## 8. Handoff

- **Gate set:** `ARCH_APPROVED = passed` (ADT-232). `DESIGN_APPROVED = passed` (referencing Aura's spec). `CODE_REVIEWED`, `VERIFIED` pending. **No `SECOPS_APPROVED` gate** (§6 — not triggered).
- **To `/fe` (Finn):** build as a presentational refactor of `TasksBoardComponent` over the existing `columns()` / `offTrack()` projection. Add the Backlog projection (§1, with the R1 set-difference + parity test), the done-folder collapse (§2), the header roll-up reduction (§3). Keep the advance write, `expectedRev`, and inline 409 exactly as-is. `[+ idea]` is inert "soon." No new glyph library, no `[innerHTML]`. Verify against the **production build served same-origin**.
- **To `/po` (Max):** one product call — done-folder threshold (always a folder, or only above N done items). Architecturally either is a pure-FE threshold over the same set (§2).
