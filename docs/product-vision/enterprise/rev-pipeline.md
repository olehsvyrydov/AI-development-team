# Code Review — ADT-245 CI-style Pipeline view

**Reviewer:** /rev (Senior Full-Stack Code Reviewer)
**Date:** 2026-06-13
**Branch:** feat/dart-pipeline-redesign
**Gate:** CODE_REVIEWED (HARD, standard track)
**Binding spec:** docs/product-vision/enterprise/PIPELINE-BUILD-SPEC.md (DESIGN_APPROVED)
**Verdict:** APPROVED — 0 BLOCKING, 0 WARNING, 1 NIT-level observation (optional).

## Scope reviewed (uncommitted change set)

- `studio/cockpit/src/app/shell/tasks-pipeline.component.ts` (NEW — the chain component)
- `studio/cockpit/src/app/shell/tasks-pipeline.component.spec.ts` (NEW — DOM-contract specs via the parent board)
- `studio/cockpit/src/app/shell/tasks-board.component.ts` (Pipeline `@case` replaced by `<dart-tasks-pipeline>`)
- `studio/cockpit/src/app/shell/tasks-board.component.spec.ts` (pipeline-internal specs retired, shared/worklist kept)
- `studio/cockpit/src/app/shell/board.ts` (+4 pure helpers — additive)
- `studio/cockpit/src/app/shell/board.spec.ts` (+helper unit tests)
- enterprise specs (PIPELINE-BUILD-SPEC.md, PIPELINE-DECISIONS.md, the 5 investigation docs) — read as input.
- `claude/skills/.../backend-developer/SKILL.md` — present in the working tree but **out of ADT-245 scope** (a universal FQN style-rule clarification, no process artifacts). Benign; not gating this ticket.

## Spec-correctness verification (vs PIPELINE-BUILD-SPEC.md)

### 1. Connected stage-flow + the HORIZONTAL-header fix — CORRECT
- The chain iterates `partition().columns` (the in-pipeline set) directly; `done`/`backlog` are removed by construction and are NOT re-filtered. The four in-pipeline stages render left→right as `stage-<stage>` nodes joined by `flow-connector-<stage>` connectors, with a continuous `.flow__track` rail behind them (`pipeline-flow` group + `pipeline-chain` role=list).
- **The vertical-header regression is fixed.** The old `writing-mode: vertical-rl` / `overflow-wrap: anywhere` compact-station styling is fully deleted. The new `.stage-node__stage` uses `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` — a long stage name reads on one line and ellipsises rather than stacking one-letter-per-line. `.flow__seg { min-width: 13rem }` gives a sensible node width. Three regression-guard specs assert `writing-mode` is horizontal-tb, `white-space: nowrap`, `overflow-wrap !== anywhere`, `word-break !== break-all`, and `min-width >= 12rem` — including in the idle/preview chain.
- The header is one horizontal row: marker · name · owner · gate word · status word · count (count `margin-left:auto`). Tickets render via the parent's `#cardTpl` projected verbatim through `cardTemplate` (`ngTemplateOutlet`) — no new card, no new card testid.
- Per-stage status colour via `stageNodeStatus` **reuses `cardVisualStatus`** per ticket (worst-actionable precedence) and is emitted as `data-stage-status` on `.stage-node`, painted on the top border + marker, and **always paired with a status WORD** (`stage-status-<stage>`) + count — never colour-only.
- The active front (`activeSegment()`) lights connectors/markers `ci <= active`; ahead reads pending. Verified by the connector-lit spec.

### 2. Gate nodes + blocked-red break — CORRECT (the load-bearing honesty)
- `stageGateNode(col)` rolls the governing gate up across in-stage tickets: rejected if ANY rejected, else pending if any non-passed, else passed; `null` when no `col.gate`. `passed`/`total` counts are present for the "1 of 2 passed" label.
- Gate nodes render on the connector ENTERING the gated stage, as real `<button>`s; hard = solid diamond, soft = dashed diamond (SVG shape carries kind), plus the state WORD.
- **Rejected HARD gate → `data-state="broken"`** (red, dashed, zero-height severed line) via `connectorState()`; **rejected SOFT gate does NOT break** the connector (it follows the active front, toned warning). A passed hard gate keeps the line intact. All three paths are asserted by dedicated specs (broken / not-broken / passed-intact).
- The gate-node click reuses the existing guarded task-detail path: `onGateClick` → `mostActionable(seg)` → `openTicket.emit` → parent `openDetail`. No new write path, no approvals inbox. `mostActionable` precedence (first rejected-gate ticket → first non-passed → first) matches §2.4.

### 3. ONLY in-pipeline tickets + end-caps — CORRECT
- No backlog/done/off-track CARDS are drawn in Pipeline mode (the old `backlog-bar`, `done-folder`, `off-track-lane` card-rendering blocks are deleted). Only the three end-cap reference tiles render: `pipeline-backlog-ref`, `pipeline-done-ref`, `pipeline-offtrack-ref`, each a `<button>` → `selectWorklist` → `selectMode('worklist')`, carrying the count, absent-not-zero (backlog/off-track omitted at 0). No duplication. Specs assert no `card-BK-1`/`card-DN-1`/`card-OFF-1` and the counts on the tiles.

### 4. Honest empty states — CORRECT
- State A (`middleEmpty()`): the chain still renders as an idle pending-path preview (`data-density="idle"`), plus the reused `rail-middle-empty` copy + `pipeline-to-worklist` escape + the end-cap counts. Never a void.
- State B (`isEmpty()`): Pipeline is suppressed entirely by the parent board's existing `board-empty` guard — `pipeline-chain`/`pipeline-flow` absent. Spec asserts both.
- State C: auto-default + persisted manual choice live in the unchanged parent (`populatedStageCount >= 2`); the pipeline component does not touch mode persistence.

### 5. Dwell-time — CORRECT and honest
- `enteredCurrentStageAt(ticket)` takes the newest `kind:'advance'` comment that moved the ticket TO its current stage. **Adaptation note (sound):** the spec text assumed a `comment.stage` field, but `TicketComment` has no `stage` field — it carries `body`. The engine writes advances as ``body: `stage → ${toStage}` `` (hub/lib/api.js:101,307); the helper parses that exact format via `/stage\s*(?:→|->)\s*(.+)\s*$/`. Derivation matches the real write format and returns `null` when unparseable/absent — honest omission, no fabricated timestamp.
- `dwellSince` returns `null` below a 1-day threshold, `null` for NaN/unknown, and `null` for a **future** anchor (clock skew is not dwell). Label is whole days ("5d"). The stage chip (`stage-dwell-<stage>`) shows the longest in-stage dwell, omitted when unknown. Matches build-spec §6 ("stuck Nd").

### 6. No regressions — CONFIRMED
- WORKLIST mode and `tasks-worklist.component.ts` are byte-untouched; all worklist testids stay green (562/562).
- `board.ts` is **purely additive**: `partitionBoard` / `cardVisualStatus` / `activeSegmentIndex` / worklist-bands / needs-you parity are unchanged; the new helpers only *call* `cardVisualStatus`, never modify it. `stageNodeStatus` correctly inherits the rejected-hard-gate → `needs-you` → `blocked` reduction already encoded in `ticketNeedsYou`, so the "tickets + gate" reduction in §1.3 is honoured without re-implementing precedence.
- Every advance/gate action remains the guarded CAS write owned by the parent; the pipeline component introduces NO write path (it emits `selectWorklist` / `openTicket` only). Status stays read-only.
- No `[innerHTML]`: all untrusted text (stage, owner, gate name, title) is interpolated. The XSS spec injects `<img onerror>` as a stage/owner name and asserts no `<img>` element and the literal text present. `no-unsafe-binding` + `no-tofu-glyphs` specs pass.
- Reduced-motion via `--kb-*` tokens preserved on the host; the pipeline reuses the shared `card-arrive` keyframe through `#cardTpl`. The unused `--rail-compact-gap` token was correctly removed with the rail.
- Retired pipeline testids (`pipeline-train`, `pipeline-rail`, `backlog-bar`, `done-folder*`, `off-track-lane`, `rail-node-*`, `column-stage-*`, `data-adaptive`, etc.) are gone from both source and specs. No e2e references them (the `pipeline-train → pipeline-chain` rename has no stale e2e coupling). The stray `rail-node-` hit is in the unrelated `workflow-builder.component.ts`.

### 7. Facts-only / self-describing — CLEAN
Grep of the changed source (`tasks-pipeline.component.ts`, `board.ts`) for ticket IDs (`ADT-\d+`), persona names, condition codes (`C1`/`D4`), and sprint refs: **none found in source**. Doc-comments state facts only (behaviour/params/returns). Identifiers are self-describing (`stageNodeStatus`, `connectorState`, `mostActionable`, `enteredCurrentStageAt`). Ticket IDs appear only in spec fixtures as test data, which is correct.

## Re-run results (not trusted from claims)

- `npm test` → **562 passed / 562 (35 files)**. Matches the expected ~562 (worklist + pipeline + shared). `no-tofu-glyphs` and `no-unsafe-binding` green.
- `npm run build` → **succeeds**. The only budget WARNING is `workflow-builder.component.ts` (9.21kB) — a pre-existing component NOT in this change set, and below the 12kB component-style **error** threshold. The new pipeline component's styles are under the 6kB warning budget (no warning emitted for it).

## Findings

- **NIT (optional, non-blocking):** `tasks-pipeline.component.spec.ts` exercises the chain through the parent `TasksBoardComponent` rather than mounting `TasksPipelineComponent` directly. This is a reasonable integration-style choice (it proves the real wiring, the `#cardTpl` projection, and the drill-in round-trip end-to-end) and the pure helpers are unit-tested directly in `board.spec.ts`, so coverage is complete. No change required.

## Review assumptions stated

- I verified the AC itself is sound against the binding spec; the only divergence (dwell anchor reading `comment.body` not a non-existent `comment.stage`) is a correct adaptation to the real model and the real engine write format.
- I could not exercise live SSE re-projection or in-app visual rendering from unit tests; that is VERIFIED's remit (final audit on the production build, served same-origin). Unit + DOM contract coverage for every AC is present and green.
- Adjacent unreviewed: the `backend-developer/SKILL.md` edit is out of ADT-245 scope and benign.

## Decision

**APPROVED — CODE_REVIEWED = passed.** Spec-correct on the gate-break-red honesty, only-in-pipeline + end-cap counts, the horizontal-header fix, and the honest empty states; no regression to the Worklist, partition, or the guarded CAS writes; facts-only grep clean; 562/562 tests green; build succeeds under the 12kB component error budget.
