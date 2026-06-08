# ADT-228 — Drag-to-reorder workflow builder

**Type:** Story · **Track:** full (significant) · **Sprint:** sprint-04-conditional-workflow
**Implementer:** /fe · **Stage:** ready · **Assignee:** /arch (architecture first)
**Gates:** ARCH_APPROVED (hard) · DESIGN_APPROVED (soft — aura's investigation largely covers it,
treat as review) · SECOPS_APPROVED (review — no new write surface) · CODE_REVIEWED (hard) ·
VERIFIED (hard)

## Why

Today each builder row carries up/down arrow buttons and a per-row insert arrow. The user wants to
**reorder stages by dragging the grip handle**, with "Add stage" simply appending to the end and the
new stage then dragged into place. This is a pointer affordance over the **same declarative
`set-stages` overlay write** the builder already uses — no new persistence, no new server surface.

## Scope (Phase 0)

In scope:
- Replace the per-row up/down arrow buttons (as the primary affordance) with **grip-handle
  drag-and-drop** to reorder stages; only the grip initiates a drag (row body stays clickable).
- A **keyboard-accessible drag alternative** (WCAG 2.2 2.5.7): keep the existing `Alt+↑/↓` reorder
  as the tested primary, plus a pick-up/move/drop keyboard mode, plus Move up/Move down in a row menu.
- **"Add stage" appends to the end**, then the new row is drag/keyboard-moved into place (no per-row
  insert arrow).
- Keep the **delete (trash/basket)** affordance, including its existing off-track confirm.
- Persist every reorder/add/delete as **one atomic `track/set-stages` CAS write** with the existing
  `expectedRev` + 409 reconcile banner — same write contract as today.

Out of scope:
- Card-drag on the Tasks board (advance stays a routed action — deferred, BL-05).
- The rule-editor (ADT-229) and the rules engine (ADT-227).
- Pipeline-board visuals, done-folder, knowledge-panel changes (later chunk).

## Behavioral acceptance criteria (Given/When/Then)

**AC-1 — Reorder by dragging the grip** *(aura §1.2)*
Given a workflow with several stages in order,
When the user drags a stage by its grip handle and drops it at a new position,
Then the stage moves to that position, the full reordered stage list persists as one atomic write,
and the saved order is reflected after the server confirms.

**AC-2 — Only the grip starts a drag** *(aura §1.2)*
Given a builder row with a grip, an owner control, and a delete control,
When the user presses on the row body (not the grip),
Then no drag starts and the row's other controls remain operable; a drag starts only from the grip.

**AC-3 — Add stage appends, then is moved into place** *(aura §1.3)*
Given the "Add stage" action,
When the user adds a stage,
Then the new stage is appended to the **end** of the list, is focused with a one-time accessible
cue that it can be dragged into place, and a subsequent drag/keyboard move repositions it.

**AC-4 — Keyboard reorder has parity (no mouse required)** *(aura §1.4, WCAG 2.5.7)*
Given keyboard-only operation with a grip focused,
When the user reorders via `Alt+↑/↓` (or the pick-up/move/drop mode, or the row menu's Move up/down),
Then the stage moves the same way a drag would, position changes are announced, and the same atomic
write persists — dragging is never the only path.

**AC-5 — Delete keeps the basket and its confirm** *(aura §1.1)*
Given a stage that has tickets in it,
When the user deletes that stage via the trash control,
Then the existing off-track confirm appears and, on confirm, the stage is removed via the same
declarative write (its tickets are surfaced off-track, never dropped).

**AC-6 — Cancel/empty drag writes nothing**
Given a drag in progress,
When the user presses Escape or drops outside any valid target,
Then the row returns to its original position and no write is sent.

**AC-7 — Concurrent change reconciles, never silently overwrites** *(aura §1.5)*
Given another writer changed the workflow while a drag was staged,
When the user's reorder is saved against a stale revision,
Then the server returns a conflict (409), the existing reconcile banner takes focus describing what
was attempted, and the row snaps back to server truth — never a silent overwrite.

## Negatives that MUST be proven
- The base `workflow.yaml` is left byte-unchanged; reorder/add/delete land only in the overlay.
- A stale-rev save is rejected (409), not applied.
- A keyboard-only user can fully reorder, add, and delete with no pointer.
- A cancelled drag sends no write.

## Out of scope / not this ticket
The rules engine (ADT-227), the rule-editor UI (ADT-229), board card-drag, pipeline visuals.
