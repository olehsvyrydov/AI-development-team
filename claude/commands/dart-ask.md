---
name: dart:ask
description: "Read-only interpretation-check over the project's knowledge: did DART understand my note about X? Reuses the same gated, scope-correct Q&A backend (knowledge/ask). Asking never writes, never consumes, and triggers no egress unless a memory overlay is already configured + enabled+healthy — the backend enforces this; the command adds no second egress path."
---

# /dart:ask <question> — interpretation-check over the project's knowledge

A **read-only** check of what DART already understands from the project's own
knowledge: *"did my note about X land? how was Y interpreted?"*. It answers over
the project's **already-visible** scope (its vault ∪ matching approved-common
notes) — the exact set the Knowledge panel shows — and never reaches another
project's notes or pending proposals.

This reuses the **same gated Q&A backend** (`knowledge/ask`). It adds **no new
path**, no second scan, and **no second egress path**: a question triggers an
external call **only** when a memory overlay is already configured AND
enabled+healthy, and the backend alone enforces that.

## What to do

1. Run the hub-independent Q&A CLI for the current project:

   ```
   node hub/lib/knowledge-qa.js "$PWD" "<question>"
   ```

   (If you prefer the hub while it is running, the same answer is available at
   `GET /api/knowledge/ask?project=<dir>&q=<question>` — it is the *same backend*.
   Do not build any other path.)

2. Present the answer **with the backend's honest grounding label verbatim**.
   Do **not** overclaim:
   - If the grounding is **filename/keyword only** (no embedder configured), say
     so plainly — it is a filename match, **not** a semantic understanding check.
   - If **nothing matched**, report the plain absence — do not invent an answer.
   - If an **external overlay** answered, label the answer as the overlay's and
     **surface the egress disclosure truthfully** (the question was sent to the
     connected memory service). The CLI prints this `Egress:` line only when a
     send actually happened — relay it as-is; never add a privacy claim of your
     own and never suppress a disclosure the backend made.

## Read-only contract (do NOT violate)

- Asking is **read-only**: it writes nothing, consumes nothing, and persists no
  answer (not even an overlay's answer) to the vault.
- It triggers **no egress** unless an overlay is already configured **and**
  enabled+healthy. The backend gates both the send and the disclosure together so
  they cannot drift — **this command must not add a second egress path** or a
  second disclosure.
- The URL contacted (when an overlay is on) comes only from the saved overlay
  config — never from a note's body or the overlay's response. Trust the
  backend's `grounding` label and `Egress:` line as the single source of truth.
