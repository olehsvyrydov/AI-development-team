# ADT-229 — when→do rule editor UI

**Type:** Story · **Track:** full (significant) · **Sprint:** sprint-04-conditional-workflow
**Implementer:** /fe (+ /be rule-CRUD route if a dedicated overlay-patch path is needed)
**Stage:** ready · **Assignee:** /arch (architecture first)
**Gates:** ARCH_APPROVED (hard) · SECOPS_APPROVED (review — rule authoring is a write surface but
reuses the guarded overlay CAS; confirm no bypass) · DESIGN_APPROVED (soft — aura's investigation
largely covers it, treat as review) · CODE_REVIEWED (hard) · VERIFIED (hard)

## Why

ADT-227 gives the engine its `rules:`/`labels:` model. This ticket gives the user a **plain-English
editor** to author and read those rules on a stage or gate — "**WHEN ‹something happens› DO ‹these
actions›**" — at IntelliJ-breakpoint-condition simplicity, persisted through the same guarded
overlay CAS write the builder already uses. It also surfaces, per the label contract, exactly which
labels the stage's owner may set.

## Scope (Phase 0)

In scope:
- Author and read rules attached to a **stage (or its gate)** as plain WHEN/DO sentence cards, in an
  inline expander reached from a `[rules N]` pill on the builder row.
- A **WHEN-selector** (progressive type→value): Label · Comment-matches (pattern + `in`) · Event
  (gate passed/rejected/pending, stage entered/left, comment added, label set/cleared, …) with the
  qualifier dropdown, AND-joined conditions, optional empty `when`.
- A **DO-selector** (action→target/prompt): Route to stage · Set/Clear label · Instruct
  (target + prompt) · Fan out (multi-select — schema only in Phase 0). Actions run in order.
- **Chaining (`+`)**: `+ add condition` (AND) and `+ add action` (sequence); the cross-rule
  `then:` chain reachable from the rule menu, shown as a `then:` line in the read view.
- **Loop legibility**: a backward route is flagged ("loops back"), the one-shot `clear_label` guard
  is annotated, and a read-only loop-budget → `NEEDS_HUMAN` safety note is always shown.
- **The allowed-labels strip** from the contract: under a stage's rules, render exactly which labels
  the stage owner may set and where each routes; the Set-label action's label list is filtered to
  only those the owner may set (you cannot author an unenforceable rule).
- Persist rules via the **guarded overlay CAS write** with `expectedRev` + the shared 409 reconcile
  banner (rules live in the same workflow document + overlay as stages — one rev).

Out of scope:
- The deterministic evaluation itself (that is ADT-227).
- Parallel multi-agent execution, the plugin/MCP, knowledge scopes, pipeline visuals.

## Behavioral acceptance criteria (Given/When/Then)

**AC-1 — Read a rule as a plain sentence** *(aura §2.1)*
Given a stage that has rules attached,
When the user opens the conditions for that stage,
Then each rule renders as a WHEN line plus one or more DO lines in plain language, with routing and
loop markers, and all rule text (prompts, patterns, labels) is shown as escaped text.

**AC-2 — Author a rule with the WHEN-selector** *(aura §2.2.1)*
Given the rule editor,
When the user picks a condition type and then its value (and adds more AND conditions with
`+ add condition`),
Then the condition is built progressively type→value, multiple conditions are visibly AND-joined,
and a rule with no condition is allowed and reads "when this stage runs".

**AC-3 — Author actions with the DO-selector in order** *(aura §2.2.2)*
Given the rule editor,
When the user adds Route / Set-label / Instruct / Fan-out actions and orders them,
Then the actions are listed in order, each removable independently, and an Instruct action requires
a target and a prompt.

**AC-4 — Allowed-labels strip reflects the contract** *(aura §2.5, jorge §1.4)*
Given the published label contract for the stage owner,
When the user views the stage's conditions and opens a Set-label action,
Then the allowed-labels strip lists exactly the labels this owner may set with their destinations,
and the Set-label list is filtered to only those labels — a label the owner cannot set is absent.

**AC-5 — Loops are legible at a glance** *(aura §2.4)*
Given a rule whose route targets a stage earlier than the current one,
When the user reads or edits that rule,
Then the DO line is flagged as looping back, a one-shot `clear_label` of the same routing label is
annotated as the loop guard, and the read-only loop-budget→NEEDS_HUMAN safety note is shown.

**AC-6 — Save persists via guarded CAS; conflict reconciles** *(aura §2.6)*
Given an edited rule,
When the user saves it,
Then it persists as an overlay patch through the guarded write with `expectedRev`; a stale-revision
save surfaces the shared 409 reconcile banner (rule not applied) with Discard / Re-apply — never a
silent overwrite.

**AC-7 — Invalid drafts cannot be saved** *(aura §2.6)*
Given an incomplete rule (missing target stage, empty Instruct prompt, empty pattern),
When the user attempts to save,
Then Save is disabled and the offending field shows an inline error announced to assistive tech.

**AC-8 — The editor cannot author a contract-violating or gate-bypassing rule** *(jorge §4.2, SECOPS)*
Given the safety prohibition from ADT-227,
When the user tries to author a rule that sets a label outside the owner's `settable_by`, or whose
`do:` would route around a `safety_override` gate,
Then the editor prevents or rejects it (the unauthorized label is absent from the picker; a
bypassing route is refused), mirroring the server-side refusal — the UI never implies a routing the
engine will drop.

## Negatives that MUST be proven
- All untrusted text (prompts, patterns, labels, comment bodies) is rendered escaped — never via
  unsafe HTML binding.
- A stale-rev rule save is rejected (409), not applied.
- The Set-label picker never offers a label outside the owner's contract.
- The editor cannot persist a rule that bypasses a safety-override gate.

## Out of scope / not this ticket
The evaluator (ADT-227), the drag builder (ADT-228), parallel execution, plugin/MCP, knowledge
scopes, pipeline visuals.
