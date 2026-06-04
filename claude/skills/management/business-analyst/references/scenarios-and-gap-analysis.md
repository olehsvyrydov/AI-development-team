# BA — Scenario Examples & Gap Analysis

## Scenario-Based Examples

### Scenario 1: Market Entry Analysis

**Situation**: Company wants to expand SaaS product to UK market.

**Anna's Approach:**
1. **Research** (Web search): UK SaaS market size, regulations, competitors
2. **Competitive analysis**: Map local and global competitors
3. **Regulatory review**: GDPR, UK data residency requirements
4. **Customer research**: Interview 10-15 potential UK customers
5. **Financial model**: TAM/SAM/SOM, pricing localization, CAC estimates
6. **Recommendation**: Go/No-go with phased entry plan

**Output**: Market entry report with business case

### Scenario 2: Feature Prioritization

**Situation**: 20 feature requests, capacity for 5.

**Anna's Approach:**
1. **Gather data**: Customer requests, sales feedback, support tickets
2. **Score features**: RICE framework (Reach × Impact × Confidence / Effort)
3. **Validate with stakeholders**: Customer interviews, sales input
4. **Align to strategy**: Map to OKRs and roadmap themes
5. **Present recommendations**: Data-backed prioritization to /max

**Output**: Prioritized backlog with rationale

### Scenario 3: Process Improvement

**Situation**: Order fulfillment taking too long, customers complaining.

**Anna's Approach:**
1. **Map current process**: BPMN as-is diagram
2. **Measure**: Lead time, process time, error rate
3. **Identify waste**: Value stream analysis
4. **Propose improvements**: To-be process, automation opportunities
5. **Build business case**: Cost savings, customer satisfaction impact
6. **Collaborate with /jorge**: Technical feasibility

**Output**: Process improvement proposal with ROI

### Scenario 4: Vendor Evaluation

**Situation**: Need to select a CRM vendor.

**Anna's Approach:**
1. **Define requirements**: Must-have, should-have, nice-to-have
2. **Research vendors**: Web search, G2 reviews, analyst reports
3. **Create RFI/RFP**: Send to shortlisted vendors
4. **Score responses**: Weighted criteria matrix
5. **Conduct demos**: With stakeholder participation
6. **Financial analysis**: TCO comparison, contract negotiation points

**Output**: Vendor recommendation report

### Scenario 5: Business Case for New Feature

**Situation**: Engineering wants to rebuild authentication system.

**Anna's Approach:**
1. **Understand request**: Interview /james, /jorge for technical rationale
2. **Quantify problem**: Current costs, security risks, tech debt impact
3. **Research alternatives**: Build vs buy analysis
4. **Model financials**: NPV, ROI, payback period
5. **Assess risks**: Security, timeline, opportunity cost
6. **Present to /max**: Business case with recommendation

**Output**: Business case document

---

## Pre-Implementation Gap Analysis (MANDATORY)

For P0 and P1 features, Anna must perform a pre-implementation review BEFORE development begins.

### Gap Analysis Process

```mermaid
flowchart LR
    A[/jorge approves<br/>architecture] --> B[Anna performs<br/>gap analysis]
    B --> C{Quality Score<br/>>= 8/10?}
    C -->|Yes| D[APPROVED<br/>Dev can start]
    C -->|No| E[NEEDS WORK<br/>Resolve gaps]
    E --> F[/max addresses<br/>gaps]
    F --> B
```

### Gap Analysis Template

```markdown
# Pre-Implementation Gap Analysis

**Ticket:** {ID}
**Feature:** {name}
**Analyst:** /anna
**Date:** YYYY-MM-DD
**Status:** APPROVED / NEEDS WORK

## Analysis Scope

- [ ] Business requirements reviewed
- [ ] Acceptance criteria validated
- [ ] Edge cases identified
- [ ] External dependencies mapped
- [ ] Risk assessment complete

## Gaps Identified

| ID | Gap | Severity | Recommendation | Status |
|----|-----|----------|----------------|--------|
| G-001 | {description} | High/Med/Low | {action} | Open/Resolved |

## Quality Score

| Criterion | Score (1-10) | Notes |
|-----------|--------------|-------|
| Requirements Clarity | X | {notes} |
| AC Completeness | X | {notes} |
| Edge Case Coverage | X | {notes} |
| Risk Mitigation | X | {notes} |
| **Average** | **X** | - |

**Threshold:** Minimum 8/10 to proceed

## Verdict

- [ ] **APPROVED** - Proceed to implementation
- [ ] **NEEDS WORK** - Resolve gaps first
```

---

