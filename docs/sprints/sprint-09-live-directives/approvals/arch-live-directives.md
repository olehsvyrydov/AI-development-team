# Architecture Decision: Live (per-turn) directive delivery — ADT-240

**Decision By**: /arch (Jorge)
**Date**: 2026-06-12
**Branch**: `feat/dart-live-directives`
**Ticket**: ADT-240 (Live per-turn directive delivery)
**Gate**: `ARCH_APPROVED` — required (new per-turn hook + a session-scoped seen marker + an on-demand command).
**Status**: **APPROVED** (the HARD `SECOPS_APPROVED` gate must still pass before implementation — this ADR scopes exactly what /secops must hard-verify).
**Ratifies**: D-901 .. D-907 (`DECISION_LOG.md`).

This decision extends ADT-238's machinery. It introduces **no new directive store, no new renderer, and no new consumption model**. It adds exactly one delivery channel (a `UserPromptSubmit` hook), one advisory suppressor (a session-scoped "seen" marker stored outside the project), and one read-only convenience command.

---

## 1. Context & constraints

ADT-238 surfaces a project's pending directives in the **SessionStart** digest. A directive added in
the Cockpit *mid-session* is therefore invisible to the running agent until the session restarts.
ADT-240 closes that gap on the user's **next turn**, reusing ADT-238 unchanged.

**Hard environment constraint — the `UserPromptSubmit` contract (Claude Code):**

- The hook receives on **stdin** a JSON object: `{ session_id, transcript_path, cwd, prompt, ... }`.
- On **exit 0**, the hook's **stdout** (or, equivalently, a JSON
  `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"…"}}`) is injected
  as **context for that turn** — exactly the "reach the agent on the next turn" mechanism we need.
- On **exit 2** or a JSON `{"decision":"block","reason":"…"}` the hook **REJECTS the user's prompt**.
  This MUST NEVER happen here.
- The hook runs **inside** the turn and **blocks model processing** up to the platform timeout
  (~30s default). A slow hook delays the user's prompt. Therefore a **tight internal deadline +
  instant degrade-to-nothing** is mandatory.

**Reuse contract (verified in source, do not duplicate):**

| Reused element | Source | Role here |
|---|---|---|
| `pendingDirectives(comments)` — derived-pending projection | `hub/lib/state.js` | the source of truth for "what is pending"; per-ticket and rolled up into `state.directives[]` |
| `renderDirectiveSection` / `renderDirectiveData` — fenced, fence-break-escaped QUOTED DATA | `hub/lib/digest.js` | the **only** renderer; injected text is verbatim quoted data, never an instruction position |
| `directive/consume` — explicit guarded CAS/append-only write | `hub/lib/api.js` | the **only** durable consumption; unchanged — surfacing never consumes |
| SessionStart hook template — deterministic digest first, `withDeadline`, always `exit 0` | `claude/memory/src/hooks/restore-context.ts` | the structural template for the new hook |
| Hub digest CLI (`node hub/lib/digest.js <cwd> --text|--json`) | `hub/lib/digest.js` | the deterministic, overlay-aware data path the hook shells, with a local fallback |

**Quality attributes (utility tree, abbreviated):**

- **Safety/Injection (H,H)** — injects on *every* turn; the ADT-238 verbatim-quoted-data posture must hold at higher frequency.
- **Liveness/Never-block (H,H)** — the prompt must always submit; the hook never rejects, never hangs.
- **Idempotence/No-storm (H,M)** — an unconsumed directive shown once this session is not re-shown every turn.
- **Durability (H,M)** — an unconsumed directive survives restart and re-shows in a fresh session (lives in the append-only log, not session memory).
- **No-secret (H,H)** — only `buildState` data the digest already exposes is rendered.

---

## 2. The `UserPromptSubmit` hook (Decision)

**A new hook, sibling to `restore-context.ts`** — `claude/memory/src/hooks/live-directives.ts` —
declared in `.claude-plugin/hooks/hooks.json` under a new `UserPromptSubmit` event (matcher `""`,
short `timeout`, see §4). It mirrors the `restore-context.ts` model exactly: deterministic
file-derived data first, time-boxed, **always `exit 0`**.

Per-turn algorithm (read-only, never-block):

1. **Read stdin JSON** (`readStdinJson` from `common.ts`): take `cwd`, `session_id`, `transcript_path`, `prompt`.
2. **Resolve the project** — same model as `restore-context.ts`: the bound project is `cwd`. The
   hub digest CLI (`hub/lib/digest.js`) does its own `registry`/overlay-aware resolution from that
   `cwd` (the `resolve-project.js` "lookup key, never a path" model). The hook passes `cwd` only; it
   **never** accepts a project path or id from the prompt body or anywhere else.
3. **Get the pending directives** via the **same deterministic data path** the SessionStart hook
   uses — shell the hub digest CLI:
   `execFileSync("node", [HUB_DIGEST, cwd, "--json"], { timeout: ~1500ms, stdio: ["ignore","pipe","ignore"] })`,
   then read **`state.directives[]`** (each `{ ticket, id, target, prompt, at }`) — the rolled-up
   projection `buildState` already exposes (`state.js` line ~699), which is exactly
   `pendingDirectives` per ticket flattened with the owning ticket id. If the CLI is absent/errors,
   fall back to the **in-process** projection: `require('hub/lib/state.js').buildState(cwd)` (same
   pure read). If that also fails → **inject nothing, exit 0**. (Mirrors `projectDigest()`'s
   hub-CLI-then-local-renderer fallback.)
   - **Why `--json`, not `--text`:** the per-turn surface must inject **only the newly-pending**
     directives, not the whole board digest. `--text` renders the entire multi-ticket board; the
     hook needs the directive *records* so it can filter by id (§3) and then render **only the
     survivors** with the unchanged renderer.
4. **Filter to "newly-pending"** = `unconsumed` **AND** `not-yet-surfaced-this-session` (§3). The
   "unconsumed" half is already true of every entry in `state.directives[]` (that projection only
   lists directives with no matching consumed marker). The hook applies the session-seen filter on
   top, by directive `id`.
5. **Render the survivors** with the **unchanged** `renderDirectiveSection` (from `hub/lib/digest.js`).
   The hook constructs the same per-ticket shape the renderer expects
   (`{ pendingDirectives: [survivors for that ticket], permittedLabels: [] }`) and calls the
   exported renderer — **no new rendering path, no string interpolation of the prompt**. Group the
   survivors by `ticket` so each block is labelled by its ticket id, exactly as the board digest does.
6. **Inject** the rendered block as `additionalContext` (or stdout) under a short, fixed heading
   (e.g. `## New directives since your last turn`). **If there are no survivors, inject NOTHING**
   (empty stdout) and exit 0 — the turn proceeds silently.
7. **Record the survivors' ids as "seen this session"** (§3) — the only side effect, and it is
   **outside the project** (session-scoped advisory cache), never the project ledger.
8. **`exit 0` on every path.** Wrap `main()` in the same `.catch(…).finally(() => process.exit(0))`
   harness `restore-context.ts` uses. Errors go to **stderr only** (stdout is injected context, so
   no error text can leak into the turn).

**What is explicitly NOT done by the hook:** it does not write the project ledger, does not append a
project comment, does not call `directive/consume`, does not open `.workflow-state.json` or any
project file for writing, does not read any config/secret file. It is a pure reader of the digest
projection plus a writer of one tiny session-scoped marker outside the project.

---

## 3. The "newly-pending / seen-this-session" derivation (the crux)

The problem: re-injecting every unconsumed directive on *every* turn is noise and a write-storm risk.
"Not-yet-surfaced-this-session" must be computed **read-only**, must be **advisory display-state**
(NOT consumption), and must **never** be a project-ledger write. Per D-903/D-904, two **independent**
suppressors compose:

```
surface a directive on a turn  ⇔  (unconsumed in the file-derived log)   ← durable, ADT-238, cross-session
                                AND (not yet surfaced in THIS session)    ← advisory, session-scoped, this slice
```

- The **durable** half is ADT-238's derived-pending projection (`pendingDirectives` → `state.directives[]`).
  It is the only thing that makes a directive permanently gone (after an explicit `directive/consume`)
  or makes an un-acted directive re-appear in a fresh session. **Unchanged.**
- The **advisory** half is the new session-scoped "seen" marker. It only suppresses *re-display
  within one session*; it never marks a directive consumed.

### 3a. Transcript-derived FIRST (primary, D-903)

The hook receives `transcript_path` + `session_id`. The transcript is the authoritative record of
**what was actually injected into this session**. So the primary derivation is:

- **Read the tail** of `transcript_path` (bounded — last N KB / last M lines; never the whole file),
  scan for the hook's own injected blocks, and collect the **directive ids already injected this
  session**. To make this scan cheap, deterministic, and self-describing, each injected block carries
  a **stable, machine-greppable marker line per directive id** — e.g. an HTML-comment sentinel
  `<!-- dart:directive-shown id=<id> -->` emitted alongside each rendered directive (inside the
  injected context, invisible as prose, never inside the fenced data block so it cannot be spoofed by
  directive content). The hook greps the transcript tail for `dart:directive-shown id=…` and treats
  those ids as seen.
  - **Spoofing note for /secops:** the sentinel is emitted by the hook *outside* the fenced quoted-data
    block. A malicious directive **body** is always inside the fence (escaped by `renderDirectiveData`),
    so it cannot emit a sentinel line that marks *another* directive id as seen. The scan matches the
    sentinel shape only; a directive body containing the literal sentinel text is fenced data and is
    not at line-start in an injection position.
- **Bounded + never-blocks:** the tail read is size-capped and time-boxed under the same deadline
  (§4). If `transcript_path` is missing/unreadable/oversized, fall through to 3b. A parse miss is not
  an error — it just means "treat as unseen for the fallback to resolve."

### 3b. Session-scoped seen-file (fallback / cache, D-903)

When the transcript is unreadable (or as a fast cache to avoid re-scanning a long transcript every
turn):

- **Path:** `~/.aidevteam/sessions/<session_id>.seen` — under the user-global state root
  (`aidevteamHome()` from `claude/memory/src/lib/paths.ts`), in a **new `sessions/` subdir**,
  **OUTSIDE any project directory**. The `<session_id>` is the opaque id from stdin; it is validated
  to a safe charset (e.g. `^[A-Za-z0-9._-]{1,128}$`) before being used as a filename so it can never
  traverse out of `sessions/`. A failed validation → skip the file entirely (transcript-only).
- **Shape:** append-only, one directive `id` per line (newline-delimited). Tiny and bounded
  (a session sees a handful of directives). Created on demand with `0700` dir / `0600` file,
  consistent with the existing `~/.aidevteam` posture.
- **Read:** load the set of ids once at the top of the turn (cheap; small file).
- **Update:** after rendering, **append** the survivors' ids (the ones just injected) — append-only,
  so it is idempotent and there is no read-modify-write race that could corrupt it. A write failure is
  swallowed (stderr only); worst case a directive is shown again next turn — annoying, never unsafe,
  never blocking.
- **Lifecycle / cleanup:** the file is keyed by `session_id`, so it is naturally bounded to live
  sessions. Stale files are harmless (a dead session's marker is never re-read). A best-effort prune
  (e.g. age-based on next run, or left to the user's tmp hygiene) MAY be added later; it is **not**
  on the never-block path and is out of scope for this slice.

### 3c. What this guarantees (the AC mapping)

- **Mid-session add → next turn shows it** (AC1): the directive is unconsumed AND not-yet-seen this
  session → surfaced.
- **Same directive not re-shown every turn** (AC5): after turn 1 its id is in the transcript/seen-file
  → suppressed on turns 2..N while still merely unconsumed.
- **Consumed → never shows again** (AC6): the durable `directive/consume` removes it from
  `pendingDirectives`, so it is absent from `state.directives[]` on every later turn and session —
  independent of the seen marker.
- **Fresh session re-shows unconsumed** (AC4): a new `session_id` ⇒ empty/absent seen-file and a fresh
  transcript ⇒ the still-pending directive is "unseen" again → surfaces on the first turn.
- **Surfacing mutates no project state** (AC10): the only write is the session-scoped seen-file
  outside the project; consumption stays the explicit ADT-238 guarded CAS write.

---

## 4. The deadline budget (never-block posture)

The hook runs *inside* the user's turn and blocks model processing up to the platform's ~30s timeout.
A hub-down or slow path must **degrade to no-injection instantly**, never hang to the timeout.

- **Hook-internal deadline ≈ 1–1.5s total**, well under the 30s block-timeout — mirroring
  `restore-context.ts`'s `2000ms` digest `execFileSync` timeout and `withDeadline`. Budget:
  - digest CLI `execFileSync` `timeout: ~1500ms` (single bounded child process), **stdio piped/ignored**;
  - transcript tail read: size-capped (last ~64KB) + wrapped in the same deadline;
  - seen-file read/append: tiny, synchronous, swallow errors.
- **`hooks.json` `timeout`:** set a small wall-clock timeout (e.g. **5s**) on the hook entry — a hard
  backstop **far below** the 30s model-block timeout, so even a pathological case cannot stall the
  turn perceptibly. The internal ~1.5s deadline is the primary control; the 5s entry timeout is the
  belt-and-suspenders backstop. (Contrast: SessionStart uses 15s because a new session can absorb it;
  a per-turn hook cannot.)
- **Degrade rule:** hub-down / slow / CLI-absent / parse-error / oversized-transcript ⇒ **inject
  nothing + exit 0**. The prompt proceeds immediately. **Never throws, never `decision:block`, never
  non-zero exit.**
- **No network of its own:** the hook only shells the local digest CLI (or the in-process pure read).
  It does not call a remote, does not depend on a live hub HTTP server. The digest path is
  file-derived, so a down hub board does not block it; only a slow `node` child could, and that is
  bounded by the `execFileSync` timeout.

---

## 5. The on-demand command (optional, D-902)

A read-only convenience that pulls the **current** pending directives immediately, without waiting
for a turn.

- **Where it lives:** a plugin command markdown file under the plugin's `commands` root
  (`claude/commands/`), namespaced `dart:` like the rest of the team. **Decision: `dart:directives`,
  alias `dart:next`** (two command files, or one file documenting the alias, per the repo's command
  convention).
- **What it does:** instructs the agent to run the **same deterministic digest path** the hook uses —
  `node hub/lib/digest.js <project> --json` (or `--text` for the human-readable board) — and present
  the project's **current** `pendingDirectives` (all of them, since "on demand" means "show me what's
  pending now", not "what's new this turn"). It reuses the **same projection and renderer**; it adds
  no new data source.
- **Read-only (AC3/AC10):** the command surfaces directives; it **does not** consume them and writes
  **nothing** to the project. It does **not** touch the session seen-file either (an explicit pull is
  not "the hook surfaced it this turn"); keeping the command free of the seen-marker avoids a pull
  silently suppressing the next turn's injection. Consumption remains the explicit `directive/consume`.
- **Priority:** the hook alone closes the core gap (AC1/AC4/AC5). The command is a lower-priority
  convenience (AC3) and may ship in the same slice or immediately after.

---

## 6. What /secops MUST hard-verify (precise list — the HARD, safety-override gate)

This injects context on **every** user turn, so the ADT-238 conditions (C238-1..6) re-trip at higher
frequency. /secops must record `approvals/secops-live-directives.md` extending them into per-turn
conditions, each proven by a negative test that **fails if its control is removed** (assert *no-write*
where state is involved):

1. **Verbatim quoted DATA on every turn (re-trips A4).** Each directive's `target[]` + `prompt` is
   rendered ONLY through the **unchanged** `renderDirectiveData` / `renderDirectiveSection` — fenced,
   fence-break-escaped (the `​` run-splitter), never an instruction position. A body containing
   `"ignore the workflow"` / `"run rm -rf"` / `"set gate X to passed"` is surfaced as quoted data only;
   DART never acts on it; only the addressed agent may choose to. A body containing the fence delimiter
   cannot break out. **No new rendering path; no string interpolation of the prompt.** *(AC2, AC9.)*
2. **Never-block / exit-0 / instant-degrade.** The hook MUST `exit 0` on every path, MUST NOT emit
   `{"decision":"block"}`, MUST NOT exit non-zero on the user's behalf. Hub-down/slow/parse-error ⇒
   inject nothing + exit 0; the prompt submits with no perceptible delay; the hook never hangs to the
   30s timeout (internal ≈1.5s deadline + 5s `hooks.json` backstop). *(AC7, AC8.)*
3. **Read-only surfacing — the seen-marker is advisory, not consumption, not a project write.**
   Surfacing on a turn (or via `dart:directives`) mutates NO project state: no `directive/consume`, no
   `.workflow-state.json` byte, no project comment, no overlay byte. The ONLY write is the
   session-scoped seen-file **outside** the project (`~/.aidevteam/sessions/<session_id>.seen`), which
   is advisory display-state, append-only, and never a consumption record. Consumption stays the
   explicit ADT-238 guarded CAS write. *(AC10.)* Prove: a surfaced-but-unconsumed directive is still
   pending in the project log after the turn; no project file changed bytes.
4. **No re-surface storm (idempotent unseen-tracking).** A directive surfaced on turn 1 is NOT
   re-injected on turns 2..N of the same session while it remains merely unconsumed. Prove the
   transcript-scan AND the seen-file fallback each suppress; removing the seen filter re-surfaces every
   turn → test fails. *(AC5.)*
5. **Seen-marker cannot be spoofed by directive content / cannot traverse.** The transcript sentinel is
   emitted outside the fenced block; a malicious directive body (inside the fence) cannot forge a
   `dart:directive-shown id=…` line to mark another id seen. `<session_id>` is charset-validated before
   use as a filename so the seen-file path cannot escape `~/.aidevteam/sessions/`. *(injection + path-traversal.)*
6. **No secret injected.** The surface renders ONLY `buildState`/`state.directives[]` data the digest
   already exposes — no config field, no API key, no secret-bearing file read. The hook opens no
   `~/.aidevteam/config.json` secret field, no env value. *(AC11.)* Prove: add a field that reads a
   secret → test fails.
7. **Durable across restart.** An unconsumed directive survives a session restart and re-surfaces in a
   fresh session (file-derived from the append-only log, not session memory; a fresh `session_id` ⇒
   fresh seen-state). *(AC4, AC6 reuse ADT-238 C238-3/4.)*
8. **Bound to one project, no retarget.** The hook passes only `cwd`; it never accepts a
   client/prompt-supplied project path or id. The digest path resolves the project from `cwd` via the
   existing registry model (`resolve-project.js` "lookup key, never a path"). *(no cross-project read.)*

---

## 7. Risks & trade-offs (ATAM)

| # | Risk | Sensitivity | Mitigation | Residual |
|---|---|---|---|---|
| R1 | Per-turn injection is a *higher-frequency* prompt-injection surface than SessionStart | Safety | Unchanged `renderDirectiveData` (fenced, escaped); HARD SECOPS condition (1); sentinel emitted outside the fence | Low — same control as ADT-238, proven by test |
| R2 | A slow `node` digest child stalls the turn | Liveness | `execFileSync timeout ~1500ms` + internal `withDeadline` + 5s `hooks.json` backstop; degrade-to-nothing | Low |
| R3 | Transcript scan is unreliable (rotated/compacted/format drift) | Idempotence | Session seen-file fallback (3b); a miss re-shows at worst once, never unsafe | Low — annoyance only |
| R4 | Seen-file write race / corruption | Idempotence | Append-only id-per-line; no read-modify-write; swallow write errors | Low |
| R5 | Stale `.seen` files accumulate in `~/.aidevteam/sessions/` | Maintainability | Tiny files keyed by session; harmless if stale; optional later prune (off the never-block path) | Low |
| R6 | Sentinel spoofing — a directive body forges a "seen" marker | Safety | Sentinel emitted OUTSIDE the fenced data block; body is always fenced/escaped; scan matches sentinel shape only | Low — SECOPS condition (5) |
| R7 | On-demand pull silently suppresses the next turn's injection | Usability | The command does NOT write the seen-file (§5); only the hook marks seen | None |
| R8 | `--json` exposes more `buildState` than needed | Confidentiality | Hook reads ONLY `state.directives[]`; no config/secret in that projection (SECOPS condition 6) | Low |

**Non-risks (safe decisions):** reusing the ADT-238 renderer/projection/consume unchanged; passing
only `cwd`; storing the seen marker outside the project; the never-block/exit-0 harness copied from
`restore-context.ts`.

---

## 8. Decision summary (guardrails for /be — WHAT, not HOW)

- **New hook** `claude/memory/src/hooks/live-directives.ts`, declared as a `UserPromptSubmit` entry in
  `.claude-plugin/hooks/hooks.json` (matcher `""`, `timeout: 5`). Mirrors `restore-context.ts`:
  deterministic data first, time-boxed (~1.5s internal), **always `exit 0`**, errors to stderr only.
- **Data path:** shell `node hub/lib/digest.js <cwd> --json`, read `state.directives[]`; fall back to
  in-process `buildState(cwd)`; on any failure inject nothing + exit 0.
- **Filter:** `unconsumed` (already true of `state.directives[]`) **AND** `not-seen-this-session`
  (transcript sentinel scan FIRST, `~/.aidevteam/sessions/<session_id>.seen` append-only fallback).
- **Render:** the survivors via the **unchanged** `renderDirectiveSection` / `renderDirectiveData`
  (fenced quoted DATA), grouped by ticket; emit a per-directive `dart:directive-shown id=…` sentinel
  outside the fence; inject as `additionalContext`. No survivors ⇒ inject nothing.
- **Seen marker:** advisory display-state, session-scoped, OUTSIDE the project; append-only; never the
  project ledger; never consumption. `<session_id>` charset-validated before use as a filename.
- **Consumption:** UNCHANGED — the explicit ADT-238 `directive/consume` guarded CAS write is the only
  durable consumption.
- **On-demand command:** `dart:directives` (alias `dart:next`) under `claude/commands/`, read-only,
  reuses the same digest projection; does NOT consume and does NOT touch the seen-file.
- **No second store, no new renderer, no new consumption model.**

**`ARCH_APPROVED → passed`** for ADT-240. Dependent implementation remains blocked until the **HARD,
safety-override** `SECOPS_APPROVED` gate passes against §6.

/sm — please update sprint status.
