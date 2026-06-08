# UX Design — Conditional / Looping / Event-Driven Workflow (DART Cockpit)

**Author:** Aura (`/ui`) · Senior UI/UX Design Architect
**Type:** UX design investigation — no code, no gate decision now. Behaviour-only spec for `/fe` to later implement under TDD.
**Date:** 2026-06-08
**Stack constraint:** Angular 21, standalone, OnPush. **Inline-SVG glyphs only — no icon library, no icon font, no exotic Unicode (tofu).** Dark-first, `--kb-*` tokens only, WCAG 2.2 AA.
**Scope:** Four Cockpit surfaces driven by concrete feedback on the live build:
1. Workflow builder — **drag-to-reorder** (replace arrows), append-then-drag to add.
2. The **`when → do`** condition / loop editor on a stage or gate.
3. Tasks as an **attractive horizontal pipeline** with a stacked done-folder.
4. **Knowledge** panel (rename "Base" → "Knowledge") with **scopes** + a `/kai` propose-inbox.

---

## 0. Grounding — what exists, what binds, what I honour

**Read before designing (and read in full):** `docs/product-vision/ui-design-interactive.md` (the established builder / board / Base patterns, the `--kb-*` tokens, the shield-shape gate convention, the §4 inline-SVG glyph catalogue, the optimistic-write + `expectedRev` + 409 reconcile contract, the keyboard/aria conventions); the live components `studio/cockpit/src/app/shell/{workflow-builder,tasks-board,base-panel}.component.ts` and `glyph.component.ts`; and the two sibling investigations in this folder — `architecture-jorge.md` (the `when → do` rule grammar, the event enum, the intent/action split, the label `settable_by` contract, parallel `owners:`+`join:`, the loop budget → `NEEDS_HUMAN`) and `research-anna.md` (the minimal rule schema, the three trigger forms / four action forms, the label taxonomy + published contract, the `scope` + `stack`/`domain`/`kind` knowledge taxonomy, the `/kai` propose→approve flow).

**Design canon honoured (from the interactive spec §0 / cockpit-v2 §0), unchanged:**
- Status = **glyph + colour + text**, never colour alone.
- **Hard vs soft gate by SHAPE** (solid vs dashed shield), never hue.
- Surfaces by **elevation/brightness**, not heavy shadow; accent (`--kb-accent`) reserved for live / active / primary.
- Monoline **24×24 inline-SVG** glyphs, `stroke="currentColor"`, `stroke-width ≈ 1.6`, `fill="none"`, `aria-hidden="true"`, each paired with adjacent text.
- Focus = **2px `--kb-focus-ring`, 2px offset, ≥ 3:1**.
- Untrusted text (stage / owner / label / comment / rule prompt / doc name) reaches the DOM through **interpolation only — never `[innerHTML]`** (`no-unsafe-binding` stays green).

**Two source-scan tests bind every wireframe below:**
- `no-tofu-glyphs` forbids literal `⠿ ✕ → ＋ ◧` etc. in component source. **Every symbol in the ASCII wireframes is a diagram placeholder, never markup** — each resolves to a `dart-glyph` name in §5.
- `no-unsafe-binding` forbids `[innerHTML]` of model data.

**The load-bearing reuse facts (so this is buildable, not a rewrite):**
- The builder already has a **grip button per row** (`move-grip-{stage}`, `glyph-grip`) and **already persists the whole stage list declaratively** via `track/set-stages` as one atomic CAS with `expectedRev` + a 409 reconcile banner. Drag-to-reorder is a **new pointer affordance over the same write** — the keyboard `Alt+↑/↓` path already exists and stays the tested primary.
- The board already renders **columns = workflow stages in order**, **status/needs-you as card chips**, an **off-track lane**, horizontal `overflow-x:auto`, and roving `←/→` column focus. The pipeline is a **visual refinement of that same projection** — no new data.
- Rules/labels live in the **same workflow document + overlay** that the builder already edits (`architecture-jorge.md §1.1`). The condition editor is a **third editor inside the builder**, beside the existing gate-rule editor.
- The Knowledge panel extends the **Base panel** (`scope` already exists in the memory payload as `project|global`; `research-anna.md` adds `common` + `stack`/`domain`/`kind` tags + the `/kai` propose flow).

---

# 1. Surface 1 — Workflow builder: drag-to-reorder (replace the arrows)

## 1.0 The change in one line

Today each stage row carries **two move buttons (▲ up / ▼ down)** *and* an **insert-after `add-stage` arrow** *and* a grip that is keyboard-only. The user wants: **drag the grip to reorder**, **"Add stage" simply APPENDS** (no per-row insert arrow), then **drag the new stage into place**. Keep the **trash** for delete. Remove the per-row up/down buttons *as the primary affordance* — but keep a **pointer-free move** for a11y (the existing `Alt+↑/↓`), surfaced through a small kebab so non-drag pointer users and keyboard users are never stranded.

## 1.1 Wireframe — builder rows, idle (saved)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [info]  You're editing this project's OVERLAY — the base workflow is unchanged │  overlay banner (always on)
├──────────────────────────────────────────────────────────────────────────────┤
│  [preset] Preset  ( • solo ) ( small-team ) ( regulated )      [check] saved   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Drag a stage by its handle to reorder. No mouse? Use the ⋯ menu or Alt+↑/↓.   │  hint (id=reorder-hint)
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ [grip] vision        [agent] /po      (no gate)        [rules 0] [⋯] [trash]│ │  ← drag target row
│  ├──────────────────────────────────────────────────────────────────────────┤ │
│  │ [grip] architecture  [agent] /arch  [shield-solid] ARCH   [rules 2] [⋯] [trash]│
│  ├──────────────────────────────────────────────────────────────────────────┤ │
│  │ [grip] code_review   [agent] /rev   [shield-dashed] REVIEW [rules 3] [⋯] [trash]│
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│                                    [ add-stage  + Add stage ]                  │  appends to END
└──────────────────────────────────────────────────────────────────────────────┘
```

Row anatomy (left→right): **grip** (`glyph-grip`, now the drag handle) · stage name (`--kb-text`, 600) · owner (`glyph-agent` + `/role`, muted; `—` when derived/none) · gate marker (`shield-solid` hard / `shield-dashed` soft + short name, or `(no gate)`) · a **`[rules N]`** pill (new — opens the condition editor, §2; shows the count of `when→do` rules attached to this stage/gate) · a **`⋯` row-menu** (`glyph-kebab`) · **trash** (`glyph-trash`, delete — unchanged, keeps the inline off-track-counting confirm).

**Removed from the row:** the two `▲/▼` move buttons and the per-row `add-stage` insert-after arrow. **Added:** the drag behaviour on the grip; the `⋯` menu (carrying *Move up / Move down / Edit gate / Conditions…* so every pointer action a button used to give is still one click away); the `[rules N]` pill.

## 1.2 The drag affordance (pointer)

- **Handle, not whole-row.** Only the **grip** initiates a drag (`pointerdown` on the grip). Dragging the row body does nothing — this keeps the row's other controls (owner select, edit, trash) clickable and matches the "drag by the 6-dot handle" request. The grip shows `cursor: grab`; during drag `cursor: grabbing`.
- **Lifted card.** On pickup the row becomes a **lifted ghost**: `--kb-surface` raised one elevation (`--kb-shadow-md`), `--kb-accent` 1px ring, ~0.96 scale, slight opacity. The vacated slot collapses to a **drop-gap** rendered as a 2px `--kb-accent` insertion line spanning the row width.
- **Drop targets = the gaps between rows** (and above the first / below the last). As the pointer moves, the nearest gap shows the **insertion line**; other rows ease aside (transform-only; suppressed under reduced motion — they jump). The grammar matches the existing model: a drop computes the **new full ordered stage list** and sends it as **one `track/set-stages`** write (identical to today's reorder commit).
- **Autoscroll** when dragging near the top/bottom edge of a scrolled builder.
- **Cancel** = `Esc` mid-drag or drop outside any target → the row animates home, no write.
- **Touch:** `touch-action: none` on the grip so a vertical drag doesn't scroll the page; a **long-press is not required** (the grip is an explicit handle, so press-and-move starts the drag immediately — lower friction than long-press).

## 1.3 Add stage = APPEND, then drag

- The per-row insert arrow is gone. A **single `[ + Add stage ]` button below the list** (full-width, `glyph-add-stage`) appends a new stage row to the **end** of the working list.
- Adding opens the same inline **new-stage row** the builder has today (required unique name, owner from the allowlist), but it lands **last**. On confirm it's committed (declarative `set-stages`), then the new row is **auto-focused with a one-time coachmark**: *"Added at the end — drag it into place, or use the ⋯ menu."* The coachmark is an `aria-live="polite"` text line, not a tooltip-only cue.
- This is honest and low-surprise: "add" never has to guess *where*; placement is a deliberate second gesture (drag or `Alt+↑`), which is exactly the user's mental model.

## 1.4 Keyboard-accessible drag alternative (WCAG 2.2 — 2.5.7 Dragging Movements)

**Dragging MUST have a single-pointer/keyboard path.** Two are provided; the keyboard one is the tested primary (it already exists in the live builder):

1. **`Alt+↑` / `Alt+↓` on a focused grip** — move the stage up/down one position, committing the same `set-stages` write. `Home`/`End` send to the ends. This is unchanged from today and stays the canonical drag-free reorder.
2. **A keyboard "pick-up / move / drop" mode** on the grip (the explicit grab-move-drop affordance the brief asks for), for parity with the pointer feel:
   - `Space` or `Enter` on the focused grip → **pick up**. The row enters *grabbed* state (same lifted visual), `aria-grabbed="true"`, and an `aria-live="assertive"` announces **"Picked up {stage}, position {n} of {m}. Use Up and Down arrows to move, Space to drop, Escape to cancel."**
   - `↑` / `↓` while grabbed → move the insertion point; each step announces **"{stage} now at position {k} of {m}."** (live, not yet committed).
   - `Space` / `Enter` → **drop** (commit the `set-stages` write); announce **"Dropped {stage} at position {k} of {m}."**
   - `Esc` → cancel, row returns home, announce **"Cancelled. {stage} back at position {n}."**
- The `⋯` row-menu also exposes **Move up / Move down** as plain menu items — a pointer alternative for users who can click but not drag (and a discoverable home for the action the `▲/▼` buttons used to provide).

**This satisfies 2.5.7 three ways over** (arrows, pick-up/drop, menu) — dragging is a pure enhancement, never the only path.

## 1.5 Saving / saved / conflict (reuse the existing optimistic + 409 pattern — no new states)

Drag reuses the builder's existing lifecycle pill and reconcile banner verbatim:

| State | Trigger | Treatment |
|---|---|---|
| **saved** (idle) | no pending edit | pill `[check] saved` (`--kb-success`) |
| **editing** | a drop or pick-up commit is staged | pill `[edit] unsaved changes` (`--kb-warning`) — drag commits immediately like today's reorder, so this is brief |
| **saving** | the `set-stages` POST in flight | pill `[spinner] saving…`; the moved row gets the subtle busy treatment; further drags on it disabled |
| **saved (confirmed)** | 2xx + SSE echoes new `rev` | pill flips to `saved`; `aria-live="polite"` "Workflow saved." |
| **conflict (409)** | server `rev` moved under the drag | **the existing reconcile banner** (`role="alert"`, takes focus): "This workflow changed while you were editing. We reloaded it; your move was not applied. What you tried: moved {stage} to position {k}." → **[Discard my edit] / [Re-apply on top]** (re-stage the move on the fresh order). The dropped row **snaps back to server truth** — never a silent overwrite. |
| **error** (non-409 / `400` non-permutation) | invalid order / network | inline `--kb-danger` "Couldn't save: {terse reason}." + Retry; optimistic move rolled back |

A **concurrent SSE reorder while you are NOT mid-drag** simply re-lays the rows live with a quiet `aria-live="polite"` "Workflow updated" — exactly as the board does today.

## 1.6 Component / state breakdown (Surface 1)

| Concern | Owner | New vs reuse |
|---|---|---|
| Drag pickup/move/drop + insertion line | `WorkflowBuilderComponent` (the grip handler) | **new** pointer + keyboard grab handlers; **reuses** the `set-stages` commit + `working()` signal |
| Drag/grab visual state | a `dragging`/`grabbedIndex` signal | new signals; same lifecycle pill / 409 banner |
| Move-up/down/edit/conditions menu | the `⋯` row-menu | new menu, reuses existing move + gate-edit handlers |
| Append-only Add | the existing add-stage flow, re-pointed to end | reuse |
| Conditions pill `[rules N]` | reads the rule count for this stage/gate from state | new read; opens §2 editor |

---

# 2. Surface 2 — the `when → do` condition / loop editor

**Mental model (the brief's own framing):** *IntelliJ breakpoint-condition simplicity, not a programming language.* A rule reads as one plain-English sentence: **"WHEN ‹something happens›  DO ‹these actions›"**, with **`+ add condition`** to chain. The grammar is the closed, small one from `architecture-jorge.md §1.2` / `research-anna.md §2`: three trigger kinds (label / pattern-in-comment / event), four action kinds (route / set-label / instruct-with-prompt / fan-out), optional chain.

## 2.0 Where it lives

Rules attach to a **stage** (or its **gate**). The `[rules N]` pill on a builder row (§1.1) opens the **Conditions editor** as an **inline expander under that row** — the same in-place pattern as the gate-rule editor, no modal, SSE keeps flowing. It is also reachable from the task-detail and from the `⋯` row-menu ("Conditions…").

## 2.1 Wireframe — conditions list on a stage (collapsed read view)

```
┌─ Conditions on  code_review  ──────────────────────────────────── [+ Add rule] ┐
│                                                                                 │
│  ┌─ Rule  route-rejection-to-backend ───────────────────────────── [edit][⋯] ┐ │
│  │  [cond] WHEN  gate REVIEW was  [reject] rejected   AND  label [label] TO_DEV_BE │
│  │  [branch] DO  → route to  implement                                          │ │
│  │           ↳ instruct  [agent] /be :  "Fix the findings labelled TO_DEV_BE…"  │ │
│  │           ↳ clear label  [label] TO_DEV_BE                                    │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌─ Rule  ping-secops-on-secret ──────────────────────────────────── [edit][⋯] ┐ │
│  │  [cond] WHEN  a comment matches  /api[_-]?key|secret|token/i                  │ │
│  │  [branch] DO  ↳ instruct [agent] /secops : "A comment mentions a secret…"     │ │
│  │           ↳ set label  [label] SECURITY_TOUCHED                               │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  This stage's owner /rev may set:  [label] TO_DEV_BE   [label] TO_DEV_FE         │  ← allowed-labels strip
│                                    [label] NEEDS_DESIGN     (from the contract)  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Each rule reads as a **sentence card**: a **WHEN line** (`glyph-condition`) and one or more **DO lines** (`glyph-branch`, sub-actions indented under `↳`). Loops are made visible (§2.4). The **allowed-labels strip** at the bottom surfaces, per the contract, *exactly which labels this stage's owner may set and where they route* — answering "agents must KNOW their labels."

## 2.2 Wireframe — building a rule (the expanded editor)

```
┌─ Edit rule ─────────────────────────────────────────────────────────────────────┐
│  Name  [ route-rejection-to-backend                        ]                      │
│                                                                                   │
│  WHEN                                                                              │
│   ┌─ condition 1 ──────────────────────────────────────────────────── [remove] ┐ │
│   │  type ▾ [ Event ]   event ▾ [ gate rejected ]   gate ▾ [ REVIEW ]            │ │
│   └────────────────────────────────────────────────────────────────────────────┘ │
│   ──  AND  ──                                                                      │
│   ┌─ condition 2 ──────────────────────────────────────────────────── [remove] ┐ │
│   │  type ▾ [ Label ]   label ▾ [ TO_DEV_BE ]                                    │ │
│   └────────────────────────────────────────────────────────────────────────────┘ │
│                                                  [ cond  + add condition (AND) ]   │
│                                                                                   │
│  DO  (in order)                                                                   │
│   ┌─ action 1 ─────────────────────────────────────────────────────── [remove] ┐ │
│   │  do ▾ [ Route to stage ]   stage ▾ [ implement ]                             │ │
│   └────────────────────────────────────────────────────────────────────────────┘ │
│   ┌─ action 2 ─────────────────────────────────────────────────────── [remove] ┐ │
│   │  do ▾ [ Instruct ]  who ▾ [ /be ]  prompt [ Fix the findings labelled… ]     │ │
│   └────────────────────────────────────────────────────────────────────────────┘ │
│   ┌─ action 3 ─────────────────────────────────────────────────────── [remove] ┐ │
│   │  do ▾ [ Clear label ]   label ▾ [ TO_DEV_BE ]   (one-shot — prevents a loop) │ │
│   └────────────────────────────────────────────────────────────────────────────┘ │
│                                                        [ branch  + add action ]   │
│                                                                                   │
│  [⚠ loop note]  This rule can route backward. A per-ticket loop budget applies;   │
│                 on exceedance the ticket gets NEEDS_HUMAN. (read-only safety note) │
│                                                                                   │
│                                            [ Cancel ]        [ save  Save rule ]   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2.1 The WHEN-selector (type → value, progressive disclosure)

A condition is built **left-to-right, each dropdown revealing the next** — the IntelliJ-simple shape:

| `type ▾` | reveals | values come from |
|---|---|---|
| **Label** | `label ▾` | the project's declared `labels:` (only labels valid here) |
| **Comment matches** | a `pattern` text field + an `in ▾` (comment / title / description) | free text; shown as `/…/i` with a small "matches text in a comment" helper |
| **Event** | `event ▾` (gate passed/rejected/pending, stage entered/left, comment added, assignee changed, label set/cleared, ticket created) → then a qualifier (`gate ▾` for gate events, `stage ▾` for stage events, `by ▾ /agent` optional) | the closed event enum from `architecture-jorge.md §1.2` |

Multiple conditions are joined with a visible **`── AND ──`** divider (the model is AND-of-predicates; OR = a second rule, stated in the helper). `+ add condition (AND)` appends. A rule with **no condition** is allowed and reads "WHEN this stage runs" (the optional-`when` idea from `research-anna.md §2`).

### 2.2.2 The DO-selector (action → target / prompt)

| `do ▾` | reveals | maps to |
|---|---|---|
| **Route to stage** | `stage ▾` (the track's stages) | `route_to_stage` (XOR — exactly one) |
| **Fan out to stages** | a multi-select of stages | `fan_out` (AND — parallel branches; §3 shows the join) |
| **Set / Clear label** | `label ▾` (only labels this rule's owner may set, per contract) | `set_label` / `clear_label` |
| **Instruct** | `who ▾` (a stage owner or specific `/agents`, multi) + a **prompt** textarea with an `N / cap` counter | `target + prompt` directive |

Actions run **in order** (numbered); the `+ add action` button chains them. Each action is a card so it can be removed independently.

### 2.3 Chaining ("+") and how it reads

- **Within a rule:** `+ add condition` (AND-chains predicates) and `+ add action` (sequences the `do:`). These are the two `+` the brief names; both are plain "add another row" buttons with the `glyph-condition` / `glyph-branch` lead icon, so the chain is visually typed.
- **Across rules (`then:` chain):** an advanced **"then run rule…"** affordance in the `⋯` rule-menu lets a rule trigger a follow-on rule (the looping/sequence case). It is **collapsed by default** (most users never need it) — keeping the surface IntelliJ-simple. When set, the read-view shows a **`↪ then: {rule-name}`** line so the chain is legible at a glance.

## 2.4 Making loops & routing labels understandable at a glance

The headline example is the `TO_DEV_BE` / `TO_DEV_FE` reject-loop. The UI makes the *loop* and the *routing* explicit rather than buried:

- **Routing labels are rendered as a distinct chip** (`glyph-label`, a tag shape) in `--kb-accent-soft`, with the **destination shown inline**: `[label] TO_DEV_BE → implement (/be)`. So a reader sees *what the label does* without opening the contract.
- **A backward route is flagged.** When a `route_to_stage` / `fan_out` targets a stage **earlier** than the current one in track order, the DO line gets a **`glyph-loop` badge + "loops back"** text (`--kb-warning`, not red — it's intentional, not an error). This is the "show loops so it's understandable at a glance" requirement.
- **The one-shot guard is visible.** A `clear_label` of the same routing label shows the inline helper **"(one-shot — prevents an infinite loop)"**, teaching the safe pattern from `architecture-jorge.md §1.3`.
- **A stage-level loop chip** appears on the *builder row* and on the *pipeline column* (§3) when any rule routes back into/own that stage: a small **`glyph-loop` "loops"** marker, so the operator sees at the board level that this stage participates in a cycle.
- **Loop-budget safety is always shown, never hidden:** the read-only `⚠ loop note` in the editor (§2.2) and, at runtime, a ticket that hits the budget surfaces a **`NEEDS_HUMAN`** card chip on the pipeline (§3) — the loop becomes a visible "needs you", never a silent spin.

## 2.5 Surfacing an agent's allowed labels (the contract, made visible)

Three honest touchpoints, all rendering from the **single `labels:` source of truth** (`architecture-jorge.md §1.4`) so skill-text and enforcement never drift:

1. The **allowed-labels strip** under a stage's conditions list (§2.1) — *"This stage's owner /rev may set: TO_DEV_BE, TO_DEV_FE, NEEDS_DESIGN"*, each chip showing its route on hover/focus and in its `aria-label`.
2. In the **DO-selector**, the `label ▾` for *Set label* is **filtered to only the labels this owner may set**; a label the owner can't set is absent (not greyed) — you cannot author an unenforceable rule.
3. If a rule's owner attempts a label outside the contract (e.g. via an imported overlay), the rule card shows a **`glyph-warning` "this label isn't settable by {owner}"** notice — mirroring the server's `400` refusal, so the UI never implies a routing that the engine will drop.

## 2.6 States (Surface 2)

| State | Treatment | aria-live |
|---|---|---|
| **empty** (no rules) | "No conditions yet — add a rule to route, loop, or instruct on this stage." + `[+ Add rule]`; never a bare "No data". | — |
| **valid draft** | Save enabled | — |
| **invalid draft** | Save disabled; inline `--kb-danger` under the offending field (e.g. "Pick a target stage", "Prompt is required for Instruct", "Pattern can't be empty") | `assertive` on first error |
| **saving** | `[spinner] Saving rule…`, editor disabled | `polite` |
| **saved** | editor collapses to the read card; pill "Rule saved." | `polite` |
| **conflict (409)** | the builder's shared reconcile banner (rules live in the same overlay/CAS as stages) — "This workflow changed; your rule wasn't applied." → Discard / Re-apply | `assertive` |
| **unreachable/never-terminating lint** | a non-blocking `glyph-warning` badge on the rule card ("may loop without an exit" / "condition can't match") — advisory, from the lint in `architecture-jorge.md R4` | `polite` |

## 2.7 Component / state breakdown (Surface 2)

| Component | Responsibility | Inputs |
|---|---|---|
| `StageConditionsComponent` | the inline expander: rules list (read cards) + allowed-labels strip + Add | `stage`, `rules`, `labels`, `stageOrder` |
| `RuleCardComponent` | one rule's read sentence (WHEN line + DO lines, loop/route badges) | `rule`, `labels`, `stageOrder` |
| `RuleEditorComponent` | the WHEN/DO builder (condition rows, action rows, chain `+`, lint, loop note) | `draft`, `eventEnum`, `labels`, `stageOrder`, `owners` |
| `ConditionRowComponent` | one progressive `type→value` predicate | `condition`, `labels`, `eventEnum`, `stageOrder` |
| `ActionRowComponent` | one `do→target/prompt` action | `action`, `labels`, `stageOrder`, `owners` |
| `AllowedLabelsStripComponent` | renders the contract for this owner | `owner`, `labels` |

All commit through the **same control-plane write + `expectedRev` + 409** the builder already uses (rules are an overlay patch, per `architecture-jorge.md §1.1`).

---

# 3. Surface 3 — Tasks as an attractive workflow PIPELINE

**Refines, not replaces, the existing stage-column board.** Same projection (columns = stages in order; status/needs-you as chips; off-track lane; horizontal overflow), restyled into a **horizontal pipeline** with a connecting rail, with **done** collapsed into a **stacked, clickable folder**.

## 3.1 Wireframe — the pipeline

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [info] Tasks for  Knowledge-Base service          ‹ scroll the pipeline ›   ←  →        │
│                                                                                          │
│  Backlog ──▸ Vision ──▸ Architecture ──▸ Security ──▸ Design ──▸ Backend ──▸ Frontend ──▸ Review ──▸ Test ──▸ ▣ Done │  ← stage rail
│   (2)        (1)         (1) [agent]/arch  (0)        (1)        (2) [loop]   (1)        (3)        (1)     ╔══ 27 ══╗ │  ← count + owner + loop
│  ┌──────┐  ┌──────┐    ┌──────────────┐  ┌ · · ┐   ┌──────┐   ┌──────┐    ┌──────┐    ┌──────┐  ┌──────┐  ║┌────┐ ║ │
│  │ K-12 │  │ K-09 │    │ K-04         │  │empty│   │ K-18 │   │ K-21 │    │ K-30 │    │ K-07 │  │ K-15 │  ║│done│ ║ │  ← stacked
│  │ ▣ wip│  │ ◷ wait│   │ ◑ in prog    │  │ · · ┘   │ ◑ wip│   │ ▣ wip│    │ ⛔blk │    │ ◑ wip│  │ ◷wait│  ║│ ×27│ ║ │     folder
│  │/be ⚑ │  │/po   │    │/arch ⚑you    │  └ · · ┘   │/ui   │   │/be   │    │/fe ⚑ │    │/rev  │  │/qa   │  ║└────┘ ║ │
│  └──────┘  └──────┘    │ K-02         │             └──────┘   │ K-22 │    └──────┘    │ K-08 │  └──────┘  ╚═══════╝ │
│            ┌──────┐    │ ◷ wait       │                        │ ◑ wip│               │ ▣ wip│                       │
│            │ K-11 │    │/arch         │                        │/be   │               │/rev  │                       │
│            │ ◷ wait│   └──────────────┘                        └──────┘               └──────┘                       │
│            └──────┘                                                                                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [warning] Off-track (2) — these tasks are in a stage no longer in the track             │  ← off-track lane (kept)
│   stage "triage" (removed):  ┌ K-44 ◷ wait /po ┐   ┌ K-45 ◷ wait /po ┐                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3.2 The stage rail (the "attractive" upgrade)

- **A connecting rail** runs through every column header: each stage is a **node** (a small filled dot in `--kb-text-muted`, `--kb-accent` for the stage that currently holds the *active* heartbeat ticket) joined by a **`glyph-pipe` connector** (a thin `1.5px` line + a chevron node, the existing `glyph-advance` direction sense). This turns disconnected columns into a readable flow — the single visual change that makes it "a pipeline."
- **Column header** = node + **stage name** (600) + **owner chip** (`glyph-agent` `/role`; **multiple chips** when a stage has parallel `owners:` per `architecture-jorge.md §2.3`) + **count** (`taskSummary`) + a **`glyph-loop` "loops"** marker when a rule routes back here (§2.4).
- **Parallel stage** (plural owners): the node renders as a **split node** (two small dots) and a tiny **`join: all|any|N`** caption under the header, so fan-out/join is legible on the board (matches the arch model). Single-owner stages are unchanged.
- **Tokens:** column `flex: 0 0 13rem`; rail line `--kb-border` (inactive) / `--kb-accent` (active segment up to the furthest in-progress stage — a subtle progress read); header bottom-border `--kb-border`.

## 3.3 The cards (status / needs-you as chips — kept)

Card anatomy is the live board's, lightly polished: `id` (mono, muted) · `title` (escaped, clamp 2) · owner (`glyph-agent` `/role`) · **status chip** (`glyph-progress` in-progress / `glyph-dot` waiting / `glyph-blocked` blocked / `glyph-check` done — glyph + colour + text) · **gate-state chips** (shield-shape hard/soft + state glyph) · **`glyph-need` "needs you"** chip · a **`glyph-label` routing-label chip** when the ticket currently carries one (e.g. `TO_DEV_BE`), so you can see *why* a card is where it is. The `⋯` kebab keeps the **Advance** action (menu, not drag — consistent with the board's D-002 decision: card movement here is **not** drag-based; the rail communicates flow, advance stays an explicit action).

> **Note on consistency:** §1 introduces drag for **builder stage reorder** (a deliberate authoring act with a strong keyboard alternative). The **board does NOT add card-drag** — advancing a task is a workflow decision routed through the control plane / rules, not a free drag. Keeping these distinct avoids implying you can drag a task past a gate.

## 3.4 The "done" folder (stacked, clickable)

The final **done** is **not a normal column** — it's a **stacked folder** that collapses many accomplished cards:

- **Closed (default):** a `glyph-folder-stack` tile showing **a fanned 2–3-card stack** behind a folder face, a big **count ("× 27")**, and a label **"Done"**. It sits at the rail's end as the terminal node (a filled `glyph-check` node). Pure CSS stack (offset + rotate on two pseudo-cards); suppressed offsets under reduced-motion.
- **Open (click / `Enter` / `Space`):** expands **in place** (an inline expander below the rail, or a focus-trapped sheet if space-constrained) into a **scrollable list of done cards**, newest-first, each with its completion time and final owner. A search/filter field appears when count is large. Closing returns focus to the folder tile.
- **A11y:** the tile is a `<button>` `aria-expanded`, `aria-label="Done — 27 tasks, activate to view"`. The count is text, not a badge-only. Live increments announce `aria-live="polite"` "Done: 28 tasks."
- **Why a folder:** done accumulates unbounded; a normal column would dominate horizontal space and bury the *active* pipeline. The folder keeps the pipeline focused on in-flight work while celebrating throughput (the "attractive" ask) — the stack visually *is* the accomplishment.

## 3.5 Horizontal overflow (many stages)

- The pipeline is `overflow-x: auto` with **scroll-snap** to column starts (already on the live board). A **subtle edge-fade** (`mask-image` gradient) on both ends signals more off-screen; **`←/→` rail buttons** in the header page the scroll for pointer users; the existing roving **`←/→` keyboard** focus across columns is kept and announced.
- **Sticky terminal:** the **done folder is position-sticky to the right edge** so the "end of the pipeline" is always visible no matter how far you've scrolled — you always see where work is heading.
- On narrow viewports the rail stays horizontal-scroll (a pipeline reads as horizontal); columns shrink to `min-width: 11rem` but never stack vertically (that would lose the flow metaphor).

## 3.6 Empty stages & the off-track lane

- **Empty stage:** a slim **dashed placeholder** card "Nothing in this stage." (kept from the live board) so the column/node never vanishes and the rail stays continuous. The node renders hollow (outline dot) to read "passed-through / empty" at a glance.
- **Off-track lane** (kept verbatim from the live board): a distinct lane **below** the pipeline, `--kb-warning` framed, grouping tickets whose stage was removed — openable and advanceable to re-home them. Never dropped, never silently re-keyed.

## 3.7 States & live (Surface 3)

Unchanged from the live board's contract: pure projection of the single `state` input; **every SSE push re-lays the rail live** (columns/nodes appear/disappear/reorder; a removed stage's tickets fall to off-track) with a quiet `aria-live="polite"` "Board updated"; **Advance** rides the guarded control plane with `expectedRev`; a **409** surfaces the inline card conflict + Retry and adopts the returned state.

## 3.8 Component / state breakdown (Surface 3)

| Component | Responsibility | New vs reuse |
|---|---|---|
| `PipelineRailComponent` | the connecting rail: nodes, connectors, active-segment, loop markers, parallel split-nodes | **new** chrome over existing `columns()` |
| `StageColumnComponent` | header (node+name+owner chips+count+loop) + cards + empty placeholder | refactor of the board column |
| `TaskCardComponent` | card with status/gate/needs-you/routing-label chips + advance menu | reuse + routing-label chip |
| `DoneFolderComponent` | the stacked folder (closed tile + expanded list + search) | **new** |
| `OffTrackLaneComponent` | the kept off-track grouping | reuse |

---

# 4. Surface 4 — Knowledge panel (rename "Base" → "Knowledge") with scopes

**Rename "Base" → "Knowledge"** everywhere the panel surfaces (header title, the `glyph` tile, `data-testid` stays stable where tests depend on it, but the visible string changes). Extends the live Base panel with the **scope split** (common vs project), **cross-type tags**, and the **`/kai` propose-inbox** from `research-anna.md §Q2`.

## 4.1 Wireframe — Knowledge panel (default view)

```
┌─ [base] Knowledge ───────────────────────────────────────── 31 items ─┐
│  Local-first — nothing is uploaded. Indexed on this machine.           │  ← honest framing (always on)
│                                                                        │
│  Scope:  ( • This project  18 )  ( Common  13 )                        │  ← scope segmented control
│  Filter: [stack ▾ any] [kind ▾ all]                  [propose-inbox 2] │  ← tag filters + inbox entry
│  ───────────────────────────────────────────────────────────────────  │
│  [check] 16 indexed   [spinner] 1 indexing   [warning] 1 failed        │  ← index breakdown (kept)
│  Filename index only — connect an embedder for semantic recall.        │  ← honest method line (kept)
│  ───────────────────────────────────────────────────────────────────  │
│  ┌ coding-style.md            [scope-project]  [tag java] [tag style] ┐│  ← doc rows w/ scope + tags
│  ├ webhook-retry-pattern.md   [scope-project]  [tag java] [tag pattern]┤│
│  └ commit-trailer-rule.md     [scope-project]  [tag any]  [tag rule]  ┘│
│  ───────────────────────────────────────────────────────────────────  │
│                       [ add  + Add knowledge ]      [ Manage  soon ]    │
└────────────────────────────────────────────────────────────────────────┘
```

- **Header:** `glyph-base` tile + **"Knowledge"** + total count. **Honest local-first line is always on** (`--kb-text-muted`): *"Local-first — nothing is uploaded. Indexed on this machine."*
- **Scope segmented control** (`role="radiogroup"`): **This project** / **Common**, each with a live count. It filters the doc list to that scope. Common = `scope:common` (the `global` alias); This project = `scope:project + project_id`.
- **Tag filters:** `stack ▾` (any / java / python / frontend / angular / flutter…) and `kind ▾` (all / pattern / style / rule / context) — the cross-type sharing dimensions from `research-anna.md §2`. Filtering is client-side over the loaded set.
- **Doc rows** keep the live name + index status, **add a `scope` chip** (`glyph-scope-project` vs `glyph-scope-common`) and **tag chips** (`glyph-tag` + stack/kind). All untrusted strings interpolated.
- **Index breakdown + method line** kept verbatim (indexed/indexing/failed; honest filename-vs-semantic line).

## 4.2 Wireframe — Add knowledge (scope picker)

```
┌─ Add knowledge ──────────────────────────────────────────────────────┐
│  Title  [ Webhook retry pattern                                    ]   │
│  Body   [ Use exponential backoff with jitter; cap at 5 retries…   ]   │
│         [                                                           ]   │
│                                                                        │
│  Scope   ( • This project )  ( Common — shared across projects )       │  ← scope picker
│  Stack   [ java ▾ ]   ( + add )    Kind  [ pattern ▾ ]                  │  ← tags
│                                                                        │
│  [info] Saved locally as a filename-indexed note. Nothing is uploaded. │  ← honest preview
│  [info] Common items are recalled by every project whose stack matches.│  ← scope explainer (when Common)
│                                                                        │
│                                   [ Cancel ]     [ save  Add to KB ]    │
└────────────────────────────────────────────────────────────────────────┘
```

- Extends the live add-note form (title + body + the 64 KB cap + honest indexing line) with a **scope picker** (default **This project** — the safest, least-sharing default per `research-anna.md §2`), a **stack** multi-tag, and a **kind** select. A contextual explainer appears under **Common** so the user understands the reach before sharing.
- Same lifecycle as today: validating → saving (`[spinner] Adding…`) → added (count increments from the returned state) → errors (too-large / failed) with values preserved and `aria-live`.

## 4.3 Wireframe — the `/kai` proposed-knowledge inbox

```
┌─ Proposed knowledge  (from /kai) ─────────────────────────── 2 pending ─┐
│  /kai noticed these recurring. Approve where they belong, or reject.     │
│  Nothing is shared until you approve.                                    │
│                                                                          │
│  ┌─ [propose] "Always add the commit trailer" ───────────────────────┐  │
│  │  /kai suggests: scope Common · stack any · kind rule                │  │
│  │  seen in 4 tickets across 2 projects · proposed 2h ago             │  │
│  │  Scope on approve:  ( • Common )  ( This project )                 │  │
│  │  Stack [ any ▾ ]   Kind [ rule ▾ ]                                 │  │
│  │            [ reject ]   [ approve  Approve as Common ]              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌─ [propose] "Angular signals over RxJS for local state" ───────────┐  │
│  │  /kai suggests: scope Common · stack frontend,angular · kind style │  │
│  │            [ reject ]   [ approve  Approve as Common ]              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

- Reached from the **`[propose-inbox N]`** entry in the panel (a count badge of pending proposals). It is an inbox of **`status: pending`** items `/kai` surfaced (`research-anna.md §Q2.4`), **propose → human-approve → apply**, never auto-applied.
- Each proposal shows **what `/kai` suggests** (scope + tags) and *why* (the recurrence evidence — "seen in 4 tickets across 2 projects"), then lets the user **adjust scope/tags and choose**:
  - **Approve as Common** → `scope:common`, `status:approved-common`, with the confirmed stack/kind (so a java-specific learning becomes `common + stack:java`, not blindly global).
  - **Approve as Project** → `scope:project` + this `project_id`.
  - **Reject** → `status:rejected` (retained for audit, never recalled).
- The primary button **reflects the selected scope** ("Approve as Common" / "Approve as Project"). Honest framing line: *"Nothing is shared until you approve."*

## 4.4 Honest "local-first" framing (non-negotiable)

Three always-on honesty cues (matching the live panel's discipline of never faking a capability):

1. Panel header: **"Local-first — nothing is uploaded. Indexed on this machine."**
2. Method line kept: **"Filename index only — connect an embedder for semantic recall."** (semantic only claimed when an embedder is actually wired).
3. Add/propose previews: **"Saved locally… Nothing is uploaded."** and the propose-inbox **"Nothing is shared until you approve."**

The **Manage** affordance stays an **inert "soon"** chip (disabled, `aria-disabled`) — never a live link to an unbuilt route, per the placeholder rule.

## 4.5 States (Surface 4)

| State | Treatment |
|---|---|
| **empty (no knowledge)** | "No knowledge yet — add the rules and context your team must follow." + `[+ Add knowledge]` (kept) |
| **empty scope** (e.g. Common has 0) | "No common knowledge yet — promote a project note, or approve a /kai proposal." |
| **empty inbox** | "No proposals right now — /kai will suggest recurring knowledge here." |
| **adding / approving** | `[spinner]` + disabled + `aria-live="polite"` |
| **error** (too-large / failed add) | inline `--kb-danger`, values preserved, `assertive` |
| **promote project→common** | the same picker re-applied to an existing item (a row `⋯` "Promote to Common…") — explicit, audited, never automatic (`research-anna.md §Q2.4`) |

## 4.6 Component / state breakdown (Surface 4)

| Component | Responsibility | New vs reuse |
|---|---|---|
| `KnowledgePanelComponent` | header (renamed) + local-first line + scope control + filters + breakdown + list + add | refactor of `BasePanelComponent` |
| `ScopeControlComponent` | This-project / Common segmented filter with counts | **new** |
| `KnowledgeDocRowComponent` | name + index status + scope chip + tag chips | extends the live `.doc` row |
| `AddKnowledgeFormComponent` | the add form + scope picker + tag pickers | extends `AddNoteFormComponent` |
| `ProposeInboxComponent` | the `/kai` pending list, per-item scope/tag adjust + approve/reject | **new** |

---

# 5. Iconography additions (inline-SVG concepts — no library, no tofu)

All follow the canon: **24×24 viewBox, `stroke="currentColor"`, `stroke-width ≈ 1.6`, `fill="none"` (monoline), `aria-hidden="true"`**, colour inherited, paired with text. Add these to `GLYPH_NAMES` in `glyph.component.ts`. **Each wireframe symbol above resolves to one of these — never paste a literal glyph into a template.**

| New glyph name | Used in | Concept (so `/fe` can draw it monoline) |
|---|---|---|
| `grip` *(exists)* | §1 drag handle | Two columns of three dots (already in the set) — now also the **pointer drag** handle, not only keyboard. No new art; new behaviour. |
| `condition` | §2 WHEN line | A small **decision diamond** with a question sense: a diamond (`M12 4 L20 12 L12 20 L4 12 Z`) with a short inner stem/dot — "a condition / when". Distinct from `agent` (which is a plain diamond) by the inner mark. |
| `branch` | §2 DO line, routing | A **fork**: a vertical line splitting into two diverging strokes (`M12 4 v6 M12 10 l-5 6 M12 10 l5 6`) with small end-nodes — "do / route to". |
| `loop` | §2.4 / §3.2 loop-back marker | A **circular-arrow** loop: a `~270°` arc (`circle` + `stroke-dasharray` gap) with a small arrowhead on the open end — "loops back / cycle". |
| `label` | §2 routing-label chip, §3 card chip, §4 not used | A **tag**: a tag/luggage shape (`M4 12 l7 -7 h7 v7 l-7 7 z`) with a small hole dot — "a routing label". |
| `pipe` | §3 rail connector | A **flow connector**: a short horizontal line ending in a chevron node (reuse the `advance` chevron sense) — joins pipeline nodes. May compose from `advance`. |
| `folder-stack` | §3.4 done folder | A **folder with a fanned stack**: a folder outline (`M4 8 h6 l2 2 h8 v9 H4 z`) with **two offset back-edges** peeking above (two short parallel top lines offset right) — "many done, collapsed". |
| `scope-common` | §4 scope chip / picker | **Shared / globe-of-projects**: a ring with two-three small satellite dots on it (`circle r7` + 3 small `circles` on the ring) — "shared across projects". |
| `scope-project` | §4 scope chip / picker | **This project**: the existing `project` mark (a single solid tile/diamond) reused, or a single filled node inside a frame — "this project only". (Prefer reusing `project` from cockpit-v2.) |
| `tag` | §4 stack/kind chips | A simpler **tag outline** (same family as `label` but hollow, no route sense) — a metadata tag. May share art with `label`. |
| `propose` | §4.3 inbox, propose chips | An **inbox-with-a-suggestion**: an inbox tray (`M4 13 h4 l1 2 h6 l1 -2 h4`) with a small **up-chevron / spark** above it — "/kai proposed, awaiting your approval". |

**Reused unchanged** (from the interactive spec §4 / cockpit-v2 §4): `info`, `warning`, `check`, `cross`, `pending`, `spinner`, `edit`, `save`, `trash`, `add-stage`, `remove`, `kebab`, `advance`, `agent`, `need`, `progress`, `dot`, `blocked`, `preset`, `conflict`, and the **shield** (hard = solid stroke / soft = `stroke-dasharray:3 2`). Gate states stay **glyph + colour + text**; hard/soft stays **shield shape, never hue**.

---

# 6. Accessibility notes (WCAG 2.2 AA — all four surfaces)

**Keyboard drag — builder reorder (Surface 1) [2.5.7 Dragging Movements]:** dragging the grip is an *enhancement only*. Three pointer-free paths exist: **`Alt+↑/↓`** on the focused grip (the tested primary, already live), an explicit **`Space`→pick-up / arrows→move / `Space`→drop / `Esc`→cancel** mode (`aria-grabbed`, assertive position announcements at every step), and **Move up/down in the `⋯` menu**. Pointer drag uses `touch-action:none` on the grip and supports `Esc`-to-cancel.

**Rule-builder keyboard (Surface 2):** the editor is a plain **form** — every `type/value/do/target` is a native `<select>`/`<input>`/`<textarea>`, fully tab-navigable in reading order (Name → WHEN conditions → `+ add condition` → DO actions → `+ add action` → loop note → Cancel/Save). `+ add` buttons are real `<button>`s; removing a row returns focus to the prior row. The prompt textarea has a visible `N / cap` counter and an `aria-describedby` helper. No drag, no canvas, no custom widget — keyboard-complete by construction. Errors are `aria-live="assertive"` on first occurrence and tied to fields via `aria-describedby`.

**Pipeline column navigation (Surface 3):** the rail is a `role="list"` of `role="listitem"` columns with **roving tabindex**; **`←/→`** move focus across stages (kept from the live board), **`↑/↓`** within a column's cards; cards activate with `Enter`/`Space`; the advance `⋯` is a `role="menu"` (arrow keys, `Esc`). The **done folder** is a `<button aria-expanded>`; expanded, focus moves into the list and `Esc`/close returns focus to the tile. Rail paging buttons are real buttons with labels ("Scroll pipeline left/right"). Focus is **never obscured** by the sticky done-folder or sticky rail (scroll-margin reserved) [2.4.11 Focus Not Obscured]. Horizontal scroll has a keyboard path (roving focus auto-scrolls the focused column into view).

**Knowledge (Surface 4):** scope control is a `role="radiogroup"`; filters are labelled selects; the propose-inbox is a list of cards, each with labelled approve/reject buttons whose **accessible name reflects the chosen scope** ("Approve as Common"). Add form mirrors the live form's field grouping + counters.

**aria-live map:** builder save/saved = `polite`; 409 reconcile = `role="alert"` (assertive, takes focus); drag pick-up/move/drop = `assertive`; rule save/lint = `polite`, rule errors = `assertive`; board re-layout = `polite` "Board updated"; done count increment = `polite`; knowledge add/approve = `polite`, errors = `assertive`.

**Escaped untrusted text (everywhere):** stage names, owners, **labels, rule prompts, regex patterns, comment bodies, knowledge titles/bodies, doc names, and `/kai` proposal text** are **interpolated only — never `[innerHTML]`** (`no-unsafe-binding` stays green). A pattern field renders the regex as escaped text inside `/…/`, never executed in the DOM. `/kai` proposal text is model-authored and treated as untrusted → escaped.

**Contrast / targets / focus:** body text `--kb-text` ≥ 4.5:1; all chips/borders/nodes/rail connectors ≥ 3:1 (re-verify the new routing-label chips, scope chips, rail nodes, and the active-segment accent against text/border); all interactive ≥ 24px (≥ 44px under `pointer:coarse`) — **grips (drag targets ≥ 44px on touch), kebabs, menu items, segmented segments, condition/action selects, the done-folder tile, approve/reject buttons**; focus = 2px `--kb-focus-ring`, 2px offset, ≥ 3:1.

**Reduced motion:** the **drag lift / row-shuffle / done-folder fan / rail active-segment animation / spinner** all respect `prefers-reduced-motion`: rows **jump** instead of easing, the folder stack renders **flat-offset (no rotate)**, the spinner is a **static ring**, the rail segment fills without transition. No state is conveyed by motion alone (text + glyph always carry it).

**Colour never alone:** every gate state, ticket status, save lifecycle, scope, tag, loop marker, and index label pairs an inline-SVG **glyph + text**; hard/soft gate is **shield shape**, not hue; a **loop-back** is `glyph-loop` + "loops back" text (warning hue is reinforcement, not the signal).

---

# 7. Buildability & handoff notes

- **No new runtime deps, no icon library, no `[innerHTML]`.** All new glyphs are inline-SVG additions to `GLYPH_NAMES`; the `no-tofu-glyphs` and `no-unsafe-binding` source-scans stay green (resolve every wireframe symbol to a §5 glyph — never paste one into a template).
- **Reuses the existing write contract end-to-end:** drag-reorder, add-stage, and rule edits are all **overlay writes** via the control-plane with **`expectedRev` + the 409 reconcile banner** already implemented — no new persistence model, no new conflict UX. Rules live in the **same workflow document + overlay** the builder already edits (`architecture-jorge.md §1.1`), so one parser, one overlay, one `rev`.
- **The board pipeline is a chrome refactor of the existing projection** — same `columns()` / `offTrack()` signals, same SSE re-derivation; the rail/nodes/done-folder are presentational. The board adds **no card-drag** (advance stays a routed action), keeping it honest about gates.
- **Knowledge extends the Base panel + add-note form** with `scope`/tag fields and a propose-inbox over the `/kai` propose→approve contract; the `scope` field already exists in the memory payload, so this is additive.
- **All four surfaces stay dark-first on `--kb-*` tokens**, OnPush, standalone Angular 21, WCAG 2.2 AA.

**Open items for `/po` / `/arch` / `/secops` (UX-relevant):**
1. **Board card-drag vs menu-advance** — I recommend **menu-advance only** on the pipeline (drag implies you can bypass a gate). Confirm with `/po`.
2. **Routing-label chip on cards** — surfacing the live routing label on the board needs the label to be readable in the ticket projection (`/arch` to confirm `labels:[]` reaches `TicketView`).
3. **`/kai` proposal text trust** — model-authored; treated as untrusted/escaped here. `/secops` to confirm no richer rendering is requested.
4. **Done-folder threshold** — at what count does the folder switch from a normal column to the stacked folder? (Proposed: always a folder; even 1 done item reads as "the accomplishments pile.") `/po` to confirm.

> **Gate:** none requested. This is a UX investigation. `DESIGN_APPROVED` is **not** recorded; that fires later, per surface, when these are scoped into tickets and the wireframes are turned into a per-ticket design spec for `/fe`.
