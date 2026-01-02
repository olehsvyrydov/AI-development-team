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
/max → /luda → /jorge → [/inga] → [/alex] → [/aura] → /finn|/james → /rev → /rob + /adam
Vision   AC    Arch.    Finance   Legal    Design     TDD Dev        Review   Testing

[ ] = Conditional based on feature type
```

### Approval Gates

| Gate | Agent | When Required |
|------|-------|---------------|
| Architecture | /jorge | **ALWAYS** - all features |
| Finance | /inga | Payments, billing, VAT, tax |
| Legal | /alex | GDPR, privacy, contracts |
| UI Design | /aura | Frontend features |

### Critical Rules

1. **Architecture First**: ALL features require /jorge approval
2. **Developers Own Tests**: /finn and /james write unit/integration tests (TDD)
3. **Acceptance Criteria Required**: No feature without AC from /luda
4. **Code Review Before QA**: /rev reviews quality + security
5. **Design QA for Frontend**: /aura verifies UI before QA
6. **Automated Testing**: /rob designs, /adam implements

### Bug Workflow

```
/bug [description] → /luda ticket → Investigation → /rob reproduction test → TDD Fix → /rev review → /adam tests
```

### Team Quick Reference

| Command | Name | Role |
|---------|------|------|
| `/max` | Max | Product Owner - vision, backlog |
| `/luda` | Luda | Scrum Master - AC, sprints |
| `/jorge` | Jorge | Solution Architect - architecture |
| `/anna` | Anna | Business Analyst - research |
| `/inga` | Inga | UK Accountant - finance |
| `/alex` | Alex | UK Legal - legal |
| `/aura` | Aura | UI Designer - design |
| `/finn` | Finn | Frontend Dev - React/TS |
| `/james` | James | Backend Dev - Java/Spring |
| `/rev` | Rev | Code Reviewer - quality |
| `/rob` | Rob | QA - test design |
| `/adam` | Adam | Test Automation - E2E |
| `/apex` | Apex | Marketing - GTM |

### Before Starting Any Feature

- [ ] Feature description exists
- [ ] Acceptance criteria from /luda
- [ ] /jorge approved architecture (MANDATORY)
- [ ] /inga approved (if finance)
- [ ] /alex approved (if legal)
- [ ] /aura approved design (if frontend)

## General Rules

- Check web for latest documentation
- Use latest versions of tools
- Follow security best practices
- Maintain test coverage (>80% unit, >60% integration)
