# Code Review: Thin Kiro / kiro-cli adapter generator (ADT-242)

**Reviewed By**: /rev
**Date**: 2026-06-13
**Branch**: `feat/dart-kiro-adapter`
**Ticket**: ADT-242 — thin `kiro/` generator (emits Kiro-native config registering DART's MCP server + hooks + steering)
**Gate**: `CODE_REVIEWED` (hard). Upstream `SECOPS_APPROVED` is a HARD safety-override gate (writes config into a second tool) — its K-1..K-8 / N-1..N-8 are the acceptance bar.
**Verdict**: **APPROVED (nits only)** — `CODE_REVIEWED → passed`.

Reviewed change set (uncommitted, untracked): `kiro/generate.js`, `kiro/lib/{tools,containment,mcp,agent,steering,write-digest,plan}.js`, `kiro/hooks/{agent-spawn,user-prompt-submit}.cjs`, `kiro/test/generate.test.js`. `install.sh` is **unmodified** (`git status` clean for it).

---

## Summary

The generator is genuinely thin codegen over the existing DART sources — it reuses `dart-mcp/dist/server.cjs` (zero server change), the exported `hub/lib/digest.js` `renderDirectiveData` fence-escape, and execs the existing `restore-context.ts` / `live-directives.ts` hook modules unchanged. Every SECOPS K-condition is met **in source** (not merely claimed) and each maps to a negative test that asserts a before/after **byte** snapshot where filesystem state is involved. All four test suites pass. Facts-only grep over shipped source is clean. One NIT (dead refusal branch in the agent-JSON writer) — non-blocking.

---

## K / N verification (independently confirmed in source + by re-running, not from claims)

| Cond | Control in source | Negative test | Verdict |
|---|---|---|---|
| **K-1 NO SECRET** | `mcp.js:31-42` builds `env` from `ENV_NAMES` as `${NAME}` strings only — no `process.env[...]` value read; steering/digest carry only workflow/skills text + digest rows | N-1 (seeds real secret-shaped values into `process.env`, greps every emitted file + the in-memory plan preview) | **MET.** Re-ran with `VOYAGE_API_KEY=sk-LIVE-…` etc. set — no value leaked; only `${VOYAGE_API_KEY}` names emitted. |
| **K-2 NO CLOBBER** | mcp.json: `mcp.mergeMcp` (`mcp.js:49-55`) spreads base, sets only `mcpServers.dart`, returns a NEW object. steering: `applyFile` (`generate.js:99-106`) refuses an existing file lacking the `isDartManaged` sentinel. agent JSON: `agent.mergeAgent` (`agent.js:62-75`) preserves user `prompt/model/tools/other servers/other hooks`. `--force` carries no clobber path. | N-2a/b/c/d — byte snapshots | **MET.** Re-ran the suite **and** an independent manual scenario: pre-seeded a user `mcp.json` (non-DART `userThing` server + unknown top key) + a non-DART `dart-team.md`. After generation: user mcp subtree **byte-identical**, `dart` added bound to argv; non-DART steering **refused** (`[kiro] refused … steering/dart-team.md`) and **byte-identical**. |
| **K-3 OPT-IN / dry-run** | `module.exports` at EOF; `run()` only executes under `require.main === module` or an explicit call. `--dry-run` (`generate.js:135-140`) writes nothing, returns before the write loop. | N-3a import-inert, N-3b dry-run-writes-nothing | **MET.** Independent manual `--dry-run`: full `.kiro` tree hash set **byte-identical** before/after. (N-3c install-without-opt-in is satisfied structurally — `install.sh` untouched; the deep generator is not wired into any install path. See note below.) |
| **K-4 SAME MCP TRUST** | One source of truth: `tools.js` `READ_ONLY_TOOLS` (frozen `[dart_read_state, dart_pending_directives]`). Both `mcp.buildDartEntry.autoApprove` and `agent` `allowedTools` derive from it. `WRITE_TOOLS` listed separately, never emitted. `args = [serverPath, projectDir]` — exactly 2 elements, no client-supplied path field; project bound at generation time. | N-4a no-retarget, N-4b read-only-only + no-`"*"`, N-4c env-name-only, N-4d writers-confirmation-gated | **MET.** `args.length === 2`, `args[1]` = the abs project dir; `autoApprove` equals the read-only set exactly; all 7 writers absent; no `"*"`. |
| **K-5 SHIMS EXEC, NOT COPY** | `agent-spawn.cjs` / `user-prompt-submit.cjs` `spawnSync('node', ['--no-warnings', HOOK_MODULE])` where `HOOK_MODULE` resolves to the repo's `restore-context.ts` / `live-directives.ts` — the **same** `node --no-warnings <module>.ts` invocation `.claude-plugin/hooks/hooks.json` uses. No `renderDirectiveData` / `SENTINEL_RE` / `.seen` logic in the shims. Exit code propagates the child's (`null → 0`); the module's own `.finally(process.exit(0))` harness preserves never-block. | N-5a exec-not-fork, N-5b always-exit-0/no-project-byte | **MET.** Re-ran both shims with a real STDIN payload + a tmp `$HOME`: each exits 0, agent-spawn emits the digest to stdout, project tree **byte-identical** (sole side effect is the project-external seen-file under `~/.aidevteam/sessions`). Static scan confirms no copied hook logic. |
| **K-6 STEERING + DIGEST** | `write-digest.js` re-exports the **unchanged** `renderDirectiveData` from `hub/lib/digest.js` (not re-implemented); `renderDigestText` shells the existing `node hub/lib/digest.js <project> --text` with a fixed argv. `steering.DIGEST_TRANSCLUSION` is the literal `#[[file:.dart/digest.md]]` — dot-scoped, DART-owned. | N-6 transclusion-dart-scoped-only, fence-holds, no-secret | **MET.** Crafted fence body neutralized with ZWSP; transclusion target is the dot-scoped path only (no abs / `..` / user path); steering secret-free under seeded secrets. |
| **K-7 WRITES CONFINED** | `containment.resolveWithin` realpaths the root, joins, checks `isContained` (trailing-`path.sep` compare → rejects the `.kiro` vs `.kiro-evil` sibling-prefix trap), and with `mustRealpath` resolves the deepest existing ancestor so an escaping symlink is caught. `applyFile` routes **every** target through `resolveWithin(root, rel, {mustRealpath:true})`. | N-7a crafted-path, N-7b `..`, N-7c symlink-escape | **MET.** Re-ran the suite + manual: `..` escape refused, `/etc/...` abs refused, sibling-prefix `false`, and a symlink inside `.kiro/steering` pointing outside is **refused** (`symlinked target escapes .kiro containment`). |
| **K-8 TRANSPORT** | `buildDartEntry` emits `command:'node'` + `args` (stdio); no `type`, no `url`, no SSE. `autoApprove` never `"*"`. | N-8 stdio-only | **MET.** No `type`/`url`/`sse`; `autoApprove` has no `"*"`. |

**Net-new controls (N-A…N-F from the SECOPS approval) are all now present in source and proven** — the `kiro/` tree exists, the two shims exec (not copy), the `.kiro/` write-containment is the net-new `containment.js`, the merge/no-clobber writers exist, the steering sentinel-refusal exists, and the `write-digest` wrapper exists. None was credited from a claim.

### install.sh regression check (separate sentinel-guarded file set)
**No regression.** `install.sh` is unmodified. Its `emit_kiro()` writes only `.kiro/steering/ai-dev-team.md`; the deep generator's file set (`settings/mcp.json`, `steering/dart-workflow.md`, `dart-team.md`, `dart-digest.md`, `.dart/digest.md`, `agents/dart.json`) is **disjoint** — no name collision, no overwrite of the existing single-file path. The deep generator is not wired into any install path (K-3 / N-3c satisfied structurally).

---

## Facts-only / self-describing (CLAUDE.md Code Standard)

Grep over shipped `kiro/` source (`generate.js`, `lib/*`, `hooks/*.cjs`) for ticket IDs (`ADT-\d`), sprint refs (`sprint-\d`), condition codes (`C2\d\d-`, `K-\d`, `N-\d`), and persona/agent names (`Soren`, `Jorge`, `/secops`, `/rev`, …): **zero matches — clean.** Doc-comments state facts (behaviour, posture, params/returns) and self-describing names throughout. The test file uses only `N-#` test-case identifiers in test names/comments (legitimate test labels, not process artifacts in shipped/Javadoc source) and contains no ticket/persona/condition codes.

---

## Findings by severity

### BLOCKING
None.

### WARNING
None.

### NIT — dead refusal branch in the agent-JSON writer (`kiro/generate.js:85,113,118`)
`applyFile` for `kind==='agent-json'` guards with `existing && !looksLikeDartAgent(existing) && !isMergeableAgent(existing)`, but `isMergeableAgent()` (`:113`) unconditionally returns `true`, so the condition is always `false` — the `refused.push` for an agent JSON never fires, and `looksLikeDartAgent` (`:118`) is referenced **only** from this dead branch. This is intentional w.r.t. security posture (SECOPS K-2(c)/N-2c require the agent JSON to be **additively merged**, preserving user fields — *not* refused), so it is **not** a security gap and not blocking. But per the Dead-Code / Speculative-Generality smell it should be simplified: drop the always-true `isMergeableAgent` guard and the now-unused `looksLikeDartAgent`, leaving the unconditional `agent.mergeAgent` call (which already preserves all user fields and is covered by N-2c). Optional — does not affect correctness or any K/N.

### PRAISE
- Single source of truth for trust scope: `tools.js` `READ_ONLY_TOOLS` drives **both** `autoApprove` and `allowedTools`, with `WRITE_TOOLS` listed only to be excluded — the lists structurally cannot drift, and `"*"` is unreachable.
- `containment.realpathExistingAncestor` correctly resolves the deepest *existing* ancestor (allowing not-yet-created leaves) while still catching an escaping symlinked ancestor — the right shape for a write-time confinement check.
- The shims are a faithful 1:1 of the CC `hooks.json` invocation (`node --no-warnings <module>.ts`, 15s/5s timeouts matching SessionStart/UserPromptSubmit) — the posture is inherited verbatim rather than re-implemented.
- Test suite asserts before/after **byte** (hex) snapshots for every filesystem-state negative, exactly as the HARD gate demands — not status-only assertions.

---

## Test / build results (re-run, not trusted from claims)

| Suite | Result |
|---|---|
| `node --test kiro/test/*.test.js` | **23 pass / 0 fail** |
| `node --test hub/test/*.test.js` | **374 pass / 0 fail** |
| `node --test dart-mcp/test/*.test.js` | **26 pass / 0 fail** |
| `node --test .claude-plugin/test/*.test.js` | **54 pass / 0 fail** |

Independent spot-checks (outside the suite) all confirmed: dry-run byte-identical tree; pre-existing user mcp.json non-DART subtree byte-identical after merge with `dart` added; non-DART `dart-team.md` refused and byte-identical; `..` / abs / sibling-prefix / escaping-symlink all refused by `resolveWithin`; both shims exit 0 with project tree byte-intact; `dart-mcp/dist/server.cjs` is bundled and `hub/lib/digest.js --text` is supported.

---

## Review assumptions / not-verified

- **Behavioral AC** (codegen-from-same-source, opt-in, no-clobber, no-secret) are sound and fully exercised by tests; reviewed against behaviour, not implementation detail.
- **Not verifiable in-environment** (flagged for /verify / human step, as the ticket's VERIFIED note already records): an actual kiro-cli / Kiro-IDE load of the generated agent JSON + steering + mcp.json against a live Kiro runtime. The generated shapes match the ADR's pinned mapping, but the real Kiro consumer was not run here.
- **Workflow-ordering note (for /sm, not blocking this review):** `APPROVAL_GATE` for ADT-242 is still `pending` (the /verify pre-impl readiness audit). ARCH + SECOPS (the HARD gates) are passed, so the code review verdict stands; /sm should reconcile the APPROVAL_GATE ordering in the ledger.

---

**Gate decision:** `CODE_REVIEWED → passed` for ADT-242 (nits only; one optional dead-code cleanup). Hand off to /qa + /e2e and /verify.
