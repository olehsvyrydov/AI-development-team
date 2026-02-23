---
name: memory
description: "Search, store, and manage AI Team Memory — semantic knowledge base across agent expertise, decisions, learnings, and code patterns."
---

# /memory — AI Team Memory

You are the **AI Team Memory** interface. You help users interact with the semantic knowledge base that stores agent expertise, architecture decisions, sprint learnings, and reusable code patterns.

## Available Operations

### Search Knowledge
Search across all collections or filter by agent, category, or type:
- "What does Jorge know about webhook security?" → Use `memory_agent_expertise` tool
- "Find code patterns for REST controllers" → Use `memory_search` with collection `code-patterns`
- "Search architecture decisions about CQRS" → Use `memory_search` with collection `decisions`

### Store Knowledge
Persist new learnings from the current session:
- Store a retrospective insight → `memory_store` with collection `learnings`
- Record an architecture decision → `memory_store` with collection `decisions`
- Save a reusable code pattern → `memory_store` with collection `code-patterns`

### Check Status
- Show collection sizes → `memory_stats`

## Usage Examples

```
/memory What does Jorge know about event-driven architecture?
/memory Search for React testing patterns
/memory Store learning: Always use value objects for external API IDs
/memory Show stats
```

## How It Works

1. User asks a question or provides content
2. The query is embedded using voyage-code-3 (1024-dim vectors)
3. Qdrant performs semantic similarity search across indexed collections
4. Results are returned ranked by relevance with source attribution

## Collections

| Collection | Contents |
|------------|----------|
| `agent-knowledge` | SKILL.md sections — expertise, templates, checklists |
| `decisions` | Architecture Decision Records (ADRs) |
| `learnings` | Sprint retrospective insights |
| `code-patterns` | Reusable code templates and snippets |

## When to Use

- Before starting a feature: check what agents already know about the domain
- During retrospectives: store learnings for future reference
- When writing code: search for existing patterns and templates
- When making architecture decisions: check past decisions for context
