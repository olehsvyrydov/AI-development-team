# Code Review — ADT-241: Two-command public-git install + zero-setup MCP bundle

**Reviewer:** /rev
**Branch:** `feat/dart-public-install`
**Commits in scope:** `b133934` (docs + fresh-clone proof), `aa2219a` (self-contained MCP bundle)
**Base:** `feat/dart-interactive` (b14bfb9)
**Verdict:** APPROVED — nits only, no BLOCKING, no WARNING that blocks.

---

## Scope

Diff `feat/dart-interactive...HEAD` — 9 files:

| File | Change |
|------|--------|
| `.claude-plugin/README.md` | +90/−21: two-command install docs, no-npx caveat, env-var names, zero-setup MCP note |
| `.claude-plugin/.mcp.json` | server path repointed `src/server.js` → `dist/server.cjs` |
| `.claude-plugin/test/install-docs.test.js` | NEW — install-docs parity contract |
| `.claude-plugin/test/manifest.test.js` | assertion repointed to the bundle; ticket ID removed from a message |
| `.gitignore` | track the bundle, keep `node_modules` ignored |
| `dart-mcp/package.json` | `build` script (esbuild), `esbuild` devDep |
| `dart-mcp/package-lock.json` | esbuild + transitive devDeps |
| `dart-mcp/dist/server.cjs` | NEW — 1.48 MB committed self-contained bundle (generated) |
| `dart-mcp/test/bundle.test.js` | NEW — turnkey proof |

---

## 1. Install-docs accuracy (README) — PASS

- **Canonical `owner/repo` form** is correctly labelled "once published on the default branch" and explicitly states it works only after the feature branch merges to `main`; it does NOT claim to work pre-main. Verified the canonical form fails today (main lacks the manifest) — this is documented.
- **Branch-ref form** documents the verified syntax: the git-URL `#ref` (HTTPS, no SSH key) and the `owner/repo@ref` shorthand. The ref `feat/dart-interactive` is a real branch (remote `refs/heads/feat/dart-interactive` @ b14bfb9) — it is the integration branch these two commits merge back into, so the documented pre-main path is reproducible the moment this branch lands on it.
- **No-npx caveat** is present and TRUE: there is no `npx dart` / `npm install dart` plugin one-liner; the docs state npm is supported only as an optional marketplace *source* (a package carrying `.claude-plugin/marketplace.json`), and that DART ships no such npm package today. A test forbids any `npm install dart` / `npx dart` inside fenced code blocks (deny-in-prose is allowed).
- **enable / opt-in / disable / uninstall** all documented (`enabledPlugins`, `claude plugin disable|uninstall dart@dart`, `marketplace remove`).
- **Overlay env-var NAMES only** documented (`VOYAGE_API_KEY`, `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `OPENMEMORY_BASE_URL`, `OPENMEMORY_API_KEY`, `MEM0_API_KEY`) — names only, with an explicit "read from the environment only, never persisted" statement.
- **No secret-shaped value** in the docs (verified by grep against the high-confidence shape set + a dedicated test). The previous hardcoded `/home/oleh/...` local-path example was removed.

## 2. The MCP bundle (turnkey claim) — PASS, independently verified

- **Third-party deps INLINED.** `grep` for `require('@modelcontextprotocol/sdk')` and `require('zod')` → 0 hits. `StdioServerTransport` and the zod runtime (`Zod\w`) are present inline. The 3 `require("ajv/...")` hits are string literals inside ajv's codegen (`equal.code = '...'`), not runtime module resolution — not a missing dependency.
- **hub/lib NOT duplicated.** Bundle keeps `require("../../hub/lib/api")` and `require("../../hub/lib/state")` as runtime-relative externals (single source of truth). Hub control-plane internals (`stageGate`, `parseFrontMatter`, `commonVaultRoot`, `expectedOwner`, `aidevteamHome`) are ABSENT from the bundle — confirmed 0 hits each. No second copy of the engine.
- **Relative requires resolve from `dist/`.** `../../hub/lib/{api,state}` resolve to `<repo>/hub/lib/...` from the shipped `dist/` location. The externalized `../package.json` also resolves from `dist/` to `dart-mcp/package.json` (version single-sourced).
- **`.mcp.json`** points at `${CLAUDE_PLUGIN_ROOT}/dart-mcp/dist/server.cjs`, project via `${CLAUDE_PROJECT_DIR}`, env is `${NAME}` passthroughs only. No secret in the bundle (grep against AWS/OpenAI/Slack/PEM/GitHub/Google shapes → 0). `.gitignore` tracks the bundle (`!dart-mcp/dist/server.cjs`) while keeping `dart-mcp/node_modules/` ignored.
- **Independent no-node_modules run (not trusting the test):** I moved `dart-mcp/node_modules` aside, unset `NODE_PATH`, and drove `dist/server.cjs` over stdio. Result: `initialize` → serverInfo `dart`; `tools/list` → 9 tools (advance/assign/comment/consume_directive/pending_directives/read_state/require_gate/set_gate/set_label); `dart_read_state` → `ok:true` with a state projection. node_modules restored cleanly. **The turnkey claim is real.**
- **Drift protection:** `bundle.test.js` runs `npm run build` in a `before()` hook, so every assertion reflects current source, not a stale artifact — committed-bundle drift is caught by the suite. **Maintenance contract:** the bundle must be rebuilt (`npm run build`) and re-committed whenever `dart-mcp/src/**` or a bundled dependency version changes; the test enforces this at CI time.

## 3. Security — PASS

- No secret in bundle, docs, or manifest (verified above).
- Trust model unchanged. The bundle is the SAME server code with third-party deps inlined; the source server's import graph is exec-free (`bind-project.js`/`server.js`/`handlers.js` carry explicit no-`child_process`/no-`exec`/no-`eval` constraints) and stdio-only, single-writer, bound to one project at spawn. The bundle adds only the SDK + zod + their transitive (ajv) runtime — no new exec sink, no listening socket, no remote endpoint introduced by bundling. The 26 server security tests (no-exec graph, no port, no cross-project retarget, no credential param, no arg/env logging) all pass against the source server, and the no-node_modules run exercises the bundle's actual runtime surface.
- `npm audit` (dart-mcp): **0 vulnerabilities**.

## 4. Facts-only / self-describing — PASS (with one pre-existing NIT, out of scope)

Grep of the changed **source/config** files (bundle exempt — generated) for ticket IDs / persona names / condition codes / sprint refs:
- **Improvement:** `manifest.test.js` this change set *removed* a process artifact — the old message `'points at the ADT-237 stdio server'` was replaced with a facts-only message. Good.
- `install-docs.test.js` and `bundle.test.js` (new) use behavioral, ticket-agnostic test names — clean.
- **NIT (out of scope, pre-existing):** `manifest.test.js:170` carries a comment `// ... C239-4 / N239-4 ...` (condition codes in source). This line is NOT in the current diff — it predates this change set. Recommend a separate facts-only cleanup pass; it does not block ADT-241.

The 1.48 MB `dist/server.cjs` is the **only** large generated artifact added and is justified by the turnkey (zero-`npm ci`) tradeoff; it is correctly exempt from the facts-only prose check (generated).

---

## Re-run results (independently executed)

| Check | Result |
|-------|--------|
| `node --test dart-mcp/test/*.test.js` | **26 pass / 0 fail** |
| `node --test .claude-plugin/test/*.test.js` | **54 pass / 0 fail** |
| `node --test hub/test/*.test.js` | **374 pass / 0 fail** |
| `claude plugin validate <repo>` | **Validation passed** |
| `npm audit` (dart-mcp) | **0 vulnerabilities** |
| No-node_modules bundle run (manual) | **9 tools served, read_state ok** |

## Architecture / AC compliance

`ARCH_APPROVED` and `SECOPS_APPROVED` both `passed` (LIGHT/soft, packaging + docs; install/trust touched, no new egress). The ledger's VERIFIED note (fresh-clone audit at b14bfb9) predates the bundle and references the old `src/server.js` install path; the bundle commits land after, and the AC "control-plane MCP server loaded/connectable" is now satisfied by the bundle, which I independently proved runs with zero setup. Consistent, not contradictory.

## Review assumptions / not verified

- I did not perform the in-app `claude plugin enable` + live hook/MCP firing inside a running Claude Code session — that remains the documented human step (flagged in the ledger). I verified the bundle the client would spawn runs correctly over stdio out-of-band.
- I assumed the AC's premise (turnkey git-only install with no `npm ci`) is sound; the bundle achieves it without widening the trust surface.

## Decision

**APPROVED.** `CODE_REVIEWED = passed`. One out-of-scope NIT (pre-existing condition codes at `manifest.test.js:170`) recommended for a later facts-only cleanup.
