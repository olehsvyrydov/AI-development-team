# DART — Pipeline Edit-Mode (One Control Plane)

**Designer:** Aura (/ui) · **Status:** DESIGN — for /fe build · **Scope:** UI composition only (no new routes)

> Goal (verbatim): *"Make the Workflow builder the pipeline chain in edit-mode — one control plane."*
> Today there are THREE surfaces: a read-only Workflow rail, a read-only CI Pipeline chain
> (`tasks-pipeline.component.ts`), and a SEPARATE full editor (`workflow-builder.component.ts`).
> We unify them: editing happens **in place on the same CI chain the operator reads** — you flip it into
> edit-mode. One surface for a human developer AND for agents reading the same projected state.

---

## 0. Position & guiding principle

The CI chain (`dart-tasks-pipeline`) is already the canonical read of the workflow: stage nodes
(`marker · name · owner · gate-word · status-word · count · dwell`) joined left→right by connectors,
with **gate nodes living ON the connectors** (solid diamond = hard, dashed = soft), and a rejected
hard gate visibly **severs** its connector (`data-state="broken"`, red dashed). That visual grammar is
the product's signature. **Edit-mode must not abandon it.** We do not turn the chain back into the
builder's vertical `<ol class="rows">` list. We grow affordances *onto the existing nodes*.

**Smallest-change principle (enforced throughout):** the chain already renders every element the
operator edits (stage node, owner, gate node, connector). The builder already owns every mutation
(`setStages` / `gateTrigger` / `setPreset` / `setRules` / `setLabels`), each an atomic CAS on
`expectedRev` with first-class 409 decoding. **We are not building new behaviour. We are relocating
existing affordances onto the chain and retiring the parts that duplicate the read.** Anything beyond
that is called out as gold-plating in §8.

---

## 1. The read ↔ edit boundary

### 1.1 The toggle

A segmented **View / Edit** control sits at the right of the pipeline header (the band above the chain
that today only hosts the "Switch to Worklist" affordance). It is the *only* thing that arms mutation.

```
┌─ Pipeline ──────────────────────────────────────────────  ┌──────┬──────┐ ─┐
│  PROJECT · active track: regulated                         │ View │ Edit │  │   ← segmented toggle
│                                                            └──────┴──────┘  │     (View = default)
└─────────────────────────────────────────────────────────────────────────── ┘
```

- It is a 2-segment **`role="tablist"`** style control reusing the existing `.preset` /
  `.viewtab` segmented pattern (pill container, `--kb-accent-soft` active fill). The active segment
  carries `aria-pressed="true"` (toggle-button semantics) — *not* a tab, because flipping does not swap
  panels, it re-skins the same chain. Use two `<button>`s in a `role="group"` labelled "Pipeline mode".
- **View** is the default and the safe state. The chain renders exactly as today — no grips, no selects,
  no add/delete. Zero mutation surface. Agents and read-only operators never see an edit affordance.
- Persisted per project in `localStorage` is **gold-plating — do not.** Edit-mode resets to View on
  every navigation/reload. A live workflow should never silently stay armed across sessions.

### 1.2 What changes visually when Edit is on

| Element | View | Edit |
|---|---|---|
| Chain container | `data-mode="view"` | `data-mode="edit"` — a 1px `--kb-accent` inset ring + a faint `--kb-accent-soft` wash on the track, so "this is live and armed" is unmistakable |
| Stage node | static, click → read drawer | gains a **grip** (drag/keyboard reorder), the owner word becomes an inline **owner picker**, a **delete** affordance appears in the header |
| Gate node | static, click → drawer focused on gate | becomes the trigger for the **inline gate editor** (owner · hard/soft · triggers) |
| Connectors | passed/pending/broken | unchanged states, **plus** hairline **insert slots** between nodes (the add-stage affordance) |
| Header status | (none) | a persistent **liveness pill** — `saved` / `unsaved` / `saving…` / `conflict` — reusing the builder's `Lifecycle` pill verbatim |

The pill is the heartbeat. It tells the operator the chain is mutating live and reports the outcome of
every atomic write (see §1.4). It is **only present in edit-mode**.

### 1.3 Preventing fat-finger mutation on a LIVE workflow

This chain is live against running agents. Three guards, in order of how often they fire:

1. **The edit-mode gate itself.** Mutation is impossible in View. You must deliberately flip to Edit.
   This is the primary guard and it is free — it is the toggle.
2. **Destructive ops keep an inline confirm.** *Delete stage* is the only destructive op and it MUST
   retain the builder's existing inline confirm — the one that counts tickets going off-track and
   refuses to empty the track (`working().length <= 1`). It reappears anchored under the stage node
   (§2.3). Reorder / owner / gate-edit are **non-destructive and reversible** (just re-edit), so they
   commit on interaction with no confirm — same as the builder today.
3. **No undo stack.** A general undo is gold-plating and a trap on a CAS-versioned shared model (your
   "undo" may 409 against another agent's write). The honest primitives are: *re-edit* (everything is
   directly editable) and the conflict banner's **Re-apply** (§4). Do not build undo.

### 1.4 Save model — KEEP atomic-as-you-go, do NOT introduce staged commit

The builder commits **each change atomically** (`commitStages` / `gateTrigger` / `setPreset` send one
CAS write per interaction; there is no batch "Save"). **Keep this.** The trade-off, argued:

- **For atomic-as-you-go (chosen):** the chain is a *live control plane* read simultaneously by agents.
  An agent reading the projection must see truth, not an operator's uncommitted draft. A staged
  "Save all" creates a divergence window where the human sees one workflow and agents obey another —
  exactly the split-brain "one control plane" is meant to kill. Atomic writes also make conflict
  reconciliation tractable: one intent, one `expectedRev`, one 409 to decode (which the builder already
  does). Each mutation is small and reversible, so per-change commit is low-regret.
- **Against (staged commit):** fewer writes, a "discard everything" escape, atomic multi-field edits.
  But it demands a draft/published distinction the backend overlay does not model, a dirty-buffer
  conflict story far nastier than the current per-write 409, and it reintroduces the hidden-editor
  divergence we are removing. **Rejected.**

The one nuance already handled correctly and kept: **reorder previews optimistically** (keyboard
pick-up moves update `workingStages` live) and **commits on drop**. That is still "atomic per gesture,"
not staged — the gesture is the unit.

---

## 2. In-place affordances on the chain

The rule: **affordances appear *within* the existing node chrome; the node never changes shape or
loses its read content.** An agent or a glancing human still reads `name · owner · gate · status ·
count` in edit-mode — the editable bits are simply now interactive.

### 2.1 Stage node — read vs edit

**READ (today, unchanged):**

```
        ╱╲  passed                          ← gate node on the connector (centrepiece)
   ─────◆──────────
   ┌───────────────────────────┐
   │ ● Build  ⌂/be  running  3 │            ← marker · name · owner · status · count
   ├───────────────────────────┤
   │  ▸ ADT-2  Add OAuth …     │            ← cards (parent #cardTpl, projected verbatim)
   │  ▸ ADT-9  Token rotation  │
   └───────────────────────────┘
```

**EDIT — affordances fold into the header, cards untouched:**

```
   ─────◆──────[＋]──          ← insert-slot between nodes (add stage here)
   ┌──────────────────────────────────────┐
   │ ⠿ ● Build  [⌂/be ▾]  running 3   [🗑] │   ← grip · marker · name · OWNER PICKER · status · count · DELETE
   ├──────────────────────────────────────┤
   │  ▸ ADT-2  Add OAuth …                │   ← cards STILL render (you edit the live chain you read)
   │  ▸ ADT-9  Token rotation             │
   └──────────────────────────────────────┘
     ▲ node border → --kb-accent when armed; grip is the drag handle
```

(`⠿` = `grip` glyph · `[⌂/be ▾]` = inline `<select>` owner picker reusing `agent` glyph + a caret ·
`[🗑]` = `trash` glyph delete · `[＋]` = `add-stage` glyph. All are existing glyphs — no tofu.)

- **Grip** (`grip` glyph): a focusable `<button draggable="true">` at the head of the node. Lift it to
  HTML5-drag the node; the **connector + gate ride with the node** (the gate belongs to the stage, so
  reordering moves the whole segment). Drop target = an insert slot or another node. Keyboard:
  Space = pick-up, ←/→ move, Space = drop, **Alt+←/→** as the pointer-free shortcut (the builder uses
  Alt+Up/Down for a vertical list — **on the horizontal chain it MUST be Alt+Left/Right** to match the
  axis; the roving ←/→ already established by the chain). This is the single most important a11y
  carry-over.
- **Owner picker**: the existing `.stage-node__owner` word becomes an inline `<select>` (same
  `ownerOptions()` allowlist, `agent` glyph + caret). Change = one `setStages` CAS. In View it is plain
  text — no control chrome.
- **Delete** (`trash` glyph): header-trailing button. Opens the inline confirm (§2.3). Disabled +
  `title` when `working().length <= 1`, identical to today.
- **The drag insertion line** reuses the chain's connector: the target slot's connector thickens to
  `2px --kb-accent` (the horizontal analogue of the builder's `.row--dragover` top-border).

### 2.2 Gate node — read vs edit

The gate node is the centrepiece and stays ON the connector in both modes.

**READ:**

```
        ◆ Secops  passed          ← solid diamond (hard) · name · state word
   ───────────────────
```

**EDIT — the gate node becomes the editor's anchor; a popover editor hangs below it:**

```
        ◆ Secops  passed  [✎]     ← same node + an edit affordance (edit glyph)
   ───────────────────
        ┌───────────────────────────────┐
        │ Gate: Secops                   │   ← inline gate editor (popover, anchored to the gate node)
        │ Owner   [/secops      ▾]       │
        │ Refusal (◆ Hard)  ( ◇ Soft )   │   ← shield SHAPE carries hard/soft, not colour alone
        │ Triggers  [secops.review ✕]    │
        │           [+ add trigger…    ] │
        │            [ Cancel ] [ Save ] │
        └───────────────────────────────┘
```

- The gate editor is **lifted verbatim from the builder** (`openGateEditor` / `draft` / `setDraftOwner`
  / `setDraftRefusal` / `addTrigger` / `removeTrigger` / `saveGateRule`). It now renders as a **popover
  anchored to the gate node** instead of an inline row block. Hard/soft is the shield-shape radiogroup
  exactly as today (solid vs dashed `stroke-dasharray`), so the gate's shape on the connector updates
  the instant you save.
- A **soft** gate still never severs its connector; saving hard↔soft re-derives `markerKind` /
  `data-shape` and (if the gate is rejected) flips the connector between `broken` and lit. This is
  *already* how `tasks-pipeline` derives connector state — edit-mode just makes the input editable.
- **`SECOPS_APPROVED` safety override:** the refusal control for the safety gate is **shown but the
  hard→soft path is disabled** with an inline note ("Safety gate — can't be softened"), mirroring the
  engine's `SAFETY_GATE` invariant the builder already knows about. Editing a safety gate down is a
  fat-finger we must refuse at the UI, and the server refuses it regardless.

### 2.3 Delete confirm (destructive — keep the guard)

Anchored under the stage node, reusing the builder's `.confirm` block verbatim:

```
   ┌──────────────────────────────────────┐
   │ ⚠ 3 task(s) are in this stage.        │
   │   Deleting won't lose them — they'll  │
   │   show as OFF-TRACK until you move     │
   │   them. (Overlay only; base file       │
   │   unchanged.)                          │
   │              [ Cancel ] [ Delete ]    │
   └──────────────────────────────────────┘
```

### 2.4 Add stage

Two entry points, both keeping the chain metaphor:

- **Insert slots** (`add-stage` glyph) on each connector — add *at this position*. Hover/focus reveals
  the slot; the rest of the time it is a faint affordance so the chain stays clean.
- **An end-cap "＋ Add stage"** after the last stage node (the builder's `add-stage-foot`, relocated to
  the end of the chain). The builder's model appends-then-drag; with insert slots we can insert
  directly at the chosen index (the slot already knows its position), which is *less* work for the
  operator. The new-stage mini-form (name + owner, with the existing client-side `newNameError`
  validation) opens as a popover anchored to the chosen slot.

---

## 3. Fate of the standalone builder panel — DECISIVE SPLIT

**Retire the builder as a separate *destination*. Lift its node-level editors onto the chain. Keep its
workflow-level editors in a side drawer reached from edit-mode.** Be concrete:

### Moves ONTO the chain (in-place, per node)

| Builder feature | Chain home |
|---|---|
| Stage reorder (grip drag + Alt-arrow keyboard) | grip on the stage node (§2.1) |
| Inline owner picker | the `owner` word becomes a `<select>` (§2.1) |
| Add stage | connector insert slots + end-cap (§2.4) |
| Delete stage (+ off-track confirm) | header `trash` + inline confirm (§2.3) |
| Gate editor (owner · hard/soft · triggers) | popover on the gate node (§2.2) |
| Lifecycle pill (saved/saving/conflict) | pipeline header, edit-mode only (§1.2) |
| Overlay banner ("saves to this project only") | pipeline header strip, edit-mode only |
| Conflict reconcile banner | top of the chain (§4) |

### STAYS in a side editor (a drawer, not a separate page)

These do **not** fit a per-node chain metaphor and forcing them on would clutter the live read:

| Feature | Why it stays out of the chain |
|---|---|
| **`when → do` rules grammar** (`stage-rules.component`) | A rules editor is a multi-field authoring surface (when-clause, verb-keyed do, route picker, loop detection). It is per-stage but far too tall to inline without destroying the chain's horizontal scan. Reached from a small **`rules N`** pill on the stage node (`condition` glyph) that opens the **Workflow drawer** scrolled to that stage's rules. |
| **Labels manager** (`labels-manager.component`) | Workflow-level (not per-stage). No node owns it. |
| **Preset radiogroup** (solo / small-team / regulated) | Workflow-level; switching it rewrites the whole chain. Belongs at the top of the drawer, not on a node. |

So the **Workflow drawer** (a right-side drawer, the same drawer shell the read-only stage drawer
already uses) hosts exactly three things: **Preset · Labels · Rules**. It is opened from edit-mode
(a "Workflow settings" affordance in the header) or by clicking a stage's `rules N` pill (deep-links to
that stage's rules). The standalone `workflow-builder.component` route/`board-view` in
`project-shell` is **removed** — `openBuilder` / `builderOpen` / the builder `board-view` block all go.

**Net:** one surface to *read and edit the chain*; one drawer for the *non-chain workflow settings*.
No third "builder page."

---

## 4. Conflict & liveness

The chain is live over SSE (`project-shell` adopts every push via `adoptState`). While the operator
edits, an agent may advance a ticket or a gate may flip. Reconciliation rules:

1. **Live pushes always flow into the read.** Cards moving between stage nodes, a gate flipping
   passed→rejected, a connector severing — these are *the agent's truth* and must render immediately,
   in edit-mode too. The operator is editing the *shape* of the workflow (stages/owners/gates), not the
   *ticket positions*, so incoming ticket movement never collides with an in-flight structural edit and
   simply updates live underneath the affordances.
2. **Structural edits use CAS, so a genuine collision is a 409 — not a clobber.** If the operator's
   `setStages`/`gateTrigger` lands on a stale `rev` (an agent or another operator changed the workflow
   first), the server returns 409. We reuse the builder's exact reconcile: **adopt server truth, roll
   back the optimistic change, surface the focused conflict banner** (`Discard my edit` / `Re-apply on
   top`). No silent overwrite — already implemented in `reconcile()`.
3. **Where it surfaces on the chain:** the conflict banner pins to the **top of the chain**, above the
   nodes (full-width, `role="alert"`, focus moved to it — the builder already does `#conflictBanner`
   focus management). "What you tried: {summary}" reuses the existing `ConflictAttempt.summary`. The
   liveness pill simultaneously flips to `conflict`.
4. **In-flight editor open during a conflict:** the builder already closes the gate editor / rules on
   conflict (`reconcile` calls `cancelGateEditor()` / `closeRules()`). Keep that — a popover anchored
   to a node that may have just been reordered or deleted must close; the banner is the single recovery
   point. **Re-apply** re-stages the intent against the fresh model (and safely no-ops if a re-applied
   stage no longer exists — already handled).

There is **no new conflict logic** here. We reuse the builder's `reconcile` / `conflict` /
`reapplyConflict` wholesale; we only move where the banner renders.

---

## 5. Accessibility (WCAG 2.2 AA) + tokens

- **Edit toggle:** two `<button>`s in a `role="group"` aria-labelled "Pipeline mode"; each
  `aria-pressed`. Flipping to Edit moves focus to the first stage node's grip and announces
  "Edit mode on — stages, owners and gates are now editable" via the assertive live region.
- **Liveness status:** the lifecycle pill is `aria-live="polite"` (saving/saved) so routine saves don't
  spam; the **conflict** state is `role="alert"` (assertive) on the banner. This split already exists in
  the builder (`builder-status` polite pill + `builder-conflict` alert) — preserve it.
- **Keyboard reorder:** Space pick-up / ←→ move / Space drop, plus **Alt+←/Alt+→** (re-axised from the
  builder's Alt+Up/Down for the horizontal chain). Escape cancels a pick-up and restores order
  (`cancelGrab`). Every move emits an assertive announcement ("X now at position n of m") — carried over
  verbatim.
- **Roving focus across the chain** already exists (`onChainKeydown`, `data-col-index` ordering across
  end-caps · gate nodes · stage nodes). Edit-mode adds the grip, owner select, delete, and insert slots
  into the tab order **within** a focused node (arrow keys move *between* nodes; Tab moves *into* a
  node's affordances) — do not put every micro-control on the roving ring, or the chain becomes
  un-arrowable.
- **Inline editor focus management:** opening the gate/new-stage/rules popover moves focus into its
  first field; Escape closes and returns focus to the anchoring node/affordance; the popover is a focus
  trap while open (it is a `dialog`-role popover). The delete confirm focuses its Cancel button (the
  builder's `#deleteCancel`) — safer default.
- **Target size:** every affordance ≥ 24px (grip is 1.75rem today; gate node bumps to 44px on
  `pointer: coarse` — keep). Insert slots must be ≥ 24px tall hit areas even though drawn as hairlines.
- **Colour never alone:** hard/soft = diamond *shape* + word; gate state = word + colour; connector
  broken = dashed + red + word in the node. All already true; edit-mode adds shape-based radios, not
  colour-only toggles.
- **Reduced motion:** the chain has no motion today; the only motion edit-mode introduces is the
  drag-lift (`scale`/elevation). Gate it on the existing `--kb-dur-*` tokens + `data-motion` attribute +
  `prefers-reduced-motion` zeroing — copy the builder's motion-token block. No state is ever carried by
  motion alone.
- **Tokens:** dark `--kb-*` only (`--kb-accent`, `--kb-accent-soft`, `--kb-surface`, `--kb-border`,
  `--kb-success`, `--kb-warning`, `--kb-danger`, `--kb-focus-ring`, spacing/radius/text scale). No new
  tokens.
- **Glyphs:** inline-SVG only from the existing `GlyphComponent` set — `grip`, `agent`, `caret`,
  `trash`, `add-stage`, `edit`, `condition`, `check`, `spinner`, `conflict`, `info`, `warning`,
  `remove`, `save`, `preset`, `label`. **No new glyph is required** (verified against `GLYPH_NAMES`) —
  no tofu, no icon font.

---

## 6. Interaction states (per element)

| Element | States |
|---|---|
| Pipeline mode toggle | View (default, pressed) · Edit (pressed) · focus-visible ring |
| Chain container | `view` · `edit` (accent ring + wash) |
| Stage node (edit) | idle · focused · grip-grabbed (lifted, `scale .97`, accent ring) · drag-over target (connector thickens) · owner-select open · delete-confirm open |
| Gate node (edit) | idle · focused · editor-open (popover) · saving (spinner in Save) · safety-locked (refusal toggle disabled + note) |
| Insert slot | hidden-ish (faint) · hover/focus (revealed) · new-stage form open |
| Liveness pill | saved · unsaved · saving… · conflict · error (each glyph + word) |
| Conflict banner | hidden · shown (alert, focused) → Discard / Re-apply |
| Workflow drawer | closed · open (Preset / Labels / Rules) · deep-linked to a stage's rules |

---

## 7. Acceptance criteria (build-to, behavioural)

1. The Pipeline header shows a **View / Edit** segmented control; **View is the default** and presents
   the chain with **zero edit affordances** (no grips, selects, delete, insert slots, or liveness pill).
2. Flipping to **Edit** arms the chain: the container shows an armed accent treatment, a **liveness
   pill** appears, and the **overlay banner** ("changes save to this project only") is shown. Focus moves
   to the first stage's grip with an assertive announcement.
3. In Edit, a **stage node** exposes: a **grip** (pointer drag + Space/arrows + **Alt+Left/Alt+Right**
   keyboard reorder), an inline **owner picker** (the project's owner allowlist), and a **delete**
   affordance. The node keeps showing name · owner · gate · status · count and its cards.
4. **Reorder** moves the stage **with its gate and connector** and commits as one `set-stages` CAS;
   keyboard reorder announces the new position; Escape during a pick-up restores order.
5. **Delete** opens the existing inline confirm that counts off-track tickets, refuses emptying the
   track (disabled at one stage), and states "overlay only." Confirm commits one `set-stages` CAS.
6. **Add stage** is reachable from connector **insert slots** and an end-of-chain affordance; the
   mini-form validates name (required, unique, ≤ length) before enabling Save and commits one
   `set-stages` CAS at the chosen position.
7. A **gate node** in Edit opens an inline editor (owner · **hard/soft by shield shape** · trigger
   chips) anchored to the gate; Save commits one `gateTrigger` CAS and the connector/marker re-derive
   immediately (hard-rejected severs; soft never does). The **`SECOPS_APPROVED`** gate cannot be
   softened from the UI.
8. The **standalone workflow-builder destination is removed**; `project-shell` no longer opens it.
   **Preset**, **Labels**, and **Rules** live in a **Workflow drawer** opened from Edit mode (Rules
   deep-linked from a per-stage `rules N` pill).
9. Each mutation is **atomic-on-interaction** (no batch Save); the pill reflects
   `saving… → saved`, and a stale-`rev` **409** surfaces the existing conflict banner at the top of the
   chain (`Discard` / `Re-apply`), adopting server truth without clobbering — never a silent overwrite.
10. **Live SSE pushes** (ticket movement, gate flips) continue to update the chain while editing.
11. **A11y:** all affordances ≥ 24px (≥ 44px coarse); roving ←/→ across nodes preserved with affordances
    inside a node on Tab; popovers trap focus and restore on Escape; routine saves are `aria-live`
    polite, conflicts are `role="alert"` assertive; hard/soft & all states carry shape/word, never colour
    alone; drag-lift respects reduced motion. WCAG 2.2 AA.
12. Untrusted text (stage / owner / gate / trigger / rule / title) reaches the DOM via **interpolation
    only** — never `[innerHTML]`. (Already true in both source components.)

---

## 8. Scope discipline — what is gold-plating (DO NOT BUILD)

- **A general undo/redo stack.** Wrong primitive for a CAS-versioned shared model; re-edit + Re-apply
  cover recovery. (§1.3)
- **Staged "Save all" commit.** Reintroduces the hidden-editor divergence we are deleting. (§1.4)
- **Persisting edit-mode across reloads.** A live workflow should re-arm deliberately. (§1.1)
- **Animating node reflow on reorder** beyond the existing drag-lift. Not needed for comprehension and a
  reduced-motion liability.
- **A new full-screen "builder" route.** The whole point is to remove the separate destination.
- **New glyphs / tokens / backend routes.** None required.

The delivered change is: **(a)** a View/Edit toggle, **(b)** edit affordances folded onto the existing
stage and gate nodes (lifting the builder's already-working grip/owner/gate/delete/add logic),
**(c)** a 3-tab Workflow drawer for Preset/Labels/Rules, **(d)** removal of the standalone builder
destination. Everything reuses existing mutations, conflict handling, glyphs, and tokens. That is the
smallest change that yields "one control plane."
```