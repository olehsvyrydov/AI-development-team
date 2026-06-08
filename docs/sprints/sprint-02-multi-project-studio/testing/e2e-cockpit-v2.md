# E2E — Cockpit v2 (redesigned launcher + folder picker + project shell)

/ e2e (Adam). App: `studio/cockpit/` (Angular 21, Playwright). Branch: `feat/dart`.

## Why this update

The Cockpit was redesigned: Projects Home now opens with a first-run pitch (anchor line +
3 steps + trust chips + a "Choose a folder…" CTA) and, when populated, an enriched grid of project
cards; a focus-trapped **folder-picker dialog** replaced the old free-text path field; and entering
a card opens a **Project Shell** with Workflow / Tasks / Base panels.

The pre-existing Playwright specs drove removed UI — a `connect-path` text input, a `connect-submit`
button, and the old "No projects yet" empty state — and would now fail. They have been rewritten to
the new UI and extended with coverage for the new flows.

## What was removed / fixed

- Deleted the two stale specs `e2e/projects-home.e2e.spec.ts` and
  `e2e/projects-home-coverage.e2e.spec.ts`, which referenced `connect-path`, `connect-submit`, and
  `No projects yet`. All references to the typed-path connect flow and the old empty state are gone.
- Rewrote `playwright.config.ts` to be deterministic across Playwright's repeated config loads
  (see "How it runs"). Added `e2e/global-setup.ts` to reset the throwaway registry exactly once.

## Specs and scenarios (new)

Three specs, run serially (`workers: 1`) against one isolated hub. File order is significant: the
first-run empty-state assertions live in the alphabetically-first spec and run before anything
connects a project.

### `e2e/01-launcher.e2e.spec.ts`
- **First-run empty state** — the pitch renders against the fresh registry: the `DART` heading, the
  3 how-it-works steps, the trust chips, the "Choose a folder…" CTA, and the docs link. Asserts the
  removed `connect-path` / `connect-submit` / "No projects yet" are absent.
- **Folder picker** — opening the picker yields a focus-trapped `role="dialog"` (`aria-modal`,
  dialog self-focused); quick-access roots + a directory listing render; the current folder is
  selected by default so **Connect is enabled immediately**; drilling into a fixture folder keeps
  Connect enabled and updates the selection; **ESC closes and returns focus to the opener**.
- **Connect → card → shell** — connecting a folder through the real picker flips Home to the
  populated grid (brand strip + project count + a card with name/description/status); clicking the
  card navigates to `/projects/:id` and the shell renders.
- **Untrusted README inert** — a README carrying an `<img onerror>` / `<script>` payload surfaces as
  inert text on the card and in the shell, with **no parsed element and no script side-effect**
  (`window.__xssImg` / `window.__xssScript` stay undefined; zero injected nodes).

### `e2e/02-project-shell.e2e.spec.ts` (the DEMO project)
- **Long description untruncated** — the shell header renders the full auto-collected description,
  is **not** `-webkit-line-clamp`-ed (unlike the card), and wraps to more than one visual line.
- **Workflow rail** — more than one stage chip; at least one stage names an owning agent role; at
  least one stage carries a gate marker; the screen-reader-equivalent ordered list mirrors it.
- **Tasks panel** — total count of the seeded tickets, a populated status bucket, and no empty
  state.
- **Base panel** — the document count (`3 docs` / `3 indexed`) and the honest method line
  ("Filename index only …", no embedder wired).
- **"soon" affordances** — the Workflow / Tasks / Base forward controls are present, `disabled`, and
  `aria-disabled`; the header settings cog is `aria-disabled`; a click does not navigate; the Back
  link is a real control that returns to the populated launcher.

### `e2e/03-coverage.e2e.spec.ts` (adversarial / a11y)
- **Every picker close path** (Cancel, ✕, backdrop) closes the dialog and restores opener focus.
- **Keyboard-only** picker navigation: ArrowDown moves the selection, Enter drills in, Backspace
  goes up; Connect stays enabled.
- **Browser-back** after entering a project restores the populated grid (card count preserved).
- **Real mouse hit-testing** — the on-top element at each control's centre is the control itself
  (no scrim/overlay steals the click); no full-bleed pointer-interactive interceptor exists; a real
  (non-forced) mouse click on a card navigates into the shell.

## How it runs (deterministic, self-contained)

```bash
cd studio/cockpit
npx playwright install chromium   # if the browser binary is missing
npx playwright test               # or: npm run e2e
```

`playwright.config.ts` stands up the real stack headless:
- a throwaway `$HOME` at a **fixed** path under the OS temp dir, so the developer's real registry
  and home directory are never touched, and the folder-picker's read-only browser (confined to
  `realpath($HOME)`) sees only the fixtures;
- the **real hub** (`node hub/server.js <tempHome> --port 4477`, `HOME=<tempHome>`) as the API;
- the **cockpit dev server** (`ng serve --port 4599`), which proxies `/api` to the hub.

Determinism notes (these were the failure modes fixed during authoring):
- Fixture folders use **fixed slugs** (not `mkdtemp`). Playwright imports the config module more
  than once per run, and the webServer subprocess reads `HOME` from it; random per-import names made
  the manifest the specs read disagree with the folders the hub served. Fixed slugs keep them
  identical across evaluations.
- Config setup is **idempotent and non-destructive** (it rewrites fixture files but never removes
  the tree). The one-time registry reset lives in `e2e/global-setup.ts`, which Playwright runs once
  before the webServer starts — so the empty-state spec sees zero projects without a mid-run wipe
  that would erase the projects later specs connect.
- Tests that need a specific card **connect it themselves** through the picker (idempotent connect),
  so they do not depend on cross-test ordering.
- Picker keyboard handling requires focus inside the modal; the specs re-focus the dialog before
  each keystroke (Backspace would otherwise trigger browser-back when focus has leaked to `<body>`)
  and use `expect.poll` to step ArrowDown without racing the signal-driven re-render.

### Fixtures
- **DEMO** (`demo-project/`) carries real ADT artefacts so the shell projects full state: a long
  README first paragraph (untruncated header), `CLAUDE.md` (the hub's "has artefacts" fast path —
  an artefact-less folder yields **no** shell state), a `.workflow-state.json` ledger of five
  tickets with explicit stages/assignees (deterministic Tasks counts), and three `docs/*.md`
  (Base count + the filename-only method line). The workflow rail's stages/owners/gates come from
  the framework's bundled default workflow.
- **picker-parent/** with a nested `child-folder/` for picker drill-in.
- **untrusted-readme/** whose README first paragraph carries the XSS payload.

The hub's analyzer sanitises README prose at the data layer (markdown/HTML stripped) before storing
the description, so the inert-rendering test asserts on the surviving plain-text markers
("…PAYLOAD…", "inert marker text") plus the absence of any parsed element or script side-effect —
the end-to-end guarantee that untrusted README content never becomes live DOM.

## data-testid added

None. All selectors are existing `data-testid` hooks already present on the components
(`open-picker`, `empty-state`, `empty-step`, `trust-chip`, `read-docs`, `fs-row`, `selected-path`,
`picker-connect`/`-cancel`/`-close`, `project-card`, `status`, `needs-you-strip`,
`shell-description`, `panel-workflow`/`-tasks`/`-base`, `stage-chip`, `gate-*`, `workflow-alt`,
`tasks-total`, `count-done`, `base-count`/`-indexed`/`-method`, the `-full-link`/`-open-board`/
`-add`/`-manage` soon-controls, `shell-settings`, `back-to-projects`) or resilient role/text
selectors per the E2E skill.

## Traceability matrix

| # | Scenario | Test File:Line | Status |
|---|----------|----------------|--------|
| 1 | First-run empty-state pitch + steps + chips + CTA; old selectors absent | 01-launcher:62 | PASS |
| 2 | Folder picker: focus-trap, listing, Connect-enabled, drill-in, ESC + focus return | 01-launcher:82 | PASS |
| 3 | Connect via picker → enriched card → navigate to `/projects/:id` | 01-launcher:119 | PASS |
| 4 | Untrusted README rendered inert (no element, no script side-effect) | 01-launcher:147 | PASS |
| 5 | Shell header long description untruncated (no line-clamp, multi-line) | 02-project-shell:49 | PASS |
| 6 | Workflow rail: stages + owners + gate markers + SR-alt list | 02-project-shell:72 | PASS |
| 7 | Tasks panel: total + status bucket counts (no empty state) | 02-project-shell:95 | PASS |
| 8 | Base panel: doc count + honest "filename index only" method line | 02-project-shell:109 | PASS |
| 9 | "soon" affordances present + disabled, do not navigate; Back works | 02-project-shell:124 | PASS |
| 10 | Picker close paths (Cancel/✕/backdrop) close + restore focus | 03-coverage:56 | PASS |
| 11 | Keyboard-only picker: move / drill / up; Connect stays enabled | 03-coverage:79 | PASS |
| 12 | Browser-back after entering a project restores the populated grid | 03-coverage:119 | PASS |
| 13 | Real mouse hit-testing lands on controls; no overlay; card click navigates | 03-coverage:135 | PASS |

## Result

`npx playwright test` → **13 passed** (chromium, ~1.5 min), deterministic across repeated runs.
The vitest unit suite (`npm test` / `ng test`) remains green (118 passed) and the build is
unaffected. No source files were modified to make the suite pass; only the e2e specs, the Playwright
config, and the new global-setup were added/updated.
