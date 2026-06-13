# Tasks view — BUILD SPEC (the DESIGN_APPROVED artifact for /fe)

**Author:** Aura (`/ui`) · Senior UI/UX Design Architect
**Status:** Approved direction — consolidated build spec. This is the single, implementable spec `/fe` builds from.
**Date:** 2026-06-13
**Branch:** `feat/dart-tasks-worklist`
**Consolidates:** `aura-ui.md` (base direction) · `anna-research.md` (requirements, never-render-empty-groups) · `jorge-arch.md` (data mapping, guarded-write constraint, needsYou parity) · `max-product.md` (job ranking, MVP MoSCoW, behavioural ACs) · `apex-usability.md` (microcopy, banned copy, what-to-see-first).
**Evolves:** `studio/cockpit/src/app/shell/tasks-board.component.ts`, `studio/cockpit/src/app/shell/board.ts`, `studio/cockpit/src/app/shell/tasks-panel.component.ts`, `studio/cockpit/src/app/core/models.ts`.

> **Gate note.** This records `DESIGN_APPROVED` for the Tasks-view redesign so `/fe` may implement under TDD. The work is **additive over the existing projection** — a new default WORKLIST view-mode wrapping the existing card/chip language, with the existing adaptive train kept verbatim as the **Pipeline** mode. No backend rewrite; no new write path; `status` stays a derived, read-only axis (Jorge §5, §8).

---

## 0. Stack + non-negotiable constraints (carry from every source doc)

- **Angular 21, standalone, `ChangeDetectionStrategy.OnPush`, signals only.** No new dependency.
- **Inline-SVG `dart-glyph` only** — no icon font, no exotic Unicode (tofu). Every glyph named below already exists in `GLYPH_NAMES` (`glyph.component.ts`): `need`, `progress`, `dot`, `blocked`, `check`, `stack`, `info`, `agent`, `advance`, `folder-stack`, `kebab`, `label`, `warning`, `conflict`, `cross`, `caret`, `loop`, `branch`. **No net-new glyph required** (`no-tofu-glyphs` stays green).
- **Dark-first, `--kb-*` tokens only.** No raw hex/hsl; reuse the motion tokens already declared on `:host` (`--kb-dur-*`, `--kb-ease-*`).
- **Untrusted text** (`id`, `title`, `stage`, `assignee`, `expectedOwner`, `label`, error strings) — **interpolation only, NEVER `[innerHTML]`** (`no-unsafe-binding` stays green).
- **WCAG 2.2 AA**, reduced-motion-safe, roving keyboard, glyph+text (never colour-only), targets ≥24px (≥44px under `pointer: coarse`).
- **Absent-not-zero everywhere** — a band/region/cue with zero is OMITTED, never a fabricated zero (Apex honesty stance 2).
- **No card-drag. No new write path.** Every action a card triggers routes through the existing guarded control-plane write (`ControlPlaneService.advance` and the task-detail's gate/comment writes), round-tripping `state.rev`; a 409 resyncs to server truth and is surfaced inline, never a silent overwrite (Jorge R2; Max AC-2).

---

## 1. The default WORKLIST layout

### 1.1 Component structure

Keep `TasksBoardComponent` as the host. Add a **mode signal** and split the centre into two mutually-exclusive renderings. The four-region frame (header roll-up → centre → … ) is preserved; only the centre's organising principle changes by mode.

```
TasksBoardComponent (host — owns state input, mode signal, detail modal, advance())
├── board-live (aria-live polite)            ← KEEP verbatim
├── board-head
│   ├── board-project-cue                    ← KEEP verbatim
│   ├── board-rollup (total · needs-you)      ← KEEP verbatim
│   └── view-mode-switch (NEW — §2)           ← radiogroup: Worklist ⇄ Pipeline
├── @if (isEmpty())  board-empty              ← KEEP verbatim (whole-board-empty owns the screen; switch + bands suppressed)
└── @else @switch (effectiveMode())
    ├── @case ('worklist')  → WORKLIST centre  (NEW — §1.2–§1.5, the DEFAULT)
    └── @case ('pipeline')  → the existing `.train` block, UNCHANGED  (§3)
```

The **card template** (`#cardTpl`) is reused **verbatim** across Worklist bands, Pipeline columns, Backlog, and Done — one card design everywhere. **No new card** (Aura §2.2; Max M-reuse). The advance/menu/conflict/error machinery on the card stays exactly as today.

### 1.2 The Worklist centre — region + grid structure

The Worklist centre is a **single adaptive card surface** organised by **lifecycle band**, vertically stacked. It is NOT the four-side frame — the worklist *is* the centre, full-width; Backlog and Recently-done are bands within it (not side rails), Off-track is appended as a band when present.

```
.worklist (the centre surface — full width, vertical stack of bands)
├── §Needs you   (band — FIRST, visually primary, warning accent)   [absent when 0]
├── §In flight   (band)                                             [absent when 0]
├── §Backlog     (band)                                             [absent when 0]
├── §Recently done (band — collapsed by default, expandable)        [absent when 0]
└── §Off-track   (band — warning-toned, appended)                   [absent when 0]
```

**Each band is a `<section>` with an `<h3>` heading** (so AT users jump band-to-band). The heading row shows: band glyph + band name + **count**. **Absent-not-zero:** a band whose set is empty is **NOT rendered** — no `(0)` header ever (Anna M1; Aura §6; Apex). Reading order is fixed: **Needs you → In flight → Backlog → Recently done → Off-track**.

### 1.3 The card grid — the exact rule that fills any width (the dead-void killer)

Each band lays its cards in a **responsive auto-fill grid**, never a single column. This is the literal answer to "the centre is an empty void on a wide screen":

```css
.band__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--kb-space-3);
  list-style: none;
  margin: 0;
  padding: 0;
}
```

- On a **wide** board, `auto-fill` packs 3–5 cards per row → a 3-ticket project fills the first row; the surface reads as a calm, full-width board, **never a void**.
- As the board narrows the columns reflow 5 → 4 → 3 → 2 → 1, fluid, **no breakpoint cliffs, no horizontal scroll ever**.
- Width is driven by the **board's own width**, not the viewport — keep `container-type: inline-size; container-name: board;` on the worklist root (the train already uses this).

The grid is a `role="list"` (`<ul>`) of `role="listitem"` cards — identical card semantics to today.

### 1.4 What a Worklist CARD shows (per band)

The base card (`#cardTpl`) already renders: `id`, `title`, owner (`assignee || expectedOwner || 'unassigned'`), status chip, gate chip, needs-you chip, label chips, kebab. **Keep all of it.** Per-band emphasis on top of the shared card:

| Band | Card emphasis (what leads the read) | Already on card? |
|---|---|---|
| **Needs you** | the **needs-you reason** in plain words (the *why*) + the **primary action** inline; warning-edged card. | needs-you chip yes; **reason string is NEW** (client-derived, §1.6) |
| **In flight** | the **owning `/agent`** + **what routed it there** (the routing label chip) + status chip; stage shown as a quiet chip. | owner yes; label chips yes; stage-as-chip is NEW-but-trivial (interpolate `t.stage`) |
| **Backlog** | id · title · expected owner — calm, no urgency. | yes |
| **Recently done** | id · title · owner · done status chip — compact. | yes |
| **Off-track** | id · title + the existing "was in '{stage}' — that stage is gone" caption. | yes (reuse off-track grouping) |

**Needs-you reason** renders as a short line under the title (e.g. *"`/arch` approval pending"*, *"looped 3× — needs you"*, *"blocked: hard gate rejected"*). Derive it client-side from the same fields the predicate reads (§1.6) — **not** a projection field (Jorge §2.2, "derive, don't denormalise"). Use the `loop` glyph for a loop hand-back, `need`/`warning` otherwise.

**Stage-as-chip (In-flight):** add a quiet chip `stage: {t.stage}` on in-flight cards so removing stage columns loses no information (Anna M4). Interpolated text only.

### 1.5 The primary card ACTION per band

Every action routes to the **existing guarded control-plane write** or the **task detail** — no new write path (Jorge R2):

| Band | Primary action | Routes to |
|---|---|---|
| **Needs you** | **Approve / Advance** inline when an advance target exists (the kebab's existing `menu-advance` → `advance()`), else **Open** to redirect/comment in the detail modal. | `ControlPlaneService.advance(...)` (existing) → on 409 resync; `TaskDetailComponent` for gate-approve / comment / redirect (existing). |
| **In flight** | **Open** | `TaskDetailComponent` (existing `openDetail`). |
| **Backlog** | **Open** | `TaskDetailComponent`. |
| **Recently done** | **Open** | `TaskDetailComponent`. |
| **Off-track** | **Open** / **Advance to re-home** (existing off-track advance) | existing advance (off-track targets first stage). |

The card's existing kebab menu (`card-menu` → `menu-advance` / `menu-open`) is the action surface; the Needs-you band may *additionally* surface the primary advance/approve as a visible inline button on the card for one-click action (Max M2) — but it MUST call the **same** `advance()` path, not a new one. **No band introduces a status mutation** — `status` is derived/read-only (Jorge §8).

### 1.6 Needs-you band: first, primary, and CANONICAL predicate

- **Needs-you is the first band and the visually primary one** — warning-accent header (`--kb-warning`), and each card warning-edged (reuse the `.chip--need` / warning-border language). It is the reason the operator opened the view (Max #1; Apex §3.1).
- **It is ABSENT when zero** — no "Needs you (0)". The *absence* of the band + the absence of the roll-up `needs-you` chip together ARE the "all-clear" signal (Apex §3.1; absent-not-zero).
- **Predicate parity (the riskiest detail — Jorge R1).** The Needs-you band MUST select tickets by the **canonical hub predicate** `needsHumanDecision` (`hub/lib/state.js`), which the roll-up count (`taskSummary.byStatus.needsYou`) already uses — NOT the narrower `ticketNeedsYou` in `board.ts` today. The two disagree: the hub also raises on `status==='waiting' && expectedOwner && !active`; `board.ts` raises only on a rejected hard gate. **`/fe` must reconcile `ticketNeedsYou` in `board.ts` to mirror the hub predicate byte-for-byte**, so the band's contents, the per-card chip, and the roll-up count cannot disagree. This reconciliation lands as part of this redesign, under a parity unit test (§5). If the band and its own counter show different sets, the feature is broken.

---

## 2. The view-MODE toggle (Worklist ⇄ Pipeline)

### 2.1 The control

A segmented **`role="radiogroup"`** labelled "View", living in `.board-head` (right-aligned, alongside the roll-up), `data-testid="view-mode-switch"`. Two radio options, each a **visible text label + glyph** (never colour/position alone):

- **Worklist** (default) — `data-testid="view-mode-worklist"`, glyph `stack`.
- **Pipeline** — `data-testid="view-mode-pipeline"`, glyph `advance` (or `branch`).

The active option has `aria-checked="true"`, distinguished by **fill AND the checked glyph** (≥3:1, never hue-only), with the 2px focus ring on focus. Activating an option sets the mode signal; an `aria-live="polite"` cue announces *"Worklist view"* / *"Pipeline view"*.

> When the whole board is empty (`isEmpty()`), the switch is **suppressed** — the single honest invitation owns the screen (Apex §1; Aura §6.3).

### 2.2 Persistence

The chosen mode persists **per project** in `localStorage` (key `dart.tasks.viewMode.{projectId}`), so a power user who lives in Pipeline keeps it across sessions (Max S1; Anna S5). Guard all access:

- `localStorage` may be absent/throwing (SSR, privacy mode) — wrap reads/writes in a `try/catch`; on failure fall back to the auto-default. (No existing cockpit code uses `localStorage`; this is the first — keep it defensive, mirroring how the board already guards `matchMedia`.)
- The per-project key uses the `state().project` id; if absent, use a single global key.

### 2.3 The auto-default rule

The **effective mode** is: the persisted explicit choice if one exists for this project; otherwise the **data-derived default**:

```
effectiveMode():
  persisted = readPersistedMode(projectId)      // 'worklist' | 'pipeline' | null
  if (persisted) return persisted
  return autoDefaultMode()

autoDefaultMode():
  // Pipeline only when work is genuinely mid-flow; else Worklist.
  populatedStages = columns().filter(c => c.tickets.length > 0).length
  return populatedStages >= 2 ? 'pipeline' : 'worklist'
```

- **Worklist is the default for the common coarse-lifecycle case** (≤1 stage populated) — the centre is full of cards, never an empty scaffold (Max §3.1; Aura §1a).
- **Pipeline auto-defaults only when ≥2 stages are simultaneously populated** — i.e. work is genuinely flowing (Aura §1a table).
- A manual switch writes the persisted choice and wins thereafter for that project.

> **Pipeline entered on an idle project** (manually): the existing `.train` renders with the existing `rail-middle-empty` calm idle line **plus** a quiet *"Switch to Worklist"* button, so the "wrong mode" is recoverable, never a void (Aura §3). This is a small addition to the existing train block — keep all its existing testids.

---

## 3. Data mapping — exactly which fields select each band

All bands are **client-side group-by/filter over `state().tickets`** + the existing `partitionBoard` projection — **no new endpoint, no backend change** (Jorge §3). Reuse `partitionBoard(workflowView, tickets)` (already computed once per push) as the substrate; the worklist re-projects from the same partition + `status`.

| Band | Selection predicate (exact) | Source / derivation |
|---|---|---|
| **Needs you** | `needsHumanDecision(t)` — the **canonical hub predicate** (rejected hard gate **OR** `status==='waiting' && expectedOwner && !active`). Mirrored in `board.ts` (§1.6 parity). | Filter over `tickets`. Count binds `taskSummary.byStatus.needsYou` directly (do **not** re-derive divergently — Jorge §3 rule 3). |
| **In flight** | `status === 'in_progress'` **AND not** needs-you (needs-you wins; a ticket appears in exactly one band — disjointness R1). | `t.status` (derived in hub `statusOf`). |
| **Backlog** | `partition.backlog` — the pre-start set (`isBacklog`: unstaged / `backlog` / pre-start tokens the workflow doesn't define), **minus** any already shown in Needs-you. | `partitionBoard(...).backlog` (existing). |
| **Recently done** | `status === 'done'` (≡ `partition.doneTickets`), **most-recent-first**, **collapsed by default**, **capped at ~6 shown** with a *"see all in Done →"* expand. | `partition.doneTickets`; order per §3.1. |
| **Off-track** | `partition.offTrack` (tickets at a stage no longer in the track), **minus** needs-you. | `partitionBoard(...).offTrack` (existing). |

**Disjointness invariant (R1):** every ticket lands in **exactly one** band. Apply a single ordered pass: claim **Needs-you first**, then In-flight, Backlog, Recently-done, Off-track. `needsYou` is a *band* here (the operator's queue), never double-counted — but because it is claimed first and removed from the others, the sets stay disjoint and the band counts sum to the visible total. The roll-up `needs-you` **chip** count still binds the canonical summary (it may legitimately equal the Needs-you band size).

### 3.1 Recency ordering (honest, deferred for v1)

`TicketView` carries **no `updatedAt`/`movedAt`** today (Aura §8; Jorge §4). So for v1:

- **Recently done** orders **best-effort** by `comments[]` recency: use the existing `commentsNewestFirst(t.comments)` helper → take `comments[0]?.ts` as a last-activity proxy, sort done tickets descending by it; tickets with no comment ts sort last (stable, ledger order). This is **honestly labelled "Recently done"**, NOT "Last 24h" — no fabricated "moved 2h ago" timestamps.
- The *"see all in Done →"* link is the truth that the full Done set lives behind the expand (the teaser is honest about being a teaser).
- **Deferred:** a derived `lastActivityAt` scalar on the projection (Jorge §4) would make this first-class. It is **out of scope for v1** — `/fe` degrades honestly without it. Do **not** add the field in this ticket.

### 3.2 Counts

Every count is a **real count** — the Needs-you roll-up chip binds `taskSummary.byStatus.needsYou`; band headers show their partition length. Never a fabricated zero; a zero band is absent.

---

## 4. Microcopy (exact strings — Apex's truthful set; banned copy honored)

Use these verbatim. Verbs of fact, no hype, no apology, no fake zero.

| Surface / state | Exact string |
|---|---|
| **Band header — Needs you** | `Needs you` (+ count) |
| **Band header — In flight** | `In flight` (+ count) |
| **Band header — Backlog** | `Backlog` (+ count) |
| **Band header — Recently done** | `Recently done` (+ count) · expander label: `see all in Done →` |
| **Band header — Off-track** | `Off-track` (+ count) · keep existing why/reassure lines: *"These tasks are in a stage that's no longer in the pipeline."* / *"Nothing's lost. Open a task and advance it to put it back on the pipeline."* |
| **All-clear (nothing needs you, work in flight/done)** | Needs-you band + roll-up needs-you chip are **absent** — the absence *is* the all-clear. No "0 need you", no fake-green badge. Roll-up shows only `{N} tasks`. |
| **Needs-you reason — gate pending** | `{owner} approval pending` (e.g. `/arch approval pending`) |
| **Needs-you reason — loop hand-back** | `looped {N}× — needs you` |
| **Needs-you reason — blocked hard gate** | `blocked: a gate needs your decision` |
| **Needs-you reason — waiting on you** | `waiting on you — an approval to give or a decision to make` |
| **needs-you chip** (existing) | `needs you` · tooltip: *"Waiting on a person — an approval to give or a decision to make."* |
| **Roll-up needs-you** (existing, KEEP) | `{N} need you` (warning hue), omitted when 0 |
| **Pipeline idle (wrong-mode) line** (KEEP existing) | *"No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them."* + button `Switch to Worklist` |
| **Whole-board empty (KEEP verbatim)** | `No tasks yet — the team will create them as work starts.` |
| **Backlog empty within band** | `Backlog is clear.` (existing) |
| **View switch announce** | `Worklist view` / `Pipeline view` (aria-live polite) |

**Banned copy (Apex §2.3) — MUST NOT appear:** any `0 need you` / empty grid of zeros; any fake-green "all clear" badge; any apology (`Sorry, nothing here` / `This looks empty` / `No data`); any autonomy overclaim (`DART is working on it` / `agents running`) unless host-reported; `Action required!`, red badges on a calm board, pulsing counts. "Done" stays the terminus word — never `archive` / `closed` / `removed`.

---

## 5. Responsive + a11y + motion + test contract

### 5.1 Responsive (fills wide, graceful narrow)

| Board width | Worklist | Pipeline |
|---|---|---|
| **Wide ≥ 1100px** | bands as multi-column grids (`auto-fill minmax(16rem,1fr)`) → cards pack to fill; centre **never voids**. | existing adaptive train, unchanged. |
| **Medium 720–1099px** | grids reflow to 2–3 columns; bands stack. | existing train behaviour, unchanged. |
| **Narrow < 720px** | bands stack; each card full-width (grid collapses to 1 column naturally — no extra rule needed, `minmax(16rem,1fr)` yields 1 col below ~16rem container). Recently-done stays collapsed. | existing narrow train behaviour, unchanged. |

Driven by the **board's own width** via the existing `container-type: inline-size; container-name: board` — a container query, never a viewport media query. **No horizontal scroll in Worklist at any width.**

### 5.2 Accessibility (WCAG 2.2 AA)

- **Mode switch:** `role="radiogroup"` (label "View"); each option a radio with visible text + glyph; `aria-checked`; 2px focus ring (3:1); active distinguished by fill **and** glyph, never hue alone.
- **Bands:** `<section>` + `<h3>` heading per band so AT users jump band-to-band; the card grid is `role="list"` of `role="listitem"` (unchanged card semantics). Reading order Needs-you → In-flight → Backlog → Recently-done → Off-track.
- **Roving keyboard within a band:** arrow keys move between cards in a band; `Tab` moves to the next band's first card. Reuse the existing `[data-col-index]`-style roving pattern (`onColumnKeydown`) generalised to band cards, or add a band-scoped equivalent — no interaction is mouse-only. Pipeline mode keeps its existing roving `←/→` across stations.
- **Cards** keep their current keyboard contract (open on `Enter`/`Space`; kebab `role="menu"` with Advance). **No drag anywhere.**
- **Targets ≥ 24px (≥ 44px under `pointer: coarse`)** on mode radios, the Recently-done expander, cards, kebabs, inline actions.
- **Contrast:** band headings + counts ≥ 4.5:1; needs-you warning accent + status accents ≥ 3:1.
- **Untrusted text** interpolation only, never `[innerHTML]`.

### 5.3 Motion (reduced-motion via `--kb-*` tokens)

- Mode switches, band reflow on a live SSE push (FLIP card-arrive), and the existing active-segment accent all read `--kb-dur-*` / `--kb-ease-*`, **zeroed in one place** under `@media (prefers-reduced-motion: reduce)` → instant state swaps. Reuse the existing `card-arrive` keyframe + the `[data-motion]` host attribute.
- **No status is carried by motion** — the chip + count + heading carry it; motion only narrates the transition.
- A live push must **not silently re-collapse** what the operator expanded (Recently-done, or a Pipeline station) within the session (Apex §3.3) — preserve the operator's disclosure state across re-layout.

### 5.4 Stable test contract (keep these green)

**KEEP (Pipeline mode is exactly today's board — its tests stand):**
`pipeline-root`, `board-live`, `board-project-cue`, `board-rollup`, `rollup-needs-you`, `board-empty`, `pipeline-train`, `backlog-bar`, `backlog-count`, `backlog-empty`, `backlog-add`, `pipeline-rail`, `column-stage-*`, `column-count`, `column-empty-*`, `rail-node-*`, `rail-middle-empty`, `done-folder`, `done-folder-toggle`, `done-folder-count`, `done-folder-list`, `done-folder-empty`, `off-track-lane`, `off-track-group-*`, `card-*`, `card-open`, `chip-status`, `chip-gate`, `chip-needs-you`, `chip-label`, `card-menu`, `menu-advance`, `menu-no-advance`, `menu-open`, `card-conflict`, `card-retry`, `card-error`, and the roving `data-col-index` / `←/→` contract.

**NEW, additive:**
- `view-mode-switch` (radiogroup) with `view-mode-worklist` / `view-mode-pipeline`.
- `worklist-root` (the Worklist centre surface).
- `worklist-band-{needs-you|in-flight|backlog|recently-done|off-track}` per **rendered** band.
- `worklist-band-count` per band header; `recently-done-expand` for the see-all expander.
- `needs-you-reason` for the per-card reason line.

**Tests `/fe` adds (TDD):**
1. Coarse-lifecycle state (≤1 stage populated) defaults to **Worklist** and renders the work as cards — **no empty stage scaffold**.
2. ≥2 populated stages defaults to **Pipeline**.
3. A **zero-count band is absent** (no `(0)` header).
4. Switching mode **persists** (per-project `localStorage`) and the centre swaps; persisted choice survives reload; persistence failure falls back to auto-default without throwing.
5. The Worklist centre **never horizontally overflows** at ≥1100px and **fills** the width (grid `auto-fill`).
6. **needsYou parity:** `ticketNeedsYou` (board.ts) === the hub `needsHumanDecision` predicate for a table of fixtures (rejected-hard-gate; waiting+expectedOwner+!active; in_progress; done) — the band, the per-card chip, and `taskSummary.byStatus.needsYou` agree.
7. Disjointness: every ticket appears in exactly one band; band counts sum to the non-pipeline-hidden total.
8. All-clear: zero needs-you → Needs-you band absent AND roll-up needs-you chip absent (no `0 need you`).

---

## 6. ASCII mocks

### 6.1 Worklist (DEFAULT) — WIDE screen — the previously-dead case, now full

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for ai-dev-team      3 tasks · [need] 1 need you          View: ( • Worklist )( Pipeline )     │  header + mode switch
│                                                                                                            │
│ ┌─ THE WORKLIST (centre — full width, each band a card grid that reflows to fill) ──────────────────────┐  │
│ │ [need] NEEDS YOU (1)                                                       ← FIRST · warning accent    │  │
│ │ ┌──────────────────┐                                                                                   │  │
│ │ │ ADT-22           │  warning-edged                                                                    │  │
│ │ │ Approve security │                                                                                   │  │
│ │ │ /arch approval pending          ← the reason, in plain words                                         │  │
│ │ │ /you · [need] · [Approve]       ← primary action inline → guarded advance()                          │  │
│ │ └──────────────────┘                                                                                   │  │
│ │                                                                                                        │  │
│ │ [progress] IN FLIGHT (1)                                                                               │  │
│ │ ┌──────────────────┐                                                                                   │  │
│ │ │ ADT-18           │                                                                                   │  │
│ │ │ Wire SSE channel │                                                                                   │  │
│ │ │ /be · [progress] · stage: backend · [TO_DEV_BE]   ← agent + why-routed + stage chip                  │  │
│ │ └──────────────────┘                                                                                   │  │
│ │                                                                                                        │  │
│ │ [stack] BACKLOG (2)                                                                                    │  │
│ │ ┌──────────────────┐ ┌──────────────────┐                                                              │  │
│ │ │ ADT-7  idea /po  │ │ ADT-9  idea /ba  │   ← grid packs side-by-side on a wide board                  │  │
│ │ └──────────────────┘ └──────────────────┘                                                              │  │
│ │                                                                                                        │  │
│ │ [check] RECENTLY DONE (1)                                                       see all in Done →      │  │
│ │ ┌──────────────────┐                                                                                   │  │
│ │ │ ADT-30  Add board│  /fe · [check] done                                                               │  │
│ │ └──────────────────┘                                                                                   │  │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────────┘
│   ← centre is FULL of the actual 3 tickets, grouped by what needs action. NO empty stage scaffold, NO void, │
│     NO horizontal scrollbar. On a wider board each band's grid packs MORE cards per row (auto-fill).         │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Pipeline mode — WIDE screen (the existing adaptive train, reused as-is)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for payments-api    14 tasks · [need] 2 need you          View: ( Worklist )( • Pipeline )     │  header + mode switch
│                                                                                                            │
│ ┌─ BACKLOG ─┐  ┌─────────────────────── THE TRAIN (stations + expanded columns) ──────────────────┐ ┌─DONE─┐│
│ │ [stack] 4 │  │  ●   ●   ┌─●architecture (2)─┐  ●   ┌─◇code_review (1)─┐  ●  ┌─●qa (3)──┐  ●       │ │ ╔══╗ ││
│ │  …cards…  │  │ visn sec │ ADT-12 in prog…   │ desn│ ADT-30  [need]   │ d-qa│ ADT-41   │ reli     │ │ ║×27║ ││
│ │           │  │  0   0   │ /be  [need]       │  0  │ /rev  gate dashed│  0  │ ADT-42   │  0       │ │ ╚══╝ ││
│ │           │  │          └───────────────────┘     └──────────────────┘     └──────────┘          │ └──────┘│
│ └───────────┘  └──────────────────────────────────────────────────────────────────────────────────┘        │
│   Populated stages grow + share slack; empty stages stay thin stations on the track. No scroll. (UNCHANGED.) │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Worklist — NARROW (< 720px) — bands stack, cards full-width

```
┌───────────────────────────────────┐
│ [info] Tasks · ai-dev-team         │
│ View: ( • Worklist )( Pipeline )   │
│ ───────────────────────────────── │
│ [need] NEEDS YOU (1)               │
│ ┌───────────────────────────────┐ │  ← one column; cards full-width
│ │ ADT-22  Approve security      │ │
│ │ /arch approval pending        │ │
│ │ /you · [need] · [Approve]     │ │
│ └───────────────────────────────┘ │
│ [progress] IN FLIGHT (1)           │
│ ┌───────────────────────────────┐ │
│ │ ADT-18  Wire SSE channel      │ │
│ │ /be · [progress] · backend    │ │
│ └───────────────────────────────┘ │
│ [stack] BACKLOG (2)                │
│ ┌───────────────────────────────┐ │
│ │ ADT-7  idea · /po             │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ ADT-9  idea · /ba             │ │
│ └───────────────────────────────┘ │
│ [check] RECENTLY DONE   see all → │  ← collapsed by default
└───────────────────────────────────┘
```

---

## 7. Out of scope for v1 (do not build now)

- `lastActivityAt` / `movedAt` projection field (Jorge §4) — deferred; v1 uses the `comments[].ts` best-effort order, honestly labelled.
- Group-by Owner / Stage / Gate selector (Anna S1; Max S2) — fast-follow; v1 ships the fixed lane bands + the Worklist⇄Pipeline mode.
- Inline comment-from-row, cross-project needs-you roll-up, filter/scope controls (Max C1–C3) — later.
- Card-drag to advance; any view that implies DART runs the agents — **WON'T** (honesty guardrail).

---

*Build spec only — no code authored here. Every band, count, and cue points at a real signal already in `buildState` / `partitionBoard` / `taskSummary`, or is a client-side derivation over existing fields. The load-bearing decisions: (1) Worklist is the default and its bands are `auto-fill minmax(16rem,1fr)` grids that fill any width — the dead-void killer; (2) the existing adaptive train is kept verbatim as the Pipeline mode, auto-default only at ≥2 populated stages, choice persisted per project; (3) the single riskiest detail is the **needsYou predicate parity** — `board.ts` must be reconciled to the canonical hub predicate or the Needs-you band and its own counter will disagree.*
