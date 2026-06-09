# Sprint 06 — Knowledge Scopes

**Status tracker** · Last updated: 2026-06-09 · Scrum Master: Luda (`/sm`, holding `/po` authority)

## Sprint goal

Turn the project's flat, project-only "Base" panel into a scoped **Knowledge** surface: knowledge carries a **scope** (common vs project) and **tags** (stack / kind) so a Java project recalls java + common — never python-specific; `/kai` can **propose** knowledge that the user **approves** (propose → approve inbox, never auto-applied); and the user can later **ask whether a note was interpreted correctly** via an optional self-hosted semantic-memory adapter.

This chunk implements the **file-based default** (zero-config local markdown vault) per **D-009**: scoped/tagged knowledge as markdown front-matter, the `/kai` propose-inbox over the file store, plus **thin optional adapter hooks** — NOT a custom memory engine. Obsidian (vault UI) and self-hosted mem0 / OpenMemory (semantic recall + interpretation-check Q&A) are connected by URL/endpoint and never required.

## Binding prior decisions

- **D-009 (sprint-03)** — knowledge base = zero-config local markdown vault by default; heavy lifting delegated to existing OSS local tools (Obsidian, self-hosted mem0/OpenMemory) as OPTIONAL overlays connected by URL/endpoint, never required. This chunk = file-based scopes/tags + the `/kai` propose-inbox on the file default + thin optional adapter hooks.
- **D-003 (sprint-03)** — KB add = paste-a-note (title + markdown body), add-only, honest about indexing. Sprint-06 extends the same add path with scope + tags.
- **Research (Anna, Q2)** — the scope+tag taxonomy: `scope` (common/global, project) + `project_id` + `stack`/`kind`/`status` dimensions; the cross-type matching rule; the `/kai` propose → approve flow. ACs K1–K6.
- **Design (Aura §3, Apex §3)** — recorded as `DESIGN_APPROVED` (the rename, scope segmented control, tag filters, scoped add flow, `/kai` propose-inbox UI, local-first honesty copy).

## Tickets

| ID | Title | Track | Gate set | Implementers | Status |
|----|-------|-------|----------|--------------|--------|
| ADT-234 | Rename Base→Knowledge + scope/tag model (file-based) | full | ARCH (hard), SECOPS (hard), DESIGN (passed), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | /be (backend) + /fe (UI) | Backlog — gates pending |
| ADT-235 | /kai propose-inbox with user approval | full | ARCH (hard), SECOPS (hard), DESIGN (passed), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | /be (backend) + /fe (UI) | Backlog — gates pending |
| ADT-236 | Interpretation-check Q&A + mem0/OpenMemory adapter (follow-on slice) | full | ARCH (hard), SECOPS (hard), DESIGN (soft), APPROVAL_GATE, CODE_REVIEWED, VERIFIED | /be (backend) + /fe (UI) | Backlog — follow-on, gates pending |

ADT-236 is ticketed but marked a **follow-on slice**: it may be deferred if ADT-234/235 fill the chunk. It carries the only egress surface (an external service URL) and so keeps a HARD SECOPS gate of its own.

## Gate plan (per workflow-engine, `solo` preset)

All three are **significant** change-class → **`full`** track. Triggers:

- **ARCH_APPROVED (hard)** — all three: new metadata model on KB docs (schema_change), new scoped list/add + propose-store + approve write (new logic spanning files), and (236) a new adapter boundary / external endpoint (cross_boundary, public_api).
- **SECOPS_APPROVED (hard, safety-override)** — all three are write/trust/egress surfaces:
  - 234 — KB writes carry scope/tag metadata that **authorizes recall reach** (a mis-scoped "common" item leaks across projects); path containment + content caps inherited from ADT-223 must hold; scope is server-validated.
  - 235 — `/kai`-proposed content is **model-authored, untrusted**; it must never be auto-applied (pending store inert until explicit human approval); approval write is scope-authorized and audited.
  - 236 — adds an **external service URL (egress)**: adapter egress must be disclosed, secrets env-only, local-first default unaffected when no adapter is configured, no PII leaves the machine silently.
- **DESIGN_APPROVED** — passed for 234/235 by `/ui` referencing Aura §3 + Apex §3 (the rename, scope control, tag filters, scoped add, propose-inbox UI, honesty copy). Soft/pending for 236 (the adapter UI is a thin connect-setting; design fires when scoped).
- **APPROVAL_GATE (hard)** — `/verify` pre-implementation readiness audit, pending on all three.
- **CODE_REVIEWED (hard)** — `/rev`, pending on all three.
- **VERIFIED (hard)** — `/verify` final completeness audit, pending on all three.

Nothing is pre-passed except `DESIGN_APPROVED` (234/235) which records the completed Aura+Apex design work.

## Folder layout

- `DECISION_LOG.md` — sprint decisions (D-010 … D-014).
- `approvals/` — `/arch`, `/secops`, `/ui` approval docs (written when those gates run).
- `implementation/` — `/be` + `/fe` implementation notes per ticket.
- `reviews/` — `/rev` reviews.
- `testing/` — `/qa` + `/e2e` reports.

## Next action

`/arch` (Jorge) — architecture for ADT-234 (the scope/tag front-matter model + the recall/match rule + where scoped/common knowledge lives on disk per D-013), then `/secops` (Soren) — the HARD security gate.
