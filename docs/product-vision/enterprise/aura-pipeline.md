# Enterprise Pipeline View — Design Proposal (Aura)

**Designer:** Aura (`/ui`) — Senior UI/UX Design Architect
**Date:** 2026-06-13
**Status:** DESIGN PROPOSAL (skeptical investigation) — not approved, not implemented. Seeds the five-agent enterprise investigation.
**Scope:** the PIPELINE view-mode only (`shell/tasks-board.component.ts` `@case ('pipeline')` — today's "stage train"). The WORKLIST mode is **good and stays untouched**; this proposal repeatedly defers to it. No code authored here.
**Reuses verbatim:** the `--kb-*` + `--kb-*-soft` status colour system (`visual-spec-aura.md`), the shared `#cardTpl` card, the gate-node shapes (dot / solid-diamond / dashed-diamond), `partitionBoard` / `activeSegmentIndex` / `nextStageInOrder` (`board.ts`), the guarded `ControlPlaneService.advance` write path, the SSE-live projection.

> **One-line thesis.** Stop rendering a four-region *board* (Backlog + train + Done + Off-track) in Pipeline mode — that duplicates the Worklist. Render an actual **CI-style pipeline**: a connected left→right chain of **stage nodes**, each node showing only the tickets *currently at it*, with explicit **gate/approval nodes** between stages, **per-stage status colour**, the **owning agent** in each stage header, and the **active front** of work lit along the chain — exactly what Jenkins Blue Ocean / GitLab CI / GitHub Actions show. Backlog/Done/Off-track become **end-cap reference counts that link to the Worklist**, not card columns.

---

## 0. The honest framing — does a Pipeline view even earn its place? (read this first)

I am skeptical of this view, and the design says so out loud.

**The Worklist is the right default and answers most needs.** For the common DART project — a handful of tickets, most in backlog or done, one or two mid-flow — the Worklist's needs-you-first bands already give the human everything: what wants me, what's moving, what shipped. A second view must not be a worse re-skin of that. The data-derived default already encodes this: Pipeline auto-selects **only when ≥2 stages are simultaneously populated** (`populatedStageCount >= 2`). Keep that rule. The Pipeline is a **power / CI-minded view**, opt-in by default, auto-surfaced only when work is genuinely fanned across stages.

**When the Pipeline genuinely beats the Worklist** (its one job — design for exactly this, nothing more):
- Work is **mid-flow across several stages at once** (architecture has 2, code_review has 1, qa has 3). The Worklist flattens all of these into one "In flight" band; the Pipeline shows the *shape of the flow* — where the front is, where the choke is, which gate is holding the line. That spatial, where-is-the-bottleneck read is the thing a band list cannot give.
- A **human reading pipeline health at a glance**: "everything's green up to code_review, code_review is red — the /rev gate is rejected on ADT-30, that's the wall." A CI engineer reads that in <2s from a pipeline; they read it slowly from a list.
- An **agent advancing work**: when `/be` advances a ticket, the front moves one node along the chain live — the human watches the pipeline progress the way they watch a CI run progress. That is the dual-audience payoff.

**What the Pipeline must NOT try to be** (the skeptical "don'ts"):
- Not a place to browse backlog (the Worklist owns planning).
- Not a place to scroll done work (the Worklist's Recently-done + Done folder own that).
- Not a second home for off-track orphans as *cards* (a count + a jump to the Worklist's red shelf is enough).
- Not a Kanban board you drag cards across (no drag — advance is a guarded, gated write; CI pipelines don't let you drag a build into "passed").

If, after this redesign, a project's Pipeline view is *still* mostly empty most of the time — that is **correct and honest**, and §4 (the quiet state) makes that calm and useful instead of a dead void. We do not inflate the view to look busy.

---

## 1. What an enterprise CI pipeline actually looks like (the reference study)

I studied how the credible tools render a pipeline. The shared grammar:

| Tool | What it renders | What DART should borrow |
|---|---|---|
| **Jenkins Blue Ocean** | Horizontal chain of stage circles connected by edges; colour per stage (green pass / red fail / blue running / grey pending); parallel stages branch vertically. | The connected horizontal chain + per-stage status colour + the lit "front". |
| **GitLab CI** | Stages as columns left→right, each holding **job pills** stacked vertically; status dot per job; manual/approval jobs are a distinct gated pill (a "play"/gate affordance). | **Tickets-at-a-stage as pills inside the stage node**; gates as an explicit affordance between stages. |
| **GitHub Actions** | Job nodes connected by dependency edges; a job "waiting for approval" is an explicit amber **environment-protection node** you click to approve. | The **explicit gate/approval node** between stages — a first-class thing, not a chip hidden on a card. |
| **CircleCI / Azure DevOps / Argo / Tekton** | Stage/step DAG, status colour, click a node → that stage's detail/log; approvals are nodes that block the edge until satisfied. | **Click-into-stage** detail; the gate **blocks the edge** visually (the connector goes red/dashed when the gate is rejected/pending). |

**The distilled DART pipeline grammar (what I'm proposing):**
1. A **single horizontal chain**, left→right, of the active track's **real workflow stages** (drop the literal `backlog` stage and the `done` stage from the chain — see §3).
2. Between two stages sits the **gate node** that governs the *downstream* stage (if any) — the explicit approval the work must pass. No gate → a plain connector.
3. Each **stage node** is a header (owner + count + stage status) over the **tickets currently at that stage**, rendered as the shared `#cardTpl` cards (compact). An empty stage is a **slim pending node on the line**, not a fat empty column.
4. The chain has a **lit active front**: the connector + nodes up to the furthest in-progress stage read "done/passed" tone; the current working node reads "running"; downstream reads "pending". This is `activeSegmentIndex` — already computed — promoted from a faint accent to the primary read.
5. **End caps, not columns:** a left **"From backlog · N"** reference and a right **"Done · N → "** reference, each a single compact tile that **links to the Worklist** (or scrolls the Worklist's band). Off-track is a **single red badge** "⚠ N off-track → " that jumps to the Worklist's off-track shelf. None of these render cards in Pipeline mode.

---

## 2. Anatomy — the connected stage flow

### 2.1 The chain, top to bottom

```
[from backlog · N →]══(stage node)══◇gate══(stage node)══●══(stage node)══[Done · N →]
                       owner+count        owner+count       owner+count
                       └ ticket pills ┘   └ ticket pills ┘   └ ticket pills ┘
```

- The **rail** is one horizontal, non-wrapping flow (the metro-line discipline already in the train — keep `flex-wrap: nowrap`, the continuous `--kb-border` track behind the nodes, `overflow-x: auto` as the genuine-busy fallback only).
- **End caps** (`from backlog`, `Done`) are `flex: 0 0 auto` tiles pinned at the ends; only the **middle chain** scrolls. This is the train's proven layout skeleton — reused, re-purposed.

### 2.2 The STAGE NODE (the core unit — replaces the column)

A stage node is **always present for every chain stage** but renders at one of three densities driven by its load — this is the "suggestion, not a wall of empty columns" idea, made concrete:

| Density | When | Renders |
|---|---|---|
| **Active** (full) | stage holds ≥1 ticket | full header + ticket pills stacked below |
| **Idle** (slim) | stage holds 0 tickets, but is *on the path* | a slim node: the gate/dot marker + stage name (vertical) + `0` — a station the work *will* pass, honestly empty |
| **Done-front** (lit) | stage is behind the active front (work has passed through) | slim node, but marker + connector read the "passed" tone (green/accent), so the chain shows how far work has travelled |

**Stage-node header anatomy (active density)** — this is the enterprise-polish surface:

```
┌─ architecture ─────────── /arch ── ◇ ARCH · pending ── 2 ─┐
│  ┌───────────────────┐                                    │
│  │ ADT-12  Wire SSE   │  ← shared #cardTpl card (compact) │
│  │ /be · [● in prog]  │                                    │
│  └───────────────────┘                                    │
│  ┌───────────────────┐                                    │
│  │ ADT-15  Auth model │                                    │
│  │ /be · [● in prog]  │                                    │
│  └───────────────────┘                                    │
└────────────────────────────────────────────────────────────┘
```

Header, left→right, single dense row (this is the "clean stage header with owner + count + gate state" the brief asks for):
1. **Stage name** — `--kb-text`, 600 weight, the node's identity.
2. **Owner agent** — `[agent] /arch`, `--kb-text-muted`. The agent who *acts* at this stage (from `WorkflowStageView.owner`).
3. **Gate badge** (if the stage is gated) — the **diamond glyph** (solid = hard, dashed = soft, reusing today's `rail-node` SVGs) + the gate name + its rolled-up state word (`pending` / `passed` / `rejected`) toned green/amber/red. This is the stage's gate state read at a glance.
4. **Count** — right-aligned, the number of tickets at the stage. The single most-scanned number.

**Stage status colour (the node-level read — NEW, the enterprise headline).** A stage node carries one *stage status*, derived from the tickets at it + its gate, painted on the node's top border + marker (never colour-only — the gate word + count text carry it too):

| Stage status | Derivation (over the stage's tickets + gate) | Colour |
|---|---|---|
| **blocked / failed** | any ticket at the stage needs-you (rejected hard gate) | red `--kb-danger` |
| **running** | ≥1 ticket `in_progress` and not blocked | accent `--kb-accent` |
| **waiting** | tickets present, none in_progress (waiting on owner/gate) | amber `--kb-warning` |
| **passed** | stage is behind the active front (work moved on) | green `--kb-success` |
| **pending / empty** | on the path, no tickets, ahead of the front | neutral `--kb-text-muted` |

> This is the same precedence the card colours use (needs-you → blocked → in-flight → waiting → done), lifted to the **stage** level. A node's colour is the *worst/most-actionable* state among its tickets — so a single red ticket makes its stage read red, which is exactly the "where's the wall" signal a CI reader wants. Reuse `cardVisualStatus` per ticket and reduce.

### 2.3 The ticket PILL inside a stage node

Reuse the shared `#cardTpl` **verbatim** — one card design everywhere (the BUILD-SPEC's load-bearing reuse rule). In Pipeline mode the cards sit in a tighter vertical stack inside the node (today's `.col__cards`). No new card, no new testid for the card. The card already carries its own status edge/pill (from `data-status`), its gate chip, its needs-you chip, its kebab → **Advance** (the guarded write). So a ticket pill in the pipeline is **independently advanceable** — the agent or human moves it one node along, live.

### 2.4 The GATE / APPROVAL NODE (explicit, between stages — the enterprise differentiator)

Today the gate is a tiny diamond *inside* a station header. Enterprise pipelines make the gate **a node on the line** — the thing the work must pass. Promote it:

- A gate that governs stage *N* renders as a **diamond node on the connector entering stage N** (between *N-1* and *N*). Solid diamond = hard (blocking) gate; dashed diamond = soft (advisory) gate — reusing the exact SVGs already in the train.
- The gate node carries its **state tone**: `passed` → green diamond, the edge past it is solid/lit; `pending` → muted diamond, edge ahead is faint; `rejected` → **red diamond and the connector edge turns red/dashed** — the visual "the line is broken here, work cannot pass". This is the GitHub-Actions "waiting for approval" / GitLab "blocked manual job" affordance.
- **Hard vs soft is honest:** a soft gate never breaks the edge red — it shows a dashed advisory diamond (warn, don't block), matching `refusal: 'soft'`. Only a hard rejected gate breaks the line.
- The gate node is **labelled** (`ARCH_APPROVED`, `SECOPS_APPROVED`, …) and is the click target for the approval: clicking it opens the **task-detail gate panel** for the governing ticket (the existing decidable-gate write path) — no new write. For a stage with several waiting tickets, the gate node shows `◇ ARCH · 1 of 2 passed` and click routes to the stage detail.

> **Skeptic's note:** I will NOT invent a separate "approvals inbox" here — the gate node *is* the approval affordance, and it reuses the detail modal's existing gate-approve write. Adding a parallel approval surface would duplicate the task-detail and the Worklist's needs-you band. One write path.

### 2.5 The active front (the lit chain)

`activeSegmentIndex` already returns the furthest in-progress stage on the rendered rail. Promote it from a faint node accent to the **primary chain read**:
- Connector segments + stage markers **up to and including the active front**: lit in the "passed/running" tone (green for passed stages, accent for the running front).
- Segments **ahead of the front**: faint `--kb-border` (pending track).
- This makes the chain read as "filled from the left up to here" — the universal CI progress read. Colour is reinforced by each node's count + status word, never colour-alone.

---

## 3. ONLY pipeline tickets — what's in vs out (the user's core ask)

The current Pipeline duplicates the Worklist by rendering Backlog cards, Done cards, and Off-track cards. **Stop all three in Pipeline mode.**

| Region | Today (Pipeline) | Proposed (Pipeline) |
|---|---|---|
| **Backlog** | full card column with add button | **Left end-cap tile**: `[stack] From backlog · N →` — a count + a link that switches to Worklist (or scrolls its Backlog band). **No cards.** |
| **Mid-flow stages** | adaptive columns | **The chain** — stage nodes with ticket pills. This is the *only* place cards render in Pipeline mode. |
| **Done** | stacked folder you can expand to list done cards | **Right end-cap tile**: `[check] Done · N →` — a count + a link to the Worklist's Recently-done / Done. **No expandable card list.** (The chain's lit-green front already conveys "work reached done".) |
| **Off-track** | full red card panel with grouped cards | **Single red badge** on the rail: `⚠ N off-track →` linking to the Worklist's off-track shelf. **No cards.** Absent when zero. |

**Why end-caps and not nothing:** a CI pipeline still shows "triggered by / N queued" at the start and "deployed / N artifacts" at the end — context anchors. The counts give the human the *reference* ("8 waiting to start, 27 shipped") without re-listing what the Worklist owns. The link makes the Worklist the single place those cards live. This kills the duplication while keeping the pipeline honest about its boundaries.

**The result:** Pipeline mode renders **only tickets that are at a real, on-track workflow stage** (mid-flow). Everything pre-start, done, or orphaned is a *number that points at the Worklist*.

---

## 4. The honest empty / quiet state (the skeptic's most important screen)

Most DART projects, most of the time, have **0 tickets mid-pipeline**. A pipeline of empty stations is the dead-void failure the Worklist was built to cure. So the quiet Pipeline must be **calm, honest, and useful**, never padded to look busy.

Three quiet states, in order of emptiness:

**A. Chain idle, work waits elsewhere** (backlog or done non-empty, no mid-flow tickets):
- The chain still renders as a **single slim pending line** of idle stage nodes (the stages exist; showing the shape of the pipeline-that-will-run is genuinely useful — it's the "this is the path your work will take" picture, like a CI config preview before the first run).
- Below the line, one calm explainer (reuse today's `rail-middle-empty` copy): *"No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them."* + a **`Switch to Worklist`** button (the work is over there).
- The end-caps still show `From backlog · 8 →` and `Done · 27 →` so the human sees where the work actually is. **This is honest:** the pipeline is genuinely at rest; we say so and point at the activity.

**B. Whole board empty** (no tickets at all): the Pipeline mode is **suppressed** entirely — the whole-board empty invitation owns the screen (*"No tasks yet — the team will create them as work starts."*), and the view-switch is hidden. Same rule as the Worklist. Never show an empty pipeline scaffold on a brand-new project.

**C. One ticket, one stage** (`populatedStageCount < 2`): Pipeline does **not auto-select** (the data-derived default sends this to Worklist). If the user manually picks Pipeline, render the chain honestly with the one lit node — and keep the `Switch to Worklist` escape. We respect the manual choice but never *default* a single-ticket project into a near-empty pipeline.

> **The skeptical payoff:** the quiet Pipeline is the same calm "preview of the path + pointer to where the work is" in every low-activity case — it is never a void, and it never pretends to be busy. The pipeline-shape-preview is the *one* thing the quiet state adds over a blank: it teaches the workflow. That justifies rendering the idle chain instead of nothing.

---

## 5. The Worklist ⇄ Pipeline relationship (no duplication, clear division of labour)

| | **Worklist** (default, owns planning + triage) | **Pipeline** (opt-in, owns mid-flow shape) |
|---|---|---|
| Shows | needs-you, in-flight, backlog, recently-done, off-track — **all tickets** as cards in lifecycle bands | **only mid-flow tickets** as pills on a stage chain; backlog/done/off-track are **counts that link here** |
| Best for | "what needs me / what's the state of everything" | "where is the flow, where's the bottleneck, which gate is holding" |
| Default when | ≤1 stage populated (the common case) | ≥2 stages populated (genuine multi-stage flow) |
| The other view is | a count + link away (the chain end-caps point back here) | a tab away; the Worklist's needs-you band is the same approvals the gate nodes surface |

The two are **one projection, two lenses** (same `partitionBoard` substrate, same cards, same guarded writes). The Pipeline never re-lists what the Worklist owns; the Worklist never tries to draw the flow shape. Each link points at the other for the thing it owns. **No duplication.**

---

## 6. ASCII MOCKS

### 6.1 BUSY pipeline (the view earning its place — multi-stage flow, one gate rejected)

Legend: `●` lit/running marker · `○` pending marker · `◇` gate (solid=hard) · `⬦` soft gate (dashed) · `══` lit connector · `╌╌` broken (rejected) connector · colour in brackets.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for payments-api      14 tasks · [need] 2 need you        View: ( Worklist )( • Pipeline )     │
│ ──────────────────────────────────────────────────────────────────────────────────────────────────────── │
│                                                                                                            │
│ ┌FROM BACKLOG┐  ┌─ architecture ──┐    ◇      ┌─ code_review ───┐   ╌╌╌    ┌─ qa ─────────┐   ○   ┌─DONE──┐ │
│ │ [stack]    │  │ /arch   ◇✓ 2    │  ARCH    │ /rev   ◇✗ 1      │  CODE   │ /qa   ◇· 3   │ verify│[check]│ │
│ │  8  →      │══│ [🟦 running]    │══ ✓pass ══│ [🟥 BLOCKED]    │ ✗reject │ [🟦 running] │══ ○ ══│ 27 →  │ │
│ │ (→Worklist)│  │ ┌────────────┐  │  green   │ ┌────────────┐  │  RED    │ ┌──────────┐ │ pend  │(→Work)│ │
│ │            │  │ │ADT-12 SSE  │  │          │ │ADT-30 Auth │  │  edge   │ │ADT-41    │ │       │       │ │
│ │            │  │ │/be [🟦prog]│  │          │ │/rev[🟥need]│  │ broken  │ │ADT-42    │ │       │       │ │
│ │            │  │ ├────────────┤  │          │ │◇ rejected  │  │  here   │ │ADT-43    │ │       │       │ │
│ │            │  │ │ADT-15 Auth │  │          │ └────────────┘  │         │ └──────────┘ │       │       │ │
│ │            │  │ │/be [🟦prog]│  │          │                 │         │              │       │       │ │
│ │            │  │ └────────────┘  │          │                 │         │              │       │       │ │
│ └────────────┘  └─────────────────┘          └─────────────────┘         └──────────────┘       └───────┘ │
│         ⚠ 1 off-track →   (links to the Worklist's off-track shelf — no cards drawn here)                   │
│                                                                                                            │
│  Read in one glance: green up to architecture (passed) → blue running → RED at code_review (a hard gate    │
│  rejected, the line is broken there: THAT is the wall) → qa running ahead. The bottleneck is spatial.       │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

What the human reads in <2s: *the flow is lit green/blue up to code_review, code_review is red because /rev's hard gate is rejected on ADT-30 — that's the wall; qa is already running ahead on 3.* What the agent does: `/rev` decides the gate in the detail (opened from the red gate node or the card kebab); on advance, the red clears, the edge re-lights, ADT-30 moves to the next node — live, no reload.

### 6.2 QUIET pipeline (the honest at-rest state — work waits in backlog/done)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [info] Tasks for ai-dev-team       12 tasks · (no needs-you chip — all-clear)   View: ( Worklist )( • Pipe)│
│ ──────────────────────────────────────────────────────────────────────────────────────────────────────── │
│                                                                                                            │
│ ┌FROM BACKLOG┐  ○──── ◇ ──── ○ ──── ⬦ ──── ○ ──── ◇ ──── ○ ──── ○         ┌─DONE──┐                        │
│ │ [stack]    │  vision  ARCH  arch   SEC  design  code_r  qa  verify       │[check]│                        │
│ │  3  →      │   0      ◇·    0      ⬦·    0       ◇·     0    0            │  9 →  │                        │
│ │            │                                                              │       │                        │
│ └────────────┘  └──────────── the path your work will take (idle) ───────┘ └───────┘                        │
│                                                                                                            │
│        No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them.            │
│                                      [ Switch to Worklist ]                                                 │
│                                                                                                            │
│  Honest: the pipeline is at rest. The chain previews the workflow path; the end-caps say where the work    │
│  actually is (3 queued, 9 shipped). NOT a void — a calm preview + a pointer. Never padded to look busy.     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Accessibility, colour, motion

**Colour (additive, never the only signal — carries the visual-spec contract unchanged):**
- Stage status, gate state, and the active front are each carried by **glyph + text + colour** simultaneously. The stage node header always shows the gate **state word** (`pending`/`passed`/`rejected`) and the **count**; the marker shape (dot vs solid-diamond vs dashed-diamond) distinguishes no-gate / hard / soft **without colour**. Strip all colour and the pipeline still reads: stage names, counts, gate words, diamond shapes, and "running/blocked" labels.
- Reuse the `--kb-*` saturated hues + `--kb-*-soft` fills already defined for both themes. The broken (rejected) connector is **red AND visually dashed** — shape carries it for colour-blind users, not hue alone.
- Contrast: stage-status colour sits on node borders/markers (UI components, ≥3:1); all node text stays `--kb-text` / `--kb-text-muted` (≥4.5:1) — never tint the stage name or ticket title.

**Keyboard / AT:**
- The chain is a `role="list"` of stage `role="listitem"` nodes; keep the existing roving `←/→` across nodes (`data-col-index` / `onColumnKeydown`) — already implemented, extend to the gate/end-cap nodes.
- Each gate node is a real `<button>` (≥24px, ≥44px coarse) opening the detail gate panel; `aria-label` speaks the gate name + state ("ARCH_APPROVED gate, rejected, activate to review").
- Each stage node has an `aria-label` like *"Stage architecture, /arch, 2 tasks, gate ARCH_APPROVED passed, running"* — the same picture the sighted glance gets, in words. (Extend today's `stationLabel`.)
- End-caps and the off-track badge are real links/buttons that move focus to the Worklist target.

**Motion (reduced-motion-safe via existing `--kb-dur-*`, zeroed in one place):**
- When an agent advances a ticket, the **front advances**: the just-passed connector lights and the ticket pill arrives in the next node — reuse the existing `card-arrive` keyframe + `[data-motion]` host attr. Under `prefers-reduced-motion: reduce` the state swaps instantly (the lit front jumps).
- A rejected gate **does not pulse or flash** (Apex honesty: no fake urgency). It is statically red + dashed + the word "rejected". No indeterminate shimmer anywhere — a CI pipeline at rest is still, not animated.

---

## 8. Enterprise NORTH-STAR (brief) + Workflow / Knowledge flags

**North-star (one paragraph).** To feel commercial, DART needs the *whole tool* to read as **one dense, aligned, status-legible control plane** — not three differently-styled screens. That means: a single shared shell (consistent header/rollup/tabs, the same `--kb-*` tokens and `#cardTpl` everywhere), **information density** (small type, tight rhythm, real counts over whitespace — the CI-tool feel), **status as the dominant visual property** (the colour system already shipped on cards, lifted to stages and gates here), and a coherent **multi-project + epics/flows** framing so a developer controls many projects and many tracks from one consistent surface. Enterprise credibility is **consistency + density + legible status under live updates**, not decoration. Every view must answer "what needs me, where's the flow, what's blocked" in one glance and let a human OR an agent act on it through the same guarded writes.

**One-line north-star:** *Status is the loudest thing on every screen; everything else is dense, aligned, consistent, and live — one control plane, not three apps.*

**Workflow builder — to reach the bar (flag for the follow-up investigation):**
- It must render the workflow as the **same left→right gated chain grammar** as this Pipeline (stages + gate diamonds), but in an *edit* mode — so the builder and the runtime pipeline are visibly the same object (you design the path you then watch work flow down). Today's builder is a form/list; that breaks the "one control plane" feel. Drag-to-reorder stages, click-a-connector-to-add-a-gate, with the hard/soft diamond shapes shared verbatim.

**Knowledge views — to reach the bar (flag for the follow-up investigation):**
- Knowledge needs the same **dense, status-legible, multi-project framing**: a searchable, consistently-carded surface (reuse the card/token language) where directives/notes/memory read with the same density and the same "what's fresh / what needs me" colour cues — not a plain document dump. The `dart-ask` / `dart-directives` read-model should surface as first-class, scannable cards in the shell, not a separate-feeling page.

---

## 9. Handoff notes for `/fe` (when/if this is approved)

This is **additive over the existing Pipeline block** — it re-purposes the train skeleton, it does not rewrite the board.
1. **Keep the Worklist mode 100% untouched** (its tests stand). All change is inside `@case ('pipeline')`.
2. **Drop the card-rendering** of Backlog / Done-folder / Off-track in Pipeline mode; replace with the three **reference end-caps/badge** (count + link to Worklist). Keep `backlog-count` / `done-folder-count` semantics as the counts; the linking control is new (`pipeline-backlog-ref`, `pipeline-done-ref`, `pipeline-offtrack-ref`).
3. **Stage node**: add a stage-status derivation (reduce `cardVisualStatus` over the node's tickets + gate) → `data-stage-status` on the node for the border/marker colour; promote the gate from in-header diamond to a **gate node on the connector** with its state tone + the broken-edge-on-hard-reject rule.
4. **Active front**: promote `activeSegmentIndex` from faint accent to the primary lit-connector read.
5. **Quiet state**: reuse `rail-middle-empty` copy + `Switch to Worklist`; render the idle chain as the slim pending-line preview (state A); suppress entirely on whole-board-empty (state B); keep the `populatedStageCount >= 2` auto-default.
6. **No new write path.** Gate nodes and card kebabs route through the existing `ControlPlaneService.advance` / task-detail gate writes. No drag.
7. **Keep all existing Pipeline testids that remain meaningful** (`pipeline-root`, `pipeline-train`/rename to `pipeline-chain` is a breaking testid change — discuss with `/e2e` before renaming; prefer keeping `pipeline-train`), `column-stage-*`, `rail-node-*`, `rail-middle-empty`, `card-*`, the roving `data-col-index` contract.
8. **TDD**: stage-status precedence (one red ticket → red node); rejected hard gate → broken connector, soft gate never breaks it; Pipeline renders **no** backlog/done/off-track cards (only counts+links); quiet-state renders the idle chain + escape, suppressed on empty board; active-front index lights the right connectors; colour-additive guard (every status has glyph+word).

**Status: PROPOSAL** — pending the five-agent enterprise review (`/arch` feasibility on stage-status derivation + gate-node write routing; `/po` on scope vs the Worklist; `/secops` no-new-write-path confirmation) before any `DESIGN_APPROVED`.
