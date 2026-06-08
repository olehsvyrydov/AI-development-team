# Sprint 05 — Cockpit Polish

The cockpit's three core surfaces get a visual + comprehension redesign over the **existing** per-project state — no new engine, no new persistence. The pass is led by `/aura` (visual/interaction/motion) and `/apex` (mental model/microcopy); `/arch` confirms the small data-model questions they flagged so `/fe` can build under TDD.

## Scope
- **Projects Home** → polished launcher (needs-you cockpit strip, calm cards, motion). Presentational over `ProjectsStore`.
- **Tasks board** → an attractive horizontal **pipeline** ("the train"): a left Backlog bar → stage columns joined by a connecting rail → a stacked, clickable **done folder**, with the existing off-track lane kept. Presentational over `TasksBoardComponent`'s existing projection.
- **Knowledge panel** (rename "Base" → "Knowledge") → scope split + tags + `/kai` propose-inbox. Tracked separately.

## Tickets
| Ticket | Title | Track | Owner | Notes |
|---|---|---|---|---|
| ADT-232 | Tasks pipeline board | full | /fe | Pure-FE re-projection of existing per-project state. ARCH + DESIGN approved; no SECOPS gate (no new backend / external input). |

## Approvals
- `approvals/arch-tasks-pipeline.md` — `/arch` decision on the Backlog predicate, done-folder, roll-ups, off-track lane, and the pure-FE verdict for ADT-232.

## Design inputs
- `docs/product-vision/conditional-workflow/redesign-home-tasks-knowledge-aura.md` (`/aura`)
- `docs/product-vision/conditional-workflow/usability-home-tasks-knowledge-apex.md` (`/apex`)
