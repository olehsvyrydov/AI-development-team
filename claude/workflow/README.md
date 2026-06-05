# Workflow

The ai-dev-team workflow is defined **once** in [`workflow.yaml`](workflow.yaml) and enforced by the [`workflow-engine`](../skills/workflow-engine/SKILL.md) skill. It is **proportional** (right-sized to the change) and **file-based by default** (no Jira/Confluence required).

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
| **regulated** | compliance | arch + security + approval + review + verify + reliability always | Jira / Confluence |

## How enforcement works (3 layers, no editor-specific hooks)
1. **Gate Check** in every agent skill — refuses to cross an unmet `hard` gate and names it.
2. **Pluggable ledger** — `.workflow-state.json` (default) → Backlog.md → workflow MCP → Jira.
3. **Optional `workflow` MCP** — statefully refuses out-of-order advances.

See [`../skills/workflow-engine/references/gate-check.md`](../skills/workflow-engine/references/gate-check.md) and [`ledger.md`](../skills/workflow-engine/references/ledger.md).
