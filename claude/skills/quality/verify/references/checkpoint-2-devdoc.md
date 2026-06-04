# Checkpoint 2: Dev Feature Document Audit

> Run after Dev Feature Doc is filled, BEFORE implementation begins.

## 2.1 Proposal-to-Dev Alignment

**Only if parent proposal exists** (check §0 → Parent Proposal field).

Fetch the parent proposal and compare each pair:

| # | Proposal Section | Dev Doc Section | Check |
|---|-----------------|-----------------|-------|
| 1 | §1 Executive Summary | §1.1 Context | Same feature, no scope change |
| 2 | §3.1 Goals | §3 Done Criteria | Every goal has a "done when" |
| 3 | §3.2 Non-Goals | §1.3 Scope Boundaries | All non-goals in "Out of Scope" |
| 4 | §5.2 User Stories | §3b E2E Scenarios | Every Must story → E2E scenario |
| 5 | §5.5 NFRs | §4b NFR Targets | Same numbers carried over |
| 6 | §6 Architecture | §4.2 Component Diagram | Same services, stores, protocols |
| 7 | §6.5 Data Model | §6.5 DB Changes | Same entities, fields, relationships |
| 8 | §6.6 API Contracts | §6.6 API Contract | Same endpoints, req/response |
| 9 | §7 ADRs | §4.1 Design Approach | Decisions respected |
| 10 | §9 BDD Criteria | §3b Black-Box Specs | All scenarios + verification points |
| 11 | §13 Security | §9 Security Checklist | All security reqs carried over |

**Rule: Any drift MUST be documented in §14 (Notes & Decisions) with reason. Undocumented drift = 🔶 finding.**

## 2.2 Black-Box Test Completeness

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Every Done When has test | §3 → §3b traceability matrix |
| 2 | Happy path fully specified | 1+ SC-HP with ALL verification points |
| 3 | Error scenarios complete | Every §5.3 error flow → SC-ERR scenario |
| 4 | Security scenarios present | SC-SEC-01 (unauth) + SC-SEC-02 (unauthorized) minimum |
| 5 | Verification points observable | HTTP, DB, Kafka only — NOT internal state |
| 6 | Test environment described | §8b: containers, seed data, cleanup rules |
| 7 | Performance scenario | SC-PERF-01 with RPS + duration + percentiles |
| 8 | Scenarios independent | No ordering dependency between scenarios |

## 2.3 Implementation Step Quality

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Flow step references | §7 "Flow Step Ref" column filled for each task |
| 2 | Deliverables named | "Deliverable" column has specific file names |
| 3 | Tests specified | "Test" column describes what to verify |
| 4 | Correct ordering | No step depends on a later step |
| 5 | Phases deployable | Each phase independently deployable |
| 6 | No missing steps | Every class in §6.1 has a creation step in §7 |

**Cross-check:** Count classes in §6.1, count creation steps in §7. If classes > steps = missing steps.

## 2.4 Placeholder Detection

All patterns from CP1 PLUS:

```
ExistingService      (reference example not replaced with real name)
feature.x.           (generic metric name)
com.app.[module]     (package placeholder)
[ExistingClass]      (template leftover)
FeatureController    (generic — should be real feature name)
FeatureService       (generic — should be real feature name)
FeatureEntity        (generic — should be real feature name)
FeatureRepository    (generic — should be real feature name)
```

**Note:** `Feature*` patterns are only findings if the actual feature has a specific name that should replace "Feature". If the feature IS called "Feature", these are valid.
