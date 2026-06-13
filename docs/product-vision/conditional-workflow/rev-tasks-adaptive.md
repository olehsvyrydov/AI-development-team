# Code Review — Adaptive Tasks-board "train" layout (compact stations + expanded columns)

**Reviewer:** /rev (Senior Full-Stack Code Reviewer)
**Date:** 2026-06-13
**Branch:** `feat/dart-tasks-adaptive`
**Ticket:** ADT-226 (stage-aligned Tasks board)
**Change set (uncommitted):**
- `studio/cockpit/src/app/shell/tasks-board.component.ts` (template + CSS + two computeds/method)
- `studio/cockpit/src/app/shell/tasks-board.component.spec.ts` (+157 lines, new adaptive-train describe block)
- `claude/skills/development/backend/java/backend-developer/SKILL.md` — **out of scope** (unrelated FQN-style wording edit; not part of this feature, not reviewed here, no objection)

**Spec reviewed against:** `docs/product-vision/conditional-workflow/tasks-adaptive-aura.md`

**Verdict: APPROVED — `CODE_REVIEWED` PASS.** No BLOCKING findings. Two NITs / FYIs and one non-blocking UX opinion below.

---

## 1. Correctness vs the spec

| Spec requirement | Implementation | Status |
|---|---|---|
| Empty stage → compact station: `data-state="compact"`, ~2.5rem, node + name + `0`, no card list | `[attr.data-state]="col.tickets.length ? 'expanded' : 'compact'"`; `.col[data-state='compact'] { flex:0 0 auto; width:2.5rem; min-width:2.5rem }`; `.col__cards` only rendered under `@if (col.tickets.length)` | COMPLIANT |
| Populated stage → expanded column: `data-state="expanded"`, cards | `.col[data-state='expanded'] { flex:1 1 14rem; min-width:13rem; max-width:24rem }`; cards under the `@if` branch | COMPLIANT |
| The connecting track line | `<span class="rail__track" aria-hidden="true">` + `.rail__track { position:absolute; left:0; right:0; top:0.65rem; height:1.5px; background:var(--kb-border); z-index:0 }`; `.col` raised to `z-index:1` | COMPLIANT (implemented as a real element rather than `::before`, which is fine and is one of the spec's offered options) |
| Backlog 13rem | `.backlog { width:13rem; min-width:13rem; max-width:13rem }` (was 12) | COMPLIANT |
| `@container` responsive: off-track drops below at medium, stacks at narrow | `container-type: inline-size; container-name: board` on `.train`; `@container board (max-width:1099px)` moves off-track to `order:99`, full width; `@container board (max-width:719px)` stacks backlog/rail/done, expanded col → full width | COMPLIANT |
| Empty-middle honest line: shown only when middle empty AND work in backlog/done/off-track; absent on whole-board-empty and when a middle stage has work | `middleEmpty()` computed: `if (isEmpty()) return false; allStagesIdle && workElsewhere` | COMPLIANT — all four branches verified by tests |
| `board.ts` projection UNCHANGED (presentational only) | `git status` shows only the component + its spec changed; `board.ts` untouched. `middleEmpty()` composes existing computeds (`isEmpty/columns/backlog/doneTickets/offTrack`) | COMPLIANT |
| Advance stays the guarded write | `advance()` untouched — still `cp.advance({…, expectedRev, by})` with 409/conflict handling | COMPLIANT |

`middleEmpty()` logic is correct and precise (absent-not-zero): whole-board-empty defers to `board-empty`; a populated middle stage suppresses it; "stages idle but nothing anywhere" also suppresses it (teaches only when work waits elsewhere).

**Deviation from spec §8 (documented here, accepted):** the spec's `.rail` CSS is a single-line train (`overflow-x:auto`, no wrap). The implementation adds `flex-wrap: wrap` to `.rail`. This is a deliberate, sound choice — it lets the `.rail__idle` calm-middle line (`flex: 1 1 100%`) drop onto its own row beneath the stations. The side effect (compact stations may wrap to a 2nd row when many stations are present) is discussed as a UX opinion in §6 below. It does not break any contract and is presentational only.

---

## 2. Stable test contract (spec §9) — preserved

| Contract | Status |
|---|---|
| `column-stage-{stage}` renders for empty AND populated | KEPT — single `@for` over `columns()`; `data-testid` unconditional |
| `column-count` shows the real count incl `0` | KEPT — `{{ col.tickets.length }}` rendered in both states |
| `column-empty-{stage}` present in an empty stage's body | KEPT — moved into the `@else` branch as a visually-hidden `<p>` (clip pattern), still in the DOM for AT + tests |
| `rail-node-{stage}` keeps `data-node` / `data-active` | KEPT — header node untouched; `nodeKind()` / `activeSegment()` unchanged |
| Four-region order `[backlog][rail][done][off-track]` | KEPT — direct children of `.train` unchanged; new test asserts the order |
| Roving `←/→` traverses ALL stations incl compact | KEPT — `onColumnKeydown` walks `[data-col-index]`, present on every `.col`; new test focuses two compact stations and asserts ←/→ moves between them |

**Full suite re-run (not just the new tests): 34 files / 485 tests passed.** No existing tasks-board test regressed. The change is additive: it adds `data-state` and `rail-middle-empty`, removes nothing.

---

## 3. Accessibility (WCAG 2.2 AA)

- **Compact-station accessible name:** `[attr.aria-label]="stationLabel(col)"` → `"Stage {stage}, {n} tasks{, owner}{, empty}"` on the `role="listitem"` section. An AT user hears a thin station as an empty stage with its owner and count — parity with the visual node + `0`. COMPLIANT (§7).
- **Glyph + text, not color-only:** node *shape* (dot / solid diamond / dashed diamond / terminal rect) carries gate hardness via inline SVG; count + stage name carry state as text. The active accent only reinforces. COMPLIANT.
- **Reduced motion via `--kb-*`:** `@media (prefers-reduced-motion: reduce)` zeroes `--kb-dur-*` in one place (line 286); the new `.rail__node` transition reads `--kb-dur-base`, so it becomes an instant swap. Card arrival animation also disabled. COMPLIANT.
- **No `[innerHTML]`; untrusted text interpolated only:** stage / owner / count / label all interpolated or bound via `[attr.aria-label]` to a plain string. `no-unsafe-binding` green. COMPLIANT.
- **No tofu:** all glyphs resolve to `dart-glyph` names; node SVGs are inline. `no-tofu-glyphs` green. COMPLIANT.

FYI (non-blocking): the calm-middle `<p>` is correctly *not* `aria-live` (§6.2 wants it silent — it's a steady state, not a change announcement). Good.

---

## 4. Facts-only / self-describing — CLEAN

Grep of the production source (`tasks-board.component.ts`) for ticket IDs, sprint refs, persona names, and condition codes: **no matches.** All comments are genuine non-obvious *why* notes (track-line purpose, compact-collapse rationale, the `--kb-dur` zeroing, container-query rationale, the absent-not-zero rule on `middleEmpty`). The Javadoc-style doc-comments on `middleEmpty` and `stationLabel` state behaviour/contract only. Agent strings in the **spec file** are legitimate test fixture data (workflow owners `/po`, `/secops`, …), not process artifacts.

---

## 5. Test & build results

- `npm test` → **34 files / 485 passed** (matches the expected ~485).
- `npm run build` → **succeeds.** Two `anyComponentStyle` budget WARNINGs (`workflow-builder` 9.21 kB, `tasks-board` 9.91 kB). Budget: `maximumWarning: 6 kB`, `maximumError: 12 kB`. tasks-board at 9.91 kB is **under the 12 kB error threshold** → WARNING only, build passes. Acceptable per scope.
- `no-tofu-glyphs` + `no-unsafe-binding` → **6 tests passed, green.**

---

## Findings by severity

**BLOCKING:** none.

**WARNING:** none.

**NIT / FYI:**
1. **FYI — component-style budget headroom.** `tasks-board.component.ts` styles are now 9.91 kB, ~2 kB under the 12 kB *error* threshold. The WARNING is acceptable now, but the remaining §5/§6 build-order items (hover-peek popover, click-to-expand, narrow-stack station strip) will add more CSS. If a future slice pushes this over 12 kB the build will *fail*, not warn. Consider, when those land, extracting the board styles to a `.scss` file or trimming. No action required for this change.
2. **NIT — `rotate: 180deg` vs `transform: rotate(180deg)`.** Compact stage name uses the individual `rotate` property (spec wrote `transform: rotate(180deg)`). Functionally equivalent on modern engines and consistent; no change needed.

---

## UX opinion (non-blocking) — the 2-row station wrap vs a single-line train

The implementation adds `flex-wrap: wrap` to `.rail` to let the calm-middle explainer sit on its own row. A consequence is that the **stations themselves can wrap to a second row** when many are present (the `full` track has ~11–12 stages), instead of the strict single-line "train" the spec's ASCII mocks depict.

My view: **acceptable for this slice; worth tightening later — non-blocking.**
- *Why it's fine now:* the whole point of the feature is that empties collapse to ~2.5rem, so for this project (most stages empty) 9–12 stations + the book-end panels fit one row comfortably — wrap rarely triggers. When it does (many stages simultaneously populated at a narrow width), a calm 2-row wrap is arguably *more* honest than a hidden horizontal scrollbar, and the track line + nodes still read as a pipeline.
- *Why to revisit:* the metro/"train" metaphor reads most clearly as one continuous line. A wrapped second row breaks the single `rail__track` line (the track is one absolutely-positioned span at `top: 0.65rem`, so a wrapped row has no track behind it). If a future slice wants the strict single-line train, prefer `flex-wrap: nowrap` on `.rail` + relocate the `.rail__idle` line out of the flex flow (e.g. a sibling under the rail, or absolutely positioned), letting `overflow-x: auto` own the genuinely-busy case as the spec intended.

This is a design-intent call for `/ui` (Aura) — flag it at the next design pass; it does not block this implementation.

---

## Review assumptions

- I verified the projection is unchanged via `git status`/diff (`board.ts` not in the change set) rather than re-deriving the partition logic.
- Layout behaviour (actual no-scroll at ≥1100px, the container-query breakpoints, the track-line vertical alignment) is asserted structurally by unit tests but **not visually verified** in a browser — JSDOM does not lay out fl/container queries. A visual check at the three breakpoints is appropriate for `/qa` / `/e2e`.
- The unrelated `backend-developer/SKILL.md` edit was not reviewed (out of this ticket's scope).
