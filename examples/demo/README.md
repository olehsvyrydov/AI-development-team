# Demo project

A tiny snapshot of a project mid-flight, so you can see the [Hub](../../hub/) populated immediately — no setup:

```bash
node hub/server.js examples/demo     # from the repo root, then open http://localhost:4477
```

It shows:
- **Three tickets** — `ADT-118` (done), `ADT-124` (in review), `ADT-130` (in dev).
- The **gate board** for the active ticket (`ADT-124`) under the `regulated` preset — note `CODE_REVIEWED` is **rejected** (the review caught a missing rate-limit on the reset endpoint — the SecOps follow-up tracked as `ADT-130`), `SECOPS_APPROVED` carries the `safety-override`, and the rest are passed/pending. The preset keeps all backends **file-based** (no Jira/Confluence) so the demo needs no setup.
- Two **knowledge-base** docs under `docs/`.

Nothing here is real — it's just the file-based defaults the framework uses by default:
`.aidevteam/workflow.yaml` (preset + gates), `.workflow-state.json` (the ledger), and `docs/`.
