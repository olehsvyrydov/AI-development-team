# AI Development Team - Global Instructions

This file provides global instructions for Claude Code when using the AI Development Team framework.

## Development Methodology

### Test-Driven Development (TDD) - MANDATORY

All projects must follow **strict TDD principles**:

1. **Write Tests First**: Before writing implementation code, write failing tests that define expected behavior
2. **Run Tests (Red)**: Verify tests fail as expected
3. **Implement Code**: Write minimum code to pass tests
4. **Run Tests (Green)**: Verify all tests pass
5. **Refactor**: Clean up while keeping tests green
6. **Commit**: Git commit after successful test run

### Project Management with Scrum

1. Create `SPRINT-STATUS.md` for sprint tracking
2. Split requirements into small, testable tasks
3. Document tasks in `docs/sprints/` with descriptions, AC, and test cases
4. Run all tests before committing
5. Create comprehensive commit messages
6. Update sprint status after each task

## AI Development Team Workflow

**Reference**: `~/.claude/TEAM_WORKFLOW.md` for complete documentation.

### Workflow Sequence

```
/po → /sm → /arch → [/fin] → [/legal] → [/ui] → /fe|/be → /rev → /qa + /e2e
Vision  AC   Arch.   Finance  Legal    Design   TDD Dev    Review  Testing

[ ] = Conditional based on feature type
```

### Approval Gates

| Gate | Agent | When Required |
|------|-------|---------------|
| Architecture | /arch | **ALWAYS** - all features |
| Finance | /fin | Payments, billing, VAT, tax |
| Legal | /legal | GDPR, privacy, contracts |
| UI Design | /ui | Frontend features |

### Critical Rules

1. **Architecture First**: ALL features require /arch approval
2. **Developers Own Tests**: /fe and /be write unit/integration tests (TDD)
3. **Acceptance Criteria Required**: No feature without AC from /sm
4. **Code Review Before QA**: /rev reviews quality + security
5. **Design QA for Frontend**: /ui verifies UI before QA
6. **Automated Testing**: /qa designs, /e2e implements

### Context Preservation (CRITICAL)

**Every approval and report MUST be saved to files.** This ensures context survives across conversations.

**Sprint Folder Location**: `docs/sprints/sprint-{N}-{feature}/`

| Agent | Saves To | After Saving |
|-------|----------|--------------|
| `/arch` | `approvals/arch-architecture.md` | Trigger /sm |
| `/fin` | `approvals/fin-finance.md` | Trigger /sm |
| `/legal` | `approvals/legal-compliance.md` | Trigger /sm |
| `/ui` | `approvals/ui-designs/{ticket}.md` | Trigger /sm |
| `/fe` | `implementation/{ticket}.md` | Trigger /sm (on complete) |
| `/be` | `implementation/{ticket}.md` | Trigger /sm (on complete) |
| `/rev` | `reviews/rev-{ticket}.md` | Trigger /sm |
| `/qa` | `testing/qa-{ticket}.md` | Trigger /sm |
| `/e2e` | `testing/e2e-{ticket}.md` | Trigger /sm |

**Rule**: After ANY approval → Save to file → Say "/sm - please update sprint status"

See `~/.claude/TEAM_WORKFLOW.md` for complete folder structure and templates.

### Bug Workflow

```
/bug [description] → /sm ticket → Investigation → /qa reproduction test → TDD Fix → /rev review → /e2e tests
```

### Team Quick Reference

| Command | Role |
|---------|------|
| `/po` | Product Owner - vision, backlog |
| `/sm` | Scrum Master - AC, sprints |
| `/arch` | Solution Architect - architecture |
| `/ba` | Business Analyst - research |
| `/fin` | UK Accountant - finance |
| `/legal` | UK Legal - legal |
| `/ui` | UI Designer - design |
| `/fe` | Frontend Dev - React/TS |
| `/be` | Backend Dev - Java/Spring |
| `/rev` | Code Reviewer - quality |
| `/qa` | QA - test design |
| `/e2e` | Test Automation - E2E |
| `/mkt` | Marketing - GTM |

### Before Starting Any Feature

- [ ] Feature description exists
- [ ] Acceptance criteria from /sm
- [ ] /arch approved architecture (MANDATORY)
- [ ] /fin approved (if finance)
- [ ] /legal approved (if legal)
- [ ] /ui approved design (if frontend)

## General Rules

- Check web for latest documentation
- Use latest versions of tools
- Follow security best practices
- Maintain test coverage (>80% unit, >60% integration)
