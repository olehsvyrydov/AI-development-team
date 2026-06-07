# Hub board — end-to-end tests

Real-browser (Playwright/Chromium) end-to-end tests for the hub board UI
(`../public/index.html`, served by `../server.js`).

These tests are **dev-only**. They live in their own package with their own
`node_modules` and never touch the shipped hub runtime, which stays
zero-dependency. Nothing here is required to run the hub.

## What is covered

Each test starts its own hub server against a private copy of a fixed fixture
project (`fixtures/project/`), so results are deterministic and tests run in
parallel without interfering.

| Spec test | Verifies |
|-----------|----------|
| loads and renders tickets grouped into stage columns | board renders; every ticket lands in the column for its stage, in track order |
| clicking a ticket opens the detail modal | modal shows the description and a comment timeline (kind + author + relative time, with the raw timestamp preserved as a tooltip), newest first |
| a hard-rejected ticket shows Blocked | card status label reads **Blocked** and names the responsible gate + owner; the gate strip and the modal restate the same gate, and never contradict the label |
| an unassigned ticket shows its expected owner | a muted "expected" owner badge, visually distinct from a solid assignee badge |
| keyboard and a11y | a card is keyboard-focusable; **Enter** and **Space** open the modal; **ESC** closes it and restores focus; the dialog exposes `role="dialog"` / `aria-modal="true"` |
| live update (disk) | mutating the fixture's `.workflow-state.json` moves the card to a new column and raises a toast, with no page reload |
| live update (control plane) | a `POST /api/ticket/comment` (with the `X-AIDT` header) appears live in the open modal |

## Prerequisites

- Node.js (same runtime the hub uses).
- The Chromium build Playwright pins. If it is not already cached under
  `~/.cache/ms-playwright`, download it once:

  ```bash
  npm run install-browser   # == npx playwright install chromium
  ```

## Running

```bash
cd hub/e2e
npm install            # installs @playwright/test (dev-only)
npm test               # headless run
npm run test:headed    # watch it in a real browser window
npm run report         # open the last HTML report
```

## Layout

```
hub/e2e/
├── package.json            # @playwright/test (dev-only)
├── playwright.config.js    # Chromium, parallel, per-test server (no global webServer)
├── fixtures/project/       # the deterministic project the hub reads
│   ├── .aidevteam/
│   │   ├── workflow.yaml            # preset + tracks + gates (highest-priority location)
│   │   └── comments/*.jsonl         # per-ticket comment timelines
│   └── .workflow-state.json         # the ledger: tickets, stages, assignees, gate states
└── tests/
    ├── hub-fixture.js      # copies the fixture, starts/stops a server per test
    └── board.spec.js       # the board E2E specs
```

The fixture's `workflow.yaml` is placed at `.aidevteam/workflow.yaml` (the
first entry in the hub's workflow-resolution order) so it always wins over any
user-level (`~/.aidevteam/workflow.yaml`) or shipped default, keeping the board
identical on every machine.
