# Persistent-Memory Coding Assistant — Suggested Architecture

**Status**: Proposed — a suggested stack. Applies _if_ the tool is built from
scratch rather than satisfied by adopting an existing tool (Onyx, Obsidian,
mem0 — see [Market Research](market-research.md)).
**Date**: 2026-02-24
**Suggested stack**: Java/Quarkus with GraalVM Native Image

## Context

_If_ a persistent-memory coding assistant that wraps the Claude API were built
from scratch, it would need to be fast, distributable as a single binary, and
maintainable with the developer's existing skills. This document records the
suggested stack for that hypothetical build. It is not a commitment to build,
nor an assumption of a commercial outcome.

## Options Considered

### Option A: Python

| Aspect | Assessment |
|--------|------------|
| Development speed | Fast — rich ecosystem, existing Qdrant/embedding code |
| Distribution | **Poor** — requires Python runtime, venv, pip install |
| Performance | Adequate for I/O bound work, poor startup time |
| Productization | Weak — perceived as scripting rather than a shippable app |
| Developer skill | Medium |

**Verdict**: Good for prototyping, wrong for a distributable app.

### Option B: Java/Quarkus + GraalVM Native

| Aspect | Assessment |
|--------|------------|
| Development speed | Medium — strong ecosystem, familiar language |
| Distribution | **Excellent** — single native binary, ~30MB, no JVM needed |
| Performance | ~10ms startup, ~30MB memory (native), async I/O via Vert.x |
| Productization | **Strong** — mature libraries, easy single-binary delivery |
| Developer skill | **Strong** (primary language) |

**Verdict**: Best balance of capability, distribution, and developer expertise.

### Option C: Go

| Aspect | Assessment |
|--------|------------|
| Development speed | Medium — simple language, proven for CLI tools |
| Distribution | Excellent — single binary, cross-compilation built-in |
| Performance | Excellent startup and memory |
| Productization | Strong — proven for developer tooling |
| Developer skill | **None** — would need to learn from scratch |

**Verdict**: Strong choice objectively, but learning curve negates the advantage vs Quarkus native.

### Option D: C/C++

| Aspect | Assessment |
|--------|------------|
| Development speed | **Slow** — manual memory management, no GC, verbose |
| Distribution | Excellent — native binary |
| Performance | Maximum possible |
| Productization | Overkill for this use case |
| Developer skill | Some (C/C++ basics) |

**Verdict**: 5-10x slower development for ~20% memory improvement on an I/O-bound app. Not justified.

## Suggested Decision

**Java/Quarkus with GraalVM Native Image** — _if_ built from scratch.

### Rationale

1. **Native binary distribution** — GraalVM compiles to a standalone executable. No JVM, no runtime dependencies. Users run `./assistant` and it starts in ~10ms.

2. **Developer's strongest language** — Java expertise means faster iteration, fewer bugs, better architecture decisions. Learning Go would add months to the timeline.

3. **Mature ecosystem** — Java/Quarkus offers battle-tested libraries for HTTP clients, database access, dependency injection, and testing.

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

## Possible Implementation Phases

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

### Phase 4: Advanced / Optional
- Team memory sharing (Qdrant Cloud)
- Cost tracking dashboard
- Plugin system
- IDE integration (VS Code, IntelliJ)
- Usage analytics

> These phases are indicative, not a fixed commitment; scope and ordering may
> change as the project develops.
