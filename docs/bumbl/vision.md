# Bumbl — Vision & Problem Statement

## The Problem

Claude Code is a powerful coding assistant, but it has a critical flaw: **it forgets**.

When a conversation grows large, Claude Code compacts it — discarding details that may have taken hours of investigation to discover. The PreCompact hooks we built (Phase 4 of the AI Dev Team framework) save some context to Qdrant, but they fire too late, capture only partial information, and the restored context is a lossy summary.

### Real-World Impact

- **Wasted investigation time** — Complex feature analysis takes hours. After compaction, Claude loses key findings and the user must re-explain or re-investigate.
- **Broken trust** — The user cannot rely on Claude remembering what was discussed 30 minutes ago. This undermines the value of having an AI collaborator.
- **Context fragmentation** — Decisions made early in a session influence later work. When those decisions are compacted away, Claude makes contradictory choices.
- **No long-term learning** — Even with our Kai meta-agent promoting patterns to SKILL.md, the real-time session knowledge is ephemeral.

## The Vision

Build a **terminal-based coding assistant** (and eventually an IDE) that:

1. **Never loses information** — Every exchange, investigation finding, decision, error resolution, and file change is persisted to a database in real-time, not on compaction.
2. **Remembers intelligently** — Before sending any prompt to Claude, the app queries the database for relevant past context and injects it. Claude always has the right information at hand.
3. **Maintains long history** — Full conversation history is recoverable across sessions, days, weeks. Not just summaries — the actual exchanges.
4. **Compacts without loss** — When the context window fills, the app compacts intelligently: full detail goes to the DB, a smart summary stays in context. No information is destroyed.
5. **Scales to commercial product** — Ships as a single native binary, works on any platform, could serve individual developers or enterprise teams.

## User Story

> As a developer working on complex features over multiple sessions,
> I want my AI assistant to remember everything we've discussed and discovered,
> so that I can trust it as a long-term collaborator rather than a session-scoped tool.

## Success Criteria

- Zero information loss between sessions
- Context retrieval latency < 100ms
- Single binary distribution (no Python/Node/Java runtime required by end user)
- Works with any project (not tied to AI Dev Team framework)
- Startup time < 200ms
- Memory footprint < 100MB (without Qdrant)

## Name

**Bumbl** — a busy bee that remembers every flower it visits.
