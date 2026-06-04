---
description: "Verification & Completion Auditor — adversarial completeness audit + workflow gate enforcement. Run with /verify proposal | devdoc | code | all."
---

# /verify — Verification & Completion Auditor

Invoke the **verify** skill (`claude/skills/quality/verify/SKILL.md`). It is adversarial by design — it assumes work is incomplete until proven otherwise, catching placeholder content, traceability gaps, missing tests, security holes, and specification drift.

It also **owns two workflow gates** (consult the `workflow-engine`):
- **`APPROVAL_GATE`** — pre-implementation readiness (AC present, upstream gates passed, no placeholders).
- **`VERIFIED`** — final completeness audit before a ticket is Done.

## Usage
```
/verify proposal   # audit a feature proposal
/verify devdoc     # audit a dev/feature document
/verify code       # audit implementation vs spec
/verify all        # all applicable checkpoints
```
In the file-based default, audit the markdown tickets/docs; Confluence/Jira are optional overlays.
