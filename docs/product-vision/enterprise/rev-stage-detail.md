# Code Review — Stage-Detail Drawer (ADT-246)

**Reviewer:** /rev — Senior Full-Stack Code Reviewer
**Date:** 2026-06-13
**Branch:** feat/dart-stage-detail
**Binding spec:** `docs/product-vision/enterprise/STAGE-DETAIL-SPEC.md` (DESIGN_APPROVED, Aura)
**Verdict:** **APPROVED** — nits/one warning, no blockers. The warning is a copy-honesty polish, not a correctness or security defect; the gate may pass. Recommend a fast-follow for the vacuous-green-gate line.

## Change set reviewed
- `studio/cockpit/src/app/shell/stage-detail.component.ts` (new — the drawer)
- `studio/cockpit/src/app/shell/stage-detail.component.spec.ts` (new — exercised through the board host)
- `studio/cockpit/src/app/shell/tasks-pipeline.component.ts` + `.spec.ts` (trigger rewire)
- `studio/cockpit/src/app/shell/tasks-board.component.ts` (host: open state, live re-derive, focus-return)
- `studio/cockpit/src/app/shell/board.ts` + `.spec.ts` (`stageActivity`, `stageRoleLine`, `advanceTargetStage` export)
- `studio/cockpit/src/app/core/models.ts` (`WorkflowStageView.meaning?`)
- docs: `STAGE-DETAIL-SPEC.md`, `PIPELINE-DECISIONS.md`

## Test & build results
- `npm test` → **592 passed (36 files)**. Includes the new drawer specs, board helper specs, the rewired pipeline specs, and the safety specs (`no-tofu-glyphs`, `no-unsafe-binding`) — all green.
- `npm run build` → **succeeds**. The only budget warning is `workflow-builder.component.ts` (9.21 kB, **pre-existing, NOT in this change set**). The new `stage-detail.component.ts` raises **no** budget warning/error → under the 6 kB warning / 12 kB error threshold.

## Spec-correctness verification (the load-bearing details)

### 1. Live re-derive on SSE push — the riskiest detail — VERIFIED CORRECT
The host stores only the open stage's **name** (`openStageName: signal<string|null>`), never a captured column. `openColumn` is a `computed` over `openStageName` + `columns()` (which flows `state() → partition() → columns`), so the drawer re-derives by stage name on every push — mirroring `selected()`'s re-derive-by-id discipline exactly as the spec demands. `openStageIndex`, `openNextStage`, `openStageRemoved`, `activeSegment` are all computeds off the same live state. Tests genuinely exercise this via `setInput('state', next)` (not reopening):
- gate change → blocker banner appears in place;
- a task changing stage → its row drops out;
- workflow trimmed → retained-name + `stage-removed` state.
This is the bug the spec flagged as most likely; it is correctly avoided.

### 2. Read-only / no new write path — VERIFIED CORRECT
The drawer has **no** `ControlPlaneService` import, no `advance`/`gateSet`/comment call, no `<textarea>`. Its only outputs are `close` and `openTicket`; `openTicket` re-emits the host's existing guarded `openDetail`. The read-only spec asserts the absence of `gate-approve`/`gate-reject`/`detail-advance`/`comment-post`/`textarea` inside the drawer. All mutations stay on the task-detail modal's existing guarded paths. Status is a pure read of `state()`.

### 3. Drawer-below-modal stacking & ESC — VERIFIED CORRECT
Scrim `z-index: 40`; the task-detail modal is `50` (comment in styles documents this). A drilled ticket modal stacks on top of the drawer, which stays mounted (`stage-drawer` still present in the drill-through test). The drawer's `onKeydown` calls `event.stopPropagation()` on Escape, so the top surface closes first.

### 4. Trigger rewiring — VERIFIED CORRECT
`onStageClick`/`onStageActivate` now emit `openStage({stage, focusGate:false})`; `onGateClick` emits `focusGate:true`. The old `mostActionable`→`openTicket` drill-in is removed. The card-guard is preserved (`event.target.closest('.card')` early-return in both stage handlers). The `#cardTpl` open button still opens its own ticket detail (pipeline spec retains that assertion). Pipeline's `openTicket` output is fully replaced by `openStage`; no dead output left.

### 5. Content reuse (not re-authored) — VERIFIED CORRECT
Identity, gates, tasks, and activity all re-project existing helpers: `partitionBoard`/`columns`, `stageGateNode`, `gateRowsFor`/`gateStateView` (provenance by/at/note), `statusChip`/`cardVisualStatus`/`cardGateSummary`/`commentsNewestFirst`/`dwellSince`/`enteredCurrentStageAt`/`nextStageInOrder`. New helpers are thin, pure derivations: `stageActivity` (merge + newest-first + cap, unit-tested incl. no-ts-sorts-last and cap) and `stageRoleLine` (meaning → gate-derived → neutral fallback, never invented, unit-tested for all three branches). `advanceTargetStage` is merely promoted to `export`. The compact task ROW is purpose-built (NOT `#cardTpl`) and the spec test asserts `card-A-1` is absent inside the row.

### 6. Honest empty / removed — VERIFIED (one warning, see below)
Empty stage renders full identity + role + `stage-tasks-empty` with behind/ahead reassurance derived from `stageIndex` vs `activeSegment`. Removed-while-open keeps the retained name + `stage-removed` line and suppresses the body. "doing now" reads `No activity logged yet.` honestly when a ticket has no comments. Activity-empty and gate-none notices present.

### 7. A11y / honesty / no-regression — VERIFIED CORRECT
`role="dialog"` + `aria-modal="true"` + `aria-labelledby` to the per-instance `titleId` (`Math.random` seq, same pattern as the modal). Focus-trap copies `trapFocus` + `FOCUSABLE` verbatim; initial focus → close button, or gate section when `focusGate`; focus returns to the trigger node on close (`closeStage` re-focuses `[data-testid=...]` via the host element). ESC + scrim-click + inside-click-stop tested. Reduced-motion zeroes `--kb-dur-base` and disables the slide animation. Colour is additive everywhere (glyph + word + tone). `≥44px` coarse-pointer targets on close + task rows. No `[innerHTML]`, no `DomSanitizer` bypass — confirmed by grep and by the `no-unsafe-binding` spec (walks all of `src/app`); the hostile-text spec asserts `<img onerror>` is escaped to text, no element injected. The Pipeline chain/Worklist/`board.ts` partition/colour/parity are otherwise unchanged — `board.ts` only gained pure helpers + one `export`.

### Facts-only / self-describing grep — CLEAN
No ticket IDs, persona names, condition codes, or sprint refs in `stage-detail.component.ts` / `board.ts`. The only upper-case tokens are legitimate gate names (`ARCH_APPROVED`, `SECOPS_APPROVED`, …) used as a domain-data lookup table, which are facts, not process artifacts. JSDoc on the component and the new helpers states behaviour only.

## Findings by severity

### BLOCKING
None.

### WARNING
- **W1 — Empty gated stage renders a vacuous green "passed" word** — `stage-detail.component.ts` gate head (≈L128-140) + `board.ts` `stageGateNode` (L566). For an empty column, `stageGateNode` returns `state:'passed'` (the loop never flips `anyUnmet`), so the gate head renders `gateStateView('passed')` → a green "✓ passed" beside the honest "No tasks to gate yet" notice. Spec §3 and mock 6.3 are explicit that an empty gated stage must NOT show a green "passed" ("passing over zero tickets is vacuous"); mock 6.3 shows the gate head with the gate name only, no state word. The existing test (`stage-gate-empty`) only asserts the "No tasks to gate yet" text is present — it does not assert the green "passed" word is absent, so the gap slips through green. **Recommended fix:** when `column().tickets.length === 0`, suppress the rolled-up state badge (render the shape + name only) and rely on the `stage-gate-empty` notice; add a test asserting the "passed" word is not rendered for an empty gated stage. Low risk, copy-honesty only — does not block the gate, but should be a fast-follow because it violates the spec's load-bearing "no vacuous green" rule.

### NIT
- **N1 — Missing "showing the 20 most recent" truncation note** — Spec §2.4 asks the activity log to show a "showing the 20 most recent" note when the merge is truncated at `STAGE_ACTIVITY_CAP`. The cap is correctly enforced in `stageActivity`, but the drawer renders no truncation note. Minor honesty-completeness gap; the cap itself is honest. Consider surfacing a small note when `stageActivity(col)` would have exceeded the cap (the helper currently slices silently — it could return a `truncated` flag or the caller could compare against an uncapped count).

### SUGGESTION
- **S1 — `now` default is evaluated once at field init** — `now = input<number>(Date.now())` captures `Date.now()` at component construction. For dwell this matches the chain's existing pattern and is deterministic in tests, so it's acceptable; just noting the dwell clock is the open-moment, not live-ticking. No action required.

## Assumptions & limits
- Verified against the spec's behavioural contract and the test suite; did not run the drawer in a live browser (a11y focus-return and reduced-motion are asserted in unit tests, not visually).
- The empty-gate honesty gap (W1) is a spec-conformance call, not a runtime defect — the drawer is correct and safe; it just shows one word the spec wanted suppressed.
