# ADT-221 — Editable Workflow builder

**Track:** full · **Stage:** ready · **Assignee:** /arch (next gate)
**Implementers:** /fe (builder UI) · /be (confirm/extend wiring only — no new route expected)
**Gates:** ARCH_APPROVED (hard) · SECOPS_APPROVED (review) · DESIGN_APPROVED · APPROVAL_GATE · CODE_REVIEWED · VERIFIED

## Story

As a person running a project from the Cockpit, I want the Workflow view to be an editable builder so that I can change the project's actual process — reorder the stages of a track, edit which trigger drives a gate and who owns it and whether it's hard or soft, and switch the preset — and have those changes persist and take effect, without ever damaging the project's base workflow definition.

## Behavioral acceptance criteria

- [ ] The Workflow view presents the active track's stages in order and lets me **reorder** them; after I save, the order persists and the view reflects the new order on reload.
- [ ] I can **edit a gate's rule**: its trigger labels, its owner, and whether it is hard or soft; after I save, the change persists and the view reflects it.
- [ ] I can **switch the preset** among the allowed options (solo, small-team, regulated); after I save, the active preset and any preset-driven always-required gates are reflected.
- [ ] Every edit is **persisted to the project's overlay** and the project's **base workflow definition is never modified** by these edits (provable: the base file is byte-identical before and after).
- [ ] A reorder is accepted only when the new order is a **valid rearrangement of the same stages** (no added, dropped, or duplicated stages); an invalid rearrangement is rejected with a clear message and no change is persisted.
- [ ] Edits are **conflict-safe**: if the underlying state changed since I opened the editor, my save is rejected and the view re-syncs to the current state rather than silently overwriting someone else's change; I can retry against the fresh state.
- [ ] The view shows clear **dirty / saving / saved / conflict** states; a failed save leaves the displayed model consistent with the server (optimistic change rolled back).
- [ ] The builder is **keyboard-operable**, meets AA contrast, and conveys state with **glyph + label, never color alone**.
- [ ] Untrusted text (labels, owners) is rendered as **escaped text** — no raw HTML injection.

## Out of scope (PO decision — see DECISION_LOG D-001)

- Free-form authoring of brand-new tracks/stages/gates from scratch. MVP edits the existing structure (reorder + rule edit + preset). 
- "Stage owner" editing beyond a **gate's** owner. MVP edits gate owners only; per-stage non-gate owners are deferred pending /arch confirming whether the overlay supports them.

## Notes for /arch

Existing control-plane routes already cover this surface (reorder, gate trigger/owner/refusal, preset), all overlay-only and behind the write-guard + CAS. Confirm the Cockpit reuses them with `expectedRev`/409 handling and that the live workflow projection reflects edits without restart. Ratify or flag the stage-owner scope decision.
