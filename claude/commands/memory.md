---
name: memory
description: "Search, store, and manage AI Team Memory — agent expertise, decisions, learnings, and code patterns. File-based by default, with an optional memory MCP overlay."
---

# /memory — AI Team Memory

You are the **AI Team Memory** interface. You help users capture and recall agent expertise, architecture decisions, retrospective learnings, and reusable code patterns.

Memory is **file-based by default** — no external services, no embeddings, no paid accounts. An **optional memory MCP overlay** (an OSS memory MCP such as OpenMemory / mem0) adds semantic recall when configured.

## Backend selection

1. **File-based (default).** Decisions and patterns live alongside the project's markdown knowledge base. Recall is exact-target + keyword search over those files. This path always works and is the source of truth.
2. **Optional memory MCP overlay.** When an OSS memory MCP (OpenMemory / mem0) is configured, use its tools for semantic search and storage. The file store remains authoritative; the overlay only improves recall.

Detect what is available before answering: if a memory MCP is connected, use it; otherwise fall back to the file store. Never send the user at a backend that is not configured.

## Available Operations

### Search Knowledge
Recall by agent, category, or theme:
- "What does the architect know about webhook security?" → search the agent's `SKILL.md` expertise (file-based) or the overlay's stored knowledge.
- "Find code patterns for REST controllers" → search reusable patterns in the knowledge base / overlay.
- "Search architecture decisions about CQRS" → search the project's decision records / overlay.

### Store Knowledge
Persist a learning, decision, or pattern from the current session:
- Capture a durable insight → store it to the memory overlay if one is configured; otherwise record it in the project's knowledge base.
- Record an architecture decision → add a decision record to the knowledge base.
- Save a reusable code pattern → add it to the patterns store.

### Check Status
- Report which backend is active (file store, and whether a memory MCP overlay is connected).

## Usage Examples

```
/memory What does the architect know about event-driven architecture?
/memory Search for React testing patterns
/memory Store learning: Always use value objects for external API IDs
/memory Show status
```

## Categories

| Category | Contents | File-based home |
|----------|----------|-----------------|
| Agent knowledge | `SKILL.md` sections — expertise, templates, checklists | `claude/skills/**/SKILL.md` |
| Decisions | Architecture Decision Records (ADRs) | project knowledge base |
| Working-rules | Scoped rules accumulated from real sessions, human-approved, promoted by `/kai` | the project's memory backend, if configured |
| Code patterns | Reusable code templates and snippets | project knowledge base |

## When to Use

- Before starting a feature: check what agents already know about the domain
- During retrospectives: capture learnings for future reference (feeds `/kai`)
- When writing code: search for existing patterns and templates
- When making architecture decisions: check past decisions for context
