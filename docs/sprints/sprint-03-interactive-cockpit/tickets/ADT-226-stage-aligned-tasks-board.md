# ADT-226 — Stage-aligned Tasks board

**Track:** full · **Stage:** ready · **Assignee:** /arch (next gate)
**Implementers:** /fe (board columns + movement, mostly) · /be (confirm the stage/ticket data projection)
**Gates:** ARCH_APPROVED (hard) · SECOPS_APPROVED (review) · DESIGN_APPROVED · APPROVAL_GATE · CODE_REVIEWED · VERIFIED

> Supersedes the status-grouped board of the earlier ADT-222. The user reported the board groups by generic STATUS but should mirror the project's **workflow STAGES**, and that changing the workflow should change the board.

## Story

As a person running a project from the Cockpit, I want the Tasks board's **columns to be the active track's workflow stages** (not generic statuses), with each task sitting in its current-stage column, so that the board mirrors the process I configured — and when I edit the workflow, the board's columns change to match.

## Behavioral acceptance criteria

- [ ] The board's **columns are the active track's workflow stages**, in workflow order — not generic status buckets.
- [ ] Each task appears in the column for **its current stage**; column counts match the underlying state.
- [ ] **Advancing** a task moves it to the **next stage in the workflow** (the column to its right), and the move persists.
- [ ] When the **workflow is edited** (a stage added, deleted, or reordered via the builder), the board's **columns change to match** — without a manual reload — and tasks remain in the correct stage columns.
- [ ] A task whose recorded stage is **not present** in the active track (e.g. after a stage was deleted) is still visible and clearly surfaced (not silently dropped), so it can be re-placed.
- [ ] **Status** and **needs-you / needs-attention** remain visible as **card chips** on each task (status is not a column anymore, but it is not lost).
- [ ] A **stage column with no tasks** still renders (labeled, empty) so the workflow shape stays legible.
- [ ] The board receives **live updates**: a task advanced elsewhere (CLI agent or another viewer) moves columns without a manual reload.
- [ ] Advancing is **conflict-safe**: an advance against stale state is rejected and the view re-syncs rather than overwriting; the user can retry.
- [ ] The board is **keyboard-operable**, meets AA contrast, and conveys status with **glyph + label, never color alone**; task text is rendered **escaped** (no raw HTML injection).

## Out of scope (PO decision — see DECISION_LOG D-008)

- Free drag-and-drop between columns as the advance mechanism. Advance stays an **explicit action/menu** (accessible, conflict-safe) as decided for the board; drag-to-advance is a later enhancement.
- The task **detail view** (comments timeline, add-comment, gate approve/reject) is the existing detail surface and is not re-specified here; this ticket changes the **board columns**, not the detail panel.
- Re-defining what "advance" means at the data layer — advance continues to use the existing `ticket/advance` semantics; this ticket aligns the **columns** to stages and confirms the stage/ticket data is available.

## Notes for /arch

- Columns/positions are a **projection** of existing state: the active track's stages (`workflowView` / `tracks` in `hub/lib/state.js`) and each ticket's current stage (`tickets[]`). Advance already exists (`ticket/advance`).
- Confirm the stage list and each ticket's stage are both present in the read projection the board consumes, that "next stage" is well-defined from the workflow order, and that workflow edits (ADT-225) and task moves both flow through the same live-update mechanism the read panels already use. Depends on ADT-224 (live updates scoped to the viewed project) and shares the stage model with ADT-225.
