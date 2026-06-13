# DART Stage-Detail Panel — BUILD SPEC (DESIGN_APPROVED)

**Designer:** Aura (`/ui`) — Senior UI/UX Design Architect
**Date:** 2026-06-13
**Status:** DESIGN_APPROVED — this is the single artifact `/fe` builds from for the stage-detail panel.
**Scope:** add a read-mostly **stage-detail panel** opened from a STAGE node (and, focused, from a GATE
node) in the CI-style Pipeline view — `tasks-pipeline.component.ts` + its host `tasks-board.component.ts`.
The pipeline chain, the Worklist mode, and the task-detail modal are otherwise untouched. **No new write
path.** No DAG. No backend change.

**The job (DigitalOcean-style):** today, clicking a stage node jumps you to *one* ticket's detail
(`onStageClick → mostActionable → openTicket`). That answers "which ticket should I look at," not "what is
the whole current process at this stage." Like DigitalOcean / CI tools where clicking a build step opens a
panel showing everything happening in that step, clicking a DART stage must open a panel that lets the
operator **read the full current process at that stage** — its identity, its gate(s), every task sitting
there with what each is doing now, and the recent activity log — without leaving the pipeline.

---

## 0. Reuse contract (load-bearing — do NOT re-author)

`/fe` builds the panel by **re-projecting helpers and components that already exist**. Re-authoring any of
these is a review-blocking defect.

| Reuse | Source | Used for |
|---|---|---|
| `partitionBoard().columns` → `StageColumn` (`stage`, `owner`, `gate`, `tickets`) | `board.ts` | The stage's identity + its in-stage tickets. The panel is keyed by **stage name** and reads its column off the SAME partition the chain already renders. |
| `WorkflowView.stages` (`stage`, `owner`, `gate`) + their order | `models.ts` / `state().workflowView` | Owner, "step N of M", and the NEXT stage. |
| `stageGateNode(col)` → `StageGateNode` (`name`, `shape`, `state`, `passed`, `total`) | `board.ts` | The rolled-up gate node state for the panel's gate banner. |
| `gateRowsFor(ticket, gateDefs)` → `GateRowView[]` (name, shape, state, owner, **by**, **at**, **note**, trigger, decidable) | `gate-view.ts` | The per-gate rows (provenance + note) — the SAME rows the task-detail modal renders, so the panel's gate read and the modal's never disagree. |
| `gateStateView(state)` → `{ text, glyph, tone }` | `gate-view.ts` | Gate state as glyph + word + tone (passed/rejected/pending). Colour is never alone. |
| `cardVisualStatus(ticket, wf)` + `statusChip(status)` | `board.ts` | Per-task colour key + status pill (glyph + label). |
| `cardGateSummary(ticket, wf)` | `board.ts` | The one compact gate chip per task row (same as the card's). |
| `commentsNewestFirst(comments)` | `board.ts` | The activity log ordering, and each task's "latest activity" (newest comment). |
| `enteredCurrentStageAt(ticket)` + `dwellSince(anchor, now)` | `board.ts` | Per-task dwell ("here Nd"). |
| `nextStageInOrder(current, stageOrder)` | `board.ts` | The "what's next" stage name. |
| `#cardTpl` is **NOT** reused inside the panel (see §4.3) — the panel renders compact task ROWS, not full cards. The card template stays the chain's. |
| `TaskDetailComponent` (`dart-task-detail`) | `task-detail.component.ts` | The drill-through target. A task row / the gate "open" reuses the host's existing `openDetail(ticket)`. |
| `ControlPlaneService.advance` / `.gateSet` via the task-detail | `control-plane.service.ts` | **The only write paths.** The panel itself never mutates (see §5). |
| `--kb-*` / `--kb-*-soft` colour tokens, `--kb-dur-*` motion tokens, `tone--success/danger/muted`, the gate shield/diamond SVGs | existing styles | All colour + motion + glyph shapes. |
| The modal scrim + focus-trap + ESC pattern | `task-detail.component.ts` (`onKeydown`, `trapFocus`, `FOCUSABLE`, the `.scrim`/`.modal` shell) | The panel's open/close/focus mechanics — copy the proven pattern, do not invent a new one. |

---

## 1. Form, trigger, open/close

### 1.1 Form — a RIGHT-SIDE DRAWER (not a centred modal)

The stage panel is a **right-side slide-in drawer**, deliberately distinct from the task-detail **centred
modal**. Rationale (this is the design decision, honour it):

- **It is a lens onto a place in the flow, not one record.** A drawer anchored to the side reads as "I
  peeked into this stage," and the pipeline chain stays partly visible behind the scrim — the operator
  keeps spatial context (which node they opened). A centred modal would say "this is THE thing now,"
  which is the task-detail's job.
- **Two distinct surfaces stay legible.** The task-detail is already a centred modal. Making the
  stage-detail a centred modal too would collide visually when a task row drills through to its detail
  (modal-over-modal stacking, ambiguous ESC target). Drawer (stage) → modal (task) is an unambiguous
  visual hierarchy: the modal sits **on top of** the drawer, and ESC closes the top-most surface first.
- It mirrors the DigitalOcean / CI step-inspector convention (a side inspector for the step; a full view
  for the individual item).

**Layout:** fixed, full-height, pinned to the right. Width `min(34rem, 100%)`; on narrow (`max-width:
640px`) it becomes a full-width bottom-or-fullscreen sheet (`width: 100%`). Scrim behind it
(`color-mix(in srgb, #000 45%, transparent)`), dismiss-on-click. Internal vertical scroll
(`overflow-y: auto`) — the panel body scrolls, the header + gate banner stay pinned at the top
(`position: sticky`).

### 1.2 Trigger — stage node opens the panel; gate node opens it focused on the gate

Replace the current "drill to one ticket" behaviour of the STAGE node. The GATE node MAY (SHOULD) open the
SAME panel, focused on the gate section.

- **STAGE node** (`onStageClick`, `onStageActivate` Enter/Space): **opens the stage panel** for
  `seg.col.stage`. It NO LONGER emits `openTicket`. (The card-guard stays: a click that originated inside
  a `.card` is still ignored — the card owns its own open/kebab/advance.)
- **GATE node** (`onGateClick`): **opens the SAME stage panel**, scrolled to and focusing the **Gate
  section** (`scrollIntoView` the gate region, move focus to it). It no longer emits `openTicket` either.
  (SHOULD: if `/fe` must ship the stage panel first and the gate-focus second, the gate node may interim
  open the panel un-focused; the stage panel itself is the MUST.)
- The pipeline component currently emits `openTicket: TicketView`. Add a new output
  **`openStage: { stage: string; focusGate?: boolean }`** emitted by `onStageClick` / `onStageActivate`
  (`focusGate:false`) and `onGateClick` (`focusGate:true`). The host (`tasks-board.component.ts`) owns the
  panel open state and the partition, exactly as it already owns `openDetail` and `partition()`.

### 1.3 Open / close mechanics (copy the task-detail pattern)

- **Open:** host sets `openStage = { stage, focusGate }`. The drawer renders. On mount, move focus to the
  **close button** (focusGate=false) or to the **gate section heading** (focusGate=true) — `tabindex="-1"`
  + `queueMicrotask(() => el.focus())`, same as the modal's `closeBtn` focus effect.
- **Close** (any of): the **close button** (`✕`, top-right, `data-testid="stage-close"`,
  `aria-label="Close"`); **Escape** (`onKeydown` — stop-propagation + emit close); **scrim/backdrop
  click** (click on `.stage-scrim` outside `.stage-drawer` closes; clicks inside stop-propagate). On
  close, **return focus to the originating stage (or gate) node** — the host remembers the trigger element
  (or re-focuses `[data-testid="stage-<name>"]` / `gate-node-<name>` via the pipeline host element).
- **Focus trap:** copy `trapFocus` + the `FOCUSABLE` selector from the task-detail verbatim; Tab/Shift-Tab
  cycle within the drawer.
- **Live refresh:** the drawer is a **pure projection of `state()` keyed by stage name** (NOT a captured
  snapshot). On every SSE push the host re-derives the column for the open stage from the fresh
  `partition()`, so gates/tasks/activity update in place — same discipline as `selected()` re-deriving the
  open ticket by id. A stage that empties or is removed from the workflow while open → the panel shows the
  honest empty/removed state (§4.4), it does not crash or freeze stale.

### 1.4 Testids (stable)

| Element | testid |
|---|---|
| Scrim | `stage-scrim` |
| Drawer container | `stage-drawer` |
| Close button | `stage-close` |
| Identity section | `stage-identity` |
| Stage name | `stage-detail-name` |
| Owner | `stage-detail-owner` |
| Position ("step N of M") | `stage-detail-position` |
| Role / what-happens-here | `stage-detail-role` |
| Next stage | `stage-detail-next` |
| Gate section | `stage-gate-section` |
| One gate row | `stage-gate-row-<gateName>` |
| Gate blocker banner (rejected hard) | `stage-gate-blocker` |
| Tasks section | `stage-tasks` |
| One task row | `stage-task-<ticketId>` |
| Task latest-activity line | `stage-task-activity-<ticketId>` |
| Tasks-empty notice | `stage-tasks-empty` |
| Activity / process-log section | `stage-activity` |
| One activity entry | `stage-activity-entry-<index>` |
| Activity-empty notice | `stage-activity-empty` |

---

## 2. Content — the full process at the stage (top → bottom)

The drawer body is four stacked sections in this fixed order. **Header + Gate banner are sticky**; Tasks +
Activity scroll.

### 2.1 Stage identity (`stage-identity`) — sticky header

- **Stage name** (`stage-detail-name`, `<h2>`, the drawer's `aria-labelledby` target). Untrusted →
  interpolation only.
- **Owning agent** (`stage-detail-owner`): `<dart-glyph name="agent" /> {{ col.owner }}` — from
  `StageColumn.owner`. Absent when the stage has no owner (don't render an empty owner chip).
- **Position** (`stage-detail-position`): `"step {i+1} of {n}"` where `i` is the stage's index and `n` the
  length of the **rendered rail** stage list (`state().workflowView.stages` filtered the same way the
  chain filters — exclude the literal `backlog` stage + the done stage, matching `partition().columns`).
  Honest count of the pipeline the user sees, not the raw track length.
- **Role / what-happens-here** (`stage-detail-role`): a **short, honest one-liner** describing the stage's
  job. Source precedence: (1) if `state().workflowView` / gate defs carry a `meaning`/description for the
  stage, use it verbatim (untrusted → escape); (2) else derive from the governing gate — e.g. a stage
  governed by `SECOPS_APPROVED` reads *"Security review — a security decision gates leaving this stage."*;
  (3) else a neutral, non-fabricated fallback: *"Work sits here until it advances to the next stage."*
  **Never invent specifics** (no fake SLA, no fake "usually 2 days"). Keep it factual.
- **What's next** (`stage-detail-next`): `<dart-glyph name="advance" /> Next: {{ nextStage }}` where
  `nextStage = nextStageInOrder(col.stage, stageOrder)`. When `null` (last stage / done is next) → render
  *"This is the last stage before Done."* (honest, not blank).

### 2.2 Gate(s) (`stage-gate-section`)

The gate(s) governing this stage — sticky directly under the identity header so the blocker is always in
view. A stage with **no** gate renders a quiet *"No gate governs this stage."* line (absent-not-zero — no
empty box).

For the governing gate, render the **rolled-up node state** first (`stageGateNode(col)`), then the
**per-gate provenance rows**. Reuse `gateRowsFor` against the stage's tickets so the rows carry **`by`,
`at`, `note`** exactly as the task-detail shows them:

- **Rolled-up state badge:** the diamond shape (solid=hard / dashed=soft, the existing SVG) +
  `gateStateView(node.state)` glyph + word + `tone--{tone}`. When `node.total > 1`, append the tally
  *"{passed} of {total} tasks passed"* (from `StageGateNode.passed/total`) so the operator sees partial
  progress, never a misleading single word.
- **Per-task gate provenance** (one row per in-stage ticket that carries this gate): the gate **state**
  (glyph+word+tone), **who set it** (`by` → *"decided by {by}"*, else `owner` → *"owner {owner}"`), **when**
  (`at`, rendered with `title` = the ISO ts), and the **note** (`note` → *"rationale: {note}"*). All
  untrusted → interpolation only. This is the SAME data and the SAME `GateRowView` the modal uses.

- **A REJECTED gate is the prominent blocker** (`stage-gate-blocker`): when `stageGateNode(col).state ===
  'rejected'`, render a **banner at the top of the gate section** — `tone--danger`, `--kb-danger` border,
  `<dart-glyph name="warning" />` + *"Blocked here — {gateName} is rejected. {N} task(s) parked."* For a
  **hard** rejected gate the banner border is solid `--kb-danger`; for a **soft** rejected gate it is
  `--kb-warning` (soft warns, never blocks — match the chain's connector semantics: hard-rejected severs,
  soft does not). The banner names the rejecting task(s) inline as links that drill through (§4.3) so the
  operator goes straight to the rationale + the Approve/Reject control in the modal.

### 2.3 Tasks at this stage (`stage-tasks`)

Each in-stage ticket (`col.tickets`) as a compact **task ROW** (NOT a full `#cardTpl` card — see §4.3),
ordered **most-actionable first** (reuse the chain's precedence: rejected-gate tickets, then non-passed,
then the rest — the existing `mostActionable` logic generalised to a sort). Each row
(`stage-task-<ticketId>`) shows, in one scannable line + a sub-line:

- **id** (mono) + **title** (interpolated, escaped, 1–2 line clamp).
- **status pill** — `statusChip(t.status)` glyph + label, tinted by `cardVisualStatus(t, wf)` via a
  `data-status` attribute (same colour system as the card).
- **owning agent** — `t.assignee || t.expectedOwner || 'unassigned'` with `agent` glyph.
- **gate state** — `cardGateSummary(t, wf)` rendered as the same single gate chip the card uses
  (glyph+name+state+tone, or the `{passed}/{total} gates` rollup).
- **dwell** — `dwellSince(enteredCurrentStageAt(t), now)` → *"here {d}"* with the `pending` glyph, only
  when the helper returns non-null (≥1 day). Absent otherwise (no fabricated freshness).
- **latest activity / "what it's doing now"** (`stage-task-activity-<ticketId>`, the sub-line): the
  **newest comment** — `commentsNewestFirst(t.comments)[0]` — rendered as `{author} · {kind} · {body}`
  (body clamped to ~2 lines, escaped). When the ticket has no comments → *"No activity logged yet."* This
  is the row's DigitalOcean-style "what's happening here right now."
- The **whole row is clickable** (a `<button>` wrapping the row, `data-testid` as above) and **drills
  through to the existing task-detail** for that ticket (§4.3).

`now` is an injected input (default `Date.now()`), deterministic in tests — same pattern the pipeline
already uses for dwell.

### 2.4 Activity / process log (`stage-activity`)

The **recent activity AT this stage**, in time order (newest first), attributed + timestamped — the
"process log." Build it by merging the relevant comment-log entries across the stage's tickets:

- **Source:** for each ticket in `col.tickets`, take its comments; keep entries that are **about this
  stage's process** — specifically `kind === 'advance'` whose parsed target is this stage (an advance INTO
  the stage — reuse the `advanceTargetStage` parse already in `board.ts`; expose it or a small
  `stageActivity(col)` helper there), plus `kind` gate-decision entries (`gate`/`state` set), plus plain
  comments. Merge across tickets, sort newest-first by `ts` (reuse the `commentsNewestFirst` comparator),
  cap at the most recent ~20 with a *"showing the 20 most recent"* note when truncated.
- **Each entry** (`stage-activity-entry-<index>`): `{author}` · `[{kind || 'comment'}]` · `{ts}` (title =
  ISO) · `{body}` — the SAME comment row markup the task-detail timeline uses (escaped, `white-space:
  pre-wrap`). Advance entries read as *"advanced to {stage}"*; gate entries lead with the gate glyph+state.
- Each entry SHOULD carry which ticket it came from (its id, mono) as a drill-through link (§4.3), so an
  operator reading the log can jump to the ticket.
- **Empty:** when no entries qualify → `stage-activity-empty`: *"No recent activity at this stage."*

> **Honesty rule (load-bearing):** never fabricate a timestamp or an event. If `enteredCurrentStageAt`
> returns null, there is no "entered" line. If a ticket has no comments, the log simply has fewer entries.
> The process log is exactly what is in the append-only comment data — nothing synthesised.

---

## 3. Honest EMPTY stage

A stage with **0 tasks** (`col.tickets.length === 0`) is NEVER blank. It renders:

- The full **identity** section (name, owner, step N of M, role, next) — identity does not depend on
  tickets.
- The **gate** section: the gate's *definition* (name + hard/soft shape from `col.gate`) with state
  **`pending`** rolled up over zero tickets (`stageGateNode` already returns `passed` for an empty stage —
  for the empty panel, present it honestly as *"No tasks to gate yet"* rather than a green "passed", since
  passing over zero tickets is vacuous). If a **last-passed** fact is derivable from any past advance/gate
  comment that mentions this stage (from the activity merge), show it: *"Last activity here: {ts}"*. If
  not derivable, omit — do not fabricate.
- **Tasks:** the `stage-tasks-empty` notice — *"No tasks at this stage right now."* (+ , when the stage is
  behind the active front, the quiet reassurance *"Work has already passed through here."*; when ahead,
  *"Work will arrive here as the team advances it."* — derive behind/ahead from the rail index vs
  `activeSegmentIndex`, the SAME signal the chain uses for passed/pending nodes).
- **Activity:** whatever the log merge yields (often the `stage-activity-empty` notice).

### 3.x Removed-while-open

If the open stage is removed from the workflow during a live push (its column vanishes from
`partition().columns`), the drawer shows: identity name (retained from the last known column) + *"This
stage is no longer in the workflow."* + a Close affordance. It never renders a broken empty shell.

---

## 4. Drill-through, write constraint, and why not the card template

### 4.1 Drill-through

Every task row (§2.3), every blocker-banner task link (§2.2), and every activity-entry ticket id (§2.4)
**drills through to the EXISTING task-detail** for that ticket. Mechanically: the panel emits the host's
existing `openDetail(ticket)` (the host already owns it). The task-detail modal opens **on top of** the
drawer (the drawer stays mounted behind the modal scrim). Closing the modal returns to the drawer; ESC
closes the **top-most** surface first (modal, then drawer) — copy the per-surface ESC stop-propagation the
modal already does.

### 4.2 The write constraint — the panel is a LENS, status is READ-ONLY (MUST)

The stage panel introduces **no new write path**. It does not advance tickets, does not set gates, does not
post comments. Every action is **deferred to the existing guarded control-plane writes** reached *through*
the task-detail modal:

- Approve / reject a pending gate → the operator drills into the governing ticket; the **task-detail's
  existing Approve/Reject** (`gateSet`, with `expectedRev`, 409-reconcile) is the only path.
- Advance a ticket → the **task-detail's existing "Advance to {next}"** (or the card kebab's), the only
  path.

If — and only if — `/fe` later adds an in-panel action button (SHOULD stay deferred; this is read-mostly),
it MUST call the SAME `ControlPlaneService.advance` / `.gateSet` with the current `state().rev` and the
same 409-conflict reconcile the task-detail uses. **No second write path, ever.** The panel surfaces state;
it never owns it. Status in the panel is a pure read of `state()`.

### 4.3 Why a compact ROW, not `#cardTpl`, inside the panel

`#cardTpl` is the chain's card — it carries its own kebab menu, its own advance write, its own
open-detail, and its own conflict/error UI. Rendering it inside the panel would (a) duplicate the open path
(card-open AND row-click), (b) re-introduce a write affordance (the kebab advance) into a surface that must
stay a lens, and (c) be visually heavy in a narrow drawer. So the panel renders a **purpose-built compact
task row** that reuses the *data helpers* (`statusChip`, `cardVisualStatus`, `cardGateSummary`,
`commentsNewestFirst`, `dwellSince`) and the *colour tokens*, but has **one** interaction: open-detail. The
card template stays exactly where it is, owned by the chain.

---

## 5. Accessibility, motion, honesty (MUST)

- **Dialog semantics:** `role="dialog"` + `aria-modal="true"` + `aria-labelledby` = the stage-name `<h2>`
  id (per-instance unique id, same `Math.random().toString(36)` pattern as the modal). The gate section
  and tasks section are `<section aria-label="…">`.
- **Focus:** focus-trapped (copy `trapFocus` + `FOCUSABLE`); initial focus on close button (or gate
  section heading when `focusGate`); **focus returns to the trigger node on close**. Focus indicators: 2px
  `--kb-focus-ring` outline, 3:1 — every interactive element (close, task rows, drill links) gets
  `:focus-visible`.
- **Keyboard:** ESC closes; Tab cycles within; task rows are real `<button>`s (Enter/Space). The drawer
  does not trap the pipeline's roving ←/→ (that stays on the chain, behind the scrim).
- **Colour is additive, never alone:** every gate state = **glyph + word + colour** (`gateStateView`);
  every task status = **pill glyph + label + colour** (`statusChip` + `cardVisualStatus`). A red blocker
  banner also carries the `warning` glyph + the word "Blocked." Satisfies the same WCAG-additive rule the
  rest of the cockpit holds.
- **Motion:** the drawer slides in from the right over `--kb-dur-base var(--kb-ease-out)` (translateX 100%
  → 0) with the scrim fading in. Under `prefers-reduced-motion: reduce` the `--kb-dur-*` tokens are already
  zeroed (host pattern) → the drawer appears instantly, no slide. No status is carried by motion.
- **No `[innerHTML]`:** every untrusted field — stage name, owner, role text, gate name, gate `note`,
  task title, comment author/body/kind, ts — reaches the DOM **through interpolation only**. This matches
  the explicit security notes on `TicketView` / `TicketComment` / `TicketGate` in `models.ts`. No
  `DomSanitizer` bypass anywhere in the panel.
- **Touch targets:** ≥44px on coarse pointers for the close button and task rows (`@media (pointer:
  coarse)`), matching the chain's `min-height: 44px` gate/end-cap rule.
- **Honest copy:** "Blocked here," "No tasks at this stage right now," "No recent activity at this stage,"
  "This is the last stage before Done." No fabricated urgency, no fake metrics, no green over a vacuous
  zero (§3 empty-gate rule).

---

## 6. ASCII mocks

### 6.1 BUSY stage — tasks + a PENDING gate + activity

```
░░ scrim ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎┌──────────────────────────────────────┐
░ (pipeline chain dimmed behind) ░░░░░░░░░╎│  Implementation            ✕ Close   │ ← sticky header
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│  ▣ /be   ·   step 6 of 12             │   stage-identity
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│  Work is implemented under TDD here.  │   stage-detail-role
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│  ➜ Next: Code review                  │   stage-detail-next
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎├──────────────────────────────────────┤
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ GATE  ◆ CODE_REVIEWED  ⏳ pending      │ ← sticky gate banner
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│       1 of 2 tasks passed             │   stage-gate-section
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│   • DART-21  ✓ passed · by /rev · 2d  │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│   • DART-22  ⏳ pending · owner /rev   │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎├──────────────────────────────────────┤  ↕ scrolls
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ TASKS AT THIS STAGE (2)               │   stage-tasks
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ ┌──────────────────────────────────┐ │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ │DART-22  Payment retry logic   ▸ │ │ ← stage-task-DART-22
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ │⟳ in progress  ▣ /be  ◇ review… │ │   (row = open detail)
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ │now: /be · comment · "wiring th…│ │   stage-task-activity-…
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ └──────────────────────────────────┘ │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ ┌──────────────────────────────────┐ │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ │DART-21  Idempotency keys      ▸ │ │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ │⟳ in progress  ▣ /be  ✓ 3/3 gat │ │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ │now: /rev · comment · "approved…│ │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ └──────────────────────────────────┘ │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎├──────────────────────────────────────┤
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ ACTIVITY (process log)               │   stage-activity
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ /rev · [gate] · 1h · ✓ approved CODE… │   stage-activity-entry-0
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ /be  · [comment]· 3h · wiring the re… │   …entry-1
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎│ /be  · [advance]· 2d · advanced to I… │   …entry-2
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╎└──────────────────────────────────────┘
```

### 6.2 BLOCKED stage — a REJECTED hard gate is the blocker

```
                                          ╎┌──────────────────────────────────────┐
                                          ╎│  Security                  ✕ Close   │
                                          ╎│  ▣ /secops  ·  step 4 of 12          │
                                          ╎│  Security review gates this stage.   │
                                          ╎│  ➜ Next: Design                      │
                                          ╎├──────────────────────────────────────┤
                                          ╎│ ⚠ BLOCKED HERE                       │ ← stage-gate-blocker
                                          ╎│   SECOPS_APPROVED is REJECTED.       │   tone--danger, solid
                                          ╎│   1 task parked. → DART-30           │   --kb-danger border
                                          ╎├──────────────────────────────────────┤
                                          ╎│ GATE  ◆ SECOPS_APPROVED  ✗ rejected  │   stage-gate-section
                                          ╎│   • DART-30  ✗ rejected               │
                                          ╎│       decided by /secops · 5h         │   by · at
                                          ╎│       rationale: "secrets in logs —  │   note (escaped)
                                          ╎│       must redact before approve"     │
                                          ╎├──────────────────────────────────────┤
                                          ╎│ TASKS AT THIS STAGE (1)              │
                                          ╎│ ┌──────────────────────────────────┐ │
                                          ╎│ │DART-30  Audit log redaction   ▸ │ │ ← drills to detail →
                                          ╎│ │⛔ blocked  ▣ /secops  ◆ rejected │ │   Approve/Reject lives
                                          ╎│ │now: /secops · gate · "rejected:…│ │   in the task-detail
                                          ╎│ └──────────────────────────────────┘ │
                                          ╎├──────────────────────────────────────┤
                                          ╎│ ACTIVITY (process log)               │
                                          ╎│ /secops·[gate] · 5h · ✗ rejected SE… │
                                          ╎│ /secops·[comment]·5h· secrets in lo… │
                                          ╎│ /be · [advance] · 1d · advanced to … │
                                          ╎└──────────────────────────────────────┘
```

### 6.3 EMPTY stage — identity + gate + role, no tasks (never blank)

```
                                          ╎┌──────────────────────────────────────┐
                                          ╎│  Design QA                 ✕ Close   │
                                          ╎│  ▣ /ui   ·   step 9 of 12            │
                                          ╎│  Design QA verifies the UI against   │
                                          ╎│  the approved design before QA.      │
                                          ╎│  ➜ Next: QA                          │
                                          ╎├──────────────────────────────────────┤
                                          ╎│ GATE  ◇ DESIGN_APPROVED               │   soft = dashed diamond
                                          ╎│   No tasks to gate yet.              │   (vacuous, NOT green)
                                          ╎├──────────────────────────────────────┤
                                          ╎│ TASKS AT THIS STAGE                  │
                                          ╎│   No tasks at this stage right now.  │ ← stage-tasks-empty
                                          ╎│   Work will arrive here as the team  │   (ahead of active front)
                                          ╎│   advances it.                       │
                                          ╎├──────────────────────────────────────┤
                                          ╎│ ACTIVITY (process log)               │
                                          ╎│   No recent activity at this stage.  │ ← stage-activity-empty
                                          ╎└──────────────────────────────────────┘
```

(Glyph legend for the mocks: `▣` agent · `◆` hard gate (solid diamond) · `◇` soft gate (dashed diamond) ·
`✓` check/passed · `✗` cross/rejected · `⏳` pending · `⟳` in-progress · `⛔` blocked · `⚠` warning ·
`➜` advance · `▸` drill-through. All map to existing `dart-glyph` names — no new glyph needed.)

---

## 7. Build checklist for `/fe`

- [ ] New `dart-stage-detail` component (drawer): `role="dialog"` + `aria-modal` + `aria-labelledby`,
      focus-trap + ESC + scrim-click, focus-return-to-trigger — **patterned on `task-detail.component.ts`**.
- [ ] Inputs: `column: StageColumn`, `stageIndex`/`stageCount` (for "step N of M"), `nextStage: string |
      null`, `gateDefs`, `activeSegment`, `focusGate: boolean`, `now`. Outputs: `close`, `openTicket`
      (re-emit the host's `openDetail`).
- [ ] Pipeline component: replace `onStageClick`/`onStageActivate`/`onGateClick` `openTicket` emits with a
      new `openStage` output (`{ stage, focusGate }`); keep the card-guard. Host opens/closes the drawer
      off `partition()` keyed by stage name, re-derived on every SSE push.
- [ ] Sections per §2 with the §1.4 testids; compact task ROW (NOT `#cardTpl`, §4.3) reusing the data
      helpers; gate rows via `gateRowsFor`; rolled-up gate via `stageGateNode`; rejected-gate blocker
      banner; activity merge (add a small `stageActivity(col)` helper to `board.ts`, reusing
      `advanceTargetStage` + `commentsNewestFirst`).
- [ ] Empty-stage (§3) + removed-while-open (§3.x) states — never blank.
- [ ] No `[innerHTML]`; no new write path (§4.2); colour additive (§5); reduced-motion honoured.
- [ ] Tests: stage node opens the drawer (not a ticket); gate node opens it focused on the gate; tasks
      list with statuses/dwell/latest-activity; rejected gate raises the blocker banner; task row drills
      to task-detail; empty stage shows identity + gate + "no tasks"; ESC + scrim close + focus return;
      no-tofu glyphs; live push refreshes an open drawer in place.

**The single riskiest implementation detail:** the open drawer **must re-derive its column from the live
`state()` by stage name on every SSE push — never hold a captured snapshot.** A naïve build passes the
`StageColumn` object once and freezes it; then a CLI agent advances a ticket, sets the gate, or the
workflow is edited, and the drawer silently shows stale gate state / a task that has already left / a
removed stage. This is the EXACT bug the task-detail already solved by re-deriving `selected()` by id —
the stage drawer must mirror that discipline (re-derive by stage name from the fresh `partition()`),
including the honest empty / removed-while-open fallbacks (§3.x).

---

**Designer:** Aura (`/ui`) · **Status:** DESIGN_APPROVED · `/fe` builds from this. Read it before coding.
