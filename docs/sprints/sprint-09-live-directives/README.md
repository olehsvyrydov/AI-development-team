# Sprint 09 — Live Directives (mid-session directive delivery)

**Status:** Planning
**Branch:** `feat/dart-live-directives`
**Goal:** Close the mid-session gap in DART's directive delivery. A directive added in the
Cockpit while a Claude Code session is already running must reach the running agent on the
user's **next turn** (or on demand) — not only at the next session start.

## Why

ADT-238 surfaces pending directives in the **SessionStart** digest. That works at the start of a
session, but a directive added in the Cockpit *mid-session* is invisible to the running agent
until the session restarts. The user's core vision — *"as soon as I add a directive into DART,
the triggered subagent should pay attention to it"* — is still unmet for the live case.

## Scope

| Ticket | Title | Track | Implementer |
|--------|-------|-------|-------------|
| ADT-240 | Live (per-turn) directive delivery: a `UserPromptSubmit` hook surfaces newly-pending directives each turn + an on-demand pull command | full | /be |

This sprint extends ADT-238's machinery — it does **not** build a second directive store. The
pending-directives projection (`hub/lib/state.js pendingDirectives`), the fence-escaped
quoted-data renderer (`hub/lib/digest.js renderDirectiveSection`), and the
derived-pending / mark-consumed model (`hub/lib/api.js directive/consume`) are reused as-is.

## What's new vs ADT-238

1. A **UserPromptSubmit** hook (mirrors `restore-context.ts`): on every user turn it shells the
   same deterministic digest and injects the **newly-pending** directives for the active
   project/agent as additional context — degrading instantly (exit 0, no injection) when the hub
   is slow/down.
2. A per-session **"already-surfaced" marker** so an unconsumed directive is not re-injected on
   every single turn (idempotent "new/unseen" tracking) — see `DECISION_LOG.md` D-901..D-903.
3. An optional on-demand **`/dart:directives`** (a.k.a. `/dart:next`) command to pull the current
   pending directives without waiting for a turn.

## Gates

- **ARCH** — required (new per-turn hook, the seen-tracking model, the on-demand command).
- **SECOPS** — required, **HARD / safety-override**. This injects context on *every* user turn,
  so the ADT-238 injection-safety posture applies and is tightened for the per-turn surface
  (verbatim quoted DATA, fast + never-block, read-only, no secret, no re-surface storm).
- **DESIGN** — light / deferred (reuses the ADT-238 text format; no new visual surface).

## Layout

```
sprint-09-live-directives/
├── README.md          # this file
├── DECISION_LOG.md    # /po + /arch + /secops decisions (D-901..)
├── approvals/         # arch-live-directives.md, secops-live-directives.md (to be written by /arch, /secops)
├── implementation/    # /be notes per ticket
├── reviews/           # /rev
└── testing/           # /qa + /e2e
```
