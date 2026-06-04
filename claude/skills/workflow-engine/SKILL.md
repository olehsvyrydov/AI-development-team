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
Default = **markdown tickets (Backlog.md)** + a **markdown knowledge base** (Obsidian-compatible). Jira / Confluence / KGB-Canon are **optional MCP overlays** — use them only when configured in `workflow.yaml`.

## Handoffs
Every agent runs a **Gate Check**: before starting it confirms its precondition gates; before finishing it sets its postcondition gate in the ledger. This is what makes the workflow hold without an orchestrator and in any editor — see `references/gate-check.md`.

## References
- `references/gate-check.md` — the standard Gate Check block every agent skill embeds (+ the per-agent precondition/postcondition table).
- `references/ledger.md` — the `.workflow-state.json` format and how the pluggable ledger resolves.
- `claude/workflow/workflow.yaml` — the editable definition (+ `workflow.schema.json`).
