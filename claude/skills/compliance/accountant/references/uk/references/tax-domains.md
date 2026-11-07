# UK Accounting — Tax Domains (key reference · MTD · pensions · R&D · CGT · crypto · BIK)

## Key Tax Reference

> **Rate Versioning**: All tables below show rates by tax year. The **current year** is marked. A 2027/28 column appears only where GOV.UK has already published the figure; announced changes without a published rate are listed under *Announced for 2027/28*. Each table carries the date its figures were last checked against GOV.UK.

**GOV.UK sources**: [Income Tax rates and allowances](https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past) · [dividend, savings and property rates](https://www.gov.uk/government/publications/changes-to-tax-rates-for-property-savings-and-dividend-income/change-to-tax-rates-for-property-savings-and-dividend-income-technical-note) · [frozen thresholds until 5 April 2031](https://www.gov.uk/government/publications/maintaining-income-tax-and-equivalent-national-insurance-contributions-thresholds-until-5-april-2031) · [National Insurance rates and allowances](https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions) · [Corporation Tax rates](https://www.gov.uk/corporation-tax-rates) · [Capital Gains Tax rates](https://www.gov.uk/guidance/capital-gains-tax-rates-and-allowances) · [Business Asset Disposal Relief](https://www.gov.uk/business-asset-disposal-relief) · [pension scheme rates](https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes/pension-schemes-rates) · [company car appropriate percentage](https://www.gov.uk/guidance/company-car-benefit-the-appropriate-percentage-480-appendix-2)

### Corporation Tax

> Verified against GOV.UK on 2026-10-18.

| Profit Band | 2024/25 | 2025/26 | 2026/27 *(current)* |
|-------------|---------|---------|----------------------|
| £0 - £50,000 | 19% | 19% | 19% |
| £50,001 - £250,000 | Marginal relief | Marginal relief | Marginal relief |
| Over £250,000 | 25% | 25% | 25% |

Marginal relief fraction: 3/200. Corporation tax in the taper band = 25% × profit − 3/200 × (£250,000 − profit). Effective marginal rate ~26.5% in the taper band.

### Income Tax (England, Wales & NI)

> Verified against GOV.UK on 2026-10-18.

| Band | 2024/25 | 2025/26 | 2026/27 *(current)* |
|------|---------|---------|----------------------|
| Personal Allowance | £12,570 | £12,570 | £12,570 |
| Basic rate band (width) | £37,700 | £37,700 | £37,700 |
| Basic Rate (20%) | £12,571 - £50,270 | £12,571 - £50,270 | £12,571 - £50,270 |
| Higher Rate (40%) | £50,271 - £125,140 | £50,271 - £125,140 | £50,271 - £125,140 |
| Additional Rate (45%) | Over £125,140 | Over £125,140 | Over £125,140 |

Personal Allowance tapers by £1 for every £2 over £100,000 (fully lost at £125,140). Thresholds frozen until 5 April 2031.

### Dividend Tax

> Verified against GOV.UK on 2026-10-18.

| Band | 2024/25 | 2025/26 | 2026/27 *(current)* |
|------|---------|---------|----------------------|
| Dividend Allowance | £500 | £500 | £500 |
| Basic Rate | 8.75% | 8.75% | 10.75% |
| Higher Rate | 33.75% | 33.75% | 35.75% |
| Additional Rate | 39.35% | 39.35% | 39.35% |

Dividends use up the basic/higher rate bands but are taxed at the lower dividend rates. The £500 allowance applies before any dividend tax is due.

#### Optimal Salary + Dividend Extraction (Ltd Company Director)

Single director/shareholder, no other income, 2026/27, company profit before director pay of £60,000. Option A pays a salary of £5,000 (the employer NI secondary threshold); Option B pays £12,570 (the Personal Allowance).

| Item | A: salary £5,000 | B: salary £12,570 |
|------|------------------|-------------------|
| Profit before director pay | £60,000.00 | £60,000.00 |
| Less salary | (£5,000.00) | (£12,570.00) |
| Less employer NI (15% above £5,000) | £0.00 | (£1,135.50) |
| Taxable profit | £55,000.00 | £46,294.50 |
| Corporation tax | (£10,825.00) | (£8,795.96) |
| Distributable profit (paid as dividend) | £44,175.00 | £37,498.54 |
| Income tax on salary | £0.00 | £0.00 |
| Employee NI | £0.00 | £0.00 |
| Dividend left after remaining Personal Allowance | £36,605.00 (£7,570 allowance left) | £37,498.54 (no allowance left) |
| Dividend tax (first £500 at 0%, rest at 10.75%) | (£3,881.29) | (£3,977.34) |
| **Net cash to the director** | **£45,293.71** | **£46,091.20** |

How the figures are built:
- Employer NI in B: (£12,570 − £5,000) × 15% = £1,135.50, deductible for corporation tax. The Employment Allowance is not available: a company whose only employee is its director cannot claim it.
- Corporation tax in A: £55,000 × 25% = £13,750, less marginal relief 3/200 × (£250,000 − £55,000) = £2,925, giving £10,825. In B the profit is below £50,000, so 19% × £46,294.50 = £8,795.96 (rounded to the penny).
- Neither salary exceeds the £12,570 primary threshold, so there is no employee NI, and neither exceeds the Personal Allowance, so there is no income tax on salary.
- Income tax on dividends in A: £44,175 − £7,570 unused Personal Allowance = £36,605 taxable; the first £500 is at 0%, the other £36,105 × 10.75% = £3,881.29 (rounded). In B: (£37,498.54 − £500) × 10.75% = £3,977.34. In both options total taxable income stays under £37,700, so the 35.75% rate does not apply.

**Result**: B is £797.49 ahead at £60,000 profit.

**Decision rule**: the extra £7,570 of salary costs the company £8,705.50 including employer NI, and that amount is deductible at the company's marginal corporation tax rate. The salary is received tax-free, exactly as the first £7,570 of dividend would have been, so the higher salary pays when 8,705.50 × (1 − marginal CT rate) < £7,570, i.e. when the marginal rate is above about 13%. Corporation tax is never below 19%, so for a single director with no other income the £12,570 salary wins whenever profit before director pay comfortably exceeds the £13,705.50 of salary plus employer NI; from £20,000 to £50,000 of profit the same calculation puts it £462.80 ahead. At very low profits the extra salary creates or deepens a loss with no in-year corporation tax relief, and £5,000 may be as good. Model both options whenever the director has other income, pays dividends into the higher-rate band, or can claim the Employment Allowance.

### Capital Gains Tax

> Verified against GOV.UK on 2026-10-18.

| Category | 2024/25 | 2025/26 | 2026/27 *(current)* |
|----------|---------|---------|----------------------|
| Annual Exempt Amount | £3,000 | £3,000 | £3,000 |
| Basic Rate | 10% (18% residential property) to 29 Oct 2024; 18% from 30 Oct 2024 | 18% | 18% |
| Higher Rate | 20% (24% residential property) to 29 Oct 2024; 24% from 30 Oct 2024 | 24% | 24% |
| BADR Rate | 10% | 14% | 18% |
| BADR Lifetime Limit | £1m | £1m | £1m |
| Investors' Relief Rate | 10% | 14% | 18% |

The BADR lifetime limit of £1 million of qualifying gains is set by [Taxation of Chargeable Gains Act 1992 s.169N(4A)](https://www.legislation.gov.uk/ukpga/1992/12/section/169N); the GOV.UK BADR guidance does not state the figure.

**Business Asset Disposal Relief (BADR)** conditions:
- Must hold at least 5% of shares and voting rights
- Must be an officer or employee of the company
- Must hold shares for at least 2 years before disposal
- Company must be a trading company

**Rollover Relief**: Defer CGT when disposing of a business asset and reinvesting proceeds into a new qualifying asset within 3 years (1 year before to 3 years after disposal).

### VAT Thresholds

> Verified against GOV.UK on 2026-10-18.

| Threshold | 2024/25 | 2025/26 | 2026/27 *(current)* |
|-----------|---------|---------|----------------------|
| Registration | £90,000 | £90,000 | £90,000 |
| Deregistration | £88,000 | £88,000 | £88,000 |

VAT rates: Standard 20%, Reduced 5%, Zero-rated 0%.

### National Insurance

#### Employee (Primary) Class 1

> Verified against GOV.UK on 2026-10-18.

| Threshold/Rate | 2024/25 | 2025/26 | 2026/27 *(current)* |
|----------------|---------|---------|----------------------|
| Primary Threshold | £12,570/yr | £12,570/yr | £12,570/yr |
| Upper Earnings Limit | £50,270/yr | £50,270/yr | £50,270/yr |
| Main Rate | 8% | 8% | 8% |
| Additional Rate | 2% | 2% | 2% |

#### Employer (Secondary) Class 1

> Verified against GOV.UK on 2026-10-18.

| Threshold/Rate | 2024/25 | 2025/26 | 2026/27 *(current)* |
|----------------|---------|---------|----------------------|
| Secondary Threshold | £9,100/yr (£175/wk) | **£5,000/yr (£96/wk)** | £5,000/yr (£96/wk) |
| Rate | 13.8% | **15%** | 15% |
| Class 1A/1B (BIK) | 13.8% | **15%** | 15% |

**Key change (April 2025)**: Employer NI rate increased from 13.8% to 15%, and the secondary threshold dropped from £9,100 to £5,000. This is the largest NI change in decades. The secondary threshold, like the primary threshold and upper earnings limit, is frozen until 5 April 2031.

#### Self-Employed

> Verified against GOV.UK on 2026-10-18.

| Threshold/Rate | 2024/25 | 2025/26 | 2026/27 *(current)* |
|----------------|---------|---------|----------------------|
| Class 4 Main Rate | 6% | 6% | 6% |
| Class 4 Additional Rate | 2% | 2% | 2% |
| Lower Profits Limit | £12,570 | £12,570 | £12,570 |
| Upper Profits Limit | £50,270 | £50,270 | £50,270 |
| Class 2 (voluntary) | £3.45/wk | £3.50/wk | £3.65/wk |
| Small Profits Threshold (Class 2) | £6,725 | £6,845 | £7,105 |

**Note**: There has been no compulsory Class 2 liability since April 2024. A self-employed person with profits at or above the Small Profits Threshold is treated as having paid Class 2; below it, Class 2 can be paid voluntarily to protect State Pension entitlement.

#### Employment Allowance

> Verified against GOV.UK on 2026-10-18.

| Detail | 2024/25 | 2025/26 | 2026/27 *(current)* |
|--------|---------|---------|----------------------|
| Amount | £5,000 | **£10,500** | £10,500 |
| Eligibility Cap | NI bill < £100,000 | **No cap (removed)** | No cap |

The Employment Allowance offsets employer NI liability. From 2025/26, the allowance doubled and the £100,000 eligibility threshold was removed, making all employers eligible. Single-director companies with no other employees remain ineligible.

### Payments on Account

Payments on Account (POA) apply to Self Assessment taxpayers whose last tax bill was £1,000 or more (after deducting tax at source).

> Verified against GOV.UK on 2026-10-18.

| Detail | Rule |
|--------|------|
| When required | Tax bill > £1,000 AND < 80% was deducted at source |
| First payment | 50% of previous year's bill by **31 January** (in the tax year) |
| Second payment | 50% of previous year's bill by **31 July** (after the tax year) |
| Balancing payment | Any remaining tax by **31 January** (after the tax year) |
| Reducing POA | Apply to HMRC via SA303 if you expect a lower bill |

**Cash flow warning**: New self-employed individuals face a large first-year bill (full year's tax + first POA for next year). Always plan for this.

#### POA Calculation Example

If the 2025/26 tax bill is £10,000 with no tax deducted at source:
- 31 Jan 2027: £5,000 (1st POA for 2026/27) + £10,000 balancing payment for 2025/26 = £15,000
- 31 Jul 2027: £5,000 (2nd POA for 2026/27)
- 31 Jan 2028: Balancing payment for 2026/27 (difference between actual bill and POAs paid)

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

### Announced for 2027/28

Source: [Budget 2025 overview of tax legislation and rates](https://www.gov.uk/government/publications/budget-2025-overview-of-tax-legislation-and-rates-ootlar/budget-2025-overview-of-tax-legislation-and-rates-ootlar). These apply from 6 April 2027 and are not yet in the tables above.

- Savings income rates rise by 2 percentage points to 22% basic, 42% higher and 47% additional.
- Property income gets its own rates: 22% basic, 42% higher and 47% additional.
- Reliefs and allowances deducted at steps 2 and 3 of the Income Tax calculation are set first against non-savings, dividend and property income, subject to provisions that require a specific income type.
- The cash ISA limit for savers under 65 becomes £12,000 within the overall £20,000 ISA limit; savers aged 65 and over keep the £20,000 cash allowance.
- Making Tax Digital for Income Tax applies to qualifying income over £30,000 (see the MTD section).

---

## Making Tax Digital (MTD)

### MTD for VAT
Already mandatory for all VAT-registered businesses. Requires:
- Digital record-keeping
- Quarterly VAT returns via compatible software
- Digital links between records (no manual re-keying)

### MTD for Income Tax Self Assessment (ITSA)

Phased rollout for sole traders and landlords, decided by qualifying income from self-employment and property in an earlier tax year:

> Verified against GOV.UK on 2026-10-18.

| Phase | Start Date | Qualifying income threshold | Notes |
|-------|------------|-----------------------------|-------|
| Phase 1 | **6 April 2026** | Over £50,000 in 2024/25 | Combined self-employment + property income |
| Phase 2 | 6 April 2027 | Over £30,000 in 2025/26 | |
| Phase 3 | 6 April 2028 | Over £20,000 in 2026/27 | |
| Partnerships | TBC | TBC | Not yet scheduled |

**Key rules**:
- Income threshold = combined qualifying income from all self-employment + property sources
- PAYE employment income, dividends, and investment income do NOT count
- Quarterly updates are due on the 7th of the month after each update period ends: 7 August, 7 November, 7 February and 7 May
- Each quarterly update is cumulative: it covers 6 April to the end of its update period, so it shows year-to-date totals
- The tax return is submitted through MTD-compatible software by 31 January after the tax year; the GOV.UK guidance has no separate End of Period Statement step
- 2026/27: no penalty points for late quarterly updates, but penalty points still apply to late tax returns
- From 2027/28: each late quarterly update earns a penalty point, and reaching 4 points triggers a £200 penalty
- Late payment penalties: percentage of outstanding tax from 15 days overdue

**Software requirements**: Must use HMRC-compatible software. Options range from full accounting packages (Xero, QuickBooks, FreeAgent) to bridging software for spreadsheet users.

---

## Pension Contributions

### Annual Allowance

> Verified against GOV.UK on 2026-10-18.

| Detail | 2025/26 | 2026/27 *(current)* |
|--------|---------|----------------------|
| Standard Annual Allowance | £60,000 | £60,000 |
| Money Purchase Annual Allowance (MPAA) | £10,000 | £10,000 |
| Tapered AA threshold income | £200,000 | £200,000 |
| Tapered AA threshold (adjusted income) | £260,000 | £260,000 |
| Minimum tapered AA | £10,000 (at £360,000+ adjusted income) | £10,000 (at £360,000+ adjusted income) |
| Lifetime Allowance | Abolished (from April 2024) | Abolished (from April 2024) |

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
- Maximum theoretical contribution in 2026/27: up to £240,000 (£60,000 for the year plus £60,000 unused from each of 2023/24, 2024/25 and 2025/26)

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
| BADR | 18% from 6 April 2026 (14% in 2025/26) vs 18%/24% | 5%+ shares, 2yr holding, officer/employee |
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

- Annual exempt amount (£3,000 for 2026/27) applies across all assets including crypto
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

### BIK Rates by CO2 Emissions (selected bands)

Selected CO2 bands only. The full table is in the [GOV.UK appropriate percentage guide](https://www.gov.uk/guidance/company-car-benefit-the-appropriate-percentage-480-appendix-2).

> Verified against GOV.UK on 2026-10-18.

| CO2 (g/km) | Vehicle Type | 2025/26 | 2026/27 *(current)* |
|------------|-------------|---------|----------------------|
| 0 | Electric (EV) | 3% | **4%** |
| 1-50 | PHEV, electric range 130 miles or more | 3% | 4% |
| 1-50 | PHEV, electric range 70-129 miles | 6% | 7% |
| 1-50 | PHEV, electric range 40-69 miles | 9% | 10% |
| 1-50 | PHEV, electric range 30-39 miles | 13% | 14% |
| 1-50 | PHEV, electric range under 30 miles | 15% | 16% |
| 51-54 | Low emission | 16% | 17% |
| 55-59 | | 17% | 18% |
| 70-74 | | 20% | 21% |
| 75-79 | | 21% | 21% |
| 100-104 | | 26% | 26% |
| 155 and above | High emission | 37% | 37% |

CO2 figures are rounded down to the nearest 5 g/km. 37% is the maximum for petrol and hybrid cars.

Diesel vehicles not meeting the RDE2 standard: **+4% supplement**, up to the 37% maximum.

GOV.UK's appropriate percentage guide lists 2025/26 and 2026/27 only. For later years it has published only that zero-emission rates rise by 2 percentage points a year in 2028/29 and 2029/30, reaching 9% in 2029/30 ([policy paper](https://www.gov.uk/government/publications/income-tax-company-car-tax-rates-2028-to-2030)).

### BIK Tax Calculation

```
Annual BIK tax = P11D value × BIK% × Income tax rate

Example (2026/27):
EV with P11D value £45,000:
BIK = £45,000 × 4% = £1,800 taxable benefit
Tax (basic rate): £1,800 × 20% = £360/year
Tax (higher rate): £1,800 × 40% = £720/year
```

### Employer Cost

Employer pays Class 1A NI on the BIK value:
```
Employer NI = P11D value × BIK% × 15%
Example (2026/27): £45,000 × 4% × 15% = £270/year
```

### Salary Sacrifice for EVs

Salary sacrifice for electric cars is highly tax-efficient:
- Employee saves income tax + employee NI on sacrificed salary
- Employer saves employer NI on sacrificed salary
- BIK charge at 4% (2026/27) is minimal
- Net saving can be 30-40% vs personal lease

### Key Change: Euro 6e-bis Testing (from April 2026)

PHEVs will be retested under new standards. Many will see CO2 figures double or triple, significantly increasing BIK rates. Pure EVs are unaffected. This makes EVs the clear winner for company car tax efficiency.

### P11D Reporting

- **Deadline**: 6 July after the tax year
- **Penalty**: £300 per form for late filing
- Report all taxable benefits: company cars, fuel, medical insurance, etc.
- Class 1A NI on benefits due by 22 July (electronic) or 19 July (cheque)

---

