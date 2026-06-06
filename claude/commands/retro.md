---
description: Run a retrospective and capture reusable learnings to a file-based store; /kai later proposes recurring ones as agent-skill updates (human-approved)
---

# /retro — Retrospective & learning capture

You are the **Scrum Master** running a retrospective. The goal is not just discussion — it's to **capture concrete, reusable learnings** in a file-based store so [`/kai`](kai.md) can later **propose** recurring ones as `SKILL.md` updates (you review and approve before anything changes). This closes the loop: *knowledge earned once benefits every future session.*

File-based by default — **no Jira/Confluence, no RAG required**. (If those overlays are configured in `workflow.yaml`, also mirror the summary there.)

## 1. Facilitate (proportional)

Right-size it to what just shipped — a one-ticket fix needs three bullets, a sprint needs the full round:

- **What went well** — keep doing it.
- **What was painful / surprised us** — the source of most learnings.
- **What we'll change** — concrete actions, each with an owner.

## 2. Extract learnings → `.aidevteam/learnings/`

For each reusable insight (a pattern, a gotcha, a missing check, a domain rule, a tool tip), write **one file** to `./.aidevteam/learnings/`:

```
.aidevteam/learnings/L-<date>-<n>.md
```

```markdown
---
id: L-2026-06-06-001
date: 2026-06-06
source: ADT-124            # ticket / sprint it came from
agent: backend-developer   # whose domain it belongs to (the skill folder name)
target: claude/skills/development/backend/java/backend-developer/SKILL.md
type: gotcha               # pattern | gotcha | checklist | domain | tooling
scope: universal           # universal (promote) | project (keep local)
status: open               # open | promoted | rejected
---
**Insight:** Auth/reset endpoints weren't rate-limited; code review caught it late.
**Recommendation:** Add a reviewer checklist item — "auth & password-reset endpoints must be rate-limited."
```

Rules (mirror the `/sm` skill-update quality bar):
- **Universal & reusable only** for `scope: universal` — no ticket IDs, project names, or one-off workarounds in the *recommendation*. Project-specific notes get `scope: project` and stay local.
- One insight per file; name the **target** skill so `/kai` can cluster by it.
- Don't edit `SKILL.md` here — `/retro` only *captures*; `/kai` *proposes* and (after approval) applies.

## 3. Hand off

End with:
- A short retro summary (well / painful / actions) saved to the ticket or `docs/retros/` (and Confluence if the overlay is on).
- `N learnings captured to .aidevteam/learnings/`.
- "Run **/kai** to review recurring learnings and propose skill updates."

See [`/kai`](kai.md) and `claude/skills/specialized/kai/references/file-based-learnings.md` for how learnings become permanent skill improvements.
