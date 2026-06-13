# ADR — Thin Kiro / kiro-cli adapter (ADT-242)

**Status:** ARCH_APPROVED (HARD gate) — by `/arch` (Jorge), 2026-06-13
**Ticket:** ADT-242 · Sprint 10 (Ecosystem) · Track: full
**Realizes:** BL-06 (Kiro adapter, previously Phase 2) · ratifies D-1004…D-1007
**Blocks until passed downstream:** `/secops` HARD (safety-override) — no implementation begins before it.

> Architecture is about trade-offs, not silver bullets. The trade-off here is deliberately lopsided in
> our favor: Kiro natively supports all three DART surfaces (MCP, lifecycle hooks, steering), so the
> right design is **codegen over the existing source**, not a second engine. This ADR pins that boundary
> and forbids the fork.

---

## 1. Context & decision

DART already drives Claude Code as a plugin: a control-plane **MCP server** (`dart-mcp/dist/server.cjs`,
stdio, bound to one project by an argv), two **hooks** (SessionStart digest = `restore-context.ts`,
UserPromptSubmit live-directives = `live-directives.ts`), and the **agent team + workflow** as skills.
The shared, overlay-aware **digest projection** (`hub/lib/digest.js` → `hub/lib/state.js`) is what both the
hub board and the hooks render, and it is where the directive **quoted-data fence-escape** lives.

Kiro exposes the same three surfaces natively (researched against current Kiro docs):

| DART surface | Kiro-native target | Reuse posture |
|---|---|---|
| MCP control-plane server | `.kiro/settings/mcp.json` (`mcpServers`, stdio) — same shape as CC | **server reused AS-IS, zero server code change** |
| SessionStart context digest | kiro-cli `agentSpawn` hook (STDOUT → agent context) | reuse hook **logic**; only registration + STDIN field mapping differ |
| Live-directive (UserPromptSubmit) | kiro-cli `userPromptSubmit` hook (STDOUT → agent context) | same |
| Digest + agent-team skills | `.kiro/steering/*.md` (front-matter inclusion modes) + a transcluded live digest via `#[[file:...]]` | generated from the SAME skills + workflow source |
| `plugin.json` bundle | kiro-cli **custom-agent JSON** (bundles `mcpServers` + `hooks` + `resources` + `tools`/`allowedTools` + `prompt` + `model`) | the Kiro equivalent manifest, generated |

**Decision (ratifies D-1004):** build a **thin `kiro/` adapter that is a code GENERATOR** emitting
Kiro-native config from the SAME Core projection / agent-team skills / workflow rules / MCP server. It is
**codegen, not a re-implementation of DART semantics**. No fork of the engine, the digest renderer, the
MCP tools, or the hook logic. The semantics stay in the files + Core + the MCP server; the adapter is
**config generation only**.

### Why this is the right boundary (ATAM-style trade-off)

- **Sensitivity point — semantic drift.** A second host integration is where DART's behavior could silently
  diverge. Forbidding any re-implementation (mcp.json points at the *same* server binary; hooks shell into
  the *same* hook modules / digest CLI; steering is *rendered from* the same skills+workflow source) makes
  drift structurally impossible: there is one source of truth per surface.
- **Trade-off point — blast radius vs. reach.** The adapter widens DART's trust surface into Kiro (it
  registers an MCP server + hooks inside another tool). We accept the reach because the adapter inherits the
  plugin's exact posture (stdio, bound-by-argv, recorded-only, no secret) and proves it the same way — by
  negatives. This is the whole reason SECOPS is HARD/safety-override here.
- **Non-risk.** stdio-only transport: DART is already stdio; Kiro's stdio is first-class. No new transport
  risk is introduced.

---

## 2. Adapter shape, location & invocation

### 2.1 Location

A new top-level **`kiro/`** directory in the repo (sibling to `hub/`, `dart-mcp/`, `claude/`), a
low/zero-dependency Node generator. Entry: **`kiro/generate.js`** (plain CommonJS Node, no build step —
mirrors `hub/`'s zero-dep posture), with the renderable logic factored into `kiro/lib/*` so it is unit-
testable without the CLI. Fixtures/templates for the steering front-matter live under `kiro/templates/`.

**Relationship to `install.sh`:** `install.sh` already has `emit_kiro()` which writes ONE steering file
(`.kiro/steering/ai-dev-team.md`, the instructions body) for the Kiro IDE. That stays as the *lightweight*
path. **ADT-242 is the deeper generator** (mcp.json + per-role steering + hook shims + custom-agent JSON).
`install.sh` invokes `kiro/generate.js` ONLY when the user explicitly opts in (a new `--kiro-adapter` flag
or the interactive Kiro selection answering "yes, full adapter"); the generator is independently runnable.

> **Guardrail (carried to `/be` + `/secops`):** the existing `emit_kiro()` currently **overwrites**
> `.kiro/steering/ai-dev-team.md` unconditionally. The new generator MUST be no-clobber (§6). Where the two
> paths touch the same file, the generator owns a *clearly-scoped DART file set* and treats any non-DART or
> hand-edited file as off-limits.

### 2.2 Invocation (a `dart kiro init`-style generator)

```
node kiro/generate.js [--workspace | --global] [--agent <name>] [--dry-run] [--force] [project-dir]
```

- **`--workspace`** (default): writes under `<project>/.kiro/…` (mcp.json + steering + the custom-agent JSON).
- **`--global`**: writes under `~/.kiro/…` (user-scope steering + `~/.kiro/agents/<name>.json`).
- **`--dry-run`**: prints every file it WOULD write and the merge it WOULD perform; writes nothing (this is
  also the `/secops` opt-in inspection path).
- **`--force`**: still never destroys a user's non-DART entries — it only re-asserts DART's own scoped
  entries. There is no flag that authorizes clobbering a user's hand-authored `.kiro` content.

**Opt-in is structural:** the generator writes nothing on import and nothing unless its CLI is explicitly
invoked. It is inert in the plugin/install until the user asks for it.

### 2.3 What it reads (single sources of truth — no duplication)

| Generated artifact | Read from |
|---|---|
| `mcp.json` `dart` entry | the CC `.claude-plugin/.mcp.json` shape + resolved abs paths to `dart-mcp/dist/server.cjs` |
| hook shim commands | the CC `.claude-plugin/hooks/hooks.json` declarations + the hook module paths |
| workflow-rules steering | `claude/workflow/workflow.yaml` + the `workflow-engine` skill posture |
| per-role steering | `claude/skills/**/SKILL.md` front-matter (name/description) |
| live digest content | `hub/lib/digest.js --text` (the SAME projection the CC hook uses) |

---

## 3. MCP registration — `.kiro/settings/mcp.json`

Generate (or merge into) `.kiro/settings/mcp.json` (workspace) / `~/.kiro/settings/mcp.json` (global) with a
single `dart` server under the top-level `mcpServers` key — the **same shape** as the CC manifest:

```jsonc
{
  "mcpServers": {
    "dart": {
      "command": "node",
      "args": ["<ABS>/dart-mcp/dist/server.cjs", "<PROJECT-DIR>"],
      "env": {
        "VOYAGE_API_KEY": "${VOYAGE_API_KEY}",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}",
        "QDRANT_URL": "${QDRANT_URL}",
        "QDRANT_API_KEY": "${QDRANT_API_KEY}"
      },
      "disabled": false,
      "autoApprove": ["dart_read_state", "dart_pending_directives"],
      "disabledTools": []
    }
  }
}
```

**Decisions:**
- **Same binary, zero server change.** `command: node`, `args: [<abs server.cjs>, <project-dir>]`. Kiro has
  no `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` expansion, so the generator resolves these to **absolute
  paths at generation time** (the project dir is the project the user ran the generator for). This is the one
  Kiro-specific transformation of the CC manifest — value resolution, not shape change.
- **Bound to one project by argv** — same trust model as the CC plugin: the server is pinned to the project
  dir passed as `args[1]`; it cannot be re-pointed at another project at runtime.
- **Env = NAME passthrough only.** `${VAR}` references that Kiro resolves from the user's environment. **No
  secret value is ever written** into the file (this is a `/secops` negative). If the overlay/memory is
  unconfigured the names simply resolve to empty and the overlay stays off — same as CC.
- **`autoApprove` = read-only tools ONLY** (`dart_read_state`, `dart_pending_directives`). The **writers**
  (advance/setGate/comment/setLabel/consumeDirective) are deliberately NOT auto-approved — they require the
  user's per-call confirmation in Kiro, preserving the single-writer-with-confirmation posture.
- **stdio first-class; localhost-HTTP allowed but unused; SSE excluded** (undocumented in Kiro). DART is
  already stdio, so this is a non-issue (recorded gap §8).

---

## 4. Steering generation — `.kiro/steering/*.md`

Steering is the analog of DART's digest + agent-team skills. The generator emits a **clearly-scoped DART set**
of steering files, each with YAML front-matter selecting an inclusion mode:

| File | Inclusion mode | Source | Purpose |
|---|---|---|---|
| `dart-workflow.md` | `always` | `claude/workflow/workflow.yaml` + `workflow-engine` posture | the gates/preset/proportionality rules in every interaction |
| `dart-team.md` | `always` (compact roster) | `claude/skills/**/SKILL.md` front-matter | the agent-team roster + when-to-use, in every interaction |
| `dart-agent-<role>.md` (optional, one per role) | `manual` (`#dart-arch`, …) or `auto` (name/description match) | each role's `SKILL.md` | the full persona, loaded on demand to keep the always-context lean |
| `dart-digest.md` | `always` | a thin wrapper that **transcludes** the live digest file | surfaces live workflow state every interaction |

### 4.1 The live-digest transclusion (a load-bearing decision)

Kiro `#[[file:<relative_path>]]` transcludes a **workspace file** into steering at interaction time. The
digest CLI writes to **stdout only** — it does not persist a file. So the generator must define **where DART
writes the digest markdown** that Kiro transcludes.

**Decision:** DART writes the live digest to **`.kiro/steering/.dart/digest.md`** (inside `.kiro`, under a
dot-scoped `.dart/` subdir so it is unmistakably DART-owned and never collides with a user steering file),
and `dart-digest.md` contains `#[[file:.dart/digest.md]]`. The digest file is refreshed by:
- the kiro-cli **`agentSpawn` hook** (writes the digest before the turn — §5), and/or
- a small `kiro/lib/write-digest.js` the generator can wire, which simply runs `hub/lib/digest.js --text` and
  writes the result to that path.

The digest file carries the **directive quoted-data fence-escape unchanged** — it is the SAME
`renderDirectiveData`/`renderDirectiveSection` output, so directives surfaced through steering are fenced,
backtick-neutralized DATA exactly as in the CC hook. **No new rendering path = no new injection surface.**

> Trade-off: a transcluded file means the steering digest is as fresh as the last write (agentSpawn-driven
> in CLI; for the IDE, freshness is bounded by how often the digest file is rewritten). Accepted — the
> `always`-steering path is the IDE's compensator for the weaker session-start (§8).

### 4.2 No secret in steering

Steering files are generated from skills + workflow + the (already-safe) digest. They contain **no
credentials** and surface directives ONLY as quoted data — a `/secops` negative.

---

## 5. Hook shims (kiro-cli) — `agentSpawn` + `userPromptSubmit`

Two shim commands, declared inside the custom-agent JSON `hooks` block, that **reuse the existing hook
LOGIC** and only adapt registration + STDIN field names.

### 5.1 Mapping

| DART (CC) hook | Kiro event | Same logic reused | STDIN mapping |
|---|---|---|---|
| SessionStart digest (`restore-context.ts`) | `agentSpawn` | yes — digest-first, best-effort recall | `{hook_event_name, cwd, session_id}` → the hook reads `cwd` (same field name; CC already reads `cwd`) |
| UserPromptSubmit live-directives (`live-directives.ts`) | `userPromptSubmit` | yes — pending-directives-since-last-turn, fenced quoted data | `cwd`, `session_id` map 1:1; **`transcript_path` is absent** in Kiro |

Both hook modules already read their payload via `readStdinJson()` and key off `cwd` / `session_id` — field
names that **match Kiro's event JSON**. So the shim is thin:

- **`kiro/hooks/agent-spawn.sh`** (or a tiny Node shim): reads Kiro's STDIN JSON, execs the SAME
  `restore-context.ts` (digest-first). Because the only field it needs is `cwd`, the mapping is effectively
  pass-through. It MAY also write `.kiro/steering/.dart/digest.md` (§4.1) before emitting, so the IDE's
  `always`-steering and the CLI digest stay consistent.
- **`kiro/hooks/user-prompt-submit.sh`**: reads Kiro's STDIN JSON, execs the SAME `live-directives.ts`.
  `transcript_path` being absent means the transcript-tail "seen" channel is empty; the hook **already
  degrades cleanly** to the session **seen-file** (`~/.aidevteam/sessions/<session_id>.seen`) — which is the
  primary, project-external dedup channel anyway. So missing `transcript_path` is a graceful degrade, not a
  break.

### 5.2 Posture preserved verbatim (the whole point)

Every property of the CC hooks is preserved because it is the SAME code:
- **read-only** w.r.t. the project (only side effect: the project-EXTERNAL session seen-file);
- **always `exit 0`, never blocks/rejects** a turn;
- **fast / time-boxed / degrade-on-failure** (digest child has a tight timeout; failure → silent);
- **directives as fence-escaped QUOTED DATA**, never executed;
- **no secret** read or emitted.

`timeout_ms` in the Kiro hooks block is set conservatively (digest ≈ a few seconds; default ~30s ceiling is
ample). **No-exec / recorded-only posture holds:** the shims run DART's read-only hook modules; they grant no
shell, no code-exec, no arbitrary file write through the Kiro surface.

### 5.3 The PreCompact gap

Kiro has **no PreCompact-equivalent** hook. DART's CC `save-context.ts` (PreCompact) is therefore **not
mapped**. The per-turn `userPromptSubmit` hook **compensates** (live directives re-surface every turn
regardless of compaction). Recorded gap §8 — accepted, non-blocking.

---

## 6. Opt-in / no-clobber model (HARD invariant)

The generator is **opt-in** (writes nothing unless its CLI is explicitly invoked) and **no-clobber** (never
overwrites or destroys a user's pre-existing `.kiro` content). Mechanics:

- **`mcp.json` — merge, additive.** If `.kiro/settings/mcp.json` exists, parse it, set ONLY
  `mcpServers["dart"]` (insert or replace DART's own entry), preserve every other server and every unknown
  top-level key, re-serialize. If absent, create minimal. **The user's other servers survive byte-meaningfully
  (their entries are untouched).**
- **steering — scoped DART file set + dot-namespaced live file.** DART writes only files it owns:
  `dart-workflow.md`, `dart-team.md`, `dart-agent-*.md`, `dart-digest.md`, and `.dart/digest.md`. It **never
  touches** a user steering file. If a same-named DART file exists and is NOT DART-managed (no DART header
  sentinel), it **refuses** that file and warns (same pattern as `install.sh`'s `write_instructions`
  no-clobber guard) — it does not overwrite.
- **hooks / custom-agent JSON — merge into the agent's `hooks` block.** If a user custom-agent JSON exists,
  merge DART's `mcpServers.dart`, the two `hooks` entries, and the steering `resources` additively, leaving
  the user's `prompt`/`model`/`tools`/other servers/other hooks intact. If absent, generate a fresh DART
  agent JSON.
- **write scope confined to `.kiro/` (or the chosen `~/.kiro` scope).** The generator never writes outside
  `.kiro/` (workspace) or `~/.kiro/` (global). Path resolution is realpath + containment checked (reuse the
  hub's containment posture) so a crafted project dir cannot redirect a write outside the scope.

**Negative test (AC-6, HARD):** an existing user `.kiro` config (mcp.json with a non-DART server + a
hand-authored steering file + a custom agent JSON) is **byte-intact** for every non-DART entry after the
generator runs.

---

## 7. The custom-agent JSON (kiro-cli) — the single bundle

kiro-cli is the **first target**. The generator emits ONE custom-agent JSON at `.kiro/agents/dart.json`
(workspace) or `~/.kiro/agents/dart.json` (global) — the Kiro equivalent of `plugin.json` — bundling:

```jsonc
{
  "name": "dart",
  "description": "DART — AI Development Team workflow + agents",
  "prompt": "<compact: defer to steering for team+workflow>",
  "mcpServers": { "dart": { /* §3 entry */ } },
  "hooks": {
    "agentSpawn":       [{ "command": "<ABS>/kiro/hooks/agent-spawn.sh",        "timeout_ms": 15000 }],
    "userPromptSubmit": [{ "command": "<ABS>/kiro/hooks/user-prompt-submit.sh", "timeout_ms": 5000  }]
  },
  "resources": [
    "file://.kiro/steering/dart-workflow.md",
    "file://.kiro/steering/dart-team.md",
    "file://.kiro/steering/dart-digest.md"
  ],
  "tools": ["@dart"],
  "allowedTools": ["@dart/dart_read_state", "@dart/dart_pending_directives"]
}
```

- `allowedTools` mirrors the mcp.json `autoApprove`: **read-only DART tools pre-allowed; writers require
  confirmation.** (Single source of intent — the generator derives both from one read-only-tool list.)
- The **IDE path** does not consume this agent JSON's `hooks`; it relies on **MCP (mcp.json) + `always`-mode
  steering** (incl. the transcluded `dart-digest.md`). Same generator, two consumption profiles.

---

## 8. IDE vs CLI split + recorded gaps (accepted, non-blocking)

| Surface | kiro-cli | Kiro IDE |
|---|---|---|
| MCP | `.kiro/settings/mcp.json` (or agent JSON `mcpServers`) | `.kiro/settings/mcp.json` |
| Session-start digest | `agentSpawn` hook (explicit) | **`always`-steering** `dart-digest.md` transcluding `.dart/digest.md` (weaker, no raw session-start event) |
| Live directives | `userPromptSubmit` hook (per-turn) | `always`-steering digest refresh (bounded by digest-file write cadence) |
| Bundle | custom-agent JSON | the file set above |

**Recorded gaps (D-1006 — documented, accepted):**
1. **No PreCompact-equivalent Kiro hook.** The per-turn `userPromptSubmit` hook compensates (directives
   re-surface every turn). DART's `save-context.ts` is intentionally unmapped.
2. **IDE session-start is less explicit than CLI `agentSpawn`.** The IDE relies on `always`-steering +
   transcluded live digest for persistent context; freshness bounded by the digest-file write cadence.
3. **SSE undocumented in Kiro → stdio/localhost-HTTP only.** Non-issue: DART is already stdio.
4. **`transcript_path` absent in Kiro's hook STDIN.** The live-directives hook degrades cleanly to the
   project-external session seen-file (its primary dedup channel). No behavior break.

---

## 9. Reuse map — verbatim vs. Kiro-specific

| Component | Verbatim reuse | Kiro-specific (the adapter's only new code) |
|---|---|---|
| MCP server (`dart-mcp/dist/server.cjs`) | **100% — zero change** | abs-path resolution of the `args` (Kiro has no `${PLUGIN_ROOT}` expansion) |
| SessionStart logic (`restore-context.ts`) | **100% — same module exec'd** | a thin `agentSpawn` shim (STDIN pass-through; optional digest-file write) |
| Live-directive logic (`live-directives.ts`) | **100% — same module exec'd** | a thin `userPromptSubmit` shim (STDIN pass-through; relies on seen-file when `transcript_path` absent) |
| Digest projection (`hub/lib/digest.js` + `state.js`) | **100% — same CLI / renderer** | a `write-digest` wrapper that persists `--text` output to `.dart/digest.md` for `#[[file:...]]` |
| Directive fence-escape (`renderDirectiveData`) | **100% — unchanged safety** | none |
| Agent skills (`claude/skills/**`) | source of truth — rendered, not forked | steering front-matter wrappers (`always`/`manual`/`auto`) |
| Workflow (`claude/workflow/workflow.yaml`) | source of truth — rendered, not forked | `dart-workflow.md` steering wrapper |
| `plugin.json` | conceptual analog | the custom-agent JSON generator |

**The adapter's entire new surface is: a generator (`kiro/generate.js` + `kiro/lib/*`), two thin hook shims,
one digest-writer wrapper, and steering/agent-JSON templates.** No DART semantics are re-implemented.

---

## 10. What `/secops` must HARD-verify (safety-override gate)

The adapter generates config that **registers an MCP server + hooks inside another tool**, so each invariant
is proven by a **negative test** (the write/leak that must NOT happen does not happen). Precise list:

1. **NO-SECRET.** No credential value appears in any generated file (`mcp.json`, steering, custom-agent JSON,
   `.dart/digest.md`). The `env` block carries `${NAME}` references only — exactly like the CC manifests.
   Overlay/memory keys (`VOYAGE_API_KEY`, `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`,
   `OPENMEMORY_*`/`MEM0_API_KEY`) stay env-only. *(negative test)*
2. **NO-CLOBBER / byte-intact.** A pre-existing user `.kiro` (mcp.json with a non-DART server + a
   hand-authored steering file + a user custom-agent JSON) is left byte-intact for every non-DART entry;
   DART only inserts/replaces its own scoped entries; a non-DART same-named steering file is **refused**, not
   overwritten. *(negative test)*
3. **OPT-IN / inert-until-invoked.** Nothing is written on import or install; only the explicit
   `kiro/generate.js` invocation writes. `--dry-run` writes nothing. *(negative test)*
4. **SAME MCP trust model.** The registered server is the SAME binary: stdio, **bound to one project by
   `args[1]`**, no re-point at runtime, no-exec, single-writer-with-confirmation via `api.handle`. The bundle
   does not weaken any server guard. **`autoApprove`/`allowedTools` list read-only tools ONLY**
   (`dart_read_state`, `dart_pending_directives`); writers are NOT auto-approved. *(assertion + test)*
5. **HOOK posture = recorded-only.** The shims exec DART's existing read-only hook modules: read-only w.r.t.
   the project (sole side effect = project-EXTERNAL seen-file), always `exit 0`, never block a turn,
   time-boxed/degrade, **directives surfaced ONLY as fence-escaped quoted DATA**, never executed. The Kiro
   surface grants **no shell / no code-exec / no arbitrary project-file write**. *(test)*
6. **STEERING leaks nothing / quoted-data safety holds.** Steering and the transcluded `.dart/digest.md`
   contain no secret and surface directives only via the unchanged `renderDirectiveData` fence-escape (the
   backtick-run neutralization holds in the steering surface too). *(test)*
7. **WRITE CONFINEMENT.** The generator writes ONLY inside `.kiro/` (workspace) or `~/.kiro/` (chosen scope),
   never outside; paths are realpath + containment checked so a crafted project dir cannot redirect a write
   out of scope. *(test)*
8. **TRANSPORT.** stdio (or localhost-HTTP) only; no SSE/remote registered. *(assertion)*

These map 1:1 to ADT-242 AC-6/AC-7 and the ledger SECOPS note; D-1007 makes this gate HARD (safety-override)
— it **blocks all implementation until passed**.

---

## 11. Risks & non-risks

| | Item | Mitigation / note |
|---|---|---|
| **Risk** | Semantic drift between DART-in-CC and DART-in-Kiro | Forbidden by design: one source of truth per surface; the MCP server + hook modules + digest renderer are the SAME code. `/rev` confirms reuse-not-fork. |
| **Risk** | `emit_kiro()` (existing) overwrites a steering file the deep generator also manages | New generator is no-clobber + dot-scoped DART file set; the two paths own distinct files; the deep path refuses non-DART same-named files. |
| **Risk** | Stale IDE digest (transcluded file only as fresh as last write) | Accepted gap §8.2; agentSpawn writes it on CLI; a `write-digest` wrapper refreshes it; bounded staleness, never wrong-by-construction. |
| **Risk** | Abs-path resolution breaks if the repo moves | Generator is re-runnable (`dart kiro init` again); paths regenerated. Documented; same re-run remedy as any path-pinned config. |
| **Non-risk** | Transport | stdio only; DART already stdio. |
| **Non-risk** | New egress | None introduced; overlay/memory egress is the SAME env-gated, off-by-default path as today; unconfigured → zero egress. |
| **Non-risk** | New write authority | The writers stay confirmation-gated (not auto-approved); the server's single-writer `api.handle` is unchanged. |

---

## 12. Decision

**ARCH_APPROVED (HARD).** The thin `kiro/` generator design above is sound and correctly bounded: it is
codegen over the SAME Core/skills/workflow/MCP with no semantic fork, the surface mapping is pinned
(`agentSpawn`=SessionStart, `userPromptSubmit`=live-directive, steering=digest+skills, `mcp.json` reuses the
server as-is), the opt-in/no-clobber/no-secret/no-exec/stdio-only invariants are concrete and test-
enforceable, and the recorded gaps (no PreCompact analog, weaker IDE session-start, stdio-only,
`transcript_path` absent) are accepted and documented.

**Next gate:** `/secops` HARD (safety-override) against the §10 list — **blocks `/be` implementation until
passed.** Then `APPROVAL_GATE` (pre-impl readiness) → `/be`.
