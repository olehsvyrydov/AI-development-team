# ADT-223 — Knowledge Base input

**Track:** full · **Stage:** ready · **Assignee:** /arch (next gate)
**Implementers:** /be (new KB-write endpoint) · /fe (add-note form)
**Gates:** ARCH_APPROVED (hard) · **SECOPS_APPROVED (HARD)** · DESIGN_APPROVED · APPROVAL_GATE · CODE_REVIEWED · VERIFIED

## Story

As a person running a project from the Cockpit, I want the Knowledge Base to accept new information, so that I can add a document/note to the project's Base and have something to work with — and have it persisted, listed, and counted, with an honest statement of how it is indexed and a safe write that can't escape the project.

## Behavioral acceptance criteria

- [ ] From the Base view I can **add a note/document** by entering a title and markdown body and submitting it.
- [ ] After I submit, the note is **persisted** into the project's knowledge base location (the same place the Base read already scans), and on the next read it appears in the **list** and the Base **count** increases by one.
- [ ] The list entry's **indexing label is honest**: it states the method actually used (e.g. listed/searched by the existing scan), and only claims semantic indexing if an embedder is genuinely configured for the project.
- [ ] The new note is stored as a **new file** — an existing knowledge-base file is **never overwritten** by this action.
- [ ] A submitted title/body that would resolve **outside the knowledge-base directory** (path traversal, an absolute path, or a symlink escape) is **rejected** and nothing is written.
- [ ] Content that exceeds the **size limit** or is not an allowed **text/markdown type** is **rejected** with a clear message; nothing is written.
- [ ] The write **requires the loopback write-guard** and is **refused without it** (consistent with every other Cockpit mutation).
- [ ] The note body is rendered back as **escaped/inert text** in the list/preview — it is never executed or injected as raw HTML.
- [ ] The form shows clear **validating / saving / saved / error** states; a rejected submission leaves the Base list unchanged.

## Negatives that MUST be proven (not assumed)

- [ ] Traversal / absolute / symlink-escape target → rejected, no file written.
- [ ] Existing filename collision → no overwrite (new safe name or rejection, never clobber).
- [ ] Oversize or disallowed content → rejected.
- [ ] Request without the write-guard → refused.

## Out of scope (PO decision — see DECISION_LOG D-003)

- **File upload** (binary/arbitrary files). MVP accepts a **pasted note** (title + markdown body) only. File upload is a later enhancement with its own security review.
- Editing or deleting existing Base entries. MVP is add-only.
- Triggering a re-index / embedding job. MVP relies on the existing read/index method and is honest about it.

## Notes for /arch and /secops

This is the **only new backend** in the sprint. The write endpoint must: take a sanitized server-derived filename from a slug (never a client path), realpath-check containment **before** writing, write atomically with no overwrite, enforce a markdown/text allowlist + size cap, and sit behind the existing loopback write-guard. /secops is a **HARD** gate — design the controls and the negative tests up front.
