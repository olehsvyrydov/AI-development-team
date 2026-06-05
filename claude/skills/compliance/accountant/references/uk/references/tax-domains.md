# UK Accounting — Tax Domains (key reference · MTD · pensions · R&D · CGT · crypto · BIK)

## Key Tax Reference

> **Rate Versioning**: All tables below show rates by tax year. The **current year** is marked. When rates for future years are not yet confirmed, the most recent confirmed rates are shown with a note.

### Corporation Tax

| Profit Band | 2024/25 | 2025/26 *(current)* | 2026/27 |
|-------------|---------|----------------------|---------|
| £0 - £50,000 | 19% | 19% | 19% |
| £50,001 - £250,000 | Marginal relief | Marginal relief | Marginal relief |
| Over £250,000 | 25% | 25% | 25% |

Marginal relief fraction: 3/200. Effective marginal rate ~26.5% in the taper band.

### Income Tax (England, Wales & NI)

| Band | 2024/25 | 2025/26 *(current)* | 2026/27 |
|------|---------|----------------------|---------|
| Personal Allowance | £12,570 | £12,570 | £12,570 |
| Basic Rate (20%) | £12,571 - £50,270 | £12,571 - £50,270 | £12,571 - £50,270 |
| Higher Rate (40%) | £50,271 - £125,140 | £50,271 - £125,140 | £50,271 - £125,140 |
| Additional Rate (45%) | Over £125,140 | Over £125,140 | Over £125,140 |

Personal Allowance tapers by £1 for every £2 over £100,000 (fully lost at £125,140). Thresholds frozen until at least 2028.

### Dividend Tax

| Band | 2024/25 | 2025/26 *(current)* | 2026/27 |
|------|---------|----------------------|---------|
| Dividend Allowance | £500 | £500 | £500 |
| Basic Rate | 8.75% | 8.75% | 8.75% |
| Higher Rate | 33.75% | 33.75% | 33.75% |
| Additional Rate | 39.35% | 39.35% | 39.35% |

Dividends use up the basic/higher rate bands but are taxed at the lower dividend rates. The £500 allowance applies before any dividend tax is due.

#### Optimal Salary + Dividend Extraction (Ltd Company Director)

For a single director/shareholder with no other income (2025/26):

1. **Salary**: Set at the NI Secondary Threshold (£5,000) or Personal Allowance (£12,570)
   - At £5,000: No employer NI, no employee NI, tax-free (under PA)
   - At £12,570: No income tax (equals PA), but employer NI on £7,570 at 15% = £1,135.50 cost to company
2. **Dividends**: Take remaining profits as dividends
   - First £500: tax-free (dividend allowance)
   - Next £37,700 (approx): 8.75% basic rate
   - Above that: 33.75% higher rate

**Decision**: If employer NI cost (£1,135.50) exceeds the corporation tax saving from the higher salary deduction, use the lower salary. Model both scenarios.

### Capital Gains Tax

| Category | 2024/25 | 2025/26 *(current)* | 2026/27 |
|----------|---------|----------------------|---------|
| Annual Exempt Amount | £3,000 | £3,000 | £3,000 |
| Basic Rate | 10% (assets) / 18% (property) | 18% | 18% |
| Higher Rate | 20% (assets) / 24% (property) | 24% | 24% |
| BADR Rate | 10% | 14% | 18% |
| BADR Lifetime Limit | £1m | £1m | £1m |
| Investors' Relief Rate | 10% | 14% | 18% |

**Business Asset Disposal Relief (BADR)** conditions:
- Must hold at least 5% of shares and voting rights
- Must be an officer or employee of the company
- Must hold shares for at least 2 years before disposal
- Company must be a trading company

**Rollover Relief**: Defer CGT when disposing of a business asset and reinvesting proceeds into a new qualifying asset within 3 years (1 year before to 3 years after disposal).

### VAT Thresholds

| Threshold | 2024/25 | 2025/26 *(current)* | 2026/27 |
|-----------|---------|----------------------|---------|
| Registration | £90,000 | £90,000 | £90,000 |
| Deregistration | £88,000 | £88,000 | £88,000 |

VAT rates: Standard 20%, Reduced 5%, Zero-rated 0%.

### National Insurance

#### Employee (Primary) Class 1

| Threshold/Rate | 2024/25 | 2025/26 *(current)* | 2026/27 |
|----------------|---------|----------------------|---------|
| Primary Threshold | £12,570/yr | £12,570/yr | £12,570/yr |
| Upper Earnings Limit | £50,270/yr | £50,270/yr | £50,270/yr |
| Main Rate | 8% | 8% | 8% |
| Additional Rate | 2% | 2% | 2% |

#### Employer (Secondary) Class 1

| Threshold/Rate | 2024/25 | 2025/26 *(current)* | 2026/27 |
|----------------|---------|----------------------|---------|
| Secondary Threshold | £9,100/yr (£175/wk) | **£5,000/yr (£96/wk)** | £5,000/yr |
| Rate | 13.8% | **15%** | 15% |
| Class 1A/1B (BIK) | 13.8% | **15%** | 15% |

**Key change (April 2025)**: Employer NI rate increased from 13.8% to 15%, and the secondary threshold dropped from £9,100 to £5,000. This is the largest NI change in decades. Secondary threshold frozen at £5,000 until April 2028, then rises with CPI.

#### Self-Employed

| Threshold/Rate | 2024/25 | 2025/26 *(current)* | 2026/27 |
|----------------|---------|----------------------|---------|
| Class 4 Main Rate | 6% | 6% | 6% |
| Class 4 Additional Rate | 2% | 2% | 2% |
| Lower Profits Limit | £12,570 | £12,570 | £12,570 |
| Upper Profits Limit | £50,270 | £50,270 | £50,270 |
| Class 2 (voluntary) | £3.45/wk | £3.50/wk | TBC |

**Note**: Compulsory Class 2 NI was abolished from April 2024. Voluntary contributions are available for those wanting to protect State Pension entitlement.

#### Employment Allowance

| Detail | 2024/25 | 2025/26 *(current)* |
|--------|---------|----------------------|
| Amount | £5,000 | **£10,500** |
| Eligibility Cap | NI bill < £100,000 | **No cap (removed)** |

The Employment Allowance offsets employer NI liability. From 2025/26, the allowance doubled and the £100,000 eligibility threshold was removed, making all employers eligible. Single-director companies with no other employees remain ineligible.

### Payments on Account

Payments on Account (POA) apply to Self Assessment taxpayers whose last tax bill was £1,000 or more (after deducting tax at source).

| Detail | Rule |
|--------|------|
| When required | Tax bill > £1,000 AND < 80% was deducted at source |
| First payment | 50% of previous year's bill by **31 January** (in the tax year) |
| Second payment | 50% of previous year's bill by **31 July** (after the tax year) |
| Balancing payment | Any remaining tax by **31 January** (after the tax year) |
| Reducing POA | Apply to HMRC via SA303 if you expect a lower bill |

**Cash flow warning**: New self-employed individuals face a large first-year bill (full year's tax + first POA for next year). Always plan for this.

#### POA Calculation Example

If 2024/25 tax bill is £10,000:
- 31 Jan 2026: £5,000 (1st POA for 2025/26) + £10,000 balancing payment = £15,000
- 31 Jul 2026: £5,000 (2nd POA for 2025/26)
- 31 Jan 2027: Balancing payment for 2025/26 (difference between actual bill and POAs paid)

### Key Filing Deadlines

| Filing | Deadline | Penalty |
|--------|----------|---------|
| Corporation Tax Return (CT600) | 12 months after year-end | £100 (escalating) |
| Corporation Tax Payment | 9 months + 1 day after year-end | Interest + penalties |
| VAT Return (quarterly) | 1 month + 7 days after quarter end | Points-based system |
| Annual Accounts (Companies House) | 9 months after year-end | £150 - £1,500 |
| Self Assessment (online) | 31 January | £100 + daily penalties |
| Self Assessment (paper) | 31 October | £100 + daily penalties |
| P11D (Benefits) | 6 July | £300 per form |
| P60 | 31 May | £300 per form |
| Confirmation Statement | Every 12 months | £5,000 (strike off risk) |

---

## Making Tax Digital (MTD)

### MTD for VAT
Already mandatory for all VAT-registered businesses. Requires:
- Digital record-keeping
- Quarterly VAT returns via compatible software
- Digital links between records (no manual re-keying)

### MTD for Income Tax Self Assessment (ITSA)

Phased rollout for sole traders and landlords:

| Phase | Start Date | Income Threshold | Notes |
|-------|------------|------------------|-------|
| Phase 1 | **6 April 2026** | Gross income > £50,000 | Combined self-employment + property income |
| Phase 2 | 6 April 2027 | Gross income > £30,000 | |
| Phase 3 | 6 April 2028 | Gross income > £20,000 | |
| Partnerships | TBC | TBC | Not yet scheduled |

**Key rules**:
- Income threshold = combined gross income from all self-employment + property sources
- PAYE employment income, dividends, and investment income do NOT count
- Quarterly updates due within 1 month of quarter end
- End of Period Statement (EOPS) replaces the SA return
- Final Declaration due by 31 January after the tax year
- Late submission uses a **points-based penalty system** (point per missed deadline, £200 penalty at threshold)
- Late payment penalties: percentage of outstanding tax from 15 days overdue
- No late submission penalties in year 1 (2026/27) — soft landing period

**Software requirements**: Must use HMRC-compatible software. Options range from full accounting packages (Xero, QuickBooks, FreeAgent) to bridging software for spreadsheet users.

---

## Pension Contributions

### Annual Allowance

| Detail | 2025/26 *(current)* |
|--------|----------------------|
| Standard Annual Allowance | £60,000 |
| Money Purchase Annual Allowance (MPAA) | £10,000 |
| Tapered AA threshold (adjusted income) | £260,000 |
| Minimum tapered AA | £10,000 (at £360,000+ adjusted income) |
| Lifetime Allowance | Abolished (from April 2024) |

### Tax Relief Methods

| Method | How it works | Who uses it |
|--------|-------------|-------------|
| Relief at Source | Contribute net, provider claims 20% from HMRC | Most personal pensions |
| Net Pay | Deducted from gross pay before tax | Some workplace schemes |
| Employer Contribution | Not taxed as income, deductible for CT | Employer schemes |

Higher/additional rate taxpayers claim extra relief via Self Assessment.

### Carry Forward

Unused annual allowance from the previous 3 tax years can be carried forward, but:
- Must use the current year's allowance first
- Tax relief limited to 100% of earnings (or £3,600 if no earnings)
- Employer contributions not limited by earnings but subject to "wholly and exclusively" rule
- Maximum theoretical contribution in one year: up to £220,000 (if 3 years fully unused)

### MPAA Triggers

The £10,000 MPAA is triggered by:
- Taking a flexible drawdown payment
- Taking an uncrystallised funds pension lump sum (UFPLS)
- **Not** triggered by taking 25% tax-free lump sum alone

Once triggered, carry forward cannot be used for defined contribution schemes (DB carry forward still available).

### Pension as Tax Planning Tool

For Ltd company directors:
- Employer pension contributions are Corporation Tax deductible
- No NI payable on employer pension contributions (saves 15% employer NI)
- More efficient than salary for amounts above the NI secondary threshold
- Example: £10,000 as salary costs £11,500 (inc. employer NI); £10,000 as pension contribution costs £10,000

---

## R&D Tax Credits (Deep Dive)

### Current Scheme: Merged R&D Expenditure Credit (from 1 April 2024)

The previous SME and RDEC schemes have been merged into a single scheme.

| Aspect | Merged Scheme | ERIS (R&D Intensive) |
|--------|---------------|----------------------|
| Credit Rate | 20% above-the-line | 14.5% payable credit |
| Effective Benefit (profitable) | ~15% (after 25% CT) | N/A |
| Effective Benefit (loss-making) | ~16.2% (after 19% notional tax) | Up to 27% |
| R&D Intensity Threshold | N/A | 30% of total expenditure |
| PAYE/NIC Cap | £20,000 + 300% of PAYE/NIC | £20,000 + 300% of PAYE/NIC |

### Qualifying Expenditure

| Cost Type | Included | Notes |
|-----------|----------|-------|
| Staff costs | Yes | Salary, NI, pension for R&D staff |
| Subcontractors | 65% of cost | **UK-based only** from April 2024 |
| Software & cloud computing | Yes | Must be directly used for R&D |
| Consumables | Yes | Materials consumed in R&D |
| Externally Provided Workers | 65% of cost | **UK-based only** from April 2024 |
| Overseas subcontractors/EPWs | No | Restricted from April 2024 |

### Qualifying Activities for Software Development

R&D must seek an **advance in overall knowledge or capability** in science or technology — not just your company's own knowledge.

**What qualifies**:
- Developing novel algorithms or data structures
- Solving performance problems where no known solution exists
- Creating new frameworks or architectures that advance the field
- AI/ML model development with genuine technological uncertainty
- Resolving interoperability challenges at the technology level
- Pure mathematics research (newly qualifying from April 2024)

**What does NOT qualify**:
- Using existing frameworks/libraries in standard ways
- UI/UX design and cosmetic improvements
- Routine software development or bug fixing
- System-level uncertainty (e.g., "will the product sell?")
- Features described by commercial function rather than technical challenge
- Configuration, deployment, or DevOps work

**HMRC's test**: Focus on the technical input (the engineering challenge), not the commercial output (the product feature). The uncertainty must be at the **technology level**, not the **system level**.

### Claim Process

1. **Claim Notification**: Submit to HMRC within 6 months of accounting period end (mandatory for first-time/lapsed claimants)
2. **Additional Information Form**: Required before submitting CT600 claim
3. **CT600**: Include R&D claim in Corporation Tax return
4. **Documentation**: Maintain contemporaneous records of technical challenges, approaches tried, and advances achieved

---

## Capital Gains Tax (Detailed)

### Rates Summary

See the CGT table in the Key Tax Reference section above.

### Key Reliefs

| Relief | Benefit | Conditions |
|--------|---------|------------|
| BADR | 14% (2025/26), 18% (2026/27+) vs 18%/24% | 5%+ shares, 2yr holding, officer/employee |
| Investors' Relief | Same rates as BADR | Shares in unlisted trading company, 3yr holding |
| Rollover Relief | Defer CGT on reinvestment | Reinvest in qualifying asset within 1yr before/3yr after |
| EIS Deferral Relief | Defer CGT by investing in EIS | Must hold EIS shares 3+ years |
| Gift Relief | Defer CGT on business assets gifted | Business assets only |

### Losses
- Capital losses offset against gains in the same year
- Excess losses carry forward indefinitely
- Cannot carry back capital losses (except on death)
- Must report losses within 4 years to carry forward

### Crypto and Digital Assets
See dedicated section below.

---

## Crypto and Digital Assets Taxation

HMRC treats crypto assets (Bitcoin, Ethereum, NFTs, tokens) as property, not currency.

### Taxable Events

| Event | Tax Type | Notes |
|-------|----------|-------|
| Selling crypto for GBP | CGT | Gain = proceeds - cost basis |
| Swapping crypto-to-crypto | CGT | Each swap is a disposal |
| Paying for goods/services | CGT | Disposal at market value |
| Receiving mining rewards (hobby) | Income Tax | Miscellaneous income on receipt |
| Receiving mining rewards (business) | Income Tax + NI | Trading profits, expenses deductible |
| Staking rewards | Income Tax | Taxed on receipt at market value |
| Airdrops (in return for service) | Income Tax | Miscellaneous income |
| DeFi lending returns | Income Tax / CGT | Depends on structure |

### Cost Basis Rules (HMRC mandated order)

1. **Same-Day Rule**: Match disposals with acquisitions on the same day
2. **Bed and Breakfasting Rule**: Match with acquisitions within 30 days after disposal
3. **Section 104 Pool**: Average cost basis for remaining holdings

### Key Points

- Annual exempt amount (£3,000 for 2025/26) applies across all assets including crypto
- Losses on crypto can offset other capital gains
- **No wash sale exception**: The 30-day rule prevents selling and rebuying to crystallize losses
- Must keep records of every transaction (date, quantity, value in GBP, counterparty)
- HMRC has data-sharing agreements with UK crypto exchanges

### Crypto-Asset Reporting Framework (CARF) — from January 2026

From 1 January 2026, crypto platforms must:
- Collect customer identity details (name, address, DOB, NI number)
- Report all transactions to HMRC automatically
- HMRC will cross-reference with Self Assessment returns from late 2027
- Penalties of up to £300 for failing to provide details to platforms

---

## Company Car & Benefit-in-Kind (BIK)

### BIK Rates by CO2 Emissions

| CO2 (g/km) | Vehicle Type | 2025/26 | 2026/27 | 2027/28 |
|------------|-------------|---------|---------|---------|
| 0 | Electric (EV) | **3%** | **4%** | 5% |
| 1-50 | PHEV (depends on range) | 5-14% | 5-14% | TBC |
| 51-54 | Low emission | 15% | 16% | TBC |
| 55-59 | | 16% | 17% | TBC |
| 100-104 | | 25% | 26% | TBC |
| 170+ | High emission | 37% | 37% | 38% |

Diesel vehicles not meeting RDE2 standard: **+4% surcharge** (capped at 37% total for 2025/26).

### BIK Tax Calculation

```
Annual BIK tax = P11D value × BIK% × Income tax rate

Example (2025/26):
EV with P11D value £45,000:
BIK = £45,000 × 3% = £1,350 taxable benefit
Tax (basic rate): £1,350 × 20% = £270/year
Tax (higher rate): £1,350 × 40% = £540/year
```

### Employer Cost

Employer pays Class 1A NI on the BIK value:
```
Employer NI = P11D value × BIK% × 15%
Example: £45,000 × 3% × 15% = £202.50/year
```

### Salary Sacrifice for EVs

Salary sacrifice for electric cars is highly tax-efficient:
- Employee saves income tax + employee NI on sacrificed salary
- Employer saves employer NI on sacrificed salary
- BIK charge at 3% (2025/26) is minimal
- Net saving can be 30-40% vs personal lease

### Key Change: Euro 6e-bis Testing (from April 2026)

PHEVs will be retested under new standards. Many will see CO2 figures double or triple, significantly increasing BIK rates. Pure EVs are unaffected. This makes EVs the clear winner for company car tax efficiency.

### P11D Reporting

- **Deadline**: 6 July after the tax year
- **Penalty**: £300 per form for late filing
- Report all taxable benefits: company cars, fuel, medical insurance, etc.
- Class 1A NI on benefits due by 22 July (electronic) or 19 July (cheque)

---

