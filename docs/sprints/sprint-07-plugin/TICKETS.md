# Sprint 07 — Tickets (behavior-only)

Stories describe WHAT, not HOW (no file paths/line numbers in the AC text). The
references to existing modules below are *grounding for the team*, not part of the
behavioral contract the implementer must satisfy.

---

## ADT-237 — MCP control-plane server (main tool → DART write-back)

**As** an agent running inside the main tool (Claude Code / Kiro),
**I want** typed tools to advance tickets, set gates, post comments, set labels, and assign,
**so that** I can write the result of my work back into DART's ledger through the same guarded control plane the hub uses — closing the loop so the next event drives the engine.

**Behavioral acceptance criteria**
- AC1: A write tool exists for each existing control-plane mutation — advance a ticket's stage, set a gate state, post a ticket comment, set/clear a label, assign a ticket, require an extra gate — and each produces exactly the same ledger/overlay change and the same typed audit comment that the equivalent HTTP route produces today.
- AC2: A read tool returns the current workflow state for a project and the list of that project's **pending directives** (the recorded `instruct` intents), disclosing only what the digest already would.
- AC3: Every write goes through the existing guarded, compare-and-swap, overlay-only writers. A write made against a stale revision is reported as a conflict and changes nothing.
- AC4 (safety, negative): A tool call that would move a ticket past an unmet safety-override gate is **refused and writes nothing**. The engine's "no routing around a safety gate" invariant holds identically through the MCP path.
- AC5 (settable_by, negative): A label set by an agent not permitted to set that label is **refused and writes nothing** — no label change, no comment, no route.
- AC6 (no code-exec, negative): No tool executes code, spawns a process, shells out, or writes an arbitrary file. A directive stored via these tools remains **inert recorded intent**; DART never runs it.
- AC7 (trust boundary): Tools are reachable only same-machine (stdio or loopback transport). A remote/cross-host caller is refused.
- AC8 (no secret persistence): Tool arguments are never written into project files as secrets; nothing in a tool call leaks a credential into the ledger/overlay/comments.

**Implementer:** /be · **Gates:** ARCH (hard) · SECOPS (HARD, safety override) · DESIGN (soft, deferred/light) · APPROVAL_GATE (hard) · CODE_REVIEWED (hard) · VERIFIED (hard)

---

## ADT-238 — Directive surfacing (DART → main tool)

**As** a Claude Code session collaborating with DART,
**I want** the injected workflow context to tell me the **pending directives addressed to my agent(s)** plus the active workflow/rules and the labels the current stage may set,
**so that** I know what DART wants me to act on next, and so a directive I've handled is not surfaced again.

**Behavioral acceptance criteria**
- AC1: The session-start workflow context lists, per active ticket, the **pending directives** — each rendered with its target agent(s) and its prompt as quoted text.
- AC2: The context also lists, for each active ticket's current stage, the **labels that stage's owner is permitted to set** and what each routes to — rendered from the single workflow source of truth, never a hand-maintained duplicate.
- AC3 (parity): The permitted-label list shown to an agent **matches exactly** the set the label-write enforcement allows. They cannot drift (a single source of truth feeds both).
- AC4: A directive can be **marked consumed**; once consumed it does not appear in subsequent injected context. The consume action rides the same guarded/CAS writer.
- AC5 (persistence): A pending directive that has **not** been consumed still appears after a session restart (it is durable recorded intent, not session memory).
- AC6 (inert data, negative): A directive whose prompt contains instruction-like or injection-like text is surfaced **verbatim as quoted data** — DART never evaluates or acts on it; only the addressed agent in the main tool may choose to act.
- AC7 (no secret leak, negative): No secret/credential is rendered into the injected context; the projection exposes only ledger/overlay data the digest already exposes.
- AC8 (resilience): The surfacing path is best-effort and never breaks or hangs a session — it exits cleanly even when the hub/Core is unavailable, falling back to the deterministic digest.

**Implementer:** /be · **Gates:** ARCH (hard) · SECOPS (HARD, safety override) · DESIGN (soft, deferred/light) · APPROVAL_GATE (hard) · CODE_REVIEWED (hard) · VERIFIED (hard)

---

## ADT-239 — Plugin packaging + namespacing + per-project opt-in

**As** a developer who already has my own Claude Code commands, skills, and hooks,
**I want** to install DART as a plugin that adds its team + workflow + bridge under a `dart:` namespace, enabled per project,
**so that** DART augments my environment without ever clobbering my own configuration, and I can turn it on only where I want it.

**Behavioral acceptance criteria**
- AC1: DART installs as a single versioned plugin unit carrying its agent team, the workflow-engine, the session hooks, and the write-back MCP server (the same components from ADT-237/238 — not a fork).
- AC2 (namespacing): Every DART command and skill is reachable under a `dart:` namespace, so it never collides with a user's existing same-named command or skill.
- AC3 (no clobber, negative): Enabling the plugin does **not** modify or overwrite the user's own settings, commands, skills, or hooks. On a name collision the **user's** component wins (the plugin layer has lowest precedence).
- AC4 (opt-in, negative): DART is **inert** in a project that has not explicitly enabled it, and absent in projects that never opt in. Enabling is a per-project action.
- AC5 (inherited security): The bundled MCP server keeps ADT-237's loopback/stdio trust and no-code-exec posture; the bundled hooks keep ADT-238's read-only/exit-cleanly/no-secret posture.
- AC6 (no secret in manifest, negative): No secret or credential is baked into the plugin manifest or any shipped file; keys remain env-only.
- AC7 (reversible): Disabling the plugin removes all DART influence; a colliding user command/hook is untouched throughout. The managed/enterprise-settings interaction (a force-disabled plugin cannot be self-re-enabled) is documented.
- AC8 (fallback): The existing `~/.claude` merge-install remains a working, un-namespaced fallback for power users who want the team globally.

**Implementer:** /be · **Gates:** ARCH (hard) · SECOPS (HARD, safety override) · DESIGN (soft, deferred/light) · APPROVAL_GATE (hard) · CODE_REVIEWED (hard) · VERIFIED (hard)

---

### Sequencing

ADT-237 and ADT-238 are independent and can proceed in parallel after ARCH+SECOPS.
ADT-239 **packages** 237 + 238, so it follows them (it wires the already-built MCP
server + hooks into the plugin). See DECISION_LOG D-005.
