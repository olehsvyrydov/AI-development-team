# Code Review — ADT-235 (/kai propose→approve knowledge inbox)

> **/rev (Code Reviewer).** Scope: the uncommitted ADT-235 change set on `feat/dart-kai-inbox`
> (backend proposal store + control-plane routes; cockpit propose-inbox UI). Reviewed against the
> binding SECOPS conditions **C-220…C-229 + C-240…C-242**, proven by **N-220…N-233**
> (`approvals/secops-knowledge-scopes.md`), and the repo facts-only Code Standard.
>
> Method: read every changed file in full; independently verified each condition in source (not from
> the developer's claim); re-ran the backend + cockpit suites and the production build (no e2e/live hub).

## Verdict: **APPROVED** (nits/one WARNING only) — `CODE_REVIEWED = passed`.

The two load-bearing controls — **inert by LOCATION** and **no path from pending → recall without an
explicit human approve, with BOLA re-authorization on approve** — are genuinely met in code and proven
by negatives that would fail if the control were removed. No BLOCKING findings.

---

## Files reviewed

**Backend:** `hub/lib/proposals.js` (new), `hub/lib/state.js`, `hub/lib/api.js`,
`hub/test/proposals.test.js` (new), `hub/test/proposals-api.test.js` (new),
`hub/test/mutation-guard.test.js`. Supporting (read, unchanged): `hub/lib/write.js`,
`hub/lib/knowledge.js`, `hub/server.js`, `hub/lib/guard.js`.

**Frontend:** `studio/cockpit/src/app/shell/propose-inbox.component.ts` (new) + `.spec.ts` (new),
`base-panel.component.ts`, `glyph.component.ts`, `core/control-plane.service.ts`, `core/models.ts`.

---

## C/N verification (independently confirmed in source)

| Cond | Control | Verified in code | Negative |
|---|---|---|---|
| **C-220** | Pending inert by LOCATION | `proposals.js` store = `~/.aidevteam/kb-proposals` resolved by `proposalsDir`. `state.js:readKb`/`readProjectKb`/`readCommonKb` scan ONLY the project KB dir and the common vault; `buildKnowledge` filters only those through `scopeMatches`. The proposals dir is never on a scan path and never passes through the predicate. Inertness is structural, not a status filter. | **N-220** asserts a pending proposal is absent from `readKb`, `readCommonKb`, and `buildKnowledge().docs`, present only in `listPending()`. Genuine. |
| **C-221** | No auto-apply | No job/sweep/apply-all anywhere; `propose` writes only to the proposal store (`writeRecord`), never `addKbNote`. | **N-221** records 5 proposals, snapshots both vaults, asserts byte-identical after + `buildKnowledge().docs.length===0`. Genuine. |
| **C-222** | Approve via the SAME guarded/contained chokepoint at the chosen scope | `approve()` calls `writeModule().addKbNote(projectDir, {…, scope, …})` — the one chokepoint (containment/O_EXCL/cap/text/slug). `status` is server-derived by scope (`approved-common`/`approved-project`); the **chosen** scope wins over the suggestion. | **N-222/N-223** assert the write lands in the chosen vault only; **N-229** re-proves cap/text/traversal on the approve write; **N-231** proves chosen-scope-wins. Genuine. |
| **C-223** | Audited; reject retained, never recalled | `persistDecision` re-writes the decided record (retained) + `appendComment` audit (decidedBy/decidedAt). `reject_` sets `status:rejected`, retained, removed from `listPending`. | **N-224** (audit present), **N-225** (retained, inbox empty, not recalled). Genuine. |
| **C-224** | BOLA/IDOR re-authorization on approve | `loadPending(id)` re-reads the STORED record and returns null unless `isSafeId` AND `rec.id===id` AND `rec.status==='pending'`. A foreign/forged/stale/already-decided/rejected id → null → `404`, **before** any `addKbNote`. The server-resolved `projectDir`/scope drive the write, never client content. | **N-226** exercises forged + already-decided + rejected ids, snapshotting both vaults byte-identical after each refusal (asserts no write, not just the code). Genuine and load-bearing. |
| **C-225** | Untrusted content stored inert, rendered escaped | Store keeps `content`/`title`/`why` RAW (`N-230` asserts byte-for-byte). FE renders every untrusted field via `{{ }}` interpolation only — no `[innerHTML]`, no `bypassSecurityTrust*`. | **N-230** (raw at rest) + the FE escape test (hostile `<script>`/`onerror` payload yields zero `<script>`/`img[onerror]` nodes, no global side-effects, literal text shown) + the app-wide `no-unsafe-binding` scan (covers the new component automatically). Genuine. |
| **C-226** | Store parser bounded / proto-safe / never-throws | `readRecord` caps at 256 KB, `JSON.parse` in try/catch, `sanitizeRecord` copies own keys only and drops `FORBIDDEN_KEYS`; `listAll` skips malformed files. | **N-227** plants broken/`__proto__`/oversize sidecars, asserts `doesNotThrow`, `{}.polluted===undefined`, valid record still listed. Genuine. |
| **C-227** | Action name reflects scope | FE Approve button `aria-label`/label = `Approve as {{ scopeLabel(chosen(p)) }}`; radiogroup, no free path field. | **N-231** (server: chosen scope wins) + FE spec (label follows the chosen scope; no `input[type=text]`). Genuine. |
| **C-228** | Write-guard on approve/reject/propose | `server.js:185` runs `writeAllowed` on every `POST /api/*` BEFORE `api.handle` is reached; `kb/propose|approve|reject` are such POSTs (guard by placement). | **N-228** posts all three without X-AIDT and with a non-loopback Host → all `403`; asserts no proposal file, no common note, no project KB created. Genuine. |
| **C-229** | Precedence = render annotation, not suppression/authorization | `buildKnowledge` surfaces BOTH a matching project and common note (no suppression); the security boundary stays C-209/C-210 (`scopeMatches`). | **N-232** asserts both surface. See WARNING-1 on the missing display flag. |
| **C-240** | Honest indexing | `method` line unchanged (`filename-only` unless `embedderConfigured`); no embedding job on propose/approve. | Covered by existing `state` honesty tests; no new semantic claim added. Met. |
| **C-241** | Untrusted render source-scan-enforced | The whole-app `no-unsafe-binding.spec.ts` scans every `.ts`/`.html` (incl. the new component) for `[innerHTML]=` / `bypassSecurityTrust*(` — zero offenders. | Plus behavioral non-execution (N-230 FE). Met. |
| **C-242** | "Common" never cloud | Inbox copy: "Nothing is saved until you approve — and you choose where it goes"; FE spec asserts no `cloud|uploaded` claim. | **N-233** (honest framing). Met. NOTE: the C-242 `/legal` privacy-copy review is a process gate outside this code review's scope — flagged for `/sm`. |

**Inert-by-location:** CONFIRMED structural — the require graph keeps the proposal store off every scan
path and out of `scopeMatches`. **No-auto-apply:** CONFIRMED — no promotion path exists; `propose`
never touches a vault. **BOLA on approve:** CONFIRMED — `loadPending` rejects foreign/forged/stale/
decided/rejected ids and N-226 proves both vaults byte-identical after each refusal.

**Concurrency note (assumption stated):** `approve()`/`reject_()` are `async` but contain no `await`
between `loadPending` and the decided-status write (`addKbNote` is synchronous), so on Node's single
event loop the re-auth→write→stamp sequence runs atomically — two concurrent HTTP approves of the same
id cannot interleave to double-write. Sound for the single-developer localhost model; not a finding.

---

## Findings by severity

### BLOCKING
None.

### WARNING

- **WARNING-1 — C-229 "flagged authoritative" display annotation is not emitted.**
  `state.js:buildKnowledge` surfaces both a conflicting project and common doc (the security-relevant
  half — no suppression — is correct and tested by N-232), but it does not stamp the project doc with
  an `authoritative`/precedence marker, and **N-232 does not assert one**. C-229 explicitly scopes this
  as a *render annotation* that "must NOT be relied on as a security boundary," so the security gate is
  unaffected; this is a product/UX completeness gap against the AC's "project item is flagged
  authoritative" wording. Recommend `/be` add the flag to the projection (or `/po` confirm it is
  deferred) and `/qa`/`/e2e` cover it. Not blocking the security gate.

### NIT

- **NIT-1 — `proposals.js` exports `reject` internally as `reject_`** to avoid shadowing the local
  `reject(code,error)` helper, then re-maps it in `module.exports` (`reject: reject_`). Correct and
  intentional; a one-line note already exists. No change required.
- **NIT-2 — `state.js:buildKnowledge` shadows the outer module symbol** by naming the local inbox
  variable `proposals` while `listPending` is imported from `./proposals`. It reads fine (the import is
  destructured as `listPending`), but a future edit referencing the module could be confused. Optional
  rename to `pending`.

### PRAISE

- Every write-refusal test snapshots the store/vault (file list + bytes) and asserts byte-identical
  after — exactly the "prove the negative" discipline the gate demands. N-226 covering forged AND
  already-decided AND rejected ids is thorough BOLA coverage.
- The trust-contract is enforced by *location*, not a regressible filter — the strongest form of C-220.

---

## Facts-only grep (Code Standard)

Grepped all changed non-test source (`proposals.js`, `state.js`, `api.js`, `propose-inbox.component.ts`,
`control-plane.service.ts`, `models.ts`, `base-panel.component.ts`, `glyph.component.ts`) for
`ADT-\d+`, `C-2\d\d`, `N-2\d\d`, `sprint-0`, and persona names (Soren/Jorge/Finn/James/Aura/…):
**zero matches.** Source and JSDoc state facts only. Condition codes (N-220…) appear only in test
titles as traceability, which is acceptable. **No leaks.**

---

## Test & build results (re-run, not trusted from claims)

- `node --test hub/test/*.test.js` → **304 pass / 0 fail** (matches expected ~304).
- `cd studio/cockpit && npm test` → **448 pass / 0 fail** across 33 files (matches expected ~448).
- `cd studio/cockpit && npm run build` → **bundle generation complete (success).** Two pre-existing
  SCSS budget WARNINGS on unrelated components (`workflow-builder`, `tasks-board`) — not in this change
  set, not introduced here.

---

## Assumptions / not verified here

- I did NOT run the e2e/Playwright suite or a live hub on :4477 (out of scope per the review brief).
- C-242's `/legal` privacy-copy sign-off is a workflow gate, not a code artifact — flagged for `/sm`,
  not assessed as code here.
- Memory-side `scopeMatches`/front-matter parity (C-211/N-212) belongs to ADT-234, not this change set.

## Gate decision

**`CODE_REVIEWED` — PASSED for ADT-235** (by `/rev`). Nits/one non-blocking WARNING only; all C-220…
C-229 + C-240…C-242 verified in source and proven by green negatives; facts-only clean; suites + build
green. WARNING-1 (display-only authoritative flag) is referred to `/be`/`/po`, does not block.

**Reviewed by:** /rev · **Date:** 2026-06-10 · **Status:** APPROVED
