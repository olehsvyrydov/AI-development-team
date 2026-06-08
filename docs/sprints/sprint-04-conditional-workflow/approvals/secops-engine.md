# SECOPS — Sprint 04 Conditional Workflow (ADT-227 HARD · ADT-228 / ADT-229 review)

> **/secops (Soren) — Principal Security Engineer.**
> Three gates in one pass:
> - **ADT-227 — `SECOPS_APPROVED` (HARD, safety-override).** The rules+labels engine is a
>   **new authority that mutates the ledger/overlay from declarative rules** off the event
>   stream. It can route, label, assign, and require-gates **without a human in the loop**.
>   This is the hard surface of the sprint: a rule must NEVER bypass a `safety_override`
>   gate, escalate a label, execute a directive's text, or spin forever. Never downsized.
> - **ADT-228 — `SECOPS_APPROVED` (review).** Pointer/keyboard affordance over the
>   **existing** `track/set-stages` overlay CAS. No new backend surface. Minimal conditions.
> - **ADT-229 — `SECOPS_APPROVED` (review).** The rule editor authors rules via the **same**
>   guarded `workflow/set-rules` overlay CAS (shared with ADT-227). The client mirrors the
>   contract for UX; the **server is the authority**. Escaped render; cannot persist a
>   bypassing/contract-violating rule.
>
> **Inputs read in full:** `approvals/arch-engine.md` (Jorge — esp. §6 "safety invariants
> /secops MUST hard-verify", the schema §2, the intent/action split §2, the evaluator §4,
> loop safety §5, the write path §8, the risk table R1–R7); `docs/product-vision/
> conditional-workflow/architecture-jorge.md` (the model); tickets `ADT-227/228/229`;
> `.workflow-state.json` (the three ARCH-approved notes + the three SECOPS=pending notes).
> **Existing machinery inspected IN SOURCE — I read the code, not the design's claim about
> it:** `hub/lib/guard.js` (`writeAllowed` = X-AIDT + loopback Host + loopback Origin +
> loopback socket; `streamAllowed`; no permissive CORS), `hub/lib/write.js`
> (`readModifyWriteLedger` CAS+mutex; `writeOverlayCAS`; `mergeOverlayPatch` → only
> `.aidevteam/workflow.overrides.json`; `deepMerge` with `FORBIDDEN_KEYS` =
> `__proto__`/`constructor`/`prototype`; `appendComment` typed JSONL, `crypto.randomUUID()`
> id, `MAX_COMMENT_BODY`=8192 cap; base `workflow.yaml` NEVER written), `hub/lib/comments.js`
> (`safeId` filename sanitization; `readComments` skips corrupt lines), `hub/lib/state.js`
> (`parseWorkflow` sets `g.safety` from `/safety_override:\s*true/`; `applyOverlay` +
> `mergeGates` index-by-name overlay-wins; `buildState`; `needsHumanDecision`),
> `hub/lib/stage-map.js` (`stageGate`, `expectedOwner` — `STAGE_GATE['security']`=
> `SECOPS_APPROVED`), `hub/lib/api.js` (`gate/set` is the ONLY gate-state writer; `ticket/
> advance`/`assign`; `track/set-stages` + `validateStageList` with `FORBIDDEN_NAMES` +
> `hasUnsafeChar`; `GATE_STATES`=passed|pending|rejected). Prior gate style:
> `approvals/secops-editable-workflow.md`, `secops-cockpit-v2.md` (C-/N- format).

---

## Verdict (summary up top)

- **ADT-227 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).** Binding
  on the **numbered conditions C-1…C-24 (§2)**, proven by the negative tests **N-1…N-22
  (§5)**. No CRITICAL/HIGH finding is left open — each is converted to a binding, testable
  condition. **Implementation is BLOCKED until C-1…C-24 ship with N-1…N-22 green and pass
  `/rev`.**
- **ADT-228 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.** Binding on **C-25…C-28 (§3)**,
  proven by **N-23…N-25**. No new backend; rides the guarded `track/set-stages` CAS.
- **ADT-229 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.** Binding on **C-29…C-35 (§4)**,
  proven by **N-26…N-30**. Client mirror is UX; the server re-validates on `set-rules` and is
  the authority; escaped render of all rule text.

**Headline finding (rank honestly).** The engine and its entire safety enforcement are
**NET-NEW code** — none of it exists in source today. Specifically: `hub/lib/engine.js`
(`deriveEvents`/`selectRules`/`evaluate`/`apply`), the routes `workflow/set-rules`,
`workflow/set-labels`, `label/set`, the parsers `parseRules`/`parseLabels`, the ledger fields
`labels:[]`/`fired:[]`, the **author-time** safety validator, the **eval-time** safety
validator, the loop-budget counter, the `(rule id, event id)` dedup trace, and the
`kind:"directive"` comment type are **all unwritten**. The reusable substrate I *verified
in source* — `writeAllowed`, `readModifyWriteLedger`/`writeOverlayCAS` (CAS+mutex+atomic),
`deepMerge`'s `FORBIDDEN_KEYS` proto-pollution drop, `appendComment`'s 8KB cap +
`randomUUID` id, `g.safety` parsing, `stageGate`, `validateStageList`'s name rigor — is
**real**. But the engine that *uses* this substrate, and **every one of the four provable
negatives**, is net-new and each carries its own proving test. **Nothing in §6 of the ADR
may be counted as a passing mitigation until it is written and its negative test is green.**
The single most dangerous regression point: the engine's "no gate-mutating action" property
is **invisible in the type system** (ADR §6) — it lives in control flow and must be locked by
a structural negative test (N-2), exactly where teams regress.

---

## 0. Verification of the controls these designs reuse (I read the source)

A gate that rubber-stamps "reuse the CAS + guard + comments + overlay" without reading it
ships a hole when the "reused" control turns out to be net-new. Findings:

| Control the design leans on | Source (verified) | Verdict |
|---|---|---|
| **`writeAllowed`** (X-AIDT + loopback Host + loopback Origin + loopback socket; no permissive CORS) | `guard.js:53-59`; the engine's new routes inherit it **by placement** on the `/api/*` POST dispatch | **Real.** Reusable for the three new write routes (`set-rules`/`set-labels`/`label/set`). (C-16, C-17.) |
| **CAS + mutex + atomic** `readModifyWriteLedger` / `writeOverlayCAS` (`expectedRev!==rev → {conflict}`, in-process mutex, tmp+fsync+rename) | `write.js:57-69, 104-119` | **Real and reusable.** Engine mutations and authoring writes ride it. (C-15, C-16.) |
| **Overlay-only** (`workflow.yaml` never machine-written) | `write.js:89-102` — `mergeOverlayPatch` writes ONLY `.aidevteam/workflow.overrides.json` | **Real.** Base byte-identical holds by construction for rule/label authoring (C-15, N-21). |
| **Proto-pollution drop** `FORBIDDEN_KEYS`=`__proto__`/`constructor`/`prototype` in the overlay merge | `write.js:74-87` (`deepMerge` skips them) | **Real but SCOPED to the overlay merge.** It does NOT cover rule/label **id**, **label name**, **stage name**, or **agent token** used as projection map keys by the net-new `parseRules`/`parseLabels` — those need their own rejection (C-22, N-19). |
| **Typed append-only event stream** `appendComment` (`kind`, 8KB body cap, `crypto.randomUUID()` id, JSONL one line) | `write.js:231-251`; id is the per-event identity | **Real.** The new `kind:"label"` and `kind:"directive"` records ride it; the JSONL `id` is the dedup key (C-7, C-11). The PIPE_BUF interleave caveat (`write.js:246-248`) is acknowledged — the `(rule,event-id)` dedup tolerates a torn/replayed tail (C-7). |
| **`g.safety`** (`safety_override:true` parsed onto the gate) | `state.js:75` `safety: /safety_override:\s*true/.test(body)`; `mergeGates` carries it (`state.js:125-133`) | **Real.** The engine reads `g.safety` to identify a safety gate. The **logic that refuses a route past an unmet safety gate is NET-NEW** — `g.safety` is only the input. (C-1…C-4.) |
| **`stageGate(stage)`** stage→governing-gate (`security`→`SECOPS_APPROVED`) | `stage-map.js:13-23, 37-39` | **Real.** The eval-time "target stage at/beyond an unmet safety gate" check resolves target→gate through it. But **stage *ordering* / "at or beyond"** is NOT a function today — it must be derived from the active track's stage array; that derivation is net-new (C-3). |
| **`gate/set` is the ONLY gate-state writer; states = passed\|pending\|rejected** | `api.js:126-141`, `GATE_STATES` line 14 | **Real and load-bearing.** The engine MUST expose **no** gate-state write at all; only an owner agent via `gate/set` decides a gate. The "engine has no `set_gate`" property is net-new and proven structurally (C-1, N-1). |
| **`validateStageList`** name rigor (`FORBIDDEN_NAMES`, `hasUnsafeChar`, cap, unique) | `api.js:49-69` | **Real and reused verbatim** by ADT-228 (`set-stages` unchanged). For ADT-227 it is the *template* for the new rule/label validator, not a drop-in (rules carry more fields). (C-22.) |
| **`hub/lib/engine.js` + the four provable negatives + the three new routes + `parseRules`/`parseLabels` + `labels:[]`/`fired:[]`** | **absent** — no such file/route/field exists | **NET-NEW, the entire HARD surface.** All of §2 is new code under TDD; no part is a free reuse. |

**Headline:** the guard, the CAS, overlay-only writes, the typed comment stream, `g.safety`,
`stageGate`, and `validateStageList`'s name rigor are **real and verified**. The engine, the
two parsers, the three routes, the two ledger fields, the **author-time and eval-time safety
validators**, the loop-budget, the dedup trace, and the directive comment type are **net-new
code**; each carries its own proving test and none counts as a passing mitigation until
written and tested.

---

## 1. Trust model & threat surface (delta)

**Trust model:** single-developer, localhost, file-backed. The Operator is trusted; **the
browser the Operator also uses is NOT** (any site can `fetch('http://127.0.0.1:<port>/api/…')`
→ `writeAllowed` is the control, not loopback binding). **New for this sprint:** a *rule* —
authored once, persisted in the overlay — becomes a **standing, unattended actor** that
mutates the ledger every time a matching event lands. The threat is no longer only "a hostile
page drives one write"; it is "**a single authored rule routes around a safety gate, escalates
a label, or loops forever, automatically, on every future event**." The rule's `do:` text and
an `instruct` prompt are **untrusted data that the engine and downstream agents must never
treat as authority**.

**STRIDE — the rules engine (the new surface):**

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Elevation of Privilege (safety-gate bypass)** | A rule's `route_to_stage` / `require_gate` / any `do` action advances or auto-satisfies a ticket past an unmet `safety_override` gate (e.g. `SECOPS_APPROVED`), shipping unreviewed code. | **CRITICAL** | **C-1…C-5** — the engine exposes **NO** gate-state action; a route at/beyond an unmet safety gate is refused at **author-time AND eval-time**; `require_gate` may only **add**; proven the bypass writes nothing (N-1…N-5). |
| **Elevation of Privilege (label escalation)** | A rule `set_label`/`clear_label`s a label the acting agent is not in `settable_by` for, gaining a routing capability it should not have. | **HIGH** | **C-6, C-21** — `label/set` enforces `settable_by` against the acting author; an authoring write whose rule targets an unsettable label is rejected; unauthorized set writes **nothing** (N-6, N-18). |
| **Tampering / RCE-adjacent (directive treated as authority)** | An `instruct{prompt}` is executed by the Core, or its text triggers an engine mutation, or it is rendered as HTML. | **HIGH** | **C-8…C-10** — a directive is a RECORDED `kind:"directive"` comment only; it carries **no** write authority; its text is untrusted DATA (capped, escaped on render, never executed by the Core, never able to drive a mutation by itself) (N-8…N-10). |
| **Denial of Service (infinite loop / fan-out)** | A rule routes back forever; two rules ping-pong via `then:`; a replayed tail re-fires; an unbounded chain/fan-out. | **HIGH** | **C-11…C-14** — loop budget 3 → `loop.exceeded` → `NEEDS_HUMAN` + STOP; chain-depth cap 8; `(rule id, event id)` dedup → effectively-once; bounded evaluator (no unbounded recursion/fan-out) (N-11…N-14). |
| **Tampering (write integrity / base mutated)** | An engine mutation bypasses the CAS writer, or rule/label authoring writes the base `workflow.yaml`, or rides an unguarded route. | **HIGH** | **C-15…C-17** — every engine mutation goes through `readModifyWriteLedger`/`writeOverlayCAS`; authoring is overlay-only (base byte-unchanged); all three routes behind `writeAllowed` → 403 without (N-15…N-17, N-21). |
| **Tampering / DoS (malicious rule definition)** | A rule with an unknown action/event/agent, a catastrophic-regex `pattern` (ReDoS), an over-long stage/label name, or a proto-polluting id/name is accepted. | **HIGH** | **C-18…C-22** — strict schema validation (closed enums); `pattern` is a bounded safe matcher (no user-supplied unbounded regex; ReDoS-proof); names bounded; proto-pollution keys rejected (N-18b, N-19, N-20). |
| **Repudiation (no audit of what fired)** | A rule mutates the ledger with no record of which rule/actor/when. | LOW | **C-23** — every fired rule appends a typed comment AND a `fired:[{rule,event,at}]` trace entry (the dedup key doubles as the audit record) (covered by N-11/N-14 + AC-1). |
| **Information disclosure (error leak)** | An author-time/eval-time refusal echoes an absolute path or internal state. | LOW | **C-24** — terse refusal reasons (`'rule routes past an unmet safety gate'`, `'label not settable by this agent'`); no absolute paths, no stack traces. |

One CRITICAL (safety-gate bypass) and several HIGH — **each converted to a binding, tested
condition. None left open.**

---

## 2. BINDING conditions — ADT-227 `SECOPS_APPROVED` (HARD)

These are acceptance criteria. `/rev` verifies **each one in code with a proving negative
test** (§5); the gate is met only when N-1…N-22 ship green. Implementation is **BLOCKED**
until then. **For every refusal: assert the refusal AND that nothing was written** — the
status/return code alone is insufficient; snapshot the ledger/overlay/comments and assert
byte-identical after.

### No safety-gate bypass (the CRITICAL surface — C-1…C-5)

**C-1 — The engine exposes NO gate-state action, structurally.** There is **no** `set_gate`,
`pass_gate`, `satisfy_gate`, `clear_gate`, or any `do` action that writes a ledger gate's
`state`. The `do` action set is a **closed allowlist** = `{ set_label, clear_label,
route_to_stage, assign, require_gate, instruct, fan_out }` and nothing else. The only code path
that writes a gate `state` remains `api.js gate/set`, reachable **only** by an owner agent's
explicit guarded call — **never** by the engine. Prove structurally: the engine module has no
reference to a gate-state write, and an unknown/forbidden `do` action is rejected (N-1).

**C-2 — Deterministic refusal short-circuits; no advisory/model path can lift it.** The
safety refusal is a **deterministic terminal verdict** in the engine's control flow. No LLM,
heuristic, or advisory score is consulted for the routing/safety decision (the evaluator is a
closed grammar, ADR §4 NFR "Determinism"). Prove: the safety check runs and refuses
regardless of any model availability; there is no code path where an advisory signal flips a
settled refusal to allow (N-2). *(This is the "deterministic precedence" guardrail — invisible
in the type system, locked by the negative test.)*

**C-3 — A `route_to_stage` at or beyond an unmet `safety_override` gate is refused (eval-time).**
At evaluation, the engine resolves the target stage → its governing gate via `stageGate`, and
— using the **active track's stage ordering** — determines whether the target is **at or past**
any `safety_override` gate (`g.safety===true`) whose ticket state is not `passed`. If so, the
route is **refused and nothing is written** (no ledger stage change, no comment). The "at or
beyond" ordering is derived from the resolved track's stage array (net-new; cannot be assumed).
Prove: a crafted rule routing a ticket from before an unmet `SECOPS_APPROVED` to a stage at/past
it does **not** advance the ticket; the ledger stage is unchanged (N-3, AC-6).

**C-4 — The same refusal runs at AUTHOR-time.** The `workflow/set-rules` route runs the
identical safety validation when a rule is **saved**, and rejects (`400`) — writing nothing to
the overlay — any rule whose `do:` could route past an unmet safety gate or whose `do:` names a
forbidden gate-state action (C-1). An unsafe rule **never persists**. Author-time and eval-time
use the **same** validator function (single source of truth — no second, divergent check).
Prove: posting a bypass rule → `400`, overlay byte-unchanged (N-4); and a bypass rule
hand-injected into the overlay still **never executes** a bypass at eval-time (N-3 covers the
eval arm; N-5 covers the hand-edited-overlay arm).

**C-5 — `require_gate` may only ADD a required gate, never remove or satisfy one.** The
`require_gate` action's only effect is to add a gate name to the ticket's required set (an
overlay-style patch). It **cannot** set a gate to `passed`, remove a gate from the required
set, or downgrade `refusal`/`safety`. Prove: a `require_gate` leaves all existing gate states
untouched and can only widen the required set (N-5b).

### Label contract — no privilege escalation (C-6, C-21)

**C-6 — `set_label`/`clear_label` enforce `settable_by` against the acting agent; unauthorized
writes nothing.** The `label/set` route (and the engine's `apply` of a `set_label`/`clear_label`
action) resolves the label's `settable_by` from the single-source `labels:` contract and
refuses unless the acting author is listed (or `settable_by` is `"*"`). An unauthorized attempt
returns a terse `400` (route) / records a refusal (engine) and **writes nothing** — no
`labels:[]` change, no `kind:"label"` comment, no routing (mirrors the existing hard-gate
refusal discipline). Prove: an agent not in `settable_by` setting the label → refused, ledger
`labels:[]` unchanged (N-6, AC-5).

### Directives are inert (C-8…C-10)

**C-8 — An `instruct` is RECORDED ONLY, with no write authority.** When a rule's `do:` contains
`instruct{target,prompt}`, the engine appends exactly **one** `kind:"directive"` comment (via
`appendComment`, 8KB-capped) and performs **no** other mutation for that action. A directive
**cannot** route, label, assign, require a gate, or satisfy a gate. Prove: a rule whose only
`do:` is `instruct` produces a directive comment and **zero** ledger/overlay change (N-8).

**C-9 — The directive prompt is untrusted DATA, never executed by the Core and never able to
trigger an engine mutation by itself.** The `prompt` text is stored verbatim (capped) and is
**never** interpreted as a command, a rule, an action, or a path by the engine. No engine
mutation is keyed off the *content* of a directive prompt. (A subsequent host agent may *act*
on the directive, but only via its own explicit, guarded `gate/set`/`advance`/`assign` calls —
the directive itself carries no authority.) Prove: a directive whose prompt text contains
strings like `route_to_stage: verify` or `set_gate SECOPS_APPROVED passed` causes **no**
routing and **no** gate change (N-9).

**C-10 — Directive (and all rule) text is escaped on render — never unsafe HTML.** Prompt,
pattern, label, target, and comment-body text render as **escaped text** (interpolation only;
no `[innerHTML]`/`bypassSecurityTrust*`). A `<script>`/`<img onerror>` payload in a prompt or
pattern is shown literally, never executed (N-10). *(Render obligation shared with ADT-229
C-33.)*

### Loop safety / DoS (C-11…C-14)

**C-11 — The loop budget terminates a cycle → `NEEDS_HUMAN`, and STOPS.** A per-ticket loop
budget (default **3**, D-401) counts backward traversals of the same `stage.entered`. On the
4th, the engine emits the internal `loop.exceeded` event whose built-in default `do:` is
`set_label: NEEDS_HUMAN` **and routing stops** (no further backward route fires for that loop).
The board surfaces it via the existing `needsHumanDecision` overlay (`state.js`) — a visible
"needs you", never an infinite spin. Prove: a backward-routing rule fired >3 times terminates
at the budget with `NEEDS_HUMAN` and no further route (N-11, AC-7).

**C-12 — The `then:` chain depth is capped (default 8) within a tick.** Chained rules evaluate
only in the same tick, only if the parent fired, bounded at depth 8. Prove: a `then:` chain
(including a self/mutual cycle) cannot exceed the cap — evaluation terminates, no runaway
(N-12).

**C-13 — A replayed/duplicated event tail does NOT double-apply.** Before acting, the engine
checks `(rule id, triggering event id)` against the per-ticket `fired:[]` trace; a debounce
double-fire, an `fs.watch` re-emit, or a re-read of the comment log **never** re-routes or
re-sets a label. The JSONL record `id` (`crypto.randomUUID()`) is the event identity. Prove:
delivering the same event twice applies the `do:` actions **once**; `fired:[]` has exactly one
entry (N-13, AC-8).

**C-14 — The evaluator is bounded — no unbounded fan-out or recursion.** Rule selection is
indexed/pruned (ADR §4); a single tick evaluates a bounded set; `fan_out` is **schema-only**
in Phase 0 (recorded + serial — no parallel spawn, no agent execution). Prove: `fan_out` does
**not** spawn processes/agents and is recorded inertly; the evaluator does not recurse without
bound (N-14). *(No execution/RCE surface ships here — the engine performs file mutations only,
never `spawn`/`child_process`/`ssh`/`eval`. Prove the negative: a grep/conformance check over
the engine module finds no execution-class import or call — N-14b. "No exec here" is a claim to
be tested, not assumed.)*

### Write integrity (C-15…C-17)

**C-15 — All engine mutations go through the existing CAS writer; base `workflow.yaml`
byte-unchanged.** `set_label`/`clear_label`/`route_to_stage`/`assign` ride
`readModifyWriteLedger`; `require_gate` rides `writeOverlayCAS`; directives ride `appendComment`.
No engine mutation writes a project file by any other path. Rule/label **definitions** are
overlay-only (`.aidevteam/workflow.overrides.json`); the base `workflow.yaml` is **never**
machine-written. Prove: hash `workflow.yaml` before/after a full author + fire session →
identical; only the overlay/ledger/comments changed (N-15, N-21).

**C-16 — Rule/label authoring rides the guarded CAS route (guard required → 403 without).**
`workflow/set-rules`, `workflow/set-labels`, and `label/set` sit on the guarded `/api/*` POST
path. A request missing X-AIDT, from a non-loopback socket, or with a foreign Host/Origin →
`403`, **nothing written**, before any validation/resolution. Prove each arm → 403, overlay/
ledger byte-unchanged (N-16).

**C-17 — Authoring is CAS-safe (stale rev → 409, no silent overwrite).** All three routes carry
`expectedRev`; a stale rev → `409 { conflict, state }`, overlay/ledger byte-unchanged; the
client re-syncs rather than clobbering a concurrent edit. Prove (N-17).

### Input validation (C-18…C-24)

**C-18 — Strict schema validation; unknown action/event/agent rejected.** A rule is validated
against the closed grammar before persist: `id` required + bounded; `when` predicate keys ∈ the
closed vocabulary (`label|pattern|in|event|gate|state|stage|author|track|preset`); `event` ∈
the closed event enum; `do` actions ∈ the C-1 allowlist; `assign`/`instruct.target` agents are
plain bounded tokens. An unknown action, event, predicate key, or malformed entry → `400`,
nothing written (N-18).

**C-18b — `instruct` requires both `target` and a non-empty `prompt`.** An `instruct` with a
missing target or empty prompt is rejected at author-time (mirrors ADT-229 AC-7). (N-18b.)

**C-19 — `pattern` is a BOUNDED, ReDoS-safe matcher — never an unbounded user regex.** The
`pattern` predicate matches a comment/title/description, scoped by `in`. It MUST NOT compile an
arbitrary user-supplied regex that can catastrophically backtrack (ReDoS). Mitigate by one of:
(a) treat `pattern` as a literal/substring or a bounded glob (no backtracking), or (b) if a
regex flavor is offered, compile it under a **length cap** and a **linear-time / backtracking-
free** engine (e.g. RE2-style) or a complexity/timeout guard — and **reject** a pattern that
exceeds the length cap. The matched input is itself capped (comment bodies are 8KB). Prove: a
known catastrophic pattern (e.g. `(a+)+$`) against a long input does **not** hang the evaluator
(bounded time) — and an over-cap pattern is rejected at author-time (N-19).

**C-20 — Stage/label/agent names are bounded and inert.** Label names, stage names (in `do`
targets), and agent tokens are length-capped and validated as plain text (reuse the spirit of
`validateStageList`'s `hasUnsafeChar`/cap — a stage name in a `route_to_stage` must resolve to
an existing track stage, not become a path or escaping key). Over-cap or control-char values →
`400` (N-20).

**C-21 — A rule whose `do.set_label` targets a label the rule's context can't set is rejected
at AUTHOR-time.** Beyond the runtime `label/set` enforcement (C-6), `workflow/set-rules`
rejects a rule that would author an **unenforceable** label action — one whose label is not in
the `settable_by` set for the agent the rule acts as (mirrored by ADT-229's filtered picker,
C-31). You cannot persist a rule the engine will silently drop. Prove (N-18, label arm).

**C-22 — No prototype pollution via rule/label keys.** Rule `id`, label **name**, stage name,
and agent token used as **object keys** in `parseRules`/`parseLabels`/the projection are
guarded against `__proto__`/`constructor`/`prototype` (the overlay `deepMerge` already drops
them at write — `write.js:74`; the **parsers** must also not materialize them as map keys that
shadow the prototype). A label named `__proto__` does **not** pollute `Object.prototype` or the
projection. Prove `Object.prototype` is unmodified after parsing/merging such a definition
(N-20, proto arm).

**C-23 — Every fired rule is audited.** A fired rule appends a typed comment (`kind:"label"` /
`advance` / `assign` / `directive` as appropriate) **and** a `fired:[{rule,event,at}]` entry
recording which rule fired, on which event id, when, by whom. The audit record and the dedup key
are the same data. (Covered by N-11/N-13 assertions on `fired:[]` + AC-1.)

**C-24 — No info leak in refusals.** Author-time/eval-time refusals carry terse reasons
(`'unknown rule action'`, `'rule routes past an unmet safety gate'`, `'label not settable by
this agent'`, `'pattern too long'`) — **never** an absolute path, a stack trace, or internal
state.

---

## 3. BINDING conditions — ADT-228 `SECOPS_APPROVED` (review)

Purely FE. **No new server route, no new persistence, no new input-trust path** — the drag/
keyboard affordance rides the **existing** `track/set-stages` overlay CAS (verified: `api.js:
158-167`, `validateStageList` already permits add/delete/move; `writeOverlayCAS` overlay-only).

**C-25 — No new surface.** Confirm in review that ADT-228 introduces **no** new route/handler/
file-write. Every reorder/add/delete is **one** `track/set-stages` CAS write with `expectedRev`
— the same contract as today (N-23: source-scan confirms no new `case` in `api.js`, no new
write path).

**C-26 — CAS-safe, no silent overwrite.** A stale-rev drop → `409`; the existing reconcile
banner takes focus, the row snaps back to server truth. A cancelled/empty drag (Escape / drop
outside a target) sends **no** write (N-24, AC-6/AC-7).

**C-27 — Base `workflow.yaml` byte-unchanged.** `set-stages` is overlay-only; a full
add/delete/move session leaves the base YAML byte-identical (N-25; same control as ADT-225
C-18, already proven — re-assert for the drag path).

**C-28 — Escaped render + a11y is not a bypass.** Stage names/owners render escaped (existing
control); the keyboard-accessible drag alternative (WCAG 2.2 2.5.7) is an a11y obligation with
**no** security weight — confirm it does not introduce a second, unguarded write path. (Covered
by N-23 + the existing escaped-render scan.)

---

## 4. BINDING conditions — ADT-229 `SECOPS_APPROVED` (review)

The editor authors rules via the **shared** `workflow/set-rules` overlay CAS (no dedicated
route). The client mirrors the contract for UX; **the server re-validates and is the authority**
(D-407). The same negatives as ADT-227, mirrored client-side.

**C-29 — The server is the authority; the client mirror is never the gate.** Every rule the
editor saves passes through `workflow/set-rules`, which re-runs the **full** C-1…C-24 author-time
validation server-side. A rule that bypasses the client mirror (crafted request, dev-tools,
stale client) is still refused by the server. Prove: a contract-violating / gate-bypassing rule
posted directly to `set-rules` (bypassing the UI) → `400`, overlay unchanged (N-26 — this is the
**load-bearing** condition; the client checks are UX only).

**C-30 — The editor cannot author a route past an unmet `safety_override` gate.** The editor
mirrors C-3/C-4 client-side: a `route_to_stage` targeting a stage at/beyond an unmet safety gate
is refused in the UI (Save disabled / inline error). But this is **defense-in-depth UX** — the
server refusal (C-29) is the gate. Prove the client refuses it AND the server refuses it (N-27).

**C-31 — The Set-label picker is filtered to the owner's `settable_by` — unauthorized labels are
ABSENT, not greyed.** The picker offers **only** labels the stage owner may set, sourced from the
single `labels:` contract projection. A label the owner cannot set is **not present** — you
cannot author an unenforceable rule from the UI. Prove the picker never offers an out-of-contract
label (N-28); and the server rejects one if posted anyway (C-21/N-26).

**C-32 — Contract parity across digest / route / editor.** The set of labels the editor offers ==
the set `label/set` enforces == the set the SessionStart digest publishes — all from the **same**
`labels:` block (ADR §3 mandates this parity test). Drift would silently break routing with no
error. Prove the three sets are identical for a fixture contract (N-29). *(This is a
cross-component-contract guardrail — required by the ADR.)*

**C-33 — All rule text renders escaped — never unsafe HTML.** Prompts, patterns, labels, stage
names, comment bodies render as **escaped text** (interpolation only; no `[innerHTML]` /
`bypassSecurityTrust*`). A `<script>`/`<img onerror>` payload in any rule field is shown
literally, never executed (N-30; shared obligation with ADT-227 C-10). Source-scan: no unsafe
binding on rule content + a behavioral non-execution assertion.

**C-34 — Save is CAS-safe; invalid drafts cannot save.** A stale-rev save → the shared `409`
reconcile banner (rule not applied; Discard / Re-apply). An incomplete rule (missing target
stage, empty Instruct prompt, empty/over-long pattern) → Save disabled + inline error announced
to assistive tech; and the server independently rejects it (C-18/C-18b). Prove (N-27, N-26).

**C-35 — Loop legibility is read-only and honest.** A backward route is flagged "loops back",
the one-shot `clear_label` guard is annotated, and the loop-budget→`NEEDS_HUMAN` note is always
shown — these are **read-only** annotations with no security weight, but confirm they do not
imply a routing the engine will drop (the UI must not show a route the server would refuse —
covered by C-30). No condition beyond honesty of the displayed contract.

---

## 5. Negative-test checklist `/rev` MUST confirm

The gate is met only when these ship green. `/rev` confirms **each is a real test that would
fail if its control were removed** — not a comment, not a happy-path assertion. **For every
refusal test: snapshot the ledger/overlay/comments before, assert refusal AND a byte-identical
state after — the return value alone is insufficient.**

### ADT-227 (HARD — N-1…N-22)

- [ ] **N-1 (no gate-state action):** the `do` parser/validator rejects `set_gate`/`pass_gate`/
      any unknown action → `400`; a source-scan of the engine module finds **no** gate-`state`
      write; only `api.js gate/set` writes a gate state. Fails if the allowlist is widened.
- [ ] **N-2 (deterministic refusal short-circuits; no advisory lift):** the safety refusal fires
      with no model/advisory consulted; there is **no** path where an advisory/LLM/heuristic
      signal flips a settled safety refusal to allow. (Structural: assert the safety check is
      reached and terminal before any optional advisory hook.)
- [ ] **N-3 (eval-time bypass refused):** a rule routing a ticket from before an unmet
      `SECOPS_APPROVED` to a stage **at/beyond** it → the ticket stage is **unchanged**, no
      `advance` comment, `fired:[]` records no successful route. Fails if `g.safety`/ordering
      check is removed.
- [ ] **N-4 (author-time bypass rejected, nothing written):** posting that bypass rule to
      `workflow/set-rules` → `400`; the overlay is **byte-unchanged** (no rule persisted).
- [ ] **N-5 (hand-edited overlay still refused at eval-time):** a bypass rule injected directly
      into the overlay (skipping author-time) still **never** executes a bypass when it would fire
      (N-3 logic runs on every eval, not only on save).
- [ ] **N-5b (`require_gate` only adds):** `require_gate` adds a required gate but leaves every
      existing gate `state` untouched and cannot set one `passed` or remove one.
- [ ] **N-6 (label outside `settable_by` writes nothing):** an agent not in `settable_by` setting
      the label (via `label/set` and via an engine `set_label`) → refused; `labels:[]` unchanged,
      no `kind:"label"` comment, no routing.
- [ ] **N-8 (directive is inert):** a rule whose only `do:` is `instruct` → exactly one
      `kind:"directive"` comment and **zero** ledger/overlay change.
- [ ] **N-9 (directive prompt carries no authority):** a directive whose prompt text *contains*
      `route_to_stage: verify` / `set_gate SECOPS_APPROVED passed` causes **no** routing and **no**
      gate change — the text is data, never executed.
- [ ] **N-10 (directive/rule text escaped):** a `<script>`/`<img onerror>` payload in a prompt or
      pattern renders as literal escaped text, never executes (source-scan: no unsafe binding +
      behavioral non-execution).
- [ ] **N-11 (loop budget → NEEDS_HUMAN, stop):** a backward-routing rule fired >3 times on one
      ticket → routing stops, `NEEDS_HUMAN` set, the board surfaces it via `needsHumanDecision`;
      no further backward route fires.
- [ ] **N-12 (chain-depth cap):** a `then:` chain (including a mutual/self cycle) terminates at
      the depth cap (8) — no same-tick runaway.
- [ ] **N-13 (replayed tail → effectively once):** the same triggering event delivered twice →
      the `do:` actions apply **once**; `fired:[]` has exactly one `(rule,event-id)` entry; no
      duplicate route/label write.
- [ ] **N-14 (bounded evaluator / no fan-out spawn):** `fan_out` does **not** spawn any process/
      agent and is recorded inertly; the evaluator does not recurse without bound under a crafted
      rule set.
- [ ] **N-14b (no execution surface leaked):** a source/conformance scan of the engine module
      finds **no** `spawn`/`child_process`/`exec`/`ssh`/dynamic-`eval`/deserialization import or
      call — proving the negative that no RCE-class path entered the engine.
- [ ] **N-15 (CAS writer + base YAML byte-unchanged):** every engine mutation routes through
      `readModifyWriteLedger`/`writeOverlayCAS`/`appendComment`; hashing `workflow.yaml`
      before/after a full author+fire session → identical (only overlay/ledger/comments changed).
- [ ] **N-16 (authoring guarded → 403 without):** `set-rules`/`set-labels`/`label/set` without
      X-AIDT, from a non-loopback socket, or with a foreign Host/Origin → `403`, nothing written,
      before any validation.
- [ ] **N-17 (authoring CAS — stale rev → 409):** a `set-rules`/`label/set` with a stale
      `expectedRev` → `409 { conflict, state }`; overlay/ledger byte-unchanged.
- [ ] **N-18 (schema validation — unknown action/event/agent + unenforceable label rejected):**
      a rule with an unknown `do` action, an unknown `event`, an unknown predicate key, or a
      `set_label` the rule's agent can't set → `400`, overlay unchanged.
- [ ] **N-18b (`instruct` completeness):** an `instruct` with a missing `target` or empty
      `prompt` → `400` at author-time.
- [ ] **N-19 (ReDoS-safe pattern):** a known catastrophic pattern (e.g. `(a+)+$`) against a long
      (≤8KB) input does **not** hang the evaluator (bounded time); an over-cap pattern is rejected
      at author-time.
- [ ] **N-20 (bounds + proto-pollution neutralized):** an over-cap stage/label/agent name → `400`;
      a label/rule named `__proto__`/`constructor`/`prototype` does **not** pollute
      `Object.prototype` or the projection (asserted unmodified after parse+merge+write).
- [ ] **N-21 (overlay-only authoring):** rule/label definition edits land **only** in
      `.aidevteam/workflow.overrides.json`; the base `workflow.yaml` is never opened for write.
- [ ] **N-22 (single validator — author == eval):** the author-time and eval-time safety checks
      call the **same** validator (one function); a rule rejected on save would also be refused on
      eval (no divergent second implementation).

### ADT-228 (review — N-23…N-25)

- [ ] **N-23 (no new surface):** source-scan confirms ADT-228 adds **no** new `api.js` route /
      handler / file-write path; every reorder/add/delete is one `track/set-stages` CAS write.
- [ ] **N-24 (CAS reconcile + no-write-on-cancel):** a stale-rev drop → `409`, row snaps back to
      server truth (no silent overwrite); a cancelled/empty drag (Escape / drop outside target)
      sends **no** write.
- [ ] **N-25 (base YAML byte-unchanged):** a full drag/keyboard add/delete/move session leaves
      `workflow.yaml` byte-identical; only the overlay changed.

### ADT-229 (review — N-26…N-30)

- [ ] **N-26 (server is authority):** a contract-violating / gate-bypassing rule posted **directly**
      to `workflow/set-rules` (bypassing the UI mirror) → `400`, overlay unchanged. (The
      load-bearing condition — proves the client mirror is not the gate.)
- [ ] **N-27 (client mirror refuses + Save disabled on invalid):** the editor refuses a route
      past an unmet safety gate and disables Save on an incomplete rule (missing target / empty
      prompt / empty/over-long pattern), with an inline error announced to assistive tech; the
      server independently rejects the same.
- [ ] **N-28 (picker filtered):** the Set-label picker **never** offers a label outside the
      stage owner's `settable_by` (absent, not greyed).
- [ ] **N-29 (contract parity):** for a fixture `labels:` contract, the set the editor offers ==
      the set `label/set` enforces == the set the digest publishes (drift fails the test).
- [ ] **N-30 (escaped render):** a `<script>`/`<img onerror>` payload in any rule field (prompt,
      pattern, label, stage name, comment body) renders as literal escaped text, never executes
      (source-scan: no `[innerHTML]`/`bypassSecurityTrust*` on rule content + behavioral
      non-execution).

---

## 6. Gate decisions

**ADT-227 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** C-1…C-24 (§2), proven by N-1…N-22 (§5).
- **No CRITICAL/HIGH left open:** the safety-gate bypass (CRITICAL), label escalation, the
  directive-trust boundary, the loop/DoS surface, write integrity, and the malicious-rule
  (ReDoS/proto-pollution/unknown-action) surface are each converted to a binding, tested
  condition.
- **Net-new code flagged (not free reuse):** `hub/lib/engine.js`, the parsers
  `parseRules`/`parseLabels`, the routes `workflow/set-rules`/`set-labels`/`label/set`, the
  ledger fields `labels:[]`/`fired:[]`, the **author-time and eval-time safety validators**, the
  loop-budget counter, the `(rule,event-id)` dedup trace, and the `kind:"directive"` comment
  type do **not** exist today. The guard, the CAS, overlay-only writes, the typed comment
  stream, `g.safety`, `stageGate`, and `validateStageList`'s name rigor are reused and verified
  in source; the engine and **every one of the four provable negatives** are net-new and each
  carries a proving test. The "engine has no gate-mutating action" property is **invisible in
  the type system** — it must be locked structurally by N-1/N-2.
- **BLOCKED until:** C-1…C-24 ship with N-1…N-22 green and pass `/rev`. ARCH approved the engine
  design; this hard gate does not waive — implementation is blocked until verified.

**ADT-228 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.**
- **Binding on:** C-25…C-28 (§3), proven by N-23…N-25. No new backend; rides the guarded
  `track/set-stages` overlay CAS verbatim; CAS-safe with 409 reconcile; no-write-on-cancel;
  base YAML byte-unchanged; escaped render preserved; a11y is not a second write path.

**ADT-229 — `SECOPS_APPROVED` — CONDITIONAL (PASS), review.**
- **Binding on:** C-29…C-35 (§4), proven by N-26…N-30. The client mirror is UX; **the server
  re-validates on `workflow/set-rules` and is the authority** (N-26 is load-bearing); the
  Set-label picker is filtered to the owner's contract; the digest/route/editor label sets are
  parity-tested; all rule text renders escaped; Save is CAS-safe and blocked on invalid drafts.

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-08 · **Status:** APPROVED WITH CONDITIONS
(ADT-227 HARD gate conditional on C-1…C-24 + N-1…N-22; ADT-228 conditional on C-25…C-28 +
N-23…N-25; ADT-229 conditional on C-29…C-35 + N-26…N-30) · **Next:** ADT-227 → `APPROVAL_GATE`
then `/be` under TDD (must ship N-1…N-22; `engine.js`, the two parsers, the three routes, the
two ledger fields, the author/eval safety validators, the loop-budget, and the dedup trace are
net-new) → `/rev` verifies each condition in code; ADT-228 → `/fe` (escaped, guarded CAS reuse)
→ `/rev`; ADT-229 → `/fe` (client mirror, server-authoritative) → `/rev`. Then `/sm` — please
update sprint status.
