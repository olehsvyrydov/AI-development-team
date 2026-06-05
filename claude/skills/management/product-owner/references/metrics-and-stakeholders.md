# PO — Metrics, Analytics & Stakeholders

## Product Metrics & Analytics

### North Star Metric Framework

The North Star Metric (NSM) captures the core value customers get from your product. It must:
- **Lead** revenue (not lag behind it)
- **Reflect** customer value (not just company value)
- **Be actionable** (teams can influence it)

| Product Type | North Star Metric | Input Metrics |
|-------------|-------------------|---------------|
| B2B SaaS | Weekly Active Teams | Activation rate, feature adoption, team invites |
| Marketplace | Transactions completed | Seller listings, buyer search, match rate |
| Consumer App | Daily Active Learners | Session frequency, completion rate, streak length |
| Dev Tool | Weekly Active Users running [core action] | Signups, activation, API calls, integrations |
| Content Platform | Time spent engaging | Content published, recommendations clicked, shares |
| E-commerce | Repeat purchase rate | Browse-to-cart, cart-to-purchase, return visits |

**Anti-pattern**: DAU/MAU, registered users, and revenue are NOT good North Stars. They don't tell you what customers value.

### AARRR (Pirate Metrics) Funnel

| Stage | Metric | Owner | Example |
|-------|--------|-------|---------|
| **Acquisition** | New signups / visitors | Marketing (/mkt) | 10,000 visitors/month |
| **Activation** | Users reaching "aha moment" | Product (/po) | 40% complete onboarding |
| **Retention** | Users returning after Day 7/30 | Product (/po) | 60% Day-7 retention |
| **Revenue** | Conversion to paid / ARPU | Product + Finance | 5% free-to-paid |
| **Referral** | Users inviting others | Product + Marketing | 15% invite at least 1 person |

### Leading vs Lagging Indicators

| Lagging (What happened) | Leading (What will happen) |
|------------------------|---------------------------|
| Revenue | Pipeline generated |
| Churn rate | Usage decline over 14 days |
| NPS score | Support ticket volume |
| Conversion rate | Activation rate |
| Annual renewals | Feature adoption in first 30 days |

**Product Owners focus on leading indicators.** By the time lagging indicators move, it's too late to course-correct.

### Feature Adoption Measurement

| Metric | Formula | Target |
|--------|---------|--------|
| Adoption rate | Users who tried feature / Total active users | >30% within 30 days |
| Engagement depth | Actions per user per session | Increasing trend |
| Stickiness | DAU / MAU | >20% for B2B, >50% for consumer |
| Time to adopt | Days from feature release to first use | <7 days |
| Retention lift | Retention of adopters vs non-adopters | Statistically significant |

### A/B Testing Decision Framework

| Question | Answer |
|----------|--------|
| When to A/B test | When you have a hypothesis, sufficient traffic, and the change is reversible |
| When NOT to test | Obvious bugs, compliance changes, < 1,000 users/week through the flow |
| Sample size | Use a calculator; generally need 1,000+ events per variant |
| Duration | Minimum 1 full business cycle (typically 2 weeks) |
| Statistical significance | 95% confidence minimum |
| What to measure | Primary metric (conversion) + guardrail metrics (retention, revenue) |

### Product Health Dashboard Template

```markdown
## Product Health Dashboard — [Date]

### North Star
| Metric | Current | Target | Trend |
|--------|---------|--------|-------|
| [NSM] | X | Y | 📈/📉/➡️ |

### AARRR Funnel
| Stage | This Week | Last Week | Delta | Target |
|-------|-----------|-----------|-------|--------|
| Acquisition | | | | |
| Activation | | | | |
| Retention (D7) | | | | |
| Revenue | | | | |
| Referral | | | | |

### Feature Adoption (Last 30 Days)
| Feature | Adoption | Engagement | Retention Impact |
|---------|----------|------------|-----------------|
| [Feature] | X% | Y actions/user | +Z% retention |

### Alerts
- 🔴 [Metric below threshold]
- 🟡 [Metric trending down]
```

---

## Stakeholder Management

### Power-Interest Grid

```
              High Power
                  │
     ┌────────────┼────────────┐
     │  Keep       │  Manage    │
     │  Satisfied  │  Closely   │
     │  (CEO, CTO) │ (Sponsors) │
     │             │            │
Low ─┼─────────────┼────────────┼─ High
Int. │  Monitor    │  Keep      │  Interest
     │  (Legal,    │  Informed  │
     │   Finance)  │ (Users,    │
     │             │  Dev team) │
     └────────────┼────────────┘
              Low Power
```

### Communication Plan by Stakeholder Type

| Stakeholder | Power | Interest | Strategy | Cadence |
|-------------|-------|----------|----------|---------|
| CEO / Founder | High | High | Manage closely: outcomes, OKR progress, blockers | Weekly 1:1 or bi-weekly |
| CTO / Engineering Lead | High | High | Manage closely: technical roadmap, capacity | Weekly sync |
| Investors / Board | High | Low | Keep satisfied: quarterly results, strategy | Quarterly |
| Sales Team | Medium | High | Keep informed: feature releases, competitive | Bi-weekly |
| Customer Success | Medium | High | Keep informed: roadmap, known issues, workarounds | Bi-weekly |
| Marketing (/mkt) | Medium | High | Keep informed: launch timelines, positioning | Per release |
| End Users | Low | High | Keep informed: release notes, feedback loops | Per release |
| Legal (/legal) | High | Low | Keep satisfied: compliance reviews, privacy | Per feature (if applicable) |
| Finance (/fin) | Medium | Low | Monitor: budget, ROI | Monthly |

### DACI Decision Framework

| Role | Who | Responsibility |
|------|-----|---------------|
| **D**river | /po (Max) | Drives the decision process, gathers input, proposes recommendation |
| **A**pprover | Sponsor / CEO | Makes the final call; only 1 person |
| **C**ontributor | Team, architects, designers | Provides input, expertise, options |
| **I**nformed | Stakeholders, other teams | Notified of the decision |

**Use DACI for**: Feature prioritization disputes, scope changes, architecture trade-offs, pricing changes, go/no-go decisions.

### Managing Conflicting Priorities

| Tactic | When |
|--------|------|
| Data over opinions | "Let me pull the usage data and customer feedback before we decide" |
| OKR alignment | "Which of our current OKRs does this serve?" |
| Opportunity cost | "If we do X, we can't do Y this quarter. Which has more impact?" |
| Customer evidence | "Have we validated this need with customers?" |
| Time-boxing | "Let's try a 2-week experiment before committing a full quarter" |
| Escalation path | "If we disagree, let's take it to [Approver] with both positions" |

---

