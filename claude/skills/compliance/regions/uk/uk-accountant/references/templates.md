# UK Accounting — Templates

## Templates

### Tax Calculation Output

```markdown
## Tax Calculation Summary

### Entity: [Company/Individual Name]
### Period: [Tax Year/Accounting Period]
### Prepared: [Date]

---

### Taxable Profit Calculation
| Item | Amount |
|------|--------|
| Revenue | £XXX,XXX |
| Less: Allowable Expenses | (£XX,XXX) |
| Less: Capital Allowances | (£X,XXX) |
| **Taxable Profit** | **£XXX,XXX** |

### Tax Liability
| Tax | Calculation | Amount |
|-----|-------------|--------|
| Corporation Tax | £XXX,XXX × XX% | £XX,XXX |
| Less: R&D Credit | | (£X,XXX) |
| **Total Tax Due** | | **£XX,XXX** |

### Key Dates
- Payment Due: [Date]
- Filing Due: [Date]

### Savings Identified
- [Optimization 1]: Potential saving £X,XXX
- [Optimization 2]: Potential saving £X,XXX
```

### IR35 Assessment Checklist

```markdown
## IR35 Status Assessment

### Engagement: [Contract Description]
### Date: [Date]

---

### Key Factors

#### Control
- [ ] Client dictates how work is done
- [ ] Client sets working hours
- [ ] Client provides equipment
- [ ] Contractor works at client premises

#### Substitution
- [ ] Right to send substitute exists
- [ ] Substitute must be approved by client
- [ ] Contractor personally performs all work

#### Mutuality of Obligation
- [ ] Client obligated to provide work
- [ ] Contractor obligated to accept work
- [ ] Ongoing relationship expected

### Risk Indicators
| Factor | Inside IR35 | Outside IR35 |
|--------|-------------|--------------|
| Control | High control | Autonomy |
| Substitution | No right | Genuine right |
| Financial Risk | None | Bears risk |
| Equipment | Provided | Own equipment |
| Integration | Part of team | Separate |

### Assessment: [INSIDE/OUTSIDE/BORDERLINE]
### Confidence: [HIGH/MEDIUM/LOW]
### Recommendation: [Action required]
```

### Software Logic Template

```markdown
## Accounting Logic Specification

### Feature: [e.g., VAT Calculation]
### Version: [Date]

---

### Business Rules

1. **Rule 1**: [Description]
   - Condition: [When this applies]
   - Calculation: [Formula]
   - Edge cases: [Exceptions]

### Pseudocode

function calculateVAT(netAmount, vatRate, isReverseCharge):
    if isReverseCharge:
        return {
            net: netAmount,
            vat: 0,
            gross: netAmount,
            reverseChargeVAT: netAmount * vatRate
        }

    vatAmount = netAmount * vatRate
    return {
        net: netAmount,
        vat: vatAmount,
        gross: netAmount + vatAmount
    }

### Validation Rules
- [ ] [Validation 1]
- [ ] [Validation 2]

### Test Cases
| Input | Expected Output | Notes |
|-------|-----------------|-------|
| £100, 20% | £120 gross, £20 VAT | Standard rate |
| £100, 0% | £100 gross, £0 VAT | Zero-rated |
```

---

