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
