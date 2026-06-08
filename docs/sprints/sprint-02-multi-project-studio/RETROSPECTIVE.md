# Sprint 02 — Multi-Project Studio · Retrospective (for /kai)

**Facilitator:** /sm (Luda) · **Date:** 2026-06-07 · **Scope of work:** ADT-210 foundation (project registry + connect/analyze), delivered and committed; Slices 2–5 + the Angular Cockpit staged in the backlog.

> **Format note for /kai.** This file is the file-based `/retro` capture. Each learning below is a self-contained block with the same frontmatter the learning store uses (`agent` = target skill folder, `type`, `scope`, `status`). /kai should cluster by `target` skill + `theme` and propose the recurring `scope: universal` ones as SKILL.md updates (≥ 3 matching → promote). To activate, copy each block to `./.aidevteam/learnings/L-2026-06-07-NNN.md` (one file per block) — they are pre-formatted for a direct lift.
>
> **Goal achieved:** Partially. The foundation slice (ADT-210) is DONE; everything UI/exec-shaped is correctly **blocked** (environment + dedicated SECOPS passes), not skipped.

---

## Quick round

**What went well**
- The strangler-fig reuse held: Core shipped as a *superset* of the Sprint-01 hub, reused libs (`guard.js`/`write.js`/`state.js`) unchanged, server wiring purely additive. Arch conformance = CONFORMANT-WITH-NOTES.
- Security was real, not a rubber stamp: /secops read the source, found the "reused" control didn't exist, and converted every HIGH finding into a binding, test-verified condition (17 of them).
- Discipline on scope: execution paths (host-CLI, SSH) were left **unbuilt and gated**, proven by `grep` in the conformance pass — no exec leaked into a "local foundation."

**What was painful / surprised us**
- Facts-only code was violated repeatedly (ticket ids / condition codes / persona tags in comments) and had to be corrected at /rev — a recurring tax.
- A "reuse the existing path-containment control" mitigation turned out to be **net-new code** — the control was assumed-present from the design, not verified in source.
- The frontend default (React) was wrong for this org; the standard is Angular — caught late, after a stack decision was already leaning.

**What we'll change**
- Orchestrator never writes code (reinforce). Verify reused controls in source before crediting them. Pin cross-language derived keys with a parity test. Choose stacks by the user's existing ecosystem. (Detailed, routed below.)

---

## Learnings (routed to target skills)

### L-001 — Orchestrator must never write code; it delegates and integrates
```yaml
---
id: L-2026-06-07-001
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: orchestration            # CLAUDE.md / main session
target: claude/CLAUDE.md
type: pattern
scope: universal
status: open
theme: orchestration-boundary
---
```
**Insight:** The main session is an ORCHESTRATOR. When it writes implementation code itself, it bypasses the specialist's skill, the gate sequence, and the facts-only/TDD discipline that the specialist agents enforce. Work is highest-quality when the main session decides *what/who/next*, delegates to /be /fe /arch /secops /rev /qa /e2e, and integrates their outputs.
**Recommendation:** Reinforce in CLAUDE.md / orchestration: the orchestrating session delegates implementation to the specialist agents and never writes application code itself; it sequences gates and integrates results. (Already a principle — promote to an explicit, hard rule.)

### L-002 — Code and comments are FACTS ONLY (no ticket ids, persona names, condition codes, sprint refs)
```yaml
---
id: L-2026-06-07-002
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: reviewer                 # /rev — enforcement point
target: claude/skills/quality/code-reviewer/SKILL.md
type: checklist
scope: universal
status: open
theme: facts-only-code
---
```
**Insight:** Process artifacts leaked into source comments (ticket IDs, review-condition codes like `C3/C5`, persona/agent names, sprint references) repeatedly and had to be stripped at review — a recurring, avoidable rework loop. These belong in commits/PRs and the ledger, not the code.
**Recommendation:** Add a reviewer checklist item (and a secondary author-side check): source and doc-comments must be facts-only — reject any ticket ID, review-condition code, agent/persona name, or sprint reference in code or comments; prefer self-describing names, comment only a non-obvious *why*.
**Also route to:** backend-developer, frontend-developer (author-side, same rule) — same recommendation, scope universal.

### L-003 — When a mitigation "reuses an existing control," verify it exists in source — don't trust the design
```yaml
---
id: L-2026-06-07-003
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: secops-engineer          # /secops
target: claude/skills/operations/secops/secops-engineer/SKILL.md
type: checklist
scope: universal
status: promoted
theme: verify-reused-controls
---
```
**Insight:** The architecture leaned on an existing path-containment / read-confinement control as a security mitigation. On reading the source, /secops found no such helper existed — confinement was **net-new code to be written and tested**, not a reuse. A gate that credits a "reused" control without reading it ships a hole. (Contrast: the CSRF/atomic/mutex floor *was* real — confirmed by reading it.)
**Recommendation:** In the SECOPS threat-model checklist, add: for every control claimed as "reused" as a mitigation, open the cited source and confirm the behavior exists before crediting it; if it is net-new, mark it as net-new code and require its own test. Never accept the design's claim that a control is present.

### L-004 — A derived identity used as a cross-component key must be reproduced byte-for-byte and pinned by a parity test
```yaml
---
id: L-2026-06-07-004
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: backend-developer        # also arch
target: claude/skills/development/backend/java/backend-developer/SKILL.md
type: pattern
scope: universal
status: promoted
theme: cross-language-derived-key-parity
---
```
**Insight:** A `projectId` derived (`sha1(canonicalRoot).slice(0,12)`) was implemented independently in two languages (Node hub + TS memory) and used as the shared partition key for the board and the memory store. If the derivation (canonicalization fall-through, encoding, truncation) diverges by one byte, the components silently point at different partitions and no error fires. It was correctly pinned with a parity test that **embeds the other language's algorithm and asserts equality** across all derivation branches (git-toplevel, realpath, raw, symlink-collapse, id shape).
**Recommendation:** Add a pattern: any identity derived independently in more than one language/component and used as a shared key must be reproduced exactly (same input canonicalization, encoding, hash, truncation) and locked by a cross-implementation parity test that asserts byte-for-byte equality — not just "looks the same." Prefer a single source of truth where feasible; where parity is unavoidable, the parity test is mandatory.
**Also route to:** solution-architect — same recommendation (it is a boundary/contract concern), scope universal.

### L-005 — When porting logic between stacks, reuse the logic-under-test under snapshot/parity tests rather than rewriting
```yaml
---
id: L-2026-06-07-005
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: backend-developer
target: claude/skills/development/backend/java/backend-developer/SKILL.md
type: pattern
scope: universal
status: promoted
theme: reuse-over-rewrite-on-port
---
```
**Insight:** Core was built as a *superset* of the existing hub — reused libraries unchanged, the new surface wired additively (strangler-fig) — rather than a rewrite. The conformance review confirmed no reused contract changed and the seam held. Reuse-under-test consistently beat rewrite: less drift, faster gate clearance, existing behavior provably preserved.
**Recommendation:** Add a pattern: when extending or porting an existing component, prefer wrapping/reusing the proven logic behind a strangler-fig seam (additive wiring, reused modules untouched) and guard the boundary with snapshot/conformance tests proving no existing contract changed — rewrite only when the old logic is genuinely unfit.

### L-006 — Stack choice must follow the user's existing ecosystem, not the agent's default
```yaml
---
id: L-2026-06-07-006
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: frontend-developer       # also solution-architect
target: claude/skills/development/frontend/frontend-developer/SKILL.md
type: gotcha
scope: universal
status: promoted
theme: stack-consistency-with-ecosystem
---
```
**Insight:** The frontend default (React) was the wrong call here: the org/user standard is Angular. Defaulting to the agent's favorite stack ignored consistency with the user's other projects and had to be corrected after the lean was already set. A stack chosen for novelty/preference creates a maintenance island.
**Recommendation:** Add a checklist item: before defaulting to a frontend (or any) stack, detect and weigh the user's existing ecosystem/standard (other repos, declared house stack) and prefer consistency with it; surface a stack decision explicitly when no signal exists rather than defaulting silently.
**Also route to:** solution-architect — same recommendation at the architecture-decision level, scope universal.

### L-007 — Keep execution surfaces unbuilt and separately gated until their own dedicated security pass clears
```yaml
---
id: L-2026-06-07-007
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: secops-engineer
target: claude/skills/operations/secops/secops-engineer/SKILL.md
type: pattern
scope: universal
status: promoted
theme: gate-exec-surfaces-separately
---
```
**Insight:** Host-CLI and SSH execution (RCE-class surfaces) were explicitly excluded from the "local foundation" gate; the conformance review *proved* they stayed unbuilt by grepping for `spawn`/`child_process`/`ssh`/runner imports. A local/no-exec foundation can pass its gate while execution stays hard-gated behind its own dedicated pass — and "no exec leaked" should be verified, not assumed.
**Recommendation:** Add a pattern: scope security approvals to the actual surface; an execution/RCE-class capability (host-CLI spawn, SSH) requires its **own** dedicated hard SECOPS pass and must not ride along on a foundation gate — and a foundation's gate should verify (e.g. by grep/conformance) that no exec path leaked into it.

### L-008 — Gate verifiers should prove the negative (what was NOT built / NOT touched), not just the positive
```yaml
---
id: L-2026-06-07-008
date: 2026-06-07
source: sprint-02-multi-project-studio
agent: orchestration            # /verify + /sm gate discipline
target: claude/skills/management/scrum-master/SKILL.md
type: checklist
scope: universal
status: promoted
theme: prove-the-negative
---
```
**Insight:** The strongest assurances this sprint were negative ones, proven by test/grep: "DELETE leaves on-disk files intact," "analyzer never reads outside root," "no exec path exists," "no secrets persisted." Positive-only verification would have missed exactly the failures that matter (silent escape, silent over-deletion, silent exec).
**Recommendation:** Add to the gate/Definition-of-Done discipline: for any destructive, boundary, or capability-scoping ticket, require a test (or grep/conformance check) that proves the **negative** — files untouched, reads confined, capability absent, secrets not persisted — not only that the happy path works.

---

## Routing summary for /kai

| # | Learning (theme) | Primary target skill | Also route to | Scope | Type |
|---|------------------|----------------------|---------------|-------|------|
| L-001 | Orchestrator never writes code | CLAUDE.md / orchestration | — | universal | pattern |
| L-002 | Facts-only code/comments | reviewer (/rev) | backend-developer, frontend-developer | universal | checklist |
| L-003 | Verify reused controls in source | secops-engineer | — | universal | checklist |
| L-004 | Byte-for-byte parity test for cross-component derived key | backend-developer | solution-architect | universal | pattern |
| L-005 | Reuse-under-test beats rewrite on port (strangler-fig) | backend-developer | — | universal | pattern |
| L-006 | Stack follows the user's ecosystem | frontend-developer | solution-architect | universal | gotcha |
| L-007 | Exec surfaces gated separately, own SECOPS pass | secops-engineer | — | universal | pattern |
| L-008 | Prove the negative at the gate | scrum-master / orchestration | reviewer | universal | checklist |

**Recurring-by-target (≥ the candidates /kai should cluster first):**
- **secops-engineer** appears 2× (L-003 verify-reused-controls, L-007 gate-exec-separately) — strong promotion candidates.
- **backend-developer** appears 2× as primary (L-004 parity, L-005 reuse-over-rewrite), 1× routed (L-002).
- **reviewer** 1× primary (L-002), 1× routed (L-008); **frontend-developer**/**solution-architect** each 1× primary + 1× routed.

All eight are `scope: universal`. **Promotion status (/kai, 2026-06-07):** L-003, L-004, L-005, L-006, L-007, L-008 → `promoted` (applied to the target skills). L-001 (orchestrator-never-codes) and L-002 (facts-only code/comments) → left `open` as **already-present duplicates**: L-001 is the orchestration principle in `claude/CLAUDE.md`; L-002 is already a BLOCKING reviewer standard and present author-side in the backend/frontend developer skills. None carry project/sprint specifics in the *recommendation* text (the frontmatter `source` is metadata only, stripped on promotion).

**Next agent:** **/kai** — review these learnings, cluster by target skill + theme, and propose the recurring ones (start with the two secops-engineer items and the two backend-developer items) as human-approved SKILL.md updates. To feed the file-based store, lift each block into `./.aidevteam/learnings/`.

---
---

# Cockpit v2 slice — Retrospective (for /kai)

**Facilitator:** /sm (Luda) · **Date:** 2026-06-08 · **Scope of work:** ADT-218 (Projects Home: first-run pitch + enriched card + global needs-you strip), ADT-219 (Project Shell: long-description header + Workflow/Tasks/Base read panels), ADT-220 (folder picker + read-only `$HOME`-confined directory-browser endpoint). Designed and shipped end-to-end through the full gated workflow and committed in 5 logical commits on `feat/dart`.

> **Format note for /kai** (same as the slice-1 section above). Each learning is a self-contained block with the learning-store frontmatter (`agent` = target skill, `type`, `scope`, `status`). Cluster by `target` skill + `theme`; promote recurring `scope: universal` ones (≥ 3 matching → promote). To activate, lift each block into `./.aidevteam/learnings/L-2026-06-08-NNN.md` (one file per block). Recommendation text is project-agnostic by construction; the frontmatter `source` is metadata only, stripped on promotion.
>
> **Goal achieved:** **Yes.** The full slice (218/219/220) is DONE — all upstream hard gates (ARCH / SECOPS / DESIGN / CODE_REVIEWED / VERIFIED) genuinely satisfied in code, the one new attack surface proven by executing negative tests, ratified claim strings shipped verbatim. Final state: **125 hub + 118 vitest + 13 Playwright** green; build clean.

---

## Sprint metrics

| Metric | Value |
|--------|-------|
| Tickets committed | 3 (ADT-218, ADT-219, ADT-220) |
| Tickets completed | 3 |
| Tickets deferred | 0 (PD-9/PD-10 add-docs & edit-overrides intentionally out of slice scope) |
| Hard gates fired | 5 — ARCH, SECOPS (HARD on ADT-220), DESIGN, CODE_REVIEWED, VERIFIED |
| Bugs caught in review (/rev) | 2 WARNINGs (focus-return non-fact doc-comment; `needsYou` overlay seeded in summed bucket map) — both fixed before /verify |
| Bugs caught by live user testing | 3 (long-title vertical wrap; picker Connect disabled on navigate-in; placeholder footer links routing home) |
| Bugs escaped to user (post-commit) | 0 |
| SECOPS conditions | 15 (C-1…C-15) + 15 negative tests (N-1…N-15), all verified in code by /rev and re-verified by /verify |
| Test delta | hub 124→125, vitest 107→118 (W1/W2 + bug-fix coverage), Playwright suite reworked to 13 |
| Commits | 5 (serve prod build · projections · fs browser · frontend · e2e rework) |

---

## What went well

- **The hard SECOPS gate worked exactly as designed.** A filesystem-read endpoint (`GET /api/fs/roots`, `/api/fs/list`) was converted by /secops into 15 concrete, testable conditions + a 15-item negative-test checklist *before* a line of it was written. /rev and /verify then **independently re-read the source** (not the claim about it) and confirmed every control fires and every negative test would fail if its control were removed. The prefix trap (`/home/foo` vs `/home/foobar`), symlink-escape (path and child), no-content-leak (real `.ssh`/key-bytes fixture), DoS truncation, and pure-read (no mutation) are all proven, not asserted. This is the "prove the negative" discipline (slice-1 L-008) paying off on a real attack surface.
- **Serving the production build same-origin turned out to be the correct architecture, not just a test fix.** The pivot away from the dev server (forced by browser-automation friction, below) also removed the `/api` proxy hop and the HMR socket from the runtime path — a cleaner, more representative shell.
- **Honesty guardrails on UI copy held under a dedicated gate.** /secops ratified exact claim strings; the no-egress claim was scoped to DART (the host AI tool still sends prompts under the user's own plan), "security-reviewed" was bound to mean "the gate ran and approved," never "this code is secure." /fe shipped them verbatim from a single centralised `copy.ts`, and a grep for every rejected absolute ("100% private", "never touches the cloud", "verified secure", …) came back clean.
- **Facts-only discipline held this time.** Unlike slice 1 (where process artifacts leaked repeatedly and were stripped at /rev), the changed source passed the facts-only grep clean — the only matches were product-domain content (the workflow panel legitimately renders `/po`, `/arch` as the product's subject matter). The slice-1 reviewer/author learning appears to have taken.
- **Read-only-by-design kept the SECOPS scope small.** ADT-219's panels are pure projections (no new write surface → no SECOPS hard gate triggered); add-documents and edit-overrides were deferred (PD-9/PD-10) specifically to avoid widening the attack surface. Proportional process: only ADT-220 drew the hard gate.

## What was hard

- **Agent-driven browser verification could not screenshot the live dev server.** The dev server's HMR websocket (and the SPA itself) never reach Playwright/Chrome-extension "network-idle," so screenshot-based verification hung. **Root cause:** a never-closing socket means "network idle" is never satisfied against a dev server. We pivoted to having the Core serve the **production build same-origin** — which both unblocked verification and turned out to be the right architecture.
- **Live user testing caught three defects that the entire green test suite did not.** All three were "what does the user actually click / see" failures, not logic failures: (1) a long hyphenated card title wrapped **vertically** (browser hyphenation on a narrow tile); (2) the folder picker's **Connect stayed disabled when the user navigated INTO the folder they wanted** — the test fixtures selected-then-connected, but the real mental model is *navigate-in, then connect*; (3) placeholder footer links were **half-wired routes that bounced to the home route** instead of being inert. **Root cause:** tests asserted the happy data path; they did not cover at-a-glance/long-content/empty visual states or model the user's real click sequence, and "coming soon" affordances were wired as real (but dead-ended) controls rather than genuinely inert ones.
- **The Playwright suite needed a full rework, not a patch.** The redesign removed the old typed-path connect UI (`connect-path`/`connect-submit`/"No projects yet"), so the pre-existing specs drove dead selectors. Rework also surfaced real determinism traps: Playwright imports the config module more than once per run, so `mkdtemp` fixture slugs made the manifest the specs read disagree with the folders the hub served (fixed with **fixed slugs**); the one-time registry reset had to move to `global-setup.ts` so the empty-state spec sees zero projects without a mid-run wipe erasing later specs' projects; picker keyboard tests needed explicit re-focus inside the modal (a leaked-to-`<body>` Backspace triggers browser-back).

## What we learned

- For agent-driven browser verification, **serve a production build, not a dev server** — a dev server's HMR socket never lets the page reach network-idle, and the prod build is what ships anyway.
- **Green tests are not "works."** At-a-glance / empty / long-content visual states and the user's *actual click sequence* (e.g. navigate-into-then-act) need explicit coverage; they are exactly what unit/integration assertions on the data path miss.
- **Placeholder/"coming soon" affordances must be genuinely inert** (`disabled` + `aria-disabled`, no navigation), never half-wired routes that dead-end on the home page.
- The "prove the negative" gate (slice-1 L-008) is the right tool for a new read surface: a filesystem-disclosure endpoint must ship **refusal/skip/cap tests**, and the access guard belongs on the GET (loopback binding alone does not stop a hostile web page from `fetch()`-ing loopback).
- A **single source of truth for security/marketing claim strings**, ratified by /secops and consumed verbatim, makes the honesty guarantee greppable and prevents drift.

## Action items for next slice

| Action | Owner | Priority |
|--------|-------|----------|
| When a slice has a user-facing UI, add an explicit visual-state pass (empty / long-content / at-a-glance) and model the real click sequence before declaring done | /qa + /e2e | P1 |
| Default agent-driven browser verification to the production build served same-origin; document the dev-server network-idle trap | /e2e + /fe | P1 |
| Treat every "coming soon" affordance as inert-by-default in design + implementation; verify it does not navigate | /ui + /fe | P2 |

---

## Reusable learnings for /kai (project-agnostic, routed to target skills)

### L-009 — Agent-driven browser verification must run against a production build, not a dev server
```yaml
---
id: L-2026-06-08-009
date: 2026-06-08
source: cockpit-v2-slice
agent: e2e-tester               # /e2e — also /fe
target: claude/skills/quality/e2e/SKILL.md
type: gotcha
scope: universal
status: open
theme: verify-against-prod-build
---
```
**Insight:** A dev server keeps a hot-reload/HMR websocket (and often a long-poll) open for the life of the page, so a browser automation tool waiting for "network-idle" never proceeds and screenshot/verification hangs. The production build has no such socket and is what actually ships.
**Recommendation:** For any agent-driven browser verification or screenshotting, serve and drive the **production build same-origin**, not the dev server. If a flow appears to hang at "waiting for network idle," suspect a never-closing dev-server socket first. Bonus: the prod build exercises the real same-origin API path, removing the dev proxy from the runtime under test.
**Also route to:** frontend-developer (provide/serve a prod build for verification), scope universal.

### L-010 — Green tests ≠ works: cover visual states and the user's real click sequence
```yaml
---
id: L-2026-06-08-010
date: 2026-06-08
source: cockpit-v2-slice
agent: qa-tester                # /qa — also /e2e, /fe
target: claude/skills/quality/qa/SKILL.md
type: checklist
scope: universal
status: open
theme: visual-state-and-real-interaction-coverage
---
```
**Insight:** A fully green unit/integration/e2e suite still let three real defects ship to live user testing: a long title wrapping vertically, an action control disabled in the path the user actually takes (navigate-into-then-act, vs the test's select-then-act), and a placeholder control that dead-ended. All three are "what the user sees / actually clicks" failures the happy-data-path assertions never exercised.
**Recommendation:** For any user-facing change, add explicit coverage for **at-a-glance, empty, and long/overflowing-content visual states**, and assert the user's **real interaction sequence** (e.g. navigate-into-a-folder-then-confirm), not just the most convenient one to set up in a fixture. Treat "the happy data path passes" as necessary but not sufficient.
**Also route to:** e2e-tester, frontend-developer — same recommendation, scope universal.

### L-011 — Placeholder / "coming soon" affordances must be genuinely inert, never half-wired routes
```yaml
---
id: L-2026-06-08-011
date: 2026-06-08
source: cockpit-v2-slice
agent: frontend-developer       # /fe — also /ui
target: claude/skills/development/frontend/frontend-developer/SKILL.md
type: anti-pattern
scope: universal
status: open
theme: inert-placeholder-affordances
---
```
**Insight:** Footer/forward controls for not-yet-built features were wired as real routes that bounced the user back to the home route — a confusing dead-end that looked like a bug. The fix made them `disabled` + `aria-disabled="true"`, non-navigating, labelled "(coming soon)".
**Recommendation:** A control for an unbuilt feature must be **inert by construction** — visibly and programmatically disabled (`disabled` + `aria-disabled`), with no navigation/side effect and an honest "coming soon" label. Never ship a placeholder as a half-wired link/route that dead-ends. Verify with a test that a click neither navigates nor mutates state.
**Also route to:** ui-designer — specify placeholder/disabled states in the design, scope universal.

### L-012 — A read/disclosure endpoint needs the write-guard ON the GET and refusal tests, because loopback binding alone is not a control
```yaml
---
id: L-2026-06-08-012
date: 2026-06-08
source: cockpit-v2-slice
agent: secops-engineer          # /secops — also /be, /rev
target: claude/skills/operations/secops/secops-engineer/SKILL.md
type: pattern
scope: universal
status: open
theme: guard-disclosure-gets
---
```
**Insight:** A localhost-bound GET that discloses local capability/structure (e.g. a filesystem lister) is reachable by any website the operator visits via `fetch('http://127.0.0.1:<port>/...')`. Loopback binding does **not** protect it. The control that does is the anti-CSRF/anti-DNS-rebinding write-guard (custom header forcing a preflight + Host/Origin pinned to loopback + loopback-socket check) applied **to the GET, before any work**, plus negative tests proving each refusal arm (missing header → 403, bad Host/Origin → 403, non-loopback socket → 403, no permissive CORS).
**Recommendation:** Classify a GET that discloses local filesystem/structure/capability as **capability-bearing**, not public, and route it through the same write-guard gauntlet as mutating requests — before any FS/work — with negative tests for each refusal arm and an assertion of no permissive CORS. Treat loopback binding as a perimeter, never as the access control.
**Also route to:** backend-developer (wire the guard on the disclosure GET), reviewer (verify it fires before any work), scope universal.

### L-013 — Centralise ratified security/marketing claim strings as a single greppable source of truth
```yaml
---
id: L-2026-06-08-013
date: 2026-06-08
source: cockpit-v2-slice
agent: frontend-developer       # /fe — also /secops, /mkt
target: claude/skills/development/frontend/frontend-developer/SKILL.md
type: pattern
scope: universal
status: open
theme: single-source-claim-strings
---
```
**Insight:** Security/privacy claims in the UI ("local-first", "nothing is uploaded", "security-reviewed") are technical assertions that must match real behaviour and be free of strengthened absolutes. Centralising the ratified strings in one module, consumed verbatim, made the honesty guarantee **greppable** — a single grep proved no rejected absolute ("100% private", "never touches the cloud", "verified secure") slipped in, and any edit that strengthens an assurance is visible in one place.
**Recommendation:** Keep user-facing security/privacy/marketing claim strings in a single named module, ship them verbatim from the ratifying review, and scope every privacy claim to the product (not the host model). A gate-pass badge must mean "the gate ran and approved," never "this code is secure." Verify with a grep for the rejected absolutes as part of review.
**Also route to:** secops-engineer (ratify the exact strings; bind the badge meaning), marketing (honesty caveats), scope universal.

---

## Routing summary for /kai (Cockpit v2 slice)

| # | Learning (theme) | Primary target skill | Also route to | Scope | Type |
|---|------------------|----------------------|---------------|-------|------|
| L-009 | Verify against a production build, not a dev server | e2e-tester (/e2e) | frontend-developer | universal | gotcha |
| L-010 | Green tests ≠ works — cover visual states + real click sequence | qa-tester (/qa) | e2e-tester, frontend-developer | universal | checklist |
| L-011 | Placeholder affordances must be genuinely inert | frontend-developer (/fe) | ui-designer | universal | anti-pattern |
| L-012 | Guard disclosure GETs; loopback ≠ a control; prove the refusals | secops-engineer (/secops) | backend-developer, reviewer | universal | pattern |
| L-013 | Single greppable source of truth for ratified claim strings | frontend-developer (/fe) | secops-engineer, marketing | universal | pattern |

**Recurring-by-target / promotion candidates for /kai:**
- **frontend-developer** appears 3× (L-011 primary, L-009/L-013 routed-or-primary) — strongest cluster; L-011 (inert placeholders) and L-013 (claim-string SoT) are clean primaries.
- **secops-engineer** L-012 (guard disclosure GETs) reinforces the existing slice-1 cluster (L-003 verify-reused-controls, L-007 gate-exec-separately) — a 3rd secops item on the "prove the negative on a new read surface" theme; strong promotion candidate.
- **qa-tester / e2e-tester** L-009 + L-010 are net-new for the quality skills (visual-state coverage, prod-build verification) — no prior duplicate; promote.

All five are `scope: universal` and carry no project/sprint/ticket specifics in the recommendation text.

**Next agent:** **/kai** — review L-009…L-013, cluster with the prior slice-1 learnings, and propose the recurring ones (start with the frontend-developer cluster and the secops-engineer disclosure-GET item) as human-approved SKILL.md updates. Lift each block into `./.aidevteam/learnings/` to feed the file-based store.
