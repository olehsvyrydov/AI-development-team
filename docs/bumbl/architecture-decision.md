# Bumbl — Architecture Decision Record

**Status**: Accepted
**Date**: 2026-02-24
**Decision**: Java/Quarkus with GraalVM Native Image

## Context

We need to choose a technology stack for Bumbl — a persistent memory coding assistant that wraps the Claude API. The app must be fast, distributable as a single binary, commercially viable, and leverage the developer's existing skills.

## Options Considered

### Option A: Python

| Aspect | Assessment |
|--------|------------|
| Development speed | Fast — rich ecosystem, existing Qdrant/embedding code |
| Distribution | **Poor** — requires Python runtime, venv, pip install |
| Performance | Adequate for I/O bound work, poor startup time |
| Commercial viability | Weak — perceived as scripting, not enterprise-grade |
| Developer skill | Medium |

**Verdict**: Good for prototyping, wrong for a product.

### Option B: Java/Quarkus + GraalVM Native

| Aspect | Assessment |
|--------|------------|
| Development speed | Medium — strong ecosystem, familiar language |
| Distribution | **Excellent** — single native binary, ~30MB, no JVM needed |
| Performance | ~10ms startup, ~30MB memory (native), async I/O via Vert.x |
| Commercial viability | **Strong** — enterprise trust, mature libraries |
| Developer skill | **Strong** (primary language) |

**Verdict**: Best balance of capability, distribution, and developer expertise.

### Option C: Go

| Aspect | Assessment |
|--------|------------|
| Development speed | Medium — simple language, proven for CLI tools |
| Distribution | Excellent — single binary, cross-compilation built-in |
| Performance | Excellent startup and memory |
| Commercial viability | Strong — growing enterprise adoption |
| Developer skill | **None** — would need to learn from scratch |

**Verdict**: Strong choice objectively, but learning curve negates the advantage vs Quarkus native.

### Option D: C/C++

| Aspect | Assessment |
|--------|------------|
| Development speed | **Slow** — manual memory management, no GC, verbose |
| Distribution | Excellent — native binary |
| Performance | Maximum possible |
| Commercial viability | Overkill for this use case |
| Developer skill | Some (C/C++ basics) |

**Verdict**: 5-10x slower development for ~20% memory improvement on an I/O-bound app. Not justified.

## Decision

**Java/Quarkus with GraalVM Native Image.**

### Rationale

1. **Native binary distribution** — GraalVM compiles to a standalone executable. No JVM, no runtime dependencies. Users run `./bumbl` and it starts in ~10ms.

2. **Developer's strongest language** — Java expertise means faster iteration, fewer bugs, better architecture decisions. Learning Go would add months to the timeline.

3. **Commercial readiness** — Java/Quarkus is enterprise-grade from day one. Libraries for HTTP clients, database access, dependency injection, testing — all battle-tested.

4. **Async I/O** — Quarkus is built on Vert.x (Netty). Non-blocking HTTP calls to Claude API, Qdrant, and file system operations — exactly what this app needs.

5. **Qdrant Java client** — `io.qdrant:client` is maintained and supports all operations we need.

6. **Future extensibility** — JNI bridge for C libraries if we ever need local embedding inference. JPMS modules for plugin system. GraalVM supports polyglot (call Python/JS from Java if needed).

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GraalVM native image build time | Use dev mode (JVM) for development, native only for release |
| GraalVM reflection limitations | Quarkus handles this — registers classes at build time |
| TUI library maturity in Java | JLine 3 is mature and well-maintained; Lanterna is an alternative |
| Qdrant Java client gaps | Can fall back to REST API directly if needed |

## Proposed Architecture

```
┌─────────────────────────────────────────────────────┐
│                    TUI Layer                         │
│  JLine 3 / Lanterna                                 │
│  Terminal UI, syntax highlighting, panels            │
│  Conversation view, memory sidebar, file tree        │
├─────────────────────────────────────────────────────┤
│                 Session Manager                      │
│  Conversation state machine                          │
│  Smart compaction (summarize → DB, summary → context)│
│  Token counting and context window management        │
├──────────┬──────────────────┬───────────────────────┤
│ Claude   │ Memory Engine    │ File System Manager   │
│ API      │                  │                       │
│ Client   │ Real-time save   │ Git integration       │
│          │ (every exchange) │ Repository map        │
│ Anthropic│                  │ File indexing          │
│ Java SDK │ Semantic search  │                       │
│ (HTTP)   │ (Qdrant client)  │ Code context          │
│          │                  │ extraction             │
│ Streaming│ Context isolation│                       │
│ responses│ (async retrieval)│                       │
├──────────┴──────────────────┴───────────────────────┤
│              Quarkus Core                            │
│  CDI (dependency injection)                          │
│  Vert.x (async I/O, event loop)                     │
│  Config (application.properties, CLI args)           │
├─────────────────────────────────────────────────────┤
│         GraalVM Native Image                         │
│  Single binary, ~30MB, ~10ms startup                 │
│  Linux / macOS / Windows                             │
└─────────────────────────────────────────────────────┘

External:
┌──────────────┐  ┌──────────────┐
│   Qdrant     │  │  Claude API  │
│  (Docker or  │  │  (Anthropic) │
│   embedded)  │  │              │
└──────────────┘  └──────────────┘
```

## Key Libraries

| Library | Purpose | Quarkus Extension |
|---------|---------|-------------------|
| `quarkus-rest-client-reactive` | Claude API calls | Yes |
| `io.qdrant:client` | Vector database | No (standalone) |
| `quarkus-picocli` | CLI argument parsing | Yes |
| `org.jline:jline` | Terminal UI, line editing | No (standalone) |
| `quarkus-scheduler` | Background save tasks | Yes |
| `quarkus-config-yaml` | Configuration | Yes |

## Implementation Phases

### Phase 1: Core Engine (MVP)
- Anthropic API client (streaming chat completions)
- Real-time conversation persistence to Qdrant
- Basic context retrieval (embed query → top-K)
- Simple compaction (truncate + summarize)
- CLI interface (Picocli)
- GraalVM native build

### Phase 2: Rich TUI
- Split-pane terminal UI
- Memory sidebar (retrieved context visible)
- Conversation history browser
- File tree with git status
- Syntax highlighting for code blocks

### Phase 3: Smart Memory
- Intelligent compaction (classify what to keep vs summarize vs store)
- Context isolation (retrieval in background thread, inject only relevant)
- Project-scoped vs global memory
- Memory deduplication and cleanup

### Phase 4: Commercial Features
- Team memory sharing (Qdrant Cloud)
- Cost tracking dashboard
- Plugin system
- IDE integration (VS Code, IntelliJ)
- Usage analytics
