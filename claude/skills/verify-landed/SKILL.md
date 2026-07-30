---
name: verify-landed
description: Prove that a change you just made actually exists and actually does something, before reporting it as done. Load this after any edit intended to change behaviour — a bug fix, a guard, a new refusal — and before claiming a finding is fixed, a ticket is complete, or a criterion is met. It catches the two cheapest ways to ship nothing: an edit that silently matched nothing, and a claim resting on a comment rather than on code.
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

## Reporting

State what you verified and how, in one line each — "grepped `X` at `file:line`", "test fails without the change" — not "verified" as a bare adjective. If you could not verify something, say which part and why, rather than letting a green build stand in for it.

## When a whole-project check is the only real check

Module-scoped test runs can pass while the project is broken: a shared test double that drifts from an interface it implements only fails where it is compiled. Before declaring backend work done, run the **whole-project** test-compile at least once. Two separate breakages on one branch came from exactly this — a repository fake in one module missing a method added in another.
