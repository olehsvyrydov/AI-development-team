# Tasks view — fundamental redesign (UI/UX lens)

**Author:** Aura (`/ui`) · Senior UI/UX Design Architect
**Type:** Design proposal — **no code, no gate.** Decision-ready direction to brief `/fe` later, after the product + architecture lenses converge.
**Date:** 2026-06-13
**Stack constraint:** Angular 21, standalone, OnPush. **Inline-SVG `dart-glyph` only — no icon library, no icon font, no exotic Unicode (tofu).** Dark-first, `--kb-*` tokens only, WCAG 2.2 AA, reduced-motion-safe, untrusted text (id/title/stage/owner/label) **interpolated only — never `[innerHTML]`**.
**One of five parallel investigations** into how the Tasks view should be fundamentally redesigned; this is the **UI/UX lens**.
**Supersedes (in intent):** `conditional-workflow/tasks-adaptive-aura.md` (the "compact-train" tweak). That spec correctly diagnosed the empty-column scroll and shrank empty stages to thin nodes — but it kept the **stage rail as the centre's primary structure**, so for the common coarse-lifecycle case the middle is still a row of `0`-stations over a dead band. This proposal moves **beyond** presentational shrinking to a **structural** answer: the centre shows the *actual work*, and the stage pipeline becomes a secondary mode you opt into when work is genuinely flowing.

---

## 0. The problem, stated as a layout failure

The board's central region is **structured by workflow STAGE** (vision → security → … → done). But a ticket's *position in the stage pipeline* is only meaningful for tickets that are **mid-pipeline** — and in the real, common case almost no ticket is. Tickets cluster in **coarse LIFECYCLE states**:

- **Backlog** (un-started) → already pulled into the left panel,
- **Done** (finished) → already collapsed into the Done folder,
- **Off-track** (stranded) → already in the right panel.

So the thing the centre is built to show — *which mid-pipeline stage each ticket sits at* — is **empty for the common case**. The centre is structurally, not accidentally, empty: a thin row of `0` stations at the top, the Done folder floating, and one apologetic "No tasks are mid-pipeline" line at the bottom of a vast black void on a wide screen. The compact-train tweak removed a scrollbar; it did **not** give the centre anything to *be*.

**The root cause is the choice of primary axis.** Stage-as-primary-structure only pays off when tickets are distributed across stages. When they're distributed across *lifecycle states* instead, the primary axis must be **the work itself**, with stage demoted to a secondary lens. A view that is genuinely adaptive must adapt *its organising principle*, not just its column widths.

---

## 1. Core idea — "Work-first centre, pipeline on demand"

**The centre always shows the actual work as real cards, grouped by what the operator needs to act on — never by an empty stage scaffold.** The workflow pipeline is preserved, but as a **secondary, opt-in view mode** that is only the default when work is genuinely mid-flow.

Two mechanisms make this adaptive at every width and for both realities:

### 1a. A view-mode the board picks for you (and you can override)

A small **segmented control** at the top of the board offers two modes:

| Mode | What the centre is | Default when |
|---|---|---|
| **Focus** (work-first) | A dense, useful grid of the *actual tickets* grouped into **Needs you → In flight → Waiting → Recently done**, each a real card. Fills the width with a responsive multi-column card grid. | the pipeline is mostly empty (≤1 stage populated) — i.e. the **common coarse-lifecycle case** |
| **Pipeline** (stage board) | The adaptive metro train from `tasks-adaptive-aura.md` — stage stations, populated stages expanded — for reading *where work has reached*. | ≥2 stages are simultaneously populated — i.e. work is **genuinely flowing** |

The board **chooses the sensible default from the data** (the `middleEmpty` / populated-stage-count signal already computed in `board.ts`), then lets the operator switch. The mode is a `signal`, persisted per project in `localStorage` so a power user who lives in Pipeline keeps it. **Crucially: there is no mode in which the centre is empty.** Focus fills with cards; Pipeline only becomes the default when it has stations to populate.

### 1b. The centre is always the work, the sides always support it

In **both** modes the region model is the same four-part frame the board already has — Backlog (left), centre, Done (terminus), Off-track (right) — but the **centre's content swaps** by mode. The sides are *not* the work; the centre *is*. This kills the "Done folder floating in a void" problem: the void is gone because the centre is full of cards.

> **Why this kills the dead centre.** In the common case the operator opens Tasks and immediately sees, centre-stage and full-width, the *3 tickets that exist* — the one that needs them first, then what's in flight, then what just shipped — as scannable cards. They never see an empty stage scaffold. In the flowing case, they get the train. The view adapts its *structure*, so the centre is meaningful at every distribution of work and every width.

---

## 2. The Focus mode (the common-case default) — region + grouping model

Focus mode treats the centre as a **single adaptive card surface**, organised by **lifecycle band**, not stage. Each band is a labelled section; bands with zero cards are **absent** (absent-not-zero), so the surface only ever shows real work and never a row of empty headers.

### 2.1 The bands (in priority order)

| Band | Source signal | Why it leads | Absent when |
|---|---|---|---|
| **Needs you** | `ticketNeedsYou(t)` / `taskSummary.byStatus.needsYou` | The single most actionable thing — the reason to open the view. Always first, always most prominent (warning-toned header, `need` glyph + count). | no ticket needs the human |
| **In flight** | `status === 'in_progress'` | What the team is actively moving. The "is anything happening" read. | nothing in progress |
| **Waiting** | `status === 'waiting'` (and blocked, sub-grouped) | Parked work — awaiting an owner or a gate. Calm, secondary. | nothing waiting |
| **Recently done** | `status === 'done'`, most-recent first, **capped at ~6** with a "see all in Done →" link to the Done folder | A satisfying "what just shipped" without letting Done dominate. | nothing done |

Backlog stays in the **left panel** (un-started work is a holding pen, not an active band) and the full Done set stays behind the **Done folder** (Recently-done is just a teaser of it). So Focus mode's centre is exactly the *active* middle of a ticket's life — which is precisely what's missing today.

### 2.2 The card grid — how it fills the width adaptively

Each band lays its cards in a **responsive auto-fill grid**, not a single column:

```css
.band__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--kb-space-3);
}
```

- On a **wide** screen, `auto-fill` packs 3–5 cards per row → a 3-ticket project fills the first row and the surface reads as a calm, full-width board, **never a void**.
- As width shrinks the columns reflow to 2, then 1 — fluid, no breakpoint cliffs, no horizontal scroll ever.
- The card is the **same card** the board already renders (id · title · owner · status chip · gate chip · needs-you chip · label chips · kebab with Advance) — one card design across Focus, Pipeline, Backlog, Done. **No new card.**

This is the literal answer to "no adaptive width for tasks": the work itself flows to fill the available columns at any width, because it's a grid of real cards, not a fixed scaffold of stage columns.

### 2.3 Stage as a secondary lens, not the structure

In Focus mode a ticket's **stage is shown on its card** as a quiet chip (`{stage}` with the gate-shape node glyph) — so you don't lose "where is it in the pipeline," you just don't *organise the whole centre* around it. A **"Group by: Status ▾ / Stage ▾ / Owner ▾"** control lets a user re-group the same cards by stage (which becomes a lightweight, populated-only list — empty stages simply don't appear as groups) or by owner. Stage-grouping here is *populated-only* (it lists the stages that have cards), so it never reintroduces the empty-scaffold problem.

---

## 3. The Pipeline mode (the flowing-case default) — the adaptive train, kept

When ≥2 stages are populated, Pipeline mode is the default and the centre is the **adaptive metro train** already specified in `tasks-adaptive-aura.md` and partly shipped: empty stages collapse to thin **stations** on a continuous track; populated stages **expand** to real columns that flex-grow to share the width; Done is the terminus folder; Off-track is the right panel. That spec's §2–§9 (station model, track line, keyboard parity, test contract) **carry forward unchanged** — this proposal *adds the mode switch around it*, it does not discard it.

The one refinement: when Pipeline mode is entered but the middle is actually empty (e.g. the operator manually switched to it on a coarse-lifecycle project), the centre shows the **calm idle explainer + a "Switch to Focus" affordance**, so even the "wrong mode" never strands the operator in a void — it offers the way back.

---

## 4. ASCII mocks

### 4.1 (a) Empty-middle COMMON case — WIDE screen — Focus mode (the reported failure, fixed)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for ai-dev-team        3 tasks · [need] 1 need you        View: ( • Focus )( Pipeline )  Group: Status ▾ │  header + mode switch
│                                                                                                            │
│ ┌─ BACKLOG ─┐  ┌──────────────────────── THE WORK (centre — fills width, a card grid) ─────────────────┐  ┌─ DONE ─┐│
│ │ [stack] 2 │  │ [need] NEEDS YOU (1)                                                                   │  │ ╔════╗ ││
│ │ ┌───────┐ │  │ ┌──────────────────┐                                                                   │  │ ║[▣] ║ ││
│ │ │ADT-7  │ │  │ │ ADT-22           │   ← real card, warning-edged: the one thing waiting on the human   │  │ ║×30 ║ ││
│ │ │idea   │ │  │ │ Approve security │                                                                   │  │ ║Done║ ││
│ │ │/po    │ │  │ │ /you · [need]    │                                                                   │  │ ╚════╝ ││
│ │ ├───────┤ │  │ │ stage: security ◆│                                                                   │  └────────┘│
│ │ │ADT-9  │ │  │ └──────────────────┘                                                                   │           │
│ │ │idea   │ │  │                                                                                        │           │
│ │ │/ba    │ │  │ [progress] IN FLIGHT (1)                                                               │           │
│ │ └───────┘ │  │ ┌──────────────────┐                                                                   │           │
│ │ [+ soon]  │  │ │ ADT-18           │   ← in-progress card, accent status chip                          │           │
│ └───────────┘  │ │ Wire SSE channel │                                                                   │           │
│                │ │ /be · [progress] │                                                                   │           │
│                │ │ stage: backend ● │                                                                   │           │
│                │ └──────────────────┘                                                                   │           │
│                │                                                                                        │           │
│                │ [check] RECENTLY DONE (1)                                              see all in Done →│           │
│                │ ┌──────────────────┐                                                                   │           │
│                │ │ ADT-30  Add board│  /fe · [check] done                                               │           │
│                │ └──────────────────┘                                                                   │           │
│                └────────────────────────────────────────────────────────────────────────────────────────┘           │
│   ← the centre is FULL of the actual 3 tickets, as cards, grouped by what needs action. NO empty stage scaffold,      │
│     NO dead void, NO horizontal scrollbar. On a wider screen each band's grid packs more cards per row.               │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [warning] Off-track (0 → absent)                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

On a genuinely wide monitor, each band is a `repeat(auto-fill, minmax(16rem,1fr))` grid, so e.g. a Needs-you band with 4 tickets shows 4 across; the surface breathes, it never voids.

### 4.2 (b) Populated-pipeline case — WIDE screen — Pipeline mode (work is flowing)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for payments-api      14 tasks · [need] 2 need you      View: ( Focus )( • Pipeline )          │  header + mode switch
│                                                                                                            │
│ ┌─ BACKLOG ─┐  ┌─────────────────────── THE TRAIN (stations + expanded columns) ──────────────────┐  ┌─ DONE ─┐│
│ │ [stack] 4 │  │  ●   ●   ┌─●architecture (2)─┐  ●   ┌─◇code_review (1)─┐  ●  ┌─●qa (3)──┐  ●       │  │ ╔════╗ ││
│ │  …cards…  │  │ visn sec │ ADT-12 in prog…   │ desn│ ADT-30  [need]   │ d-qa│ ADT-41   │ reli     │  │ ║×27 ║ ││
│ │           │  │  0   0   │ /be  [need]       │  0  │ /rev  gate dashed│  0  │ /qa      │  0       │  │ ╚════╝ ││
│ │           │  │          │ ADT-13            │     └──────────────────┘     │ ADT-42   │          │  └────────┘│
│ │           │  │          └───────────────────┘                             │ ADT-43   │                 │
│ │           │  │   ↑compact   ↑EXPANDED          ↑compact   ↑EXPANDED   ↑comp └──────────┘                 │
│ └───────────┘  └──────────────────────────────────────────────────────────────────────────────────┘           │
│   Populated stages grow (max 24rem) + share slack; the empty stages stay thin stations on the track. Fits,       │
│   no scroll. The active-segment accent runs along the track to the furthest in-progress station.                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Narrow (<720px) — Focus mode stacks; sides become disclosures

```
┌───────────────────────────────────┐
│ [info] Tasks · ai-dev-team         │
│ View: ( • Focus )( Pipeline )      │
│ ▸ Backlog (2)        ▸ Done (30)   │  ← sides collapse to disclosures
│ ───────────────────────────────── │
│ [need] NEEDS YOU (1)               │
│ ┌───────────────────────────────┐ │  ← one column; cards full-width
│ │ ADT-22  Approve security      │ │
│ │ /you · [need] · stage security│ │
│ └───────────────────────────────┘ │
│ [progress] IN FLIGHT (1)           │
│ ┌───────────────────────────────┐ │
│ │ ADT-18  Wire SSE channel      │ │
│ │ /be · [progress]              │ │
│ └───────────────────────────────┘ │
│ [check] RECENTLY DONE   see all → │
│ ┌───────────────────────────────┐ │
│ │ ADT-30  Add board             │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

---

## 5. Adaptive behaviour across widths (both modes)

The board's **own width** (it sits inside the app shell, narrower than the viewport) drives a **container query** (`container-type: inline-size` on the board root), never a viewport media query.

| Width | Focus mode | Pipeline mode | Sides |
|---|---|---|---|
| **Wide ≥ 1100px** | bands as multi-column card grids (`auto-fill minmax(16rem,1fr)`) → cards pack to fill; centre never voids | stations compact, populated expand, fills width, no scroll (common case) | Backlog 13rem L · Done 9rem terminus · Off-track 15rem R (when present) |
| **Medium 720–1099px** | grids reflow to 2 columns; bands stack | same adaptive train; expanded columns shrink toward 13rem; scroll only if many populated | Off-track drops below as full-width lane |
| **Narrow < 720px** | bands stack; each card full-width; sides become `▸ Backlog (n)` / `▸ Done (n)` disclosures above/below | populated stages become full-width sections; compact stations a tap-to-expand strip | all sides full-width disclosures |

**Invariant at every width and mode:** the centre is filled by *real cards* (Focus) or *real expanded columns + the track* (Pipeline). Empty stage min-widths never force horizontal scroll; the work reflows to the available columns.

---

## 6. Empty-state honesty (absent-not-zero, calm-not-broken)

Three honest layers, escalating from "there's work, just not here" to "nothing anywhere":

1. **A band with zero cards is absent.** Focus mode never renders an empty "In flight (0)" header — the band simply isn't there. Only bands with real cards appear, so the surface is always truthful and never a grid of zero-headers.
2. **Pipeline mode, manually entered on an idle project:** the calm idle explainer (Apex's words: *"No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them."*) **plus** a quiet *"Switch to Focus"* button — so the "wrong mode" is recoverable, never a void.
3. **Whole-board empty (nothing in Backlog, centre, Done, Off-track):** the existing shipped state stays verbatim — *"No tasks yet — the team will create them as work starts."* The mode switch and bands are suppressed; this single honest invitation owns the screen.

Every count is a real count (`needsYou` from the canonical `taskSummary`, band counts from the partition). Never a fabricated zero. The "Recently done (6 of 30)" teaser is honest about being a teaser — the *"see all in Done →"* link is the truth that the folder holds the rest.

---

## 7. Accessibility (WCAG 2.2 AA) + reduced motion

- **Mode switch** is a `role="radiogroup"` ("View"), each option a radio with a visible text label (Focus / Pipeline) + a glyph — **never colour or position alone**; the active option has the 2px focus ring on focus and `aria-checked`. Persisted choice is restored on load.
- **Group-by** control is a labelled native `<select>` (or a `role="listbox"`), keyboard-complete.
- **Focus-mode bands** are `<section>`s with an `<h3>` heading (`Needs you`, `In flight`, …) so a screen-reader user can jump band-to-band; the card grid is a `role="list"` of `role="listitem"` cards (unchanged from today's card list semantics). Reading order: Needs you → In flight → Waiting → Recently done.
- **Roving focus / keyboard:** within a band, arrow keys move between cards; `Tab` moves between bands' first card. Pipeline mode keeps its existing roving `←/→` across stations (`data-col-index`). No interaction is mouse-only.
- **Cards** keep their current keyboard contract (open on `Enter`/`Space`, kebab `role="menu"` with Advance). **No drag** anywhere — advance stays the guarded, routed control-plane write (gate honesty is structural).
- **Targets ≥ 24px (≥ 44px under `pointer: coarse`)** on mode radios, group-by, disclosures, cards, kebabs, the Done folder.
- **Contrast:** band headings + counts ≥ 4.5:1 (text); the needs-you warning edge + status accents ≥ 3:1; the mode-switch active state distinguished by fill **and** the checked glyph, ≥ 3:1, never hue-only.
- **Reduced motion (`prefers-reduced-motion: reduce`):** mode switches, band reflow on a live SSE push (FLIP), card-arrive, and the active-segment accent all read the existing `--kb-dur-*` / `--kb-ease-*` tokens, zeroed in one place under the media query → instant state swaps. No status is carried by motion; the chip + count + heading carry it.
- **Untrusted text** (id, title, stage, owner, label, error) — **interpolation only, never `[innerHTML]`** (`no-unsafe-binding` stays green). Every wireframe symbol resolves to an existing `dart-glyph` (`stack`, `info`, `need`, `agent`, `check`, `progress`, `dot`, `blocked`, `warning`, `advance`, `folder-stack`, `kebab`, `label`, plus the inline rail-node SVGs) — `no-tofu-glyphs` stays green. **No net-new glyph required.**
- **`aria-live`:** mode change announces politely ("Focus view" / "Pipeline view"); the existing board re-layout "Board updated" `polite` cue is kept; needs-you band count increments announce politely.

---

## 8. The data dependency I must flag (for the architecture lens)

The most valuable Focus-mode signal is a **"Recently moved / recently done" ordering** — *what changed since I last looked*. But `TicketView` today carries **no timestamp** (`id, title, status, stage, track, assignee, expectedOwner, gates, comments, description, labels` — and `comments[].ts` is the only time field, an unreliable proxy). So:

- For v1, **"Recently done" is ordered by the ledger's existing ticket order** (best-effort, honestly labelled "Recently done" not "Last 24h"), capped at ~6, with the *"see all in Done →"* truth-link. No fabricated "moved 2h ago" timestamps.
- A clean implementation wants a **per-ticket `updatedAt` (or `movedAt`) field** on `TicketView` / a derived "recently changed" list in `taskSummary`. That is an **architecture/backend question**, not a UI one — I've designed Focus mode to *degrade honestly* without it, but it would make the "what changed" band genuinely valuable.

Everything else (the partition into Needs-you / In-flight / Waiting / Done, the populated-stage count that picks the default mode) is **already derivable from the shipped `board.ts` projection + `taskSummary`** — no new endpoint.

---

## 9. Alternative direction (1) — "Adaptive single board: promote the populated lanes"

*If the product lens rejects an explicit mode switch* (one fewer control to learn), here is the alternative I'd back:

**A single board with no mode toggle that auto-collapses the empty stage scaffold and promotes whichever regions actually hold work to fill the centre.** The stage pipeline is rendered *inline* but only ever takes the width its **populated** stages need; the freed space is filled by promoting **Needs-you** and **In-flight** card groups to the front of the centre. Concretely:

- The centre is ordered **Needs-you band → In-flight band → the (adaptive) stage train → Recently-done teaser**. When the train is empty, it collapses to a single thin "pipeline at rest" strip and the card bands above expand to fill; when the train is busy, it grows and the bands shrink to just their headers + counts (click to expand).
- This is "one board that re-weights itself by where the work is," rather than two modes. It's **less to learn** but **more to lay out correctly** (two organising principles coexisting on one surface risks a busy, dense centre on a flowing project), and it gives the operator **no manual control** over which lens they get.

**Why I prefer the primary (mode-switch) direction:** it keeps each mode *clean and single-purpose* (Focus is purely cards; Pipeline is purely the train), gives the operator agency (a power user can pin Pipeline), and the auto-default means most users never touch the switch — they just get the right view. The alternative is a good fallback if "another control" is judged too heavy.

---

## 10. Open question for the product / architecture lenses

**Is the centre's primary organising axis a product decision the operator should control (mode switch, §1a), or should the board pick one principle and self-weight (§9) — and does a per-ticket `updatedAt`/`movedAt` field (§8) get added so "what changed since I looked" can be a first-class band?**

This is load-bearing: it decides whether Tasks is "one adaptive board" or "two clean modes," and whether the most useful daily signal ("what just moved") is real or a best-effort order. The UI degrades honestly either way, but the *ceiling* of how useful the centre can be depends on the architecture lens answering the timestamp question and the product lens ruling on mode-switch vs self-weighting.

---

## 11. Stable test contract (do not break)

The redesign is **additive over the existing projection** — it adds a mode signal and a Focus card-grouping, and reuses the existing card. Keep green:

- The board's four-region order in Pipeline mode (`backlog-bar` → `pipeline-rail` → `done-folder` → `off-track-lane`) — Pipeline mode is exactly today's board, so its tests stand.
- `card-*`, `chip-*`, `menu-*` testids — the same card renders in both modes.
- `board-empty` whole-board-empty state — unchanged.
- The `tasks-adaptive-aura.md` station contract (`column-stage-*`, `rail-node-*`, `data-state`, roving `←/→`) — Pipeline mode inherits it.

**New, additive:** `data-testid="view-mode-switch"` (radiogroup) with `view-mode-focus` / `view-mode-pipeline`; `data-testid="focus-band-{needs-you|in-flight|waiting|recently-done}"` per rendered band; `data-testid="focus-group-by"`. Tests to add: (1) coarse-lifecycle state defaults to Focus and renders the work as cards, no empty stage scaffold; (2) ≥2 populated stages defaults to Pipeline; (3) a zero-count band is absent; (4) switching mode persists and the centre swaps; (5) the Focus centre never horizontally overflows at ≥1100px.

> **Gate:** none requested — this is a design proposal feeding a five-lens investigation. `DESIGN_APPROVED` is **not** recorded here; it fires when the product/architecture lenses converge and this is scoped into a ticket and handed to `/fe` under TDD.
