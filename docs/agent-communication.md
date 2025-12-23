# Agent Communication Protocol

This document describes how AI Development Team agents communicate and hand off work to each other.

## Communication Principles

1. **Clear Handoffs**: Each agent produces artifacts that the next agent consumes
2. **No Assumptions**: Agents document their work explicitly
3. **Traceability**: All work links back to requirements
4. **Quality Gates**: Work doesn't proceed without meeting criteria

## Artifact Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARTIFACT FLOW                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Product Owner          Business Analyst         Solution Architect
      │                       │                        │
      ▼                       ▼                        ▼
┌───────────┐          ┌───────────┐           ┌───────────┐
│User Story │ ──────→  │ Research  │ ──────→   │    ADR    │
│   + AC    │          │  Report   │           │ + Diagrams│
└───────────┘          └───────────┘           └───────────┘
                                                      │
                              ┌────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │      Design Spec        │
                │ (API, DB, Components)   │
                └────────────┬────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
   ┌───────────┐      ┌───────────┐      ┌───────────┐
   │  Backend  │      │ Frontend  │      │   Infra   │
   │   Code    │      │   Code    │      │   Code    │
   └─────┬─────┘      └─────┬─────┘      └─────┬─────┘
         │                   │                   │
         ▼                   ▼                   ▼
   ┌───────────┐      ┌───────────┐      ┌───────────┐
   │  Review   │      │  Review   │      │  Review   │
   │ Feedback  │      │ Feedback  │      │ Feedback  │
   └─────┬─────┘      └─────┬─────┘      └─────┬─────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │   Deployed    │
                    │   Artifact    │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Documentation │
                    └───────────────┘
```

## Handoff Specifications

### Product Owner → Development Team

**Artifact**: User Story

```markdown
# Required Elements

## User Story
- Clear As a/I want/So that format
- Specific user persona
- Measurable benefit

## Acceptance Criteria
- Given/When/Then format
- Cover happy path
- Cover error cases
- Cover edge cases

## Test Cases
- Specific test scenarios
- Expected outcomes

## Priority & Estimate
- P0/P1/P2 priority
- Story points (if estimated)
```

**Quality Gate**: Story must be "Ready" (INVEST criteria met)

### Business Analyst → Solution Architect

**Artifact**: Research Report

```markdown
# Required Elements

## Market Analysis
- Competitor research
- Industry trends
- User expectations

## Requirements Validation
- Confirmed assumptions
- Identified risks
- Recommended approach

## Data Sources
- All sources documented
- URLs provided
- Recency verified
```

**Quality Gate**: All assumptions validated with sources

### Solution Architect → Developers

**Artifact**: Architecture Decision Record (ADR) + Technical Design

```markdown
# Required Elements

## ADR
- Context and problem
- Decision made
- Alternatives considered
- Consequences

## Technical Design
- C4 diagrams (as needed)
- API specification
- Data model
- Integration points

## Implementation Notes
- Technology choices
- Patterns to follow
- Pitfalls to avoid
```

**Quality Gate**: Design reviewed and approved

### Developer → Reviewer

**Artifact**: Pull Request

```markdown
# Required Elements

## PR Description
- What changed
- Why it changed
- How to test

## Code
- Implementation complete
- Tests included (TDD)
- Linting passes

## Documentation
- Code comments for complex logic
- API docs if applicable
```

**Quality Gate**:
- All tests passing
- Coverage meets threshold
- No lint errors

### Reviewer → Developer (Feedback)

**Artifact**: Review Comments

```markdown
# Feedback Types

## Blocking (🚫)
- Must fix before merge
- Includes specific fix

## Suggestion (💡)
- Improvement idea
- Not required

## Question (❓)
- Clarification needed
- Design discussion

## Praise (✅)
- Good patterns
- Learning for team
```

**Quality Gate**: All blocking issues addressed

### Developer → DevOps

**Artifact**: Merge to Main

```markdown
# Required Elements

## Code
- Reviewed and approved
- All tests passing
- Merged to main

## Configuration
- Environment variables documented
- Secrets listed (not values)
- Feature flags defined
```

**Quality Gate**: CI pipeline passes

### DevOps → QA

**Artifact**: Deployment

```markdown
# Required Elements

## Deployment Info
- Environment deployed to
- Version/commit hash
- Deployment time

## Verification
- Health check URL
- Smoke test results
- Rollback procedure
```

**Quality Gate**: Deployment successful, health checks pass

### E2E Tester → Product Owner

**Artifact**: Test Report

```markdown
# Required Elements

## Test Results
- Tests executed
- Pass/fail status
- Screenshots/videos for failures

## Coverage
- User journeys tested
- Edge cases verified
- Cross-browser results
```

**Quality Gate**: All critical paths pass

### Technical Writer → Repository

**Artifact**: Documentation

```markdown
# Required Elements

## Documentation Updates
- README updated
- API docs current
- Diagrams match code
- Changelog entry added

## Quality
- Accurate
- Current
- Accessible to audience
```

**Quality Gate**: Documentation matches implementation

## Communication Patterns

### Request-Response

Used for: Clarifications, questions, blocking issues

```
Agent A                    Agent B
   │                          │
   │    Request + Context     │
   │─────────────────────────>│
   │                          │
   │    Response + Decision   │
   │<─────────────────────────│
   │                          │
```

### Fire-and-Forget

Used for: Notifications, FYI updates

```
Agent A                    Agent B
   │                          │
   │    Notification          │
   │─────────────────────────>│
   │                          │
   │    (no response needed)  │
   │                          │
```

### Handoff

Used for: Work transitions

```
Agent A                    Agent B
   │                          │
   │    Artifact + Context    │
   │─────────────────────────>│
   │                          │
   │    Acknowledgment        │
   │<─────────────────────────│
   │                          │
   │    (Agent A exits)       │
   │                          │
```

## Escalation Protocol

When blocked, agents escalate in order:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ESCALATION PATH                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Technical Issue:
Developer → Reviewer → Solution Architect → External Help

Process Issue:
Any Agent → Scrum Master → Product Owner → Stakeholder

Security Issue:
Any Agent → SecOps Engineer → Solution Architect → External Help

Infrastructure Issue:
Any Agent → DevOps Engineer → Solution Architect → External Help
```

## Cross-Functional Collaboration

### Backend + Frontend Coordination

```
┌───────────────┐                    ┌───────────────┐
│    Backend    │                    │   Frontend    │
│   Developer   │                    │   Developer   │
└───────┬───────┘                    └───────┬───────┘
        │                                    │
        │     1. API Contract (OpenAPI)      │
        │<──────────────────────────────────>│
        │                                    │
        │     2. Mock API Available          │
        │───────────────────────────────────>│
        │                                    │
        │     3. Frontend develops           │
        │                                    │
        │     4. Real API Ready              │
        │───────────────────────────────────>│
        │                                    │
        │     5. Integration                 │
        │<──────────────────────────────────>│
        │                                    │
```

### Security Integration Points

```
Security review required at:

1. DESIGN PHASE
   └──→ SecOps reviews architecture for security concerns

2. IMPLEMENTATION PHASE
   └──→ SecOps provides security patterns

3. REVIEW PHASE
   └──→ SecOps reviews code for vulnerabilities

4. DEPLOYMENT PHASE
   └──→ SecOps verifies security configuration

5. PRODUCTION
   └──→ SecOps monitors for security events
```

## Status Communication

### Story Status Updates

Agents update story status as work progresses:

```
Not Started → In Progress → In Review → Testing → Done
     │              │             │          │        │
     │              │             │          │        │
Product Owner   Developer      Reviewer    Tester    PO
 assigns        starts          reviews   verifies  accepts
```

### Sprint Status

Daily updates tracked in SPRINT-STATUS.md:

```markdown
## Day N Progress

### Completed Today
- US-001: Backend API complete

### In Progress
- US-002: Frontend integration

### Blocked
- US-003: Waiting for API spec

### Risks
- May not complete US-004 in sprint
```

## Error Handling

When agents encounter errors:

1. **Log the Error**: Document what went wrong
2. **Assess Impact**: Determine severity and scope
3. **Notify Relevant Parties**: Alert affected agents
4. **Propose Resolution**: Suggest fix or workaround
5. **Track to Completion**: Ensure error is resolved

```markdown
## Error Report Template

### Error Description
{What happened}

### Impact
{What is affected}

### Root Cause
{Why it happened}

### Resolution
{How it was fixed}

### Prevention
{How to prevent in future}
```

## Quality Metrics

Track communication effectiveness:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Handoff quality | Zero rework due to unclear handoff | Rework hours |
| Escalation time | <4 hours for blocking issues | Time to resolution |
| Documentation accuracy | 100% match with implementation | Audit checks |
| Review turnaround | <24 hours | PR age |
| Clarification requests | Decreasing trend | Question count |
