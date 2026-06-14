# File-based learnings — the `/retro → /kai` loop

Kai's job is to turn accumulated learnings into permanent `SKILL.md` improvements. This runs **entirely file-based** — no external services, no embeddings, no paid accounts. An optional agent-memory MCP overlay (e.g. Praxis) can add higher-fidelity clustering via embeddings; when it is absent, Kai reads the file store below, which is always the source of truth.

## The store

`/retro` writes one file per learning to `./.aidevteam/learnings/`:

```markdown
---
id: L-2026-06-06-001
date: 2026-06-06
source: ADT-124
agent: backend-developer
target: claude/skills/development/backend/java/backend-developer/SKILL.md
type: gotcha            # pattern | gotcha | checklist | domain | tooling
scope: universal        # universal | project
status: open            # open | promoted | rejected
---
**Insight:** …
**Recommendation:** …
```

## How Kai reads it (file-based path)

1. **Collect** — read every `.aidevteam/learnings/*.md` with `status: open` and `scope: universal`.
2. **Cluster** — group by `target` (the destination skill), then by `type` + a keyword theme from the Insight/Recommendation. No embeddings needed; exact-target + lexical-theme grouping is enough at file scale.
3. **Threshold** — a cluster becomes a candidate when **≥ 3** learnings share a target+theme (tune via `min_frequency`). Smaller clusters wait for more evidence (or a human can force-promote a high-value singleton).
4. **Validate** against the `/sm` quality rules — universal, reusable, **not already covered** in the target `SKILL.md`, actionable, and aimed at a SAFE section (`## Anti-Patterns`, `## Checklist`, `## Best Practices` / references) — never `Trigger`/`Context`/`Gate Check`/`Workflow`.
5. **Propose** — emit a proposal (target file, section, exact insertion text, and the source learning ids for traceability). Show it for review.
6. **Apply (after explicit approval)** — append to the target `SKILL.md` and set each source learning's `status: promoted`. Every change is a plain git diff.

Kai **never auto-applies**. Capture (`/retro`) and propose (`/kai`) are separate; a human approves before any `SKILL.md` changes.

## Mapping learning `type` → skill section

| `type` | Target section |
|---|---|
| `gotcha` (a mistake to avoid) | `## Anti-Patterns` |
| `pattern` (a good default to adopt) | `## Best Practices` / `## Standards` |
| `checklist` | `## Checklist` / review checklist |
| `domain` | `## Core expertise` or a `references/<domain>.md` |
| `tooling` | `## Standards` (tools/config) |

(`gotcha` = "don't do this"; `pattern` = "do this". A learning is one or the other, so each routes to exactly one section.)

## Optional agent-memory overlay

When an agent-memory MCP overlay (e.g. Praxis) is configured, Kai can additionally cluster by embedding similarity for fuzzier matches across stored learnings. The file store remains the source of truth; the overlay only improves recall.
