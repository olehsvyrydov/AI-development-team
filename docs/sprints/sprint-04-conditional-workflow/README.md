# Sprint 04 — Conditional Workflow (Phase 0)

**Status:** Planning (tickets defined, gates pending)
**Branch:** feat/dart-interactive
**Goal:** Ship **Phase 0** of the conditional/looping/event-driven workflow — a user-controlled
`when → do` rules+labels engine that DART enforces deterministically, plus the two authoring
surfaces: a drag-to-reorder workflow builder and a plain-English rule editor. DART **records
intent** (it routes the ticket, sets labels, assigns, and records instruct-directives); the host
tool executes the agents.

## Context

The four investigations in `docs/product-vision/conditional-workflow/` (arch-jorge, research-anna,
ux-aura, strategy-apex) establish that Phase 0 is **buildable now** on the existing
file/overlay/comment/hook substrate — the append-only comment log + the ledger already *are* the
event stream, `channels.js` already watches them, and the workflow overlay + CAS write already
exist. Phase 0 adds a `rules:`/`labels:` grammar, a `labels:[]` ledger field, a deterministic Core
evaluator over the existing event stream, and the two UI authoring surfaces — all on the current
`~/.claude` install, no plugin required.

## Tickets

| ID | Title | New backend? | Implementer | Gates |
|----|-------|--------------|-------------|-------|
| [ADT-227](tickets/ADT-227-rules-labels-engine.md) | Rules + labels engine (deterministic Core) | **Yes** (rules/labels model, `labels:[]` ledger field, `label` event, Core evaluator, loop-safety) | /be | ARCH, **SECOPS (HARD)**, APPROVAL, CODE_REVIEW, VERIFY |
| [ADT-228](tickets/ADT-228-drag-to-reorder-builder.md) | Drag-to-reorder builder | No (reuses `track/set-stages` overlay CAS) | /fe | ARCH, DESIGN (review), SECOPS (review), CODE_REVIEW, VERIFY |
| [ADT-229](tickets/ADT-229-when-do-rule-editor.md) | when→do rule editor UI | No / small (reuses overlay CAS; /be only if a dedicated rule-CRUD route is needed) | /fe (+ /be wiring confirm) | ARCH, SECOPS (review), DESIGN (review), CODE_REVIEW, VERIFY |

## Workflow classification (workflow-engine)

- **Preset:** `solo`. Gates fire on trigger / change-class.
- **Track:** all three classified **significant → `full`** track
  (`vision → architecture → security → design → approval_gate → tdd → code_review → design_qa →
  qa → reliability → verify → done`). ADT-227 is a new control surface (rules engine + new ledger
  field + a deterministic evaluator that performs mutations); ADT-228/229 are significant
  interactive authoring UIs that drive guarded writes.
- **Required gates per the engine triggers:**
  - **ARCH_APPROVED (hard)** — all three. ADT-227 adds a new model/evaluator + a new ledger field
    + the rule/label grammar (`schema_change`, `new_service`-class control plane); ADT-228/229 wire
    new Cockpit surfaces onto the control plane. Architecture first for all three.
  - **SECOPS_APPROVED** —
    - **ADT-227 is HARD (safety-override).** Rule authoring is a **write surface**, and the
      evaluator must never let a rule (a) route a ticket *around* a `safety_override` gate
      (e.g. SECOPS_APPROVED) or (b) escalate an agent's allowed labels beyond its `settable_by`
      contract. Loop-safety (budget → NEEDS_HUMAN), CAS, dedup-trace, and the guard must hold.
      Never downsized.
    - **ADT-228 — review.** No new write surface (reuses the existing guarded `set-stages` overlay
      CAS); confirm the drag path adds no bypass and keeps optimistic-write + 409 handling.
    - **ADT-229 — review.** Rule authoring is a write surface but reuses the guarded overlay CAS;
      confirm the editor cannot persist a contract-violating or gate-bypassing rule and that all
      rule text is escaped on render.
  - **DESIGN_APPROVED (soft / review)** — ADT-228 and ADT-229. Aura's UX investigation
    (`ux-aura.md`) largely covers both; treat as review (turn the wireframes into a per-ticket
    design spec for /fe). ADT-227 has no UI.
  - **APPROVAL_GATE (hard)** — ADT-227 (full track; the new control surface needs the pre-impl
    readiness audit). ADT-228/229 carry it as full-track tickets as well; /verify gates pre-impl.
  - **CODE_REVIEWED / VERIFIED (hard)** — all three (full track).

## Dependencies & order

- **ADT-227 is the foundation.** ADT-229 (rule editor) authors the data ADT-227 enforces, and its
  allowed-labels strip + bypass-prevention mirror ADT-227's contract — so ADT-227's model/contract
  must be agreed first. ADT-228 (drag builder) is independent of the rules model (it only reorders
  stages) and can proceed in parallel.
- Suggested implementation order: ADT-227 (engine + contract) → ADT-229 (editor over it) ; ADT-228
  in parallel.

## /po decisions (this sprint — see DECISION_LOG.md)

- **D-401** Loop-iteration ceiling default = **3** backward traversals per ticket per loop, then
  `NEEDS_HUMAN` (configurable later).
- **D-402** Label contract placement = the workflow document `labels:` block (`settable_by`).
- **D-403** `global` vs `common` naming — **deferred** (belongs to the knowledge-scoping chunk, not
  Phase 0).
- **D-404** Rules live in `workflow.yaml` (`rules:`) + the machine overlay — one parser, one rev.
- **D-405** `fan_out`/parallel — **model the schema in Phase 0, defer multi-agent execution to
  Phase 2** (Phase 0 supports single/serial).

## Deferred backlog (named here + in DECISION_LOG)

- **BL-04a** Parallel multi-agent execution of `fan_out` + the join barrier (Phase 2).
- **BL-03** DART as a Claude Code plugin: namespaced `/dart:*`, MCP write-back, mid-session monitor
  push (Phase 1 — the real integration win).
- **BL-06** Kiro steering renderer + agent-hook adapter (Phase 2 portability).
- **BL-07** Knowledge scopes (common vs project, stack/domain/kind tags, `/kai` propose-inbox)
  (research-anna Q2 — a separate chunk).
- **BL-08** Pipeline-board visuals (stage rail, parallel split-nodes, stacked done-folder) + the
  Knowledge panel rename/scoping UI (ux-aura §3/§4 — a separate chunk).
- **BL-09** Workflow/rules settings surface (loop-budget config, label management UI).

## Definition of Done (this sprint)

Per the global DoD, plus the sprint-specific negatives that must be proven, not assumed:
- **ADT-227 (HARD):** a rule cannot route a ticket past an unmet `safety_override` gate (proven by
  negative test); a label set outside `settable_by` writes nothing; a backward-routing loop
  terminates at the budget with `NEEDS_HUMAN`; a replayed event tail does not double-route; engine
  mutations are CAS-guarded and dedup-traced; the base `workflow.yaml` is byte-unchanged (edits land
  only in the overlay).
- **ADT-228:** a keyboard-only user can fully reorder/add/delete (no pointer); a cancelled drag
  sends no write; the base workflow is byte-unchanged; a stale-rev save is rejected (409).
- **ADT-229:** all rule text renders escaped (no unsafe HTML binding); the Set-label picker never
  offers a label outside the owner's contract; the editor cannot persist a gate-bypassing rule; a
  stale-rev save is rejected (409).

## Next action

`/arch` (Jorge) holds all three tickets (`assignee: /arch`, stage `ready`). **Architecture first**
for all three; then **`/secops`** (HARD for ADT-227, review for ADT-228/229); then **`/ui`** (Aura)
for the per-ticket design specs (ADT-228/229); then the **Approval Gate** (`/verify`); then
**`/be` + `/fe`** under TDD.
