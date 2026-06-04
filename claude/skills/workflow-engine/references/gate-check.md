# Gate Check — embed in every agent skill

Every agent skill carries a short **Gate Check** so the workflow holds even when the agent is invoked directly (no orchestrator) and in any editor (Claude Code / Cursor / Kiro / VS Code). It encodes preconditions (what must be true before this agent works) and a postcondition (the gate this agent sets when done).

## The block (paste into each agent skill, adapt OWNER/GATES)

```markdown
## Gate Check (workflow)
Consult the **workflow-engine** first. Then:
- **Before starting** — confirm my required upstream gates are `passed` in the ledger.
  If a `hard`-refusal gate is unmet: **STOP, name the gate, hand off to its owner.**
- **Before finishing** — set my postcondition gate in the ledger + add a ticket note.
```

## Per-agent preconditions / postconditions (reference)

| Agent | Precondition gates (when triggered) | Postcondition (sets) |
|---|---|---|
| `/po`, `/ba`, `/ux` | — | ticket + behavioral AC exist |
| `/arch` (`/jorge`) | — | `ARCH_APPROVED` |
| `/secops` (`/soren`) | — | `SECOPS_APPROVED` |
| `/ui` (`/aura`) — design | — | `DESIGN_APPROVED` |
| `/verify` — pre-impl | ARCH + SECOPS (+ DESIGN if visual) | `APPROVAL_GATE` |
| `/fe` `/be` `/ios` `/android` `/ai` `/data` | `APPROVAL_GATE`, or `ARCH_APPROVED`+`SECOPS_APPROVED` when those triggered | implementation + tests (TDD) |
| `/rev` | code present | `CODE_REVIEWED` |
| `/perf` | code present | `PERF_OK` |
| `/qa` (`/rob`), `/e2e` (`/adam`) | `CODE_REVIEWED` | tests authored/pass |
| `/ui` — design QA | implementation done (frontend) | design verified |
| `/sre` | — | `RELIABILITY_OK` |
| `/verify` — final | QA done | `VERIFIED` |

## Rules
- A `hard` gate that is unmet **blocks** — the agent refuses and names it. A `soft` gate may be skipped with a logged reason (`--skip-gate <GATE> --reason=...`).
- **Security (`SECOPS_APPROVED`) is `safety_override`** — required whenever a security trigger is present, regardless of how small the change is.
- Which gates are *always* required (vs trigger-only) depends on the active **preset** (`solo` forces none; `regulated` forces the full set). Read it from `workflow.yaml`.
