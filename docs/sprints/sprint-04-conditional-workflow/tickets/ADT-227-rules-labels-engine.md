# ADT-227 — Rules + labels engine (deterministic Core evaluator)

**Type:** Story · **Track:** full (significant) · **Sprint:** sprint-04-conditional-workflow
**Implementer:** /be · **Stage:** ready · **Assignee:** /arch (architecture first)
**Gates:** ARCH_APPROVED (hard) · **SECOPS_APPROVED (HARD, safety-override)** · APPROVAL_GATE (hard) · CODE_REVIEWED (hard) · VERIFIED (hard)

## Why

DART's workflow is today a fixed, proportional gate gauntlet. This ticket turns it into a
**user-controlled, conditional, looping, event-driven** engine: the user declares `rules:` and
`labels:` in the workflow document, and a deterministic Core evaluator fires those rules off the
events the system already emits (comments, gate decisions, stage advances, label sets). The engine
**records intent** — it performs ledger/overlay mutations itself (set a label, route a stage,
assign) and **records directives** (instruct an agent) for the host tool to execute. DART never
runs agents.

This is the foundation Phase-0 slice. The two UI tickets (ADT-228, ADT-229) author the data this
engine consumes and enforces.

## Scope (Phase 0)

In scope:
- A `rules:` and `labels:` section in the workflow document (base `workflow.yaml` + the machine
  overlay), parsed by the same projection that already merges gates/tracks/presets.
- The rule schema: `id`, `when` (label | pattern-in-comment | event, optional `if` guard),
  `do` (`route_to_stage` | `set_label`/`clear_label` | `assign` | `instruct{target,prompt}` |
  `fan_out`), optional `then` chain, `once` / loop-safety.
- A `labels:` block declaring each label's meaning, `settable_by` contract, and where it routes.
- A `labels:[]` array on each ledger ticket and a typed `label` event in the comment/event stream.
- The deterministic Core evaluator: edge-triggered off the existing event stream, evaluates `when`,
  applies engine-mutation `do:` actions via the existing CAS-guarded write path, records
  `instruct` directives for the host, dedup-traced per `(rule id, triggering event)`.
- Loop-safety: one-shot routing labels (`clear_label`), a per-ticket loop budget, and a built-in
  `loop.exceeded` → `set_label NEEDS_HUMAN`.
- The **safety-gate-bypass prohibition**: rule authoring and the evaluator MUST refuse any rule
  whose effect clears, skips, or routes a ticket around a `safety_override` gate (e.g.
  SECOPS_APPROVED), and MUST refuse a rule that lets an agent set a label outside that label's
  `settable_by` contract.

Deferred to later chunks (named in the DECISION_LOG backlog):
- Multi-agent **parallel execution** of `fan_out` (model the schema now; serial/single execution
  only in Phase 0 — BL-04a).
- The DART plugin / MCP write-back / monitor channel (BL-03).
- Knowledge scopes, pipeline-board visuals, Kiro steering, settings.

## Behavioral acceptance criteria (Given/When/Then — WHAT, not HOW)

**AC-1 — Reject loop-back routes to the right developer** *(anna AC-W1, jorge §1.3)*
Given a ticket at stage `code_review` and a rule that, when the code-review gate is rejected with a
routing label the reviewer is authorized to set, routes to `implement` and instructs the named
developer,
When the reviewer rejects the gate and sets the routing label,
Then the ticket is routed to `implement`, the developer's stage owner reflects that developer, an
instruct directive addressed to that developer is recorded, and the ledger records which rule fired
with the actor and a timestamp.

**AC-2 — Pattern-in-comment trigger fires at most once per comment** *(anna AC-W2)*
Given a rule that sets a label when a comment matches a given text/regex,
When a comment on the ticket matches that text,
Then the label is set, and the rule fires at most once for that comment (a re-read of the event
stream never re-routes or double-sets).

**AC-3 — Event trigger on gate rejection** *(anna AC-W3)*
Given a rule whose `when` is "the code-review gate became rejected",
When that gate transitions to rejected,
Then the ticket is routed back to `implement` and the board shows it as needing developer work
(not silently blocked).

**AC-4 — User-set label routes to a specific agent** *(anna AC-W5)*
Given the published `labels:` contract maps a label to a destination stage and owner,
When an authorized agent sets that label,
Then the ticket is routed to that stage, and the board's expected owner reflects that owner.

**AC-5 — Setting a label outside `settable_by` is refused** *(anna AC-W6)*
Given the contract declares a label settable only by certain agents,
When an agent not in that list attempts to set the label,
Then the action is refused, no routing occurs, and the refusal is recorded with a terse reason —
mirroring the existing hard-gate refusal discipline.

**AC-6 — A rule may not route around a safety-override gate** *(jorge §4.2 Q2/R8, SECOPS)*
Given a rule whose `do:` would clear, skip, or advance a ticket past a `safety_override` gate
(e.g. SECOPS_APPROVED) before that gate is `passed`,
When that rule is authored (saved) or would fire,
Then the engine refuses it — the rule is rejected at author time with a terse reason, and even if
present it never executes a mutation that bypasses the safety gate. The negative is proven by test:
a crafted bypass rule cannot advance a ticket past an unmet safety-override gate.

**AC-7 — Loop budget converts a runaway loop into a human hand-off** *(jorge §1.3 R1, anna §5)*
Given a rule that routes a ticket backward and a per-ticket loop budget of N,
When the same backward route fires more than N times on one ticket,
Then the engine stops routing, sets `NEEDS_HUMAN`, and the board surfaces the ticket as needing a
human decision (a visible "needs you", never an infinite spin).

**AC-8 — Engine mutations are deterministic and dedup-traced** *(jorge §2.2)*
Given the same triggering event delivered twice (debounce double-fire / re-watch),
When the evaluator processes it,
Then the engine-mutation `do:` actions apply effectively once (recorded in the per-ticket fired
trace by `(rule id, event id)`), and no duplicate routing/label write occurs.

**AC-9 — Intent vs action split is honored**
Given a rule whose `do:` mixes engine-mutations (`set_label`/`route_to_stage`/`assign`) and a host
directive (`instruct`),
When the rule fires,
Then DART applies the engine-mutations itself to the ledger/overlay, and records the `instruct`
action as a directive for the host tool to execute (DART does not run the agent).

## Loop / safety negatives that MUST be proven (not just the happy path)

- A bypass rule cannot advance past an unmet `safety_override` gate (AC-6).
- A label set outside `settable_by` writes nothing (AC-5).
- A backward-routing loop terminates at the budget with `NEEDS_HUMAN` (AC-7).
- A replayed event tail does not double-route (AC-8).
- The base `workflow.yaml` is left byte-unchanged; rule/label edits land only in the overlay.

## /po decisions that bind this ticket (see DECISION_LOG)
- D-401 loop ceiling default = **3** backward traversals per ticket per loop, then `NEEDS_HUMAN`.
- D-402 label contract lives in the workflow document `labels:` block (`settable_by`).
- D-404 rules live in `workflow.yaml` (`rules:`) + the machine overlay (single parser, one rev).
- D-405 `fan_out`/parallel: **schema modeled in Phase 0, multi-agent execution deferred** to Phase 2.

## Out of scope / not this ticket
Knowledge scoping, plugin packaging/MCP, parallel multi-agent execution, pipeline-board visuals,
the drag builder (ADT-228) and the rule-editor UI (ADT-229).
