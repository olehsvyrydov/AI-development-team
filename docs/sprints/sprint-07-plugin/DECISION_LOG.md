# Decision Log - Sprint 07 (DART as a Claude Code plugin)

**Last Updated:** 2026-06-10

These are pragmatic MVP `/po` decisions that resolve the open questions from
`docs/product-vision/conditional-workflow/architecture-jorge.md` §4.2 so the team
can implement without re-litigating scope. They are right-sizing calls, not
architecture sign-off (that is ARCH's gate on each ticket).

## Decisions

| ID | Decision | Category | Rationale | Approved By | Date |
|----|----------|----------|-----------|-------------|------|
| D-001 | **MCP transport/trust = stdio, same-machine only** (loopback as the fallback transport). The write-back tools are reachable only from a process on the same machine; a remote/cross-host caller is refused, mirroring the existing `guard.js writeAllowed` posture. | Product | The control plane is a single-developer, local-first surface today. stdio is the simplest trust boundary (the host spawns the server; nothing listens on a port by default) and needs no new auth model. Loopback + the existing CSRF/Host/Origin guard remains available if an HTTP-style transport is ever needed. Keeps the threat model identical to the HTTP control plane — no new bypass. | /po (+ /secops to ratify at the SECOPS gate) | 2026-06-10 |
| D-002 | **The MCP tools reuse the existing `api.js` handlers / `engineIO` writers — no second mutation path.** The MCP server is a thin typed adapter; every tool delegates to the same route handler the hub already calls. | Architecture (provisional, /arch ratifies) | The whole safety story (CAS, overlay-only, `routePastUnmetSafetyGate`, `settable_by`) already lives behind those handlers. A parallel writer would be a new attack surface and a drift hazard. One writer, one set of invariants. | /po | 2026-06-10 |
| D-003 | **A directive is marked consumed by an explicit guarded write** (a typed marker / consumed-trace on the same comment/ledger contract), set by the agent that acted on it — not auto-cleared on read. | Product | Surfacing must be idempotent and durable: an un-acted directive must survive a session restart (so the work is not silently dropped), and "I handled it" must be a deliberate, audited act that rides the same CAS writer (no new bypass). Auto-clear-on-read would lose a directive if a session crashed mid-action. | /po | 2026-06-10 |
| D-004 | **Plugin distribution = in-repo plugin directory** (a `.claude-plugin/` packaging of the existing `claude/skills` + `claude/workflow` + hooks + MCP server), not a separate marketplace repo for Phase 1. | Product | Keeps DART one versioned unit, lets the plugin reuse the same source already in this repo (no fork, no second release pipeline), and lets us dogfood it on this very project. A separate marketplace repo is a Phase 2+ distribution concern once the plugin is proven. | /po | 2026-06-10 |
| D-005 | **ADT-239 (packaging) follows ADT-237 + ADT-238**, not concurrent with them. ADT-237 and ADT-238 may run in parallel after their ARCH+SECOPS gates. | Process | The plugin packages the MCP server and the hooks; building the package before its contents exist would invert the dependency. Packaging is mechanical once 237/238 are green, so it is the smallest, last slice. | /po (+ /sm) | 2026-06-10 |
| D-006 | **Opt-in mechanism = per-project enablement in the project's own settings** (the project references/enables the `dart` plugin); DART is inert until a project opts in, and DART never writes into the user's `~/.claude` outside the plugin's own directory. | Product | This is the exact "conditional overlap without clobbering" the user asked for: DART augments only where chosen, the user's config is sovereign, and plugin-layer precedence means a user's same-named command/hook always wins. | /po (+ /secops to ratify) | 2026-06-10 |
| D-007 | **DESIGN gate is light/deferred for all three tickets.** No end-user visual surface ships in this chunk; it is backend/CLI/integration. A directive-inbox or install UI is explicitly out of scope and would re-trigger DESIGN when scoped. | Product | The user stated interface polish comes later. The bridge's value is the mechanism (write-back + surfacing + packaging), not a screen. Keeping DESIGN soft/deferred right-sizes the process without skipping it (it is recorded pending, not removed). | /po | 2026-06-10 |
| D-008 | **The `~/.claude` merge-install (`install.sh`) remains a supported fallback**, not removed. The plugin becomes the primary, namespaced, opt-in distribution; `install.sh --user` stays for power users who want the team globally and un-namespaced. | Product | No regression for existing users; the two distributions package the same source. Removing the installer would be a breaking change for no benefit in this phase. | /po | 2026-06-10 |
| D-009 | **Rule authoring / new-power grants are NOT in scope for this sprint.** This chunk surfaces and writes back existing intent; it does not add a UI to author rules that grant agents new label powers. The engine's existing author-time validation (refusing a rule that routes past a safety gate) stays the guard. | Product / Security | Keeps the SECOPS surface bounded to "the write-back path enforces the same invariants" rather than also "who may author dangerous rules" (architecture-jorge §4.2 Q2/Q3). Rule-authoring governance is a separate, later decision. | /po (+ /secops) | 2026-06-10 |

## Categories
- **Architecture**: System design, patterns, technology choices (ratified at the /arch gate)
- **Product**: Features, UX, scope, priorities
- **Process**: Team workflow, sequencing, tooling
- **Security**: Trust boundaries, secrets, safety invariants (ratified at the /secops gate)

## Open items deferred to the gates
- /arch ratifies D-002 (single-writer reuse) and the in-repo plugin layout (D-004) against the current code at the ARCH gate on each ticket.
- /secops ratifies the stdio/loopback trust boundary (D-001), the consumed-marker write (D-003), and the no-clobber/no-secret install posture (D-006) at the **HARD** SECOPS gate before any implementation.
