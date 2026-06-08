# Usability & Comprehension — Projects Home, Tasks Board, Knowledge (Apex)

**Author:** Apex (`/mkt`) — Senior PMM / CSO
**Type:** Usability / comprehension + content-design pass across three core surfaces. **No code, no gate, no invented metrics.** Behaviour & copy only.
**Date:** 2026-06-08
**Scope:** The *comprehension + content layer* of DART's three main surfaces — the **Projects Home** (launcher), the **Tasks board** (pipeline), and the **Knowledge** panel (today "Base"). For each: the mental model, information architecture, microcopy library, onboarding / empty / first-run states, and what NOT to surface. This does **not** redesign visuals, motion, or interaction — **Aura owns that** (`redesign-aura.md`, parallel). Where a string sits on a surface Aura specifies, I give the words; she gives the layout.

**Read for this pass:** `usability-apex.md` (my locked builder vocabulary + microcopy style — kept consistent here) · `cockpit-promotion-apex.md` + `strategy.md` (my prior home positioning — refined here, not duplicated) · `redesign-aura.md` (Aura's parallel visual work on the builder/rules/labels — I coordinate, never re-author her layout). **Grounded in the live build:** `projects/{projects-home,project-card,copy}.ts`, `shell/{tasks-board,base-panel,add-note-form}.component.ts`, `core/models.ts`.

> **Honesty stance (carried from `strategy-apex.md` / `cockpit-promotion-apex.md`).** Every line of copy is backed by a real behaviour in the build or a ratified claim string, or it is cut. The load-bearing guardrails across all three surfaces:
> 1. **DART records intent and routes work; your AI coding tool executes.** No copy implies DART runs agents or writes code itself.
> 2. **Absent, never a fake zero.** Counts are real or omitted — never "0 need you", never an empty grid of zeros.
> 3. **Privacy is scoped to DART, never the host model.** "Nothing uploaded" means *DART* doesn't upload; the host AI tool keeps working on the plan you already have. Absolute privacy superlatives are banned.
> 4. **Security/privacy wording routes to `/secops` + `/arch` before shipping** (the ratified strings in `projects/copy.ts` ship verbatim).

---

## 0. The unifying frame — one product, three views of the same pipeline

The three surfaces are not three apps. They are three *altitudes* on one idea — **a pipeline of work your AI team moves through, on your machine.** The comprehension win is making that one idea visible at every altitude so a user never re-learns the model:

| Surface | Altitude | The one sentence | Shared noun |
|---|---|---|---|
| **Projects Home** | the roster | *"Every project you've handed to your AI team — and what each needs from you."* | **project** |
| **Tasks board** | one project's flow | *"Watch work flow through your team's pipeline, Backlog to done."* | **stage / task** |
| **Knowledge** | one project's memory | *"The rules and context your team follows — shared across your projects, or just this one."* | **knowledge** |

The vocabulary I locked for the builder (`usability-apex.md §1.4`) carries through unchanged — **stage / owner / gate / rule / label / route** — so the board's "stage" is the builder's "stage", and "advance/route" means the same routed action everywhere. **One word per concept, everywhere.** No surface invents a synonym.

The honesty line from the builder card — **"DART decides what happens next; your AI tool does the work"** — is the same line that defuses the "is my code safe / does this run agents itself" fear on Home. Say it once per surface where a user might assume otherwise; never bolt it on as marketing chrome.

---

# 1. PROJECTS HOME — the launcher

The build already shipped much of my `cockpit-promotion-apex.md` spec: the empty-state pitch (anchor line, 3-step, trust strip, docs link), the `needs-you` strip, the governance badge, and the ratified `copy.ts` claim strings. **This pass refines for the polished redesign — it does not re-litigate what landed.** The refinements: a sharper at-a-glance signal hierarchy (honest, absent-not-zero), a header one-liner for the *populated* state (today bare "Your projects"), and microcopy gaps the live build still has.

## 1.1 The mental model (the 5-second frame)

> **This is your team's roster. Each card is a project you've handed to your AI dev team — point at a folder, and DART stands up a team that works it through an enforced pipeline. The roster tells you, at a glance, what needs *you*.**

Two load-bearing ideas, in order: **(a) a roster of projects under one disciplined team** (the multi-project, governed differentiator — `strategy.md §1`), and **(b) the roster surfaces *your* attention** (the daily reason to open it: needs-you). The empty state sells *what it is + why it's safe*; the populated state gets out of the way and surfaces *what's moving + what needs you*.

## 1.2 Information architecture — what each state owns

**Empty (zero projects) — sell + teach.** Already built and good: hero (name + anchor) → "what it is" lead → 3-step how-it-works → primary CTA (folder picker) → trust strip → "Read the docs". Keep. One screen, CTA above the fold. (This is the retention-deciding 5 seconds — `cockpit-promotion-apex.md §2`.)

**Populated — inform, then get out of the way.** Header (title + the global signal strip) → responsive grid of project cards → the "Add a project" cell. The header is where the refinement lives (§1.4).

## 1.3 What to surface at a glance — the signal hierarchy (honest, absent-not-zero)

The governing rule (from `cockpit-promotion-apex.md §3`): every signal must **(a)** come from real data, **(b)** communicate *governance or momentum* — never vanity, and **(c)** degrade to *absent*, never a fake zero. Ranked by the screen space they earn:

| Rank | Signal | Where | In-UI phrasing | Worth the space because… | Shows only when |
|---|---|---|---|---|---|
| 1 | **Needs you** (across all projects) | global strip + per-card chip | *"{N} need you"* (warning hue) | The single most actionable signal — the reason to open the app each day. Already built. | sum `> 0` |
| 2 | **Security-reviewed** (governance badge) | per card | *"Security-reviewed"* (solid shield) / *"blocked at {stage}"* (danger) | The differentiator made visible per project — a real gate fact no competitor shows at a glance. Already built. | a real gate label exists; else absent |
| 3 | **Projects under governance** | global strip | *"{N} projects"* | Quiet, factual; frames the multi-project, governed nature. Already built. | count `> 0` |
| 4 | **Live activity** | global strip + per card | *"agent working"* (accent live dot) / *"idle"* | Proves the team *acts* on its own, not just sits there. *Forward — reuse the Hub live dot when SSE state is on the roster.* | an agent is actually running |
| 5 | **Open task mix** | per card | *"{N} open"* + needs-you chip | Cheap "how much is in flight" glance. Already built (the pulse). | a task summary exists |
| 6 | **Knowledge count** | per card *(demote)* | *"{N} in knowledge"* | Signals "it remembers this project." **Lower priority on the card** — it's reassurance, not momentum; better on the project shell where the Knowledge panel already lives. | `base.counts` present |

**The refinement vs the live build:** the card today shows `{N} open` + needs-you + governance + status. That hierarchy is right — keep it. If a knowledge count is added to the card (rank 6), it must be the *quietest* element, and **absent (not "0 in knowledge")** when the project has no indexed docs. Do **not** promote it above needs-you or governance.

## 1.4 The header one-liner (the refinement the populated state is missing)

The live populated state shows a bare **"Your projects"** with the signal strip beside it. A bare title teaches nothing about *why this is a roster, not a folder list.* Add a quiet one-liner under the title (first session, dismissible thereafter):

> **Your projects**
> *Every project you've handed to your AI team. The badges below tell you what needs you.*

When the strip already says "{N} need you", the sub-line can shorten to the framing only:

> *Your AI dev team, across every project on this machine.*

Pick the longer line for first session (it teaches the "needs you → look here" loop), the short line thereafter (it just frames). No number it can't back; no hype adjective.

## 1.5 First-run / empty state — sell *and* teach (refinements only)

The shipped empty state is strong. Three small comprehension tightenings:

1. **Step 2 wording** (live: *"It analyses the code and docs, and remembers the rules your agents must follow."*) — keep, but this is the natural hook to **Knowledge**: the "remembers the rules" promise is *delivered* by the Knowledge panel (§3). Consistency: use **"knowledge"** (the renamed surface), not "base", anywhere a step or tooltip references that memory.
2. **The connect/add-project copy** — see §1.6; the live "Add a project" cell copy is the one gap.
3. **Honesty already correct** — "Nothing is uploaded", "No account, no API key to paste" ship verbatim from `copy.ts`. Don't touch; they're ratified claim strings.

## 1.6 Connect / add-project microcopy (the moment of maximum hesitation)

The folder-picker reassurance is ratified (`copy.ts`: `PICKER_SUBTITLE`, `PICKER_FOOTER`, `PICKER_ADOPT_HINT`). What's underspecified is the **"Add a project" cell** in the populated grid — the door a returning user uses. Copy:

- **Cell title:** *"Add a project"*
- **Cell body:** *"Point DART at another folder on this machine — it analyses it right here."*
- **On the picker (already ratified, ship verbatim):** subtitle *"DART reads this folder on your machine to understand the project. Nothing is uploaded."* · footer *"Read-only analysis. DART never writes outside this folder."* · adopt hint *"This folder already has DART files — we'll pick those up instead of starting over."*

## 1.7 Microcopy library — Projects Home

| Surface | String |
|---|---|
| Empty hero sub (ratified) | *"A full AI dev team — and a process it can't skip — for the code already on your machine."* |
| Empty lead (ratified) | *"Point DART at a project folder. It reads the code, stands up a team of specialist agents, and runs them through a workflow with gates that can refuse to proceed — all on your machine, on the AI coding tool you already use."* |
| Populated title | *"Your projects"* |
| Populated sub (first session) | *"Every project you've handed to your AI team. The badges below tell you what needs you."* |
| Global strip — count | *"{N} projects"* (omit when 0) |
| Global strip — needs you | *"{N} need you"* (warning; omit when 0) |
| Global strip — live | *"agent working"* (accent dot; only when true) |
| Card — open mix | *"{N} open"* |
| Card — needs you | *"{N} need you"* (omit when 0) |
| Card — security badge (ratified tooltip) | *"This project's security gate ran and approved its latest gated change. Gates here can refuse to proceed — they're not advisory."* |
| Card — blocked badge | *"blocked at {stage}"* (danger; this is a *positive* trust signal — the gate has teeth) |
| Card — no description (live) | *"No description collected yet."* — keep |
| Add-project cell | title *"Add a project"* · body *"Point DART at another folder on this machine — it analyses it right here."* |
| Load error (live) | *"Couldn't load projects: {err}"* — keep, factual |

## 1.8 What NOT to surface on Home (anti-clutter / anti-vanity)

- **No vanity heroes:** total tickets ever, total lines analysed, total agent messages, "uptime", a big "147". The needs-you + open-mix say more, honestly.
- **No streak / gamification score** (`cockpit-promotion-apex.md §3.4`). Momentum comes from real work moving, not a manufactured number.
- **No fabricated social proof:** star counts, "Join N developers", testimonial carousels.
- **No model/vendor "Powered by" logos** on Home — muddies the tool-agnostic positioning and re-invites the "is my code going to them?" fear.
- **No "0 in knowledge" / empty zero rows.** Absent, replaced by nothing or an invitation.
- **No absolute privacy superlatives** ("100% secure", "your code never leaves" unqualified) — the DART-scoped, ratified strings only.
- **No marketing modal / rate-us / changelog popover** interrupting the launcher.

---

# 2. TASKS BOARD — the pipeline

The build is solid and *already honest about the thing the brief flags*: advancing is a **routed menu action** ("Advance to {stage}"), not a free drag — there is no drag-to-any-column affordance, so the gate honesty is structural, not just copy. This pass names the mental model, locks the vocabulary to the builder's, and tightens the column/chip/lane/empty microcopy so the pipeline is *instantly* readable.

## 2.1 The mental model (the 10-second frame)

> **Watch work flow through your team's pipeline — Backlog to done. Each column is a stage; each card is a task sitting at the stage it's reached. Work moves forward when a stage's owner finishes and the gate (if any) passes — so advancing is a deliberate, routed step, not a card you drag wherever you like.**

Three load-bearing ideas: **(a) it's a pipeline that flows** (left-to-right, same flow metaphor as the builder's vertical rail — `redesign-aura.md §1.0`), **(b) columns are stages, status is a chip** (never confuse the two — the build already gets this right: status/needs-you are card chips, not columns), and **(c) advancing is routed, not free** — the honest framing that ties the board to the enforced-gate differentiator.

The shorter version for a header / first-run line:

> **Your team's pipeline — work flows left to right, stage by stage, until it's done.**

## 2.2 The vocabulary (locked to the builder — `usability-apex.md §1.4`)

One word per concept, identical to the builder so the user never re-learns:

| Concept | The ONE word | Plain gloss (tooltip/help) | Avoid |
|---|---|---|---|
| A column on the board | **Stage** | "a step work moves through" | phase, lane *(lane is reserved for the off-track lane)*, node |
| The agent on a column | **Owner** | "the agent who works this stage" | assignee *(internal field name; never user-facing)* |
| The first/intake stage | **Backlog** | "work that hasn't started moving yet" | inbox, todo, new |
| The final stage | **Done** | "work the pipeline has finished" | closed, complete, archived |
| Moving a task one stage on | **Advance** | "move the task to the next stage" | progress, push, transition, *drag* (there is no free drag) |
| A task stuck in a removed stage | **Off-track** | "in a stage that's no longer in the pipeline" | orphan, stale, lost, error |
| A task's lifecycle state (chip) | **Status** | "where this task is in its own life — open, blocked, done" | (don't conflate with *stage*) |
| A task waiting on a person | **Needs you** | "waiting on a person — an approval or a decision" | blocked-by-human, manual |

> **Backlog / done note for `/po`:** the build derives columns from the *workflow's stage names in order* (`stageOrder`), so "Backlog" and "Done" are real only if the workflow names a first/last stage that way. The mental-model copy uses "Backlog to done" as the *shape* of any pipeline; the board renders the project's actual stage names. Don't hard-code "Backlog"/"Done" labels onto stages that aren't named that — say "the first stage" / "the last stage" in generic help, and let the real stage name show on the column. (Same absent-not-lie discipline as the builder's phase bands.)

## 2.3 Information architecture — top to bottom

1. **Project cue** (live: *"Tasks for {project}"*) — keep; it's the "which project does a write land in" reassurance. Good.
2. **The columns** — stages in workflow order, each with `owner` + count, scroll horizontally. The flow reads left→right.
3. **The off-track lane** — distinct, below the columns, warning-toned. Never silently drops or re-keys a task.
4. **Card detail** — opens on click; advance also reachable from the card's `⋯` menu.

## 2.4 Microcopy — column headers, card chips, the advance action

**Column header.** Live shows `{stage}` · `owner` · `{count}`. Tighten the count's meaning with a tooltip and keep the header calm:

- **Stage name:** the real stage name (escaped). The largest text in the header.
- **Owner chip:** *"{owner}"* with agent glyph · tooltip *"the agent who works this stage"*.
- **Count:** the number · tooltip *"{N} tasks at this stage"*.
- **Empty column** (live: *"Nothing in this stage."*) — keep; it's honest and calm. Tooltip optional: *"No task has reached this stage yet."*

**Card chips.** The card already carries: id · title · owner · a **status** chip · **gate** chips (shape = hard/soft, the canon) · a **needs-you** chip. Microcopy:

- **Status chip:** the status glyph + word (open / blocked / done) — *the task's own life*, distinct from the column it sits in.
- **Gate chip:** *"{gate} {state}"* — solid shape = blocking, dashed = warning (Aura's canon; never hue alone). Tooltip for a blocking gate: *"A blocking gate — work can't advance until this passes."*; warning gate: *"A warning gate — flags the task but doesn't block."*
- **Needs-you chip:** *"needs you"* (warning) · tooltip *"Waiting on a person — an approval to give or a decision to make."*

**The advance action (the honest, routed move).** Live: a menu item *"Advance to {stage}"*, or *"No further stage"* at the end. This is exactly right — keep, and make the honesty explicit in the tooltip:

- **Advance item:** *"Advance to {stage}"* · tooltip *"Move this task to the next stage. If that stage's gate hasn't passed, DART won't let it through — advancing is a routed step, not a free move."*
- **End of pipeline:** *"No further stage"* (live) — keep. Tooltip: *"This task is at the last stage of the pipeline."*
- **Conflict** (live: *"This task changed elsewhere — reloaded."* + *"Retry advance"*) — keep; honest and specific (a CLI agent or another tab moved it).
- **Error** (live: *"Couldn't advance: {error}"*) — keep, factual. When the engine refuses a route past an unmet safety gate, the `{error}` should read in the builder's safety-gate voice (`usability-apex.md §6.6`): *"Can't advance past a security gate that hasn't passed."* (Route exact wording to `/secops` so it matches the engine.)

## 2.5 The off-track lane — make "stuck" legible, not alarming

Live (good): a distinct lane, *"Off-track ({N}) — these tasks are in a stage that's no longer in the track"*, grouped by removed stage, each task still openable and advanceable. Refinements for friendliness + plain language:

- **Title:** *"Off-track ({N})"* — keep.
- **Why-line:** replace "track" (jargon — it's the *pipeline*) → *"— these tasks are in a stage that's no longer in the pipeline."*
- **Group label** (live: *'stage: "{name}" (removed)'*) → *'was in "{name}" — that stage is gone'* (plain, less terminal-flavored).
- **Reassurance (new, one muted line under the lane head):** *"Nothing's lost. Open a task and advance it to put it back on the pipeline."* — turns a scary "off-track" into a calm, recoverable state. This is the honest framing: the build *never drops* these, so the copy should say so.

## 2.6 The done-folder

The build renders "done" as the **last stage column** (and status `done` as a card chip). There is no separate collapsed "done folder" today. Comprehension guidance:

- **If done stays a column:** the last stage's header reads its real name; tasks with status `done` carry the done status chip. Keep — it's consistent with "every stage is a column."
- **If a done-folder is later added** (a collapsed end-cap so finished work doesn't crowd the active pipeline — coordinate with Aura): frame it as *"Done · {N}"* with a tooltip *"Finished work. Open to review; it stays in your project's history."* Never call it "Archive" (implies removal) and never hide it behind a destructive-sounding word. **Honesty:** a done-folder is a *view convenience*, not a delete — say "finished", never "closed/archived/removed".

> Recommendation: **don't build a separate done-folder this slice** unless the last column visibly crowds the board. The column model is simpler and already consistent. If momentum/clutter demands it, prefer a *collapse* of the last stage over a new concept.

## 2.7 Empty states

- **No tasks at all** (live: *"No tasks yet — the team will create them as work starts."*) — **keep verbatim.** It's the perfect honest empty state: it teaches the model (the *team* creates tasks, you don't hand-author them) and sets the right expectation (they appear as work starts). This is exactly the "DART records intent; the team works" framing, applied to the board.
- **Empty column** (live: *"Nothing in this stage."*) — keep.
- **First-run board hint (new, dismissible, only when tasks exist):** *"Columns are your pipeline's stages. A task advances when its stage is done and any gate passes — use a task's menu to advance it."* — names the routed-advance model on first contact, then gets out of the way.

## 2.8 Microcopy library — Tasks board

| Surface | String |
|---|---|
| Project cue (live) | *"Tasks for {project}"* — keep |
| Empty board (live) | *"No tasks yet — the team will create them as work starts."* — keep verbatim |
| First-run hint (new) | *"Columns are your pipeline's stages. A task advances when its stage is done and any gate passes — use a task's menu to advance it."* |
| Column count tooltip | *"{N} tasks at this stage"* |
| Empty column (live) | *"Nothing in this stage."* — keep |
| Needs-you chip tooltip | *"Waiting on a person — an approval to give or a decision to make."* |
| Blocking-gate tooltip | *"A blocking gate — work can't advance until this passes."* |
| Warning-gate tooltip | *"A warning gate — flags the task but doesn't block."* |
| Advance item (live) | *"Advance to {stage}"* |
| Advance tooltip (new) | *"Move this task to the next stage. If that stage's gate hasn't passed, DART won't let it through — advancing is a routed step, not a free move."* |
| End of pipeline (live) | *"No further stage"* — keep |
| Off-track why-line | *"— these tasks are in a stage that's no longer in the pipeline."* |
| Off-track group label | *'was in "{name}" — that stage is gone'* |
| Off-track reassurance (new) | *"Nothing's lost. Open a task and advance it to put it back on the pipeline."* |
| Conflict (live) | *"This task changed elsewhere — reloaded."* + *"Retry advance"* — keep |
| Advance error | *"Couldn't advance: {error}"* (live) — keep; safety-gate refusals read in the `/secops` voice |
| Live re-layout (live, a11y) | *"Board updated"* — keep |

## 2.9 What NOT to show on the board

- **No drag-to-any-column affordance.** It would imply free movement and break the routed-advance honesty — and the build correctly doesn't offer it. Don't add a drag cue that suggests otherwise.
- **No per-agent micro-telemetry** on cards (token counts, latency) — too granular for the flow read.
- **No "status = column" conflation.** Status is a chip; stage is a column. Never a "Blocked" column or a "Done" column that competes with the stage columns.
- **No raw internal field names** (`assignee`, `expectedOwner`) — show "owner" or "unassigned".
- **No fake counts** — a column with no tasks shows "Nothing in this stage", not "0".
- **No alarmist off-track styling** beyond the warning tone — it's recoverable, and the copy says so.

---

# 3. KNOWLEDGE — the project's memory (renamed from "Base")

The live surface is **"Base"** — a panel showing doc counts, an index breakdown (indexed / indexing / failed), an honest method line, a few recent docs, an "Add a note" composer, and a disabled "Manage base — soon". **Rename it "Knowledge"** — "Base" is an internal noun ("knowledge base" abbreviated) with no mental model for a newcomer; "Knowledge" is the plain-language thing it actually is.

**An honesty note on this surface specifically.** The brief asks me to design the comprehension layer for a **scoped** knowledge model (common-vs-project), **stack/kind tags**, and a **`/kai` propose→you-approve** flow. The *live build today has none of these* — it has one flat, project-scoped list and a paste-a-note add. So I split this section cleanly: **§3.1–§3.4 is the mental model + content for what exists today** (and ships now); **§3.5 is forward framing** for scope, tags, and the propose flow — clearly marked as not-yet-built, so no copy implies a capability the product lacks. I invent no counts and no behaviour.

## 3.1 The mental model (what exists today)

> **Knowledge is what your AI team remembers about this project — the rules and context it follows so you stop re-explaining them. Add a note here, and every agent works with it in mind.**

One load-bearing idea: **Knowledge is the team's memory, and adding to it is how you stop babysitting** (the "stop re-explaining" JTBD — `strategy.md §3`). The shorter header version:

> **Knowledge — the rules and context your team follows.**

## 3.2 Information architecture (today)

1. **Header:** the Knowledge tile + title + a count (*"{N} docs"*, absent when empty).
2. **Index breakdown:** indexed / indexing / failed (only when non-empty) + the honest **method line**.
3. **Recent docs:** up to a few representative names + their index state.
4. **Add control:** "Add a note" (the live paste-a-note composer) + the disabled "Manage base — soon".

## 3.3 The local-first honesty line (the trust unlock for this surface)

Adding knowledge means handing the team your rules — the moment a user asks "where does this go?" Answer it inline, plainly, and scoped to DART:

> **Your knowledge stays in this project's folder on your machine — nothing is uploaded. It's a note your team reads, not a file sent anywhere.**

When (later) shared/common scope exists (§3.5), the honesty line must scope "shared" correctly:

> **"Shared" means across your *own* projects on this machine — never a cloud, never an account.**

This is the same DART-scoped discipline as Home (`cockpit-promotion-apex.md §4`): "nothing uploaded" is true of DART; the host AI tool still works as it does today. Route the exact wording to `/secops` + `/arch` before shipping — it's a privacy claim.

## 3.4 Microcopy — Knowledge (today's build)

| Surface | Live string | Refined string |
|---|---|---|
| Panel title | *"Base"* | **"Knowledge"** |
| Count | *"{N} docs"* | *"{N} docs"* — keep (absent when empty) |
| Empty state | *"No knowledge yet — add the rules and context your team must follow."* | **keep** — already excellent (teaches the *why*, action-framed) |
| Index — indexed | *"{N} indexed"* | keep · tooltip *"Ready for your team to recall."* |
| Index — indexing | *"{N} indexing"* | keep · tooltip *"Being read in now."* |
| Index — failed | *"{N} failed"* | keep · tooltip *"Couldn't be read — open to retry."* |
| Method (semantic) | *"Indexed via: local embeddings (semantic)"* | *"Searchable by meaning — indexed locally on your machine."* |
| Method (filename) | *"Filename index only — connect an embedder for semantic recall"* | *"Found by filename. Add a local embedder for search-by-meaning."* |
| Add control | *"Add a note"* | keep |
| Local-first line (new) | — | *"Your knowledge stays in this project's folder on your machine — nothing is uploaded."* |
| Manage (disabled) | *"Manage base · soon"* | *"Manage knowledge · soon"* — keep the inert, honest "soon" treatment |
| Doc row | *"{name}"* + index state | keep (escaped) |

**Add-note composer (live `add-note-form`).** It's honest already (sends only title + body; contained write). Keep its existing reassurance. One framing line worth adding at the top of the composer:

> *"Add a rule or a piece of context your team should follow. It's saved to this project, on your machine."*

## 3.5 Forward framing — scope, tags, and the propose flow (NOT built today)

The brief asks for the comprehension layer of three concepts the build doesn't have yet. I design the *words and mental model* so that when `/arch` + `/fe` build them, the copy is ready and honest — **but nothing here ships until the behaviour exists.** Marked clearly as forward.

### 3.5a Common vs project scope (the shared-vs-this-project model)

> **Two kinds of knowledge:**
> **• Shared** — know-how your whole team carries to *every* project on this machine (e.g. "always write tests first"). Your house style.
> **• This project** — rules and context that apply *only here* (e.g. "this repo uses Postgres, not MySQL").

The plain framing: **shared = your house rules; project = this project's specifics.** A user adds to "this project" by default (the safe, narrow choice) and *promotes* to "shared" deliberately. **Honesty:** "shared" is across *your own* projects on *this* machine — never a cloud, never other people (§3.3). When shown:

- **Scope toggle on the add form:** *"Applies to: ( ◦ This project ) ( All my projects )"* · helper under "All my projects": *"Shared across every project on this machine — never uploaded."*
- **A shared doc's chip:** *"shared"* · tooltip *"Your team follows this in every project on this machine."*
- **Scope filter on the list:** *"Shared · This project · All"* — a quiet segmented filter, only when shared knowledge exists.

### 3.5b Stack / kind tags in plain language

When docs carry tags (`stack`, `kind`), keep them *plain*, and keep "tag" for knowledge metadata distinct from the builder's routing **"label"** (`usability-apex.md §1.4` keeps these separate — don't merge them):

- **Stack tag:** the detected tech, plain (*"Angular"*, *"Postgres"*) · tooltip *"Knowledge tied to this part of your stack."*
- **Kind tag:** plain-language category, not a schema enum — *"Rule"* / *"Convention"* / *"Context"* / *"Decision"* · tooltip per kind (e.g. Rule → *"Something the team must follow."* · Decision → *"A choice that's been made and why."*).
- **Filter by tag:** *"Filter: all kinds ▾"* — only when tags exist; absent otherwise.

### 3.5c The `/kai` propose → you-approve flow

`/kai` (the self-improvement meta-agent) proposing knowledge is a *trust-critical* flow: the team suggests a rule; **you stay the gate.** Frame it as a calm review, never an auto-write:

- **Proposal banner:** *"`/kai` suggests adding to your team's knowledge."* + the proposed note (escaped) + *"You decide — nothing is saved until you approve."*
- **Actions:** *"Approve & save"* / *"Edit first"* / *"Dismiss"* — approve is deliberate, never default-focused into an accidental accept.
- **Scope on approve:** the same "This project / All my projects" choice (§3.5a) — promoting a learning to shared is *your* explicit call.
- **Honesty line:** *"`/kai` learns from how your team works and proposes rules. It never writes to your knowledge on its own — you always approve."* This is the load-bearing guardrail for the whole flow: **propose ≠ apply; you are the gate.** (Mirrors the workflow's human-approved skill-update discipline.)
- **Empty/first proposal teaching:** *"As your team works, `/kai` may notice a recurring rule worth saving. When it does, you'll review it here first."*

> **Hand-off note:** §3.5 is *content design ahead of build*. None of it ships as live UI until `/arch` + `/fe` implement scope, tags, and the propose flow — otherwise it's a control that doesn't do the thing (the exact anti-pattern from `usability-apex.md §4` / `redesign-aura.md §5`). The words are ready; the surface waits for the behaviour.

## 3.6 What NOT to show in Knowledge

- **No "0 docs" / empty zero rows.** The shipped empty state ("No knowledge yet — add the rules…") is the rule; never a bare "No data" or a "0".
- **No raw schema words** as user-facing copy: "embeddings", "vector", "chunk", "index status enum". The method line already translates these — keep it plain.
- **No "uploaded" / "synced to cloud" implication** anywhere — Knowledge is local; "shared" is local-across-your-own-projects (§3.3). Absolute or cloud-implying privacy claims are banned and route to `/secops`.
- **No auto-applied `/kai` proposals.** Never a "we added this for you" — always propose→you-approve. An auto-write here would break the single most important trust contract on this surface.
- **No live "Manage knowledge" control until it works** — keep the inert, honest "soon" treatment the build already uses (`aria-disabled`, no navigation, no fake write).
- **No tag/scope filters when there's nothing to filter** — absent, not an empty filter bar.

---

# 4. Cross-surface consistency checklist (the comprehension glue)

The whole point of these three passes is that the user learns *one* model. Enforce it:

| Concept | The ONE word, every surface | Never |
|---|---|---|
| A step work moves through | **Stage** (board column = builder stage) | phase / node / state / lane |
| The agent on a stage | **Owner** | assignee / actor / role |
| Moving work one stage on | **Advance** (manual, board) / **Route** (rule-driven, builder) — kept distinct | drag / push / transition |
| An approval that blocks | **Gate** · **Blocks** (hard) / **Warns** (soft) | check / guard / hard / soft |
| A routing word | **Label** (builder) | tag *(reserved for Knowledge metadata)* |
| Knowledge metadata word | **Tag** (Knowledge) | label *(reserved for routing)* |
| Waiting on a person | **Needs you** | manual / blocked-by-human |
| The team's memory | **Knowledge** | base / knowledge-base / store |
| Across your own projects | **Shared** | global / cloud / synced |
| The honesty line | **"DART decides what happens next; your AI tool does the work."** | anything implying DART runs agents/code itself |

**The three empty states, side by side** — each sells *and* teaches, none is a dead end:
- Home: *"A full AI dev team — and a process it can't skip…"* + the 3-step + CTA.
- Board: *"No tasks yet — the team will create them as work starts."*
- Knowledge: *"No knowledge yet — add the rules and context your team must follow."*

All three already follow the "empty state that teaches" principle. Keep them as the model for any new empty state.

---

# 5. Priority — highest comprehension-per-effort

All content/copy; no new engine. Ordered by impact:

1. **Rename "Base" → "Knowledge"** (§3) and add the local-first honesty line. Pure copy; removes an internal noun and answers the "where does this go?" fear. *(Route the privacy line to `/secops`.)*
2. **Tasks board: name the routed-advance model** (§2.1, §2.4 advance tooltip + first-run hint) and **de-jargon the off-track lane** ("track"→"pipeline", "nothing's lost" reassurance). Small strings, big "I get it" lift.
3. **Projects Home populated header one-liner** (§1.4) — teaches the "needs you → look here" loop the bare title hides.
4. **Add-project cell copy** (§1.6) — the one connect-copy gap in the populated grid.
5. **Knowledge tooltips + method-line plain-language** (§3.4) — translate the index breakdown for a newcomer.
6. **Forward: scope / tags / `/kai` propose copy** (§3.5) — drafted and ready, ships *with* the behaviour, never before.

---

# 6. Hand-offs

- **→ `/ui` (Aura):** place the Home populated one-liner (§1.4) and add-project cell copy (§1.6); the board's first-run hint, advance tooltip, and off-track reassurance line (§2); the **"Knowledge" rename** + local-first line + (forward) scope toggle / tag filters / `/kai` proposal banner (§3). I own the strings; you own layout/motion. Your `redesign-aura.md` covers the *builder/rules/labels* — these three surfaces are adjacent; confirm the board and Knowledge panels inherit the same rail/flow metaphor and card canon you established.
- **→ `/po` (Max):** ratify **"Knowledge" as the locked name** (retiring "Base"); confirm the board's **Backlog/done framing** (real stage names vs generic "first/last stage" — §2.2); decide whether a **done-folder** is in scope this slice (I recommend not — §2.6); approve the **scope model** (shared = across-your-own-projects, never cloud) and the **`/kai` propose→you-approve** contract (§3.5) before any of §3.5 is built.
- **→ `/fe` (Finn):** the renames and tooltips are copy-only over existing components; **absent-not-zero** for every new signal (knowledge count on the card, scope/tag filters); §3.5 surfaces wait on their behaviour — do not ship a scope toggle, tag filter, or proposal banner until scope/tags/propose exist in the engine (else it's a dead control).
- **→ `/secops` (Soren) + `/arch` (Jorge):** approve the **Knowledge local-first line** and the **"shared = across your own projects, never a cloud"** scoping (§3.3) before they ship — privacy claims, same bar as the ratified `copy.ts` strings; confirm the board's **safety-gate refusal** advance-error wording matches the engine (§2.4); confirm the **`/kai` never-auto-writes** claim matches real behaviour (§3.5c).
- **→ `/legal` (Alex):** review the privacy phrasing of the Knowledge "nothing uploaded" / "shared = local" lines for overclaim (same caveat as Home's no-egress claim).

---

*Content & comprehension only. Invents no metrics; every fix points at a live string or affordance in `projects-home`/`project-card`/`tasks-board`/`base-panel`, or is clearly marked as forward framing (§3.5) that ships only with its behaviour. The load-bearing honesty across all three surfaces: DART decides what happens next; your AI tool does the work — and nothing leaves your machine that the ratified, `/secops`-approved claim strings don't already permit. Visual/interaction/motion is Aura's (`redesign-aura.md`); this is the words and the mental model underneath them.*
