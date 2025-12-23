# CLAUDE.md - AI Development Team Framework

This file provides context to Claude Code when working in this repository.

## Project Purpose

This is a **reusable AI Development Team framework** - a collection of specialized Claude Code skills that simulate a complete software development team. Each skill file represents a team member with deep domain expertise.

**Key Goals:**
- Provide consistent, expert-level AI assistance across any software project
- Enforce best practices (TDD, code quality, security, documentation)
- Enable skill reuse across multiple projects
- Allow easy extension with new technologies and agents

## Repository Overview

**Key Directories:**
- `skills/` - AI agent skill definitions organized by category
- `templates/` - Reusable document templates (sprint, user-story, ADR, code-review)
- `docs/` - Documentation (workflows, communication protocols, extension guide)

**Skill Categories:**
- `skills/management/` - Product Owner, Scrum Master, Business Analyst
- `skills/architecture/` - Solution Architect
- `skills/development/` - Backend Developer, Frontend Developer
- `skills/quality/` - Reviewers (backend, frontend) and Testers (backend, frontend, e2e)
- `skills/operations/` - DevOps, SecOps, MLOps Engineers
- `skills/specialized/` - Technical Writer

## The 15 AI Agents

| Category | Agent | Skill File | Purpose |
|----------|-------|------------|---------|
| **Management** | Product Owner | `management/product-owner.md` | User stories, backlog, acceptance criteria |
| | Scrum Master | `management/scrum-master.md` | Sprint planning, retrospectives |
| | Business Analyst | `management/business-analyst.md` | Market research, requirements |
| **Architecture** | Solution Architect | `architecture/solution-architect.md` | System design, ADRs, patterns |
| **Development** | Backend Developer | `development/backend-developer.md` | Spring Boot, Java, APIs |
| | Frontend Developer | `development/frontend-developer.md` | React, Next.js, React Native |
| **Quality** | Backend Reviewer | `quality/backend-reviewer/main.md` | Java code review, quality |
| | Frontend Reviewer | `quality/frontend-reviewer/main.md` | TypeScript review, a11y |
| | Backend Tester | `quality/backend-tester.md` | JUnit, Testcontainers |
| | Frontend Tester | `quality/frontend-tester.md` | Jest, React Testing Library |
| | E2E Tester | `quality/e2e-tester.md` | Playwright, Detox |
| **Operations** | DevOps Engineer | `operations/devops-engineer.md` | Terraform, Kubernetes, CI/CD |
| | SecOps Engineer | `operations/secops-engineer.md` | Security, OWASP, auth |
| | MLOps Engineer | `operations/mlops-engineer.md` | AI/ML, LLM integration |
| **Specialized** | Technical Writer | `specialized/technical-writer.md` | Documentation, diagrams |

## Technology Stack (Default Expertise)

### Backend
- Java 25+, Spring Boot 4.0+, Spring WebFlux
- R2DBC, PostgreSQL, Redis
- Spring Security, Spring AI
- JUnit 6, Mockito, Testcontainers

### Frontend
- React 19, Next.js 15, TypeScript 5
- React Native, Expo SDK 52
- TailwindCSS, shadcn/ui
- Jest, React Testing Library, Playwright

### Infrastructure
- Terraform 1.6+, GKE Autopilot
- Helm 3, GitHub Actions
- Cloud SQL, Memorystore Redis

## Working With This Repository

### Understanding Skills

Each skill file has this structure:
1. **Trigger**: When to activate the skill
2. **Context**: Persona and experience level
3. **Expertise**: Technical knowledge base
4. **Standards**: Quality requirements
5. **Templates**: Ready-to-use code/documents
6. **Checklist**: Pre-completion verification
7. **Anti-Patterns**: Mistakes to avoid

### Invoking Agents

Agents can be invoked:
1. **Explicitly**: `/backend-developer implement user auth`
2. **Auto-detected**: Claude recognizes task type
3. **Chained**: Multiple agents on complex tasks

### Key Principles

All agents enforce:
- **TDD**: Tests before implementation
- **Coverage**: >80% unit, >60% integration
- **Security**: OWASP Top 10 prevention
- **Documentation**: Always current

## Development Guidelines

### When Improving This Repository

1. **Extending existing skills**: Add new technologies to existing agent files
   - See `docs/skill-extension-guide.md` for detailed instructions
   - Example: Add Angular to frontend-developer, Quarkus to backend-developer

2. **Creating new agents**: Add new skill files in appropriate category
   - Follow the skill template structure
   - Research latest best practices via web search
   - Include practical, copy-paste ready templates

3. **Updating technologies**: Keep version references current
   - Check official documentation for latest versions
   - Update templates to match current APIs

### Quality Standards for Skills

- Include specific version numbers (e.g., "Spring Boot 4.0+")
- Provide complete, working code templates
- Define measurable standards (">80% coverage")
- Link to authoritative sources
- Test templates before committing

### Documentation Updates

When making changes:
1. Update relevant skill file(s)
2. Update README.md if adding/removing agents
3. Update this CLAUDE.md if structure changes
4. Commit with descriptive message

## How to Extend Skills

### Adding a New Technology

To add Angular to frontend-developer:
1. Open `skills/development/frontend-developer.md`
2. Add new section under "## Expertise"
3. Include: framework, patterns, best practices, templates
4. Add related testing patterns
5. Commit changes

To add Quarkus to backend-developer:
1. Open `skills/development/backend-developer.md`
2. Add section for Quarkus framework
3. Include: extensions, patterns, testing
4. Add configuration examples
5. Commit changes

See `docs/skill-extension-guide.md` for complete instructions.

### Adding a New Agent

1. Identify the category (management, development, quality, etc.)
2. Create skill file with full template structure
3. Research current best practices
4. Add to README.md agent table
5. Commit changes

## Current State

- **Version**: 1.0.0
- **Release Date**: 2025-12-23
- **Agents**: 15 complete
- **Templates**: 4 available
- **Documentation**: Complete

## Roadmap / Future Improvements

Potential enhancements:
- Add more technology alternatives (Vue.js, Quarkus, Go, Rust)
- Create domain-specific agents (fintech, healthcare, e-commerce)
- Add integration testing between agents
- Create skill composition patterns
- Add multi-language support

## Commands Reference

When working in this repo:
- `git status` - Check changes
- `git diff` - Review modifications
- `git add -A && git commit -m "message"` - Commit changes
- `git push origin main` - Push to GitHub

## Notes for Claude

When starting a new session in this directory:
1. This is a skill/agent repository, not a software application
2. Primary task is maintaining and extending skill definitions
3. All skills should be technology-agnostic (no project-specific references)
4. Templates should be complete and copy-paste ready
5. Keep version references current with latest stable releases
6. Follow the established skill file structure

When asked to add new features:
1. First determine if it's a new agent or extension to existing
2. Research current best practices via web search
3. Follow the skill template structure
4. Update README.md and relevant documentation
5. Test that templates are syntactically correct

---

*Framework created: 2025-12-23*
*Repository: AI Development Team*
