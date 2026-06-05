# PO — Product Strategy, Discovery & Roadmap

## Product Vision & Strategy

### Product Vision Statement Template

```
For [target customer]
Who [statement of need or opportunity]
The [product name] is a [product category]
That [key benefit, compelling reason to buy]
Unlike [primary competitive alternative]
Our product [statement of primary differentiation]
```

### Product Strategy Canvas

```
Vision (Why we exist)
    ↓
Goals (What we're trying to achieve — OKRs)
    ↓
Initiatives (Bets we're making — Now/Next/Later)
    ↓
Features (What we build — User Stories)
    ↓
Metrics (How we measure success — North Star + Input Metrics)
```

Every feature must trace back up through this chain. If a feature request can't connect to a goal, question whether it belongs.

### Writing OKRs

**Format:**
```
Objective: [Qualitative, inspiring goal]
  KR1: [Measurable outcome] from X to Y
  KR2: [Measurable outcome] from X to Y
  KR3: [Measurable outcome] from X to Y
```

**Rules:**
- 1-3 Objectives per quarter
- 3-5 Key Results per Objective
- Key Results are outcomes, not outputs ("Increase activation rate to 40%" not "Ship onboarding redesign")
- Score 0.0-1.0 at quarter end; 0.7 is good (stretch goals)
- OKRs are not performance evaluations

**Examples:**

| Product Type | Objective | Key Results |
|-------------|-----------|-------------|
| B2B SaaS | Become the go-to tool for mid-market teams | KR1: Increase weekly active teams from 500 to 1,200; KR2: Improve NPS from 32 to 50; KR3: Reduce time-to-value from 14 days to 3 days |
| Marketplace | Make sellers successful from day one | KR1: First sale within 7 days for 60% of new sellers; KR2: Seller churn drops from 12% to 6%; KR3: Avg seller revenue increases 25% |
| Consumer App | Build a daily habit | KR1: DAU/MAU ratio from 15% to 30%; KR2: Day-7 retention from 25% to 45%; KR3: Avg sessions per day from 1.2 to 2.5 |

### Vision Alignment Check

Before any feature enters the backlog, ask:

| Question | Pass/Fail |
|----------|-----------|
| Does this serve our target customer? | ✅/❌ |
| Does it connect to a current OKR? | ✅/❌ |
| Will it move a North Star input metric? | ✅/❌ |
| Is this the highest-impact use of team capacity? | ✅/❌ |
| Can we measure success within one quarter? | ✅/❌ |

If 3+ fail → push back or park in "Later."

---

## Product Discovery

### Opportunity Solution Tree (Teresa Torres)

```
Desired Outcome (OKR / North Star input)
    ├── Opportunity 1 (customer need / pain point)
    │   ├── Solution A → Assumption Test 1, Test 2
    │   └── Solution B → Assumption Test 3
    ├── Opportunity 2
    │   ├── Solution C → Assumption Test 4
    │   └── Solution D → Assumption Test 5
    └── Opportunity 3
        └── Solution E → Assumption Test 6
```

**Key principles:**
- Start with the desired outcome, not a feature request
- Map the opportunity space (customer needs, pain points, desires)
- Generate multiple solutions per opportunity
- Break solutions into assumptions and test the riskiest first
- Most assumption tests run in 1-2 days, not weeks
- "Crummy first draft" — sketch it fast, then refine

### Continuous Discovery Habits

| Habit | Frequency | Who |
|-------|-----------|-----|
| Customer interviews | Weekly (minimum) | Product Trio (PM, Designer, Engineer) |
| Opportunity mapping | After every 3-4 interviews | Product Trio |
| Assumption testing | 1-2 per week | Product Trio |
| OST review | Weekly | Product Trio |
| Stakeholder update | Bi-weekly | PO + stakeholders |

**Product Trio**: The PM, designer, and one engineer should participate in discovery together. This ensures technical feasibility is considered from the start and builds shared understanding.

### Experiment Design

```markdown
## Experiment: [Name]

**Hypothesis:** We believe [change] will [outcome] for [audience].
**Metric:** [What we'll measure]
**Target:** [Success threshold]
**Duration:** [How long to run]
**Sample:** [Who/how many]

### Method
- [ ] Prototype test / Wizard of Oz / A/B test / Survey / Interview

### Results
- Outcome: [What happened]
- Decision: [Continue / Pivot / Kill]
- Learning: [What we learned]
```

### Assumption Mapping

| Risk Level | Assumption Type | Test Method | Speed |
|-----------|-----------------|-------------|-------|
| **Desirability** (will they use it?) | Customer need exists | Interviews, surveys | 1-2 days |
| **Viability** (should we build it?) | Business model works | Spreadsheet modeling | 1-2 days |
| **Feasibility** (can we build it?) | Technically possible | Spike, prototype | 1-5 days |
| **Usability** (can they use it?) | UX is intuitive | Prototype testing | 2-3 days |
| **Ethical** (should we build it?) | No harmful effects | Impact assessment | 1 day |

Test the **riskiest assumptions first**. If desirability fails, don't test feasibility.

---

## Roadmap Planning

### Now / Next / Later Roadmap

| Column | Timeframe | Detail Level | Contains |
|--------|-----------|-------------|----------|
| **Now** | Current quarter | High detail | Outcomes + features with AC, owners, metrics |
| **Next** | Next quarter | Medium detail | Outcomes + initiatives with hypotheses |
| **Later** | 3-12 months | Low detail | Themes + strategic bets |

**Rules:**
- Items link to OKRs (no orphaned features)
- Now: 2-4 items maximum (focus)
- Items move right-to-left as clarity increases
- "Later" is not a commitment — it's a direction
- Review and update quarterly

### Roadmap Template

```markdown
## Product Roadmap — Q[N] [Year]

### Vision
[One-sentence product vision]

### OKRs This Quarter
- O1: [Objective] → KR1, KR2, KR3
- O2: [Objective] → KR1, KR2, KR3

### Now (This Quarter)
| Initiative | Outcome | Metric | Owner | Status |
|-----------|---------|--------|-------|--------|
| [Initiative 1] | [Expected outcome] | [Target metric] | [Team/Person] | 🟢/🟡/🔴 |
| [Initiative 2] | [Expected outcome] | [Target metric] | [Team/Person] | 🟢/🟡/🔴 |

### Next (Next Quarter)
| Initiative | Hypothesis | Depends On |
|-----------|-----------|------------|
| [Initiative 3] | We believe [X] will [Y] | [Dependency] |

### Later (3-12 Months)
| Theme | Strategic Bet | Connected OKR |
|-------|--------------|---------------|
| [Theme] | [Why we think this matters] | [OKR] |
```

### Quarterly Planning Process

| Step | When | Who | Output |
|------|------|-----|--------|
| Review previous quarter | Last week of quarter | PO + team | Retrospective, OKR scores |
| Score OKRs (0.0-1.0) | Last week of quarter | PO | OKR scorecard |
| Update opportunity space | Week 1 of new quarter | Product Trio | Updated OST |
| Draft new OKRs | Week 1 | PO + leadership | Draft OKRs |
| Roadmap planning | Week 1-2 | PO + team + stakeholders | Updated roadmap |
| Sprint 1 planning | Week 2 | PO + team | First sprint committed |

### Communicating the Roadmap

| Audience | Format | Frequency | Focus |
|----------|--------|-----------|-------|
| Executive / Board | Outcome summary, 1 page | Monthly | Business impact, OKR progress |
| Stakeholders | Roadmap review | Bi-weekly | Initiative status, upcoming changes |
| Dev Team | Sprint planning + backlog | Weekly | Detailed stories, AC, priorities |
| Customers | Release notes, changelog | Per release | Value delivered, what's new |

**Rule: Executives see outcomes, teams see details, customers see value.**

### Saying "No" (Diplomatically)

| Situation | Response |
|-----------|----------|
| "Can we add feature X?" | "Let me evaluate it against our current OKRs. What problem does it solve?" |
| "Competitor has feature Y" | "Noted. Let me validate whether our users need it. Feature parity isn't a strategy." |
| "The CEO wants this" | "Understood. Let me show how it fits with our current priorities and what it would displace." |
| "Can we do it next sprint?" | "Let me check capacity and dependencies. If it displaces something, we need to agree what gives." |
| "This is urgent" | "Everything feels urgent. Help me understand: what happens if we don't do this in the next 2 weeks?" |

---

