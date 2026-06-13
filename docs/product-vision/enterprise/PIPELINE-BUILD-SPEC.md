# DART Pipeline View — BUILD SPEC (DESIGN_APPROVED)

**Designer:** Aura (`/ui`) — Senior UI/UX Design Architect
**Date:** 2026-06-13
**Status:** DESIGN_APPROVED — this is the single artifact `/fe` builds from. It consolidates the five-agent
enterprise investigation (`aura-pipeline.md` base design · `anna-research.md` CI conventions ·
`jorge-arch.md` data feasibility · `max-product.md` the job · `apex-strategy.md` empty-state imperative +
dual-audience) into one implementable layout.
**Scope:** the Tasks board PIPELINE mode only — `tasks-board.component.ts` `@case ('pipeline')`. The
WORKLIST mode is good and stays 100% untouched. No new write path. No DAG. No backend rewrite.
**Reuse contract (load-bearing — do not re-author):** `#cardTpl` (verbatim), the `--kb-*` / `--kb-*-soft`
colour tokens + the `--kb-dur-*` motion tokens, the gate diamond SVGs (solid=hard, dashed=soft) already in
the train, the `partitionBoard` / `activeSegmentIndex` / `nextStageInOrder` / `cardVisualStatus` /
`cardGateSummary` / `populatedStageCount` helpers in `board.ts`, the `gateStateView` helper in
`gate-view.ts`, the guarded `ControlPlaneService.advance` + task-detail gate write paths, the SSE-live
projection, the per-project persisted mode + the `populatedStageCount >= 2` auto-default.

---

## 0. One-line thesis

Replace the four-region Pipeline *board* (Backlog bar + stage train + Done folder + Off-track lane) with a
real **CI-style connected pipeline**: a left→right chain of **stage nodes** joined by explicit
**connectors**, with **gate/approval nodes on the connectors** as the centrepiece, **per-stage status
colour**, the **active front** lit along the chain, and **only in-pipeline tickets** rendered as cards.
Backlog / Done / Off-track collapse to small **end-cap reference tiles** (count + link to the Worklist),
never cards. The quiet state is an honest **pending-path preview**, never a void.

The data needed is already in `partitionBoard().columns` (the in-pipeline set) + `WorkflowView.stages`
(owner + gate per stage). The only optional new signal is **client-side dwell-time** folded from
`kind:"advance"` comment timestamps (§6). Everything else is a re-projection of helpers that exist.

---

## 1. The connected stage-flow layout

### 1.1 DOM structure (replaces the `.train` block inside `@case ('pipeline')`)

```
.pipeline-flow            [data-testid="pipeline-flow"]  role="group" aria-label="Pipeline"
  .flow__scroll           [data-testid="pipeline-chain"] role="list" aria-label="Pipeline stages"
                          (keydown)="onColumnKeydown($event)   ← reuse roving ←/→
    span.flow__track      aria-hidden                          ← the continuous rail behind nodes
    ─ end-cap: FROM BACKLOG  [data-testid="pipeline-backlog-ref"]  (§3) — flex:0 0 auto, role="listitem"
    ─ for each stage node, in rail order (the columns() array):
        .flow__seg                                        ← wraps [connector?][gate-node?][stage-node]
          .flow__connector   [data-testid="flow-connector-<stage>"]  [data-state]  (§1.4, §2)
          .gate-node         [data-testid="gate-node-<stage>"]        (§2) — present only if stage.gate
          .stage-node        [data-testid="stage-<stage>"]  role="listitem"  [data-stage-status]  (§1.2)
    ─ end-cap: DONE          [data-testid="pipeline-done-ref"]   (§3) — flex:0 0 auto, role="listitem"
  .flow__offtrack-ref       [data-testid="pipeline-offtrack-ref"]  (§3) — below the chain, absent when 0
  .flow__idle               [data-testid="rail-middle-empty"]   (§4 state A) — the quiet preview + escape
```

The chain is one horizontal, **non-wrapping** flow (`flex-wrap: nowrap`) with a continuous `--kb-border`
track behind the nodes (reuse `.rail__track`). End caps are `flex: 0 0 auto` pinned at the ends; only the
middle chain scrolls (`overflow-x: auto`). **Horizontal scroll is CONVENTIONAL and acceptable here** — a
pipeline scrolls left→right; this is the one place that differs from the never-scroll Worklist (see §7).

`columns()` (= `partition().columns`) is already the in-pipeline set with the literal `backlog` stage and
the done stage removed by construction. Iterate it directly — do **not** re-filter.

### 1.2 The STAGE NODE anatomy

A stage node renders at one of three **densities** driven by its load (this is the "suggestion, not a wall
of empty columns" idea, made concrete). Drive density off a `[data-density]` attribute:

| Density | When | Renders |
|---|---|---|
| **active** | `col.tickets.length >= 1` | full header + ticket cards stacked below |
| **idle** | `col.tickets.length === 0` AND `ci > activeSegment()` (ahead of the front) | slim node: marker + vertical stage name + `0` |
| **passed** | `col.tickets.length === 0` AND `ci <= activeSegment()` (behind the front) | slim node, marker + connector read the passed tone |

**Header (active density), single dense row, left→right** — reuse `.col__head` rhythm:

1. **Marker** — `.flow__node` span, the existing gate/dot SVG by `nodeKind(col)` (none = dot,
   hard = solid diamond, soft = dashed diamond). `[data-active]` lit when `ci <= activeSegment()`.
2. **Stage name** — `col.stage`, `--kb-text`, 600 weight. Never tinted (keeps ≥4.5:1).
3. **Owner agent** — `<dart-glyph name="agent" /> {{ col.owner }}`, `--kb-text-muted`. Absent → omitted.
4. **Gate state word** (if `col.gate`) — the rolled-up gate state word (`passed`/`pending`/`rejected`)
   toned via `gateStateView`. The diamond shape is on the marker; the WORD carries it without colour.
   This is the stage's own gate read at a glance. The full gate-node on the connector (§2) is the
   centrepiece; this header word is the per-node echo.
5. **Count** — right-aligned (`margin-left:auto`), `col.tickets.length`. The single most-scanned number.

**Tickets** — when `col.tickets.length`, a `<ul class="col__cards flow__cards" role="list">` of
`#cardTpl` cards (verbatim, no new card, no new card testid). When many, the list scrolls vertically
inside the node (`max-height: 60vh; overflow-y:auto`) — compact, never a sprawling column.

### 1.3 Per-stage STATUS COLOUR (the node-level read — the enterprise headline)

Each stage node carries one **stage status**, emitted as `[data-stage-status]` on `.stage-node`, painted
on the node's **top border + marker** (never colour-only — the gate word + count + a status word carry it
too). Derive it by **reducing `cardVisualStatus(ticket, workflowView)` over the node's tickets + the gate**,
in this precedence (the same precedence the cards already use, lifted to the stage):

| Stage status | Derivation over `col.tickets` (+ `col.gate`) | `data-stage-status` | Colour token |
|---|---|---|---|
| **blocked** | any ticket reduces to `needs-you` or `blocked` (rejected hard gate / `status==='blocked'`) | `blocked` | `--kb-danger` |
| **running** | else any ticket `in_progress` | `running` | `--kb-accent` |
| **waiting** | else `tickets.length >= 1` (present, none in progress) | `waiting` | `--kb-warning` |
| **passed** | else `tickets.length === 0` AND `ci <= activeSegment()` (behind the front) | `passed` | `--kb-success` |
| **pending** | else (empty, ahead of the front) | `pending` | `--kb-text-muted` |

> **Rule:** a node's colour is the *worst / most-actionable* state among its tickets — one red ticket makes
> its stage read red, which is exactly the "where's the wall" signal a CI reader wants. Add a new pure
> helper `stageNodeStatus(col, activeIndex, ci)` in `board.ts` returning the union type
> `'blocked'|'running'|'waiting'|'passed'|'pending'`. It MUST reuse `cardVisualStatus` per ticket — do not
> re-implement the precedence.

CSS: tint the top border + marker by `[data-stage-status]`; the stage name + owner stay `--kb-text` /
`--kb-text-muted`. Example:
```css
.stage-node { border-top: 2px solid var(--kb-border); }
.stage-node[data-stage-status='blocked'] { border-top-color: var(--kb-danger); }
.stage-node[data-stage-status='running'] { border-top-color: var(--kb-accent); }
.stage-node[data-stage-status='waiting'] { border-top-color: var(--kb-warning); }
.stage-node[data-stage-status='passed']  { border-top-color: var(--kb-success); }
.stage-node[data-stage-status='pending'] { border-top-color: var(--kb-border); }
```

### 1.4 The active front (the lit chain — promote `activeSegmentIndex`)

`activeSegment()` already returns the furthest in-progress stage index in the rendered rail. Promote it
from a faint marker accent to the **primary chain read**:

- **Connectors + markers up to and including `activeSegment()`** read the passed/running tone:
  `[data-state="passed"]` on the connector → `--kb-success` lit line; the running front node →
  `--kb-accent`.
- **Connectors ahead of the front** read `[data-state="pending"]` → faint `--kb-border` track.
- A **rejected hard gate breaks** its connector regardless of the front (§2) — `[data-state="broken"]`
  wins over passed/pending.

The chain then reads "filled from the left up to here" — the universal CI progress read, reinforced by
each node's count + status word (never colour-alone).

---

## 2. Gate / approval nodes on the connectors (the centrepiece)

Promote the gate from a chip inside a header to a **node on the line** — the thing work must pass.

### 2.1 Placement & shape

- A stage `col` whose `col.gate` is set renders a **gate node on the connector ENTERING that stage**
  (between stage `N-1` and stage `N`). No `col.gate` → a plain connector, no gate node.
- **Solid diamond** = hard (`col.gate.refusal === 'hard'`); **dashed diamond** = soft
  (`refusal === 'soft'`). Reuse the exact SVGs already in `nodeKind` (`gate-hard` / `gate-soft`). The gate
  node is a real `<button>` (§2.4, §5).

### 2.2 Rolled-up gate STATE across the stage's tickets

Each in-stage ticket carries the governing gate in its `gates[]`. Roll the gate state up across
`col.tickets` into one node state. Add a pure helper `stageGateNode(col)` in `board.ts` returning:

```ts
{ name: string; shape: 'hard'|'soft'; state: 'passed'|'pending'|'rejected';
  passed: number; total: number } | null   // null when col.gate is absent
```

Derivation over the gate named `col.gate.name` on each ticket in `col.tickets`:
- **rejected** if ANY in-stage ticket has that gate `rejected` (worst-case wins — the blocker).
- else **pending** if ANY is non-`passed`.
- else **passed** (all passed, or stage empty).
- `passed`/`total` = count of in-stage tickets whose gate is `passed` / total in-stage tickets — drives
  the `"◇ ARCH · 1 of 2 passed"` label when `total > 1`.

Reuse `gateStateView(state)` for glyph/tone/text. Tone the diamond: passed→`--kb-success`,
pending→`--kb-text-muted`, rejected→`--kb-danger`.

### 2.3 The BLOCKED-RED break (the "blocked here" read)

This is the load-bearing visual.

- **A rejected HARD gate** (`shape==='hard'` AND `state==='rejected'`): the diamond goes **red** AND the
  connector **entering that stage breaks** — `[data-state="broken"]` → **red, dashed, visibly severed
  line**. Shape (dashed/severed) carries it for colour-blind users, not hue alone. The node also shows the
  word `rejected`. This is the GitHub-Actions "waiting/blocked" / GitLab "blocked manual job" affordance.
- **A rejected SOFT gate** NEVER breaks the line (honest hard-vs-soft): it shows a **dashed advisory
  diamond** toned warning + the word `rejected`, but the connector stays intact (`[data-state]` follows the
  active front). Soft = warn, don't block. Mirror `refusal: 'soft'`.
- A **pending** gate ahead of the front: muted diamond, faint connector. A **passed** gate: green diamond,
  lit/solid connector past it.

CSS sketch:
```css
.flow__connector { height: 1.5px; background: var(--kb-border); }
.flow__connector[data-state='passed'] { background: var(--kb-success); }
.flow__connector[data-state='broken'] {
  height: 0; border-top: 2px dashed var(--kb-danger); background: none;
}
.gate-node[data-gate-state='rejected'][data-shape='hard'] { color: var(--kb-danger); }
.gate-node[data-gate-state='passed'] { color: var(--kb-success); }
.gate-node[data-gate-state='pending'] { color: var(--kb-text-muted); }
```

### 2.4 The gate node is the approval affordance (no new write path)

Clicking a gate node opens the **task-detail gate panel** for the governing ticket — the existing decidable
gate write. For a stage with several waiting tickets the node label reads `◇ ARCH · 1 of 2 passed` and the
click routes to the most-actionable ticket's detail (prefer the first ticket whose gate is `rejected`,
else the first non-`passed`, else the first ticket). **Do NOT invent an approvals inbox** — the gate node
IS the approval affordance, reusing the detail modal's gate-approve write. One write path.

---

## 3. ONLY in-pipeline tickets — end-cap reference tiles, not columns

Render cards **only** for `partition().columns` tickets (inside stage nodes). Backlog / Done / Off-track
become small reference tiles — count + link to the Worklist — **never cards, no duplication**.

| Region | Render | testid | Behaviour |
|---|---|---|---|
| **Backlog** | Left end-cap tile: `<dart-glyph name="stack"/> From backlog · {{ backlog().length }} →` | `pipeline-backlog-ref` | a `<button>` → `selectMode('worklist')`. Absent when `backlog().length === 0`. Keep `backlog-count` semantics as the number. |
| **Done** | Right end-cap tile: `<dart-glyph name="check"/> Done · {{ doneTickets().length }} →` | `pipeline-done-ref` | a `<button>` → `selectMode('worklist')`. Keep `done-folder-count` semantics as the number. (The chain's lit-green front already conveys "work reached done".) |
| **Off-track** | A single red badge below the chain: `<dart-glyph name="warning"/> {{ offTrackCount() }} off-track →` | `pipeline-offtrack-ref` | a `<button>` → `selectMode('worklist')`. Absent when `offTrack().length === 0`. |

Each tile is a real `<button>` / link (≥24px, ≥44px coarse) that moves focus into the Worklist. The
end-caps give the human the *reference* ("8 waiting to start, 27 shipped") without re-listing what the
Worklist owns — killing the duplication while keeping the pipeline honest about its boundaries.

> **Removed from Pipeline mode entirely** (their card-rendering): `backlog-bar` cards + `backlog-add`,
> `done-folder` expandable list + `done-folder-toggle`/`done-folder-list`, `off-track-lane` grouped cards.
> Their *counts* survive as the end-cap numbers above.

---

## 4. The honest quiet / empty states (design these FIRST — Apex §3.4)

Most DART projects, most of the time, have 0 tickets mid-pipeline. The quiet Pipeline must be **calm,
honest, and useful — never a void, never padded to look busy.**

**State A — chain idle, work waits elsewhere** (`middleEmpty()` already computes this: every rendered stage
empty AND backlog/done/off-track non-empty):
- Render the chain as a **slim PENDING-PATH PREVIEW**: every stage node at `idle` density (marker +
  vertical stage name + `0`) joined by faint connectors — the shape of the pipeline-that-will-run (like a
  CI config preview before the first run). This is the ONE thing the quiet state adds over a blank: it
  teaches the workflow path. That justifies rendering the idle chain instead of nothing.
- Below the chain, the calm explainer (reuse the existing `rail-middle-empty` copy):
  *"No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them."* +
  a **`Switch to Worklist`** button (testid `pipeline-to-worklist`, reuse verbatim).
- The end-caps still show `From backlog · N →` and `Done · N →` so the human sees where the work is.

**State B — whole board empty** (`isEmpty()`): Pipeline mode is **SUPPRESSED** entirely. The existing
`board-empty` invitation owns the screen (*"No tasks yet — the team will create them as work starts."*) and
the view-switch is already hidden by the `@if (!isEmpty())` guard around the header. **Never render an empty
pipeline scaffold on a brand-new project.** No change needed beyond keeping the existing `isEmpty()` guard.

**State C — auto-default + manual choice** (already implemented — keep exactly):
- Pipeline **auto-selects only when `populatedStageCount() >= 2`** (`autoMode`). A single-stage/single-ticket
  project defaults to Worklist; it is never auto-defaulted into a near-empty pipeline.
- A manual `selectMode('pipeline')` is remembered per project (`chosenMode` + localStorage) and wins
  thereafter. When the user manually picks Pipeline with `< 2` stages populated, render the chain honestly
  (the one lit node, or the State-A preview) and always keep the `Switch to Worklist` escape.

---

## 5. Drill-in (read-only navigation; writes stay guarded)

- **Click a ticket card** (existing `card-open` button) → the existing `dart-task-detail` modal (its
  comment history is DART's analogue of CI console logs). Unchanged — `#cardTpl` carries it.
- **Click a stage node header** → open the most-actionable ticket's detail (same precedence as §2.4:
  first rejected-gate ticket, else first non-passed, else first). If the stage is empty, the header is not
  a click target (it's a preview marker).
- **Click a gate node** → open the governing ticket's detail at its gate panel (§2.4).
- **Card kebab → Advance** stays the guarded `ControlPlaneService.advance` write (unchanged). No drag —
  CI pipelines don't let you drag a build into "passed"; advance is a gated write.

All drill-in is **read-only navigation**; advance / gate-decide remain the existing guarded writes.

---

## 6. Dwell-time — "stuck N" signal (SHOULD, client-side for v1)

A per-ticket "stuck N" signal derived **best-effort, client-side** from the `kind:"advance"` comment
timestamps already on each ticket (`TicketComment` carries `kind`, `ts`, and `stage`).

- Add a pure helper `enteredCurrentStageAt(ticket): string | null` in `board.ts`: scan
  `ticket.comments`, take the newest `kind === 'advance'` comment whose `stage` equals the ticket's
  current `stage` (the moment it entered), return its `ts`; `null` if none.
- Render a small, **honestly-labelled** chip on the card or stage node when dwell exceeds a threshold:
  `<dart-glyph name="pending"/> stuck {{ humanizeSince(ts) }}` (e.g. "stuck 3d"). Tone `--kb-text-muted`
  (informational, NOT alarm — no fabricated urgency, per Apex honesty). Absent when the timestamp is
  unknown — never show a fabricated "moved 2h ago".
- **Label honesty:** the chip says "stuck" only from real advance timestamps; if comments are absent the
  signal is simply omitted. Do not interpolate dwell into the stage colour (keep §1.3 derivation pure).

> **Flag for `/be`:** if client-side folding proves noisy or comments are commonly trimmed, a tiny
> additive `enteredCurrentStageAt` projection in `state.js` (Jorge §1.2 item 1 — pure derivation from the
> existing advance log, zero new write, zero migration) is the cleaner home. Ship client-side for v1;
> migrate to the projection if `/be` confirms it's worth the parity test. **This is the only item that may
> touch the backend, and only as an optional follow-up.**

---

## 7. Responsive · a11y · motion · honesty

**Responsive (container query on the board's own width — reuse `container-name: board`):**
- **Wide:** the chain fills the width; nodes share slack, end-caps pinned. The whole point — it fills wide
  screens the Worklist can't.
- **Narrow (`@container board (max-width: 719px)`):** the chain **scrolls horizontally** — this is
  CONVENTIONAL for a pipeline (unlike the Worklist, which must never scroll). Keep `flex-wrap: nowrap` +
  `overflow-x: auto`; the end-caps may drop below the chain as full-width tiles. Do NOT stack stage nodes
  vertically — a pipeline reads left→right at every width.

**Accessibility (WCAG 2.2 AA):**
- The chain is `role="list"`; stage nodes + end-caps are `role="listitem"`. Keep the roving `←/→`
  (`onColumnKeydown` over `[data-col-index]`) — **extend `data-col-index` to the gate nodes + end-cap
  tiles** so keyboard focus traverses the whole chain.
- Each **gate node** is a `<button>` (≥24px, ≥44px coarse) with `aria-label` speaking name + state +
  action, e.g. *"ARCH_APPROVED gate, rejected, activate to review."*
- Each **stage node** has an `aria-label` (extend `stationLabel`) speaking the full picture:
  *"Stage architecture, /arch, 2 tasks, gate ARCH_APPROVED passed, running."*
- **Colour-additive guard (never colour-only):** strip all colour and the pipeline still reads — stage
  names, counts, gate state WORDS (`passed`/`pending`/`rejected`), the marker SHAPE
  (dot / solid-diamond / dashed-diamond distinguishes none/hard/soft), the broken connector's DASH +
  sever, and a status word. Stage-status colour sits on borders/markers (UI components, ≥3:1); all node
  text stays `--kb-text` / `--kb-text-muted` (≥4.5:1) — never tint a stage name or ticket title.
- Focus indicators: 2px outline, 3:1 contrast (reuse `--kb-focus-ring`).

**Motion (reduced-motion-safe via existing `--kb-dur-*`, zeroed in one place):**
- On advance, the **front advances**: the just-passed connector lights and the card arrives in the next
  node — reuse the existing `card-arrive` keyframe + the host `[data-motion]` attr. Under
  `prefers-reduced-motion: reduce` the state swaps instantly (the lit front jumps; `--kb-dur-*` → 0ms).
- A **rejected gate does NOT pulse or flash** (Apex honesty — no fake urgency): statically red + dashed +
  the word "rejected". No indeterminate shimmer anywhere. A pipeline at rest is still, not animated.

**Honesty (the through-line):** absent-not-zero everywhere (no `(0)` nodes beyond the on-path preview); no
fabricated greens; the SSE live update reflected (the board is a pure projection of `state` — a CLI agent's
advance re-lays the chain live, no reload); **no `[innerHTML]`** — all untrusted text (stage, owner, title,
gate name) interpolated + escaped only.

---

## 8. Test contract — keep + add

**Keep GREEN (the stable contract — do NOT break):**
- The whole **Worklist mode** and all its testids (it is untouched).
- `pipeline-root`, `board-live`, `board-project-cue`, `board-rollup`, `rollup-needs-you`,
  `view-mode-switch`, `view-mode-worklist`, `view-mode-pipeline` (the header + switch are shared).
- `board-empty` (State B suppression).
- `rail-middle-empty` + `pipeline-to-worklist` (the quiet state — reuse verbatim).
- The `#cardTpl` card contract: `card-<id>`, `card-open`, `card-menu`, `menu-advance`, `card-conflict`,
  `card-retry`, `card-error`, `chip-status`, `chip-gate`, `chip-needs-you`, `chip-label`, `data-status`,
  the roving `data-col-index` + `onColumnKeydown` contract, `prefers-reduced-motion` / `data-motion`.

**ADD (new pipeline testids):**
- `pipeline-flow` (the group), `pipeline-chain` (the scrolling list — supersedes `pipeline-train`/`-rail`).
- `stage-<stage>` per stage node, with `[data-stage-status]` + `[data-density]` + `[data-active]`.
- `gate-node-<stage>` per gate node, with `[data-shape]` (hard/soft) + `[data-gate-state]`
  (passed/pending/rejected).
- `flow-connector-<stage>` per connector, with `[data-state]` (passed/pending/broken).
- `pipeline-backlog-ref`, `pipeline-done-ref`, `pipeline-offtrack-ref` (the end-cap links).

**RETIRE (pipeline-mode internals being replaced — update their specs):** `pipeline-train`, `pipeline-rail`,
`backlog-bar`, `backlog-add`, `backlog-empty`, `column-stage-*`, `column-count`, `column-empty-*`,
`rail-node-*`, `done-folder`, `done-folder-toggle`, `done-folder-list`, `off-track-lane`,
`off-track-group-*`, `data-node`, `data-adaptive`, `data-seg`. **Coordinate the `pipeline-train` →
`pipeline-chain` rename with `/e2e` before landing** (it is a breaking testid change; the board component
spec exercises these pipeline internals heavily and will be rewritten alongside the visualization — the
Worklist-mode and shared-card assertions stay).

**TDD coverage `/fe` must write (failing-first):**
1. `stageNodeStatus` precedence — one needs-you/blocked ticket → `blocked` node; else in_progress →
   `running`; present-but-idle → `waiting`; empty-behind-front → `passed`; empty-ahead → `pending`. Must
   reuse `cardVisualStatus`.
2. `stageGateNode` roll-up — any rejected in-stage gate → `rejected`; any non-passed → `pending`; all
   passed/empty → `passed`; `passed/total` counts correct; `null` when no `col.gate`.
3. **Rejected HARD gate → `flow-connector` `data-state="broken"`; rejected SOFT gate → connector NOT
   broken** (the load-bearing honesty test).
4. Pipeline renders **no** backlog/done/off-track CARDS — only the three end-cap link tiles with the right
   counts (`pipeline-backlog-ref`/`-done-ref`/`-offtrack-ref`), each `selectMode('worklist')` on click.
5. Active-front: `activeSegment()` lights connectors/markers `<=` index `passed`, those `>` `pending`.
6. Quiet State A: `middleEmpty()` → idle pending-path preview + `rail-middle-empty` + `pipeline-to-worklist`
   escape, end-caps still shown. State B: `isEmpty()` → mode suppressed, `board-empty` only.
7. Colour-additive guard: every status node exposes glyph/shape + a state WORD (no colour-only path).
8. Dwell: `enteredCurrentStageAt` returns the newest matching-stage advance ts, `null` when absent; the
   "stuck N" chip is omitted when the ts is unknown.

---

## 9. ASCII MOCKS

Legend: `●` lit/running marker · `○` pending marker · `◇` hard gate (solid) · `⬦` soft gate (dashed) ·
`══` lit connector · `╌╌` BROKEN (rejected-hard) connector · `──` pending connector.

### 9.1 BUSY pipeline — multi-stage flow, one hard gate rejected (the view earning its place)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for payments-api      14 tasks · [need] 2 need you        View: ( Worklist )( • Pipeline )     │
│ ──────────────────────────────────────────────────────────────────────────────────────────────────────── │
│                                                                                                            │
│ ┌FROM BACKLOG┐  ┌─ architecture ──┐    ◇      ┌─ code_review ───┐   ╌╌╌    ┌─ qa ─────────┐   ○   ┌─DONE──┐ │
│ │[stack]     │  │ /arch  ◇ passed  │  ARCH    │ /rev  ◇ rejected │  CODE   │ /qa  ◇ pending│ verify│[check]│ │
│ │ 8 →        │══│ running · 2      │══ ●pass ══│ BLOCKED · 1     │ ✗reject │ running · 3  │── ○ ──│ 27 →  │ │
│ │(→Worklist) │  │ ┌────────────┐   │  green   │ ┌────────────┐  │  RED    │ ┌──────────┐ │ pend  │(→Work)│ │
│ │            │  │ │ADT-12 SSE  │   │  edge    │ │ADT-30 Auth │  │  edge   │ │ADT-41    │ │       │       │ │
│ │            │  │ │/be ●in prog│   │          │ │/rev ✗need  │  │ BROKEN  │ │ADT-42    │ │       │       │ │
│ │            │  │ ├────────────┤   │          │ │stuck 2d    │  │  here   │ │ADT-43    │ │       │       │ │
│ │            │  │ │ADT-15 Auth │   │          │ └────────────┘  │         │ └──────────┘ │       │       │ │
│ │            │  │ │/be ●in prog│   │          │                 │         │              │       │       │ │
│ │            │  │ └────────────┘   │          │                 │         │              │       │       │ │
│ └────────────┘  └──────────────────┘          └─────────────────┘         └──────────────┘       └───────┘ │
│   [warning] 1 off-track →   (links to the Worklist's off-track shelf — no cards drawn here)                 │
│                                                                                                            │
│  Read in <2s: green up to architecture (passed) → blue running → RED at code_review (a hard gate rejected, │
│  the line is BROKEN there: THAT is the wall, ADT-30 stuck 2d) → qa running ahead on 3. Bottleneck is spatial.│
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 QUIET pipeline — work waits in backlog/done (State A — the honest at-rest preview)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for ai-dev-team       12 tasks · (no needs-you chip — all clear)   View: ( Worklist )( • Pipe)│
│ ──────────────────────────────────────────────────────────────────────────────────────────────────────── │
│                                                                                                            │
│ ┌FROM BACKLOG┐  ○──── ◇ ──── ○ ──── ⬦ ──── ○ ──── ◇ ──── ○ ──── ○         ┌─DONE──┐                        │
│ │[stack]     │  vision  ARCH  arch   SEC  design  code_r  qa  verify       │[check]│                        │
│ │ 3 →        │   0      ◇·    0      ⬦·    0       ◇·     0    0            │ 9 →   │                        │
│ │            │                                                              │       │                        │
│ └────────────┘  └──────────── the path your work will take (idle) ───────┘ └───────┘                        │
│                                                                                                            │
│        No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them.            │
│                                      [ Switch to Worklist ]                                                 │
│                                                                                                            │
│  Honest: the pipeline is at rest. The chain previews the workflow path; the end-caps say where the work    │
│  actually is (3 queued, 9 shipped). NOT a void — a calm preview + a pointer. Never padded to look busy.     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 NARROW width — the chain scrolls horizontally (conventional for a pipeline)

```
┌───────────────────────────────────────────┐
│ Tasks · 14 · 2 need you   ( WL )( • Pipe ) │
│ ───────────────────────────────────────── │
│ ┌FROM BACKLOG · 8 →┐                       │
│ └──────────────────┘                       │
│ ┌─ architecture ──┐  ◇   ┌─ code_review ─┐ │
│ │ /arch  running 2│ ●══  │ /rev BLOCKED 1│⟩│  ← chain scrolls →  (qa · DONE off-screen right)
│ │ ┌────────────┐  │ pass │ ┌───────────┐ │ │
│ │ │ADT-12 SSE  │  │      │ │ADT-30 Auth│ │ │
│ │ │/be ●in prog│  │      │ │✗ stuck 2d │ │ │
│ │ └────────────┘  │      │ └───────────┘ │ │
│ └─────────────────┘      └───────────────┘ │
│ ⟨ scroll the pipeline → ⟩                   │
│ ┌Done · 27 →┐  [warning] 1 off-track →      │  ← end-caps drop below as full-width tiles
│ └───────────┘                               │
└───────────────────────────────────────────┘
```

---

## 10. Handoff summary for `/fe`

This is **additive over the existing Pipeline block** — it re-purposes the train skeleton, it does not
rewrite the board or the Worklist.

1. Keep Worklist mode 100% untouched (its tests stand). All change is inside `@case ('pipeline')`.
2. Drop the card-rendering of Backlog / Done-folder / Off-track in Pipeline mode; replace with the three
   end-cap link tiles (count + `selectMode('worklist')`).
3. Add two pure helpers to `board.ts`: `stageNodeStatus(col, activeIndex, ci)` (reduce `cardVisualStatus`)
   and `stageGateNode(col)` (roll up the governing gate). Add `enteredCurrentStageAt(ticket)` for dwell.
4. Render the chain: stage nodes (3 densities) + gate nodes on connectors + lit active front; the
   rejected-hard-gate broken connector is the centrepiece honesty.
5. Quiet State A = idle pending-path preview + reused `rail-middle-empty` + escape; State B suppressed;
   keep the `populatedStageCount >= 2` auto-default + persisted manual choice.
6. No new write path — gate nodes + card kebabs route through existing `advance` / task-detail writes.
   No drag.
7. Coordinate the `pipeline-train` → `pipeline-chain` testid rename with `/e2e`; add the new pipeline
   testids; keep the shared header/switch/card/quiet-state testids green.
8. TDD per §8. Dwell-time client-side for v1; flag the optional `/be` projection if folding is noisy.

**Status: DESIGN_APPROVED** — `/fe` may implement from this spec.
