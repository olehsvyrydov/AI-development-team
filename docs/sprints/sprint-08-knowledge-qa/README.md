# Sprint 08 — Knowledge Q&A (interpretation-check) + optional semantic-memory overlay

**Ticket:** ADT-236 (follow-on slice per D-012) · **Preset:** solo · **Track:** full

The deferred follow-on to the file-based knowledge scopes (sprint-06). Two additive capabilities:

1. **Interpretation-check Q&A** — the user asks "did it understand my note about X?" and DART answers
   with **what it actually has** for that topic, scoped to the project (+ matching common), with an
   **honest grounding label** (filename-only vs semantic-match-with-score). Read-only, local-first,
   never-throws. Reuses the existing `buildKnowledge` projection and the proven semantic-recall path.
2. **Optional self-hosted mem0/OpenMemory overlay** — a **thin** adapter (no memory engine) that connects
   to a user-configured semantic-memory service **by URL**, providing semantic recall + the
   interpretation-check **when configured and healthy**. Absent/unhealthy → silently skipped; the local
   default answers (degraded but functional). **Egress is disclosed and OFF by default.**

## The binding constraints (from the user + ratified decisions)

- **Local-first default unaffected** when no overlay is configured — zero network, all of ADT-234/235 works.
- **Egress disclosed** before content is sent; nothing leaves the machine with no overlay configured.
- **Secrets env-only** — overlay URL persists in `~/.aidevteam/config.json`; the credential is read from
  the environment only, never written to config/manifest/DB/logs.
- **Thin adapter** — integrate an existing OSS tool over its endpoint; do not build a memory engine (D-009).

## Folder

```
sprint-08-knowledge-qa/
├── README.md                         # this file
└── approvals/
    └── arch-knowledge-qa.md          # ARCH_APPROVED decision (Jorge) — this slice
```

`/secops` runs its HARD egress gate against §6 of the ARD before any network code ships.
