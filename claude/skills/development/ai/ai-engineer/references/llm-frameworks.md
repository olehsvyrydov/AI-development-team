# LLM Frameworks & SDKs — Choosing and Using the Right Tool

How to pick the layer you build an LLM feature on: a raw **provider SDK** + your own
loop, an **orchestration framework**, and/or the **Model Context Protocol (MCP)** to
expose or consume tools. Pairs with the `ai-engineer` SKILL.md and the
`agentic-workflows` reference (this expands the "Providers/SDKs" + framework bullets).

Tool names below are **examples, not endorsements** — they move fast and the patterns
outlive any one product. The governing rule for portability: **keep the provider and
the framework behind your own interface (a port).** Your business logic should call
`generate(messages, tools) → result`, not a vendor's bespoke client directly. Swapping
Anthropic ↔ OpenAI ↔ Gemini, or LangGraph ↔ plain-loop, then becomes an adapter change,
not a rewrite.

**Mental model — three layers, adopt the lowest that works:**

```
  ┌─────────────────────────────────────────────────────────┐
  │  Orchestration framework   (graph / role / typed loop)   │  ← adopt when the
  │   LangGraph · LlamaIndex · OpenAI Agents · CrewAI · …     │    loop gets hard
  ├─────────────────────────────────────────────────────────┤
  │  Provider SDK + YOUR tool loop   (messages, tools, JSON)  │  ← start here
  │   Anthropic · OpenAI · Gemini SDKs                        │
  ├─────────────────────────────────────────────────────────┤
  │  Model Context Protocol (MCP)   — tools/data over a wire  │  ← cross-process
  │   client (consume) · server (expose)                     │    interop
  └─────────────────────────────────────────────────────────┘
```

MCP is orthogonal, not a higher rung: it is *how* tools/data cross a process boundary,
usable from any of the layers above.

---

## 1. Provider SDKs — the capabilities, vendor-neutrally

Every major provider ships a first-party SDK (Python + TS/JS, others community). They
differ in surface naming but converge on the same **capability set**. Describe features
by capability and link the concept — **do not hard-code exact method signatures**, they
drift between SDK majors.

### Capability matrix (all three support these; notes flag real divergences)

| Capability | What it is | Provider notes (verify in current docs) |
|---|---|---|
| **Messages / chat** | Multi-turn request with roles (system/user/assistant) | Anthropic: `system` is a top-level param, not a message role. OpenAI: newer **Responses API** models actions as typed *items* and recommends it over Chat Completions for new work; Chat Completions remains supported. Gemini: `generateContent`; system instruction is a separate field. |
| **Tool / function calling** | Model emits a structured request to invoke a named tool; you run it and feed the result back | Universal. The loop is yours: model proposes → code executes → result appended → repeat. Names differ ("tools" / "function calling"). |
| **Structured / JSON output** | Constrain output to a schema so it parses reliably | OpenAI: **Structured Outputs** with strict JSON-schema adherence. Anthropic: schema via tool-use / output shaping. Gemini: response schema; on some models structured output rides function-calling config. Always **validate after parse** regardless of "guaranteed" claims. |
| **Streaming** | Token/event stream for low time-to-first-token | Universal (SSE-style). Stream events also carry tool-call deltas — accumulate before executing. |
| **Multimodal input** | Images / PDFs / audio alongside text | All three accept images; PDF/audio/video support varies by model — check the specific model card, not just the SDK. |
| **Prompt / context caching** | Reuse a precomputed prefix to cut cost + latency on repeated long context | Anthropic: explicit `cache_control` breakpoints (caches tools→system→messages prefix). Gemini: **implicit** caching on by default for recent models, plus **explicit** cached-content handles. OpenAI: automatic prompt caching for repeated prefixes. Big lever for system-prompt-heavy agents. |
| **Batch** | Asynchronous bulk processing at a discount | Anthropic Message Batches and OpenAI Batch are async (often ~50% cheaper, results within hours). Use for evals, backfills, offline enrichment — never the request path. |

**Portability takeaway.** These seven capabilities are the *real* interface. Define a
thin port exposing exactly them; let each provider's SDK be an adapter behind it. Then
"switch provider" = new adapter + config, and your agent loop / RAG code is untouched.
Watch the genuine asymmetries: system-prompt placement, caching ergonomics, and the
OpenAI Chat-Completions-vs-Responses split are the ones that leak into a naive port.

---

## 2. Orchestration / agent frameworks

A framework earns its place when **your own loop stops being the simple part** — when
you need durable state, branching/retries, human-in-the-loop pauses, multi-agent
hand-offs, or replay/observability you'd otherwise hand-roll. Until then, a plain SDK +
a tool loop (see `agentic-workflows`) is faster to reason about and cheaper to debug.

### Control models (the axis that actually distinguishes them)

- **Graph / state-machine** — you declare nodes + edges + typed state; the engine routes
  and checkpoints. Maximum control, most explicit. (LangGraph.)
- **Event / workflow steps** — steps emit and consume events; loops/branches via event
  routing. (LlamaIndex Workflows.)
- **Role / crew** — you describe agents by role + task; the framework coordinates
  delegation. Fastest to a prototype, least explicit control. (CrewAI.)
- **Conversation** — agents collaborate by talking to each other (and tools). Natural
  for iterative/code-centric exploration. (AutoGen / AG2.)
- **Typed / minimal** — a thin, type-safe agent abstraction over the SDK; validation and
  tool I/O are typed; you keep most control. (Pydantic-AI.)
- **Hand-off based** — one runtime, agents transfer control to specialist agents, with
  guardrails on input/output. (OpenAI Agents SDK.)
- **Plain SDK + your own loop** — no framework; you own observe→decide→act→stop. Most
  control, most boilerplate, zero lock-in.

### Selection table

| Tool | Control model | Good at | Overkill / avoid when | Lock-in / maturity notes |
|---|---|---|---|---|
| **Plain SDK + own loop** | Minimal (you write it) | Single-agent tasks, full control, lowest deps, easy eval/debug | You genuinely need durable state, replay, or multi-agent routing | None. Always the baseline to beat. |
| **LangGraph** | Graph / state-machine | Complex stateful workflows; explicit branching, retries, **checkpointed** state, time-travel replay, human-in-the-loop pauses | Simple linear chains; small one-shot calls | Mature, widely deployed. Lives in the LangChain ecosystem; you can use the graph core without buying all of LangChain. |
| **LlamaIndex (Workflows + agents)** | Event / workflow steps | RAG-grounded agents; data ingestion/indexing/retrieval is the core strength, now extended to agent workflows | You need a heavy general orchestration engine and aren't RAG-centric | Mature for RAG; agent layer newer. |
| **OpenAI Agents SDK** | Hand-off based | Provider-native multi-agent with built-in **hand-offs**, **guardrails** (parallel input/output checks, fail-fast), and **sessions** (conversation memory) | You want provider neutrality (it's OpenAI-centric, though model-pluggable) | Young but production-aimed; lightweight. Python + JS/TS. |
| **CrewAI** | Role / crew | Fastest idea→prototype when work decomposes into roles (researcher/writer/reviewer) | You need fine-grained control over each step or strict determinism | Popular, opinionated. Easy to start, can be hard to constrain. |
| **AutoGen / AG2** | Conversation | Iterative, code-centric, multi-agent research where back-and-forth is natural | Tight, auditable production paths needing deterministic control | **Split lineage:** Microsoft's AutoGen (0.4 rewrite) is folding into the **Microsoft Agent Framework** (the successor consolidating AutoGen + Semantic Kernel; reached a 1.0/GA release in 2026 — verify the current version in the vendor's docs); **AG2** is the community continuation of the 0.2 line by the original creators. Pick deliberately — they are no longer the same project. |
| **Pydantic-AI** | Typed / minimal | Type-safe Python agents; validation-first; errors surface at write-time; model-agnostic; native MCP support | Heavy graph orchestration with many branches/HIL pauses (lighter touch than LangGraph) | From the Pydantic team; rapidly maturing. Low lock-in — thin layer over the SDK. |
| **Microsoft Agent Framework** | Graph + agents | .NET/enterprise stacks wanting session state, middleware, telemetry, graph workflows | You're outside the MS ecosystem | Successor consolidating Semantic Kernel + AutoGen; reached a 1.0/GA release in 2026 — verify the current version in the vendor's docs before committing. |

**How to read this table.** The differentiator is the *control model*, not the feature
checklist — most frameworks now do tools, streaming, and MCP. Choose the control model
that matches how your problem decomposes: a known DAG → graph; "talk it out" research →
conversation; "team of roles" → crew; "mostly one agent, want types" → typed/minimal.

---

## 3. Model Context Protocol (MCP)

MCP is an **open protocol** standardizing how applications give LLMs context and tools
over a wire — "USB-C for tools/data." It decouples *who provides a capability* from *who
uses it*: any compliant client can talk to any compliant server.

### Roles

- **MCP server** — *exposes* capabilities: **tools** (callable functions), **resources**
  (readable data/context), **prompts** (reusable templates). You write a server to make
  *your* system's tools/data available to any MCP-aware agent (an editor, a chat client).
- **MCP client** — lives inside the host app/agent and *consumes* servers: discovers
  tools/resources, calls them, feeds results into the model loop. You write/embed a
  client when your agent needs to reach *external* tools/data.

A capable host can also let the server call *back*: **sampling** (server asks the client
to run a model completion) and **elicitation** (server asks the client to collect user
input) — useful but optional, and not every host implements them.

### Transports

- **stdio** — local subprocess; the host launches the server and talks over stdin/stdout.
  Simplest for local/desktop tools.
- **Streamable HTTP** — networked server; the standard remote transport (it superseded
  the older HTTP+SSE transport). Use for shared/hosted servers; brings auth and origin
  checks into scope.

### Spec versions (date-based; cite the real ones)

MCP revisions are **dated**, not semver. Real, current revisions:

| Revision | Status (verify in spec) | Notable |
|---|---|---|
| `2024-11-05` | Initial | First public revision |
| `2025-03-26` | — | OAuth-style authorization; Streamable HTTP introduced |
| `2025-06-18` | Stable, widely targeted | Structured tool outputs; tightened auth; removed JSON-RPC batching |
| `2025-11-25` | **Latest finalized** | OIDC discovery, incremental scope consent, icons metadata, URL-mode elicitation, tool-calling in sampling, experimental durable **tasks**; JSON Schema 2020-12 as default dialect |

The latest **finalized** revision is **`2025-11-25`**; **later revisions may exist in
release-candidate** — check `modelcontextprotocol.io/specification` for the current spec,
**do not target an unfinalized revision as stable**, and pin a specific finalized dated
revision in your client/server.

### MCP vs in-process tools — when to reach for it

| Use **MCP** when | Use a plain **in-process tool** when |
|---|---|
| The tool/data must be reachable by *multiple* hosts (your editor + your agent + a teammate's client) | Only your one app calls it |
| You want to expose your system to third-party agents over a standard wire | Latency-critical, tight inner loop |
| The capability lives in another process/host/language | A simple function call in the same process suffices |
| You're consuming someone else's already-MCP-exposed capability | You'd be adding protocol + transport overhead for no reuse |

Don't MCP-ify a function only your own loop ever calls — that's protocol overhead for no
interop gain. MCP pays off at the **boundary**, where reuse or cross-process is real.

---

## 4. Cross-cutting selection guidance

### Start small, escalate on evidence

1. **Plain SDK + a tool loop.** Implement observe→decide→act→stop yourself
   (`agentic-workflows`). Most "agent" requirements are a composable workflow, not an
   autonomous agent.
2. **Adopt a framework when you hit a concrete need:** durable/checkpointed state and
   replay; human-in-the-loop pauses; many branches/retries you're hand-rolling badly;
   multi-agent hand-offs; built-in observability you'd otherwise build. Let the *need*
   pick the control model (§2).
3. **Reach for MCP at a boundary:** to expose your tools/data to other hosts, or to
   consume an external MCP server.

### Portability (the port discipline)

- **Provider behind a port.** One internal interface for the seven §1 capabilities;
  provider SDKs are adapters. No vendor client types in business logic.
- **Framework behind a port too, where feasible.** Frameworks lock you in harder than
  SDKs (their state/graph model is invasive). Keep tool *implementations* as plain
  functions the framework merely wires, so they survive a framework swap.
- **Pin versions.** SDK majors and the MCP revision both move; pin and upgrade
  deliberately, behind the port.

### Cost / latency / observability hooks

- **Cost & latency are first-class.** Prefer caching (§1) for stable prefixes; **batch**
  for offline work; cap loop turns + token budget in the loop (`agentic-workflows`).
- **Observability:** emit per-call traces (prompt, tokens, latency, cost, tool calls).
  Frameworks vary — some ship tracing/replay (LangGraph checkpoints, OpenAI Agents
  tracing); with a plain loop, wire OpenTelemetry-style spans yourself. Don't fly blind.

### Structured output + validation

- **Validate at the boundary regardless of provider guarantees.** Use a schema/validation
  library (e.g. Pydantic in Python, Zod in TS) to parse-and-validate model output; on
  failure, **retry with the validation error fed back** (a bounded repair loop).
- Typed-output frameworks (Pydantic-AI, OpenAI Structured Outputs) reduce but don't
  remove this — schema-conformant ≠ semantically correct. Keep the validate-and-retry
  guard.

---

## 5. Anti-patterns

- **Framework-first.** Adopting LangGraph/CrewAI/etc. before you have a problem the plain
  SDK can't handle. You inherit its abstractions, deps, and lock-in for nothing. Earn the
  framework with a concrete need.
- **Bespoke-API lock-in.** Wiring a provider's vendor-specific client straight into
  business logic. The day you need a second provider (failover, cost, capability) it's a
  rewrite. Port it from day one.
- **Multi-agent for a single-agent task.** A crew of five role-agents where one agent + a
  tool loop would do — more tokens, more latency, more failure modes, harder to debug.
  One good agent beats a committee.
- **Leaderboard-driven choice.** Picking a framework/model off a benchmark or a "best
  frameworks 2026" listicle instead of your own eval on your own task. Leaderboards don't
  run your prompts on your data. Measure (`ai-engineer` eval discipline) and decide.
- **Protocol-for-protocol's-sake.** MCP-wrapping a tool only your own process calls. Pure
  overhead with no interop payoff.
- **Pinning to a moving spec by name only.** Saying "MCP" without a dated revision, or
  targeting an unfinalized release-candidate revision as if it were stable. Pin a
  finalized revision such as `2025-06-18` or `2025-11-25` explicitly.
