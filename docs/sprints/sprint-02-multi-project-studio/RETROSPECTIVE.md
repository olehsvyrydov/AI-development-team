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
