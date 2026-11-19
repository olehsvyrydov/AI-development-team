# Demo project

A tiny snapshot of a project mid-flight, showing the file-based defaults the framework uses — no setup, no paid accounts.

It contains:
- **Three tickets** — `ADT-118` (done), `ADT-124` (in review), `ADT-130` (in dev).
- A **gate board** for the active ticket (`ADT-124`) under the `regulated` preset — `CODE_REVIEWED` is **rejected** (the review caught a missing rate-limit on the reset endpoint, with the SecOps follow-up tracked as `ADT-130`), `SECOPS_APPROVED` carries the `safety-override`, and the rest are passed/pending.
- Two **knowledge-base** docs under `docs/`.

Each ticket records its `required_gates` (with `refusal`, `owner` and `phase` copied from `workflow.yaml`) next to its `gates`. `ADT-130` is in `dev` with `SECOPS_APPROVED` still pending, so it is a ready-made blocked ticket for the commit gate hook that ships in the Claude Code plugin. The demo deliberately ships no active-ticket file, because that file is per-worktree state that is never committed. To see the block, copy this folder into a scratch repository, make it a git repository, and run Claude Code there with the plugin installed after writing `{"ticket": "ADT-130"}` to `.aidevteam/state/active-ticket.json`: `git commit`, `git push` and `gh pr create` are refused, naming `SECOPS_APPROVED` and `/secops`. Pointing the file at `ADT-124` or `ADT-118` lifts it, because their remaining gates (`CODE_REVIEWED`, `VERIFIED`, …) are `pre_done` or soft.

Nothing here is real — it's just the file-based defaults the framework uses:
`.aidevteam/workflow.yaml` (preset + gates), `.workflow-state.json` (the ledger), and `docs/`.
