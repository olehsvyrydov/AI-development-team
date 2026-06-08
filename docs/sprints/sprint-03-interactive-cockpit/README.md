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

## Chunk 2 — root-cause fix + editable workflow + stage-aligned board

User testing of the live interactive Cockpit surfaced a **root-cause multi-project scoping bug** and two product gaps. The Cockpit reads per-project correctly, but `hub/server.js` routes control-plane **writes** through `api.handle(route, data, PROJECT)` and the **live SSE stream** through `buildState()` — both bound to the single project the hub was *launched* with. Every browser mutation and every live update therefore targets the launch project, not the viewed one (proof: a note added while viewing one project was written to the launch project). The two gaps: the workflow is not editable (can't add/delete/move stages or set owner/gate-trigger), and the Tasks board groups by generic status instead of mirroring the workflow stages.

| ID | Title | New backend? | Implementers | Gates |
|----|-------|--------------|--------------|-------|
| [ADT-224](tickets/ADT-224-project-scoped-control-plane.md) | Project-scoped control plane + live updates | Yes (write routing + SSE scoped by viewed-project id, registry-resolved + path-confined) | /be (routing) + /fe (send/subscribe with id) | ARCH, **SECOPS (HARD)**, DESIGN (review), APPROVAL, CODE_REVIEW, VERIFY |
| [ADT-225](tickets/ADT-225-editable-workflow-builder.md) | Fully editable workflow builder (add/delete/move stage + owner + gate-trigger) — supersedes ADT-221 scope | Yes (stage add/delete overlay op + per-stage owner) | /be (overlay op) + /fe (builder) | ARCH, SECOPS (review), DESIGN, APPROVAL, CODE_REVIEW, VERIFY |
| [ADT-226](tickets/ADT-226-stage-aligned-tasks-board.md) | Stage-aligned Tasks board — supersedes ADT-222 scope | No (re-projection over existing state) | /fe (mostly) + /be (confirm data) | ARCH, SECOPS (review), DESIGN, APPROVAL, CODE_REVIEW, VERIFY |

**Classification (workflow-engine):** `solo` preset; all three **significant → `full` track**. **ADT-224 SECOPS is HARD** (safety override): external input selects a write-target path, so id→path resolution must confine every write to a registered project root (prove the negative: a crafted id can't write outside a registered path) — never downsized. ADT-225/226 get a SECOPS **review** (no new file-write surface beyond the existing overlay; ADT-225 validates new stage/owner input). ARCH and APPROVAL/CODE_REVIEW/VERIFY are hard on all three (full track); DESIGN is soft (review-only for 224, full for the two UIs). ADT-226 depends on ADT-224 (scoped live updates) and shares the stage model with ADT-225.

**Deferred (named backlog in DECISION_LOG):** comment/handoff loop (BL-01), KB edit/delete + interpretation-check (BL-02), the DART↔main-tool plugin / record-intent execution model (BL-03), workflow conditions/loops (BL-04), drag-advance & free-form track authoring (BL-05).

**Next action:** `/arch` (Jorge) holds ADT-224/225/226 (`assignee: /arch`, stage `ready`). Architecture first; then `/secops` (HARD for ADT-224, review for 225/226); then `/ui` (Aura) for design; then the Approval Gate; then `/fe` + `/be` under TDD.

## Definition of Done (this sprint)

Per the global DoD, plus the sprint-specific negatives that must be proven, not assumed:
- ADT-221: base `workflow.yaml` left byte-unchanged after edits; a stale-rev save is rejected (409), not applied.
- ADT-222: a UI-added comment appears in both the timeline and the JSONL; a stale-rev advance/gate action is rejected.
- ADT-223 (HARD): traversal/absolute/symlink targets rejected; an existing file is never overwritten; oversize/disallowed content rejected; the write is refused without the write-guard.
- ADT-224 (HARD): a mutation/subscription while viewing project A targets A (not the launch project); an unknown/unregistered id is refused with nothing written; a crafted id/path cannot write outside a registered root (filesystem unchanged) — proven by negative test; guard + CAS preserved; single-project launch still works; two viewers see no cross-talk.
- ADT-225: base workflow definition byte-identical after a full add/delete/move/owner/gate session; invalid edits (bad rearrangement, duplicate/empty name, empty-track delete) rejected with nothing persisted; a stale-rev save is rejected (409).
- ADT-226: columns equal the active track's stages in order; advancing moves a task to the next stage; editing the workflow re-lays-out the columns without reload; an out-of-track-stage task stays visible (not dropped); status/needs-you remain as card chips.
