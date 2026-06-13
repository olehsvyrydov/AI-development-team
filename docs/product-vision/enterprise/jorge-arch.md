# DART Enterprise Pipeline — Architecture Lens (Jorge)

**Scope:** an enterprise-grade Pipeline view (Jenkins/GitLab-like, in-pipeline tickets only) plus an honest
read on whether DART can become an "enterprise" solution for developers + agents controlling work across
projects and flows. **Stance: skeptical and practical.** I am the architecture lens in a five-agent
investigation; this is a proposal, not an approval. No code here.

Architecture is about trade-offs, not silver bullets. The single most important trade-off DART has already
made — local, single-trust, file-based, zero-dep — is the one that decides most of the answers below.

---

## 0. What "enterprise" can and cannot mean here (read this first)

DART is a **local, single-user-trust, file-based, zero-dependency dev tool**. The ledger is
`.workflow-state.json` in the repo; the audit trail is an append-only comment log; writes are
optimistic-CAS over a file; the MCP server **binds to exactly one project at spawn** (`bind-project.js`).
There is no auth, no server tier, no concurrency control beyond a single-process file mutex.

So "enterprise" splits cleanly into two meanings, and the whole investigation hinges on keeping them apart:

- **Enterprise-grade *UX / model expressiveness*** — a credible pipeline view, epics, multiple flows,
  multiple projects, a complete and idempotent agent surface. **This is achievable** and is where the 80/20
  payoff is.
- **Enterprise-grade *deployment posture*** — RBAC/SSO, multi-user concurrency, a hosted server,
  audit-grade tamper-evidence, tenancy. **This is precluded by the current architecture** and cannot be
  bolted on without a second product (a server tier). See §4.

My verdict up front: **pursue the first meaning hard; be explicit that the second is a separate, later,
optional product — do not pretend the file-based core is "enterprise" in the deployment sense.**

---

## 1. The Pipeline data model — have vs. need vs. worth-it

The concrete ask: a pipeline view showing **only in-pipeline tickets** as a connected stage flow, with no
backlog/done duplication. Let me be precise about what already exists, because the honest answer is **most of
it is already built**, and the temptation to add backend fields should be resisted.

### 1.1 What `buildState` + `board.ts` already give (have)

| Pipeline need | Already present | Where |
|---|---|---|
| Stages in order | Yes — `workflowView.stages` (flattened active track, owner + governing gate per stage) | `state.js: projectWorkflowView`; `stage-map.js` |
| Tickets per stage | Yes — `partitionBoard().columns[].tickets` | `board.ts: partitionBoard` |
| Gate state per stage | Yes — each ticket carries `gates[]` with `{name, state, refusal, safety}`; column header carries the governing gate | `state.js`, `board.ts: cardGateSummary` |
| Owner per stage | Yes — `stageOwners` (overlay → gate owner → default) | `state.js`, `stage-map.js` |
| **"In-pipeline" set (exclude backlog/done/off-track)** | **Yes, already derived** — `partitionBoard.columns` is exactly that set; Backlog, the done folder, and the off-track lane are partitioned OUT into disjoint regions | `board.ts: partitionBoard`, `isBacklog`, `doneStage`, `offTrackGroups` |
| Active-segment accent ("how far has work reached") | Yes — `activeSegmentIndex` | `board.ts` |
| Loop/needs-human surfacing | Yes — `ticketNeedsYou`, `needsYouReason`, loop label parse | `board.ts` |

**The "in-pipeline only" requirement is already a solved problem.** `partitionBoard().columns` is the
connected stage flow with backlog and done removed by construction (R1 disjointness — a ticket lands in
exactly one region). The Pipeline view does **not** need a new "in-pipeline" backend field; it needs a
frontend that renders `columns` as a connected rail instead of as Kanban columns. That is a **/fe + /ui
job, not a backend/architecture change.**

### 1.2 What is genuinely missing for a *real* enterprise pipeline (need)

Four things a Jenkins/GitLab pipeline shows that DART's projection does **not** yet carry:

1. **Per-stage entry/exit timestamps → "how long stuck."** Today the comment log records `kind:"advance"`
   records (`stage → X`) with a `ts`. So **dwell time is already derivable** by folding the advance events
   per ticket — it is in the log, not in the projection. **No new write needed.** What's missing is a small
   **additive projection** (`stageHistory[]` / `enteredCurrentStageAt`) computed in `buildState` from the
   existing advance comments. **Worth it: YES** — it is the single highest-value pipeline signal (a stuck
   ticket is the thing an operator most needs to see), it is pure derivation from data we already persist,
   and it is additive (no schema change, no migration, no new write path). Risk: near-zero.

2. **Gate/approval node state as a first-class pipeline node.** A real pipeline draws gates as *nodes*
   (pending/passed/rejected/skipped), not as a chip on a card. The data is all present (`gates[]` +
   `stage-map.stageGate`); what's missing is again **projection shape**: emit, per stage, the governing gate
   as a node with an aggregate state across the in-stage tickets. **Worth it: YES, low cost** — pure
   re-projection of `cardGateSummary` logic at the stage level. No backend field.

3. **Parallel branches / fan-out as real topology.** This is the one genuine gap. Tracks are a **linear
   array of stage names** (`tracks: floor: [a,b,c]`). The engine has a `fan_out` action but it is
   **recorded-only — an explicit Phase-0 no-op** (`engine.js`/`api.js: fanOut` just appends a directive
   comment; nothing forks). So DART has **no DAG** — no parallel stages, no join nodes. A real
   Jenkins/GitLab pipeline is a DAG. **Worth it: NO, not now (skeptical).** A DAG model means: tracks become
   graphs not arrays, the safety-gate "route past unmet gate" check (which today walks a linear
   `trackOrder` array and is the load-bearing safety invariant) must be re-derived over a graph
   (topological reachability), and the loop-budget cycle detection changes. That is a **rewrite of the
   safety core** for a feature most DART users (solo/small-team, agent-driven sequential TDD flow) will
   never exercise. **Render parallelism as a future; do not build a DAG to ship a pipeline view.** If a
   "parallel" affordance is wanted now, model it as *multiple tickets in the same stage advancing
   independently* — which the linear model already supports — rather than as branching topology.

4. **A clean per-stage "node" contract for the renderer.** Minor: a `pipelineView` projection that hands
   `/fe` exactly `[{ stage, owner, gate:{name,state}, ticketCount, tickets[], enteredStats }]` so the
   frontend does not re-join `workflowView` + `partitionBoard` + dwell-folding itself. This is a **thin
   convenience projection** over (1)+(2), worth it only to keep the three derivations (board, pipeline,
   digest) from drifting — which is the same DRY argument `projectWorkflowView` already makes.

### 1.3 The worth-it call (Pipeline)

**Build:** items 1, 2, 4 — all additive projections in `state.js`, all derived from data already in the
ledger + comment log, **zero new write paths, zero migration, zero new fields on the ticket schema.** This
is a small, safe, high-value backend change (estimate: one focused projection function + tests).

**Do NOT build now:** item 3 (DAG/parallel branches). It rewrites the safety core for a feature outside
DART's core flow. Flag as "future, gated on real demand."

**The single backend truth for the Pipeline view:** it needs **a dwell-time + gate-node projection, and
nothing more — no new ticket field is worth it.** Everything else the view needs is already in
`partitionBoard`.

---

## 2. Epics + multiple flows + multiple projects — the enterprise framing, sized honestly

The enterprise ask: epics→tasks hierarchy, named **flows** (feature/bugfix/hotfix) within and across
projects, agents + devs driving all of it. Today: flat tickets, one ledger per project, the MCP server
**bound to one project**. Let me size each honestly and find the 80/20.

### 2.1 Epics / parent-child — **small, feasible, do it the minimal way**

The ledger is a free-form ticket map (`{ [id]: { title, stage, track, labels, gates, ... } }`). Adding an
optional `parent` (or `epic`) string field to a ticket is **non-breaking by construction**: `buildState`
already passes unknown fields through and every consumer reads named fields. No migration: absent `parent`
= top-level, exactly as today.

- **Minimal viable model:** one optional field, `epic: "<ticket-id>"` (or `parent`), on a task. An "epic"
  is just **a ticket whose id is referenced as a parent by others** — no new entity type, no new store. The
  hierarchy is a derived projection (`childrenOf(id)`), the same pattern as `pendingDirectives` deriving
  from the log.
- **What it costs:** a field plus a roll-up projection (epic progress = aggregate of children's
  done/in-progress, reusing `worklistProgress`). The hub/MCP write surface needs one addition — set the
  parent — routed through `api.handle` like every other field.
- **What to resist (skeptical):** a separate epic schema, epic-specific gates, multi-level nesting
  (epic→story→sub-task→...). DART is agent-driven; deep hierarchies are human-PM ceremony. **One level of
  parent is the 80/20.** Arbitrary nesting is a YAGNI trap.

**Sizing: SMALL.** One additive field + one roll-up projection + one write route + tests. No rewrite, fully
feasible on the overlay/ledger model. **Recommended.**

### 2.2 Multiple flows per project — **already mostly here; finish it, don't invent it**

This is the pleasant surprise. DART **already has named flows** — they are called **tracks**. `workflow.yaml`
defines `tracks: { floor_min, floor, standard, full }`; a ticket carries `track:` and the engine resolves
order, owners, gates, and the loop budget against the ticket's named track (`trackOrder`,
`resolveActiveTrack`). A `when.track` predicate already exists in the rules engine. **feature-flow vs
bugfix-flow vs hotfix-flow is literally "three named tracks."**

So "multiple flows per project" is **not a new model — it is a naming/affordance gap**:

- **What's missing:** (a) the tracks are change-class presets, not user-facing "flows" the operator picks
  per ticket from the UI; (b) `track/set-stages` and `track/reorder` exist in `api.js` but there is **no
  `track/create`** route — you can edit existing tracks via overlay but not add a brand-new named flow
  through the control plane (you'd hand-edit `workflow.yaml`/overlay). (c) the Pipeline/board renders **one
  active track at a time** (`resolveActiveTrack` picks a single track); a multi-flow project wants to see
  per-flow pipelines (a hotfix pipeline next to a feature pipeline).
- **Minimal viable model:** treat **flow = track**, make track selection a per-ticket choice surfaced in the
  UI, add a `track/create` route (additive, overlay-only, the validators in `validateStageList` already
  exist), and let the Pipeline view **group by track** (render N rails, one per populated track) instead of
  collapsing to the single `resolveActiveTrack`. The safety-gate invariant is **unchanged** because it is
  already per-ticket, per-track (`trackOrder(ticket, wf)`).

**Sizing: SMALL-to-MEDIUM.** No data-model rewrite — tracks already are flows. The work is: a `track/create`
route (small), a per-track Pipeline grouping in `/fe` (medium, UI), and making track a first-class
user-facing concept in copy/affordances (`/po` + `/ui`). The architecture already supports it; this is
mostly surfacing what exists. **Recommended, and cheaper than it sounds.**

### 2.3 Multiple projects — **the registry exists; the agent binding is the real constraint**

The hub already has a **multi-project registry** (`hub/lib/registry.js`, `projects.js`) at
`~/.aidevteam/registry.json` — id/path/label/status per project — and the cockpit has a projects-home over
it. So *viewing* many projects, and a *cross-project tasks/epics list*, is **already architecturally
supported** at the hub tier: iterate registry entries, `buildState` each (`listSummary` already does the
roll-up per project). A cross-project "all my epics/tasks across projects and flows" board is a
**hub-tier aggregation projection** — feasible, no per-project change.

**But the hard constraint is the agent surface, not the view.** The MCP server **binds to exactly one
project at spawn** (`bind-project.js`: "the bound project is the only directory any write reaches" — this is
a deliberate *security boundary*, not an oversight). So an agent session can drive **one** project's
pipeline; it cannot address "project B, ticket X" from project A's session. Cross-project *agent control*
therefore means either (a) one MCP server per project (N sessions — the current model, and arguably the
*correct* isolation model) or (b) a redesign where the project becomes a **tool argument** rather than a
spawn-bound root — which **deliberately dismantles the single-bound-project security invariant** that the
whole `dart-mcp` module is built to guarantee.

**Verdict (skeptical):** cross-project **viewing/aggregation = SMALL** (hub already multi-project).
Cross-project **agent control from one session = a security-model change, not a feature** — and I would
**advise against it.** Per-project binding is the right call for a tool that runs untrusted-ish agent
output against a filesystem; the isolation is worth more than the convenience. Keep agents per-project;
aggregate for humans at the hub.

### 2.4 Epics/flows sizing — the honest one-paragraph answer

**Epics: small. Flows: small-to-medium (tracks already are flows — finish the affordance, add
`track/create`, render per-track). Multi-project viewing: small (registry exists). Multi-project agent
control: do NOT — it breaks the single-bound-project security boundary.** None of this is a rewrite. The
file-based overlay model *accommodates* all of it because every piece is either an additive optional field
or a derived projection — which is exactly what the overlay/ledger architecture was built to allow.

---

## 3. Agent interaction at the enterprise bar — solid vs. missing

For "agents easily interact + fully controllable," the bar is: **complete tool surface, idempotent writes,
a working directive loop, auditable mutations, multi-project addressing.** Assessment, skeptically:

### Solid (genuinely enterprise-credible)

- **Single mutation path.** Every write — hub HTTP, MCP tool, engine automation — routes through
  `api.handle` (the dart-mcp handlers delegate 1:1; "adding a mutation means adding it to api.handle first,
  never forking a second writer"). This is the right architecture: one chokepoint, one validator, one audit
  emitter. **This is the strongest part of the design.**
- **Guarded, audited writes.** CAS/`expectedRev` for read-modify-write fields; append-only typed comment
  log for the audit trail; every mutation emits the same typed comment regardless of caller. Mutations are
  uniform and replayable.
- **Idempotency where it matters.** Directive consumption is derived from the log (pending = directive with
  no consumed-marker), so a double-consume is a harmless no-op; the engine dedups `(rule,event)` pairs.
  This is correct idempotency, not bolted-on.
- **Safety invariant is single-sourced.** `routePastUnmetSafetyGate` is the *same* function at author-time
  and eval-time; the engine has **no gate-pass action** (only an owner agent can pass a gate). Automation
  can never fabricate a passed safety gate. For an "agents drive everything" product this is the
  load-bearing trust property, and it is well-built.
- **Untrusted-data discipline.** Directive prompts are stored raw, surfaced quoted, never interpolated into
  instructions; proto-pollution keys are neutralized throughout. Prompt-injection surface is consciously
  contained.

### Missing / weak (the honest gaps)

- **Tool surface completeness.** The MCP surface is good but partial: advance, set-gate, set-label, assign,
  require-gate, comment, consume-directive, read-state, pending-directives. **No** `track/create`, **no**
  set-parent/epic, **no** create-ticket (agents can advance/label tickets but the create path isn't on the
  tool surface), **no** kb/propose from the tool surface (it exists in `api.handle` but isn't exposed as a
  DART tool). For "fully controllable by agents," **the tool surface should expose the full `api.handle`
  verb set** (it's the same chokepoint — exposing is cheap and the validation already lives in `api.handle`).
- **`fan_out` is a no-op.** Multi-agent parallel execution is recorded-only. So "agents controlling work
  *in parallel*" is, today, **not actually executed** — it's logged. Either implement it or stop implying
  parallel agent orchestration exists. (Ties to §1.2 item 3 — same DAG question.)
- **Multi-project addressing: absent by design** (see §2.3). Enterprise-credible *for one project*;
  per-project sessions for many.
- **No idempotency key on creates.** Append-only handlers (comment) have no client-supplied idempotency
  key, so a retried create can duplicate. For agent-driven automation that retries, a client-idempotency
  token on the create/comment path would close this. **Small, worth it** if create joins the tool surface.

**Net:** the agent surface is **architecturally solid (one path, audited, safe) but functionally
incomplete** (missing create/parent/track-create verbs; fan_out unimplemented). The fix is mostly
**exposing existing `api.handle` capability through the tool surface**, not new architecture — which is the
cheap, correct kind of gap to have.

---

## 4. The hard enterprise truths — what the architecture precludes, and the realistic path

No pretending. DART is local, single-trust, file-based, zero-dep. That **precludes**, in the deployment
sense of "enterprise":

| Enterprise expectation | Why it's precluded today | Realistic path |
|---|---|---|
| **RBAC / SSO / identity** | There is no identity layer at all — `by` is a free string label, not an authenticated principal. Gate ownership is convention, not enforcement against an authenticated user. | Requires an auth tier + a principal model. Only meaningful with a server (below). **Not retrofittable into the file core.** |
| **Multi-user concurrency** | Concurrency control is a single-process file mutex + optimistic CAS on a local file. Two machines editing the same repo ledger = lost updates / git conflicts, not transactions. | Needs a shared transactional store (DB) behind a server. The CAS model is right *locally*; it does not generalize to multi-writer-multi-host. |
| **Server deployment / availability** | No server tier; the hub is a localhost zero-dep dashboard; the MCP server is spawned per session bound to a local dir. | A **separate optional "team mode" server** product (see path below). |
| **Audit-grade tamper-evidence** | The comment log is append-only *by convention* — it's a writable file; a user can edit it. Good for traceability, **not** for compliance-grade non-repudiation. | Needs append-only storage with integrity (hash-chaining / WORM / DB with audit). Server-tier concern. |
| **Tenancy / data residency** | State lives in the user's repo/home. There is no tenant boundary. | Server-tier concern. |

### The realistic architecture verdict

**Stay local-first.** DART's identity *is* the local, zero-dep, in-your-repo, agent-native dev tool. That is
its moat and the reason it has no lock-in. **Do not contort the file core toward RBAC/concurrency — that
fight is lost before it starts** and it would compromise the simplicity that makes the file model correct.

The credible enterprise path is a **clean architectural seam, not a rewrite**:

1. **Now (local-first enterprise UX):** ship the Pipeline projection (§1), epics + per-track flows (§2.1,
   §2.2), cross-project *aggregation for humans* (§2.3), and the completed agent tool surface (§3). This
   delivers the *expressiveness* meaning of enterprise on the existing architecture, cheaply.
2. **The seam:** `api.handle` is already the single mutation chokepoint and `buildState` the single read
   projection. **That chokepoint is exactly the seam where a server adapter would slot in** — the same way
   the workflow doc already treats Jira/Confluence/memory as *optional adapters behind the same contract*.
   The architecture already has the adapter pattern; a "team-mode" backend is "just" another adapter behind
   `api.handle` + a shared store.
3. **Later, optional (team mode):** an opt-in server that puts the ledger/comment-log behind a DB +
   auth + concurrency, keeping the *same* control-plane contract. This is a **separate product surface**, gated
   on real demand, never the default. File mode stays the zero-dep default; team mode is an adapter — exactly
   the "OSS-first, no lock-in, optional adapters" principle the project already lives by.

**The single biggest architectural truth about DART's enterprise ceiling:** *DART's ceiling is not its data
model — the file/overlay model expressively scales to epics, flows, and multi-project aggregation with only
additive changes. Its ceiling is **trust topology**: single-user-trust + local files preclude RBAC,
multi-writer concurrency, and audit-grade non-repudiation, and those cannot be retrofitted into the file
core — they require an optional server tier behind the existing `api.handle` seam. So "enterprise" for DART
means enterprise-grade expressiveness now, and enterprise-grade deployment only as a later, opt-in adapter —
never by pretending the local file core is something it is not.*

---

## 5. Risks

- **R1 — DAG temptation.** Building parallel/branch topology to make the pipeline "look like Jenkins" would
  rewrite the safety-gate core (`routePastUnmetSafetyGate` walks a linear array) and the loop budget for a
  feature outside DART's flow. **Mitigation:** ship the linear pipeline; defer DAG behind real demand.
- **R2 — Multi-project agent control breaking the security boundary.** Making project a tool argument
  dismantles the single-bound-project invariant. **Mitigation:** keep agents per-project; aggregate for
  humans at the hub only.
- **R3 — Projection drift.** Three consumers (board, pipeline, digest) deriving "in-pipeline" / dwell /
  gate-node independently will diverge. **Mitigation:** one `pipelineView` projection in `state.js`, the
  same DRY discipline `projectWorkflowView` already enforces; cover with a parity test.
- **R4 — fan_out implying capability it lacks.** Surfacing "parallel agents" while `fan_out` is a no-op is a
  credibility risk. **Mitigation:** either implement execution or label it explicitly as recorded-only.
- **R5 — Over-modeling epics.** Multi-level hierarchy + epic-specific gates is PM ceremony DART doesn't
  need. **Mitigation:** one optional `parent`/`epic` field, one level, derived roll-up. Stop there.
- **R6 — Mistaking expressiveness for deployment-readiness.** Shipping epics/flows/multi-project view and
  calling DART "enterprise-ready" invites users to deploy it team-wide on the file core, where concurrency
  and audit fall over. **Mitigation:** be explicit in product copy that team/audit posture is the optional
  server tier, not the file default.

---

## Appendix — grounding (files read)

`hub/lib/state.js` (buildState, projectWorkflowView, summarizeTasks, pendingDirectives, listSummary) ·
`hub/lib/engine.js` (closed grammar, `routePastUnmetSafetyGate`, fan_out no-op, loop budget) ·
`hub/lib/api.js` (control-plane verbs, CAS, engineIO, runEngineTick) · `hub/lib/stage-map.js` (stage→gate→owner) ·
`hub/lib/registry.js` + `projects.js` (multi-project registry) ·
`studio/cockpit/src/app/shell/board.ts` (partitionBoard, isBacklog, doneStage, worklistBands, activeSegmentIndex) ·
`dart-mcp/src/handlers.js` + `bind-project.js` (agent tool surface, single bound project) ·
`claude/workflow/workflow.yaml` (tracks, gates, presets).
