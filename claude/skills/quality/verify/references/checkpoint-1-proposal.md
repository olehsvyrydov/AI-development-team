# Checkpoint 1: Proposal Document Audit

> Run after AI fills the Feature Proposal Template, BEFORE agent review round.

## 1.1 Structural Completeness Scan (23 checks)

| # | Section | Check | Min Threshold |
|---|---------|-------|---------------|
| 1 | §0 Metadata | All fields filled | No `«»` remaining |
| 2 | §0b Codebase Context | Tech stack table, patterns, references | Files must exist |
| 3 | §1 Executive Summary | WHAT/WHY/WHO/VALUE | 3+ sentences, no jargon |
| 4 | §2.1 Vision | Aspirational but specific | Not generic/reusable |
| 5 | §2.3 Problem Statement | AS-IS and TO-BE | Both filled with specifics |
| 6 | §3.1 Goals | SMART goals | 3+ goals with metric + target number |
| 7 | §3.2 Non-Goals | Explicit exclusions | 2+ with reasons |
| 8 | §4.1 Stakeholders | Real names/titles | Not generic placeholders |
| 9 | §4.2 Personas | User personas | 1+ with all 4 fields |
| 10 | §5.1 Overview | Feature description | 3+ sentences, user + system |
| 11 | §5.2 User Stories | As a/I want/So that | 3+ with testable AC |
| 12 | §5.3 User Flows | Happy + error paths | Happy + 2+ error flows |
| 13 | §5.4 Functional Reqs | FR table | 3+ with IDs + priorities |
| 14 | §5.5 NFRs | Performance/scale/etc | 3+ with numeric targets |
| 15 | §6.1-6.4 Diagrams | Mermaid diagrams | Real entities, not examples |
| 16 | §6.5 Data Model | Entity/field definitions | Real names, not field1/field2 |
| 17 | §6.6 API Contracts | Endpoints table | Real paths + schemas |
| 18 | §7 ADRs | Architecture decisions | 1+ with options table |
| 19 | §8 Roadmap | Implementation phases | 2+ phases with exit criteria |
| 20 | §9 BDD Criteria | Given/When/Then | 3+ scenarios |
| 21 | §10 Risks | Risk table | 2+ with mitigations |
| 22 | §15 Open Questions | Questions or empty | Populated or "None — all resolved" |
| 23 | §16 Glossary | Domain terms | 3+ terms defined |

**Scoring:**
- 23/23 = ✅ Ready for agent review
- 20-22 = ⚠️ Minor gaps — fix before review
- Below 20 = ❌ Incomplete — major rework needed

## 1.2 Placeholder Detection

Search for EVERY pattern. Count each occurrence. Report exact location (section + surrounding text).

**Threshold: 0 occurrences = pass. Any > 0 = FAIL.**

Patterns:
```
«    »    [Fill here]    [e.g.    e.g.,    TODO    TBD    FIXME
[Replace    field1    field2    EntityA    EntityB
topic-name    TICKET-XXX    EPIC-XXX
```

## 1.3 Consistency Cross-Check

| What | Must Match Across | How to Check |
|------|-------------------|-------------|
| Entity names | §5, §6.5, §6.6, §9 | Extract all entity names, compare sets |
| API paths | §5, §6.6, §9 | Extract all /api/... paths, compare |
| Kafka topics | §6, §6.7, §8 | Extract all topic names, compare |
| Error codes | §5.3, §6.6, §9 | Extract all error codes, compare |
| User roles | §4, §6.6, §9 | Extract all role names, compare |
| Goals → Stories | §3.1, §5.2 | Every G has at least one US |
| Stories → Scenarios | §5.2, §9 | Every US-Must has at least one SC |
| Non-goals vs scope | §3.2, §5 | Nothing in §5 contradicts §3.2 |
| NFR targets | §5.5, §9 | Performance numbers match |

## 1.4 Diagram Quality Check

| Diagram | Location | Must NOT contain |
|---------|----------|-----------------|
| System Context (C4 L1) | §6.1 | "External System 1", "Our System" |
| Container (C4 L2) | §6.2 | Generic service names |
| Data Flow | §6.3 | "Data Source", "Processing" |
| Sequence | §6.4 | "Service", "Database" without real name |
| ER Diagram | §6.5 | ENTITY_A, ENTITY_B |
| Gantt | §8.2 | "Task 1", "Task 2" |
| Review Workflow | Top | Missing agents |

## 1.5 Traceability Matrix

Build and report:

```
Goal (§3)  →  Requirement (§5.4)  →  User Story (§5.2)  →  BDD Scenario (§9)
```

Report orphaned items:
- Requirements without a goal
- Stories without a requirement
- Scenarios without a story
- Goals without any test coverage
- "Must Have" requirements without a test

**Rule: Every goal → at least 1 scenario. Every Must requirement → at least 1 test.**
