# PO — Templates (Feature Vision · User Story)

## Feature Vision Template (Confluence)

Use this template when starting a new feature. The user approves the Feature Vision before the team proceeds to architecture and implementation.

```markdown
## Feature Vision: [Feature Name]

**Author:** /po
**Date:** [YYYY-MM-DD]
**Status:** DRAFT / APPROVED / IN PROGRESS / DELIVERED
**Epic:** [Jira Epic link]

---

### Business Context
[Why are we building this? What business problem or opportunity does it address?
Include market context, customer feedback themes, or strategic drivers.]

### Feature Goals
- [ ] Goal 1: [Specific, measurable goal]
- [ ] Goal 2: [Specific, measurable goal]
- [ ] Goal 3: [Specific, measurable goal]

### Success Metrics
| Metric | Current Baseline | Target | Measurement Method | Timeline |
|--------|-----------------|--------|--------------------|----------|
| [Primary metric] | X | Y | [How we track] | [When we measure] |
| [Guardrail metric] | X | Not below Y | [How we track] | [When we measure] |

### User Stories (High-Level)
| ID | Story | Priority | Notes |
|----|-------|----------|-------|
| US-001 | As a [user], I want [goal] so that [benefit] | P0 | [Key context] |
| US-002 | As a [user], I want [goal] so that [benefit] | P1 | [Key context] |

### Design
[Link to /ui design specs, wireframes, or Figma.
If no UI involved, state "N/A — backend/API only."]

### Architecture Overview
[High-level technical approach. Link to /arch ADR once approved.
Do NOT include implementation details — this is a product document.]

### Discussions & Decisions
| Date | Topic | Decision | Participants |
|------|-------|----------|-------------|
| [YYYY-MM-DD] | [Topic] | [What was decided and why] | [Who was involved] |

### Open Questions
- [ ] [Question 1 — who needs to answer, by when]
- [ ] [Question 2 — who needs to answer, by when]

### Out of Scope
- [Item 1 — and why it is excluded]
- [Item 2 — and why it is excluded]

### Related Links
- [Confluence page link]
- [Jira Epic link]
- [Design file link]
- [Architecture ADR link]
- [Competitor/market research link]
```

**Process:**
1. /po drafts the Feature Vision
2. /po presents to the user (stakeholder) for discussion
3. User approves (or requests changes)
4. Approved Feature Vision triggers the workflow: /arch -> /secops -> [/fin] -> [/legal] -> [/ui] -> /fe|/be


## Templates

### User Story Template

```markdown
## US-{ID}: {Title}

**Priority:** P0 (Must Have) | P1 (Should Have) | P2 (Could Have)
**Story Points:** {estimate}
**Sprint:** {sprint_number}
**OKR:** {Connected objective and key result}

### User Story
**As a** {user type/persona}
**I want** {goal/action}
**So that** {benefit/value}

### Description
{Additional context, background, or clarification}

### Acceptance Criteria

#### Scenario 1: {Happy path}
- **Given** {initial context/state}
- **When** {action is performed}
- **Then** {expected outcome}
- **And** {additional outcome}

#### Scenario 2: {Edge case}
- **Given** {context}
- **When** {action}
- **Then** {outcome}

### Test Cases
- [ ] TC-{ID}.1: {Test description for scenario 1}
- [ ] TC-{ID}.2: {Test description for scenario 2}
- [ ] TC-{ID}.3: {Negative test case}

### Success Metric
{How we'll measure if this story achieved its goal}

### Technical Notes
- {API endpoints affected}
- {Database changes required}
- {Third-party integrations}

### Dependencies
- Depends on: US-{ID}
- Blocks: US-{ID}

### Out of Scope
- {What this story explicitly does NOT include}

### Definition of Done
- [ ] Code complete and tested
- [ ] Unit tests passing (>80% coverage)
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] Acceptance criteria verified
- [ ] /po approved
```

