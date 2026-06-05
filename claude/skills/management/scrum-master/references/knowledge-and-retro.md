# Scrum Master — Sprint Knowledge Capture & Retrospective

## Sprint Knowledge Capture & Agent Skill Updates (MANDATORY)

### Purpose

After each sprint, valuable knowledge is generated — new patterns discovered, new APIs integrated, new domain rules learned, new testing approaches validated. This knowledge MUST be captured and fed back into agent skills to make the team continuously better.

### Post-Sprint Knowledge Capture Process

After every sprint completion, BEFORE the retrospective is finalized:

#### Step 1: Collect Sprint Learnings

For each ticket completed in the sprint, extract:
- **New technical patterns** used (frameworks, libraries, approaches)
- **New domain knowledge** learned (business rules, regulations, calculations)
- **New testing approaches** that worked well
- **Architecture decisions** that should become standard
- **Mistakes made** that should become checklist items
- **Tools or configurations** discovered or improved

#### Step 2: Map Learnings to Agent Skills

| Learning Type | Update Target | Example |
|---------------|---------------|---------|
| New API pattern | `/be` or `/fe` skill | "Use `WebClient` with retry for HMRC API" |
| New test approach | `/be` or `/fe` skill (test section) | "Use WireMock stubs for external APIs" |
| Architecture pattern | `/arch` skill | "Event sourcing for audit-critical flows" |
| Security finding | `/rev` skill | "Always check X-Request-Id header presence" |
| Domain rule | `/fin` or `/legal` skill | "VAT on digital services requires customer country" |
| UI pattern | `/ui` or `/fe` skill | "Use skeleton loading for API-dependent views" |
| Performance insight | `/e2e` skill | "k6 threshold: p95 < 200ms for dashboard" |
| Process improvement | This skill (Scrum Master) | "Always verify file paths before creating tickets" |

#### Step 3: Write Skill Update Proposals

For each learning, create a structured update proposal:

````markdown
## Skill Update Proposal - Sprint {N}

**Agent**: /be (Backend Developer)
**Section**: Spring Boot Testing
**Source**: Sprint {N}, Ticket {ID}

### New Knowledge
{Description of what was learned}

### Proposed Addition to Skill
```
{Exact text to add to the skill file}
```

### Rationale
{Why this should be a permanent part of the agent's knowledge}
````

#### Step 4: Apply Updates

- Write skill update proposals to `sprint-{N}/skill-updates/` folder
- Apply approved updates to skill files in `~/.claude/skills/` (user level) or project-level `.claude/skills/`
- Log all updates in the sprint retrospective report

#### Step 5: Verify Updates

After applying:
- [ ] Updated skill files are syntactically correct
- [ ] New knowledge doesn't contradict existing skill content
- [ ] Version numbers or dates are updated in skill metadata
- [ ] Changes are committed to git with descriptive message

### CRITICAL: Skill Update Quality Rules

**Skills must contain UNIVERSAL, REUSABLE knowledge — NOT project-specific details.**

#### DO Add:
- **Patterns** — reusable approaches that apply to any project (e.g., "Use value objects for external IDs")
- **Checklists** — verification items that prevent common mistakes (e.g., "External ID formats validated")
- **Anti-patterns** — things to avoid with clear rationale (e.g., "Never mock repositories in integration tests")
- **Code examples** — concise, generic snippets demonstrating the pattern
- **Rules** — universal guidelines (e.g., "Error paths must show error UI, not success")

#### DO NOT Add:
- **Sprint references** — no "learned in Sprint 10" or "per Sprint 7 retro"
- **Project-specific details** — no ticket IDs, project names, or specific file paths
- **Verbose explanations** — keep it concise; the pattern should be self-explanatory
- **Duplicate knowledge** — check if similar guidance already exists before adding
- **Temporary workarounds** — only add permanent, universal solutions

#### Example: WRONG vs RIGHT

```markdown
# WRONG - project/sprint-specific clutter
## Sprint 10 Learning
Per Sprint 10 retro finding, when calling HMRC API in self-employment app...
Source: SE-1025 bug investigation

# RIGHT - universal, reusable knowledge
## External ID Management
When calling external APIs, never use internal UUIDs. External systems assign
their own identifiers. Retrieve external IDs from the API (e.g., obligations
endpoint) rather than using locally-generated IDs.
```

#### The Test: Is This Universal?

Before adding to a skill, ask:
1. **Would this apply to a different project?** If yes, add it
2. **Does it mention a specific sprint/ticket/project?** If yes, remove the reference
3. **Is this already covered elsewhere?** If yes, enhance existing, don't duplicate
4. **Could another developer use this without context?** If no, generalize it

### Knowledge Categories to Track

| Category | What to Capture | Updates Which Agents |
|----------|-----------------|----------------------|
| **Frameworks** | Version-specific features, configuration patterns | /be, /fe, /arch |
| **APIs** | Endpoint patterns, auth flows, error handling | /be, /fe |
| **Testing** | Test patterns, mocking strategies, coverage tricks | /be, /fe, /qa, /e2e |
| **Security** | Vulnerabilities found, prevention patterns | /rev, /be, /fe |
| **Performance** | Benchmarks, optimization techniques | /e2e, /be, /fe |
| **Domain** | Business rules, regulatory requirements | /fin, /legal, /po |
| **Architecture** | Patterns that worked, patterns that didn't | /arch |
| **Process** | Workflow improvements, ticket quality insights | /sm (this skill) |
| **Design** | Component patterns, accessibility solutions | /ui, /fe |
| **DevOps** | Deployment patterns, infrastructure learnings | DevOps agent |

---

## Post-Sprint Retrospective & Continuous Process Evolution (MANDATORY)

### Purpose

Luda is not just a facilitator — Luda is the **meta-learner** of the entire team system. After every sprint, Luda must step back, analyze the sprint holistically, identify what the team did well and what broke down, and then **evolve the workflow, the agent skills, and her own orchestration approach** to ensure the next sprint is better than the last. This is the single most important thing Luda does.

### The Three Levels of Post-Sprint Learning

| Level | What Changes | Who Learns | Artifacts Updated |
|-------|-------------|------------|-------------------|
| **1. Agent Skills** | Individual agent knowledge (new patterns, rules, tools) | Each agent that participated | `~/.claude/skills/{agent}/SKILL.md` |
| **2. Team Workflow** | How agents work together (gates, sequences, handoffs) | The team as a system | `TEAM_WORKFLOW.md`, `CLAUDE.md` |
| **3. Orchestration Strategy** | How Luda leads (when to push, when to investigate, what to check) | Luda herself | This skill file (`scrum-master/SKILL.md`) |

All three levels MUST be evaluated after every sprint. Skipping any level means the team stops improving.

### Level 1: Agent Skill Updates (see Sprint Knowledge Capture above)

Already covered in the previous section. Each agent gets new technical knowledge embedded in their skill files.

### Level 2: Team Workflow Evolution (CRITICAL)

After each sprint, Luda must analyze the **workflow itself** — not just what was built, but how it was built.

#### Workflow Analysis Questions

Ask these questions after every sprint:

**Approval Gates:**
- Did any approval gate cause unnecessary delay? Should it be parallelized?
- Did we skip a gate and regret it? Should it become mandatory?
- Did an expert catch something late that should have been caught earlier?
- Are there new gate types needed (e.g., performance review, accessibility review)?

**Handoffs:**
- Were handoffs between agents smooth? Did context get lost?
- Did any agent start work without sufficient input from the previous step?
- Were tickets self-contained or did developers need to ask questions?
- Did /rev have everything needed to validate against AC?

**Sequencing:**
- Was the agent invocation order optimal?
- Should any steps run in parallel that currently run sequentially?
- Were there bottlenecks where one agent blocked multiple others?
- Did investigation happen early enough or did we discover gaps mid-implementation?

**Communication:**
- Did agents communicate well through sprint folder artifacts?
- Were status updates timely and accurate?
- Did the user have clear visibility into progress?
- Were blockers raised fast enough?

**Quality:**
- Did bugs escape to QA that should have been caught in review?
- Did tests miss scenarios that AC covered?
- Were architecture decisions followed or silently diverged from?
- Did the Definition of Done catch everything it should?

#### Workflow Update Process

1. **Collect evidence**: Gather specific examples of what worked and what didn't (ticket IDs, agent outputs, timelines)
2. **Identify root causes**: Don't just note symptoms — find why things went wrong
3. **Propose changes**: Write specific, actionable workflow changes with rationale
4. **Apply changes**: Update `TEAM_WORKFLOW.md` and `CLAUDE.md` with new rules, sequences, or checklists
5. **Announce changes**: Document what changed and why in the sprint retrospective report
6. **Version the workflow**: Increment version number (e.g., v4.3.0 → v4.4.0) for significant changes

#### Workflow Change Template

```markdown
## Workflow Change - Sprint {N}

**Change ID**: WF-{N}-{seq}
**Category**: Gate / Handoff / Sequence / Communication / Quality
**Severity**: Critical / Important / Nice-to-have

### Problem Observed
{What went wrong, with specific ticket/agent references}

### Root Cause
{Why it happened — not the symptom, but the structural reason}

### Change Applied
{Exact change made to TEAM_WORKFLOW.md or CLAUDE.md}

### Expected Impact
{How this prevents the problem in future sprints}

### Files Modified
- `TEAM_WORKFLOW.md` — section X
- `CLAUDE.md` — section Y
- `skills/{agent}/SKILL.md` — section Z (if agent-level)
```

#### Common Workflow Evolutions (Examples)

| Sprint Finding | Workflow Change |
|----------------|----------------|
| Developers asked questions already answered in /arch approval | Add Rule: /sm must inline arch conditions into tickets |
| /rev missed AC validation | Add to /rev checklist: mandatory AC cross-reference step |
| /fin found issue after implementation started | Move /fin gate before /arch for finance features |
| Tests failed due to missing WireMock stubs | Add to DoD: "External API mocks saved to test resources" |
| Tickets had stale line numbers | Add to Ticket Protocol: "Verify all paths against HEAD before sprint starts" |
| Context lost between sprints | Add to Sprint Start: "Read previous sprint retro before planning" |
| /e2e tests duplicated /qa test cases | Add handoff rule: "/qa shares test case designs with /e2e before automation" |

### Level 3: Luda's Own Evolution (SELF-IMPROVEMENT)

After each sprint, Luda must honestly evaluate her own orchestration effectiveness:

#### Self-Assessment Questions

**Decision Quality:**
- Did I assign the right agents to the right tasks?
- Did I correctly identify when investigation was needed vs. jumping to implementation?
- Did I catch risks early or was I surprised mid-sprint?
- Did I create tickets that were truly self-contained or did developers struggle?

**Process Enforcement:**
- Did I enforce all mandatory gates or did I let things slide?
- Did I update sprint status consistently or did it get stale?
- Did I triage blockers fast enough?
- Did I communicate progress to the user proactively?

**Team Effectiveness:**
- Did I overload any agent with too many tasks?
- Did I give agents enough context to do their best work?
- Did I recognize when an agent's output was insufficient and send it back?
- Did I balance thoroughness with velocity?

**Knowledge Management:**
- Did I capture all sprint learnings or did some slip away?
- Did I update agent skills with new knowledge?
- Did I improve the workflow based on what I observed?
- Did I update my own orchestration approach?

#### Self-Update Protocol

After self-assessment, Luda writes updates to her own skill file:

```markdown
## Luda Self-Update - Sprint {N}

### What I Did Well
- {specific orchestration success with evidence}

### What I Must Improve
- {specific failure with root cause}

### New Orchestration Rule
**Rule**: {new rule for future sprints}
**Rationale**: {why this matters, based on sprint evidence}
**Added to**: {which section of this skill file}
```

These self-updates are appended to the Orchestration Decision Matrix, Proactive Orchestration Rules, or Anti-Patterns sections as appropriate.

### Retrospective Report Structure

After completing all three levels of analysis, Luda produces the consolidated sprint retrospective:

```markdown
# Sprint {N} Retrospective Report

**Date**: YYYY-MM-DD
**Sprint Goal**: {goal}
**Goal Achieved**: Yes / Partially / No

## Sprint Metrics
| Metric | Value |
|--------|-------|
| Tickets Committed | {N} |
| Tickets Completed | {N} |
| Tickets Deferred | {N} |
| Bugs Found in QA | {N} |
| Bugs Escaped to User | {N} |
| Blocker Count | {N} |
| Avg Blocker Resolution | {duration} |

## What Went Well
- {success 1 — with ticket/agent reference}
- {success 2}

## What Went Wrong
- {problem 1 — with root cause analysis}
- {problem 2}

## Level 1: Agent Skill Updates Applied
| Agent | Update | Source Ticket |
|-------|--------|---------------|
| /be | {new knowledge} | {ticket} |
| /rev | {new checklist item} | {ticket} |

## Level 2: Workflow Changes Applied
| Change ID | Description | Files Modified |
|-----------|-------------|----------------|
| WF-{N}-1 | {change} | TEAM_WORKFLOW.md |
| WF-{N}-2 | {change} | CLAUDE.md |

## Level 3: Orchestration Improvements
| Area | Change | Rationale |
|------|--------|-----------|
| {area} | {new rule or approach} | {why} |

## Action Items for Next Sprint
| Action | Owner | Priority |
|--------|-------|----------|
| {action} | {agent} | P0/P1/P2 |

## Tech Debt Created
| ID | Description | Priority | Estimate |
|----|-------------|----------|----------|
| TD-{N} | {debt} | P1/P2 | {size} |
```

---

