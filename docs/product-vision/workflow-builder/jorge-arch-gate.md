# Arch Gate — Workflow builder as the pipeline chain in edit-mode (one control plane)

**Decision owner:** /arch (Jorge) · also carrying the security confirmation for this change
**Change:** Make the read-only CI pipeline chain (`tasks-pipeline.component.ts`) editable IN-PLACE, unifying it with the standalone editor (`workflow-builder.component.ts`). UI composition only — no new routes, no new persistence, no new write surface proposed.

---

## Verdict

- **ARCHITECTURE = APPROVED-WITH-CONDITIONS** (conditions are the /fe concurrency invariants in §3; they are behavioural, not architectural — no new structure required).
- **SECURITY = NOT-TRIGGERED-FOR-NEW-SURFACE** (reuse of the existing guarded write surface; full /secops pass not required — basis in §4).

---

## 1. Architecture decision — reuse, add nothing

Confirmed: the existing overlay + CAS + `ControlPlaneService` model fully supports in-place editing on the chain with **zero architectural change**.

Grounds (verified in code, not asserted):
- Every mutation the builder performs goes through `ControlPlaneService.mutate()` → the five guarded routes (`track/set-stages`, `gate/trigger`, `preset`, `workflow/set-rules`, `workflow/set-labels`), each carrying `expectedRev` and `writeHeaders()` (X-AIDT). The service is `providedIn: 'root'` — a singleton already injectable by any component, including the pipeline.
- The pipeline already consumes the **same `liveState()`** the builder does (`tasks-board` and `workflow-builder` both bind the shell's `liveState()`; both surface fresh state via `adoptState`). The chain renders `workflowView.stages` + gate nodes — the identical projection the builder edits. Putting edit affordances on the chain changes *where the same controls render*, not *what they call*.
- The set-stages route is **declarative and idempotent by design** (full ordered stage list = one atomic CAS). Reorder / add / delete / set-owner are already one write each. Moving the grip + owner-select + gate-edit + rules-pill onto a chain node reuses these verbatim.

**No new route / state / endpoint is justified.** I explicitly reject the tempting additions:
- **Edit-mode lock / edit session** — REJECTED. A lock is server state with a lifecycle (acquire, renew, release, expiry, steal) and a new failure mode (a crashed/abandoned tab holding the workflow hostage from the very agents the tool exists to run). It buys nothing the per-edit CAS doesn't already give: the CAS *is* the concurrency control, scoped to the one field actually changed, with no lock to leak.
- **Staged-commit / batch endpoint** — REJECTED. The product contract is "each edit commits immediately" (drag-drop, owner, preset, gate, rules all commit on the spot today). A batch endpoint would introduce a second consistency model (a client-side dirty set diffed and flushed) competing with the live overlay agents also write — strictly worse than N atomic CAS writes. set-stages already batches the *one* genuinely multi-field edit (the whole stage list).

Default bias honoured: **reuse what exists; add nothing.** The change is a view/composition refactor over an unchanged control plane.

## 2. Safety of live in-place editing — concurrency analysis

Does editing on a *live* chain introduce a race the separate-panel builder didn't? **No new race class** — the concurrency surface is identical, because both read the same `liveState()` and write the same CAS routes. What changes is **perception**: the chain is the primary always-on view, so optimistic edits and SSE-driven agent updates now visibly co-occur in the same pixels. That is a UX reconciliation concern, not a new data race.

The scenario "human drags a stage while an agent flips a gate":
- Both target the same overlay/`rev`. Whichever write lands first wins and bumps `rev`. The second arrives with a now-stale `expectedRev` → the hub returns **409**, decoded first-class by `mutate()` into `ok: 'conflict'` carrying fresh server state.
- The existing builder already handles this exactly right (`reconcile()`): adopt server truth, roll back the optimistic change, raise a focused conflict banner with Discard / Re-apply. **This contract transfers unchanged** to the chain.

The only genuinely new wrinkle is **mid-drag SSE arrival**: an agent update can repaint the chain while a human is dragging. Per-edit CAS still protects correctness (a stale drop 409s), but a node moving under the pointer is jarring. This is handled in the reconciliation contract below — it is a presentation rule, not a safety gap.

**Reconciliation contract /fe MUST honour (these are the gate conditions):**

1. **Always send `expectedRev` from the currently-rendered state** — the `rev` of the `liveState()` the node was drawn from, never a cached/stale snapshot. (Builder does this via `this.rev()` off `state()`; the chain must read the same live signal.)
2. **Treat 409 as first-class, never an error** — reuse `reconcile()`'s three-way outcome and the existing conflict banner (adopt fresh state → roll back optimistic → offer Discard / Re-apply). Do not add a second conflict UI.
3. **Optimistic write rolls back on conflict** — the working copy resets to adopted server truth (the builder's `workingStages.set(null)` pattern). No silent overwrite, ever.
4. **SSE adoption during an in-flight edit must not corrupt the optimistic working copy** — while a drag/grab is active, an arriving `adoptState` updates server truth but the live working order is preserved until the drop resolves (the builder's `effect` already drops a stale optimistic order only when not dirty; the chain must preserve the same guard so an agent update mid-drag doesn't yank the node from under the pointer).
5. **One write per atomic intent** — a drop = one `set-stages` CAS; a gate edit = one `gate/trigger`; never coalesce unrelated edits into a speculative batch.

If /fe holds these five, live in-place editing is exactly as safe as the current panel — the same CAS, the same banner, the same single source of truth.

## 3. Security confirmation (stands in for /secops because no new write surface)

Verified against `hub/lib/guard.js`, `platform-bridge.ts`, and `control-plane.service.ts`:

- **(a) Same guarded routes, no new endpoint.** Every in-place mutation rides `ControlPlaneService.mutate()` → the existing five routes. `mutate()` unconditionally attaches `writeHeaders()` (X-AIDT); the hub guard requires X-AIDT **+** loopback Host **+** loopback Origin (when present) **+** loopback socket. Moving the affordance onto the chain adds **no** route and changes **no** request shape. ✔
- **(b) No client-supplied path, no privilege escalation.** The edit payloads carry stage names / owners (from a server-re-validated allowlist) / preset (server allowlist) / rule + label maps (server re-validates) / `expectedRev`. None carries a filesystem path; the hub resolves the project by registry id, never a client path. Relocating the controls introduces no new field. ✔
- **(c) Overlay-only write invariant preserved.** All writes target `.aidevteam/workflow.overlays` via the same routes; the base `workflow.yaml` is never machine-written (the persistent "saves to this project only" banner states this, and the route contracts enforce it). The chain edits the same overlay — no new persistence path. ✔
- **(d) No mutation exposed to a read-only / off-loopback client.** Off-loopback or header-less requests are refused 403 by the guard regardless of which component issued them — the **server** is the authority, so this holds structurally even if write UI rendered. The client should additionally gate the edit affordances on the host's writability (browser bridge always supplies X-AIDT; a non-writable host would not), consistent with how write UI is gated today. The guard is the backstop; the UI gate is courtesy. ✔

All four hold. **SECOPS confirmation = NOT-TRIGGERED-FOR-NEW-SURFACE.** No new write path, endpoint, payload field, persistence target, or data-egress flow is introduced; the change is composition over the existing guarded chokepoint. A full /secops review is **not** required for this change. (It WOULD be required if implementation drifts into any of: a new route, a lock/session endpoint, a batch-commit endpoint, a client-supplied path, or rendering edit controls that bypass `ControlPlaneService`.)

## 4. Consolidation call

**Retire the standalone stage editor into the pipeline edit-mode; keep the builder shell only as the host for the genuinely non-chain concerns (Labels manager, and the rules-grammar editor where it exceeds a per-node pill).**

Reasoning (maintainability = one control plane):
- The stage rail, gate nodes, owner, reorder, add/delete, gate-rule editor, and per-stage rules pill in `workflow-builder` are a **second rendering of the same chain** the pipeline already draws. Keeping both means two node renderers, two keyboard models, two drag implementations to keep in sync — duplicated edit logic over one overlay. That is the exact divergence this change exists to remove.
- The mutation logic (`reconcile`, `commitStages`, conflict handling, `ownerOptions`, validation mirrors) is **view-agnostic** and should be lifted out of the component into a shared edit controller/service the chain drives — so there is one CAS+conflict implementation, rendered once on the chain.
- **Labels** are workflow-level, not a chain node (they route work between stages; they are not a stage). They have a legitimate separate surface. Keep the Labels manager as its own panel/tab.
- **Rules** attach to a stage, so their *entry point* belongs on the chain node (the rules pill), but the full `when → do` authoring grammar is a richer editor — keep that editor component, reached from the on-chain pill, not duplicated.

Net: one editable chain = one control plane for stages/gates/owners/reorder/preset; Labels and the rules-grammar editor remain distinct surfaces reached from it. Delete the duplicated stage-rail rendering once the chain owns edit-mode.

---

## Conditions summary (for the ledger)

- ARCH_APPROVED — conditional on /fe honouring the five reconciliation invariants in §2.
- SECOPS — NOT-TRIGGERED-FOR-NEW-SURFACE; re-trigger /secops if implementation adds any route, lock/session, batch endpoint, client path, or write UI that bypasses `ControlPlaneService`.
- Consolidation — retire the duplicated stage-rail editor into the chain; keep Labels + rules-grammar editor as distinct surfaces; lift shared CAS/conflict logic into one controller.
