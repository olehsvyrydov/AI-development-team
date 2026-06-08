# Sprint 03 — Interactive Cockpit

**Status:** Planning (tickets defined, gates pending)
**Goal:** Turn the read-only Cockpit into an interactive control surface — an editable Workflow builder, a Tasks board with task detail, and a Knowledge Base that accepts input — so a user can change a project's process, drive its tasks, and feed its Base from the browser.

## Context

The Cockpit (Angular) currently renders three read-only panels (Workflow, Tasks, Base) over the hub state projection. The hub control-plane already exposes the write routes for workflow-edit and task-mutation behind the loopback write-guard (`X-AIDT` + loopback Host/Origin) with atomic CAS ledger writes and overlay-only workflow edits. The legacy board already proved these flows (clickable ticket modal, comments timeline, gate approve/reject, drag-reorder builder). This sprint brings those capabilities into the new Cockpit UI.

The only genuinely new backend is a **Knowledge Base write endpoint** (deferred from earlier): adding a browser-supplied note/document to a project's Base. Because it writes browser content to files in the project, it is a HARD security gate.

## Tickets

| ID | Title | New backend? | Implementers | Gates |
|----|-------|--------------|--------------|-------|
| [ADT-221](tickets/ADT-221-editable-workflow-builder.md) | Editable Workflow builder | No (reuses `track/reorder`, `gate/trigger`, `preset`) | /fe (+ /be wiring confirm) | ARCH, SECOPS (review), DESIGN, APPROVAL, CODE_REVIEW, VERIFY |
| [ADT-222](tickets/ADT-222-tasks-board-and-detail.md) | Tasks board + task detail | No (reuses `ticket/advance`, `ticket/comment`, `gate/set`) | /fe (+ /be wiring confirm) | ARCH, SECOPS (review), DESIGN, APPROVAL, CODE_REVIEW, VERIFY |
| [ADT-223](tickets/ADT-223-knowledge-base-input.md) | Knowledge Base input | **Yes** (new KB-write endpoint) | /be (endpoint) + /fe (form) | ARCH, **SECOPS (HARD)**, DESIGN, APPROVAL, CODE_REVIEW, VERIFY |

## Workflow classification (workflow-engine)

- **Preset / track:** `solo` preset; all three classified **significant → `full` track** (these are write/mutation features driven from the browser; ADT-223 adds a new endpoint writing external input to files). The full track runs vision → architecture → security → design → approval_gate → tdd → code_review → design_qa → qa → reliability → verify → done.
- **Required gates per the engine triggers:**
  - **ARCH_APPROVED** (hard) — all three: new Cockpit↔control-plane wiring; for ADT-223 a new public route. Triggers: `public_api`, `cross_boundary`.
  - **SECOPS_APPROVED** (hard, safety-override) — ADT-223 is a **hard** gate (`external_input` + file write: containment, no-overwrite, allowlist, size cap, guard). ADT-221/222 get a **security review** (no new file-write surface; confirm the Cockpit drives the existing guarded/CAS/overlay-only routes safely, with optimistic-write + 409 handling and no new bypass).
  - **DESIGN_APPROVED** — all three (significant interactive UIs). Route to /ui (Aura) next.
  - **APPROVAL_GATE / CODE_REVIEWED / VERIFIED** — all three (full track).

## Next action

`/arch` (Jorge) holds all three tickets (`assignee: /arch`, stage `ready`). Architecture first, then `/secops` (hard for ADT-223), then `/ui` (Aura) for design, then the Approval Gate, then `/fe` + `/be` under TDD.

## Definition of Done (this sprint)

Per the global DoD, plus the sprint-specific negatives that must be proven, not assumed:
- ADT-221: base `workflow.yaml` left byte-unchanged after edits; a stale-rev save is rejected (409), not applied.
- ADT-222: a UI-added comment appears in both the timeline and the JSONL; a stale-rev advance/gate action is rejected.
- ADT-223 (HARD): traversal/absolute/symlink targets rejected; an existing file is never overwritten; oversize/disallowed content rejected; the write is refused without the write-guard.
