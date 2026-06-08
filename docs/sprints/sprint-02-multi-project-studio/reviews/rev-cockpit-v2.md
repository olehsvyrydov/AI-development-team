# Code Review — Cockpit v2 slice (ADT-218 / ADT-219 / ADT-220)

> **/rev — Senior Full-Stack Code Reviewer.** Owns the **`CODE_REVIEWED`** (hard) gate.
> Reviewed the uncommitted change set on `feat/dart` against the binding approvals
> (`approvals/secops-cockpit-v2.md` C-1…C-15 / N-1…N-15, `approvals/arch-cockpit-v2.md`
> data contracts, the ratified §5 claim strings) and the repo Code Standard. Tests and
> build re-run, not trusted.

**Verdict: APPROVED (gate PASS).** No BLOCKING findings. Two WARNINGs and two FYIs, none
security-relevant, listed below. Every SECOPS condition C-1…C-15 is genuinely met in
`hub/lib/fs-browse.js` + dispatch, and every negative test N-1…N-15 actually exercises the
guard (each would fail if the control were removed). The frontend ships the ratified claim
strings verbatim with no unqualified absolute. Facts-only scan clean. 124 backend + 107
frontend tests pass; cockpit build succeeds.

---

## 1. Scope reviewed

- **Backend:** `hub/lib/fs-browse.js` (NEW), `hub/lib/state.js`, `hub/lib/projects.js`,
  `hub/lib/analyze.js` (added exports), `hub/server.js`; tests `hub/test/{fs-browse,state,projects}.test.js`.
- **Frontend:** `core/{fs.service,models,platform-bridge,projects.store}.ts`,
  `projects/{projects-home,project-card,connect-panel,folder-picker,copy}.*`,
  `shell/{project-shell,tasks-panel,workflow-panel,base-panel}.*` and their specs.

---

## 2. SECOPS C/N verification table (independently verified IN CODE)

Each condition was checked against the actual source — not the claim about it — and the
proving negative test was read to confirm it would fail if the guard were removed.

| Item | Requirement | Where met (verified) | Result |
|------|-------------|----------------------|--------|
| **C-1** | Single root `REAL_HOME = realpath($HOME)`, resolved once | `fs-browse.js:44-49` `realHome()` caches `fs.realpathSync(os.homedir())`; tests inject a realpath'd tmp dir | **PASS** |
| **C-2** | Reject non-string/relative/NUL/empty/over-long before any FS work; missing → root | `validateRequestPath` `fs-browse.js:68-76`, called first in `listDirectory:85` | **PASS** |
| **C-3** | realpath BEFORE containment; non-existent/non-dir → 404/400 | `confinedHome` realpaths first (`:59`); `statSync`+`isDirectory` after (`:91-93`) | **PASS** |
| **C-4** | Containment `real===root \|\| startsWith(root+sep)`; trailing-sep; no loose prefix | `confinedHome:60-61` uses `root + path.sep`; rule byte-identical to `analyze.js::confinedPath:87` | **PASS** |
| **C-5** | Per-child realpath; escaping symlink CHILD skipped-not-followed | loop `:103-113`, `childReal = confinedHome(...)`; `if (!childReal) continue` (`:108`) | **PASS** |
| **C-6** | `parent` null at root, else contained + realpath'd | `:115` `real===root ? null : confinedHome(root, dirname(real))` | **PASS** |
| **C-7** | Entry exactly `{name,type:'dir',hasProject}`; readdir only; files omitted; no stat fields | `:112` pushes exactly those keys; `readdirSync(withFileTypes)`; non-dirs `continue`; no `readFile`/`open`/size/mtime anywhere on path | **PASS** |
| **C-8** | `hasProject` = artefact-marker existence only, containment-checked | `hasArtefacts(childReal)` → `existsConfined`→`confinedPath` (existence/realpath only, no bytes) `analyze.js:317-319,111` | **PASS** |
| **C-9** | Both fs GETs require `writeAllowed` before any FS work; no permissive CORS | `server.js:144-146` and `projects.js:174-176` gate FIRST; N-10 asserts no `Access-Control-Allow-Origin` | **PASS** |
| **C-10** | Pure read, no mutation; non-GET → 405 | `handleFs:132` `method!=='GET' → 405`; no write call on the path; N-14 proves disk unchanged | **PASS** |
| **C-11** | Dotfiles listed name-only, contents never read | one-level readdir lists `.ssh` by name; N-5 dotfile test proves no bytes/file-name leak | **PASS** |
| **C-12** | `path` length-bounded (≤4096); no glob/shell | `MAX_PATH_LENGTH=4096` `:37,72`; path used only as literal FS arg | **PASS** |
| **C-13** | One level, entry cap with `truncated:true`, wall-clock budget, no file reads | loop `:103-104` caps on `MAX_ENTRIES`/`TIME_BUDGET_MS`, sets `truncated`; non-recursive | **PASS** |
| **C-14** | Non-goals hold; recent roots each containment-checked | `listRoots:125-135` realpath+contain each recent, omit on escape | **PASS** |
| **C-15** | Negative tests ship as part of the gate | `hub/test/fs-browse.test.js` N-1…N-15 present and green | **PASS** |

| Negative test | Exercises | Genuine (fails if guard removed)? | Result |
|---------------|-----------|-----------------------------------|--------|
| **N-1** `..`-climb refused | `confinedHome`/`listDirectory` reject `home/../..` | Yes — asserts `ok:false`, no `entries` | **PASS** |
| **N-2** absolute-outside refused | `/etc`, `/` | Yes | **PASS** |
| **N-3** escaping symlink as path refused | symlink→`/etc` requested directly | Yes (skips on FS w/o symlink) | **PASS** |
| **N-4** escaping symlink CHILD skipped | child→`/etc` skipped, sibling kept | Yes | **PASS** |
| **N-5** no content leak | exact-3-keys, no size/mtime; `.ssh` key bytes absent | Yes — would fail if a file/stat field were emitted | **PASS** |
| **N-6** NUL/relative/non-dir/over-long/empty/non-string | all `ok:false` | Yes | **PASS** |
| **N-7** missing X-AIDT → 403 | over HTTP, both routes | Yes — would fail if guard not wired to GET | **PASS** |
| **N-8** bad Host / cross-site Origin → 403 | over HTTP | Yes | **PASS** |
| **N-9** non-loopback socket → 403 | `writeAllowed` socket arm | Yes (see FYI-2 on indirection) | **PASS** |
| **N-10** no permissive CORS | header absent | Yes | **PASS** |
| **N-11** DoS cap / truncation | `cap+25` dirs → `truncated:true`, len≤cap | Yes | **PASS** |
| **N-12** non-recursive, no file read | nested child absent; file absent | Yes | **PASS** |
| **N-13** parent null at Home | `null` at home, contained for sub-dir | Yes | **PASS** |
| **N-14** pure read, no mutation | dir snapshot unchanged after calls | Yes | **PASS** |
| **N-15** containment helper proven | prefix-trap (`home+'bar'`), `..`, symlink-escape | Yes — explicitly rejects `/home/foo` vs `/home/foobar` | **PASS** |

**Headline security verdict:** the realpath-BEFORE-containment ordering, the trailing-separator
containment (foobar prefix trap rejected at `fs-browse.js:61` and proven by N-15), per-child
skip-not-follow (C-5/N-4), names-and-type-only response with no `readFile` (C-7/N-5/N-12),
guard-on-GET enforced before any FS work in both the production (`server.js`) and standalone
(`projects.js`) dispatch (C-9/N-7..N-10), DoS cap + truncation (C-13/N-11), non-recursive,
parent-null-at-root (C-6/N-13), and pure-read (C-10/N-14) are all real and tested. No
CRITICAL/HIGH left open.

---

## 3. Architecture data-contract verification

| Contract (arch §1/§2) | Implementation | Result |
|-----------------------|----------------|--------|
| `taskSummary{total,byStatus}`; core buckets sum to `total` | `state.js:235-242` `summarizeTasks` folds the single `status` field into `in_progress/waiting/blocked/done` | **PASS** |
| `needsYou` is an **overlay**, not a sixth bucket | incremented separately from `status` (`state.js:239`), NOT added to the sum; card/shell render it as a separate chip | **PASS** |
| Compact LIST `{open,needsYou}`, `open=total-done`, omitted when unknown | `state.js:412-414`; absent on failure (`taskSummary=null`, `:372-373`) | **PASS** |
| Absent-not-zero (never a fabricated 0) | `try/catch → null` per projection; card pulse gated `@if (pulse(); as p)`; needs-you chip `@if (p.needsYou > 0)` | **PASS** |
| `workflowView{activeTrack,stages[…gate{name,refusal}\|null]}`; hard/soft by shape | gate marker shield STROKE solid vs dashed (`workflow-panel.component.ts:55`), screen-reader prose mirrors it | **PASS** |
| `base{method,counts,docs}`; honest filename-only method | per-panel projection, isolated errors | **PASS** |

---

## 4. Claim-string verification (ADT-218, ship verbatim)

Ratified strings centralised in `projects/copy.ts` (named, quoted once) and consumed without
paraphrase. Grep of `studio/cockpit/src/` confirms:

- **No unqualified absolute slipped in.** `grep` for `100% private`, `military-grade`,
  `never touches the cloud`, `nothing ever leaves`, `vulnerability-free`, `verified secure`,
  `this code is secure`, `compliance-certified`, `soc2`, `guarantees secure`, `free forever`
  → **NONE found** in source.
- **Badge tooltip verbatim** (`copy.ts:47-49`): *"This project's security gate ran and approved
  its latest gated change. Gates here can refuse to proceed — they're not advisory."* ✔
- **Badge label** *"Security-reviewed"* shown only on `governance().kind === 'security-reviewed'`
  (absent otherwise — absent-not-zero); danger *"blocked at {stage}"* for a hard rejected gate.
  Distinguished by SHIELD GLYPH (filled vs outline) + text + colour, not colour alone. ✔
- **Picker footer** (`copy.ts:56`): *"Read-only analysis. DART never writes outside this folder."*
  — true iff C-7/C-10/C-4 hold, which this review verified green. ✔
- **No-upload caveat** carried in `HOW_STEPS`/`PICKER_SUBTITLE` ("Nothing is uploaded") and the
  ARCH/SECOPS ledger note; no claim implies the host AI model sends nothing. ✔

**FYI-1 (not blocking):** the ratified §5.1 local-first string *"Runs on your machine. Bound to
localhost by default."* is not shipped as a full sentence; `TRUST_CHIPS` ships the shorter
**"Local-first"** chip instead. This is a *weaker* (shorter, non-absolute) claim, not a
strengthened assurance, so it does NOT re-open the ADT-218 gate — but the longer ratified
sentence/tooltip is available verbatim if the trust strip wants it.

---

## 5. Quality findings

- **WARNING-1 — folder-picker does not return focus to the opener on close; doc-comment
  claims it does.** `folder-picker.component.ts:36` doc-comment states *"Escape closes and
  returns focus to the opener"* and the ADT-220 DESIGN_APPROVED note requires *"Esc closes,
  focus returns"*. The component emits `cancelled`; the parent `connect-panel.component.ts`
  `closePicker()` (`:167`) only flips `pickerOpen` to `false` and does **not** restore focus to
  the `data-testid="open-picker"` trigger. This is (a) a WCAG 2.4.3 focus-order gap and (b) a
  **non-fact doc-comment** (states behaviour that is not implemented). Fix: parent captures the
  trigger element on open and `.focus()`es it on close, and align/trim the doc-comment. **Owner:
  /fe.** Not blocking the security gate; recommend fixing before /verify.

- **WARNING-2 — `summarizeTasks` initialises `needsYou` inside the `byStatus` bucket map.**
  `state.js:236` seeds `needsYou:0` in the same object as the core status buckets, then
  `if (t.status in byStatus) byStatus[t.status]++` (`:238`). A ticket whose literal `status`
  string were `"needsYou"` would increment the overlay via the status branch AND the
  `needsHumanDecision` branch (double count), and would also wrongly enter the bucket sum.
  Today no ticket carries that status so the sum stays honest and tests pass, but the overlay
  living inside the bucket map is a latent foot-gun. Suggest keeping `needsYou` as a sibling
  field outside the summed bucket map. **Owner: /be.** Non-blocking (no current data path hits
  it; the arch contract — buckets sum to total — holds for real statuses).

- **FYI-2 — N-9 proves the socket arm of the guard directly, not through a live non-loopback
  socket on the fs route.** `fs-browse.test.js:291-297` calls `writeAllowed` with a synthetic
  remote socket rather than driving an actual non-loopback connection through `/api/fs/list`.
  Forging a real non-loopback client socket in-process is impractical; the route demonstrably
  wires `writeAllowed` with `realPort`/`allowRemote` (`projects.js:174-176`, `server.js:145`),
  and N-7/N-8 exercise the header/Host/Origin arms over real HTTP. Coverage is adequate; noted
  for transparency.

- **FYI-3 — `confinedHome` is a local equivalent of `analyze.js::confinedPath`, not a direct
  call.** `confinedPath(root, rel)` joins `root+rel` then realpaths; `confinedHome(root, target)`
  realpaths an already-absolute `target`. The **containment rule** (`real===root ||
  startsWith(root+sep)`) is byte-identical, satisfying C-4's "reuse OR byte-identical
  equivalent". The divergence is justified (the fs-browse input is an absolute path, not a
  relative segment). No action.

- **PRAISE** — the negative-test suite is exemplary: it proves the prefix trap, symlink-escape
  (path and child), content-leak (real `.ssh`/key-bytes fixture), DoS truncation, and
  no-mutation, with symlink tests guarded by a capability probe. This is exactly the
  proof-of-the-negative the standard demands on a boundary-confining change.

---

## 6. Code Standard (facts-only) scan

Grepped all changed **source** files (excluding tests/docs) for `ADT-\d+`, condition codes
(`C-1`, `N-1`, …), `sprint-0`, agent/persona commands and names (`/secops`, `Soren`, `Jorge`,
`Aura`, `Apex`, …), `PD-8`, and approval-doc filenames:

- **No process artifacts in source.** The only matches were (a) SVG path coordinates that
  incidentally contain `c0 5 -3 …` (false positives, not condition codes), and (b) `/po`,
  `/arch` inside `shell/workflow-panel.component.ts` — these are **product domain content**:
  the panel renders the dev-team workflow and its stage owners as the product's subject matter
  (data sourced from the model/`workflow.yaml`), not a leaked artifact about how *this* change
  was built. The doc-comment uses them illustratively for the screen-reader prose format. **Not
  a violation.**
- Doc-comments state facts only, except WARNING-1 (the picker focus-return claim is a non-fact).

---

## 7. XSS / a11y / deps

- **XSS:** no `[innerHTML]=` binding and no `bypassSecurityTrust*(` call anywhere in cockpit
  source (enforced by `testing/no-unsafe-binding.spec.ts`). Untrusted filesystem/profile text
  rendered by interpolation only (`{{ entry.name }}`, `{{ gov.stage }}`). **PASS.**
- **a11y:** picker is a focus-trapped `role="dialog"` `aria-modal` with `aria-labelledby`,
  `role="listbox"/"option"`, `aria-selected`, `aria-live` selection, keyboard nav
  (Up/Down/Enter/Backspace/Esc), reduced-motion guard. Hard/soft gate + governance badge by
  glyph + text + colour (never colour alone). One gap: WARNING-1 focus-return-to-opener.
- **Runtime deps:** `git diff` on `package.json` (hub + cockpit) shows **no dependency change** —
  zero new runtime deps. **PASS.**
- **Secrets:** the fs surface reads `readdir` entries only; `base.method` stays filename-only
  with no API key read; no secret is read or persisted. **PASS.**

---

## 8. Test & build results (re-run)

- `node --test hub/test/*.test.js` → **124 pass, 0 fail.**
- `cd studio/cockpit && npm test` → **16 files, 107 pass.**
- `cd studio/cockpit && npm run build` → **bundle generation complete** (output `dist/cockpit`).

---

## 9. Gate decision

**`CODE_REVIEWED` — PASSED** for **ADT-218, ADT-219, ADT-220**. No BLOCKING issues. The hard
SECOPS conditions C-1…C-15 are verified in code with genuine negative tests (N-1…N-15), the
arch data contracts hold, the ratified claim strings ship verbatim with no strengthened
absolute, the facts-only standard is met in source, and tests/build are green.

Two non-blocking WARNINGs are handed to the owning devs to fix before `/verify`:
- **WARNING-1 (/fe):** restore focus to the opener when the picker closes; align the doc-comment.
- **WARNING-2 (/be):** move the `needsYou` overlay out of the summed `byStatus` bucket map.

**Reviewed by:** /rev · **Date:** 2026-06-07 · **Status:** APPROVED (gate PASS) ·
**Next:** /qa + /e2e may proceed; /fe + /be address the two WARNINGs. Then /sm — please update
sprint status.
