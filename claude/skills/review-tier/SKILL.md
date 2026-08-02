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

**Also include the writers of any persistent field the diff reads but does not write.** Callers-and-callees follows the call graph; a defect in what a *column means* propagates along the schema instead, and reads and writes of a column are not connected by any call. A feature that only reads a column can therefore never reach, by any call-graph scoping, the code that decides what it means. Grep the entity field and the raw column name; if there is **more than one writer**, put those writers in front of the finders and treat the column's semantics as part of the blast radius.

> Measured: a version-history feature read `superseded_by`. Two writers — an ingest re-collect meaning "new revision", an operator PATCH meaning "archived duplicate" — differ in meaning and are distinguishable only in an audit payload. Five review rounds and 49 real findings never reached either writer, because a read feature calls neither. The grep takes seconds.

**`LINT_ONLY` / `SKIP` — no behaviour can change:** documentation, comments, formatting, test-only changes, generated files, dependency lockfiles with no version bumps.

State the classification and the rule that fired, so the decision is auditable.

## Step 2 — on a follow-up round, review the FIX, not the PR again

**This is the largest single saving available, and it is also better targeted.**

In a review loop, round N+1's job is not to re-read the feature. It is to answer two questions:

1. Is each finding from round N **actually fixed**? (Not "was it committed" — see `/verify-landed`.)
2. Does the fix **introduce a new defect**?

So scope the finders to `git diff <round-N-sha>..HEAD` plus the prior findings as an explicit checklist, and keep the `FULL`-tier verification depth on anything the fixes touched.

The justification is empirical, not theoretical: on a real loop, **two consecutive rounds each found that the previous round's fixes had introduced fresh defects** — including one where a fix to a data-loss path created an unbounded request loop, and one where a "safe" sweep would have destroyed operator-archived data. The freshly written fix is the riskiest code in the repository, and a full re-read buries it in noise.

## Step 2b — a churning loop is not a review problem, and must convert to an investigation

Step 5's findings-per-token detects a loop that has gone **dry**. It cannot detect one that is **churning** — a review of a design the data cannot satisfy produces real findings at a steady rate *forever*, so the metric says "keep going" indefinitely. Measured: five rounds, ~10 verified findings each, **49 of 49 real**, every round breaking the previous round's fixes. The review was working perfectly; the question was unanswerable.

Halt the loop and open an investigation — a stated question that can have a wrong answer, plus a kill condition (`research-method`) — when **any** of these fire:

1. **A verified round-N+1 finding `git blame`s to a round-N fix commit, two rounds running.** Mechanical: map each finding to the commit that introduced the defective line; if it lands inside the previous round's fixes twice consecutively, stop.
2. **Findings across two or more rounds restate one definitional question.** "What set?", "what order?", "what number?" are one question — *what is a version* — not three defects.
3. **A candidate fix must consult a side channel** — an audit payload, a log, a naming convention — to decide what a column *means*. The column's semantics are contested; no amount of reading code settles it.

The next round's budget goes to the investigation, not to finders, and its first question is about the **writers of the data**, not the feature's code. Applied to the case above, rule 1 fires at **round 3's triage** — saving rounds 3, 4 and 5.

Why a review cannot do this itself: a review verifies code against a spec it must assume is coherent. Its output vocabulary is the *finding* — local, with an implied fix — and it contains **no sentence meaning "this question has no answer in the data"**. Only an investigation can return that.

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
