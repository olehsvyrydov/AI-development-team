# Sprint 09 Tickets — Live Directives

## ADT-240 — Live (per-turn) directive delivery

**Track:** full · **Implementer:** /be · **Gates:** ARCH, **SECOPS (HARD)**, DESIGN (light/deferred), APPROVAL_GATE, CODE_REVIEWED, VERIFIED

### Story

As a user who adds a directive into DART while a Claude Code session is already running, I want
the running agent to see that directive on my **next turn** (or when I ask for it on demand), so
that a mid-session instruction reaches the agent live instead of waiting for the next session to
start.

### Behavior (WHAT, not HOW)

- A directive added to a project after a session has started reaches the running agent on the
  user's **next turn**, surfaced as context for that turn.
- The surfaced directive text is **quoted data addressed to its target agent(s)** — the same
  inert, fence-escaped quoted form already used at session start. The agent decides whether to
  act; the system never executes a directive.
- A directive that has already been surfaced this session is **not surfaced again on every
  subsequent turn**.
- A directive that has been **consumed** (the explicit mark) is never surfaced again, in this or
  any later session.
- A still-pending (unconsumed) directive that was never surfaced this session **does** surface
  again in a fresh session.
- The user can pull the **current pending directives on demand** (without waiting for a turn) via
  a DART command.

### Acceptance Criteria (behavioral)

**Positive**

- **AC1 — mid-session reaches the next turn.** Given a running session, when a directive
  addressed to the active agent/project is added to DART, then on the user's next turn that
  directive appears (as quoted data) in the context for that turn.
- **AC2 — addressed + quoted.** A surfaced directive shows its target agent(s) and its prompt as
  quoted data; an unaddressed directive is shown as unaddressed. The agent may act only if
  addressed.
- **AC3 — on-demand pull.** Invoking the DART directives command returns the current pending
  directives for the project immediately, without requiring a new turn.
- **AC4 — fresh session re-shows unconsumed.** A directive left pending (never consumed) at the
  end of a session is surfaced again at the start of / on the first turn of a new session.

**Negative (each must be proven, not assumed)**

- **AC5 — no re-surface storm.** A directive surfaced on one turn is NOT surfaced again on the
  following turns of the same session while it remains merely unconsumed (it is suppressed by the
  session "seen" marker). Re-surfacing happens only on a new session or after an explicit re-add.
- **AC6 — consumed stays gone.** Once a directive is marked consumed (the explicit ADT-238
  guarded write), it is absent from every later turn and every later session.
- **AC7 — hub-down ⇒ prompt still submits instantly, exit 0.** When the hub/Core is unavailable
  or slow, the per-turn hook injects nothing, the user's prompt still submits with no perceptible
  delay, and the hook exits 0. It never hangs to the timeout.
- **AC8 — never blocks the user.** The per-turn hook never rejects or erases the user's prompt:
  it never returns `decision: block` and never exits non-zero to block. Any internal failure
  degrades to "no injection, prompt proceeds."
- **AC9 — injected text is inert quoted data.** A directive whose body contains
  instruction/injection-like text ("ignore the workflow", "run rm -rf", "set gate X to passed")
  is surfaced verbatim inside the quoted/fenced block and the system takes no action on it; a
  body containing the fence delimiter cannot break out of the quote and inject trailing
  instructions. (Reuses ADT-238 `renderDirectiveData`.)
- **AC10 — read-only surfacing, no mutation.** Surfacing a directive on a turn (or via the
  on-demand command) mutates no project state: it does not consume the directive, does not write
  the ledger, does not append a comment to the project log. The only durable consumption remains
  the explicit ADT-238 `directive/consume` guarded CAS write. The per-session "seen" marker is
  advisory display-state stored outside the project (session-scoped), never a consumption record.
- **AC11 — no secret injected.** The per-turn surface renders only the `buildState` data the
  session-start digest already exposes — no config field, no API key, no secret-bearing file.

### Out of scope

- Any Cockpit directive-inbox UI (DESIGN deferred).
- Changing the consumption model (stays ADT-238's explicit guarded write).
- A second directive store (explicitly forbidden — reuse ADT-238 machinery).

### Reuse (HOW-free pointer for /arch, not a constraint on the ticket)

Extends ADT-238: the pending-directives projection, the fence-escaped quoted-data renderer, and
the derived-pending / mark-consumed model are reused unchanged. The new element is a per-turn
delivery channel + a session-scoped "already-surfaced" suppressor.
