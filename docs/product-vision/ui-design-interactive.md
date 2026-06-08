# UI/UX Design — DART Cockpit, Interactive Surfaces (ADT-221 / ADT-222 / ADT-223)

**Designer:** Aura (`/ui`)
**Date:** 2026-06-08
**Status:** Draft → Approved (DESIGN_APPROVED, soft gate)
**Gate:** `DESIGN_APPROVED` for ADT-221, ADT-222, ADT-223
**Scope:** Turns the three read-only Project-Shell panels (Workflow / Tasks / Base) into interactive surfaces. **Design spec only — no production code.** Extends `docs/product-vision/ui-design-cockpit-v2.md` (the established card/shell/panel/iconography system); that doc's read-only panels (§3.3 Workflow rail, §3.4 Tasks counts, §3.5 Base facts) are the *closed* states these surfaces grow out of.
**Stack constraint:** Angular 21.2, standalone, OnPush. **Inline SVG only — no icon library.** Dark-first, `--kb-*` tokens only, WCAG 2.2 AA.

---

## 0. Grounding — what exists, what binds, what I honour

**Read in full before designing:** the three tickets (ADT-221/222/223), `DECISION_LOG.md` (D-001…D-005), `approvals/arch-interactive.md` (the Cockpit↔control-plane data contracts), `approvals/secops-interactive.md` (C-1…C-19 binding conditions + the negative tests), `docs/product-vision/ui-design-cockpit-v2.md` (the card/shell/panel/icon system), and the live components (`studio/cockpit/src/app/shell/{workflow,tasks,base}-panel.component.ts`, `core/models.ts`). The **legacy board** (`hub/public/index.html`, now `/legacy`) already proved the ticket modal (focus-trap + `Esc`), the gate rows with rationale, the PR-style comments timeline (`esc()` everywhere, newest-first), and the colour-never-alone gate glyphs — I port those *patterns* onto the Cockpit's token system, not its markup.

**Design canon honoured (from cockpit-v2 §0):** status = **glyph + colour + text**, never colour alone; **hard vs soft gate by SHAPE** (solid vs dashed shield), never hue; surfaces by elevation/brightness not heavy shadow; accent reserved for live/active/primary; monoline 24×24 inline-SVG glyphs; focus ring `--kb-focus-ring` 2px. Every value below references a `--kb-*` token.

**Binding constraints carried into every surface here (from arch §0 + secops §2-3):**

1. **Optimistic write + `expectedRev` + 409 re-sync everywhere** (D-005). Every mutation sends `expectedRev` = the `rev` from the last received `buildState`. On `409 {conflict, state}` the UI **adopts the returned `state` as truth, rolls back the optimistic change, surfaces a first-class CONFLICT state, and offers retry** against the fresh `rev`. Never a silent overwrite. CONFLICT is a real UI state, not a toast that vanishes.
2. **Escape all untrusted text as inert** — gate names, owners, triggers, comment authors/bodies, KB title/body, doc names. Angular interpolation only. **No `[innerHTML]`, no `bypassSecurityTrust*`** (secops C-8/C-12/C-19; the repo's `no-unsafe-binding` source-scan test stays green).
3. **Write-guard inherited by placement** — every mutation rides the existing guarded `api.service.ts post()` (X-AIDT + loopback); the UI never needs to add headers, but it must render the `403`-class "write refused" outcome honestly (it should not normally occur same-origin, but a guarded-failure error state exists).
4. **`rev` is an opaque contract token** — the UI round-trips it unchanged; it does not parse or compute it.
5. **No tofu glyphs.** The `no-tofu-glyphs` source-scan forbids literal `＋ ◧ ‹ › ▯` (and non-typographic non-ASCII) in component source. **Every wireframe symbol below is a diagram placeholder — never paste it into a template.** Each resolves to an inline-SVG glyph in §4.
6. **Live updates reuse the existing `/api/events` SSE** the read panels already consume; each interactive surface re-derives from every fresh push.

**Wireframes are diagrams, not markup** (cockpit-v2 §0 convention). `[ic]` and quoted glyph names mark inline-SVG positions.

---

## 1. ADT-221 — Editable Workflow builder

**From:** the read-only horizontal stage rail (`workflow-panel.component.ts`).
**To:** an **editable builder** — reorder stages (keyboard-first), edit a gate's rule (trigger / owner / hard-soft), switch preset — **persisted to the overlay only**, base `workflow.yaml` never touched.
**Contract (arch §1):** read from `workflowView` + `gateDefs[]` (`{name, owner, refusal, safety, trigger[], required}`) + `preset` + `rev`. Edit via existing overlay routes — `POST /api/track/reorder {track, stages, expectedRev}` (permutation-validated), `POST /api/gate/trigger {gate, trigger?, owner?, refusal?, expectedRev}`, `POST /api/preset {preset, expectedRev}`. All three gain `expectedRev` CAS (the C-13 net-new extension /be ships).

### 1.0 Entry — the panel grows an Edit affordance

The closed panel keeps its read-only rail. The footer's inert "View full workflow soon" becomes a **live `Edit workflow` button** (`glyph-edit`). Activating it opens the builder **in place** (the panel expands to a builder region) — no route change, so the shell stays put and SSE keeps flowing. A `Done` control collapses back to the read rail.

> **Overlay-not-base affordance (binding AC + provable byte-identical).** A persistent banner sits at the top of the builder, always visible while editing:
> ```
> [ic glyph-info]  You're editing this project's OVERLAY. The base workflow file is never changed.
> ```
> Token: `--kb-surface-muted` bg, `--kb-text-muted` text, `--kb-border` hairline, `glyph-info` in `--kb-accent`. This is the honest "you edit the overlay" cue the AC demands; it is **not** dismissible while in edit mode.

### 1.1 Wireframe — builder, idle (saved) state

```
┌─ WORKFLOW ─────────────────────────────────────────────  track: full ▾  ┐
│ [ic glyph-info]  You're editing the OVERLAY — the base workflow file is   │  ← overlay banner (always on)
│                  never changed.                                          │
│ ────────────────────────────────────────────────────────────────────── │
│  Preset:  ( solo )  ( small-team )  ( regulated )      [ic check] saved  │  ← segmented control + status pill
│ ────────────────────────────────────────────────────────────────────── │
│  STAGES  (reorder: focus a row, Alt+↑ / Alt+↓ to move)                   │
│                                                                          │
│  ⋮⋮  vision          [ic glyph-agent] /po        (no gate)        [edit] │  ← grip + stage + owner + gate + edit
│  ⋮⋮  architecture    [ic glyph-agent] /arch  [ic shield-solid] ARCH      │
│                                          hard · trig: change-class…[edit]│
│  ⋮⋮  security        [ic glyph-agent] /secops [ic shield-solid] SECOPS   │
│                                          hard · always-required   [edit] │
│  ⋮⋮  approval        [ic glyph-agent] —      [ic shield-dashed] APPROVAL │
│                                          soft · trig: P0/P1       [edit] │
│  ⋮⋮  code            [ic glyph-agent] /rev   [ic shield-dashed] REVIEW   │
│                                          soft                     [edit] │
│  ⋮⋮  done            [ic glyph-agent] —       (no gate)                  │
│ ────────────────────────────────────────────────────────────────────── │
│                                                          [ Done editing ]│
└──────────────────────────────────────────────────────────────────────────┘
```

- **Grip (`⋮⋮` → `glyph-grip`)** marks a reorderable row; it is a focusable handle but **reordering does not require a pointer drag** (see 1.5 a11y). Each stage row: grip · stage name (`--kb-text`, 600) · owner (`glyph-agent` + `/role`, muted; `—` when derived/none) · gate marker (`shield-solid` hard / `shield-dashed` soft + short gate name) · rule line (`hard|soft · trigger summary`) · per-row **`edit`** button (opens the gate-rule editor, 1.2). A non-gate stage shows `(no gate)` and its **derived owner read-only** (D-001: only gate owners are editable).
- **Preset = segmented control** (`role="radiogroup"`, three `role="radio"` segments). The active segment is filled `--kb-accent-soft` + `--kb-accent` text + a `glyph-check`; inactive are `--kb-surface-muted`. Changing it is an immediate optimistic `POST /api/preset`. Preset-driven always-required gates re-render with an **`always-required`** rule label (read-only on those gates; the preset, not the user, makes them required).
- **Status pill** (top-right) shows the save lifecycle (1.4): `saved` / `editing` (dirty) / `saving…` / `conflict`.

### 1.2 Gate-rule editor (per-row `edit` → inline expander, not a separate modal)

Editing a gate expands the row into an inline form (keeps spatial context; no focus jump to a modal for a single-field-group edit):

```
│  ⋮⋮  architecture    [ic glyph-agent] /arch  [ic shield-solid] ARCH_APPROVED        │
│  ┌───────────────────────────────────────────────────────────────────────────────┐ │
│  │ Owner    [ /arch                     ▾ ]   ← select from the gate-owner set      │ │
│  │ Refusal  ( [ic shield-solid] Hard )  ( [ic shield-dashed] Soft )  ← segmented    │ │
│  │ Triggers [ change-class ✕ ] [ P0/P1 ✕ ] [ + add trigger… ]   ← chips, escaped    │ │
│  │                                            [ Cancel ]   [ Save gate ]            │ │
│  └───────────────────────────────────────────────────────────────────────────────┘ │
```

- **Owner** = a `<select>` constrained to the **gate-owner set** (the known agent roles the project's gates use, derived from `gateDefs[].owner` ∪ the standard role list). Free text is not offered — owners are an allowlist, escaped on render regardless.
- **Refusal** = a two-segment control carrying **`shield-solid` (Hard)** / **`shield-dashed` (Soft)** — the *shape* preview matches the rail marker, so hard/soft is chosen by glyph, not colour. A short helper: "Hard gates block the stage; soft gates warn but don't block."
- **Triggers** = removable chips (`✕` = `glyph-remove`) + an `+ add trigger` that reveals a small text input; each trigger label renders escaped. Maps to `gate/trigger.trigger[]`.
- **Save gate** sends only the changed fields → `POST /api/gate/trigger {gate, owner?, refusal?, trigger?, expectedRev}`. **Cancel** reverts the row to its last-saved values. A gate the preset forces `always-required` shows that as a read-only note (its requiredness is preset-driven, not editable here).

### 1.3 Save / lifecycle states

| State | Trigger | Treatment |
|---|---|---|
| **saved** (idle) | no pending edits | pill: `[ic check] saved` (`--kb-success`), muted |
| **editing** (dirty) | any unsaved reorder / open rule edit / preset hover-not-committed | pill: `[ic glyph-edit] unsaved changes` (`--kb-warning`); a sticky footer `[ Discard ] [ Save changes ]` appears when there are batched reorder moves |
| **saving** | a POST in flight | pill: `[ic glyph-spinner] saving…` (animated arc; static under reduced-motion); the affected row(s) get a subtle busy treatment; controls for that mutation disabled |
| **saved (confirmed)** | 2xx + the SSE push echoes the new `rev` | pill flips back to `saved`; `aria-live="polite"` announces "Workflow saved." |
| **CONFLICT (409)** | stale `expectedRev` | see 1.4 — first-class state |
| **error** (non-409) | network / `400` (e.g. non-permutation) / `403` guard | inline `--kb-danger` alert under the affected control: "Couldn't save: {terse reason}." + Retry; **optimistic change rolled back to server truth**; nothing persisted |

**Reorder commit model:** Alt+arrow moves are **optimistic locally** and **batched** — the rail reorders instantly; a single `POST /api/track/reorder {track, stages, expectedRev}` fires on `Save changes` (or after a short idle debounce). The server validates `isPermutation` (secops C-15); a `400 "stages must be a permutation"` (only possible on a corrupt client model) rolls back and shows the error. Preset and per-gate edits commit immediately (single-field, low conflict risk).

### 1.4 CONFLICT (409) — first-class reconciliation

When any save returns `409 {conflict, state}`:

```
┌─ [ic glyph-conflict] This workflow changed while you were editing ───────────┐
│ Someone (a CLI agent or another tab) saved a change. We've reloaded the      │
│ current workflow. Your unsaved edit was not applied.                         │
│                                                                              │
│  What you tried:  reorder stages  ·  set ARCH owner → /arch                  │
│                                                                              │
│                                   [ Discard my edit ]   [ Re-apply on top ▸ ]│
└──────────────────────────────────────────────────────────────────────────────┘
```

- The builder **adopts the `state` from the 409 body** as the new truth (rail + gate rows + preset re-render to server values; `rev` updated). The optimistic change is rolled back.
- **`Re-apply on top`** re-stages the user's intended change against the *fresh* model (re-runs their reorder/field edit on the new base) so they can re-save against the current `rev` — never a blind overwrite. **`Discard`** simply keeps the server state.
- Announced via `role="alert"` (assertive). The banner is **inline at the top of the builder** (focus is moved to it) — not a transient toast — because it requires a decision. SSE-driven concurrent changes that arrive *without* a local save in flight simply re-render the rail live (with a quiet `aria-live="polite"` "Workflow updated").

### 1.5 Reorder accessibility (D-002 / WCAG 2.2 2.5.7 — dragging has a single-pointer/keyboard alternative)

- Each stage row is a **`role="listitem"`** in an `role="list"`; the grip is a **`<button>` "Move {stage}"** that is keyboard-focusable. With a row focused: **`Alt+↑` / `Alt+↓`** move the stage up/down (the canonical drag-free reorder). `Home`/`End` optional to send to ends. After each move, `aria-live="assertive"` announces "Moved {stage} to position {n} of {m}."
- A visible **drag handle** is offered for pointer users (optional enhancement) but is **never the only path** — the keyboard moves are the primary, tested mechanism. No drag library, no DnD a11y debt (consistent with D-002's rationale for the board).
- Roving `tabindex` across rows; `↑/↓` move *focus* between rows, `Alt+↑/↓` move the *stage*. The distinction is documented in the inline hint ("focus a row, Alt+↑/↓ to move").

### 1.6 Empty / default-workflow case

If no overlay and the project resolves to the **default solo workflow** (today's read-panel "Using the default solo workflow."), the builder opens on that resolved floor track, with the overlay banner reading: *"This project uses the default workflow. Your first edit creates an overlay — the base file still won't change."* Reorder/edit/preset all work; the first save writes the overlay. If `workflowView.stages` is empty (unresolved), the builder is **not** offered — the panel shows the read-only default message and a disabled Edit with a "no workflow to edit yet" tooltip.

### 1.7 Component / state breakdown (ADT-221)

| Component | Responsibility | Key state |
|---|---|---|
| `WorkflowBuilderComponent` | owns edit mode, the working model, the save lifecycle, 409 reconciliation | `mode: 'read'\|'edit'`, `working: WorkflowView`, `lifecycle: saved\|editing\|saving\|conflict\|error`, `rev` |
| `StageRowComponent` | one reorderable stage; grip button + Alt-arrow handler; hosts the gate editor | `stage`, `isReordering`, `gateEditorOpen` |
| `GateRuleEditorComponent` | owner select (allowlist) + refusal segmented (shape) + trigger chips | `draft: {owner, refusal, triggers[]}`, `dirty` |
| `PresetControlComponent` | `radiogroup` segmented control | `preset`, `pendingPreset` |
| `ConflictBannerComponent` | the 409 reconcile UI (Discard / Re-apply) | `attempted`, `serverState` |
| `SaveStatusPillComponent` | the lifecycle pill + `aria-live` region | `lifecycle` |

State source: the shell's existing `state` signal (SSE-fed). Mutations call the existing `api.service.post()`; on 409 the component swaps `working`←`state-from-body`. `rev` is read-only opaque.

---

## 2. ADT-222 — Tasks board + task detail

**From:** the read-only Tasks counts panel (`tasks-panel.component.ts`).
**To:** a **board with columns by status**, task cards, an **advance action** (menu, not drag — D-002), and a **task detail** (status/stage, gate/trigger labels, comments timeline read+add, gate approve/reject), live over SSE.
**Contract (arch §2):** all reads are projections of the single `buildState` payload — `tickets[]` (each `{id, title, status, stage, assignee, gates[], comments[], description}`), `taskSummary.byStatus`, `gateDefs[]`. **No per-ticket fetch** — detail is `tickets.find(id)`, re-derived on every SSE push. Mutations: `POST /api/ticket/advance {id, toStage, expectedRev, by}`, `POST /api/ticket/comment {id, author, body, kind}`, `POST /api/gate/set {id, gate, state, note, by, expectedRev}` (already emits the typed audit comment — secops C-19).

### 2.0 Status → column mapping

The real statuses are `in_progress | waiting | blocked | done` (+ the derived `needsYou`, which is an **overlay count, not a sixth bucket** — arch §2: do not add it to column sums). Columns, left→right:

| Column | Source status | Glyph | Hue |
|---|---|---|---|
| **In progress** | `in_progress` | `glyph-progress` (half-filled square) | `--kb-accent` |
| **Waiting** | `waiting` | `glyph-dot` (subtle) | `--kb-text-subtle` |
| **Blocked** | `blocked` | `glyph-blocked` (no-entry) | `--kb-danger` |
| **Done** | `done` | `glyph-check` | `--kb-success` |

`needsYou` is surfaced **on the cards** (a `glyph-need` chip), not as a column — honest to the data model. Column header shows its glyph + name + count (`taskSummary.byStatus`). A column with zero tasks renders a slim empty placeholder ("Nothing {status}."), never vanishes (so counts/columns stay legible).

### 2.1 Wireframe — board

```
┌─ TASKS ─────────────────────────────────────────────────────────────────────┐
│  [ic glyph-progress] In progress 8   [ic dot] Waiting 0   [ic blocked] Blocked 1   [ic check] Done 3 │
│ ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐ ┌──────────────┐ │
│ │ ADT-221          │ │              │ │ ADT-219          │ │ ADT-201      │ │
│ │ Editable Workflow│ │  Nothing     │ │ KB embedder swap │ │ Memory floor │ │
│ │ [ic agent] /fe   │ │  waiting.    │ │ [ic agent] /be   │ │ [ic check]   │ │
│ │ [shield-solid]   │ │              │ │ [shield-solid]   │ │ done         │ │
│ │  ARCH ✓ SEC ✓    │ │              │ │  SEC ✗ rejected  │ │              │ │
│ │           [ ⋯ ▾ ]│ │              │ │ [ic need] needs  │ │              │ │
│ │                  │ │              │ │  you      [ ⋯ ▾ ]│ │              │ │
│ ├──────────────────┤ │              │ └──────────────────┘ └──────────────┘ │
│ │ ADT-222          │ │              │                                        │
│ │ Tasks board      │ │              │                                        │
│ │ [ic agent] /fe   │ │              │                                        │
│ │  ARCH ✓ SEC ✓ … │ │              │                                        │
│ │           [ ⋯ ▾ ]│ │              │                                        │
│ └──────────────────┘ └──────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Task card

Each card (click/`Enter` opens detail, 2.3): `id` (mono, `--kb-text-muted`) · `title` (escaped, `--kb-text`, clamp 2 lines) · `assignee`/expected owner (`glyph-agent` + `/role`) · **gate-state chips** (short gate name + a state glyph: `glyph-check` passed / `glyph-cross` rejected / `glyph-pending` pending; hard/soft by the `shield-solid`/`shield-dashed` shape on the chip) · a `glyph-need` "needs you" chip when the ticket is `needsYou` · a **`⋯ ▾` action menu** (`glyph-kebab`) in the corner. The card is a single activation target for opening detail; the `⋯` menu **stops propagation** so it doesn't also open detail.

### 2.3 Advance action (menu, not drag — D-002)

The card's `⋯ ▾` (and a primary action in the detail header) opens a small menu:

```
        [ ⋯ ▾ ]
        ┌─────────────────────────────┐
        │ [ic glyph-advance] Advance → │   → confirms next stage, then POST /api/ticket/advance
        │   to: security              │
        │ ─────────────────────────── │
        │ Open detail                 │
        └─────────────────────────────┘
```

- **Advance** is an explicit, labelled action naming the **next stage** (the menu shows "Advance → to: {next}") so the user knows where it goes. On select → optimistic move of the card to the target column (if status changes) → `POST /api/ticket/advance {id, toStage, expectedRev, by}`. The advance route already emits the typed `advance` comment.
- **409 on advance:** the card snaps back to its server position; a **CONFLICT toast→inline** appears on the card ("This task changed elsewhere — reloaded. Re-try advance?") with a Retry that re-sends against the fresh `rev`. Adopt the 409-body `state`. (secops C-18 / N-17.)
- Menu is a `role="menu"` with `role="menuitem"` items; `Esc` closes; arrow keys move; opens with `Enter`/`Space`/`↓`.

### 2.4 Task detail (modal — focus-trapped, ports the legacy patterns)

Clicking a card opens a **focus-trapped dialog** (`<dialog>` or `role="dialog" aria-modal="true"`, `aria-labelledby` the title). Ports the legacy modal (focus on close button on open, `Esc` closes, focus returns to the originating card, Tab trapped) onto the Cockpit tokens.

```
┌──────────────────────────────────────────────────────────────────────  ✕ ─┐
│  ADT-219                                                  [ stage: security ]│  ← id · stage pill
│  Knowledge-Base embedder swap                                                │  ← title (escaped)
│  [ic agent] /be   ·   [ic glyph-blocked] Blocked by SECOPS · /secops         │  ← assignee + derived status
│  track: full                                                  [ ⋯ Advance ▾ ]│
│ ─────────────────────────────────────────────────────────────────────────── │
│  GATES                                                                       │
│  [shield-solid] [ic check] passed   ARCH_APPROVED   decided by /arch · 2h    │
│  [shield-solid] [ic cross]  rejected SECOPS_APPROVED owner /secops           │
│      rationale: "needs C-7 size-cap test before pass" (escaped)              │
│      trigger: external-input file write     ┌ Approve ┐ ┌ Reject ┐  ← if applicable
│  [shield-dashed][ic pending] pending APPROVAL_GATE  owner /verify             │
│ ─────────────────────────────────────────────────────────────────────────── │
│  COMMENTS  (newest first)                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ /secops   [gate]   2h ago                                               │ │  ← author · kind · time
│  │ Rejected SECOPS_APPROVED — needs the size-cap negative test. (escaped)  │ │  ← body (escaped, pre-wrap)
│  └────────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ /be       [comment] 5h ago                                              │ │
│  │ Started the addKbNote chokepoint. (escaped)                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│ ─────────────────────────────────────────────────────────────────────────── │
│  Add a comment                                                               │
│  [ as: /you ▾ ]                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Write a comment… (markdown shown as plain text)                        │ │  ← textarea
│  └────────────────────────────────────────────────────────────────────────┘ │
│  0 / 8192                                                  [ Post comment ]  │  ← live char count vs 8 KB cap
└──────────────────────────────────────────────────────────────────────────────┘
```

**Header** — id (mono) · title (escaped) · stage pill · assignee (`glyph-agent`) · **derived status** (the legacy rule: a ticket is `blocked` only by a *rejected hard gate*; name that gate + owner). Status carries glyph + colour + text. A header `⋯ Advance ▾` mirrors the card menu (2.3).

**Gates section** — one row per non-`na` gate: a **shape marker** (`shield-solid` hard / `shield-dashed` soft) + a **state** (glyph + text: passed/rejected/pending) + the gate name (escaped) + `decided by {by} · {relTime}` or `owner {owner}` + the **trigger label(s)** + an optional **rationale** (the latest deciding `kind:'gate'` comment body, escaped — ported from legacy `gateNotes`). This is the "gate/trigger labels, hard/soft, passed/rejected" the AC requires.

**Gate approve/reject** — where a gate **applies and is decidable** (the current stage's governing gate, owned by a role, not yet terminally decided), the row shows **`Approve` / `Reject`** buttons. On click:
- A small confirm with an **optional rationale note** field → `POST /api/gate/set {id, gate, state, note, by, expectedRev}` (`state ∈ passed|rejected`, allowlisted server-side).
- Optimistic: the gate state + the derived status update immediately; the typed `gate` audit comment the server emits (secops C-19) appears in the timeline on the next SSE push — **the UI does not fabricate it locally**, it waits for the authoritative push so the timeline is never out of sync with the ledger.
- **409:** adopt 409-body state, surface CONFLICT inline in the gates section ("This task's gates changed elsewhere — reloaded."), offer Retry against fresh `rev`.

**Comments timeline** — newest-first (legacy reading order). Each: `author` (escaped) · `kind` chip (`comment`/`gate`/`advance`, escaped) · relative time (full timestamp in `title`) · `body` rendered **escaped, `white-space: pre-wrap`** (markdown shown as plain text — never `[innerHTML]`; secops C-19/N-19). Empty → "No comments yet."

**Add-comment composer** — an `as: {role}` selector (the author), a textarea, a **live `N / 8192` character counter**. **Pre-send the UI enforces the 8 KB cap** (secops C-17): over-cap disables Post and shows "Comment is too long (max 8 KB)." Empty disables Post (server `400`s empty anyway). On Post → `POST /api/ticket/comment` (append-only, **no CAS** — comments can't clobber); the composer clears; the new comment arrives via the SSE push (re-sync). Posting state disables the button with `glyph-spinner`.

### 2.5 Live update (SSE) behaviour

The board and the open detail **re-derive from every `/api/events` push** (the watcher covers the ledger + `.aidevteam/comments`). A CLI agent's advance/comment/gate-decision appears without reload: cards move columns, counts update, the open detail's gates/timeline refresh. To avoid yanking the reading position, a live change to the **currently-open** ticket shows a quiet `aria-live="polite"` "Task updated" and refreshes content in place (it does not close the modal). A non-conflicting live change while a composer has draft text **preserves the draft**.

### 2.6 States (board + detail)

| Surface | Loading | Empty | Error | Conflict |
|---|---|---|---|---|
| Board | column skeletons (3–4 card skeletons/col) | "No tasks yet — the team will create them as work starts." (cockpit-v2 copy) | "Couldn't load tasks." + Retry; board not blanked | n/a (board re-derives from SSE) |
| Card advance | the card shows `glyph-spinner` busy | — | inline "Couldn't advance: {reason}" + Retry; card snaps back | snap-back + "changed elsewhere — Retry" |
| Detail | content skeleton inside the modal | "No gates triggered for this ticket." / "No comments yet." (legacy copy) | "Couldn't load this task." inside modal; modal still closeable | inline reconcile banner in the affected section + adopt server state |
| Post comment | button `glyph-spinner`, disabled | — | "Couldn't post comment." + the draft is preserved for retry | n/a (append-only; re-sync via SSE) |
| Gate decision | row busy, buttons disabled | — | "Couldn't record decision: {reason}" + Retry | adopt 409 state + Retry |

### 2.7 Modal a11y (focus-trap / ESC / order)

- `role="dialog" aria-modal="true"`, `aria-labelledby` = the title; on open, focus moves to the close button (legacy pattern); **Tab is trapped** (cycle first↔last focusable); `Esc` closes; on close, focus **returns to the originating card**.
- Scroll-lock the background; the modal scrolls internally with a **sticky header/footer using `scroll-margin`** so focus is never obscured (WCAG 2.4.13).
- Reading order: header → gates → comments → composer. The gates' Approve/Reject and the composer are reachable by keyboard in that order. Status/gate everywhere = glyph + colour + text; hard/soft = shield shape.
- Board: columns are a `role="list"`; cards `role="listitem"` activatable by `Enter`/`Space`; the `⋯` menu is a proper `role="menu"`. Roving focus across cards; `↑/↓` within a column, `←/→` across columns (optional but preferred).

---

## 3. ADT-223 — Knowledge Base input

**From:** the Base panel's inert "Add documents soon" button (`base-panel.component.ts`).
**To:** a **paste-a-note form** (title + markdown body) that writes one contained file to the project's KB, with the new doc appearing in the list and the count incrementing, an honest indexing label, and full validation/error states.
**Contract (arch §3 / secops §2 — HARD gate):** `POST /api/kb/add {title, body}` (or `/api/projects/:id/kb`). **The client supplies only `title` + `body`** — never a path/filename/directory/extension (C-1). Server derives a slugged `*.md`, realpath-contains before write (C-3), `O_EXCL` no-overwrite (C-5), size+type caps (C-7), write-guard required (C-6), single chokepoint (C-10). Response `200 {ok, doc:{name,file,index}, state}` (the fresh `buildState` → list + count update; SSE confirms). Indexing label is honest via `buildBase`/`embedderConfigured` (C-12). Body rendered inert (C-8).

> **Nothing is uploaded — this is a local write.** The form copy says so explicitly: *"This saves a note as a markdown file in this project — nothing is uploaded anywhere."* (Honest to the loopback/local-write reality; reassures + sets the right mental model.)

### 3.1 Entry — "Add documents" becomes live

The Base panel's inert `[ + Add documents soon ]` becomes a **live `[ + Add a note ]` button** (`glyph-plus`, accent). It opens the add-note form. Two viable placements; **prefer the inline expander** (the panel grows the form below the doc list — keeps the count/list in view so the increment is visible on success). A modal is acceptable if the panel is space-constrained (same focus-trap/Esc rules as 2.7).

### 3.2 Wireframe — add-note form

```
┌─ BASE ─────────────────────────────────────────────────────────  8 docs ─┐
│  [ic check] 8 indexed   [ic indexing] 0 indexing   [ic warning] 0 failed  │
│  Filename index only — connect an embedder for semantic recall.           │  ← honest method line
│  ┌─ recent ───────────────────────────────────────────────────────────┐  │
│  │ code-rules        filename-only                                     │  │
│  │ test-policy       filename-only                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│ ─────────────────────────────────────────────────────────────────────────│
│  ADD A NOTE                                              [ic glyph-info]   │
│  This saves a markdown file in this project — nothing is uploaded.        │  ← local-write honesty
│  Title *                                                                  │
│  [ Code review rules                                              ]       │  ← required, ≤200 chars
│  0 / 200                                                                   │
│  Body (markdown)                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Paste or write your note here. Markdown is stored as text.          │ │  ← textarea, ≤64 KB
│  └─────────────────────────────────────────────────────────────────────┘ │
│  0 / 64 KB                                                                 │  ← live size vs cap
│  [ic glyph-info] Saved as a filename-indexed note (no semantic embedding). │  ← honest indexing preview
│                                                  [ Cancel ]   [ Add note ] │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Validation (client mirrors the server controls — but the server is the authority)

| Rule | Client behaviour | Server backstop |
|---|---|---|
| **Title required** | `Add note` disabled until non-empty after trim; inline "A title is required." | empty → `400` (C-1) |
| **Title length** | live `N / 200`; over → disabled + "Title is too long (max 200)." | `400` |
| **Body size** | live `N / 64 KB`; over → disabled + "Note is too large (max 64 KB)." | oversize → `400`/`413`, nothing written (C-7) |
| **Text/markdown only** | the textarea is plain text by nature (no binary path — D-003); the form never offers file upload | non-text/binary → `400` (C-7) |
| **Slug-empties** (title is only punctuation → server slug `""`) | the client cannot reliably predict the slug, so it **does not pre-reject**; it surfaces the server's `400` as "That title can't be turned into a filename — add some letters or numbers." | empty-after-slug → `400` (C-1/N-5) |
| **Path-y titles** (`../`, `/abs`, `a/b`, `x.md.sh`) | accepted in the field (they're just a title); the server slugs them safe — the client does **not** need to block them, and must not imply the user did something forbidden | server contains/rejects (C-1…C-4) |

The client **never constructs a filename or path** — it sends `{title, body}` only (honours C-1 at the UI boundary).

### 3.4 Lifecycle states (validating → saving → added; + errors)

| State | Treatment | aria-live |
|---|---|---|
| **validating** (idle/typing) | inline field hints; `Add note` enabled only when valid | — |
| **saving** | `Add note` → `glyph-spinner` "Adding…", form disabled | `polite` "Adding note…" |
| **added** (success) | form clears + collapses; the **new doc appears at the top of the recent list** with its honest index label; the **count chip increments by one** (`8 docs → 9 docs`); a brief inline success "Note added." | `polite` "Note added — Base now has {n} documents." |
| **error — too large** | inline `--kb-danger` "Note is too large (max 64 KB)." form values preserved | `assertive` |
| **error — empty/slug** | "That title can't be turned into a filename — add some letters or numbers." | `assertive` |
| **error — duplicate name** | **honest, non-blocking:** "A note with a similar name exists — saved as a new file (`code-rules-2`)." (server derives a unique suffix per C-5; the add still succeeds, the UI names the actual file written) **or**, if the server chose to reject, "A note with this name already exists." with the form preserved | `polite`/`assertive` per outcome |
| **error — write refused (403 guard)** | "Couldn't save — the write was refused by the local guard." (shouldn't occur same-origin; honest if it does) | `assertive` |
| **error — generic** | "Couldn't add the note. {terse reason}." + Retry; **Base list unchanged** (rejected submission leaves the list as it was — AC) | `assertive` |

On any error the **Base count and list are unchanged** (nothing written) — the AC's "a rejected submission leaves the Base list unchanged." On success the increment + new entry come from the returned `state` (optimistic) and are confirmed by the SSE push on `.aidevteam/kb`.

### 3.5 Honest indexing label (on the new entry + the preview)

The form shows a **pre-submit honesty line** reflecting the project's real method: when no embedder is configured, *"Saved as a filename-indexed note (no semantic embedding)."*; when an embedder is genuinely wired, *"Indexed for semantic recall."* — driven by the same `base.method` the panel already shows (`filename-only` vs `local-embeddings`). The new list entry carries the **same `index` label the rest of the list uses** (C-12) — it never claims semantic indexing unless `embedderConfigured` is true, and **no embedding job is triggered** (D-003). The note body is shown in any preview as **escaped/inert text** (C-8/N-12) — a `<script>` in the body renders as literal text.

### 3.6 Component / state breakdown (ADT-223)

| Component | Responsibility | Key state |
|---|---|---|
| `AddNoteFormComponent` | the title+body form, validation, lifecycle, posting | `title`, `body`, `valid`, `lifecycle: idle\|saving\|added\|error`, `errorKind` |
| Base panel (extended) | hosts the form expander; reflects the incremented count + new entry from returned `state` | `base: BaseView` (existing), `formOpen` |

The form posts via the existing guarded `api.service.post('/api/kb/add', {title, body})`. On `200` it lifts the returned `state` to the shell (which already feeds the Base panel). On error it maps the server reason to one of the messages above and leaves the list untouched.

---

## 4. Iconography additions (inline-SVG concepts — no library, no tofu)

All icons follow cockpit-v2 §4: **24×24 viewBox, `stroke="currentColor"`, `stroke-width≈1.6`, `fill="none"` (monoline), `aria-hidden="true"`**, colour inherited. Each pairs with text — never colour/glyph alone. New glyphs this sprint:

| Name | Where | Concept (build as inline SVG) |
|---|---|---|
| `glyph-edit` | builder Edit, description edit | Pencil: `M4 20 l1-4 L16 5 l3 3 L8 19 z`. (Already specced cockpit-v2 §4 — reuse.) |
| `glyph-grip` | stage reorder handle | Two columns of three dots (`6 small circles`, 2×3) — the universal "drag/move handle"; here a **keyboard move** button (Alt+arrows). |
| `glyph-add-comment` | composer / add-comment | Speech bubble (`rounded rect + tail`) with a small `+` inside. |
| `glyph-approve` | gate Approve | A circle with an inner check (`circle r8` + `polyline 8,12 11,15 16,9`) — distinct from the bare `glyph-check` so "approve action" ≠ "done state". |
| `glyph-reject` | gate Reject | A circle with an inner cross (`circle r8` + two `lines` forming ✕). |
| `glyph-cross` | gate rejected state (chip/row) | Bare `✕`: two crossing `lines`. (State glyph, distinct from the reject *action*.) |
| `glyph-pending` | gate pending state | A dotted/striped circle arc (`circle` with `stroke-dasharray`) — "awaiting a decision." |
| `glyph-preset` | preset control affordance | Three horizontal sliders/levels (`3 lines + small knobs`) — "switch configuration." |
| `glyph-save` | builder Save | Floppy/disk outline (`rect` + a notch + an inner `rect`) **or** a downward `glyph-check`-into-tray; pick the disk for unambiguous "save." |
| `glyph-spinner` | saving / posting | An arc (`circle` with `stroke-dasharray` ~3/4) that **rotates only when `prefers-reduced-motion` is not set**; under reduced motion it is a **static three-quarter ring** (no spin) — motion is never the only signal (the "saving…" text carries it). |
| `glyph-conflict` | 409 reconcile banner | Two diverging arrows / a fork (`path` splitting) **or** a warning-merge — connotes "two edits diverged." Paired with the `--kb-warning` banner + text. |
| `glyph-info` | overlay banner, honesty lines | Circle with an `i` (`circle r8` + a dot + a short stem). |
| `glyph-kebab` | card / detail action menu | Three vertical dots (`3 small circles`). |
| `glyph-advance` | advance action | A right-pointing chevron-into-a-bar / `→|` — "move to next stage." |
| `glyph-remove` | trigger-chip remove | Small `✕` (reuse `glyph-cross` at 11px). |

**Reused from cockpit-v2 §4 (no change):** `glyph-project`, `glyph-plus`, `glyph-agent` (◆ diamond), `glyph-check`, `glyph-shield` (hard = solid stroke / soft = `stroke-dasharray:3 2` — the established hard/soft-by-shape marker), `glyph-blocked`, `glyph-need` (hourglass), `glyph-progress`, `glyph-base`, `glyph-index`, `glyph-warning`, `glyph-settings`.

**State-by-glyph+colour+text (gates):** passed = `glyph-check` + `--kb-success` + "passed"; rejected = `glyph-cross` + `--kb-danger` + "rejected"; pending = `glyph-pending` + `--kb-text-muted` + "pending". **Hard vs soft is the shield's stroke (solid/dashed), never colour** — preserved from the live workflow panel.

---

## 5. Accessibility notes (WCAG 2.2 AA — all three surfaces)

**Keyboard — reorder (ADT-221):** stage rows are a keyboard list with **roving tabindex**; `↑/↓` move focus, **`Alt+↑ / Alt+↓` move the stage** (single-pointer/keyboard alternative to drag — 2.5.7). Each move announces position via `aria-live="assertive"`. No drag library; pointer drag is an optional add-on, never the only path.

**Keyboard — board (ADT-222):** columns `role="list"`, cards `role="listitem"` activatable with `Enter`/`Space`; `↑/↓` within a column, `←/→` across columns; the `⋯` advance menu is a `role="menu"` (arrow keys, `Esc`, type-ahead optional). Advance never requires a drag (D-002).

**Keyboard — modal (ADT-222) / form (ADT-223):** focus-trapped dialog, focus to first control on open, **`Esc` closes**, focus **returns to the trigger**; Tab cycles within; sticky header/footer use `scroll-margin` so focus isn't obscured (2.4.13). The inline KB form is in normal flow (no trap needed) but follows the same labelled-field + error-association pattern.

**aria-live regions:**
- **save / conflict (221):** the save-status pill is `aria-live="polite"` for saved/saving; the 409 reconcile banner is `role="alert"` (assertive) and takes focus.
- **task updates / gate decisions (222):** live SSE refresh of an open ticket → `aria-live="polite"` "Task updated"; an advance/gate 409 → `role="alert"`.
- **added / errors (223):** success "Note added — Base now has {n} documents." is `polite`; size/slug/refused errors are `assertive`; the count chip change is announced with it.

**Escaped untrusted text everywhere:** gate names, owners, triggers, comment authors/bodies, ticket titles/descriptions, KB title/body, doc names — **Angular interpolation only, never `[innerHTML]`/`bypassSecurityTrust*`** (secops C-8/C-12/C-19; `no-unsafe-binding` test stays green). Comment/KB bodies use `white-space: pre-wrap` so markdown reads as plain text without ever being parsed to HTML.

**Contrast / targets / focus:** body text `--kb-text` ≥ 4.5:1; status/gate glyph + chip borders ≥ 3:1 (re-verify the new gate-state chips and the preset segmented-control fills against text/border); all interactive ≥ 24px (≥ 44px under `pointer:coarse`) — grips, kebabs, menu items, segmented segments, form buttons; focus = 2px `--kb-focus-ring`, 2px offset, ≥ 3:1.

**Reduced motion:** `glyph-spinner`, the modal entrance, builder row-move transitions, and any save shimmer respect `prefers-reduced-motion` — spinner → static ring, modal → no slide, moves → instant. No essential state is conveyed by motion (the text label always carries it).

**Colour never alone:** every gate state, ticket status, save lifecycle, and index label pairs an inline-SVG **glyph + text**; hard/soft gate is **shape (shield stroke)**, not hue.

---

## 6. Buildability & handoff notes

- **No new runtime deps, no icon library, no `[innerHTML]`.** All glyphs inline-SVG; the `no-tofu-glyphs` and `no-unsafe-binding` source-scan tests constrain the work and stay green (do not paste any wireframe symbol into a template — resolve each to a §4 glyph).
- **All three reuse the existing guarded `api.service.post()`** (X-AIDT inherited) and the existing **SSE `state` signal** the read panels already consume — no new client transport.
- **`expectedRev`/409 is a shared, reusable concern** — a single `conflictReconcile(attempt, serverState)` helper pattern (adopt server state → roll back optimistic → surface CONFLICT → offer retry) serves 221 (overlay routes), 222 (advance + gate/set), and is unneeded for append-only comments + KB add (which re-sync via SSE / the returned `state`). Specify it once.
- **Suggested order:** (1) ADT-222 board (cheapest — pure projection of existing `tickets[]`) → detail modal (ports legacy) → advance/comment/gate mutations; (2) ADT-221 builder over the existing rail (needs /be's `expectedRev` CAS on the three overlay routes first — C-13); (3) ADT-223 add-note form (HARD-gated — /be ships `addKbNote` + N-1…N-13 before the form can be verified end-to-end, but the form UI can be built against the contract in parallel).
- **Design QA after `/fe`:** verify against the **production build served same-origin** (project canon — a dev server's HMR socket never reaches network-idle for screenshot verification). Check: hard/soft shield shapes render (not tofu), CONFLICT is a real focused state (force a stale `rev`), escaped bodies (paste `<script>` into a comment + a KB note → literal text), keyboard reorder (Alt+arrows) + board nav + modal trap/Esc, and the count increments on KB add.

---

## 7. Gate

`DESIGN_APPROVED` (soft) recorded **passed** for ADT-221, ADT-222, ADT-223 — this spec covers every behavioral AC with wireframes, all four lifecycle/error/empty/conflict state sets, the a11y contract (keyboard reorder + board + modal, aria-live, escaped text), and the inline-SVG iconography additions, all on the established `--kb-*` token / panel / shield-shape system and within the arch data contracts + secops C-/N- constraints.

**Next:** ADT-221/222 → `/be` adds the overlay `expectedRev` CAS (C-13) + `/fe` builds the surfaces; ADT-223 → `/be` ships `addKbNote` under TDD (N-1…N-13) → `/fe` builds the form → `/rev`. Then `/sm` — please update sprint status.
