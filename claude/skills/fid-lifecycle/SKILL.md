---
name: fid-lifecycle
description: Run the Backlog → Investigation → FID → Jira-epic → tickets → Done lifecycle without leaving orphans or two sources of truth. Load this when taking an item off the Backlog, when an investigation concludes, when creating a FID or its epic, when adding a ticket that belongs to an existing FID, and when marking a ticket or a FID complete. It owns the bookkeeping rules — what to remove, what to link, what to update in the same change.
---

# FID lifecycle — the bookkeeping that keeps the board honest

The pipeline is **Backlog → Investigation (if needed) → FID (epic) → Jira tickets → To Do → Implementation → review → approval → merge.** This skill is not the process; it is the hygiene that stops the process rotting into several disagreeing records.

One principle underneath all of it: **every fact lives in exactly one place, and moving work forward means moving the record, not copying it.**

## Taking an item off the Backlog

The Backlog holds **problems, not solutions**, including the founder's own running notes. When you pick one up:

1. Decide, explicitly, which path it takes: straight to a ticket (small and obvious), investigation (approach or cost unclear), or **parked with a stated trigger** — and if parked, name the condition that would un-park it. "Not scheduled" with no trigger is how an item sits for weeks while the thing it was waiting for was itself abandoned.
2. **When the FID exists, delete the Backlog item.** Do not leave both. A Backlog entry whose work has moved on is litter, and worse, it is a second description of the same thing that will drift. Replace it with nothing — the FID is now the record. If the Backlog page held context the FID does not, move that context into the FID *first*, then delete.
3. If an investigation concludes "do not build", the Backlog item still goes — but record the decision and its reasoning on the FID or investigation page. A killed idea is a valuable artifact; an undeleted Backlog entry is not.

## Creating a FID and its epic

A FID is the Confluence page (behavioural intent, invariants, **kill conditions**). Its Jira epic is the tracking mirror.

- **Create one Jira epic per FID, titled so the numbering corresponds** — `FID-7 — <short name>`. The correspondence must be visible in the title; do not rely on people remembering which epic is which FID.
- **Link both ways:** the FID page links to the epic; the epic's description links to the FID page. Either one found alone should lead to the other.
- **Every ticket carved from the FID takes that epic as its parent.** No orphan tickets — a ticket without an epic is invisible to the FID's progress and will be forgotten or duplicated.

## The ticket registry on the FID page

The FID page carries a table of its tickets: key, summary, status, and one line on what it covers. This is the **human** view — it reads as a plan.

**Jira is authoritative for status.** When the two disagree, Jira wins and the page is wrong; fix the page. Never resolve a disagreement by editing Jira to match the page.

Keep the registry current at three moments, no others: a ticket is created, a ticket's status changes materially (To Do → In Progress → Done), and a ticket is added or removed from the FID's scope. Updating it at every small event guarantees it stops being updated at all.

## A new ticket that belongs to an existing FID

This is the rule most easily skipped, and skipping it is how a FID reports "done" while related work is still open:

1. Parent it to the FID's epic.
2. Add it to the FID's registry table.
3. If it exists *because* something was discovered during implementation — a review finding, a gap, a regression — say so in one line on the ticket. That sentence is what a retrospective can actually use later.

If a discovered ticket does **not** belong to this FID, do not attach it out of convenience. Put it on the Backlog, and let it take the normal path.

## Marking a ticket fully implemented

"Fully implemented" means the acceptance criteria are met — **all of them, including the negative and edge cases**, which is precisely where this project has repeatedly shipped half a ticket. Before moving a ticket to Done:

- For each negative criterion, name the **symbol that enforces it** — the filter, guard, or check. A criterion like "no bypass" or "cannot escalate" is met by a mechanism, not by an intention. If you cannot name it, the ticket is not Done. (See `verify-landed`.)
- Confirm the change actually landed and is exercised by a test that fails without it.
- If a criterion is consciously **not** being met, say so on the ticket and get that accepted — a narrowed criterion honestly recorded is fine; a silently unmet one is not.

An audit of 30 tickets on 2026-07-30 found 13 with at least one unmet criterion, nearly always the negative case, several of which had been treated as complete because the feature existed. That is the failure this section exists to prevent.

## Closing a FID

Close it when every ticket is Done or explicitly deferred with a reason. On the page, record:

- what shipped, and what was cut and why (a deferral with its evidence is worth more than silence);
- whether a **kill condition fired** — if the investigation's own kill condition triggered and the work was cancelled by design, that is a success of the process and should be written as one;
- the date. A closed FID is a historical record from that moment; anything later belongs elsewhere.

**A tracker whose last update predates the work it describes is worse than no tracker, because it is believed.** If a FID stops being current, stamp it historical rather than leaving it to be read as live.

## What to automate, and what not to

Most of the above is mechanical and could be tooling: creating the epic with a corresponding title, parenting tickets, syncing the registry from Jira, flagging orphan tickets and stale registries. Worth building once the conventions have been used enough to know their real shape.

**Do not automate the judgement:** which path an item takes, whether a criterion is met, whether a deferral is acceptable. Those are the parts that carry the value, and a tool that appears to decide them will be trusted to.
