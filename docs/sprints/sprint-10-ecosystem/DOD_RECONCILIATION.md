# Definition-of-Done Reconciliation — Ledger vs Reality

**Date:** 2026-06-13
**Owner:** /sm (Luda)
**Scope:** `.workflow-state.json` (42 ADT tickets) reconciled against merged history (`main..feat/dart-interactive`) and sprint approval/review/verify docs.
**Action:** DoD/board reconciliation only — NOT a fresh `/verify` sign-off. The in-app/live `VERIFIED` proof for the plugin remains the user's step (see note at end).

## Why this was needed

The board showed 30 tickets at `ready`/`backlog` while many of those features are already shipped and merged (PRs #37–#48 plus the earlier sprint-02/03/04 slices). The Cockpit was therefore rendering finished work as Backlog. Each non-terminal ticket was reconciled against what is actually merged + reviewed.

## Stage distribution

| | done | superseded | deferred | backlog | ready |
|---|---|---|---|---|---|
| **Before** | 9 | 2 | 1 | 11 | 19 |
| **After** | 30 | 4 | 1 | 6 | 1 |

Total tickets unchanged: **42**.

## Per-ticket reconciliation

| Ticket | Old → New | Evidence |
|---|---|---|
| ADT-218 | ready → **done** | sprint-02 Cockpit-v2 (commits 7cc20a5/649f03d/38913e7/df0690d/906b669); ARCH+SECOPS+DESIGN+CODE_REVIEWED passed; **VERIFIED passed** (testing/verify-cockpit-v2.md — PASS). |
| ADT-219 | ready → **done** | sprint-02 Cockpit-v2; ARCH+DESIGN+CODE_REVIEWED passed; **VERIFIED passed**. |
| ADT-220 | ready → **done** | sprint-02 Cockpit-v2 (folder picker + dir-browser); HARD SECOPS + ARCH+DESIGN+CODE_REVIEWED passed; **VERIFIED passed** (containment proven by negative tests). |
| ADT-221 | ready → **superseded** | Superseded by **ADT-225** (fully editable add/delete/move builder absorbed the reorder-only scope). |
| ADT-222 | ready → **superseded** | Superseded by **ADT-226** (stage-aligned board replaced the status-grouped board). |
| ADT-223 | ready → **done** | sprint-03 (commits fa98636/5c9b2be, KB-note write + overlay CAS); HARD SECOPS + CODE_REVIEWED passed; in-app live proof pending. |
| ADT-224 | ready → **done** | sprint-03 (commits a3e0c9d/bd134dc, project-scoped control plane + live stream); HARD SECOPS + CODE_REVIEWED passed; in-app live proof pending. |
| ADT-225 | ready → **done** | sprint-03 (commit a3e0c9d, editable stage builder); ARCH+SECOPS+DESIGN+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-226 | ready → **done** | sprint-03 (stage-aligned board) + polished in **PR #48** (commit 97a2e19); ARCH+SECOPS+DESIGN+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-227 | ready → **done** | sprint-04 (commit 470458a, rules + labels engine); HARD SECOPS + CODE_REVIEWED passed; in-app live proof pending. |
| ADT-228 | ready → **done** | sprint-04 (commit b3950f7, drag-to-reorder builder); ARCH+SECOPS+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-229 | ready → **done** | sprint-04 (commits b3950f7/5614fd4, when-do rule editor UI); ARCH+SECOPS+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-232 | ready → **done** | **PR #37** (commit 89608fe, Tasks board → pipeline); DESIGN+ARCH+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-233 | ready → **done** | **PR #38** (commit a0d818f, Projects Home → launcher); DESIGN+CODE_REVIEWED passed (ARCH not triggered — pure-FE re-projection); in-app live proof pending. |
| ADT-234 | backlog → **done** | **PR #39** (commit 060307a, knowledge scopes + tags + common vault); ARCH+SECOPS+DESIGN+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-235 | backlog → **done** | **PR #40** (commit 33feb84, /kai propose-to-approve inbox); ARCH+SECOPS+DESIGN+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-236 | backlog → **done** | **PR #42** (commit fb9be58, interpretation-check Q&A + optional semantic overlay); ARCH+SECOPS+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-237 | ready → **done** | **PR #41** (commit cf42827, MCP control-plane server / write-back); ARCH+SECOPS+CODE_REVIEWED passed; in-app live VERIFIED for the plugin pending. |
| ADT-238 | ready → **done** | **PR #41** (commit cf42827, directive surfacing DART→main tool); ARCH+SECOPS+CODE_REVIEWED passed; in-app live VERIFIED for the plugin pending. |
| ADT-239 | ready → **done** | **PR #41/#43** (commits cf42827/660aa8f, plugin packaging + marketplace manifest + per-project opt-in); ARCH+SECOPS+CODE_REVIEWED passed; in-app live VERIFIED for the plugin pending. |
| ADT-240 | backlog → **done** | **PR #44** (commit 1cb433c, live per-turn directive delivery hook); ARCH+SECOPS+CODE_REVIEWED passed; in-app live VERIFIED for the plugin pending. |
| ADT-241 | ready → **done** | **PR #46** (commit 2e6cce8, two-command public install); ARCH+SECOPS+CODE_REVIEWED passed; **VERIFIED passed**. |
| ADT-242 | backlog → **done** | **PR #47** (commit 82163dd, Kiro / kiro-cli adapter); ARCH+SECOPS+CODE_REVIEWED passed; in-app live proof pending. |
| ADT-212 | backlog → **backlog** (unchanged) | Genuinely open — shell resilience / no-silent-staleness; all gates `pending`, never built. |
| ADT-213 | backlog → **backlog** (unchanged) | Genuinely open — auto-analyze on connect; all gates `pending`, never built. |
| ADT-214 | backlog → **backlog** (unchanged) | Genuinely open — non-destructive ingest of existing ADT artefacts; all gates `pending`, never built. |
| ADT-215 | backlog → **backlog** (unchanged) | Genuinely open — live cross-project change indicator; all gates `pending`, never built. |
| ADT-216 | backlog → **backlog** (unchanged) | Genuinely open — local-first / loopback-by-default guardrails; all gates `pending`, never built. |
| ADT-217 | backlog → **backlog** (unchanged) | Genuinely open — cross-platform folder/path behavior; all gates `pending`, never built. |
| ADT-230 | ready → **ready** (unchanged) | Genuinely open — host-CLI runner + key reuse; all gates `pending`, never built (later plugin work used the MCP path instead). Candidate for re-triage to backlog. |
| ADT-243 | deferred → **deferred** (unchanged) | Kept deferred per its deferTrigger (build only when a second consumer copy-pastes hub-API client code). |

## VERIFIED gate honesty (important)

- **Genuinely VERIFIED (web Cockpit, real /verify doc):** ADT-218, ADT-219, ADT-220, ADT-241.
- **Shipped + CODE_REVIEWED but in-app/live VERIFIED still pending:** the plugin/control-plane/knowledge tickets (ADT-223–229, 232–240, 242). They are marked `done` on the basis of **merged PR + passed code review + Copilot review**, with the DoD note recording that the in-app/live human proof is outstanding. No `/verify` was faked.
- The **in-app/live VERIFIED proof for the DART plugin (ADT-237/238/239/240) remains the user's step** — running the installed plugin against a live host session and confirming write-back + per-turn directive delivery behave end-to-end.

## Result

The board now reads honestly: 30 done, 4 superseded, 1 deferred, 6 backlog, 1 ready. The remaining 7 non-terminal tickets are all genuinely un-built (every gate `pending`), so nothing shipped is mislabeled as Backlog and nothing un-built is mislabeled as Done.
