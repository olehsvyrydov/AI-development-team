# Code Review — Visual-First Worklist (colour + progress bar + backlog collapse)

**Reviewer:** /rev (Senior Full-Stack Code Reviewer)
**Date:** 2026-06-13
**Branch:** `feat/dart-tasks-color`
**Gate:** `CODE_REVIEWED` (hard)
**Binding spec:** `docs/product-vision/conditional-workflow/tasks-redesign/visual-spec-aura.md`

## Verdict: APPROVED (nits only)

The change is a faithful, honest implementation of the Aura visual spec. Colour is additive, the
progress bar is honest, the prior PR's disjointness + needs-you parity + guarded-writes hold, and the
build stays under the 12 kB component-style error budget. No BLOCKING or WARNING findings. A small
number of NITs / FYIs are recorded below for the developer to consider; none gate the merge.

---

## Scope reviewed

- `studio/cockpit/src/app/shell/board.ts` (+ `board.spec.ts`) — `cardVisualStatus`, `worklistProgress`
- `studio/cockpit/src/app/shell/tasks-board.component.ts` (+ spec) — `data-status` hook, `cardStatus`, `worklistProgress` computed
- `studio/cockpit/src/app/shell/tasks-worklist.component.ts` — progress block, band host classes, backlog disclosure
- `studio/cockpit/src/styles/_tokens.scss` — five `--kb-*-soft` fills (both themes)
- `studio/cockpit/src/styles/_card-status.scss` (new, global) — edge/fill/pill paint + band headers
- `studio/cockpit/src/styles.scss` — `@use './styles/card-status'`

---

## 1. Colour correctness + honesty — PASS

- **`cardVisualStatus` precedence is exactly the spec's** (`needs-you → blocked → backlog → in-flight →
  done → waiting`), and it reuses the *same* predicates the bands claim with (`ticketNeedsYou`,
  `isBacklog`, raw `status`). Card colour therefore cannot drift from the band the card renders in —
  the disjointness guarantee re-used as a colour guarantee. `board.spec.ts` proves this with a
  band↔colour cross-check test (`the colour key matches the band a ticket lands in`).
- **The status→treatment map is correct:** done→green, in-flight→blue, needs-you→amber,
  blocked→red, backlog/waiting→neutral, all driven by `data-status` in `_card-status.scss`
  (lines 22-39). 4px coloured edge + soft tinted fill + filled coloured pill, per §2.1/§2.2.
- **Off-track red is owned by the band, not the card** (§2.4/§3.5). `.band--off-track .card[...]`
  (line 46-47) overrides the per-card paint to red. Specificity verified: the edge override
  (`.band--off-track .card[data-status][data-status]`, 0-3-1) appears *after* the per-status edge
  rules (0-3-1) so source-order wins; the pill override (0-3-2) outranks the per-status pill rule
  (0-2-1). A component test confirms the off-track card renders inside the red-owning band.
- **Honest colour** — amber/red appear only on real gate/owner conditions; a quiet board reads
  green/blue/neutral, never a fabricated all-clear or alarm-red. `cardVisualStatus`'s `waiting`
  fallback is neutral, not green.
- **Progress bar honesty — PASS.** `worklistProgress` partitions `total` into `done + inProgress +
  backlog` (backlog = the honest remainder `max(0, total − done − inProgress)`), so the three
  segments sum to total. `needsYou` is returned separately (the amber tick), never a segment — no
  double-count. `board.spec.ts` asserts the sum, all-done→100%, all-backlog→0%, rounding, and the
  empty-board `null` suppression. The component spec asserts the bar is suppressed on the empty board
  and that all-done renders only the `done` segment.

## 2. Colour is ADDITIVE, never colour-only — PASS

- The status pill markup (`tasks-board.component.ts:273`) is unchanged: `<dart-glyph> + {{ label }}`.
  `_card-status.scss` only adds `color`/`background`/`border` — it never removes the glyph or text.
- A dedicated guard test exists: *"the status pill is never colour-only — it still carries its glyph +
  text label"* asserts both the word ("in progress") and the glyph survive.
- The progress bar's `role="progressbar"` carries the meaning in `aria-valuenow` + a spoken
  `aria-label`; the bar itself is `aria-hidden`, and a real `worklist-progress-counts` text row
  repeats the numbers. A monochrome/screen-reader user loses zero information.
- **Contrast:** the soft fills are low-alpha `color-mix` washes (8–16%) over the surface, so
  `--kb-text`/`--kb-text-muted` body text stays >12:1. The in-flight pill text correctly uses the
  lighter `--kb-accent-hover` (#8AA0FF dark) rather than `--kb-accent`, per §2.2's contrast note;
  the token exists in both themes. The spec's per-pill ratio table (all ≥4.5:1) is the design
  authority; values were not independently re-measured at runtime (see Assumptions).

## 3. No regressions — PASS

- **Disjointness (R1):** `worklistBands` is unchanged; `cardVisualStatus` reuses its predicates rather
  than re-deriving, so one ticket → one band → one colour holds. The band-order test still passes.
- **Needs-you parity:** `ticketNeedsYou` untouched; needs-you still wins precedence in both the band
  partition and the colour key. The prior `.band--needs-you .card { border-color }` band-scoped
  override was correctly *removed* (it would now fight the per-card edge); needs-you cards still read
  amber via `data-status='needs-you'`.
- **Pipeline mode + testids:** `#cardTpl` is shared, so Pipeline cards also get `data-status` (a free
  consistent win) with no testid change. All 555 tests pass, including the pipeline suite.
- **Guarded control-plane writes / read-only status:** no write path added. `data-status` is a pure
  presentational attribute from a pure helper; status stays read-only. No `[innerHTML]` introduced
  (no-unsafe-binding spec green).
- **Reduced motion:** the only new motion is the disclosure caret rotation, correctly gated behind
  `@media (prefers-reduced-motion: no-preference)` and the `--kb-dur-fast` token. The progress bar is
  static (no transition added).

## 4. Build budget — PASS

- `npm run build` exits 0. `anyComponentStyle` budget is warning 6 kB / **error 12 kB**.
- `tasks-board.component.ts` styles = **11.06 kB** → a WARNING, comfortably under the 12 kB error.
  This is exactly why the heavy card-status paint lives in the GLOBAL `_card-status.scss` (it does not
  count against any component budget) — the spec's rationale, correctly executed.
- The other budget warning (`workflow-builder.component.ts`, 9.21 kB) is pre-existing and untouched
  by this change.

## 5. Facts-only / self-describing — PASS

- Grep of the changed *non-spec* source (`board.ts`, both components, both stylesheets) for ticket IDs,
  sprint refs, persona names, condition codes, `BUILD-SPEC`/`Apex`/`§` references: **zero hits.**
  The doc-comments state behaviour/contract facts only (the `cardVisualStatus`/`worklistProgress`
  JSDoc describes precedence and honesty rules, not process history).
- Identifiers are self-describing (`cardVisualStatus`, `worklistProgress`, `backlogExpanded`,
  `progressLabel`).
- **New tofu-allowlist glyph:** the backlog disclosure uses `name="caret"`, which is already in the
  glyph component's allowlist (`glyph.component.ts:38`) — no new glyph introduced, no-tofu-glyphs spec
  stays green.

---

## Findings

### NIT — summary-path `inProgress` vs the card/band derivation may disagree at the margin
`worklistProgress` (board.ts), when a `taskSummary` is present, takes `inProgress =
summary.byStatus.in_progress` **raw**, whereas the ticket-fallback path (and `cardVisualStatus`)
excludes `in_progress` tickets that are stage-`backlog` (`!isBacklog(...)`). So a ticket that is
`in_progress` but parked in the backlog stage would count as an *in-flight* bar segment yet render as a
*backlog*-coloured card. In practice the hub's canonical `byStatus` is the source of truth and this is
an unlikely edge, but the two code paths use slightly different definitions of "in progress". Consider
documenting that the summary path trusts the hub's bucket verbatim, or aligning the fallback to match.
Not blocking — the bar still sums to `total` honestly either way.

### NIT — `backlog` segment colour token fallback
`.progress__seg--backlog { background: var(--kb-neutral-soft, var(--kb-border)); }`. `--kb-neutral-soft`
is an 8% wash over the surface; as the "remaining track" fill it is intentionally barely-there, which
reads as near-empty track (matching §4.1's "empty track to fill"). Confirm with /ui that the remaining
segment is meant to be that faint against the `--kb-surface-muted` track rather than a slightly more
visible neutral — purely a visual-taste check, code is correct.

### FYI — double-attribute specificity hack is intentional and documented
`.card[data-status][data-status]` repeats the attribute selector to raise specificity above the card
component's emulated `.card` rule so the global edge/fill wins regardless of stylesheet injection
order. This is a known, legitimate technique and is clearly commented in `_card-status.scss`. No action.

### PRAISE — honesty + accessibility are tested, not just asserted in prose
The progress-bar honesty (segments sum to total, needs-you not a segment, all-done/all-backlog,
empty suppression) and the colour-not-only guard are backed by real tests in both `board.spec.ts` and
`tasks-board.component.spec.ts`. The band↔colour cross-check test is a strong guard against future
drift. This is exactly the right level of coverage for a "colour must stay honest" feature.

---

## Review assumptions / not independently verified

- **Pill contrast ratios** (§6.2 table) are taken from the spec; I verified the *mechanism* (low-alpha
  fills, lighter accent-hover for the in-flight pill, both-theme tokens) but did not compute the
  runtime `color-mix` output and measure each ratio. If a pixel-accurate contrast audit is required,
  that is a /ui design-QA step, not a code-review blocker.
- Visual layout/feel (prominence ladder, opacity de-emphasis) is asserted via class presence in tests;
  the actual rendered appearance is /ui's design-QA call.

## Test & build results
- `npm test` → **555 passed (34 files)**. Includes `no-tofu-glyphs` and `no-unsafe-binding` — green.
- `npm run build` → **exit 0**, no errors; two budget WARNINGS (tasks-board 11.06 kB, workflow-builder
  9.21 kB), both under the 12 kB error ceiling.

## Gate decision
**`CODE_REVIEWED` — PASS.** Nits only; safe to advance to QA/E2E.
