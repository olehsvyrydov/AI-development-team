# Product-Owner Decisions

## D-A — Frontend framework: Angular 21 (supersedes the earlier React lean)
The frontend is Angular 21 (latest): standalone components, Signals, zoneless change
detection, Signal Forms; RxJS for the realtime (SSE/WS) data model. Rationale: stack
consistency with the KGB project (also Angular), shared components and tooling, and a
realtime-friendly model. KGB will be aligned to the same Angular version. The visual
workflow canvas uses an Angular-native/agnostic library (Rete.js v2 Angular renderer or
ngx-vflow) rather than React Flow. The Tauri desktop shell, the Node "Core" sidecar
(superset of the hub), and host-CLI subagent execution are unaffected. The existing
zero-dependency hub stays as the fallback floor.

## D-B — Workflow panel: editable visual builder in the MVP.
## D-C — Remote: remote execution included in v1 (SECOPS mandatory for those tickets).
## D-D — Sequencing: multi-project shell first, then per-project depth.
## D-E — BASE backbone: reuse claude/memory now; KGB/Canon + Bumbl deferred/optional.
## Product name: open (keep "ADT" for now).

## Resolved: product name — DART (Dev AI Responsible Team)
The product/app is **DART — Dev AI Responsible Team**. The agent roster + gated
workflow it is built on remain "the team" (the existing skills). DART is the
cross-platform studio around them.

## Environment + integration facts (owner-provided)
- Build/test on this Linux/Ubuntu machine. The Angular Cockpit is built and
  headless-tested here; Tauri desktop packaging + Windows are deferred until the
  feature set is complete (designed cross-platform throughout). A dev-cloud VPS is
  available on request (credentials provided when needed) for remote-execution and
  display-dependent testing.
- Frontend stack consistency confirmed: KGB (knowledge-base repo) is also Angular —
  the Cockpit follows the same conventions so components can be shared.
- Knowledge-backbone candidates live locally: Bumbl (../bumbl-dis, Rust) and KGB
  (../knowledge-base, Angular frontend + Java hexagonal backend); Canon is a
  commercial branch of KGB. Evaluate as optional overlays when the BASE layer lands.
- API keys (ANTHROPIC/VOYAGE/GEMINI) are available at ~/git/workspace/canon/deploy/.env;
  used via environment only for live memory recall — NEVER read into, logged, or
  committed to this repo.
- Branch: all DART work accumulates on `feat/dart`; main stays clean until the
  owner approves a PR (owner + Copilot review) — only then merge to main.
