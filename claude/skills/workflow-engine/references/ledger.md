# Workflow ledger — where gate state lives

The ledger records which gates a ticket has passed. The workflow-engine uses the **first available** backend (highest fidelity present wins); all share the same logical schema, so dropping one never breaks enforcement.

1. **`.workflow-state.json`** — repo file, the zero-tool default. Works offline, no MCP, no Jira.
2. **Backlog.md** — if present, the ticket's task status + custom fields carry gate state (and you get a Kanban board + MCP for free).
3. **`workflow` MCP** — optional stateful server that *refuses out-of-order advances* (the only piece that can hard-stop programmatically).
4. **Jira labels** — optional; used by the `regulated` preset.

## `.workflow-state.json` format (default)

```json
{
  "TCK-001": {
    "title": "Password reset via email",
    "track": "standard",
    "stage": "review",
    "gates": {
      "ARCH_APPROVED":   { "state": "passed",  "by": "/arch",   "at": "2026-06-04T10:02:00Z", "note": "Saga not needed; simple token." },
      "SECOPS_APPROVED": { "state": "passed",  "by": "/secops", "at": "2026-06-04T10:20:00Z" },
      "CODE_REVIEWED":   { "state": "pending", "by": null,      "at": null }
    },
    "skips": [
      { "gate": "PERF_OK", "reason": "not a hot path", "by": "/be", "at": "2026-06-04T11:00:00Z" }
    ]
  }
}
```

- `state`: `passed` | `pending` | `rejected`.
- Every gate decision is appended with `by` (the agent) and `at` (ISO-8601). Soft-gate skips go in `skips[]` with a `reason`.
- The file is committed with the change, so gate history is diffable in the PR. It is also `.gitignore`-able per project if a team prefers Backlog.md/Jira as the source of truth.

## Mapping to Backlog.md
When Backlog.md is the backend, map workflow stages to its custom statuses (e.g. `Requested → Arch → SecOps → Design → Dev → Review → QA → Done`) and store gate decisions in task notes/labels; the `onStatusChange` hook can fire the "record + handoff" step.
