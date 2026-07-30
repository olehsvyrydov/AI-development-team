# Board integrity checks, and retrospection that produces something

Two jobs, both continuous, both cheap. Neither needs a ceremony.

Works with whatever the project uses as its tracker of record — Jira, a `Backlog.md`, GitHub issues. Where this file says "tracker", read the project's own.

---

# Part 1 — The integrity checks

Run these when asked for board status, before planning, at the end of an epic, and any time work has been moving fast. Report **counts and specific items**, never a verdict.

## Check 1 — orphan work items

Tickets with no parent epic, and epics with no tickets.

An orphan gets forgotten or, worse, duplicated by someone who could not find it. An empty epic usually means the tickets were created somewhere else and the epic is now a lie about scope.

*Report:* every orphan by key, and for each, the epic it most likely belongs to.

**Separate "orphaned" from "standalone by design" before reporting, or this check cries wolf.** On a board where most work hangs off epics, a parentless ticket is a signal — but three kinds of item are legitimately parentless, and counting them as orphans discredits the whole report:

- a **roadmap placeholder** parked for later (it has no epic because it has no scope yet)
- a **spike or PoC** that exists to answer a question, not to deliver an epic's slice
- a **standalone fix** whose whole scope is the ticket

The distinguishing question is not "does it have a parent?" but **"is there an epic this belongs to, whose scope is now wrong because this is outside it?"** If no epic is made a lie by its absence, it is standalone, not orphaned. Report the two groups separately and give the count for each.

## Check 2 — the plan disagrees with the tracker

Where a planning document (a design doc, an epic page, a roadmap) carries a list of work items with statuses, compare it against the tracker.

**The tracker is authoritative for status. Always.** When they disagree the document is wrong — fix the document. Never resolve it by editing the tracker to match the document, which is how a plan quietly rewrites reality.

*Report:* each divergence, and update the document in the same pass.

## Check 3 — Backlog items whose work has moved on

A Backlog entry whose design doc or epic already exists is litter, and worse, it is a second description that will drift from the first.

*Report:* delete them, after confirming no context exists only there. If some does, move it forward first.

## Check 4 — Done without the negative criteria

**The highest-value check, and the one nothing else performs.**

For each ticket closed since the last pass, read its acceptance criteria and ask, per criterion: *which symbol implements this?* Happy paths are usually built. The criteria that go missing are the negatives — "must refuse", "cannot bypass", "never widens", "is rate limited", "warns when…".

A criterion is met by a **mechanism**, not by an intention. If nobody can name the class, method, filter or config directive that enforces it, the ticket is not Done, whatever the board says.

*Watch for the specific failure shape:* a flag or setting that is modelled, surfaced in the UI, set by some path — and **read by nothing**. The feature looks complete from every angle except the one the ticket was written about. Real instances: a password-rotation flag with a screen and a bootstrap that nothing enforced; a per-workspace provider setting that was persisted, displayed, and ignored at execution time.

*Report:* ticket, criterion, and whether an enforcing symbol exists. Reopen or split; do not silently accept.

**Record the passes, not just the failures.** When a criterion *is* enforced, name the symbol that enforces it in the report. This costs one line and buys two things: the next audit does not re-derive it, and a later change that removes the guard becomes visible as a contradiction against a written claim rather than a silent regression. A check that only ever emits bad news also trains its reader to expect noise, and gets skipped.

The strongest form a passing criterion can take is a **guard that refuses at the boundary** rather than a branch that handles a case — a startup check that throws on an unsafe configuration, or a compose step that returns before an advisory input is even consulted. Where you find that shape, say so: it is the difference between a rule that is enforced and one that is merely implemented.

## Check 5 — parked without a trigger

An item marked "not scheduled" or "later" with no stated condition for revisiting is **blocked**, not queued, and nobody knows it.

*Report:* each one, and either attach the trigger or move it to a status that admits it is blocked. Real instance: a story sat "not scheduled pending the benchmark phase" while the benchmark phase had itself been abandoned — so its trigger could never fire and nothing said so.

## Check 6 — epics claiming completion over open work

An epic marked Done with open children, or whose children are Done while its own acceptance was never checked.

**Expect this to be the highest-yield check on any board that closes epics by milestone.** The pattern is not carelessness: the epic's *headline* shipped, so it gets closed, while the follow-ups it spawned — the tech-debt tickets, the hardening, the deferred slice — stay open and now hang off a parent that says the work is finished. Nobody is lying and nothing looks wrong from the epic view; the open children are simply invisible from where anyone looks.

*Report:* each such epic with its open children by key, and ask the one question that resolves it — **is the epic's own acceptance met, or was it closed because the demo worked?** If the former, the children belong to a new epic or stand alone; if the latter, the epic is not Done. Do not resolve it by closing the children.

---

# Part 2 — Retrospection that produces something

## Capture continuously; distil periodically

**Do not run retrospectives as a scheduled ceremony that reconstructs the past from memory.** By the time a fortnightly retro arrives, the specific, useful details are gone and what remains is platitude — "communication could be better", "we should test more".

Instead:

**At every merge, ask one question and append the answer to a running lessons page:**

> *What did we learn here that would change how we work?*

One or two sentences. Often the answer is "nothing", and that is a fine answer — skip it. When there is something, it is worth more at that moment than at any later point, because the mechanism is still in your hands.

**Then, per epic or per month, read the accumulated page and decide** which entries become durable: a rule in the project's instructions, a check in this file, a new skill, or a change to an existing one. That reading *is* the retrospective, and it takes minutes because the raw material is already written.

## What a good captured lesson looks like

A lesson is durable when it names the **mechanism**, not the mistake. Compare:

- ✗ "I should be more careful with edits." — unusable; nothing changes.
- ✓ "A string replacement that matches nothing is invisible: the file still compiles and all tests still pass, because removing nothing breaks nothing. So after a behaviour-changing edit, grep for the new code — a green build is not evidence it landed."

The second names *why* the failure is invisible, which is what lets someone else avoid it. Real lessons from one project, all captured mid-work, none of which a scheduled retro would have recovered:

- A no-op edit is invisible to compilers and tests.
- A comment explaining *why* something failed is a hypothesis about the code, not evidence — claims about mechanisms must cite an implementing symbol.
- Module-scoped test runs pass while the project is broken; a shared test double drifts silently.
- Acceptance criteria fail asymmetrically: happy paths ship, guards do not.

## Feed the retrospective with evidence, not recollection

Where the process is instrumented, read the instruments:

- **Review cost and yield** — findings per round, tokens per round. Decay tells you a loop has gone dry; no decay means stopping was premature.
- **Defect escape rate** — defects found after merge, by the surface that found them (user, CI, review). A defect a user found is a gap in the checks, and worth naming as one.
- **Where fixes introduced fresh defects.** If a follow-up review round keeps finding regressions in the previous round's fixes, that is a signal about how fixes are made, not about the reviewer.
- **Rework** — tickets reopened, and why.

## Anti-patterns

- **Velocity and burndown on a one- or two-person team.** They measure nothing at that size and invite optimising the metric.
- **Retro actions with no owner and no mechanism.** "We'll be more careful" is not an action; "add this check to the Done definition" is.
- **A retrospective that produces only praise.** If nothing would change, do not hold it — write "nothing to change" and move on. That is a legitimate and honest outcome, and it keeps the ritual from becoming decoration.
- **Blaming the person when the process allowed it.** Every lesson above is about a mechanism that made a mistake invisible. Fix the visibility.
