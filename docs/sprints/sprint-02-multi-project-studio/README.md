# Sprint 02 — Multi-Project Studio (Multi-Project Shell First)

**Feature:** A cross-platform desktop cockpit (Angular 21 + Tauri shell + Node "Core" sidecar) that runs the existing ADT agent workflow across **many** projects and makes the process visible, enforced, and auditable — three governed surfaces per project: **WORKFLOW** (editable visual builder), **TASKS** (agent-managed board + full history), **BASE** (governing knowledge store via `claude/memory`).
**Track:** mostly `full` (significant: new shell, new deps, new boundaries, security-sensitive surfaces) · **Preset:** `solo` · **Delivery:** phased, **multi-project-shell-first** (D-D).
**Source of truth:** `docs/product-vision/VISION.md` (Epics A–H, MoSCoW, MVP, risks K1–K18) + `docs/product-vision/DECISIONS.md` (the six locked PO decisions). Detail: `architecture.md`, `ba-requirements.md`, `ui-design.md`, `frontend-approach.md`, `strategy.md`.

> **Planning artifacts only — no application code.** Tickets are behavior-only (WHAT, not HOW).

---

## 1. Sprint goal

> **"Connect several project folders → switch between them → see and edit each one's enforced workflow, agent-written tasks, and governing rules — on top of the AI coding tool you already use, with your own keys, local-first."**

The MVP is the **multi-project shell first** (project registry + Projects Home + connect/analyze flow), then per-project depth (Tasks, Base, Workflow). This sprint commits the **shell slice** (Slice 1) and stages the per-project-depth slices behind it. Two locked PO decisions sharpen the MVP beyond the VISION.md leans: the **workflow builder ships editable** (D-B, not read-only-first) and **remote execution is in v1** (D-C, not Won't) — both raising the SECOPS surface.

**Reuse is the accelerator.** TASKS, the ledger, typed comments, and the memory subsystem already ship from Sprint 01 (★ tickets lift directly from the hub). Core is a **superset** of the hub, never a rewrite (L5).

---

## 2. Decision log (the six locked PO decisions this sprint schedules to)

| ID | Decision | Effect on this sprint |
|----|----------|-----------------------|
| **PD-1** | **Frontend = Angular 21** (standalone, Signals, zoneless, Signal Forms, RxJS realtime). Visual canvas = **Rete.js v2** (ngx-vflow fallback). Tauri shell + Node "Core" sidecar (supersets the hub) + subagents via the host tool's own CLI (reuse existing keys). | Every UI ticket is Angular 21; the legacy zero-dep hub stays alive as the floor. Canvas tickets carry the Rete.js perf/round-trip/a11y risks (K4/K5/K10). |
| **PD-2** | **WORKFLOW panel ships editable in the MVP** — create/edit/delete trigger events, loops, conditionals, background agents. | Overrides VISION §5 "read-only-first" (D-C in VISION). Editing tickets (C4–C11) are promoted from *Should/Could* to in-MVP. Largest/highest-uncertainty FE chunk — phased last in the shell-first plan, but **in** v1. |
| **PD-3** | **Remote EXECUTION is in v1** (agents can run on a remote machine, e.g. over SSH). | Overrides VISION §5/G7 "Won't." Remote = remote code execution: **SECOPS_APPROVED MANDATORY** for these tickets; **ARCH_APPROVED** for the new boundary. Threat model: opt-in, host allowlist, known-hosts pinning, no arbitrary shell (K3). |
| **PD-4** | **Sequencing: multi-project shell FIRST** (registry + Projects Home + connect/analyze), then per-project depth (Tasks, Base, Workflow). | Slice 1 = shell. Inverts the VISION §8 "Tasks first" guidance toward the shell as the first integrated increment (Tasks reuse still lands inside the shell in Slice 2). |
| **PD-5** | **BASE = reuse the existing `claude/memory` subsystem now**; KGB/Canon + Bumbl deferred/optional. | BASE tickets (Epic E) build on the Sprint-01 memory store. KGB/Canon/Bumbl tickets (H5/H6) stay **Won't/Could**, behind the adapter seam. |
| **PD-6** | **Product NAME stays open** — keep "ADT". | No naming work scheduled; sprint folder uses the neutral "multi-project-studio" codename. Trademark/clearance deferred to /po + /legal. |

> **DECISIONS.md overrides VISION.md** wherever they differ (PD-2, PD-3). The VISION.md MoSCoW tags are re-tagged below to reflect the locked decisions.

---

## 3. Reconciliation of leftover Sprint-01 tickets (ADT-207/208/209)

These three are stuck at `approval_gate` in `.workflow-state.json` (ARCH/DESIGN/SECOPS/APPROVAL passed; CODE_REVIEWED/VERIFIED pending). They were scoped against the **single-project hub**, but the new vision makes them **first-class multi-project shell concerns**. Rather than finish them as hub-only features and then rebuild for the shell, this sprint **supersedes/absorbs** them into the Sprint-02 tickets:

| Leftover | Sprint-01 scope | Disposition | Superseded / absorbed by |
|----------|-----------------|-------------|--------------------------|
| **ADT-207** Clickable knowledge-base viewer (AC-K1..K3) | View a KB entry; open from a comment/ticket reference; "not available" state for missing docs | **Superseded** — its KB-viewing behavior is the read side of BASE in the per-project shell | **ADT-220 (BASE store)** absorbs AC-K1/K3 (view content, graceful "not available" = E7); **ADT-221 (recall + provenance)** absorbs AC-K2 (open a KB doc from a comment/ticket reference = E6 provenance link) |
| **ADT-208** Multiple projects mirrored in real time (AC-P1..P4) | Show/switch multiple projects; per-project isolation; on-disk change mirrors live; no ticket-id bleed across projects | **Absorbed (core of the shell)** — this IS the multi-project shell + live mirror | **ADT-211 (project switching + live mirror)** carries AC-P1/P3; **ADT-210 (registry/connect)** + **ADT-211** carry AC-P2/P4 isolation (`projectId` partitioning, L7) |
| **ADT-209** Realtime push notifications + immediate status reaction (AC-W1..W4) | Sub-second board reaction; consistent label/indicator/popup from one pushed state; reconnect reconciliation; no duplicate/flicker on own edits | **Absorbed** — the live-mirror realtime contract for the shell | **ADT-211 (live mirror)** carries AC-W1/W2/W4; **ADT-212 (resilience/staleness)** carries AC-W3 reconnect reconciliation |

**Action for the board:** mark ADT-207/208/209 `superseded` (not `done`) with a comment pointing to the absorbing ticket; do **not** drive their CODE_REVIEWED/VERIFIED gates to completion in isolation. Their passed ARCH/DESIGN/SECOPS analysis is **carried forward as input** to the absorbing tickets' gates (it does not auto-pass them — the new boundary/scope is larger).

---

## 4. Epic → ticket map (behavior-only, condensed AC, MoSCoW, dependencies, gates)

**Legend.** MoSCoW: **[M]** Must · **[S]** Should · **[C]** Could · **[W]** Won't (this release).
**★** = heavy reuse of existing Sprint-01 hub/ledger/comments/memory (lowest-risk).
**Gates:** every ticket needs **ARCH** + the always-on track gates (APPROVAL_GATE → CODE_REVIEWED → VERIFIED for `full`). Additional gates flagged per ticket: **SECOPS** (mandatory where flagged), **DESIGN** (UI; Aura's `ui-design.md` largely covers it).

---

### SLICE 1 — Multi-Project Shell (FIRST, per PD-4) · Epics A, B, G

> Registry + Projects Home + connect/analyze + per-project shell + live mirror + local-first guardrails. This is the committed first slice.

| ID | Behavior (WHAT) | MoSCoW | Track | Gates | Deps | Source |
|----|-----------------|--------|-------|-------|------|--------|
| **ADT-210** | **Connect & register a project.** Select a folder → it's registered and persists across restarts; an invalid/unreadable folder is refused with a clear reason and no partial project; an already-registered folder is detected and offered to open instead of duplicated; removing a project leaves on-disk files intact. | **[M]** ★ | full | ARCH, **SECOPS** (file access + external input: path traversal, registry write), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | Sprint-01 ledger/state lib (L5) | A1,A2,A3,A11 |
| **ADT-211** | **Per-project shell + project switching + live mirror.** Open a project into a header + three navigable sections (WORKFLOW/TASKS/BASE); switch the active project and the whole view reflects it while the previous project keeps its state; a change in one project updates only that project's view (isolation by `projectId`); on-disk/agent changes mirror live within a few seconds with no manual refresh; two projects sharing a ticket id never bleed. | **[M]** ★ | full | ARCH, DESIGN, **SECOPS** (loopback bind, per-project SSE isolation), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-210 | B1,B3,B4,P2,P3,P4 · **absorbs ADT-208, ADT-209 (W1/W2/W4)** |
| **ADT-212** | **Shell resilience & no-silent-staleness.** Switching sections never loses unsaved edits silently (preserve or prompt); a project whose source is moved/unmounted reads as stale/unavailable, never as silent stale data; on reconnect after a dropped live connection the view reconciles to authoritative current state; a user's own just-made change shows no duplicate/flicker when its push arrives. | **[M]** | full | ARCH, **SECOPS** (reconnect-state integrity), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-211 | B2,B6,W3,W4 · **absorbs ADT-209 (W3)** |
| **ADT-213** | **Auto-analyze on connect.** On connect, auto-derive a title + description and show them in the project header; show analysis-in-progress status and make the project fully usable only after analysis completes or is skipped; on analysis failure connect anyway with a safe placeholder + a "re-run analysis" path; the Operator can edit title/description and edits survive later re-analysis. | **[M]** | full | ARCH, **SECOPS** (analysis runs an agent over project contents: external input, host-CLI invocation), DESIGN, APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-210, ADT-230 (runner) | A4,A5,A6,A7 |
| **ADT-214** | **Ingest existing ADT artefacts (non-destructive).** Ingest existing workflow/tasks/knowledge instead of overwriting them; fall back missing artefact parts to defaults with each part's source visible; when artefacts and analysis disagree, on-disk wins and analysis values are offered non-destructively; re-connecting a removed folder restores its prior on-disk history into the view. | **[S]** ★ | full | ARCH, **SECOPS** (read/merge external project files), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-210, ADT-213 | A8,A9,A10,A12 |
| **ADT-215** | **Live cross-project change indicator.** Show an at-a-glance indicator of which project changed even when the Operator is not viewing it. | **[S]** ★ | standard | ARCH, DESIGN, APPROVAL_GATE, CODE_REVIEWED | ADT-211 | B5 |
| **ADT-216** | **Local-first + loopback-by-default guardrails.** All shell functions (connect, view the three sections, run a local workflow) work with no network; the tool binds to the local machine only by default unless remote access is deliberately enabled; a remote connection is refused when remote access is not enabled. | **[M]** ★ | full | ARCH, **SECOPS** (network boundary, bind policy — mandatory, safety-override), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-211 | G1,G2,G5 |
| **ADT-217** | **Cross-platform folder/path behavior.** Folder selection and path handling behave functionally equivalently on Windows and Mac. | **[M]** | standard | ARCH, **SECOPS** (path normalization), APPROVAL_GATE, CODE_REVIEWED | ADT-210 | G6 |

---

### SLICE 2 — TASKS (per-project depth, reuse-heavy) · Epic D

| ID | Behavior (WHAT) | MoSCoW | Track | Gates | Deps | Source |
|----|-----------------|--------|-------|-------|------|--------|
| **ADT-218** | **Agent-managed board.** Each task shows a human-readable title + clearly-indicated status, sorted/grouped by status with stable ordering; an agent-driven status change reflects on the board near-real-time; status/progress conveyed with more than colour (labels/glyphs), readable in monochrome. | **[M]** ★ | full | ARCH, DESIGN, APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-211 | D1,D2,D3,D11 |
| **ADT-219** | **Ticket history (attributed, lossless).** Click a ticket to read its description + chronological comment/event history; every entry is attributed + timestamped (agent or human); a human-readable history entry is recorded automatically for every agent action; all entries are preserved under near-simultaneous updates (no lost/overwritten history, order kept); a long/busy history stays scannable. | **[M]** ★ | full | ARCH, DESIGN, **SECOPS** (audit-trail integrity, no silent loss — L7), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-218 | D4,D5,D6,D7,D12 |
| **ADT-220** | **Archive with retained history.** Archive a done task off the active board while keeping it retrievable; read an archived task's full description + complete history; show when each archived task was completed. | **[M]** | full | ARCH, DESIGN, APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-219 | D8,D9,D10 |
| **ADT-221** | **Conveyor task view.** A playful "Conveyor" view as a toggle over the same data model. | **[C]** | standard | ARCH, DESIGN, APPROVAL_GATE, CODE_REVIEWED | ADT-218 | D13 |

---

### SLICE 3 — BASE (governing knowledge, reuse `claude/memory`) · Epic E

| ID | Behavior (WHAT) | MoSCoW | Track | Gates | Deps | Source |
|----|-----------------|--------|-------|-------|------|--------|
| **ADT-222** | **Govern with text rules.** Add a text rule/policy document saved to this project and listed in BASE; edit/remove a BASE document and agents start/stop being governed by it on subsequent runs; distinguish categories (code rules / policy / copyright / context); view a BASE entry's content; a missing/unreadable document shows a clear "not available" state, not a silent failure. | **[M]** ★ | full | ARCH, DESIGN, **SECOPS** (content injected into agent context; isolation), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-211, Sprint-01 memory | E1,E2,E3 · **absorbs ADT-207 (K1,K3)** |
| **ADT-223** | **Recall + provenance + isolation.** Added/edited BASE content becomes available to agents via semantic recall once indexed; relevant content surfaces to an agent whose task matches a rule; provenance shows a rule *was applied*, linking the ticket history entry (and opening the source doc from a comment/ticket reference); BASE is isolated per project (no cross-project recall) except content explicitly marked global. | **[S]** ★ | full | ARCH, **SECOPS** (per-project recall isolation — L7), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-222 | E4,E5,E6,E8 · **absorbs ADT-207 (K2)** |
| **ADT-224** | **Graceful recall degradation.** When indexing/recall is down, degrade gracefully: deterministic core-rule injection still happens and an agent run is never blocked solely because recall is down. | **[M]** ★ | full | ARCH, **SECOPS** (fail-safe injection), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-222 | E7 |
| **ADT-225** | **Document image/URL BASE as not-yet-available.** Document that images/URLs in BASE are planned and not yet available, with no false implication that they work. | **[W]** | floor | ARCH (doc-only) | ADT-222 | E9 (plan-only) |

---

### SLICE 4 — WORKFLOW (editable visual builder, in MVP per PD-2) · Epic C

> Promoted from VISION's "read-only-first" to **editable in the MVP** (PD-2). Highest-uncertainty FE chunk; carries K4 (lossless round-trip), K5 (canvas perf on WebView), K10 (keyboard a11y), K17 (bundle). Phased last within the shell-first plan but **in v1**.

| ID | Behavior (WHAT) | MoSCoW | Track | Gates | Deps | Source |
|----|-----------------|--------|-------|-------|------|--------|
| **ADT-226** | **Render the workflow visually (read side).** Render the default/active workflow visually as steps with their agents and gates; show per step which agent it triggers and any condition/gate attached. | **[M]** ★ | full | ARCH, DESIGN, **SECOPS** (renders gate state), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-211 | C1,C2 |
| **ADT-227** | **Run a step from the graph.** Run one linear trigger → agent → gate chain from the graph via the host-CLI runner; a live indicator shows which agent is active. | **[M]** ★ | full | ARCH, **SECOPS** (executes an agent: host-CLI invocation, gate enforcement at runtime), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-226, ADT-230 (runner) | C3 |
| **ADT-228** | **Edit the workflow (create/edit/delete/reorder steps).** Add a step (assign agent + trigger) persisting to *this* project only; edit a step's agent/trigger/condition so subsequent runs use the new definition; delete a step with references updated or flagged before save; reorder steps so saved execution order reflects the arrangement. | **[M]** | full | ARCH, DESIGN, **SECOPS** (editing the gate/trigger graph changes enforcement), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-226 | C4,C5,C6,C7 (PD-2: in MVP) |
| **ADT-229** | **Loops, conditionals, background agents.** Define a loop (return to an earlier step) shown visually and repeating until exit, warning before saving a loop with no reachable exit; attach a conditional whose runtime follows the chosen branch with both branches visible; define a background agent that runs on a condition without blocking the main flow. | **[S]** | full | ARCH, DESIGN, **SECOPS** (background/loop agents + runtime branching = execution surface), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-228, ADT-230 | C8,C9,C10,C11 (PD-2: in MVP) |
| **ADT-231** | **Lossless workflow definition round-trip.** Provide a deterministic, human-readable underlying definition of the visual workflow; render an externally-authored definition faithfully with a lossless visual↔definition round-trip; report the specific problem on an invalid definition (never silently drop steps); preserve project-specific customizations when the bundled default changes. | **[S]** | full | ARCH, **SECOPS** (definition validated against `workflow.yaml`; no silent gate drop), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-228 | C12,C13,C14,C15 (K4) |

---

### SLICE 5 — Execution Backends, Remote, Host-Key Reuse, Cost/Audit · Epics F, G, H

> Remote **execution** is in v1 (PD-3) — the hard security surface. SECOPS is **mandatory** (safety-override) on every ticket here; ARCH gates the new boundaries.

| ID | Behavior (WHAT) | MoSCoW | Track | Gates | Deps | Source |
|----|-----------------|--------|-------|-------|------|--------|
| **ADT-230** | **Host-CLI runner + key reuse (no new key).** Reuse the host's existing credentials for agent/embedding ops with no new key prompt (drive the host tool's own CLI); when no reusable credential exists, name the degraded capability and offer a non-blocking path; never persist secrets to project files, the knowledge store, the workflow definition, UI, or logs. | **[M]** | full | ARCH (new runner boundary), **SECOPS** (secrets handling, host-CLI exec — mandatory, hard), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-210 | F3,F4,F5 |
| **ADT-232** | **Host-tool integration.** Integrate with a supported host (Claude Code first) rather than a disconnected app; offer the host's current project/workspace for connection without re-typing the path. | **[S]** | full | ARCH, **SECOPS** (host bridge), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-230 | F1,F2 |
| **ADT-233** | **Remote view/control (authorized).** View projects + their three sections remotely, mirrored live, when remote access is enabled; subject any remote state-changing action to explicit authorization, allowing read-only remote without write. | **[S]** | full | ARCH (remote boundary), **SECOPS** (remote-write auth layering, K13 — mandatory, hard), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-216, ADT-230 | G3,G4 |
| **ADT-234** | **Remote agent EXECUTION (SSH runner).** Run subagents on a *remote* machine (remote execution over SSH). | **[M]** | full | ARCH (remote-exec boundary), **SECOPS** (remote code execution: allowlist, host-key pinning, opt-in, no arbitrary shell — K3, mandatory, hard), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-233, ADT-230 | G7 (**PD-3: in v1**, re-tagged from [W]) |
| **ADT-235** | **Per-run cost/audit + budget indicator.** Record per-run token/cost as ledger comments and surface a per-project budget indicator. | **[M]** ★ | full | ARCH, **SECOPS** (cost data in ledger), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-227 | H1 (K2) |
| **ADT-236** | **Needs-auth pause for unattended runs.** Pause a project's unattended agents with a clear "needs-auth" state when no non-interactive credential exists. | **[S]** | full | ARCH, **SECOPS** (unattended-auth state, K7), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-230, ADT-234 | H3 (K7) |
| **ADT-237** | **Re-link a moved/renamed project.** Re-link/migrate a project whose folder moved or was renamed so its history is not orphaned. | **[S]** | full | ARCH, **SECOPS** (projectId re-bind), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-210 | H4 (K8) |
| **ADT-238** | **Agent SDK opt-in backend.** Offer the Agent SDK as an opt-in execution backend with its key stored in the OS keychain. | **[C]** | full | ARCH, **SECOPS** (keychain-stored API key — mandatory, hard), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-230 | H2 |
| **ADT-239** | **IDE-webview thin client.** Offer an IDE-webview thin client that attaches to the running Core (a view, not a second runtime). | **[C]** | standard | ARCH, **SECOPS** (single-Core attach, K15), DESIGN, APPROVAL_GATE, CODE_REVIEWED | ADT-211 | H7 (K15) |
| **ADT-240** | **KGB/Canon optional BASE overlay.** Offer KGB/Canon as an optional BASE governance overlay with graceful fallback to the built-in store. | **[C]** | full | ARCH, **SECOPS** (external governance MCP, K9), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | ADT-223 | H5 (D-D/PD-5: optional) |
| **ADT-241** | **Bumbl optional self-hosted target.** Offer Bumbl as an optional self-hosted memory/KB target via the same adapter contract. | **[W]** | — | (deferred — not scheduled this release) | ADT-223 | H6 (PD-5: deferred) |

---

## 5. Committed first slice & recommended start

**Committed this sprint:** **SLICE 1 (Multi-Project Shell)** — ADT-210..ADT-217 — plus **ADT-230 (host-CLI runner)** because connect/analyze (ADT-213) and any agent run depend on it. SLICES 2–5 are staged (ledger `backlog`) and pulled in shell-first order once SLICE 1's gates clear.

**Recommended first 1–2 tickets to start:**

1. **ADT-210 — Connect & register a project.** The root of the whole shell; everything depends on it; reuse-heavy (★, lifts the Sprint-01 ledger/state lib). Touches file access + registry write + external folder input → **SECOPS mandatory**, and introduces a new boundary (registry, projectId derivation) → **ARCH mandatory**.
2. **ADT-230 — Host-CLI runner + key reuse.** The execution seam that connect/analyze and every workflow run sit on; isolating its security review early de-risks the whole sprint. Secrets handling + host-CLI exec → **SECOPS mandatory, hard**.

**Gate path for the first slice (expected ARCH → SECOPS, then the track gates):**

```
ADT-210 / ADT-230:
  ARCH_APPROVED (/arch)        — new boundaries: registry, projectId, runner adapter seam, loopback policy
    → SECOPS_APPROVED (/secops) — MANDATORY/hard: path traversal, registry write, secrets handling,
                                   host-CLI exec, loopback bind; remote surfaces (ADT-233/234) get a
                                   dedicated SSH-runner threat model (K3)
      → APPROVAL_GATE (/verify) — pre-impl readiness (behavioral ACs, no HOW-leakage, gates satisfied)
        → TDD (/be|/fe)         — behavior → failing test → minimal code → green
          → CODE_REVIEWED (/rev)
            → DESIGN_QA (/ui)   — UI tickets only (Aura's ui-design.md covers most of it)
              → QA (/qa) + E2E (/e2e)
                → VERIFIED (/verify) → /sm marks Done
```

**Next required gate right now:** **ARCH (/arch)** on ADT-210 + ADT-230 (new boundaries), immediately followed by **SECOPS (/secops)** — mandatory because both touch security-sensitive surfaces (file/registry/secrets/exec), and because the sprint's remote-execution and connect/analyze surfaces are the dominant risk (K3, K13). No gate is pre-passed in the ledger; the gate owners set them.

---

## 6. Status tracker

| Slice | Tickets | Stage | Committed |
|-------|---------|-------|-----------|
| 1 — Shell | ADT-210..217, ADT-230 | `ready` (210, 230) / `backlog` (rest) | ✅ this sprint |
| 2 — Tasks | ADT-218..221 | `backlog` | staged |
| 3 — Base | ADT-222..225 | `backlog` | staged |
| 4 — Workflow | ADT-226..229, ADT-231 | `backlog` | staged (editable, PD-2) |
| 5 — Backends/Remote/Cost | ADT-232..240 (+234 remote-exec) | `backlog` | staged (SECOPS-gated, PD-3) |
| Deferred | ADT-241 (Bumbl) | — | not this release |

**Gate legend:** all gates `pending` until set by their owner. No gate is pre-passed by /sm. ADT-207/208/209 → `superseded` (see §3).

> After ARCH + SECOPS clear ADT-210/ADT-230 → say **"/sm - please update sprint status"** and pull the next SLICE-1 ticket.
