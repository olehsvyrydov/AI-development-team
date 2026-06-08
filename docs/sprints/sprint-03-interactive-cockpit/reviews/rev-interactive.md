# Code Review — Sprint 03 Interactive Cockpit (ADT-221 / ADT-222 / ADT-223)

**Reviewer:** /rev · **Date:** 2026-06-08 · **Branch:** `feat/dart-interactive`
**Developers:** /be (hub) + /fe (cockpit) · **Gate owned:** `CODE_REVIEWED` (hard)
**Scope:** the uncommitted change set vs the branch point — backend `hub/lib/{write,api}.js` +
`hub/test/{kb-write,overlay-cas,mutation-guard}.test.js`; cockpit `core/{control-plane,events,models}`
and the `shell/*` interactive components and their specs.

**Reviewed against (binding):** `approvals/secops-interactive.md` (C-1…C-19, N-1…N-19, ADT-223 HARD
gate), `approvals/arch-interactive.md` (data contracts; optimistic write + `expectedRev`/409 everywhere;
overlay-only), the repo Code Standard (facts-only/self-describing).

---

## Verdict

- **ADT-221 — APPROVED.** `CODE_REVIEWED = passed`.
- **ADT-222 — APPROVED.** `CODE_REVIEWED = passed`.
- **ADT-223 — APPROVED (HARD gate met).** `CODE_REVIEWED = passed`. C-1…C-12 are each present in
  code and proven by a genuine negative test (N-1…N-13) that would fail if its control were removed.

No BLOCKING findings on the reviewed delta. Two pre-existing WARNINGs (in `api.js`, not introduced by
this change set) and a handful of NITs are recorded below; none block this slice.

---

## Code Quality Summary

| Category | Status |
|----------|--------|
| Requirements match (C-1…C-19 contracts) | PASS |
| Code quality | PASS (2 pre-existing warnings in touched file) |
| Security (KB write + overlay/ledger CAS + XSS) | PASS |
| Tests (negatives genuinely exercise controls) | PASS |
| Style / facts-only (the delta) | PASS |
| Architecture compliance (overlay-only, 409 everywhere) | PASS |

---

## Re-run results (did not trust claims; avoided e2e/playwright — live hub on :4477)

- **Backend:** `node --test hub/test/*.test.js` → **157 pass / 0 fail** (matches the ~157 expected).
- **Frontend unit:** `cd studio/cockpit && npm test` → **207 pass / 0 fail** across 25 files
  (matches the ~207 expected).
- **Frontend build:** `npm run build` → **success** (initial 247 kB; `project-shell` + `projects-home`
  lazy chunks emitted).
- Behavioral probe (out-of-band, temp project): confirmed `addKbNote` accepts plain text and **rejects
  a NUL-bearing body** with `body must be text` — the implementation control behind N-11 is real.

---

## C-1 … C-19 / N-1 … N-19 verification table

Each row was verified **in code** (the control exists) **and** by re-reading the proving test (it would
fail if the control were removed). PASS = control present + proving negative real.

### ADT-223 — HARD (C-1…C-12 / N-1…N-13)

| Cond | Control (verified in source) | Proving negative | Result |
|---|---|---|---|
| C-1 | `slugify` char-class `[^a-z0-9]+`→`-`, trim, `slice(80)`; empty-slug → `reject 400`; `.md` + dir are server constants (`write.js:119-126,186-187,195`) | N-1/N-2/N-3/N-4/N-5 | **PASS** |
| C-2 | `resolveKbDir` first-existing `docs→kb→.aidevteam/kb`, else create `.aidevteam/kb`; root realpath'd, never client-supplied (`write.js:137-151`) | happy-path "docs first-existing" + N-1 listing | **PASS** |
| C-3 | realpath the target's parent and `isContained(kbDir, realParent)` **before** the write syscall; trailing-`sep` compare rejects the `/p/kb` vs `/p/kbevil` prefix-trap (`write.js:130-132,196-199`) | N-1/N-2/N-6 | **PASS** |
| C-4 | symlink-as-target refused: `O_EXCL` (`wx`) never follows/truncates a pre-existing symlink; parent realpath catches a symlinked KB dir (`write.js:215-216`, `145`) | N-6 + N-6b (REAL symlinks; secret bytes asserted intact) | **PASS** |
| C-5 | `openSync(target,'wx')` (O_CREAT\|O_EXCL); `EEXIST` → unique numeric suffix retry, never replace; atomic write+fsync (`write.js:193-206,215-223`) | N-8 (dup title, first bytes unchanged) + N-9 (pre-existing file not truncated) | **PASS** |
| C-6 | route on the `/api/*` POST path that runs `writeAllowed`; no per-route CORS (inherited by placement) | N-7 / N-18 (end-to-end `403` without X-AIDT; nothing written) + `guard.test.js` (Host/Origin/socket) | **PASS** |
| C-7 | `kbBodyError`: non-string/empty, C0-control regex, `Buffer.byteLength > 64KB`, UTF-8 round-trip; title `>200` rejected (`write.js:156-164,183`) | N-10 (oversize 400) + N-11 (NUL body 400) | **PASS** |
| C-8 | body stored verbatim/inert; FE interpolates only — no `[innerHTML]`/`bypassSecurityTrust*` anywhere (`write.js`, `no-unsafe-binding.spec.ts`, `task-detail`/`add-note-form` templates) | N-12 (verbatim store) + `task-detail` spec `querySelector('script')===null` | **PASS** |
| C-9 | writes to the same dir `readKb` scans → lists + count+1 by construction (functional) | route test: `base.counts.indexed === before+1`, `kb.some(name)` | **PASS** |
| C-10 | single chokepoint `write.js addKbNote`; atomic tmp/O_EXCL+fsync; emits no ledger/comment | inspection — no other module writes for this feature | **PASS** |
| C-11 | terse `reject(...)` strings; no path/stack echoed (`write.js:166,182-208`) | N-13 (asserts dir/tmp/stack absent from the 400 body, incl. the symlink-rejection path) | **PASS** |
| C-12 | indexing label inherited from `buildBase`/`embedderConfigured`; route triggers no embedder | `state.test.js` filename-only label; FE `indexPreview` keyed off `base().method` | **PASS** |

### ADT-221 — review (C-13…C-16 / N-14…N-16)

| Cond | Control (verified in source) | Proving negative | Result |
|---|---|---|---|
| C-13 | **NET-NEW** `writeOverlayCAS(dir, expectedRev, patch)` under the mutex (`write.js:104-113`); threaded into `track/reorder`, `gate/trigger`, `preset` → `409 conflict(state)` on stale rev (`api.js:88-114`); FE `ControlPlaneService` decodes 409 to a first-class `conflict` result, `workflow-builder` rolls back + surfaces a focused reconcile | N-14 (stale rev → 409, overlay **byte-unchanged**, all three routes) + builder spec 409 reconcile | **PASS** |
| C-14 | all three go through `writeOverlay`→`.aidevteam/workflow.overrides.json` only; `workflow.yaml` never opened for write | N-16 (yaml sha256 identical before/after reorder+trigger+preset) | **PASS** |
| C-15 | `isPermutation` length + sorted-join equality → `400` on add/drop/dup (`api.js:20-24,92`) | N-15 (drop / extra / duplicate each 400, overlay unchanged) | **PASS** |
| C-16 | `PRESETS` allowlist → `400` otherwise (`api.js:13,110`) | overlay-cas spec `preset:'banana'`→400, overlay unchanged | **PASS** |

### ADT-222 — review (C-17…C-19 / N-17…N-19)

| Cond | Control (verified in source) | Proving negative | Result |
|---|---|---|---|
| C-17 | `appendComment` server-side `slice(0,8192)` backstop (`write.js:233`); FE `task-detail` mirrors the 8 KB cap pre-send (`overCap`, disabled post, message); empty/no-id → 400 (`api.js:83-84`) | N-19 (20 000-char body capped to 8192) + detail spec "too long" | **PASS** |
| C-18 | `ticket/advance` + `gate/set` CAS through `readModifyWriteLedger` → `409 conflict(state)` on stale rev; `GATE_STATES` allowlist + unknown-gate 400 (`api.js:36,66-70`) | N-17 (advance + gate/set stale rev → 409, ledger unchanged) + detail spec 409 reconcile | **PASS** |
| C-19 | comments timeline (author/kind/ts/body) interpolated — escaped; `gate/set` emits the typed `gate` audit comment via `appendComment` (`api.js:78`) | N-19 (typed `gate` JSONL line: kind/gate/state/author) + detail spec escapes `<img onerror>` author + `<script>` body | **PASS** |

**All 19 conditions PASS; all 19 negative tests are genuine** (FS-listing assertions after the write,
byte-hash equality, real symlinks, end-to-end 403, behavioral `querySelector('script')===null`) — none
is a comment or a happy-path-only assertion.

---

## Facts-only / self-describing grep (Code Standard)

- **The reviewed delta is CLEAN.** The new code — `writeOverlayCAS`, `addKbNote` and its helpers
  (`slugify`/`isContained`/`resolveKbDir`/`kbBodyError`/`writeNewFileExclusive`), the `kb/add` route
  case, the `expectedRev` threading, and **all** new/changed cockpit `core/` + `shell/` source — carries
  **no** ticket IDs, condition codes (C-/N-), persona names, or sprint refs. Doc-comments state facts
  (behaviour, params, security rationale) and names are self-describing.
- **Pre-existing artifacts in a touched file (WARNING, not introduced here):** `hub/lib/api.js` carries
  `(ADT-206)` (line 3), `AC-B6` (lines 7 and 77), and `C3 guard` (line 8) in comments. `git show
  HEAD:hub/lib/api.js` confirms **all four predate this change set** — the delta added none. They are
  Code-Standard violations that should be cleaned, but they do not block this slice.

---

## Findings by severity

### BLOCKING (0)
None.

### WARNING (2 — both pre-existing in `hub/lib/api.js`, out of the reviewed delta)

#### WARNING-1: process artifacts in `api.js` comments
**Location:** `hub/lib/api.js:3,7,8,77`
**Problem:** `(ADT-206)`, `AC-B6` (×2), `C3 guard` are process artifacts in source comments — the repo
Code Standard forbids ticket/AC/condition codes in code. They predate this change set (verified against
HEAD), so they do not block, but /be should strip them in a follow-up tidy.

#### WARNING-2: embedded NUL byte makes `api.js` a "binary" file to git/grep
**Location:** `hub/lib/api.js:22` — `isPermutation`'s `.sort().join('\x00')` uses a literal NUL as the
join separator (one raw `\x00` byte in the file). Pre-existing (in HEAD). It is functionally valid (stage
names never contain NUL), but it makes `git diff` render the file as `Binary files … differ` and makes the
source invisible to a plain `grep`, which obscures review of any future change to this file. Recommend
replacing the separator with a printable sentinel unlikely to appear in a stage name (e.g. `'\n'` or
`' '`-free delimiter), so the file stays text. Out of this slice's delta — record for /be.

### NIT (2)

#### NIT-1: stale comment in `writeNewFileExclusive`
**Location:** `hub/lib/write.js:211-214`
**Note:** the doc-comment describes a tmp-file-then-`link(2)` strategy with an "O_EXCL open+write
fallback," but the implementation is a single `fs.openSync(target,'wx')` (O_EXCL open+write). The code is
correct and TOCTOU-safe; the comment narrates a design that was not taken. Trim it to match the code.

#### NIT-2: intentional NUL in the N-11 test fixture
**Location:** `hub/test/kb-write.test.js:224` — the N-11 body literal is `'ok\x00binary'` (a real NUL,
which is the point of the test). This is correct and the test genuinely exercises the binary-rejection
control, but the single raw NUL makes the test file git-binary too. Consider constructing the NUL via
`'ok' + String.fromCharCode(0) + 'binary'` so the source stays plain text and the intent is explicit.

### PRAISE (3)
- **`no-unsafe-binding.spec.ts`** is a strong structural guard: it scans the **whole** `app/` tree
  (excluding specs), matches the `[innerHTML]=` *binding* and `bypassSecurityTrust*(` *call* syntax (not
  prose), so any future XSS regression anywhere in the app fails CI. This is exactly the right way to
  hold C-8/C-19 over time.
- **`workflow-builder`** keyboard reorder (focusable grip + `Alt+Arrow`, visible move buttons as the
  pointer alternative, `aria-live="assertive"` move announcements) plus the focused **conflict reconcile**
  (Discard / Re-apply, never a silent overwrite) is a clean, accessible realisation of D-005.
- **`mutation-guard.test.js`** proves the write-guard **end-to-end against the real spawned server**
  (403 without X-AIDT for advance/comment/gate-set/kb-add, then 200 with the header), rather than trusting
  the guard's unit test — closing the "guard inherited by placement" assumption with a behavioral check.

---

## Quality checklist (XSS / a11y / conflict-as-real-state)

- **XSS:** zero `[innerHTML]`/`bypassSecurityTrust*`/`DomSanitizer` bypass anywhere (app-wide source
  scan + behavioral `querySelector('script')===null` on a crafted comment body **and** author **and**
  ticket title). KB body, comment body/author, gate note, owner/trigger labels all interpolate. **PASS.**
- **a11y:** task-detail is `role="dialog"`/`aria-modal`, moves focus on mount, traps Tab (fwd+back),
  closes on Escape and scrim click; conflict banners are `role="alert"`; the builder status pill and
  KB-add status are `aria-live`; reorder moves announce via `aria-live="assertive"`; preset is a
  `radiogroup` with arrow-key nav. **PASS.**
- **409 conflict is a real, non-silent UI state in all three features** with no lost-update clobber:
  detail (advance + gate/set), builder (reorder/gate/preset) both adopt the returned fresh state and show
  a dismissible/reconcilable banner; comment posts re-sync via SSE (append-only, no CAS by design). **PASS.**
- **Comment 8 KB cap** enforced pre-send (UI) + server slice backstop. **PASS.**
- **SSE does not drop a draft:** the composer draft is component-local; the detail spec asserts the draft
  survives an SSE-driven ticket refresh while the timeline updates. **PASS.**

---

## Security scan / static analysis

| Scanner | Status | Findings |
|---|---|---|
| Source XSS scan (`no-unsafe-binding.spec.ts`) | PASS | 0 `[innerHTML]` bindings, 0 `bypassSecurityTrust*` calls app-wide |
| Backend negative-test suite | PASS | traversal/symlink/overwrite/TOCTOU/oversize/binary/guard/CAS all proven |
| `tsc` strict (via `ng build`) | PASS | production build succeeded, no type errors |
| Grype/Trivy/npm audit | N/A this slice | zero new runtime dependencies added (server + client) — verified by inspection |

---

## Review assumptions

- I trusted the ARCH/SECOPS approval docs as the binding contract and verified each C/N condition against
  the actual source + tests rather than the developer's gate notes.
- I did **not** run Playwright/e2e (a live demo hub holds :4477, per instruction); the SSE/guard paths
  were instead exercised by `mutation-guard.test.js`'s spawned-server tests and the unit suites.
- The two WARNINGs and NIT-2 concern files **outside the reviewed delta** (pre-existing `api.js`
  artifacts/NUL; an intentional test NUL); they are recorded for a follow-up tidy and do not gate this
  slice. I did not re-review the broader committed cockpit/registry code beyond what this change set
  touches.

## Verdict

- [x] **APPROVED** — ADT-221, ADT-222, ADT-223. The change set improves system health, the HARD KB-write
  surface is contained and proven, and every conflict path is a real, non-clobbering UI state. Ready for
  /qa + /e2e and /verify. → "/sm — please update sprint status."
