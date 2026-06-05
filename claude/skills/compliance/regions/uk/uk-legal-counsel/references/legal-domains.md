# UK Legal — Domains (GDPR · AI reg · software IP · employment/IR35 · company formation · consumer · disputes)

## GDPR & Data Protection (Deep Dive)

### Lawful Bases for Processing (Article 6, UK GDPR)

| Basis | When to Use | Notes |
|-------|-------------|-------|
| Consent | User freely gives specific, informed, unambiguous agreement | Must be withdrawable; not for imbalanced relationships |
| Contract | Processing necessary to perform a contract | Common for SaaS — processing user data to deliver service |
| Legal Obligation | Required by law | Tax records, employment records |
| Vital Interests | Protecting someone's life | Rarely applicable in tech |
| Public Task | Public authority functions | Government services |
| Legitimate Interests | Business need, balanced against individual rights | Requires LIA (Legitimate Interests Assessment); not available to public authorities |

### Data Subject Rights (Response Timeframes)

| Right | Article | Deadline | Notes |
|-------|---------|----------|-------|
| Access (SAR) | Art 15 | 1 month (extendable to 3) | Free; can charge for manifestly unfounded/excessive |
| Rectification | Art 16 | 1 month | Correct inaccurate data |
| Erasure ("Right to be Forgotten") | Art 17 | 1 month | Can refuse if legal obligation to retain |
| Restrict Processing | Art 18 | 1 month | Data kept but not used |
| Data Portability | Art 20 | 1 month | Machine-readable format; only for consent/contract bases |
| Object | Art 21 | Without undue delay | Must stop unless compelling legitimate grounds |
| Automated Decision-Making | Art 22 | No set deadline | Right not to be subject to solely automated decisions with legal/significant effects |

### Data Protection Impact Assessment (DPIA)

**Mandatory** when processing is likely to result in a high risk to individuals, including:
- Systematic profiling with significant effects
- Large-scale processing of special category data
- Systematic monitoring of publicly accessible areas
- Use of new technologies (including AI/ML)
- Large-scale automated decision-making

### International Data Transfers

| Mechanism | Status | Notes |
|-----------|--------|-------|
| UK Adequacy Decisions | Active | EU, EEA, and 14 other countries deemed adequate |
| UK International Data Transfer Agreement (IDTA) | In force | Replaces SCCs for UK transfers |
| UK Addendum to EU SCCs | In force | For organisations already using EU SCCs |
| Binding Corporate Rules | Available | For intra-group transfers |
| Transfer Risk Assessment (TRA) | Required | For non-adequate countries |

### Data Breach Notification

| Action | Deadline | To Whom | When |
|--------|----------|---------|------|
| Internal assessment | Immediately | DPO / IT Security | Every suspected breach |
| ICO notification | **72 hours** from awareness | ICO | If risk to individuals' rights/freedoms |
| Individual notification | **Without undue delay** | Affected individuals | If HIGH risk to rights/freedoms |
| Record the breach | Immediately | Internal breach log | **Every** breach (even non-notifiable) |

**72-hour rule**: The clock starts when you become "aware" — meaning when the controller has a reasonable degree of certainty that a breach has occurred. Not when the processor tells you (though processors must notify controllers "without undue delay").

### Data (Use and Access) Act 2025

Key changes coming into force:
- **January 2026**: Relaxed rules on automated decision-making and cookies; ICO gains power to issue GDPR-level fines (£17.5m) for cookie/PECR violations
- **June 2026**: New complaints procedure requirements
- PECR penalty cap raised to £17.5m (from £500,000)
- Smart data schemes enabled for Open Banking-style data sharing

### Privacy by Design Checklist (for Software Products)

- [ ] Privacy policy covering all data processing activities
- [ ] Cookie consent mechanism (PECR-compliant)
- [ ] Data processing records (Article 30)
- [ ] DPIA completed for high-risk processing
- [ ] Data Processing Agreements with all processors
- [ ] Lawful basis identified for each processing activity
- [ ] Data subject rights request process in place
- [ ] Data breach response plan documented
- [ ] Data retention schedule defined
- [ ] International transfer safeguards in place

---

## AI Regulation

### UK Approach (Current: Principles-Based, Sector-Led)

The UK currently relies on existing regulators rather than a single AI law. Five cross-sector principles from the 2023 White Paper:

| Principle | Meaning |
|-----------|---------|
| Safety, Security & Robustness | AI should function securely and as intended |
| Transparency & Explainability | People should understand AI decisions affecting them |
| Fairness | AI should not discriminate or create unfair outcomes |
| Accountability & Governance | Clear responsibility for AI outcomes |
| Contestability & Redress | People should be able to challenge AI decisions |

**These principles are non-statutory** — no standalone AI law exists yet. A UK AI Bill is anticipated in **summer 2026**.

### UK AI Security Institute (formerly AI Safety Institute)

Renamed October 2025. Focus shifted from bias/safety to economic growth and security. Tests frontier AI models for security risks.

### EU AI Act (Cross-Border Relevance)

If your software serves EU customers, you must comply with the EU AI Act:

| Category | Risk Level | Requirements | Effective |
|----------|-----------|--------------|-----------|
| Prohibited | Unacceptable | Banned (social scoring, real-time biometric in public) | February 2025 |
| High-Risk | High | Conformity assessment, documentation, human oversight | August 2027 |
| Limited Risk | Limited | Transparency obligations (chatbots must disclose AI) | August 2025 |
| Minimal Risk | Minimal | No requirements (most software) | N/A |
| GPAI Models | Varies | Documentation, copyright compliance, systemic risk assessment | August 2025 |

### Practical Guidance for AI-Powered Software

1. **Transparency**: Disclose when users interact with AI (chatbots, recommendations)
2. **Fairness**: Test for bias in training data and outputs
3. **Data Protection**: AI training on personal data requires lawful basis + DPIA
4. **Accountability**: Document AI decision-making processes
5. **Copyright**: AI training on copyrighted material — UK position unclear; EU requires opt-out compliance
6. **AI-generated content**: No specific UK disclosure law yet, but advertising standards (ASA) require transparency

---

## Software-Specific Intellectual Property

### Open Source License Compliance

| License Type | Category | Key Obligation | Risk Level |
|-------------|----------|----------------|------------|
| MIT | Permissive | Attribution only | Low |
| Apache 2.0 | Permissive | Attribution + patent grant | Low |
| BSD (2/3-clause) | Permissive | Attribution only | Low |
| LGPL 2.1/3.0 | Weak copyleft | Dynamic linking OK; modifications must be shared | Medium |
| MPL 2.0 | Weak copyleft | File-level copyleft only | Medium |
| GPL 2.0/3.0 | Strong copyleft | **Derivative works must be GPL** | **High** |
| AGPL 3.0 | Strong copyleft | **Network use triggers disclosure** (SaaS risk) | **Very High** |
| SSPL | Source-available | Service providers must release entire stack | **Very High** |
| No license | All rights reserved | Cannot legally use | **Critical** |

**GPL "viral" effect**: If GPL code is statically linked or compiled into your proprietary software, the entire combined work may need to be released under GPL. Dynamic linking with LGPL is generally safer but still requires offering the LGPL library source.

**AGPL SaaS risk**: Unlike GPL, AGPL triggers even when software is only accessed over a network (not distributed). If you use AGPL code in a SaaS product, you may need to release your entire application source code.

### Software Copyright Ownership

| Creator | Default Owner | Key Statute |
|---------|---------------|-------------|
| Employee (during employment) | Employer | CDPA 1988, s.11(2) |
| Contractor / Freelancer | **Contractor** (not the client) | CDPA 1988, s.11(1) |
| Joint authorship | Joint owners | CDPA 1988, s.10 |
| AI-generated (no human author) | Person who made arrangements for creation | CDPA 1988, s.9(3) |
| Commissioned work | **Commissioner does NOT own** without assignment | Common law |

**Critical for tech companies**: Always include IP assignment clauses in contractor agreements. Without explicit assignment, the contractor owns the copyright even if you paid for the work.

### SaaS / Digital Product IP Essentials

| Document | Purpose | Must Include |
|----------|---------|-------------|
| Terms of Service | Govern user access | License grant, acceptable use, liability caps, termination |
| Privacy Policy | GDPR compliance | Lawful basis, data subject rights, retention, transfers |
| Acceptable Use Policy | Protect against misuse | Prohibited activities, enforcement, suspension rights |
| API Terms | Govern API access | Rate limits, commercial use, data handling, uptime SLA |
| Data Processing Agreement | B2B processor obligations | Article 28 requirements, sub-processors, breach notification |
| Source Code Escrow | Protect enterprise clients | Trigger events, verification, release conditions |

---

## Employment Law & IR35

### Employment Rights Act 2025 (Key Changes)

| Change | Current (2025) | Coming (Expected Jan 2027) |
|--------|---------------|----------------------------|
| Qualifying period (unfair dismissal) | 2 years | **6 months** |
| Compensatory award cap | £118,223 | **Removed (unlimited)** |
| Basic award cap | £21,570 (£719/week × 30) | Unchanged |
| Day-one rights | Limited (discrimination, whistleblowing) | Expanded unfair dismissal protection |

### Current Compensation Limits (from 6 April 2025)

| Award Type | Maximum | Notes |
|------------|---------|-------|
| Week's pay (statutory cap) | £719 | Used for basic award, redundancy |
| Basic award (unfair dismissal) | £21,570 | Age-weighted formula × £719 |
| Compensatory award (unfair dismissal) | £118,223 | Or 52 weeks' pay, whichever lower |
| Discrimination | **Unlimited** | Plus injury to feelings |
| Whistleblowing | **Unlimited** | ERA 1996, Part IVA |
| Automatic unfair dismissal | **Unlimited** | Pregnancy, whistleblowing, union, etc. |

### IR35 Legal Perspective (Complements /inga's Financial View)

IR35 determines whether a contractor is a "disguised employee" for tax purposes. Legal factors considered:

| Factor | Inside IR35 | Outside IR35 |
|--------|-------------|--------------|
| Control | Client controls how, when, where | Contractor controls own methods |
| Substitution | Personal service required | Genuine right to substitute |
| Mutuality of Obligation | Work must be offered and accepted | No ongoing obligation |
| Financial Risk | No financial risk | Bears cost of rework, equipment |
| Part & Parcel | Integrated into client's team | Independent business |
| Business on Own Account | No evidence of own business | Markets services, multiple clients |

### Contractor Agreement Essential Clauses

1. **Substitution clause**: Right to send a qualified substitute (must be genuine, not theoretical)
2. **Control clause**: Contractor determines method of delivery
3. **No mutuality**: No obligation to offer or accept future work
4. **Equipment**: Contractor provides own tools/equipment
5. **Insurance**: Professional indemnity and public liability
6. **IP assignment**: All work product assigned to client
7. **Confidentiality**: Protect client's proprietary information
8. **Data processing**: If contractor handles personal data
9. **Termination**: Notice period and circumstances
10. **Tax indemnity**: Contractor responsible for own tax

### Restrictive Covenants

| Type | Purpose | Enforceable If... |
|------|---------|-------------------|
| Non-compete | Prevent working for competitors | Reasonable scope, geography, duration (typically 6-12 months) |
| Non-solicitation | Prevent poaching clients | Limited to clients actually dealt with |
| Non-dealing | Prevent dealing with clients at all | More restrictive than non-solicitation |
| Non-poaching | Prevent recruiting staff | Limited to staff worked with |
| Garden leave | Paid leave during notice | Must be in contract; typically 3-6 months |
| Confidentiality | Protect trade secrets | No time limit if genuine trade secrets |

**Enforceability test**: Covenants must protect a **legitimate business interest** and go no further than **reasonably necessary**. Overly broad covenants are void. Courts interpret restrictively.

### Settlement Agreements

| Element | Requirement |
|---------|------------|
| Written document | Must be in writing |
| Specific claims | Must identify the particular claims being waived |
| Independent legal advice | Employee must receive advice from a qualified independent adviser |
| Adviser insurance | The adviser must have professional indemnity insurance |
| Adviser identified | Agreement must identify the adviser |
| Agreement states conditions met | Must state that the statutory conditions are satisfied |
| Tax treatment | First £30,000 ex-gratia typically tax-free; contractual payments (PILON, holiday) are taxable |

---

## Company Formation & Corporate Governance

### Entity Comparison

| Feature | Sole Trader | Ltd Company | LLP |
|---------|-------------|-------------|-----|
| Legal personality | None (you ARE the business) | Separate legal entity | Separate legal entity |
| Liability | **Unlimited** personal liability | Limited to share capital | Limited to capital contribution |
| Formation | Start trading | Register at Companies House | Register at Companies House |
| Tax | Income Tax + NI (self-employed) | Corporation Tax + dividends | Income Tax (profit share) |
| Public records | None | Accounts, directors, PSC public | Accounts, members public |
| Annual filing | Self Assessment only | Accounts + Confirmation Statement | Accounts + Confirmation Statement |
| Ownership transfer | N/A (sell assets) | Transfer shares | Transfer membership |
| Min. members | 1 | 1 director + 1 shareholder | 2 designated members |

### Directors' Duties (Companies Act 2006, ss.170-177)

| Section | Duty | Summary |
|---------|------|---------|
| s.171 | Act within powers | Exercise powers for proper purposes per the constitution |
| s.172 | Promote success of the company | Consider long-term consequences, employees, relationships, community, reputation |
| s.173 | Exercise independent judgment | Cannot blindly delegate; can consider professional advice |
| s.174 | Exercise reasonable care, skill, diligence | Objective + subjective test (higher of general standard or director's actual skill) |
| s.175 | Avoid conflicts of interest | Cannot exploit company property, information, or opportunities |
| s.176 | Not accept benefits from third parties | Cannot accept bribes or benefits that create conflict |
| s.177 | Declare interest in proposed transactions | Must disclose to other directors before transaction |

**Breach consequences**: Personal liability to the company, account of profits, injunction, damages, and potential disqualification under Company Directors Disqualification Act 1986 (up to 15 years).

### PSC Register (People with Significant Control)

Must register any individual who:
- Holds >25% of shares or voting rights
- Has the right to appoint/remove majority of directors
- Has the right to exercise significant influence or control
- Has the right to exercise significant influence over a trust or firm that meets the above

**Penalty for non-compliance**: Criminal offence — up to 2 years imprisonment and/or unlimited fine.

### Shareholder Agreement Key Clauses

1. **Pre-emption rights**: Existing shareholders get first refusal on new shares
2. **Drag-along / Tag-along**: Majority can force sale / minority can join sale
3. **Good leaver / Bad leaver**: Shares buyback mechanism on departure
4. **Reserved matters**: Decisions requiring unanimous or super-majority consent
5. **Deadlock resolution**: Mechanism for resolving 50/50 disputes
6. **Non-compete**: Restrictions on competing businesses
7. **Dividend policy**: When and how profits are distributed
8. **Board composition**: Who appoints directors

---

## Consumer Protection for SaaS / Digital Products

### Consumer Rights Act 2015 (Digital Content)

| Right | Description | Remedy |
|-------|-------------|--------|
| Satisfactory quality | Digital content must be of reasonable quality | Repair, replacement, or price reduction |
| Fit for purpose | Must be suitable for specified or common purpose | Repair, replacement, or price reduction |
| As described | Must match the description provided | Repair, replacement, or price reduction |
| Right to repair/replacement | Trader must attempt repair/replacement first | Free of charge, within reasonable time |
| Right to price reduction | If repair/replacement fails or impossible | Appropriate reduction (partial or full refund) |

### Subscription Auto-Renewal (DMCCA 2024 — Expected Spring 2026)

| Requirement | Detail |
|-------------|--------|
| Pre-contract information | Clear renewal schedule, payment terms, cancellation method |
| Cooling-off at renewal | **14-day cooling-off period at each auto-renewal** |
| Reminder notices | Before each renewal: date, amount, next renewal, how to cancel |
| Easy exit | Must be possible to cancel in a **single communication** |
| Cancellation parity | Cancelling must be as easy as signing up |
| Penalty for breach | CMA can fine up to **10% of global turnover** |

**Action for SaaS businesses**: Audit subscription flows now. Ensure cancellation is as easy as sign-up, implement pre-renewal reminder emails, and prepare for the 14-day cooling-off at each renewal.

### Online Safety Act 2023

Applies to services that host user-generated content or enable user interaction (forums, social features, messaging).

| Obligation | Detail | Penalty |
|-----------|--------|---------|
| Illegal content duty | Prevent, detect, and remove illegal content | Up to £18m or **10% global revenue** |
| Children's safety duty | Age verification, risk assessments | Up to £18m or 10% global revenue |
| Transparency reporting | Regular transparency reports | Enforcement notice |
| Complaints process | User-facing complaints mechanism | Enforcement notice |

**Phase 3 (2026)**: User empowerment tools, transparency reporting for smaller services.

---

## Dispute Resolution

### Pre-Action Protocol Steps

Before issuing court proceedings, you should:
1. Send a **Letter Before Action** (LBA) setting out the claim, the basis, and the amount
2. Allow **14-28 days** for response (depends on protocol)
3. Consider **Alternative Dispute Resolution** (ADR)
4. Exchange relevant documents
5. Attempt settlement

Failure to follow pre-action protocols can result in **adverse costs orders**.

### Resolution Methods

| Method | Cost | Time | Binding | Best For |
|--------|------|------|---------|----------|
| Negotiation | Lowest | Days-weeks | Only if agreed | Any dispute |
| Mediation | Low-medium | 1-2 days | Only if agreed | Commercial disputes, employment |
| Arbitration | Medium-high | Months | **Yes** (limited appeal) | International, technical disputes |
| Small Claims Court | Low (no costs recovery) | 2-6 months | Yes | Claims up to **£10,000** |
| County Court (Fast Track) | Medium | 6-12 months | Yes | Claims £10,001-£25,000 |
| County Court (Multi-Track) | High | 12-24 months | Yes | Claims over £25,000 |
| High Court | Very high | 12-36 months | Yes | Complex, high-value claims |
| Employment Tribunal | Free to issue | 6-18 months | Yes | Employment disputes |

### Key Litigation Concepts

| Concept | Meaning |
|---------|---------|
| **Without Prejudice** | Communications made in genuine attempt to settle cannot be used in court |
| **Part 36 Offer** | Formal settlement offer; costs consequences if rejected and outcome is not more favourable |
| **Limitation periods** | Contract: 6 years; Tort: 6 years; Personal injury: 3 years; Employment tribunal: 3 months less 1 day |
| **ACAS Early Conciliation** | **Mandatory** before employment tribunal claim; extends limitation by up to 6 weeks |
| **Costs** | Losing party generally pays winner's costs (not in employment tribunal or small claims) |

---

