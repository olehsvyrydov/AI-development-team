# Decision Log - Sprint 03 (Interactive Cockpit)

**Last Updated:** 2026-06-08

## Decisions

| ID | Decision | Category | Rationale | Approved By | Date |
|----|----------|----------|-----------|-------------|------|
| D-001 | **Workflow-edit MVP = reorder + gate-rule edit (trigger/owner/refusal) + preset switch**, persisted to the overlay only. Not free-form authoring of new tracks/stages/gates. Stage-owner editing limited to **gate** owners; per-stage non-gate owners deferred pending /arch confirmation the overlay supports them. | Product | The existing control-plane routes (`track/reorder`, `gate/trigger`, `preset`) already cover exactly this surface, overlay-only and guarded; reusing them gives a real, persisted, safe edit with no new write path. Free-form authoring would need new validation, schema, and a new write surface for marginal early value. | /po | 2026-06-08 |
| D-002 | **Tasks board advance = explicit action/menu, not free drag-and-drop.** Detail view supports read + add comment, gate approve/reject, and shows status + gate/trigger labels. | Product | Action-based advance is accessible, conflict-safe, and maps 1:1 to the existing `ticket/advance` route with `expectedRev`/409. Drag-to-advance adds DnD a11y and optimistic-state complexity for no new capability; defer as enhancement. The legacy board already proved the modal/comments/gate flows — port them. | /po | 2026-06-08 |
| D-003 | **KB input MVP = paste-a-note (title + markdown body), not file upload.** Add-only (no edit/delete), honest about indexing (no embedding job triggered). | Product | A pasted markdown note is the smallest change that gives "something to work with," writes one contained file, and keeps the new (HARD-gated) attack surface minimal. File upload multiplies the threat surface (binary types, larger sizes, MIME sniffing) and earns its own later security review. | /po | 2026-06-08 |
| D-004 | **All three tickets run the `full` track** (significant change-class) under the `solo` preset; **SECOPS is HARD for ADT-223** (new endpoint writing external input to files) and a **review** for ADT-221/222 (no new file-write surface). | Process | Per workflow-engine: browser-driven mutations with a new public route + external-input file write trigger ARCH + (for 223) SECOPS-hard; the existing guarded/CAS/overlay-only routes for 221/222 still warrant a security confirmation of safe Cockpit usage. Security safety-override forbids downsizing 223. | /po + /sm | 2026-06-08 |
| D-005 | **Conflict semantics for every Cockpit mutation = optimistic write with `expectedRev`; on 409 re-sync to server state and let the user retry** — never silent overwrite. | Process | The hub already enforces atomic CAS; the UI must honor it consistently so concurrent CLI-agent and browser edits don't clobber each other. Makes the negative ("stale write rejected") a first-class, testable AC across 221/222/223. | /po + /sm | 2026-06-08 |

## Categories

- **Architecture**: System design, patterns, technology choices
- **Finance**: Payment models, pricing, tax implications
- **Legal**: Compliance, GDPR, contracts, terms
- **Product**: Features, UX, scope, priorities
- **Process**: Team workflow, tooling, practices
