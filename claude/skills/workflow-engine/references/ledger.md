# Workflow ledger — where gate state lives

The ledger records which gates a ticket has passed. The workflow-engine uses the **first available** backend (highest fidelity present wins); all share the same logical schema, so dropping one never breaks the workflow.

1. **`.workflow-state.json`** — repo file, the zero-tool default. Works offline, no MCP, no Jira.
2. **Backlog.md** — if present, the ticket's task status + custom fields carry gate state (and you get a Kanban board + MCP for free).
3. **Jira labels** — optional; used by the `regulated` preset.

Only `.workflow-state.json` is read by the commit gate hook (below). A ticket whose state lives in Backlog.md or Jira is not seen by it.

## `.workflow-state.json` format (default)

A map keyed by ticket id.

```json
{
  "TCK-001": {
    "title": "Password reset via email",
    "track": "standard",
    "stage": "review",
    "required_gates": {
      "ARCH_APPROVED":   { "refusal": "hard", "owner": "/arch",   "phase": "pre_implementation" },
      "SECOPS_APPROVED": { "refusal": "hard", "owner": "/secops", "phase": "pre_implementation" },
      "CODE_REVIEWED":   { "refusal": "hard", "owner": "/rev",    "phase": "pre_done" }
    },
    "gates": {
      "ARCH_APPROVED":   { "state": "passed",  "by": "/arch",   "at": "2026-06-04T10:02:00Z", "note": "Saga not needed; simple token." },
      "SECOPS_APPROVED": { "state": "passed",  "by": "/secops", "at": "2026-06-04T10:20:00Z" },
      "CODE_REVIEWED":   { "state": "pending", "by": null,      "at": null }
    },
    "qa": { "outcome": "pass", "by": "/qa", "at": "2026-06-04T11:30:00Z", "evidence": "3/3 acceptance scenarios pass; 12 unit tests green" },
    "skips": [
      { "gate": "PERF_OK", "reason": "not a hot path", "by": "/be", "at": "2026-06-04T11:00:00Z" }
    ]
  }
}
```

- `required_gates`: written by the engine when it classifies the ticket — every triggered gate plus the preset's `always_required` gates. `refusal`, `owner` and `phase` are copied verbatim from `workflow.yaml` (`SECOPS_APPROVED` is `hard` whenever a security trigger fired). `phase` is `pre_implementation` (must be passed before code is committed or pushed) or `pre_done` (must be passed before the ticket is Done).
- `gates`: the decisions. `state` is `passed` | `pending` | `rejected`. A required gate with no entry here counts as unmet.
- `qa`: the recorded QA outcome (`outcome`, `by`, `at`, `evidence`) — `/verify` reads this as proof the `/qa` step actually ran before it sets `VERIFIED`.
- Every gate decision is appended with `by` (the agent) and `at` (ISO-8601). Soft-gate skips go in `skips[]` with a `reason`; a skip never clears a `hard` gate.

## The active ticket — a separate, uncommitted file

Which ticket the session is working on is **not** stored in the ledger. It lives in `.aidevteam/state/active-ticket.json` at the repository root:

```json
{ "ticket": "TCK-001" }
```

`{"ticket": null}`, or no file at all, means no active ticket. The engine writes it after classifying a ticket and sets it to `null` when the ticket is Done or abandoned and when switching to another ticket.

Why a separate file: it is per worktree, so parallel workers each have their own pointer; it is never committed (keep `.aidevteam/state/` in `.gitignore`; this repository ignores all of `.aidevteam/`), so switching tickets never produces a merge conflict or a diff in a PR; and the ledger stays a plain map of tickets that several branches can add to.

## Committing the ledger — a per-project choice

The ledger can be committed with the change, which makes gate history diffable in the PR. It can equally be left untracked: this repository's own `.gitignore` ignores `.workflow-state.json` (and un-ignores only the bundled demo fixture), as a team would that keeps its tickets in Backlog.md or Jira. Choose one per project. The active-ticket file is never committed either way.

## The commit gate hook

When installed as the Claude Code plugin, the plugin blocks `git commit`, `git push` and `gh pr create` while the active ticket has an unmet hard pre-implementation gate (`ARCH_APPROVED`, `SECOPS_APPROVED`, `APPROVAL_GATE`). Review and verification gates (`CODE_REVIEWED`, `VERIFIED`), soft gates, and everything in Cursor, Kiro and VS Code remain instructions. It is a guardrail against forgetting, not a security boundary: `bash -c`, `eval`, aliases, other commit-creating commands and editing the ledger bypass it, and a missing `python3`, a crash or a timeout lets the command through.

- The hook reads the active-ticket file, then `required_gates` and `gates` for that ticket. A required gate whose `state` is anything but `passed` is unmet.
- It blocks when the ledger or the active-ticket file is malformed (unreadable, empty, not valid JSON, over 1 MiB, wrong shape) or when the active ticket is missing from the ledger, and the reason names the file and the problem — never its content.
- It finds both files from the git top level of the session's working directory, and ignores any `cd` or `-C` target inside the command.
- If the engine never writes `required_gates` and the active-ticket file, the hook allows everything.

## Mapping to Backlog.md
When Backlog.md is the backend, map workflow stages to its custom statuses (e.g. `Requested → Arch → SecOps → Design → Dev → Review → QA → Done`) and store gate decisions in task notes/labels; the `onStatusChange` hook can fire the "record + handoff" step.
