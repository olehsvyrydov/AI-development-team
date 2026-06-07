# Decision Log — Sprint 02 (Multi-Project Studio)

**Last Updated:** 2026-06-07

## Decisions

| ID | Decision | Category | Rationale | Approved By | Date |
|----|----------|----------|-----------|-------------|------|
| PD-1 | Frontend = Angular 21 (standalone, Signals, zoneless, Signal Forms, RxJS realtime); visual canvas = Rete.js v2 (ngx-vflow fallback); Tauri shell + Node "Core" sidecar (supersets hub); host-CLI subagent exec reusing existing keys | Product/Architecture | Stack consistency with KGB (also Angular); shared components/tooling; realtime-friendly; supersedes earlier React lean; legacy zero-dep hub stays as floor | /po | 2026-06-07 |
| PD-2 | WORKFLOW panel ships **editable** in the MVP (create/edit/delete triggers, loops, conditionals, background agents) | Product | Editable builder is the headline differentiator; overrides VISION §5 read-only-first lean | /po | 2026-06-07 |
| PD-3 | Remote **execution** is in v1 (agents run on a remote machine, e.g. over SSH) | Product/Security | Real user ask ("if it works locally it works remotely"); overrides VISION "Won't"; SECOPS_APPROVED mandatory + ARCH for the new boundary | /po | 2026-06-07 |
| PD-4 | Sequencing: multi-project shell FIRST (registry + Projects Home + connect/analyze), then per-project depth (Tasks, Base, Workflow) | Product/Process | Multi-project continuity is the core JTBD; the shell is the first integrated increment | /po | 2026-06-07 |
| PD-5 | BASE reuses the existing `claude/memory` subsystem now; KGB/Canon + Bumbl deferred/optional | Architecture | Only reading that preserves OSS-first/no-mandatory-dependency; externals unverified (live in other repos, K9) | /po | 2026-06-07 |
| PD-6 | Product name stays open — keep "ADT" | Product | Naming + trademark/clearance deferred to /po + /legal | /po | 2026-06-07 |
| SD-1 | DECISIONS.md overrides VISION.md where they differ (PD-2 editable, PD-3 remote-exec) — MoSCoW re-tagged accordingly | Process | DECISIONS.md is the locked source; VISION.md leans are superseded | /sm | 2026-06-07 |
| SD-2 | Leftover ADT-207/208/209 marked `superseded` (not `done`); their passed ARCH/DESIGN/SECOPS carried as input (does not auto-pass the larger absorbing tickets) | Process | Avoid building hub-only features then rebuilding for the shell; the new boundary/scope is larger | /sm | 2026-06-07 |
| SD-3 | Commit SLICE 1 (shell) + ADT-230 (runner) this sprint; SLICES 2–5 staged `backlog`, pulled shell-first | Process | Phased delivery; each slice independently verifiable; runner is a hard dependency of connect/analyze | /sm | 2026-06-07 |

## Categories
- **Architecture**: System design, patterns, technology choices
- **Product**: Features, UX, scope, priorities
- **Security**: Threat surface, gate requirements
- **Process**: Team workflow, sequencing, ticket handling
