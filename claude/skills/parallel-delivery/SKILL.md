---
name: parallel-delivery
description: How a ticket moves through multiple parallel sessions — one orchestrator authoring tickets, N workers each claiming and delivering one ticket end-to-end in an isolated workspace. Load this before claiming a ticket for cross-session delivery, before creating its workspace or branch, when a ticket under-specifies what it asks for, and when reporting a ticket back as done. Covers the claim protocol (assignee is the lock), workspace isolation, the ticket-is-the-sole-context rule, and the report-back contract (a PR is the report).
---

# Parallel delivery — one ticket, one worker, no side channel

A single session can ask its own next question. Several sessions working the same board cannot — there is no shared memory between a worker and the session that wrote the ticket, and no channel back except the tracker itself. This skill is what makes that safe: a locking convention so two workers never pick up the same ticket, an isolation convention so their work never collides on disk, and a report-back contract so "done" means something without anyone standing in a room to say so.

## Claim protocol — the assignee field is the lock

A ticket is claimed by **assigning it to yourself and moving it to In Progress in the tracker, before any work starts** — not after you're sure you can finish it. Tracker-agnostic wording: **the ticket backend's assignee field is the lock.** Whatever the project uses — a Jira assignee, a `Backlog.md` owner column, a GitHub issue assignee — that field is authoritative for "is anyone already doing this?"

- **If a ticket is already assigned, it is taken.** Pick a different one. Don't message the other worker and don't assume they stalled; a ticket sitting assigned-but-idle past what the project considers stale is a board-integrity finding (`/sm` Check 5), not something a worker resolves by quietly taking over.
- **Un-claim symmetrically.** If you stop — blocked, wrong ticket, or the ticket under-specifies what it needs (below) — unassign and move the ticket back off In Progress in the same action. A claimed ticket nobody is working is worse than an unclaimed one: it looks taken.

## Isolation — one workspace per worker

Each worker gets a **fresh clone or a `git worktree`, never a shared checkout's default branch.** Two workers editing the same working directory will silently interleave each other's uncommitted changes; a worktree or clone per ticket makes that structurally impossible instead of a discipline someone has to remember.

- Create the branch **named in the ticket** (its `Branch` field), not one you invent. Two workers inventing branch names independently is how two PRs collide on the same name or, worse, quietly target each other's commits.
- **Each worker's engine sets its own workspace's active ticket.** The active-ticket file lives at `.aidevteam/state/active-ticket.json` inside the worktree or clone, is never committed, and so cannot collide with another worker's. The commit gate hook reads the file of the workspace the session runs in.
- The workspace is disposable. Once the PR is open, nothing about the ticket's state should live only in that checkout — see the report-back contract below.

## The ticket is the only context you get

This extends the existing Ticket Creation Protocol — "a developer should be able to implement the ticket using ONLY the ticket text" — to cross-session delivery, where it stops being a nicety and becomes load-bearing. In one session, an under-specified ticket is a two-minute question to whoever is sitting there. Across sessions there is no one sitting there: the author is a different, likely-idle session, and waiting for it to notice a question is not a plan.

**A worker asks no questions back.** If the ticket under-specifies what it asks for — a missing file path, an ambiguous acceptance criterion, a verification step with no expected output — the worker does not guess and does not wait. It stops, comments on the ticket naming exactly what's missing, and un-claims per the protocol above. A ticket returned this way is more valuable than one finished on a guess: the gap is now visible and fixable, instead of shipped as an assumption nobody reviewed for.

## Report-back contract — the deliverable is the report

**The report is not a separate artifact — it is the thing you were already going to produce.** No status document, no handoff notes file, no message to the orchestrator that isn't already sitting in the tracker where the next reader will actually look. Reporting back means exactly three things, together:

1. A **PR** to the target repository's default branch, facts-only (see `pull-request` for what "ready to merge" requires).
2. A **ticket comment** with the PR URL and the local test results — the command and its own verdict, not "tests pass" as a bare claim (see `verify-landed`).
3. The **tracker transition** — move the ticket to reflect a PR is open and awaiting review; the assignee stays yours until it merges and the ticket is Done.

Anything reported only in chat is invisible to the next worker and to `/sm`'s board-integrity checks — it never happened, as far as the record is concerned.

## Review gate — always on, and never the implementer

Under the `parallel-team` preset, `CODE_REVIEWED` is in `always_required` — it fires regardless of change class, including a ticket that looks trivial. **The reviewer must be a different session or person than the implementer.** The entire premise of parallel delivery is that a worker's own blind spots get a second, independent set of eyes; a worker cannot satisfy that gate by reviewing its own diff, under any persona.

## Related

- `workflow-engine` — loads the active preset and requires `CODE_REVIEWED` before a ticket can close, and sets each workspace's active ticket for the commit gate.
- `pull-request` — running the opened PR to a mergeable state.
- `verify-landed` — what the "local test results" in a report actually have to show.
- the Ticket Creation Protocol (`scrum-master` references) — what makes a ticket self-contained in the first place; this skill extends it across sessions rather than replacing it.
