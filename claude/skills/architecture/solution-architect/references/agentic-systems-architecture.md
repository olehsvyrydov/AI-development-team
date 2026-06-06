# Architecture — Agentic Systems (Topologies, Reliability, Governance)

The **system-design** view of LLM-agent systems: how to arrange agents, where state
lives, how the fleet stays reliable and affordable, and how you govern it in production.
This is the *macro* layer. The *micro* layer — the agent loop, tool schemas, per-agent
memory, prompt/eval craft — lives in
`development/ai/ai-engineer/references/agentic-workflows.md`; read it first and treat the
two as complements, not overlaps. Event-driven mechanics (saga, CQRS, outbox, exactly-once)
live in `event-driven.md`; the leaky-port / resolve-at-edge rule lives in
`architecture-patterns.md`. This file cross-links those rather than restating them.

Governing rule, scaled up from the loop level: **the model decides *what*; the
architecture decides *how*, *how often*, *how much it may spend*, and *what it may
touch*.** Everything below is a way to put that boundary in code and topology.

---

## Single-agent vs. multi-agent — the first decision

**Monolith agent first.** One agent with a good tool set and disciplined memory is the
default. A second agent is a distributed-systems boundary: it adds a network hop, a
serialization format, an independent failure mode, a place for context to be lost, and
another budget to blow. You pay microservice tax for LLM-shaped reasons.

Split into multiple agents only when at least one is true:

| Reason to split | Why a boundary actually helps |
|---|---|
| **Genuine parallelism** | Independent subtasks run concurrently and wall-clock matters |
| **Context isolation** | One role's context would poison another's (different system prompt, tools, data boundary) |
| **Capability/skill divergence** | Sub-tasks need different models, tool sets, or trust levels |
| **Independent scaling/ownership** | Roles have very different load or are owned by different teams |
| **Blast-radius / least-privilege** | A high-privilege side-effecting role must be isolated from an untrusted-input role |

If none holds, the honest design is **one agent + more tools**, or a deterministic
**composable workflow** (chaining/routing/parallelization — see `agentic-workflows.md`),
*not* a multi-agent system. Reserve agent fan-out for problems whose shape can't be
enumerated up front. The same arXiv-era "monolith → microservices for agents" caution
applies: don't decompose until a seam is real.

---

## Topologies

Two axes dominate: **who decides the next step** (central orchestrator vs. emergent /
event-driven) and **how state is shared** (threaded by a coordinator vs. a common
blackboard). The vocabulary mirrors `event-driven.md`: orchestration = central
coordinator/state machine; choreography = agents react to events on a bus.

```
Orchestrator–Worker (supervisor)        Hierarchical (supervisor of supervisors)
        ┌────────────┐                          ┌────────────┐
        │ Supervisor │                          │  Top Orch  │
        └─┬──┬──┬─────┘                          └──┬──────┬──┘
          ▼  ▼  ▼                              ┌────▼──┐ ┌─▼─────┐
       ┌──┐┌──┐┌──┐                            │ Sub A │ │ Sub B │
       │W ││W ││W │                            └─┬──┬──┘ └─┬──┬──┘
       └──┘└──┘└──┘                             ▼  ▼      ▼  ▼
  one router decomposes,                       W  W      W  W
  delegates, synthesizes               trees of orchestrators; deep but legible

Sequential / Pipeline                   Choreography (event-driven, over a bus)
  ┌───┐  ┌───┐  ┌───┐                    ┌──────┐  evt   ┌──────┐
  │ A │─▶│ B │─▶│ C │                    │ Agt A│───────▶│ Agt B│
  └───┘  └───┘  └───┘                    └──────┘        └──┬───┘
  fixed staged handoff                    ▲ evt              ▼ evt
                                        ┌──┴───┐         ┌──────┐
Blackboard / shared-state               │ Agt D│◀────────│ Agt C│
  ┌─────────────────────┐               └──────┘         └──────┘
  │  shared scratchpad   │◀── A,B,C    no central brain; message broker
  └─────────────────────┘    read/write   decouples; supersedes by event
```

| Topology | Coordination | Best for | Watch out for | Maps to |
|---|---|---|---|---|
| **Sequential / pipeline** | Fixed A→B→C handoff | Stable staged work | Rigid; an early error propagates downstream | prompt chaining |
| **Orchestrator–worker (supervisor)** | One router decomposes, delegates, synthesizes | Most multi-agent needs; clear ownership + tracing | Supervisor loop with no cap = runaway cost; SPOF | saga **orchestration** |
| **Hierarchical** | Tree of orchestrators | Large task trees, many specialists | Depth = latency + handoff context loss | nested orchestration |
| **Choreography (event-driven)** | Agents emit/consume events on a bus | Loose coupling, scalable fan-out, polyglot teams | Hard to trace; emergent loops; eventual consistency | saga **choreography** / pub-sub |
| **Blackboard / shared-state** | Agents read/write a common store | Collaborative problem-solving | Race conditions, stale reads, hidden coupling | shared write model |
| **Network / mesh (any-to-any)** | Every agent may call any other | Research only | Combinatorial chaos | — (avoid in prod) |

**Orchestration vs. choreography — the same trade as in saga.** Central orchestration
gives you one place to put caps, retries, tracing, and HITL gates, and a legible
trajectory; it is a single point of failure and a potential bottleneck. Choreography over
a message bus gives loose coupling, independent scaling, and natural backpressure; it
trades away a global view — the trajectory is now smeared across topics and is much harder
to trace and to bound. **Default to orchestration** for agent control flow; reach for
choreography only when components are independently owned/scaled and you can afford
event-driven debugging. Reuse the outbox + idempotent-consumer + supersession-by-key
machinery from `event-driven.md` verbatim — agent events are just events.

---

## State & memory architecture (system level)

Per-agent memory tiers (scratchpad / working / episodic / semantic) are in
`agentic-workflows.md`. At the **system** level the questions are: where does durable
state live, who can read it, and can a run resume after a crash.

| Concern | System-level answer |
|---|---|
| **Session / conversation state** | A shared store keyed by conversation/thread id; never the worker's local memory |
| **Per-agent context** | **Isolated by default** (cheaper, fewer cross-contamination bugs). Shared blackboard only with an explicit schema + intentional read/write scopes |
| **Durable workflow state** | A **checkpointer** (relational/KV) persisting each step so a crashed or paused run can **resume** rather than restart — the architectural enabler of HITL and long-horizon runs |
| **Memory backends** | Vector (episodic/similarity), KV/document (entity & preference), relational (checkpoints, audit, idempotency keys); pick per access pattern, don't force one store to do all three |
| **Replay** | Use durable state to *resume* and to *audit*. **Do not assume byte-identical replay** — see determinism caveat below |

**Idempotency & exactly-once for agent side-effects.** A multi-agent system that touches
the world inherits every distributed-messaging hazard. Agents retry on timeout/uncertainty
and orchestrators re-dispatch on partial failure, so **every side-effecting action needs an
idempotency key** and a dedup boundary (same exactly-once playbook as `event-driven.md`:
idempotent consumers + transactional/outbox publish + upsert writes). "The model called the
tool twice" must not become "charged the card twice." Exactly-once is achieved the usual
way — at-least-once delivery + idempotent effects — not by wishing the LLM were
deterministic.

---

## Tool / capability layer

Tool *schema* design is in `agentic-workflows.md`. Architecturally the questions are
**where capabilities live, how agents discover them, and how their blast radius is
contained.**

- **In-process vs. protocol.** A tool used by exactly one in-process agent is a native
  function — no protocol hop. Expose a capability over a **protocol (MCP)** when the
  surface is **reused across multiple agents/hosts** or shipped as a product integration:
  one server, many consumers, language-independent, independently deployable and versioned.
  MCP is to the tool layer what an internal API/gateway is to microservices.
- **Registry & discovery.** Past a handful of tools, agents need a **registry** — a
  catalog they query/filter at runtime rather than stuffing every schema into every
  context window (which wastes tokens and degrades tool selection). A registry also
  centralizes versioning, ownership, and deprecation. (MCP servers self-describe their
  tool/resource lists, which doubles as discovery.)
- **Sandboxing & permissioning.** Treat tools as the privilege boundary. Per-agent
  **allowlists**; destructive/irreversible tools (payments, deletes, external sends,
  `execute_tool` against prod) gated behind extra checks or HITL; run code-exec tools in a
  sandbox (container/VM/WASM) with no ambient credentials. Least privilege per *role*, not
  per fleet.
- **Rate-limiting external effects.** Put quotas/throttles/circuit breakers in front of
  every external dependency a tool wraps. An agent fleet can hammer a downstream far harder
  than a human ever would; the limiter protects *them* and your bill.
- **Long-running tools.** For tools whose work outlives a request, prefer an async/task
  handle (poll for result) over holding a blocking call open — recent MCP revisions add a
  Tasks mechanism for exactly this durable-request shape *(evolving spec — verify against
  the current MCP revision before relying on it)*.

---

## Reliability & control

Production agent fleets need scaffolding *around* every model call. Treat each agent as an
**untrusted, non-deterministic, occasionally-looping** component, and the orchestrator as
the thing that keeps the fleet inside the rails.

| Control | What it does at the system level |
|---|---|
| **Retries with backoff** | Re-attempt transient tool/agent failures — *only* behind idempotency keys |
| **Fallbacks** | Degrade: cheaper model, cached answer, simpler path, or honest "can't do this safely" |
| **Compensation / saga** | For multi-step side-effecting flows, define a **compensating action per step**; on downstream failure, unwind (release/refund/cancel) — straight from `event-driven.md` |
| **Loop / runaway containment** | Global step, token, cost, and wall-clock budgets **per run**, plus a no-progress detector; abort on breach. A frequent cap-hit is a bug signal, not normal |
| **Timeouts** | Per-tool, per-agent, and per-run wall-clock ceilings |
| **Circuit breakers** | Trip on a failing tool/downstream/sub-agent so one sick component doesn't take the fleet with it |
| **Human-in-the-loop / approval gates** | A **first-class architectural element**, not a UI afterthought: durable state lets a run *pause* at an approval point and *resume* on decision. Gate high-impact/irreversible actions |
| **Input / output guardrails** | Validate inbound (prompt-injection, off-topic) before the expensive run; schema/grounding/policy-check the output |

**HITL as architecture.** An approval gate only works if the run can suspend and resume
without losing state — so it *requires* a checkpointer. Design the gate as: persist
state → emit "awaiting approval" → block dispatch of the gated action → on human decision,
load state and continue (or compensate). Don't fake it by keeping a thread alive in memory.

**Determinism caveat (load-bearing).** Agents are **not deterministic even at temperature
0** (sampling, tool-result ordering, model drift across versions). Do not build flows that
assume reproducible trajectories. Assert on **outcomes and invariants**, pin model
versions, make tools idempotent so retries are safe, and use durable state for *resume +
audit*, not for expecting an identical re-run.

---

## Cost, latency & capacity

A multi-agent run multiplies LLM calls; cost and latency are **architectural budgets**,
not afterthoughts. Allocate a token/cost budget **across the whole run** and enforce it in
the orchestrator (not per-call, or one agent eats the fleet's allowance).

**Cost / latency drivers:**

| Driver | Effect | Lever |
|---|---|---|
| **Number of agents / hops** | Each hop = LLM call(s) + handoff context | Fewer agents; merge coupled roles |
| **Context size per call** | Tokens priced per call; large context = slow + costly | Isolate context; pass minimal handoff slice; compact |
| **Model tier per role** | Strong model everywhere = max bill | **Tier per role**: cheap model for routing/triage/extraction, strong only where it pays |
| **Sequential depth** | Latency adds along the critical path | Parallelize independent branches; shorten chains |
| **Reflection / voting** | Doubles+ calls | Gate to tasks where it measurably helps |
| **Cache misses** | Repeated identical prompts re-billed | Prompt/result caching; reuse system-prompt prefixes |
| **Tool fan-out** | External calls cost money + rate limit | Batch; cache; throttle |

**Concurrency & queueing.** Bound parallel worker fan-out (a semaphore/pool), and put a
**queue** between the orchestrator and workers so bursts shed load gracefully instead of
overwhelming downstreams or blowing rate limits. Backpressure here is the same discipline
as any message-driven system.

---

## Observability & governance

Without trajectory tracing, agent-fleet failures are nearly undiagnosable. Trace **every**
LLM call, tool call, and agent handoff — name, args, result, latency, tokens, cost — under
one **correlation/run id** that threads across agent and process boundaries (the same
distributed-tracing discipline as any microservice graph).

- **Standard:** the **OpenTelemetry GenAI semantic conventions** define spans for agent
  operations — operation names such as `invoke_agent`, `create_agent`, `execute_tool`,
  `invoke_workflow`, plus `gen_ai.*` attributes (provider, model, agent id/name,
  input/output token usage, `error.type`). *These conventions are increasingly adopted
  across vendors and frameworks, though the spec itself is formally **Development** as of
  early 2026 (not yet Stable) — pin to a specific semconv version and expect attribute
  churn until they graduate. Verify the current status before treating any attribute as
  frozen.*
- **Audit of actions.** Every side-effecting action is an audit record: which agent, which
  tool, which args, which idempotency key, what outcome, on whose authority (and through
  which approval gate). Side effects without an audit trail are ungovernable.
- **Online eval / trajectory monitoring.** Beyond per-call metrics, monitor **trajectory
  quality** in production (looping rate, wasted steps, cap-hits, task-success) and run a
  **golden-set regression harness** in CI on every prompt/tool/model change — see the eval
  table in `agentic-workflows.md`. Budget regressions (cost/latency) are failures, not
  warnings.
- **Access control & data boundaries.** Each agent runs with **its own identity and least
  privilege**; the data one agent may read must not silently flow to another via shared
  state. Make cross-agent data flow explicit and policy-checked, especially across trust
  tiers (untrusted-input agent must not hand raw context to a high-privilege actor).
- **Prompt / version governance.** System prompts, tool schemas, model pins, and judge
  prompts are **versioned artifacts** under change control — rolling them is a deploy, with
  the same review and rollback story as code.

---

## Deployment

| Component | Shape | Why |
|---|---|---|
| **Workers** | **Stateless**, horizontally scalable, behind a queue | Scale to load; any instance handles any task; state lives in the store, not the process |
| **Orchestrator** | **Stateful** (owns workflow state via checkpointer) but the *process* should be restartable from durable state | Survives crashes; enables resume + HITL; scale via partitioning by run id, not by sharing memory |
| **Tool / MCP servers** | Independently deployed + versioned services | Reuse across agents; own scaling and rate limits; clean privilege boundary |
| **State stores** | Managed durable backends (relational/KV/vector) | The real source of truth; back up + secure accordingly |

**Multi-tenant isolation.** Partition state by tenant; scope every agent identity, tool
credential, memory namespace, and trace to its tenant. Cross-tenant leakage through a
shared vector store or blackboard is the headline failure mode of an agent platform —
enforce the boundary in the store, not just in the prompt.

---

## Architect's decision checklist

1. **Can one agent + tools (or a deterministic workflow) do this?** If yes, stop here.
2. If multi-agent: **which split reason** (parallelism / isolation / capability /
   scaling / blast-radius) justifies each boundary? Name it per agent.
3. **Topology:** orchestration (default, traceable) or choreography (only if independently
   owned/scaled and you accept event-driven debugging)?
4. **State:** where does session + workflow state live? Is there a **checkpointer** for
   resume + HITL? Is per-agent context isolated or a schema'd blackboard?
5. **Side effects:** every state-changing action has an **idempotency key** + dedup +
   audit + (where needed) a **compensating action**?
6. **Budgets:** per-run caps on steps, tokens, cost, wall-clock — enforced in the
   orchestrator? No-progress detector wired?
7. **HITL:** which actions are gated, and does the run *suspend/resume* through durable
   state (not a held thread)?
8. **Capabilities:** in-process tools vs. MCP? Registry for discovery? Per-agent
   allowlist + sandbox for destructive/code-exec tools? Rate limits on external effects?
9. **Cost:** model **tiered per role**? Context minimized per handoff? Caching on?
10. **Observability:** one correlation id across hops, OTel GenAI spans, action audit,
    online trajectory monitoring + CI golden-set regression?
11. **Tenancy & access:** per-agent least-privilege identity; tenant-partitioned state;
    explicit cross-agent data-flow policy?
12. **Determinism:** flows assert on outcomes/invariants, model versions pinned, no
    assumption of replayable trajectories?

---

## Anti-patterns

| Anti-pattern | Why it bites | Do instead |
|---|---|---|
| **Multi-agent when one agent + tools suffices** | Pays microservice tax for no parallelism/isolation gain; loses context across hops | Monolith agent first; split only on a named real seam |
| **Shared mutable global state across agents** | Races, stale reads, non-reproducible bugs, hidden coupling | Isolated context by default; explicit schema'd blackboard with scoped access |
| **No token / loop budget** | Runaway fan-out silently drains the bill | Per-run step/token/cost/time caps + no-progress detector in the orchestrator |
| **Side-effecting actions without idempotency / compensation** | Retries double-charge / double-create; no clean unwind on failure | Idempotency keys + dedup + saga compensation per step |
| **No tracing of the trajectory** | Fleet failures undiagnosable | Correlation id across hops + OTel GenAI spans + action audit |
| **Orchestration logic leaking domain rules** | Routing/caps/retries tangled into business code; un-testable, un-portable | Keep the control plane a separable layer; domain code stays a callee (cf. resolve-at-edge, `architecture-patterns.md`) |
| **HITL faked with an in-memory hold** | Crash/restart loses the pending decision; can't scale workers | Persist state, suspend dispatch, resume from checkpointer on decision |
| **Strong model on every agent** | Max cost for marginal accuracy on trivial steps | Tier models per role; cheap model for routing/triage |
| **Choreography by default** | Untraceable emergent loops, eventual-consistency surprises for control flow | Central orchestration unless independent ownership/scaling demands a bus |
| **Tool with ambient prod credentials, no allowlist/sandbox** | One bad tool call = unbounded blast radius | Per-agent allowlist, sandbox, least-privilege identity, gate destructive tools |
| **Assuming replayable trajectories** | "Works in test" diverges in prod even at temp 0 | Assert outcomes/invariants; pin versions; idempotent tools |

---

*Volatile facts above (OTel GenAI semconv status, MCP Tasks/transport features, framework
specifics) move fast — verify against current upstream docs before committing to an
attribute name, operation name, or version. The architectural reasoning is stable; the
API surface is not.*
