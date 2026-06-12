# Decision Log - Sprint 09 (Live Directives)

**Last Updated:** 2026-06-12

## Decisions

| ID | Decision | Category | Rationale | Approved By | Date |
|----|----------|----------|-----------|-------------|------|
| D-901 | Mid-session delivery rides a **UserPromptSubmit** hook, not a new store or a poller | Architecture | Claude Code fires UserPromptSubmit on every user message; on exit 0 its stdout (or `hookSpecificOutput.additionalContext`) is injected as context for that turn. That is exactly the "reach the agent on the next turn" mechanism the vision needs. It mirrors the proven SessionStart `restore-context.ts` model (deterministic digest first, time-boxed, always exit 0). No second directive store — it reuses ADT-238's `pendingDirectives` projection + `renderDirectiveSection`. | /po, /arch | 2026-06-12 |
| D-902 | MVP = **UserPromptSubmit hook** (mandatory) + **optional on-demand `/dart:directives` command** | Product | The hook satisfies the core vision ("as soon as I add a directive, the next turn sees it") with zero user action. The on-demand command (`/dart:directives`, alias `/dart:next`) is a thin convenience that pulls the *current* pending set immediately, for when the user wants to force a refresh without typing a turn. The command is in scope but lower priority than the hook; the hook alone closes the gap. | /po | 2026-06-12 |
| D-903 | The per-session **"already-surfaced" marker is transcript-derived first, with a session-scoped seen-file as the fallback** — NOT a ledger/comment write | Architecture, Security | Re-injecting every unconsumed directive on every turn is noise and risks a write storm. "Unseen this session" is computed read-only: (a) the hook receives `transcript_path` + `session_id`; it scans the transcript tail for directive ids it already injected this session and emits only ids NOT yet seen; (b) if the transcript is unreadable, it falls back to a session-scoped seen-set file keyed by `session_id` under the plugin's own scratch dir (e.g. `~/.aidevteam/sessions/<session_id>.seen`), append-only, tiny, never the project ledger. Crucially this marker is **advisory display-state, NOT consumption** — it only suppresses *re-display this session*; it never marks a directive consumed. Consumption stays the explicit ADT-238 guarded CAS write (`directive/consume`). So a directive the agent never acted on is still pending after restart (durable) and still re-surfaces in a fresh session. | /po, /arch, /secops | 2026-06-12 |
| D-904 | Re-surfacing is gated on **"unconsumed AND not-yet-shown-this-session"** | Product | Two independent suppressors compose: ADT-238's durable "consumed" marker removes a directive permanently across all sessions; the session-scoped "seen" marker removes it from *repeat* turns within one session. A directive surfaces on a turn iff it is (still pending = unconsumed in the file-derived log) AND (not yet surfaced in this session). This gives: mid-session add → shows next turn; same directive → not re-shown every turn; new session → shows again until consumed; consumed → never shows again. | /po | 2026-06-12 |
| D-905 | The hook is **fast + never-block**: exit 0 always, `decision:block` and exit-2 are forbidden, short timeout, hub-down degrades to no-injection instantly | Security | UserPromptSubmit *blocks model processing* (30s default timeout) and can reject the prompt via exit 2 / `decision:block`. The directive hook must NEVER do that — a hub-down or slow path must let the prompt submit instantly. It shells the deterministic file-derived digest under a tight internal deadline (mirroring `restore-context.ts`'s 2s digest exec + `withDeadline`); on any error/timeout it injects nothing and exits 0. It never returns `decision`, never exits non-zero on the user's behalf. | /po, /secops | 2026-06-12 |
| D-906 | Injected directive text stays **verbatim quoted DATA**, reusing the ADT-238 renderer unchanged | Security | The per-turn surface is a *higher-frequency* prompt-injection surface than SessionStart (fires every turn), so it MUST reuse `renderDirectiveSection` / `renderDirectiveData` exactly — fenced, fence-break-escaped, never in an instruction position, only the addressed agent may act. No new rendering path. No secret (buildState data only). | /secops | 2026-06-12 |
| D-907 | DESIGN gate is **light / deferred** | Product | The surface is injected session text (same format as ADT-238) and a CLI command — no styled UI, no new visual surface. The user has deferred interface polish. DESIGN fires only if a Cockpit directive-inbox view is later built (out of scope here). | /po | 2026-06-12 |

## Open items carried to /arch and /secops

- **/arch** must specify, in `approvals/arch-live-directives.md`: the exact "newly-pending"
  derivation (transcript-scan format + the session-seen-file fallback path and shape), the
  hook's deadline budget, and how the on-demand command reuses the same digest path.
- **/secops** must, in `approvals/secops-live-directives.md`, extend the ADT-238 conditions
  (C238-1..6) into per-turn conditions: verbatim-quoted-data on every turn (re-trips the A4
  prompt-injection risk at higher frequency), never-block/exit-0/instant-degrade, read-only
  (the seen-marker is advisory display-state, not consumption, and is NOT a project-ledger
  write), no re-surface storm, no secret. This is the **HARD, safety-override** gate.

## Categories

- **Architecture**: System design, patterns, technology choices
- **Security**: Injection safety, never-block posture, read-only surfacing, secret handling
- **Product**: Features, UX, scope, priorities
- **Process**: Team workflow, tooling, practices
