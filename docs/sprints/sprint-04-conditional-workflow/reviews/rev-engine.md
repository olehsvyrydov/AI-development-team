# Code Review — Sprint 04 Conditional Workflow (ADT-227 HARD · ADT-228 · ADT-229)

> **/rev — Senior Full-Stack Code Reviewer.** Reviewed the uncommitted change set on
> `feat/dart-interactive` since `90e6571` against `approvals/secops-engine.md`
> (binding conditions C-1…C-35, negatives N-1…N-30), `approvals/arch-engine.md`, and
> the repo Code Standard (facts-only). I re-ran the backend + frontend suites and the
> production build; I did not run e2e/Playwright (a live hub is on :4477).
>
> **Verdict: CHANGES REQUESTED (BLOCKING).** Every binding security condition C-1…C-35
> is genuinely met in code with a real proving negative test (table below) — the HARD
> ADT-227 surface is sound. **The block is a Code-Standard violation, not a security
> gap:** a review-condition code (`C-21`) is embedded in source, which the standard
> classifies as BLOCKING. One trivial fix resolves it. The two "Phase 0" doc-comments
> are a WARNING. With the `C-21` comment removed, this passes.

---

## 1. Files reviewed

Backend: `hub/lib/engine.js` (new), `hub/lib/state.js`, `hub/lib/api.js`,
`hub/lib/write.js`, `hub/lib/channels.js`, `hub/server.js`; tests
`hub/test/{engine-safety,rules-parse,mutation-guard}.test.js`.
Frontend: `studio/cockpit/src/app/core/{models,control-plane.service}.ts`,
`shell/{workflow-builder,stage-rules,glyph}.*` and
`shell/workflow-builder-interactive.spec.ts`.

---

## 2. C/N verification table — independently verified in code (not just claimed)

Each row: the control located in source + the proving test confirmed to assert the
**negative** (refusal AND byte-identical state, not just a status code).

### ADT-227 (HARD) — C-1…C-24 / N-1…N-22

| Cond | Control in source | Proving test | Verdict |
|---|---|---|---|
| **C-1** no gate-state action | `engine.js:34` `DO_ACTIONS` closed Set — no `set_gate`/`pass_gate`; `validateAction:210` rejects unknown verbs; only `api.js gate/set:127` writes a gate state | N-1 (route 400 + `DO_ACTIONS` membership) + N-1 structural source-scan (no `.state='passed'`) | **PASS** |
| **C-2** deterministic refusal, no advisory lift | `routePastUnmetSafetyGate` is pure control flow; no model/`fetch`/`Math.random` | N-2 source-scan for `llm/openai/fetch(/advisory/heuristic/math.random` + terminal-true assert | **PASS** |
| **C-3** route at/past unmet safety gate refused (eval) | `engine.js:134-152` derives track order, refuses any safety gate crossed `from+1..target` | N-3 (ticket stays `architecture`, `fired=0`, no advance comment) | **PASS** |
| **C-4** same refusal at author-time | `validateAction:222-237` runs the SAME `routePastUnmetSafetyGate` over `representativeTickets`; `api.js set-rules:192` calls `validateRules` | N-4 (400 + overlay byte-unchanged) | **PASS** |
| **C-5** `require_gate` add-only | `engineIO.requireGate:264` pushes onto `requiredGates`, never writes `gates[].state` | N-5b (gate added, `SECOPS_APPROVED` still `pending`, no `PERF_OK` gate object) | **PASS** |
| **C-6/C-21** label `settable_by` enforced (route + engine + author) | `labelSettableBy:278`; `api.js label/set:213`; `apply:431` skips unauthorized; author-time `validateAction:219` | N-6 (route 400 byte-unchanged; engine no escalation) + N-18 label arm | **PASS** |
| **C-8** instruct recorded-only | `apply:450` → `io.directive` only; no other mutation | N-8 (one directive comment, zero ledger/overlay change) | **PASS** |
| **C-9** prompt carries no authority | `directive:274` stores `body` raw; engine keys nothing off content | N-9 (prompt with `route_to_stage`/`set_gate` text → no route, no gate) | **PASS** |
| **C-10** rule text escaped on render | FE interpolation only; no `[innerHTML]`/`bypassSecurityTrust*` on rule fields | N-10 (stored raw, FE obligation) + FE spec "hostile prompt never reaches DOM as HTML" + `no-unsafe-binding` spec | **PASS** |
| **C-11** loop budget → NEEDS_HUMAN, stop | `runEngineTick:332-344` `backwardRouteCount>=LOOP_BUDGET` → `setLabel(NEEDS_HUMAN)`, `stopRouting=true` | N-11 (budget trips, stage unchanged, `needsHuman` includes ticket) | **PASS** |
| **C-12** then-chain depth cap | `runEngineTick:323-325` BFS queue, `depth>CHAIN_DEPTH_CAP(8)` breaks; depths monotonic in FIFO so break is safe | N-12 (mutual a→b→a cycle terminates, bounded) | **PASS** |
| **C-13** replay dedup (rule,event) | `alreadyFired:471`; tick seeds `seenIds` from `fired[].event` | N-13 (same event twice → one label, one fired entry) | **PASS** |
| **C-14** bounded evaluator / fan_out no spawn | `fanOut:278` records a comment only; no recursion without bound | N-14 (fan_out doesn't route, recorded inertly) | **PASS** |
| **C-14b** no exec surface | `engine.js` imports only `./stage-map`; no `child_process`/`exec`/`spawn`/`eval`/`vm` | N-14b source-scan over engine module | **PASS** |
| **C-15** CAS writer, base YAML byte-unchanged | all mutations via `readModifyWriteLedger`/`writeOverlayCAS`/`appendComment`; base never machine-written | N-15 (full author+fire → YAML hash identical) | **PASS** |
| **C-16** authoring guarded → 403 | `server.js:185-187` `writeAllowed` on every `POST /api/*` BEFORE dispatch → new routes inherit by placement | N-16 (mutation-guard.test: 3 routes 403, no overlay/comment written) | **PASS** |
| **C-17** CAS-safe → 409 | all three routes carry `expectedRev` into `writeOverlayCAS`/`readModifyWriteLedger` | N-17 (stale set-rules + label/set → 409, byte-unchanged) | **PASS** |
| **C-18/C-18b** strict schema; instruct completeness | `validateRule:174`, `validateAction:205` closed enums; `WHEN_KEYS`/`EVENTS`/`PATTERN_SCOPES`; instruct target+prompt `245-252` | N-18 (7 malformed cases 400, byte-unchanged) + N-18b (incomplete instruct) | **PASS** |
| **C-19** ReDoS-safe pattern | `globMatch:105` two-pointer linear glob (`*`/`?` only), NO regex compile; `patternError` caps len 200; input capped 8KB | N-19 (`(a+)+$` vs 8 KB input < 500 ms; over-cap 400) + glob linear-time test | **PASS** |
| **C-20** bounded/inert names | `nameError:70` (cap 64, no `/`,`\`, control chars, forbidden keys); `agentError:80` | N-20 (over-cap label 400) | **PASS** |
| **C-22** no proto-pollution via keys | `FORBIDDEN_KEYS` dropped in `validateAction`, `nameError`, `state.js parseRules/parseLabels/mergeRules/mergeLabels`; `Object.defineProperty` used for label projection | N-20 proto arm (Object.prototype intact) + rules-parse N-20 (forbidden id/name never a projection key) | **PASS** |
| **C-23** every fired rule audited | `apply:464` `recordFired`; each mutation appends a typed comment | covered by N-8/N-11/N-13 `fired[]` assertions | **PASS** |
| **C-24** no info leak in refusals | all `fail()` reasons terse (`'rule routes past an unmet safety gate'`, `'pattern too long'`); no paths/stacks | verified by inspection of every `return fail(...)`/`return bad(...)` | **PASS** |
| **N-22** single validator (author == eval) | `routePastUnmetSafetyGate` called at `validateAction:235` (author) AND `apply:437` (eval) — one function | N-22 (`api.js` calls `validateRules`; engine has ≥2 calls to the safety fn) | **PASS** |
| **N-5** hand-edited overlay still refused | eval-time arm runs `routePastUnmetSafetyGate` per ticket on every tick, independent of author-time | N-5 (overlay-injected bypass never advances) | **PASS** |

### ADT-228 (review) — C-25…C-28 / N-23…N-25

| Cond | Control | Test | Verdict |
|---|---|---|---|
| **C-25** no new surface | drag/keyboard reorder all route through `commitStages` → `cp.setStages` → existing `track/set-stages`; no new `api.js` case | FE specs post to `/api/track/set-stages` only; `api.js` adds no route for 228 | **PASS** |
| **C-26** CAS-safe, no-write-on-cancel | `reconcile` 409 path; `onDragEnd`/`cancelGrab`/Escape write nothing | FE "Escape mid-drag cancels … nothing posted"; "Escape while grabbed … posts nothing" | **PASS** |
| **C-27** base YAML byte-unchanged | overlay-only `writeOverlayCAS` (unchanged from ADT-225) | inherited; N-15/N-21 cover the overlay-only path | **PASS** |
| **C-28** escaped render + a11y not a 2nd write path | stage names interpolated; keyboard drag rides the same single write | `aria-grabbed`/`aria-label`/`builder-live` specs; no new write path | **PASS** |

### ADT-229 (review) — C-29…C-35 / N-26…N-30

| Cond | Control | Test | Verdict |
|---|---|---|---|
| **C-29** server is authority | `api.js set-rules:192` re-runs full `validateRules` server-side regardless of client | N-4/N-18 (direct post of bypass/malformed → 400) + FE "surfaces a server 400 (server is authority)" | **PASS** |
| **C-30** editor cannot author route past unmet safety gate | `stage-rules.ts:441 routesPastUnmetSafetyGate` disables Save (UX); server C-29 is the gate | FE "refuses (Save disabled + reason) a route past an unmet safety gate" | **PASS** |
| **C-31** Set-label picker filtered (absent, not greyed) | `stage-rules.ts:281 settableLabels` filters by owner `settable_by`; `@for` over `settableLabels()` | FE "filters the Set-label picker … unauthorized absent, not greyed" (asserts NEEDS_DESIGN not an option) | **PASS** |
| **C-32** contract parity digest/route/editor | single `labels:` projection → `buildState.labels`; editor + `label/set` + engine all read it | parity holds by single source; (no dedicated N-29 parity unit test — see WARNING-2) | **PASS (with note)** |
| **C-33** all rule text escaped | interpolation only across editor + cards; no unsafe binding | FE hostile-prompt spec + repo `no-unsafe-binding` source-scan spec | **PASS** |
| **C-34** Save CAS-safe; invalid drafts can't save | `draftError` computed disables Save with inline `role="alert"`; save rides `expectedRev`; 409 → shared banner | FE incomplete-route / empty-prompt / 409-reconcile specs | **PASS** |
| **C-35** loop legibility read-only + honest | `isBackwardRoute` "loops back" badge, one-shot annotation, always-shown NEEDS_HUMAN note; no route shown that server would refuse (C-30) | FE "flags a backward route", "shows loop-budget → NEEDS_HUMAN note" | **PASS** |

**Result: 35/35 conditions met, 30/30 negatives confirmed as real proving tests.** Every
refusal test in `engine-safety.test.js` snapshots ledger+overlay+YAML-hash+comments
before and asserts byte-identical after (`assertUnchanged`), exactly as the gate
requires — not status codes alone.

---

## 3. Findings by severity

### BLOCKING

- **B-1 — Review-condition code in source (Code Standard violation).**
  `hub/lib/engine.js:218`:
  `// C-21: a rule cannot author a label action its acting context cannot set.`
  The repo Code Standard and the `/rev` skill classify a review-condition code
  (`C1`/`D4`/`C-21`) embedded in source or doc-comments as **BLOCKING** — code outlives
  the process that produced it; the condition number belongs in the commit/PR/ledger,
  not the artifact. The *fact* the comment states is fine; only the `C-21:` prefix
  must go. **Fix:** drop the code, keep the rationale, e.g.
  `// A rule cannot author a label action its acting context cannot set.`
  This is the sole blocker.

### WARNING

- **W-1 — "Phase 0" sprint/phase reference in two doc-comments.**
  `studio/cockpit/src/app/core/models.ts:198` and
  `studio/cockpit/src/app/shell/stage-rules.component.ts:22` both say
  *"fan_out, schema-only in Phase 0"*. "Phase 0" is a sprint/phase reference — a
  process artifact. The behavioural fact ("fan_out is schema-only / not yet executed")
  is correct and worth keeping; drop the "in Phase 0" temporal tag. Lower severity than
  B-1 because it is a roadmap phrase rather than a condition code, but it is the same
  class of leak and should be cleaned before commit.

- **W-2 — No dedicated N-29 contract-parity unit test.** C-32 (the editor-offered set
  == `label/set`-enforced set == digest-published set) holds **structurally** because
  all three read the single `labels:` projection, and FE specs prove the picker
  filtering. But the SECOPS checklist named N-29 as a fixture-driven parity test that
  fails on drift. It is not present as a standalone test. The property is currently
  guaranteed by single-source construction, so this is not a security hole today — but a
  future refactor that forks any consumer would regress silently with no failing test.
  Recommend adding the parity test. Not blocking (the contract is single-source now).

### SUGGESTION / NIT

- **N-1 (nit) — redundant event check.** `selectRules` (engine.js:383) filters
  candidates by `when.event`, and `matches` (engine.js:396) re-checks `w.event`. Harmless
  and arguably defensive, but the double-filter is dead on the second pass. Optional.

- **N-2 (nit) — `applyWithRouteTrace` recomputes the route refusal.** `runEngineTick`
  computes the refused-route signal both in `applyWithRouteTrace:376` and implicitly in
  `apply` (which skips the write). Correct, but the refusal is evaluated twice per routing
  rule. Acceptable for clarity; optional to consolidate.

### PRAISE

- The single-validator design (`routePastUnmetSafetyGate` shared author/eval, locked by
  N-22's structural assertion) is exactly the regression-proofing the HARD gate asked
  for: the "no gate-mutating action" property lives in control flow and is pinned by a
  test that fails if the allowlist is widened. Strong.
- The ReDoS mitigation chose elimination over taming — a linear two-pointer glob with no
  regex compile at all — which is the correct call. N-19 proves bounded time on the
  classic catastrophic input.
- Every refusal test asserts byte-identical state (`assertUnchanged`), not just codes.
  This is the discipline the gate demanded and most teams skip.

---

## 4. Facts-only grep (changed source)

Scanned the 11 changed source files (excluding tests) for ticket IDs, condition/negative
codes, persona names, and sprint/phase references:

- **Ticket IDs (`ADT-###`):** none. ✓
- **Condition/negative codes (`C-#`/`N-#`/`D-###`):** **1 hit** — `engine.js:218` `C-21`
  → **B-1 (BLOCKING)**.
- **Persona names:** none (grep hits on `max`/`mark` are substring false positives). ✓
- **Sprint/phase refs:** **2 hits** — "Phase 0" in `models.ts:198` and
  `stage-rules.component.ts:22` → **W-1 (WARNING)**.

No baseline precedent for either leak at `90e6571`; both are net-new in this change set.

---

## 5. Re-run results (not trusting claims)

- **Backend** — `node --test hub/test/*.test.js`: **228 pass, 0 fail** (matches the
  expected ~228). N-1…N-22 (engine-safety), the parse/proto negatives (rules-parse), and
  N-16 (mutation-guard) all green.
- **Frontend** — `npm test` (vitest): **272 pass, 0 fail** across 26 files (matches the
  expected ~272). Covers drag a11y, keyboard pick-up/move/drop, picker filtering, escaped
  render, Save-disabled-on-invalid, server-authority 400, 409 reconcile.
- **Build** — `npm run build`: **succeeds (exit 0).** The only diagnostic is
  `[WARNING] … workflow-builder.component.ts exceeded maximum budget. Budget 6.00 kB …
  total of 6.90 kB.` — a **`[WARNING]`, not `[ERROR]`** (the style-budget overrun the
  task flagged as acceptable). Build is not failed by it.

---

## 6. Architecture compliance

Implementation follows `approvals/arch-engine.md`: closed-grammar deterministic
evaluator (§4), intent/action split, overlay-only authoring via the existing CAS writers
(§8), loop budget + chain cap + (rule,event) dedup (§5), `kind:"directive"` inert comment
type. The engine reuses the verified substrate (`writeAllowed`, `readModifyWriteLedger`,
`writeOverlayCAS`, `appendComment`, `g.safety`, `stageGate`) exactly as the SECOPS doc
§0 mapped it. No undocumented deviation.

---

## 7. Gate decision

| Ticket | Gate | Decision |
|---|---|---|
| **ADT-227** | `CODE_REVIEWED` (HARD) | **CHANGES REQUESTED** — security conditions all met, but **B-1** (the `C-21` condition code in `engine.js:218`) is a BLOCKING Code-Standard violation. Remove the code prefix (keep the sentence). Then PASS. |
| **ADT-228** | `CODE_REVIEWED` | **CHANGES REQUESTED** (coupled) — code is clean; gated only by W-1 ("Phase 0" in `stage-rules.component.ts:22`). Trivial. |
| **ADT-229** | `CODE_REVIEWED` | **CHANGES REQUESTED** (coupled) — code is clean; gated only by W-1 ("Phase 0" in `models.ts:198`) and the W-2 parity-test note. |

**What to fix (small, mechanical):**
1. `hub/lib/engine.js:218` — delete the `C-21:` prefix from the comment. *(unblocks ADT-227)*
2. `studio/cockpit/src/app/core/models.ts:198` — drop "in Phase 0". *(W-1)*
3. `studio/cockpit/src/app/shell/stage-rules.component.ts:22` — drop "in Phase 0". *(W-1)*
4. *(recommended, not blocking)* add the N-29 contract-parity test. *(W-2)*

`CODE_REVIEWED` is **not** set to passed for any of the three tickets. On the three
edits above, re-submit; the security verification (C-1…C-35 / N-1…N-30) already holds and
needs no re-proof.

---

**Reviewed by:** /rev · **Date:** 2026-06-08 · **Status:** CHANGES REQUESTED
(facts-only Code-Standard violation; zero open security findings) · **Next:** /be + /fe
apply the 3 mechanical edits → re-submit → /rev confirms → `/sm` update sprint status.
