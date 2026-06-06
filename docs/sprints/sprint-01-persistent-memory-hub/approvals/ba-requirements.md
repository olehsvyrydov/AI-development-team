# BA Requirements & Process Consolidation — Memory + Workflow + Builder Hub

**Author:** Anna (/ba) · **Mode:** design-only (plan) · **Companion to:** `imperative-mapping-prism.md` (the technical plan)

This document is the *requirements layer* over the existing technical plan. It does NOT change the phasing
(memory first). It (1) consolidates the ticket lifecycle into one process model that feeds the hub popup,
(2) writes behavior-only acceptance criteria for every feature, (3) defines the interactive-install journey,
(4) catalogues edge cases / NFRs, and (5) gives a MoSCoW tied to delivery.

All ACs are **behavior-only** (WHAT, not HOW) per the framework's `Behavior-only tickets` rule — no file
paths, no code, no line numbers. They are written so each maps cleanly to an existing gate/ledger concept.

---

## 1. Consolidated Process Model — one lifecycle feeding the hub popup

### 1.1 The single source of truth already exists

The framework already defines the lifecycle; the hub must *reflect* it, not invent a parallel one:

- **Stages** come from `tracks` in `workflow.yaml` (proportional: `floor_min` … `full`). The canonical
  human-facing stage sequence is `Requested → Arch → SecOps → Design → Dev → Review → QA → Done`,
  realized as the `full` track and *subsetted* for smaller change-classes.
- **Gate decisions** live in the **ledger** (`.workflow-state.json` first-available cascade): each gate has
  `state ∈ {passed, pending, rejected}`, `by` (agent), `at` (ISO-8601), optional `note`, plus `skips[]` and
  a `qa` outcome block.
- **Active agent** is derivable today (stage → owner via the gates' `owner`) but only made *first-class* by
  Phase 2's `assignee`/`assigned_at` ledger fields.

The design principle: **the popup is a read-model projected from the ledger + tickets + KB.** Nothing in the
hub is authored only-in-the-hub except via the Phase-3 POST API, which writes back into those same files.

### 1.2 Stage → Status → Gate → Owner map (the projection table)

| Lifecycle stage | Hub STATUS label (color) | Gate that governs it | Default owner | Ledger evidence the popup shows |
|---|---|---|---|---|
| Requested / Vision | `Requested` (grey) | — (ticket + behavioral AC exist) | `/po` `/ba` | description + AC; first comment = intake note |
| Architecture | `Arch` (blue) | `ARCH_APPROVED` (hard) | `/arch` | gate decision comment + note |
| Security | `SecOps` (purple) | `SECOPS_APPROVED` (hard, safety-override) | `/secops` | gate decision comment + note |
| Design | `Design` (teal) | `DESIGN_APPROVED` (soft) | `/ui` | design-approval comment / skip+reason |
| Approval gate | `Ready` (indigo) | `APPROVAL_GATE` (hard, track:full) | `/verify` | pre-impl audit comment |
| Dev / TDD | `In Dev` (amber) | — (TDD; impl + tests) | `/be` `/fe` | implementation handoff note |
| Review | `In Review` (orange) | `CODE_REVIEWED` (hard, std/full) | `/rev` | review-findings comment (pass/reject) |
| QA / E2E | `In QA` (cyan) | `qa.outcome` + tests | `/qa` `/e2e` | qa outcome (evidence) comment |
| Reliability | `Reliability` (slate) | `RELIABILITY_OK` (soft) | `/sre` | reliability note / skip+reason |
| Verify | `Verifying` (violet) | `VERIFIED` (hard, track:full) | `/verify` | final audit comment |
| Done | `Done` (green) | — | — | closing summary |
| (any) blocked by rejected gate | `Blocked` (red) | the rejected gate | gate owner | rejection comment + reason |

Color is **derived from status**, and status is **derived from the active track's current stage + the gate
state at that stage** — so the colored label and the gate strip can never disagree.

### 1.3 What an agent COMMENT *is* (process definition — this is the missing piece)

A "comment" in the hub popup is **not** chat. It is one of four **first-class, typed ledger/ticket events**,
each tied to a process moment. This is what makes the popup an audit trail rather than a bolt-on:

| Comment type | Process meaning | Who writes it | WHEN it MUST be written | Maps to |
|---|---|---|---|---|
| **Handoff note** | "I'm done; next is X" — what changed, what's left, assumptions | the agent finishing a stage | on every stage transition (before advancing) | `stage` change + `assignee` change |
| **Gate decision** | approve / reject of a specific gate, with rationale | the gate **owner** | whenever a gate flips to `passed` or `rejected` | `gates[G].{state,by,at,note}` |
| **Review/QA finding** | concrete defect, risk, or AC-miss requiring rework | `/rev`, `/qa`, `/e2e`, `/verify` | on any `rejected` outcome, and on pass-with-notes | gate `note` and/or `qa.evidence` |
| **Skip note** | a soft gate intentionally not run, with a reason | the agent invoking the escape hatch | whenever a soft gate is skipped | `skips[]` entry `{gate,reason,by,at}` |

**Rule (consolidates business + dev process):** *every gate state change and every stage transition MUST
emit exactly one comment of the matching type.* The agent's existing Gate Check ("before finishing — set my
postcondition gate + add a ticket note") already mandates the note; we are formalizing that note as a typed,
timestamped, attributed comment so the hub popup is fed by the real workflow. No silent transitions.

### 1.4 Reconciliation with `gate-check.md` pre/post-conditions

The popup's per-stage evidence is exactly the gate-check postcondition for that stage:

- `/arch` postcondition `ARCH_APPROVED` → the Arch-stage gate-decision comment.
- `/secops` postcondition `SECOPS_APPROVED` → the SecOps gate-decision comment (always present when a
  security trigger fired; its absence on a security-triggered ticket is itself a surfaced **Blocked** state).
- `/verify` reads `qa.outcome` as proof QA ran before `VERIFIED` → popup shows the QA finding comment as the
  evidence chain feeding the final Verify comment.
- A `hard` gate that is `pending`/`rejected` upstream of the current stage ⇒ popup status = **Blocked (red)**
  and names the gate + owner, mirroring the engine's "STOP, name the gate, hand off to its owner."

### 1.5 Audit completeness invariant (testable)

For any ticket the hub renders: the ordered comment stream MUST contain a gate-decision comment for every
gate that is `passed` or `rejected`, a handoff note for every `stage` value the ticket has occupied, and a
skip note for every `skips[]` entry. The "active agent" indicator = the current `assignee` (Phase 2), falling
back to the `expectedOwner` of the current stage (greyed) when unassigned.

---

## 2. Behavioral Acceptance Criteria (Given/When/Then, behavior-only)

Priority tags: **P0** = required for the feature to be usable / memory-first floor; **P1** = important but a
later increment. Grouped by feature.

### F0 — Cross-session Memory (Phase 1) — **P0** (memory-first)

- **AC-M1 (digest floor, P0)** — *Given* a project with a workflow definition and a ledger, *when* a new,
  resumed, or compacted session starts, *then* the session is told the active preset and a per-ticket summary
  of stage, active/expected agent, and any unmet or rejected gates — **before** any knowledge retrieval runs.
- **AC-M2 (never breaks a session, P0)** — *Given* no embedding key and no vector backend available, *when* a
  session starts, *then* the session still starts successfully and still receives the deterministic digest
  (degraded, not failed).
- **AC-M3 (semantic recall, P1)** — *Given* a configured memory backend with prior project knowledge, *when*
  a session starts, *then* the session additionally receives the most relevant project-scoped knowledge plus
  globally-scoped dev rules.
- **AC-M4 (capture on compact, P1)** — *Given* a session about to be compacted, *when* compaction occurs,
  *then* the salient context of that session is stored, tagged to the current project, for later recall.
- **AC-M5 (project isolation, P0)** — *Given* knowledge stored for project A, *when* a session starts in
  project B, *then* project-A project-scoped knowledge is NOT surfaced; only B-scoped and globally-scoped
  knowledge is.
- **AC-M6 (global rules cross projects, P1)** — *Given* a dev rule stored as global scope, *when* a session
  starts in any project, *then* that rule is eligible for recall.

### F1 — Clickable ticket → popup with description + comments — **P0**

- **AC-T1 (P0)** — *Given* a ticket on the board, *when* the user clicks it, *then* a popup opens showing the
  ticket's title, full description, and its ordered comment stream.
- **AC-T2 (P0)** — *Given* a ticket popup, *when* it renders a comment, *then* each comment shows its type
  (handoff / gate-decision / review-or-QA finding / skip), the authoring agent, and a timestamp.
- **AC-T3 (P0)** — *Given* a gate has been approved or rejected on a ticket, *when* the user opens that
  ticket, *then* a matching gate-decision comment is present with the deciding agent and rationale.
- **AC-T4 (P1)** — *Given* a ticket popup is open, *when* a new comment is recorded for that ticket by any
  agent, *then* the open popup reflects the new comment without a manual refresh.
- **AC-T5 (audit completeness, P1)** — *Given* a ticket that has passed and/or rejected gates and occupied
  multiple stages, *when* the user opens it, *then* the comment stream contains a comment for every such gate
  decision, stage handoff, and skip (no silent transitions).

### F2 — Color-coded STATUS label + active-agent indicator — **P0**

- **AC-S1 (P0)** — *Given* a ticket at a known lifecycle stage, *when* it renders, *then* it shows a single
  status label whose color is consistently mapped to that status across the whole board.
- **AC-S2 (P0)** — *Given* a ticket with an assigned agent, *when* it renders, *then* it clearly indicates
  which agent is currently working it.
- **AC-S3 (P0)** — *Given* a ticket with no explicit assignee, *when* it renders, *then* it shows the expected
  owner of the current stage, visually distinguished (e.g. muted) from a real assignment.
- **AC-S4 (P0)** — *Given* a ticket whose current stage is governed by a hard gate that is rejected or unmet
  upstream, *when* it renders, *then* its status reads as Blocked and names the responsible gate/owner.
- **AC-S5 (consistency, P1)** — *Given* the gate strip and the status label, *when* both render, *then* they
  never contradict (status is derived from the same gate state the strip shows).

### F3 — Clickable knowledge-base links — **P1**

- **AC-K1 (P1)** — *Given* a knowledge-base entry listed in the hub, *when* the user clicks it, *then* the
  underlying document opens / its content is shown.
- **AC-K2 (P1)** — *Given* a comment or ticket that references a KB document, *when* the user activates that
  reference, *then* the same document opens.
- **AC-K3 (degraded, P1)** — *Given* a referenced KB document that is missing or unreadable, *when* the user
  clicks it, *then* the hub shows a clear "not available" state rather than failing silently.

### F4 — Multiple projects at once, mirrored in real time — **P1**

- **AC-P1 (P1)** — *Given* more than one project under management, *when* the user opens the hub, *then* they
  can see and switch between all such projects.
- **AC-P2 (P1)** — *Given* multiple projects are open, *when* the state of one project changes, *then* only
  that project's view updates; other projects' views are unaffected (isolation).
- **AC-P3 (P1)** — *Given* a project's underlying files change on disk, *when* the change lands, *then* that
  project's board mirrors the change in real time without a manual refresh.
- **AC-P4 (P1)** — *Given* two projects with the same ticket id, *when* both are shown, *then* their tickets,
  comments, and statuses never bleed across projects.

### F5 — WebSocket push + immediate reaction to status changes — **P1**

- **AC-W1 (P1)** — *Given* the hub is open, *when* a gate decision, stage transition, or assignment is
  recorded, *then* the board reacts promptly (sub-second under normal local conditions) without polling by the
  user.
- **AC-W2 (P1)** — *Given* a status change, *when* it is pushed, *then* the color label, active-agent
  indicator, and (if open) the ticket popup all update consistently from the same pushed state.
- **AC-W3 (resilience, P1)** — *Given* the live connection drops, *when* it is re-established, *then* the hub
  reconciles to the authoritative current state (no stale or lost updates).
- **AC-W4 (no echo, P1)** — *Given* a change the user just made in the hub, *when* the push for that same
  change arrives, *then* the view remains consistent (no duplicate or flicker).

> Note: F5 is specified behaviorally as "live push + prompt reaction." Whether the transport is SSE (already
> present) or WebSocket is an architecture decision for `/arch`; the ACs do not mandate the mechanism.

### F6 — Interactive installation with memory choice + later MCP connect — **P0 (install path) / P1 (overlay-later)**

- **AC-I1 (P0)** — *Given* a user running the installer interactively, *when* installation reaches memory
  setup, *then* they are asked to choose a memory backend, with a clearly marked sensible default and a
  no-backend option.
- **AC-I2 (P0)** — *Given* the user picks the no-backend / no-key option, *when* installation completes,
  *then* the framework is fully usable and sessions still get the deterministic digest (degraded gracefully).
- **AC-I3 (P0)** — *Given* the user accepts wiring the session hooks, *when* installation completes, *then*
  cross-session memory injection is active on the next session; *and given* they decline, *then* nothing is
  wired and they are told how to enable it later.
- **AC-I4 (P1)** — *Given* a user who chose minimal memory at install, *when* they later want better memory,
  *then* a documented, low-effort path lets them connect an MCP overlay (e.g. project KB / mem0 / OpenMemory)
  without reinstalling.
- **AC-I5 (idempotent, P0)** — *Given* the installer is run again, *when* it wires hooks/config, *then* it
  does not duplicate or clobber existing user configuration.
- **AC-I6 (secrets, P0)** — *Given* the user provides an API key, *when* installation stores configuration,
  *then* the key is never persisted into committed config or the knowledge store.

### F7 — Explicit workflow state model (Phase 2) — **P0** (prereq for F2/active-agent)

- **AC-X1 (P0)** — *Given* a ticket, *when* its state is queried, *then* its track, current stage, assignee,
  expected owner, and per-gate state are all explicitly available (not merely inferable).
- **AC-X2 (P0)** — *Given* an older ledger without assignee fields, *when* it is read, *then* it still parses
  and the ticket still shows an expected owner (backward compatible).
- **AC-X3 (P0)** — *Given* the memory digest and the hub, *when* both render a ticket's "who/what/stage",
  *then* they agree (one shared state projection).

### F8 — Hub builder + control plane (Phase 3) — **P1**

- **AC-B1 (P1)** — *Given* the builder, *when* the user reorders the stages of a track, *then* the change is
  persisted as an overlay and the pristine base workflow definition is left untouched.
- **AC-B2 (P1)** — *Given* the builder, *when* the user adds a trigger→gate rule, changes a gate's owner /
  refusal, or switches the preset, *then* the change persists and is reflected to agents and the board.
- **AC-B3 (P1)** — *Given* a ticket, *when* the user advances its stage, assigns an agent, or approves/rejects
  a gate from the hub, *then* the ledger updates atomically and the board reflects it live.
- **AC-B4 (concurrency, P1)** — *Given* the ledger was changed externally since the user's view loaded, *when*
  the user submits a hub change against a stale view, *then* the change is rejected and the user is reconciled
  to fresh state (no lost-update clobber).
- **AC-B5 (write safety, P0 for B-scope)** — *Given* the hub is reachable beyond loopback, *when* a write is
  attempted, *then* it is refused unless remote writes were explicitly enabled.
- **AC-B6 (drives the same lifecycle, P1)** — *Given* a control-plane action, *when* it advances a ticket or
  flips a gate, *then* it emits the same typed comment (handoff / gate-decision) a CLI agent would, so the
  audit trail stays uniform regardless of who acted.

---

## 3. Interactive-Install Decision Flow (user journey — behavior, not implementation)

Defaults are chosen so the **zero-config, no-key, no-Docker** path always works and is the recommended one.
The journey is a short branching interview; every question has a default reachable by Enter.

```
START interactive install
   │
   ├─ Q1. Editors to wire? (Claude / Cursor / Kiro / VS Code / all)        [default: Claude]
   │
   ├─ Q2. Workflow preset? (solo / small-team / regulated)                  [default: solo]
   │
   ├─ Q3. MEMORY — how should sessions remember this project?
   │       a) None — deterministic digest only (no vectors, no keys)        [DEFAULT, recommended]
   │       b) Local vector store (no Docker)                                 → Q4
   │       c) Server vector store (if already running)                      → Q4
   │
   ├─ Q4. EMBEDDINGS — only asked if Q3 ≠ None
   │       a) None yet — store now, embed later                              [default if no key found]
   │       b) Provider A (key detected in env)                               [default if a key is present]
   │       c) Provider B
   │       → if a key is chosen, confirm it is read from env, never written to config
   │
   ├─ Q5. WIRE SESSION HOOKS now? (inject digest + recall on session start)  [default: Yes]
   │       • Yes → memory active next session
   │       • No  → print the one-liner to enable later
   │
   ├─ Q6. CONNECT AN MCP OVERLAY now? (project KB / mem0 / OpenMemory / Jira/Confluence)
   │       a) Not now — I'll connect later                                   [DEFAULT]
   │       b) Yes, pick one → guided connect
   │
   └─ FINISH → summary of what was wired + an explicit
              "improve memory later" path:
                • re-run installer and pick a backend, OR
                • connect an MCP overlay at any time (single documented step),
                  picked up automatically — no reinstall, no data migration required.
```

**Journey rules (behavioral):**

- **Graceful default everywhere.** Pressing Enter through the whole interview yields a working install with
  the digest-only memory floor and no external dependencies (satisfies AC-I1/I2).
- **No dead ends.** Choosing "None" / "embed later" / "connect later" never blocks a future upgrade; the
  "improve later" path is always offered at the end (AC-I4).
- **Key handling is explicit.** If the user supplies a key, the install states it is taken from the
  environment and not written to committed config (AC-I6).
- **Idempotent + non-destructive.** Re-running the interview to upgrade memory must not duplicate hooks or
  overwrite unrelated user config (AC-I5), matching the installer's existing non-clobber posture.
- **Later-connect is first-class.** "Connect an MCP overlay (KB / mem0 / OpenMemory) to improve memory" is a
  documented standalone action, not gated behind a reinstall — overlays are picked up automatically when
  present (mirrors the existing `optional_mcp` adapter model in `workflow.yaml`).

---

## 4. Edge Cases, Risks & Non-Functional Requirements

### 4.1 Multi-project isolation (F4)
- **NFR-ISO-1:** project-scoped knowledge and tickets are strictly partitioned by a stable project identity;
  no project-scoped data crosses projects (only global/dev-rule scope may).
- **Edge:** two projects share a ticket id → must remain fully independent in view and storage (AC-P4).
- **Edge:** a project is renamed/moved on disk → its identity should remain stable enough that history isn't
  silently orphaned (risk: identity keyed on path; flag for `/arch`).

### 4.2 Realtime consistency (F4/F5)
- **NFR-RT-1:** the pushed state is authoritative; any optimistic local update reconciles to it.
- **Edge:** rapid successive changes to one ticket → final rendered state equals the last persisted state (no
  reordering/flicker).
- **Edge:** connection drop/reconnect → full reconcile, no lost or duplicated updates (AC-W3).
- **Edge:** simultaneous external CLI edit + hub edit → compare-and-swap rejects the stale writer (AC-B4),
  matching the technical plan's CAS+mutex design.

### 4.3 Offline / no-key degradation (F0/F6)
- **NFR-DEG-1:** absence of keys, network, Docker, or a vector backend MUST degrade to digest-only and MUST
  NOT break session start (AC-M2/AC-I2). This is the non-negotiable session-safety invariant.
- **Edge:** key present but provider unreachable → fall back to digest-only for that session, surface a quiet
  diagnostic, never crash.
- **Edge:** embedding dimension mismatch between providers → skip the affected recall rather than corrupt the
  store; never block the session.

### 4.4 Audit completeness (F1/§1.5)
- **NFR-AUD-1:** every gate decision and stage transition produces exactly one typed comment; the hub can
  reconstruct the full lifecycle from ledger + tickets alone.
- **Edge:** a hard gate is unmet but work somehow advanced (manual edit) → hub surfaces it as Blocked with the
  named gate, rather than hiding the inconsistency.
- **Edge:** a soft gate skipped without a reason → flagged as an incomplete skip (reason is mandatory).
- **Risk:** control-plane writes that bypass the comment emission would break the audit invariant — AC-B6
  closes this by requiring the same typed comment from hub-initiated actions.

### 4.5 Cross-cutting NFRs
- **NFR-SEC-1:** writes only on loopback unless explicitly opened (AC-B5); secrets only from env (AC-I6).
- **NFR-PERF-1:** session-start injection prints the digest first and bounds any retrieval by a short deadline
  so memory never noticeably slows session start.
- **NFR-COMPAT-1:** all ledger/schema additions are backward compatible — old ledgers and the existing
  read-only hub keep working (AC-X2).
- **NFR-PORT-1:** the default stack requires no paid account and no Docker (OSS-first principle).

---

## 5. MoSCoW Prioritization (tied to phased delivery — memory first)

### MUST (Phase 1 — memory floor + the install path that unlocks it)
- AC-M1, AC-M2, AC-M5 — deterministic digest, never-break-session, project isolation.
- AC-I1, AC-I2, AC-I3, AC-I5, AC-I6 — interactive memory choice with safe defaults + idempotent, secret-safe
  wiring.
- AC-X1, AC-X2, AC-X3 — explicit state model (enables the active-agent indicator and one shared projection).
- §1.3 comment-typing rule + §1.5 audit invariant — the process backbone everything else reads.

### SHOULD (Phase 1→2 — make the workflow observable)
- AC-M3, AC-M4, AC-M6 — semantic recall + capture + global rules.
- F1 (AC-T1, AC-T2, AC-T3) — clickable ticket popup with typed comments.
- F2 (AC-S1, AC-S2, AC-S3, AC-S4) — color status + active-agent indicator.

### COULD (Phase 3 — builder, multi-project, live push, KB links)
- F3 (AC-K1–K3) — clickable KB links.
- F4 (AC-P1–P4) — multi-project, mirrored.
- F5 (AC-W1–W4) — WebSocket push + immediate reaction.
- F8 (AC-B1–B6) — builder + control plane (with AC-B5 write-safety promoted to MUST *if* any write capability
  ships at all).
- AC-T4, AC-T5, AC-S5 — live popup refresh + audit-completeness surfacing + strip/label consistency.

### WON'T (this delivery)
- Authoring brand-new tickets/AC inside the hub (the hub drives an existing lifecycle; authorship stays with
  `/po`+`/ba`). Multi-user auth / RBAC on the hub (loopback-trusted model holds for now). Migrating historical
  flat-file memory into the vector store.

---

## 6. Handoff

This requirements set is **behavior-only** and reconciles with `gate-check.md` (pre/postconditions),
`ledger.md` (gate schema + comment evidence), and `workflow.yaml` (tracks/gates/preset). It does not pick a
transport, store, or file layout — those remain the technical plan's and `/arch`'s decisions.

**Next gates per the workflow:** `/arch` (state model, realtime transport, multi-project identity, overlay
write-back) is **required** (new boundaries/schema) → then `/secops` is **required** (hub write surface,
secrets-from-env, loopback/remote-write policy, MCP overlay trust). Recommend `/sm` convert §2 into
file-based tickets grouped by feature with these MoSCoW tags, memory-first.
```
