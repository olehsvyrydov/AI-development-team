# Code Review — ADT-244 (needs-you-first Tasks Worklist + Pipeline mode)

**Reviewer:** /rev · Senior Full-Stack Code Reviewer
**Ticket:** ADT-244 · **Branch:** `feat/dart-tasks-worklist` · **Date:** 2026-06-13
**Gate owned:** `CODE_REVIEWED` (hard, standard track)
**Verdict:** **APPROVED** — clean, nits/one WARNING only; no BLOCKING findings.

Binding spec: `BUILD-SPEC.md` (+ `DECISIONS.md`, `jorge-arch.md`). Canonical predicate: `hub/lib/state.js` `needsHumanDecision`.

---

## Scope reviewed (uncommitted change set)

| File | Nature |
|---|---|
| `shell/tasks-worklist.component.ts` (new) | Worklist centre: bands, auto-fill grid, roving keys, reason line |
| `shell/tasks-board.component.ts` | Host: mode signal, radiogroup toggle, persistence, auto-default, card template `reason` ctx |
| `shell/board.ts` | `ticketNeedsYou` parity fix; `needsYouReason`; `worklistBands` (disjoint claim); `populatedStageCount` |
| `core/models.ts` | `TicketView.active?: boolean` added |
| `shell/board.spec.ts`, `shell/tasks-board.component.spec.ts` | parity, disjointness, mode, persistence, guarded-write, a11y tests |
| `shell/project-shell.component.spec.ts` | asserts card render under default worklist view |
| `testing/no-tofu-glyphs.spec.ts` | allow-list `→` and `×` |
| `claude/skills/.../backend-developer/SKILL.md` | unrelated FQN-style doc refinement (out of FE scope) |

---

## 1. Spec correctness (BUILD-SPEC.md) — PASS

- **Worklist is the DEFAULT centre, never a void.** `effectiveMode()` = `chosenMode() ?? autoMode()`; `autoMode()` returns `worklist` unless ≥2 stages populated (`board.ts populatedStageCount`). Worklist renders real ticket cards in `repeat(auto-fill, minmax(16rem,1fr))` (`tasks-worklist.component.ts` `.band__cards`) on a `container-type: inline-size` root → reflows to the board's own width, no horizontal scroll. The grid rule matches §1.3 byte-for-byte; asserted by the CSS-contract test.
- **Bands + order + absent-not-zero.** `worklistBands` emits Needs-you → In-flight → Backlog → Recently-done → Off-track and `.filter(b => b.tickets.length > 0)` drops empty bands. Needs-you is first, `band--needs-you` carries the warning accent (heading colour + warning card border). Recently-done is collapsed by default (`doneExpanded=false`), capped at `RECENTLY_DONE_CAP=6` via `visibleTickets`, with a `recently-done-expand` button labelled `see all in Done →`. Off-track keeps the existing why/reassure lines. Reading order verified by component + unit tests.
- **Toggle.** `view-mode-switch` is `role="radiogroup"` with two `role="radio"` options, `aria-checked`/`data-active`/roving `tabindex`, arrow-key roving (`onSwitchKeydown`), live announce `Worklist view` / `Pipeline view`. Suppressed when `isEmpty()` (test asserts switch absent on empty board).
- **Persistence + auto-default.** Per-project key `dart.tasks.viewMode.{project}` (`_global` fallback), seeded once per project via an `effect` keyed on `persistKeyLoaded` so a live SSE push never re-reads/re-collapses the choice (D-3 / Apex §3.3). Defensive `try/catch` + `typeof localStorage === 'undefined'` guards on read and write; failure falls back to auto-default without throwing — covered by a test that makes the `localStorage` getter throw.
- **Pipeline reuse.** The entire `.train` block is preserved verbatim inside `@case ('pipeline')`; the only additions are a `pipeline-to-worklist` escape button inside the existing `rail-middle-empty` idle line. All KEEP testids remain; the full suite (incl. the pipeline/train/rail/done-folder/off-track tests) stays green.

**WARNING — stage-as-chip on In-flight not implemented (§1.4).** BUILD-SPEC §1.4 calls for a quiet `stage: {t.stage}` chip on In-flight cards so dropping stage columns "loses no information" (Anna M4). The shared `#cardTpl` renders status/gate/needs-you/**label** chips (the label chips do carry the "why-routed" routing reason, satisfying the ledger AC "why it routed there"), but it does not render the literal stage chip. Impact is low: stage remains visible in the detail modal, §1.4 itself labels this "NEW-but-trivial," and the ledger ACs do not require a stage chip. Not BLOCKING. Recommend a fast-follow to add the interpolated `stage:` chip (or an explicit decision to rely on the routing-label chip), so the spec and build agree.

---

## 2. R1 DISJOINTNESS (the live bug just fixed) — PASS, genuinely asserted

`worklistBands` runs a single ordered claim with a shared `claimed` Set: Needs-you (canonical `ticketNeedsYou`) → In-flight → Backlog → Recently-done → Off-track; each step skips anything already claimed. **In-flight = `status === 'in_progress' AND midPipeline.has(t)`**, where `midPipeline` is built from `partition.columns` — which by construction excludes the `backlog` holding pen, the done folder, and off-track. So a backlog-stage `in_progress` ticket is NOT in any rail column → fails the In-flight test → lands in Backlog. A done- or off-track-staged `in_progress` ticket routes to Recently-done / Off-track respectively. Confirmed by reading `partitionBoard` (columns exclude backlog/done; off-track is set-differenced out).

The disjointness test is real, not theatre:
- `new Set(ids).size === ids.length` → **no id appears in two bands**.
- `Σ band.tickets.length === tickets.length` → **no overlap and nothing dropped** (the sum check).
- Targeted assertions: a waiting backlog ticket that needs you is in Needs-you NOT Backlog; `BQ` (backlog-stage in_progress) is in Backlog NOT In-flight; `MP` is the only In-flight ticket; all-backlog/done project → In-flight band absent, ids unique, count preserved.

Both invariants (no-double-membership AND the sum) are asserted in two separate describes. This is the correct, non-hand-wavy proof of R1.

---

## 3. needs-you PARITY (the critical fix) — PASS

`board.ts ticketNeedsYou` now returns `hard-rejected gate` **OR** `status === 'waiting' && !!expectedOwner && !active` — byte-for-byte the hub `needsHumanDecision` (`hub/lib/state.js:463-468`). I diffed the two predicates line-by-line: identical logic and operand order.

- The parity test replicates the hub predicate as `hubNeedsHumanDecision` and asserts `ticketNeedsYou(t) === hubNeedsHumanDecision(t)` across the four representative classes (rejected-hard-gate, passed-hard-gate, rejected-soft-gate, waiting+owner+!active, waiting+owner+active, waiting+no-owner, in_progress, done). Genuine equality assertion, not a tautology.
- DOM parity test: the Needs-you band's `li.card` count equals `taskSummary.byStatus.needsYou` AND the roll-up `{N} need you` text — the band, the chip, and the count agree on one set.
- Note for maintenance: the FE test hard-codes a copy of the hub predicate. If the hub predicate ever changes, this FE copy must be updated in lock-step (a `FYI` — the cross-language duplication is the cost of there being no shared module across the hub/Angular boundary; acceptable here).

---

## 4. Guarded writes preserved — PASS

The single `#cardTpl` (with `card-menu` → `menu-advance` → `advance(t, to)`) is projected verbatim into every worklist band via `[cardTemplate]="cardTpl"`. The worklist component owns only band scaffolding + roving keys and **introduces no write path** — it has no `ControlPlaneService` injection and no mutation. `status` is read-only everywhere (no band/mode writes it). The guarded-write test clicks a worklist card's `menu-advance` and asserts the request hits `/api/ticket/advance` with `WRITE_GUARD_HEADER === '1'` and `expectedRev` round-tripped — i.e. the existing CAS control-plane write, 409-capable, unchanged. No new endpoint; switching modes is client-side regroup only (`@switch (effectiveMode())`).

---

## 5. A11y + honesty — PASS

- **Radiogroup:** `role="radiogroup"` + two `role="radio"`, `aria-checked`, roving `tabindex`, arrow roving, live announce. Active state by **fill (`data-active`) + the checked semantic**, not hue alone; 2px focus ring.
- **Bands:** each is a `<section>` with `<h3>` + `aria-label`; card grid is `role="list"` of `role="listitem"`. Within-band roving via `←/→/↑/↓` (`onCardKeydown`), Tab crosses bands. Glyph+text on every band heading, reason line, and chip — never colour-only.
- **Reduced motion / tokens:** styles use `--kb-*` tokens only (no raw hex/hsl); motion is host-attribute driven (existing `card-arrive`), zeroed under reduced-motion.
- **No `[innerHTML]`:** the only occurrences of the word are doc-comments asserting interpolation-only. `no-unsafe-binding` green. Untrusted text (id/title/stage/owner/reason) reaches the DOM via interpolation.
- **Honest microcopy / absent-not-zero:** no `(0)` header possible (empty bands filtered out); all-clear test proves the Needs-you band AND roll-up chip are both absent with zero needs-you and no `0 need you` text; reason strings are factual (`{owner} approval pending`, `looped {N}× — needs you`, `blocked: a gate needs your decision`), no fake urgency/apology. Recently-done is honestly labelled (best-effort `comments[0].ts` proxy, no fabricated "moved 2h ago"), `lastActivityAt` correctly NOT added (out of v1 scope).

---

## 6. Facts-only / self-describing — PASS

Grep over the changed **production** source (`tasks-worklist.component.ts`, `board.ts`, `tasks-board.component.ts`, `models.ts`) for ticket IDs / persona names / condition codes / sprint refs: **clean** — no `ADT-###`, no `C#/D#`, no persona names, no `aura-ui`/`jorge-arch`, no sprint references. Role tokens (`/arch` etc.) appear only as runtime data (`expectedOwner` values, microcopy interpolation), never baked literals. Doc-comments state facts (behaviour/derivation), not process. Identifiers are self-describing (`worklistBands`, `populatedStageCount`, `needsYouReason`, `chosenMode`, `autoMode`, `effectiveMode`).

**Tofu allow-list (`→`, `×`):** justified. Both are carried by ratified microcopy (`see all in Done →`, `looped 3× — needs you`), are broadly font-supported, and are NOT in the fragile tofu set the scan guards (`＋ ◧ ‹ › ▯` stay forbidden). The allow-list addition does not hide any real tofu — `no-tofu-glyphs` re-run green.

---

## Re-run results (not trusting claims)

- `npm test` → **34 files, 529 passed** (matches the expected ~529). `no-tofu-glyphs` + `no-unsafe-binding` re-run in isolation: **6/6 passed**.
- `npm run build` → **succeeds**. Style-budget **WARNING** on `tasks-board.component.ts` (11.06 kB; budget 6 kB) — **acceptable** under the 12 kB error threshold, as stipulated. A second pre-existing warning on `workflow-builder.component.ts` is unrelated to this change.

---

## Findings summary

| Severity | Finding |
|---|---|
| BLOCKING | none |
| WARNING | §1.4 stage-as-chip on In-flight cards not implemented; routing-label chips partially cover it. Fast-follow recommended. |
| FYI | FE parity test duplicates the hub predicate (no shared cross-boundary module); keep the two in lock-step on any future hub change. |
| FYI | Backend `SKILL.md` FQN-style edit is unrelated to ADT-244 (a separate doc refinement); harmless, out of this gate's scope. |

## Review assumptions

- I verified the ACs themselves are sound against the user-ratified investigation; no premise concerns.
- Could not verify live in-app behaviour on the production build served same-origin — that is the `VERIFIED` (hard) gate's job, not re-run here.
- Adjacent code not re-reviewed: the unchanged `.train`/`partitionBoard` internals (relied on as a stable substrate; their existing tests stay green).

**Gate decision: `CODE_REVIEWED` = passed.**
