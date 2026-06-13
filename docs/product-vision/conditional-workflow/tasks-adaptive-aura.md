# Tasks board — the adaptive "train" (compact stations + expanded columns)

**Author:** Aura (`/ui`) · Senior UI/UX Design Architect
**Type:** Focused design spec — **no code, no gate.** A decision-ready, implement-directly spec for `/fe` (Finn).
**Date:** 2026-06-13
**Stack constraint:** Angular 21, standalone, OnPush. **Inline-SVG glyphs only — no icon library, no icon font, no exotic Unicode (tofu).** Dark-first, `--kb-*` tokens only, WCAG 2.2 AA, reduced-motion-safe, untrusted text **interpolated only — never `[innerHTML]`**.
**Refines:** `redesign-home-tasks-knowledge-aura.md §2` (the original train concept) + `usability-home-tasks-knowledge-apex.md §2` (mental model + microcopy — Apex owns the words). This spec adds the **one missing thing**: true adaptive width so the train fits the central area instead of scrolling through empty stages.
**Touches:** `studio/cockpit/src/app/shell/tasks-board.component.ts` (template + CSS). `board.ts` projection is **unchanged** — this is presentational chrome only.

---

## 0. The problem, precisely (root cause)

Today the board is the right four regions in the right order — `[.backlog 12rem fixed] [.rail flex:1 1 0; overflow-x:auto] [.done 9rem fixed] [.offtrack 15rem fixed]` — but the **rail's columns can't adapt**:

```css
.rail { flex: 1 1 0; min-width: 0; overflow-x: auto; }
.col  { flex: 1 1 12rem; min-width: 11rem; max-width: 22rem; }   /* ← the bug */
```

Every stage column — **empty or populated alike** — claims a `min-width: 11rem` floor. A `full` track has ~11 stages (vision · security · architecture · design · approval_gate · tdd · code_review · design_qa · qa · reliability · verify · done). 11 columns × 11rem = **121rem of minimum content** inside a rail that is maybe 50–70rem wide on a normal screen → the rail can never fit → `overflow-x:auto` kicks in → the operator **scrolls horizontally through 8 mostly-empty columns** to reach the 2–3 that hold work. For *this* project (most tickets in backlog/done/off-track, coarse lifecycle), the centre is almost entirely empty — so the board reads as a wide, empty, scrolling band. That is the "not adaptive" the user reports.

**The fix is one idea:** an empty stage must **not** claim a full column's width. It collapses to a thin **station node** on the rail; only a **populated** stage **expands** to a real column. Then 11 stations + 2–3 expanded columns fit the centre with room to spare, and horizontal scroll becomes the rare fallback (many stages populated at once) instead of the default.

This is exactly the **metro/train** metaphor the user invoked: a line of stations, most of them just a marker you pass, a few of them platforms where work is actually standing.

---

## 1. The region grid (unchanged in spirit, corrected in width)

The board stays a **single horizontal flex row** of four regions in order. Only the rail's internal model changes.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for ai-dev-team        3 tasks · [need] 1 need you          [◂] [▸]               │  header (kept)
│                                                                                                │
│ ┌─ BACKLOG ─┐  ┌────── THE TRAIN (rail) — fills remaining width, adapts ─────────┐  ┌─ DONE ─┐ ┌ OFF ┐│
│ │ fixed 13rem│  │ stations (compact) ── expand only where work stands           │  │ fixed  │ │fixed││
│ │            │  │                                                                │  │ 9rem   │ │15rem││
│ └────────────┘  └────────────────────────────────────────────────────────────────┘  └────────┘ └─────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
   flex:0 0 auto      flex:1 1 0 · min-width:0 · (scrolls ONLY when truly full)        0 0 auto   0 0 auto
```

| Region | `data-testid` (keep) | Flex | Width | Notes |
|---|---|---|---|---|
| **Backlog** | `backlog-bar` | `0 0 auto` | `13rem` (was 12) | Left holding pen; scrolls vertically within. Sized so it doesn't dominate (see §3). |
| **Train (rail)** | `pipeline-rail` | `1 1 0` · `min-width:0` | fills the gap | The adaptive part. Stations compact; populated stages expand. |
| **Done** | `done-folder` | `0 0 auto` | `9rem` | Train terminus / end-station folder. Unchanged. |
| **Off-track** | `off-track-lane` | `0 0 auto` | `15rem` | Right panel, present only when non-empty. Unchanged framing. |

The four are **direct children of `.train`** in that exact order (an existing test asserts this — keep it). Done and Off-track are only *fixed* (never grow), so the rail always gets the slack.

---

## 2. The adaptive rail — the station model (the core of this spec)

The rail is a horizontal flex row of **one node per rendered stage, in order**, joined by a connecting line (the "track"). Each stage renders in **one of two states**, chosen by whether it holds tickets:

### 2.1 The two station states

```
   compact station (empty)              expanded column (populated)
   ┌──────┐                             ┌───────────────────────┐
   │  ●   │   ← node marker             │ ● architecture   (2)  │ ← node + name + owner + count
   │vision│   ← stage name (vertical    │ ┌───────────────────┐ │
   │  0   │     or truncated)           │ │ ADT-12  in prog…  │ │ ← real task cards
   └──────┘                             │ │ /be  [need]       │ │
   ~2.5rem wide                         │ ├───────────────────┤ │
                                        │ │ ADT-21            │ │
                                        │ └───────────────────┘ │
                                        └───────────────────────┘
                                        flexes 14–22rem
```

| | **Compact station** (empty stage) | **Expanded column** (populated stage) |
|---|---|---|
| **When** | `col.tickets.length === 0` | `col.tickets.length > 0` |
| **Flex** | `flex: 0 0 auto` (never grows; takes only its content) | `flex: 1 1 14rem` (grows to share slack) |
| **Width** | `width: 2.5rem` (the node lane); `min-width: 2.5rem` | `min-width: 13rem; max-width: 24rem` |
| **Shows** | the rail node + a **vertical** (or clamped) stage name + the count `0` (muted) | node + stage name (horizontal) + owner chip(s) + count + the task cards |
| **Cards** | none (no empty-card placeholder — the node *is* the placeholder) | the `col__cards` list, as today |
| **Peek** | hover/focus reveals a tooltip/popover "{stage} · empty · {owner}" (§2.4) | n/a — it's already showing |
| **`data-testid`** | `column-stage-{stage}` **kept** (so tests still find every stage) | `column-stage-{stage}` (unchanged) |
| **`data-state`** | `compact` (new attr, for CSS + tests) | `expanded` (new attr) |

**Why this fits:** with N stages of which P are populated, the rail needs `P × ~16rem + (N−P) × 2.5rem`. For this project (P≈0–1 in the middle band, N≈9 middle stages) that's ~24rem — fits a 50rem rail trivially, **no scroll**. Even P=3 populated + 6 compact = ~55rem, still fits a wide rail. Scroll only appears when ~4+ stages are simultaneously populated *and* the viewport is narrow — the genuinely-busy case, where scroll is honest.

### 2.2 The rail node (kept, unchanged shapes)

Each station keeps its existing **`rail__node`** with `data-node` ∈ `none | gate-hard | gate-soft` (and `terminal` on Done), shaped by gate hardness — dot / solid diamond / dashed diamond. `data-active` still lights the node up to the furthest in-progress stage (the active-segment accent). **No change to `nodeKind()` or `activeSegmentIndex()`.** The node sits at the **top of the column** in the expanded state (as today) and is the **centre of the compact station** in the compact state.

### 2.3 The connecting track (the "train track" — refinement)

To read as a *train* and not a row of gaps, draw a continuous **1.5px rail line** behind the nodes across the whole rail (compact + expanded headers aligned to a common baseline). The segment from the first node to the **active** node is `--kb-accent`; the rest is `--kb-border`. Implementation: a `::before` line on `.rail` (or on a `.rail__track` element) at the node-row's vertical centre, `z-index` below the nodes. This is presentational; it carries no state alone (the node `data-active` + the per-card status chips carry "where work reached"). Contrast ≥ 3:1 for both line tones.

### 2.4 Peeking and expanding an empty station

A compact station is **not dead** — the operator can inspect or open it:

- **Hover / focus** → a small popover (or native `title` + an `aria` description) shows: `{stage} · 0 tasks · {owner} · {gate kind}`. This is the "what is this thin station?" answer without permanently spending width. Popover dismiss on blur/Escape.
- **Click / `Enter` / `Space` on a compact station** → it **expands in place** to show its (empty) column with the calm empty line "Nothing in this stage." and any stage metadata, and a quiet "← collapse" affordance. This is the manual override for "I want to see this stage as a column even though it's empty." A second activation re-collapses. Track the expanded-station id in a signal (e.g. `peekedStage`); it overrides the auto-compact for that one station. (Optional for v1 — hover-peek alone satisfies the requirement; click-expand is the enhancement.)
- A compact station stays a **roving-focus stop** (`tabindex`, `data-col-index`) so `←/→` still walk *every* stage, compact or not (keyboard parity — §6).

### 2.5 Keeping empty stages from vanishing (honesty)

Empty stages **must still render** (as compact stations) — the rail must show the *whole* pipeline, so the operator sees the shape of the workflow even when the middle is idle. This is the opposite of hiding empties: we **shrink** them, we never **drop** them. The `column-empty-{stage}` line still exists in the DOM of a compact station's (collapsed) body for tests and screen readers, but is visually represented by the node + `0`; when a station is click-expanded it shows the full "Nothing in this stage." line.

---

## 3. Backlog (left) — fixed, not over-wide

The screenshot's backlog felt wide. Keep it fixed but **right-sized**:

- `flex: 0 0 auto; width: 13rem; min-width: 13rem; max-width: 13rem` — wide enough for an id + 2-line title + owner chip, not wider. (One card-width, not two.)
- Header `[stack] Backlog` + count (`backlog-count`, kept). Cards scroll vertically (`max-height: 60vh; overflow-y:auto`, kept).
- The inert `[+ idea · soon]` add affordance stays (disabled, `aria-disabled`, kept).
- Empty: "Backlog is clear." (kept).
- It is a **fixed left rail, visually separated** from the train by the row gap + its own panel border — it reads as the holding pen *before* the first station, not as station zero.

---

## 4. Done terminus + Off-track (right) — intentional, not broken

- **Done** stays the **end-station folder** (`done-folder`, kept): the terminal `▣` node + the stacked-folder face + count + "Done", click to expand its finished-card list in place. It is fixed `9rem`, never grows, always visible at the train's end. It reads as the *terminus the train arrives at* — anchor it visually to the rail's track line so the line runs *into* the folder node (the track terminates at Done, reinforcing "this is the end of the line").
- **Off-track** stays the fixed right `--kb-warning`-framed panel (`off-track-lane`, kept), present only when non-empty. Keep its honest copy verbatim (Apex's, already shipped): heading "Off-track ({n})", "These tasks are in a stage that's no longer in the pipeline.", "Nothing's lost. Open a task and advance it to put it back on the pipeline.", per-group "was in "{stage}" — that stage is gone". To make the lane read as **intentional, not broken**: give it a clear panel header with the `warning` glyph + a 1px `--kb-warning` left edge, and the calm reassurance line directly under the heading. It is a *deliberate parking lane*, framed as recoverable — never alarmist red, never an error state.

---

## 5. Responsive behaviour (no wasted empty band at any width)

The board adapts at three breakpoints. **Container width** (the board's own width, via a container query on `.train` if available, else a viewport media query) drives it — the board can be narrower than the viewport because of the app shell, so prefer `@container`.

| Breakpoint | Backlog | Train (rail) | Done | Off-track |
|---|---|---|---|---|
| **Wide** (`≥ 1100px`) | fixed 13rem | stations compact, populated expand, **fills width, no scroll** in the common case | fixed 9rem | fixed 15rem, right |
| **Medium** (`720–1099px`) | fixed 12rem | same adaptive model; expanded columns shrink toward `min-width: 13rem`; rail scrolls **only** if populated columns still overflow | fixed 8rem | drops **below** the train as a full-width lane (it's secondary) |
| **Narrow** (`< 720px`) | collapses to a **count chip + "Backlog (n)" disclosure** that expands to a vertical list above the train (so it doesn't eat the train's width) | the train **stacks vertically**: each populated stage becomes a full-width section, compact stations become a slim horizontal "stations passed" strip the user can tap to expand; OR, if preferred, the rail keeps horizontal scroll but the side panels collapse first | folder becomes a full-width "Done (n)" disclosure at the bottom | full-width lane at the bottom |

**Key rules at every width:**
- **No empty band.** Because empty stages are compact, the rail's natural width is small when the middle is idle; the rail still `flex: 1 1 0` *fills* the slack, but it fills it with the populated columns flex-growing (max 24rem) + a calm trailing gap, **never** with empty min-width columns forcing scroll.
- **Scroll is the exception, not the default.** `overflow-x: auto` stays on the rail as a safety net, but with compact empties it engages only when many stages are simultaneously populated at a narrow width. When it does engage, keep the existing scroll-snap + the `◂ ▸` paging buttons + the edge mask-fade.
- **Side panels collapse before the train scrolls** at medium/narrow (Off-track drops below first, then Done, then Backlog) — the train (the main content) keeps the most width longest.

---

## 6. The empty-train honest state (Apex lens — calm, correct, inviting)

For *this* project — tickets clustered in backlog / done / off-track, the middle stages all empty — the board must read **"correct and idle," not "broken and empty."** Three layers:

1. **The rail is never a blank band.** With compact stations, an all-empty middle renders as a **tidy row of small stations along the track line**, each with its name + `0`, the active accent resting at the start. This *looks like a pipeline at rest*, not a wasteland. The Backlog (left, populated) and Done (right, populated) book-end it, so the eye reads "work is waiting to start (left) and work has finished (right); the middle is idle." That is the truth, shown calmly.
2. **A calm explainer when the whole middle is empty.** When **every** rail station is compact (0 populated stages) AND there is work in Backlog or Done, show one quiet muted line centred over/under the rail:
   > *"No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them."*
   (Apex owns final wording; absent-not-zero — show this only when middle is empty *and* there is work elsewhere, so it teaches rather than nags.) This is `aria-live`-silent (it's a steady state, not a change).
3. **The existing whole-board empty state is untouched.** When there is *nothing anywhere* (backlog + rail + done + off-track all empty), keep the shipped "No tasks yet — the team will create them as work starts." (`board-empty`). The calm-middle line (layer 2) only applies when there *is* work, just not mid-pipeline.

**Honesty discipline (kept):** every label truthful; no color-only signals (every node/chip pairs glyph + text + count); stage names, owners, titles interpolated only. The compact station's `0` is a real count, never a fake placeholder.

---

## 7. Accessibility (WCAG 2.2 AA) + reduced motion

- **Roving focus across all stations.** The rail stays `role="list"`; every station (compact or expanded) is a `role="listitem"`, `tabindex`, `data-col-index` — so `←/→` walk **every** stage, including compact ones (no stage becomes keyboard-unreachable by being thin). A focused station auto-scrolls into view if the rail is scrolled (kept).
- **Compact station semantics.** Each compact station has `aria-label="Stage {stage}, 0 tasks{, owner …}{, empty}"` so a screen-reader user hears it's an empty stage, not a mystery marker. The hover popover content is also exposed via `aria-describedby` or the label. If click-to-expand is built, the station is a `button`/`aria-expanded` pair.
- **Focus indicators:** 2px `--kb-focus-ring`, 2px offset, ≥ 3:1, on every station, the Done folder, paging buttons, Backlog disclosure, cards. **Focus not obscured** by sticky panels (`scroll-margin` reserved — kept).
- **Targets:** compact station hit-area ≥ 24px (≥ 44px under `pointer: coarse`) even though the visual node is small — pad the listitem so the *target* is comfortable while the *visual* stays thin. Paging buttons, folder, disclosures all ≥ 24/44px.
- **Contrast:** rail track line + active accent ≥ 3:1 against the board background; the compact `0` count and station name ≥ 4.5:1 (it's text); node shapes ≥ 3:1.
- **No color-only signals:** node *shape* (dot/diamond/terminal) carries gate hardness; the active accent only *reinforces* the per-card status (glyph + text) and the count. A compact vs expanded station is distinguished by *layout + the visible cards + the `0`/`n` count*, never by color alone.
- **Reduced motion (`prefers-reduced-motion: reduce`):** the expand/collapse of a station, the rail re-layout on a live SSE push (FLIP), the active-segment accent extension, and the Done count-pop all read the existing `--kb-dur-*`/`--kb-ease-*` tokens, **zeroed in one place** under the media query → they become **instant state swaps**. A station appearing/expanding never animates under reduced motion; the count just changes. No state is conveyed by motion — the count + chips + node shape are the truth.
- **Untrusted text:** stage, owner, title, label, error — **interpolation only, never `[innerHTML]`** (`no-unsafe-binding` stays green). Every wireframe symbol below resolves to a `dart-glyph` name (`no-tofu-glyphs` stays green): `stack`, `info`, `need`, `agent`, `check`, `warning`, `advance`, `folder-stack`, `kebab`, plus the inline rail-node SVGs already in the template.

---

## 8. CSS structure for `/fe` (the exact direction)

Change is **localised to `.rail` + `.col`** in `tasks-board.component.ts`. The region row, Backlog, Done, Off-track keep their current flex rules (Backlog width 12→13rem).

```css
/* The rail fills the slack between the fixed side panels and may shrink to zero so it never
   pushes them off-screen. overflow-x stays as a safety net, rarely engaged now. */
.rail {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: start;
  gap: var(--kb-space-3);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: var(--kb-space-2);
}

/* A populated stage = a real column that grows to share the slack. */
.col[data-state='expanded'] {
  flex: 1 1 14rem;
  min-width: 13rem;
  max-width: 24rem;
}

/* An empty stage = a thin station that takes only the node lane and never grows. */
.col[data-state='compact'] {
  flex: 0 0 auto;
  width: 2.5rem;
  min-width: 2.5rem;
}
/* compact: hide the card list, show node + (vertical/clamped) name + 0 */
.col[data-state='compact'] .col__cards { display: none; }
.col[data-state='compact'] .col__head  { flex-direction: column; align-items: center; gap: 0.25rem; }
.col[data-state='compact'] .col__stage {
  writing-mode: vertical-rl;          /* or: clamp to 1 line + ellipsis if vertical text is rejected */
  transform: rotate(180deg);
  max-height: 8rem; overflow: hidden; text-overflow: ellipsis;
}

/* The connecting track line behind the nodes (the "train track"). */
.rail { position: relative; }
.rail::before {
  content: ''; position: absolute; left: 0; right: 0;
  top: var(--rail-node-row, 0.65rem);  /* aligns to the node-row centre */
  height: 1.5px; background: var(--kb-border); z-index: 0;
}
.col, .rail__node { position: relative; z-index: 1; }   /* nodes sit above the line */
/* active segment: a second ::after line clipped to the active width, --kb-accent (or per-node accent) */
```

- The compact/expanded choice is driven by a template binding: `[attr.data-state]="col.tickets.length ? 'expanded' : 'compact'"` (or a `stationState(col)` method, plus the optional `peekedStage()` override that forces `expanded`).
- **Prefer `@container` over media queries** for §5 — add `container-type: inline-size` to the board root and gate the breakpoints on container width.
- The active-segment accent line can reuse the existing `data-active` per-node accent; the continuous track line is the new presentational addition.

---

## 9. Stable test contract (do NOT break these)

`/fe`: keep every one of these so the existing unit + e2e specs stay green. The redesign is additive (one new `data-state` attr) — it removes nothing.

| Keep | Why |
|---|---|
| Four direct children of `.train` in order: `backlog-bar` → `pipeline-rail` → `done-folder` → `off-track-lane` | asserted by spec |
| `column-stage-{stage}` rendered for **every** rendered stage (compact *and* expanded) | specs query `[data-testid^="column-stage-"]` and count them (e.g. expects 3 stages) |
| `column-count` inside each `column-stage-*` (the real count, incl. `0`) | specs read the count text |
| `column-empty-{stage}` present in an empty stage's body (may be visually collapsed in compact state) | a spec asserts an empty stage shows "nothing"/`column-empty-vision` |
| `rail-node-{stage}` with `data-node` (`none`/`gate-hard`/`gate-soft`/`terminal`) + `data-active` | specs assert node shape + active edge |
| `pipeline-rail`, `pipeline-train`, `backlog-bar`, `backlog-count`, `done-folder*`, `off-track-lane`, `card-*`, `chip-*`, `menu-*` | all kept |
| Roving `←/→` across `[data-col-index]` stations (now including compact ones) | keyboard spec |

**New, additive:** `data-state` (`compact` | `expanded`) on each `.col`; an optional `data-testid="rail-middle-empty"` on the §6 calm-middle explainer line; optional `data-testid="station-peek-{stage}"` on the hover popover / expand control. Add tests for: (1) an empty stage renders `data-state="compact"` and width ≤ a populated one; (2) a populated stage renders `data-state="expanded"`; (3) with all-empty middle + work elsewhere, the calm-middle line shows; (4) the rail does **not** horizontally overflow at ≥1100px when ≤3 stages are populated (layout assertion).

---

## 10. ASCII mocks

### 10.1 Wide (≥1100px) — this project: coarse lifecycle, empty middle (the reported case)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for ai-dev-team                              3 tasks · [need] 1 need you            [◂] [▸]    │
│                                                                                                            │
│ ┌─ BACKLOG ─┐  ┌──────────────────────────── THE TRAIN (fills width, no scroll) ─────────────────────────┐  ┌─ DONE ─┐│
│ │ [stack] 2 │  │  ●    ●    ●    ●    ◆       ●    ◇      ◇    ●    ◆     ●                                │  │ ╔════╗ ││
│ │ ┌───────┐ │  │ visn sec arch desn appr…  tdd  rev   d-qa  qa  reli  vrfy                                │  │ ║[▣] ║ ││
│ │ │ADT-7  │ │  │  0    0    0    0    0      0    0     0    0    0     0    ← all compact stations         │  │ ║×27 ║ ││
│ │ │idea   │ │  │  └───────────────────────── track line ────────────────────────────────────────────►    │  │ ║Done║ ││
│ │ │/po    │ │  │                                                                                          │  │ ╚════╝ ││
│ │ ├───────┤ │  │  No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them.│  └────────┘│
│ │ │ADT-9  │ │  │                                                                                          │           │
│ │ │idea   │ │  └──────────────────────────────────────────────────────────────────────────────────────────┘           │
│ │ └───────┘ │                                                                                                          │
│ │ [+ soon]  │   ← the centre is CALM and FULL-WIDTH; no empty 11rem columns, NO horizontal scrollbar.                  │
│ └───────────┘                                                                                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [warning] Off-track (1) — these tasks are in a stage no longer in the pipeline.  Nothing's lost — advance to re-home.  │  (right panel when present)
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Wide — a busy project: 3 stages populated (the train "expands where work stands")

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌─ BACKLOG ─┐  ┌────────────────────────────── THE TRAIN ─────────────────────────────────────┐  ┌─ DONE ─┐│
│ │ [stack] 4 │  │  ●   ●   ┌─●architecture (2)─┐  ●   ┌─◇code_review (1)─┐  ●  ┌─●qa (3)──┐  ●   │  │ ╔════╗ ││
│ │  …cards…  │  │ visn sec │ ADT-12 in prog…   │ desn│ ADT-30  [need]   │ d-qa│ ADT-41   │ reli │  │ ║×27 ║ ││
│ │           │  │  0   0   │ /be  [need]       │  0  │ /rev  gate dashed│  0  │ /qa      │  0   │  │ ╚════╝ ││
│ │           │  │          │ ADT-13            │     └──────────────────┘     │ ADT-42   │      │  └────────┘│
│ │           │  │          └───────────────────┘                             │ ADT-43   │             │
│ │           │  │   ↑compact   ↑EXPANDED          ↑compact   ↑EXPANDED   ↑comp └──────────┘             │
│ └───────────┘  └──────────────────────────────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   Populated stages grow (max 24rem) and share the slack; the 6 empty stages stay thin. Fits, no scroll.
```

### 10.3 Narrow (<720px) — stack; side panels collapse first

```
┌───────────────────────────────────┐
│ [info] Tasks · ai-dev-team         │
│ ▸ Backlog (2)        ▸ Done (27)   │  ← disclosures (collapsed)
│ ───────────────────────────────── │
│ stations passed:  ● ● ● ● ◆ ● ◇ …  │  ← compact strip, tap a node to expand that stage
│ ───────────────────────────────── │
│ ┌─ architecture (2) ─────────────┐ │  ← only populated stages render as full-width sections
│ │ ADT-12  in progress  /be [need]│ │
│ │ ADT-13                         │ │
│ └────────────────────────────────┘ │
│ ┌─ code_review (1) ──────────────┐ │
│ │ ADT-30  /rev  gate ◇           │ │
│ └────────────────────────────────┘ │
│ ───────────────────────────────── │
│ ▸ Off-track (1)                    │  ← full-width disclosure at the bottom
└───────────────────────────────────┘
```

---

## 11. Build order for `/fe`

1. **The width fix (the 80% win):** add `data-state` compact/expanded to `.col`, the two CSS rules (§8), and the vertical/clamped name in compact state. This alone kills the empty-column scroll for this project. Keep all testids; add the two state tests.
2. **The track line + active segment** (§2.3) — the continuous rail line so it reads as a train, not gaps.
3. **The calm-middle explainer** (§6.2) — the honest idle-state line, absent-not-zero.
4. **Hover-peek on compact stations** (§2.4) — popover/`aria` so a thin station is inspectable.
5. **Responsive `@container` breakpoints** (§5) — medium drops Off-track below; narrow stacks.
6. **(Optional) click-to-expand a compact station** (§2.4) — the manual override; the `peekedStage` signal.

Backlog width 12→13rem and the Done/Off-track fixed rules need no change beyond that. The `board.ts` projection is untouched — this is **presentational chrome over the existing `columns()` projection**, advancing stays the guarded control-plane write.

> **Gate:** none requested — this is a focused design spec. `DESIGN_APPROVED` is **not** recorded here; it fires when this is scoped into a ticket and handed to `/fe` under TDD.
