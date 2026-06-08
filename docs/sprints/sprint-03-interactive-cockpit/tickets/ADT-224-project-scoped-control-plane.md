# ADT-224 — Project-scoped control plane + live updates

**Track:** full · **Stage:** ready · **Assignee:** /arch (next gate)
**Implementers:** /be (write routing + live stream by project id) · /fe (send/subscribe with the viewed project's id)
**Gates:** ARCH_APPROVED (hard) · SECOPS_APPROVED (hard, safety-override) · DESIGN_APPROVED (n/a — no new screen; review only) · APPROVAL_GATE · CODE_REVIEWED · VERIFIED

## Story

As a person running several projects from the Cockpit, I want every change I make and every live update I see to belong to the **project I am currently viewing** — not to whatever project the hub happened to launch with — so that adding a note, advancing a task, setting a gate, or editing the workflow affects the right project and the board I am watching reflects only that project's activity.

## Problem (root cause)

The Cockpit reads per-project correctly, but the control-plane **writes** and the **live stream** are bound to the single project the hub was launched with. Every mutation and every live update therefore targets the launch project, not the viewed one. (Observed: a note added while viewing one project was written to the launch project.) This ticket scopes writes and the live stream to the viewed project, resolved through the existing registry, and confines every write to that project's registered path.

## Behavioral acceptance criteria

- [ ] Every Cockpit mutation (add a note, advance a task, set/decide a gate, edit the workflow) is applied to the **project currently being viewed**, identified by its registry id, and **not** to the project the hub was launched with.
- [ ] The **live stream** a viewer receives reflects **only the viewed project's** changes; a change to a different project does not appear in that viewer's stream.
- [ ] A mutation or subscription naming an **unknown / unregistered** project id is **refused** (clear error), and nothing is written.
- [ ] A mutation cannot write **outside the viewed project's registered path** — supplying a crafted id or path does not cause a write anywhere other than the registered project directory (provable with a negative test: a traversal/foreign-path attempt is refused and leaves the filesystem unchanged).
- [ ] Project-scoped writes still pass the existing **write-guard** and the **atomic CAS** ledger semantics; a stale-revision write is still rejected (409), not silently applied.
- [ ] The **single-project launch** path (hub started against one directory, no registry) still works: mutations and live updates target that project as today.
- [ ] Two viewers watching two different projects each see their own project's live updates concurrently, without cross-talk.

## Out of scope (PO decision — see DECISION_LOG D-006)

- Per-user authentication / multi-tenant identity. Confinement is by **registered project path** resolved from the registry; the existing loopback write-guard remains the trust boundary. No new auth model in this ticket.
- Changing the registry's connect/list/remove API. This ticket consumes `registry.get(id)` to resolve a path; it does not redesign the registry.

## Notes for /arch and /secops

- `hub/server.js` currently routes control-plane POSTs through `api.handle(route, data, PROJECT)` and serves SSE / state from `buildState()` where `PROJECT` is the single launch dir. The registry (`hub/lib/registry.js`, `createRegistry().get(id)` → project record with a path) already resolves a project id to its canonical path for the read API.
- **/arch:** define how the viewed project's id travels with each mutation and each live-stream subscription, how the id resolves to a path **only** via the registry, and how the single-project (no-registry) launch stays working. Confirm CAS/guard still wrap the resolved path.
- **/secops (HARD — `external_input` reaches a path-resolution that selects a write target):** the id→path resolution must **confine** every write to a registered project root — reject unknown ids, reject ids that resolve outside the registry's canonical roots, reject traversal/absolute/symlink escapes. Prove the negative: a crafted id/path cannot write to an arbitrary location and leaves the filesystem untouched. The write-guard must still be required.
