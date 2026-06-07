# UX/UI Design — Multi-Project AI Dev Team Studio

**Designer:** Aura (`/ui`)
**Date:** 2026-06-07
**Status:** Draft → In Review
**Scope:** Design only (wireframes + spec). No production code. Illustrative ASCII/HTML mockups inline.
**Theme basis:** Extends the existing zero-dependency dark **Hub** theme (`hub/public/index.html`).

---

## 0. Grounding — what I'm honouring

I read the existing Hub (`hub/public/index.html`) and the design-foundations canon. This design **extends** the established visual language rather than reinventing it:

- **Palette canon (kept):** `--bg:#0d1117`, `--panel:#161b22`, `--panel2:#1c2230`, `--line:#283040`, `--txt:#e6edf3`, `--dim:#8b949e`, **accent `--accent:#6e56cf`** (purple). GitHub-dark derived.
- **Patterns kept:** status label = *colour + glyph + text* (never colour alone); gate chips with **hard=solid / soft=dashed** left border; per-stage hue tokens; `live` pulse dot; modal with sticky header; toast rail top-right.
- **New, additive:** a canvas surface for the workflow builder, a "conveyor" task metaphor, and a knowledge-base "recall" indicator — all built from the existing tokens so a single FE dev can ship them without new dependencies.

> The product is a **cross-platform desktop-first studio** (Tauri/Electron-class shell or a local web app) that runs the AI dev team across **many** projects. The existing Hub becomes one panel *inside* a project, not the whole app.

---

## 1. Information Architecture

```
AI Dev Team Studio
│
├── Projects Home  (the launcher — app root)
│   ├── Project card grid  (connected projects)
│   ├── + Connect Project   → folder picker → analysis pipeline → ready
│   └── Settings / global (agents roster, theme, model config)   [secondary]
│
└── Project Shell   (entered by clicking a project card)
    ├── Title + auto-collected description (header)
    ├── Left rail: ◧ Workflow   ☑ Tasks   ▤ Base   (+ Overview)
    │
    ├── WORKFLOW   — visual orchestration builder
    │   ├── Node palette (left)
    │   ├── Canvas (center)  — nodes, edges, loops, conditionals, bg agents
    │   ├── Node inspector (right, contextual)
    │   └── Run bar (top)  — Run / Step / Stop + live trace state
    │
    ├── TASKS      — agent-managed human-readable board
    │   ├── Concept A: Refined status board (RECOMMENDED default)
    │   ├── Concept B: Conveyor / "tickets riding to their addressee" (playful)
    │   ├── Ticket detail → agent-written history timeline
    │   └── Archive (browsable full history of done tickets)
    │
    └── BASE       — knowledge documents the agents must follow
        ├── Doc list (code rules, policy, copyright, style, context)
        ├── Doc editor (text now; images/URLs = future)
        └── Recall indicator (indexed / active-in-memory / semantically recalled)
```

**Navigation model.** Three areas (**Workflow / Tasks / Base**) are a **persistent left rail inside the Project Shell**, not tabs and not cards-only. Rationale below (§3.0). A breadcrumb `Projects ▸ {Project} ▸ {Area}` lets the user climb back to the launcher.

**Why a rail, not tabs or cards:**
- These three areas are **co-equal, frequently re-visited, and cross-referenced** (you edit a Base doc, then watch the Workflow obey it, then check a Task). Tabs hide siblings and lose state-at-a-glance; a rail keeps all three one click away and shows per-area status badges (e.g. "Workflow: running", "Tasks: 3 awaiting human").
- Cards-as-launcher would add a pointless extra hop on every switch.
- A landing **Overview** (rail item 0) gives the cards-style summary for first entry, so we keep the "scannable" benefit of cards without the navigation tax.

---

## 2. Flow 1 — Projects Home (launcher)

### 2.1 Wireframe — populated

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ● AI Dev Team · Studio            [ search projects ⌕ ]      ◑ theme   ⚙      │  header (gradient, accent dot)
├──────────────────────────────────────────────────────────────────────────────┤
│  YOUR PROJECTS                                            ▦ grid  ▤ list       │
│                                                                                │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌──────────────────┐ │
│  │ ◧ payments-api      ⋯  │  │ ◧ marketing-site    ⋯  │  │      ＋          │ │
│  │ Spring Boot · Java 21  │  │ Next.js · TS · Tailwind│  │                  │ │
│  │ "VAT-aware billing &   │  │ "Marketing & landing   │  │  Connect a       │ │
│  │  invoicing service for │  │  pages with CMS-driven │  │  project folder  │ │
│  │  UK merchants."        │  │  content."             │  │                  │ │
│  │                        │  │                        │  │  Pick a folder → │ │
│  │ ◷ updated 2h ago       │  │ ◷ updated yesterday    │  │  we analyse it   │ │
│  │ ▶ workflow idle        │  │ ▶ workflow running ●   │  │                  │ │
│  │ ☑ 12 tasks · 2 ⧗human  │  │ ☑ 4 tasks              │  │                  │ │
│  └────────────────────────┘  └────────────────────────┘  └──────────────────┘ │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

A project card shows: **icon + title**, detected **stack chips**, **auto-collected description** (2–3 lines, clamped), last-updated, and **live mini-status** (workflow state + task counts incl. how many await a human). The dashed **+ Connect** card is always the last cell.

### 2.2 The connect → analyse → ready sequence

This is a **multi-state async flow**. The card itself is the progress surface (in-place), so the user keeps context.

**State 1 — Folder picker (native OS dialog):**
```
┌──────────────────────────────┐
│  Connect a project           │
│  ┌────────────────────────┐  │
│  │  Choose folder…    📁  │  │  ← opens native picker (cross-platform)
│  └────────────────────────┘  │
│  We never upload your code.  │  ← trust line (local analysis)
│  Analysis runs on this machine.
└──────────────────────────────┘
```

**State 2 — Analysing (the card flips to a progress state):**
```
┌────────────────────────────────┐
│ ◧ /Users/me/dev/payments-api   │
│                                 │
│  Analysing project…             │
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░  62%         │  ← determinate when steps known
│                                 │
│  ✓ Detected stack (Java/Spring) │  ← checklist streams in
│  ✓ Read README & docs           │
│  ◐ Summarising codebase…        │  ← active step animates
│  ○ Indexing for agent memory    │
│                                 │
│  [ Cancel ]                     │
└────────────────────────────────┘
```
- Progress is a **step-checklist**, not just a bar — each detection step is a line that resolves ✓. This makes a long task feel honest and inspectable.
- If total steps are unknown early, show an **indeterminate shimmer** bar, then switch to determinate once the plan is known.
- **Reduced motion:** shimmer → static striped bar; checklist still updates.

**State 3 — Ready (card settles into its final form):**
The card cross-fades to the populated card in §2.1, title + auto-description filled. A one-time toast: `payments-api ready — open it →`.

**State 4 — Error / partial:**
```
┌────────────────────────────────┐
│ ◧ payments-api          ⚠       │
│  Couldn't fully analyse         │
│  Read 80% — embeddings step     │
│  failed (model offline).        │
│  [ Retry ]   [ Open anyway ]    │
└────────────────────────────────┘
```
Never block entry on a soft failure: the user can **Open anyway** and the Base view shows which docs are not yet indexed.

### 2.3 Empty state (first run)

```
        ◧
   No projects yet
   Connect a folder and the team will
   read it, summarise it, and get to work.

   [ ＋ Connect your first project ]
```
Illustration (simple line glyph) + one-sentence value prop + single primary CTA. Per anti-pattern rule: never just "No data".

---

## 3. Flow 2 — Per-Project Shell

### 3.0 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ Projects   ◧ payments-api  ·  "VAT-aware billing & invoicing service…"  ⚙ ●│ header
├────────────┬─────────────────────────────────────────────────────────────────┤
│            │                                                                  │
│  ⊞ Overview│                                                                  │
│  ◧ Workflow│            ( active area renders here )                          │
│    running●│                                                                  │
│  ☑ Tasks   │                                                                  │
│    12 ·2⧗  │                                                                  │
│  ▤ Base    │                                                                  │
│    8 docs  │                                                                  │
│            │                                                                  │
│  ──────────│                                                                  │
│  agents ▸  │  ← collapsible roster (who's on the team / online)              │
└────────────┴─────────────────────────────────────────────────────────────────┘
```

The **rail** carries live badges so the project's pulse is visible from any area. The header always shows **title + truncated description** (full description in a tooltip / Overview). The `●` top-right is the existing live-connection dot from the Hub.

**Overview** (rail item 0) is the friendly landing: three big summary cards (Workflow snapshot, Tasks snapshot, Base snapshot) that double as shortcuts — this preserves the "clickable cards" idea the brief allowed, while the rail keeps them reachable thereafter.

```
Overview:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ◧ WORKFLOW   │ │ ☑ TASKS      │ │ ▤ BASE       │
│ 1 running    │ │ 12 open      │ │ 8 docs       │
│ token at /rev│ │ 2 ⧗ need you │ │ all indexed ✓│
│ Open →       │ │ Open →       │ │ Open →       │
└──────────────┘ └──────────────┘ └──────────────┘
```

**Responsive:** below `lg` (1024px) the rail collapses to an icon strip (44px targets); below `md` it becomes a bottom nav (thumb-zone), and the header description collapses to title-only with an info button.

---

## 4. Flow 3 — WORKFLOW view (visual builder)

Reference language: **n8n / React Flow** node-graph editors. Three regions: **palette · canvas · inspector**, plus a **run bar**. It is a visual program, so it gets program affordances (run, step, trace, breakpoints-as-pauses).

### 4.1 Wireframe — editing

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◧ Workflow: "Feature delivery"      ▶ Run   ⏭ Step   ⏹ Stop    💾 saved  ⤢ fit │ run bar
├───────────┬──────────────────────────────────────────────────┬─────────────────┤
│ PALETTE   │  CANVAS  (dot grid, pan/zoom)                     │ INSPECTOR       │
│           │                                                   │  ▸ Node: /rev   │
│ ▸ Triggers│   ┌──────────┐                                    │                 │
│  ⚡ On task│   │⚡ Trigger │                                    │  Title          │
│  ⚡ On push│   │ new task │                                    │  [ Code review ]│
│  ⌖ Manual │   └────┬─────┘                                    │                 │
│           │        │                                          │  Agent          │
│ ▸ Agents  │        ▼                                          │  [ /rev      ▾ ]│
│  ◆ /arch  │   ┌──────────┐      ┌──────────┐                  │                 │
│  ◆ /be    │   │◆ /be     │─────▶│◆ /rev    │                  │  Instructions   │
│  ◆ /fe    │   │ implement│      │ review   │◀──┐              │  [ enforce Base │
│  ◆ /rev   │   └──────────┘      └────┬─────┘   │ loop         │   rules; block  │
│  ◆ /qa    │                          │         │ "changes     │   on Sev≥High ] │
│           │                    ◇ pass?│         │  needed"     │                 │
│ ▸ Logic   │                   ┌──────┴──────┐  │              │  Outputs        │
│  ◇ If/cond│                 yes│           no│──┘              │  ◦ pass  ◦ fail │
│  ↺ Loop   │                    ▼                              │                 │
│  ⏚ Merge  │              ┌──────────┐                          │  On error ▾     │
│           │              │◆ /qa     │                          │  [ Retry × 2  ] │
│ ▸ Backgrnd│              │ test     │                          │                 │
│  ☾ Watcher│              └──────────┘                          │  ⌫ Delete node  │
│  ☾ Collect│                                                   │                 │
│           │   ☾ bg: "security-watch" runs on every commit ⟳   │                 │
└───────────┴──────────────────────────────────────────────────┴─────────────────┘
```

**Node taxonomy (colour-coded with the existing stage hues):**

| Class | Glyph | Hue token | Meaning |
|---|---|---|---|
| Trigger / Event | ⚡ | `--stg-vision` blue | starts a run (on task, on push, manual, schedule) |
| Agent | ◆ | per-agent (e.g. `/rev` → `--stg-review` violet) | a team member does work |
| Conditional | ◇ | `--stg-approve` amber | branch on a predicate; labelled edges (yes/no/case) |
| Loop / Return | ↺ | `--stg-approve` amber | edge back to an earlier node (e.g. rev→be on "changes needed") |
| Background agent | ☾ | `--stg-sec` orange (dashed border) | runs on a **condition**, not in the main token path (watch / collect) |
| Merge / Join | ⏚ | grey | re-converge branches |

- **Edges** are bezier curves; conditional edges carry a **pill label** (`yes` / `no` / `Sev≥High`). Loop edges are drawn **dashed** and routed around so a "return to step" reads as a loop, not a forward arrow.
- **Background agents** sit in a tinted **lane/band** at the canvas bottom with a dashed border, signalling "not on the main path — fires on its condition." This visually separates orchestration (the token path) from ambient watchers.
- **Node inspector** (right) is contextual: title, agent select, free-text **instructions** (these can reference Base docs), typed **outputs** (ports), **on-error** policy (retry/skip/halt), and delete. Selecting an **edge** swaps the inspector to edge config (condition expression, label).
- **Palette** is grouped + searchable; drag-to-canvas **or** click-to-insert-after-selected (keyboard-friendly — dragging is not the only way, satisfying WCAG 2.5.7).

### 4.2 Creating / editing / deleting (interactions)

| Action | Pointer | Keyboard | Feedback |
|---|---|---|---|
| Add node | drag from palette / click palette item | `⏎` on focused palette item inserts after selection | node fades in (`@starting-style`), auto-selected |
| Connect | drag from output port to input port | focus a port → `⏎` → arrow-key to target → `⏎` | edge draws; invalid target shows red ghost |
| Add loop | drag edge from later node back to earlier | same port flow | dashed routed edge + "↺ loop" label |
| Add conditional | drop ◇ node; it exposes yes/no ports | — | edges from ◇ require labels |
| Edit | click node → inspector | `Tab` to node, `⏎` opens inspector | live-updates node chrome |
| Delete | select + `⌦` / inspector button | `⌦` | confirm only if node has children |
| Pan / zoom | space-drag / scroll+⌘ | arrow keys pan, `+`/`-` zoom, `0` reset | minimap + `⤢ fit` |

### 4.3 Live-run state (the headline feature)

When **Run** is pressed, the canvas enters **trace mode**. The user must always be able to answer "*which agent is active and where is the token?*".

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◧ Workflow · ▶ RUNNING   ⏸ Pause  ⏹ Stop      elapsed 00:42   ●live            │
├───────────┬──────────────────────────────────────────────────┬─────────────────┤
│ RUN LOG   │                                                   │ ACTIVE NODE     │
│ 00:00 ⚡   │   ┌──────────┐                                    │  ◆ /rev         │
│  trigger  │   │⚡ trigger │ ✓ done                             │  ● working      │
│ 00:03 ◆be │   └────┬─────┘                                    │  "Reviewing diff│
│  start    │        ▼                                          │   against Base  │
│ 00:31 ◆be │   ┌──────────┐  done                              │   code-rules…"  │
│  done ✓   │   │◆ /be     │ ✓                                  │                 │
│ 00:31 →rev│   └────┬─────┘                                    │  ▸ live output  │
│ 00:31 ◆rev│        ▼   ●←── token (glowing dot travels edge)  │  ┌────────────┐ │
│  working… │   ┌──────────┐                                    │  │ found 2    │ │
│           │   │◆ /rev    │ ◉ ACTIVE  (accent halo, pulsing)   │  │ issues:    │ │
│           │   └────┬─────┘                                    │  │ • missing  │ │
│           │     ◇ pass?                                       │  │   test…    │ │
│           │   ┌────┴────┐                                     │  └────────────┘ │
│           │  ○ /qa     ○ (dimmed — not yet reached)           │  ⏸ pause here   │
│           │   └─────────┘                                     │                 │
└───────────┴──────────────────────────────────────────────────┴─────────────────┘
```

Live-run visual grammar:
- **The token** = a glowing accent dot that **animates along the active edge** from the completed node to the next. It's the literal "where are we" indicator. (Reduced motion: token jumps and the edge briefly highlights instead of sliding.)
- **Active node** = accent **halo + slow pulse** (reuses the Hub `live` pulse) and a `◉ ACTIVE` badge. **Done** nodes get a green check + 70% opacity. **Pending** nodes are dimmed (38%). **Failed** = red ring + ✕.
- **Run log** (left, replaces palette during a run) is a timestamped stream you can click to recentre the canvas on that node.
- **Active-node inspector** (right) streams the agent's **live output/thoughts** and offers **Pause here** (a soft breakpoint) so a human can inspect before the token moves on.
- **Background agents** firing show a brief pulse on their lane chip ("☾ security-watch triggered") without stealing the main token.
- **Conditionals** resolve visibly: the chosen edge lights, the rejected edge stays grey, with the evaluated label shown (`pass? → yes`).

**Run states:** `idle → running → (paused) → done | failed | stopped`. Each has a distinct run-bar treatment (idle = neutral, running = accent pulse, failed = red banner with "jump to failure").

---

## 5. Flow 4 — TASKS view (two concepts)

An **agent-managed, human-readable** board. Tickets carry the **full agent-written history** (what `/rev` found, what `/be` did). Click → history timeline. Sortable by status. Done → archive (browsable). The Hub already has a board + ticket modal + comment timeline — I extend that canon, then offer a playful alternative.

### Concept A — Refined Status Board  ★ RECOMMENDED (default)

A calm, dense, sortable Kanban that builds directly on the existing Hub board. Optimised for *reading what the agents did* and spotting *what needs a human*.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☑ Tasks   sort: [Status ▾]  filter: [⧗ needs human]  view: [Board][List]  🗄 │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────────┤
│ BACKLOG  3   │ IN PROGRESS 2│ ⧗ NEEDS YOU 2│ REVIEW    1  │ DONE        ⟶🗄   │
│              │              │              │              │                  │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐     │
│ │PAY-14    │ │ │PAY-09 ◆be│ │ │PAY-07 ⧗  │ │ │PAY-05◆rev│ │ │PAY-02 ✓  │     │
│ │VAT round │ │ │ Refund   │ │ │ Approve  │ │ │ Invoice  │ │ │ Currency │     │
│ │-ing rule │ │ │ endpoint │ │ │ schema?  │ │ │ PDF gen  │ │ │ config   │     │
│ │● waiting │ │ │▓▓▓▓░ 70% │ │ │ /arch    │ │ │ 2 notes  │ │ │ archived…│     │
│ │💬 3      │ │ │💬 6 last:│ │ │ asks you │ │ │💬 8      │ │ └──────────┘     │
│ └──────────┘ │ │ "/be: …" │ │ │[Approve] │ │ └──────────┘ │  + 23 in 🗄       │
│              │ └──────────┘ │ │[Changes] │ │              │                  │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────────┘
```

- Each card: **ID + status (colour+glyph+text)**, title, **current agent badge** (◆/be), a **last-comment preview** ("the agent's voice"), **💬 count**, and inline **human-action buttons** when the ticket is in **⧗ Needs You** (Approve / Request changes) so a human can unblock without opening it.
- **Sortable** by status (column order), and a **List view** toggle sorts a flat table by any column (status, agent, updated). Filters: "needs human", by agent.
- **Done** column has a **⟶🗄 archive** affordance; finished tickets slide into the archive after a grace period (undo toast).

**Ticket detail — the agent-written history timeline** (extends the Hub modal):

```
┌───────────────────────────────────────────────┐
│ PAY-05 · Invoice PDF generation        ✕       │
│ ● in review   ◆ /rev   updated 4m ago          │
├───────────────────────────────────────────────┤
│ DESCRIPTION                                     │
│ Generate a compliant PDF invoice per order…    │
│                                                 │
│ HISTORY  (agent-written)                        │
│  ┌─ ◆ /be · implemented · 1h ago ────────────┐ │
│  │ Added PdfInvoiceService; covers VAT lines, │ │
│  │ 14 unit tests green. Followed Base doc      │ │
│  │ "invoice-format". 🔗 recalled               │ │  ← shows which Base doc was used
│  └────────────────────────────────────────────┘ │
│  ┌─ ◆ /rev · review · 4m ago ─────────────────┐ │
│  │ 2 findings:                                 │ │
│  │ • Sev-Med: rounding uses float, Base rule   │ │
│  │   "money-as-minor-units" requires integer.  │ │
│  │ • Nit: extract magic number.                │ │
│  │ Verdict: CHANGES NEEDED → back to /be        │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  [ Add human note ]                  🗄 Archive  │
└───────────────────────────────────────────────┘
```
Each history entry is **attributed to an agent**, time-stamped, kind-tagged (implemented / review / test / note), and may show a **🔗 recalled** chip linking the Base doc the agent followed — closing the loop with the Base view. Humans can add notes but the timeline is primarily the agents' running narrative. This is the canonical "full history" requirement, and it persists into the archive.

### Concept B — The Conveyor ("tickets riding toward their addressee")  ◐ playful

A game-like spatial metaphor: tickets are **parcels on a conveyor belt** moving left→right toward the **agent station** that owns the next step. When `/be` finishes, the parcel visibly **slides to the `/rev` station**; when a human is the addressee it rolls into the **You** bay and waits with a gentle bob.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☑ Tasks · Conveyor          ‖ pause belt   ⤳ speed   [Board view ⇄]    🗄     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  STATIONS:  ◆/be      ◆/rev      ◆/qa        ☾watchers        ⧗ YOU            │
│            ┌────┐    ┌────┐     ┌────┐                        ┌────┐           │
│            │ 🛠 │    │ 🔍 │     │ 🧪 │                        │ 🙂 │           │
│            └─▲──┘    └─▲──┘     └─▲──┘                        └─▲──┘           │
│   ══════════╪═════════╪══════════╪══════════════════════════════╪══════►       │
│   ▭PAY-09   ▭PAY-05               ▭PAY-12                      ▭PAY-07          │
│   "refund"  "PDF→rev"            "to qa"                       "needs you"      │
│    ▓▓░ 70%   ➜ arriving           waiting                       (bobbing) ⧗     │
│   ══════════════════════════════════════════════════════════════════════►      │
│                                                                                │
│  A parcel = a ticket. It rides to the station of whoever acts next.            │
│  Tap a parcel → its history. Done parcels drop off the end → 🗄 archive bin.   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Spatial status:** position on the belt *is* the status — no separate column needed. The **YOU** bay makes "the team is waiting on me" unmissable (parcel bobs, soft glow).
- **Delight + feedback:** hand-off = parcel glides to the new station with a little settle (spring easing). Done = parcel drops into the archive bin with a satisfying tuck.
- **Same data, same detail:** tapping a parcel opens the **identical history timeline** from Concept A — the metaphor is a skin over the same model.
- **Honesty guardrails:** motion respects `prefers-reduced-motion` (parcels teleport with a highlight instead of sliding); a **Board view ⇄** toggle is always one tap away for users who want density over delight.

### Recommendation

**Ship Concept A (Refined Board) as the default; ship Concept B (Conveyor) as a selectable "Conveyor view" toggle** on the same data model.

- A is the safer daily driver: dense, sortable, scannable, accessible, and reuses the Hub board the team already knows.
- B is a genuine differentiator and matches the user's instinct ("tickets riding toward their addressee"), but a belt is lower information-density and risks novelty-fatigue as the primary surface.
- Because both render the **same tickets + same timeline**, building A first and B as a view-switch is low marginal cost for one FE dev (shared data layer, two presentational components). The conveyor is "the demo wow," the board is "the workhorse."

---

## 6. Flow 5 — BASE view (knowledge manager)

Where humans curate the documents agents **must follow** (code rules, policies, copyright, style, project context). Add/edit/remove **text** docs now; images/URLs later (noted as future). Each doc shows whether it is **indexed / active in memory**, and when an agent **semantically recalls** it.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▤ Base · Knowledge the team follows        [ + Add document ▾ ]     ⌕ search   │
├──────────────────────────┬───────────────────────────────────────────────────┤
│ DOCUMENTS            8    │ EDITING: code-rules                                │
│                          │ ┌───────────────────────────────────────────────┐ │
│ ▸ Code & quality         │ │ # Code rules                                  │ │
│  • code-rules    ✓◉ recl │ │ - Money as minor units (integers), never float│ │
│  • test-policy   ✓       │ │ - Public methods need JSDoc facts-only        │ │
│ ▸ Legal & brand          │ │ - …                                           │ │
│  • copyright     ✓       │ │                                               │ │
│  • style-guide   ✓       │ │ (plain-text / markdown editor)                │ │
│ ▸ Context                │ │                                               │ │
│  • project-ctx   ◐ index…│ └───────────────────────────────────────────────┘ │
│  • glossary      ✓       │                                                   │
│  • invoice-format✓◉ recl │ STATUS:  ✓ Indexed · ◉ Active in memory            │
│  • roadmap       ⚠ failed│ Recalled 6× this week · last by /be on PAY-05      │
│                          │ [ Save ]  [ Re-index ]  [ Delete ]                 │
│ ── future ───────────────│                                                   │
│  🖼 images  🔗 URLs  (soon)│ ⓘ Edits re-index automatically; agents pick up    │
│                          │    changes on their next run.                     │
└──────────────────────────┴───────────────────────────────────────────────────┘
```

**The "semantically recalled" indicator** — a small but important trust signal, with three explicit states:

| State | Glyph | Token | Meaning |
|---|---|---|---|
| Indexed | ✓ | `--st-pass-fg` green | embedded & searchable, ready for recall |
| Active in memory | ◉ | accent purple | loaded into the current agent-memory context |
| **Recalled** | `◉ recl` + pulse | accent, brief pulse | an agent *just used* this doc on a task (links to the ticket) |
| Indexing | ◐ | `--st-pend-fg` amber | embedding in progress (shimmer) |
| Failed | ⚠ | `--st-rej-fg` red | needs re-index (action button) |

- When an agent recalls a doc during a run, the doc row **pulses `◉ recl`** and links to the **ticket history entry** where it was used (the same 🔗 recalled chip seen in Tasks) — so the human can see *the rules are actually steering the work*, not decorative.
- **Add document** menu: `Text / Markdown` (active) + greyed `Image (soon)`, `URL (soon)` with a "Notify me" toggle — sets the future expectation without building it.
- **Editor** is a plain markdown textarea with live save + auto re-index. Deleting prompts a confirm (it changes agent behaviour). Empty state: "No knowledge yet — add the rules your team must follow (start with code style or project context)."

---

## 7. Component Inventory

Built from the existing Hub tokens; reusable across all views.

**Atoms**
`StatusLabel` (colour+glyph+text) · `AgentBadge` (◆ + role, dashed=expected) · `GateChip`/`RecallChip` (solid=hard/active, dashed=soft) · `StackChip` · `IconButton` (≥24/44px) · `ProgressBar` (determinate/indeterminate shimmer) · `StepChecklist item` · `Toast` · `LiveDot` (pulse) · `Tooltip`.

**Molecules**
`ProjectCard` (+ its `AnalysingCard` and `ErrorCard` states) · `ConnectCard` · `TicketCard` (board) · `Parcel` (conveyor) · `CommentEntry` (attributed, kind-tagged) · `PaletteItem` · `RunLogRow` · `DocРrow` (with recall state) · `SortControl` · `FilterChip`.

**Organisms**
`ProjectGrid` · `ProjectShellRail` (with live badges) · `OverviewCards` · `WorkflowCanvas` (nodes/edges/minimap) · `NodePalette` · `NodeInspector` / `EdgeInspector` · `RunBar` · `RunLogPanel` · `TaskBoard` (Concept A) · `ConveyorBelt` (Concept B) · `TicketTimeline` (modal) · `BaseDocList` · `BaseDocEditor` · `Archive`.

**Templates / Pages**
`ProjectsHome` · `ProjectShell` (Overview / Workflow / Tasks / Base) · `Modal/Sheet` shell (reused for ticket detail & confirms).

**Node types (Workflow):** `TriggerNode ⚡` · `AgentNode ◆` · `ConditionalNode ◇` · `LoopEdge ↺` · `BackgroundAgentNode ☾` · `MergeNode ⏚`.

---

## 8. Interaction & State Model

Every async surface must define **empty / loading / analysing / error / live**. Summary:

| Surface | Empty | Loading | Analysing | Error | Live / Active |
|---|---|---|---|---|---|
| Projects Home | "No projects yet" + CTA | card skeletons | step-checklist + bar (§2.2) | "Couldn't analyse" + Retry/Open anyway | card mini-status updates in place |
| Project Shell | n/a (always has a project) | rail badges show `…` | header shows "analysing" if re-scan | offline banner (uses Hub `live.down`) | rail live badges, header `●` dot |
| Workflow (edit) | "Empty canvas — drag a trigger to start" | canvas skeleton | — | invalid-edge ghost; unsaved-changes guard | autosave "💾 saved" |
| Workflow (run) | — | "starting run…" | — | red run-banner + "jump to failure" | token animation, active halo, run log |
| Tasks | "No tasks — the team will create them" | card skeletons | — | "couldn't load board" + retry | new comment slides in (Hub `slidein`); needs-human pulse |
| Base | "No knowledge yet" + CTA | row skeletons | doc shows ◐ indexing shimmer | doc ⚠ failed + Re-index | ◉ recl pulse on recall |

**State machines (key):**
- Project: `connecting → analysing → ready | partial | error` (partial = open-anyway path).
- Doc: `draft → indexing → indexed → (active) → (recalled) | failed`.
- Run: `idle → running ↔ paused → done | failed | stopped`.
- Node (in run): `pending → active → done | failed`.

**Cross-view consistency:** the 🔗 recalled chip appears in **both** Tasks history and Base, linking the same event. Agent badges, status labels, and gate/recall chips are identical components everywhere (single source of truth).

---

## 9. Accessibility (WCAG 2.2 AA)

- **Colour never alone:** every status/state pairs colour with a **glyph + text** (kept from Hub). Node states add shape/badge, not just hue.
- **Contrast:** body text on `--panel` ≥ 4.5:1 (use `--txt #e6edf3`); dim text `--dim #8b949e` reserved for ≥ large/secondary; UI components & focus rings ≥ 3:1. Validate every stage hue fg/bg pair (Hub tokens are pre-tuned; re-check conveyor/canvas tints).
- **Focus:** 2px accent outline, 2px offset, ≥3:1 against adjacent (Hub `:focus-visible` already does this). Canvas nodes/ports are focusable and outline on `:focus-visible`. Sticky run-bar/header use `scroll-margin` so focus is **not obscured** (2.4.13).
- **Dragging alternatives (2.5.7):** node creation, connection, and the conveyor are **all operable without dragging** — palette has click-insert, ports have keyboard-connect, conveyor has the Board view + buttons. Drag is an enhancement, never the only path.
- **Target size (2.5.8):** all interactive ≥ 24px; ≥ 44px under `pointer: coarse` (touch/tablet).
- **Reduced motion:** token slide → jump+highlight; conveyor glide → teleport+highlight; shimmer → static stripe; modal/toast animations shortened. Content never depends on motion.
- **Screen readers:** canvas exposes an **accessible list view** of nodes/edges ("/be → /rev (on done); /rev → /be (loop: changes needed)") as an `aria` alternative to the spatial graph. Run state announced via `aria-live="polite"` ("/rev active; reviewing"). Ticket timeline is an ordered, attributed list. Tabs/rail use `role="tablist"`+`aria-selected`; modals trap focus + `Esc` (Hub already does).
- **No cognitive auth tests / no redundant entry** in any future settings/connect flows.

---

## 10. Responsive & Desktop

Desktop-first (this is a workstation tool), but graceful down to tablet.

| Range | Projects Home | Shell rail | Workflow | Tasks |
|---|---|---|---|---|
| ≥ 1280 xl | 3–4 card cols | full labelled rail | palette+canvas+inspector all visible | board 5 cols |
| 1024–1280 lg | 2–3 cols | labelled rail | inspector becomes a slide-over sheet | board 4 cols (scroll-x, Hub snap) |
| 768–1024 md | 2 cols | icon-only rail | palette+canvas; inspector & palette as sheets; run-log as drawer | board scroll-x or List view |
| < 768 sm | 1 col | bottom nav | **read/run-mostly**: pan/zoom canvas + run log; heavy editing nudged to a larger screen | List view default; conveyor simplified |

- The **horizontal scroll-snap board** and **modal** are inherited from the Hub (already responsive).
- **Native shell niceties:** OS folder picker, window min-size guard (workflow editing needs width — show a "best on a wider window" hint below `md`), safe-area padding if ever run on a tablet PWA.
- **Container queries** for cards/inspector so panels reflow to *their* width, not just the viewport (e.g. inspector switches to single-column when docked narrow).

---

## 11. Visual Language Note (extends the dark Hub theme)

Keep the canon; add the minimum new tokens. Defined OKLCH-first per design standards (with the existing hex as the proven fallback the Hub already ships).

```css
@theme {
  /* — inherited Hub canon (unchanged) — */
  --color-bg:      #0d1117;   /* oklch(0.18 0.02 265) */
  --color-panel:   #161b22;   /* oklch(0.22 0.02 265) */
  --color-panel2:  #1c2230;   /* oklch(0.26 0.02 265) */
  --color-line:    #283040;
  --color-txt:     #e6edf3;
  --color-dim:     #8b949e;
  --color-accent:  #6e56cf;   /* oklch(0.55 0.16 285) — the token/active glow */

  /* — additive for this product — */
  --canvas-bg:     #0b0f16;            /* a touch darker than --bg, to sink the canvas */
  --canvas-dot:    #1b2230;            /* dot-grid */
  --node-radius:   12px;               /* matches card radius */
  --edge:          #3a4152;            /* default edge */
  --edge-active:   var(--color-accent);
  --token-glow:    0 0 12px 2px oklch(0.55 0.16 285 / 0.55);  /* the travelling token */
  --bg-agent-tint: #14110a;            /* background-agent lane (warm, from --stg-sec) */
  --recall-pulse:  var(--color-accent);
  --belt:          #1c2230;            /* conveyor surface = panel2 */
}
```

**Principles:**
- **Accent purple = "the live token / active focus."** Reserve `--accent` for what is *running / active / recalled-now*. This gives the whole app one consistent "where the energy is" signal across Workflow (active node), Tasks (needs-you pulse), and Base (recall pulse).
- **Per-stage/agent hues** (already in the Hub) colour the agent nodes and ticket agent badges so `/rev` looks the same violet everywhere.
- **Surfaces by elevation, not shadow** (dark-mode rule): canvas sinks (`--canvas-bg`), cards rise (`--panel2`), dialogs rise more — brightness, not heavy shadows.
- **Glyph system:** monoline glyphs (◧ ◆ ◇ ↺ ☾ ⚡ ⏚ ✓ ◉ ◐ ⧗) — Lucide equivalents in build (`workflow`, `git-branch`, `repeat`, `moon`, `zap`, `merge`, `check`, `circle-dot`). No colour-only meaning.
- **Motion:** 150–300ms, `--ease-smooth` for transitions, spring only for the conveyor settle and node-drop. Token travel ~ edge-length-scaled, capped ~400ms. All gated behind `prefers-reduced-motion`.
- **Typography:** keep the Hub's system-ui body + `ui-monospace` for IDs/agent/run-log/code — the monospace reinforces the "it's a program" feel in Workflow and the Base editor.

---

## 12. Buildability note (single FE dev)

- **No new heavy deps required by the spec**, but the Workflow canvas is the one place a library pays off: **React Flow** (MIT) gives nodes/edges/minimap/pan-zoom/keyboard out of the box — recommend it over hand-rolling. Everything else is plain components over the existing token set.
- **One data model, two task skins** (Board + Conveyor) keeps Concept B cheap.
- **Shared components** (StatusLabel, AgentBadge, RecallChip, Timeline) are literally the Hub's, lifted into the project shell — minimal new surface area.
- Suggested build order: Projects Home + connect pipeline → Project Shell + Overview → Tasks (Board) + Timeline → Base + recall → Workflow (edit) → Workflow (live run) → Conveyor view.

---

## 13. Open questions for `/po`

1. Is the runtime a **desktop shell (Tauri/Electron)** or a **local web app**? Affects folder-picker + window-min-size handling.
2. Is the workflow **per-project** only, or are there **shared/template** workflows across projects (Projects Home could host a template gallery)?
3. Should **humans edit** ticket history, or only **add notes** (this spec assumes append-only agent history + human notes)?
4. Confirm **React Flow** is acceptable as the one new dependency for the canvas.

**Status:** Draft → awaiting `/po` review. On approval, record `DESIGN_APPROVED` (soft) and hand to `/fe`.
```
