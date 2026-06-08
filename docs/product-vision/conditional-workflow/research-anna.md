# Research — Conditional / Event-Driven Workflow + Knowledge Scoping

**Author:** Anna (`/ba`) · **Type:** Research / requirements investigation (no code, no gate)
**Date:** 2026-06-08
**Scope:** Distil a minimal rule model for conditional/looping/event-driven workflows (Q1) and a knowledge-scoping taxonomy for common-vs-project knowledge sharing across project types (Q2). Behavioral acceptance criteria only — WHAT, not HOW.

---

## Grounding in what already exists (read before proposing)

The repo already contains two-thirds of both mechanisms. The requirements below **extend** these, they do not reinvent them.

| Existing fact (file) | What it gives us |
|---|---|
| `claude/workflow/workflow.yaml` `gates:` — each gate has `trigger: [...]` (e.g. `auth`, `schema_change`, `track:full`) | An **event/condition → require-gate** model already exists. "When trigger present → gate is required" is exactly a `when → do` rule, just hard-coded to gates. |
| `hub/lib/state.js` `normState()` → `passed` / `rejected` / `pending`; gates stored per-ticket in `.workflow-state.json` | A **ledger of labels** already exists: gate name + state + `by` + `at` + `note`. Routing labels can live in the same store. |
| `hub/lib/stage-map.js` `STAGE_GATE`, `expectedOwner()` | A **stage → gate → owner** map exists. A routing label (`TO_DEV_BE`) just needs to resolve to a stage/owner the same way. |
| `hub/lib/state.js` `statusOf()` — a `rejected` hard gate → `blocked`; `needsHumanDecision()` | "Rejected" is already a first-class, observable event the board reacts to. A reject-loop rule is the natural next step. |
| `claude/memory/test/store.test.ts` + `recall.test.ts` — payload carries `project_id` + `scope: "project" \| "global"`; queries are AND-combined equality filters | The **scope split (project vs global) already works and is tested**. Project isolation and global-rule recall are proven (`g-1` returned only on `scope:global`, never on a project query). Q2 extends `scope` with more dimensions. |
| `hub/lib/state.js` `readKb()` / `buildBase()` | The hub Base panel reads markdown docs (`docs/`, `kb/`, `.aidevteam/kb`); `method` is `filename-only` until an embedder is configured. Tags would be front-matter on these docs. |
| `claude/skills/specialized/kai/SKILL.md` + `claude/commands/kai.md` | `/kai` already follows **propose → human approve → apply** and **never auto-applies**. The Q2 approve flow reuses this exact contract. |

**Design principle inherited from the repo:** facts-only, file-based default, no paid backend required, proportional. Both proposals keep that.

---

# Q1 — The simplest "when → do" rule model

## 1. How comparable systems model this — the one idea worth borrowing from each

| System | Model | The single idea worth borrowing |
|---|---|---|
| **IntelliJ / IDE breakpoint conditions** | A breakpoint fires only if a boolean condition holds; can log or evaluate instead of suspend | **Condition is optional and separate from the action.** A rule with no condition always fires; a condition just gates it. Keep `when` optional. |
| **n8n / Zapier** | `trigger → action(s)`, nodes chained; trigger types are app events | **One trigger, an ordered list of actions, explicit chaining.** A rule is `trigger → [actions]`; chaining is first-class, not implied. |
| **GitHub Actions** | `on: <event>` → jobs; `if:` expressions; events include `labeled`, `issue_comment`; jobs can `needs:` (fan-out/fan-in) | **`on:event` + `if:` + `labeled`/comment events as triggers**, and **`needs:` for parallel fan-out then join.** This is the closest existing analogue to the user's ask. |
| **State machines / BPMN gateways** | Explicit states; exclusive (XOR) vs parallel (AND) gateways route tokens | **A routing decision is an explicit, named gateway**, not buried logic. XOR = "route to exactly one stage"; AND = "fan out to several." Borrow the two gateway types only. |
| **Jira Automation** | `WHEN <trigger> IF <condition> THEN <action>` — e.g. when label added, transition issue; comment-contains conditions | **The exact `when/if/then` shape end users already understand**, including "when comment contains text" and "when label added." This is the vocabulary to adopt verbatim. |
| **Label-based routing (triage bots)** | A label drives routing; humans/bots set labels; a published list says which labels mean what | **Labels are a shared, *published* contract.** An actor may only set labels it is declared to own. Borrow the published-contract idea — it answers "how does an agent learn which labels it may set." |

**Distilled minimum:** Jira's `when / if / then` vocabulary + GitHub's event/label/comment triggers and `needs:` fan-out + BPMN's two explicit gateway types (route-to-one vs fan-out) + the repo's existing trigger→gate ledger. Nothing more is needed.

## 2. Minimal rule schema

A rule is a single object. `when` and a chain are optional. Values are strings/enums/lists only (file-friendly, matches the existing YAML/JSON style).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable rule name (for the ledger trace: which rule fired). |
| `when` | one of the **trigger forms** below | yes | The condition that fires the rule. |
| `if` | string (optional guard) | no | Extra boolean guard evaluated after `when` (e.g. `track == full`, `label present X`). Absent ⇒ always true. Borrowed from IDE/Jira. |
| `do` | list of **actions** (below) | yes | Ordered actions to perform when the rule fires. |
| `then` | list of `rule id` | no | Chain: rules to evaluate next (enables loops + sequences). |
| `once` | boolean | no (default false) | Fire at most once per ticket (loop-safety; see §5). |

### Trigger forms (`when`) — three kinds, mirroring the user's ask

| Kind | Shape | Example |
|---|---|---|
| `label` | `{ label: <name> }` | `{ label: TO_DEV_BE }` — a routing label was set on the ticket. |
| `pattern` | `{ pattern: <text-or-regex>, in: comment }` | `{ pattern: "needs rework", in: comment }` — text appeared in a comment. |
| `event` | `{ event: <system-event> }` | `{ event: gate.rejected:CODE_REVIEWED }`, `{ event: stage.entered:qa }`, `{ event: comment.added:/rev }` |

### Action forms (`do`) — four kinds, mirroring the user's ask

| Kind | Shape | Effect |
|---|---|---|
| `route` | `{ route: <stage> }` | Move the ticket to a stage (XOR gateway — exactly one). |
| `fan_out` | `{ fan_out: [<stage>, <stage>...] }` | Parallel branches (AND gateway); ticket joins when all complete. |
| `set_label` | `{ set_label: <name> }` / `{ clear_label: <name> }` | Add/remove a routing label in the ledger. |
| `instruct` | `{ instruct: <agent-or-stage>, prompt: <text> }` | Hand a stage/agent a prompt (the "instruction/prompt for a stage or specific agents"). |

Every fired rule writes a trace to the ledger (`rule id`, `when` matched, actions taken, `by`, `at`) — reusing the existing per-gate `{by, at, note}` shape, so the board can already render it.

## 3. Label taxonomy + the published contract

Three categories, kept deliberately distinct so an agent always knows whether a label is system-owned or user-owned:

| Category | Who creates it | Examples | Settable by |
|---|---|---|---|
| **System events** (not labels — read-only signals) | The engine emits them | `gate.passed:X`, `gate.rejected:X`, `stage.entered:X`, `comment.added:<agent>` | No one sets these; rules only *match* them. |
| **Gate labels** (existing) | The engine, when a gate is decided | `ARCH_APPROVED`, `CODE_REVIEWED` + state `passed`/`rejected` | Only the gate's `owner` agent (already enforced via `expectedOwner`). |
| **User-defined routing labels** | The user, in config | `TO_DEV_BE`, `TO_DEV_FE`, `NEEDS_DESIGN`, `BLOCKED_EXTERNAL` | **Only agents listed in the label's `settable_by` contract.** |

**The published contract (answers "how an agent learns which labels it may set"):** a `labels:` section, file-based alongside `workflow.yaml`. Each label declares its meaning, who may set it, and where it routes. An agent reads this contract at session start (same cascade as `workflow.yaml`) and **may only `set_label` a label whose `settable_by` includes it.** Unknown or unauthorized labels are refused and logged — same refusal discipline gates already use.

```
labels:
  TO_DEV_BE:  { meaning: "send back to backend dev",  settable_by: [/rev, /qa], routes_to: implement, owner: /be }
  TO_DEV_FE:  { meaning: "send back to frontend dev", settable_by: [/rev, /qa], routes_to: implement, owner: /fe }
  NEEDS_DESIGN: { meaning: "design rework required",  settable_by: [/rev],      routes_to: design,    owner: /ui }
```

### Default catalogue (ship these; users add more)

| Default label / event | Purpose |
|---|---|
| `TO_DEV_BE` / `TO_DEV_FE` | Reviewer/QA routes a ticket back to the right developer (the user's headline loop example). |
| `NEEDS_DESIGN` | Route back to `/ui`. |
| `BLOCKED_EXTERNAL` | Park awaiting an external dependency (board shows "needs you"). |
| `READY_FOR_QA` | Implementation done → route to `/qa`. |
| event `gate.rejected:<X>` | Any hard-gate rejection (already produces `blocked` in `statusOf`). |
| event `stage.entered:<X>` | Drives "when a ticket enters stage X, do …". |
| event `comment.added:<agent>` | Drives "/rev commented", "/arch approved"-style triggers. |

## 4. How loops & conditional routing fall out of the model

- **Loop-back:** `/rev` sets `TO_DEV_BE` → rule `when {label: TO_DEV_BE} → do {route: implement} + {instruct: /be, prompt: "address review findings"}`. When `/be` finishes, the ticket re-enters `code_review`; the loop is the rule firing again. `once:false` allows repeat; a max-iteration guard (`if: iterations < N`) prevents infinite loops.
- **Conditional routing:** two rules with different `when` labels (`TO_DEV_BE` vs `TO_DEV_FE`) routing to different owners = a BPMN XOR gateway expressed as data.
- **Fan-out/parallel:** one rule with `do {fan_out: [security, design]}` = AND gateway; the join is implicit (ticket advances when both branches' gates are satisfied — reusing the existing "all required gates passed" logic).

## 5. Behavioral acceptance criteria (Given/When/Then)

**AC-W1 — Reject loop-back to a developer**
Given a ticket at stage `code_review` with reviewer `/rev`,
When `/rev` sets the label `TO_DEV_BE` (which `/rev` is authorized to set),
Then the ticket is routed to stage `implement`, owner `/be`, `/be` receives the instruct prompt, and the ledger records which rule fired with `by:/rev` and a timestamp.

**AC-W2 — Pattern-in-comment trigger**
Given a rule `when {pattern: "needs rework", in: comment} → do {set_label: TO_DEV_FE}`,
When any comment on the ticket contains the text "needs rework",
Then `TO_DEV_FE` is set on the ticket, and the rule fires at most once per matching comment (no duplicate routing on re-read).

**AC-W3 — Event trigger (gate rejected)**
Given a rule `when {event: gate.rejected:CODE_REVIEWED} → do {route: implement, instruct:/be}`,
When the `CODE_REVIEWED` gate transitions to `rejected`,
Then the ticket is routed back to `implement` and the board shows it as needing developer work (not silently blocked).

**AC-W4 — Parallel fan-out**
Given a ticket entering stage `architecture` and a rule `when {event: stage.entered:architecture} → do {fan_out: [security, design]}`,
When the ticket enters `architecture`,
Then two parallel branches (`security`, `design`) are opened, and the ticket only advances past the join once both branches' required gates are satisfied.

**AC-W5 — User-set label routes to a specific agent**
Given the published `labels:` contract maps `NEEDS_DESIGN.routes_to = design, owner = /ui`,
When an authorized agent sets `NEEDS_DESIGN`,
Then the ticket is routed to the `design` stage owned by `/ui`, and the board's expected-owner reflects `/ui`.

**AC-W6 — An agent setting a label it does NOT own is refused**
Given the contract declares `TO_DEV_BE.settable_by = [/rev, /qa]`,
When `/be` attempts to set `TO_DEV_BE`,
Then the action is refused, no routing occurs, and the refusal is logged with the reason "label not in settable_by for /be" — mirroring the hard-gate refusal discipline.

---

# Q2 — Knowledge scoping (common vs project; sharing across project types)

## 1. Ground truth (already in the codebase)

- Memory payloads already carry `project_id` and `scope ∈ {project, global}`; queries are **AND-combined equality filters** (`store.test.ts`, `recall.test.ts`). Project A's query never returns project B's or global rows; a `scope:global` query returns only global rows. **This is the foundation — Q2 adds dimensions to it, it does not replace it.**
- The hub Base panel reads markdown docs and tags index method (`filename-only` until an embedder exists). Tags would be markdown **front-matter** on those docs.
- `/kai` already runs **propose → human approve → apply**, never auto-applies. The Q2 approval flow reuses this contract exactly.

## 2. Proposed scope + tagging taxonomy

Keep the existing `scope` field (don't break it), but treat it as the **primary axis**, and add orthogonal tag dimensions for cross-type sharing. A knowledge item carries:

| Field | Values | Purpose |
|---|---|---|
| `scope` (existing) | `common` (= today's `global`) · `project` | Primary share boundary. Keep `global` as an accepted alias of `common` for backward compatibility. |
| `project_id` (existing) | the project key | Set when `scope:project`; empty/`common` otherwise. |
| `stack` (new, multi-valued) | e.g. `java`, `python`, `frontend`, `angular`, `flutter`, `any` | Cross-**type** sharing axis. A piece tagged `java` is shared across all Java projects but invisible to a Python project. `any` = applies regardless of stack. |
| `domain` (new, multi-valued) | e.g. `fintech`, `healthcare`, `ecommerce`, `any` | Cross-**domain** sharing axis (a domain rule can be common across stacks). |
| `kind` (new) | `pattern` · `style` · `rule` · `context` | What sort of knowledge this is (lets recall prefer rules over context, etc.). |
| `status` (new, for the propose flow) | `pending` · `approved-common` · `approved-project` · `rejected` | Lifecycle of a proposed item. Only `approved-*` items are recalled. |

**The user supplies scope + tags when adding data.** Defaults when omitted: `scope:project` (safest — least sharing), `stack:any`, `domain:any`, `kind:context`, `status:approved-project` for direct user adds (user is the authority).

## 3. How a piece of knowledge is matched to a project (the recall rule)

A project declares its own `stack` (and optional `domain`) once. Recall for a project returns the **union** of:

```
( scope == common  AND stack ∈ {project.stack, any}  AND domain ∈ {project.domain, any} )
OR
( scope == project AND project_id == this project )
```

Worked examples (these are the answer to "share across project types"):

| Project | Sees | Does NOT see |
|---|---|---|
| **Java project** (`stack:java`) | `common+any`, `common+java`, and its own project rows | `common+python`, another project's rows |
| **Frontend project** (`stack:frontend,angular`) | `common+any`, `common+frontend`, `common+angular`, own rows | `common+java`, `common+python` |
| **Research/investigation project** (`stack:any`) | `common+any` and own rows only | any stack-specific common knowledge (it has no stack) |

This is a strict, additive extension of the existing AND-equality filter model: `scope` + `project_id` already work; `stack`/`domain` become additional filter terms with an `any` wildcard.

## 4. The `/kai` propose → user-approve flow (reusing the existing contract)

`/kai` may **propose** knowledge (patterns/styles/rules it noticed recurring) but **never auto-promotes** — identical to how it already proposes SKILL.md updates.

```
detect → propose (status: pending, with suggested scope + tags)
       → user reviews
       → approve-as-common  | approve-as-project  | reject
```

- `approve-as-common` ⇒ `scope:common`, `status:approved-common`, plus the stack/domain tags the user confirms (so a Java-specific learning becomes `common + stack:java`, not blindly global).
- `approve-as-project` ⇒ `scope:project`, `project_id` of the current project, `status:approved-project`.
- `reject` ⇒ `status:rejected`, retained for audit, never recalled.
- Only `approved-*` items are ever returned by recall; `pending`/`rejected` are inert.

**Promotion (project → common)** is the same gesture applied to an existing project item: the user re-tags it `common` and confirms its stack/domain. This is an explicit, audited human action — never automatic.

## 5. Behavioral acceptance criteria (Given/When/Then)

**AC-K1 — Add with scope**
Given the user adds a knowledge item and tags it `scope:project`,
When it is stored,
Then it is recalled only for the current project (its `project_id`) and never appears in another project's recall or in a `scope:common` query.

**AC-K2 — /kai proposes a common pattern → user approves**
Given `/kai` detects a recurring pattern and proposes it with `status:pending` and suggested `scope:common, stack:any`,
When the user runs approve-as-common,
Then the item's status becomes `approved-common`, it is recalled across all projects whose stack matches, and the proposal trace records who approved it and when.

**AC-K3 — Java project recalls java + common, not python**
Given a `common` item tagged `stack:python` and another `common` item tagged `stack:java`, and a project declared `stack:java`,
When that project performs recall,
Then the `stack:java` and any `stack:any` common items are returned and the `stack:python` item is NOT returned.

**AC-K4 — Promote project knowledge to common**
Given an `approved-project` item in project A,
When the user promotes it to common and confirms `stack:frontend`,
Then it becomes `approved-common, stack:frontend`, is thereafter recalled by every frontend project, and project A still recalls it (common+frontend covers it).

**AC-K5 — Scoping conflict resolution (project overrides common)**
Given a `common` style rule and a `project`-scoped rule that contradicts it for project A,
When project A performs recall,
Then both are returned but the project-scoped item is marked as taking precedence (more specific scope wins), so the consuming agent applies the project rule over the common one.

**AC-K6 — Research project sees only stack-agnostic common knowledge**
Given a research/investigation project with no declared stack (`stack:any`),
When it performs recall,
Then it receives `common + stack:any` items and its own project items only, and no stack-specific (`java`/`python`/`frontend`) common knowledge leaks in.

---

## Assumptions & open items for `/po` / `/arch`

1. **Loop safety is a hard requirement** — rules can chain; a max-iteration guard (`if: iterations < N`) and `once` must exist or reject loops can run forever. (`/arch` to decide the ceiling default.)
2. **Label contract storage** — proposed alongside `workflow.yaml` using the same resolution cascade (project → user → installed → bundled). `/arch` to confirm placement.
3. **`global` vs `common` naming** — the codebase uses `global`; the user uses `common`. Recommend `common` as the canonical term with `global` accepted as an alias to avoid a breaking change to the tested memory payloads.
4. **Stack declaration per project** — needs one new project-level field (`stack`, optional `domain`). Where it lives (project config vs registry) is an `/arch` call.
5. **Recall precedence (AC-K5)** — "more specific scope wins" is proposed; `/po` to confirm this is the desired conflict semantics vs. surfacing both equally.

## Sources / basis
- Internal: `claude/workflow/workflow.yaml`, `hub/lib/state.js`, `hub/lib/stage-map.js`, `claude/memory/src/types.ts`, `claude/memory/test/{store,recall}.test.ts`, `claude/skills/specialized/kai/SKILL.md`, `claude/commands/kai.md`.
- External models referenced (idea-borrowing only): GitHub Actions `on:`/`if:`/`needs:`; Jira Automation `when/if/then`; n8n/Zapier trigger→action; BPMN XOR/AND gateways; IDE conditional breakpoints; label-routing triage bots.
