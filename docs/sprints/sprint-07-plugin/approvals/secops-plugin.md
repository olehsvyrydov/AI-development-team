# Security Review: DART as a Claude Code plugin (ADT-237 / ADT-238 / ADT-239)

**Reviewed By**: /secops (Soren)
**Date**: 2026-06-10
**Branch**: feat/dart-plugin
**Tickets**: ADT-237 (MCP control-plane server), ADT-238 (directive surfacing), ADT-239 (plugin packaging)
**Gate**: `SECOPS_APPROVED` — **HARD, safety-override**. Cannot be downgraded or skipped.
**Status**: **APPROVED WITH CONDITIONS** for all three tickets.

This gate ratifies **D-001** (stdio/loopback trust), **D-003** (consumed-marker guarded write),
and **D-006** (no-clobber / opt-in / no-secret install) **before** any implementation begins,
per `DECISION_LOG.md` open items.

---

## What I verified in source (not on the design's assertion)

Per "verify a reused control exists in source before crediting it," I read every control
Jorge's ADR leans on. Findings:

| Reused control claimed | Read in source | Verdict |
|---|---|---|
| Single mutation surface = `api.handle` | `hub/lib/api.js` — every route writes only via `w.readModifyWriteLedger` / `w.writeOverlayCAS` / `w.appendComment` | **Present.** |
| Closed do-allowlist with NO gate-pass action | `engine.js` `DO_ACTIONS` = `{set_label, clear_label, route_to_stage, assign, require_gate, instruct, fan_out}` — no `set_gate`/`pass_gate`/`clear_gate` | **Present.** |
| No route past an unmet safety gate | `engine.js routePastUnmetSafetyGate`, applied at author-time (`validateAction` → `route_to_stage`) AND eval-time (`apply` → `route_to_stage`) | **Present, single validator.** |
| `settable_by` enforced | `engine.js labelSettableBy`, called by `api.handle('label/set')` and `apply('set_label')`; unauthorized → `bad(...)`, writes nothing | **Present.** |
| `require_gate` add-only | `engineIO.requireGate` appends to `requiredGates`, never sets gate state | **Present.** |
| Directives inert | `engine.eventFromComment` returns `null` for `kind:"directive"`; `engineIO.directive` is "recorded only" | **Present.** |
| CAS / overlay-only / append-only | `write.js` — `readModifyWriteLedger` (CAS on `rev`), `writeOverlayCAS`, `appendComment`; base `workflow.yaml` never written | **Present.** |
| HTTP guard | `guard.js writeAllowed` — X-AIDT + Host + Origin + loopback socket, `allowRemote` default off | **Present.** |
| Project id = lookup key, never a path | `resolve-project.js` (12-hex `HEX_ID`, `registry.get`), `registry.js canonicalRoot` | **Present.** |
| Deterministic-first, exit-0 surfacing | `restore-context.ts` prints digest first, time-boxes recall (`withDeadline`), `process.exit(0)` always | **Present.** |

**NET-NEW — not yet written, must NOT be credited as a passing mitigation until it exists
and is tested:**

- **The ADT-237 MCP server module itself does not exist** (no `.mcp.json`, no server source
  in the repo). Its safety story is entirely "it *will* delegate to `api.handle` and import
  nothing dangerous." That is a claim about code not yet written. Per "gate execution / RCE-class
  surfaces separately, each with its own pass," this foundation must **prove the negative** with
  an import-graph / source-scan test, not assume it.
- **The ADT-238 directive section of the digest renderer does not exist.** The current
  `digest.js renderText` interpolates only ticket id / stage / title (controlled ledger fields).
  The new directive/label section is the **net-new prompt-injection surface** and must be built
  to render verbatim quoted data.
- **The `.claude-plugin/` packaging (ADT-239) does not exist.** Its no-clobber / no-secret /
  reversible posture is unimplemented and must be proven.

Conditional approval is therefore **contingent on the C-conditions below being met in the
net-new code and proven by the N-tests**; `/rev` and `/verify` confirm each before the
respective CODE_REVIEWED / VERIFIED gate passes.

---

## ADT-237 — MCP control-plane server — Conditions

**C237-1 (Single writer — no second mutation path).** The MCP server module's import graph
MUST reach the ledger/overlay/comment log **only** through `api.handle` (and `state.buildState`
for reads). It MUST NOT `require('.../write.js')`, MUST NOT open `.workflow-state.json` or
`.aidevteam/workflow.overrides.json`, MUST NOT call `fs.write*` / `fs.appendFile*` against any
project file, and MUST NOT construct its own `engineIO`. A new mutation, if ever needed, is
added to `api.handle` first, then exposed — never forked into the MCP layer. *(Prove: N237-1.)*

**C237-2 (Engine safety invariants hold through every write tool).** Because each write tool
delegates to `api.handle`, the engine invariants hold automatically — but this MUST be proven
through the MCP tool surface, not assumed:
- **(a)** `dart_advance_ticket` / `dart_set_gate` cannot move a ticket past or skip an unmet
  `safety_override` gate (`routePastUnmetSafetyGate`). The MCP surface adds **no** route that
  bypasses this.
- **(b)** There is **NO** gate-pass / gate-clear / gate-satisfy tool or action. `dart_set_gate`
  records an owner agent's gate decision (intended, unchanged); it can set `pending|passed|rejected`
  per `GATE_STATES`, but the **engine/automation** can never fabricate a `passed` safety gate.
  The MCP layer adds no tool that lets automation set a gate it didn't earn.
- **(c)** `dart_set_label` honors `settable_by`: a set by an agent not in the label's
  `settable_by` (and not `*`) is refused and writes **nothing** — no label, no comment, no route.
- **(d)** `dart_require_gate` is **add-only** — it can append a required gate, never remove,
  satisfy, or pass one.
*(Prove: N237-2a..d.)*

**C237-3 (CAS / overlay-only / containment preserved).** Every write tool accepts and forwards
`expectedRev` to the existing CAS writer. A write against a stale revision returns a **conflict**
and changes **nothing** (no ledger byte, no comment, no overlay byte). The base `workflow.yaml`
is **never** written (overlay-only). Comment bodies stay capped (`MAX_COMMENT_BODY`) and
control-char / proto-key sanitized by the existing writers — the MCP layer adds no path that
skips the cap or the sanitizer. *(Prove: N237-3, N237-3b.)*

**C237-4 (No code execution via a tool — prove the negative).** The MCP module's import graph
MUST be free of `child_process`, `exec`, `execSync`, `spawn`, `fork`, `ssh`, `vm`, and MUST NOT
call `eval` / `new Function`. No tool spawns a process, shells out, evaluates a string, or writes
an arbitrary file path. A directive stored via `dart_comment` / the instruct path is **inert
recorded intent** (`eventFromComment` → `null` for `kind:"directive"`); DART never executes a
directive prompt. A tool **argument** (target, prompt, body, label, stage) can **never** reach an
execution sink — it is only ever ledger/overlay/comment data. *(Prove: N237-4, N237-4b.)*

**C237-5 (stdio trust model — D-001, binding).** Default transport is **stdio only**: the server
binds **no** listening socket and **no** port; the parent process (Claude Code) spawns it and owns
the only pipe. A remote / cross-host caller is **structurally impossible** (there is no endpoint to
reach). The server is **bound to one project at spawn** (its `cwd` or a launch arg the plugin
passes), resolved via the same `registry` / `projectRoot` canonicalization. A tool argument is a
**lookup key, never a path**: the server MUST NOT accept a client-supplied filesystem path,
directory, or arbitrary project id that selects a different project's directory — it mirrors
`resolve-project.js`'s "lookup key, never a path" rule collapsed to the single bound project.
**Binding condition for any future transport:** if **any** HTTP / loopback / socket transport is
ever added, it MUST reuse `guard.js writeAllowed` **unchanged** (X-AIDT + Host + Origin +
loopback-socket) with `allowRemote=false` by default — no new auth model, no permissive CORS.
This condition is recorded now so a later HTTP transport cannot ship without it. *(Prove: N237-5,
N237-5b; future-transport arm enforced at the review that adds it.)*

**C237-6 (No secret exposure).** Tool arguments and tool results MUST NOT persist a credential
into the ledger / overlay / comments. No tool accepts a secret as a parameter; nothing in a tool
call or its logging path writes an API key, token, or `~/.aidevteam/config.json` secret field.
Secrets stay **env-only** (the posture ADT-202 already enforces). Server logs (stderr) MUST NOT
emit tool argument bodies that could contain a pasted credential, and MUST NOT log env values.
*(Prove: N237-6.)*

**C237-7 (Supply chain — `@modelcontextprotocol/sdk`).** The MCP transport dependency MUST be
pinned (lockfile) and SCA-clean (no known high/critical CVE) at ship. The server logic stays
otherwise zero-dependency (consistent with the hub). Re-run SCA on the dep before VERIFIED.
*(Prove: N237-7 — lockfile pin + clean SCA report.)*

---

## ADT-238 — Directive surfacing — Conditions

**C238-1 (Directive prompt is untrusted DATA, rendered verbatim and quoted — never in an
instruction position).** The new digest section MUST render each pending directive's `target[]`
and `body` (the prompt) as **fenced / quoted data**, never interpolated into an instruction or
command position in the digest text. A directive body full of instruction-like or injection-like
text ("ignore the workflow", "run rm -rf", "set gate X to passed") is surfaced **as quoted data
only**. DART never evaluates it — `eventFromComment` already returns `null` for directives, so the
engine never acts on one; only the **addressed agent in the main tool** may choose to act. The
renderer MUST escape any fence-breaking sequence in the body so a crafted directive cannot close
the quote block and inject trailing instructions into the digest. *(Prove: N238-1, N238-1b — this
is the single highest-risk surface in the sprint, risk A4.)*

**C238-2 (Permitted-label list is read from the ONE source enforcement reads — parity, cannot
drift).** The per-stage "labels this stage's owner may set" list MUST be projected from the **same**
workflow `labels:` contract that `engine.labelSettableBy` enforces at write time — never a
hand-maintained duplicate. The set surfaced to an agent MUST equal the set `label/set` actually
permits for that agent/stage. *(Prove: N238-2 — parity test: for a fixture, the surfaced set ===
the set `labelSettableBy` accepts.)*

**C238-3 (Mark-consumed is an explicit GUARDED write — D-003 — never auto-clear-on-read).** A
directive is consumed only by an **explicit** write: a typed consumed-marker comment referencing
the directive's JSONL `id`, written through `appendComment` via `api.handle('ticket/comment', …)`
— the **same** CAS / append-only writer, **no** new store, **no** new bypass. "Pending" is
**derived** as `kind:"directive"` records whose `id` has no matching consumed marker. This makes
consumption **idempotent** (a second consume of the same id is a no-op against the derived set).
Surfacing (reading the digest) MUST NOT mutate anything. *(Prove: N238-3, N238-3b.)*

**C238-4 (Durable — survives a session restart).** An un-consumed directive MUST still appear
after a session restart, because it lives in the append-only comment log, not session memory. The
new directive section MUST be part of the **deterministic, file-derived** digest (not the
best-effort recall pass), so it survives a hub/Core outage. *(Prove: N238-4.)*

**C238-5 (Surfacing is READ-ONLY, no secret leak).** The new section MUST project **only**
`buildState` data the digest already exposes — no config field, no API key, no
`~/.aidevteam/config.json` secret. It introduces **no** new read of any secret-bearing file.
*(Prove: N238-5.)*

**C238-6 (Resilient — exits cleanly, deterministic fallback).** The surfacing path MUST remain
best-effort: it MUST NOT hang or break a session, MUST `exit 0`, and MUST fall back to the
deterministic digest when the hub / Core is unavailable (`restore-context.ts` already prints the
deterministic digest first and time-boxes recall — the directive section must live in that
deterministic floor). *(Prove: N238-6.)*

---

## ADT-239 — Plugin packaging — Conditions

**C239-1 (No clobber — the user always wins).** Enabling the plugin MUST NOT modify or overwrite
the user's own `~/.claude/settings.json`, commands, skills, or hooks. DART ships its components
inside the plugin's own directory under a `dart:` namespace; on a name collision the **user's**
component wins by the platform precedence model (enterprise > user > project > plugin), **not** by
DART logic. There is **no** `settings.ts`-style upsert into the user's `~/.claude` outside the
plugin's own dir. *(Prove: N239-1, N239-1b.)*

**C239-2 (Namespaced — no collision).** Every DART command and skill is reachable under `dart:`
(`/dart:arch`, `/dart:rev`, …). A user's existing `/arch`, `/rev`, `/deploy` are untouched and
remain resolvable. *(Prove: N239-2.)*

**C239-3 (Per-project opt-in — inert until enabled).** DART is **inert** in a project that has not
explicitly enabled it and **absent** where it never opts in. Enabling is a per-project action in
the project's own settings. The bundled MCP server is **not** spawned and the bundled hooks are
**not** active in a non-opted-in project. *(Prove: N239-3, N239-3b.)*

**C239-4 (No secret in the manifest or any shipped file).** `plugin.json` and `.mcp.json` MUST
declare only the MCP server's **command / args** and the env-var **names** to pass through (e.g.
`VOYAGE_API_KEY`) — **never** a key value. No secret or credential is baked into the manifest,
the hooks file, or any shipped file. Keys stay **env-only**. *(Prove: N239-4 — grep the entire
shipped plugin tree for secret-shaped values.)*

**C239-5 (Inherited security — packaging changes transport, not trust).** The bundled MCP server
MUST keep ADT-237's stdio / no-code-exec posture (C237-1..6); the bundled hooks MUST keep
ADT-238's read-only / exit-0 / no-secret posture (C238-5/6). Packaging changes
*discovery/transport*, never the *trust model*. *(Prove: the 237/238 N-tests run against the
packaged artifact too.)*

**C239-6 (Reversible — disable removes all influence).** Disabling the plugin MUST remove all DART
influence (commands, skills, hooks, MCP server); a colliding user command/hook is untouched
throughout and remains after disable. *(Prove: N239-5.)*

**C239-7 (Document the enterprise force-disable interaction).** The managed/enterprise-settings
interaction MUST be documented: a force-disabled plugin cannot self-re-enable, and `--plugin-dir`
cannot override an enterprise force-disable. DART MUST NOT contain any code path that attempts to
re-enable itself against a managed disable. *(Prove: N239-6 — documentation present + no
self-re-enable code path.)*

---

## Negative-test checklist `/rev` (and `/verify`) MUST confirm

Each test below MUST **fail if its control is removed** — that is the acceptance bar. Asserting a
refusal status is insufficient where state is involved: **also assert no write occurred** (no
ledger byte changed, no comment appended, no overlay byte changed).

### ADT-237 — MCP control-plane server
- **N237-1 — single writer (import-graph / source scan).** Static scan of the MCP module + its
  transitive own imports finds **no** `require('write.js')`, **no** `.workflow-state.json` /
  `workflow.overrides.json` open, **no** `fs.write*` / `fs.appendFile*` to a project file, **no**
  hand-built `engineIO`. *Remove the rule that funnels writes through `api.handle` (add a direct
  `fs.appendFileSync`) → the scan flags a second mutation path → test fails.*
- **N237-2a — safety-gate not routable past (via the tool).** `dart_advance_ticket` /
  `dart_set_gate` invoked to move a ticket past an **unmet** `safety_override` gate is refused and
  the ledger stage is **unchanged**. *Remove `routePastUnmetSafetyGate` from the route → the move
  succeeds → test fails.*
- **N237-2b — no gate-pass tool exists.** Enumerate the MCP tool surface: there is **no** tool/
  action that sets a gate to `passed` on behalf of the engine/automation; automation cannot
  fabricate a `passed` safety gate. *Add a `dart_pass_gate` automation shortcut → test fails.*
- **N237-2c — unauthorized label set writes nothing.** `dart_set_label` by an agent not in the
  label's `settable_by` is refused; **no** label added, **no** comment appended, **no** route.
  *Remove the `labelSettableBy` check → the label is written → test fails.*
- **N237-2d — require_gate is add-only.** `dart_require_gate` can append a required gate but has
  **no** form that removes or satisfies one. *Add a remove/satisfy branch → test fails.*
- **N237-3 — stale-rev write conflicts, clobbers nothing.** A write tool called with a stale
  `expectedRev` returns `{conflict}`; the ledger / overlay / comment log is **byte-unchanged**.
  *Drop the `expectedRev` forward → the stale write clobbers → test fails.*
- **N237-3b — base workflow.yaml never written.** After any overlay-mutating tool, the base
  `workflow.yaml` is byte-unchanged; only the JSON overlay moved. *Point a writer at the base →
  test fails.*
- **N237-4 — no-exec import graph.** Static scan: the MCP module's import graph is free of
  `child_process` / `exec` / `execSync` / `spawn` / `fork` / `ssh` / `vm`, and contains no
  `eval` / `new Function`. *Add a `child_process` import → test fails.*
- **N237-4b — a directive arg cannot cause execution.** A `dart_comment` / instruct call whose
  body/prompt is `"$(rm -rf ~)"` / `"; reboot"` is stored as inert text (`kind:"directive"` →
  `eventFromComment` null); nothing is spawned or evaluated. *Wire the prompt to any exec sink →
  test fails.*
- **N237-5 — no listening socket / port.** The spawned server opens **no** TCP/listening socket;
  there is no remote endpoint. *Add a `.listen(port)` → test fails.*
- **N237-5b — bound project only (no retarget).** A tool argument carrying a foreign project path
  or a different project id does **not** retarget another project's directory; the server only ever
  writes to the project it was bound to at spawn. *Honor a client-supplied path field → the write
  lands in the wrong project → test fails.*
- **N237-6 — no secret persisted / logged.** A tool call carrying a credential-shaped argument
  does not write that value into the ledger / overlay / comments, and the server's stderr does not
  emit it. *(Defense-in-depth, label-anchored + entropy heuristic — not a guarantee; the primary
  control is that no tool accepts a secret parameter at all.)* *Add a path that echoes args to a
  persisted log → test fails.*
- **N237-7 — SDK pinned + SCA-clean.** Lockfile pins `@modelcontextprotocol/sdk`; SCA reports no
  high/critical CVE. *Unpin / introduce a vulnerable version → test fails.*

### ADT-238 — Directive surfacing
- **N238-1 — directive rendered as quoted data, never executed.** A directive whose body contains
  instruction/injection text is surfaced **verbatim inside the quoted block**; DART takes no action
  on it (the engine derives **no** event from a `kind:"directive"` record). *Interpolate the body
  into an instruction position → test fails.*
- **N238-1b — fence-break escaping.** A directive body containing the quote/fence delimiter cannot
  close the quoted block and inject trailing un-quoted instructions into the digest. *Remove the
  escaping → a crafted body breaks out of the fence → test fails.*
- **N238-2 — permitted-label parity.** For a fixture stage/agent, the permitted-label set shown in
  the digest **equals** the set `engine.labelSettableBy` accepts; they cannot drift. *Hand-maintain
  a second list that diverges → test fails.*
- **N238-3 — consume rides the CAS writer; pending is derived.** Marking a directive consumed
  appends a typed consumed-marker comment via `api.handle('ticket/comment')` (CAS / append-only),
  and the directive no longer appears pending. *Route consume through a non-`api.handle` write →
  test fails.*
- **N238-3b — surfacing is read-only (no auto-clear).** Rendering/reading the digest mutates
  **nothing** — a pending directive stays pending until an explicit consume. *Add an
  auto-clear-on-read → a crashed session silently drops the directive → test fails.*
- **N238-4 — durable across restart.** An un-consumed directive still appears after a simulated
  session restart (re-derived from the append-only log) and is part of the **deterministic**
  digest. *Hold pending state in session memory → test fails.*
- **N238-5 — no secret leak in the digest.** The directive/label section renders **no** config or
  secret field — only `buildState` data the digest already exposes. *Add a field that reads a
  secret-bearing file → test fails.*
- **N238-6 — exits cleanly with hub down.** With the hub/Core unavailable, the surfacing path
  still emits the deterministic digest (incl. the directive section) and exits 0 — never hangs.
  *Make the directive section depend on a live hub call without fallback → test fails / hangs.*

### ADT-239 — Plugin packaging
- **N239-1 — no clobber of user config.** Enabling the plugin leaves a user-defined `/arch` and a
  user `SessionStart` hook **intact and winning**; the user's `~/.claude/settings.json` is
  byte-unchanged. *Add an upsert into the user's settings → test fails.*
- **N239-1b — writes stay inside the plugin dir.** Enabling/using the plugin writes **nothing**
  into `~/.claude` outside the plugin's own directory. *Add a write outside the plugin dir → test
  fails.*
- **N239-2 — namespacing.** Every DART command/skill resolves under `dart:`; a user's same-named
  command is unaffected. *Drop the namespace → a collision shadows the user's command → test fails.*
- **N239-3 — inert until opt-in.** In a project that has not enabled DART, the bundled MCP server
  is not spawned and the bundled hooks do not run. *Make the plugin active without opt-in → test
  fails.*
- **N239-3b — absent where never enabled.** A project that never opts in shows no DART commands/
  skills/hooks. *Auto-enable globally → test fails.*
- **N239-4 — no secret in manifest / shipped files.** Grep the entire shipped plugin tree
  (`plugin.json`, `.mcp.json`, hooks, commands, skills) finds env-var **names** only, no key
  values / secret-shaped strings. *Bake a key into `.mcp.json` → test fails.*
- **N239-5 — reversible.** Disabling the plugin removes all DART commands/skills/hooks/MCP
  influence; a colliding user command/hook remains and still wins. *Leave a residual hook after
  disable → test fails.*
- **N239-6 — enterprise force-disable documented + no self-re-enable.** Documentation states a
  force-disabled plugin cannot self-re-enable and `--plugin-dir` cannot override it; no DART code
  path attempts to re-enable against a managed disable. *Add a self-re-enable path → test fails.*

---

## Conditions for Approval (summary)

- [ ] ADT-237: C237-1 .. C237-7 met in the net-new MCP module; N237-* all pass.
- [ ] ADT-238: C238-1 .. C238-6 met in the net-new digest section; N238-* all pass.
- [ ] ADT-239: C239-1 .. C239-7 met in the net-new packaging; N239-* all pass.
- [ ] Every N-test demonstrably **fails when its control is removed** (not a status-only assertion;
      assert no-write where state is involved).
- [ ] `@modelcontextprotocol/sdk` pinned + SCA-clean before VERIFIED.

**Binding forward condition:** any non-stdio (HTTP / loopback / socket) transport added later MUST
reuse `guard.js writeAllowed` unchanged with `allowRemote=false` and no permissive CORS — re-trips
this HARD gate at the change that introduces it.

**Gate decision:** `SECOPS_APPROVED → passed (conditional)` for ADT-237 / ADT-238 / ADT-239. The
conditions above are the acceptance bar for CODE_REVIEWED and VERIFIED. No implementation may treat
a net-new "reused control" as satisfied until the control exists in source and its N-test passes.

/sm - please update sprint status.
