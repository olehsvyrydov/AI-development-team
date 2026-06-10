# Sprint 07 — DART as a Claude Code plugin (Phase 1: the bidirectional bridge)

**Sprint goal:** Make DART actually *drive* the main tool (Claude Code), not just record intent. The conditional-workflow ENGINE already exists and is merged — it records intent via `set_label` / `route_to_stage` and `instruct` directives (a `kind:"directive"` comment carrying `{target, prompt}`). What is missing is the **bidirectional bridge** so the main tool consumes those directives + the active workflow and writes back through the same guarded control plane.

Per `docs/product-vision/conditional-workflow/architecture-jorge.md` §3, Phase 1 is three slices:

| Ticket | Slice | Direction | Implementer |
|--------|-------|-----------|-------------|
| **ADT-237** | MCP control-plane server | main tool → DART (write-back) | /be |
| **ADT-238** | Directive surfacing | DART → main tool (surfacing) | /be |
| **ADT-239** | Plugin packaging + namespacing + opt-in | both, packaged as one unit | /be |

The MCP server (ADT-237) is the heart: it re-exposes the existing `hub/lib/api.js` control-plane routes as typed MCP tools, riding the SAME guarded/CAS/overlay-only writers (`hub/lib/write.js`) and the SAME engine safety invariants (`hub/lib/engine.js`: `routePastUnmetSafetyGate`, `labelSettableBy`). No new bypass, no new code-exec.

## Classification & gates (per workflow-engine)

All three are **significant → `full` track** (new integration surface: a new MCP entry point into the control plane, a new prompt-surfacing channel, a new distribution/precedence model). Gate triggers fire `ARCH_APPROVED` (new boundary / public API) on all three, and **`SECOPS_APPROVED` is HARD (safety override)** on all three because each touches a security-sensitive boundary (write-back mutation, prompt surfacing/injection, install/precedence + secrets). `DESIGN_APPROVED` is **soft and deferred/light** — this chunk is backend/CLI/integration; the user said interface polish comes later.

Required gate set per ticket (all `full`-track):
`ARCH_APPROVED` (hard) · `SECOPS_APPROVED` (HARD, safety override) · `DESIGN_APPROVED` (soft, deferred) · `APPROVAL_GATE` (hard) · `CODE_REVIEWED` (hard) · `VERIFIED` (hard).

All gates are **pending** in the ledger — nothing is pre-passed. DESIGN is noted as light/deferred (no UI surface in this chunk).

## The non-negotiable security invariants (carried from the HTTP control plane)

1. Every write rides `write.js` CAS / overlay-only writers — no second mutation path, no direct `fs` write.
2. A tool/path **MUST NOT** route a ticket past an unmet `safety_override` gate (`routePastUnmetSafetyGate`).
3. Label sets honor `settable_by` (`labelSettableBy`); an unauthorized set writes nothing.
4. Directives stay **recorded-only** — DART never executes a directive; no tool grants shell/code/arbitrary-file-write.
5. Same-machine/loopback (or stdio) trust; a remote caller is refused, mirroring `guard.js writeAllowed`.
6. No secret is persisted to project files or baked into the plugin manifest; keys stay env-only.

Each invariant must be proven by a **negative test** (the write that should NOT happen does not happen).

## Status

| Ticket | Stage | Gates |
|--------|-------|-------|
| ADT-237 | ready | all pending |
| ADT-238 | ready | all pending |
| ADT-239 | ready | all pending |

Next: `/arch` on all three (the binding design exists in `architecture-jorge.md` §3 — arch confirms it against the current code), then **`/secops` HARD** before any implementation.
