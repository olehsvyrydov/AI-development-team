# Agentic Workflows — Loops, Tools, Memory, Multi-Agent & Control

Patterns for building LLM agents: systems where a model drives a loop of decisions
and tool calls toward a goal, rather than running a single fixed prompt. Framework-agnostic;
concrete tool names appear where they clarify. The governing rule throughout:
**the LLM decides *what*; code decides *how* and *when to stop*.**

## Workflow vs. Agent — pick the weakest tool that works

| | Workflow | Agent |
|---|---|---|
| **Control flow** | Predefined code paths | LLM decides next step at runtime |
| **Predictability** | High — auditable, cheap | Lower — dynamic trajectory |
| **When** | Steps known in advance | Steps depend on intermediate results |
| **Cost/latency** | Bounded | Open-ended (cap it) |

Start with the simplest thing. A single LLM call with retrieval beats a workflow;
a workflow beats an agent; one agent beats many. Add autonomy only when the task's
shape genuinely can't be enumerated up front (e.g. "fix this failing build"). Most
"agent" requirements are satisfied by a **composable workflow** of LLM calls.

### Composable workflow patterns (deterministic scaffolding)

| Pattern | Shape | Use when |
|---|---|---|
| **Prompt chaining** | Output of step N → input of N+1, optional gate checks between | Task decomposes into fixed sequential subtasks |
| **Routing** | Classifier picks one of K downstream handlers | Distinct input categories, each better served by a specialized prompt/model |
| **Parallelization** | Fan-out independent subtasks (sectioning) or run same task K times (voting) | Speed matters, or you want confidence via aggregation |
| **Orchestrator–workers** | LLM orchestrator decomposes dynamically, delegates, synthesizes | Subtasks unknown until runtime (e.g. multi-file code edits) |
| **Evaluator–optimizer** | Generator produces; evaluator critiques; loop until acceptable | Clear quality criteria and iteration measurably improves output |

---

## Single-Agent Loops

### The control loop

Every agent is a loop over the same four phases:

```
        ┌──────────────────────────────────────────────┐
        │                                              │
   ┌────▼─────┐   ┌──────────┐   ┌────────┐   ┌────────▼───────┐
   │ OBSERVE  │──▶│  DECIDE  │──▶│  ACT   │──▶│ OBSERVE result │
   │ (context)│   │ (LLM:    │   │ (tool/ │   │ (append to     │
   │          │   │  plan +  │   │  answer│   │  context)      │
   │          │   │  choose) │   │        │   │                │
   └──────────┘   └──────────┘   └────────┘   └────────────────┘
        ▲                                              │
        └───────── until termination condition ────────┘
```

`OBSERVE` builds the context window (system prompt + goal + history + tool results).
`DECIDE` is the LLM call that emits either a tool call or a final answer. `ACT`
executes the chosen tool. The new observation is appended and the loop repeats.

### Loop variants

| Pattern | Idea | Trade-off |
|---|---|---|
| **ReAct (tool-use loop)** | Interleave reasoning + tool calls; model decides each step from the latest observation | Flexible, but can wander; needs caps |
| **Plan-then-execute** | Produce a full plan first, then execute steps (re-plan only on failure) | Fewer LLM calls, more legible; brittle if plan is wrong |
| **Reflection / self-critique** | After acting, the model (or a second pass) critiques and revises | Higher quality on open-ended tasks; doubles cost — gate it |

### Termination conditions (always set explicitly)

Code — not the model — owns stopping. Combine several:

- **Goal reached** — model emits a final answer / no further tool call.
- **Step / iteration cap** — hard ceiling on loop turns (e.g. 25 for a focused task).
  Hitting it should be *alarming*, not routine — a frequent cap-hit means a prompt bug.
- **Token / cost budget** — abort when cumulative spend exceeds a per-run limit.
- **Wall-clock timeout** — bound total latency.
- **No-progress detector** — abort on repeated identical tool calls or oscillation.

```
loop:
  if turns >= MAX_TURNS or cost >= BUDGET or elapsed >= TIMEOUT: abort("limit")
  decision = llm(context)
  if decision.is_final: return decision.answer
  if seen_recently(decision.tool_call): abort("loop detected")
  context += run_tool(decision.tool_call)   # always feed result back
```

---

## Tool Design

Tools are the agent's primary interface to the world. Their **schemas and descriptions
are part of the prompt** — the model reads them to decide *whether* and *how* to call.

### Schema (JSON Schema)

- **Description is the most load-bearing field.** Answer three questions: what it does,
  when to use it, when *not* to. Write for a competent stranger, not for yourself.
- **Constrain the input space.** Use `enum` for finite value sets (the single most
  effective way to prevent invalid calls), `required`, types, ranges, patterns.
  MCP (2025-06-18 spec) supports full JSON Schema 2020-12 — composition (`oneOf`/`anyOf`),
  conditionals, `$ref`/`$defs` — but keep schemas as simple as the task allows.
- **Validate arguments server-side** even though the schema "should" prevent bad input.
  On violation, return a *structured error the model can act on*, not a stack trace.

```json
{
  "name": "search_orders",
  "description": "Find orders for a customer. Use for 'where is my order' / status questions. Do NOT use to create or cancel orders — use manage_order for that.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string", "description": "Internal customer UUID, not email" },
      "status": { "type": "string", "enum": ["pending","shipped","delivered","cancelled"] }
    },
    "required": ["customer_id"]
  }
}
```

### Granularity & quality

| Do | Avoid |
|---|---|
| Few cohesive tools matching real workflows | One mega-tool with a `mode` flag, or 50 nano-tools |
| Verbs the model recognizes (`search_`, `create_`, `cancel_`) | Vague names (`process`, `handle`, `do_thing`) |
| Return only the fields the model needs | Dumping raw API payloads into context |
| Stable, typed/structured results | Free-text blobs the model must re-parse |

### Errors, retries & idempotency

- **Feed errors back to the model.** A tool error is a *new observation*, not a crash:
  `{"error":"customer_not_found","hint":"verify the UUID via lookup_customer"}` lets the
  model self-correct. This closes the loop — the agent retries *with feedback*.
- **Make state-changing tools idempotent.** Agents retry on timeout/uncertainty; accept a
  client-supplied idempotency key and return the same result for the same key so a duplicate
  call doesn't double-charge or double-create.
- **Structured / typed output.** Where you need a typed result (not a tool call), use the
  provider's structured-output / response-schema feature; on parse/validation failure,
  retry once with the validation error appended (bounded — don't loop forever).

### MCP — when to use it

The **Model Context Protocol** is an open standard for exposing tools, resources, and
prompts to any MCP-aware client over a transport (stdio for local; streamable-HTTP for
remote — streamable HTTP supports an optional stateless deployment mode since the
2025-06-18 spec, though the MCP base protocol is stateful). Reach for MCP when a tool surface should
be **reusable across multiple agents/hosts** or shipped as a product integration. For a
tool used by exactly one in-process agent, a native function tool is simpler — don't add a
protocol hop you don't need. MCP servers also expose **elicitation** (server asks the user
for missing input) and **structured tool output** (`outputSchema` + `structuredContent`).

---

## Memory

Context is finite and expensive; **context drift kills agents before context limits do**.
Manage memory deliberately rather than appending everything.

| Tier | Holds | Mechanism | Lifetime |
|---|---|---|---|
| **Short-term (scratchpad)** | Current goal, recent turns, live tool results | Rolling window of messages | Single run |
| **Working / compacted** | Distilled state of the run so far | Summarization / compaction | Single run, long horizon |
| **Long-term — episodic** | Past interactions, "what happened when" | Vector store keyed by recency/similarity | Across runs |
| **Long-term — semantic/entity** | Facts, user prefs, entity profiles | KV / entity store, retrieved on demand | Persistent |
| **State store** | Checkpoints for resume/replay/HITL | Durable store (e.g. Postgres checkpointer) | Persistent |

### Compaction (the key long-horizon technique)

When the window fills, summarize older turns and **merge into a persistent running state**
(anchored iterative summarization) rather than re-summarizing from scratch each time — it
scores higher on continuity and accuracy. A good summary answers: *what changed, what is
still true, what is blocked, what evidence supports that status.* Drop bulky tool results
once the task has moved past them — clearing stale tokens is itself a recall improvement.
Some providers now offer native compaction APIs; otherwise roll your own with a cheaper model.

### What to persist vs. recompute

Persist what is **expensive to derive and stable** (extracted entities, user preferences,
final artifacts, checkpoints). Recompute what is **cheap or volatile** (live data, anything
re-fetchable from source of truth). Never persist secrets in memory stores; redact PII before
it lands in long-term storage.

---

## Multi-Agent

Multiple agents help when subtasks are **genuinely parallel or need isolated context/tools**.
They hurt by multiplying cost, latency, and failure surface, and by losing context across
boundaries. **Default to one agent with good tools**; split only when a single context window
or skill set can't cover the work.

### Topologies

```
Supervisor (orchestrator-worker)        Choreography (event-driven)
        ┌───────────┐                    ┌──────┐  event  ┌──────┐
        │ Supervisor│                    │ Agt A│────────▶│ Agt B│
        └─┬───┬───┬─┘                    └──────┘         └──┬───┘
          ▼   ▼   ▼                          ▲ event         ▼ event
       ┌───┐┌───┐┌───┐                     ┌──┴───┐       ┌──────┐
       │ W ││ W ││ W │                     │ Agt D│◀──────│ Agt C│
       └───┘└───┘└───┘                     └──────┘       └──────┘
   one router decides who              no central control; agents react
   goes next; shared state             to events on a bus / blackboard
```

| Topology | How it coordinates | Best for | Watch out for |
|---|---|---|---|
| **Sequential / pipeline** | Fixed A→B→C handoff | Stable staged work | Rigid; one stage's error propagates |
| **Hierarchical / supervisor** | Central orchestrator routes & synthesizes | Most multi-agent needs; clear ownership | Supervisor loop with no cap = runaway cost |
| **Choreography (event-driven)** | Agents emit/consume events, no central brain | Loosely coupled, scalable fan-out | Hard to trace; emergent loops |
| **Blackboard / shared-state** | Agents read/write a common scratchpad | Collaborative problem-solving | Race conditions; stale reads |
| **Network (any-to-any)** | Every agent may call any other | Rarely — research only | Combinatorial chaos; avoid in prod |

### Handoffs & delegation

A **handoff** transfers control (and optionally a filtered slice of context) to a specialist;
**delegation** keeps the caller in charge and treats the sub-agent as a tool that returns a
result. Prefer delegation when the orchestrator must synthesize; prefer handoff when one
specialist should own the rest of the interaction. Pass the **minimum context** the receiver
needs — full-transcript handoffs blow the budget and leak irrelevant state.

### Shared vs. isolated context

- **Isolated** (default): each agent gets only its task + relevant inputs. Cheaper, fewer
  cross-contamination bugs, but the orchestrator must thread results through.
- **Shared** (blackboard): agents see common state. Powerful for collaboration but introduces
  hidden coupling — make the shared schema explicit and read/write access intentional.

---

## Planning & Decomposition

- **Task decomposition** — break a goal into sub-goals/subtasks (LLM-generated plan, or a
  fixed template when the shape is known). Make subtasks independently checkable.
- **Routing / dispatcher** — a classifier (cheap model) directs each input to the right
  handler, sub-agent, or tool set. Keep the route set small and the labels mutually exclusive.
- **Dynamic re-planning** — after a step fails or reveals new info, revise the remaining plan
  rather than blindly continuing. Bound the number of re-plans.
- **Cost-aware routing** — use a small model for routing/triage and the strong model only on
  the steps that need it (swapping the orchestrator to a cheap model can cut total cost
  substantially with minor accuracy loss on non-critical paths).

---

## Reliability & Control

Production agents need scaffolding *around* the model. Treat the LLM as an untrusted,
non-deterministic component.

| Control | What it does |
|---|---|
| **Input guardrails** | Validate/sanitize user input; detect prompt-injection & off-topic before the expensive run |
| **Output guardrails** | Schema-validate, fact/grounding-check, policy-filter the final output |
| **Tool allowlists** | Restrict which tools an agent may call; gate destructive tools behind extra checks |
| **Human-in-the-loop** | Pause for approval before high-impact/irreversible actions (payments, deletes, external sends) |
| **Budgets** | Per-step *and* per-run caps on tokens, cost, tool calls; abort on breach |
| **Timeouts** | Per-tool and per-run wall-clock limits |
| **Fallbacks** | Degrade gracefully — cheaper model, cached answer, or "I can't do that safely" |
| **Loop/runaway detection** | Abort on repeated identical actions, oscillation, or cap-hit |

### Observability

Trace **every** tool call (name, args, result, latency, tokens, cost) and the reasoning/decision
between them — the trajectory, not just the final answer, is what you debug and evaluate.
Use structured tracing (OpenTelemetry GenAI conventions, LangSmith, or equivalent) with a
correlation id per run. Without trajectory tracing, agent failures are nearly impossible to
diagnose.

### Determinism caveats

Agents are **not deterministic** even at temperature 0 (sampling, tool-result ordering, model
drift across versions). Don't build flows that assume reproducible trajectories; assert on
*outcomes and invariants*, pin model versions, and make tools idempotent so retries are safe.

---

## Evaluation

"Looks good" is not a result. Evaluate agents on the **trajectory** *and* the **outcome**.

| Dimension | What it measures | How |
|---|---|---|
| **Task success rate** | Did the run achieve the goal end-to-end | Reference outputs, assertions, or LLM-judge on final state |
| **Tool-call correctness** | Right tool, right args, right order | Deterministic checks (exact name/params) — no LLM needed |
| **Trajectory quality** | Reasoning, tool *choice*, planning, no wasted steps | LLM-as-judge over the step sequence |
| **Cost & latency** | Tokens, $, wall-clock per task | Aggregate from traces; budget regressions are failures |
| **Reliability** | Cap-hits, error rate, loop incidents | Counters from traces |

Use **deterministic evaluators** wherever the answer is checkable (tool names, required params,
expected side effects); reserve **LLM-as-judge** for fuzzy dimensions (helpfulness, reasoning,
task completion). When using a judge: pin the judge prompt + model as versioned artifacts,
calibrate against human labels, prefer pairwise comparison over absolute scores, and watch for
self-preference/length bias. Maintain a **regression harness** — a golden set of tasks run in CI
on every prompt/tool/model change, tracking success rate, cost, and latency against a baseline.

---

## Anti-Patterns

| Anti-pattern | Why it bites | Do instead |
|---|---|---|
| **Multi-agent when one agent suffices** | Multiplies cost, latency, failure surface; context lost across hops | Start single-agent; split only on real parallelism/isolation need |
| **Unbounded loops** | No cap → runs until budget hits zero | Hard step/cost/time caps + no-progress detector |
| **No token/cost budget** | Silent spend explosions in prod | Per-step and per-run budgets, enforced in code |
| **Vague tool schemas** | Model mis-calls or can't disambiguate | Sharp descriptions (when / when-not), enums, required fields |
| **Tool errors that crash the loop** | Agent can't recover from a recoverable failure | Return structured, actionable errors as observations |
| **Hidden global state across agents** | Non-reproducible bugs, race conditions | Explicit shared-state schema; default to isolated context |
| **Orchestration logic in business code** | Routing/caps/retries tangled into domain logic | Keep the control loop a separable layer; domain code stays a callee |
| **Full-transcript handoffs** | Budget blowout, leaked irrelevant context | Pass the minimum slice the receiver needs |
| **Trusting model output unchecked** | Prompt-injection, exfil, bad side effects | Input+output guardrails, allowlists, HITL on destructive acts |
| **"Looks good" shipping** | No baseline, silent regressions | Golden-set regression harness in CI; measure success/cost/latency |
| **Reflection/voting everywhere** | Doubles+ cost for marginal gain | Gate self-critique/voting to tasks where it measurably helps |
| **Non-idempotent state-changing tools** | Retries double-charge / double-create | Idempotency keys; deterministic results per key |
