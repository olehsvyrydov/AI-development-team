# Traceability Matrix Template

## Purpose

The traceability matrix is the most powerful quality check. It traces every requirement from business goal through to test coverage, exposing gaps at every level.

## How to Build

### Step 1: Extract IDs

Scan the document and extract all IDs by type:

| ID Pattern | Source Section | Example |
|-----------|----------------|---------|
| G[N] | §3.1 Goals | G1, G2, G3 |
| FR-[NN] | §5.4 Functional Requirements | FR-01, FR-02 |
| US-[NN] | §5.2 User Stories | US-01, US-02 |
| SC-[CAT]-[NN] | §9 BDD / §3b E2E | SC-HP-01, SC-ERR-01 |

### Step 2: Map Relationships

Build the forward trace (goal → test):

| Goal (§3) | Requirement (§5.4) | User Story (§5.2) | BDD Scenario (§9/§3b) | Test File (code) |
|-----------|-------------------|-------------------|----------------------|-----------------|
| G1 | FR-01, FR-02 | US-01 | SC-HP-01 | TestClass.test1 |
| G2 | FR-03 | US-02, US-03 | SC-HP-02, SC-ERR-01 | TestClass.test2 |
| G3 | FR-04 | US-04 | SC-HP-03 | ? |

### Step 3: Find Orphans

Check each column for items that don't appear in adjacent columns:

**Forward orphans (missing downstream):**
- Goals without requirements → goal has no implementation path
- Requirements without stories → requirement won't be built
- Stories without scenarios → story won't be tested
- Scenarios without test code → scenario is aspirational only

**Backward orphans (missing upstream):**
- Requirements without a goal → why does this exist?
- Stories without a requirement → is this in scope?
- Scenarios without a story → what business need does this serve?
- Test code without a scenario → what is this testing?

### Step 4: Priority Check

For items marked **Must Have** or **Must** priority:

| Must Item | Has Forward Trace to Test | Status |
|-----------|---------------------------|--------|
| FR-01 (Must) | → US-01 → SC-HP-01 → test exists | ✅ |
| FR-02 (Must) | → US-01 → ??? | ❌ Missing scenario |
| US-03 (Must Have) | → SC-ERR-01 → test exists | ✅ |

**Rule: Every "Must" item must have a complete trace to a test. Any gap = 🔶 finding.**

## Orphan Report Format

```
ORPHANED ITEMS:

Goals without test coverage:
  - G3: "Improve performance" → no SC-PERF scenario found

Requirements without stories:
  - FR-05: "Rate limiting" → not mapped to any user story

Stories without scenarios:
  - US-04: "As a manager, I want reports" → no BDD scenario in §9

Scenarios without stories:
  - SC-EDGE-03: "Large file upload" → not traced to any user story

Must items without tests:
  - FR-02 (Must): No test coverage found
  - US-03 (Must Have): SC-ERR-01 exists but no test file found
```

## Scoring

| Metric | How to Calculate |
|--------|-----------------|
| Forward Coverage | (Items with complete trace) / (Total items) |
| Must Coverage | (Must items with complete trace) / (Total Must items) |
| Orphan Count | Total items appearing in only one column |

**Verdict:**
- Must Coverage = 100% AND Orphan Count = 0 → ✅
- Must Coverage = 100% AND Orphan Count > 0 → ⚠️
- Must Coverage < 100% → ❌
