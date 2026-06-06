# Security Review — Sprint 01 (Persistent Memory + Control-Plane Hub)

**Reviewer:** Soren (/secops) · **Gate:** SECOPS_APPROVED (hard, safety-override) · **Date:** 2026-06-06
**Verdict:** ✅ **SECOPS_APPROVED — CONDITIONAL** on the binding conditions C1–C12 below. Conditions are inlined into the affected tickets and **enforced at /rev and /verify**. Implementation may proceed under these conditions.

## Assets & trust boundaries
- **Assets:** developer source/secrets in transcripts & project files; API keys; the local vector DB (`~/.aidevteam/memory/memory.db`) holding project-derived text; the workflow ledger (integrity-sensitive — it gates work).
- **Trust boundaries:** (a) process ↔ third-party embedding APIs (network egress); (b) loopback HTTP server ↔ the developer's **browser** (and thus any website it visits); (c) Claude Code hook runner ↔ hook scripts (stdin-provided paths); (d) app ↔ optional native/npm dependencies.
- **Threat actors:** a malicious website the developer visits (drives the loopback server via the browser); a malicious/poisoned dependency; a co-located local user (multi-user host); accidental secret exfiltration to an embedding provider.

## STRIDE summary
| Threat | Surface | Rating | Mitigation (condition) |
|---|---|---|---|
| **Spoofing/CSRF** | Browser → loopback POST/WS | 🟠 HIGH | C3 (custom-header + Host check, no permissive CORS) |
| **Tampering** | Ledger/overlay/comment writes | 🟡 MED | C5 (atomic CAS, caps, throttle) |
| **Repudiation** | Who flipped a gate | 🟢 LOW | comment audit trail + `by`/`at` (AC-B6) |
| **Information disclosure** | Embedding egress; local DB; key-in-URL | 🟠 HIGH | C1, C2, C4, C11 |
| **DoS** | Unbounded comments/heartbeat/body | 🟡 MED | C5 |
| **Elevation** | sqlite-vec extension / supply chain | 🟡 MED | C7, C8 |
| **LLM injection** | Restored context re-injected | ℹ️ INFO | C9 |

---

## Binding conditions (MUST satisfy)

- **C1 — Secrets are env-only (🟠 HIGH).** API keys (`VOYAGE_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`) are read from the environment only and **never** written to `~/.aidevteam/config.json`, `~/.claude/settings.json`, the vector DB, logs, or error messages. *The scaffold honors this* (config carries selection only; `embeddings/*.ts` read env). Add a regression test asserting no key material appears in written config. **C1a:** send the Gemini key via the **`x-goog-api-key` header, not the `?key=` query string** (URLs leak into proxy/access logs) — `gemini.ts` currently uses `?key=`; change it.

- **C2 — Embedding egress is opt-in, disclosed, and secret-scrubbed (🟠 HIGH).** Embeddings/backend are **off by default**; the installer must explicitly state that enabling embeddings sends project-derived text (which may contain secrets/PII/proprietary code) to the chosen provider. Before embedding, run a **secret-scrub** pass over chunks (drop/redact high-signal matches: private keys, `AKIA…`, bearer tokens, `password=`, `.env`-style `KEY=secret`) and honor an **ignore-glob** (never ingest `.env*`, `*.pem`, `*secret*`, `id_rsa`, credentials files). No other network egress / no telemetry.

- **C3 — Loopback control-plane anti-CSRF / anti-DNS-rebinding (🟠 HIGH — the key new finding).** Binding to `127.0.0.1` does **not** stop a website the developer visits from POSTing to the loopback hub via their browser. Therefore every mutating request (POST + WS upgrade) MUST: (a) require a **custom request header** (e.g. `X-AIDT: 1`) — browsers cannot send it cross-origin without a CORS preflight the server never grants; (b) validate the **`Host` header** is `127.0.0.1:<port>`/`localhost:<port>` (anti-DNS-rebinding); (c) validate **`Origin`** (when present) against the loopback allowlist for both POST and WS; (d) **never** emit permissive CORS (`Access-Control-Allow-Origin: *`). Off-loopback writes stay refused unless `--allow-remote-writes`, which must log a prominent warning. GET state/SSE may stay header-free (read-only) but SSE that exposes data should also Host-check.

- **C4 — KB/doc path traversal (🟡 MED).** `GET /api/doc` & `project/open`: `path.resolve(root, userPath)` then **`fs.realpathSync`** and re-check `abs === root || abs.startsWith(root + sep)` (defeat `../`, absolute paths, and symlink escape); **`.md` allowlist**; size cap (≤1 MB); never return absolute paths. Add tests for `../../etc/passwd` and a symlink escaping root → `400`.

- **C5 — Write integrity & DoS (🟡 MED).** Ledger/overlay writes are atomic (tmp+fsync+rename) under CAS(`expectedRev`)+in-process mutex. **Enforce body caps before buffering** (request ≤64 KB; comment body ≤8 KB; doc ≤1 MB) — reject oversize with `413`. Cap per-ticket comment JSONL (size/line count) and **throttle the `active` heartbeat (≤1/30 s)**; if churn is high, move `active` to a sidecar. Validate every input (unknown ticket/gate/preset → `400`; `track/reorder` must be a permutation).

- **C6 — Hooks never break a session & are bounded (🟡 MED).** Every hook entry-point is wrapped top-level → **always `exit 0`**; errors to **stderr only** (never stdout, which is injected as context); never `eval`; bound the transcript read (cap file size, time-box embedding ~3 s). Treat `transcript_path`/`cwd` from stdin as untrusted input to *read* (parse JSON only), never to execute.

- **C7 — Supply chain (🟡 MED).** Optional deps (`sqlite-vec`, `@qdrant/js-client-rest`, `@modelcontextprotocol/sdk`) installed **only** when memory is opted in. Commit a `package-lock.json`, install with `npm ci`, pin versions, run `npm audit` in CI, and document an SBOM. No `postinstall` scripts from these beyond what's vetted.

- **C8 — Native extension loading is path-fixed (🟡 MED).** Load the sqlite-vec extension **only** from the installed package (`sqlite-vec.getLoadablePath()`), **never** from a config/env-supplied path. `allowExtension`/`enableLoadExtension` is enabled **only** on the memory DB connection, disabled immediately after load.

- **C9 — Restored context is data, not instructions (ℹ️ INFO).** Keep the injected block clearly framed as data ("## Restored Context from Previous Session") and do not have agents treat recalled text as authoritative commands (prompt-injection hygiene; risk is low since it's the user's own data).

- **C10 — Project isolation is enforced & tested (🟡 MED).** Project-scoped queries MUST filter by `project_id`; only `scope=global` (dev-rules) crosses projects. Add a test proving project-A data never surfaces in project B (AC-M5). `project-id.ts` uses `execFileSync('git', [...])` with **array args (no shell)** — good, no command injection; keep it that way.

- **C11 — Local data-at-rest perms & purge (🟡 MED).** Create `~/.aidevteam/` `0700`; `config.json` and `memory.db` `0600`. Document that the DB stores project-derived text and provide a purge path (delete DB / per-project export already planned). On a shared host this prevents other local users reading recalled project text/keys-in-transcripts.

- **C12 — No secrets in the ledger/comments either (🟢 LOW).** The ledger, overlay, and comment JSONL are commit-eligible artifacts — gate notes/comments must not embed secrets. Document for agents.

## Findings on the existing scaffold (uncommitted `claude/memory/src`)
- ✅ `config.ts` — selection only, no secret persistence. Good.
- ✅ `embeddings/voyage.ts` — key from env, sent via `Authorization` header. Good.
- 🟠 `embeddings/gemini.ts` — key in **URL query string** → **fix per C1a** (use `x-goog-api-key` header).
- ✅ `project-id.ts` — `execFileSync` array args, no shell. Good (C10).
- ✅ `transcript.ts`, `digest.ts` — parse-only, try/catch, no eval. Good. (Add the C2 secret-scrub before embedding, and the C6 read cap.)
- ⏳ Stores/hooks/hub write surface not yet implemented — C3/C4/C5/C8 apply when built.

## Decision
**SECOPS_APPROVED = passed (conditional on C1–C12).** C1, C2, C3 are the must-not-ship-without controls (CSRF on the loopback control plane is the headline risk). All conditions are enforced at /rev (code review) and /verify (final). Re-review required only if the network/egress or the remote-write posture changes materially.
