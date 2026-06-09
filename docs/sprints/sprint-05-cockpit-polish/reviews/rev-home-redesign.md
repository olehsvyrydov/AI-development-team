# Code Review — Projects Home redesign (ADT-233)

**Reviewer:** /rev · **Branch:** `feat/dart-home-redesign` · **Verdict: PASS (no BLOCKING; nits fixed in place)**

Pure-frontend visual + motion refinement over the existing `ProjectsStore` signals — no new data, no new endpoint, no backend change. Reviewed against Aura's deep design pass (`redesign-home-tasks-knowledge-aura.md §1`, needs-you cockpit strip / calmer card hierarchy / H1–H5 reduced-motion-safe motion) and Apex's usability pass (`usability-home-tasks-knowledge-apex.md §1.3–1.8`, header one-liner / signal-ranking / absent-not-zero / microcopy / anti-vanity).

## Change set
- `core/projects.store.ts` (+spec) — new `WaitingProject` interface + `waiting` computed signal.
- `projects/projects-home.component.ts` (+spec) — cockpit strip, header one-liner, grid stagger motion.
- `projects/project-card.component.ts` (+spec) — calmer signal hierarchy, glyph-paired pulse, demoted footer, hydrate crossfade, hover/focus motion.
- `projects/connect-panel.component.ts` (+spec) — ratified add-project body copy, state-settle motion.
- `projects/copy.ts` — `HOME_TITLE`, `HOME_SUBHEAD`, `ADD_PROJECT_BODY` strings.

## Findings by severity

### BLOCKING
None.

### WARNING
None.

### NIT (fixed in place during review — trivial, mechanical)
- **N-1 — process artifacts in CSS comments.** Three motion comments carried the design doc's motion-table identifiers (`H1`, `H2`, `H4`, `H5`) as cross-reference prefixes — a design-record pointer, which the Code Standard forbids in source/comments (same class as condition codes `C1`/`D4`). The facts-only WHY text was good; only the `H#` prefix leaked. Stripped the prefixes, kept the explanatory comments:
  - `project-card.component.ts` — `H1`, `H4` prefixes removed.
  - `connect-panel.component.ts` — `H5` prefix removed.
  - `projects-home.component.ts` — `H2` prefix removed.
  - Re-grep after fix: clean (only remaining `H4` is inside an SVG `<path d="… H4 …">` command, a false positive).

## Verification against the brief

### absent-not-zero (genuinely enforced everywhere)
- **Global cockpit strip:** rendered behind `@if (store.totalNeedsYou() > 0)` — entirely absent at 0, never "0 need you". Test `does not render the cockpit strip at all when nothing needs you (absent-not-zero)` asserts `querySelector('[data-testid="cockpit-strip"]')` is null.
- **Per-project chips:** `store.waiting` filters `(needsYou ?? 0) > 0` before mapping, so an all-clear project contributes no chip. Test asserts the `needsYou: 0` project (`marketing-site`) yields no chip and its name never appears.
- **Card needs-you pulse:** `@if (p.needsYou > 0)` (unchanged from prior). The `{open}` count pairs a check glyph; the `need` chip stays the single accented element.
- **Compact head count:** `@if (store.projectCount() > 0)` and `@if (store.totalNeedsYou() > 0)` — no fabricated zeros.
- **Store-level absent:** a project with no `taskSummary` roll-up (`record.taskSummary?.needsYou ?? 0`) contributes nothing to either `totalNeedsYou` or `waiting`. Test `reports no waiting projects when nothing needs the human` covers both `needsYou:0` and absent-summary cases.

### sum-derivation (no new endpoint / no N+1)
- `totalNeedsYou` (pre-existing) reduces `needsYou` over the already-loaded `items()` list.
- `waiting` derives `{ id, name, needsYou }` from the **same** `items()` list — `id` from the record, `name` via `displayTitle(v)` (already-hydrated title/label), `needsYou` from the list roll-up. No per-project fetch, no new store method hitting the API. The cockpit strip is pure presentational chrome over existing signals, exactly as the design specifies (§1.8 / Aura §1.0).
- `waiting` is sorted descending by `needsYou`. Test confirms order `['b','a']` for needs `[3,1]` and total `4`.

### motion gating (H1–H5 behind prefers-reduced-motion → instant)
Each component declares motion-duration tokens at `:host` and zeroes them in **one place** via `@media (prefers-reduced-motion: reduce)`, and additionally guards transforms/animations:
- **Hover lift (card):** `transform: translateY(-2px)` plus an explicit `@media (prefers-reduced-motion: reduce) { .card:hover { transform: none; } }`; border/elevation swap instant via zeroed `--kb-dur-*`.
- **Grid stagger (home):** `.grid[data-motion='on'] > *` animation, with `@media (reduce) { .grid > * { animation: none; } }`. The `data-motion` gate is set from `prefersMotion()` (reads `matchMedia('(prefers-reduced-motion: reduce)')`, defaults to allowing motion when `matchMedia` is unavailable — SSR/test-safe). Test asserts the attribute is `on|off`.
- **Card hydrate crossfade:** `.card[data-motion='on'] .card__body[data-hydrated='true']` animation, zeroed under reduce. `hydrated()` = `profile !== null || state !== null`. Tests assert the `data-hydrated` hook is `true` (profile present) / `false` (record-only).
- **Connect state-settle:** `.connect[data-motion='on'] .state` animation, zeroed under reduce.
- All durations read from `--kb-dur-*` tokens, so reduced motion collapses everything to instant in one media query per component. Motion is one-shot (no looping pulse).

### XSS
- Project name/title/description rendered **interpolation-only**: `{{ w.name }}`, `{{ title() }}`, `{{ description() }}`, `{{ store.totalNeedsYou() }}`, etc. No `[innerHTML]` / `DomSanitizer.bypass*` anywhere in scope (grep clean; app-wide `no-unsafe-binding` source-scan spec passes).
- The cockpit chip's project-name link uses `{{ w.name }}` for text and `[attr.aria-label]="'Open ' + w.name + …"` — both auto-escaped by Angular. Behavioral test `escapes an untrusted project name in the cockpit strip chip` injects `<img src=x onerror=…>` and asserts no live `img` element and the `onerror` side-effect (`window.__xss2`) never fires.
- `displayTitle()` returns a plain string (override → title → label); no markup path.

### a11y
- **Cockpit strip:** `role="status"` `aria-live="polite"`; accessible sentence "{N} tasks across {M} projects waiting on you"; chips are real `routerLink` anchors with `aria-label="Open {name}, {n} tasks need you"`.
- **Card:** stays a single navigable `routerLink` anchor; no nested interactive controls were added (the `⋯` kebab is correctly out of scope for this pass per Aura §1.2, so no stop-propagation concern arises). `:focus-visible` outline added to both card and cockpit chip.
- **Glyphs** are `aria-hidden` decorative; status/needs-you always carry text + colour, never colour alone.

### folder-picker claim strings + connect flow intact
- The connect flow (`ConnectPanelComponent`) is unchanged except: idle body copy now reads the ratified `ADD_PROJECT_BODY` constant ("Point DART at another folder on this machine — it analyses it right here.", Apex §1.6), and the analysing/ready cell gains the reduced-motion-gated settle animation. Folder-picker ratified strings (subtitle/footer/adopt-hint) untouched. Test `uses the approved add-project cell body copy in the idle state` confirms the copy.

### signal hierarchy (Apex §1.3 ranking; anti-vanity)
- Card body order now title → description → pulse → stack chips, footer (status · updated) demoted to the calmest single row. Test `orders the calm signal hierarchy top-to-bottom` asserts title < desc < pulse < footer.
- **Anti-vanity / knowledge demoted off the card** (Apex §1.3 rank 6, §1.8): test `does not surface any knowledge count on the card` asserts no "knowledge"/"in knowledge" text even when `base.counts` are present. No vanity totals introduced.

## Facts-only grep
Scanned all five changed source files for ticket IDs (`ADT-…`), persona names (jorge/finn/james/soren/luda/aura/apex/…), condition codes, sprint refs, and motion-table IDs (`H1–H9`). **Initial scan: 4 leaks** (the `H1/H2/H4/H5` comment prefixes) — **fixed in place** (NIT N-1). **Post-fix scan: clean** (sole remaining `H4` match is an SVG path command, not a process artifact).

## Re-run (independently executed; no e2e/Playwright — live hub on :4477)
- `cd studio/cockpit && npm test` → **30 files, 399 tests pass** (includes `no-unsafe-binding` and `no-tofu-glyphs` source-scan specs). Re-run after the NIT fix: still 399/399.
- `npm run build` → **bundle generation complete, exit 0.** The only style-budget `[WARNING]`s are for `shell/tasks-board.component.ts` (+2.47 kB) and `shell/workflow-builder.component.ts` (+3.21 kB) — **out of scope, pre-existing, untouched by this change set**. The in-scope projects-home / project-card / connect-panel components are within budget; **no NEW budget error**.

## Assumptions / not verified
- AC correctness assumed sound: the brief is a ratified design+usability pass; the implementation matches it faithfully.
- Visual/motion rendering not verified in a live browser (avoided per instruction — live hub on :4477); motion gating verified by reading the CSS media queries and the `data-motion`/`data-hydrated` gate logic + their tests.
- `taskSummary.needsYou` correctness is upstream (ADT-218, VERIFIED); this pass only re-projects it.

## Gate decision
**CODE_REVIEWED → PASS.** No BLOCKING, no WARNING; one NIT (process-artifact comment prefixes) fixed in place. absent-not-zero, sum-derivation (no new endpoint/N+1), and reduced-motion gating all verified; XSS interpolation-only; a11y intact; ratified copy + connect flow intact. 399/399 tests pass, build clean, facts-only grep clean. Ready for /verify.
