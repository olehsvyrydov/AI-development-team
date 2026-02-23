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

### Project Management

1. Use **Jira** for issue tracking (Kanban board) and **Confluence** for documentation
2. Split requirements into small, testable Stories with behavioral AC
3. Run all tests before committing
4. Create comprehensive commit messages with Jira ticket IDs
5. Track sprint status in Jira and agent context in Git files

## AI Development Team Workflow

**Reference**: `~/.claude/TEAM_WORKFLOW.md` for complete documentation.

### Tooling (REQUIRED)

**Atlassian MCP Server** — Jira + Confluence integration:
```bash
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp
```

**AI Team Memory MCP** — Semantic knowledge retrieval (optional, requires Qdrant + Voyage AI):
```bash
claude mcp add ai-team-memory \
  -e VOYAGE_API_KEY=your-key \
  -- /path/to/claude/rag/mcp-server/.venv/bin/python3 -m memory_mcp
```
Setup guide: `claude/rag/README.md`

### Workflow Sequence

```
/po+/ba → /arch → /secops → [/fin] → [/legal] → [/ui] → /fe|/be → /rev → /qa + /e2e
Vision+AC  Arch.   Security  Finance  Legal    Design  TDD Dev   Review  Testing

                            ↓ Ticket Approval Gate ↓
                   All team members approve Story before implementation

[ ] = Conditional based on feature type
```

### Approval Gates

| Gate | Command | When Required |
|------|---------|---------------|
| Architecture | /arch | **ALWAYS** - all features |
| Security | /secops | **ALWAYS** - all features |
| Finance | /fin | Payments, billing, VAT, tax |
| Legal | /legal | GDPR, privacy, contracts |
| Gap Analysis | /ba | P0/P1 features |
| UI Design | /ui | Frontend features |

### Critical Rules

1. **Architecture First**: ALL features require /arch approval
2. **Security Review**: ALL features require /secops security review
3. **Ticket Approval Gate**: ALL team members approve Story before implementation
4. **Behavior-Only Tickets**: Stories describe WHAT, not HOW (no file paths, code, line numbers)
5. **Developers Own Tests**: /fe and /be write unit/integration tests (TDD)
6. **Acceptance Criteria Required**: No feature without behavioral AC from /po + /ba
7. **Code Review Before QA**: /rev reviews quality + security
8. **Design QA for Frontend**: /ui verifies UI before QA
9. **Automated Testing**: /qa designs, /e2e implements
10. **Reports as Jira Comments**: Every phase documents what was done in the Jira ticket

### Context Preservation (Hybrid Model)

**Primary**: Jira for ticket process (comments), Confluence for documentation.
**Secondary**: Git files for agent context across sessions.

**Agents write to BOTH Jira/Confluence AND Git files.** Jira is for human visibility; Git files are for agent context.

**Sprint Folder Location**: `docs/sprints/sprint-{N}-{feature}/`

| Command | Saves To (Git) | Also In |
|---------|----------------|---------|
| `/arch` | `approvals/arch-architecture.md` | Confluence ADR |
| `/secops` | `approvals/secops-security.md` | Confluence Checklist |
| `/fin` | `approvals/fin-finance.md` | Confluence Checklist |
| `/legal` | `approvals/legal-compliance.md` | Confluence Checklist |
| `/ui` | `approvals/ui-designs/{ticket}.md` | Confluence Feature Vision |
| `/fe` | `implementation/{ticket}.md` | Jira comments |
| `/be` | `implementation/{ticket}.md` | Jira comments |
| `/rev` | `reviews/rev-{ticket}.md` | Jira comments |
| `/qa` | `testing/qa-{ticket}.md` | Jira comments |
| `/e2e` | `testing/e2e-{ticket}.md` | Jira comments |

**Rule**: After ANY approval → Save to Git file + Jira/Confluence → Say "/sm - please update sprint status"

### Git Conventions with Jira

- **Branch names**: `feature/LJ-123-description` (use Jira project key)
- **Commit messages**: `LJ-123: Implement token generation for password reset`
- **PR titles**: `LJ-123: Password reset via email`

### Bug Workflow

```
/bug [description] → /sm creates Bug in Jira → Investigation → /qa reproduction test → TDD Fix → /rev review → /e2e tests
```

### Team Quick Reference

| Command | Alias | Role |
|---------|-------|------|
| `/po` | `/max` | Product Owner - vision, backlog, Epics |
| `/sm` | `/luda` | Scrum Master - AC, Stories, ceremonies |
| `/arch` | `/jorge` | Solution Architect - architecture |
| `/ba` | `/anna` | Business Analyst - research |
| `/fin` | `/inga` | UK Accountant - finance |
| `/legal` | `/alex` | UK Legal - legal |
| `/ui` | `/aura` | UI Designer - design |
| `/fe` | `/finn` | Frontend Dev - React/TS |
| `/be` | `/james` | Backend Dev - Java/Spring |
| `/secops` | `/soren` | Security Engineer - security |
| `/rev` | — | Code Reviewer - quality |
| `/qa` | `/rob` | Test Case Designer - QA |
| `/e2e` | `/adam` | Test Automation - E2E |
| `/mkt` | `/apex` | Marketing - GTM |

> **Both naming conventions are supported.** Role-based commands (`/arch`, `/be`, `/fe`) are the standard. Persona aliases are team-specific names that invoke the same agent.

### Before Starting Any Feature

- [ ] Feature Vision in Confluence (/po)
- [ ] Acceptance criteria in Jira Story (/po + /ba) — behavioral only
- [ ] /arch approved architecture (MANDATORY)
- [ ] /secops approved security (MANDATORY)
- [ ] Ticket Approval Gate passed (all team members)
- [ ] /fin approved (if finance)
- [ ] /legal approved (if legal)
- [ ] /ui approved design (if frontend)

## Agent Skill Update Rules (CRITICAL)

**Skills must contain UNIVERSAL, REUSABLE knowledge** — no project/sprint references.

- **DO**: Patterns, checklists, anti-patterns, generic code examples
- **DON'T**: Sprint references, ticket IDs, project names, temporary workarounds

See `/sm` skill for complete skill update quality guidelines.

## AI Team Memory (RAG Knowledge Base)

When the `ai-team-memory` MCP server is available, agents can:
- **Search expertise**: `memory_agent_expertise(agent="jorge", query="webhook security")`
- **Search across collections**: `memory_search(query="CQRS patterns", collection="agent-knowledge")`
- **Store learnings**: `memory_store(content="...", collection="learnings", metadata='{"agent_name": "..."}')`
- **Check health**: `memory_stats()`

Use `/memory` command for interactive knowledge base access.

## General Rules

- Check web for latest documentation
- Use latest versions of tools
- Follow security best practices
- Maintain test coverage (>80% unit, >60% integration)
