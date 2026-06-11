# ARCH approval — DART as a Claude Code plugin (ADT-237 / ADT-238 / ADT-239)

**Gate:** `ARCH_APPROVED` (hard) · **Owner:** `/arch` (Jorge) · **Date:** 2026-06-10
**Decision:** **APPROVED** for all three tickets, with the boundaries/guardrails below.
**Scope:** the main-tool ↔ DART bridge — an MCP write-back server (237), directive
surfacing into the session digest (238), and the plugin packaging that ships both
under a `dart:` namespace, opt-in per project (239).

> Philosophy: *Architecture is about trade-offs, not silver bullets.* DART **records
> intent; the main tool executes.** This chunk adds **one new entry point** (MCP) and
> **one new projection field** (surfaced directives) — both are **thin adapters over
> code that already exists and is already gated.** The load-bearing rule: **no second
> writer, no second validator, no new bypass.**

This ADR **ratifies** the prior plugin/integration design
(`docs/product-vision/conditional-workflow/architecture-jorge.md` §3) and the `/po`
decision log (`DECISION_LOG.md` D-001..D-009) **against the current code**. The
substrate the prior design called "Phase 0" is now **built**: `hub/lib/engine.js`
(closed-grammar evaluator + the single safety validator), `hub/lib/api.js`
(`handle()` control plane + `engineIO`/`runEngineTick`), `hub/lib/write.js` (CAS +
overlay-only + append-only comments), `hub/lib/state.js`/`digest.js` (the projection
the SessionStart hook injects), `hub/lib/guard.js` (the loopback/CSRF posture). These
three tickets are the **Phase 1 packaging + bridge** over that substrate.

---

## Grounding — what already exists (do NOT rebuild)

| Capability the tickets need | Already in code | Consequence for this sprint |
|---|---|---|
| Every control-plane mutation, validated + CAS + typed-comment | `api.handle(route, data, project)` — `ticket/advance`, `gate/set`, `ticket/comment`, `label/set`, `ticket/assign`, `gate/trigger` (require-gate), `workflow/set-rules`, `workflow/set-labels` | **237 re-exposes these tools 1:1. No tool re-implements a mutation.** |
| Engine safety invariants (no gate-pass action; no route past an unmet `safety_override` gate; `settable_by`; require-gate add-only; pattern ReDoS-safe; proto-key neutralization; dedup) | `engine.js` — `DO_ACTIONS` closed set, `routePastUnmetSafetyGate`, `labelSettableBy`, `validateRules`/`validateRule` | **These hold through MCP automatically** because MCP calls `api.handle`, which calls these. 237 adds **no** new validation. |
| Guarded writers (atomic tmp+fsync+rename, ledger CAS on `rev`, overlay-only, append-only JSONL) | `write.js` — `readModifyWriteLedger`, `writeOverlayCAS`, `appendComment` | The **only** mutation path. MCP rides it; nothing else writes. |
| Directives as inert recorded intent | `engineIO.directive()` → `appendComment(kind:"directive", target, body)`; `engine.eventFromComment` returns `null` for `kind:"directive"` (a directive triggers **no** rule) | A directive is **data**, never executed by DART. 238 surfaces it; 237 can write/read it. |
| The SessionStart digest the hook injects | `digest.js renderText(buildState(dir))` shelled by `restore-context.ts` (`HUB_DIGEST … --text`), deterministic-first, exits 0 | 238 extends `renderText` + `buildState` projection — **same single projection**, no second source. |
| Loopback/CSRF/DNS-rebinding posture for the HTTP control plane | `guard.js writeAllowed` (X-AIDT header + Host + Origin + loopback socket) | 237's **stdio** transport replaces the network trust model; D-001 keeps loopback as the only alternative transport. |
| Project resolution as a lookup key, never a path | `resolve-project.js` (12-hex id → `registry.get().path`); `registry.js` canonical root | 237's stdio server is **bound to one project at spawn** (cwd/launch arg) — the simplest, safest resolution. |

**The single most important fact:** the write surface, its CAS, and its safety
invariants are **already centralized behind `api.handle` + the `engine.js` validator**.
237 is a *typed transport adapter*; it MUST NOT contain a parallel writer or a
parallel validator. This is the ratification of **D-002**.

---

## ADT-237 — MCP control-plane server (the write-back heart)

### Decision
**APPROVED.** Ship a **stdio MCP server** that exposes typed tools mapping **1:1**
to the existing control-plane mutations, where **every tool delegates to
`api.handle(route, data, projectDir)`** — the same handler the hub HTTP layer calls.
No tool touches `write.js` or the ledger/overlay directly; no tool re-validates;
no tool executes code.

### Where it lives
A **new low-dependency Node module** that `require()`s `hub/lib/api.js` (and `state`
for reads). The MCP transport uses `@modelcontextprotocol/sdk` (already an
`optionalDependency` of `claude/memory`); the server itself is otherwise
zero-dependency, consistent with the hub. It runs as a **child process the plugin
declares** (D-004) — spawned by Claude Code over **stdio**, never listening on a port.

> **Guardrail (single writer):** the module imports `api.handle` and `state.buildState`
> **only**. It MUST NOT import `write.js` directly, MUST NOT open `.workflow-state.json`,
> MUST NOT construct its own `engineIO`. If a future tool needs a mutation that
> `api.handle` lacks, the mutation is added **to `api.handle`** (one writer), then
> exposed — never forked into the MCP layer.

### Tool surface (1:1 with `api.handle` routes)

**Write tools** (each delegates to the named route; each returns the route's
`{ok|conflict|error, state}` shape verbatim):

| MCP tool | Delegates to route | AC |
|---|---|---|
| `dart_advance_ticket` | `ticket/advance` | AC1 |
| `dart_set_gate` | `gate/set` | AC1, AC4 |
| `dart_comment` | `ticket/comment` | AC1 |
| `dart_set_label` | `label/set` | AC1, AC5 |
| `dart_assign` | `ticket/assign` | AC1 |
| `dart_require_gate` | `gate/trigger` (or the add-only require-gate path) | AC1 |
| `dart_consume_directive` | `ticket/comment` with a typed consumed marker (see 238/D-003) | AC1 (and 238 AC4) |

**Read tools** (pure `buildState` projection — disclose only what the digest already
would, AC2):

| MCP tool | Returns |
|---|---|
| `dart_read_state` | the project's `buildState` projection: tickets, stages, gates, labels contract, active track — **the digest's data, no more** |
| `dart_pending_directives` | the list of un-consumed `kind:"directive"` comments (the recorded `instruct` intents), each with `target[]` + `body` (the prompt) **as quoted data** |

**Every write tool takes `expectedRev`** (forwarded to the CAS writer) so a write
against a stale revision is a **conflict that changes nothing** (AC3) — this is the
existing `readModifyWriteLedger`/`writeOverlayCAS` behavior, unchanged.

### How the safety invariants hold through MCP (the AC4/AC5/AC6 story)
Because every write tool calls `api.handle`:
- **AC4 (no routing past an unmet safety gate):** a `dart_set_gate`/`dart_advance`
  cannot pass or skip a `safety_override` gate — the engine never exposes a
  gate-pass action, and a rule-driven route past an unmet safety gate is refused by
  `routePastUnmetSafetyGate` (used at both author- and eval-time). The MCP path adds
  no route that bypasses this. *Note:* `gate/set` itself is how an **owner agent**
  records a gate decision — that is intended and unchanged; the invariant is that the
  **engine/automation** cannot fabricate a `passed` safety gate, which remains true.
- **AC5 (`settable_by`):** `dart_set_label` → `label/set` → `engine.labelSettableBy`;
  an unauthorized set is **refused and writes nothing** (no label, no comment, no
  route). Unchanged.
- **AC6 (no code-exec):** the MCP module imports nothing from
  `child_process`/`exec`/`spawn`/`ssh` and never `eval()`s; a directive stored via
  `dart_comment`/the instruct path is **inert recorded intent** (`eventFromComment`
  returns `null` for directives). DART never runs a prompt.
- **AC8 (no secret persistence):** tool args are ledger/overlay/comment data only;
  bodies are capped (`MAX_COMMENT_BODY`) and control-char/proto-key sanitized by the
  existing writers. **No tool accepts or stores a credential**; secrets stay env-only.

### Trust boundary — what replaces `X-AIDT` on stdio (AC7, D-001)
The HTTP control plane defends against the browser-CSRF/DNS-rebinding threat with
`guard.js` (X-AIDT header + Host/Origin/loopback-socket). **On stdio that threat
class does not exist:** there is no listening socket, no Host header, no browser
origin — the **parent process (Claude Code) spawns the server and owns the only pipe.**
The trust boundary is therefore **"the OS process boundary on the same machine":**

- **Transport = stdio only by default.** Nothing binds a port. A remote/cross-host
  caller is structurally impossible (there is no network endpoint to reach) — AC7
  holds by construction.
- **If an HTTP-style transport is ever added** (D-001 fallback), it MUST reuse
  `guard.js writeAllowed` **unchanged** (loopback socket + Host + Origin + a CSRF
  header) and default `allowRemote=false`. No new auth model is introduced.
- **Project resolution:** the stdio server is **bound to one project at spawn**
  (its `cwd`, or a launch arg the plugin passes), resolved via the same
  `registry`/`projectRoot` canonicalization. The server does **not** accept a
  client-supplied path or project id that could select an arbitrary directory — it
  mirrors `resolve-project.js`'s "lookup key, never a path" rule, collapsed to the
  single bound project.

> **STRIDE note for `/secops`:** stdio removes Spoofing/Tampering-in-transit and the
> CSRF vector that `guard.js` exists to stop. The residual surface is **a malicious
> *local* process** — out of scope for the single-developer, same-machine model
> (D-001), identical to the existing posture (any local process can already edit the
> ledger files directly). The MCP server grants **no new authority** a local actor
> didn't already have via the filesystem; it only makes the *guarded, validated* path
> available to the cooperating main tool.

---

## ADT-238 — Directive surfacing (DART → main tool)

### Decision
**APPROVED.** Extend the **single** projection (`buildState`) and the **single**
digest renderer (`digest.js renderText`, shelled by `restore-context.ts`) to surface,
per active ticket: (a) the **pending directives addressed to an agent** (the
un-consumed `kind:"directive"` comments), rendered with their `target[]` and prompt
**as quoted data**; and (b) the **labels the current stage's owner may set** and what
each routes to, **rendered from the workflow `labels:` contract** — the same source
the `label/set` enforcement reads (`engine.labelSettableBy`). One source feeds both,
so they cannot drift (AC2/AC3 parity).

### "Pending" + "mark consumed" (D-003) — the explicit guarded write
A directive is **recorded intent (inert data)** until acted on. Consumption is an
**explicit, audited, idempotent guarded write**, never auto-clear-on-read:

- **State location:** a directive is consumed by appending a **typed consumed marker
  comment** that references the directive's `id` (the JSONL record id), written
  through `appendComment` via `api.handle('ticket/comment', …)` — i.e. the **same CAS/
  append-only writer**, no new store, no new bypass. `dart_consume_directive` (237)
  is the tool that performs it.
- **Pending = derived:** the projection computes "pending directives" as
  *`kind:"directive"` records whose `id` has no matching consumed marker.* This makes
  consumption **idempotent** (a second consume of the same id is a no-op against the
  derived set) and **durable** — an un-consumed directive **survives a session restart**
  (AC5), because it lives in the append-only log, not session memory.
- **Audited:** the consumed marker carries `author` (the agent that handled it) + `ts`,
  so "I handled it" is a deliberate recorded act (D-003).

> **Why a marker comment, not a ledger flag:** the comment log is already the
> append-only audit stream the engine derives events from; a consumed marker is the
> same shape as every other typed record, rides the same writer, and needs **zero**
> new schema on the ledger. A ledger flag would add a second write target and a CAS
> surface for no benefit.

### Security posture of the surface (AC6/AC7/AC8)
- **AC6 (inert data):** a directive prompt — even one full of instruction-like or
  injection-like text — is rendered **verbatim as quoted data** in the digest. DART
  never evaluates it; `eventFromComment` already returns `null` for directives so the
  engine never acts on one. Only the **addressed agent in the main tool** may choose
  to act. The digest renderer MUST quote/escape the prompt as data (no interpolation
  into instructions).
- **AC7 (no secret leak):** the surface projects **only** `buildState` data the digest
  already exposes — no config, no API key, no `~/.aidevteam/config.json` secret field.
- **AC8 (resilience):** the surfacing path stays **best-effort, exits cleanly**
  (`restore-context.ts` already prints the deterministic digest first, time-boxes
  recall, and exits 0). When the hub/Core is unavailable it **falls back to the
  deterministic digest** — never hangs or breaks a session. The new directive section
  is part of the deterministic digest (file-derived), so it survives a hub outage.

---

## ADT-239 — Plugin packaging + namespacing + per-project opt-in

### Decision
**APPROVED.** Package the **existing** `claude/skills` + `claude/workflow` + the
session hooks + the 237 MCP server as **one versioned Claude Code plugin** in an
**in-repo plugin directory** (D-004), reachable under a **`dart:` namespace**, **opt-in
per project** (D-006), at **plugin-layer (lowest) precedence** so the user's own
config always wins. `install.sh --user` stays as the un-namespaced fallback (D-008).

### Plugin manifest + layout (in-repo, D-004)
A `.claude-plugin/` packaging that **reuses the same source already in this repo**
(no fork):

```
.claude-plugin/
  plugin.json            # manifest: name "dart", version, description (NO secrets)
  commands/  → the 48 command files (namespaced dart:* — see below)
  skills/    → claude/skills/** (workflow-engine + the 15-agent team)
  hooks/hooks.json       # SessionStart digest (238) + PreCompact save — the existing hooks
  .mcp.json              # declares the 237 stdio MCP server (command + args, env passthrough)
```

- **Manifest carries no secret** (AC6): `plugin.json` and `.mcp.json` declare the MCP
  server's **command/args** and **env-var names to pass through** (e.g. `VOYAGE_API_KEY`),
  never a key value. Keys remain env-only — the same posture ADT-202 already enforces.
- **One unit (AC1):** the plugin bundles the team, the workflow-engine, the hooks, and
  the write-back MCP server (the very components from 237/238 — not a fork).

### Namespacing (AC2) — cannot clobber the user
Every DART command/skill is reachable under **`dart:`** (`/dart:arch`, `/dart:rev`,
`/dart:be`, …). A user's existing `/arch`, `/rev`, `/deploy` are **untouched**; on a
name collision the **user's component wins** because the plugin layer is **lowest
precedence** (enterprise > user > project > plugin). This is AC3 (no clobber) by the
platform's own precedence model, not by DART logic.

### Per-project opt-in (AC4, D-006) — inert until enabled
DART is enabled by a **per-project action** (the project references/enables the `dart`
plugin in its **own** settings). DART is **inert** in a project that has not opted in
and **absent** where it never opts in. DART **never writes into the user's `~/.claude`
outside the plugin's own directory** — the bidirectional channel is the plugin's own
`hooks.json`/`.mcp.json`, not a mutation of `~/.claude/settings.json` (this removes the
`settings.ts` upsert as the clobber risk the prior design flagged).

### Precedence + reversibility + enterprise interaction (AC3/AC5/AC7)
- **Augments, never overrides:** the user's config is sovereign; DART sits underneath
  as an opt-in layer (AC3).
- **Inherited security (AC5):** the bundled MCP server keeps 237's stdio/no-code-exec
  posture; the bundled hooks keep 238's read-only / exit-cleanly / no-secret posture.
  Packaging changes the *transport/discovery*, not the *trust model*.
- **Reversible (AC7):** disabling the plugin removes all DART influence; a colliding
  user command/hook is untouched throughout. **Document** the managed/enterprise
  interaction (a force-disabled plugin cannot self-re-enable; `--plugin-dir` cannot
  override an enterprise force-disable) — this is risk R6 from the prior design, now a
  documentation obligation, not a code path.
- **Fallback (AC8):** `install.sh --user` remains a working, un-namespaced global
  install of the same source.

### Kiro portability (note, not in scope this sprint)
The intent layer is **plain files** (ledger JSON, overlay JSON, JSONL comments, the
`rules:`/`labels:` YAML) and the bridge is the **MCP server + the digest projection**.
A Kiro port is a **thin renderer** (a `.kiro/steering/` doc rendered from the same
`digest.js` projection) + the **same MCP write-back** (Kiro speaks MCP). **Zero DART
semantics live in host glue** — the host integration is an Anti-Corruption-Layer
adapter, never the brain. No Kiro code ships this sprint; the architecture keeps it a
later additive adapter.

---

## What `/secops` MUST hard-verify (the SECOPS gate is HARD, safety-override)

The MCP write-back is a **new entry point that mutates the ledger/overlay**. `/secops`
must verify it enforces the **same** guard/CAS/overlay-only/containment as the HTTP
control plane, with **no new bypass**. Precise list:

1. **Single writer (no second mutation path).** The MCP module mutates **only** via
   `api.handle`; it does **not** import `write.js`, does **not** open
   `.workflow-state.json`/the overlay, and constructs **no** parallel `engineIO`.
   *Test:* grep the module for `write.js`/`fs.write*`/ledger-path access → none.
2. **Engine safety invariants hold through MCP.**
   - A `dart_advance`/`dart_set_gate` **cannot route a ticket past an unmet
     `safety_override` gate** (AC4) — verify against `routePastUnmetSafetyGate`.
   - The engine exposes **no gate-pass/clear action**; the MCP surface adds none.
   - `dart_set_label` honors **`settable_by`** — an unauthorized set **writes nothing**
     (no label, no comment, no route) (AC5).
   - `dart_require_gate` is **add-only** (never removes/satisfies a gate).
3. **CAS / overlay-only / containment preserved.** Every write tool forwards
   `expectedRev`; a stale write is a **conflict that changes nothing** (AC3). The base
   `workflow.yaml` is never written (overlay-only). Comment ids/bodies stay sanitized
   and capped by the existing writers.
4. **No code-exec via a tool (AC6).** No tool spawns a process, shells out, `eval`s,
   or writes an arbitrary file. A directive stored via the tools is **inert recorded
   intent**; DART never runs it. *Verify the import graph is free of
   `child_process`/`exec`/`spawn`/`ssh`/`vm`.*
5. **stdio trust model (AC7, D-001).** Default transport is **stdio, same-machine** —
   no listening port. A remote/cross-host caller is refused (structurally, no
   endpoint). If a loopback HTTP transport is offered, it reuses `guard.js writeAllowed`
   **unchanged** with `allowRemote=false`. Project resolution is the **bound project
   only** (no client-supplied path).
6. **No secret exposure.** Tool args never persist a credential into
   ledger/overlay/comments (AC8). The **plugin manifest/.mcp.json carry no secret**
   (AC6 of 239) — only env-var **names** to pass through; keys stay env-only.
7. **Directive prompts are untrusted data.** The surfaced prompt (238) is rendered
   **verbatim as quoted data**; DART never evaluates it (`eventFromComment` → `null`
   for directives). Only the addressed agent may act. The digest must not interpolate a
   prompt into an instruction position.
8. **Surfacing is read-only + resilient.** The 238 path exposes only `buildState`
   data the digest already exposes (no secret), **exits cleanly**, and **falls back to
   the deterministic digest** when the hub/Core is unavailable (AC7/AC8) — it never
   hangs or breaks a session.
9. **No-clobber / opt-in (239).** Enabling the plugin does **not** modify the user's
   own settings/commands/skills/hooks; on collision the **user wins** (lowest
   precedence + `dart:` namespace). DART is **inert until per-project opt-in** and
   **reversible** on disable. DART writes nothing into `~/.claude` outside the plugin's
   own directory. Document the enterprise force-disable interaction.

`/secops` ratifies **D-001** (stdio/loopback trust), **D-003** (consumed-marker
guarded write), and **D-006** (no-clobber/opt-in/no-secret install) at this HARD gate
**before** any implementation, per the decision log.

---

## Risks & trade-offs (ATAM-style)

| # | Risk / trade-off | Sensitivity | Mitigation |
|---|---|---|---|
| A1 | **A second writer creeps into the MCP module** (someone adds a `write.js` call for "convenience"), forking the safety invariants. | Security (high) | Hard architectural rule: MCP imports `api.handle`/`state` only. `/secops` test #1 (import grep). Any new mutation goes into `api.handle` first. |
| A2 | **stdio assumed safe ⇒ a future HTTP transport ships without the guard.** | Security (high) | D-001 mandates `guard.js writeAllowed` unchanged + `allowRemote=false` for any non-stdio transport. Flag at review. |
| A3 | **Consumed-marker derivation O(n) per ticket** as the comment log grows. | Performance (low) | Logs are per-ticket and small for the single-dev model; acceptable. Revisit with a compacted index only if real. |
| A4 | **Directive prompt rendered into an instruction position** (digest interpolation bug) → prompt-injection into the session. | Security (high) | 238 renders prompts as **quoted data**; `/secops` test #7. Treat the prompt as untrusted by construction. |
| A5 | **Plugin precedence surprise** — enterprise managed settings force-enable/disable the plugin; `--plugin-dir` can't override. | Integration (med) | Default opt-in per project; **document** the enterprise interaction (AC7). Never rely on overriding a force-disabled state. |
| A6 | **Concurrent local process races the MCP write.** | Reliability (low) | The existing in-process mutex + CAS in `write.js` returns `{conflict}` and the tool reports it (AC3). Cross-process write-safety is out of scope per the single-dev model (same as the registry today). |
| A7 | **`@modelcontextprotocol/sdk` supply-chain.** | Supply chain (med) | Pin + lockfile (already an `optionalDependency`); `/secops` SCA on the dep. Server logic stays otherwise zero-dependency. |

---

## Decision record

- **ADT-237 — APPROVED.** stdio MCP server, tools 1:1 with `api.handle`, **delegating
  to the existing handlers/writers (D-002)** — no second writer, no second validator,
  no code-exec; stdio same-machine trust (D-001); bound-project resolution; secrets
  env-only.
- **ADT-238 — APPROVED.** Extend the **single** `buildState`/`digest` projection to
  surface pending directives (inert quoted data) + the stage's permitted labels from
  the **one** `labels:` contract (parity with enforcement); **consume = explicit
  guarded marker write (D-003)**, idempotent + durable + audited; read-only,
  resilient, exits cleanly.
- **ADT-239 — APPROVED.** In-repo `.claude-plugin/` packaging (D-004) of the existing
  source; `dart:` namespacing; per-project opt-in (D-006); plugin-layer (lowest)
  precedence — augments-never-overrides; inherited 237/238 security; reversible;
  `install.sh --user` fallback (D-008); follows 237+238 (D-005). Kiro is a later
  additive adapter.

**Gate:** `ARCH_APPROVED → passed` for ADT-237 / ADT-238 / ADT-239. The **HARD**
`SECOPS_APPROVED` gate (safety-override) must pass on the list above **before** any
implementation begins.
