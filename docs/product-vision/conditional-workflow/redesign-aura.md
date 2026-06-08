# Deep Design Pass — Workflow Builder, Rule Editor, Label Management, Fan-out (DART Cockpit)

**Author:** Aura (`/ui`) · Senior UI/UX Design Architect
**Type:** Deep visual + interaction + motion redesign — **no code, no gate**. A decision-ready spec for `/fe` to later implement under TDD.
**Date:** 2026-06-08
**Stack constraint:** Angular 21, standalone, OnPush. **Inline-SVG glyphs only — no icon library, no icon font, no exotic Unicode (tofu).** Dark-first, `--kb-*` tokens only, WCAG 2.2 AA.
**Pairs with:** `/apex` (usability, microcopy, mental model). This doc owns the **visual + interaction + motion + label-management UX**; it references the copy Apex owns rather than re-authoring it.

---

## 0. Grounding — what exists, what binds, what I honour

**Read before designing (and read in full):** the two live components `studio/cockpit/src/app/shell/{workflow-builder,stage-rules}.component.ts`; the established design system in `docs/product-vision/{ui-design-interactive.md, ui-design-cockpit-v2.md}` and the sibling investigation `conditional-workflow/ux-aura.md`; the wire contracts in `studio/cockpit/src/app/core/models.ts` (`RuleView`, `LabelDef`, `normalizeLabels`/`normalizeRules`) and `core/control-plane.service.ts`; and the **core writes already shipped** — `hub/lib/api.js` (`workflow/set-rules`, **`workflow/set-labels`**, `label/set`) + `hub/lib/engine.js` (`validateLabels`, `validateRules`).

**The load-bearing facts that make this buildable, not a rewrite:**

1. **The builder already works.** It persists the whole stage list declaratively via `track/set-stages` (one atomic CAS with `expectedRev` + a 409 reconcile banner), drags by the grip with a keyboard pick-up/move/drop alternative, and hosts an inline `StageRulesComponent` per row via a `[rules N]` pill. This pass is a **visual + motion + hierarchy refinement over the same writes** — no new persistence.
2. **`workflow/set-labels` already exists in the core** (`hub/lib/api.js` case `'workflow/set-labels'`). It takes a **name-keyed object** `{ NAME: { settable_by:[…], routes_to?, owner?, meaning? } }`, validates via `engine.validateLabels` (name rules + `settable_by` must be a list), and writes the **complete label map** to the overlay under `expectedRev` CAS — **identical in shape and lifecycle to `set-rules`**. There is **no `setLabels` client method yet** and **no UI** — that is exactly the gap §4 fills. `normalizeLabels()` in `models.ts` already adapts that object into the `LabelDef[]` the editor binds.
3. **`fan_out` is schema-only.** The action enum includes `'fan_out'`, the engine **records it but does not execute parallel branches** (`hub/lib/api.js` comment: "instruct/fan_out are recorded only"). The live editor surfaces it today as a dead `parallel — later` caption inside the action `<select>` — the confusion the brief names. §5 resolves it.

**Design canon honoured (unchanged from the interactive spec §0 / cockpit-v2 §0):**
- Status = **glyph + colour + text**, never colour alone.
- **Hard vs soft gate by SHAPE** (solid vs dashed shield), never hue.
- Surfaces by **elevation/brightness**, not heavy shadow; accent (`--kb-accent`) reserved for live / active / primary.
- Monoline **24×24 inline-SVG** glyphs, `stroke="currentColor"`, `stroke-width ≈ 1.6`, `fill="none"`, `aria-hidden="true"`, each paired with adjacent text.
- Focus = **2px `--kb-focus-ring`, 2px offset, ≥ 3:1**.
- Untrusted text (stage / owner / label / `settable_by` / meaning / prompt / pattern) reaches the DOM through **interpolation only — never `[innerHTML]`** (`no-unsafe-binding` stays green).

**Two source-scan tests bind every wireframe below:**
- `no-tofu-glyphs` forbids literal `⠿ ✕ → ＋ ◧` etc. in component source. **Every symbol in the ASCII wireframes is a diagram placeholder, never markup** — each resolves to a `dart-glyph` name in §6.
- `no-unsafe-binding` forbids `[innerHTML]` of model data.

**What's wrong today (the design problems this pass solves), from the live source + direct user feedback:**
- The builder is a **flat `.rows` list of near-identical rows** (`workflow-builder.component.ts` `.row { … flex-wrap: wrap }`) — a 13-stage track reads as monotonous wallpaper with no grouping, no rhythm, no flow metaphor, and the gate/owner/rule-count compete for the same dense line.
- **No motion at all** — a drag commits with the row simply re-laying; the rule panel snaps open; a save flips a pill with no feedback loop. Nothing *communicates* state transitions.
- The **rule editor is a cramped nested form** (`stage-rules.component.ts` `.editor` inside a `.row`) — a wall of bare `<select>`s, no readable WHEN/THEN rhythm, no inline help, fan-out exposed as dead text.
- **Labels can't be created anywhere.** The allowed-labels strip renders `no labels (per the contract)` (`stage-rules.component.ts` line 106) — a dead end. The core can `set-labels`; the UI offers no door to it.

---

# 1. Workflow builder — visual + interaction redesign

## 1.0 The mental-model shift: a list of rows → a vertical PIPELINE of stage cards

The builder governs a **process that flows top-to-bottom** (vision → … → done). Today's flat rows hide that. The redesign reframes each stage as a **node on a vertical rail**: a connecting spine runs down the left edge through every stage's node, so the eye reads "this is a pipeline I am authoring," matching the board's horizontal pipeline (`ux-aura.md §3`). This is the single change that converts wallpaper into a legible flow — and it is **pure presentational chrome over the existing `working()` signal**, no data change.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [info]  You're editing this project's OVERLAY — the base workflow file is unchanged │  overlay banner (always on)
├──────────────────────────────────────────────────────────────────────────────────┤
│  [preset] Preset  ( • solo )( small-team )( regulated )    [labels 3]  [check] saved│  topbar: preset · LABELS tab · status
├──────────────────────────────────────────────────────────────────────────────────┤
│  Drag a stage by its handle to reorder. No mouse? ⋯ menu or Space-to-pick / Alt+↑↓. │  hint
│                                                                                    │
│   ╷                                                                                │
│   ●━┓ ┌──────────────────────────────────────────────────────────────────────┐    │   ← rail node + card
│   ┃ ┗━│ [grip]  vision                                          [⋯]  [trash]  │    │
│   ┃   │         [agent] /po          (no gate)              [condition] no rules │    │
│   ┃   └──────────────────────────────────────────────────────────────────────┘    │
│   ┃                                                                                │
│   ◆━┓ ┌──────────────────────────────────────────────────────────────────────┐    │   ← ◆ = governed-by-gate node
│   ┃ ┗━│ [grip]  architecture                                    [⋯]  [trash]  │    │
│   ┃   │         [agent] /arch    [shield-solid] ARCH · hard    [condition] 2 rules│  │
│   ┃   └──────────────────────────────────────────────────────────────────────┘    │
│   ┃                                                                                │
│   ◇━┓ ┌──────────────────────────────────────────────────────────────────────┐    │   ← ◇ = soft-gate node (dashed)
│   ┃ ┗━│ [grip]  code_review            [loop] loops            [⋯]  [trash]   │    │
│   ┃   │         [agent] /rev     [shield-dashed] REVIEW · soft [condition] 3 rules│  │
│   ┃   └──────────────────────────────────────────────────────────────────────┘    │
│   ╵                                                                                │
│                                  [ add-stage  + Add stage ]                        │   appends to END
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 1.1 Stage as a CARD (not a flat row) — hierarchy and rhythm

Each stage becomes a **two-line card** so the four facts the user scans for stop competing on one cramped line:

- **Line 1 (identity):** `[grip]` handle · **stage name** (`--kb-text`, weight 600, ~1.05rem — the largest text in the card) · a right-aligned cluster `[⋯]` row-menu · `[trash]`.
- **Line 2 (governance, muted):** `[agent] /owner` · the **gate marker** (`shield-solid` hard / `shield-dashed` soft + short name + `· hard|soft`) or `(no gate)` · the **`[condition] N rules`** pill (the existing `[rules N]`, restyled).
- A **`[loop] loops` marker** appears on line 1 (warning hue, glyph + text) when any rule routes back into this stage — the board-level cycle cue from `ux-aura.md §2.4`, surfaced at authoring time too.

**Why a card, not a row:** the card gives each stage internal vertical rhythm (identity over governance), an obvious bounded drag target, and breathing room (`--kb-space-2` padding vs today's `0.35rem`). Cards sit on `--kb-surface-muted`, 1px `--kb-border`, `--kb-radius-md`; the **active stage** (the one holding the live heartbeat ticket, if known) gets a 1px `--kb-accent` left-edge to tie the builder to the board's progress read.

## 1.2 The rail + node — gate hardness by SHAPE, at a glance

The left rail is a **1.5px `--kb-border` vertical spine**; each stage owns a **node** on it whose shape encodes its gate, reinforcing the canon "hard/soft by shape, never hue":

| Node | Meaning | Drawn as |
|---|---|---|
| `●` filled dot | stage with **no gate** | a solid `--kb-text-muted` dot |
| `◆` solid diamond | stage with a **hard** gate | filled diamond, `--kb-accent` (active) / `--kb-text-muted` |
| `◇` dashed diamond | stage with a **soft** gate | diamond outline with `stroke-dasharray:3 2` (echoes the dashed shield) |
| hollow `○` | the **drop-gap** placeholder during reorder | 2px `--kb-accent` ring |

The node is **non-interactive** (`aria-hidden`); the gate's hard/soft is *also* carried by the shield marker + text on line 2, so the node is pure reinforcement (never the sole signal). The rail's **active segment** (spine from the first node down to the furthest in-progress stage) renders `--kb-accent`, giving a subtle "where work has reached" progress read — the same device as the board rail.

## 1.3 Grouping & rhythm so a 13-stage list is scannable, not monotonous

Three devices break the wallpaper without inventing data:

1. **Phase bands (derived, presentational).** Group consecutive stages by a coarse phase inferred from gate ownership — e.g. *Plan* (`/po /ba /arch`), *Build* (`/fe /be /ui`), *Verify* (`/rev /qa /e2e /secops /verify`). A slim, sticky **band label** (`--kb-text-subtle`, uppercase, `letter-spacing`) sits on the rail between groups: `── BUILD ──`. Bands are a **read-only visual lane derived from owner**, never persisted, never reordered independently — a stage dragged into a new neighbourhood simply re-derives its band. If the owner-to-phase map is ambiguous, the band falls back to a plain rule (no label) so it never lies.
2. **Density rhythm.** Cards are separated by `--kb-space-2`; a band boundary adds `--kb-space-3` + the band label — so the eye gets a "breath" every few stages.
3. **Count-at-a-glance pills.** The `N rules` pill and the `loops` marker give each card a distinguishing silhouette, so even a long list has visual texture rather than identical bars.

## 1.4 The drag affordance (kept, polished)

The live drag model is sound — keep it, sharpen the visuals (motion in §2):
- **Handle-only drag** (the grip), `cursor: grab` → `grabbing`. The row body stays clickable.
- On pickup the card becomes a **lifted ghost** (one elevation up via `--kb-shadow-md`, `--kb-accent` 1px ring, ~0.97 scale, slight opacity); the vacated slot collapses to a **drop-gap** with the hollow node + a 2px `--kb-accent` **insertion line** spanning the card width.
- Drop targets are the **gaps between cards** (and above first / below last); the nearest gap shows the insertion line; other cards ease aside (§2).
- **Keep all three pointer-free paths** already implemented: `Alt+↑/↓`, the `Space`-pickup / arrows / `Space`-drop mode (`aria-grabbed`, assertive announcements), and **Move up / Move down in the `⋯` menu**. This pass adds nothing to the a11y contract — it only restyles.

## 1.5 The `⋯` row-menu (consolidate the per-row actions)

To de-clutter line 1, the kebab carries the secondary actions so the card stays calm:
```
        [⋯]
        ┌──────────────────────────────┐
        │ [advance-up]  Move up          │   (commits set-stages; pointer alt to drag)
        │ [advance-dn]  Move down        │
        │ ─────────────────────────────  │
        │ [condition]   Conditions…      │   (toggles the inline rule panel — §3)
        │ [edit]        Edit gate…       │   (the existing gate-rule editor)
        └──────────────────────────────┘
```
`role="menu"`, arrow-key navigable, `Esc` closes, opens with `Enter`/`Space`/`↓`. Trash stays a visible line-1 button (destructive actions are not buried in a menu).

## 1.6 Lifecycle / save / conflict — unchanged contract, motion added

Reuse the builder's existing pill + reconcile banner verbatim (`saved / editing / saving / conflict / error`). The only change is **motion** (§2.4): a settle/pulse on `saved`, the conflict banner sliding in and taking focus. No new states.

---

# 2. Tasteful MOTION — each animation earns its place

**Principle:** every animation **communicates a state transition the user caused or must notice** — drag physics, panel disclosure, save confirmation, conflict arrival, owner change. Nothing decorative. **All respect `prefers-reduced-motion: reduce` and degrade to instant** (no state is ever carried by motion alone — glyph + text always carry it). All easing/timing are tokenised in §6 so `/fe` has exact values.

| # | Moment | Motion | Why it earns its place | Reduced-motion fallback |
|---|---|---|---|---|
| **M1** | **Drag lift** | On pickup the card scales `1 → 0.97`, raises elevation, gains the accent ring over **120ms `--kb-ease-out`** | Confirms "you've grabbed this" — the card visibly detaches | Instant style swap, no scale/transition |
| **M2** | **Insertion line + neighbours easing aside** | As the pointer crosses a gap, the 2px accent insertion line **fades in (90ms)** and the displaced cards **translate** to make room (`transform`, **160ms `--kb-ease-in-out`**) | Shows *exactly* where the drop lands before release — the #1 drag usability win | Cards **jump** to new positions; insertion line appears instantly |
| **M3** | **Settle on drop** | The dropped card animates from lifted → resting (scale back to 1, elevation down) over **160ms**, then a **one-shot 1px accent ring pulse** (200ms) on its final position | "It landed *here*" — closes the drag gesture with a satisfying, legible endpoint | Card simply appears at rest; no pulse |
| **M4** | **Saved confirm** | When `saving → saved`, the status pill's check **draws** (stroke-dashoffset 0, 240ms) and the just-edited card emits a **single soft accent pulse** (200ms, opacity-only) | Ties the abstract "saved" to the concrete thing you changed | Pill swaps to the static check; no pulse |
| **M5** | **Conflict arrival** | The 409 reconcile banner **slides down + fades in** (180ms) and **takes focus**; a subtle `--kb-warning` left-edge flares once | A conflict is important and must be *noticed*, not missed as a quiet swap | Banner appears instantly (still takes focus, still `role="alert"`) |
| **M6** | **Rule / conditions panel expand** | The inline panel **animates height auto** (clip + fade, **200ms `--kb-ease-out`**); the `[condition]` pill rotates its caret 90° | Disclosure feels intentional, preserves the user's place in the list | Panel toggles open instantly; caret swaps state |
| **M7** | **Owner change feedback** | On selecting a new owner, the `[agent]` chip **cross-fades** the role text (120ms) and the rail node briefly **brightens** | Confirms the change registered on the right stage (selects can feel silent) | Text swaps; no fade/brighten |
| **M8** | **Stage add / delete** | A new appended card **fades + expands in** (200ms); a deleted card **collapses height + fades** (180ms) before the list reflows | Makes structural edits legible rather than a jarring jump | Appear / disappear instantly |
| **M9** | **Spinner (saving)** | The `spinner` glyph arc rotates **only** when motion is allowed | Honest "in flight" cue | **Static three-quarter ring** (already the canon) |

**Implementation note for `/fe`:** M2/M8 use the FLIP technique (measure → invert → play) or Angular's `@if`/`@for` animations gated on a `motionOk` signal derived from `matchMedia('(prefers-reduced-motion: reduce)')`. Height-auto transitions use a clip/grid-rows trick (no JS height measurement needed for M6). Every transition reads its duration/easing from a `--kb-*` token (§6) so reduced-motion can zero them in one place.

---

# 3. Rule editor redesign — the IntelliJ-breakpoint-condition feel

**Goal:** a rule reads as one plain sentence — **"WHEN ‹something happens› THEN DO ‹these actions, in order›"** — approachable, not a wall of selects. The live `stage-rules.component.ts` has the right *grammar* (3 condition types, 4+ action types, AND-chaining, loop badge, allowed-labels strip) but the *presentation* is cramped. This redesign keeps every binding and the `save`/`cancel` outputs identical; it only restyles + adds inline help + resolves fan-out (§5).

## 3.1 Read view — rules as sentence cards (polished)

```
┌─ [condition] Conditions on  code_review ──────────────────────── [+ Add rule] ─┐
│                                                                                 │
│  ┌─ route-rejection-to-backend ─────────────────────────────── [edit] [trash] ┐│
│  │  ▸ WHEN   gate REVIEW [reject] rejected   AND   carries [label] TO_DEV_BE   ││
│  │  ▸ THEN   1. [branch] route to → implement                                 ││
│  │           2. [agent] instruct /be: "Fix the findings labelled TO_DEV_BE…"  ││
│  │           3. [label] clear TO_DEV_BE   · one-shot, prevents an infinite loop││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  This stage's owner /rev may set:  [label] TO_DEV_BE → implement                │
│                                    [label] NEEDS_DESIGN → design                │
│                                    (manage labels in the Labels tab ▸)          │  ← live link to §4
└─────────────────────────────────────────────────────────────────────────────────┘
```

- Each rule is a **sentence card** with a clear **WHEN** band (`condition` glyph) and a **THEN** band (`branch` glyph), actions **numbered** so the in-order semantics read at a glance (today they're flat lines).
- A **backward route** keeps the `[loop] loops back` badge (`--kb-warning`, glyph + text). A `clear_label` keeps its `one-shot, prevents an infinite loop` helper — but moved to a **muted helper line under the action**, not crammed inline.
- The **allowed-labels strip** stays, but its dead-end `no labels (per the contract)` empty state now ends with a **live "manage labels in the Labels tab ▸"** — the bridge to §4 the user was missing.

## 3.2 Edit view — WHEN / THEN, readable rows with inline help

```
┌─ Edit rule ────────────────────────────────────────────────────────────────────┐
│  Name  [ route-rejection-to-backend                              ]               │
│                                                                                  │
│  [condition] WHEN  — all of these must be true (AND)                  [?] help    │  ← section header + inline help
│   ┌────────────────────────────────────────────────────────────── [remove] ──┐  │
│   │  [ Event ▾ ]   [ gate rejected ▾ ]   on gate [ REVIEW ▾ ]                 │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│   ── AND ──                                                                      │
│   ┌────────────────────────────────────────────────────────────── [remove] ──┐  │
│   │  [ Label ▾ ]   ticket carries [ TO_DEV_BE ▾ ]                             │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                          [ condition  + add condition (AND) ]    │
│   ⓘ No conditions = this rule runs whenever the stage runs.    (shown when empty)  │
│                                                                                  │
│  [branch] THEN DO  — these actions run top-to-bottom               [?] help       │
│   ┌─ 1 ──────────────────────────────────────────────────────────── [remove] ─┐ │
│   │  [ Route to stage ▾ ]   → [ implement ▾ ]                                 │ │
│   └─────────────────────────────────────────────────────────────────────────┘ │
│   ┌─ 2 ──────────────────────────────────────────────────────────── [remove] ─┐ │
│   │  [ Instruct ▾ ]   [ /be ▾ ]   "[ Fix the findings labelled… ]"   12 / 2000│ │
│   └─────────────────────────────────────────────────────────────────────────┘ │
│   ┌─ 3 ──────────────────────────────────────────────────────────── [remove] ─┐ │
│   │  [ Clear label ▾ ]   [ TO_DEV_BE ▾ ]   ⓘ one-shot — prevents a loop       │ │
│   └─────────────────────────────────────────────────────────────────────────┘ │
│                                                  [ branch  + add action ]        │
│                                                                                  │
│  [warning] This rule can route backward. A per-ticket loop budget applies; on    │
│            exceedance the ticket gets NEEDS_HUMAN.   (read-only safety note)      │
│                                                                                  │
│                                          [ Cancel ]      [ save  Save rule ]      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**What changed vs the live cramped form:**
- **Sectioned WHEN / THEN headers** with a one-line plain-English subtitle ("all of these must be true (AND)" / "these run top-to-bottom") — teaches the AND/sequence semantics inline.
- **Connector words baked into each row** ("on gate", "ticket carries", "→") so a row reads like a sentence, not three orphan dropdowns. These are static interpolated labels, not data.
- A **`[?] help` disclosure** per section opens a 2–3 line plain explainer (Apex owns the exact copy) — collapsed by default, so the surface stays IntelliJ-simple.
- **Numbered action cards** with generous spacing; the instruct prompt gets a visible **`N / cap` counter** and `aria-describedby` helper.
- **Progressive disclosure preserved**: `type ▾` reveals the next control (the live `@switch` behaviour) — unchanged logic, just laid out with the connector words and breathing room.
- **Empty/first-rule state**: when a stage has no rules, the read view shows the existing empty line restyled as a friendly call to action — `"No conditions yet — add your first rule to route, loop, or instruct on this stage."` + a prominent `[+ Add rule]`. (Apex owns the final wording.)

## 3.3 Cross-rule chain (`then:`) — collapsed advanced affordance

The `RuleView.then?` chain exists in the model but most users never need it. Keep it **out of the default editor**; expose it as an **"also run rule… ▾"** item in the rule card's menu. When set, the read card shows a `↪ then: {rule-name}` line so the sequence is legible. (Matches `ux-aura.md §2.3` — no new behaviour, just confirming it stays collapsed.)

---

# 4. Label management surface — the missing door

**The gap:** rules reference labels (`TO_DEV_BE`, `TO_DEV_FE`, `NEEDS_DESIGN`), but there is **nowhere to create one**. The allowed-labels strip dead-ends at `no labels (per the contract)`. The core already exposes **`workflow/set-labels`** (a declarative, CAS-guarded, name-keyed map — §0 fact 2). This section designs the UI that drives it.

## 4.1 Where it lives — a **Labels tab in the builder topbar**

Labels are **workflow-level** (they belong to the overlay, not to one stage), so the right home is a **`[labels N]` segmented tab in the builder topbar** (beside Preset), not buried in a stage. Activating it swaps the stage-list body for the **label manager** (same in-place region, SSE keeps flowing — no route change). A breadcrumb `‹ Stages | Labels ›` toggles back. Every stage's allowed-labels strip and every rule editor's `label ▾` picker **read the same `labels()` source**, so creating a label here immediately populates the pickers — closing the loop the user named.

## 4.2 Wireframe — Labels manager (list + empty state)

```
┌─ [label] Labels ───────────────────────────────────────── 3 labels ── [+ New label] ┐
│  Labels route tickets between stages and let agents hand work off.                    │  ← one-line purpose (Apex)
│  Defined here, enforced by the engine. Editing writes this project's overlay only.    │  ← honest scope line
│  ──────────────────────────────────────────────────────────────────────────────────  │
│  ┌─ TO_DEV_BE ─────────────────────────────────────────────────────── [edit][trash] ┐│
│  │  routes to → implement   (/be)                                                    ││
│  │  settable by: [agent] /rev   [agent] /qa                                          ││
│  │  "Send a rejected review back to backend to fix findings."                        ││
│  └───────────────────────────────────────────────────────────────────────────────────┘│
│  ┌─ TO_DEV_FE ─────────────────────────────────────────────────────── [edit][trash] ┐│
│  │  routes to → implement   (/fe)        settable by: [agent] /rev                   ││
│  │  "Send a rejected review back to frontend."                                       ││
│  └───────────────────────────────────────────────────────────────────────────────────┘│
│  ┌─ NEEDS_DESIGN ──────────────────────────────────────────────────── [edit][trash] ┐│
│  │  no route (a flag, not a router)      settable by: anyone (*)                     ││
│  │  "Flags work that needs a design pass before build."                              ││
│  └───────────────────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Empty state** (no labels yet — the user's exact situation):
```
┌─ [label] Labels ──────────────────────────────────────── 0 labels ── [+ New label] ┐
│                                                                                     │
│        [label]   No labels yet.                                                     │
│        Create one to route tickets between stages or hand work between agents —     │
│        for example  TO_DEV_BE  to send a rejected review back to backend.           │
│                                                                                     │
│                              [ + Create your first label ]                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Label row anatomy:** the **name** (mono-ish, weight 600, escaped) · a **routing line** — `routes to → {stage} ({owner})` with a `branch` glyph when `routes_to` is set, or a muted `no route (a flag, not a router)` when not · a **`settable by:` line** rendering each agent as an `[agent] /role` chip, or `anyone (*)` when `settable_by` contains `*` · the **meaning** as a muted quoted line (escaped). `[edit]` / `[trash]` on the right.

## 4.3 Wireframe — Create / edit a label

```
┌─ New label ────────────────────────────────────────────────────────────────────┐
│  Name *   [ TO_DEV_BE                                  ]   8 / 64                 │  ← required, capped, escaped
│           Use UPPER_SNAKE — it's a machine routing key, shown on tickets.        │  ← format hint (Apex)
│                                                                                   │
│  Settable by *                                                                    │
│   ( ◦ Specific agents )   ( anyone (*) )                                          │  ← radiogroup
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │ [✓]/rev  [✓]/qa  [ ]/po  [ ]/be  [ ]/fe  [ ]/ui  [ ]/arch  [ ]/secops …  │    │  ← multi-select chips (shown when "Specific")
│   └─────────────────────────────────────────────────────────────────────────┘    │
│   Only these agents may set this label — the engine refuses anyone else.          │  ← honest enforcement line
│                                                                                   │
│  Routes to        [ implement ▾ ]   (none = a flag, no routing)                   │  ← optional stage select
│  Routed work owner[ /be ▾ ]         (who picks the ticket up — optional)          │  ← optional, from owner set
│                                                                                   │
│  Meaning          [ Send a rejected review back to backend to fix findings.  ]    │  ← optional description, escaped
│                                                                                   │
│  ⓘ Saved to this project's overlay; the base workflow file is never changed.      │  ← honest scope (matches builder banner)
│                                                                                   │
│                                            [ Cancel ]      [ save  Save label ]    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Form fields → the `set-labels` map (`{ NAME: { settable_by, routes_to?, owner?, meaning? } }`):**

| Field | Maps to | Rules (client mirror; **server is authority** via `validateLabels`) |
|---|---|---|
| **Name** | the object key | required, trimmed, `≤ NAME_MAX` (64), **unique** within the map (case compare for the warning), no `__proto__`/`constructor`/`prototype`. Live `N / 64`. |
| **Settable by** | `settable_by: []` | a radiogroup: **anyone** → `['*']`; **specific** → the checked `/role` chips. **Must be a list** (the one hard `validateLabels` rule beyond the name). At least one selection required when "specific". |
| **Routes to** | `routes_to` | optional `<select>` of the track's stages; `none` omits it (the label is a flag). |
| **Routed work owner** | `owner` | optional `<select>` from the owner allowlist; meaningful only with a route. |
| **Meaning** | `meaning` | optional free text, escaped on render; the human "what is this for". |

**Write model (identical to rules):** the manager holds the full label map; create/edit/delete all **emit the COMPLETE new map** to a new `ControlPlaneService.setLabels({ labels, expectedRev })` → `POST /api/workflow/set-labels` → the same optimistic + `expectedRev` + **409 reconcile banner** the builder already owns (labels live in the same overlay/`rev` as stages and rules, so a stage edit and a label edit conflict the same way). The client method is the **one net-new addition** to `control-plane.service.ts`; everything else reuses the shipped pattern.

## 4.4 How it feeds the rule editor (closing the loop)

1. The rule editor's **`label ▾` pickers** (`when` label condition, `set_label`, `clear_label`) already read `labels()` / `settableLabels()` — once a label exists, it appears automatically. No change needed beyond labels existing.
2. The **allowed-labels strip** (§3.1) renders the same source; its empty state now links to the Labels tab.
3. **Honest filtering preserved**: the `set_label` picker stays filtered to the stage owner's `settable_by` (the live `settableLabels` computed). A label the owner can't set is **absent**, not greyed — you can't author an unenforceable rule. If the Labels tab defines `TO_DEV_BE` as settable only by `/rev`, then `/rev`'s stage editor offers it and `/be`'s does not. The strip's `aria-label` and the row show the route so the user learns *what the label does* without opening the engine.

## 4.5 States (Labels surface)

| State | Treatment | aria-live |
|---|---|---|
| **empty** (0 labels) | the empty-state card above + `[+ Create your first label]` — never a bare "no data" | — |
| **valid draft** | Save enabled | — |
| **invalid draft** | Save disabled; inline `--kb-danger` under the offending field ("A name is required", "Pick at least one agent, or choose anyone", "That name is too long") | `assertive` on first error |
| **saving** | `[spinner] Saving label…`, form disabled | `polite` |
| **saved** | form collapses to the read row; new/edited row **fades in** (M8); pill "Label saved." | `polite` |
| **delete** | inline confirm: **"Delete TO_DEV_BE? Rules and tickets that reference it keep the raw name but it stops routing."** (honest about dangling references) | `assertive` on open |
| **conflict (409)** | the builder's shared reconcile banner — "This workflow changed; your label wasn't applied." → Discard / Re-apply | `assertive` |
| **in-use warning** (advisory) | when deleting a label referenced by a rule, a non-blocking `[warning]` note lists the referencing rules so the user deletes knowingly | `polite` |

---

# 5. Fan-out resolution — **HIDE it until it works**

**Recommendation: HIDE `fan_out` from the rule editor's action picker until the engine executes parallel branches.** Rationale:

- It is **schema-only** — the engine **records but does not run** it (`hub/lib/api.js`: "instruct/fan_out are recorded only"). Offering an authorable action that silently does nothing is **dishonest UI** and a direct cause of the confusion the user reported.
- The live treatment (`parallel — later` dead caption inside the `<select>`, `stage-rules.component.ts` line 190) is the worst of both worlds: present enough to confuse, inert enough to mislead. An honest product **does not present a control for a capability it lacks** (the placeholder rule in my SKILL: never a live affordance for an unbuilt path).
- Removing it is **low-risk and reversible**: drop `'fan_out'` from the editor's `ACTION_TYPES` list (a presentation array) — the **model keeps the `fan_out` union member**, `normalizeAction`/`denormalizeAction` keep round-tripping it, and any rule that *already* carries a fan-out (e.g. an imported overlay) still **reads** correctly. Authoring a *new* fan-out is simply not offered yet.

## 5.1 The honest read-only treatment for a pre-existing fan-out

If a rule already contains a `fan_out` (overlay import, CLI authoring), the **read card must not pretend it runs**:
```
│  ▸ THEN   2. [hourglass] fan out to: build_be, build_fe   — parallel execution     │
│              is not available yet; this action is recorded but does not run.        │
```
- Rendered with the **`pending`/hourglass glyph + `--kb-text-subtle`**, an explicit *"recorded but does not run yet"* line (Apex owns wording), and **no edit affordance for the fan-out action itself** (the rest of the rule stays editable). This matches the inert "(coming soon)" placeholder discipline: honest, non-navigating, never implying a live capability.

## 5.2 When fan-out lands (forward note for `/fe`, not built now)

When the engine executes parallel branches, the action returns to the picker as **"Fan out to stages"** with a **multi-select of stages** and a **`join: all | any | N` selector** (the parallel `owners:`+`join:` model from `architecture-jorge.md` / `ux-aura.md §3.2`), and the board renders a **split node**. Designing that surface is **deferred with the capability** — this spec only removes the dead control and makes any existing fan-out honest.

---

# 6. Iconography + token / animation notes

## 6.1 New inline-SVG glyphs (add to `GLYPH_NAMES` in `glyph.component.ts`)

All follow the canon: **24×24 viewBox, `stroke="currentColor"`, `stroke-width ≈ 1.6`, `fill="none"`, `aria-hidden="true"`**, colour inherited, paired with text. Most of what this pass needs **already exists** (`condition`, `branch`, `loop`, `label`, `agent`, `edit`, `trash`, `add-stage`, `remove`, `kebab`, `spinner`, `warning`, `info`, `check`, `cross`, `pending`, `preset`, `advance`, `grip`). Net-new:

| New glyph | Used in | Concept (monoline) |
|---|---|---|
| `node-dot` | §1.2 rail node (no-gate stage) | a small filled dot on the rail — reuse `dot` if visually adequate; otherwise a 3px-radius filled circle |
| `node-gate` | §1.2 rail node (gated stage) | a small **diamond** (`M12 7 L17 12 L12 17 L7 12 Z`); hard = filled, soft = outline `stroke-dasharray:3 2` (echoes the shield) — may reuse `agent`'s diamond art at node size |
| `caret` | §3.2 panel expand, menus | a chevron (`M8 10 l4 4 l4 -4`) that rotates 90° on expand (M6) |
| `help` | §3.2 `[?]` inline help disclosure | a circle with a `?` (`circle r9` + a small question stroke + dot) — distinct from `info`'s `i` |
| `phase` *(optional)* | §1.3 band label | a thin bracket/lane mark (`M6 5 v14 M6 12 h12`) — purely decorative beside the band text; omit if the text alone reads |

**Reused unchanged:** `condition`, `branch`, `loop`, `label`, `agent`, `edit`, `trash`, `add-stage`, `remove`, `kebab`, `spinner`, `warning`, `info`, `check`, `cross`, `pending`, `preset`, `advance`, `grip`, `save`, and the **shield** (hard = solid / soft = `stroke-dasharray:3 2`). Gate states stay **glyph + colour + text**; hard/soft stays **shield/diamond shape, never hue**.

## 6.2 Motion tokens (new `--kb-*` — one place reduced-motion zeroes them)

| Token | Value | Used by |
|---|---|---|
| `--kb-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | M1, M3, M6, M8 (enters, settles) |
| `--kb-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | M2 (neighbour reflow) |
| `--kb-dur-fast` | `120ms` | M1 lift, M7 owner cross-fade |
| `--kb-dur-base` | `160ms` | M2 reflow, M3 settle, M8 delete |
| `--kb-dur-slow` | `200ms` | M3/M4 pulse, M6 panel, M8 add |
| `--kb-dur-draw` | `240ms` | M4 check draw |

Under `@media (prefers-reduced-motion: reduce)` set every `--kb-dur-*` to `0ms` and disable `transform`/scale transitions — motion vanishes, glyph + text state remains. (The existing spinner already follows this — keep it.)

## 6.3 Contrast / focus / targets (re-verify the net-new chrome)

- **Contrast ≥ 4.5:1** body text; **≥ 3:1** for the new **rail spine/nodes, the active-segment accent, band labels, label-row chips, settable-by chips, the routing line, the insertion line, and every pulse colour** against their background/border.
- **Focus = 2px `--kb-focus-ring`, 2px offset, ≥ 3:1** on the new **Labels tab, `+ New label`, settable-by checkboxes, routes-to/owner selects, the `[?] help` disclosure, the `caret`/menu items**, and the label `[edit]`/`[trash]`.
- **Targets ≥ 24px (≥ 44px under `pointer:coarse`)**: grips, kebab + menu items, the settable-by chips, the radiogroup segments, all selects, the label row buttons.
- **Focus never obscured** by the sticky topbar / band labels (`scroll-margin`).
- **Reduced motion**: every animation in §2 has its instant fallback listed; no state is motion-only.
- **Escaped untrusted text everywhere**: stage names, owners, **label names, `settable_by` agents, `routes_to`, `meaning`**, rule ids, prompts, patterns — **interpolation only, never `[innerHTML]`** (`no-unsafe-binding` stays green). A regex pattern renders as escaped text inside `/…/`, never executed.

---

# 7. Buildability & handoff notes

- **No new runtime deps, no icon library, no `[innerHTML]`.** New glyphs are inline-SVG additions to `GLYPH_NAMES`; `no-tofu-glyphs` + `no-unsafe-binding` stay green (resolve every wireframe symbol to a §6 glyph — never paste one into a template).
- **The builder redesign is a presentational refactor** over the existing `working()` / `rules()` / lifecycle signals — the rail, cards, phase bands, and all motion are chrome; **no new persistence, no new conflict UX**. Drag, add-stage, gate edit, and rule edit keep their current writes.
- **Label management is one net-new client method** (`setLabels` → the **already-shipped** `POST /api/workflow/set-labels`) plus a `LabelsManagerComponent` + `LabelEditorComponent`, reusing `normalizeLabels` (exists) and the builder's optimistic + `expectedRev` + 409 reconcile (exists). Declarative full-map write, exactly like rules.
- **Fan-out is removed from the editor's action list** (drop `'fan_out'` from the presentation `ACTION_TYPES`); the model union, normalizers, and read-rendering of any pre-existing fan-out stay — an honest, reversible, low-risk change.
- **All surfaces stay dark-first on `--kb-*` tokens**, OnPush, standalone Angular 21, WCAG 2.2 AA. Verify against the **production build served same-origin** (project canon — a dev server's HMR socket never reaches network-idle for screenshot QA).

## 7.1 Suggested build order

1. **Fan-out hide** (smallest, highest honesty win): drop it from the action picker + the read-only "recorded, doesn't run" treatment for any existing fan-out.
2. **Label management** (the missing capability the user explicitly asked for): `setLabels` client method → Labels tab → manager list/empty → create/edit/delete editor → wire the allowed-labels strip's "manage labels" link. Closes the loop into the rule pickers.
3. **Rule editor readability** (WHEN/THEN sections, connector words, numbered actions, inline help, friendlier empty state) — restyle of `StageRulesComponent`, no logic change.
4. **Builder visual redesign** (rail + nodes + stage cards + phase bands + `⋯` menu consolidation) — presentational refactor of `WorkflowBuilderComponent`.
5. **Motion** (M1–M9) last, gated on a `motionOk` signal, each animation reading a `--kb-dur-*`/`--kb-ease-*` token so reduced-motion zeroes them in one place.

## 7.2 Open items for `/po` / `/arch` / `/apex`

1. **Phase bands** (§1.3) derive coarse phases from owner. `/arch` to confirm the owner→phase map is stable enough to be a visual lane (it must fall back to "no band" gracefully, never mislabel). `/po` to confirm phases aid scanning vs add noise.
2. **Labels tab placement** — topbar tab vs a dedicated panel. I recommend the **topbar tab** (labels are workflow-level, same overlay/`rev`). `/po` to confirm the IA.
3. **Label delete semantics** — deleting a referenced label leaves rules/tickets with a dangling raw name (it stops routing). I show an honest advisory; `/arch` to confirm the engine's behaviour matches the copy so the warning never lies.
4. **Microcopy + mental model** — every helper/empty/explainer string above is a placeholder; **`/apex` owns the final wording** (label purpose line, settable-by enforcement line, fan-out "doesn't run yet" line, the WHEN/THEN section subtitles, the `[?]` help bodies). Coordinate so visual and copy land together.

> **Gate:** none requested — this is a deep design investigation. `DESIGN_APPROVED` is **not** recorded here; it fires later, per surface, when these are scoped into tickets and turned into a per-ticket design spec for `/fe`.
