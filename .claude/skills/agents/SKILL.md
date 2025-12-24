---
name: agents
description: List all available AI Development Team agents and their specializations. Use /agents to see core agents, extended skills, and their relationships.
user_invocable: true
---

# AI Development Team - Agent Directory

## Usage

Invoke with `/agents` to see all available agents and skills.

## Core Agents (15)

These are your primary agents for software development:

### Development Team

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **backend-developer** | Spring Boot 4, Java 21+, WebFlux, JPA | Backend APIs, microservices, database |
| **frontend-developer** | React 19, TypeScript 5.7, Zustand, TanStack | UI components, state management, SPA |
| **devops-engineer** | Kubernetes, GKE, Helm, CI/CD, Docker | Deployment, infrastructure, pipelines |
| **solution-architect** | System design, CQRS, Saga, Event Sourcing | Architecture decisions, patterns, ADRs |
| **mlops-engineer** | Spring AI, LLM integration, Gemini, OpenAI | AI features, prompt engineering, ML ops |

### Quality Assurance Team

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **backend-tester** | JUnit 6, Mockito, Testcontainers, StepVerifier | Java unit/integration tests, TDD |
| **frontend-tester** | Jest, React Testing Library, MSW | React component tests, hook tests |
| **e2e-tester** | Playwright, cross-browser, visual testing | End-to-end tests, user flows |
| **backend-reviewer** | Checkstyle, SpotBugs, SonarQube | Java code review, quality gates |
| **frontend-reviewer** | ESLint, Prettier, accessibility | React/TS code review, a11y |

### Security & Documentation

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **secops-engineer** | Spring Security, JWT, OAuth2, OWASP | Auth, security headers, compliance |
| **technical-writer** | C4 diagrams, ADRs, API docs, Mermaid | Documentation, changelogs, README |

### Product & Process

| Agent | Expertise | Trigger When |
|-------|-----------|--------------|
| **business-analyst** | SWOT, market research, requirements | Competitive analysis, BRDs |
| **product-owner** | User stories, backlog, prioritization | Sprint planning, acceptance criteria |
| **scrum-master** | Agile ceremonies, velocity, retrospectives | Sprint management, blockers |

---

## Extended Skills (9)

Specialized skills that extend core agents:

### Frontend Extensions (extend frontend-developer)

| Skill | Specialization |
|-------|----------------|
| **angular-developer** | Angular 21, Signals, NgRx SignalStore, zoneless |
| **vue-developer** | Vue 3, Composition API, Pinia, Nuxt 3 |
| **flutter-developer** | Flutter 3.27, Dart 3.6, Riverpod, cross-platform |

### Backend Extensions (extend backend-developer)

| Skill | Specialization |
|-------|----------------|
| **spring-kafka-integration** | Kafka producers/consumers, Reactor Kafka, DLT |
| **quarkus-developer** | Quarkus 3.17, native builds, Panache, GraalVM |
| **fastapi-developer** | FastAPI, Python async, Pydantic, SQLAlchemy |

### DevOps Extensions (extend devops-engineer)

| Skill | Specialization |
|-------|----------------|
| **terraform-specialist** | Terraform 1.10, GCP provider, modules, state |

### Testing Extensions (extend e2e-tester)

| Skill | Specialization |
|-------|----------------|
| **cucumber-bdd** | Cucumber 7, Gherkin, BDD, living documentation |

### Architecture Extensions (extend solution-architect)

| Skill | Specialization |
|-------|----------------|
| **graphql-developer** | Apollo Server/Federation, DataLoader, subscriptions |

---

## How Skills Work Together

1. **Core agents** are triggered by matching task descriptions
2. **Extended skills** are invoked automatically when specialized work is detected
3. **Related Skills** sections enable cross-agent collaboration

### Example Flow

```
Task: "Build Angular dashboard with Kafka real-time updates"
         ↓
[frontend-developer] → triggers → [angular-developer]
         ↓
[backend-developer] → triggers → [spring-kafka-integration]
         ↓
[solution-architect] for architecture review
```

---

## Quick Reference

```
/agents              - Show this directory
/JAVA_SPRING_BOOT    - Java/Spring patterns (alias)
/DEVOPS_KUBERNETES   - K8s deployment patterns (alias)
```

## Skill Locations

- **User-level** (global): `~/.claude/skills/`
- **Project-level**: `.claude/skills/`

Project skills override user skills with the same name.
