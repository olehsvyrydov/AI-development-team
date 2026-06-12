# Sprint 10 — Ecosystem: public-git install, Kiro adapter, hub SDK (deferred)

**Theme:** Make DART *reachable and portable*. Sprint 07 packaged DART as an in-repo Claude Code
plugin (ADT-237/238/239 — the bidirectional bridge). This sprint turns that package into something a
stranger can install in two commands, and proves the same Core/skills/workflow/MCP can drive a second
host tool (Kiro) without forking DART's semantics. A thin hub SDK is designed but explicitly **deferred**
behind a trigger so it is not built before there is a second consumer.

These tickets came from grounded research against current Claude Code + Kiro docs. They realize two items
that were previously parked: **BL-06 (Kiro adapter, Phase 2)** and the distribution side of **D-004
(separate marketplace / public-git distribution is a Phase 2+ concern once the plugin is proven)**.

## Tickets

| Ticket | Title (short) | Size | Implementer | Gates that fire |
|--------|---------------|------|-------------|-----------------|
| **ADT-241** | Two-command public-git install | standard (small) | /be → /verify | ARCH (light), SECOPS (light note — install/trust touched, no new egress), CODE_REVIEWED, VERIFIED (fresh-clone) |
| **ADT-242** | Thin Kiro / kiro-cli adapter (codegen) | full (larger, new adapter) | /arch → /secops → /be | ARCH (hard), **SECOPS (HARD, safety-override)**, DESIGN (light), APPROVAL_GATE, CODE_REVIEWED, VERIFIED |
| **ADT-243** | Thin TS hub control-plane client / SDK | standard — **DEFERRED** | /be (later) | All noted, **not started** until the trigger fires |

All gates are `pending` in the ledger — nothing is pre-passed.

## ADT-241 — Public-git install (light: packaging + docs)

**Behavior:** a user with no clone runs two commands and gets DART:

```
claude plugin marketplace add <owner/repo>
claude plugin install dart@dart
```

…and the dart:-namespaced commands resolve, both hooks fire (SessionStart context digest +
UserPromptSubmit live directives), and the control-plane MCP server connects — **loaded from the
installed plugin, not the local working tree.** The plugin stays `defaultEnabled:false` (opt-in); the
user's own same-named commands win.

**The crux is the FRESH-CLONE proof.** Verifying it works from the local working tree is not the same as
verifying it installs from a fresh clone of the public repo over the marketplace source. `/verify` owns
that audit; the in-app proof against the live public repo is the remaining **human** step.

**Docs must be honest about the install surface:** the 2-command flow; the optional npm-source
marketplace entry as a *registry-distribution alternative*; the optional memory/overlay env vars
(`OPENMEMORY_BASE_URL`, `OPENMEMORY_API_KEY`, `MEM0_API_KEY`, env-only, OFF by default); and the explicit
statement that **there is no npx / `npm install` one-liner** for a CC plugin (npm is only a marketplace
*source*; nvm is irrelevant). We do not spec a non-existent install path.

**Gates:** ARCH and SECOPS fire *light*. No new boundary, no new dependency, no new egress beyond Claude
Code's own marketplace fetch, no secret in the manifest. SECOPS is a small verify-note (confirm a
fresh-clone install persists no secret and adds no egress); it escalates to HARD only if install/trust
posture changes (embedded token, new egress).

## ADT-242 — Kiro / kiro-cli thin adapter (larger; codegen, NOT new semantics)

Kiro natively supports DART's three surfaces, so the adapter is a **code generator over the SAME source**,
not a re-implementation:

| DART surface | Kiro-native target | Reuse |
|--------------|--------------------|-------|
| MCP control-plane server | `.kiro/settings/mcp.json` (`mcpServers`, stdio) | **as-is, zero server code change** |
| SessionStart context hook | Kiro CLI `agentSpawn` hook | reuse hook **logic**; STDOUT→context, STDIN-JSON model identical; only registration differs |
| Live-directive (UserPromptSubmit) hook | Kiro CLI `userPromptSubmit` hook | same as above |
| Digest + agent-team skills | `.kiro/steering/*.md` (front-matter inclusion modes) + a live digest transcluded via `#[[file:...]]` | generated from skills + workflow rules |
| plugin.json bundle | kiro-cli **custom-agent JSON** (bundles MCP + hooks + steering) | the Kiro equivalent manifest |

**Targets:** kiro-cli is first (one custom-agent JSON bundles everything). The Kiro IDE path works via
MCP + `always`-mode steering.

**Recorded gaps (documented, accepted — not blocking):** no PreCompact-equivalent Kiro hook (the per-turn
`userPromptSubmit` hook compensates); IDE session-start injection is less explicit than CLI `agentSpawn`;
SSE transport is undocumented in Kiro, so the adapter targets stdio/localhost-HTTP only — fine, DART is
already stdio.

**Gates:** ARCH (hard — new boundary/adapter) + **SECOPS (HARD, safety-override)** because the adapter
*generates config that registers an MCP server + hooks inside another tool*. It inherits the plugin's
posture and must prove it by negatives: **opt-in** (nothing written unless invoked), **no-clobber** (an
existing user `.kiro` config is left byte-intact), **no-secret** (no credential emitted; overlay keys stay
env-only), **no-exec** (generated hooks keep DART's recorded-only posture), **stdio/localhost trust only**.
DESIGN is light (config + CLI artifacts, no styled UI).

## ADT-243 — Thin TS hub control-plane client / SDK (DEFERRED)

**Why deferred, not dropped:** the MCP server + hub HTTP API **already are** the agent-facing SDK, and the
Claude Agent SDK already covers "embed DART in a custom agent" (pass DART's MCP server in + load skills via
`settingSources` — we document that recipe rather than build an SDK for it). The ONLY SDK worth building is
a **thin typed TS HTTP client** for the hub control plane —
`advanceTicket / setGate / comment / setLabel / consumeDirective / getStatus / getDirectives` — for
**tooling/CI authors who talk to the hub directly (not via an LLM)**. Types generated from the same schema
the MCP server uses; no agent logic.

**Explicit trigger:** build it only when a **second consumer** (the ADT-242 Kiro adapter, or a CI step)
starts copy-pasting hub-API client code. The ticket is marked `stage: deferred` / `deferred: true` in the
ledger so it is not started prematurely.

## Status

| Ticket | Stage | Gates |
|--------|-------|-------|
| ADT-241 | ready | all pending |
| ADT-242 | backlog | all pending (HARD SECOPS blocks impl) |
| ADT-243 | deferred | noted, not started (trigger pending) |

**Next:** ADT-241 → `/be` (docs + manifest) then `/verify` fresh-clone install. ADT-242 → `/arch` then
**`/secops` HARD** before any code. ADT-243 stays parked until its trigger fires.
