# Tasks Redesign — Usability, "Feel" & Positioning (Apex)

**Author:** Apex (`/mkt`) — Senior PMM / CSO
**Type:** Usability / first-impression / microcopy / positioning proposal. **No code, no gate, no invented metrics.** Words, mental model, and the emotional read only.
**Date:** 2026-06-13
**Lens in the five-agent parallel investigation:** the **usability + "feel" + positioning** lens. I own the *first impression per state*, the *truthful microcopy*, the *what-to-see-first* guidance, and the *positioning "wow."* Aura owns layout/motion/visual canon; Jorge/arch owns the projection that feeds these states; QA/rev owns the contract. Where a string sits on a region Aura specifies, I give the words.

**Read for this pass (grounding):** `usability-home-tasks-knowledge-apex.md §2` (my prior Tasks usability + locked vocabulary — **this doc extends it**) · `strategy-apex.md` (positioning, intent/action honesty) · `redesign-home-tasks-knowledge-aura.md §2` (Aura's train concept) · `tasks-adaptive-aura.md` (the adaptive station model — already in the build) · live `shell/tasks-board.component.ts` + `shell/tasks-panel.component.ts`.

> **Honesty stance (carried unchanged).** Every line of copy is backed by a real behaviour in the build, or it is cut. The load-bearing guardrails:
> 1. **DART decides what happens next; your AI tool does the work.** No copy implies DART runs agents or writes code itself.
> 2. **Absent, never a fake zero.** Counts are real or omitted — never "0 need you", never an empty grid of zeros, never a fake-green "all clear" that isn't true.
> 3. **Calm-confident, never apologetic.** A quiet board is a *state of control*, not an empty screen the product has to excuse.

---

## 0. The diagnosis in one paragraph (why the centre reads as "broken")

The board renders the centre as the **workflow stages** (vision → … → done). For *this* project — and for the common case of a local control tool — tickets cluster in **Backlog** (not started) and **Done** (finished), so the middle stages are empty. The pre-adaptive board gave every empty stage a full-width column, so the eye landed on a **wide band of empty columns**, and the only copy there was *"No tasks mid-pipeline right now"* — a line that is technically true but reads as an **apology for an empty screen.** The emotional read is "this is unfinished / broken / nothing's happening." The adaptive station model (already built) fixes the *layout* void by collapsing empty stages to thin stations. **My job is to fix the *meaning* void:** make the quiet board read as **"the pipeline is at rest and you're on top of it,"** not "there's nothing here." That is a first-impression and microcopy problem, not a layout problem — and it is mine.

---

## 1. First impression + emotional read — what the user should feel per state

The first impression is set in the **first 2 seconds**, before any reading. The board has *one* job at that altitude: answer **"is anything waiting on me, and is the work flowing?"** Every state below is designed so the answer is legible *as a feeling* first, *as a number* second. The unifying principle: **a quiet board is a state of control, not an empty one** — book-ended by where work waits (Backlog, left) and where work has landed (Done, right), with a calm pipeline at rest between them.

| State | What's true | The first impression (the feeling) | The visual that carries it | What it must NEVER feel like |
|---|---|---|---|---|
| **Nothing needs you (work in flight)** | Tasks moving through stages, none waiting on a person | **"It's running. I can watch or walk away."** Calm momentum. | Populated stage columns with the active-segment accent reaching forward; **no** needs-you chip in the roll-up. | Anxious — no false urgency, no red, no "act now." |
| **Work in flight + something needs you** | Tasks moving, ≥1 waiting on a person | **"One thing wants me — there it is."** Directed, not alarmed. | The roll-up **"{N} need you"** (warning hue) is the single loud thing; the needs-you cards carry the chip. | A wall of equally-loud signals where the one that matters is lost. |
| **All done** (everything in the Done folder) | Every task finished, middle idle | **"Shipped. The pipeline did its job."** Quiet pride, a terminus that's *full*. | Tidy compact stations at rest + the **Done folder full ("× N")** book-ending the right; active accent resting at the end. | A blank board that looks like the work vanished or never happened. |
| **Waiting in backlog** (work queued, middle idle) | Tasks in Backlog, nothing advanced yet | **"It's queued and ready — the team will pick it up."** Poised to start. | The **Backlog bar (left, populated)** book-ends a tidy row of resting stations; the calm-middle line teaches *why* the middle is clear. | "Broken / nothing here" — the failure mode the brief flags. |
| **Empty board** (nothing anywhere) | Zero tasks, ever | **"This is ready for work — and the team makes the tasks, not me."** Inviting, teaching. | The kept full-board empty state (sell + teach). | A dead end, or implying *you* must hand-author tasks. |
| **Off-track present** | A removed stage left tasks stranded | **"Something needs re-homing — and nothing's lost."** Recoverable, not alarmist. | The distinct warning-toned lane with the reassurance line directly under the head. | An error / data-loss scare. Warning tone, never danger-red. |

**The throughline:** the *quiet* states (all-done, waiting-in-backlog) are the ones the old board botched. They are reframed from **"empty"** to **"at rest, book-ended, on top of it."** The Backlog (work waiting) and Done (work finished) are *always-visible bookends* precisely so the middle being idle reads as **"the in-between is calm right now,"** not "there is nothing." A pipeline at rest with a full inbox on the left and a full outbox on the right is *obviously* a working system between bursts — that is the calm-confident feeling we engineer.

---

## 2. Microcopy — the truthful set for each key state

Verbs of fact ("waiting", "finished", "advances", "needs you") over adjectives of hype. No fake zero, no fake urgency, no dishonest green. The reframe principle for the previously-empty centre: **the screen is never empty in the first place** — the bookends + resting stations *are* the content, and the line below them is a calm *explanation of a real state*, not an apology for a blank.

### 2.1 The currently-empty centre — the line to replace

| | String |
|---|---|
| **Live today (the apology)** | *"No tasks are mid-pipeline right now. They'll appear at a stage as the team advances them."* |
| **Reframed — work waiting in Backlog** | **"Pipeline's clear — work is queued in the Backlog, ready for the team to pick up."** |
| **Reframed — everything finished (Done full)** | **"Pipeline's clear — everything's shipped to Done. Nothing waiting on the team right now."** |
| **Reframed — generic (when both/uncertain)** | **"Pipeline's at rest. Work's waiting in the Backlog and finished in Done — nothing mid-flow right now."** |

Why this works: it **leads with the calm-confident verdict** ("Pipeline's clear" / "at rest") *before* the explanation, so the feeling lands before the detail. It **names the bookends** (Backlog / Done) so the eye is told *where the work actually is* — turning "empty middle" into "the work is over there, on purpose." And it is **literally true** for every case the `middleEmpty()` signal already gates (work exists in Backlog/Done/off-track, just not mid-pipeline). Pick the specific variant when the projection knows which bookend holds the work; fall back to generic otherwise. **Absent-not-zero discipline holds:** this line shows *only* when the middle is idle *and* there is real work elsewhere — never on a truly-empty board (which keeps its own sell-and-teach empty state).

### 2.2 The full microcopy set — the four key states

| State | Surface | String | Honesty note |
|---|---|---|---|
| **Nothing-needs-you (in flight)** | roll-up | *"{N} tasks"* (no needs-you chip) | Absent needs-you chip *is* the "nothing wants you" signal — no fake "0 need you", no fake-green "all clear". |
| | (optional, forward) calm sub-cue | **"Work's flowing — nothing's waiting on you."** | Only when the projection can prove in-flight > 0 and needs-you = 0. Absent otherwise. |
| **Work-in-flight** | active stage columns | (the cards, flowing) | The motion + active-segment accent carry "it's moving"; no extra copy needed. |
| | roll-up | *"{N} tasks"* | Factual count only. |
| **All-done** | done folder | *"Done"* + count *"× {N}"* | "Done" / "finished" — never "closed/archived/removed" (a view convenience, not a delete). |
| | calm-middle line | **"Pipeline's clear — everything's shipped to Done. Nothing waiting on the team right now."** | True: every task is in the done folder. |
| **Waiting-on-you** | roll-up | **"{N} need you"** (warning hue) | The single most actionable signal; loudest thing on the board. Omitted when 0. |
| | card chip | *"needs you"* (warning) · tooltip *"Waiting on a person — an approval to give or a decision to make."* | Honest: it's waiting on a *person*, named plainly. |
| | (forward) first needs-you nudge | **"1 task needs you — give it an approval or a decision to let it move on."** | Teaches *what "needs you" means* on first contact; dismissible. |

**Kept verbatim (already perfect — do not touch):**
- **Empty board:** *"No tasks yet — the team will create them as work starts."* — teaches the model (the *team* makes tasks; you don't hand-author them) and sets expectation. This is the gold-standard empty state; new empty states should match its voice.
- **Empty single stage:** *"Nothing in this stage."* — calm, factual.
- **Off-track lane:** *"Off-track ({N})"* · *"These tasks are in a stage that's no longer in the pipeline."* · *"Nothing's lost. Open a task and advance it to put it back on the pipeline."* — the reassurance line turns a scary "off-track" into a recoverable state. Keep.
- **Backlog empty:** *"Backlog is clear."* — calm, not a bare box.

### 2.3 What the microcopy must NEVER say

- **No fake urgency.** Never "Action required!", never a red badge on a calm board, never a count that pulses for attention it hasn't earned.
- **No dishonest green / fake zero.** "0 need you" is banned (absent the chip instead). A green "all clear" only when it's *true* (genuinely nothing waiting) — and even then, prefer the quiet absence of the warning over a manufactured reassurance badge.
- **No apology.** "Sorry, nothing here", "This looks empty", "No data" — banned. A quiet board is a state, not a failure.
- **No autonomy overclaim.** Never "DART is working on it" / "agents running" on a card unless an agent is *actually* running (host-reported). DART **records intent; your AI tool does the work** — the board shows the *state of the work*, not a claim DART is doing it.

---

## 3. Intuitiveness / cognitive load — what to see first, and how to cut the "where do I look"

### 3.1 The ONE thing to see first: **"what needs me."**

A control surface for autonomous agents has exactly one daily question: **is anything waiting on me?** Everything else (flow, counts, stages) is secondary monitoring. So the **needs-you signal is the single highest-priority element on the board**, and the layout/copy must make it the first thing the eye lands on:

- **When something needs you:** the roll-up **"{N} need you"** (warning hue) is the loudest element, top of the board; the needs-you *cards* carry the chip so the eye can jump from the count to the card. One loud thing, everything else calm.
- **When nothing needs you:** the **absence** of that warning *is* the answer — the calm board itself says "nothing wants you." This is why absent-not-zero matters so much here: a "0 need you" would force the user to *read and dismiss* a non-signal every time; absence lets them *feel* "all clear" in under a second.

This is the reason the board exists, surfaced as the first read. It mirrors the Projects-Home "needs you → look here" loop (`usability-home-tasks-knowledge-apex.md §1.3`) — **one consistent attention model across surfaces.**

### 3.2 Cutting the "where do I look" problem of the multi-region layout

The board has four regions (Backlog · pipeline · Done · off-track). Four regions risks four equal places to look. The fix is a **deliberate reading order**, enforced by visual weight (Aura) and by *what each region is allowed to shout*:

1. **First read — "what needs me":** the roll-up needs-you count (loud only when > 0). Top, can't-miss.
2. **Second read — "is it flowing":** the pipeline's active-segment accent + any cards in motion. The *shape at a glance* (how far the accent reaches) answers "where has work got to" without reading a single label.
3. **Bookends as orientation, not destinations:** Backlog (left) and Done (right) are **always-present anchors** that tell the eye "start" and "end" — they *frame* the read; they're not where you look first. They earn their permanence by making the quiet middle legible (§1), not by competing for attention.
4. **Off-track — only when it exists:** absent unless there's something stranded; when present, warning-toned and self-explaining, so it pulls attention *only when it should*.

**The cognitive-load rule:** **at most one region shouts at a time.** Needs-you shouts when work waits on a person; off-track shouts when something's stranded; otherwise the board is calm and the *active accent* is the only movement. Never four regions all styled to grab the eye — that *is* the "where do I look" problem, and the cut is "only the region that needs a human gets to be loud."

### 3.3 View-switching, if any — zero-friction and remembered

The adaptive model already gives the two views the brief implies — a **compact pipeline** (default; empty stages as stations) and an **expanded** read (a station click-expands in place, or a populated stage is already a column). Guidance for any view-switch:

- **Zero-friction:** expanding a station is a single click/`Enter` *in place* — no modal, no navigation, no mode the user has to exit deliberately. The default (compact) is the *right* default for the common quiet case, so most users never switch at all.
- **Remembered:** if a user expands a station (or opens the Done folder), that choice **persists across live SSE pushes** within the session — a background re-layout must not silently re-collapse what the user opened (it's their focus; respect it). Across sessions, return to the calm default.
- **No hidden modes.** Never a view-toggle the user can get "stuck" in and not understand how they got there. The compact↔expanded distinction is *automatic by content* (populated = expanded) with a light manual override (peek/expand an empty station) — not a global mode switch.
- **The Tasks *panel* → board hand-off** (`tasks-panel.component.ts` "Open board") is the one deliberate navigation; keep it a single clear affordance. The panel is the *glance* (status mix at a glance on Home/shell); the board is the *work surface*. One word ("Tasks"), two altitudes — consistent with the Home/board/Knowledge altitude model.

---

## 4. Positioning / the "wow" — "this is the control surface I wanted," not "another kanban"

### 4.1 The trap and the differentiator

A stage board *looks like* a kanban, so the default perception is "another Trello/Jira board." That perception is the enemy of the "wow." The differentiator is the one thing no kanban does: **this is a control surface for steering autonomous AI agents through a gated workflow.** The board must make that **legible and satisfying** — the user should feel they're *watching and steering a team that acts on its own*, not *manually dragging cards a human has to move.*

### 4.2 The three things that make it "the control surface I wanted"

1. **Flow you watch, not cards you push (autonomy made visible).** The single biggest "wow" is that **work moves on its own** — a card advances because a stage's owner finished and the gate passed, and you *see it happen* (the train motion, the active accent extending) without touching it. The deliberate **absence of free drag** is the positioning, not a limitation: *you don't push these cards — the team moves them, and you watch the pipeline flow.* That is categorically different from a kanban where nothing moves unless a human drags it. Surface it once, on first contact: a dismissible **"Cards advance themselves as the team finishes each stage — you watch the flow and step in only when something needs you."**

2. **Gates with teeth, shown as structure (governance made legible).** The rail nodes encode gates (hard diamond / soft dashed diamond), and **advancing is a routed, guarded step** — DART *will refuse* to push a task past an unmet safety gate. That refusal is a **trust feature to surface, not hide**: when the engine blocks an advance, the error reads in the safety-gate voice (*"Can't advance past a security gate that hasn't passed."*) — proof the gate is real, not advisory. A board where the *process can say no* is the "enforced, not suggested" wow. (Exact wording → `/secops`, per my prior §2.4.)

3. **The one thing that needs you, surfaced (steering made effortless).** The flip side of autonomy: when the agents *can't* proceed (a human approval, a decision), the board hands it to you cleanly — the needs-you signal (§3.1) and the loop-handback (*"looped 3× → needs you"* from `strategy-apex.md §4.1`). The "wow" is **"it runs itself until it genuinely needs me, then it tells me exactly what."** That is the steering promise made real: you're not babysitting; you're stepping in at the one moment that matters.

### 4.3 The one-line positioning the redesign must deliver

> **"Watch your AI team move work through a pipeline it can't skip steps in — and step in only when it needs you."**

Three load-bearing ideas in one breath: **watch** (autonomy — it moves on its own, you observe) · **a pipeline it can't skip steps in** (governance — gates with teeth, the moat) · **step in only when it needs you** (effortless steering — the needs-you gate). That sentence is what separates "the control surface I wanted" from "another kanban," and every state/copy/motion choice above ladders up to it. It's honest: DART decides what happens next and enforces the gates; your AI tool does the work; you steer at the gates.

---

## 5. Priority — highest feel-per-effort (all copy/framing; no new engine)

1. **Reframe the calm-middle line** (§2.1): "No tasks mid-pipeline…" → "Pipeline's clear — work is queued in the Backlog / shipped to Done." Pure copy; turns the apology into a calm-confident verdict. The single highest-impact change for the reported problem.
2. **Hold absent-not-zero on needs-you** (§3.1): the absence of the warning *is* the "all clear" — never a "0 need you". Already the build's discipline; protect it.
3. **First-contact autonomy line** (§4.2.1, dismissible): "Cards advance themselves as the team finishes each stage…" — names the differentiator on first open, then gets out of the way.
4. **State-specific calm verdicts** (§2.1 variants) when the projection knows which bookend holds the work — sharper than the generic line.
5. **Forward: needs-you teaching nudge + in-flight calm sub-cue** (§2.2) — ship only when the projection can back them; absent otherwise.

---

## 6. Hand-offs

- **→ `/ui` (Aura):** place the reframed calm-middle line (§2.1) where `rail__idle` sits today; ensure the Backlog/Done bookends read as *orientation anchors* (always present) so the quiet middle is legible as "at rest", not "empty"; enforce the §3.2 "one region shouts at a time" weighting; persist an expanded station / open Done folder across live pushes (§3.3). I own the strings; you own weight, motion, and where the autonomy first-contact line lives.
- **→ `/po` (Max):** ratify the one-line positioning (§4.3) and the calm-verdict reframe (§2.1) as the locked Tasks-board framing; confirm "Done" stays the terminus word (never "archive/closed").
- **→ `/fe` (Finn):** the reframe and verdicts are copy-only over the existing `middleEmpty()` / roll-up signals; **absent-not-zero** for every new cue (needs-you sub-cue, in-flight sub-cue) — do not ship a calm sub-cue the projection can't prove; the state-specific calm-middle variant needs the projection to report which bookend holds the work (else use the generic line).
- **→ `/secops` (Soren) + `/arch` (Jorge):** confirm the safety-gate refusal advance-error wording (§4.2.2) matches the engine's actual refusal, so "Can't advance past a security gate that hasn't passed" is literally true at the call site.

---

*Usability, feel, and positioning only. Invents no metrics; every state/line points at a real signal in the build (`middleEmpty`, the roll-up needs-you count, the done folder, the off-track lane) or is clearly marked forward (ships only with its backing data). The load-bearing reframe: a quiet board is a **state of control**, not an empty screen — book-ended by where work waits and where it's finished, with a pipeline calmly at rest between. DART decides what happens next and enforces the gates; your AI tool does the work; you step in only when it needs you. Visual/motion is Aura's; this is the feeling and the words underneath it.*
