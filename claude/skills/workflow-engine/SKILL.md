---
name: workflow-engine
description: The ai-dev-team workflow contract. ALWAYS consult this at the START of any development task and BEFORE EVERY handoff between agents — it decides which process applies (proportional to the size of the change), which approval gates are required, and whether work may proceed or must stop. Triggers whenever you begin a ticket/feature/fix/bug, hand off between roles (/po /ba /arch /secops /ui /fe /be /rev /qa /e2e ...), or are about to advance a ticket, commit, or mark work done. If you are doing development work and have not consulted the workflow, you are doing it wrong — load it first.
---

# Workflow Engine — how the team works

You enforce the team's workflow. The authoritative definition lives in **`workflow.yaml`** (resolved first-found: `./.aidevteam/workflow.yaml` → `~/.aidevteam/workflow.yaml` → the framework default in this repo's `claude/workflow/workflow.yaml`). **Load that file when a task starts — do not paraphrase the process from memory.**

## Do this at the start of every task and before every handoff

1. **Load `workflow.yaml`.** Note the active `preset` and its `always_required` gates.
2. **Classify the change** → pick the matching `track`. Right-size it:
   - *trivial* (typo/comment/rename) → `floor_min`; *small* (one file, no new deps) → `floor`; *standard* (a feature/story) → `standard`; *significant* (new service/dependency/schema/boundary, or anything security-sensitive) → `full`.
3. **Detect gate triggers** from the change and require those gates even on a small change:
   - auth/secrets/PII/upload/external-input/network/crypto → **SECOPS_APPROVED**; new dep/schema/service/boundary/public API → **ARCH_APPROVED**; visual change/new screen → **DESIGN_APPROVED**; etc.
   - **Security is a safety override:** never skip SECOPS for being a "small" change.
4. **Check the ledger** for gates already passed on this ticket (`.workflow-state.json` → Backlog.md → workflow MCP → Jira; first available wins — see `references/ledger.md`).
5. **Enforce.** Before crossing a gate it must be `passed`:
   - **`refusal: hard` + unmet → STOP. Do not proceed.** Name the gate and invoke its owner: e.g. *"Blocked: SECOPS_APPROVED required — handing to /secops."*
   - `refusal: soft` + unmet → warn, record the skip + reason, may proceed.
6. **Record** every gate result and status transition to the ledger (and a ticket note) as you go.

## Proportionality (why the workflow stops getting ignored)
The default `preset: solo` forces nothing — gates fire only on trigger or change-class, so a solo dev gets a light path and won't route a typo through architecture + security. `small-team` adds always-on code review; `regulated` runs the full gauntlet and uses Jira/Confluence. Switch by editing `preset:` in `workflow.yaml`.

## Tickets & docs — no Jira required
Default = **markdown tickets (Backlog.md)** + a **markdown knowledge base** (Obsidian-compatible). Jira / Confluence / a knowledge-graph backend are **optional MCP overlays** — use them only when configured in `workflow.yaml`.

### Where progress is tracked — a convenience call, not a rule
**Either a local folder or Jira/Confluence is correct.** Pick by the size of the project and what is actually convenient, and say which is in force:

- **Local markdown** suits a solo or small effort: the tracker sits next to the code, is edited in the same commit as the change it describes, and needs no network. It is also the honest choice while the work is still churning — a doc rewritten five times a day is cheaper as a file.
- **Jira / Confluence** suits a project big enough that several people, or several sessions, need one shared view: work items that outlive a branch, cross-references between tickets and pages, and a record that does not vanish when a worktree is cleaned.

**Do not maintain both for the same thing.** Two trackers become two different answers to "what is the state?", and the stale one is always the one someone reads. When migrating from local to Jira/Confluence, move the content and **delete the local copy in the same change** — or, if it is being kept as a record rather than as live status, stamp it with the date it stopped being current. A tracker whose last update predates the work it describes is worse than no tracker, because it is believed.

One consequence worth stating: a local tracker is a **document**, and documents may be subject to a project rule about what the repository holds. Check the project's `CLAUDE.md` before adding one — some repositories deliberately keep no docs at all, and the tracker belongs in the external system from the start.

## Handoffs
Every agent runs a **Gate Check**: before starting it confirms its precondition gates; before finishing it sets its postcondition gate in the ledger. This is what makes the workflow hold without an orchestrator and in any editor — see `references/gate-check.md`.

## References
- `references/gate-check.md` — the standard Gate Check block every agent skill embeds (+ the per-agent precondition/postcondition table).
- `references/ledger.md` — the `.workflow-state.json` format and how the pluggable ledger resolves.
- `claude/workflow/workflow.yaml` — the editable definition (+ `workflow.schema.json`).
