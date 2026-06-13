# Pipeline-view redesign — Decisions (ADT-245)

**Ticket:** ADT-245 · **Owner of these decisions:** /po (Max), recorded by /sm (Luda)
**Date:** 2026-06-13 · **Sprint:** sprint-12-pipeline
**Source:** user-ratified 5-agent investigation —
[aura-pipeline.md](aura-pipeline.md) · [anna-research.md](anna-research.md) · [jorge-arch.md](jorge-arch.md) · [max-product.md](max-product.md) · [apex-strategy.md](apex-strategy.md)

ADT-244 made the needs-you **Worklist** the default and demoted the stage Pipeline to an optional mode. ADT-245 makes that demoted mode *worth keeping*: it redesigns the weak "stage train" (a stage-partitioned Kanban that duplicates Backlog and Done) into a real **CI-style pipeline** — a connected left→right flow of stage nodes joined by explicit edges, showing only the work that is genuinely mid-flow, with gates as first-class checkpoint nodes on the line. The change is the *organising grammar of the Pipeline mode*, not the data model: `partitionBoard().columns` is already the in-pipeline set.

---

## D-1 — The Pipeline is a connected CI-style stage-FLOW, not a board (decisive)

The Pipeline view renders the active track's real workflow stages as **nodes joined left→right by explicit EDGES** (a directional flow that *means* "flows to / depends on"), with the lit **active front** showing how far work has travelled. This is the universal pipeline grammar developers already read in Jenkins Blue Ocean / GitLab CI / GitHub Actions — borrow the grammar wholesale; the novelty is *what flows through it* (tickets + agents + policy gates), not a bespoke visual language.

**Why:** an edge-less column layout reads as a board, not a pipeline — it fails the very first developer expectation, and the current "train" is exactly that. (anna-research §1.2.1, §1.3; aura-pipeline §1–2; max-product §2.)

**Category:** Product · **Authority:** /po

## D-2 — Show ONLY in-pipeline tickets; backlog / done / off-track are end-cap COUNTS, not cards

Each stage node shows only the tickets currently **at** that stage. Backlog, Done and off-track render **no cards** in Pipeline mode — they collapse to tiny end-cap counts ("From backlog · N →", "Done · N →") and a single off-track badge ("⚠ N off-track →"), each linking to the Worklist region that owns them. A ticket appears at most once, at its current stage.

**Why:** this is the user's explicit ask and kills the Worklist duplication. The counts (not nothing) keep the pipeline honest about where work comes from and goes to — a CI pipeline still shows "N queued / N shipped" — without re-listing what the Worklist owns. /arch confirms `partitionBoard().columns` already IS the in-pipeline set, so this is subtraction, not new data. (aura-pipeline §3; anna-research §1.3, M5; jorge-arch §1.1; max-product §2 job 5.)

**Category:** Product · **Authority:** /po

## D-3 — Gate/approval CHECKPOINT NODES on the connectors, with honest hard/soft distinction

The gate governing a downstream stage renders as a **node on the edge entering it** — not a chip buried on a card. Shape carries the kind (solid diamond = hard, dashed diamond = soft) and a state word carries the status (pending / passed / rejected), never colour-only. A passed gate lights the edge; a pending gate leaves it faint; a **rejected HARD gate turns the connector red AND dashed — the line is visibly broken, work cannot pass there**. A soft gate is advisory and **never** breaks the line red. Clicking a gate node opens the existing decidable-gate panel for the governing ticket — no new approvals surface.

**Why:** every serious CI tool renders the approval as a checkpoint on the line (GitHub "Waiting", GitLab manual job, CircleCI "on hold"). The rejected-hard "broken line" is the money shot that proves the refusal is real, not decorative — the whole governance thesis made visual. (anna-research §1.2.3; aura-pipeline §2.4; apex-strategy §3.1–3.2; max-product §2 jobs 3–4.)

**Category:** Product · **Authority:** /po

## D-4 — Per-stage status colour + the lit active front (status is the loudest thing)

Each stage node carries one **stage status** — blocked/failed → red, running → accent, waiting → amber, passed → green, pending/empty → neutral — derived as the *worst / most-actionable* state among its tickets + its gate (the same `cardVisualStatus` precedence, reduced to the stage). Connectors and markers up to the furthest in-progress stage (`activeSegmentIndex`) read lit; ahead reads faint. Colour is **always** reinforced by glyph + count + state word; strip all colour and the pipeline still reads.

**Why:** flow-health at a glance ("green up to code_review, code_review is red — that's the wall") is the one thing a stage list cannot give. Reuses the merged `--kb-*` / `--kb-*-soft` colour system and the gate glyphs shipped on cards — no new visual vocabulary. (aura-pipeline §2.2, §2.5, §7; max-product §2 job 2.)

**Category:** Product · **Authority:** /po

## D-5 — Click a node → drill into its detail/history

A stage/ticket node opens the existing task-detail (its attributed, timestamped agent history — DART's analogue of a CI console log); a gate node opens the existing gate panel. The node is a door to its own evidence.

**Why:** universal CI convention (click a stage → its log). DART's per-ticket attributed history is the analogue; wire the node → that history. (anna-research §1.2.4, M4; aura-pipeline §2.4.)

**Category:** Product · **Authority:** /po

## D-6 — The honest quiet / empty states (designed FIRST, the common case)

Most DART projects have ~0 mid-pipeline tickets most of the time, so the Pipeline must **never look broken when quiet**:
- **(A) Chain idle, work waits elsewhere:** render the idle chain as a slim **pending-line PREVIEW** of the workflow path (it teaches the flow), plus the end-cap counts ("3 queued · 9 shipped"), plus a **"Switch to Worklist"** action and one calm explainer. Never an apology, fake zero, or void.
- **(B) Whole board empty:** Pipeline mode is **suppressed entirely** — the whole-board empty invitation owns the screen and the view-switch is hidden. Never an empty pipeline scaffold on a brand-new project.
- **(C) Single populated stage:** render honestly with the one lit node + the Worklist escape; do not auto-default here.

**Why:** an empty CI pipeline screams "broken/unused" — the worst possible first impression in the most common real-world state. The pipeline-shape preview is the one thing the quiet state adds over a blank: it shows the path work *will* take. This is the make-or-break detail. (apex-strategy §3.4; aura-pipeline §0, §4; anna-research §1.2.5, M6.)

**Category:** Product · **Authority:** /po (ratifies "design the quiet/empty states first" as the locked framing)

## D-7 — The Worklist stays the DEFAULT; Pipeline auto-defaults only when genuinely mid-flow; remember the choice

The needs-you Worklist remains the landing (per ADT-244). The Pipeline **auto-defaults only when ≥2 stages are simultaneously populated** (the existing `populatedStageCount` rule); otherwise the Worklist is the default. The operator's explicit mode choice is remembered per project and survives live SSE pushes within a session.

**Why:** the Worklist is the right default for the common low-activity case; the Pipeline is a power/CI-minded view that earns its place only when work is fanned across stages. Auto-surfacing it on a quiet project would be theatre. (aura-pipeline §0, §5; max-product §2; carried forward from ADT-244 D-3.)

**Category:** Product · **Authority:** /po

## D-8 — Every action stays the guarded control-plane write; a view is a lens; status is read-only

advance / gate-decide / comment in Pipeline mode remain the **existing guarded CAS write** (current rev, safety-gate refusal, 409 surfaced — never a silent overwrite). Switching to/from Pipeline is a client-side re-render only: no server round-trip, no new write path. `status` is a derived, read-only axis — no view edits it. No card-drag to advance past a gate (CI pipelines don't let you drag a build into "passed").

**Why:** the dual-audience guarantee — the human's pixels and the agent's next-action projection derive from one source of truth and never diverge — and the safety core (`routePastUnmetSafetyGate`) stays untouched. (jorge-arch §3, §5 R2; apex-strategy §3.3; aura-pipeline §2.3, §9.)

**Category:** Architecture · **Authority:** /arch (analysed), /po (ratified as a hard product guardrail)

## D-9 — Dwell-time signal: "stuck N days at a stage" (SHOULD)

A ticket stuck N days at its current stage is surfaced on its node, **derived from the existing `kind:"advance"` comment timestamps** (`enteredCurrentStageAt`) — a pure additive projection, no new write path, no schema change. If built server-side it lives in a single `pipelineView` projection shared by board/pipeline/digest (parity-tested) so the derivations cannot drift; otherwise the FE folds the advance comments.

**Why:** /jorge calls dwell-time the single highest-value pipeline signal — a stuck ticket is what an operator most needs to see — and it is zero-cost (derivation over data already persisted). SHOULD, not MUST, so the connected-flow MVP can ship without it. (jorge-arch §1.2 item 1, §1.3; anna-research §1.2.2.)

**Category:** Product · **Authority:** /po (SHOULD scope)

---

## MVP scope (MoSCoW)

**MUST (v1):**
1. The Pipeline is a **connected stage-FLOW** — real workflow stages as nodes joined left→right by **explicit edges**, with the lit active front.
2. **Only in-pipeline tickets** as cards; backlog/done/off-track are **end-cap counts that link to the Worklist**, never cards (R1 disjointness preserved).
3. **Gate checkpoint NODES** on the connectors — hard/soft by shape + state word; a **rejected HARD gate breaks the connector red+dashed**; a soft gate never does.
4. **Per-stage status colour** (worst-actionable precedence) + the lit active front, **additive** (glyph + word + count, never colour-only).
5. **Click a stage/gate node → its detail/history**.
6. The **honest quiet/empty states** — path preview + counts + "Switch to Worklist" when idle; Pipeline **suppressed on whole-board-empty**; single-stage handled honestly.
7. The **Worklist stays the default** + the **mode toggle** (auto-default to Pipeline only when ≥2 stages populated; choice remembered).
8. **Guarded writes** — every advance/gate action stays the rev-checked CAS control-plane write, 409 surfaced; status read-only; no new write path; no drag.

**SHOULD (fast-follow):**
- **Dwell-time signal** — "stuck N days at <stage>", derived from the existing advance-comment timestamps (D-9).
- **Drill-into-stage history** richness (the node→attributed-history evidence surface, beyond the basic detail open).

**COULD (later — separate tickets):**
- **Cross-project pipeline roll-up** — every connected project's flow-health on one screen (the portfolio view). A genuine enterprise differentiator, but a separate later ticket (hub-tier aggregation over the existing registry).
- **Enterprise-expressiveness items** — epics (one optional `parent`/`epic` field + roll-up) and named **flows** surfaced per-track on the Pipeline (tracks already ARE flows). Each a separate later ticket, not this redesign.
- **Mini-pipeline status-strip** embeddable in the Projects-Home cards.

**WON'T (this release — and we say so out loud):**
- **DAG / parallel branches / fan-out execution.** Would rewrite the load-bearing `routePastUnmetSafetyGate` linear-array safety core + the loop budget for a feature outside DART's sequential agent-driven flow. `fan_out` stays the recorded-only no-op; render parallelism as a future, gated on real demand. (jorge-arch §1.2 item 3, R1, R4.)
- Any view implying DART itself *runs* the agents; card-drag to advance past a gate; cross-project *agent control* from one session (breaks the single-bound-project security boundary — jorge-arch §2.3).

---

## Positioning reframe (recorded /po decision, for context)

The investigation's strategy + research + architecture lenses converge on one positioning truth that frames the whole redesign and must be recorded so later scope decisions inherit it:

> **DART's defensible play is a local-first GOVERNANCE WEDGE — "the local, tool-neutral layer that proves your AI agents followed your gated process, across the tools and projects you already use" — NOT a horizontal-enterprise "control plane" or a Jira/Linear/Cursor competitor.**

- "Control plane" / horizontal-agent positioning concedes a comparison to Microsoft/Google/GitHub Agent HQ that DART loses on every axis (identity, SSO, audit-at-scale, procurement). Drop it from the enterprise pitch. (apex-strategy §1.1–1.3; anna-research §3.1.)
- "Enterprise" for DART means enterprise-grade *expressiveness and quality* now (the redesigned Pipeline, honest states, governed flow), and enterprise-grade *deployment posture* (RBAC/SSO/multi-user/signed audit) only as a later, opt-in server-tier adapter behind the existing `api.handle` seam — never by pretending the local file core is something it is not. (jorge-arch §0, §4; apex-strategy §2.2; anna-research §2.3, §3.4.)
- **Consequence for THIS ticket:** the Pipeline redesign is justified on its own merits (developer trust, clarity, the only-in-flight ask) — it is the *proof surface* for the governance wedge. We must not let "make the Pipeline enterprise-grade" quietly become "make it prettier and tick the enterprise box". The org-trust feature set is explicitly out of ADT-245.

**Category:** Product / Positioning · **Authority:** /po

---

## Classification & gates (per /sm via workflow-engine, `preset: solo`)

- **Change class:** standard (a feature/story — new client-side view logic spanning files, plus an optional small additive backend projection) → **standard track**.
- **DESIGN_APPROVED** — **soft**; fed by the /aura Pipeline build-spec + the 5-agent investigation. (Visual change / reworked view mode.)
- **ARCH_APPROVED** — **soft / triggered, NOT hard.** The basic Pipeline is presentational over existing data — `partitionBoard().columns` already IS the in-pipeline set, so the connected stage-flow is a /fe + /ui re-render with no new route/persistence/schema/boundary (no hard trigger). The optional dwell-time + stage-level gate-node projections are a **small ADDITIVE hub read** (pure derivation from the existing comment log + gates; zero new write path, zero migration, zero new field) — soft/triggered as an additive read, not hard. /jorge pre-analysed. **NO DAG** (out of scope — would rewrite the safety core).
- **SECOPS_APPROVED** — **soft, NOT hard.** No security trigger fires (presentational + client-side re-render; the guarded CAS write is unchanged; the optional projection is read-only-derived; no new auth/secrets/PII/upload/input/network/crypto path; the safety-gate check is untouched).
- **CODE_REVIEWED** — **hard** (standard track).
- **VERIFIED** — **hard** (final completeness audit on the production build, served same-origin — in-app live proof, not just unit tests).

**Implementers:** /fe owns the view (re-render of the existing `partitionBoard().columns`, reusing `--kb-*-soft` + `cardVisualStatus` + the gate glyphs). An **optional small /be** adds the dwell-time + stage-level gate-node additive projection if the spec wants it server-side — one shared `pipelineView` projection (board/pipeline/digest), parity-tested.
