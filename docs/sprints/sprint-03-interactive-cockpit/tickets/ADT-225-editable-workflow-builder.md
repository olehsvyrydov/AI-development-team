# ADT-225 — Fully editable workflow builder

**Track:** full · **Stage:** ready · **Assignee:** /arch (next gate)
**Implementers:** /be (a stage-set overlay op + stage owner/gate-trigger persistence) · /fe (the editable builder UI)
**Gates:** ARCH_APPROVED (hard) · SECOPS_APPROVED (review) · DESIGN_APPROVED · APPROVAL_GATE · CODE_REVIEWED · VERIFIED

> Supersedes the reorder-only scope of the earlier ADT-221. The user reported the workflow "is not editable": they cannot add, delete, or move stages, nor set a stage's owner/agent or its gate/trigger. This ticket makes the builder fully editable, overlay-only.

## Story

As a person configuring a project's process from the Cockpit, I want the Workflow view to be a **fully editable builder** — I can add a stage, delete a stage, move a stage, and set a stage's owner/agent and its gate/trigger — so that I can shape the project's actual workflow from the browser, and have every change persist without ever modifying the project's base workflow definition.

## Behavioral acceptance criteria

- [ ] I can **add a stage** to the active track at a chosen position; after I save, the new stage persists and appears in order on reload.
- [ ] I can **delete a stage** from the active track; after I save, it is gone on reload, and any state that depended on it is handled gracefully (no orphaned/broken view).
- [ ] I can **move (reorder)** a stage to a new position; after I save, the order persists reliably and the view reflects it on reload.
- [ ] I can **set a stage's owner/agent**; after I save, that owner persists and is shown for the stage.
- [ ] I can **set a stage's gate/trigger** (which gate governs the stage and the trigger/refusal for it); after I save, the gate/trigger persists and is reflected.
- [ ] Every edit is **persisted to the project's overlay**; the project's **base workflow definition is never modified** (provable: the base file is byte-identical before and after a full add/delete/move/owner/gate edit session).
- [ ] An **invalid edit is rejected** with a clear message and nothing is persisted: a reorder that is not a valid rearrangement of the resulting stage set, a duplicate stage name, an empty/whitespace stage name, or a delete that would leave the track empty.
- [ ] Edits are **conflict-safe** (optimistic write with expected revision): if the underlying state changed since I opened the editor, my save is rejected, the view re-syncs to current state rather than silently overwriting, and I can retry against the fresh state.
- [ ] The view shows clear **dirty / saving / saved / conflict** states; a failed save rolls the optimistic change back so the displayed model matches the server.
- [ ] The builder is **keyboard-operable**, meets AA contrast, and conveys state with **glyph + label, never color alone**.
- [ ] Untrusted text (stage names, owners) is rendered as **escaped text** — no raw HTML injection.

## Out of scope (PO decision — see DECISION_LOG D-007)

- **Conditions and loops** on stages (branch/skip rules, loop-back edges) beyond add / delete / move / owner / gate-trigger. Documented follow-up (backlog), unless /arch finds them trivial to express in the existing overlay during architecture.
- Free-form authoring of brand-new **tracks** or brand-new **gate definitions** from scratch. This ticket edits the stages of the active track and their owner/gate-trigger; new-track authoring is a later chunk.
- Preset switching is already covered by the existing `preset` route and is not re-specified here.

## Notes for /arch and /secops

- Reorder, gate trigger/owner/refusal, and preset already exist as overlay-only, guarded, CAS routes (`hub/lib/api.js`). **New** here is a **stage add/delete** overlay mutation (a "set the track's stage list" op) plus **per-stage owner** persistence.
- **/arch:** define the overlay shape for the stage list and per-stage owner/gate-trigger (extend `state.js` `tracks` / `stageOwners` / `workflowView` projections), confirm it is overlay-only (base file untouched) and CAS-safe, and rule on whether per-stage non-gate owners and conditions/loops are expressible now or deferred.
- **/secops (review):** the add/delete/owner op is a new overlay mutation accepting external input (stage names, owners) — confirm it is overlay-only, validated (no injection into the workflow projection, no path/field escape), CAS-safe, and behind the write-guard. No new file-write surface beyond the overlay.
