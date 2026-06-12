# Code Review — Interpretation-check Q&A + mem0/OpenMemory egress overlay (ADT-236)

> **/rev — Senior Full-Stack Code Reviewer.** HARD `SECOPS_APPROVED` egress gate is binding.
> This is the gate-confirming pass: every E-1..E-10 + X-1..X-2 control was verified **in source**, and
> every N-301..N-322 negative was confirmed to be a real test that **spies the outbound primitive / snapshots
> on-disk bytes** and would **fail if its control were removed** — not a status-code assertion.

## Verdict

**APPROVED — zero BLOCKING, zero WARNING.** One NIT (a forward-declared `semantic` grounding tier that the
backend does not yet emit) and one FYI. The egress gate's load-bearing negatives are genuinely exercised in
code; the facts-only scan is clean; all backend + frontend suites pass and the production build succeeds.

---

## Scope reviewed

- **Backend:** `hub/lib/knowledge-qa.js` (new), `hub/lib/overlay.js` (new), `hub/server.js`
  (`GET /api/knowledge/ask` route), `hub/test/{knowledge-qa,knowledge-qa-route,overlay}.test.js`.
- **Frontend:** `studio/cockpit/src/app/shell/knowledge-qa.component.ts` (new) + spec,
  `core/{control-plane.service,models}.ts`, `shell/{base-panel,glyph}.component.ts`.

---

## E/N verification — read in source, not trusted from claims

### E-1 — no overlay ⇒ NO outbound socket/fetch (headline)  ✅ VERIFIED
- **Source:** `knowledge-qa.js:ask()` calls `overlay.checkHealth()` first; `overlay.checkHealth`
  (`overlay.js:121-137`) returns `{healthy:false}` immediately when `loadOverlayConfig()` yields no
  `overlay`/`overlayUrl` — it never reaches `fetchImpl`. The egress branch at `knowledge-qa.js:158` is gated
  on `healthy && config && config.overlay`. With no config, the local lexical tier answers.
- **Negative test:** `N-301` (knowledge-qa.test.js:132) injects a **fetch spy**, asks 5 questions with no
  overlay configured, and asserts `spy.calls.length === 0`. The two earlier lexical/absence tests also assert
  `spy.calls.length === 0`. **Fails if** the unconfigured-skip gate is removed. The spy is the *actual*
  injected `fetchImpl` threaded through `ask → checkHealth/queryOverlay`, so it is the real outbound primitive.

### E-2 / E-3 — SSRF + secrets  ✅ VERIFIED
- **E-2 (URL config-only):** `overlay.js:loadOverlayConfig()` reads the URL **only** from
  `~/.aidevteam/config.json` `memory.overlayUrl`, validated by `validateOverlayUrl` (http/https + host, else
  `null` → fails closed). `queryOverlay`/`checkHealth` build the request URL from `config.overlayUrl` only —
  never from a note body, front-matter, the question, or the overlay response. Both `fetchImpl` calls pass
  `redirect: 'error'` (`overlay.js:130, 193`), so a cross-host redirect is rejected, not followed.
  - `N-302` (note body with `169.254.169.254`) asserts every captured call URL starts with the configured URL
    and never contains the metadata host. `N-303` (overlay response carrying `http://evil.example/...` in
    `answer`+`matches`) asserts no second hop to that host. **Both fail if** egress were content-sourced.
- **E-3 (credential ENV-ONLY):** `readCredential` (`overlay.js:88-93`) reads **only**
  `process.env[credentialEnv]` (`MEM0_API_KEY` / `OPENMEMORY_API_KEY`); the credential rides only the outbound
  `authorization` header (`authHeaders`, `overlay.js:105-110`). It is never written to config (the writer is
  selection-only) nor echoed in any error. Missing credential → `checkHealth` returns unhealthy
  (`overlay.js:124`) → silent skip → local answer.
  - `N-304` greps the on-disk `config.json` for the secret after a query → absent. `N-305` (missing env var)
    asserts zero outbound calls, `egressDisclosed:false`, local answer, method ≠ overlay. **Fail if** the key
    were persisted or a missing key crashed/egressed.

### E-4 / E-5 — gated + truthful disclosure  ✅ VERIFIED
- The **same** `checkHealth` signal gates both the send (`knowledge-qa.js:158`) and the disclosure: the
  overlay branch is the *only* path that returns `egressDisclosed: true` (`:176`), and it is entered only after
  a healthy probe **and** only set true when the overlay actually returned a usable answer (`:165`). If the
  overlay is enabled+healthy but returns nothing, the code falls through to the local tier with
  `egressDisclosed:false` (`:179-181`) — the disclosure can't claim egress for an answer the overlay didn't
  give. Residency (`local-service`/`cloud`) comes from the frozen `SERVICES` table, not from untrusted input.
  - `N-306` (probe throws → question never sent), `N-307` (`overlay:null` + URL present → zero calls), `N-308`
    (every call host == configured host), `N-309` (disclosure present **iff** a send happened, residency named,
    and a `/100%|nothing leaves|fully local/` claim string is rejected). All assert against the spy/flag, not a
    status code.

### E-6 — minimal-scope egress  ✅ VERIFIED
- `egressContext(localMatches)` (`knowledge-qa.js:122-125`) emits **only** the matched note **titles** (slugs),
  bounded to `MAX_EGRESS_TITLES = 10`, never bodies. The egress payload (`overlay.js:185-189`) is exactly
  `{ query, context, project }` — question + titles-context + scope key (project basename, `scopeKeyFor`,
  carries no path/secret). `localMatches` derives from `buildKnowledge(project).docs` filtered through the
  single `scopeMatches` authority, so egress can only ever carry what the project already sees. Proposals are
  never read (the code reads `buildKnowledge().docs`, never `.proposals`).
  - `N-310` (project B's title/body absent), `N-311` (proposal title/content absent), `N-312` (env secret
    absent + unrelated note body `xyzzy` not dumped) all **snapshot the captured request body** and assert
    exclusion. These fail if the context were built outside `scopeMatches` or over-shared.

### E-7 — read-only  ✅ VERIFIED
- `knowledge-qa.js` imports only `buildKnowledge`, `containedCommonVaultDir`, `safeRead` (read selectors) and
  `overlay` — **no** writer (`addKbNote`, `proposals.propose`, ledger writer) is referenced anywhere in the
  ask path. `safeRead` is read-only.
  - `N-313` (no overlay) and `N-314` (healthy overlay answering) **snapshot every byte** of the project vault +
    `~/.aidevteam` (common vault + proposal store) before/after N questions and assert `deepEqual`; `N-314`
    additionally greps every on-disk byte to prove the overlay's `OVERLAY-MEMORY-BLOB` answer is never
    persisted. Fails if any question wrote or self-promoted.

### E-8 — inert (note + overlay response escaped, never executed/self-promoting)  ✅ VERIFIED
- **Backend** carries the overlay/ note text as plain string data (`knowledge-qa.js:166-177` maps to display
  objects; `validateOverlayResponse` bounds/shape-checks but does not interpret). **Frontend**
  (`knowledge-qa.component.ts`) renders `a.answer`, `a.grounding.label`, `m.name`, `m.snippet`, and the egress
  line through Angular **interpolation only** (`{{ }}`) — grep confirms **no** `[innerHTML]` /
  `bypassSecurityTrust*` / `DomSanitizer` in the changed components (only doc-comment mentions).
  - Backend `N-315` (script in note body → `globalThis.__pwned` undefined) and `N-316` (overlay
    `<img onerror>` + `javascript:` match → `__pwned2` undefined, answer labelled the overlay's). Frontend spec
    asserts a hostile snippet renders as text (`querySelector('img')` null, `__xss` undefined, literal markup
    present) and a hostile overlay `<script>` answer is inert. The overlay answer is always labelled
    `grounding.method === 'overlay'` / "external", never DART's own.

### E-9 — abortable/time-boxed (real abort, not race-only)  ✅ VERIFIED
- `deadlineSignal(timeoutMs)` (`overlay.js:96-101`) creates a **real `AbortController`**, arms a `setTimeout`
  that calls `controller.abort()`, `.unref()`s the timer, and returns `cancel()` to clear it. Both
  `checkHealth` and `queryOverlay` pass `signal` into `fetchImpl` and `cancel()` in `finally`. This is the
  abort the secops note demanded — it does **not** rely on the race-only `withDeadline`. Every failure path
  returns `null`/`{healthy:false}`; the functions never throw.
  - `N-317` (hung probe → the test asserts the **signal actually fired** (`aborted === true`), returns < 2s,
    local fallback answers). `N-318` (5 MB non-JSON response → bounded read rejects, overlay tier abandoned,
    local answers, never throws). `overlay.test.js` adds a standalone abort assertion on the health probe.

### E-10 — no info leak in errors  ✅ VERIFIED
- All error bodies in `knowledge-qa.js` are terse constants (`'No note found on this topic…'`); the route's
  `.catch` (`server.js`) returns the same terse honest-absence 200, **not** a 500 with a stack. No path,
  secret, or auth-URL is interpolated into any message.
  - `N-319` (config URL with embedded `user:TOPSECRET@`, env secret `TOPSECRET`, fetch throwing an
    `ECONNREFUSED <home>/private/path` error) asserts the serialized answer contains **no** secret, **no**
    `$HOME` path, **no** `ECONNREFUSED`/stack-frame pattern.

### X-1 — manifest is not a credential store  ✅ VERIFIED
- `N-320` reads the committed `mem0.json` + `openmemory.json` and asserts every `*KEY*/*TOKEN*/*SECRET*` env
  value is `REPLACE_ME`/empty/null. The connect path never writes a secret (selection-only config).

### X-2 — sprint-06 containment / scope authority single-source  ✅ VERIFIED
- The Q&A reads strictly through `buildKnowledge` + `scopeMatches`; it adds **no** second vault scan and **no**
  second predicate. `readDocBody` resolves bodies through the same contained roots `buildKnowledge` used
  (project root for `scope:project`; `containedCommonVaultDir()` for `scope:common`) and returns `''` when the
  contained common root is absent — no $HOME-containment relaxation.
  - `N-321` (project A never surfaces B's same-named note or any proposal) and `N-322` (Q&A visible set ⊆
    `buildKnowledge().docs` filtered by `scopeMatches`; an out-of-stack `python-only` common note is invisible
    to a java project in both the panel and the Q&A). The scope authority remains single-source.

### UI honesty + escaping  ✅ VERIFIED
- The egress indicator (`[data-testid="qa-egress"]`) renders **only** under `@if (a.egressDisclosed)`
  (`knowledge-qa.component.ts:73`), driven solely by the backend flag — no independent UI re-derivation. The
  local-answer path prints its grounding label and **no** absolute privacy claim; the spec asserts the absence
  of `100% private|nothing leaves|fully local|never touches the cloud`. All untrusted text is interpolated.

---

## Facts-only / self-describing scan (CLAUDE.md Code Standard)  ✅ CLEAN

Grepped all 8 changed source files for `ADT-\d+`, `N-3\d\d`, `E-\d`, `sprint-0\d`, persona names
(Soren/Jorge/Finn/…), `secops`, and `/rev`: **no matches**. No ticket IDs, condition codes, persona names, or
sprint references leak into source or doc-comments. Doc-comments state behavior/contract facts only
(containment posture, untrusted-input handling, honesty contract) — appropriate and self-describing.

---

## Findings

- **NIT — forward-declared `semantic` tier not yet emitted.** `models.ts KnowledgeGrounding.method` includes
  `'semantic'` and the `models.ts`/`knowledge-qa.component.ts` doc-comments mention "a local semantic score"
  tier, but `knowledge-qa.js` only ever emits `overlay` / `filename-only` / `none`. The union's `string`
  fallback keeps this type-safe and forward-compatible, and the honesty contract is unharmed (the backend
  never claims `semantic` it can't back). Harmless, but the doc-comment slightly over-describes the current
  surface. No action required this slice.
- **FYI — `noteBody`/`readDocBody` re-read each matched doc from disk per question.** `docHaystack` reads the
  body for scoring and `snippet` reads it again for display, so a matched doc is read up to twice per ask.
  Bounded (≤10 lexical matches, read-only, `safeRead`-contained) and not a correctness/security concern at this
  scale; noting only for a future cache if the corpus grows.
- **PRAISE — the negative-test discipline is exactly what a HARD egress gate needs.** Every load-bearing
  control is proven by spying the injected outbound `fetchImpl` and/or hex-snapshotting on-disk bytes and
  asserting the *absence* (zero calls / body excludes X / no secret / bytes unchanged), not a status code. The
  real `AbortController` (with a fired-signal assertion) correctly closes the `withDeadline` race-only gap the
  secops note flagged.

---

## Re-run results (independently executed, no e2e/playwright)

| Suite | Command | Result |
|---|---|---|
| Hub backend | `node --test hub/test/*.test.js` | **366 pass / 0 fail** |
| Cockpit unit | `npm test` (studio/cockpit) | **475 pass / 0 fail (34 files)** |
| Cockpit build | `npm run build` (studio/cockpit) | **Success** (2 SCSS-budget warnings in pre-existing
  `tasks-board` / `workflow-builder` components — unrelated to this change set) |

---

## Assumptions / limits

- I verified egress behavior against the **injected `fetchImpl` spy** in the unit tests and the source gating
  logic; no real outbound network call was made or needed. The route test runs a child server with a
  controlled `HOME` so no real overlay config exists.
- Render-escaping is verified by source-scan (no unsafe binding) + the component spec's behavioral
  non-execution assertions; I did not run a browser. Angular interpolation escaping is the platform guarantee.

---

**Reviewed by:** /rev · **Date:** 2026-06-12 · **Verdict:** APPROVED (HARD egress gate confirmed in code;
E-1..E-10 + X-1..X-2 met, proven by N-301..N-322; facts-only clean; suites + build green) ·
**Next:** `/sm` — please update sprint status → `/qa` + `/e2e`.
