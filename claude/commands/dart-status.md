---
name: dart:status
description: "Show the project's current workflow status on demand (read-only): tickets · stages · gates · who's acting. Reuses the same deterministic, overlay-aware digest projection the hub board and the live per-turn hook use; it does NOT advance, gate, or comment — those stay explicit agent actions / MCP tools."
---

# /dart:status — show the workflow board now

A **read-only** convenience that surfaces the project's **current** workflow
status immediately: every ticket with its stage, gate states (passed / pending /
rejected), and who is acting on it.

This reuses the **same deterministic, overlay-aware projection** the hub board
and the live per-turn hook use — it adds no new data source, no new renderer, and
no new state model. It is hub-independent: the CLI reads the files directly, so it
works whether or not the hub server is running.

## What to do

1. Run the deterministic, overlay-aware digest for the current project:

   ```
   node hub/lib/digest.js "$PWD" --text
   ```

   Use `--json` instead of `--text` if you need the raw `state` object (tickets,
   gates, directives, labels) rather than the rendered board.

2. Present the board the digest reports — the tickets, their stages, the required
   gates and which are passed / pending / rejected, and the assignee or expected
   owner. This is a snapshot of "where the workflow stands now."

## Read-only contract (do NOT violate)

- This command is **read-only**. It shows status; it does **not** advance any
  ticket, set or clear any gate, post any comment, or write any project file.
- Advancing a stage, setting a gate result, or commenting stay **explicit**
  actions — performed by the responsible agent (per the `workflow-engine` gates)
  or via an explicit workflow MCP tool — never as a side effect of viewing the
  board here.
- Reading the status never consumes a directive and never marks anything seen.
