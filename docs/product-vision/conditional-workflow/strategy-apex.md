# Positioning & Cockpit Strategy — Conditional Workflow, Plugin, Knowledge Scoping (Apex)

**Author:** Apex (`/mkt`) — Senior PMM / CSO
**Type:** Strategy investigation — positioning, in-product messaging, microcopy. **No code, no gate, no invented metrics.**
**Scope:** How to position three new DART capabilities and what to surface in the Cockpit:
1. a user-controlled **`when → do`** workflow engine (labels, loops, conditional routing, parallel stages),
2. **DART as a plugin** that overlays Claude Code / Kiro (records intent; the host executes),
3. **Knowledge** (renamed from "Base") split by scope — common/shared vs project — with cross-project-type reuse and a `/kai` propose→approve loop.

**Companion docs:** [strategy.md](../strategy.md) (category/positioning, mine) · [cockpit-promotion-apex.md](../cockpit-promotion-apex.md) (Projects-Home content, mine) · [architecture-jorge.md](architecture-jorge.md) (Jorge's engine/plugin design) · [research-anna.md](research-anna.md) (Anna's rule + scoping taxonomy) · [VISION.md](../VISION.md) (MVP scope; L2/L4/L8).

> **Honesty stance carried from my prior docs.** Every claim here is backed by an actual behaviour in Jorge's or Anna's design, or it is cut. The load-bearing honesty guardrail for all three features: **DART records intent; the host tool executes.** I never imply DART runs agents itself in this phase. I invent no numbers. Security/technical claims route to `/secops` + `/arch` before they ship as copy.

---

## 0. Hard constraints I am writing inside

- **Facts only — no invented numbers.** No "10x", no "trusted by N teams", no fabricated counts. Every dynamic number in the Cockpit comes from data the engine already produces (active rule count, labels in the ledger, fired-rule traces, knowledge-row counts by scope, pending `/kai` proposals) or it is **absent** (never a fake zero — Aura's rule).
- **The intent/action boundary is a marketing constraint, not just an architecture one.** Because DART *records intent and the host acts* (Jorge §1.2, §2.1), I must never say "DART runs your tests / fixes your code / routes the work automatically and does it." The honest verbs are **records, routes (the ticket's state), instructs, refuses, remembers, proposes** — not "executes" or "ships."
- **Augment, never fight.** The plugin's whole adoption thesis is that the user's own commands/skills/hooks stay sovereign (Jorge §3.1: plugin = lowest precedence, namespaced `/dart:*`, opt-in per project). The messaging must reinforce that, never undercut it with lock-in language.
- **Don't market the agents — market the discipline.** Same moat as strategy.md §1: the differentiator is *user-controlled, visible, enforced process across projects*, not "look, lots of agents." The new engine makes the *control* concrete; lead with control.
- **Proportional, not preachy.** Surface the few signals that prove governance and momentum; cut the vanity. A rules engine can tempt a cockpit into a wall of dials — resist it.

---

## 1. Positioning — the `when → do` engine, user-controlled labels/loops, parallel agents

### 1.1 What actually changed (so I position the real thing)

Before this work, DART's process was a **proportional gate gauntlet** — gates fire by trigger, can refuse, security never skipped. That is governance, but it is *the framework's* process. The new engine flips ownership: **the user defines the labels and the rules, and fully controls who is triggered and when** (Anna Q1; Jorge §1.4 label contract). The process stops being "DART's opinion you comply with" and becomes "**your** process, made of rules you wrote, that DART enforces deterministically." That is a categorically stronger story — it converts a governance product into a **programmable** governance product without asking anyone to write code.

### 1.2 The one-line story

> **Write the rules your AI team follows — *when this, do that* — and DART runs them every time, the same way, on the tool you already use.**

Three load-bearing ideas in one breath: *your rules* (user-controlled, not ours), *when→do* (the plain-language mechanic anyone who has used Jira automation or Zapier already understands — Anna §1), *every time, the same way* (deterministic enforcement — the engine routes; the model doesn't decide control flow — Jorge §2.1).

**Alternates (A/B, same ideas):**
- *(control-led)* "You hold the routing. DART makes it repeatable."
- *(loop-led)* "Send work back, branch it, run stages in parallel — as rules, not as nagging."
- *(determinism-led)* "Your process, enforced by a rule engine — not by remembering to prompt it."

### 1.3 How it differentiates — three honest contrasts

| Against | Their reality | DART's wedge (honest) |
|---|---|---|
| **Plain AI coding assistants** (Claude Code, Cursor, Copilot) | You drive turn by turn; "the process" lives in your head and your prompts. Looping a rejected change back to the right dev is *you, re-typing*. | DART makes the loop a **rule you wrote once**: `/rev` sets `TO_DEV_BE` → ticket routes back to `/be` with an instruction, deterministically, every time (Anna AC-W1; Jorge §1.3). The assistant still does the work — DART owns the *control flow* the assistant has none of. |
| **CI/automation** (GitHub Actions, n8n, Jira Automation) | Real `when→do` engines — but **not dev-team-aware**. They fire on repo/app events and run scripts; they don't know stages, gates, reviewers, or a security-never-skipped rule, and they don't route *agent* work. | DART borrows their vocabulary (`when/if/then`, label/comment/event triggers, fan-out — Anna §1) but binds it to a **software-delivery model**: stages, role agents, refusable gates, a label contract that says *which agent may set which routing label*. It is "automation that understands code review," not generic plumbing. |
| **Agent frameworks** (LangGraph, CrewAI, AutoGen) | You express the graph/loops **in Python**. Powerful, but code-first, no governance UI, no published label contract, no "point at a folder." | DART expresses the same loops/branches/parallelism as **declarative rules a non-coder can read and a builder can author** (Jorge §4 R4), with the routing decision *visible at the call site* (a rule), not buried in agent code. You get the control without the SDK. |

**The defensible seam (unchanged from strategy.md):** nobody else binds *user-authored when→do routing + a label contract + refusable gates + parallel stages* on top of the tool you already use, across projects. The new engine doesn't change the moat — it **sharpens it from "enforced process" to "*your* enforced process, programmable in plain rules."**

### 1.4 The honesty guardrail (the line I will not let copy cross)

DART **records intent; the host executes** (Jorge §2.1). So:

- ✅ "DART routes the ticket back to backend and instructs `/be`." (true — routing is a ledger mutation DART owns)
- ✅ "Your AI tool picks up the instruction and does the work." (true — the host executes)
- ❌ "DART automatically fixes the review findings." (false — DART instructs; the host's agent fixes)
- ❌ "Set it and forget it — DART ships the feature." (false and dangerous — there is a human/host in every loop)

The accurate, still-compelling frame: **"DART decides what happens next; your AI tool makes it happen."** That sentence is the whole intent/action split, and it is *more* trustworthy than "fully autonomous," which the ICP (burned-by-Devin developers, strategy.md §2) actively distrusts.

**Loop-termination honesty:** the engine has a loop budget that converts a runaway loop into a **"needs you"** item (Jorge §1.3 R1; Anna §5). That is a *feature to surface honestly*, not hide: "rules can loop, and when they loop too long DART hands it back to you" is a trust signal, not an admission.

---

## 2. "A plugin that augments your tool — never fights it"

### 2.1 The positioning job

The single biggest adoption objection for a layer that sits over Claude Code / Kiro is **"will it hijack my setup?"** Developers are allergic to a tool that overwrites their `~/.claude`, shadows their `/arch`, or rewrites their hooks. Jorge's plugin decision (§3.1) is *built to answer exactly this* — namespaced `/dart:*`, **lowest precedence** (the user's own config always wins on a collision), **opt-in per project**, and it **never edits the user's files**. My job is to make that architecture legible as a **trust win**, not bury it as a footnote.

### 2.2 The one-line story

> **DART installs as a plugin and keeps its hands off your setup: your commands, your skills, your hooks stay exactly as they are — DART adds a namespaced team you switch on per project, and switch off anytime.**

**Alternates:**
- *(coexistence-led)* "Your `/arch` is still your `/arch`. DART's lives at `/dart:arch`."
- *(reversibility-led)* "Opt in per project. Disable the plugin and you're exactly where you started."
- *(no-mutation-led)* "DART never edits your config — it ships its own, underneath yours."

### 2.3 The trust-not-lock-in message (each claim backed by Jorge §3.1)

| Trust claim (use) | Backed by (fact) | Overclaim to avoid |
|---|---|---|
| **"Your existing commands and skills are untouched."** | Plugin namespacing → DART is `/dart:*`; cannot clobber the user's `/arch`, `/deploy`, etc. | ✗ "Works with everything" (vague). Say *"won't collide with your own commands."* |
| **"You always win a name collision."** | Settings precedence enterprise > user > project > **plugin**; DART is the lowest layer. | ✗ "DART takes over your workflow." It augments; it does not override the user's config. |
| **"Turn it on for the projects that want it; off everywhere else."** | Per-project enablement in project `.claude/settings.json`. | ✗ "Installed globally and always on." That is the *opt-out* of the value prop. |
| **"DART never edits your files."** | Hooks/monitors/MCP ship *inside* the plugin; no mutation of `~/.claude/settings.json`. | ✗ "Zero footprint" (absolute). Say *"it adds its own components; it doesn't rewrite yours."* |
| **"Disable it and you're back to before."** | Atomic install/uninstall of the plugin unit; reversible by disabling. | ✗ implying state you create (tickets, knowledge) vanishes — that lives in your repo and stays. Be precise: *the integration* is reversible, *your data is yours*. |
| **"It works *with* what you have — it doesn't ask you to switch."** | No IDE migration, no new model, reuses host login/keys (VISION L2). | ✗ "No lock-in, ever" about third-party model costs we don't control. |

### 2.4 Why this is the adoption wedge (not just a feature)

This is the **anti-Kiro** message made concrete. Kiro asks you to adopt an IDE and lean on AWS (strategy.md §2). The frameworks ask you to write Python. DART's plugin asks you to *enable a plugin in one project and keep everything else exactly as it is* — and it can't clobber you even if it wanted to, because precedence is on your side. **"Augments, never fights"** is not a slogan; it is the literal precedence order. That is the single most credible lock-in rebuttal in the deck, and it should be a **top-three message**, not fine print (carrying strategy.md §6's "lock-in fear" antidote forward).

**Honest framing of the bidirectional channel:** the "mutual awareness" (Jorge §3.2 — SessionStart digest + monitor notifications in; MCP write-back out) should be described as **"DART tells your tool what to do next; your tool tells DART what it did"** — a *conversation between two tools you control*, not a black box that acts on its own. Avoid "real-time autonomous orchestration"; say **"your session sees DART's directives as they fire, and acts on them."**

---

## 3. Knowledge scoping as a value prop

### 3.1 The rename is a positioning upgrade — take it

"Base" was internal jargon (and ambiguous — base of what?). **"Knowledge"** is plain, human, and searchable. More importantly, *splitting it by scope* turns a single per-project store into a **two-tier asset**: "**your team's shared know-how**" and "**this project's specifics**." That maps to how teams actually think ("this is how *we* build Java services" vs "this is how *this* repo is wired"), and it is a value prop competitors' flat RAG plugins don't articulate (strategy.md §2: "context with teeth," now also "context with the right *reach*").

### 3.2 The one-line story

> **Two layers of memory: what your whole team knows, and what this project knows — so a lesson learned in one Java repo can steer every Java repo, while each project keeps its own rules straight.**

**Alternates:**
- *(reuse-led)* "Solve it once for Java; every Java project inherits it."
- *(isolation-led)* "Shared where it should be, private where it must be — projects never bleed into each other."
- *(approval-led)* "DART notices the pattern; you decide if the whole team should follow it."

### 3.3 The three value pillars (each backed by Anna Q2)

| Pillar | Honest phrasing (use) | Backed by (fact) | Overclaim to avoid |
|---|---|---|---|
| **Shared vs project knowledge** | *"Common knowledge is shared across your projects; project knowledge stays in this one."* | `scope: common \| project`; project recall isolation is already tested (Anna §1; AC-K1). | ✗ "All your AI knowledge in one brain" — implies a cloud hive-mind. It's **local-first, scoped, AND-filtered**. |
| **Cross-project-TYPE reuse** | *"Tag a lesson `java` and every Java project inherits it — your Python projects never see it."* | `stack`/`domain` tags + `any` wildcard; recall = union of (common matching stack) and (own project) (Anna §3; AC-K3, AC-K6). | ✗ "Knows your whole org" — it knows *what you tagged and approved*. Scope to the tag, not to omniscience. |
| **`/kai` propose → you approve** | *"DART proposes patterns it keeps seeing; you decide whether they become common, stay project-local, or get rejected."* | `/kai` is propose→human-approve→apply, **never auto-promotes** (Anna §4; AC-K2; existing `/kai` contract). | ✗ "DART learns and improves your team automatically." It **proposes**; *you* promote. The human gate is the trust feature — surface it, don't hide it. |

### 3.4 The honesty guardrails specific to Knowledge

- **Local-first, always.** Carry the cockpit-promotion §4 caveat: Knowledge lives in your repo/store; DART doesn't upload it. Never imply a shared cloud. "Shared across *your* projects" means *on your machine / your team's repos*, not "shared to a DART server."
- **"Common" is something you approve into, never automatic.** The whole credibility of cross-project sharing rests on the human gate. The message is **"nothing becomes common knowledge without your say-so"** — that is both true (Anna §4) and the exact reassurance that makes a developer comfortable letting `/kai` watch their work.
- **Recall is retrieval, not magic.** Until an embedder is configured, recall is filename/tag-based (Anna §1; VISION). Don't imply semantic understanding we haven't shipped; say *"surfaces the rules that match this work,"* and let the recall indicator (VISION Recall) show it actually happening.
- **Precedence is honest, not silent.** When a project rule contradicts a common one, the project rule wins (Anna AC-K5). Surface that ("this project overrides a shared rule") rather than silently dropping one — silent conflict resolution erodes trust.

---

## 4. What to SURFACE in the Cockpit (and what NOT to)

**Governing principle (carried from cockpit-promotion §3):** every signal must (a) come from real data, (b) communicate **control, governance, or momentum** — not vanity, and (c) degrade to *absent*, never a fake zero. These three features add new data; the discipline is to surface the *few* signals that prove "your rules are running, your tool is unhijacked, your knowledge has the right reach" — and to cut the dials that just look busy.

### 4.1 The `when → do` engine — surface *control made visible*

| Surface | Signal | In-UI phrasing | Source | Worth it? |
|---|---|---|---|---|
| Workflow / rules view | **Active rules** | *"7 rules active"* (link to the list) | rules in resolved workflow doc | **Yes** — proves *your* process is loaded and running. Quiet, factual. |
| Per-ticket | **Routing labels in play** | the label chips currently on the ticket: *`TO_DEV_BE`* (warning hue) | ledger `labels:[]` | **Yes (high)** — this is the steering wheel *visible*. A reviewer sees instantly *why* a ticket is going where it's going. |
| Per-ticket | **What routed it here** | *"routed to /be by rule `route-rejection-to-backend`"* (in the timeline) | `fired:[]` rule trace | **Yes** — the "no surprises" signal; the routing decision is auditable, not magic. |
| Per-ticket / stage | **Parallel stage owners** | two owner chips on one stage: *`/qa` `/e2e`* + *"waiting on both"* (join: all) | stage `owners:[]` + per-owner progress | **Yes** — proves fan-out is real and shows the barrier honestly. |
| Per-ticket | **Loop hand-back** | *"looped 3× → needs you"* (warning) | `loop.exceeded` → `NEEDS_HUMAN` | **Yes** — turns a safety mechanism into a trust signal; the user sees DART caught the loop. |
| Global strip | **Rules fired today** | *"12 routed today"* (factual count, only when > 0) | comment-log `directive`/route traces | Optional — momentum, only if it doesn't crowd. Prefer *needs-you* (cockpit-promotion §3.1) as the louder signal. |

**Do NOT show:** a live "rule engine throughput" gauge, a count of *every* predicate evaluated, per-rule firing histograms, or a "rules health score." Those are dashboards-for-dashboards. The rule *list*, the *labels on a ticket*, and *what fired* are the whole honest story. Never render the rule graph as decoration on the home view — it belongs in the workflow/builder surface, on demand.

### 4.2 The plugin integration — surface *coexistence and reversibility*

| Surface | Signal | In-UI phrasing | Source | Worth it? |
|---|---|---|---|---|
| Project header / connect | **Plugin status for this project** | *"DART plugin: enabled for this project"* (or *"available — enable for this project"*) | project settings `enabledPlugins` | **Yes** — confirms the *opt-in, per-project* promise is real and visible. |
| Connect / settings | **Host link health** | *"connected to Claude Code"* · live dot; or *"host not detected"* | host detection / MCP handshake | **Yes** — proves mutual awareness without claiming autonomy. |
| Per-ticket timeline | **Pending directives** | *"2 directives waiting for your tool"* | `directive` comments unacted | **Yes** — shows the intent/action handoff *honestly*: DART recorded intent, the host hasn't acted yet. |
| Settings | **Namespace reassurance** (static) | *"DART's commands are namespaced `/dart:*` — your own commands are untouched."* | static fact | **Yes (once)** — a one-line trust cue at connect time; not a recurring badge. |

**Do NOT show:** a list of the user's *own* commands/hooks (not ours to display — that reads as surveillance and undercuts "we don't touch your setup"), a "DART is in control" banner (false — it records intent), or precedence internals. Keep the plugin surface to *enabled/where*, *host connected?*, and *what's pending* — the three facts that prove "augments, doesn't fight."

### 4.3 Knowledge scoping — surface *reach and the human gate*

| Surface | Signal | In-UI phrasing | Source | Worth it? |
|---|---|---|---|---|
| Knowledge panel | **Scope counts** | *"Common: 8 · This project: 14"* | row counts by `scope` | **Yes** — the two-tier asset made tangible in one line. Absent (not "0") if a scope is empty. |
| Knowledge panel | **Type reach** | small tag row on a common item: *`java`* / *`frontend`* / *`any`* | `stack`/`domain` tags | **Yes** — shows *how far* a piece of knowledge reaches, honestly scoped. |
| Global / project | **Pending `/kai` proposals** | *"3 patterns awaiting your review"* (accent, only when > 0) | items `status: pending` | **Yes (high)** — the decision that needs *you*; the trust gate made actionable. Mirrors the "needs you" hook. |
| Knowledge item | **Provenance** | *"proposed by /kai · approved by you · 4d ago"* | proposal trace | **Yes** — the human-in-the-loop is the credibility; show who approved. |
| Recall (existing) | **Recall indicator** | *"recalled now"* when a rule steers a task (VISION Recall) | recall events | **Yes** — already specced; ties Knowledge to *enforcement*, not just storage. |
| Per-ticket (rare) | **Override notice** | *"this project's rule overrides a common one"* | precedence (Anna AC-K5) | Optional — surface only when a conflict actually resolves; honesty over silence. |

**Do NOT show:** total bytes/embeddings indexed, a "knowledge score", per-query recall latency, or a count of *rejected* `/kai` proposals as a hero number (audit-only — Anna §4). And never imply common knowledge is shared beyond *your own* projects (no "shared with the community/cloud" framing).

### 4.4 The cross-cutting "what NOT to show" rule

Three new features = three new temptations to clutter. The unifying cut: **show the signal that needs a human or proves a promise; hide the telemetry that only proves the machine is busy.** Active rules / labels-in-play / what-routed-it (control), plugin-enabled-here / host-connected / pending-directives (coexistence), scope-counts / pending-`/kai` / provenance (reach + gate). Everything else — throughput gauges, evaluation counts, byte tallies, rejection counts, the user's own config — stays off the home view.

---

## 5. Microcopy drafts (factual, no hype)

> Drafts for Aura/Finn. Verbs of fact ("routes", "records", "instructs", "proposes", "refuses") over adjectives of hype. No number the data can't back; absent, never a fake zero. Security/privacy wording routes to `/secops` + `/arch` before shipping (per my SKILL).

### 5.1 Rule builder (`when → do`)

- **Builder title:** *"Rules — when this happens, do that."*
- **Empty state:** *"No rules yet. Add a rule to route work automatically — for example, send a rejected review back to the developer who owns it."*
- **New-rule scaffold labels:** *"When…"* (trigger) · *"Only if…"* (optional guard) · *"Do…"* (actions) · *"Then run…"* (optional chain).
- **Trigger picker:** *"A label is set"* · *"A comment matches text"* · *"Something happened"* (gate passed/rejected, stage entered, comment added).
- **Action picker:** *"Route to a stage"* · *"Run stages in parallel"* · *"Set / clear a label"* · *"Instruct an agent"* (with a prompt).
- **Instruct-action helper:** *"DART records this instruction; your AI tool carries it out."* (the intent/action line, verbatim where space allows)
- **Loop guard hint:** *"If this rule keeps looping, DART hands the ticket back to you instead of looping forever."*
- **Save confirmation:** *"Rule saved. It runs from now on, the same way every time."*
- **Honest non-claim (tooltip):** *"Rules decide what happens next. Your AI tool does the work — DART doesn't run agents itself."*

### 5.2 Labels & routing

- **Labels manager title:** *"Routing labels — your steering wheel."*
- **Label row:** *`TO_DEV_BE` — "send a rejection back to backend dev" · settable by /rev, /qa · routes to: implement (/be).*
- **On a ticket (chip tooltip):** *"`TO_DEV_BE` set by /rev — this is why the ticket routed to /be."*
- **Unauthorized-set refusal (matches Anna AC-W6):** *"`/be` can't set `TO_DEV_BE` — only /rev and /qa own this label."*
- **New-label helper:** *"You define the label and who may set it. DART enforces that contract."*
- **Routed-by line (timeline):** *"Routed to /be — rule `route-rejection-to-backend`, triggered by /rev."*

### 5.3 Plugin connect

- **Connect title:** *"Connect DART to your AI tool."*
- **Lead:** *"DART installs as a plugin. Your own commands, skills, and hooks stay exactly as they are — DART adds a namespaced team you can switch on per project."*
- **Enable toggle (per project):** *"Enable DART for this project"* · helper: *"Off everywhere else. Disable anytime to return to your usual setup."*
- **Namespace reassurance:** *"DART's commands live under `/dart:*` — they won't collide with your `/arch`, `/deploy`, or anything you've set up."*
- **Precedence reassurance:** *"Your settings always win. DART sits underneath as an opt-in layer; it never overrides your config."*
- **No-mutation reassurance:** *"DART never edits your files — it ships its own components and removes them cleanly when disabled."*
- **Host status labels:** *"connected to Claude Code"* (green) · *"host not detected — open this project in your AI tool"* (muted) · *"directives waiting for your tool"* (warning, only when pending > 0).
- **Pending-directive line:** *"2 instructions are waiting for your AI tool to act on."*
- **Honesty footer:** *"DART decides what happens next; your AI tool makes it happen."*

### 5.4 Knowledge scope controls

- **Panel title:** *"Knowledge"* (replaces "Base").
- **Scope tabs:** *"Common (shared across your projects)"* · *"This project"*.
- **Scope counts line:** *"Common: 8 · This project: 14"* (omit a side that's empty).
- **Add-item scope chooser:** *"Where does this belong?"* → *"This project only"* (default) · *"Common — shared across my projects"*.
- **Type/reach tags helper:** *"Tag it so the right projects inherit it — e.g. `java` reaches every Java project; `any` reaches all."*
- **Cross-type explainer (tooltip):** *"A `java`-tagged common item is shared with your Java projects and hidden from the rest."*
- **`/kai` proposal banner:** *"DART noticed a recurring pattern. Review it?"* → actions: *"Make common"* · *"Keep in this project"* · *"Reject"*.
- **`/kai` honesty line:** *"DART proposes — nothing becomes common knowledge without your approval."*
- **Promotion (project → common):** *"Promote to common"* · helper: *"Confirm which projects it applies to (e.g. `java`, `frontend`). This project keeps it too."*
- **Provenance line:** *"Proposed by /kai · approved by you · {when}."*
- **Override notice (only on real conflict):** *"This project's rule overrides a shared one — agents follow the project rule here."*
- **Local-first reassurance:** *"Knowledge stays in your repo. DART doesn't upload it; 'shared' means shared across your own projects."*

---

## 6. The three one-liners (battlecard top-lines)

- **`when → do` engine:** *"Write the rules your AI team follows — and DART runs them the same way every time. Your routing, your loops, your parallel stages — as plain rules, not Python, not nagging."*
- **Plugin:** *"DART augments your AI tool — it never fights it. Namespaced, opt-in per project, lowest-precedence: your setup stays sovereign, and disabling DART puts you exactly back."*
- **Knowledge scoping:** *"Two layers of memory — your team's and this project's — with `/kai` proposing patterns for *your* approval. Local-first; nothing goes common without your say-so."*

**The unifying claim across all three:** *DART hands you the controls — the rules, the plugin switch, the approve button — and enforces what you decide. It records intent; your tool acts.* That single sentence keeps the whole release honest and on the moat (user-controlled, visible, enforced process on top of the tool you already use).

---

## 7. Hand-offs

- **→ `/po` (Max):** ratify the three one-liners (§6) and the in-UI scope-tab framing ("Common (shared across your projects)" vs "This project"); decide whether "Knowledge" is the locked public name replacing "Base" everywhere.
- **→ `/ui` (Aura):** lay out the rule-builder microcopy (§5.1) and the labels-in-play / routed-by signals (§4.1); place scope counts + `/kai` pending in the Knowledge panel (§4.3); namespace/precedence reassurance at plugin connect (§5.3); keep absent-not-zero for every count.
- **→ `/fe` (Finn):** wire active-rules count, ledger labels, `fired:[]` traces, parallel owner chips, plugin-enabled/host-status/pending-directives, and scope counts / pending-`/kai` to data the engine already produces; render every signal absent-not-zero.
- **→ `/secops` (Soren) + `/arch` (Jorge):** approve the exact wording of *"DART never edits your files,"* *"your settings always win,"* the local-first Knowledge claims, and the intent/action line *"DART records intent; your tool acts"* — these are technical/security claims and must match the plugin precedence and file-contract behaviour (Jorge §3.1).
- **→ `/legal` (Alex):** review *"shared across your projects"* (must not imply a cloud/community share) and the *"never auto-promotes"* claim for `/kai`.

---

*Content & positioning only. Invents no metrics. Every claim is backed by Jorge's architecture or Anna's research, or it is cut. The load-bearing honesty across all three features: DART records intent; the host tool executes — and the differentiation leads with user-controlled, visible, enforced process, never with the number of agents.*
