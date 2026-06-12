# Sprint 10 — Tickets (behavior-only)

Behavioral acceptance criteria — WHAT, not HOW. The ledger (`.workflow-state.json`) holds the gate plan;
the architecture/implementation details belong in the ARCH/IMPL artifacts, not here.

---

## ADT-241 — Two-command public-git install of the DART plugin

**Implementer:** /be (packaging + docs) · **Verify:** /verify (fresh-clone) · **Size:** standard (small)
**Track:** standard · **Stage:** ready

### Acceptance criteria
1. From a fresh clone of the PUBLIC repo (clean state, no prior install), `claude plugin marketplace add <owner/repo>` registers the DART marketplace and `claude plugin install dart@dart` installs the `dart` plugin in two commands — NO manual clone step.
2. After install + enable, the dart:-namespaced commands resolve, the SessionStart and UserPromptSubmit hooks fire, and the control-plane MCP server is listed/connectable — all loaded from the INSTALLED plugin, not the local working tree.
3. The plugin stays opt-in: `defaultEnabled:false` holds; nothing is enabled for a project until the user enables it; the user's own same-named commands win.
4. The README/install section documents the exact 2-command flow, the OPTIONAL npm-source marketplace entry as a registry-distribution alternative, and explicitly states there is NO npx/`npm install` one-liner (npm is only a marketplace source).
5. The install docs name the optional memory/overlay env vars (`OPENMEMORY_BASE_URL`, `OPENMEMORY_API_KEY`, `MEM0_API_KEY`), state they are env-only (never written to config/manifest), and that the overlay is OFF by default with zero egress when unconfigured.
6. A fresh-clone install verification is captured (commands + hooks + MCP all load); the in-app proof on the live public repo is recorded as the remaining human step.

### Gate plan
- **ARCH_APPROVED** — light/soft (no new boundary/dependency; confirm manifest paths + marketplace source resolve from a fresh clone).
- **SECOPS_APPROVED** — light note (install/trust touched, no new egress; verify no secret in manifest/project, opt-in default holds; escalates to HARD only if trust posture changes).
- **CODE_REVIEWED** — standard (docs/manifest accuracy + facts-only; 2-command claim literally reproducible; no-npx caveat present).
- **VERIFIED** — fresh-clone install audit (commands + both hooks + MCP load from the installed plugin; no secret in project; flag the in-app human proof).

---

## ADT-242 — Thin Kiro / kiro-cli adapter (generates Kiro-native config)

**Implementer:** /be (after /arch + HARD /secops) · **Size:** full (new adapter) · **Track:** full
**Stage:** backlog

### Acceptance criteria
1. A thin `kiro/` adapter generates Kiro-native config from the SAME source DART already uses (Core projection, agent-team skills, workflow rules, the existing MCP server) — codegen, not a re-implementation of DART semantics; no fork of engine/renderer/MCP tools.
2. It emits `.kiro/settings/mcp.json` in Kiro's `mcpServers` (stdio) shape pointing at DART's EXISTING MCP server unchanged (zero server code change).
3. It generates `.kiro/steering/*.md` from the agent-team skills + workflow rules using front-matter inclusion modes, and transcludes a live DART digest via `#[[file:...]]`.
4. It emits hook shims registering DART's SessionStart logic as Kiro `agentSpawn` and the live-directive logic as `userPromptSubmit`, reusing the existing hook LOGIC (same STDIN-JSON / STDOUT-into-context model) — only registration differs.
5. kiro-cli is first: a single custom-agent JSON bundles MCP + hooks + steering (the Kiro equivalent of plugin.json); the IDE path is supported via MCP + `always`-mode steering.
6. OPT-IN + NO-CLOBBER: writes nothing unless explicitly invoked; never overwrites/destroys a pre-existing `.kiro` mcp.json/steering/hooks — proven by a negative test (existing user `.kiro` left byte-intact).
7. NO-SECRET: no credential in any generated file; overlay/memory keys stay env-only — proven by a negative test.
8. Documented gaps (accepted, non-blocking): no PreCompact-equivalent Kiro hook (per-turn hook compensates); IDE session-start less explicit than CLI `agentSpawn`; SSE undocumented → stdio/localhost-HTTP only (DART is already stdio).

### Gate plan
- **ARCH_APPROVED** — HARD (new boundary/adapter; pin the surface mapping + recorded gaps; realizes BL-06).
- **SECOPS_APPROVED** — **HARD, safety-override** (generates config registering an MCP server + hooks in another tool). Negatives: opt-in · no-clobber (byte-intact existing config) · no-secret · no-exec (recorded-only posture) · stdio/localhost trust only. Blocks all implementation until passed.
- **DESIGN_APPROVED** — light/soft (config + CLI artifacts; no styled UI).
- **APPROVAL_GATE** — pre-impl readiness (ACs behavioral/HOW-free; negatives test-enforceable; gaps accepted).
- **CODE_REVIEWED** — two-pass (reuse not fork; no-clobber/opt-in/no-secret are real tests; facts-only).
- **VERIFIED** — completeness incl. negatives (generated config loads in kiro-cli; existing `.kiro` byte-intact; no secret emitted; inert until invoked; gaps stated; live-run flagged as human step).

---

## ADT-243 — Thin TS hub control-plane client / SDK (DEFERRED)

**Implementer:** /be (later) · **Size:** standard · **Track:** standard · **Stage:** deferred

### Status: DEFERRED — do not start until the trigger fires
**Trigger:** build only when a SECOND consumer (the ADT-242 Kiro adapter, or a CI step) starts
copy-pasting hub-API client code. Until then the MCP server + hub HTTP API already ARE the agent-facing
SDK, and the Claude Agent SDK already covers embedding DART in a custom agent.

### Acceptance criteria (apply only once triggered)
1. A thin typed TS HTTP client wraps the hub control-plane routes: `advanceTicket`, `setGate`, `comment`, `setLabel`, `consumeDirective`, `getStatus`, `getDirectives` — and nothing more (no agent logic, no LLM calls).
2. Types are GENERATED from the same schema the MCP server uses (single source of truth; no hand-redefined wire shapes).
3. The client is for non-LLM tooling/CI callers talking to the hub directly; the LLM-facing path stays the MCP server.
4. The ticket records the embed-in-custom-agent recipe (Claude Agent SDK: pass DART's MCP server + load skills via `settingSources`) as the documented alternative, so an SDK is not built prematurely for that use case.
5. The trigger condition is explicit and recorded.

### Gate plan (deferred)
- **ARCH_APPROVED** — light when triggered (thin wrapper over existing routes; single-source types; no agent logic).
- **SECOPS_APPROVED** — light note when triggered (same-machine/loopback trust; no embedded secret; rides the SAME guarded routes; no widened write authority).
- **CODE_REVIEWED** / **VERIFIED** — standard when triggered (types match schema; routes round-trip).
