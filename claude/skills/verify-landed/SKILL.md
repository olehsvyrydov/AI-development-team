---
name: verify-landed
description: "Prove that a change you just made actually exists and actually does something, before reporting it as done. Load this after any edit intended to change behaviour — a bug fix, a guard, a new refusal — and before claiming a finding is fixed, a ticket is complete, or a criterion is met. It catches the two cheapest ways to ship nothing — an edit that silently matched nothing, and a claim resting on a comment rather than on code."
---

# Verify it landed

A green build is not evidence that your change exists. **Removing nothing breaks nothing**, so a no-op edit compiles and passes every test. This skill is the short mechanical check that closes that gap.

Observed failure this exists to prevent: a fix for "a batch delete must not abandon itself after destroying part of a folder" never landed, because the string replacement targeted a literal the code expressed as a named constant. It matched nothing. The file compiled, the whole suite passed, and it was reported as fixed. It surfaced a day later only as an *unused-field* static-analysis smell — the logger added beside the catch block that was never inserted.

## The check

**1. Grep for the new code, not for a green build.**
After every behaviour-changing edit, search for the symbol, clause, or string you believe you added, and confirm the match is in the file you intended. One command. Do this even when — especially when — the build is green.

**2. Watch the new test fail without the fix.**
A test written after the fix, that passes immediately, proves nothing about the fix. Either write it first, or stash the change and see it go red. If that is impractical, at minimum assert on the *specific* new behaviour (the reported failure mode), not on a general happy path that already worked.

**3. For a fixed review finding, re-read the file at the reported line.**
Do not infer "fixed" from a commit message you wrote. The commit message is your intent; the file is the fact. When re-reporting findings as fixed, each one needs a look at the code.

**4. Name the enforcement point, not the intention.**
A criterion like "no bypass", "must be rate limited", "cannot escalate" is met by a *mechanism*. Identify the class, method, filter, or config directive that refuses the thing. If you cannot name it, the criterion is not met — however complete the feature looks from the happy path.

This is the most common gap in practice: a flag exists, a screen exists, a bootstrap sets it, and **nothing reads it**. The feature looks finished from every angle except the one it was written for.

**5. Never cite prose as evidence of a mechanism.**
A comment, a docstring, a ticket description, or a README is *someone's account* of the code, and accounts go stale or were never true. Claims must cite an implementing symbol.

Two real instances, one day apart:
- A comment explained that an earlier attempt failed *because it matched on `source_url`*. Concluding "so a pointer-based walk is safe" led to shipping a sweep that would have destroyed deliberately archived records. The actual reason it is unsafe was never in the comment: the column has **two different writers**.
- A config comment saying *"when mTLS lands"* was read as "the edge supports client certificates", and written into a tracker as delivered. No client-certificate directive existed anywhere.

When a comment states a rationale, treat it as a **hypothesis about the code** and check the code. Comments explain *why*; only symbols establish *whether*.

**6. When the claim is about data, query the data.**
A conclusion *reasoned* from code about what rows will do — which end a `LIMIT` truncates, what a walk returns, whether two columns can desync — is a hypothesis until it runs. A scratch database and four lines of SQL settle in ninety seconds what argument gets wrong across several rounds:

```bash
docker run --rm -d --name scratch -e POSTGRES_PASSWORD=scratch postgres
docker exec -i scratch psql -U postgres <<'SQL'
  -- build the smallest table that can exhibit the question, then ask it
SQL
docker rm -f scratch
```

The password is not optional — the official image refuses to start without `POSTGRES_PASSWORD` (or `POSTGRES_HOST_AUTH_METHOD=trust`), so a bare `docker run postgres` fails and the check never happens.

Observed both ways in one week, in the same file. The scratch query settled a truncation question immediately and correctly. The *argued* analysis of a two-column desync — reasoned carefully, stated to the user as safe — was refuted by a reviewer who found the case the argument had not considered. The difference was entirely whether it was executed.

The same applies to whether a test discriminates: revert the fix and watch it fail. A test written after a fix, which passes immediately, proves nothing. Measured: three integration tests "covering" a change all passed against the implementation they were written to prove wrong.

## Reporting

State what you verified and how, in one line each — "grepped `X` at `file:line`", "test fails without the change" — not "verified" as a bare adjective. If you could not verify something, say which part and why, rather than letting a green build stand in for it.

**A verification claim carries its command and the tool's own verdict, or it is not a verification.** "The whole-project test compile passes" is a claim; the command, the tool's own exit code, and its verdict line (`BUILD SUCCESSFUL`, `N tests completed, M failed`) are evidence. If the transcript does not contain the command, the check did not happen — say that instead.

Two ways this has produced a confident false report:

- A "whole-project test compile" reported green having compiled nothing, because the surfaced status belonged to a trailing `grep` — and **grep exits 0 when it matches**, so it succeeded precisely *because* it found `FAILED`. End such a chain with a predicate that is true on success (`cmd > log 2>&1 && echo PASS || echo FAIL`), never one true on failure.
- A **quality gate reported OK over a broken build**: the test task had failed, so the analysis scored the *previous* run's coverage. A gate verdict and a build verdict are independent claims. Read each step's status separately, never just the last line of a sequence.

## When a whole-project check is the only real check

Module-scoped test runs can pass while the project is broken: a shared test double that drifts from an interface it implements only fails where it is compiled. Before declaring backend work done, run the **whole-project** test-compile at least once. On one branch a single repository fake broke **six times** this way, once per signature change to the interface it implements — documentation did not stop it, and at that frequency the fix is structural (an abstract adapter or generated defaults), not another warning.
