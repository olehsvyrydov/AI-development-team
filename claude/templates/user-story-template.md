# US-{ID}: {Story Title}

## Story Information

| Field | Value |
|-------|-------|
| ID | US-{ID} |
| Title | {title} |
| Priority | P0 (Must Have) / P1 (Should Have) / P2 (Could Have) |
| Story Points | {estimate} |
| Sprint | {sprint_number} |
| Epic | {epic_name} |
| Owner | {assignee} |
| Status | Not Started / In Progress / In Review / Done |

## User Story

**As a** {user type/persona}
**I want** {goal/action}
**So that** {benefit/value}

## Description

{Additional context, background, or clarification about the story}

## Acceptance Criteria

### Scenario 1: {Happy path scenario name}

- **Given** {initial context/state}
- **When** {action is performed}
- **Then** {expected outcome}
- **And** {additional outcome}

### Scenario 2: {Alternative scenario name}

- **Given** {initial context/state}
- **When** {action is performed}
- **Then** {expected outcome}

### Scenario 3: {Edge case scenario name}

- **Given** {initial context/state}
- **When** {action is performed}
- **Then** {expected outcome}

### Scenario 4: {Error scenario name}

- **Given** {initial context/state}
- **When** {invalid action is performed}
- **Then** {error handling behavior}

## Test Cases

### Unit Tests
- [ ] TC-{ID}.1: {Test description for scenario 1}
- [ ] TC-{ID}.2: {Test description for scenario 2}
- [ ] TC-{ID}.3: {Test description for edge case}

### Integration Tests
- [ ] TC-{ID}.4: {Integration test description}
- [ ] TC-{ID}.5: {API test description}

### E2E Tests
- [ ] TC-{ID}.6: {Full flow test description}

## Technical Notes

### API Changes
- `POST /api/v1/{endpoint}` - {description}
- `GET /api/v1/{endpoint}` - {description}

### Database Changes
- New table: `{table_name}`
- New column: `{table}.{column}`
- Migration: `V{NNN}__{description}.sql`

### Third-party Integrations
- {Service}: {how it's used}

### Architecture Considerations
- {consideration}

## UI/UX Notes

### Mockups
- {Link to Figma/design file}

### User Flow
1. User navigates to {page}
2. User performs {action}
3. System shows {response}

## Dependencies

### Depends On
- US-{ID}: {story title}
- {External dependency}

### Blocks
- US-{ID}: {story title}

## Out of Scope

- {What this story explicitly does NOT include}
- {Future enhancement to be addressed separately}

## Questions / Open Items

- [ ] {Question that needs clarification}
- [ ] {Decision that needs to be made}

## Definition of Done

- [ ] Code complete and self-reviewed
- [ ] Unit tests written and passing (>80% coverage)
- [ ] Integration tests written and passing
- [ ] Code reviewed and approved
- [ ] No blocking bugs
- [ ] Documentation updated (if applicable)
- [ ] Deployed to staging environment
- [ ] All acceptance criteria verified
- [ ] Product Owner approved

## Notes

{Any additional notes, decisions made during development, or lessons learned}
