# Scrum Master — Quality Gates (E2E traceability · investigation quality · retro best practices)

## E2E Test Traceability Quality Gate (MANDATORY)

Before accepting /adam's test delivery for any ticket, /luda MUST verify:

1. **Traceability matrix provided** — /adam delivers a TC-XX → test file:line mapping table. If missing, REJECT and send back.
2. **100% TC coverage** — Every test case from /rob's Test Plan has a corresponding automated test. Uncovered TCs require documented justification.
3. **No untraceable tests** — Every test maps to a TC-XX. Tests without traceability are likely testing implementation instead of requirements.
4. **/rob has reviewed and approved** — /rob signs off on the traceability matrix before /luda accepts.
5. **/rob's Test Plan covers all three categories** — Positive, negative, and edge cases. A Test Plan with only happy-path tests is INCOMPLETE — send back to /rob.
6. **/rev has reviewed test code quality** — /adam's test scripts are code and go through /rev code review. /rev checks for duplication, hardcoded credentials, silent skipping, regex precision, and shared helper extraction. /rob checks test case coverage; /rev checks code quality. Both must approve.

**This gate applies to all projects regardless of technology stack (Java, Python, Go, PHP, etc.).**

If this gate is not passed, the ticket CANNOT move to Done.

### Why /rev Reviews Test Code

Test scripts are production artifacts — they run in CI, they guard against regressions, and they are maintained long-term. When /rob flags duplication (e.g., "loginAsAdmin is copied in 3 files"), the fix must be *extract and share*, not *copy and align*. /rev catches code quality issues that /rob (focused on AC coverage) and /adam (focused on test behavior) miss: DRY violations, hardcoded secrets, overly permissive regex, runtime `test.skip()` anti-patterns.

## Investigation Quality Gate (MANDATORY)

**Effective:** All investigations from Sprint 51 onward
**Enforcement:** /luda verifies gate completion before accepting any investigation report
**Scope:** ALL investigation tasks assigned to ANY agent

### Purpose

This gate prevents the pattern where agents produce excellent technical analysis that misses the most important questions. Individual expertise is necessary but not sufficient — the gate ensures every investigation covers the meta-level questions that domain expertise alone does not guarantee.

### 5-Step Investigation Workflow

Replace the "assign and collect" pattern with:

```
Step 1: FRAME (Luda facilitates)
  - Restate the problem in USER terms (not solution terms)
  - Challenge the premise: Is this the right question?
  - Verify feature health: Does the thing under investigation actually work?
  - Define success metrics: What does "better" mean for the user?

Step 2: ALIGN (All investigators, brief sync)
  - Share initial hypotheses
  - Assign coverage areas (avoid duplication)
  - Identify gaps in coverage
  - Agree on shared assumptions

Step 3: INVESTIGATE (Parallel agent work)
  - Each agent works within their assigned scope
  - P0/P1 Escalation Protocol active
  - Each report must pass Quality Gate checklist

Step 4: CONSOLIDATE (Luda + all agents)
  - Cross-read: each agent reviews one other agent's report
  - Identify contradictions, gaps, and overlaps
  - Challenge findings: "What did we miss?"
  - Synthesize into unified recommendation

Step 5: PLAN (Luda + /jorge)
  - Create sprint tickets from consolidated findings
  - Prioritize by user impact, not technical elegance
  - Ensure P0 issues are addressed before optimization
```

### P0 Escalation Protocol

When ANY agent discovers a P0 or P1 issue during an investigation:

1. **IMMEDIATELY stop investigation work**
2. Write a 3-line summary: What is broken / User impact / Location in code
3. Report to /luda
4. /luda triages within 1 hour:
   - **HALT**: Stop all investigation, fix the P0 first
   - **CONTINUE**: Note the P0, but current investigation scope is different
   - **PIVOT**: Reframe the investigation around the P0 finding
5. All other investigating agents are notified

### Pre-Submission Checklist (Agent Must Complete)

```
VERIFICATION (Non-negotiable)
- [ ] Feature tested on staging (not assumed to work)
- [ ] End-to-end pipeline verified (data flows from input to user-visible output)
- [ ] Output quality manually assessed (not just speed/latency metrics)

PREMISE CHALLENGE (Non-negotiable)
- [ ] Investigation premise explicitly challenged in report
- [ ] "Is this the right question?" section included
- [ ] Alternative framings explored (minimum 2)
- [ ] "Do nothing" option evaluated

SOLUTION COMPLETENESS (Required)
- [ ] Infrastructure, algorithmic, AND content/prompt solutions all evaluated
- [ ] ROI comparison across solution types included
- [ ] "What did I miss?" section present
```

### Gate Failure

Reports that skip verification are returned with "BLOCKED: Verification Required" status. Agent has 24 hours to address gaps.

---

## Retrospective Best Practices (Continuous Improvement)

### 5 Questions Framework

In addition to the standard "What went well / What could be improved / What should change" format, use the **5 Questions Framework** for deeper insights:

1. **More of** — What practices delivered value? Double down on these.
2. **Less of** — What created waste, confusion, or rework? Reduce these.
3. **Keep doing** — What's working well? Protect these practices from erosion.
4. **Stop doing** — What's actively harmful? Zero tolerance going forward.
5. **Start doing** — What new practices should we adopt? These become ACTION ITEMS.

### Retrospective Quality Checklist

Before closing a retrospective:

- [ ] **Every agent who participated in the sprint has provided input** — not just dev and QA
- [ ] **Themes are deduplicated and ranked by agent consensus** — 3+ agents = HIGH priority, 2 = MEDIUM, 1 = LOW
- [ ] **Action items are SMART** — Specific, Measurable, Achievable, Relevant, Time-bound (target sprint assigned)
- [ ] **Each action item has an owner** — no orphaned improvements
- [ ] **Previous retro action items reviewed** — close the loop before opening new items
- [ ] **Skill file updates identified** — which agents need updated skills from this sprint?
- [ ] **Team workflow updates identified** — what process changes should be codified?

### Knowledge Extraction Protocol

After consolidating retrospective inputs:

1. **Agent Skills Update** — Extract universal learnings (checklists, anti-patterns, patterns) and update relevant agent SKILL.md files. Never reference specific sprints or tickets.
2. **Team Workflow Update** — Extract process improvements and add to TEAM_WORKFLOW.md Process Improvements section with version number.
3. **Definition of Done Update** — If the retro reveals missing quality gates, add them to the DoD checklist.
4. **Sprint Start Checklist Update** — If the retro reveals missing pre-sprint checks, add them.
5. **Follow-up Tracking** — Create tech debt tickets (TD-XXX) for items that need implementation, not just process changes.

### Retrospective Anti-Patterns

- **Action Item Graveyard** — Less than half of retro action items ever get completed. Limit to 3-5 items per sprint. Quality over quantity.
- **Same Retro, Different Day** — If the same issues appear in consecutive retros, escalate. The process fix from last retro didn't work.
- **Missing Voices** — If only 2-3 agents provide input, the retro is incomplete. Every participant's perspective matters.
- **Vague Action Items** — "Improve testing" is not actionable. "Add translation key validation to pre-deployment checklist" is.
- **No Follow-Up** — First 10 minutes of next retro MUST review previous action items. Close the loop.

### Translation & Localization Gate

When any feature adds user-facing text (UI labels, admin fields, error messages):

- [ ] All translation keys exist in ALL supported locale files before QA
- [ ] Admin panel field labels verified in both locales during code review
- [ ] Translation validation is part of the implementation checklist, not a QA discovery

---

