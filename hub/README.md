# AI Dev Team — local Hub

A **zero-dependency** dashboard for the proportional workflow. Point it at any project and watch the **gate board**, **tickets**, and **knowledge base** live — straight from the file-based defaults, no Jira/Confluence/MCP and no `npm install`.

```bash
node hub/server.js [projectDir] [--port 4477]
# then open http://localhost:4477
```

`projectDir` defaults to the current directory. Requires only Node (≥ 18).

## What it shows

- **Workflow gates** — every gate from the active `workflow.yaml`, each with its owner, `hard`/`soft` refusal, whether the active preset makes it **required**, and `safety-override`. State (`pending` / `approved` / `rejected`) comes from the ledger.
- **Tickets** — markdown tickets from `backlog/` (Backlog.md) or `.aidevteam/tickets/`.
- **Knowledge base** — markdown docs from `docs/`.

It **live-updates** over SSE whenever those files change — approve a gate in the ledger and the board moves.

## What it reads (all optional; degrades gracefully)

| Input | Resolved from |
|---|---|
| Workflow definition | `.aidevteam/workflow.yaml` → `.claude/workflow/workflow.yaml` → the framework default |
| Gate state (ledger) | `.workflow-state.json` |
| Tickets | `backlog/tasks/*.md` → `backlog/*.md` → `.aidevteam/tickets/*.md` |
| Knowledge base | `docs/*.md` |

### Ledger shape (`.workflow-state.json`)

```json
{
  "ticket": "LJ-123",
  "change_class": "feature",
  "gates": { "ARCH_APPROVED": "approved", "SECOPS_APPROVED": "pending" }
}
```

Gate values: `approved` · `pending` · `rejected`. Any gate not listed shows as `pending`. The Hub is **read-only** — it reflects the workflow; it doesn't change it.
