# Code Review — Tasks Pipeline Board (ADT-232)

**Reviewer:** `/rev` (Senior Full-Stack Code Reviewer) · **Gate:** `CODE_REVIEWED`
**Ticket:** ADT-232 — Tasks pipeline board (+ backlog-predicate broadening & card-declutter refinements)
**Sprint:** sprint-05-cockpit-polish · **Branch:** feat/dart-tasks-pipeline
**Review date:** 2026-06-09
**Verdict: APPROVED — PASS.** No BLOCKING findings. Two NITs (non-blocking, noted below).

---

## Scope reviewed (uncommitted change set, this branch)

| File | Δ | Role |
|---|---|---|
| `studio/cockpit/src/app/shell/board.ts` | +133 | Backlog predicate, single-pass partitioning, done-stage/active-segment, compact gate summary |
| `studio/cockpit/src/app/shell/tasks-board.component.ts` | +344/−88 | Pipeline layout: backlog bar, rail+nodes, done folder, off-track lane, advance, a11y, motion |
| `studio/cockpit/src/app/shell/glyph.component.ts` | +22 | New inline-SVG glyphs `stack`, `folder-stack` |
| `studio/cockpit/src/app/shell/board.spec.ts` | +196 | Unit tests for the projection functions |
| `studio/cockpit/src/app/shell/tasks-board.component.spec.ts` | +229 | Component + R1 disjointness/parity tests |

No backend files touched — consistent with the ARCH verdict (PURE FRONTEND re-projection).

---

## 1. Architecture compliance (arch-tasks-pipeline.md)

| /arch decision | Implementation | Status |
|---|---|---|
| Backlog predicate = stage-based, pure FE (§1) | `isBacklog()` over `ticket.stage`; `backlogTickets()` filter | COMPLIANT |
| Backlog claims its set FIRST; columns/off-track exclude by set-difference (R1) | `stageColumns` and `offTrackGroups` both guard on `!isBacklog(t)` | COMPLIANT |
| Literal `backlog` first stage → bar REPLACES the column (no empty ghost) | `stageColumns` filters out the literal `backlog` stage | COMPLIANT |
| Done = done stage, collapsed folder, pure FE (§2) | `doneStage()` (done-name-first, else last) = `partition().doneStage`; `doneTickets` computed; folder rendered unconditionally with live count | COMPLIANT |
| Header needs-you/activity roll-up reduces over loaded tickets, no N+1 (§3) | `needsYouCount` prefers canonical `taskSummary.byStatus.needsYou`, falling back to the `ticketNeedsYou(t)` reduction over in-memory `tickets()`; `totalTasks` prefers `taskSummary.total` | COMPLIANT |
| Off-track = existing set-difference, unchanged (§4) | `offTrackGroups()` preserved; only the `isBacklog` exclusion added | COMPLIANT |
| Advance = existing routed `ticket/advance` + expectedRev + inline 409, no drag (§0/§5) | `advance()` posts `{id,toStage,expectedRev,by}`; conflict → inline alert + retry | COMPLIANT |
| `[+ idea]` is an inert "soon" control, not a dead live button (§1) | `disabled` + `aria-disabled="true"` + title; no href, no handler | COMPLIANT |
| Interpolation-only, no `[innerHTML]` (§6) | All untrusted text interpolated; XSS specs prove escaping | COMPLIANT |
| No new SECOPS surface (§6) | No new route/input/network/persistence — confirmed in diff | COMPLIANT (gate correctly not recorded) |

**Refinement check — broadened Backlog predicate.** The refinement widened `isBacklog` from `{unset, backlog}` to also include pre-start lifecycle tokens `{ready, todo, new, triage, unstarted, icebox}` (case-insensitive), via the exported `PRE_START_STAGES` set. **This is sensible and well-motivated:** a project's own intake lifecycle need not match the workflow's stage tokens, and an un-started ticket surfacing in the warning-toned *off-track* lane reads as an error. The doc-comment states the *why* (facts-only, no process refs). The change is consistent with arch §0/§1 (predicate is stage-derived, degrades gracefully) and R2 (degrades to "no backlog bar" when a track names none of these).

## 2. R1 DISJOINTNESS invariant — VERIFIED

The invariant ("every ticket renders in EXACTLY ONE of {Backlog, a stage column, the done folder, off-track}") is **genuinely enforced by construction**, not merely asserted:

- **Backlog** claims `isBacklog(t)` tickets first.
- **Stage columns** (the rendered `columns` from `partitionBoard`) place only `!isBacklog(t) && ticketStage(t) === s.stage` → cannot overlap Backlog; distinct stage match → cannot overlap each other; the done stage (`doneStage()`, done-name-first else last) is stripped out of `columns`.
- **Done folder** = the done stage's tickets (same `!isBacklog` guard) → disjoint from Backlog and from the rendered stage columns.
- **Off-track** (`offTrackGroups`) `continue`s on both `isBacklog(t)` and `inTrack.has(stage)` → disjoint from Backlog and from every real stage column/done.

Because the broadened `isBacklog` is applied as the single source-of-truth guard in **all three** partition functions, widening it cannot break disjointness — a newly-claimed token is simultaneously removed from columns and off-track.

**Parity test is real and mixed.** `tasks-board.component.spec.ts` → "DISJOINTNESS (R1)" mounts `MIXED_STATE` covering every region: `B-1` (unstaged), `B-2` (`backlog`-staged), `M-1` (mid-stage `vision`), `M-2` (`architecture`, rejected hard gate, routing label), `D-1` (done stage), `O-1` (orphan `gone-stage` → off-track). It asserts each ticket appears in exactly one region **and** that every ticket renders exactly once across the whole board (no orphan, no duplicate). The `ready→Backlog` vs `superseded→off-track` parity is additionally proven at the unit level in `board.spec.ts` ("excludes a pre-start ticket … yet keeps a genuine orphan").

## 3. Card declutter (compact gate summary) — VERIFIED

- `cardGateSummary()` returns **at most one** chip: the governing current-stage gate when unmet (so a blocked card shows *why*), else a `passed/total` roll-up, else `null`. Tests assert exactly one `chip-gate` even with 4 gates, and that the unmet governing gate (SECOPS rejected) wins. Shape/tone/text mirror the per-gate chip (colour is never the only signal).
- Status / needs-you / route-label chips present and tested; status falls back to a neutral waiting chip (never blank).
- Advance is the routed action with inline 409 + retry; "no further stage" handled.
- Escaping: card title, stage name, owner, off-track label, and project cue are all interpolation-only — five XSS specs prove no `<img>` is created and the raw text survives. No `[innerHTML]`; the repo-wide `no-unsafe-binding` guard spec stays green.
- a11y: rail keyboard nav (←/→ roving focus, tested), `aria-live="polite"` board-update region (tested), done-folder button `aria-expanded` toggling (tested), `role`/`aria-label` on columns, focus-visible outlines, `scroll-margin` reserved.
- Reduced-motion: a single `data-motion` host attribute mirrored from `prefers-reduced-motion`, motion tokens zeroed under the media query, `card-arrive` animation disabled under reduce (tested).
- No-tofu: the new glyphs (`stack`, `folder-stack`) are inline SVG with `currentColor` — no Unicode tofu risk; `no-tofu-glyphs` guard green.

---

## Findings

### BLOCKING
None.

### WARNING
None.

### NIT (non-blocking — `/fe` may address in a follow-up)

- **NIT-1 — dead glyph `tag` (resolved).** An earlier draft added an unused `'tag'` glyph to `GLYPH_NAMES`; it was removed as dead code. The glyphs that ship are `stack` (roll-ups) and `folder-stack` (the done stack), both consumed and correct. Label chips use `name="label"`.
  *File:* `studio/cockpit/src/app/shell/glyph.component.ts`.

- **NIT-2 — empty ghost column for a pre-start-named *workflow* stage (theoretical).** `stageColumns` strips only the literal `backlog` stage from the rail, but `isBacklog` now claims the wider `PRE_START_STAGES` set. If a track were ever defined with a stage literally named `ready`/`triage`/`todo`/etc., that stage would still render a (permanently empty) column on the rail while its tickets sit in the Backlog bar — disjointness still holds (no double-placement), but an empty ghost column would show. **Not a real risk today:** none of the shipped `workflow.yaml` tracks name a stage with a pre-start token (verified). If the predicate is meant to fully own these tokens, `stageColumns`' filter could exclude `PRE_START_STAGES` rather than only `BACKLOG_STAGE` for symmetry. Recording as a NIT, not a blocker, because it cannot occur with current data.

### PRAISE
- Disjointness is enforced through a single shared `isBacklog` guard reused by all three partition functions — widening the predicate is provably safe, and the parity test pins it. This is the right shape for the R1 invariant.
- Doc-comments state facts and the non-obvious *why* (e.g. why pre-start tokens belong in Backlog, why the active-segment accent never carries status alone) without any process artifacts.

---

## Facts-only / self-describing grep — CLEAN

Scanned the changed source (`board.ts`, `tasks-board.component.ts`, `glyph.component.ts`) for process artifacts:
- Ticket IDs (`ADT-\d`, `LJ-\d`), condition codes (`C-1`/`N-1`/`D4`), persona/agent names (Aura, Apex, Jorge, Finn, `/rev`…), sprint/phase refs → **none in source.**
- The `ADT-1`..`ADT-9` literals appear **only in spec fixtures** as sample ticket *data* (not process references) — correct.
- New doc-comments are facts-only and self-describing; no narration comments restating the next line.

---

## Re-run evidence (independently re-run, not trusted from claims)

- **Unit tests:** `cd studio/cockpit && npm test` → **30 files, 355 tests passed** (matches the expected ~355). Includes the R1 disjointness/parity test, compact-gate, XSS-escaping, keyboard-nav, aria-live, done-folder, reduced-motion, and the repo-wide `no-unsafe-binding` + `no-tofu-glyphs` guard specs.
- **Production build:** `npm run build` → **Application bundle generation complete, exit 0.** The `tasks-board.component.ts` style-budget overage is a **`[WARNING]`** (8.29 kB vs 6 kB budget, +2.29 kB), **not** a `[ERROR]` — acceptable per the ticket. (A second pre-existing `[WARNING]` on `workflow-builder.component.ts` is out of scope for ADT-232.)
- E2E/Playwright intentionally not run (a live hub holds :4477); unit + build coverage is sufficient for this gate.

## Review assumptions / limits
- Reviewed against the binding ADR and the redesign/usability vision docs; assumed the AC themselves (Backlog as pre-start holding pen, done-stage folder) are sound — they are internally consistent and match the arch model.
- Could not verify live SSE re-layout against a running hub from unit tests alone; the "re-lays out columns live" spec exercises the input-driven path, which is the same code path the shell drives on push.

---

## Gate decision
`CODE_REVIEWED = passed` for ADT-232 (by `/rev`). Nits-only; no changes required to pass. NIT-1 (dead `tag` glyph) and NIT-2 (theoretical ghost column) are recorded for an optional `/fe` follow-up. Hand off to `/qa` + `/e2e`, then `/verify`.
