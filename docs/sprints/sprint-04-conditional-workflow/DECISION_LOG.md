# Decision Log - Sprint 04 (Conditional Workflow — Phase 0)

**Last Updated:** 2026-06-08

Phase 0 of the conditional/looping/event-driven workflow: a user-controlled `when → do` rules+labels
engine (deterministic Core evaluator) + the drag-to-reorder builder + the plain-English rule editor.
Sources of truth: `docs/product-vision/conditional-workflow/{architecture-jorge,research-anna,
ux-aura,strategy-apex}.md`.

## Decisions

| ID | Decision | Category | Rationale | Approved By | Date |
|----|----------|----------|-----------|-------------|------|
| D-401 | **Loop-iteration ceiling default = 3** backward traversals per ticket per loop; on exceedance the engine sets `NEEDS_HUMAN` and stops routing. | Product | Both investigations left the ceiling open for `/po`/`/arch` (anna §5 item 1; jorge §1.3 R1). A small default (3) catches a runaway loop fast while still allowing a genuine reject→fix→reject→fix→reject cycle before handing back. Configurable per workflow later (BL-09); 3 is the safe, legible Phase-0 default. | /po | 2026-06-08 |
| D-402 | **Label contract lives in the workflow document `labels:` block** with a `settable_by` list per label (and `meaning` + route destination). | Product / Architecture | anna §3 + jorge §1.4 both converge here; making the YAML the single source of truth lets the digest render the agent-facing copy AND the route enforce from the same place, preventing skill-text vs enforcement drift (jorge R3). Confirms anna's open item 2. | /po (+ /arch to ratify) | 2026-06-08 |
| D-403 | **`global` vs `common` naming is DEFERRED** out of Phase 0. | Product | The rename only matters for the **knowledge-scoping** chunk (anna Q2), which is explicitly not Phase 0. Phase 0's routing labels are unrelated to memory `scope`. Resolving it now would invite scope creep with no Phase-0 payoff. Revisit with BL-07. | /po | 2026-06-08 |
| D-404 | **Rules live in `workflow.yaml` (`rules:` section) + the machine overlay** (`.aidevteam/workflow.overrides.json`), merged by the same projection that already merges gates/tracks/presets. No separate `rules.yaml`. | Architecture / Product | jorge §1.1: one parser, one overlay, one `rev` avoids a CAS hazard (two files, two revs, torn writes) and keeps rules diffable + co-located with the gates/stages they reference. Confirms anna's open item 2. | /po (+ /arch) | 2026-06-08 |
| D-405 | **`fan_out`/parallel: model the schema in Phase 0, DEFER multi-agent execution to Phase 2.** Phase 0 supports the `fan_out` action in the grammar/editor and single/serial execution; true parallel agent fan-out + the join barrier is Phase 2 (BL-04a). | Product / Architecture | jorge §2.3 + §4.3 phasing: real OS-level parallelism depends on the host tool's subagent concurrency, which DART cannot guarantee — DART never blocks on parallelism it can't deliver. Modeling the schema now keeps the rule/editor data-model stable so Phase 2 is additive, not a rewrite. | /po | 2026-06-08 |
| D-406 | **Phase 0 builds on the current `~/.claude` file/hook install — NO plugin in this sprint.** | Product / Architecture | jorge §4.3: routing/loops/labels are buildable today on files + the existing SessionStart hook; the plugin (BL-03) is the Phase-1 integration win and must not block proving the engine first. Anti-pattern avoided: big-bang delivery — phase the increment. | /po (+ /arch) | 2026-06-08 |
| D-407 | **The engine MUST refuse any rule that routes around a `safety_override` gate or escalates an agent's allowed labels.** This is a hard requirement on ADT-227 and is mirrored (prevented) in the ADT-229 editor. | Architecture / Security | jorge §4.2 Q2/Q3 + R8: a carelessly-authored rule could clear/skip SECOPS or let an agent set a label it doesn't own — that is a control-flow security hole. Rule authoring is a write surface; the safety override is never downsized. Drives the **SECOPS HARD** gate on ADT-227. | /po (routes to /secops) | 2026-06-08 |
| D-408 | **Intent/action split is load-bearing:** DART applies engine-mutations (`set_label`/`route_to_stage`/`assign`/`require_gate`) itself to the ledger/overlay; `instruct{target,prompt}` is RECORDED as a directive for the host tool. DART does not run agents in Phase 0. | Architecture / Product | jorge §1.2/§2.1, apex §1.4 honesty guardrail. Keeps "DART records intent; the host executes" true, lets routing be deterministic without the LLM, and keeps the messaging honest (apex). | /po (+ /arch) | 2026-06-08 |
| D-409 | **Board adds NO card-drag; drag is only for builder stage reorder** (ADT-228). Advancing a task stays a routed control-plane/rule action. | Product / Design | aura §3.3 + §7 open item 1: card-drag would imply you can drag a task past a gate. Drag is a deliberate authoring act (reorder stages) with a strong keyboard alternative; task advancement is a workflow decision. | /po (+ /ui) | 2026-06-08 |

## Deferred backlog (moved out of Phase 0 with context)

| ID | Item | Why deferred | Target |
|----|------|--------------|--------|
| BL-03 | DART as a Claude Code **plugin**: namespaced `/dart:*`, MCP write-back tools, mid-session **monitor** directive push, per-project opt-in. | The real "augment, don't fight" integration win, but Phase 0 proves the engine on the current install first (jorge §4.3). | Phase 1 |
| BL-04a | **Parallel multi-agent execution** of `fan_out` + the `join: all\|any\|quorum` barrier + multi-owner board chips. | Depends on host subagent concurrency DART can't guarantee; schema modeled now (D-405), execution later. | Phase 2 |
| BL-06 | **Kiro** steering renderer + agent-hook adapter over the same file projection. | Portability proof; not a Phase-0/1 target. Confirm Kiro priority (jorge open item 5). | Phase 2 |
| BL-07 | **Knowledge scoping** — `scope: common\|project`, `stack`/`domain`/`kind` tags, the `/kai` propose→approve inbox (anna Q2). | A distinct chunk; not Phase 0. The `global`→`common` rename (D-403) lands here. | Later chunk |
| BL-08 | **Pipeline-board visuals** — stage rail, parallel split-nodes, stacked done-folder; **Knowledge panel** rename ("Base"→"Knowledge") + scope UI + propose-inbox (aura §3/§4). | Presentational refinements over the existing projection; not required to prove the engine. | Later chunk |
| BL-09 | **Workflow/rules settings surface** — loop-budget configuration, label-management UI. | Phase 0 ships sensible defaults (D-401); a settings UI is an enhancement. | Later |

## Open questions routed to gate owners (resolve during their gate)

- **→ /secops (ADT-227, HARD):** the exact safety-gate-bypass prohibition and label-escalation
  prevention (D-407); directive-trust boundary for `instruct` prompts (jorge §4.2 Q3); loop-budget
  + CAS + dedup adequacy.
- **→ /arch (all three):** ratify rules-in-overlay merge semantics (project adds + overrides by
  `id`, mirroring gates — jorge open item 1); confirm `labels:[]` reaches the ticket projection so
  the board/editor can read it (aura open item 2).
- **→ /ui (ADT-228/229):** confirm menu-advance-only on the board (D-409); per-ticket design specs
  from the aura wireframes.

## Notes
- This log is process/decision context. Per the facts-only code standard, none of these IDs,
  persona names, or decision codes appear in source or doc-comments — they live here, in the
  tickets, and in commit messages / the ledger.
