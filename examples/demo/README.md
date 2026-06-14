# Demo project

A tiny snapshot of a project mid-flight, showing the file-based defaults the framework uses — no setup, no paid accounts.

It contains:
- **Three tickets** — `ADT-118` (done), `ADT-124` (in review), `ADT-130` (in dev).
- A **gate board** for the active ticket (`ADT-124`) under the `regulated` preset — `CODE_REVIEWED` is **rejected** (the review caught a missing rate-limit on the reset endpoint, with the SecOps follow-up tracked as `ADT-130`), `SECOPS_APPROVED` carries the `safety-override`, and the rest are passed/pending.
- Two **knowledge-base** docs under `docs/`.

Nothing here is real — it's just the file-based defaults the framework uses:
`.aidevteam/workflow.yaml` (preset + gates), `.workflow-state.json` (the ledger), and `docs/`.
