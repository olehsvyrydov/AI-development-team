# Persistent-Memory Coding Assistant — Market Research

Researched 2026-02-24. Existing solutions for persistent memory in AI coding
assistants, and options for **adopting** rather than building.

## Existing Solutions

### Claude Code (Anthropic)

- **What it does**: Official CLI for Claude. Skills, hooks, MCP tools, auto-memory directory.
- **Memory**: `~/.claude/projects/<project>/memory/` — Claude writes notes to markdown files. PreCompact/SessionStart hooks can save/restore context.
- **Limitation**: Compaction discards conversation detail. Hooks fire too late and capture partial context. Auto-memory is unstructured markdown, not indexed.
- **URL**: https://code.claude.com

### claude-mem

- **What it does**: Claude Code plugin that auto-captures everything via 5 lifecycle hooks.
- **Hooks**: SessionStart → UserPromptSubmit → PostToolUse → Summary → SessionEnd
- **Stack**: TypeScript, Express API worker service, SQLite database, React viewer UI
- **How it works**: Compresses sessions with AI (Claude agent-sdk), injects relevant context into future sessions. MCP tools: search, timeline, get_observations, save_memory.
- **Limitation**: MCP tool definitions permanently consume context tokens. Still a plugin on top of Claude Code, not a standalone app.
- **URL**: https://github.com/thedotmack/claude-mem

### memsearch (Zilliz)

- **What it does**: Markdown-first memory system, standalone library for any AI agent.
- **Architecture**: Markdown files = source of truth. Vector store is a derived index (rebuildable). Runs memory recall in a **forked subagent** with isolated context window — only curated summary returns to main conversation.
- **Advantage**: Clean context separation — search results don't pollute main context window.
- **Available as**: Claude Code ccplugin + standalone CLI library.
- **URL**: https://github.com/zilliztech/memsearch

### OpenCode

- **What it does**: Open-source Go-based terminal coding agent with TUI.
- **Architecture**: Client-server separation. Server handles LLM communication, tool execution, session management. TUI client provides the interface. Multiple clients can attach to one backend.
- **Memory**: Auto-compact when approaching context limit. Session persistence across disconnections.
- **Models**: 75+ (Claude, OpenAI, Gemini, local via Ollama).
- **Advantage**: Mature architecture, session persistence, multi-client support — the closest existing match to the concept described here.
- **Limitation**: No deep persistent memory — just auto-compact summaries. No vector DB integration.
- **URL**: https://github.com/opencode-ai/opencode

### Aider

- **What it does**: Terminal AI pair programming, git-first workflow.
- **Architecture**: Python CLI. Repository map (function signatures + file structure) for context. Auto-pulls context from related files.
- **Memory**: Minimal. AiderDesk extension adds memory via LanceDB (local vector search), but it's a separate project.
- **Advantage**: Git integration is excellent. Proven model.
- **Limitation**: Python distribution, no persistent memory in core product.
- **URL**: https://aider.chat

### Cursor

- **What it does**: VS Code fork with integrated AI. Commercial product.
- **Memory**: Chat history per session. No persistent memory across sessions. Context is codebase-indexed.
- **Limitation**: Closed source. No API access to memory layer. No cross-session recall.
- **URL**: https://cursor.com

### cogmemai-mcp

- **What it does**: 8 MCP tools for persistent cognitive memory. Cloud-first, zero config.
- **URL**: https://github.com/hifriendbot/cogmemai-mcp

## Adopt-Instead-of-Build Options

Rather than writing a memory engine from scratch, the persistence layer could
be delegated to an existing, maintained project. Worth evaluating in future:

### Onyx (formerly Danswer)

- **What it does**: Open-source AI assistant and enterprise search over your own knowledge sources, with RAG, connectors, and a self-hostable backend.
- **Fit**: Could serve as the retrieval/knowledge backend rather than building bespoke RAG. Mature, self-hostable, permissive licensing.
- **URL**: https://github.com/onyx-dot-app/onyx

### Obsidian

- **What it does**: Local-first markdown knowledge base with a large plugin ecosystem and a well-understood file format.
- **Fit**: Markdown vault as the durable, human-readable source of truth (like memsearch's markdown-first model), with a vector index layered on top. Low lock-in; the notes remain plain files.
- **URL**: https://obsidian.md

### mem0

- **What it does**: Open-source memory layer for AI agents and LLM apps — a memory API that stores, updates, and retrieves per-user/per-agent memories.
- **Fit**: Drop-in memory API; skip building storage, embedding, and recall plumbing. Self-hostable or managed.
- **URL**: https://github.com/mem0ai/mem0

### Self-written

- **What it does**: A purpose-built engine (the [suggested architecture](architecture-decision.md)).
- **Fit**: Maximum control over real-time persistence, context isolation, and distribution; highest cost and maintenance burden. Only justified if the adopt options can't meet the latency / native-binary / context-isolation goals.

## Gap Analysis

The **Target** column is the aspiration described in the [vision](vision.md), not a shipped product.

| Feature | Claude Code | claude-mem | memsearch | OpenCode | Aider | **Target** |
|---------|------------|-----------|-----------|----------|-------|-----------|
| Real-time save | No | Hooks | No | No | No | **Yes** |
| Zero info loss | No | Partial | Partial | No | No | **Yes** |
| Vector DB | No | SQLite | Markdown+vector | No | LanceDB* | **Qdrant** |
| Native binary | No | No | No | **Yes** (Go) | No | **Yes** (GraalVM) |
| Multi-session memory | Markdown | **Yes** | **Yes** | Basic | No | **Yes** |
| Context isolation | No | No | **Yes** (subagent) | No | No | **Yes** |
| Smart compaction | Basic | AI compress | Subagent | Auto-compact | No | **AI + DB** |

*AiderDesk only, not core Aider.

## Key Insights

1. **No existing tool solves the full problem.** Each addresses one piece:
   - claude-mem captures everything but is a plugin, not standalone
   - memsearch has great context isolation but no real-time save
   - OpenCode has great architecture but no deep memory
   - Aider has great git integration but no memory

2. **There is demand.** claude-mem and memsearch both emerged in Jan 2026, showing interest in persistent memory.

3. **Native binary distribution is rare.** Only OpenCode (Go) ships as a single binary — a meaningful differentiator.

4. **Vector DB integration is underexplored.** Most solutions use SQLite or markdown. Qdrant gives better semantic retrieval, filtering, and scalability.

5. **memsearch's subagent pattern is worth adopting.** Running memory retrieval in an isolated context prevents search results from consuming the main context window.

6. **Adopt before build.** Onyx, Obsidian, or mem0 may cover most of the value at a fraction of the effort. A from-scratch build is only warranted if those can't meet the latency, native-binary, and context-isolation goals.

## If Built: Differentiation

Should a from-scratch build be chosen, it would differentiate by combining:
- **Real-time persistence** (like claude-mem's hooks)
- **Context isolation** (like memsearch's subagent)
- **Client-server architecture** (like OpenCode)
- **Vector DB** (Qdrant, not SQLite/markdown)
- **Native binary** (GraalVM, not Python/Node)
- **Java/Quarkus ecosystem** (mature, well-supported libraries)
