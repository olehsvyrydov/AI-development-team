---
name: ai-dev-team
description: "The AI Dev Team contract — how work is run in any project using this framework: proportional process, TDD, behaviour-only tickets, which process skills exist and when to reach for them, and the git conventions. Load this at the START of any development task, when picking an agent or handing off between roles, and whenever you are about to commit, open a PR, or call work done."
---

# The AI Dev Team contract

A team of specialist agents plus an enforced, proportional workflow. Open-source, vendor-neutral,
editor-neutral, free by default.

This is the always-on layer. When the framework is installed as a plugin there is no global
`CLAUDE.md`, so what a session needs to know about *how work runs here* lives in this skill.

## Principles

- **Proportional process.** Right-size the workflow to the change — a typo is not a feature.
  Don't over-process; don't skip what matters.
- **TDD.** Behaviour → failing test → minimal code → green → refactor → commit. Targets: >80%
  unit, >60% integration.
- **Behaviour-only tickets.** Stories say WHAT, not HOW — no file paths or line numbers.
- **OSS-first, no lock-in.** Defaults need zero paid accounts; everything else is an optional
  adapter.
- **Reusable skills.** Agent skills hold universal knowledge. Project-specific facts belong in
  that project's own `.claude/skills/`, never in a framework skill.

### Skills describe judgement and capability, never a product

Process and role skills must stay tool-free. A skill states *what qualifies, what to decide, and
what to emit* — never which vendor supplies it. `verify-landed` is the model: it is valuable
precisely because it needs nothing but a grep and a test run.

A concrete backend — tracker, memory store, design tool, knowledge base — is an **optional
adapter**. Name it only in a `references/` adapter file or in `docs/`, never in a skill's
frontmatter, trigger, or core contract. Those decide when a skill loads and what it promises, and
neither may depend on a vendor.

**The framework must work correctly with no adapter configured at all.** A skill whose input is
absent reports that plainly and stops; it does not degrade into guessing. If wiring up an adapter
would require editing the skill itself, the contract is too narrow — generalise the contract rather
than teaching the skill about one backend.

This is a boundary that erodes by drift: one concrete example becomes a schema, then a required
field, then a dependency. Check it when reviewing any skill that reads from outside the repository.

## Before any task

**Consult the `workflow-engine` skill before starting development work and before every handoff.**
It classifies the change, decides which approval gates apply, and may refuse to proceed past an
unmet gate. Do not paraphrase the process from memory.

Gates are labels in the ledger: `ARCH_APPROVED`, `SECOPS_APPROVED`, `DESIGN_APPROVED`,
`APPROVAL_GATE`, `CODE_REVIEWED`, `PERF_OK`, `VERIFIED`, `RELIABILITY_OK`. Gates fire on trigger
and change-class, not on every change — but **security gates are a safety override and are never
skipped for being "small."**

Default preset is `solo` (light path for one developer); `small-team` adds code review;
`regulated` runs the full gauntlet.

## Process skills — not optional extras

Beside the role agents, cross-cutting skills cover how work is decided, checked and paid for.
They self-trigger, but reach for them deliberately:

- **`workflow-engine`** — the gate contract. First, on every task.
- **`fid-lifecycle`** — Backlog → investigation → design doc / epic → tickets → Done without
  orphans or two disagreeing records. Delete the backlog item once its design doc exists; one
  epic per design doc; every ticket parented and listed. **The tracker is authoritative for
  status** when the two disagree.
- **`verify-landed`** — after any behaviour-changing edit, and before claiming a finding fixed
  or a criterion met. A green build is not evidence your change exists: *removing nothing breaks
  nothing*, so a no-op edit compiles and passes every test.
- **`review-tier`** — how much review to buy and how to scope it. Free gates green first; on a
  follow-up round review the fix and the prior findings, not the whole PR again.
- **`model-selection`** — which model tier to spend. Cheaper when a mechanical verifier exists
  downstream; spend when this output is the last line of defence.
- **`research-method`** — for questions that need measuring rather than deciding.
- **`answer-audit`** — for adversarially checking a retrieval-grounded answer against its sources.

### The rule they exist to enforce

A ticket is Done only when its **negative** criteria are met — the guard, the refusal, the
"cannot bypass" — and each names the **symbol** that enforces it. An audit of one project's 30
open tickets found 13 with an unmet criterion, nearly always the negative case, several treated
as complete because the feature existed.

Happy paths ship; the things that stop bad outcomes do not, unless someone checks.

Watch for the specific failure shape: a flag or setting that is modelled, surfaced in the UI, set
by some path — and **read by nothing**. The feature looks complete from every angle except the
one the ticket was written about.

## Tickets & docs — no external tracker required

Default is **file-based**: markdown tickets (`Backlog.md`) plus a markdown knowledge base. Jira,
Confluence and other backends are **optional overlays**, enabled only in `workflow.yaml`.

Where progress is tracked is a convenience call, decided by project size. **Never run both for
the same thing** — two trackers become two answers to "what is the state?", and the stale one is
always the one someone reads.

## Picking an agent

Role commands are standard; persona aliases invoke the same agent. Run `/agents` for the full
roster, and consult the disambiguation guidance when domains overlap.

**Technology stacks are not separate agents.** A role agent detects the project's stack and loads
the matching `references/<stack>.md` — Angular/Vue/Flutter/JavaFX under the frontend role,
Kotlin/FastAPI/Laravel/Quarkus/Kafka under the backend role, GraphQL under the architect,
Terraform under DevOps, Cucumber under E2E.

Two agents sit outside the core team: `/verify` (completion auditor) and `/kai` (proposes skill
updates from human-approved memory rules).

## Git

Branch `feature/<KEY>-desc` · commit `<KEY>: message` · PR `<KEY>: title`. Run tests before
committing.

**Public artifacts are facts-only.** Pull requests, commit messages, issues and any public doc or
comment describe only the change itself — the problem, what changed, results, and tests. Internal
plans and their paths, internal programme names, persona or agent names, and internal discussion
never go into anything public. Treat that as an information leak.
