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
| PD-7 | Ratify Apex §1.1 anchor one-liner as the in-app message: *"A full AI dev team — and a process it can't skip — for the code already on your machine."* (one alternate kept live for later A/B) | Product | Benefit-first, names the differentiator (enforced, can't-skip process + local-first), true of the MVP, no model/vendor/number | /po | 2026-06-07 |
| PD-8 | Folder-picker root scope (Aura §8 Q1): MVP confines to `$HOME` only; an admin-configurable allowlist hook is deferred, not shipped now | Product/Security | Smallest safe surface for the hard SECOPS gate; extra roots not worth widening filesystem exposure in slice 1 | /po | 2026-06-07 |
| PD-9 | Add-documents (Aura §8 Q2): DEFER the write endpoint; the Base panel's "Add documents" links to the docs folder / opens a read-only invite this slice | Product | Keeps the slice read-only (no new write surface, no extra SECOPS scope); the invitation still sets the expectation honestly | /po | 2026-06-07 |
| PD-10 | Edit overrides for title/description (Aura §8 Q3): DEFER; the `✎ edit` affordances are out of scope this slice | Product | Model supports overrides, but the edit write-path is non-essential to the read-first shell; pull later | /po | 2026-06-07 |
| PD-11 | Sample-vs-docs link (Apex §2.2/§8): NO read-only sample project this slice; the no-commitment secondary CTA links to the docs/README, labelled honestly ("Read the docs →"), never a signup | Product | A real sample project is unbuilt; an honest docs link avoids implying an in-app tour that does not exist | /po | 2026-06-07 |
| PD-12 | Marketing security claims (local-first / no-egress / security-reviewed wording) must be ratified by /secops + /arch before shipping as copy; the no-egress claim is scoped to DART only (the host AI tool still sends prompts under the user's own plan) | Product/Security | Honesty + legal: an absolute "nothing ever leaves" is false; copy must match real behaviour | /po | 2026-06-07 |

## Categories
- **Architecture**: System design, patterns, technology choices
- **Product**: Features, UX, scope, priorities
- **Security**: Threat surface, gate requirements
- **Process**: Team workflow, sequencing, ticket handling
