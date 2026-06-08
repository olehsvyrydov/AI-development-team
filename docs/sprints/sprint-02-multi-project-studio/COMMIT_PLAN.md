# Commit plan — Cockpit v2 slice (sprint-02 multi-project studio)

Branch: `feat/dart`. Five logical commits, ordered so each builds and tests
green on its own (core → backend projections → fs browser → frontend → docs).
The orchestrator executes these; do **not** add a `Co-Authored-By` trailer.

A `studio/cockpit/e2e/.fixtures.json` deletion is already staged; it belongs
with commit 5 (e2e/docs) — unstage it first or fold it in there.

---

## Commit 1 — Core serves the Cockpit at `/`, legacy board at `/legacy`

**Files**
- `hub/server.js`
- `hub/lib/static-spa.js`
- `hub/test/static-spa.test.js`
- `hub/test/server-spa.test.js`
- `.gitignore`

**Message**
```
feat(hub): serve production Cockpit at / and legacy board at /legacy

The Core now serves the production Angular Cockpit build
(studio/cockpit/dist/cockpit/browser) same-origin at `/`, so the page
reaches network-idle with no HMR socket. Unknown non-asset GETs fall
back to the build's index.html for client-side routes (SPA deep links);
asset-looking misses return 404. The original zero-dependency board moves
to `/legacy`, and is also the fallback when no build is present, so the
server still works undeployed.

The static resolver confines every request to the build root
(decode + path.resolve + boundary check) and never lists directories, so
traversal cannot read files outside the build.

Refs: ADT-218
```

---

## Commit 2 — Cockpit v2 backend projections (task summary, workflow view, base)

**Files**
- `hub/lib/state.js`
- `hub/lib/projects.js`
- `hub/test/state.test.js`
- `hub/test/projects.test.js`

**Message**
```
feat(hub): add task/workflow/base projections and compact list roll-up

Add render-ready projections to the project state so the Cockpit needs no
re-joining or N+1:

- taskSummary: status buckets that sum to total, plus a `needsYou` overlay
  count (hard-gate rejection, or waiting on a known owner with no live
  heartbeat). needsYou is an overlay, never a sixth exclusive bucket.
- workflowView: the active track flattened to render-ready stages, each
  carrying its owner and, when gated, the gate's {name, refusal}.
- base: known docs projected to base-panel facts; method is
  filename-only unless a memory config selects an embedder. Without a real
  embedder, indexing/failed are true zeros by construction.

Each projection is isolated — one failing must not blank the others. The
projects list endpoint enriches every record with a compact
{open, needsYou} roll-up via listSummary, built from the same projection
so it is exact-by-construction; a project whose state cannot be built omits
the field (absent-not-zero) rather than fabricating zeros, and never fails
the whole list.

Refs: ADT-219
```

---

## Commit 3 — Read-only $HOME-confined directory browser for the folder picker

**Files**
- `hub/lib/fs-browse.js`
- `hub/lib/analyze.js`
- `hub/test/fs-browse.test.js`
- `hub/test/analyze.test.js`

**Message**
```
feat(hub): add read-only $HOME-confined directory browser API

Add GET /api/fs/roots and GET /api/fs/list?path= so the folder picker can
browse the local filesystem to choose a project, without a free-text path
field (a browser cannot read an absolute path from a native file input).

Security posture — this is the one new attack surface in the slice and is
deliberately narrow:
- One allowed root: realpath($HOME), resolved once. Every listing is
  confined to that root or a descendant.
- The request path is rejected before any FS work (non-string, relative,
  NUL, empty, or over-long); a truly absent path defaults to the root.
- The path is realpath-resolved BEFORE the containment check, so an
  escaping symlink is refused, never followed; containment uses a
  trailing-separator rule, so the /home/foo vs /home/foobar prefix trap is
  rejected. Each child is containment-checked too: an escaping symlink
  child is skipped, not followed.
- Entries carry only { name, type:'dir', hasProject } — readdir only, never
  readFile; no size/mtime/stat recon fields. One directory level,
  non-recursive, entry-capped with a `truncated` flag and a wall-clock
  budget (bounded against DoS).
- Pure read: nothing writes, creates, or mutates. Although these are GETs,
  the HTTP layer routes both through the write guard
  (anti-CSRF / anti-DNS-rebinding) because disclosing home-directory
  structure is a capability, not public data.

analyze.js exports hasArtefacts/ARTEFACT_MARKERS for the picker's
"has project" marker, and rewrites README-description derivation to surface
genuine prose only: fenced code blocks and structural/decorative markup
(badges, images, headings, tables, HTML) are skipped, and the result is
capped on a word/sentence boundary into a short description plus a longer
passage for the project page.

Refs: ADT-219, ADT-220
```

---

## Commit 4 — Cockpit v2 UI: first-run home, folder picker, project shell

**Files**
- `studio/cockpit/src/app/app.ts`
- `studio/cockpit/src/app/app.spec.ts`
- `studio/cockpit/src/app/core/models.ts`
- `studio/cockpit/src/app/core/models.spec.ts`
- `studio/cockpit/src/app/core/fs.service.ts`
- `studio/cockpit/src/app/core/fs.service.spec.ts`
- `studio/cockpit/src/app/core/platform-bridge.ts`
- `studio/cockpit/src/app/core/platform-bridge.spec.ts`
- `studio/cockpit/src/app/core/projects.store.ts`
- `studio/cockpit/src/app/projects/copy.ts`
- `studio/cockpit/src/app/projects/projects-home.component.ts`
- `studio/cockpit/src/app/projects/projects-home.component.spec.ts`
- `studio/cockpit/src/app/projects/project-card.component.ts`
- `studio/cockpit/src/app/projects/project-card.component.spec.ts`
- `studio/cockpit/src/app/projects/connect-panel.component.ts`
- `studio/cockpit/src/app/projects/connect-panel.component.spec.ts`
- `studio/cockpit/src/app/projects/folder-picker.component.ts`
- `studio/cockpit/src/app/projects/folder-picker.component.spec.ts`
- `studio/cockpit/src/app/shell/project-shell.component.ts`
- `studio/cockpit/src/app/shell/project-shell.component.spec.ts`
- `studio/cockpit/src/app/shell/workflow-panel.component.ts`
- `studio/cockpit/src/app/shell/workflow-panel.component.spec.ts`
- `studio/cockpit/src/app/shell/tasks-panel.component.ts`
- `studio/cockpit/src/app/shell/tasks-panel.component.spec.ts`
- `studio/cockpit/src/app/shell/base-panel.component.ts`
- `studio/cockpit/src/app/shell/base-panel.component.spec.ts`
- `studio/cockpit/src/app/testing/no-tofu-glyphs.spec.ts`

**Message**
```
feat(cockpit): build first-run home, folder picker, and project shell

Projects Home gets a first-run pitch (anchor line, what-it-is, 3-step
how-it-works, trust chips) when no project is connected, and a thin
cross-project momentum strip otherwise. Each project card gains a short
description, an SVG glyph tile, a "needs you" pulse, and a governance
"Security-reviewed" badge. All at-a-glance signals are absent-not-zero —
no fabricated zeros when a roll-up or gate fact is missing. Cards hydrate
profile/state lazily so the badge and full title/description appear with
no N+1 on first paint.

Replace the free-text path field with a focus-trapped folder-picker dialog
that drives the guarded /api/fs/* endpoints (roots/recent + one-level
listing, folders only, with a "has project" marker). The PlatformBridge
keeps the seam for a future native OS picker.

The Project Shell adds read-only Workflow, Tasks, and Base panels, each
derived independently so one panel failing to build never blanks the
others, with the full description in its own wrapping block.

Ratified product/privacy copy is centralised in copy.ts as approved claim
strings shipped verbatim. Untrusted README/manifest/filesystem text is
rendered with interpolation only (escaped) — never [innerHTML].

Fixes: long-title wrap/clamp on the card, focus-return after the picker
closes, the needsYou overlay count, connect-current-folder enablement, and
inert "soon" affordances.

Refs: ADT-218, ADT-219, ADT-220
```

---

## Commit 5 — e2e suite refresh + sprint/vision docs

**Files**
- `studio/cockpit/playwright.config.ts`
- `studio/cockpit/e2e/global-setup.ts`
- `studio/cockpit/e2e/01-launcher.e2e.spec.ts`
- `studio/cockpit/e2e/02-project-shell.e2e.spec.ts`
- `studio/cockpit/e2e/03-coverage.e2e.spec.ts`
- (delete) `studio/cockpit/e2e/projects-home.e2e.spec.ts`
- (delete) `studio/cockpit/e2e/projects-home-coverage.e2e.spec.ts`
- (delete) `studio/cockpit/e2e/.fixtures.json` *(already staged)*
- `docs/product-vision/ui-design-cockpit-v2.md`
- `docs/product-vision/cockpit-promotion-apex.md`
- `docs/sprints/sprint-02-multi-project-studio/DECISION_LOG.md`
- `docs/sprints/sprint-02-multi-project-studio/approvals/arch-cockpit-v2.md`
- `docs/sprints/sprint-02-multi-project-studio/approvals/secops-cockpit-v2.md`
- `docs/sprints/sprint-02-multi-project-studio/reviews/` (new review notes)
- `docs/sprints/sprint-02-multi-project-studio/testing/e2e-cockpit-v2.md`
- `docs/sprints/sprint-02-multi-project-studio/testing/verify-cockpit-v2.md`
- `docs/sprints/sprint-02-multi-project-studio/COMMIT_PLAN.md` (this file)
- `CHANGELOG.md`
- `hub/README.md`

**Message**
```
test(cockpit): rework e2e suite and record Cockpit v2 sprint docs

Replace the two projects-home e2e specs with a global-setup that builds
fixture projects and a three-file suite (launcher, project shell,
coverage) running against the Core-served production build. Update the
Playwright config to drive that flow.

Document the slice: architecture and security approvals, the UI-design and
promotion notes, the e2e and verification reports, the decision log, and
the CHANGELOG/hub-README updates for Core-serves-Cockpit.

Refs: ADT-218, ADT-219, ADT-220
```

---

### Alternative: one cohesive feature commit

If the reviewer prefers to read the slice as a single unit, squash commits
1–4 into one `feat(cockpit): Cockpit v2 — Core-served SPA, fs browser, and
project shell` with the four bodies merged, and keep commit 5 (tests/docs)
separate. The five-commit split above is recommended: it keeps the new
filesystem attack surface (commit 3) reviewable in isolation.
