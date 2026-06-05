# PO — Growth, Tech Debt, Scenarios & Investigation Quality

## Technical Debt & Maintenance Prioritization

### Tech Debt Quadrant (Martin Fowler)

```
                  Deliberate
                     │
    ┌────────────────┼────────────────┐
    │  Reckless      │  Prudent       │
    │  "We don't     │  "We must ship │
    │   have time    │   now and deal │
    │   for design"  │   with it"     │
    │                │                │
    │  DANGEROUS     │  MANAGEABLE    │
    ├────────────────┼────────────────┤
    │  Reckless      │  Prudent       │
    │  "What's       │  "Now we know  │
    │   layering?"   │   how we       │
    │                │   should have  │
    │  EDUCATION     │   done it"     │
    │  ISSUE         │  NATURAL       │
    └────────────────┼────────────────┘
                     │
                 Inadvertent
```

### The 20% Rule

Allocate **20% of sprint capacity** to technical debt and maintenance:
- 80% feature work (stories from backlog)
- 20% engineering health (tech debt, refactoring, upgrades, tooling)

This is not negotiable in a healthy product. Skipping maintenance creates compounding debt.

### Tech Debt Scoring

| Factor | Weight | 1 (Low) | 3 (Medium) | 5 (High) |
|--------|--------|---------|------------|----------|
| Frequency of impact | 30% | Rarely hits dev | Weekly friction | Daily blocker |
| Blast radius | 25% | 1 service | Multiple services | System-wide |
| Customer impact | 25% | None visible | Performance | Outages/bugs |
| Fix complexity | 20% | < 1 day | 1 sprint | > 1 sprint |

### How PO Works with Architecture on Tech Debt

| PO Responsibility | /arch Responsibility | Together |
|-------------------|-----------------------|----------|
| Prioritize based on customer impact | Assess technical risk | Agree on 20% allocation |
| Ensure debt doesn't grow unchecked | Propose refactoring scope | Score and rank debt items |
| Translate debt into business risk | Design target architecture | Present trade-offs to stakeholders |
| Include debt in sprint planning | Review technical approaches | Track debt metrics over time |

---

## Sprint Retrospective (PO Perspective)

### What the PO Brings to Retros

| Metric | Question | Ideal |
|--------|----------|-------|
| Value delivered | Did we ship what we planned? What value reached users? | >80% of committed stories shipped |
| AC quality | Were acceptance criteria clear enough? Any misunderstandings? | Zero "but I thought..." moments |
| Estimation accuracy | Were story point estimates accurate? | ±20% of planned velocity |
| Customer feedback | Did users validate what we shipped? | Feedback loop within 1 week |
| Backlog health | Is the backlog groomed 2 sprints ahead? | Top 2 sprints refined |
| Scope changes | How many stories changed mid-sprint? | <10% scope change |
| Tech debt ratio | Did we maintain the 20% allocation? | 15-25% maintenance work |

### PO Retro Questions

1. **What went well?** Which stories delivered the most value? What discovery insights were most useful?
2. **What could improve?** Were any stories unclear? Did priorities shift mid-sprint? Were stakeholders surprised?
3. **What should change?** Do we need better discovery? Different prioritization? More/less grooming?

---

## Product-Led Growth (PO Perspective)

### Self-Serve Onboarding Design Principles

| Principle | Implementation | Metric |
|-----------|---------------|--------|
| Zero-to-value in < 5 minutes | Remove signup friction, pre-fill data, show templates | Time-to-value |
| Progressive disclosure | Show only essential features first, reveal more as user grows | Feature adoption curve |
| In-product education | Tooltips, checklists, walkthroughs (not docs) | Completion rate |
| Quick win in first session | Guide user to complete one meaningful action | Activation rate |
| Social proof in-app | Show what other users do, community activity | Engagement |

### Activation Milestone Definition

| Step | Question | Example (B2B SaaS) |
|------|----------|---------------------|
| 1. Define core value | What's the "aha moment"? | "Creating their first automated workflow" |
| 2. Identify leading behavior | What actions predict retention? | Users who create 2+ workflows in first week retain 3x |
| 3. Set activation milestone | What's the measurable action? | "Created first workflow within 7 days" |
| 4. Measure baseline | What % currently activate? | 28% of signups |
| 5. Set target | What's achievable? | 40% within 1 quarter |
| 6. Optimize | Remove friction to reach milestone | Simplify workflow builder, add templates |

### Free vs Paid Feature Gating

| Strategy | What's Free | What's Paid | Best When |
|----------|-------------|-------------|-----------|
| Feature-gated | Core features | Advanced features | Clear value hierarchy |
| Usage-gated | Limited volume | Higher limits | Value scales with usage |
| Time-gated | Full access for trial period | Same features, paid | Product needs exploration |
| Team-gated | Individual use | Team/collaboration | Network effects |
| Support-gated | Self-serve only | Priority support, SLA | Enterprise buyer |

**PO's decision framework**: The free tier must be valuable enough to activate users, but limited enough to create upgrade motivation. Test the boundary — if conversion is <2%, free tier is too generous; if activation is <20%, free tier is too restrictive.

### In-Product Growth Loops

| Loop Type | Mechanism | Example |
|-----------|-----------|---------|
| Viral | User invites others to get value | "Share this project with your team" |
| Content | User creates content others discover | "Published templates appear in marketplace" |
| Data network | Product improves with more users | "Better recommendations with more activity" |
| Habit | Regular use creates dependency | "Daily digest with personalized insights" |

---

## Scenario-Based Examples

### Scenario 1: New Feature Request from Stakeholder

**Situation**: VP of Sales says "Customer X will churn unless we build Feature Y."

**Process**:
1. **Validate**: "How many other customers have asked for this?" (check support tickets, NPS comments)
2. **Contextualize**: Map to OST — does this connect to a current opportunity?
3. **Quantify**: RICE score — Reach (1 customer?), Impact (churn prevention), Confidence (how sure?), Effort
4. **Trade-off**: "If we do Y, we can't do Z this sprint. Z serves 50 customers. Y serves 1."
5. **Decision**: Use DACI — present data to Approver, recommend action
6. **Communicate**: Whatever the decision, explain the reasoning to all stakeholders

### Scenario 2: Bug vs Feature Debate

**Framework**:
| If... | Then... | Because... |
|-------|---------|------------|
| Users can't complete core workflow | Bug (P0) | Broken promise |
| Workaround exists but inconvenient | Bug (P1) | UX debt |
| Missing capability never promised | Feature request | New scope |
| Works differently than expected | Depends on AC | Check acceptance criteria |
| Performance degradation | Bug (P1-P2) | Non-functional regression |

### Scenario 3: Cutting Scope Mid-Sprint

**When it's acceptable**:
- New P0 bug discovered (production impact)
- External dependency failed (blocked)
- Team capacity changed (illness, emergency)

**Process**:
1. Identify the lowest-priority uncommitted story
2. Discuss with the team (never unilaterally cut)
3. Communicate to stakeholders: what, why, when it'll return
4. Move to top of next sprint's backlog
5. Record in retro for capacity planning improvement

### Scenario 4: MVP Definition for New Product

**Process**:
1. **Problem validation**: 20+ user interviews confirming the pain point
2. **Solution sketching**: 3+ solutions per opportunity (OST)
3. **Assumption testing**: Test riskiest assumptions (desirability first)
4. **MoSCoW the backlog**: Must-haves only = MVP
5. **Success criteria**: Define what "validated" looks like (activation rate, retention)
6. **Time-box**: MVP must ship within 6-8 weeks or scope is too big
7. **Measure**: 2-4 weeks of data before deciding next step

**MVP is not "version 1 with fewer features." MVP is the smallest thing that tests your riskiest assumption.**

### Scenario 5: Handling Competing Stakeholder Demands

**Situation**: Engineering wants to refactor, Sales wants a feature, Support wants bug fixes.

**Resolution**:
1. **Quantify each request**: Revenue at risk? Customer impact? Dev velocity impact?
2. **Map to OKRs**: Which current objective does each serve?
3. **Apply 80/20 rule**: 80% features, 20% maintenance (includes refactoring and bugs)
4. **Present trade-offs**: "We can do 2 of 3 this quarter. Here's the impact of each combination."
5. **DACI**: Driver (/po) recommends, Approver decides, Contributors are heard

---


## Investigation Quality Standards

### Feature Health Check (MANDATORY)

Before prioritizing ANY optimization or enhancement, verify:

1. **Does the feature work as designed?** — Check if the existing implementation actually delivers its core value. A broken RAG pipeline, a disconnected API, or a misconfigured integration makes all optimization work worthless.
2. **Is the investment being utilized?** — If the team spent N story points building a capability, verify it is actually functioning. Wasted investment in broken features is a higher priority than new optimizations.
3. **What is the user actually experiencing?** — Test the feature yourself (or assign /rob to test on staging). Don't rely on architectural diagrams; verify runtime behavior.

### Reframe Before Prioritize

When stakeholders request optimization:

| Stakeholder Says | PO Should Ask |
|-----------------|---------------|
| "Make it faster" | "Is the output correct and valuable first?" |
| "Add caching" | "What is the actual bottleneck? Would the user notice?" |
| "Improve performance" | "What metric actually drives user retention?" |
| "Users say it's slow" | "Is the complaint about speed, or about the experience of waiting?" |
| "We need a new feature" | "Are existing features working and delivering value?" |

### Engagement-First Metrics

When prioritizing product improvements, prefer engagement depth metrics over surface speed metrics:

- **Conversation continuation rate**: Does the user engage beyond the first interaction?
- **Return rate**: Do users come back to the feature?
- **Task completion**: Did the user accomplish what they came for?
- **Quality rating**: Does the user rate the output as helpful?
- **Conversion from feature**: Does feature usage lead to business outcomes?

These often matter more than response time, load time, or other performance metrics.

### Content and Knowledge as Product Investment

For AI-powered features, the knowledge base IS the product:

- Prioritize content quality, domain expertise curation, and knowledge base improvements alongside technical features
- Treat knowledge corpus improvements as product backlog items (not just DevOps tasks)
- Domain expertise creates defensible competitive advantages; infrastructure speed does not
- Include "knowledge quality sprint" items in every quarter's planning

### Investigation Checklist

Add to every optimization investigation:

- [ ] Feature health verified (it actually works as designed)
- [ ] Prior investment audited (is the built capability being utilized?)
- [ ] User experience tested on staging (not just theorized from code)
- [ ] Stakeholder question reframed if evidence points elsewhere
- [ ] Engagement depth metrics prioritized over surface speed metrics
- [ ] Content/knowledge quality evaluated as alternative investment
