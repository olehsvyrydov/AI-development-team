# QA Report — DART Cockpit "Projects Home" slice

**Tester:** Rob (`/qa`) — black-box / exploratory
**Date:** 2026-06-07
**Branch:** `feat/dart`
**Under test:** `studio/cockpit/` (Angular 21) — Projects Home launcher + per-project Shell, driven against the real Node hub registry API (`hub/lib/projects.js`).
**Design reference:** `docs/product-vision/ui-design.md` (§2 Projects Home, §3 Project Shell)

---

## 1. Environment & method

Black-box, headless Playwright driving the **production build** of the cockpit. To keep the run self-contained and immune to mid-test teardown, a single Node process hosted:

- the **isolated hub** in-process via `hub/lib/projects.js::createServer({ home: TEMP_HOME })` on a loopback port — exposing exactly the three routes the app calls (`GET /api/projects`, `POST /api/projects/connect`, `GET /api/projects/:id`);
- a tiny **static + /api proxy** server for `dist/cockpit/browser` (SPA fallback to `index.html`), mirroring the dev-proxy contract (`changeOrigin`, strip `Origin`, keep `X-AIDT`);
- the **Playwright** browser.

**Isolation:** `process.env.HOME` was pointed at a throwaway temp dir, so the hub's registry lived at `$TEMP_HOME/.aidevteam/registry.json` and the real `~/.aidevteam/registry.json` was never written by the harness. The registry file was reset to `{"version":1,"projects":[]}` between independent cases. Fixture projects (node/python/bare/unicode/xss/plain-file) were created under a temp dir. All temp dirs + the throwaway driver scripts were removed after the run. **No production code was changed; nothing was committed.**

> **Isolation caveat (environment, not a product defect):** at the start of the session, separate hub/`ng serve` processes from another session were already bound to ports `4477/4478/4599` and creating `/tmp/dart-qa.*` fixtures. One early *manual* `curl` connect during setup hit a hub that was using the real `$HOME` — but that connect did **not** persist to `~/.aidevteam/registry.json` (verified: the real registry retained only its pre-existing `ai-dev-team` entry). The reported test run below used the in-process isolated hub exclusively, so its results are clean. I did **not** touch the other session's servers.

---

## 2. Test cases (executed)

| ID | Steps | Expected | ACTUAL | Result | Pri |
|----|-------|----------|--------|--------|-----|
| TC-01 | Load home with empty registry | Empty state: glyph + "No projects yet" + value-prop lead + connect field | Empty state shown; lead "Connect a folder…"; connect field present | **PASS** | P1 |
| TC-02 | Connect a node project (pkg name `payments-api`, README first para) | Card appears; title = package.json `name`; description = README first paragraph | title="payments-api"; desc="VAT-aware billing and invoicing service for UK merchants." | **PASS** | P0 |
| TC-03 | Re-connect the same path | No duplicate card (idempotent) | Card count stays 1 | **PASS** | P0 |
| TC-04 | Connect a non-existent path | In-place error, no crash, spinner not stuck | Error "Couldn't connect that folder. / path does not exist"; spinner gone | **PASS** | P0 |
| TC-05 | Connect a path that is a file, not a dir | Clear in-place error | Error "path is not a directory" | **PASS** | P1 |
| TC-06 | Connect a relative (non-absolute) path | Clear in-place error | Error "path must be absolute" | **PASS** | P1 |
| TC-07 | After an error, click "Try again" | Connect form restored | Form (path field) restored to idle state | **PASS** | P2 |
| TC-13 | Empty + whitespace-only path | Submit button disabled (cannot submit blank/whitespace) | Disabled for "" and for "   " | **PASS** | P1 |
| TC-08 | Connect two different folders | Two cards; status + last-seen render on each | 2 cards; statuses ["connected","connected"]; last-seen "updated just now" | **PASS** | P1 |
| TC-09 | Click a card | Shell opens: title + description + Workflow/Tasks/Base placeholders | Shell title="payments-api", desc present; all 3 panels visible | **PASS** | P0 |
| TC-10 | Browser Back from shell | Returns to the grid | Grid visible again; cards present | **PASS** | P1 |
| TC-11 | Connect a folder whose README/pkg name carry `<script>`/`<img onerror>` payloads | Payload rendered as inert text on the card; no execution | 0 `<script>`/`<img>` elements injected; payload visible as text; 0 JS dialogs | **PASS** | P0 |
| TC-12 | Open that project's shell | Payload inert in shell header too | 0 injected scripts in header; title shows `<script>…` as text; 0 dialogs | **PASS** | P0 |
| TC-14 | Keyboard only: Tab to connect field, type, submit via Enter | Field reachable by Tab; Enter submits and a card appears | Field reached by Tab; Enter submitted; card appeared | **PASS** | P1 |
| TC-15 | Keyboard only: Tab to a card, press Enter | Card focusable; Enter opens the shell | Card focusable via Tab; Enter navigated to shell | **PASS** | P1 |
| TC-17 | Hub unreachable on initial load | Sensible error / graceful state, no stuck spinner, no hang | `load-error` banner shown; no stuck spinner; resolved in <100ms | **PASS** | P0 |
| TC-18 | Hub goes down during a connect | Error surfaced, spinner not stuck | connect-error shown; spinner not stuck | **PASS** | P1 |
| TC-19 | Direct-navigate to an unknown project id | Shell shows an error, not an endless "Loading…" | `shell-error` banner shown; no stuck "Loading project…" | **PASS** | P1 |
| TC-20 | Whole run | No uncaught page/JS errors | `pageErrors=[]` across all cases | **PASS** | P1 |

**Functional run: 19 / 19 PASS.**

> TC-07 first reported a *false* FAIL because the assertion ran before the re-render settled (no wait). An isolated probe confirmed the form **is** correctly restored after "Try again"; adding a `waitFor(visible)` turned it green. This was a test-timing artefact, **not** a product defect.

---

## 3. Exploratory charter

> **Charter:** *Explore the connect → analyse → card → shell pipeline with hostile, degenerate, and i18n inputs and with backend interruption, to discover where auto-derived content, layout, persistence, and resilience break down — beyond the happy path.*

| ID | Probe | Expected | ACTUAL | Result |
|----|-------|----------|--------|--------|
| EX-01 | Connect a **bare folder** (no package.json, no README) | Title falls back to folder name; description has a sensible fallback | title="bare-folder"; desc="A multi-language project." | **PASS** |
| EX-02 | **300-char title with no spaces** + 400-word README | Card stays within layout; no horizontal overflow | Card width 280px ≤ viewport 1280px; title wraps (`overflow-wrap: anywhere`); desc 3-line clamp | **PASS** |
| EX-03 | **Unicode/emoji** title + description (Cyrillic, CJK, emoji) | Rendered correctly | title="проект-数据-🚀"; desc includes "数据"/🚀 | **PASS** |
| EX-04 | Connect, then **full page reload** | Card survives reload (registry-backed) | 1 card after reload; title intact | **PASS** |
| EX-05 | Re-connect then reload | Still a single entry (no dup on persistence) | 1 card | **PASS** |
| EX-06 | Connect, **kill hub**, reload (error), **restore hub**, reload | Error when down; recovers when back up | Banner when down; grid recovers when up | **PASS** |
| EX-07 | Enter shell → Back → **enter again** | Repeated navigation stays correct | Second entry shows correct title | **PASS** |
| EX-08/09 | Whole exploratory run | No JS dialogs (no XSS exec), no page errors | dialogs=0; pageErrors=[] | **PASS** |

**Exploratory run: 9 / 9 PASS.**

---

## 4. Defects

**No functional defects found.** The slice's behavior-under-test is solid: empty state, connect→card with correctly auto-derived title/description, idempotent re-connect, clear in-place error handling for every bad-input class, multi-project grid, shell entry + Back, keyboard operability, backend-down resilience, and — importantly — **untrusted README/manifest content is rendered as inert, escaped text** (Angular interpolation only; no `<script>`/`<img>` injection, no `alert()` execution) on both the card and the shell.

### Observations / design-deviations (not functional defects — raised for `/po` + `/ui` triage)

These are gaps between the **design spec** (`ui-design.md` §2.2/§2.1) and the **shipped slice**. They do not break the behavior actually under test, but they are scope/UX deltas worth recording:

| # | Severity | Observation |
|---|----------|-------------|
| OBS-1 | Low (UX) | **Connect progress is a generic spinner, not the spec's step-checklist / determinate bar.** §2.2 describes a streaming "✓ Detected stack / ✓ Read README / ◐ Summarising…" checklist; the slice shows one "Analysing project…" spinner. With a local hub the analyzing phase is near-instant, so the spinner is barely perceptible — acceptable for the MVP slice, but the richer progress UI is unbuilt. |
| OBS-2 | Low (UX) | **No "ready" confirmation toast.** §2.2 State 3 specifies a one-time `"<name> ready — open it →"` toast. Not present; the card simply appears. |
| OBS-3 | Low (scope) | **Cards omit the live mini-status from the design.** §2.1 cards show stack chips + workflow state ("workflow running ●") + task counts ("12 tasks · 2 ⧗human"). The slice renders title, description, a generic `status` dot+label (the registry status, e.g. "connected"), and last-seen — no workflow/task counts. Stack chips render only when the profile carries a `stack[]`. Consistent with this being an early slice; flagging so it isn't mistaken for "done per design." |
| OBS-4 | Info | **No folder picker** — a free-text path field is used by design intent (picker is a deferred host/PlatformBridge capability). Documented in `connect-panel.component.ts`. Noting it so the design's "Choose folder…" affordance isn't expected yet. |
| OBS-5 | Low (UX) | **Error copy is generic** for all input errors ("Couldn't connect that folder.") with the specific hub reason as a sub-line ("path must be absolute", etc.). Clear enough, but the reason text is raw hub-speak rather than user-tuned guidance. |

---

## 5. Assessment & sign-off

- **Acceptance-criteria coverage (the eight behaviors under test): fully met.** Every behavior — empty state, connect/derive, idempotency, error handling (bad path / file / relative / blocked-blank), multi-project grid, shell entry + Back, untrusted-content inertness, keyboard-only operation, and hub-down resilience — passed.
- **Security (XSS):** strong. Untrusted README/manifest text reaches the DOM only via Angular interpolation and renders as escaped, inert text on both surfaces; no script execution observed even with active `<script>`/`onerror` payloads.
- **Resilience:** the UI degrades gracefully (error banner / preserved state) and never hangs when the hub is unreachable, mid-connect, or asked for an unknown id.
- **Stated assumptions / limits:**
  - Tested against the production build served via a faithful static+proxy stand-in for `ng serve`; the dev-server proxy itself (`proxy.conf.js`) was not exercised in this run, but its contract (changeOrigin + strip Origin + keep X-AIDT) was replicated.
  - The slice's panels (Workflow / Tasks / Base) are intentional placeholders ("coming soon") — verified present, not functionally tested (out of scope).
  - "last-seen" only ever read "just now" because all connects were fresh within the run; the relative-time formatter (`Xm/Xh/Xd ago`) was not exercised at longer ages.

**Verdict:** **PASS** for the Projects Home + Shell slice under test. No bug tickets filed. OBS-1…OBS-5 are design/scope deltas for `/po` + `/ui` to triage against MVP scope — not blockers.

**Summary counts:** Functional **19/19 PASS**, Exploratory **9/9 PASS**, Defects **0**, Observations **5** (4×Low, 1×Info).

*/sm — please update sprint status.*
