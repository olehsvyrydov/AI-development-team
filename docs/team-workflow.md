# Team Workflow Guide

This document describes how the AI Development Team agents work together to deliver software.

## Overview

The AI Development Team is a collection of 15 specialized agents that simulate a full software development organization. Each agent has deep expertise in their domain and follows established best practices.

## Team Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TEAM ORGANIZATION                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                              MANAGEMENT LAYER
           ┌─────────────────────┬─────────────────────┐
           │                     │                     │
    ┌──────▼──────┐      ┌───────▼───────┐     ┌──────▼──────┐
    │   PRODUCT   │      │    SCRUM      │     │  BUSINESS   │
    │    OWNER    │      │   MASTER      │     │  ANALYST    │
    └──────┬──────┘      └───────┬───────┘     └──────┬──────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 │
                        ARCHITECTURE LAYER
                      ┌──────────▼──────────┐
                      │     SOLUTION        │
                      │    ARCHITECT        │
                      └──────────┬──────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    BACKEND     │    │    FRONTEND     │    │     DEVOPS      │
│   DEVELOPER    │    │   DEVELOPER     │    │    ENGINEER     │
└───────┬────────┘    └────────┬────────┘    └────────┬────────┘
        │                      │                      │
        │   QUALITY LAYER      │                      │
        ▼                      ▼                      ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│    BACKEND    │      │   FRONTEND    │      │    SECOPS     │
│   REVIEWER    │      │   REVIEWER    │      │   ENGINEER    │
└───────┬───────┘      └───────┬───────┘      └───────────────┘
        │                      │
        ▼                      ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│    BACKEND    │      │   FRONTEND    │      │     E2E       │
│    TESTER     │      │    TESTER     │      │    TESTER     │
└───────────────┘      └───────────────┘      └───────────────┘

                              SPECIALIZED LAYER
              ┌───────────────────┬───────────────────┐
              │                   │                   │
       ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
       │    MLOPS    │     │  TECHNICAL  │     │     ...     │
       │  ENGINEER   │     │   WRITER    │     │   (more)    │
       └─────────────┘     └─────────────┘     └─────────────┘
```

## Development Lifecycle

### 1. Planning Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLANNING WORKFLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    User Request
         │
         ▼
┌─────────────────┐
│  PRODUCT OWNER  │ ──→ Creates user stories with acceptance criteria
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ BUSINESS ANALYST│ ──→ Researches requirements, validates assumptions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   SOLUTION      │ ──→ Designs architecture, creates ADRs
│   ARCHITECT     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SCRUM MASTER   │ ──→ Plans sprint, assigns stories
└─────────────────┘
```

**Agents Involved**:
- **Product Owner**: Defines what to build
- **Business Analyst**: Validates requirements with research
- **Solution Architect**: Designs how to build it
- **Scrum Master**: Organizes the work

### 2. Implementation Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

         Design Spec (from Architect)
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌───────┐      ┌───────┐      ┌───────┐
│Backend│      │Frontend│     │DevOps │
│  Dev  │      │  Dev   │     │ Eng   │
└───┬───┘      └───┬───┘      └───┬───┘
    │              │              │
    │  (TDD: Tests First)         │
    ▼              ▼              ▼
┌───────┐      ┌───────┐      ┌───────┐
│Backend│      │Frontend│     │SecOps │
│Tester │      │ Tester │     │  Eng  │
└───────┘      └───────┘      └───────┘
```

**TDD Workflow** (for each developer):
1. Write failing tests
2. Run tests (verify they fail)
3. Implement minimum code to pass
4. Run tests (verify they pass)
5. Refactor
6. Repeat

### 3. Quality Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          QUALITY WORKFLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

         Code Complete
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌─────────┐       ┌─────────┐
│ Backend │       │Frontend │
│ Reviewer│       │Reviewer │
└────┬────┘       └────┬────┘
     │                 │
     │    (Code Style, Security, Best Practices)
     │                 │
     └────────┬────────┘
              │
              ▼
┌──────────────────────┐
│     E2E TESTER       │ ──→ Critical path testing
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   SECOPS ENGINEER    │ ──→ Security review
└──────────────────────┘
```

### 4. Deployment Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT WORKFLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

         Code Approved
              │
              ▼
┌──────────────────────┐
│    DEVOPS ENGINEER   │ ──→ CI/CD pipeline, infrastructure
└──────────┬───────────┘
           │
           ├──→ Build ──→ Test ──→ Deploy to Staging
           │
           ▼
┌──────────────────────┐
│     E2E TESTER       │ ──→ Staging verification
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   PRODUCT OWNER      │ ──→ Acceptance verification
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    DEVOPS ENGINEER   │ ──→ Deploy to Production
└──────────────────────┘
```

### 5. Documentation Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DOCUMENTATION WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

         After Every Change
              │
              ▼
┌──────────────────────┐
│   TECHNICAL WRITER   │
└──────────┬───────────┘
           │
           ├──→ Update README
           ├──→ Update API docs
           ├──→ Update architecture diagrams
           ├──→ Add changelog entry
           └──→ Update onboarding guides
```

## Sprint Workflow

### Sprint Planning

1. **Product Owner** prioritizes backlog
2. **Scrum Master** calculates team capacity
3. **Solution Architect** reviews technical approach
4. **Team** commits to sprint backlog

### Daily Work

1. **Scrum Master** facilitates standup
2. **Developers** implement using TDD
3. **Testers** verify implementations
4. **Reviewers** provide feedback
5. **DevOps** monitors infrastructure
6. **Technical Writer** updates docs

### Sprint Review

1. **Developers** demo completed work
2. **Product Owner** accepts/rejects stories
3. **Scrum Master** updates velocity

### Sprint Retrospective

1. **Scrum Master** facilitates
2. **Team** identifies improvements
3. **Actions** assigned and tracked

## Feature Development Flow

For a typical feature, here's the complete agent interaction:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE FEATURE DEVELOPMENT FLOW                          │
└──────────────────────────────────────────────────────────────────────────────┘

1. REQUIREMENT
   │
   └──→ Product Owner creates user story
         └──→ Business Analyst validates with research
               └──→ Solution Architect designs approach

2. PLANNING
   │
   └──→ Scrum Master adds to sprint
         └──→ Team estimates story points

3. DEVELOPMENT (Parallel where possible)
   │
   ├──→ Backend Developer (TDD)
   │     └──→ Backend Tester (additional tests)
   │
   ├──→ Frontend Developer (TDD)
   │     └──→ Frontend Tester (additional tests)
   │
   └──→ DevOps Engineer (infrastructure if needed)

4. REVIEW (After code complete)
   │
   ├──→ Backend Reviewer (code quality)
   ├──→ Frontend Reviewer (code quality)
   └──→ SecOps Engineer (security review)

5. INTEGRATION TESTING
   │
   └──→ E2E Tester (critical paths)

6. DEPLOYMENT
   │
   └──→ DevOps Engineer
         └──→ Staging → Production

7. DOCUMENTATION
   │
   └──→ Technical Writer
         └──→ All docs updated

8. ACCEPTANCE
   │
   └──→ Product Owner verifies
         └──→ Story marked complete
```

## When to Use Each Agent

| Agent | When to Use |
|-------|-------------|
| Product Owner | Defining features, prioritizing, acceptance |
| Scrum Master | Sprint management, blockers, retrospectives |
| Business Analyst | Market research, requirements validation |
| Solution Architect | Design decisions, technology choices |
| Backend Developer | API development, business logic |
| Frontend Developer | UI development, mobile apps |
| Backend Reviewer | Java/Spring code review |
| Frontend Reviewer | React/TypeScript code review |
| Backend Tester | JUnit, integration tests |
| Frontend Tester | Jest, RTL tests |
| E2E Tester | Playwright, Detox tests |
| DevOps Engineer | Infrastructure, CI/CD |
| SecOps Engineer | Security implementation, audits |
| MLOps Engineer | AI features, LLM integration |
| Technical Writer | Documentation, diagrams |

## Best Practices

### Always Follow TDD

```
1. Write test (RED)
2. Run test - it fails
3. Write code (GREEN)
4. Run test - it passes
5. Refactor (REFACTOR)
6. Commit
```

### Always Review Before Merge

Every code change goes through:
1. Automated checks (linting, tests)
2. Peer review (appropriate reviewer)
3. Security review (for sensitive changes)

### Always Document

After every significant change:
1. Update relevant README
2. Update API documentation
3. Add changelog entry
4. Update diagrams if architecture changed

### Always Test at Multiple Levels

```
         /\
        /E2E\        <- Critical paths only (10%)
       /------\
      / Integ. \     <- Integration points (20%)
     /----------\
    /   Unit     \   <- Comprehensive coverage (70%)
   /--------------\
```

## Metrics to Track

| Metric | Target | Owner |
|--------|--------|-------|
| Sprint velocity | Stable | Scrum Master |
| Test coverage | >80% | Testers |
| Code review turnaround | <24h | Reviewers |
| Deployment frequency | Daily | DevOps |
| Lead time | <1 week | All |
| Documentation currency | 100% | Technical Writer |
