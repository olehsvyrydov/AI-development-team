# UK Legal — Scenario-Based Examples

## Scenario-Based Examples

### Scenario 1: Hiring a Contractor (IR35 + Contract)

**Situation**: Tech company engaging a freelance developer for 6-month project.

**Legal Checklist**:
1. **IR35 assessment**: Apply CEST tool + review actual working practices
2. **Status Determination Statement**: Provide to contractor (mandatory for medium/large businesses)
3. **Contract drafting**: Include substitution, no mutuality, control, IP assignment
4. **Insurance**: Require professional indemnity evidence
5. **Data protection**: If contractor accesses personal data, include DPA terms
6. **Right to work**: Verify right to work in UK
7. **Tax**: If inside IR35, deduct PAYE/NI at source

**Risk**: If wrongly classified as outside IR35, client is liable for unpaid PAYE/NI + penalties. Invoke `/inga` for tax calculation.

### Scenario 2: Data Breach Response (72-Hour Playbook)

**Hour 0-1: Discovery**
- Contain the breach (isolate affected systems)
- Activate incident response team
- Begin forensic investigation
- Preserve evidence (do not destroy logs)

**Hour 1-24: Assessment**
- Determine scope: what data, how many individuals, what category
- Assess risk to individuals (likelihood + severity)
- Prepare ICO notification if required
- Brief senior management / board

**Hour 24-72: Notification**
- Submit ICO notification if risk to rights/freedoms
- If high risk: prepare individual notifications
- Document decisions (why notifiable/not notifiable)
- Engage external counsel if criminal data theft suspected

**Post-72 Hours:**
- Complete individual notifications if required
- Conduct root cause analysis
- Implement remediation measures
- Update DPIA and security measures
- Board-level review and lessons learned

### Scenario 3: Employee Dismissal (Fair Process)

**Situation**: Employee with 3 years' service underperforming.

**Step-by-step**:
1. **Document** performance issues with specific, dated examples
2. **Informal conversation** first (ACAS Code)
3. **Formal capability meeting**: Give 5 days' notice, right to be accompanied (s.10 ERA 1999)
4. **Performance Improvement Plan**: SMART targets, 4-12 week review period
5. **Review meetings**: Document progress at regular intervals
6. **If no improvement**: Second formal meeting, consider final written warning
7. **Final meeting**: If still no improvement, dismissal with notice
8. **Written confirmation**: Reason for dismissal, appeal rights
9. **Appeal**: Heard by different manager if possible

**Risk if skipped**: Tribunal claim up to £118,223 (currently) or unlimited (from Jan 2027). Discrimination claim if protected characteristic involved = unlimited.

### Scenario 4: Receiving a GDPR Subject Access Request

**Day 1**: Acknowledge receipt, verify requester identity
**Day 1-5**: Search all systems (email, CRM, databases, backups, paper files)
**Day 5-20**: Collate data, review for third-party data (redact), apply exemptions if applicable
**Day 20-25**: Prepare response in intelligible, commonly used format
**Day 25-30**: Senior review, send response
**Maximum**: 1 calendar month from receipt (can extend to 3 months if complex/multiple requests — must notify within 1 month)

**Can refuse if**: Manifestly unfounded or excessive (must justify). Can charge reasonable fee for excessive requests.

### Scenario 5: Open Source License Audit

**Situation**: Pre-investment due diligence on a SaaS product.

**Audit steps**:
1. **Software composition analysis**: Run SCA tool (e.g., FOSSA, Black Duck, Snyk) to identify all open source dependencies
2. **License inventory**: Categorize all licenses (permissive, weak copyleft, strong copyleft, proprietary)
3. **Red flag**: Any GPL/AGPL in proprietary codebase — assess linking type
4. **AGPL in SaaS**: If AGPL code is used in a network-accessible service, may trigger source disclosure
5. **No-license code**: Cannot legally use — treat as all rights reserved
6. **Attribution compliance**: Verify all required notices are included
7. **Report**: Traffic-light system (green/amber/red) per dependency
8. **Remediation**: Replace high-risk dependencies or obtain commercial licenses

---

