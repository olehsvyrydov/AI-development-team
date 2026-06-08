# Conditional, Looping, Event-Driven Workflow — Architecture Investigation

**Author:** Jorge (Solution Architect, `/arch`)
**Type:** Architecture investigation — no implementation, no gate decision.
**Scope:** Turn DART's proportional *gate* workflow into a **conditional, looping, event-driven** engine driven by a `when → do` rule model, with **parallel stages**, and integrate it cleanly with a host "main tool" (Claude Code / Kiro) that already has its own commands/skills/hooks/plugins.
**Philosophy:** *Architecture is about trade-offs, not silver bullets.* DART **records intent**; the main tool **executes**. We extend the existing file/overlay/comment/hook channel rather than inventing a parallel runtime.

---

## 0. Grounding — what already exists (the substrate we build on)

The current system is **already** an event/intent-recording substrate. The new engine is mostly a *grammar + a dispatcher* over it, not a new platform.

| Existing piece | File | What it gives the new engine |
|---|---|---|
| Proportional gate model | `claude/workflow/workflow.yaml` | gates with `owner` / `refusal` / `safety_override` / `trigger`; `tracks` (ordered stages); `presets` | 
| Workflow projection (overlay-aware) | `hub/lib/state.js` | one parser that merges base YAML + machine overlay; resolves preset, gates, tracks, stage→owner |
| Machine-owned overlay | `.aidevteam/workflow.overrides.json` (via `hub/lib/write.js`) | the **only** machine-written workflow file; base YAML is never machine-written |
| Ledger (gate state) | `.workflow-state.json` (CAS in `write.js`) | per-ticket `stage`, `assignee`, `active` heartbeat, `gates{state,by,at,note}` |
| Comment log | `.aidevteam/comments/<id>.jsonl` (`comments.js`/`write.js`) | append-only, **typed** records: `kind ∈ {comment, advance, assign, gate}`, with `gate`/`state` fields |
| Control-plane routes | `hub/lib/api.js` | `gate/set`, `ticket/advance`, `ticket/assign`, `ticket/active`, `ticket/comment`, `track/set-stages`, … — every mutation already emits the same typed comment a CLI agent would |
| Live channel | `hub/lib/channels.js` | per-project `fs.watch` → debounced SSE push; already watches ledger/overlay/comments/tickets |
| Stage↔gate↔owner map | `hub/lib/stage-map.js` | bridges track stage tokens to gate names and owners |
| Digest projection | `hub/lib/digest.js` | the text/JSON the board AND the hook both render |
| **DART→main-tool channel** | `claude/memory/src/hooks/restore-context.ts` | **SessionStart hook** shells `digest.js --text` and injects the workflow state into the main-tool session; `PreCompact` saves |
| Hook wiring | `claude/memory/src/install/settings.ts` | idempotent upsert into `hooks.SessionStart` / `hooks.PreCompact`; schema confirmed |

**The single most important existing fact:** the SessionStart hook is *already* the unidirectional DART→main-tool bridge. The new engine extends this from "inject a state digest" to "inject the **actions that fired rules** (the `do:` directives)". Nothing about the transport is novel.

---

## 1. The `when → do` rule model

### 1.1 Where rules live (decision)

Rules are a **new top-level section in the same workflow document** that `state.js` already parses, with the machine-editable copy in the existing overlay:

- **Hand-authored** base: `rules:` block in `claude/workflow/workflow.yaml` (and the project/user overrides of it). This keeps rules diffable, reviewable, and co-located with the gates/tracks they reference.
- **Machine-authored** edits (from the DART builder UI): `.aidevteam/workflow.overrides.json` under a `rules` key, deep-merged by `applyOverlay()` exactly like `gates`/`tracks`/`stageOwners` today.

**Rejected alternative — a separate `rules.yaml`:** it would fork resolution order, the overlay merge, the `fileRev` CAS inputs, and the `channels.js` watch set. Reuse beats a second file. Rules belong to the workflow definition; they reference its gates/stages/owners and must version with it.

> **Guardrail (ATAM maintainability sensitivity point):** rules and gates share one resolution path, one overlay, one `rev`. A second rules store would be a maintenance island and a CAS hazard (two files, two revs, torn writes). One document, one merge.

### 1.2 The grammar

A rule is `when → do (+ chain)`. Concretely (illustrative shape, not a schema):

```yaml
rules:
  - id: rev-rejects-backend            # stable id (for the ledger trace + dedupe)
    when:                              # ALL listed conditions must hold (AND); use separate rules for OR
      event: gate.rejected             # see the event enum below
      gate: CODE_REVIEWED
      label: TO_DEV_BE                  # a user-defined label present on the ticket/comment
      pattern: "(?i)backend"           # regex matched against the triggering comment body
      stage: code_review               # stage the ticket is in / entered / left
    do:
      - set_label: IN_DEV               # mutate ledger labels (the published contract governs which)
      - route_to_stage: implement       # move the ticket's stage (ledger advance)
      - target: ["/be"]                 # address the prompt to specific agent(s)
        prompt: "Address the review findings labelled TO_DEV_BE, then re-request review."
    then:                              # OPTIONAL chained rule(s): run only if THIS rule fired
      - when: { label: SECURITY_TOUCHED }
        do: [{ set_label: NEEDS_SECOPS }, { route_to_stage: security }]
```

#### `when:` clause — the condition types

The condition vocabulary is **closed and small** (this is the IntelliJ-breakpoint analogy: a handful of composable predicates):

| Predicate | Meaning | Source in existing data |
|---|---|---|
| `label: X` | ticket currently carries user-defined label `X` | a new `labels: []` array on the ledger ticket (see §1.4) |
| `pattern: <regex>` | regex matches the **triggering comment body** | `comments.js` record `body` |
| `pattern_in: <field>` | restrict the regex to `body` / ticket `title` / `description` | `state.js` ticket fields |
| `event: <type>` | a lifecycle event of the given type just occurred | **enumerated below** |
| `gate: G` / `state: passed\|rejected\|pending` | qualifies an `event: gate.*` to a specific gate/outcome | `gate/set` route + ledger `gates` |
| `stage: S` | qualifies a `stage.*` event, or asserts the ticket's current stage | ledger `stage` |
| `author: /agent` | the actor that produced the triggering event | comment `author`, gate `by` |
| `track: T` / `preset: P` | scopes a rule to a track or preset | parsed workflow |

**The event enumeration** (derived entirely from the existing comment `kind`s, the `api.js` routes, and the track lifecycle — no new instrumentation needed to *emit* them):

| Event type | Fired when (existing trigger) | Carries |
|---|---|---|
| `comment.added` | a `kind:"comment"` record is appended | `author`, `body` |
| `gate.passed` / `gate.rejected` / `gate.pending` | `gate/set` writes a gate state (typed `kind:"gate"` comment) | `gate`, `state`, `by`, `note` |
| `stage.entered` / `stage.left` | `ticket/advance` changes `stage` (typed `kind:"advance"` comment) | `from`, `to`, `by` |
| `assignee.changed` | `ticket/assign` (typed `kind:"assign"`) | `assignee`, `by` |
| `label.set` / `label.cleared` | a new label mutation (new typed `kind:"label"` comment — §1.4) | `label`, `by` |
| `ticket.created` | first ledger entry / markdown ticket appears | `id`, `title` |
| `heartbeat.stale` | `active.heartbeat` older than ~90s (already computed in `state.js`) | `agent` |

> Every event type maps 1:1 to a mutation that **already** lands in the ledger or the JSONL comment log. The engine does not need a message bus — **the append-only comment log + the ledger ARE the event stream**, and `channels.js` already watches them. This is the key reuse insight.

#### `do:` clause — the action types

| Action | Effect | Executed by | Existing mechanism |
|---|---|---|---|
| `set_label: X` / `clear_label: X` | mutate ticket labels (contract-checked) | DART (intent) | new `label/set` route, atop the ledger CAS in `write.js` |
| `route_to_stage: S` | set ticket `stage = S` | DART (intent) | existing `ticket/advance` |
| `assign: /agent` | set `assignee` | DART (intent) | existing `ticket/assign` |
| `target: [/agent…] + prompt:` | a directive addressed to specific agent(s) | **main tool** (action) | new typed `kind:"directive"` comment + `@mention`; surfaced by the hook |
| `prompt:` (no target) | instruction injected at the ticket's current stage | **main tool** (action) | same, addressed to the stage owner |
| `require_gate: G` | force gate `G` into the ticket's required set (a conditional gate) | DART (intent) | overlay-style `gates` patch scoped to the ticket |

**The intent/action split is the load-bearing boundary:** `set_label`, `route_to_stage`, `assign`, `require_gate` are **state mutations DART performs directly** (they are just ledger/overlay writes — DART owns the ledger). `target+prompt` is **work**, which DART records as a directive comment and the main tool executes. This preserves the project axiom "DART records intent; the main tool acts," while still letting routing/looping happen deterministically in DART without waiting on the LLM.

### 1.3 How loops and conditional routing reduce to these rules

The user's assertion holds: **routing and loops are `set_label`/`route_to_stage` actions triggered by `event`/`label` conditions.** There is no separate loop construct — a loop is simply *a rule whose `do:` routes the ticket to an earlier stage, plus the natural re-firing of stage/gate events when that stage runs again.*

**The canonical loop-back (the user's TO_DEV_BE / TO_DEV_FE example):**

```yaml
rules:
  # /rev rejects → /rev sets ONE of the user-defined routing labels (allowed by the contract)
  - id: route-rejection-to-backend
    when: { event: gate.rejected, gate: CODE_REVIEWED, label: TO_DEV_BE }
    do:
      - route_to_stage: implement
      - target: ["/be"]
        prompt: "Code review rejected with label TO_DEV_BE. Fix the findings in the latest review comment, then set stage back to code_review."
      - clear_label: TO_DEV_BE          # consume the label so the loop is not re-armed

  - id: route-rejection-to-frontend
    when: { event: gate.rejected, gate: CODE_REVIEWED, label: TO_DEV_FE }
    do:
      - route_to_stage: implement
      - target: ["/fe"]
        prompt: "Code review rejected with label TO_DEV_FE. Fix the findings, then set stage back to code_review."
      - clear_label: TO_DEV_FE
```

The **loop** is: `code_review` → (reject + label) → `implement` → (re-implement) → `code_review` → … until `gate.passed`. It terminates naturally when `/rev` passes the gate (no rule fires to route backward) **and** by the `clear_label` consumption (the routing label is one-shot; the dev must re-set a fresh label to loop again). Termination is a design responsibility of the rule author, surfaced as a risk in §4.

> **Termination guardrail:** the engine SHOULD also enforce a **per-ticket loop budget** (e.g. max N traversals of the same `stage.entered` within one ticket, counted from the comment log) and, on exceedance, fire a built-in `loop.exceeded` event → default `do: set_label NEEDS_HUMAN`. This converts an infinite agent loop into a "needs you" item — which the board (`state.js` `needsHumanDecision`) already renders.

**Worked examples (3 more):**

```yaml
# (2) pattern-in-comment → notify an agent (no routing, just a directed prompt)
- id: ping-secops-on-secret
  when: { event: comment.added, pattern: "(?i)(api[_-]?key|secret|token|password)" }
  do:
    - target: ["/secops"]
      prompt: "A comment mentions a possible secret. Review for exposure before this advances."
    - set_label: SECURITY_TOUCHED

# (3) event → trigger a downstream stage (a gate passing opens the next stage)
- id: open-qa-after-review
  when: { event: gate.passed, gate: CODE_REVIEWED }
  do:
    - route_to_stage: qa
    - target: ["/qa", "/e2e"]        # parallel fan-out — see §2.3
      prompt: "Code review passed. Design and automate the acceptance tests."

# (4) conditional gate injection (a label makes a normally-optional gate required)
- id: force-secops-when-touched
  when: { label: SECURITY_TOUCHED, stage: code_review }
  do:
    - require_gate: SECOPS_APPROVED   # SECOPS becomes a hard precondition for this ticket
    - target: ["/secops"]
      prompt: "This ticket is security-touched; run a focused security review."
```

### 1.4 The label contract (who may set which labels)

Labels are **user-defined, first-class ledger data** and the steering wheel of routing. The contract is **published declaratively in the workflow document** and enforced at the `label/set` route:

```yaml
labels:
  TO_DEV_BE:        { settable_by: ["/rev"],            desc: "route a rejection back to backend dev" }
  TO_DEV_FE:        { settable_by: ["/rev"],            desc: "route a rejection back to frontend dev" }
  SECURITY_TOUCHED: { settable_by: ["/rev","/be","/fe"], desc: "this change touches security-sensitive code" }
  NEEDS_HUMAN:      { settable_by: ["*"],               desc: "park for a human decision" }
  IN_DEV:           { settable_by: ["/sm","*"],         desc: "currently in development" }
```

- **Storage:** a `labels: []` array on each ledger ticket (parsed by `state.js` alongside `gates`), plus `label.set`/`label.cleared` typed comments for the audit trail (so the *event* is in the same stream as gates/advances).
- **Enforcement:** the new `label/set` route checks `settable_by` against the caller's `by`/`author`. A disallowed set is **rejected (400)** with a terse reason — same shape as `api.js` today. `"*"` means any agent.
- **Publication to agents (the "agents must KNOW their labels" requirement):** the **Gate Check block** each agent skill already embeds (see `workflow-engine/references/gate-check.md`) gains a **"Labels you may set"** line, and the **SessionStart digest** lists, per active ticket, *the labels this stage's owner is permitted to set and what they route to*. So an agent learns its label vocabulary from (a) its own skill contract and (b) the live injected digest — both already in the design.

> **Contract guardrail (cross-component reproducibility — a Jorge stack guardrail):** the label vocabulary is a **contract derived in two places** (the agent's skill text *and* the enforcement route). Make the YAML `labels:` block the **single source of truth**; the digest renders the agent-facing copy from it, and the route enforces from it. Never let the skill text and the enforcement list drift — divergence silently breaks routing with no error (the dev sets a label the engine ignores). A parity check (digest's published set == route's allowed set) belongs in the engine's tests.

---

## 2. Execution semantics

### 2.1 Who evaluates rules (decision: **DART/the hub evaluates; the main tool executes prompts**)

Two candidate evaluators; we use **both, with a clean split**:

- **The hub/Core sidecar is the rule engine.** It already watches the ledger + comment log (`channels.js`) and owns all mutations (`write.js`/`api.js`). When a mutation lands (a gate set, a comment, a stage advance, a label set), the engine **evaluates the rules whose `when` could match that event**, performs the **state-mutating `do:` actions itself** (label/route/assign/require_gate — these are deterministic ledger/overlay writes), and **appends `directive` comments** for the `target+prompt` actions. This is deterministic, testable without an LLM, and keeps routing instant.
- **The main tool (Claude Code / Kiro) executes the prompts.** The SessionStart/notification channel surfaces the pending `directive` comments (and their `@mentions`); the LLM session picks them up and runs the addressed `/agent` with the given prompt, then writes results back (a new comment / gate set), which produces the **next** event, which the engine evaluates again. The loop closes.

> **Why not evaluate rules inside the LLM session?** Determinism and safety. Routing/looping/label-contract enforcement must be reproducible and gate-respecting even if the model is unavailable, mid-compaction, or hallucinating. Conditions are a closed grammar — a 200-line evaluator, not a prompt. The model's job is the *creative* part (doing the work the prompt asks), not deciding control flow. This is the AOP-style separation Jorge insists on: **control-flow routing is cross-cutting plumbing (engine); the work is domain logic (agent)** — never bury the routing decision inside the agent prompt where it is invisible at the call site.

### 2.2 When rules fire (the event tick)

The engine is **edge-triggered off file events**, reusing `channels.js`:

1. A mutation (CLI agent or hub UI) writes the ledger/overlay/comment via `write.js` (CAS-guarded).
2. `fs.watch` (debounced 150ms) fires → the engine recomputes the projection (`buildState`) **and** diffs the new comment-log tail to derive the **event(s)** that just occurred.
3. For each derived event, the engine selects matching rules (indexed by `event`+`gate`+`stage` for cheap pruning), evaluates the full `when` (AND of predicates), and for matches runs `do:` (mutations now; directives appended).
4. Mutations are **idempotent + dedup-guarded** by rule `id` + triggering event id, recorded in a per-ticket `fired: [{rule, event, at}]` trace on the ledger — so a debounce double-fire or a re-watch never double-routes. (This is the analogue of exactly-once processing; we get effectively-once via the dedupe key, which is sufficient here.)
5. Chained `then:` rules evaluate **only in the same tick, only if the parent fired** — bounded chain depth (e.g. 8) to prevent same-tick runaway.

> **Concurrency:** all mutations go through the existing in-process mutex + CAS in `write.js`, so rule-driven writes never clobber a concurrent agent edit (they get `{conflict:true}` and retry on the next projection). No new locking model.

### 2.3 Parallel-stage execution

A stage may be owned by **several agents at once**. Model it declaratively on the track stage:

```yaml
# in tracks/stages (overlay-friendly, via the existing track/set-stages route extended)
- name: quality
  owners: ["/qa", "/e2e"]      # plural → parallel fan-out
  join: all                    # all | any | quorum:N  — when is the stage "done"?
```

- **Fan-out:** a `route_to_stage: quality` (or a rule `target: ["/qa","/e2e"]`) appends **one directive per owner**, each addressed (`@/qa`, `@/e2e`). The main tool may run them concurrently (separate subagent invocations) or, **if parallel isn't possible, in any/random order** — the engine does not impose an order, satisfying requirement #2.
- **Join / barrier:** the stage advances only when the `join` predicate is satisfied — `all` (every owner posted its completion gate/comment), `any` (first wins), or `quorum:N`. The engine watches the comment/gate events from each owner and fires a synthetic `stage.joined` event when the barrier clears, which a downstream rule routes on.
- **State:** `state.js` already carries a single `assignee` + an `active` heartbeat. Extend the ledger ticket with `owners: []` and per-owner `progress` (which owners have completed), derived from the comment log. The board (`stage-map.js` / `projectWorkflowView`) renders multiple owner chips per stage. **This is additive — single-owner stages keep `assignee` and behave exactly as today.**

> **Trade-off (ATAM):** true OS-level parallelism depends on the main tool's subagent concurrency (Claude Code can run subagents; ordering across them is not guaranteed). DART therefore specifies *fan-out + a join barrier* and treats execution order as **unspecified** — which is exactly the "parallel, else any order" the requirement asks for. DART never blocks on parallelism it cannot guarantee.

---

## 3. Integration & precedence (the critical part)

**Problem restated:** DART runs alongside a main tool that already has `~/.claude` with the user's own commands/skills/hooks/plugins. DART's team + workflow + rules must **override/overlap conditionally** without clobbering the user's defaults, and the two must "listen to each other." DART **does not execute agents** in this phase — it records intent; the main tool acts.

### 3.1 Decision: **ship DART as a Claude Code PLUGIN** (and keep the `~/.claude` install as a fallback)

The plugin model — confirmed against current Claude Code docs (June 2026) — is purpose-built for exactly this overlap problem:

| Plugin capability | How DART uses it | Why it solves the conflict |
|---|---|---|
| **`.claude-plugin/plugin.json`** + bundled `skills/`, `commands/`, `agents/`, `hooks/`, `.mcp.json`, `monitors/`, `settings.json` | one installable `dart` plugin carrying the 15-agent team, the workflow-engine skill, the hooks, and an MCP server | the whole team ships and versions as **one unit**, install/uninstall is atomic |
| **Namespacing** (`/dart:arch`, `/dart:rev`) | every DART skill/command is auto-prefixed `dart:` | **cannot clobber** the user's existing `/arch`, `/rev`, `/deploy`, etc. The user keeps short names; DART takes the `dart:` namespace |
| **Settings precedence: enterprise > user > project > plugin** | DART is a **plugin layer** = *lowest* precedence | DART **augments, never overrides** the user's own user/project config. The user's hooks/commands always win on a name collision — no surprise hijack |
| **Per-project enablement** (project marketplace ref / `enabledPlugins` in project `.claude/settings.json`) | a repo opts into DART by referencing the marketplace + enabling the plugin in its **project** settings | DART is **conditional/opt-in per project**: enable it in a DART-managed repo, absent everywhere else. Exactly the "conditional overlap" requirement |
| **Plugin `hooks/hooks.json`** (SessionStart/PreToolUse/PostToolUse) | DART's SessionStart digest + the new directive-surfacing hook ship inside the plugin | the bidirectional channel is part of the plugin, not a manual `settings.ts` edit into the user's file — **no mutation of the user's `~/.claude/settings.json`** |
| **`monitors/monitors.json`** (background watchers → notifications to the session) | a DART monitor tails the comment-log / `directive` events and pushes them as live notifications | **real-time DART→main-tool push** without a custom transport: when a rule fires a directive, the running session is *notified mid-conversation* — not only at SessionStart |
| **MCP server in the plugin (`.mcp.json`)** | the DART Core sidecar (superset of the hub) exposed as MCP tools: `dart.gate_set`, `dart.advance`, `dart.set_label`, `dart.read_state`, `dart.pending_directives` | the main tool **writes back** to DART through typed MCP tools (action → intent), closing the loop with a real, namespaced API instead of the LLM hand-editing JSON |

**Net precedence story:** *the user's own config is sovereign; DART sits underneath as an opt-in plugin layer and only "overrides" the workflow by being the thing the user's project chose to enable.* DART never edits the user's files; it contributes namespaced components and a low-precedence settings layer. Where DART genuinely must take over the main thread (the "DART's team should drive" case), the plugin's `settings.json` `agent` key can activate a DART orchestrator agent **only when the plugin is enabled** — still opt-in, still reversible by disabling the plugin.

> **Why not keep only the `~/.claude` copy install (`install.sh`)?** The current installer *merges into the user's `~/.claude`* — that is exactly the clobber risk the user worries about (it can collide with their `/arch`, their hooks). It also has no namespacing and no per-project conditionality. **Recommendation: the plugin becomes the primary distribution; `install.sh --user` remains for users who want the team globally and un-namespaced (power users), but the default DART experience is the plugin.** The two are not mutually exclusive — the plugin can be the packaging of the same `claude/skills` + `claude/workflow` + hooks already in this repo (the docs even describe the conversion path: `.claude/` → plugin is a copy + a `hooks.json`).

### 3.2 The bidirectional channel (concrete)

```
        ┌────────────────────── DART (records intent) ──────────────────────┐
        │  Core sidecar / hub                                                │
        │  • ledger (.workflow-state.json)  • overlay (workflow.overrides)   │
        │  • comment log (.jsonl, typed)    • RULES engine (§2)             │
        └───────────────▲───────────────────────────────┬──────────────────┘
   write-back (MCP tools)│                               │ surface intent
   dart.gate_set/advance │                               │ (SessionStart digest +
   set_label/comment     │                               │  monitor notifications:
                         │                               │  pending `directive`s & @mentions)
        ┌────────────────┴───────────────────────────────▼──────────────────┐
        │  Main tool (Claude Code / Kiro) — EXECUTES                         │
        │  • runs /dart:rev, /dart:be… per the injected directives          │
        │  • posts results back via the DART MCP tools → new events          │
        └───────────────────────────────────────────────────────────────────┘
                      └───────────── loop closes (event → rule → directive) ─┘
```

- **DART → main tool:** (1) **SessionStart** injects the digest *plus the pending directives* (already the hook's job, extended). (2) **Monitor** pushes new directives *mid-session* as notifications. Both are native plugin mechanisms — no bespoke IPC.
- **Main tool → DART:** the LLM calls the DART **MCP tools** to set gates/labels/stage/comments. Each call lands as a CAS-guarded `write.js` mutation → emits a typed comment → produces the next event → the rule engine ticks. The same routes `api.js` already exposes over HTTP are re-exposed as MCP tools (one thin adapter).
- **@mentions / comments pickup:** the user's idea — "the main tool picks up DART's comments/@mentions" — is literally the `directive` comment's `target: [/agent]` rendered as `@/agent` in the injected digest. The agent skill's Gate Check tells it to act on directives addressed to it.

### 3.3 Portability to Kiro

Kiro's extension model differs (steering files + agent hooks rather than Claude's plugin/skill/MCP triad), but the DART design is **transport-agnostic by construction** because the contract is files:

- **The intent layer is plain files** (ledger JSON, overlay JSON, JSONL comments, the `rules`/`labels` YAML). Any host that can read those files can surface them.
- **Kiro steering** = the analogue of the SessionStart digest: a generated steering doc (`.kiro/steering/dart-workflow.md`) rendered from the same `digest.js` projection, refreshed by a **Kiro agent hook** on file-save of the ledger/comments. Same projection, different injection point.
- **Kiro agent hooks** (event→action) play the role of the monitor: watch the comment log, surface new directives.
- **Write-back** uses the same Core sidecar — exposed over MCP (Kiro speaks MCP) or the existing hub HTTP routes.

> **Portability guardrail:** keep **all** DART semantics in the file contract + the Core sidecar; keep **zero** semantics in any host-specific glue. The plugin's hooks/monitors and Kiro's steering/hooks are *thin renderers + thin write-back adapters* over one engine. This is the Anti-Corruption Layer: the host integration is a boundary adapter, never the brain.

---

## 4. Risks, open questions, ATAM-style trade-offs, and a phased path

### 4.1 Risks & trade-off points

| # | Risk / trade-off | Mitigation |
|---|---|---|
| R1 | **Infinite loops** (a rule routes back forever; two rules ping-pong). | Per-ticket **loop budget** + `loop.exceeded → NEEDS_HUMAN` (§1.3); one-shot routing labels via `clear_label`; max chain depth per tick. |
| R2 | **Non-determinism of LLM execution** vs deterministic routing — the model may not honor a directive, stalling the loop. | Engine is deterministic; **stall detection** via `heartbeat.stale` event + a watchdog rule → re-surface or `NEEDS_HUMAN`. The directive stays pending (idempotent) until acted on. |
| R3 | **Label contract drift** (skill text vs enforcement list). | Single YAML source of truth; digest + route both render from it; **parity test** (§1.4). |
| R4 | **Rule/condition complexity creep** — users build an unreadable rule web. | Keep the predicate set closed and small; provide the visual builder (DECISIONS.md D-B) so rules are authored/visualized, not hand-written; lint for unreachable/never-terminating rules. |
| R5 | **Comment log as event stream** — append-only JSONL, concurrent appends can interleave > PIPE_BUF (noted already in `write.js`). | Acceptable for single-dev (documented); for multi-writer, move to `flock` or a small append broker. The dedupe key (rule id + event id) tolerates a replayed tail. |
| R6 | **Plugin precedence surprises** — managed/enterprise settings can force-enable/disable a plugin; `--plugin-dir` can't override those. | DART defaults to *opt-in per project*; document the enterprise interaction; never rely on overriding a force-disabled state. |
| R7 | **Parallel join correctness** — a `join: all` barrier waits on an owner that never reports. | Per-owner timeout → `join` degrades to `quorum`/`any` with a `NEEDS_HUMAN` flag; surfaced on the board. |
| R8 | **Two evaluators divergence** — if both the engine and the LLM try to route. | Hard rule: **only the engine routes** (mutating `do:`); the LLM only executes prompts and writes results. Enforced by exposing *no* routing MCP tool that bypasses the rule trace. |

### 4.2 Open questions (for `/po`, `/secops`, `/sm`)

1. **Rule authority:** can a *project* override a *user/base* rule, or only add to it? (Proposes: overlay merge = project adds + overrides by `id`, mirroring gates today — confirm with `/po`.)
2. **Who may author rules** that grant agents new powers (a rule that lets `/be` set `NEEDS_SECOPS`)? Is rule-editing itself a gated action? **`/secops` should weigh in** — rules can route *around* a hard gate if authored carelessly; the engine MUST forbid a rule whose `do:` clears or skips a `safety_override` gate.
3. **Directive trust boundary:** directives are prompts the main tool executes. In remote-execution mode (DECISIONS.md D-C), a malicious rule = prompt injection into an executor. **`/secops` gate** on the rule-authoring + remote path.
4. **Label cardinality:** are labels free-form per project, or a closed enum per workflow? (Proposes: closed enum declared in `labels:` — required for the `settable_by` contract to mean anything.)
5. **Kiro priority:** is Kiro a v1 target or a portability proof? (Affects how much we invest in the steering renderer now.)

### 4.3 Recommended phased path

**Phase 0 — buildable NOW on the existing file/hook model (no plugin needed):**
- Add `rules:` + `labels:` to `workflow.yaml` + overlay; extend `state.js` parser (it already parses gates/tracks/presets the same way) and `applyOverlay`.
- Add `label/set` route + a `labels:[]` ledger field + `kind:"label"` comments (mirrors `gate/set` exactly).
- Build the **rule engine** in the hub/Core as a watcher over `channels.js`: derive events from the comment-log tail, evaluate `when`, perform mutating `do:` via `write.js`, append `directive` comments. Dedupe via `fired:[]` trace + loop budget.
- Extend the **SessionStart digest** (`digest.js`/`restore-context.ts`) to render pending `directive`s + the active stage's permitted labels.
- **This delivers conditional routing + loops end-to-end with the current `~/.claude` install** — the LLM reads directives from the digest and acts; write-back is the existing hub HTTP routes (or the agent editing the ledger). No new packaging.

**Phase 1 — the plugin (the real integration win):**
- Package `claude/skills` + `claude/workflow` + the hooks as a `dart` **plugin** (`.claude-plugin/plugin.json`, `skills/`, `hooks/hooks.json`, `.mcp.json`, `monitors/monitors.json`).
- Expose the Core sidecar as an **MCP server** (`dart.*` tools) — the typed write-back path replacing ad-hoc ledger edits.
- Add the **monitor** for mid-session directive push (real event-driven feel, not just SessionStart).
- Namespaced `/dart:*` agents; per-project opt-in via project settings. **This is what makes "override/overlap without conflict" real.**

**Phase 2 — parallel stages + portability:**
- `owners:[]` + `join:` on stages; per-owner progress + the join barrier; multi-owner board chips.
- Kiro steering renderer + agent-hook adapter over the same projection.
- Visual rule builder (DECISIONS.md D-B) authoring the `rules:`/`labels:` overlay.

> **The phasing principle:** routing/loops/labels are **buildable today** on files + the existing hook (Phase 0) — prove the engine before packaging. The **plugin (Phase 1) is what the integration requirement actually needs**; it is the only thing that delivers namespaced, opt-in, non-clobbering overlap with a real bidirectional (MCP + monitor) channel. Parallelism and Kiro (Phase 2) are additive and never block Phases 0–1.

---

## 5. Summary of decisions

1. **Rules live in the workflow document** (`workflow.yaml` `rules:`/`labels:` + the machine overlay) — one parser, one overlay, one `rev`. No separate rules file.
2. **`when` is a small closed predicate set** (`label`/`pattern`/`event`+`gate`/`stage`/`author`); **events are exactly the existing typed comment-log/ledger mutations** — the append-only comment log IS the event stream.
3. **`do` splits into engine-mutations** (`set_label`/`route_to_stage`/`assign`/`require_gate` — DART writes the ledger) **and directives** (`target+prompt` — the main tool executes). **Loops/routing = `route_to_stage` rules triggered by `event`/`label`**; termination via one-shot labels + a loop budget → `NEEDS_HUMAN`.
4. **The hub/Core sidecar is the deterministic rule engine** (edge-triggered off `fs.watch`/`channels.js`, CAS-guarded, dedup-traced); **the main tool executes the prompts.** Routing never lives inside the LLM.
5. **Parallel stages = `owners:[]` + a `join:` barrier**; execution order across owners is unspecified ("parallel, else any order").
6. **Ship DART as a Claude Code plugin** (namespaced `/dart:*`, opt-in per project, plugin-precedence = augments-not-overrides, hooks+monitor+MCP inside the plugin). The `~/.claude` install stays as a power-user fallback. **This is the answer to "override/overlap without conflict."**
7. **Everything stays file-first** so Kiro (steering + agent hooks) is a thin renderer/adapter over the same engine — portability by construction.

---

### Sources
- [Claude Code — Create plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code Features & Settings Reference 2026](https://hidekazu-konishi.com/entry/claude_code_features_settings_reference_2026.html)
- [anthropics/claude-code — plugins/README](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)
