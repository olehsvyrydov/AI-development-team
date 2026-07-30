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

## Check 5 — parked without a trigger

An item marked "not scheduled" or "later" with no stated condition for revisiting is **blocked**, not queued, and nobody knows it.

*Report:* each one, and either attach the trigger or move it to a status that admits it is blocked. Real instance: a story sat "not scheduled pending the benchmark phase" while the benchmark phase had itself been abandoned — so its trigger could never fire and nothing said so.

## Check 6 — epics claiming completion over open work

An epic marked Done with open children, or whose children are Done while its own acceptance was never checked.

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
