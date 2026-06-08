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

---
---

# Editable stages + stage-aligned board (addendum) — ADT-224 / ADT-225 / ADT-226

**Designer:** Aura (`/ui`)
**Date:** 2026-06-08
**Status:** Draft → Approved (DESIGN_APPROVED — ADT-225/226 soft, ADT-224 review)
**Gate:** `DESIGN_APPROVED` for ADT-224, ADT-225, ADT-226
**Scope:** A **focused extension** of §1 (builder) and §2 (board) above — not a new spec. User feedback: the builder must also **add / delete a stage** and set a stage's **owner/agent** (ADT-225); the Tasks board must group by **workflow STAGE**, not status (ADT-226); writes/live-updates must target the **viewed** project (ADT-224 — mostly invisible). Everything below reuses the established `--kb-*` tokens, the shield-shape hard/soft convention, the inline-SVG glyph set, the optimistic-write + `expectedRev` + 409 reconcile pattern, and the keyboard/aria conventions already specified in §§1–7. **Design spec only — no production code.** Wireframe symbols are diagram placeholders; each resolves to a §4 / §A.5 inline-SVG glyph — never pasted into a template (`no-tofu-glyphs` stays green).

## A.0 Grounding — what binds (read before §A.1)

Read in full: tickets **ADT-224/225/226**, `DECISION_LOG.md` **D-006…D-009**, and `approvals/{arch,secops}-editable-workflow.md`. The load-bearing facts I honour:

- **Overlay stage model (arch D-5/D-6, secops C-18…C-21).** One declarative op `track/set-stages` carries the **full ordered stage list** for the active track, each entry `{ name, owner?, gate? }`. Add = a new name; delete = an omitted name; move = a reorder; owner = the per-stage `owner` (persisted to `overlay.stageOwners[stage]`). Per-stage `gate` is **advisory view metadata** — the authoritative gate rule stays in `overlay.gates` via the **existing** `gate/trigger` op (the §1.2 gate-rule editor, unchanged). The base `workflow.yaml` is **never** written.
- **Validation (secops C-19/C-20/C-21).** The server rejects, writing nothing: empty result (a delete that empties the track), a duplicate name, an empty/whitespace name, an over-cap name, an unknown track, and prototype-pollution keys (`__proto__`/`constructor`/`prototype`). Owner is a plain capped string, never a path. **The UI mirrors these client-side for fast feedback, but the server is the authority** — every server `400` maps to a first-class inline error.
- **Escaped untrusted text (secops C-22/C-26).** Stage names and owners render as **escaped text** — Angular interpolation only, **no `[innerHTML]` / `bypassSecurityTrust*`**. A `<script>`/`<img onerror>` in a stage name or owner shows as literal text.
- **Board is a pure FE re-projection (arch D-9, secops C-25).** Columns = `workflowView.stages[*].stage` in order; placement by `ticket.stage`; advance = next stage via the **existing** `ticket/advance`. **No new route, no new persistence.** Off-track tickets are surfaced, never dropped or silently re-keyed (D-008, C-27).
- **Project scoping (ADT-224, D-006).** Every mutation already rides `ControlPlaneService` and every live frame the per-project SSE channel; the id travels server-side. The UI change is **near-zero** — see §A.4.
- **Conflict pattern is shared (D-005).** `set-stages` and `advance` both reuse the existing optimistic + `expectedRev` + 409 reconcile (§1.4 / §2.3). Append-only and read-only paths need no CAS.

---

## A.1 Add a stage (ADT-225)

The builder's stage list (§1.1) grows two affordances: a **per-row insert** and a **list-foot "Add stage."** Both open the same **new-stage row editor** in place.

### A.1.1 Wireframe — add affordance + new-stage row

```
│  STAGES  (reorder: focus a row, Alt+↑ / Alt+↓ to move)        [ic glyph-add-stage] Add stage │
│                                                                                              │
│  ⋮⋮  vision          [ic glyph-agent] /po        (no gate)              [+] [edit] [ic trash] │  ← row gains [+] insert-below + delete
│  ⋮⋮  architecture    [ic glyph-agent] /arch  [ic shield-solid] ARCH …  [+] [edit] [ic trash] │
│  ┌─ new stage (inserting after “architecture”) ───────────────────────────────────────────┐ │
│  │ Name *   [ design-review                          ]   0/64   ← required, unique, trimmed  │ │
│  │ Owner    [ /ui                          ▾ ]          ← from the allowed agent set, optional│ │
│  │ Gate     ( none )  ( attach a gate… )               ← optional; “attach” reuses §1.2 editor│ │
│  │                                            [ Cancel ]   [ Add stage ]                       │ │
│  └────────────────────────────────────────────────────────────────────────────────────────┘ │
│  ⋮⋮  security        [ic glyph-agent] /secops …                        [+] [edit] [ic trash] │
```

- **Two insert points, one editor.** The list-foot **`[ic glyph-add-stage] Add stage`** appends a new-stage row at the **end**; a per-row **`[+]` (`glyph-add-stage`, "Add stage after {stage}")** inserts **immediately below that row**. The new-stage row is a focusable inline form (no modal — single field-group, consistent with §1.2's inline gate editor). On open, focus moves to the **Name** input; the caption names the insertion point ("inserting after {stage}", or "at the start" / "at the end").
- **Name** — required; live `N / 64` counter; trimmed; **must be unique** within the working list (case-insensitive compare for the warning; the server compares as stored). **Owner** — an optional `<select>` constrained to the allowed agent set (the gate-owner set ∪ the standard roles already used by §1.2's owner picker: `/po /ba /arch /secops /ui /fe /be /rev /qa /e2e /verify`, plus `—` = derived/none). Free text is not offered. **Gate** — optional: `none` (default) or **`attach a gate…`**, which links the stage to the canonical `stage→gate` and reveals the **existing §1.2 gate-rule editor** inline (owner / refusal shield-shape / trigger chips). No new gate-editing surface is introduced — per-stage `gate` is advisory metadata; the rule lives in `overlay.gates`.
- **Where it inserts.** The working list is rebuilt with the new entry at the chosen index; on **`Add stage`** the **entire ordered list** is sent as one `track/set-stages` (declarative — add is "a name not previously present at position i"). This is the same batched-commit model as reorder (§1.3): the new row appears optimistically; the single CAS write fires on confirm.

### A.1.2 Validation (client mirrors server — server is authority)

| Rule | Client behaviour | Server backstop (secops) |
|---|---|---|
| **Name required** | `Add stage` disabled until non-empty after trim; inline "A stage name is required." | empty/whitespace → `400` (C-19) |
| **Name unique** | live compare against the working list; on collision, disabled + "A stage named '{name}' already exists." (escaped) | duplicate → `400` (C-19) |
| **Name length** | live `N / 64`; over → disabled + "Stage name is too long." | over-cap → `400` (C-19) |
| **Reserved-key name** (`__proto__` etc.) | not pre-blocked (rare); surfaces the server's terse `400` as "That stage name isn't allowed." | rejected/neutralized (C-21, N-20) |
| **Owner** | from the allowlist only; never free text | plain capped string, never a path (C-20) |

### A.1.3 Lifecycle / states (reuse §1.3 + §1.4)

- **idle → editing (dirty):** opening the new-stage row marks the builder dirty; the status pill shows `[ic glyph-edit] unsaved changes`.
- **saving:** `Add stage` → `[ic glyph-spinner] adding…`, the row's controls disabled; pill `saving…` (static ring under reduced motion).
- **added (saved):** the new row takes its place in the rail with grip + owner + gate marker; pill flips to `[ic glyph-check] saved`; `aria-live="polite"` announces "Stage {name} added at position {n} of {m}."
- **CONFLICT (409):** the existing §1.4 reconcile banner — adopt the 409-body `state` (rail re-renders to server truth, `rev` updated), roll back the optimistic add; **`Re-apply on top`** re-stages the add against the fresh list; **`Discard`** keeps server state. `role="alert"`, focus moved to the banner.
- **error (non-409):** inline `--kb-danger` alert under the new-stage row: "Couldn't add the stage: {terse reason}." + Retry; nothing persisted; the working list rolls back.

---

## A.2 Delete a stage (ADT-225)

Each stage row gains a **per-row delete** (`[ic glyph-trash]`, "Delete {stage}"). Because a stage may hold tickets and a delete that empties the track is rejected, delete is **confirm-gated** and **honest about orphaned tickets**.

### A.2.1 Wireframe — delete confirm (inline, context-preserving)

```
│  ⋮⋮  architecture    [ic glyph-agent] /arch  [ic shield-solid] ARCH …  [+] [edit] [ic trash] │
│  ┌─ delete “architecture”? ───────────────────────────────────────────────────────────────┐ │
│  │ [ic glyph-warning]  3 tasks are currently in this stage. Deleting it won't lose them —    │ │
│  │ they'll be shown as OFF-TRACK on the board until you move them to another stage.          │ │
│  │ This edits the overlay only; the base workflow file is unchanged.                         │ │
│  │                                                  [ Cancel ]   [ Delete stage ]            │ │
│  └────────────────────────────────────────────────────────────────────────────────────────┘ │
```

- **Affordance + confirm.** `[ic glyph-trash]` opens an **inline confirm** under the row (not a separate modal — keeps the list in view). It states the **count of tickets currently in that stage** (derived on the FE: `tickets.filter(t => t.stage === name).length`) and what becomes of them. Focus moves to **Cancel** (the safe default); `Esc` cancels.
- **What happens to tickets in a deleted stage (D-008 / C-27).** Tickets are **never deleted and never silently re-keyed** server-side. After the stage is removed from the track, those tickets' `stage` no longer matches any column → they surface in the board's **off-track lane** (§A.3.3). The confirm copy says so plainly so the operator isn't surprised. (If the stage is empty, the count line reads "No tasks are in this stage.")
- **Empty-track guard.** Deleting the **last remaining stage** is refused: the `[ic glyph-trash]` on a single-stage track is disabled with a tooltip "A track needs at least one stage." The server also rejects an empty result (`400`, C-19) — the client guard is just fast feedback.
- **Commit.** Confirm → the working list omits that name → one `track/set-stages` (declarative delete). Optimistic removal from the rail; CAS write; **409 → §1.4 reconcile** (adopt server state; the stage may reappear if another editor re-added it).

### A.2.2 States

| State | Treatment | aria-live |
|---|---|---|
| **confirming** | inline confirm with ticket-count + off-track explanation; focus on Cancel | — |
| **saving** | `Delete stage` → `[ic glyph-spinner] deleting…`, row dimmed | `polite` "Deleting {name}…" |
| **deleted** | row removed from the rail; pill `[ic glyph-check] saved`; if the stage held tickets, a quiet note "{n} task(s) are now off-track — move them to a stage." | `polite` "Stage {name} deleted." |
| **blocked — last stage** | delete disabled + tooltip; no write attempted | — |
| **CONFLICT (409)** | §1.4 reconcile; adopt server state | `assertive` |
| **error** | inline "Couldn't delete the stage: {reason}." + Retry; list rolls back | `assertive` |

---

## A.3 Set a stage's owner / agent (ADT-225)

### A.3.1 Inline owner picker on the stage row

Every stage row's **owner** field (previously read-only derived text in §1.1) becomes an **inline owner picker** for *all* stages — not only gate-bearing ones (D-007 adds per-stage non-gate owners via `overlay.stageOwners`). The grip/name stay; the owner segment becomes an activation target:

```
│  ⋮⋮  design-review   [ic glyph-agent] /ui  ▾      (no gate)             [+] [edit] [ic trash] │
│                       └─ click / Enter opens a constrained owner select ─┐                    │
│                          ┌──────────────────────────────────┐            │                    │
│                          │  —  (derived / none)              │  ← option  │                    │
│                          │  /po   /ba   /arch   /secops      │            │                    │
│                          │  /ui   /fe   /be   /rev  …         │  allowlist │                    │
│                          └──────────────────────────────────┘            │                    │
```

- **From the allowed set only.** The picker is a `<select>` (native, keyboard-operable, type-ahead for free) constrained to the **allowed agent set** — never free text (secops C-20: owner is a constrained/plain capped string, never a path). `—` clears the explicit owner, letting the stage fall back to the derived precedence (overlay → gate owner → `STAGE_OWNER_DEFAULT` → null, per arch D-6).
- **Shown on the row, escaped.** The selected owner renders `[ic glyph-agent] {owner}` in `--kb-text-muted`, **interpolated only** (a crafted owner string from a concurrent CLI write still shows as literal text — C-22).
- **Persisted with the stage list.** Changing the owner is an immediate single-field commit: the working entry's `owner` is set and the **whole list** is sent as `track/set-stages` (the op carries per-stage owner). Optimistic + CAS; **409 → §1.4 reconcile**; error → inline + rollback. Pill follows the §1.3 lifecycle (`saving…` → `saved`, `aria-live` "Owner for {stage} set to {owner}.").
- **Gate-owner vs stage-owner.** For a gate-bearing stage, the **gate's** owner is still edited in the §1.2 gate-rule editor (it drives the gate rule); the **stage** owner here is the agent that runs the stage. Where both exist the row shows the stage owner; the gate row (under `edit`) shows the gate owner — distinct, each labelled, neither colour-only.

---

## A.4 ADT-224 — viewed-project cue (mostly invisible; review-only)

ADT-224 is a backend scoping fix: writes and the live stream already target the **viewed** project through `ControlPlaneService` + the per-project SSE channel; the id travels server-side and the UI sends nothing new. **No new screen, no new mutation control.** The existing conflict/again states (§1.4, §2.3) already cover the staleness cases. My review conclusion and the **one small affordance** worth adding:

- **Confirm: the existing chrome already names the project.** The Project Shell header (`project-shell.component.ts`) shows the viewed project's name/title; the builder and board live *inside* that shell, so a mutation's target is unambiguous from the surrounding chrome. **No new control is required** to satisfy the ACs.
- **Small cue worth adding (optional, recommended).** To remove any doubt that a write lands in the **viewed** project (the root-cause bug was writes leaking to the launch project), add a **quiet context line** to the builder's overlay banner and the board header: `[ic glyph-info] Editing **{project name}**` / `[ic glyph-info] Tasks for **{project name}**` — the project name escaped, `--kb-text-muted`, no new interaction. This reuses `glyph-info` (no new glyph) and reassures the operator which project they're acting on when several are open in different tabs.
- **Cross-project staleness can't mislead.** Because each viewer's SSE channel is per-project (arch D-4), a frame from another project never reaches this board; the existing live-refresh + 409 reconcile already prevent a stale cross-project write from silently landing. **No new staleness UI is needed** beyond what §1.4 / §2.3 specify. If a live frame arrives for the viewed project, the board/builder re-derive in place (quiet `aria-live="polite"`), exactly as §2.5.

**Verdict (ADT-224 DESIGN — review):** no new screen; the existing chrome + conflict/live-refresh states are sufficient. The optional "you're viewing {project}" cue is a low-cost honesty improvement, not a blocker.

---

## A.5 Stage-aligned Tasks board (ADT-226)

Supersedes §2's status-grouped board. **Columns are now the active track's workflow stages, in order.** Status and needs-you move to **card chips** (they are not lost). This is a pure FE re-projection of state the server already delivers (arch D-9) — **no new route**.

### A.5.1 Wireframe — stage-aligned board

```
┌─ TASKS ───────────────────────────────────  [ic glyph-info] Tasks for “DART Cockpit”  ──────┐
│  track: full   (columns follow the workflow — edit it in Workflow to change these)           │
│ ┌─ vision ─────────┐ ┌─ architecture ───┐ ┌─ security ───────┐ ┌─ code ───────┐ ┌─ done ───┐ │
│ │ [ic agent] /po   │ │ [ic agent] /arch │ │ [ic agent]/secops│ │ [ic agent]/rev│ │ [ic chk] │ │  ← header: stage · owner · count
│ │            2     │ │            1     │ │            1     │ │       0      │ │     3    │ │
│ ├──────────────────┤ ├──────────────────┤ ├──────────────────┤ ├──────────────┤ ├──────────┤ │
│ │ ADT-221          │ │ ADT-219          │ │ ADT-219b         │ │              │ │ ADT-201  │ │
│ │ Editable Workflow│ │ KB embedder swap │ │ size-cap test    │ │   Nothing    │ │ Memory   │ │
│ │ [chip] in_prog   │ │ [chip] blocked   │ │ [chip] waiting   │ │   in code.   │ │ [chip]done│ │  ← status = card CHIP
│ │ [ic need] needs  │ │ [shield-solid]✗  │ │ [ic need] needs  │ │  (muted)     │ │          │ │
│ │  you     [ ⋯ ▾ ] │ │  SEC      [ ⋯ ▾ ]│ │  you      [ ⋯ ▾ ]│ │              │ │  [ ⋯ ▾ ] │ │
│ ├──────────────────┤ └──────────────────┘ └──────────────────┘ └──────────────┘ └──────────┘ │
│ │ ADT-225          │                                                                          │
│ │ Add/delete stage │              ◀───────────  horizontal scroll for many stages  ──────────▶│
│ │ [chip] in_prog   │                                                                          │
│ │          [ ⋯ ▾ ] │                                                                          │
│ └──────────────────┘                                                                          │
│ ─────────────────────────────────────────────────────────────────────────────────────────── │
│  [ic glyph-warning] OFF-TRACK (2)  — these tasks are in a stage that's no longer in the track │
│ ┌─ stage: “design-review” (removed) ─────────┐ ┌─ stage: “qa” (removed) ────────────────────┐ │
│ │ ADT-230  Spike  [chip] waiting   [ ⋯ ▾ ]    │ │ ADT-231  Flaky test  [chip] blocked [ ⋯ ▾ ]│ │
│ └────────────────────────────────────────────┘ └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### A.5.2 Columns, headers, placement

- **Columns = `workflowView.stages` in order.** The board iterates the **stage list**, not the tickets — so an **empty stage still renders** a labelled column with a muted placeholder ("Nothing in this stage.") (D-008). Column **header** = stage name (escaped) · its **owner** (`[ic glyph-agent] {owner}`, escaped, from `stageOwners`/`workflowView`) · a **count** of tickets in that stage. Header divider uses the existing `--kb-border`; no per-stage hue (stages aren't statuses — colour stays reserved for the status *chip*).
- **Placement** = each ticket in the column where `ticket.stage === stage`. Counts match underlying state (AC).
- **Horizontal scroll/overflow.** A track can have many stages; the board is a **horizontally scrollable row of columns** (`overflow-x: auto`, columns `min-width: ~12rem` as today, `scroll-snap-align: start` per column for tidy keyboard/scroll stops). The header's `track: …` line and the off-track lane stay pinned below; only the column strip scrolls. (No column virtualisation needed at this scale.)

### A.5.3 Status + needs-you as card chips

The card keeps §2.2's anatomy **minus the status-as-column meaning**: `id` (mono) · `title` (escaped, 2-line clamp) · **status chip** (`glyph + colour + text`: `glyph-progress`/`in progress`, `glyph-dot`/`waiting`, `glyph-blocked`/`blocked`, `glyph-check`/`done`) · gate-state chips (shield-shape hard/soft + state glyph) · a **`[ic glyph-need]` needs-you chip** when `ticketNeedsYou(t)` · the `[ic glyph-kebab] ⋯ ▾` action menu. Status is **a chip now, never a column** — it is preserved, not lost (D-008, AC).

### A.5.4 Advance = move to the next STAGE

The `⋯ ▾` menu (and the detail header's advance, §2.4) now reads **"Advance to {next stage}"** where next = `stages[indexOf(current)+1]` from the **stage order** (the existing `nextStage()` helper already computes this from `tracks`). On select → optimistic move of the card to the **column to its right** → existing `POST /api/ticket/advance {id, toStage, expectedRev, by}`. At the last stage the item reads "No further stage" (existing). **409 → §2.3 snap-back + inline "changed elsewhere — Retry"** (adopt the 409-body state). No drag (D-002/D-008): advance stays an explicit, labelled, keyboard-reachable action.

### A.5.5 Off-track lane (orphaned stage — never hidden)

A ticket whose `ticket.stage` is **not** in the active track's stage set (e.g. after that stage was deleted in §A.2) is **surfaced in a distinct "OFF-TRACK" lane** below the columns (D-008, C-27) — **never dropped, never silently re-placed**. Derived on the FE by set-difference (`ticket.stage ∉ columnStages`). The lane:

- Has a clear header `[ic glyph-warning] OFF-TRACK ({n})` with a one-line why ("…in a stage that's no longer in the track").
- Groups orphans by their **recorded stage** (shown escaped, labelled "(removed)") so the operator sees where each was.
- Each card keeps its full anatomy + the **advance menu**, so the operator can **advance it onto a real stage** to re-home it (advance targets a stage that *is* in the track). The lane is empty-hidden when there are no orphans (absent-not-zero — no "OFF-TRACK (0)").

### A.5.6 Live re-layout when the workflow is edited

Because columns derive from `workflowView.stages`, a workflow edit (ADT-225 add/delete/move, or a CLI agent's change) arrives on the **same per-project SSE channel** (ADT-224) and the board **re-lays-out live, no reload** (AC): columns appear/disappear/reorder; tickets stay in their `stage` columns; a just-deleted stage's tickets drop into the off-track lane; counts refresh. A live change shows a quiet `aria-live="polite"` "Board updated"; an open detail refreshes in place (§2.5). A non-conflicting live change while a card menu is open preserves it where possible.

### A.5.7 Board states

| Surface | Loading | Empty | Error | Conflict |
|---|---|---|---|---|
| Board | column skeletons keyed to the stage list | no tickets → "No tasks yet…" (§2.6); a stage with no tickets → muted "Nothing in this stage." placeholder (column still rendered) | "Couldn't load tasks." + Retry; board not blanked | re-derives from SSE (no banner) |
| Card advance | card `glyph-spinner` busy | — | inline "Couldn't advance: {reason}" + Retry; card snaps back | snap-back + "changed elsewhere — Retry" (§2.3) |
| Off-track lane | — | hidden when empty (absent-not-zero) | — | re-derives live |

---

## A.6 Iconography additions (inline-SVG concepts — no library, no tofu)

Same rules as §4: 24×24 viewBox, `stroke="currentColor"`, `stroke-width≈1.6`, `fill="none"`, `aria-hidden="true"`, colour inherited, **always paired with text**. New this addendum:

| Name | Where | Concept (build as inline SVG) |
|---|---|---|
| `glyph-add-stage` | builder list-foot "Add stage" + per-row `[+]` insert | A short horizontal bar (a stage) with a small `+` at its right edge: `line 4,12→16,12` (bar) + `lines 19,9→19,15 & 16,12→22,12` (plus) — reads "add a stage to the list", distinct from the bare `glyph-plus` (which means "add a project/note"). |
| `glyph-trash` | per-row "Delete {stage}" | A trash/bin outline: `rect` body + a `line` lid + two short inner `lines` (contents) — the universal "remove this row". Distinct from `glyph-remove` (the small chip `✕`), so deleting a *stage* ≠ removing a *trigger chip*. |
| `glyph-agent` (owner) | stage-row owner picker, column header owner | **Reuse** cockpit-v2 §4 `glyph-agent` (◆ diamond) — owner/agent is already this glyph; the picker just makes it editable. No new glyph. |

**Reused unchanged:** `glyph-info` (viewed-project cue + overlay banner), `glyph-warning` (delete confirm + off-track lane), `glyph-edit`, `glyph-grip`, `glyph-spinner`, `glyph-check`, `glyph-cross`, `glyph-conflict`, `glyph-kebab`, `glyph-advance`, `glyph-need`, `glyph-progress`, `glyph-dot`, `glyph-blocked`, `glyph-shield` (hard solid / soft dashed), `glyph-preset`, `glyph-remove`. **State-by-glyph+colour+text and hard/soft-by-shield-shape are unchanged** from §4. (Only **two** genuinely new glyphs — `glyph-add-stage`, `glyph-trash`; both must avoid the forbidden literal tofu symbols and resolve to real SVG paths.)

---

## A.7 Accessibility (WCAG 2.2 AA — addendum surfaces)

**Keyboard — add / delete / owner (ADT-225):**
- **Add stage:** both the list-foot button and each per-row `[+]` are `<button>`s; activating opens the new-stage row and **moves focus to the Name input**. The row is a labelled form (Name `aria-required`, error text associated via `aria-describedby`); `Enter` on a valid form submits, `Esc`/Cancel closes and returns focus to the trigger.
- **Delete:** `[ic glyph-trash]` is a `<button>` "Delete {stage}"; it opens the inline confirm with **focus on Cancel** (safe default); `Esc` cancels; the confirm's destructive button is reachable by Tab. The single-stage delete button is `disabled` + `aria-disabled` with the tooltip reason.
- **Owner:** the row owner is a native `<select>` (full keyboard + type-ahead, no custom widget); its accessible name is "Owner for {stage}".
- Reorder is unchanged from §1.5 (roving tabindex; `Alt+↑/↓` moves the stage; `aria-live` announces position). Add/delete also announce via `aria-live="assertive"` ("Stage {name} added/deleted at position {n} of {m}").

**Keyboard — stage board (ADT-226):**
- Columns are a `role="list"` of `role="listitem"` stage columns; **the column strip is horizontally scrollable and keyboard-navigable** — `←/→` move focus across columns, `↑/↓` within a column's cards, cards activate with `Enter`/`Space` to open detail, the `⋯` menu is a `role="menu"` (arrow keys, `Esc`). The **off-track lane** is a peer `role="list"` reachable in normal Tab/arrow order — it is **not** a focus trap and never hidden when populated, so an orphaned ticket is always reachable to advance.
- Focus is **never obscured** by the pinned `track:`/off-track header during horizontal scroll (`scroll-margin` on columns; 2.4.13).

**aria-live:**
- **builder (225):** the save-status pill stays `aria-live="polite"` (saved/saving); add/delete/owner changes announce on commit; the §1.4 409 reconcile is `role="alert"` and takes focus.
- **board (226):** live re-layout → `aria-live="polite"` "Board updated"; an advance 409 → `role="alert"` on the card; a stage delete that orphans tickets announces "{n} task(s) are now off-track."

**Escaped untrusted text everywhere (secops C-22/C-26):** stage names, owners, column headers, ticket titles, the off-track lane's "(removed)" stage labels, and the viewed-project name — **Angular interpolation only, never `[innerHTML]`/`bypassSecurityTrust*`** (`no-unsafe-binding` stays green). A `<script>`/`<img onerror>` payload in any of these renders as literal text.

**Contrast / targets / focus:** column header text + count `--kb-text` ≥ 4.5:1; the stage-column divider, the off-track lane border, and chip borders ≥ 3:1; all interactive ≥ 24px (≥ 44px under `pointer:coarse`) — the `[+]` insert, `[ic glyph-trash]` delete, owner select, Add/Delete/Cancel buttons, and the board's `⋯` menu; focus = 2px `--kb-focus-ring`, 2px offset, ≥ 3:1.

**Reduced motion:** the new-stage row entrance, the delete-row collapse, the board's live column re-layout transition, and `glyph-spinner` all respect `prefers-reduced-motion` (no slide/shimmer → instant; spinner → static ring). No essential state is conveyed by motion — the text label always carries it.

**Colour never alone:** stage columns are not coloured by status (colour stays on the status *chip*); every status/gate/needs-you/save-lifecycle pairs **glyph + text**; hard/soft gate stays **shield shape**; the off-track lane is marked by **`glyph-warning` + the word OFF-TRACK + a position-in-track explanation**, never colour alone.

---

## A.8 Buildability & handoff notes (addendum)

- **No new runtime deps, no icon library, no `[innerHTML]`.** Two new inline-SVG glyphs only (`glyph-add-stage`, `glyph-trash`); `no-tofu-glyphs` + `no-unsafe-binding` stay green (resolve wireframe symbols to glyphs, never paste them).
- **Reuse, don't add.** The builder add/delete/owner all ride the **one** new backend op `track/set-stages` (declarative full-list write) — the FE sends the whole working list; it never invents a path or filename (secops C-19/C-20). The board adds **zero** server surface (arch D-9): columns from `workflowView.stages`, placement by `ticket.stage`, advance via the existing `ticket/advance`. ADT-224 needs **no** new client send — scoping is server-side; the only UI delta is the optional "{project name}" cue (`glyph-info`, no interaction).
- **Shared conflict helper.** `set-stages` (add/delete/move/owner) and `advance` reuse the existing `conflictReconcile(attempt, serverState)` pattern (§6): adopt server state → roll back optimistic → surface CONFLICT → offer retry/re-apply. Append-only and read paths need none.
- **Suggested order:** ADT-224 (scoping — unblocks the rest) → ADT-225 builder add/delete/owner (needs `/be`'s `set-stages` + `overlay.stageOwners` first) → ADT-226 board re-projection (pure FE over the now-scoped state + the ADT-225 stage model).
- **Design QA after `/fe`** (against the **production build served same-origin**): a deleted stage's tickets appear in the off-track lane (not lost); add/delete/owner persist on reload with the base `workflow.yaml` byte-identical; columns re-lay-out live when the workflow is edited; advance moves a card one stage right and 409 snaps it back; horizontal scroll + keyboard column nav; paste `<script>` into a stage name / owner / ticket title → literal text; the owner picker offers only the allowed set; the viewed-project cue names the right project across two tabs.

---

## A.9 Gate (addendum)

`DESIGN_APPROVED` recorded **passed** for:
- **ADT-225 (soft)** — add-stage (affordance, insert point, validation, states), delete-stage (confirm + ticket-count + off-track handling per D-008, states), set-owner (inline allowlist picker on every stage row, escaped), all on the §1 builder, the overlay stage model, the shared 409 reconcile, and the keyboard/aria contract; two new inline-SVG glyphs.
- **ADT-226 (soft)** — stage-aligned board (columns = ordered `workflowView.stages` with stage·owner·count headers; placement by `ticket.stage`; advance to next stage; status + needs-you as card chips; empty columns rendered; off-track lane for orphaned-stage tickets; horizontal scroll; live re-layout) with loading/empty/error/conflict states and the board keyboard/aria contract — zero new server surface.
- **ADT-224 (review)** — no new screen; existing chrome + conflict/live-refresh states are sufficient; an optional low-cost "you're viewing {project}" cue (`glyph-info`) is recommended, not required.

All within the arch data contracts (D-5…D-9) and the secops constraints (C-18…C-27 / N-17…N-23): overlay-only, validated, CAS-safe, escaped-everywhere, no new file-write surface beyond `.aidevteam/workflow.overrides.json`.

**Next:** ADT-224 → `/be` ships `resolveProject` + per-project channels (N-1…N-16) → `/fe` wires the viewed id (+ optional cue); ADT-225 → `/be` ships `track/set-stages` + `overlay.stageOwners` (N-17…N-21) → `/fe` builds add/delete/owner over the §1 builder; ADT-226 → `/fe` re-projects the board (escaped) → `/rev`. Then `/sm` — please update sprint status.
