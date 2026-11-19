# Workflow

The ai-dev-team workflow is defined **once** in [`workflow.yaml`](workflow.yaml) and applied by the [`workflow-engine`](../skills/workflow-engine/SKILL.md) skill. It is **proportional** (right-sized to the change) and **file-based by default** (no Jira/Confluence required).

Backends (tickets, knowledge base, memory, design) are **pluggable adapters** — defaults run local with zero paid accounts; optional overlays are opt-in. See [`adapters/README.md`](adapters/README.md) for the contract and ready-made `.mcp.json` overlays.

## Customize it
Edit `workflow.yaml`, or drop an override that wins over the shipped default:

```
./.aidevteam/workflow.yaml     # this project (highest priority)
~/.aidevteam/workflow.yaml     # your personal default
claude/workflow/workflow.yaml  # shipped default (solo)
```

Validate against [`workflow.schema.json`](workflow.schema.json).

## Presets
Set `preset:` in `workflow.yaml`:

| Preset | For | Forces | Tickets / KB |
|---|---|---|---|
| **solo** (default) | one dev | nothing — gates fire on trigger/change-class only | Backlog.md / markdown |
| **small-team** | a few devs | code review always | Backlog.md / markdown |
| **parallel-team** | multiple parallel sessions/workers | code review always; reviewer ≠ implementer is a policy from the `parallel-delivery` skill — the config requires only the gate, not who ran it | Backlog.md / markdown |
| **regulated** | compliance | arch + security + approval + review + verify + reliability always | Jira / Confluence |

## What is enforced, and what is not
There are three layers. Only the third can stop a command, and only for the commands it names.

1. **Gate Check** in every agent skill — an instruction: the agent refuses to cross an unmet `hard` gate and names it.
2. **Pluggable ledger** — `.workflow-state.json` (default) → Backlog.md → Jira. The engine writes each ticket's `required_gates` there, and the active ticket in `.aidevteam/state/active-ticket.json`.
3. **Commit gate hook** (Claude Code plugin only) — [`../hooks/commit_gate.py`](../hooks/commit_gate.py), registered in [`../hooks/hooks.json`](../hooks/hooks.json).

When installed as the Claude Code plugin, the plugin blocks `git commit`, `git push` and `gh pr create` while the active ticket has an unmet hard pre-implementation gate (ARCH_APPROVED, SECOPS_APPROVED, APPROVAL_GATE). Review and verification gates (CODE_REVIEWED, VERIFIED), soft gates, and everything in Cursor, Kiro and VS Code remain instructions. It is a guardrail against forgetting, not a security boundary: `bash -c`, `eval`, aliases, other commit-creating commands and editing the ledger bypass it, and a missing `python3`, a crash or a timeout lets the command through.

Details of the hook:
- **Runs on every Bash call.** The hook has a single handler on the `Bash` matcher, with no `if` filter, so wrapped forms reach it. It costs one `python3` start per call (typically tens of milliseconds) and returns at once, without tokenising or looking up the repository, unless the command text contains `git` or `gh`.
- **Blocked:** `git commit`, `git push` and `gh pr create` (also `gh pr new`), including behind `cd x &&`, `git -C x`, `git -c k=v`, `GIT_DIR=… git`, an absolute path, `env`, `sudo`, `exec`, `command`, `nohup`, `nice`, `timeout`, `time`, `xargs`, subshells, `$(...)`, backticks, `<(...)` and backslash-newline continuations (all removed before parsing, an approximation that also drops them inside single quotes). A command that cannot be tokenised is matched by a text pattern anchored at the start of a command. Anything else — `git merge`, `cherry-pick`, `revert`, `am`, `rebase`, `commit-tree`, `gh api`, `bash -c`, `eval`, aliases — is not guarded.
- **What it needs:** the active-ticket file and that ticket's `required_gates`. If the engine never writes them, the hook allows everything.
- **Which ledger:** the git top level of the session's working directory. A `cd` or `-C` target inside the command is ignored.
- **Malformed state blocks.** An unreadable, empty, oversized or invalid ledger or active-ticket file, an active ticket missing from the ledger, or a gate entry with an unknown `refusal` or `phase` produces a denial that names the file and the problem, never its content.
- **Design docs and ADRs wait too** while a ticket is active; pass the gates or clear the active ticket (the user's decision).
- **To clear a block:** run the gate's owner agent so it records `passed`, or set `{"ticket": null}` in `.aidevteam/state/active-ticket.json`. Both are the user's decision; the agent asks first.
- **Failing open is deliberate.** The hook leaves `onFailure` unset. If you copy the hook into your own `settings.json` and want a crash or timeout to block instead, set `"onFailure": "block"` on the handler (Claude Code v2.1.295 or later).

See [`../skills/workflow-engine/references/gate-check.md`](../skills/workflow-engine/references/gate-check.md) and [`ledger.md`](../skills/workflow-engine/references/ledger.md).
