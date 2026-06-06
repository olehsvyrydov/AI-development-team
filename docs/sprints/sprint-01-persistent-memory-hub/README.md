# Sprint 01 — Persistent Memory + Followable Workflow + Control-Plane Hub

**Feature:** Cross-session memory, an explicit/observable agent workflow, and a multi-project hub that builds the workflow and drives tickets. All framework tooling in **TypeScript/Node** (Python removed).
**Track:** `full` (significant change) · **Preset:** `solo` · **Delivery:** phased, **memory-first**.
**Plan of record:** `~/.claude/plans/imperative-mapping-prism.md` (+ role designs: Jorge arch, Anna BA/ACs, Aura UI).

## Gate status (see `.workflow-state.json`)
| Gate | State | By |
|---|---|---|
| ARCH_APPROVED | ✅ passed | /arch (Jorge) |
| DESIGN_APPROVED | ✅ passed (UI tickets) | /ui (Aura) |
| **SECOPS_APPROVED** | ⛔ **pending — BLOCKING** | /secops (next) |
| APPROVAL_GATE | ⏳ pending | /verify |
| CODE_REVIEWED | ⏳ pending | /rev |
| VERIFIED | ⏳ pending | /verify |

> **Implementation is blocked** until `SECOPS_APPROVED` (hard, safety-override) passes. Hand off to `/secops`.

## Tickets (behavior-only — WHAT, not HOW)

### Phase 1 — Memory (P0, first)
**ADT-201 — Cross-session memory floor + semantic recall**
- AC-M1 (P0): On a new/resumed/compacted session, the session is told the active preset and a per-ticket summary of stage, active/expected agent, and any unmet/rejected gates — **before** any knowledge retrieval.
- AC-M2 (P0): With no embedding key and no vector backend, the session still starts and still receives the deterministic digest (degraded, not failed).
- AC-M3 (P1): With a configured backend, the session additionally receives the most relevant project-scoped knowledge plus globally-scoped dev rules.
- AC-M4 (P1): On compaction, the salient context of the session is stored, tagged to the project, for later recall.
- AC-M5 (P0): Knowledge stored for project A is not surfaced in project B; only B-scoped + global is.
- AC-M6 (P1): A dev rule stored as global scope is eligible for recall in any project.

**ADT-202 — Interactive install, memory choice, hook wiring, connect-MCP-later**
- AC-I1 (P0): Interactive install asks the user to choose a memory backend, with a clearly marked default and a no-backend option.
- AC-I2 (P0): The no-backend/no-key option yields a fully usable framework; sessions still get the digest.
- AC-I3 (P0): Accepting hook wiring makes cross-session memory active next session; declining wires nothing and tells the user how to enable later.
- AC-I4 (P1): A user who chose minimal memory can later connect an MCP overlay (project KB / mem0 / OpenMemory) without reinstalling.
- AC-I5 (P0): Re-running the installer does not duplicate or clobber existing user configuration.
- AC-I6 (P0): A provided API key is never persisted into committed config or the knowledge store.

### Phase 2 — Explicit state model (P0; prereq for ADT-205)
**ADT-203 — Explicit workflow state model**
- AC-X1 (P0): A ticket's track, current stage, assignee, expected owner, and per-gate state are all explicitly available (not merely inferable).
- AC-X2 (P0): An older ledger without assignee fields still parses and still shows an expected owner (backward compatible).
- AC-X3 (P0): The memory digest and the hub agree on a ticket's who/what/stage (one shared projection).

### Phase 3 — Builder + control plane (P1)
**ADT-206 — Hub builder + control plane**
- AC-B1: Reordering a track's stages persists as an overlay; the pristine base workflow is untouched.
- AC-B2: Adding a trigger→gate rule / changing a gate owner-refusal / switching preset persists and reaches agents + board.
- AC-B3: Advancing a stage, assigning an agent, or approving/rejecting a gate from the hub updates the ledger atomically and reflects live.
- AC-B4: A hub change against a stale view is rejected and reconciled to fresh state (no lost-update clobber).
- AC-B5 (P0 for any write): A write beyond loopback is refused unless remote writes were explicitly enabled.
- AC-B6: A control-plane action emits the same typed comment a CLI agent would (uniform audit trail).

### Phase 4 — Hub observability (P1)
**ADT-204 — Clickable ticket popup + typed comments**
- AC-T1: Clicking a ticket opens a popup with title, full description, and the ordered comment stream.
- AC-T2: Each comment shows its type (handoff / gate-decision / review-or-QA finding / skip), the authoring agent, and a timestamp.
- AC-T3: An approved/rejected gate has a matching gate-decision comment with deciding agent + rationale.
- AC-T4 (P1): An open popup reflects a newly-recorded comment without manual refresh.
- AC-T5 (P1): The comment stream contains a comment for every passed/rejected gate, stage handoff, and skip (no silent transitions).

**ADT-205 — Color-coded status + active-agent indicator**
- AC-S1: A ticket shows a single status label whose color is consistently mapped across the board.
- AC-S2: A ticket with an assigned agent clearly indicates which agent is currently working it.
- AC-S3: A ticket with no assignee shows the expected owner of the current stage, visually distinguished (muted).
- AC-S4: A ticket blocked by a rejected/unmet hard gate reads as Blocked and names the gate/owner.
- AC-S5 (P1): The gate strip and status label never contradict.

**ADT-207 — Clickable knowledge-base viewer**
- AC-K1: Clicking a KB entry opens / shows its content.
- AC-K2: Activating a KB reference from a comment/ticket opens the same document.
- AC-K3: A missing/unreadable KB document shows a clear "not available" state, not a silent failure.

**ADT-208 — Multiple projects mirrored in real time**
- AC-P1: With more than one project under management, the hub shows and switches between all of them.
- AC-P2: A change in one project updates only that project's view (isolation).
- AC-P3: A project's on-disk change mirrors to its board in real time without manual refresh.
- AC-P4: Two projects sharing a ticket id never bleed across each other.

**ADT-209 — Realtime push notifications**
- AC-W1: A gate decision / stage transition / assignment makes the board react promptly (sub-second locally) without user polling.
- AC-W2: A status change updates the color label, active-agent indicator, and (if open) the ticket popup consistently from the same pushed state.
- AC-W3: On reconnect after a dropped connection, the hub reconciles to authoritative current state (no stale/lost updates).
- AC-W4: A change the user just made shows no duplicate/flicker when its push arrives.

## Process notes
- **Comment-typing rule (audit backbone):** every gate state change and stage transition emits exactly one typed comment (handoff / gate-decision / finding / skip). Hub-initiated actions emit the same (AC-B6).
- **Session safety (non-negotiable):** every hook path exits 0; the digest is injected before any embedding; missing backend/key → digest-only.
- **Premature work:** the `claude/memory/` TS scaffold was started before the gates; it is uncommitted and must pass /secops → /verify approval → TDD → /rev → /verify.
