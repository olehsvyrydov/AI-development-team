---
name: review-tier
description: Decide HOW MUCH code review a change needs, and scope it, before spending a multi-agent review on it. Load this whenever you are about to run /code-review, ultracode, or any review workflow — and on every follow-up round of a review loop. It classifies the diff's risk deterministically, picks the review shape (full / targeted / fix-scoped / lint-only / skip), and refuses to spend review budget on a branch whose free gates are not green. Use it to keep the review's defect-finding power while cutting its cost.
---

# Review tiering — spend the review where it earns its cost

A full multi-agent review is the strongest defect-finder available and the most expensive thing in the pipeline (measured: ~34 agents / ~1.8M tokens / ~16 min per round). Running it on everything is unaffordable; running it on nothing loses the only check that catches **cross-cutting consequences invisible at the edit site**. This skill decides how much to spend.

## Step 0 — free gates first, always

**Refuse to start a review until these are green.** They cost nothing and a review of a broken branch is pure waste (this has happened: a full round ran against a branch whose test compile was broken).

- the project's build + full test task
- static-analysis / quality gate, if the project has one
- frontend typecheck and production build, if there is a frontend

Read the tool's **own exit code**, not a pipeline's, and read the output file rather than a summary. `cmd > log; echo $?` inside a longer chain reports the last command's status, not the one you care about.

## Step 1 — classify the diff (deterministic, never judgement)

Look at **changed paths and changed symbols**, not at your opinion of the change. Any single match promotes the whole diff to `FULL`.

**`FULL` — a high-consequence surface is touched:**

- destructive operations: `delete`, `purge`, `drop`, `truncate`, `cascade`, `revoke`, bulk/batch removal
- authn/authz: login, session, token, password, capability, role, permission, grant, share
- schema migrations, and any FK with `ON DELETE`
- money and cost: pricing, billing, budget, quota, rate limit
- external egress: which provider/host/endpoint data is sent to
- a port/interface contract in a shared core module
- transaction boundaries, concurrency, locking

**`TARGETED` — ordinary feature code.** Scope finders to the diff **plus its callers and callees**. This caveat is load-bearing: the review's value is finding the break two files away, so a diff-only scope degrades it into a linter.

**`LINT_ONLY` / `SKIP` — no behaviour can change:** documentation, comments, formatting, test-only changes, generated files, dependency lockfiles with no version bumps.

State the classification and the rule that fired, so the decision is auditable.

## Step 2 — on a follow-up round, review the FIX, not the PR again

**This is the largest single saving available, and it is also better targeted.**

In a review loop, round N+1's job is not to re-read the feature. It is to answer two questions:

1. Is each finding from round N **actually fixed**? (Not "was it committed" — see `/verify-landed`.)
2. Does the fix **introduce a new defect**?

So scope the finders to `git diff <round-N-sha>..HEAD` plus the prior findings as an explicit checklist, and keep the `FULL`-tier verification depth on anything the fixes touched.

The justification is empirical, not theoretical: on a real loop, **two consecutive rounds each found that the previous round's fixes had introduced fresh defects** — including one where a fix to a data-loss path created an unbounded request loop, and one where a "safe" sweep would have destroyed operator-archived data. The freshly written fix is the riskiest code in the repository, and a full re-read buries it in noise.

## Step 3 — spend verifiers in proportion to the claim

- **3 adversarial verifiers** — data-loss, security, authorization, money. A false negative here is expensive.
- **1 verifier** — correctness claims on ordinary paths.
- **0 verifiers** — cleanup, naming, test-coverage suggestions. Report them as advisory.

## Step 4 — consider model tiering (test it before trusting it)

Finder sweeps are a **recall** problem (cast wide, tolerate noise); verification is a **precision** problem. So a cheap fast model for finders plus a strong model for verification is the obvious shape — but treat it as a hypothesis until measured on a diff whose true findings you already know. Measure recall against that known set; if a cheap finder pool recovers most of them, adopt it. If it does not, you have learned something rather than assumed it.

## Step 5 — instrument, then use the numbers to stop

Record per round: agents, tokens, wall-clock, candidates, verified findings. **Findings per 100k tokens** is the stop signal — a loop that has gone dry shows decay. Without it, "stop after N rounds" is a budget guess, and it can stop a loop that is still producing (observed: rounds 3 and 4 both produced 10 verified findings, no decay).

**Never truncate silently.** If a cap drops coverage — top-N findings, sampled files, skipped dimensions — say so in the report. Silence reads as "clean".

## What this skill must never do

- **Never let a model decide `SKIP`.** The classifier is paths and patterns. If the thing that decides "no review needed" is the same judgement that would have found the bug, a confident misclassification silently removes the check.
- **Never scope away the blast radius.** `TARGETED` includes callers and callees. If you cannot cheaply determine them, promote to `FULL`.
- **Never treat a clean report from a failed run as clean.** If finder or verifier agents errored (API failures, timeouts), the result is an outage, not a verdict. Observed: a round returned "no findings survived verification" when 22 of 25 agents had died — re-run it.
