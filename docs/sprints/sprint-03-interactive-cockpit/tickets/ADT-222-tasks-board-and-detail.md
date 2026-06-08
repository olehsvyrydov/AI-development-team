# ADT-222 — Tasks board + task detail

**Track:** full · **Stage:** ready · **Assignee:** /arch (next gate)
**Implementers:** /fe (board + detail UI) · /be (confirm wiring only — no new route expected)
**Gates:** ARCH_APPROVED (hard) · SECOPS_APPROVED (review) · DESIGN_APPROVED · APPROVAL_GATE · CODE_REVIEWED · VERIFIED

## Story

As a person running a project from the Cockpit, I want a tasks board organized into columns by status and a detail view for any task, so that I can see at a glance what is going on, advance a task, read and add agent comments, see the task's status and its gate/trigger labels, and approve or reject a gate where one applies.

## Behavioral acceptance criteria

- [ ] The Tasks view shows tasks **distributed into columns by status**; every status bucket present in the project is represented, and counts match the underlying state.
- [ ] I can **advance a task** to the next stage from the board; after the action the task moves and the new stage persists.
- [ ] Clicking a task opens a **detail view** showing the task's **status**, its **stage**, and its **gate/trigger labels** (which gates govern it and whether each is hard or soft).
- [ ] The detail view shows the task's **agent comments as a timeline** (author, kind, time, body), in order.
- [ ] I can **add a comment** to a task from the detail view; after I post it, it appears in the timeline and is persisted to the task's comment record.
- [ ] Where a gate applies, I can **approve or reject** that gate from the detail view; the decision persists, the gate label updates, and the same typed audit comment a CLI agent would leave is recorded.
- [ ] The board and detail view receive **live updates** — a change made elsewhere (CLI agent, another action) appears without a manual reload.
- [ ] Actions are **conflict-safe**: an advance, comment, or gate decision made against stale state is rejected and the view re-syncs to current state rather than overwriting; I can retry.
- [ ] Comment bodies and authors are rendered as **escaped text** (no raw HTML injection); an over-long comment body is rejected per the existing server cap with a clear message.
- [ ] The board and detail view are **keyboard-operable**, meet AA contrast, and convey status with **glyph + label, never color alone**.

## Out of scope (PO decision — see DECISION_LOG D-002)

- Free drag-and-drop between columns as the advance mechanism. MVP advances a task via an **explicit action/menu** (clear, accessible, conflict-safe). Drag-to-advance is a possible later enhancement.
- Editing a task's title/description from the board.

## Notes for /arch

Existing routes cover advance (`ticket/advance`), comment (`ticket/comment`), and gate decision (`gate/set`), all guarded + CAS, with `gate/set` already emitting the typed audit comment. Columns/labels are projections of existing state (`tickets[]`, `gateDefs`, `workflowView`). Confirm the Cockpit reuses them with `expectedRev`/409 and reuses the read panels' existing live-update mechanism.
