# Sprint 06 — Tickets (behavior-only)

Stories describe **WHAT, not HOW** — no file paths, function names, line numbers, or schema literals in the ACs. Each carries behavioral Given/When/Then acceptance criteria, implementers, and its gate set.

---

## ADT-234 — Rename Base → Knowledge + scope/tag model (file-based)

**Type:** Story · **Track:** full · **Implementers:** /be (scope/tag persistence, scoped add/list, cross-type match) + /fe (rename, scope segmented control, tag chips/filters, scoped add form)

**Value:** The user can split knowledge into **Common** (shared across every project on this machine) and **This project** (dedicated to the current project), tag it by stack and kind, and trust that a project recalls only its own knowledge plus common knowledge that matches its stack — never another stack's. The panel is named for what it is ("Knowledge"), and it is honest that nothing is uploaded.

### Acceptance criteria

**AC-1 — The panel is named "Knowledge."**
Given the project knowledge panel,
When it is shown,
Then it is titled "Knowledge" (not "Base") everywhere it surfaces — heading, tile label, and the inert "Manage … soon" affordance — and the empty state still invites the user to add the rules and context the team must follow.

**AC-2 — Add a note with a scope.**
Given the user adds a knowledge note,
When they choose a scope of "This project" or "Common" and save,
Then the note is persisted to the local vault with that scope recorded on the note itself, the note appears in the list under that scope, the count increments, and nothing is uploaded (the panel says so).
And when no scope is chosen, the note defaults to "This project" (the safest, least-sharing choice).

**AC-3 — Tag a note by stack and kind.**
Given the user adds or has a knowledge note,
When they tag it with one or more stacks (e.g. java, python, frontend, or "any") and a kind (pattern / style / rule / context),
Then those tags are persisted on the note and shown as chips on its row; an untagged note defaults to stack "any" and kind "context".

**AC-4 — The list filters by scope.**
Given a project with both common and project-scoped knowledge,
When the user selects the "This project" scope,
Then only this project's notes are listed; and when they select "Common", only common notes are listed, each with a live count; the scope control is absent of any fake zero.

**AC-5 — Cross-type recall: a project sees its own + common-matching-its-stack.**
Given a common note tagged stack "java", another common note tagged stack "python", and a project whose declared stack is "java",
When that project's knowledge is recalled,
Then the java-tagged common note and any "any"-tagged common note are returned together with the project's own notes, and the python-tagged common note is NOT returned.

**AC-6 — A research/no-stack project sees only stack-agnostic common knowledge.**
Given a project with no specific declared stack (stack "any"),
When its knowledge is recalled,
Then it receives only "any"-tagged common notes plus its own project notes, and no stack-specific common knowledge leaks in.

**AC-7 — Common knowledge is shared across projects without copying.**
Given a note saved as "Common" while viewing project A,
When project B (whose stack matches) views its Knowledge,
Then the common note appears in project B's Common view too, from a single shared location — it was not duplicated into each project.

**AC-8 — Honest indexing label is preserved.**
Given the knowledge list,
When no semantic embedder is configured,
Then the method line honestly states the index is by filename only (semantic recall is only claimed when an embedder is actually wired) — the rename and scope/tags add no false capability.

**AC-9 — A note's scope claim cannot escape its project (negative).**
Given a request to add a note,
When the request attempts to write outside the resolved project/common vault, or claims a scope it is not authorized to set, or carries an over-cap or non-text body,
Then the write is refused, nothing is persisted, and no path detail is leaked — the containment, no-overwrite, size-cap and write-guard protections continue to hold on the extended write.

**Gate set:** ARCH_APPROVED (hard), SECOPS_APPROVED (hard), DESIGN_APPROVED (passed — Aura §3 + Apex §3), APPROVAL_GATE (hard), CODE_REVIEWED (hard), VERIFIED (hard).

---

## ADT-235 — /kai propose-inbox with user approval

**Type:** Story · **Track:** full · **Implementers:** /be (pending propose-store, approve/reject write, audit) + /fe (propose-inbox UI, approve-as-common/project, reject)

**Value:** `/kai` can propose knowledge it noticed recurring (patterns / styles / rules from the user's work and comments) into a review inbox; the user approves it as Common or This-project, or rejects it. Nothing `/kai` proposes is ever applied automatically — the user is always the gate.

### Acceptance criteria

**AC-1 — A proposal lands in a pending inbox, not the live vault.**
Given `/kai` proposes a piece of knowledge with a suggested scope and tags,
When it is recorded,
Then it appears in the Knowledge panel's proposal inbox as "pending" with the suggested scope/tags and the evidence for why it was proposed, and it is NOT yet recalled by any project (a pending proposal is inert).

**AC-2 — Approve as Common.**
Given a pending proposal,
When the user approves it as Common and confirms its stack/kind,
Then it is written into the common vault as approved with those tags, it becomes recallable by every project whose stack matches, the inbox count ticks down, and the approval is audited (who approved, when).

**AC-3 — Approve as This project.**
Given a pending proposal,
When the user approves it as This-project,
Then it is written into the current project's vault as approved and scoped to this project, recallable only here, and the approval is audited.

**AC-4 — Reject is retained, never recalled.**
Given a pending proposal,
When the user rejects it,
Then it is marked rejected and retained for audit, removed from the pending inbox, and never recalled by any project.

**AC-5 — Nothing is auto-applied (negative — the trust contract).**
Given any `/kai` proposal,
When no user approval has occurred,
Then no project recalls it and nothing is written into a recallable vault — there is no path by which a proposal becomes live knowledge without an explicit human approval action.

**AC-6 — Proposed text is treated as untrusted.**
Given a proposal whose text contains markup or script-like content,
When it is shown in the inbox,
Then it is rendered inert (escaped, never executed) — model-authored proposal text is treated as untrusted input.

**AC-7 — The approve action's meaning is unambiguous.**
Given the user is approving a proposal,
When they choose the scope,
Then the confirming action plainly states the scope it will apply ("Approve as Common" / "Approve as This project") so an accidental click cannot silently over-share.

**AC-8 — Honest framing.**
Given the proposal inbox,
When it is shown,
Then it states that nothing is shared until the user approves, and the empty state explains `/kai` will surface recurring knowledge here for review.

**Gate set:** ARCH_APPROVED (hard), SECOPS_APPROVED (hard), DESIGN_APPROVED (passed — Aura §3.3 + Apex §3.5c), APPROVAL_GATE (hard), CODE_REVIEWED (hard), VERIFIED (hard).

---

## ADT-236 — Interpretation-check Q&A + mem0/OpenMemory adapter (follow-on slice)

**Type:** Story · **Track:** full · **Status:** follow-on — ticketed now, deferable per D-012 · **Implementers:** /be (thin adapter over a self-hosted endpoint, egress disclosure, env-only secrets) + /fe (connect-your-tool setting, the "did it understand my note?" Q&A)

**Value:** The user can connect a self-hosted semantic-memory service (mem0 / OpenMemory) by URL and **ask whether a note was interpreted correctly** — an interpretation-check Q&A over the knowledge. The local-first file default is completely unaffected when no adapter is configured.

### Acceptance criteria

**AC-1 — Connect a self-hosted memory service by URL.**
Given the user has a self-hosted semantic-memory service,
When they enter its endpoint URL in the connect setting,
Then the connection is recorded as a configuration selection only (no secret stored in project files; any credential is environment-only), and the panel honestly reflects whether an adapter is connected.

**AC-2 — Ask whether a note was interpreted correctly.**
Given an adapter is connected and a knowledge note exists,
When the user asks "did it understand my note?" (the interpretation check),
Then the adapter returns how the note was understood and the panel shows it, so the user can confirm their intent was captured — and this is presented as the adapter's answer, not a fabricated one.

**AC-3 — Local-first default is unaffected (negative).**
Given no adapter is configured,
When the user uses Knowledge (add, scope, tag, list, recall, propose-inbox),
Then everything works exactly as in ADT-234/235 with no network call and no egress — the adapter is purely additive.

**AC-4 — Egress is disclosed.**
Given an adapter is connected,
When the user is about to send knowledge content to it,
Then the surface discloses that content will be sent to the configured external endpoint (egress is never silent), consistent with the "nothing is uploaded by default" honesty.

**AC-5 — Secrets are environment-only (negative).**
Given an adapter requiring a credential,
When the connection is configured,
Then no secret is written to any project file or the vault — credentials are read from the environment only, and a missing credential degrades gracefully to "not connected" rather than failing loudly with secret detail.

**Gate set:** ARCH_APPROVED (hard), SECOPS_APPROVED (hard — egress + external endpoint), DESIGN_APPROVED (soft — fires when scoped), APPROVAL_GATE (hard), CODE_REVIEWED (hard), VERIFIED (hard).
