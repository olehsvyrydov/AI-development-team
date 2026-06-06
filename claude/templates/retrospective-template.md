# Sprint Retrospective Template

Use this template for a **full, multi-expert** sprint retrospective. For the lightweight, proportional default that also **captures reusable learnings** to `.aidevteam/learnings/` (which [`/kai`](../commands/kai.md) promotes into agent skills), run [`/retro`](../commands/retro.md).

---

## Quick Start

After sprint completion, run parallel retrospectives:

```bash
# Run these agents in parallel for comprehensive retrospective
/jorge - Architecture review
/anna - Business analysis review
/inga - Finance/MTD review (if finance features)
/alex - Legal/GDPR review (if legal features)
/apex - Marketing/GTM review (if launch-related)
```

Then consolidate with:
```bash
/luda - Consolidate findings, create tickets, update workflow
```

---

## Agent Retrospective Template

Copy this template for each agent's retrospective report:

```markdown
# {Role} Retrospective: Sprint {N}

**Agent:** /{agent}
**Date:** YYYY-MM-DD
**Sprint:** {N}
**Overall Score:** X/10

---

## 1. What Went Well

### Area 1: {Area Name}

| Metric | Score | Notes |
|--------|-------|-------|
| {metric} | X/10 | {description} |

**Key Achievements:**
- Achievement 1
- Achievement 2
- Achievement 3

### Area 2: {Area Name}

| Metric | Score | Notes |
|--------|-------|-------|
| {metric} | X/10 | {description} |

**Key Achievements:**
- Achievement 1
- Achievement 2

---

## 2. What Could Be Improved

### Critical Issues (P0)

| ID | Issue | Risk | SP Est. | Recommendation |
|----|-------|------|---------|----------------|
| {ID}-001 | {description} | HIGH/MED | X | {fix} |

### High Priority Issues (P1)

| ID | Issue | Risk | SP Est. | Recommendation |
|----|-------|------|---------|----------------|
| {ID}-002 | {description} | MED/LOW | X | {fix} |

### Lower Priority Issues (P2)

| ID | Issue | Risk | SP Est. | Recommendation |
|----|-------|------|---------|----------------|
| {ID}-003 | {description} | LOW | X | {fix} |

---

## 3. What Should Change

### Process Changes

| ID | Change | Category | Impact | Owner |
|----|--------|----------|--------|-------|
| PROC-001 | {change description} | {category} | HIGH/MED/LOW | /{agent} |

### Workflow Updates

| ID | Update | Current State | Proposed State |
|----|--------|---------------|----------------|
| WF-001 | {update} | {current} | {proposed} |

---

## Technical Debt Tickets Created

| Ticket | Title | SP | Priority | Owner |
|--------|-------|-----|----------|-------|
| TD-XXX | {title} | X | P1/P2 | /{dev} |

---

## Recommendations for Next Sprint

### Must Address (P0)
1. {Recommendation 1}
2. {Recommendation 2}

### Should Address (P1)
1. {Recommendation 1}
2. {Recommendation 2}

### Consider (P2)
1. {Recommendation 1}

---

## External Blockers

| Blocker | Owner | Status | Impact |
|---------|-------|--------|--------|
| {blocker} | {owner} | NOT STARTED/IN PROGRESS | {impact} |

---

**Report Prepared By:** /{agent}
**Date:** YYYY-MM-DD
```

---

## Consolidated Retrospective Template

/luda uses this template to consolidate all agent inputs:

```markdown
# Consolidated Retrospective: Sprint {N}

**Date:** YYYY-MM-DD
**Facilitator:** /luda
**Contributing Agents:** /jorge, /anna, /inga, /alex, /apex

---

## Executive Summary

{2-3 sentence summary of sprint outcomes}

**Key Metrics:**
- Planned SP: X
- Delivered SP: Y
- Velocity: Z
- Quality Score: X/10

**Critical Blockers:** {count}
**Tech Debt Items:** {count} ({SP} SP total)

---

## 1. What Went Well (Combined)

### Architecture (/jorge) - Score: X/10
{Summary of achievements}
- Key achievement 1
- Key achievement 2

### Business Analysis (/anna) - Score: X/10
{Summary of achievements}
- Key achievement 1
- Key achievement 2

### Finance (/inga) - Score: X/10 (if applicable)
{Summary of achievements}
- Key achievement 1
- Key achievement 2

### Legal (/alex) - Status: APPROVED/CONDITIONAL (if applicable)
{Summary of achievements}
- Key achievement 1
- Key achievement 2

### Marketing (/apex) - Readiness: X% (if applicable)
{Summary of achievements}
- Key achievement 1
- Key achievement 2

---

## 2. What Could Be Improved (All Issues)

### P0 - Critical (Must Fix Before Launch)

| ID | Issue | Agent | Risk | SP Est. |
|----|-------|-------|------|---------|
| {ID} | {issue} | /{agent} | HIGH | X |

### P1 - High Priority (Should Fix This Sprint)

| ID | Issue | Agent | Risk | SP Est. |
|----|-------|-------|------|---------|
| {ID} | {issue} | /{agent} | MED | X |

### P2 - Medium Priority (Backlog)

| ID | Issue | Agent | Risk | SP Est. |
|----|-------|-------|------|---------|
| {ID} | {issue} | /{agent} | LOW | X |

---

## 3. What Should Change (Process Improvements)

| ID | Change | Category | Owner | Status |
|----|--------|----------|-------|--------|
| PROC-XXX | {change} | {category} | /{agent} | NEW |

---

## Technical Debt Tickets Created

### From /jorge (Architecture)
- TD-XXX: {Title} ({SP} SP)

### From /inga (Finance)
- SE-XXX: {Title} ({SP} SP)

### From /alex (Legal)
- SE-XXX: {Title} ({SP} SP)

### From /apex (Marketing)
- SE-XXX: {Title} ({SP} SP)

**Total Tech Debt:** X SP

---

## External Blockers (CRITICAL)

| Blocker | Owner | Status | Impact |
|---------|-------|--------|--------|
| {blocker} | {owner} | NOT STARTED | **LAUNCH BLOCKED** |

**ACTION REQUIRED:** {action}

---

## Velocity Analysis

| Sprint | Planned | Delivered | Velocity |
|--------|---------|-----------|----------|
| Sprint 1 | X | X | X |
| Sprint 2 | X | X | X |
| ...
| **Total** | **X** | **X** | **X avg** |

---

## Next Sprint Recommendations

### P0 - Must Have ({SP} SP)

| Ticket | Title | SP | Owner |
|--------|-------|-----|-------|
| SE-XXX | {title} | X | /{dev} |

### P1 - Should Have ({SP} SP)

| Ticket | Title | SP | Owner |
|--------|-------|-----|-------|
| SE-XXX | {title} | X | /{dev} |

### P2 - Nice to Have ({SP} SP)

| Ticket | Title | SP | Owner |
|--------|-------|-----|-------|
| SE-XXX | {title} | X | /{dev} |

---

## Team Recognition

{List of team members and their contributions}

---

## Process Updates Made

- Updated TEAM_WORKFLOW.md with: {changes}
- Added template: {template}

---

**Report Prepared By:** /luda (Scrum Master)
**Date:** YYYY-MM-DD
```

---

## Three Questions Framework

The retrospective is structured around three questions:

### 1. What Went Well?

Focus on:
- Achievements and successes
- Practices that worked
- Team collaboration wins
- Technical victories
- Process improvements that helped

### 2. What Could Be Improved?

Focus on:
- Pain points encountered
- Inefficiencies identified
- Gaps in process or tooling
- Technical debt accumulated
- Blockers that slowed progress

### 3. What Should Change?

Focus on:
- Process changes needed
- Workflow updates
- New practices to adopt
- Things to stop doing
- Experiments to try

---

## Retrospective Checklist

Before retrospective:
- [ ] Sprint complete (all tickets done or explicitly deferred)
- [ ] CI/CD pipeline green
- [ ] Sprint metrics calculated (velocity, delivered SP)

During retrospective:
- [ ] All relevant agents participate
- [ ] Each agent completes their template
- [ ] Issues are prioritized (P0/P1/P2)
- [ ] Tickets are created for all actionable items

After retrospective:
- [ ] Consolidated report created
- [ ] TEAM_WORKFLOW.md updated if needed
- [ ] Tech debt tickets in backlog
- [ ] Next sprint planning informed
- [ ] Team recognition shared

---

## Agent Roles in Retrospective

| Agent | Focus Area | Questions to Answer |
|-------|------------|---------------------|
| /jorge | Architecture | Code quality? Technical debt? Patterns working? |
| /anna | Business | Requirements clear? User needs met? Market fit? |
| /inga | Finance | Calculations correct? Compliance met? Audit trail? |
| /alex | Legal | GDPR compliant? Contracts valid? Risk managed? |
| /apex | Marketing | Launch ready? Positioning clear? Assets created? |
| /luda | Process | Velocity stable? Blockers cleared? Team effective? |
