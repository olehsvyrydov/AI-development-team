# Bumbl — Market Research

Researched 2026-02-24. Existing solutions for persistent memory in AI coding assistants.

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
- **Advantage**: Mature architecture, session persistence, multi-client support. Most similar to what Bumbl aims to be.
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

## Gap Analysis

| Feature | Claude Code | claude-mem | memsearch | OpenCode | Aider | **Bumbl** |
|---------|------------|-----------|-----------|----------|-------|-----------|
| Real-time save | No | Hooks | No | No | No | **Yes** |
| Zero info loss | No | Partial | Partial | No | No | **Yes** |
| Vector DB | No | SQLite | Markdown+vector | No | LanceDB* | **Qdrant** |
| Native binary | No | No | No | **Yes** (Go) | No | **Yes** (GraalVM) |
| Multi-session memory | Markdown | **Yes** | **Yes** | Basic | No | **Yes** |
| Context isolation | No | No | **Yes** (subagent) | No | No | **Yes** |
| Smart compaction | Basic | AI compress | Subagent | Auto-compact | No | **AI + DB** |
| Commercial ready | N/A | No | No | Partial | No | **Planned** |

*AiderDesk only, not core Aider.

## Key Insights

1. **No existing tool solves the full problem.** Each addresses one piece:
   - claude-mem captures everything but is a plugin, not standalone
   - memsearch has great context isolation but no real-time save
   - OpenCode has great architecture but no deep memory
   - Aider has great git integration but no memory

2. **The market wants this.** claude-mem and memsearch both emerged in Jan 2026, showing strong demand for persistent memory.

3. **Native binary distribution is rare.** Only OpenCode (Go) ships as a single binary. This is a competitive advantage.

4. **Vector DB integration is underexplored.** Most solutions use SQLite or markdown. Qdrant gives better semantic retrieval, filtering, and scalability.

5. **memsearch's subagent pattern is worth adopting.** Running memory retrieval in an isolated context prevents search results from consuming the main context window.

## Competitive Positioning

Bumbl differentiates by combining:
- **Real-time persistence** (like claude-mem's hooks)
- **Context isolation** (like memsearch's subagent)
- **Client-server architecture** (like OpenCode)
- **Vector DB** (Qdrant, not SQLite/markdown)
- **Native binary** (GraalVM, not Python/Node)
- **Java/Quarkus ecosystem** (enterprise-grade, commercial-ready)
