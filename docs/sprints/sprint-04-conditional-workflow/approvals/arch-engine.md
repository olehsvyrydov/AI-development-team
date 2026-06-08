# Architecture Decision — Conditional Workflow Engine (Phase 0)

**Author:** Jorge (Solution Architect, `/arch`) · **Gate:** `ARCH_APPROVED`
**Tickets:** ADT-227 (rules+labels engine, Core) · ADT-228 (drag-to-reorder builder) · ADT-229 (when→do rule editor)
**Sprint:** sprint-04-conditional-workflow · **Branch:** feat/dart-interactive
**Decision date:** 2026-06-08
**Status:** **ARCH_APPROVED — passed (all three), conditional.** ADT-227 carries a HARD `SECOPS_APPROVED` gate that must pass before implementation.
**Philosophy:** *Architecture is about trade-offs, not silver bullets.* DART **records intent**; the host tool **executes**. We extend the existing file/overlay/comment/CAS substrate — no new runtime, no new dependency, no new persistence model.

This ADR makes the prior investigation (`docs/product-vision/conditional-workflow/architecture-jorge.md`) **buildable and gate-ready**: exact schemas, exact write paths, exact projection fields, exact placement of the safety invariants, all named against the real code in `hub/lib/{state,write,api,comments,channels,stage-map,guard}.js`.

---

## 0. Context, constraints, NFRs

### What binds this design (the substrate, verified in source)
- **One workflow projection** (`state.js buildState`) merges base `workflow.yaml` + the machine overlay (`.aidevteam/workflow.overrides.json` via `applyOverlay`). It already parses `gates`/`tracks`/`presets` with a line-oriented parser and resolves `stageOwners`, `expectedOwner`, per-ticket `gates{state,by,at,note}`, and a `rev` for optimistic concurrency.
- **One writer** (`write.js`) — the *only* module that mutates project files. Ledger writes are CAS-guarded on `rev` under an in-process mutex (`readModifyWriteLedger`); overlay writes go through `writeOverlay` / `writeOverlayCAS`; `appendComment` writes the typed JSONL audit record. `deepMerge` already drops `__proto__`/`constructor`/`prototype`. **The base `workflow.yaml` is never machine-written.**
- **One typed event stream** — `appendComment` records `kind ∈ {comment, advance, assign, gate}` with optional `gate`/`state`, one JSONL line per `.aidevteam/comments/<id>.jsonl`. Every `api.js` mutation already emits the same typed comment a CLI agent would. **This append-only log + the ledger ARE the event stream.**
- **One live channel** (`channels.js`) — per-project `fs.watch` (debounced 150ms) over the ledger/overlay/comments/tickets, re-render + SSE push. It already watches `.aidevteam/comments`.
- **One guard** (`guard.js`) — `writeAllowed` (X-AIDT + loopback Host/Origin + loopback socket) on every mutating route; `streamAllowed` on SSE. No permissive CORS. Same-origin loopback by default.
- **Stage↔gate↔owner** (`stage-map.js`) — `stageGate(stage)` and `expectedOwner(stage, wf)` already resolve a stage to its governing gate and owner.

### NFRs for this engine
| Category | Requirement | How met |
|---|---|---|
| **Determinism** | Routing/looping reproducible without an LLM | Core evaluator is a closed-grammar function over the event stream; never the model. |
| **Safety (hard)** | A rule can NEVER bypass a `safety_override` gate or escalate labels | Validated at author-time AND evaluation-time; enforced in the one writer. SECOPS hard-gates ADT-227. |
| **Idempotency** | A replayed/debounced event must not double-act | `fired:[{rule,event}]` dedup trace per ticket; engine mutations are effectively-once. |
| **Termination** | No infinite agent loop | One-shot routing labels + per-ticket loop budget (default 3) → `NEEDS_HUMAN`, stop. |
| **Backward compatibility** | Existing tickets/overlays unaffected | `labels:[]`, `rules`, `fired` are additive optional fields; absent ⇒ today's behaviour exactly. |
| **No new deps / surface area** | Zero runtime deps; reuse CAS+guard+comments+channels | All new routes ride `writeOverlayCAS` / `readModifyWriteLedger` behind `writeAllowed`. |

---

# ADT-227 — Rules + labels engine (Core). **Decision: APPROVED (conditional on SECOPS HARD).**

## 1. Where rules + labels live and parse (D-404, D-402)

**Decision:** rules and labels are **two new top-level sections of the same workflow document** that `state.js` already parses, with machine edits in the **existing overlay** — *one parser, one overlay, one `rev`*. No separate `rules.yaml` (rejected: it forks resolution order, the overlay merge, the `fileRev` CAS inputs, and the `channels.js` watch set).

- **Base (hand-authored):** `rules:` and `labels:` blocks in `claude/workflow/workflow.yaml` (and its project/user overrides).
- **Machine (builder/editor edits):** `.aidevteam/workflow.overrides.json` under `rules` and `labels` keys, deep-merged by `applyOverlay`.
- **Parser:** because the base YAML rule/label shapes are richer than the current one-line-per-entry blocks, the **base `rules:`/`labels:` are authored in the inline-JSON-ish single-line-per-entry form the existing `section()`+regex parser can read** (the same constraint `gates:` already lives under), OR — preferred for richness — **rules/labels are read primarily from the overlay JSON** and the base YAML carries only a small default set in the parseable form. The builder/editor only ever writes the overlay. This keeps the parser a single additive function in `state.js` (`parseRules`, `parseLabels`) with no new YAML library and no second file.

### Merge semantics (ratifies jorge open item 1)
Overlay merge = **project adds + overrides by `id`**, mirroring `gates`/`tracks` today. `mergeGates` is the template: index base by name/id, overlay patch wins per key, union the set. Same for `labels` (by name) and `rules` (by `id`). Confirmed: a project may both add new rules/labels and override a base one by reusing its `id`/`name`.

## 2. The rule SCHEMA

A rule is a single object. `when` and the chain are optional; values are strings/enums/lists only (file-friendly).

```yaml
rules:
  - id: route-rejection-to-backend     # REQUIRED, stable — the dedup + ledger-trace key
    when:                              # OPTIONAL; absent ⇒ "when this stage runs". AND-of-predicates.
      event: gate.rejected             # one of the closed event enum (below)
      gate: CODE_REVIEWED              # qualifier for gate.* events
      label: TO_DEV_BE                 # ticket currently carries this label
      pattern: "(?i)backend"           # regex against the triggering comment body
      in: comment                      # pattern scope: comment(default) | title | description
      stage: code_review               # qualifies stage.* events / asserts current stage
      author: "/rev"                   # the actor that produced the triggering event
    if: "track == full"                # OPTIONAL extra boolean guard (closed mini-expr), AND-ed after when
    do:                                # REQUIRED, ordered
      - route_to_stage: implement      # engine-mutation
      - set_label: IN_DEV              # engine-mutation (contract-checked)
      - clear_label: TO_DEV_BE         # engine-mutation — one-shot loop guard
      - assign: "/be"                  # engine-mutation
      - instruct:                      # DIRECTIVE (recorded, host executes)
          target: ["/be"]
          prompt: "Fix the findings labelled TO_DEV_BE, then re-request review."
      - fan_out: [security, design]    # SCHEMA ONLY in Phase 0 (D-405): recorded + serial; no parallel exec
      - require_gate: SECOPS_APPROVED  # engine-mutation (conditional gate; never satisfies, only requires)
    then: [escalate-secops]            # OPTIONAL chain: rule ids to evaluate in the SAME tick iff this fired
    once: false                        # OPTIONAL (default false): fire at most once per ticket
```

**`when` predicate vocabulary (closed, small):** `label` · `pattern`(+`in`) · `event` · `gate` · `state` · `stage` · `author` · `track`/`preset`. Multiple keys in one `when` are AND-ed; OR = a second rule. This is the IntelliJ-breakpoint analogy — a handful of composable predicates, not a language.

**The event enum (derived 1:1 from existing typed comments + ledger mutations — no new emit instrumentation):**

| Event | Existing trigger (already emitted) | Carries |
|---|---|---|
| `comment.added` | `appendComment kind:"comment"` | author, body |
| `gate.passed` / `gate.rejected` / `gate.pending` | `gate/set` → `kind:"gate"` | gate, state, by, note |
| `stage.entered` / `stage.left` | `ticket/advance` → `kind:"advance"` | from, to, by |
| `assignee.changed` | `ticket/assign` → `kind:"assign"` | assignee, by |
| `label.set` / `label.cleared` | **new** `label/set` → `kind:"label"` | label, by |
| `ticket.created` | first ledger entry appears | id, title |
| `loop.exceeded` | **engine-internal** when the loop budget trips | rule, count |

**`do` action types and the intent/action split (D-408):**

| Action | Class | Applied by | Mechanism |
|---|---|---|---|
| `set_label` / `clear_label` | engine-mutation | DART | new `label/set` route → `readModifyWriteLedger` (contract-checked) |
| `route_to_stage` | engine-mutation | DART | existing `ticket/advance` ledger write |
| `assign` | engine-mutation | DART | existing `ticket/assign` ledger write |
| `require_gate` | engine-mutation | DART | overlay-style required-gate patch scoped to the ticket |
| `instruct{target,prompt}` | **directive** | **host tool** | new `kind:"directive"` comment; surfaced by the SessionStart digest |
| `fan_out` | schema-only (Phase 0) | DART (serial) | recorded; multi-agent parallel + join deferred (BL-04a) |

**The split is load-bearing:** `set_label`/`route_to_stage`/`assign`/`require_gate` are deterministic ledger/overlay writes DART performs itself; `instruct` is *work*, recorded as a directive comment for the host. DART does not run agents in Phase 0.

## 3. The `labels:` contract schema (D-402)

```yaml
labels:
  TO_DEV_BE:   { settable_by: ["/rev","/qa"], routes_to: implement, owner: "/be", meaning: "send back to backend dev" }
  TO_DEV_FE:   { settable_by: ["/rev","/qa"], routes_to: implement, owner: "/fe", meaning: "send back to frontend dev" }
  NEEDS_DESIGN:{ settable_by: ["/rev"],        routes_to: design,    owner: "/ui", meaning: "design rework" }
  NEEDS_HUMAN: { settable_by: ["*"],           meaning: "park for a human decision" }
```

- `name` (key) · `settable_by:[agents]` (`"*"` = any) · optional `routes_to` (stage) + `owner` · `meaning`.
- **Single source of truth:** the YAML `labels:` block. The `label/set` route enforces `settable_by`; the SessionStart digest renders the agent-facing "labels you may set" copy from the **same** block; the ADT-229 editor filters its Set-label picker from the same projection. **A parity test (digest's published set == route's allowed set == editor's offered set) is mandated** — drift would silently break routing with no error (the cross-component-contract guardrail).

## 4. The evaluator — WHERE and HOW it runs

**Decision: the Core/hub is the deterministic rule engine; the host tool executes prompts.** Routing/looping never lives inside the LLM (determinism + safety: it must hold even if the model is unavailable, mid-compaction, or hallucinating). This is the AOP separation — **control-flow routing is cross-cutting plumbing (engine); the work is domain logic (agent).**

**Edge-triggered tick (reuses `channels.js`):**
1. A mutation lands via `write.js` (CAS-guarded) — from a CLI agent or the hub.
2. `fs.watch` (debounced 150ms) fires. The engine recomputes `buildState` **and diffs the comment-log tail** to derive the event(s) that just occurred (the JSONL record `id` is the per-event identity).
3. For each derived event, the engine **selects candidate rules** (indexed by `event`+`gate`+`stage` for cheap pruning), evaluates the full `when` (AND) + optional `if`, and for matches runs `do:`.
4. **Engine-mutations are applied through the existing one writer** (`readModifyWriteLedger` for label/route/assign; `writeOverlayCAS` for `require_gate`), and `instruct` actions are appended as `kind:"directive"` comments.
5. **Dedup:** every fired rule is recorded in a per-ticket `fired:[{rule, event, at}]` trace on the ledger. Before acting, the engine checks `(rule id, triggering comment id)` against `fired` — a debounce double-fire or a re-watch never double-routes (effectively-once via the dedup key).
6. **Chained `then:` rules** evaluate only in the same tick, only if the parent fired, with a bounded chain depth (cap 8) to stop same-tick runaway.

**Concurrency:** all engine writes go through the existing mutex + CAS, so a rule-driven write that races a concurrent agent edit gets `{conflict:true}` and is retried on the next projection. **No new locking model.**

**Where the engine lives:** a new `hub/lib/engine.js` (`deriveEvents(prevTail, newTail)`, `selectRules(event, rules)`, `evaluate(rule, ticket, event)`, `apply(actions, ...)`), invoked from the channel's `onChange` after `buildState`, writing only through `write.js`. Pure-ish + unit-testable without HTTP or an LLM (drive it with crafted comment tails).

## 5. Loop safety (D-401)

- **One-shot routing labels:** a backward route consumes its routing label via `clear_label`, so the loop is not re-armed until a fresh label is set.
- **Loop budget = 3** backward traversals of the same `stage.entered` per ticket per loop, counted from the comment log / `fired` trace. On the 4th, the engine emits the internal `loop.exceeded` event whose built-in default `do:` is `set_label: NEEDS_HUMAN` **and stops routing**. The board already renders `needsHumanDecision` (a hard-gate-rejected OR waiting-on-owner-no-heartbeat ticket) — `NEEDS_HUMAN` surfaces there as a visible "needs you", never an infinite spin.
- Configurable per workflow later (BL-09); 3 is the Phase-0 default.

## 6. The safety invariant — what `/secops` MUST hard-verify (D-407)

**This is the reason ADT-227 carries a HARD, never-downsized `SECOPS_APPROVED` gate.** The engine MUST refuse, at BOTH author-time and evaluation-time:

1. **No routing around a `safety_override` gate.** A rule whose effect would clear, skip, set-passed, or advance a ticket **past** a gate with `safety_override: true` (today: `SECOPS_APPROVED`) **before that gate is `passed`** is refused. `safety_override` is already parsed (`state.js parseWorkflow` sets `g.safety`); the engine reads it. Concretely:
   - `do:` may **never** contain a gate-state mutation (the engine exposes **no** `set_gate`/`pass_gate` action at all — gates are decided only by their owner agent via `gate/set`, never by a rule).
   - A `route_to_stage` whose target stage is **at or beyond** a not-yet-passed `safety_override` gate in the active track order is refused (the engine resolves target-stage → governing gate via `stage-map.js stageGate` and checks the ticket's gate state).
   - `require_gate` may only **add** a gate to the required set, never remove or satisfy one.
2. **No label privilege escalation.** `set_label`/`clear_label` are refused unless the acting author is in that label's `settable_by` (or `"*"`). Mirrors the existing hard-gate refusal discipline (terse 400, nothing written).
3. **Directive-trust boundary.** `instruct` prompts are model-executed text; they are recorded as untrusted `kind:"directive"` comments (capped, escaped on render). A rule cannot, via a directive, perform a mutation — directives carry no write authority; only the host's subsequent explicit `gate/set`/`advance` calls (themselves guarded) mutate.
4. **Author-time mirror:** the same refusals run when a rule is **saved** (the rule-authoring write path, §8) so an unsafe rule never persists, AND at **evaluation-time** so an unsafe rule that somehow exists (e.g. a hand-edited overlay) still never executes a bypass.

**Provable negatives `/secops` and the tests must demonstrate:**
- A crafted bypass rule **cannot** advance a ticket past an unmet `safety_override` gate (AC-6).
- A `set_label` outside `settable_by` **writes nothing** (AC-5).
- A backward-routing loop **terminates at the budget** with `NEEDS_HUMAN` (AC-7).
- A **replayed** event tail **does not double-route** (AC-8).
- The base `workflow.yaml` is left **byte-unchanged**; all rule/label edits land only in the overlay.

## 7. New ledger field(s) + how labels surface in `buildState`

**Backward-compatible additive fields on a ledger ticket:**
- `labels: []` — array of currently-set label names (absent ⇒ `[]`).
- `fired: [{rule, event, at}]` — the dedup/audit trace (absent ⇒ `[]`).

**Projection:** `buildState`'s per-ticket map gains `labels` (from `t.labels || []`) so the board/editor can read it (ratifies aura open item 2 / jorge open item — **`labels:[]` reaches the ticket projection / `TicketView`**). `label.set`/`label.cleared` also append a `kind:"label"` typed comment so the *event* is in the same stream as gates/advances. `summarizeTasks`/`needsHumanDecision` are unaffected (labels are not a status bucket); `NEEDS_HUMAN` continues to surface via the existing needs-you overlay.

## 8. Rule/label authoring write path — the guarded CAS route

**Decision — two new routes in `api.js`, both behind `writeAllowed`, both overlay-only via `writeOverlayCAS` (base YAML never machine-written), both with `expectedRev` + 409:**

- **`workflow/set-rules`** — replace/patch the overlay `rules` for the project (the full rule list, validated). Mirrors `track/set-stages` (declarative, whole-collection, CAS). **Runs the §6 author-time safety validation and rejects (400) an unsafe rule before writing.**
- **`label/set`** — set/clear a label on a ticket: `readModifyWriteLedger` mutates `led[id].labels`, enforces `settable_by` against `by` (400 + nothing written when unauthorized), appends the `kind:"label"` typed comment.

Labels-contract edits (`labels:` definitions) ride the same overlay CAS as rules (`workflow/set-rules` may carry a `labels` patch, or a sibling `workflow/set-labels`). All four (`set-rules`, `set-labels`, `label/set`, plus the existing `track/set-stages`) merge into the **single overlay** so there is one `rev`.

---

# ADT-228 — Drag-to-reorder builder. **Decision: APPROVED. No new backend.**

**Decision:** ADT-228 is **purely FE**. It rides the **existing `track/set-stages` overlay CAS write** verbatim — no new route, no new persistence, no new server surface.

- **Data contract (unchanged):** the FE posts the **full ordered stage list** (`stages: [{name, owner?}]`) as today; `validateStageList` already accepts add/delete/move (it is NOT a permutation check — that is `track/reorder`; `set-stages` is the right, more permissive route). A drop computes the new full order and sends one `track/set-stages` with `expectedRev`.
- **Optimistic write + 409:** reuse the builder's existing lifecycle pill + reconcile banner. A stale-rev drop returns 409 → banner takes focus, row snaps back to server truth, never a silent overwrite. Cancelled/empty drag sends nothing.
- **Base YAML untouched:** `set-stages` writes only the overlay (`writeOverlayCAS`) — satisfies the "byte-unchanged base" negative.
- **Keyboard-accessible drag alternative (WCAG 2.2 2.5.7)** is an **FE/a11y concern**, not architecture: `Alt+↑/↓` stays the tested primary; the pick-up/move/drop mode and the `⋯`-menu Move up/down are FE additions over the same write. Architecture imposes no constraint beyond "every reorder is one `set-stages` CAS write."

**Gates:** `ARCH_APPROVED` passed (no new surface). `SECOPS_APPROVED` is review-only (no new write surface — reuses the guarded CAS); `DESIGN_APPROVED` soft (aura §1 covers it). No `/be` work.

---

# ADT-229 — when→do rule editor. **Decision: APPROVED. Rides the same overlay CAS — one small new route shared with ADT-227.**

**Decision:** rule CRUD does **not** need a *dedicated* editor-only route. It uses the **`workflow/set-rules` overlay CAS route defined for ADT-227** (§8) — the editor posts the full validated rule list as an overlay patch with `expectedRev`, exactly as the builder posts stages. Rules live in the same workflow document + overlay as stages → one parser, one overlay, one `rev`, one 409 reconcile banner.

**Read shape the editor needs (all already in / added to `buildState`):**
- `rules` (the parsed/merged rule list for the project) — **new projection field** (`state.parseRules` + overlay merge), so the editor reads what the engine evaluates.
- `labels` (the contract: name → `settable_by`, `routes_to`, `owner`, `meaning`) — **new projection field** (`state.parseLabels` + overlay merge).
- `tracks` / `stageOwners` / `gateDefs` — already projected (for the stage/owner pickers and the loop-back/backward-route detection).
- per-ticket `labels:[]` — added in §7 (for any live-label reads).

**The editor mirrors the server safety contract client-side (server is authority — D-407, AC-8):**
- The **Set-label picker is filtered to only the labels this stage owner may set** (`settable_by`) — a label the owner cannot set is **absent, not greyed**; you cannot author an unenforceable rule.
- A route that would target a stage **at/beyond an unmet `safety_override` gate** is refused in the editor (mirrors the §6 server refusal); the read view flags backward routes as "loops back" and annotates the one-shot `clear_label` guard; a read-only loop-budget→`NEEDS_HUMAN` note is always shown.
- **The server re-validates on `workflow/set-rules` and is the authority** — the client mirror is UX, never the gate. A stale-rev save returns 409 → shared reconcile banner.
- All rule text (prompts, patterns, labels, comment bodies) renders **escaped (interpolation only, never `[innerHTML]`)** — the `no-unsafe-binding` discipline.

**Gates:** `ARCH_APPROVED` passed (rides the ADT-227 overlay CAS; no separate persistence). `SECOPS_APPROVED` review (confirm the editor cannot persist a contract-violating or gate-bypassing rule — the same negatives as ADT-227, mirrored client-side); `DESIGN_APPROVED` soft (aura §2).

---

## Cross-cutting decisions, risks, mitigations

**Reuse (no new runtime deps):** overlay + CAS (`writeOverlayCAS`) + guard (`writeAllowed`) + comments (`appendComment` typed) + channels (`fs.watch`/SSE). Same-origin loopback. Optimistic write + `expectedRev`/409 everywhere. The engine is a new pure module driven off the existing event stream; the only new routes are `workflow/set-rules` (+ `set-labels`) and `label/set`, all behind the existing guard.

| # | Risk / trade-off | Mitigation |
|---|---|---|
| R1 | **Infinite loops** (a rule routes back forever; two rules ping-pong) | One-shot routing labels (`clear_label`); per-ticket **loop budget 3** → `loop.exceeded` → `NEEDS_HUMAN`, stop; same-tick chain-depth cap 8. |
| R2 | **Non-determinism** of LLM execution stalling the loop | The **engine is deterministic** (closed grammar, no LLM); a stalled directive stays pending (idempotent); `heartbeat.stale` + budget convert a stall into `NEEDS_HUMAN`. |
| R3 | **Rule routes around a safety gate** | **HARD prohibition (§6)** at author-time + eval-time; engine exposes NO gate-mutating action; SECOPS hard-gates ADT-227. |
| R4 | **Label contract drift** (skill text vs enforcement vs editor) | Single `labels:` source of truth; **parity test** across digest/route/editor. |
| R5 | **Ledger label drift / double-count** | `labels:[]` is additive and disjoint from status buckets; `needsHumanDecision`/`summarizeTasks` unchanged; `fired` dedup prevents replay drift. |
| R6 | **Comment-log JSONL interleave > PIPE_BUF** (concurrent appends) | Documented single-dev acceptance (`write.js` already notes it); the `(rule id, event id)` dedup tolerates a replayed/torn tail; revisit with `flock` if multi-writer becomes real. |
| R7 | **Parser richness** (rule shapes vs the line-oriented YAML parser) | Rules/labels read primarily from the overlay JSON (full fidelity); base YAML carries only a parseable default set; the builder/editor only ever writes the overlay. |

---

## Decision summary

| Ticket | Decision | New backend? | Gates to clear before impl |
|---|---|---|---|
| **ADT-227** | **APPROVED (conditional)** — rules+labels in workflow doc+overlay (one parser/rev), closed `when` grammar over the existing event stream, intent/action split, deterministic CAS+dedup engine, loop budget→NEEDS_HUMAN, hard safety-bypass + label-escalation prohibition. | Yes — `hub/lib/engine.js` + routes `workflow/set-rules`, `label/set`; `labels:[]`/`fired:[]` ledger fields; `labels`/`rules` projection. | **`SECOPS_APPROVED` (HARD)** then `APPROVAL_GATE`. |
| **ADT-228** | **APPROVED** — FE drag over the existing `track/set-stages` CAS write; full ordered list contract unchanged; keyboard alt is FE/a11y. | **No.** | `DESIGN_APPROVED` (soft review), SECOPS review (no surface). |
| **ADT-229** | **APPROVED** — rides the ADT-227 `workflow/set-rules` overlay CAS (no dedicated route); editor reads `rules`+`labels`+`tracks`+`stageOwners` from `buildState`; mirrors the safety contract client-side (server authority). | Shares ADT-227's route (no *additional* backend). | `DESIGN_APPROVED` (soft), SECOPS review (cannot persist a bypassing rule). |

**Recorded in the ledger:** `ARCH_APPROVED → passed` for ADT-227/228/229. ADT-227 remains blocked on its HARD `SECOPS_APPROVED` gate before implementation. Next handoff: **/secops** for ADT-227 (the four provable negatives in §6).
