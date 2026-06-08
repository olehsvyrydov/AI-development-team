# VERIFY — Cockpit v2 slice (ADT-218 / ADT-219 / ADT-220)

> **/verify — Verification & Completion Auditor. Owns the `VERIFIED` (hard) gate.**
> Final completeness gate for the uncommitted Cockpit v2 change on `feat/dart`. Adversarial
> audit: assumes incomplete until proven. Tests, build, and Playwright were **independently
> re-run** (not trusted from prior claims). Every binding contract was checked against the
> actual source, not the review's claim about it.
> Inputs read in full: `.workflow-state.json` (218/219/220 gates), `approvals/arch-cockpit-v2.md`
> (A-1..A-5 + §3.2 C-FS), `approvals/secops-cockpit-v2.md` (C-1..C-15 / N-1..N-15),
> `reviews/rev-cockpit-v2.md`, `ui-design-cockpit-v2.md`, `cockpit-promotion-apex.md`,
> the changed source under `hub/` and `studio/cockpit/src/`, and the e2e/qa testing docs.

**Verdict (summary up top): `VERIFIED` — PASS for ADT-218, ADT-219, ADT-220.** 0 blocking
gaps. All upstream hard gates (ARCH / SECOPS / DESIGN / CODE_REVIEWED) are genuinely satisfied
in code, not merely labelled. The two non-blocking WARNINGs the review handed forward (W1
focus-return, W2 needsYou overlay seeding) are **both fixed and evidenced**. Two non-blocking
notes carried forward (see §6).

---

## 1. Re-run results (independent — this audit, not prior claims)

| Command | Result | Expected | Verdict |
|---|---|---|---|
| `node --test hub/test/*.test.js` | **125 pass, 0 fail** | ~125 | ✅ |
| `cd studio/cockpit && npm test` | **118 pass, 0 fail (16 files)** | ~118 | ✅ |
| `cd studio/cockpit && npm run build` | **bundle generation complete** (`dist/cockpit`) | succeed | ✅ |
| `cd studio/cockpit && npx playwright test` | **13 passed (chromium, 11.8s)** | ~13 | ✅ |

Hub rose 124→125 and cockpit 107→118 since the review — consistent with the W1/W2 fixes and
the new bug-fix coverage. No flakiness observed; the Playwright run was clean on the first try
(chromium already installed). The QA precondition for `VERIFIED` is met: a black-box QA report
(`testing/qa-cockpit.md`) and an E2E report (`testing/e2e-cockpit-v2.md`) exist, and the e2e
suite was independently re-run green.

---

## 2. ADT-218 — Projects Home (first-run pitch + enriched card + global needs-you strip)

Binding ACs: arch **A-1** (taskSummary + compact LIST), **A-4** (governance badge), absent-not-zero;
secops **§5** ratified claim strings; design (enriched card, first-run hero/3-step/trust strip).

| AC / contract | Status | Evidence |
|---|---|---|
| `taskSummary{total,byStatus}` derived in `state.js` from projected `tickets[]`; core buckets sum to `total` | **Implemented + Evidenced** | `state.js:235-249` `summarizeTasks` folds the single `status` into `in_progress/waiting/blocked/done`; `state.test.js` asserts the sum |
| `needsYou` is an **overlay**, not a sixth summed bucket (W2 fix) | **Implemented + Evidenced** | `state.js:236-241` counts `needsYou` in a **separate** variable; the summed buckets come from a disjoint `core` map with no `needsYou` key — the latent double-count is gone |
| `needsYou` derivation = hard-gate-rejected **OR** waiting+expectedOwner+no-active | **Implemented + Evidenced** | `state.js:225-229` `needsHumanDecision` matches A-1 exactly |
| Compact LIST `{open,needsYou}`, `open=total-done`, omitted when unknown | **Implemented + Evidenced** | `state.js:409-422` `listSummary`; absent on failure (`taskSummary=null`, `:381`) |
| Absent-not-zero (never a fabricated 0) | **Implemented + Evidenced** | per-projection `try/catch → null`; card pulse `@if (pulse(); as p)`, needs-you chip `@if (p.needsYou > 0)`, strip `@if (totalNeedsYou() > 0)` (`projects-home.component.ts:117`, `project-card.component.ts:81-84`) |
| Governance badge = pure ledger-derived projection; "Security-reviewed" only when SECOPS passed; absent otherwise | **Implemented + Evidenced** | `project-card.component.ts:42-43` renders only on `gov.kind === 'security-reviewed'`; danger "blocked at {stage}" for a hard rejected gate; distinguished by shield glyph + text + colour |
| Ratified claim strings ship **verbatim** (badge tooltip, picker subtitle/footer, no-egress caveat) | **Implemented + Evidenced** | `copy.ts:47-58` match secops §5.2/§5.3 byte-for-byte; centralised + quoted once |
| No rejected absolute ("never leaves the cloud", "100% private", "verified secure", …) | **Implemented + Evidenced** | grep of `studio/cockpit/src/` → **NONE found** |
| First-run hero (anchor + 3-step + trust chips + CTA) + enriched card (glyph tile, 2-line desc, task pulse) | **Implemented + Evidenced** | `copy.ts` ANCHOR/HOW_STEPS/TRUST_CHIPS; e2e `01-launcher` "first-run empty state pitches the product" |
| Card title wrap (bug fix) — own full-width line, whitespace-wrap not hyphen, 2-line clamp, full name in `title` | **Implemented + Evidenced** | `project-card.component.ts:65,140-152` `word-break:normal; overflow-wrap:normal; -webkit-line-clamp:2`; full name via `[attr.title]` |

**Verdict: PASS.** No blocking gap.

---

## 3. ADT-219 — Project Shell (long-description header + Workflow / Tasks / Base read panels)

Binding ACs: arch **A-2** (`workflowView` + `base` read-only projections, honest `base.method`,
per-panel isolation); design (long-desc header, Workflow rail hard/soft by SHAPE, Tasks
proportion bar, Base index facts + add-docs invitation).

| AC / contract | Status | Evidence |
|---|---|---|
| `workflowView{activeTrack,stages[{stage,owner,gate{name,refusal}\|null}]}` read-only projection | **Implemented + Evidenced** | `state.js:267-278` `projectWorkflowView`; `:382-385` wrapped in try/catch → null; `state.test.js` falls-back-to-longest-track test |
| Hard/soft gate carried by **SHAPE** (solid vs dashed shield), not colour | **Implemented + Evidenced** | `workflow-panel.component.ts:55` `stroke-dasharray = hard ? null : '3 2'`; screen-reader prose mirrors "(hard gate)" |
| `base{method,counts,docs}`; `method` honestly `filename-only` unless a real embedder is configured | **Implemented + Evidenced** | `state.js:284-309` `embedderConfigured` → `local-embeddings` only when memory config selects non-'none'; UI renders "Filename index only — connect an embedder…" otherwise (`base-panel.component.ts:166-169`) |
| Counts honest (filename floor: indexed = doc count, indexing/failed = true 0) | **Implemented + Evidenced** | `state.js:305-309` no async pipeline this slice → 0 by construction, not fabricated |
| Per-panel error isolation (one failing projection does not blank the others) | **Implemented + Evidenced** | each projection in its own `try/catch → null` (`state.js:381-385`); e2e `02-project-shell` exercises each panel independently |
| Long-description header rendered untruncated | **Implemented + Evidenced** | e2e `02-project-shell` "shell header renders the full long description untruncated" |
| Inert "soon" affordances (bug fix) — disabled, `aria-disabled`, do not navigate | **Implemented + Evidenced** | `base-panel`/`tasks-panel`/`workflow-panel` footers `disabled aria-disabled="true"` "(coming soon)"; e2e `02` "the 'soon' footer affordances are present but disabled — they do not navigate" |

**Verdict: PASS.** No blocking gap. (No SECOPS hard gate triggered by 219 — read-only projections,
no new attack surface.)

---

## 4. ADT-220 — Folder picker + read-only directory-browser endpoint (the one new attack surface, HARD SECOPS gate)

This is the hard, safety-override gate. I re-confirmed the NEGATIVE is proven in real,
executing tests — not asserted. Each C-condition checked against actual source; each N-test read
to confirm it would fail if the control were removed.

### 4.1 Containment & no-leak (C-1..C-8, C-11..C-14) — verified in `hub/lib/fs-browse.js`

| Condition | Status | Evidence (source) |
|---|---|---|
| **C-1** single root `REAL_HOME = realpath($HOME)` resolved once | **Implemented + Evidenced** | `fs-browse.js:44-49` `realHome()` caches `fs.realpathSync(os.homedir())` |
| **C-2/C-12** reject non-string/relative/NUL/empty/over-long before any FS work; missing → root | **Implemented + Evidenced** | `validateRequestPath:68-76`, called first in `listDirectory:85`; `MAX_PATH_LENGTH=4096` |
| **C-3** realpath BEFORE containment; non-existent/non-dir → 404/400 | **Implemented + Evidenced** | `confinedHome:57-63` realpaths first; `statSync`+`isDirectory` after (`:91-93`) |
| **C-4** containment `real===root \|\| startsWith(root+sep)`; trailing-sep (rejects /home/foo vs /home/foobar) | **Implemented + Evidenced** | `confinedHome:60-61` uses `root + path.sep`; rule byte-identical to `analyze.js::confinedPath` |
| **C-5** per-child realpath; escaping symlink child **skipped-not-followed** | **Implemented + Evidenced** | loop `:103-113`; `childReal = confinedHome(...)`; `if (!childReal) continue` (`:108`) |
| **C-6** `parent` null at root, else contained + realpath'd | **Implemented + Evidenced** | `:115` `real===root ? null : confinedHome(root, dirname(real))` |
| **C-7** entry exactly `{name,type:'dir',hasProject}`; readdir only; files omitted; no stat fields | **Implemented + Evidenced** | `:112` pushes exactly those keys; `readdirSync(withFileTypes)`; non-dirs `continue`; **no `readFile`/`open`/`readSync` anywhere on the path** (grep confirms) |
| **C-8** `hasProject` = artefact-marker existence only, containment-checked | **Implemented + Evidenced** | `hasArtefacts(childReal)` (existence/realpath only, no bytes) |
| **C-10** pure read, no mutation; non-GET → 405 | **Implemented + Evidenced** | `projects.js:132` method≠GET → 405; no write call on the path |
| **C-11** dotfiles listed name-only, contents never read | **Implemented + Evidenced** | one-level `readdir` lists `.ssh` by name; N-5 dotfile test proves no bytes leak |
| **C-13** one level, entry cap + `truncated:true`, wall-clock budget, no file reads | **Implemented + Evidenced** | `:100-104` caps on `MAX_ENTRIES`/`TIME_BUDGET_MS`, sets `truncated`; non-recursive |
| **C-14** recent roots each containment-checked (stale escape omitted) | **Implemented + Evidenced** | `listRoots:125-135` realpath+contain each recent, omit on escape |

### 4.2 Access guard on the GET (C-9) — verified in dispatch (both paths)

| Condition | Status | Evidence |
|---|---|---|
| **C-9** both fs GETs require `writeAllowed` **before any FS work**; no permissive CORS | **Implemented + Evidenced** | `server.js:144-152` gates FIRST then dispatches; `projects.js:172-177` same; missing X-AIDT / bad Host/Origin / non-loopback socket → 403; N-10 asserts no `Access-Control-Allow-Origin` |

### 4.3 Negative tests (N-1..N-15) — all present, real, executing (`hub/test/fs-browse.test.js`)

N-1 `..`-climb refused · N-2 absolute-outside (`/etc`,`/`) refused · N-3 escaping symlink-as-path
refused · N-4 escaping symlink **child skipped**, siblings kept · N-5 exact-3-keys / no
size/mtime / `.ssh` key-bytes absent · N-6 NUL/relative/non-dir/over-long/empty/non-string
rejected before any FS read · N-7 missing X-AIDT → 403 (both routes, real HTTP) · N-8 bad
Host / cross-site Origin → 403 · N-9 non-loopback socket → 403 · N-10 no permissive CORS ·
N-11 DoS cap + `truncated:true` · N-12 one-level, no file read · N-13 parent null at Home ·
N-14 series of calls mutates nothing on disk · N-15 containment helper proves the prefix trap,
`..`-climb, and symlink-escape. **All 15 green** in the 125-pass re-run. Each is a genuine
refusal/skip/cap assertion that would fail if its control were removed (spot-checked N-7/N-8/N-10
as live HTTP 403/header assertions).

### 4.4 Design / a11y (folder picker) + bug fixes

| AC / contract | Status | Evidence |
|---|---|---|
| Focus-trapped `role="dialog"` picker; roots/recent + folders-only listbox; select-on-click / drill-on-chevron; has-project badge + adopt hint; init-vs-adopt result | **Implemented + Evidenced** | folder-picker + connect-panel; e2e `01-launcher` picker open/navigate/connect tests |
| **Esc closes + focus returns to opener** (W1 fix) | **Implemented + Evidenced** | `connect-panel.component.ts:167-187` captures opener on open, `restoreOpenerFocus()` on every close path (Cancel/✕/backdrop/Esc) **and** on choose; e2e `01` "ESC restores focus" + `03-coverage` "every picker close path … restores opener focus" both pass |
| Connect-current-folder path returns the chosen absolute path through the connect contract | **Implemented + Evidenced** | `onChosen` emits `connect`; e2e `01` "connect via the picker adds a card; clicking it navigates to the project shell" |
| `PlatformBridge.pickDirectory()` seam (native picker swaps in later) | **Implemented + Evidenced** | `platform-bridge.ts` adds `pickDirectory()`; `platform-bridge.spec.ts` covers it |
| Untrusted README/folder name rendered inert (XSS) | **Implemented + Evidenced** | interpolation only (`{{ entry.name }}`); no `[innerHTML]`/`bypassSecurityTrust*`; e2e `01` "untrusted README renders as inert text" |

**Verdict: PASS.** The hard SECOPS gate is genuinely satisfied: containment is real code reusing
the proven `confinedPath` rule, the guard-on-GET fires before any FS work in both dispatch paths,
and every negative is proven by an executing test. No blocking gap.

---

## 5. Code Standard (facts-only) scan — changed source only

Grepped all changed **source** files (excluding tests/specs/docs) for `ADT-\d+`, condition codes
(`C-1`, `N-1`), `PD-\d+`, `sprint-0`, persona names (Jorge/Aura/Apex/Soren/Finn/James/Luda),
agent commands, and approval-doc filenames.

- **Result: CLEAN.** The only matches are `/po` and `/arch` in `shell/workflow-panel.component.ts`
  (lines 10, 137). These are **product domain content** — the panel renders the dev-team workflow
  and its stage owners as the product's subject matter (data sourced from the model / `workflow.yaml`),
  and the doc-comment uses them illustratively for the screen-reader prose format. They are not a
  leaked artifact about how *this* change was built. **Not a violation** (concurs with /rev §6).
- No ticket IDs, condition codes, sprint refs, or approval-doc filenames in source.
- The WARNING-1 non-fact doc-comment flagged at /rev (picker focus-return claimed but not
  implemented) is now **a true fact** — the behaviour it describes is implemented.

---

## 6. Findings

- **VERIFY-218-W2 (resolved):** `summarizeTasks` previously seeded `needsYou` inside the summed
  bucket map (latent double-count). **Fixed** — `state.js:236-241` now counts `needsYou` in a
  disjoint variable; summed buckets come from a `core` map with no `needsYou` key. ✅
- **VERIFY-220-W1 (resolved):** folder picker did not return focus to the opener and the
  doc-comment falsely claimed it did. **Fixed** — `connect-panel.component.ts:167-187`
  restores opener focus on every close path; doc-comment now factual; proven by two e2e specs. ✅
- **⚠️ NOTE FYI-2 (non-blocking, carried from /rev):** N-9 proves the socket arm of `writeAllowed`
  directly rather than driving a real non-loopback socket through `/api/fs/list` (impractical
  in-process). The route demonstrably wires `writeAllowed` with `realPort`/`allowRemote`, and
  N-7/N-8 exercise the header/Host/Origin arms over real HTTP. Coverage adequate. No action.
- **⚠️ NOTE FYI-3 (non-blocking, carried from /rev):** `confinedHome` is a byte-identical
  containment-rule equivalent of `analyze.js::confinedPath` (not a direct call), justified because
  the fs-browse input is an absolute path, not a relative segment. C-4 permits "reuse OR
  byte-identical equivalent". No action.

---

## 7. Audit Summary

### Scores
- Structural / AC completeness (218/219/220): **all ACs Implemented + Evidenced**
- Placeholder count: **0**
- Facts-only violations in changed source: **0**
- Security conditions C-1..C-15: **15/15 met in code**; negative tests N-1..N-15: **15/15 green**
- Blocking gaps: **0**
- Re-run: hub **125/125**, cockpit **118/118**, build **OK**, Playwright **13/13**
- **Overall Verdict: ✅ PASS**

### Gate decision
**`VERIFIED` — PASSED for ADT-218, ADT-219, ADT-220.** All upstream hard gates (ARCH / SECOPS /
DESIGN / CODE_REVIEWED) are genuinely satisfied in code. The hard SECOPS directory-browser gate
is proven by real negative tests. The two forward-handed WARNINGs are fixed and evidenced. The
ratified claim strings ship verbatim with no strengthened absolute. Two non-blocking FYIs carried
as notes; nothing blocks Done.

**Reviewed by:** /verify · **Date:** 2026-06-08 · **Status:** VERIFIED (gate PASS) ·
**Next:** the slice is complete and ready to commit. Then `/sm` — please update sprint status.
