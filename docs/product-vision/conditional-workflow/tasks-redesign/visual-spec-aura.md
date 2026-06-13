# Visual Spec — Tasks Worklist: Colour, Progress & Hierarchy (Aura)

**Designer:** Aura (`/ui`) — Senior UI/UX Design Architect
**Date:** 2026-06-13
**Status:** Draft → for `/po` ratify → `/fe` implement
**Scope:** VISUAL layer of the just-shipped Worklist (`shell/tasks-worklist.component.ts` + the shared `#cardTpl` in `shell/tasks-board.component.ts`). No new data, no new write path, no engine change — this is paint over the existing bands, cards, and counts.
**Surface affected:** Worklist mode only. Pipeline mode keeps today's metro-line styling (its tests stand); the status→colour tokens defined here MAY be reused there later but that is out of scope.

---

## 0. The problem, stated as a picture

Today every card is one colour — `--kb-surface-muted` (#1B1F2A) on `--kb-bg` (#0B0D12) with `--kb-text` (#F2F4F8) — and status lives in a single grey pill (`.chip--status` is `--kb-text-muted`). "Done", "in progress" and "waiting" render **identically**. The board is a uniform dark-grey mass: you must *read every pill* to know any state. That is the black-and-white-mass failure.

**The cure, in one sentence:** make **status the dominant visual property of the card** — a saturated coloured left edge + a filled coloured status pill + a coloured band header — so a single glance reads as **colour proportions** (mostly green = mostly done; a blue cluster = work in flight; one amber = needs me) *before any word is read*. Colour is the primary signal; text and glyph stay as the honest, accessible backup (never colour-only).

**Honesty constraint (carried from Apex / BUILD-SPEC, load-bearing):** colour reflects REAL state. Done is green *because it is done*. A quiet board is calm-green/neutral, never a fake-green "all clear" badge and never alarm-red when nothing is wrong. Amber and red appear ONLY when a real gate/owner condition is true. Absent-not-zero holds: a band with zero is omitted, never a `(0)` strip.

---

## 1. STATUS → COLOUR MAP (the headline)

Six visual states. The first four are real ticket `status` values (`board.ts` `STATUS_CHIPS`); `needs-you` is the canonical `ticketNeedsYou` derivation (it OVERRIDES the raw status for colour — a waiting card that needs a person reads amber, not neutral); `backlog`/`planned` is the placement band (pre-start, `isBacklog`).

| Visual state | Drives off | Saturated colour (edge + pill text/dot) | Token | Tinted fill (card bg wash) | Band header colour |
|---|---|---|---|---|---|
| **Done** | `status === 'done'` (Recently-done band) | green `#34D399` | `--kb-success` | `--kb-success-soft` (≈12% α) | green |
| **In progress / in flight** | `status === 'in_progress'` (In-flight band) | blue `#6E8BFF` | `--kb-accent` | `--kb-accent-soft-2` (≈14% α) | blue |
| **Needs you / waiting-on-person** | `ticketNeedsYou(t) === true` (Needs-you band) | amber `#FBBF24` | `--kb-warning` | `--kb-warning-soft` (≈16% α) | amber |
| **Blocked / off-track** | `status === 'blocked'` OR off-track band | red `#F87171` | `--kb-danger` | `--kb-danger-soft` (≈14% α) | red |
| **Backlog / planned** | `isBacklog(t)` (Backlog band) | calm neutral `#A4ABBC` | `--kb-text-muted` | `--kb-neutral-soft` (≈8% α, barely there) | muted grey |
| **Waiting (generic, NOT needs-you)** | `status === 'waiting'` & `!ticketNeedsYou` | calm neutral `#A4ABBC` | `--kb-text-muted` | none / `--kb-neutral-soft` | muted grey |

**Precedence when a card could match two states** (resolve in this order — matches the band-claim order in `worklistBands`, so card colour == band colour and they cannot disagree):
`needs-you (amber)` → `blocked (red)` → `in-flight (blue)` → `backlog (neutral)` → `recently-done (green)` → `off-track (red)`.
The band a card lands in already encodes its colour — **so colour is keyed to the BAND the card renders in**, not re-derived per card. That is the disjointness guarantee re-used as a colour guarantee: one ticket, one band, one colour.

> **Why amber for needs-you and not red:** amber = "wants a human", calm-directed, the loudest *non-alarm*. Red is reserved for genuinely off-track / blocked (a real fault). This keeps the everyday "approve this" from screaming like a failure (Apex §2.3: no fake urgency, no red on a calm board).

### 1.1 New tokens to add (`src/styles/_tokens.scss`)

The saturated colours already exist (`--kb-success`, `--kb-accent`, `--kb-warning`, `--kb-danger`, `--kb-text-muted`). Add the **soft tinted-fill variants** — these are the wash behind the card, NOT a new hue. Defined for BOTH themes (dark block + `[data-theme='light']` block). Use `color-mix` against the surface so the tint sits correctly on the dark bg and the values stay perceptually even.

**Dark block** (`:root, [data-theme='dark']`):
```scss
  /* Status soft fills — the tinted card wash per status. Saturated colour stays on the
     accent edge + pill; the fill is a calm ~8–16% tint so the board reads as colour, not neon. */
  --kb-success-soft:  color-mix(in oklab, var(--kb-success) 12%, var(--kb-surface));
  --kb-accent-soft-2: color-mix(in oklab, var(--kb-accent)  14%, var(--kb-surface));
  --kb-warning-soft:  color-mix(in oklab, var(--kb-warning) 16%, var(--kb-surface));
  --kb-danger-soft:   color-mix(in oklab, var(--kb-danger)  14%, var(--kb-surface));
  --kb-neutral-soft:  color-mix(in oklab, var(--kb-text-muted) 8%, var(--kb-surface));
```

**Light block** (`[data-theme='light']`) — same names, mixed against the light surface so they read as pale washes:
```scss
  --kb-success-soft:  color-mix(in oklab, var(--kb-success) 12%, var(--kb-surface));
  --kb-accent-soft-2: color-mix(in oklab, var(--kb-accent)  14%, var(--kb-surface));
  --kb-warning-soft:  color-mix(in oklab, var(--kb-warning) 16%, var(--kb-surface));
  --kb-danger-soft:   color-mix(in oklab, var(--kb-danger)  14%, var(--kb-surface));
  --kb-neutral-soft:  color-mix(in oklab, var(--kb-text-muted) 8%, var(--kb-surface));
```
> `--kb-accent-soft` (#1E2740) already exists and is used elsewhere; do not repurpose it. The new in-flight wash is `--kb-accent-soft-2` to avoid collision.
> `color-mix(in oklab, …)` is supported in all current evergreen browsers; it is the project's OKLCH-aligned mixing space. If a hard fallback is ever needed, the equivalent `rgba()` of each saturated hex at the stated α over `--kb-surface` is acceptable, but prefer `color-mix`.

---

## 2. PER-CARD VISUAL TREATMENT (exact)

The card today (`#cardTpl` → `.card`) is `background: --kb-surface-muted; border: 1px solid --kb-border`. Replace the flat treatment with a **status-driven** one. The card must carry a status hook so CSS can branch — see §2.4 for the hook (the only template change needed).

### 2.1 The accent EDGE (the strongest single cue — see Report)

A **4px solid coloured left border** in the saturated status colour. This is the bar your eye scans down a column of cards.

```scss
.card {
  position: relative;
  background: var(--kb-surface-muted);
  border: 1px solid var(--kb-border);
  border-left: 4px solid var(--kb-border-strong);   /* default; status overrides the colour */
  border-radius: var(--kb-radius-md);
}
/* keyed by the card's status hook (§2.4) */
.card[data-status='done']      { border-left-color: var(--kb-success);    background: var(--kb-success-soft); }
.card[data-status='in-flight'] { border-left-color: var(--kb-accent);     background: var(--kb-accent-soft-2); }
.card[data-status='needs-you'] { border-left-color: var(--kb-warning);    background: var(--kb-warning-soft); }
.card[data-status='blocked']   { border-left-color: var(--kb-danger);     background: var(--kb-danger-soft); }
.card[data-status='off-track'] { border-left-color: var(--kb-danger);     background: var(--kb-danger-soft); }
.card[data-status='backlog']   { border-left-color: var(--kb-text-muted); background: var(--kb-neutral-soft); }
.card[data-status='waiting']   { border-left-color: var(--kb-text-muted); background: var(--kb-neutral-soft); }
```

**Radius detail:** keep the left border square against the card's left edge by leaving `border-radius` on the card; the 4px bar reads as an inset rule. (No `border-top-left-radius: 0` gymnastics needed — the 4px bar against an 8px radius looks intentional.)

> This SUPERSEDES the current `.band--needs-you .band__cards :where(.card) { border-color: var(--kb-warning); }` rule in `tasks-worklist.component.ts` — colour now comes from the per-card `data-status`, not from the band selector. Remove that band-scoped override so it does not fight the new edge. The needs-you cards still read amber because their `data-status='needs-you'`.

### 2.2 The filled STATUS PILL (the chip that pops)

Today `.chip--status` is grey text only. Make the status chip a **filled coloured pill**: tinted background + saturated text + the glyph as a coloured dot. Keep `data-testid="chip-status"` and the glyph+label (never colour-only).

```scss
/* The status chip becomes the one filled, coloured pill on the card. */
.chip--status { border: 1px solid transparent; font-weight: 600; }
.card[data-status='done']      .chip--status { color: var(--kb-success);    background: var(--kb-success-soft);  border-color: color-mix(in oklab, var(--kb-success) 35%, transparent); }
.card[data-status='in-flight'] .chip--status { color: var(--kb-accent-hover); background: var(--kb-accent-soft-2); border-color: color-mix(in oklab, var(--kb-accent)  35%, transparent); }
.card[data-status='needs-you'] .chip--status { color: var(--kb-warning);    background: var(--kb-warning-soft);  border-color: color-mix(in oklab, var(--kb-warning) 40%, transparent); }
.card[data-status='blocked'],
.card[data-status='off-track'] { } /* nothing extra */
.card[data-status='blocked']   .chip--status,
.card[data-status='off-track'] .chip--status { color: var(--kb-danger); background: var(--kb-danger-soft); border-color: color-mix(in oklab, var(--kb-danger) 40%, transparent); }
.card[data-status='backlog']   .chip--status,
.card[data-status='waiting']   .chip--status { color: var(--kb-text-muted); background: var(--kb-neutral-soft); border-color: var(--kb-border); }
```

**Contrast note:** on the soft-fill pill background the saturated text must clear ≥4.5:1. `--kb-accent` #6E8BFF on its own dark soft-fill is borderline for small text, so in-flight pill TEXT uses `--kb-accent-hover` #8AA0FF (lighter) — that clears 4.5:1 on the tinted fill. Green/amber/red saturated hexes clear 4.5:1 on their soft fills at this α on the dark surface. (Light theme: the saturated light-theme hues — #16A34A, #2563EB, #D97706, #DC2626 — clear 4.5:1 on their pale fills.) See §6 for the contrast table.

### 2.3 Title / id / owner — keep readable, do NOT tint the text

Body text (`.card__title`, `.card__id`, `.card__owner`) stays `--kb-text` / `--kb-text-muted` for full legibility. The colour lives in the EDGE, the PILL, and the FILL — never in the title text (tinted body text would hurt contrast and make the card feel "themed" rather than "stated"). The `.card__reason` line on needs-you cards stays `--kb-warning` (already correct, reinforces amber).

### 2.4 The ONE template change: the status hook

Add a single attribute on the card `<li>` in `#cardTpl` (`tasks-board.component.ts`), driven by a tiny pure helper. No new model field, no write path.

```html
<li class="card" [attr.data-testid]="'card-' + t.id" [attr.data-status]="cardStatus(t)" role="listitem">
```

`cardStatus(t)` returns one of `'needs-you' | 'blocked' | 'in-flight' | 'done' | 'backlog' | 'waiting'` using the SAME precedence as §1, reusing existing predicates so colour cannot drift from the bands:

```ts
// in board.ts — pure, presentational; reuses ticketNeedsYou + isBacklog, adds no field.
export function cardVisualStatus(
  ticket: TicketView,
  workflowView: WorkflowView | null | undefined,
): 'needs-you' | 'blocked' | 'in-flight' | 'done' | 'backlog' | 'waiting' {
  if (ticketNeedsYou(ticket)) return 'needs-you';
  if (ticket.status === 'blocked') return 'blocked';
  if (isBacklog(ticket, workflowView)) return 'backlog';      // a queued idea is planned, not "in flight"
  if (ticket.status === 'in_progress') return 'in-flight';
  if (ticket.status === 'done') return 'done';
  return 'waiting';
}
```
> Pipeline mode reuses the same `#cardTpl`, so `data-status` colours pipeline cards too — a free, consistent win, and it does not change any Pipeline testid. Off-track *band* cards in the Worklist read red via the band wrapper (§3.4) rather than per-card, because an off-track ticket's raw status may be anything; the band owns the red there.

---

## 3. VISUAL HIERARCHY — active LOUD, backlog & done QUIET

The bands already render in order (Needs-you → In-flight → Backlog → Recently-done → Off-track). Order alone is not enough — the user said the mass doesn't differentiate. Use **prominence**: active bands are big and colour-forward; planning/finished bands are compact, muted, and collapsed.

### 3.1 Band-header treatment (coloured band headers)

Give each band header a **left colour tick + coloured title + a soft underline in the band colour**, so even the section dividers read as colour:

```scss
.band__head { border-bottom: 1px solid var(--kb-border); }      /* default stays */
.band--needs-you   .band__title { color: var(--kb-warning); }   /* exists — keep */
.band--needs-you   .band__head  { border-bottom-color: var(--kb-warning); }  /* exists — keep */
.band--in-flight   .band__title { color: var(--kb-accent-hover); }
.band--in-flight   .band__head  { border-bottom-color: color-mix(in oklab, var(--kb-accent) 50%, var(--kb-border)); }
.band--recently-done .band__title { color: var(--kb-success); }
.band--recently-done .band__head  { border-bottom-color: color-mix(in oklab, var(--kb-success) 45%, var(--kb-border)); }
.band--backlog     .band__title { color: var(--kb-text-muted); }   /* quiet — no coloured underline */
.band--off-track   .band__title { color: var(--kb-danger); }       /* red, not amber, for a real fault */
.band--off-track   .band__head  { border-bottom-color: var(--kb-danger); }
```
Add the matching host classes in `tasks-worklist.component.ts` (it already toggles `band--needs-you` / `band--off-track`; add `band--in-flight`, `band--backlog`, `band--recently-done` keyed on `band.kind`). The count chip in each header gets the band colour too: `.band__count` inherits a tinted variant — small, but it makes the "30" in Recently-done read green at a glance.

### 3.2 ACTIVE bands are loud (Needs-you + In-flight)

- **Full prominence:** normal card size, full tinted fill, full 4px saturated edge, filled pill. These sit at the TOP and are the visually heaviest things on screen.
- **Needs-you stays the single loudest** (amber edge + amber pill + amber header + the reason line). It is first and primary (BUILD-SPEC §115, Apex §3.1).
- Card min-width unchanged (`minmax(16rem, 1fr)` grid). Active cards may carry a hair more vertical padding (`--kb-space-3` block padding vs §the default `--kb-space-2`) so they feel weightier than backlog cards — optional, see §3.5.

### 3.3 BACKLOG is quiet — compact, muted, collapsed by default

Backlog is planning, not active. Make it visually secondary and **collapsed to a one-line summary by default**, expandable.

- **Collapsed default:** render the Backlog band as a single muted disclosure row: `[stack] 8 planned ▸` in `--kb-text-muted`, no card grid until expanded. Reuse the recently-done disclosure pattern (a `<button>` toggling a signal). Testids: keep `worklist-band-backlog` on the `<section>` and `worklist-band-count` on the count; add `backlog-expand` (mirrors `recently-done-expand`) for the toggle.
- **When expanded:** cards render in a **denser, muted** grid — smaller min track (`minmax(13rem, 1fr)`), neutral fill (`--kb-neutral-soft`, barely tinted), neutral 3px edge (thinner than active's 4px), `opacity: 0.92` on the band so it sits back. No saturated pill — backlog status pill stays neutral.
- **Heading** is muted grey (no coloured underline). The whole band reads as "quiet shelf below the loud work".

```scss
.band--backlog { } /* container */
.band--backlog .band__cards { grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); opacity: 0.92; }
.band--backlog .card { border-left-width: 3px; }
.band--backlog .band__title { font-weight: 600; }       /* same weight, muted colour does the de-emphasis */
```

### 3.4 RECENTLY-DONE stays collapsed + green

- Keep the existing teaser cap (`RECENTLY_DONE_CAP = 6`) and `recently-done-expand`. Visually: cards read green (done edge + green pill + green soft fill) but the band sits at `opacity: 0.9` and below the active bands — **green but quiet**. The point: a glance sees "lots of green down low = lots shipped" without the done work competing with what needs action.
- Header is green-titled with a green underline so the "RECENTLY DONE (30)" reads as a green block.

### 3.5 OFF-TRACK band — red, self-explaining, only when present

The Worklist off-track band wraps its cards in a red-edged container (mirror the Pipeline `.offtrack` panel: `border: 1px solid var(--kb-danger)`), red header, and keeps the existing `band__why` / `band__reassure` reassurance lines. Cards inside read red. It is last and absent when empty (already the behaviour).

### 3.6 The prominence ladder (top → bottom, loud → quiet)

```
NEEDS YOU      amber · loudest · top · full size · filled pill · reason line
IN FLIGHT      blue  · loud    · full size · filled pill
BACKLOG        grey  · QUIET   · collapsed to "8 planned ▸" · muted when open
RECENTLY DONE  green · quiet   · capped teaser · opacity 0.9
OFF-TRACK      red   · only-when-present · self-explaining panel
```

---

## 4. PROGRESS BAR — "where are we with the feature"

A horizontal **segmented bar** at the very top of the Worklist (above the first band, inside `worklist-root`), giving the human the done-vs-remaining proportion as a picture. It reads off the EXISTING `taskSummary.byStatus` counts (no new data) — and falls back to counting the rendered bands when the summary is absent.

### 4.1 Anatomy

```
┌─ FEATURE PROGRESS ──────────────────────────────────────────────────────────┐
│  ███████████████████████████ ▓▓▓▓▓▓▓▓▓ ░░░░░░░                       70% done │
│  └ green: done ──────────────┘└ blue ──┘└ neutral: backlog ┘                  │
│  30 done · 11 in progress · 8 backlog · 43 total                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **One bar, three proportional segments**, in fixed left→right order so the eye reads progress as fill from the left:
  1. **Done** — `--kb-success` (green), solid.
  2. **In progress** — `--kb-accent` (blue), solid.
  3. **Backlog / remaining** — `--kb-neutral-soft` track colour (neutral), so the unfinished remainder reads as "empty track to fill".
- **Needs-you / blocked are NOT their own segments** in the bar (they would double-count — a needs-you ticket is also somewhere in the lifecycle). Instead, if `needsYou > 0`, a **single amber tick mark** sits above the bar at the boundary, with the count beside the % — "11 in progress · 1 needs you". Keeps the bar honest (segments sum to total) while still surfacing the one actionable number.
- **Counts row** below the bar: `{done} done · {inProgress} in progress · {backlog} backlog · {total} total` — only non-zero buckets shown (absent-not-zero), comma/middot separated, `--kb-text-muted`.
- **% complete** right-aligned, bold, `--kb-text`: `round(done / total * 100)% done`. Honest: it is the *done* fraction, labelled "done", never "complete" if a non-done bucket exists.

### 4.2 Dimensions & style

- Bar height: **8px**, `border-radius: 999px`, full width of the worklist, sitting in a `--kb-surface-muted` track.
- Segment min-visibility: a non-zero segment is at least **3px wide** even when its proportion rounds to ~0, so "1 of 200 done" still shows a sliver of green (never a present-but-invisible count). Use `min-width: 3px` on each non-zero segment.
- Gap between segments: **1px** hairline of `--kb-bg` so the colours don't bleed into each other.
- Label "FEATURE PROGRESS": `--kb-text-xs`, uppercase, `letter-spacing: 0.04em`, `--kb-text-muted` — matches band-title typography.
- Spacing: the whole block has `margin-bottom: var(--kb-space-4)` to separate it from the first band.

### 4.3 Honesty + absent rules

- **Shown only when `total > 0`** and there is more than one bucket OR a meaningful split — on a 1-ticket project it still renders (it's truthful), but on the **empty board it is suppressed** (the empty-state invitation owns the screen — same rule as the view-switch suppression, BUILD-SPEC §132).
- **All-done state:** the bar is full green, % reads `100% done`, counts read `43 done · 43 total`. This is a TRUE green (everything is genuinely done) — the calm-pride "shipped" feeling, not a fake all-clear. No amber tick (nothing needs you).
- **All-backlog state:** the bar is a full neutral track, % reads `0% done`, counts `8 backlog · 8 total`. Honest "queued, not started" — neutral, never red, never a fake-green.

### 4.4 a11y for the bar

- `role="progressbar"` with `aria-valuemin="0" aria-valuemax="100" aria-valuenow="{percentDone}"` and an `aria-label` that speaks the real picture: `"Feature progress: 30 of 43 tasks done, 70 percent; 11 in progress, 8 in backlog."` so a screen-reader user gets the same proportion as the sighted glance.
- The counts row is real text (not just colour) — the bar's meaning is fully available without colour vision.
- Testid `worklist-progress` on the container, `worklist-progress-bar` on the bar, `worklist-progress-counts` on the counts row.

---

## 5. PER-STATUS AGENT / GATE VISUAL CUES

The card already shows `[agent] {owner}`, a gate chip (`chip-gate` with `tone--success|danger|muted` + `data-shape='soft|hard'`), and the needs-you reason. Layer colour onto these consistently:

- **Gate chip:** keep its existing tone classes (`tone--success` green / `tone--danger` red / `tone--muted` grey) and `data-shape` (hard = solid border, soft = dashed). These already encode gate state by glyph + text + tone — leave them; they now sit on a tinted card and read fine. Do NOT make the gate chip a filled pill (only the STATUS chip is the filled one, so the card has exactly one "loud" pill + the gate as a quieter outlined chip — one shout per card).
- **Agent/owner cue:** stays `--kb-text-muted` with the `agent` glyph. On a needs-you card whose reason names an owner ("/arch approval pending"), the reason line is amber (already) — the owner there is the *who you're waiting on*, so amber is correct and honest.
- **Needs-you reason glyph** keeps its `loop` / `warning` / `need` glyph (from `needsYouReason`) — colour amber, reinforcing the band.
- **Gate roll-up** (`chip--gate-rollup`, "3/4 gates") stays muted; it is informational, not a status shout.

The rule: **one filled coloured pill per card (status) + at most one outlined tonal chip (the governing gate) + muted everything else.** That keeps each card readable as "one dominant colour + supporting detail", not a rainbow.

---

## 6. ACCESSIBILITY

### 6.1 Colour is ADDITIVE, never the only signal
Every status is carried by **glyph + text + colour** simultaneously:
- Status pill = coloured fill **+ glyph** (`check`/`progress`/`need`/`blocked`/`dot`) **+ label text** ("done"/"in progress"/…). Strip the colour and the pill still says "done" with the check glyph.
- Band header = coloured title **+ glyph + heading text** ("RECENTLY DONE").
- Progress bar = colour **+ counts text + %**.
- The 4px edge is a *reinforcement*, never the sole carrier — no information exists only in the edge colour.
A user with full colour-blindness loses the "scan as colour" speed-up but loses **zero** information. This satisfies BUILD-SPEC §20 / WCAG 1.4.1 (use of colour).

### 6.2 Contrast (≥4.5:1 text on its background; ≥3:1 UI components)

| Element | Foreground | Background | Ratio (dark) | OK |
|---|---|---|---|---|
| Done pill text | #34D399 | `--kb-success-soft` (≈#15392F) | ~7.1:1 | ✓ |
| In-flight pill text | #8AA0FF (`accent-hover`) | `--kb-accent-soft-2` (≈#1B2440) | ~5.0:1 | ✓ |
| Needs-you pill text | #FBBF24 | `--kb-warning-soft` (≈#3A331A) | ~8.4:1 | ✓ |
| Blocked/off-track pill text | #F87171 | `--kb-danger-soft` (≈#3A1F22) | ~5.4:1 | ✓ |
| Backlog pill text | #A4ABBC | `--kb-neutral-soft` | ~4.7:1 | ✓ |
| Card title/body | #F2F4F8 | any soft fill | >12:1 | ✓ |
| 4px status edge (UI component) | saturated hue | card fill | ≥3:1 | ✓ |
| Progress segments (UI) | green/blue/neutral | track | ≥3:1 between adjacent | ✓ |

> `/fe`: verify each pill text ratio with the actual computed `color-mix` output (the values above are computed against the stated α over `--kb-surface` #14171F). If any pill text lands below 4.5:1, lighten the text one step (use the `-hover` variant) rather than darkening the fill. Light-theme pills use the darker light-theme hues on pale fills — verify the same.

### 6.3 Focus
Unchanged: `card-open` keeps the existing `2px outline, --kb-focus-ring`. The new coloured edge is on the `.card` wrapper; the focusable element is the inner `.card__open` button, so focus ring and status edge don't collide. Roving `←/→` and `data-col-index` contract untouched.

### 6.4 Touch targets
The Backlog disclosure toggle and progress block are display/▸ controls; the toggle is a real `<button>` at ≥24px (≥44px under `pointer: coarse`) — reuse the `recently-done-expand` sizing.

---

## 7. REDUCED MOTION

No new motion is introduced by colour — the tint/edge/pill are static. Two motion touchpoints, both already governed by the existing `--kb-dur-*` tokens (zeroed under `prefers-reduced-motion: reduce`):
- **Band reflow / card-arrive** on a live SSE push — unchanged, reuses the existing `card-arrive` keyframe + `[data-motion]` host attribute. A card changing status (e.g. blue→green when it ships) simply re-renders with the new `data-status`; the colour swaps with the existing FLIP, or instantly under reduced motion.
- **Progress bar** — if `/fe` adds a width transition on the segments when counts change, it MUST read `--kb-dur-base var(--kb-ease-out)` so it zeroes under reduced motion. A reduced-motion user sees the bar jump to the new proportion instantly. No pulsing, no indeterminate shimmer, ever (Apex §2.3: no pulsing counts).

---

## 8. ANNOTATED COLOUR MOCK (WIDE worklist — the previously-flat case, now glanceable)

Legend: 🟩 green (done) · 🟦 blue (in-flight) · 🟨 amber (needs-you) · 🟥 red (off-track/blocked) · ⬜ neutral (backlog/waiting). The `█` left of each card = its 4px saturated edge.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for ai-dev-team     43 tasks · [need] 1 need you      View:( • Worklist )( Pipeline)│
│                                                                                                 │
│ FEATURE PROGRESS                                                                                 │  ← §4 progress block
│ 🟩██████████████████████████🟦████████░░░░░░░⬜                                       70% done   │
│ 30 done · 11 in progress · 8 backlog · 43 total                              ▲amber tick (1 need)│
│ ──────────────────────────────────────────────────────────────────────────────────────────────│
│                                                                                                 │
│ 🟨 [need] NEEDS YOU (1)            ← amber title + amber underline · LOUDEST · top               │
│  ┃🟨┌────────────────────┐                                                                       │
│  ┃🟨│ ADT-22  Approve sec │   amber edge · amber soft-fill                                        │
│  ┃🟨│ /arch approval pend │   ← reason, amber                                                     │
│  ┃🟨│ /arch  [🟨 needs you]│   ← filled AMBER status pill                                          │
│  ┃🟨└────────────────────┘                                                                       │
│                                                                                                 │
│ 🟦 [progress] IN FLIGHT (11)      ← blue title + blue underline · LOUD                           │
│  ┃🟦┌──────────────┐ ┃🟦┌──────────────┐ ┃🟦┌──────────────┐   ← grid packs, all blue-edged       │
│  ┃🟦│ ADT-18 SSE    │ ┃🟦│ ADT-19 Auth   │ ┃🟦│ ADT-20 Cache  │                                    │
│  ┃🟦│ /be [🟦 in prog]│ ┃🟦│ /be [🟦 in prog]│ ┃🟦│ /be [🟦 in prog]│   ← filled BLUE pills            │
│  ┃🟦└──────────────┘ ┃🟦└──────────────┘ ┃🟦└──────────────┘                                    │
│                                                                                                 │
│ ⬜ [stack] BACKLOG  ▸ 8 planned     ← QUIET · collapsed · muted grey · click to expand           │
│                                                                                                 │
│ 🟩 [check] RECENTLY DONE (30)                                            see all in Done →       │  ← green block, quiet
│  ┃🟩┌──────────────┐ ┃🟩┌──────────────┐ ┃🟩┌──────────────┐  (opacity .9 — green but tucked)     │
│  ┃🟩│ ADT-30 Board  │ ┃🟩│ ADT-29 Tokens │ ┃🟩│ ADT-28 Shell  │   ← all green-edged · green pills   │
│  ┃🟩└──────────────┘ ┃🟩└──────────────┘ ┃🟩└──────────────┘   …+ 24 more behind "see all"        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Read in one glance, no words:** a long green block low-down (lots shipped), a blue cluster mid (work moving), one amber card up top (the thing that wants me), a quiet grey one-liner for backlog. The proportion bar at the top says "70% done" as a picture. That is the black-and-white mass, killed.

**All-clear variant** (nothing needs you): no amber band, no amber tick — the bar is green+blue+neutral, the top band is IN FLIGHT (blue) or, if all done, the bar is full green at `100% done` and RECENTLY DONE leads. The calm = green/blue/neutral, never red, never a manufactured badge.

---

## 9. Handoff to `/fe`

1. **Tokens:** add the five `--kb-*-soft` fills to BOTH theme blocks in `_tokens.scss` (§1.1).
2. **`board.ts`:** add the pure `cardVisualStatus()` helper (§2.4) — reuses `ticketNeedsYou` + `isBacklog`, no new field.
3. **`#cardTpl` (`tasks-board.component.ts`):** add `[attr.data-status]="cardStatus(t)"` on `.card`; add the per-`data-status` CSS for edge + fill + filled status pill (§2.1, §2.2). Remove the now-superseded `.band--needs-you … .card { border-color }` reliance (colour comes from `data-status`).
4. **`tasks-worklist.component.ts`:** add `band--in-flight|backlog|recently-done` host classes (§3.1); collapse Backlog to a `8 planned ▸` disclosure with `backlog-expand` (§3.3); add the progress block (§4) at the top of `worklist-root`; band-coloured headers (§3.1).
5. **Keep ALL existing testids** (BUILD-SPEC §5.4). New testids: `worklist-progress`, `worklist-progress-bar`, `worklist-progress-counts`, `backlog-expand`.
6. **TDD additions:** progress % = round(done/total·100); bar segments sum to total (needs-you NOT a segment); all-done → 100%/full-green/no-amber; all-backlog → 0%/neutral; progress suppressed on empty board; `cardVisualStatus` precedence table (needs-you beats in_progress; backlog idea with in_progress status → backlog not in-flight); every pill keeps glyph+text (colour-only guard); contrast smoke (computed pill text ≥4.5:1).
7. **a11y:** `role="progressbar"` + real aria-label (§4.4); colour additive only (§6.1); reduced-motion via `--kb-dur-*` (§7).

Status: **Draft** — pending `/po` ratification of the colour semantics (esp. amber=needs-you / red=off-track), then implement.
