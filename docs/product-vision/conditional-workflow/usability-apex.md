# Usability & Comprehension — Workflow Builder, `when → do` Rules, Labels (Apex)

**Author:** Apex (`/mkt`) — Senior PMM / CSO
**Type:** Usability / comprehension + content-design pass. **No code, no gate, no invented metrics.** Behaviour & copy only.
**Date:** 2026-06-08
**Scope:** The *comprehension layer* of DART's workflow builder, `when → do` rule editor, and labels. The feature **works**; users find it hard to understand. This doc makes the concepts immediately legible to a developer who has never seen them — through one mental model, a standardized vocabulary, microcopy, onboarding, empty/first-run states, and an example library. It does **not** redesign visuals, motion, or interaction — **Aura owns that** (`ux-aura.md`). Where a string sits on a surface Aura specified, I give the words; she gives the layout.

**Companion docs:** `architecture-jorge.md` (rule grammar, event enum, intent/action split, label `settable_by`, loop budget) · `research-anna.md` (rule schema, three triggers / four actions, label taxonomy, default catalogue) · `ux-aura.md` (the visual/interaction/motion redesign — parallel, do not duplicate) · `strategy-apex.md` (my prior positioning + the honesty guardrails I carry forward) · `../ui-design-interactive.md` (the established panel/shell vocabulary I align to).

**Grounded in the live build:** `studio/cockpit/src/app/shell/workflow-builder.component.ts` and `stage-rules.component.ts` — every problem and every fix below points at a string or affordance that exists in that source today.

> **Honesty stance (carried from `strategy-apex.md`).** Every line of copy here is backed by a real behaviour in Jorge's or Anna's design, or it is cut. The load-bearing guardrail across the whole feature: **DART records intent; your AI tool executes.** No copy implies DART runs agents itself. No invented numbers — counts are real or absent (never a fake zero). Security/privacy wording routes to `/secops` + `/arch` before shipping.

---

## 0. The diagnosis — why it reads as hard today (from the live source)

Three concrete comprehension failures, each traced to the current components:

1. **No mental model is ever stated.** The builder opens straight into a topbar (preset radiogroup), an overlay banner about files, and a stage list. A first-timer is told *how to drag* (`reorder-hint`) before they are told *what this thing is*. There is no one-sentence "this is a pipeline; each stage has an owner and an optional gate" frame anywhere. The user is asked to operate a machine whose purpose was never named.

2. **Labels have no home and no teaching.** The user said *"I should create labels somewhere"* — and they're right that it's invisible. In the live build labels are only ever **consumed** (the `set_label` / `clear_label` / condition pickers in `stage-rules.component.ts`, and the read-only "allowed-labels strip"). There is **no create-label surface, no explanation of what a label is, and no reason given to make one.** The concept appears only as a dropdown that is empty until labels exist — a chicken-and-egg dead end.

3. **The rule editor reads as a form, not a sentence.** The *read* cards already render "WHEN … DO …" nicely. But the *editor* (`stage-rules.component.ts` lines 115–214) is a stack of `<fieldset>`s with bare legends `WHEN` / `DO (in order)` and dropdowns labelled `type ▾`, `do ▾`, `who ▾`. It is technically a form, and it *feels* like one. The plain-language promise ("when this happens, do that") is present in the data model but absent from the authoring experience. And one string actively breaks comprehension: the **`fan_out` action shows "parallel — later"** (line 190) — jargon for a deferred feature, exposed in a picker as if it were usable.

The fix is **not** more UI. It is a stated mental model, a standardized vocabulary, a label home with teaching copy, sentence-shaped microcopy, and honest progressive disclosure. All content.

---

## 1. The mental model (the 10-second frame)

### 1.1 The one sentence every new user should absorb

> **Your project is a pipeline of stages. Each stage has an owner who does the work and, sometimes, a gate that must pass before work moves on. Rules are "when this happens, do that" automations you write. Labels are the words your team uses to send work to the right place.**

That single paragraph names all six load-bearing nouns (**stage, owner, gate, rule, label, route**) in the order a user meets them. It is the spine of every onboarding string below.

### 1.2 The even shorter version (for a header / first-run banner)

> **Build the steps your AI team follows — and the rules that move work between them.**

Five nouns, one verb of fact ("follows"), no hype, no number. It tells a newcomer *what the builder is for* before it tells them *how to drag*.

### 1.3 The mental-model card (first-run, dismissible — copy)

A one-time card at the top of the builder on first open (Aura places it; I write it):

```
What is this?
This is your project's pipeline — the ordered steps work moves through.
  • Stage   — a step (e.g. Code review). Drag to reorder.
  • Owner   — who works that step (e.g. /be backend dev).
  • Gate    — an approval that must pass before work moves on (e.g. Security).
  • Rule    — a "when this happens, do that" automation you write.
  • Label   — a word that routes work (e.g. send it back to the backend dev).
DART decides what happens next; your AI tool does the work.
                                                        [ Got it ]
```

The last line is the intent/action honesty guardrail, verbatim from `strategy-apex.md`. It belongs on the *first thing a user reads*, because it sets the correct expectation for everything that follows ("this routes work; it doesn't write the code").

### 1.4 The standardized vocabulary (use these words everywhere; ban the rest)

This is the single most leveraged fix: **one word per concept, everywhere — UI, tooltips, docs, errors.** Drift between "rule / condition / automation" or "label / tag / routing-label" is what makes a small feature feel like three.

| Concept | The ONE word to use | Plain-language gloss (for tooltips/help) | Words to AVOID |
|---|---|---|---|
| A step in the pipeline | **Stage** | "a step work moves through" | phase, node, state, column (column is the *board's* word for the same thing — fine on the board, not in the builder) |
| Who does the work at a stage | **Owner** | "the agent who works this stage" | assignee (internal), role, actor |
| An approval that blocks progress | **Gate** | "an approval that must pass before work moves on" | check, guard, barrier, refusal *(refusal is the gate's strictness, not the gate)* |
| Hard vs soft gate | **Blocks** vs **Warns** | "a blocking gate stops the stage; a warning gate flags it but lets work pass" | hard/soft *(keep the shield shape; label it in plain words)*, refusal:hard/soft |
| A "when X, do Y" automation | **Rule** | "when this happens, do that" | condition *(reserve "condition" for the WHEN part only)*, automation, trigger *(that's the WHEN)*, hook |
| The WHEN part of a rule | **When** (the trigger) | "what makes the rule run" | predicate, condition-type, event-source |
| The DO part of a rule | **Do** (the action) | "what the rule does" | effect, consequence, verb |
| A word that routes/marks work | **Label** | "a word your team uses to route work" | tag *(tag is fine for knowledge metadata — NOT for routing labels; keep them separate)*, marker, flag |
| Moving a ticket to a stage | **Route** / **Send to** | "move the work to a stage" | transition, advance *(advance = the manual board action; route = the rule-driven one — keep distinct)*, dispatch |
| A rule that sends work backward | **Loops back** | "sends work back to an earlier stage to be redone" | cycle, recursion, back-edge, reverse-route |
| Telling an agent to do something | **Instruct** | "hand an agent a task to do" | prompt-inject, dispatch, command |
| Running a stage with several owners at once | **(see §4 — defer)** | — | **fan-out** (ban from UI), parallel, AND-gateway, barrier |

**Three terms to AVOID outright in user-facing copy** (the jargon the user tripped on, with the plain replacement):

- **"fan-out" → don't show it at all** in MVP (§4). If/when it ships: **"Run a stage in parallel."**
- **"overlay" → "your project's own copy"** or **"your changes."** The live banner says *"You're editing this project's OVERLAY"* — "overlay" is an architecture word (Jorge §1.1). Users don't have a mental model for it. See §6.2 for the rewrite.
- **"settable_by" → "Who can set this."** It's a YAML field name leaking into the UI's allowed-labels strip ("/rev may set:"). The user-facing phrasing is a plain question. See §2.

---

## 2. Label concept + creation flow (the missing home)

This is the headline problem: *"I should create labels somewhere."* Today there is nowhere. Here is the concept, the home, and the copy.

### 2.1 What a label IS, in one line the user will keep

> **A label is a word your team puts on a ticket to send it somewhere — like a sticky note that says "back to the backend dev."**

The sticky-note analogy is the unlock: everyone has used a sticky note to mean "this needs X." A label is a *named, reusable* sticky note that DART knows how to act on. That single sentence converts an abstract "routing-label contract" into something a developer already understands.

### 2.2 Why labels exist (the motivation copy — answer "why would I make one?")

A user won't create a label until they know what it buys them. The teaching frame:

> **Labels are how you steer work without re-typing instructions. Make a label once — say `TO_DEV_BE` ("send back to the backend dev") — and any rule can use it to route work there automatically. The label is the steering wheel; the rule is the car.**

(Steering-wheel framing carried from `strategy-apex.md §5.2`.)

### 2.3 Where labels live (the IA decision)

**Labels need a dedicated home — a "Labels" manager — reached from the builder, not buried inside the rule editor.** The live build only exposes labels *inside* a stage's rule editor (as pickers and a read-only strip). That is why the user couldn't find where to create them: **you can only use a label in a place that assumes it already exists.**

Recommended IA (content/flow only — Aura lays it out):

- A **"Labels" entry in the builder's topbar** (next to Preset), reading **`[label] Labels (N)`** — N is the real count, or just **`Labels`** when none exist yet (absent-not-zero; never "Labels (0)").
- Clicking it opens the **Labels manager** (an inline panel or expander, consistent with how the rule editor expands under a row — Aura's call).
- The rule editor's label pickers gain a **"+ New label…"** option at the end of every label dropdown, so a user who discovers the need *while writing a rule* can create one without losing their place. This closes the chicken-and-egg dead end: today a label dropdown is empty with no escape hatch.

### 2.4 The Labels manager — copy

**Header / title:**
> **Labels — the words your team uses to route work.**

**Subhead (one line, always on):**
> *Make a label once; any rule can use it to send work where it belongs.*

**Empty state (this is the teaching moment the user is missing today):**
```
[label]  No labels yet.

Labels let you steer work with a word. For example, a label called
TO_DEV_BE means "send this back to the backend dev" — and a rule can
route any ticket carrying it straight to /be.

                                              [ + Create your first label ]
```

The empty state *teaches by example*, names a recognizable case, and ends in the one action that resolves it. (This mirrors Aura's "empty state that teaches" principle, applied to the label surface she didn't spec copy for.)

**The create-label form — field-by-field microcopy** (every field a plain question, no schema words):

| Field | Label (the visible prompt) | Helper / placeholder | Maps to (Jorge/Anna) |
|---|---|---|---|
| Name | **Name** | *"A short, uppercase word — e.g. `TO_DEV_BE`."* placeholder: `TO_DEV_BE` | label key |
| Meaning | **What it means** | *"Say it in plain words — e.g. `send back to the backend dev`."* | `desc` / `meaning` |
| Who can set it | **Who can set this label** | *"Pick the agents allowed to put this label on a ticket. Others are refused."* multi-select of `/agents` | `settable_by` |
| Where it routes | **Where it sends work** *(optional)* | *"The stage a ticket goes to when this label is set. Leave blank if the label only marks work, not routes it."* | `routes_to` |

**Save confirmation:**
> *Label saved. Rules can use `{name}` from now on.*

**The worked example, pre-filled as a one-click template** (the recognizable case from the brief):

> **Try a starter label.** A button **`[ Use the example: TO_DEV_BE ]`** pre-fills: Name `TO_DEV_BE`, Meaning *"send back to the backend dev"*, Who can set it *`/rev`, `/qa`*, Where it sends work *Implement (/be)*. The user reviews and saves — learning the whole shape of a label by editing a real one rather than facing a blank form. (Anna's default catalogue, §3, gives us `TO_DEV_BE` / `TO_DEV_FE` / `NEEDS_DESIGN` / `READY_FOR_QA` as ready-made starters — offer them as one-click templates, not as a wall of pre-created labels.)

### 2.5 Rewriting the "allowed-labels strip" (live: `stage-rules.component.ts` line 104)

Today it reads: *"`/rev` may set:"* — terse, and "may set" is a verb of permission with no *why*. Rewrite to teach what the strip is *for*:

> **Labels `/rev` can use here:** `TO_DEV_BE → Implement` `TO_DEV_FE → Implement` `NEEDS_DESIGN → Design`
> *(These are the labels this stage's owner is allowed to set. Manage them in **Labels**.)*

The trailing link closes the loop — when a user wonders "where do these come from / how do I add one," the answer is one click away, which is exactly what was missing.

When the owner can set **no** labels, today it says *"no labels (per the contract)"* — replace "(per the contract)" (jargon) with an actionable line:
> *`/rev` can't set any labels here yet. [Create a label] and choose `/rev` under "Who can set this."*

---

## 3. Rule editor comprehension (make it read as a sentence)

The model is already `when → do`. The job is to make the **authoring** experience speak that sentence, not present a form.

### 3.1 The framing that turns the form into a sentence

Wrap the editor in the sentence it builds, and make the section legends say it in plain words rather than bare keywords:

- **Editor title:** *"New rule — when something happens, do something."* (live build has no title on the editor; add one.)
- **WHEN legend** (live: bare `WHEN`): **"When this happens…"**
- **DO legend** (live: `DO (in order)`): **"…do this, in order:"**
- The two legends, read top to bottom, *are* the sentence. The form fields become the blanks in a Mad-Libs the user fills in.

**Live preview line (the single highest-leverage addition).** Above the Save button, echo the rule back as one plain sentence assembled from the draft — the same read-card grammar the component *already renders for saved rules* (`actionText()` / `conditionText()` exist in `stage-rules.component.ts`). Reuse that renderer on the draft:

> *This rule: **When** the Code review gate is rejected **and** the ticket has label `TO_DEV_BE`, **route to** Implement, **instruct** `/be`, then **clear** `TO_DEV_BE`.*

Seeing the sentence build itself as you pick dropdowns is what makes "it's a form" become "I'm writing an instruction." No new grammar — it's the existing read renderer, pointed at the draft.

### 3.2 WHEN-type microcopy + inline help (the three trigger kinds)

The live build labels these `Label` / `Comment matches` / `Event` (`conditionTypeLabel()`). Keep the short labels; add a plain-language gloss in the option and a one-line tooltip so a newcomer knows which to pick:

| WHEN type (keep) | Option phrasing | Tooltip (the *why pick this*) |
|---|---|---|
| **Label** | *"The ticket has a label"* | *"Runs when a ticket carries a label you chose — e.g. someone set `TO_DEV_BE`."* |
| **Comment matches** | *"A comment matches text"* | *"Runs when a comment contains a word or pattern — e.g. someone writes 'needs rework'."* |
| **Event** | *"Something happened"* | *"Runs on a workflow event — a gate passed or rejected, a stage was entered, a comment was added."* |

For **Event**, the raw enum (`comment.added`, `gate.rejected`, `stage.entered`…) is developer-readable but not friendly. Render plain-language option labels, keep the technical name as a muted suffix so power users still recognize it:

> `Gate rejected` · `Gate passed` · `Stage entered` · `Comment added` · `Label set` · `Label cleared` · `Ticket created`
> (e.g. *"Gate rejected"* with `gate.rejected` shown small and muted beside it.)

### 3.3 DO-action microcopy + inline help (the four real actions)

Live build: `Route to stage` / `Set label` / `Clear label` / `Instruct` / `Fan out` (`actionTypeLabel()`). Keep four; **remove Fan out from the picker entirely** (§4). Friendlier phrasing + tooltips:

| DO action (keep 4) | Option phrasing | Tooltip |
|---|---|---|
| **Route to stage** | *"Send work to a stage"* | *"Move the ticket to another stage — forward to continue, or backward to redo."* |
| **Set label** | *"Add a label"* | *"Put a routing label on the ticket. Only labels this owner can set are listed."* |
| **Clear label** | *"Remove a label"* | *"Take a label off — do this after routing so the rule doesn't loop forever."* |
| **Instruct** | *"Tell an agent to do something"* | *"Hand an agent a task. DART records the instruction; your AI tool carries it out."* |

The Instruct tooltip carries the intent/action line — exactly where a user might otherwise assume DART *does* the work.

### 3.4 The first-rule empty state (live: line 62–66)

Today: *"No conditions yet — add a rule to route, loop, or instruct on this stage."* Decent, but "conditions" and "loop" are jargon to a newcomer, and it doesn't show *what a rule looks like.* Replace with a teaching empty state that names the recognizable example:

```
[condition]  No rules on this stage yet.

A rule is "when this happens, do that." For example:
   When  the review is rejected and the ticket has label TO_DEV_BE
   Do    send it back to /be to fix, then clear the label.

                                                  [ + Add your first rule ]
                                                  [ Start from an example ▾ ]
```

The second button opens the **example library** (§3.5) — a user who doesn't yet know what's possible starts from a working rule instead of a blank form.

### 3.5 The example library (start from a working rule)

A small, curated set of starter rules — each named in plain English, each a real, valid rule the user can adopt and tweak. (All are buildable from Jorge §1.3 / Anna §5 today; none use deferred features.)

| Example name (what the user sees) | The rule it creates |
|---|---|
| **"Send a rejected review back to the backend dev"** | When `gate.rejected` (Code review) **and** label `TO_DEV_BE` → route to Implement, instruct `/be` to fix, clear `TO_DEV_BE`. *(the headline loop)* |
| **"Send a rejected review back to the frontend dev"** | Same, with `TO_DEV_FE` → `/fe`. |
| **"Flag a comment that mentions a secret"** | When a comment matches `/api[_-]?key|secret|token|password/i` → instruct `/secops` to review, set `SECURITY_TOUCHED`. |
| **"Open testing after review passes"** | When `gate.passed` (Code review) → route to Test, instruct `/qa`. |
| **"Park work that needs a human"** | When a comment matches `/blocked|needs human/i` → set `NEEDS_HUMAN`. |

Presented as a **menu, not a gallery** — pick one, it loads into the editor pre-filled, the user edits and saves. This is the fastest path from "I don't get it" to "oh, *that's* what a rule is."

### 3.6 The loop note (live: line 199–201) — keep, but de-jargon

Today: *"A backward route loops. A per-ticket loop budget applies; on exceedance the ticket gets NEEDS_HUMAN."* "loop budget" and "exceedance" and "NEEDS_HUMAN" are all internal. Rewrite as a trust signal (loops are a *feature*, and DART catching a runaway is *reassurance* — `strategy-apex.md §1.4`):

> **This rule can send work backward — that's a loop, and it's fine.** If a ticket loops too many times, DART stops and hands it to you instead of looping forever.

And the inline one-shot helper (live: *"(one-shot — prevents an infinite loop)"*):
> *(clears the label so the loop runs once, not forever)*

---

## 4. Fan-out framing — the recommendation

**Recommendation: hide it completely in the MVP. Do not show "Fan out" or "parallel — later" anywhere in the UI.**

Rationale (this is a positioning call, not just a copy call):

- The live build exposes `Fan out` as a selectable DO action whose only content is the dead string **"parallel — later"** (`stage-rules.component.ts` line 190). A user who picks it gets *nothing* — a worse experience than the option not existing. **A picker option that does nothing is a trust leak**: it makes the whole editor feel half-built, which is exactly the "hard to understand / not friendly" complaint.
- "Fan-out" is jargon (the user flagged it by name). "parallel — later" mixes a feature word with a roadmap word in three syllables of confusion.
- Per `strategy-apex.md` honesty discipline: **don't show a control that doesn't do the thing.** Parallel stages are a real Phase-2 capability (Jorge §2.3), but they are not shippable now. The honest move is to omit them until they work.

**So:** remove `fan_out` from `ACTION_TYPES` in the user-facing picker (it stays schema-only in the engine, per Jorge — the model can carry it; the UI simply doesn't offer it). The four real actions (Route / Set label / Clear label / Instruct) are the whole authoring surface.

**If product insists on signaling it's coming** (acceptable, but second-best), use a single honest, clearly-disabled line — never a selectable option:

> *Coming later: run a stage with two owners at once (e.g. `/qa` and `/e2e` together). Not available yet.*

Placed as a muted, non-interactive footnote under the DO section — `aria-disabled`, never in the dropdown. The exact words to **never** ship: "fan out", "parallel — later", "AND-gateway", "barrier", "join".

---

## 5. Onboarding / progressive disclosure (approachable first, powerful on demand)

The principle: **show the pipeline and the four obvious actions by default; reveal everything advanced only when asked.** A first-timer should be able to read the builder top-to-bottom and understand it; an expert should be able to reach every power feature in one more click.

### 5.1 What to show by default (the calm first view)

- The **mental-model card** (§1.3), once, dismissible.
- The **stage list** with owner and gate, drag-to-reorder, Add stage. (Aura's layout.)
- **`Labels (N)`** in the topbar — visible, so labels have a discoverable home (the fix for "I should create labels somewhere").
- On each stage, the **`rules N`** pill — opens the rule editor on demand.
- Preset control — but with a plain-language gloss (§6.4), not three bare words.

### 5.2 What to reveal only on demand (kept out of the first read)

- The **rule editor** (behind the `rules` pill — not open by default).
- **Multiple conditions / AND-chaining** — the editor opens with *one* WHEN row and *one* DO row; "+ add condition" and "+ add action" reveal the rest. (The live build already starts a new draft empty — good; ensure the first row is pre-added so the user sees the shape, not a void.)
- **Chaining rules together (`then:`)** — advanced; live build doesn't expose it, keep it that way for MVP. If added later, behind a "⋯ → then run another rule" in the rule menu (Aura §2.3), never on the default form.
- **Gate editing** (owner / blocks-vs-warns / triggers) — behind the stage's "edit gate," as today.
- **The pattern/regex field** — power-user; keep the friendly helper *"matches text in a comment, e.g. `needs rework`"* so a non-regex user isn't scared off, and the raw regex stays optional.

### 5.3 Honest onboarding copy (no hype, no fake progress)

A first-run, three-step coachmark sequence (text only; Aura sequences it). Each step is a fact, not a flourish:

1. *"This is your pipeline — the stages work moves through. Drag a stage to reorder it."*
2. *"Give a stage rules — 'when this happens, do that' — to route work automatically."*
3. *"Make labels — the words your rules use to send work where it belongs."*

No "Welcome to the future of…", no progress percentage, no "you're a pro!" The tone matches DART's positioning: **a calm tool that hands you the controls** (`strategy-apex.md §6`).

### 5.4 The "you have no workflow yet" first-run (tie to the live default-workflow state)

The live build already detects a project on the default workflow (`isDefaultWorkflow()`), and the interactive spec has copy for it. Align the words to the mental model:

> **You're using the default pipeline.** It's a sensible starting set of stages. Edit anything — your first change saves a copy for *this project only*; the default is never touched.

This replaces the architecture-flavored "your first edit creates an overlay" (§6.2) with a plain promise a newcomer understands.

---

## 6. Microcopy library (concrete strings)

> Drafts for Aura/Finn. Verbs of fact ("routes", "records", "instructs", "sends", "refuses") over adjectives of hype. No number the data can't back; absent, never a fake zero. The intent/action line appears wherever a user might assume DART does the work.

### 6.1 Builder header / topbar

- **Builder title:** *"Pipeline — the steps your AI team follows."*
- **Builder subhead (first-run, dismissible):** *"Stages are the steps; rules move work between them; labels are the words that route it."*
- **Labels entry (topbar):** *`Labels`* (no count) when none; *`Labels · {N}`* when N > 0.
- **Add stage:** *"+ Add stage"* · caption when adding at end: *"New stage — added at the end. Drag it into place."*

### 6.2 The "overlay" banner rewrite (live: lines 64–72)

Today: *"You're editing this project's OVERLAY — the base workflow file is never changed."* + *"This project uses the default workflow; your first edit creates an overlay."*

Rewrite (kill "overlay" and "base workflow file"; keep the true reassurance):
> **Your changes save to this project only — the shared default is never touched.**
> *(first-time sub)* *"This project still uses the default pipeline. Your first edit saves a copy just for here."*

### 6.3 Stage rows (live: name / owner / gate / rules pill)

- **Owner select, empty:** *"— pick an owner"* (live shows bare `—`); helper on focus: *"the agent who works this stage"*.
- **Gate marker, none:** *"no gate"* (keep) — tooltip: *"no approval needed to leave this stage."*
- **Gate marker, blocking:** the shield + name, with tooltip *"Blocking gate — work can't move on until this passes."*
- **Gate marker, warning:** tooltip *"Warning gate — flags the stage but doesn't block."*
- **Rules pill:** *"rules · {N}"* — tooltip *"{N} 'when → do' automations on this stage. Click to view or add."*; when zero: *"rules"* + tooltip *"No rules yet — click to add one."*

### 6.4 Preset control (live: bare `solo` / `small-team` / `regulated`)

Three bare words mean nothing to a newcomer. Add a one-line gloss under the active one (content only):
- **solo** — *"Just me. Gates fire only when they matter."*
- **small-team** — *"Adds a code-review gate."*
- **regulated** — *"Every gate runs — the full process."*

(Backed by `claude/CLAUDE.md`'s preset definitions — facts, not invented.)

### 6.5 Rule editor (assembled here for handoff)

- **Title:** *"New rule — when something happens, do something."* (edit mode: *"Edit rule"*)
- **Name field:** *"Name"* · helper *"a short name so you can find this rule later — e.g. `send-rejection-to-backend`."*
- **WHEN legend:** *"When this happens…"* · no-condition hint: *"No condition yet — this rule runs every time the stage runs. Add a condition to narrow it."*
- **DO legend:** *"…do this, in order:"*
- **Add condition:** *"+ add another condition (all must match)"*
- **Add action:** *"+ add another action"*
- **Live preview (above Save):** *"This rule: {assembled sentence}."*
- **Save:** *"Save rule"* · saving: *"Saving…"* · saved toast: *"Rule saved. It runs from now on, the same way every time."*

### 6.6 Validation / error strings (live `draftError` reasons — humanize)

The live build's reasons are already decent; tighten to the vocabulary and add the *fix*:

| Condition (live) | Rewritten string |
|---|---|
| `A rule name is required.` | *"Give the rule a name so you can find it later."* |
| `Add at least one action.` | *"A rule needs at least one action — what should it do?"* |
| `Pick a target stage for the route action.` | *"Choose where to send the work."* |
| `This route would skip past an unmet safety gate.` | *"Can't send work past a security gate that hasn't passed. Route to a stage before it, or pass the gate first."* |
| `{owner} cannot set the label {label}.` | *"`{owner}` isn't allowed to set `{label}`. Add `{owner}` under 'Who can set this' in Labels, or pick a label they can set."* |
| `Pick a label to set.` / `…to clear.` | *"Choose a label."* |
| `Pick who to instruct.` | *"Choose which agent to instruct."* |
| `Instruct needs a prompt.` | *"Tell the agent what to do."* |
| `Pick an event for the condition.` | *"Choose what should trigger this rule."* |
| `The pattern cannot be empty.` | *"Type the text or pattern to match in a comment."* |

### 6.7 Label manager (assembled — see §2.4 for the form)

- **Title:** *"Labels — the words your team uses to route work."*
- **Empty state:** (full copy in §2.4).
- **Create button:** *"+ Create label"* (empty state: *"+ Create your first label"*).
- **Starter templates:** *"Use a starter: `TO_DEV_BE`, `TO_DEV_FE`, `NEEDS_DESIGN`, `READY_FOR_QA`"* — each one-click pre-fills the form.
- **Row (read):** *`TO_DEV_BE` — "send back to the backend dev" · set by /rev, /qa · sends to Implement.*
- **On a ticket (chip tooltip):** *"`TO_DEV_BE` — set by /rev. This is why the ticket is going to /be."*

### 6.8 Save / conflict / error (builder lifecycle — live: lines 95–122)

- **Status pill:** *saved* / *unsaved changes* / *saving…* / *conflict* / *couldn't save* (live wording is already plain — keep).
- **Conflict banner title** (live: *"This workflow changed while you were editing."*): keep — it's clear. Sub (live: *"We reloaded the current workflow; your unsaved edit was not applied. What you tried: {summary}"*): keep, it's honest and specific.
- **Conflict actions:** *"Discard my edit"* / *"Re-apply on top"* (live — keep).
- **Error:** *"Couldn't save: {reason}"* (live — keep, it's factual).

These already read well — the lifecycle copy is *not* where the comprehension problem lives. The problem is upstream: the user never understood *what they were building*. Fix §1–§3 and the lifecycle copy needs almost nothing.

---

## 7. Priority — what to ship first (highest comprehension-per-effort)

All content/copy; no new engine. Ordered by impact on the user's actual complaints:

1. **State the mental model** (§1.3 card + §1.4 vocabulary standardization). Nothing else lands until the user knows what a pipeline/stage/owner/gate/rule/label *is*. Pure copy.
2. **Give labels a home** (§2.3 topbar entry + §2.4 manager with the teaching empty state + the `TO_DEV_BE` template). This directly answers *"I should create labels somewhere."*
3. **Kill "parallel — later" / hide Fan out** (§4). One deletion; removes an active trust leak.
4. **Make the rule editor read as a sentence** (§3.1 legends + live preview reusing the existing read renderer; §3.4 teaching empty state; §3.5 example library).
5. **Rewrite the "overlay" banner and preset glosses** (§6.2, §6.4). Small strings, outsized clarity.
6. **Humanize validation strings** (§6.6). Each error now tells the user the fix.

---

## 8. Hand-offs

- **→ `/ui` (Aura):** place the mental-model card (§1.3), the **Labels topbar entry + manager surface** (§2.3 — the one new surface this proposes; coordinate with your builder layout), the live-preview line in the rule editor (§3.1, reusing your read-card grammar), the example-library menu (§3.5), and the "coming later" parallel footnote *if* product wants it (§4). I write the strings; you own layout/motion. Confirm the Labels manager fits as an expander vs panel.
- **→ `/po` (Max):** ratify the standardized vocabulary (§1.4) as the **locked public terms** (stage/owner/gate/rule/label/route — and "Blocks/Warns" for hard/soft); decide **Fan-out: hide vs "coming later" footnote** (§4 — I recommend hide); approve the `TO_DEV_BE` starter-template set (§2.4).
- **→ `/fe` (Finn):** the live-preview line reuses the existing `conditionText()`/`actionText()` renderers on the draft — no new grammar; the Labels manager needs a create-label path (the engine's `label/set` contract already exists per Jorge §1.4); remove `fan_out` from the user-facing `ACTION_TYPES` while leaving it schema-only.
- **→ `/secops` (Soren) + `/arch` (Jorge):** approve the wording of the **safety-gate refusal** rewrite (§6.6 — must match the engine's "no route past an unmet safety override") and the **intent/action line** ("DART decides what happens next; your AI tool does the work") used throughout — these are technical/security claims.
- **→ `/legal` (Alex):** none required (no claims about data, privacy, or third parties in this pass).

---

*Content & comprehension only. Invents no metrics. Every fix points at a live string or affordance in `workflow-builder.component.ts` / `stage-rules.component.ts`, or at a behaviour in Jorge's/Anna's design. The load-bearing honesty across the whole feature: DART records intent; your AI tool executes — surfaced wherever a user might assume otherwise. Visual/interaction/motion redesign is Aura's (`ux-aura.md`); this is the words and the mental model underneath them.*
