# DART Tasks view — data/state-model architecture for a multi-view, adaptive board

**Author:** Jorge (`/arch`) · Principal Solution Architect
**Lens:** data / state model — what the projection must provide so the Tasks view can offer multiple useful view modes (status/list · stage-pipeline · by-owner · needs-me) that stay useful when the middle stages are empty.
**Type:** Architecture proposal — **no code.** Constraints, model, and the one additive field worth its cost.
**Date:** 2026-06-13
**Reads:** `hub/lib/state.js` (`buildState`), `hub/lib/engine.js`, `hub/lib/stage-map.js`, `hub/lib/comments.js`, `studio/cockpit/src/app/shell/board.ts`, `studio/cockpit/src/app/core/models.ts`, `docs/product-vision/conditional-workflow/tasks-adaptive-aura.md`.

---

## 0. The confirmed problem, stated as a data fact

The board's centre renders **workflow STAGES** (vision → … → done) as columns, but tickets mostly sit at the two **lifecycle** ends — `backlog` and `done`. The middle is structurally empty because **stage** (fine, position-on-track) and **lifecycle status** (coarse, where-in-life) are *different axes*, and the current centre is keyed on the axis (stage) where the data is sparse.

The fix is **not** a backend rewrite. The projection (`buildState`) already carries **both axes** per ticket. The redesign is a **presentational re-projection**: the same `tickets[]` grouped by a *chosen key* (stage | status | owner), with the default key being one on which the data is dense. Aura's adaptive-train spec already fixes the stage view's width; this proposal defines the **view-model** that lets the FE switch the grouping key cheaply, and the one small additive field that makes a "recently-moved" view honest.

---

## 1. The canonical two-axis ticket model

A DART ticket has **two orthogonal axes** plus a set of facets. The projection already computes all of the load-bearing ones in `buildState`:

| Axis / facet | Field (today) | Source | Cardinality |
|---|---|---|---|
| **Fine position** | `stage` (`vision`…`done`, or off-track/unknown) | ledger `t.stage` | one-of-track |
| **Coarse lifecycle** | `status` ∈ `in_progress · waiting · blocked · done` | derived in `statusOf(stage, gates, assignee)` | 4 buckets |
| **Owner (actual)** | `assignee` | ledger `t.assignee` | agent or null |
| **Owner (expected)** | `expectedOwner` | `expectedOwner(stage, wf)` via stage-map | agent or null |
| **Decision overlay** | "needs-you" | `needsHumanDecision(ticket)` (hub) / `ticketNeedsYou` (board.ts) | boolean overlay |
| **Gates** | `gates[]` `{name, refusal, state, by, at, note, safety}` | ledger × gateDefs | per-ticket list |
| **Labels** | `labels[]` | ledger | list |
| **Liveness** | `active` (live heartbeat) | ledger `t.active` | boolean-ish |
| **Conversation** | `comments[]` (`kind`, `ts`, `author`, `body`, `gate`, `state`) | comment-log JSONL | append-only list |
| **Pending work** | `pendingDirectives[]` | derived from comment log | list |

**Key model statement:** `stage` and `status` are **independent projections of the same ticket**. `status` is *derived* (see §2), never stored separately, so the two axes can never disagree. The same `tickets[]` can therefore be **grouped by any of three keys** — `stage`, `status`, or `assignee`/`expectedOwner` — with **needs-you** as a cross-cutting *filter/overlay* on any of them. This is the multi-view enabler: one projection, three group-by keys, one overlay.

### 1.1 The derivation rules (single source of truth)

`status` derives deterministically from `stage` + `gates` + `assignee` (already implemented in `statusOf`, `hub/lib/state.js:451`):

```
status(ticket):
  stage == 'done'                              -> 'done'
  any hard gate rejected                       -> 'blocked'
  assignee set                                 -> 'in_progress'
  else                                         -> 'waiting'
```

`needs-you` is an **overlay**, not a 5th bucket — it must not perturb the sum of the four core buckets (`needsHumanDecision`, `hub/lib/state.js:463`):

```
needsYou(ticket):
  any hard gate rejected                              -> true   (parked on a blocking decision)
  status == 'waiting' AND expectedOwner AND !active   -> true   (waiting on a human/owner, no live agent)
  else                                                -> false
```

> **Disjointness note (R1) for board.ts:** the existing `partitionBoard` places each ticket in exactly one *region* (backlog · stage column · done · off-track) and that invariant must hold **per view**. For a status-grouped or owner-grouped view the same discipline applies: the group key is single-valued (a ticket has exactly one `status`, exactly one `assignee`-or-`unassigned` bucket), so disjointness is preserved by construction. `needsYou` is rendered as a **chip/filter**, never as its own column — exactly as `board.ts` already does for the stage view (`ticketNeedsYou` → card chip, not a column). Keeping that rule across all views is what preserves R1.

---

## 2. What the projection already exposes vs what each new view needs

Enumerated per view mode. **"Have"** = already in `buildState`/`TicketView` today; **"Derive (FE)"** = computable client-side from fields already present; **"Additive"** = would need a new projection field.

### 2.1 Status / list view (group-by `status`)
- **Have:** `status` (4 buckets, summing to total), `taskSummary.byStatus` already rolls these up *plus* `needsYou`. The list view is literally `tickets` grouped by `status`.
- **Derive (FE):** nothing extra — `statusChip()` already exists in `board.ts`.
- **Additive:** none. **This view is free today.**

### 2.2 Needs-me view (filter overlay)
- **Have:** `needsHumanDecision`/`ticketNeedsYou` already encode the predicate; `taskSummary.byStatus.needsYou` already counts it; the list-summary roll-up (`listSummary`) already surfaces `needsYou` per project.
- **Derive (FE):** filter `tickets` by `ticketNeedsYou(t)`. A **"why"** string ("hard gate X rejected" vs "waiting on {owner}") is derivable from the same fields the predicate reads (`gates[]` state/refusal, `status`, `expectedOwner`, `active`). Recommend exposing it as a tiny **client-side helper** (`needsYouReason(ticket)`), not a projection field — it is pure presentation over data already present.
- **Additive:** none. **This view is free today.**

### 2.3 By-owner view (group-by `assignee` ?? `expectedOwner`)
- **Have:** `assignee` (actual) and `expectedOwner` (workflow's expected agent at the stage). A by-owner grouping keys on `assignee ?? expectedOwner` so even unassigned tickets land under "the agent who *would* act" — useful, and dense (every ticket maps to some owner or an explicit "unassigned").
- **Derive (FE):** the group key `assignee ?? expectedOwner ?? '(unassigned)'`. No new field.
- **Additive:** none. **This view is free today.**

### 2.4 Stage-pipeline view (group-by `stage`)
- **Have:** the full `workflowView.stages[]` (ordered, with owner + governing gate) and `partitionBoard`. This is the current board; Aura's adaptive-train spec makes it width-adaptive.
- **Additive:** none — already the richest view.

### 2.5 Recently-moved / activity view (sort/group by last activity)
- **Have:** the **comment log** carries a typed, timestamped record per state change: `kind ∈ {comment, gate, advance, assign, label, directive}` each with `ts` (`hub/lib/comments.js`, `engine.eventFromComment`). An `advance` record's `ts` **is** the "last moved to a stage" time; the newest record's `ts` is "last activity."
- **Derive (FE):** `commentsNewestFirst()` already exists in `board.ts`; the FE can read `comments[0].ts` for last-activity and the newest `kind:'advance'` record's `ts` for last-moved. So this view is *derivable today* **at the cost of shipping the full `comments[]` array** and scanning it client-side.
- **Additive (recommended, small):** a derived **`lastActivityAt`** (and optionally **`lastMovedAt`**) scalar on each ticket in the projection — see §4. This is the **one** field I recommend, and only because (a) it lets the list/needs-me views **sort by recency** without shipping/scanning every ticket's full comment log, and (b) it lets `listSummary` (the LIST endpoint roll-up) expose "most-recent activity" cheaply for the projects-home pulse. It is a *projection of existing data* (the max `ts` over the comment log) — **no new write, no new file, no schema change.**

**Summary:** four of the five new views (**status, needs-me, by-owner, stage**) require **zero** projection changes — they are pure group-by/filter re-projections of fields `buildState` already returns. Only the **recency** dimension benefits from one small additive scalar, and even that is optional (derivable from `comments[]`).

---

## 3. The multi-view projection approach (one projection, many group-bys)

The architecture is **CQRS-flavoured but trivially so**: `buildState` is the single read-model; the FE composes *views* over it. No second backend projection is needed.

```
buildState(project)            ──►  ProjectState { tickets[], workflowView, taskSummary, tracks, gateDefs, … }
                                         │
   FE Tasks view  ────────────────────────────────────────────────────────────────────
        viewMode ∈ { stage | status | owner | needsMe | recent }
        group(tickets, key)  where key picks one of:
            stage     -> partitionBoard(workflowView, tickets)        (existing)
            status    -> groupBy(t => t.status)                        (4 buckets, + needsYou overlay chip)
            owner     -> groupBy(t => t.assignee ?? t.expectedOwner ?? '(unassigned)')
            needsMe   -> tickets.filter(ticketNeedsYou)                (flat list, sortable by recency)
            recent    -> [...tickets].sort(by lastActivityAt desc)     (flat list)
```

**Design rules for the FE re-projection (so it stays cheap and correct):**

1. **One pass, single-valued key.** Every group-by uses a single-valued key per ticket → O(n) grouping, disjoint groups (R1 preserved). `needsYou` is a boolean overlay/filter, never a group key, so it never double-counts.
2. **The default view is the dense one.** For *this* project (work clustered in backlog/done), default to **status** (or **list**) — every ticket lands in a populated bucket, so the default is useful with an empty middle. The stage-pipeline view remains available (and Aura's adaptive train keeps it honest when chosen), but it is **not** the empty-middle default.
3. **Counts come from `taskSummary`, not recomputation.** `summarizeTasks` already produces the canonical `byStatus` (summing to total) + `needsYou` overlay. The status view binds those counts directly; it must not re-derive them divergently.
4. **`needsYou` parity across hub + FE.** Two implementations exist today — `needsHumanDecision` (`state.js`) and `ticketNeedsYou` (`board.ts`). They currently differ: the hub predicate also raises on `status==='waiting' && expectedOwner && !active`; `board.ts` raises only on a rejected hard gate. This is a **latent contract drift** (see §5 R1). The view-model must pick one definition as canonical (recommend the hub's `needsHumanDecision`, since `taskSummary.byStatus.needsYou` and `listSummary` already count by it) and have the FE mirror it exactly — a cross-implementation parity concern, the same class of guardrail the engine applies to derived keys.

---

## 4. The one additive projection field (cost/benefit)

**Recommended additive field:** `lastActivityAt` (ISO string | null) on each ticket in `buildState`, derived as the **max `ts` over that ticket's comment log** (the log `buildState` already reads via `readComments`). Optionally also `lastMovedAt` = the `ts` of the newest `kind:'advance'` record.

| Aspect | Assessment |
|---|---|
| **What it enables** | Sort list / needs-me / recent views by recency; a "recently moved" grouping; a freshness signal on the projects-home pulse via `listSummary`. |
| **Cost** | ~3 lines in `buildState`'s ticket map (a `max` over `comments` already in scope). **No new write, no new file, no ledger/schema change** — it is a pure projection of the append-only comment log. |
| **Why a field and not pure FE-derive** | The FE *can* derive it from `comments[]`, but that forces shipping the entire comment log for every ticket to every list view and scanning it client-side per render. A scalar `lastActivityAt` lets the LIST endpoint and the list/recent views sort without the full log — relevant at ~40+ tickets (§6). |
| **Worth it?** | **Yes, but low-priority / optional for v1.** The four primary new views ship with zero projection change. Add `lastActivityAt` only when a recency sort/view is actually built. It is the *only* additive field I would entertain; everything else is derivable. |

**Explicitly NOT recommended as new fields** (derive client-side instead): `needsYouReason` (pure presentation over existing gate/status fields), per-view group keys, `commentsCount` (it's `comments.length`), any per-view denormalised bucket arrays (that would duplicate `tickets[]` and risk drift).

---

## 5. Invariants preserved (no backend rewrite, overlay-only, guarded writes)

**These are the hard constraints the redesign must not violate. All are preserved because the redesign is presentational.**

1. **Guarded CAS control-plane writes are unchanged.** Advancing a ticket, setting a gate, assigning, or setting a label remains the **existing guarded write** through the hub's CAS writers (`engine.apply` → injected `io.*`, round-tripping the opaque `rev` from `buildState`). **Regardless of which view the operator is in**, the *action* a card triggers is the same control-plane mutation it triggers today. A view is a *lens*; it never introduces a new write path. The closed `DO_ACTIONS` allowlist, the safety-gate refusal (`routePastUnmetSafetyGate`), and the `settable_by` label contract all stay the single authority.
2. **Overlay-only, read-model is pure.** `buildState` is pure reads, never throws, never writes (`hub/lib/state.js` header). The view-model adds at most one *derived read* field (`lastActivityAt`); it stores nothing. The machine-owned overlay (`workflow.overrides.json`) remains the only place stages/gates/rules/owners are customised, merged in `applyOverlay`. Views do not read or write the overlay differently.
3. **`rev` optimistic concurrency intact.** Every view binds the same `state.rev`; every mutation round-trips it unchanged. Switching views is a client-side regroup — it does not refetch or invalidate `rev`.
4. **R1 disjointness per view.** `partitionBoard` already guarantees one-region-per-ticket for the stage view. Status/owner views use single-valued keys → disjoint by construction. `needsYou` stays a chip/filter, never a bucket. The **one cleanup to land**: reconcile the two `needsYou` predicates (§3 rule 4) so the chip, the `taskSummary` count, and the `listSummary` roll-up cannot disagree.
5. **Multi-project + SSE-live hold.** `buildState` is per-project and `fileRev`-keyed; the SSE live push already re-pushes the whole `ProjectState`. A view switch is **client state only** — it re-groups the already-pushed `tickets[]` with no server round-trip, so live updates keep flowing into whatever view is active (the FLIP re-layout Aura specs applies per view). `listSummary` keeps the projects-home roll-up exact-by-construction.

---

## 6. NFRs / performance (~40+ tickets)

- **Grouping is O(n) per view switch**, n = ticket count. At 40–400 tickets a regroup is sub-millisecond; no memoisation needed beyond Angular's `OnPush` + signals. View switch touches no network.
- **Payload:** the heavy per-ticket field is `comments[]` (and `description`). If a recency/list view needs only recency, the optional `lastActivityAt` scalar avoids shipping/scanning full logs in the LIST roll-up; the detail view still loads full `comments[]` lazily as today.
- **SSE re-push** already sends the full `ProjectState`; at 40 tickets this is small. If ticket counts grow into the thousands, consider a future delta-push — **out of scope** for this redesign and not a current constraint.

---

## 7. ATAM-style risk register

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | **`needsYou` predicate drift** — `needsHumanDecision` (hub) ≠ `ticketNeedsYou` (board.ts). The chip, the status-strip count, and the projects-home roll-up can disagree, so "needs me" shows a different set than its own counter. | High | Pick the hub predicate as canonical; FE mirrors it byte-for-byte (a cross-implementation parity test, the engine's derived-key guardrail applied to a derived boolean). Land this as part of the redesign. |
| R2 | **A view becomes a covert write path.** A new "drag between owner columns" or "drag between status columns" gesture would imply a *stage/assignee mutation* — which must still go through the guarded CAS write + safety-gate check, not a view-local state edit. | High | Mandate: any cross-group drag emits the **same** control-plane mutation a card action emits today; no view may mutate `status` directly (it's derived) — only `stage`/`gates`/`assignee` are writable, and only via CAS. The status axis is **read-only by construction** (derived), which structurally prevents the worst version of this. |
| R3 | **Default-view choice hard-codes an assumption.** Defaulting to "status" is right for *this* coarse-lifecycle project but a stage-heavy project may prefer the pipeline. | Med | Make the default view a function of the data (e.g. default to the view whose groups are most evenly populated, or remember the operator's last choice) rather than a constant. Cheap, client-side. |
| R4 | **Adding `lastActivityAt` tempts further denormalisation.** Once one derived scalar lands, pressure to add per-view bucket arrays / counts grows → drift risk. | Low | Hold the line: only scalars derived from existing reads; never denormalise `tickets[]` into per-view arrays in the projection. Groups are an FE concern. |
| R5 | **Off-track tickets** must remain visible in every view, not just the stage view. | Med | In status/owner views, off-track tickets still carry a `status` and an owner, so they group naturally; surface their off-track-ness as a **chip** (like needs-you), preserving the stage view's "nothing's lost" honesty across views. |

---

## 8. Decision

**APPROVED as an architecture direction (no gate recorded here — this is a proposal for the redesign):** the multi-view, adaptive Tasks view is a **presentational re-projection over the existing `buildState` read-model**. It requires **no backend rewrite**, **no new write path**, and **no schema/ledger change**. Four of the five new views (status · needs-me · by-owner · stage) are **free today** — pure group-by/filter over fields the projection already returns. The **one** field worth adding is a derived `lastActivityAt` scalar (optional, low-priority, only for a recency view). The **one cleanup that must land** is reconciling the two `needsYou` predicates so all three consumers agree.

**The single constraint Aura's design must respect:** `status` is a **derived, read-only axis** (from `stage` + `gates` + `assignee`); no view may let the operator edit `status` directly — every state change a card triggers, in *any* view, must remain the existing guarded CAS control-plane write on `stage`/`gates`/`assignee`, subject to the safety-gate refusal. A view is a lens, never a new write path.
