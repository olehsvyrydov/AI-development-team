# Deep Design Pass — Projects Home, Tasks Pipeline, Knowledge Base (DART Cockpit)

**Author:** Aura (`/ui`) · Senior UI/UX Design Architect
**Type:** Deep visual + interaction + motion redesign — **no code, no gate**. A decision-ready spec for `/fe` to later implement under TDD.
**Date:** 2026-06-08
**Stack constraint:** Angular 21, standalone, OnPush. **Inline-SVG glyphs only — no icon library, no icon font, no exotic Unicode (tofu).** Dark-first, `--kb-*` tokens only, WCAG 2.2 AA.
**Pairs with:** `/apex` (mental model, microcopy, what-to-surface). This doc owns the **visual + interaction + motion**; it references copy Apex owns rather than re-authoring it.
**Continues:** `redesign-aura.md` (the workflow-builder deep pass). **This is the design-system continuation across the other three core surfaces** — it reuses that doc's pipeline/rail metaphor, gate-by-shape nodes, calm cards, phase bands, and the **M1–M9 motion language + `--kb-dur-*`/`--kb-ease-*` tokens** so the app reads as one coherent product, not three styles.

---

## 0. Grounding — what exists, what binds, what I honour

**Read before designing (and read in full):** the builder deep pass `conditional-workflow/redesign-aura.md` (the rail/node/card language, phase bands, the **M1–M9 motion table + §6.2 tokens**, the gate-by-shape canon); the established system in `docs/product-vision/ui-design-cockpit-v2.md` (Projects Home card + Project Shell + folder-picker) and the prior sketch `conditional-workflow/ux-aura.md` (pipeline-board + Knowledge-scopes); the positioning in `docs/product-vision/cockpit-promotion-apex.md`; and the **live components** — `studio/cockpit/src/app/projects/{projects-home,project-card,connect-panel,folder-picker}.component.ts` and `shell/{project-shell,tasks-board,base-panel}.component.ts`, plus the glyph source of truth `shell/glyph.component.ts`.

**The load-bearing facts that make this buildable, not a rewrite:**

1. **Projects Home already works.** `ProjectsHomeComponent` renders a first-run pitch (`.empty`) when no project is connected, otherwise a `.head` (title + `needs-you-strip`) over a `.grid` of `ProjectCardComponent`s ending in the `ConnectPanelComponent` cell. The store hydrates each card's profile/state lazily (`hydrated()`), and every at-a-glance signal is **absent-not-zero** (the strip omits "need you" at 0; a card with no roll-up contributes nothing). This pass is a **visual + motion refinement over the same store/signals** — no data change.
2. **The project card already carries the right facts.** `ProjectCardComponent` has the glyph tile, the `security-reviewed` / `blocked-at` **governance badge** (a shield, filled = reviewed / outline = blocked — already shape-not-hue), stack chips, a 2-line description, and the **`{ open, needsYou }` pulse** (`needsYou` chip only `> 0`, warning hue + hourglass glyph). The redesign **re-composes these into a calmer hierarchy and adds tasteful hover/enter motion** — it removes none of the signals.
3. **The board already is the projection a pipeline needs.** `TasksBoardComponent` renders **columns = the active track's stages in order** (`stageColumns`), **status/needs-you/gate as card chips** (never columns), an **off-track lane** (`offTrackGroups`), `overflow-x:auto`, roving `←/→` column focus, an **advance-via-menu** action on the guarded control plane (`expectedRev` + inline 409 conflict), and a `task-detail` modal. The pipeline is a **chrome refactor of this same projection** — the rail, the left Backlog bar, and the done-folder are presentational; **advance stays a routed action, never a drag** (the board deliberately has no card-drag).
4. **The Knowledge panel is the Base panel.** `BasePanelComponent` already has the index breakdown (`indexed/indexing/failed`), the **honest method line** (`Filename index only — connect an embedder…`), a representative-doc list, the live **Add-a-note** form, and the inert **"Manage base — soon"** placeholder (disabled, `aria-disabled`). The redesign **renames "Base" → "Knowledge"**, adds the **scope split + tags + `/kai` propose-inbox**, and polishes — extending the live panel, not replacing it.
5. **The motion tokens already shipped to the glyph set.** `GLYPH_NAMES` already includes `condition`, `branch`, `loop`, `label`, `caret`, `help`, `agent`, `need`, `progress`, `dot`, `blocked`, `advance`, `kebab`, `conflict`, `spinner`, `info`, `warning`, `check`, `cross`, `pending`, `preset`, `edit`, `grip`, `save`, `trash`, `add-stage`, `remove` — so most of what these three surfaces need **exists**. Net-new glyphs are catalogued in §5.

**Design canon honoured (unchanged from `redesign-aura.md §0` / `cockpit-v2 §0`):**
- Status = **glyph + colour + text**, never colour alone.
- **Hard vs soft gate by SHAPE** (solid vs dashed shield), never hue; **node shape** encodes gate hardness (dot / solid diamond / dashed diamond), reinforcing — never the sole signal.
- Surfaces by **elevation/brightness**, not heavy shadow; accent (`--kb-accent`) reserved for live / active / primary.
- Monoline **24×24 inline-SVG** glyphs, `stroke="currentColor"`, `stroke-width ≈ 1.6`, `fill="none"`, `aria-hidden="true"`, each paired with adjacent text.
- Focus = **2px `--kb-focus-ring`, 2px offset, ≥ 3:1**.
- Untrusted text (project title / description / stage / owner / ticket title / doc name / knowledge body / `/kai` proposal text) reaches the DOM through **interpolation only — never `[innerHTML]`** (`no-unsafe-binding` stays green).

**Two source-scan tests bind every wireframe below:**
- `no-tofu-glyphs` forbids literal `⠿ ✕ → ＋ ◧` etc. in component source. **Every symbol in the ASCII wireframes is a diagram placeholder, never markup** — each resolves to a `dart-glyph` name in §5.
- `no-unsafe-binding` forbids `[innerHTML]` of model data.

**What's wrong today (the design problems this pass solves):**
- **Projects Home reads as a plain list, not a launcher.** The grid is a flat `repeat(auto-fill, minmax(17rem))` of near-identical cards landing on first paint with no enter rhythm; the `needs-you-strip` is a thin baseline text run that doesn't *pulse* or invite a click; the first-run `.empty` pitch and the connected grid feel like two unrelated screens. It works, but it isn't *attractive* — it lacks the calm-card polish and the tasteful motion of the builder.
- **The Tasks board is a row of disconnected columns.** Stages float side by side with no connecting rail, no flow metaphor, no left Backlog bar (the user's explicit "train" image), and **done is a normal column** that, as throughput grows, will dominate the horizontal space and bury the in-flight work. There is no visual "where work has reached," no terminal "accomplishments pile."
- **The Knowledge panel is honest but flat and mis-named.** It's called "Base", has no scope split (project vs shared), no tags, and no door to the `/kai` proposals — and visually it's a plain breakdown + list with none of the calm-card / chip harmony the rest of the redesign establishes.

---

# 1. Projects Home — the polished launcher

## 1.0 The mental-model shift: a list → a *launcher* with a needs-you cockpit

The home is the first thing the user sees and the place they return to between projects. It should feel like a **calm mission-control launcher**: a clear "where do I jump in" hierarchy, a **needs-you cockpit strip** that genuinely pulses when something is waiting on the human, calm project cards that lift tastefully on hover and stagger in on load, and a first-run state that is the *same visual family* as the connected grid (not a separate pitch screen). Every change here is **presentational chrome over the existing `store` signals** — no new data, no new endpoint.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [•] DART · Studio                                                                 │  topbar (kept)
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  Your projects                                          4 projects · [need] 3 need you │  head + needs-you cockpit
│  ┌──────────────────────────────────────────────────────────────────────────────┐ │
│  │ [need]  3 tasks across 2 projects are waiting on you   →  payments-api (2) · … │ │  ← NEEDS-YOU STRIP (when >0):
│  └──────────────────────────────────────────────────────────────────────────────┘ │     a real banner, not baseline text
│                                                                                    │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐  │  ← calm card grid (stagger-in)
│  │ [tile]      [shield ok]│  │ [tile]                │  │ [tile]    [shield !]  │  │
│  │ payments-api          │  │ marketing-site        │  │ data-pipeline         │  │
│  │ ┌Java┐┌Spring┐┌Docker┐│  │ ┌Astro┐┌TS┐          │  │ ┌Python┐┌dbt┐         │  │
│  │ VAT-aware billing for │  │ Static marketing site │  │ ELT jobs + warehouse  │  │
│  │ UK merchants.         │  │ for the launch.       │  │ models.               │  │
│  │ ───────────────────── │  │ ───────────────────── │  │ ───────────────────── │  │
│  │ ● connected           │  │ ● connected           │  │ ◐ analysing           │  │
│  │ [check]12 · [need]2 ⟵ │  │ [check]4              │  │ updated just now      │  │  ← pulse: needs-you accented
│  │ updated 2h ago        │  │ updated 1d ago        │  │                       │  │
│  └───────────────────────┘  └───────────────────────┘  └───────────────────────┘  │
│                                                                                    │
│  ┌───────────────────────┐                                                         │
│  │        [ + ]          │   ← ADD CELL (dashed, accent): the connect/add flow     │
│  │   Add a project       │                                                         │
│  │   Pick a folder…      │                                                         │
│  │   [ + Choose folder…] │                                                         │
│  └───────────────────────┘                                                         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 1.1 The needs-you cockpit strip (elevate the global signal)

Today the global "N need you" lives as a thin run of baseline text inside `.head` (`needs-you-strip`). The redesign **keeps that compact count in the head** *and*, when `totalNeedsYou() > 0`, adds a **dedicated needs-you strip** directly under the head — a full-width, calm banner (not red, not alarming: `--kb-warning` left-edge + the `need` hourglass glyph) that says **what** is waiting and **where**, with the projects named as the click-targets:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [need]  3 tasks across 2 projects are waiting on you                               │
│         → payments-api (2)   → data-pipeline (1)                                    │  ← each a router-link to that project
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Why a strip, not just the baseline count:** the single most valuable thing the launcher can do is route the human straight to the work that's blocked on them. The strip makes that the **most prominent actionable thing on the page** without shouting — it's the cockpit's "you're needed here."
- **Absent-not-zero (kept):** the strip is **entirely absent** when `totalNeedsYou() === 0` — the launcher then reads as calm "all clear," and the head shows only `N projects`. No "0 need you," ever.
- **Composition:** `[need]` glyph + the count sentence (Apex owns the exact copy) + a row of **per-project chips** `→ {name} ({n})`, each a `routerLink` to `/projects/{id}` (escaped name). Chips are ordered by descending need count. Caps at ~4 chips with a `+N more` that scrolls the grid (no new route).
- **Motion (M-Home-1, reduced-motion-safe):** on first appearance the strip's `need` glyph does a **single soft pulse** (opacity 1 → 0.6 → 1, `--kb-dur-slow`, once) and the left-edge warning bar **draws in** (`--kb-dur-base`). It is **not** a looping animation — a perpetual pulse is nagging, not informative. Reduced motion: appears instantly, no pulse.
- **a11y:** the strip is `role="status"` `aria-live="polite"` (it already is in spirit — the live `needs-you-strip` is `aria-live="polite"`); its accessible text is the full sentence, the chips are real links with `aria-label="Open {name}, {n} tasks need you"`.

## 1.2 The project card — calmer hierarchy, same signals

Keep every signal the live card has; **re-compose for calm** and add the redesign's card polish:

- **Line of sight, top to bottom:** glyph tile + (optional) governance badge on the head row → **title** on its own full-width line (largest text, weight 600, already clamps to 2 lines and exposes the full name via native `title`) → stack chips → 2-line description → hairline → **footer: status (dot + glyph + text) over the pulse + last-seen**.
- **The pulse becomes the card's heartbeat.** Today it's `{open} open` + an optional `needsYou` chip. The redesign pairs each with its glyph so it reads at a glance and harmonises with the board/strip: **`[check] 12` open · `[need] 2`** when `needsYou > 0`. The `[need]` chip is `--kb-warning` (glyph + text — never colour alone) and is the **one accented element** on an otherwise calm card, so the eye finds "this project needs me" instantly across the grid. Still **absent-not-zero**.
- **Governance badge stays shape-not-hue (kept):** the filled shield "Security-reviewed" (`--kb-success`) vs the outline shield "blocked at {stage}" (`--kb-danger`) — already correct; it sits top-right of the head, never sharing the title's line. This is the at-a-glance governance signal the brief asks to keep harmonious — it reads as a quiet trust mark, not a loud badge.
- **The card stays a single router-link** (the whole tile). A later `⋯` per-card menu (Rename / Re-analyse / Remove) is **out of scope for this pass** (it was already deferred in cockpit-v2) — noted so the head reserves space for it.

### 1.2.1 Card hover / enter motion (tasteful, reduced-motion-safe)

The live card already lifts on hover (`translateY(-2px)`, border → strong, `shadow-md`, 0.15s). The redesign **tokenises and refines** it to match the builder's motion language:

| # | Moment | Motion | Why it earns its place | Reduced-motion fallback |
|---|---|---|---|---|
| **H1** | **Card hover** | `translateY(-2px)` + border → `--kb-border-strong` + elevation `sm → md` over **`--kb-dur-fast` `--kb-ease-out`**; the glyph tile's accent brightens a hair | Confirms the card is a live target; invites the click | Border/elevation swap instantly, no translate |
| **H2** | **Grid enter (load)** | Cards **fade + rise 6px** in a **short stagger** (each ~40ms after the prior, capped so a large grid doesn't cascade slowly), `--kb-dur-base` `--kb-ease-out` | Makes the launcher feel composed and alive on arrival rather than snapping in as a wall | All cards appear at once, no fade/rise |
| **H3** | **Needs-you pulse** (§1.1) | The strip + each card's `[need]` chip glyph do **one** soft opacity pulse on first paint / on transition 0→N | Draws the eye to the one actionable thing, once — not nagging | No pulse; chip simply present |
| **H4** | **Card hydrate** | When `hydrated()` swaps a record-only view for a full profile (title/description/governance arrive), the new text **cross-fades** (`--kb-dur-fast`) rather than hard-popping | The lazy hydrate (a real behaviour today) currently causes a visible text pop; the cross-fade makes it feel intentional | Text swaps instantly |
| **H5** | **Add-cell → analysing** | The connect cell flips to the analysing state with a **height-settle + fade** (`--kb-dur-slow`), the spinner honest (static ring under reduced motion) | Ties the "I picked a folder" action to its in-place result | Instant state swap; spinner static |

All read `--kb-dur-*`/`--kb-ease-*` from `redesign-aura.md §6.2` so reduced motion zeroes them in one place.

## 1.3 The Add cell + connect flow (kept, harmonised)

The `ConnectPanelComponent` (dashed accent cell → folder-picker dialog → analysing → ready: Initialised vs Adopted) is **sound and already shipped** — keep its flow verbatim. The redesign only **harmonises it into the card grid's rhythm**:
- The dashed Add cell sits as the **last grid item** (unchanged), same `min-height` as a card so the grid row aligns; its dashed `--kb-border-strong` + accent `+` glyph mark it as the "create" affordance distinct from the solid project cards.
- The **analysing / ready** states get the H5 height-settle so the in-place flip is calm; the ready state's **"Initialised" vs "Adopted — found existing project"** distinction (already implemented) is kept — it's the honest "which path happened" signal.
- On `ready`, a quiet `aria-live="polite"` line mirrors the outcome ("payments-api adopted — 12 tickets, 8 docs"). No toast system needed; the in-cell line suffices.

## 1.4 First-run / empty state — same visual family

Today the no-project `.empty` is a centred pitch (tile, DART name, anchor line, how-it-works steps, the connect panel, trust chips, docs link) — good copy, but it reads as a *different screen* from the connected grid. The redesign **keeps all the content** and re-frames it so first-run and populated home are obviously the same product:
- Keep the centred hero pitch (anchor + what-it-is + the 3 how-it-works steps + trust chips + docs link) — it's strong onboarding and Apex owns the copy.
- **Visually tie it to the launcher:** the 3 how-it-works steps render as **calm step cards on the same `--kb-surface` / `--kb-radius-lg` / hairline language** as project cards (today they're plain icon+text rows). The connect panel inside the empty state is the **same `ConnectPanelComponent`** (already true) — so the *one control that matters* looks identical in both states.
- **Enter motion:** the hero fades + rises once (`--kb-dur-base`), the steps stagger like H2. Reduced motion: instant.
- This is the brief's "polished launcher, not a plain list" — the empty state becomes the launcher's welcome, not a detour.

## 1.5 States (Projects Home)

| State | Treatment | aria-live |
|---|---|---|
| **loading** (store loading) | the grid shows **skeleton cards** (title bar + 2 desc lines + a footer line; shimmer, static stripe under reduced motion) matching the card silhouette to reduce CLS | — |
| **empty** (no projects, idle) | the first-run hero (§1.4) — never a bare "no projects" | — |
| **populated** | head + needs-you strip (when > 0) + card grid + Add cell | strip `polite` |
| **card hydrating** | per-card skeleton text → H4 cross-fade as profile arrives | — |
| **load error** | the existing top banner `role="alert"` "Couldn't load projects: {err}" (kept) — the grid below still renders any cached views | `assertive` |
| **all-clear** (projects, 0 need-you) | no strip; head reads `N projects`; cards calm, no accented chips | — |

A card failing to hydrate **never blanks the grid** — it falls back to its record-only view (already the behaviour).

---

# 2. Tasks board → an attractive pipeline (the "train")

**Refines, not replaces, the live stage-column board.** Same projection (`stageColumns` / `offTrackGroups`, status/needs-you/gate chips, off-track lane, `overflow-x:auto`, roving focus, advance-via-menu + 409). The redesign realises the user's **image-14 "train"**: a **left Backlog bar**, a **central horizontal pipeline** of stage columns joined by a **connecting rail** (consistent with the builder's rail/node language), task cards flowing through, and a **terminal "done" as a stacked, clickable folder**.

## 2.1 Wireframe — the pipeline (Backlog bar + rail + stage train + done folder)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for payments-api          ‹ scroll the pipeline ›   [◂]  [▸]                            │  cue + paging
│                                                                                                      │
│ ┌─ BACKLOG ─┐   ╷                                                                          ╷         │
│ │ [stack] 6 │   ●━━━━━━━━━━━◆━━━━━━━━━━━◇━━━━━━━━━━━●━━━━━━━━━━━◆━━━━━━━━━━━●━━━━━━━━━━━▣      │   ← RAIL (active-segment accent)
│ │           │  vision      architect…  review      design      backend     frontend    DONE          │
│ │ ┌───────┐ │  /po         /arch ⛨h    /rev ⛨s     /ui         /be [loop]  /fe          ╔══ folder ══╗│
│ │ │ K-31  │ │  (1)         (1)         (0)         (1)         (2)         (1)          ║  [stack]    ║│
│ │ │ idea  │ │  ┌───────┐  ┌───────┐   ┌· · · ·┐   ┌───────┐  ┌───────┐  ┌───────┐     ║   × 27      ║│
│ │ │ /po   │ │  │ K-12  │  │ K-04  │   │ empty │   │ K-18  │  │ K-21  │  │ K-07  │     ║   Done      ║│
│ │ ├───────┤ │  │[prog] │  │[prog] │   └· · · ·┘   │[prog] │  │[prog] │  │[dot]  │     ║ [check]     ║│
│ │ │ K-33  │ │  │/be    │  │/arch  │               │/ui    │  │/be    │  │/qa    │     ╚════════════╝│
│ │ │ idea  │ │  │ [need]│  └───────┘               └───────┘  │[label]│  └───────┘                    │
│ │ │ /ba   │ │  └───────┘                                     │TO_DEV…│                                │
│ │ │  ⋮    │ │                                                └───────┘                                │
│ │ └───────┘ │                                                                                         │
│ │ [+ idea]  │                                                                                         │
│ └───────────┘                                                                                         │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [warning] Off-track (2) — these tasks are in a stage no longer in the track                          │  off-track lane (kept)
│  stage "triage" (removed):  ┌ K-44 [dot] wait /po ┐   ┌ K-45 [dot] wait /po ┐                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 2.2 The left Backlog bar (the user's explicit ask)

The user asked for **"a left bar to keep a backlog and in central part the tasks train."** The Backlog becomes a **distinct, sticky left column**, visually separated from the pipeline so it reads as the *holding pen* before the train, not the first stage of it:

- **Sticky & framed.** `position: sticky; left: 0`, its own panel (`--kb-surface`, 1px `--kb-border`, `--kb-radius-md`), a header **`[stack] BACKLOG` + count**. It stays pinned while the pipeline scrolls horizontally — the backlog is always in view, the train moves past it. A **1px divider + a small gap** separates it from the rail's first node so it's clearly "before vision."
- **What's in it.** Tickets not yet on a track stage — today these would fall to the off-track lane or sit in the first stage. The Backlog holds **`status: idea/triage/unstarted`** tickets (the exact predicate is `/arch`'s to confirm against the ticket model; the UI renders whatever the projection routes here). Cards are the **same `TaskCardComponent`** as the pipeline (id, title, owner chip, status chip) so there's one card design.
- **An explicit entry.** A footer **`[+ idea]`** affordance (or "Add to backlog") lets the human drop a not-yet-scheduled task in. If the backend doesn't yet support a backlog-create, this is an **inert "soon" affordance** (disabled, `aria-disabled`) per the placeholder rule — never a dead live button.
- **Scroll within.** The bar scrolls **vertically** (its own `overflow-y:auto`) independent of the pipeline's horizontal scroll, so a deep backlog never stretches the board.
- **Empty:** "Backlog is clear." (muted) — never a bare empty box.

## 2.3 The stage rail (the "train track")

The single change that turns disconnected columns into a *train*: a **connecting rail** through every column header, **identical in language to the builder's rail** (`redesign-aura.md §1.2`) so authoring and operating the same workflow look related.

- **Rail spine + nodes.** A horizontal **1.5px `--kb-border` rail** runs across the column-header band; each stage owns a **node** whose shape encodes its gate, exactly as the builder:
  | Node | Meaning |
  |---|---|
  | `●` filled dot (`dot` glyph / CSS dot) | stage with **no gate** |
  | `◆` solid diamond | stage with a **hard** gate |
  | `◇` dashed diamond (`stroke-dasharray:3 2`) | stage with a **soft** gate |
  | `○` hollow dot | an **empty** (passed-through) stage |
  | `▣` filled terminal | the **done** folder node (`check` sense) |
- **Active-segment progress.** The rail from the first node up to the **furthest stage holding an in-progress ticket** renders `--kb-accent`; the rest is `--kb-border`. This is the board-level "where has work reached" read — the same device as the builder's active rail. (Glyph + text always carry status too; the accent is reinforcement.)
- **Connector.** Between nodes the rail is a thin line ending in the `advance` chevron sense (the existing `advance` glyph art) — the "flowing right" direction the train travels.
- **Column header** = node + **stage name** (600) + **owner chip(s)** (`agent` glyph + `/role`; **multiple chips** for a parallel stage) + **count** + a **`[loop] loops`** marker when a rule routes back into this stage (warning hue, glyph + text — the cycle cue from the builder/`ux-aura §2.4`).
- **Parallel stage** (plural owners): a **split node** (two small dots) + a tiny `join: all|any|N` caption — legible fan-out/join, matching the arch model. Single-owner stages unchanged.

## 2.4 The cards flowing through (status/needs-you chips — kept)

Card anatomy is the live board's, lightly polished and **identical between Backlog, stages, and the done list** (one `TaskCardComponent`): `id` (mono, muted) · `title` (escaped, clamp 2) · owner chip (`agent` `/role`) · **status chip** (`progress` in-progress / `dot` waiting / `blocked` blocked / `check` done — glyph + colour + text) · **gate-state chips** (shield shape hard/soft + state glyph) · **`need` "needs you"** chip · a **`label` routing-label chip** when the ticket carries one (`TO_DEV_BE`), so you can see *why* a card sits where it does · the `⋯` kebab keeping **Advance** (menu, not drag).

> **Consistency note (carried from `ux-aura §3.3`):** the builder uses **drag** to author stage order (a deliberate act with a strong keyboard alternative). The board adds **no card-drag** — advancing a task is a workflow decision routed through the control plane / rules, not a free drag. The rail communicates flow; **advance stays an explicit, guarded action**. This avoids implying you can drag a task past a gate.

### 2.4.1 Card advance / arrive motion (tasteful, reduced-motion-safe)

The headline "train" motion — a card **leaving** one stage and **arriving** in the next when advanced:

| # | Moment | Motion | Why it earns its place | Reduced-motion fallback |
|---|---|---|---|---|
| **T1** | **Advance commit** | On a successful advance, the card **slides out** of its column toward the rail (translateX + fade, `--kb-dur-base` `--kb-ease-in-out`) and **slides + fades into** the target column, landing with a **one-shot accent ring pulse** (`--kb-dur-slow`) | Makes "it moved to {next stage}" legible as motion along the train, not a silent re-layout | Card disappears from source, appears in target instantly; no slide/pulse |
| **T2** | **Arrive settle** | The arriving card's column **eases its other cards down** to make room (transform, `--kb-dur-base`) | Shows the card joined the queue at that stage | Cards jump to new positions |
| **T3** | **Active-segment advance** | When the furthest in-progress stage moves forward, the rail's **accent segment extends** to the new node (`--kb-dur-slow`) | A subtle "progress reached further" cue | Segment fills instantly |
| **T4** | **Live re-layout** (SSE) | A push that adds/removes/reorders columns **eases** the rail and cards into place (FLIP), with the quiet `aria-live="polite"` "Board updated" (kept) | A CLI agent's change reads as a smooth update, not a jarring snap | Instant re-lay; announcement still fires |
| **T5** | **Done-folder increment** | When a task completes, it **slides into the done folder** and the folder's count **ticks up** with a brief scale-pop on the number (`--kb-dur-fast`) | Celebrates throughput; the train reaches its terminus | Card vanishes into folder; count updates instantly |
| **T6** | **Conflict (409)** | The inline card conflict note (kept) **slides in** (`--kb-dur-base`) and the card **snaps back** to server truth | A conflict must be noticed, never a silent overwrite | Note appears instantly |

All gated on a `motionOk` signal from `matchMedia('(prefers-reduced-motion: reduce)')`, reading `--kb-dur-*`/`--kb-ease-*` (`redesign-aura.md §6.2`). **No status is ever carried by motion** — the status chip + count are the truth; motion only narrates the transition.

## 2.5 The "done" folder (stacked, clickable — the terminus)

The final **done** is **not a normal column** — it's a **stacked folder** that collapses many finished tasks at the rail's end:

- **Closed (default):** a **`folder-stack` tile** showing a **fanned 2–3-card stack** behind a folder face, a big **count "× 27"**, and the label **"Done"**, anchored to the terminal `▣` node. Pure CSS stack (offset + small rotate on two pseudo-cards); **offsets flat, no rotate, under reduced motion**.
- **Sticky to the right edge.** `position: sticky; right: 0` so the **end of the pipeline is always visible** no matter how far you've scrolled the train — you always see where work is heading and how much has arrived.
- **Open (click / `Enter` / `Space`):** expands **in place** (an inline expander below the rail, or a focus-trapped sheet when space-constrained) into a **scrollable list of done cards**, newest-first, each with completion time + final owner. A **search/filter** field appears when the count is large. Closing returns focus to the folder tile.
- **Why a folder:** done accumulates unbounded; a normal column would dominate horizontal space and bury the active pipeline. The folder keeps the train focused on in-flight work while the **stack visually *is* the accomplishment** — the "attractive" celebration the brief wants.
- **a11y:** `<button aria-expanded>`, `aria-label="Done — 27 tasks, activate to view"`; count is text, not badge-only; increments announce `aria-live="polite"` "Done: 28 tasks."

## 2.6 Empty stages, off-track lane, horizontal overflow

- **Empty stage:** a slim **dashed placeholder** card "Nothing in this stage." (kept) so the column/node never vanishes and the rail stays continuous; its node renders **hollow** (`○`) to read "passed-through / empty."
- **Off-track lane (kept verbatim):** a distinct `--kb-warning`-framed lane **below** the pipeline grouping tickets whose stage was removed — openable and advanceable to re-home them. Never dropped, never silently re-keyed.
- **Horizontal overflow:** `overflow-x:auto` with **scroll-snap** to column starts (kept); a **subtle edge-fade** (`mask-image`) on both ends signals more off-screen; **`◂ ▸` rail-paging buttons** in the header page the scroll for pointer users; the roving **`←/→` keyboard** focus across columns is kept and announced. On narrow viewports the train **stays horizontal-scroll** (a pipeline reads as horizontal); columns shrink to `min-width: 11rem` but never stack vertically (that would lose the flow metaphor). The **Backlog bar and Done folder both stay sticky** at their edges, so the operator never loses the "start" and "end" of the train.

## 2.7 Task-detail entry (kept)

Opening a card (its body button, or the `⋯` → Open detail) still opens the **`TaskDetailComponent` modal** (focus-trapped, re-derived from live state by id, `applied` 409-aware) — unchanged. The pipeline only changes how cards are *laid out*, not how they're opened. The detail modal's enter uses the builder's panel-disclosure motion (M6-equivalent: clip+fade, `--kb-dur-slow`; instant under reduced motion).

## 2.8 States (Tasks pipeline)

| State | Treatment | aria-live |
|---|---|---|
| **empty board** | the kept "No tasks yet — the team will create them as work starts." (the rail/backlog/folder are suppressed when there are zero columns and zero off-track) | — |
| **loading** | rail skeleton (nodes + 3 ghost columns) + a backlog skeleton; matches the silhouette | — |
| **populated** | Backlog bar + rail + stage train + done folder + off-track lane | re-layout `polite` |
| **advancing** | the advanced card busy (kept `busyFor`); T1/T2 motion on success | — |
| **conflict (409)** | inline card conflict + Retry (kept); T6 motion | `assertive` |
| **error (non-409)** | inline card error (kept) | `assertive` |
| **all done** (every task in the folder) | the train shows empty/hollow stage nodes + the done folder full ("× N") — a satisfying "all shipped" read, not a blank board | folder count `polite` |

---

# 3. Knowledge base panel ("Base" → "Knowledge")

**Rename "Base" → "Knowledge"** everywhere the panel surfaces (header title, the glyph tile label, the shell panel heading; `data-testid` stays stable where tests depend on it, the visible string changes). Extends the live `BasePanelComponent` with the **scope split** (common/shared vs project), **stack/kind tags**, the **`/kai` propose-inbox**, and the scoped add flow — polished into the redesign's calm-card / chip language.

## 3.1 Wireframe — Knowledge panel (default view)

```
┌─ [base] Knowledge ──────────────────────────────────────────────── 31 items ─┐
│  Local-first — nothing is uploaded. Indexed on this machine.                  │  ← honest framing (always on)
│  ───────────────────────────────────────────────────────────────────────────  │
│  Scope:  ( • This project  18 )  ( Common  13 )            [propose] inbox 2  │  ← scope segmented + inbox entry
│  Filter: [tag] stack ▾ any   [tag] kind ▾ all                                 │  ← tag filters
│  ───────────────────────────────────────────────────────────────────────────  │
│  [check] 16 indexed   [spinner] 1 indexing   [warning] 1 failed               │  ← index breakdown (kept)
│  Filename index only — connect an embedder for semantic recall.               │  ← honest method line (kept)
│  ───────────────────────────────────────────────────────────────────────────  │
│  ┌ coding-style.md          [scope-project]  [tag java] [tag style]  [check] ┐ │  ← doc rows: scope + tags + index
│  ├ webhook-retry-pattern.md [scope-project]  [tag java] [tag pattern][check] ┤ │
│  └ commit-trailer-rule.md   [scope-common]   [tag any]  [tag rule]   [check] ┘ │
│  ───────────────────────────────────────────────────────────────────────────  │
│                              [ + Add knowledge ]          [ Manage  soon ]     │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Header:** the existing `base` glyph tile + **"Knowledge"** + total count. The **honest local-first line is always on** (`--kb-text-muted`): *"Local-first — nothing is uploaded. Indexed on this machine."* (Apex owns final copy.)
- **Scope segmented control** (`role="radiogroup"`): **This project** / **Common**, each with a live count, filtering the list to that scope. *Common* = `scope:common` (the `global` alias); *This project* = `scope:project + project_id`. Segments are the same shape as the builder's preset segments, so the control reads as part of one system.
- **Tag filters:** `stack ▾` (any / java / python / frontend / angular / flutter…) and `kind ▾` (all / pattern / style / rule / context) — cross-type sharing dimensions; filtering is client-side over the loaded set.
- **Doc rows** keep the live name + index status; **add a `scope` chip** (`scope-project` vs `scope-common`) and **tag chips** (`tag` + stack/kind), all untrusted strings interpolated. Rows are calm: name left, chips right, the index status as a trailing glyph+text.
- **Index breakdown + method line** kept verbatim — the honesty cue is non-negotiable.

## 3.2 Wireframe — Add knowledge (scope picker)

```
┌─ Add knowledge ───────────────────────────────────────────────────────────────┐
│  Title  [ Webhook retry pattern                                            ]   │
│  Body   [ Use exponential backoff with jitter; cap at 5 retries…           ]   │
│         [                                                                   ]   │  ← 64 KB cap counter (kept)
│                                                                                │
│  Scope   ( • This project )  ( Common — shared across projects )               │  ← scope picker (default: project)
│  Stack   [ java ▾ ] ( + add )      Kind  [ pattern ▾ ]                          │  ← tags
│                                                                                │
│  [info] Saved locally as a filename-indexed note. Nothing is uploaded.         │  ← honest preview (kept)
│  [info] Common items are recalled by every project whose stack matches.        │  ← scope explainer (only when Common)
│                                                                                │
│                                       [ Cancel ]     [ save  Add to KB ]        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- Extends the live `AddNoteFormComponent` (title + body + 64 KB cap + honest indexing line) with a **scope picker** (default **This project** — the safest, least-sharing default), a **stack** multi-tag, a **kind** select. A contextual explainer appears under **Common** so the user understands the reach *before* sharing.
- Same lifecycle as today: validating → saving (`[spinner] Adding…`) → added (count increments from the returned state, the new row **fades in** like H4) → errors (too-large / failed) with values preserved and `aria-live`.

## 3.3 Wireframe — the `/kai` proposed-knowledge inbox

```
┌─ Proposed knowledge  (from /kai) ──────────────────────────────── 2 pending ─┐
│  /kai noticed these recurring. Approve where they belong, or reject.          │
│  Nothing is shared until you approve.                                         │
│  ───────────────────────────────────────────────────────────────────────────  │
│  ┌─ [propose] "Always add the commit trailer" ──────────────────────────────┐ │
│  │  /kai suggests: scope Common · stack any · kind rule                       │ │
│  │  seen in 4 tickets across 2 projects · proposed 2h ago                     │ │
│  │  Scope on approve:  ( • Common )  ( This project )                         │ │
│  │  Stack [ any ▾ ]   Kind [ rule ▾ ]                                         │ │
│  │                                  [ reject ]   [ approve  Approve as Common ]│ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│  ┌─ [propose] "Angular signals over RxJS for local state" ──────────────────┐ │
│  │  /kai suggests: scope Common · stack frontend,angular · kind style         │ │
│  │                                  [ reject ]   [ approve  Approve as Common ]│ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Reached from the **`[propose] inbox N`** entry in the panel (a count of pending proposals). It is an inbox of **`status: pending`** items `/kai` surfaced — **propose → human-approve → apply**, never auto-applied.
- Each proposal shows **what `/kai` suggests** (scope + tags) and **why** (the recurrence evidence — "seen in 4 tickets across 2 projects"), then lets the user **adjust scope/tags and choose**:
  - **Approve as Common** → `scope:common`, with the confirmed stack/kind (a java-specific learning becomes `common + stack:java`, not blindly global).
  - **Approve as Project** → `scope:project` + this `project_id`.
  - **Reject** → retained for audit, never recalled.
- The primary button's **accessible name reflects the chosen scope** ("Approve as Common" / "Approve as Project"). Honest framing line: *"Nothing is shared until you approve."*
- **Motion (K1):** a resolved (approved/rejected) proposal card **collapses height + fades** (`--kb-dur-base`) and the inbox count ticks down — the same delete-collapse motion the builder uses (M8). Reduced motion: card disappears instantly.

## 3.4 Honest "local-first" framing (non-negotiable)

Three always-on honesty cues (matching the live panel's discipline of never faking a capability):
1. Panel header: **"Local-first — nothing is uploaded. Indexed on this machine."**
2. Method line kept: **"Filename index only — connect an embedder for semantic recall."** (semantic only claimed when an embedder is actually wired).
3. Add/propose previews: **"Saved locally… Nothing is uploaded."** and the inbox **"Nothing is shared until you approve."**

The **Manage** affordance stays an **inert "soon"** chip (disabled, `aria-disabled`) — never a live link to an unbuilt route, per the placeholder rule (already correct in the live panel).

## 3.5 States (Knowledge)

| State | Treatment | aria-live |
|---|---|---|
| **empty (no knowledge)** | "No knowledge yet — add the rules and context your team must follow." + `[+ Add knowledge]` (kept) | — |
| **empty scope** (e.g. Common has 0) | "No common knowledge yet — promote a project note, or approve a /kai proposal." | — |
| **empty inbox** | "No proposals right now — /kai will suggest recurring knowledge here." | — |
| **loading** | breakdown + 3 ghost doc rows (shimmer; static under reduced motion) | — |
| **adding / approving** | `[spinner]` + disabled form/card | `polite` |
| **added / approved** | row/card fades in (H4 / collapses K1); count updates | `polite` |
| **error** (too-large / failed) | inline `--kb-danger`, values preserved | `assertive` |
| **promote project→common** | a row `⋯` "Promote to Common…" re-applies the scope picker to an existing item — explicit, audited, never automatic | `polite` |

---

# 4. Cross-surface consistency — the design system reads as one product

This is the brief's core: the three surfaces must look like **the same app as the builder redesign**. The shared language:

| System element | Builder (`redesign-aura.md`) | Projects Home (§1) | Tasks pipeline (§2) | Knowledge (§3) |
|---|---|---|---|---|
| **Rail + nodes** | vertical rail, gate-by-shape nodes | — (cards, no rail) | **horizontal rail**, same node shapes (dot / solid ◆ / dashed ◇ / hollow ○ / terminal ▣) | — |
| **Active-segment accent** | spine to furthest in-progress stage | — | rail to furthest in-progress stage | — |
| **Calm cards** | stage cards (`--kb-surface-muted`, hairline, `--kb-radius-md`) | project cards + step cards | task cards (one design across backlog/stage/done) | doc rows + proposal cards |
| **Gate by SHAPE** | solid/dashed shield + diamond node | governance badge (filled/outline shield) | gate-state chip shape + node shape | — |
| **Loop marker** | `loop` + "loops" on a stage | — | `loop` + "loops" on a stage header | — |
| **Phase bands** | derived Plan/Build/Verify bands | (could tint the needs-you chips by phase later — out of scope) | the rail's owner sequence already reads as phases; no extra band needed | — |
| **Scope/tag chips** | label chips | stack chips | routing-label chip | scope + tag chips |
| **Motion tokens** | M1–M9, `--kb-dur-*`/`--kb-ease-*` | H1–H5 (reuse the tokens) | T1–T6 (reuse the tokens) | K1 (reuse the tokens) |
| **Honesty / placeholder** | fan-out hidden until it runs | "Initialised vs Adopted" | backlog-add inert if unbuilt | local-first lines + "Manage soon" |

Every motion in §1–§3 reads the **same `--kb-dur-*`/`--kb-ease-*` tokens** defined in `redesign-aura.md §6.2`, so `prefers-reduced-motion: reduce` zeroes them **in one place** for the whole app — including the rail/segment animations, card lifts/staggers, advance slides, folder fan, and proposal collapse.

---

# 5. Iconography — inline-SVG glyphs (no library, no tofu)

All follow the canon: **24×24 viewBox, `stroke="currentColor"`, `stroke-width ≈ 1.6`, `fill="none"`, `aria-hidden="true"`**, colour inherited, paired with text. **Most needed glyphs already exist** in `GLYPH_NAMES`: `progress`, `dot`, `blocked`, `check`, `cross`, `pending`, `kebab`, `advance`, `conflict`, `need`, `agent`, `spinner`, `edit`, `grip`, `save`, `preset`, `info`, `warning`, `remove`, `add-stage`, `trash`, `condition`, `branch`, `loop`, `label`, `caret`, `help` — and the **shield** (hard = solid / soft = `stroke-dasharray:3 2`). Net-new for these three surfaces:

| New glyph | Used in | Concept (monoline) |
|---|---|---|
| `node-dot` | §2.3 rail no-gate node | a small filled dot on the rail (reuse `dot` if adequate; else a 3px-radius filled circle) |
| `node-gate` | §2.3 rail gated node | a small **diamond** (`M12 7 L17 12 L12 17 L7 12 Z`); hard = filled, soft = outline `stroke-dasharray:3 2` (echoes the shield + the builder's node) |
| `pipe` | §2.3 rail connector | a short horizontal line ending in a chevron node — reuse/compose from `advance`'s chevron sense |
| `folder-stack` | §2.5 done folder | a folder outline (`M4 8 h6 l2 2 h8 v9 H4 z`) with **two offset back-edges** peeking above — "many done, collapsed" |
| `stack` | §2.2 Backlog header / count | two–three offset rounded rects (a small pile) — "the holding pen / backlog" |
| `scope-common` | §3 scope chip / picker | a ring with 2–3 small satellite dots — "shared across projects" |
| `scope-project` | §3 scope chip / picker | reuse the existing `project` tile (single solid panel) — "this project only" |
| `tag` | §3 stack/kind chips | a hollow tag outline (same family as `label`, no route sense) — a metadata tag |
| `propose` | §3.3 inbox + propose chips | an inbox tray (`M4 13 h4 l1 2 h6 l1 -2 h4`) with a small up-chevron/spark above — "/kai proposed, awaiting approval" |

**Reused unchanged:** the full list above + the shield. Gate/status stay **glyph + colour + text**; hard/soft stays **shield/diamond shape, never hue**. **Resolve every wireframe symbol to one of these names — never paste a literal glyph into a template** (`no-tofu-glyphs` stays green).

---

# 6. Accessibility (WCAG 2.2 AA) — all three surfaces

**Projects Home (§1):** the needs-you strip is `role="status"` `aria-live="polite"`; its per-project chips are real links with `aria-label="Open {name}, {n} tasks need you"`. Cards stay single router-links with `aria-label`. Skeletons are `aria-hidden` with a `role="status"` "Loading projects" sibling. The governance badge's hard/soft is **shield shape**, not hue. Card hover/enter/pulse motion all have instant fallbacks; the needs-you pulse is **one-shot, never looping**.

**Tasks pipeline (§2):** the rail is a `role="list"` of `role="listitem"` columns with **roving tabindex** (kept); **`←/→`** move across stages, **`↑/↓`** within a column; cards activate with `Enter`/`Space`; advance `⋯` is a `role="menu"`. The **Backlog bar** is a labelled region (`aria-label="Backlog"`) with its own roving list; the **done folder** is a `<button aria-expanded>` whose expanded list traps focus and returns it on close. Rail-paging buttons are real buttons ("Scroll pipeline left/right"). **Focus is never obscured** by the sticky Backlog bar or sticky Done folder (`scroll-margin` reserved) [2.4.11]. **No card-drag** anywhere — advance is keyboard/menu-complete [2.5.7 satisfied by construction]. Horizontal scroll has a keyboard path (roving focus auto-scrolls the focused column into view).

**Knowledge (§3):** scope control is a `role="radiogroup"`; tag filters are labelled selects; the propose-inbox is a list of cards, each with labelled approve/reject buttons whose **accessible name reflects the chosen scope** ("Approve as Common"). The add form mirrors the live form's field grouping + cap counter + `aria-describedby` helper.

**aria-live map:** home needs-you strip = `polite`; home load error = `assertive`; board re-layout = `polite` "Board updated"; advance conflict = `assertive`; done count increment = `polite`; knowledge add/approve = `polite`, errors = `assertive`.

**Contrast / targets / focus (re-verify the net-new chrome):** body text `--kb-text` ≥ 4.5:1; **≥ 3:1** for the rail spine/nodes, the active-segment accent, the needs-you strip warning edge, the Backlog divider, the done-folder stack edges, the scope/tag chips, and every pulse colour against their background/border. **Targets ≥ 24px (≥ 44px under `pointer:coarse`)**: needs-you chips, card links, rail-paging buttons, the done-folder tile, backlog cards, scope segments, tag selects, approve/reject buttons. **Focus = 2px `--kb-focus-ring`, 2px offset, ≥ 3:1** on every net-new interactive element.

**Reduced motion:** every animation in §1–§3 (card lift/stagger, needs-you pulse, hydrate cross-fade, advance slide, arrive settle, active-segment fill, done-folder fan, proposal collapse, spinner) has its instant fallback listed; **no state is conveyed by motion alone** — glyph + text + count always carry it. The done-folder stack renders **flat-offset (no rotate)** under reduced motion; the spinner is a **static three-quarter ring** (already the canon).

**Escaped untrusted text everywhere:** project titles/descriptions, stage names, owners, ticket titles, routing labels, knowledge titles/bodies, doc names, tags, and `/kai` proposal text are **interpolated only — never `[innerHTML]`** (`no-unsafe-binding` stays green). `/kai` proposal text is model-authored → treated as untrusted → escaped.

---

# 7. Buildability & handoff notes

- **No new runtime deps, no icon library, no `[innerHTML]`.** New glyphs are inline-SVG additions to `GLYPH_NAMES`; `no-tofu-glyphs` + `no-unsafe-binding` stay green (resolve every wireframe symbol to a §5 glyph).
- **Projects Home is a presentational refactor** over the existing `ProjectsStore` signals (`projects()`, `hydrated()`, `totalNeedsYou()`, `connectStatus()`): the needs-you strip, calm-card hierarchy, skeletons, and H1–H5 motion are chrome. The needs-you strip needs only the **per-project `needsYou` already in the list roll-up** + the project name (already hydrated) — **no new endpoint**.
- **The Tasks pipeline is a chrome refactor of `TasksBoardComponent`'s existing `columns()` / `offTrack()` projection** — the rail, nodes, active-segment, Backlog bar, and done-folder are presentational; **advance keeps its guarded control-plane write + `expectedRev` + inline 409** (no new persistence, no card-drag). The Backlog predicate (which tickets land in the left bar) is the one item for `/arch` to confirm against the ticket model; until a backlog-create exists the `[+ idea]` affordance is **inert "soon."**
- **Knowledge extends `BasePanelComponent` + `AddNoteFormComponent`** with `scope`/tag fields and a `ProposeInboxComponent` over the `/kai` propose→approve contract. `scope` already exists in the memory payload, so the split is additive; tags + the inbox are the net-new reads. The rename "Base → Knowledge" is a string + tile-label change (keep `data-testid` stable where tests bind).
- **All surfaces stay dark-first on `--kb-*` tokens**, OnPush, standalone Angular 21, WCAG 2.2 AA. **Verify against the production build served same-origin** (project canon — a dev server's HMR socket never reaches network-idle for screenshot QA).
- **Motion reuses `redesign-aura.md §6.2` tokens** — `--kb-dur-fast/base/slow/draw`, `--kb-ease-out/in-out`, gated on one `motionOk` signal; `prefers-reduced-motion: reduce` zeroes them app-wide in one place.

## 7.1 Suggested build order

1. **Knowledge rename + scope/tags** (smallest, additive, closes the "Base → Knowledge" gap): rename, scope segmented control + tag chips/filters over the existing list, the scoped add form. Then the **`/kai` propose-inbox**.
2. **Projects Home polish** (high daily-value, pure chrome): the needs-you strip, calm-card hierarchy + pulse glyphs, skeletons, and H1–H5 motion; tie the first-run state into the same card language.
3. **Tasks pipeline** (the biggest visual lift): the rail + nodes + active-segment over the existing columns, the **left Backlog bar**, the **done folder**, sticky edges + paging, then the T1–T6 advance/arrive motion last.

## 7.2 Open items for `/po` / `/arch` / `/apex`

1. **Backlog predicate (§2.2)** — which tickets land in the left bar (status `idea/triage/unstarted`?). `/arch` to confirm the projection so the bar never mis-sorts; until a backlog-create endpoint exists, `[+ idea]` is inert "soon."
2. **Needs-you strip routing (§1.1)** — confirm the per-project `needsYou` count + name reach the list roll-up (they appear to; `/arch` to verify no N+1).
3. **Done-folder threshold (§2.5)** — always a folder even at 1 done item (proposed), or only above N? `/po` to confirm.
4. **`/kai` proposal text trust (§3.3)** — model-authored, escaped here; `/secops` to confirm no richer rendering is requested.
5. **Microcopy + mental model** — every helper/empty/strip/explainer string above is a placeholder; **`/apex` owns the final wording** (the needs-you sentence, the backlog label, the scope explainers, the local-first lines, the `/kai` evidence phrasing). Coordinate so visual and copy land together.

> **Gate:** none requested — this is a deep design investigation. `DESIGN_APPROVED` is **not** recorded here; it fires later, per surface, when these are scoped into tickets and turned into a per-ticket design spec for `/fe`.
