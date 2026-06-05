# AI Dev Team — local Hub

A **zero-dependency** dashboard for the proportional workflow. Point it at any project and watch the **gate board**, **tickets**, and **knowledge base** live — straight from the file-based defaults, no Jira/Confluence/MCP and no `npm install`.

```bash
node hub/server.js [projectDir] [--port 4477] [--host 0.0.0.0]
# then open http://localhost:4477
```

`projectDir` defaults to the current directory. Requires only Node (≥ 18). Binds to `127.0.0.1` by default; pass `--host 0.0.0.0` to reach it from a **dev container / VM / LAN** (it serves local project metadata, so only do this on a trusted network).

## What it shows

- **Workflow gates** — every gate from the active `workflow.yaml`, each with its owner, `hard`/`soft` refusal, whether the active preset makes it **required**, and `safety-override`. State (`passed` / `pending` / `rejected`) comes from the ledger.
- **Tickets** — from the ledger (keyed by id) when present, otherwise markdown ticket files (`backlog/tasks/`, `backlog/`, `.aidevteam/tickets/`).
- **Knowledge base** — markdown docs from `docs/` (or `kb/` / `.aidevteam/kb/`).

It **live-updates** over SSE whenever those files change — record a gate as `passed` in the ledger and the board moves.

## What it reads (all optional; degrades gracefully)

| Input | Resolved from |
|---|---|
| Workflow definition | `.aidevteam/workflow.yaml` → `~/.aidevteam/workflow.yaml` → `.claude/workflow/workflow.yaml` → `claude/workflow/workflow.yaml` → the framework default |
| Gate state (ledger) | `.workflow-state.json` |
| Tickets | the ledger's ticket map, else `backlog/tasks/*.md` → `backlog/*.md` → `.aidevteam/tickets/*.md` |
| Knowledge base | `docs/*.md` → `kb/*.md` → `.aidevteam/kb/*.md` |

### Ledger shape (`.workflow-state.json`)

The Hub reads the **canonical** ledger format (see [`../claude/skills/workflow-engine/references/ledger.md`](../claude/skills/workflow-engine/references/ledger.md)) — a map keyed by ticket id:

```json
{
  "TCK-001": {
    "title": "Password reset via email",
    "track": "standard",
    "stage": "review",
    "gates": {
      "ARCH_APPROVED":   { "state": "passed",  "by": "/arch",   "at": "2026-06-04T10:02:00Z" },
      "SECOPS_APPROVED": { "state": "pending", "by": null,      "at": null }
    }
  }
}
```

Gate `state`: `passed` · `pending` · `rejected`. A gate not listed shows as `pending`. When several tickets are present, the **gate board** reflects the first ticket whose `stage` isn't `done` (else the first present); every ticket appears in the Tickets pane. The Hub is **read-only** — it reflects the workflow; it doesn't change it.
