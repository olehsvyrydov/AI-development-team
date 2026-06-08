# Cockpit Promotion Spec — What the Projects Home Should Say (Apex)

**Author:** Apex (`/mkt`) — Senior PMM / CSO
**Date:** 2026-06-07
**Status:** Draft → for `/po` (value/priority) + `/ui` (Aura, layout/visuals) + `/fe` (Finn, implementation)
**Scope:** Content & in-product positioning for the **Projects Home** view (first-run empty state + populated state). **No code.** Behaviour-only where it touches data.
**Companion docs:** [strategy.md](strategy.md) (positioning/category, mine) · [ui-design-cockpit-v2.md](ui-design-cockpit-v2.md) (Aura's card/shell/picker redesign) · [VISION.md](VISION.md) (MVP scope, §5/§8).

> **The problem this solves.** The current Projects Home is a near-empty dark page: a title ("Your projects"), one project card, and a "Connect a project" affordance, with a thin empty state ("No projects yet"). It shows *plumbing*, not *value*. A first-time visitor cannot tell — in the 5 seconds that decide retention — what this tool is, why it is different, or that it is safe to point at their code. This spec defines the **words, signals, and trust cues** that make the tool sell itself the moment it opens, without overclaiming and without inventing metrics.

---

## 0. Hard constraints I am writing inside (so this is shippable, not a wish-list)

- **Facts only — no invented numbers.** I do not put fabricated counts, "10x", "trusted by N teams", star counts, or made-up benchmarks anywhere. Every dynamic number on screen must come from data Core already returns (`taskSummary`, `workflowView`, `base`, ledger gates, `profile`) or be omitted. Static value claims must be literally true of the MVP (§5 of VISION).
- **Substantiation rule (from my own anti-patterns).** Every claim is backed by an actual behaviour of the `workflow-engine` (`refusal: hard`, `safety_override`), the local-first architecture (loopback-by-default, host-CLI key reuse — VISION L2/L8), or the OSS licence. Security/technical claims route to `/secops` + `/arch` before they ship as copy (per my SKILL handoff rules).
- **Honour the canon.** Inline-SVG only, no icon library; status = colour + glyph + text; dark-first; `--kb-*` tokens; WCAG 2.2 AA. I describe *what to show*; Aura owns *how it looks*, Finn owns *how it's built*.
- **Don't market the agents — market the discipline.** The crowded, losing lane is "look, lots of agents." Our defensible message is **enforced, visible, local-first process across many projects** (strategy §1). The home view must lead with that.
- **Proportional, not preachy.** Empty state sells; populated state informs and gets out of the way. No marketing chrome bolted onto a working board.

---

## 1. Positioning & one-liner (the anchor of the home view)

### 1.1 The single sentence to anchor the page

> **A full AI dev team — and a process it can't skip — for the code already on your machine.**

This is the line that should sit directly under the product name on first run (and as a quiet sub-header thereafter). It carries the three load-bearing ideas in one breath: *team* (not one assistant), *a process it can't skip* (enforced gates — the moat), *already on your machine* (local-first, point-at-a-folder, no migration).

### 1.2 Alternates (A/B candidates; same three ideas, different emphasis)

- **(enforcement-led)** *"Your AI coding tool, with a team around it and gates it can't skip."*
- **(local-led)** *"A disciplined AI dev team that runs on your machine, on the tool you already use."*
- **(continuity-led)** *"Specialist agents, an enforced workflow, and a memory that survives every session — across all your projects."*

> Pick **1.1** as default. It is benefit-first, names the differentiator (can't-skip process), and is true of the MVP. Keep one alternate live for A/B once there's traffic. None of these mention a model name, a vendor, or a number — deliberately.

### 1.3 The core value props worth surfacing *in-UI* (priority order)

Ranked by differentiation strength (from strategy §1/§4) and by how cheaply they can be shown honestly:

| # | Value prop | One-line in-UI phrasing | Why it earns screen space |
|---|---|---|---|
| 1 | **Enforced gates / never-skip-security** | *"Gates that can refuse — security and review aren't optional."* | The moat. No adjacent tool shows *enforced* process in one screen. Backed by real `refusal: hard` / `safety_override`. |
| 2 | **Your code never leaves your machine** | *"Local-first. Your code stays on your machine — no account required."* | The #1 objection to pointing a tool at a private repo. Backed by loopback-by-default (L8) + host-CLI key reuse (L2). The thing that makes people click "Add a project". |
| 3 | **A whole team, not one assistant** | *"Product, architecture, security, dev, review, QA — a specialist for each stage."* | Reframes the category away from "another chatbot". |
| 4 | **Persistent memory across sessions** | *"Remembers your project's rules and context — so you stop re-explaining it."* | The "stop babysitting" pain (JTBD, strategy §3). Tie to BASE. |
| 5 | **Proportional process** | *"Right-sized: a typo isn't dragged through architecture."* | Pre-empts the "heavyweight/bureaucratic" fear that kills governance tools. |
| 6 | **On top of your existing tool, no new bill** | *"Runs on the Claude Code / Cursor you already use. Open-source, no new keys."* | Removes cost + lock-in objection. |

**Surfacing rule:** on **first run**, show props **1, 2, 3** prominently (the "what + why-safe + what-is-it"), with **4–6** as a secondary trust strip. In the **populated** state, retire the pitch to a one-line sub-header and let the *real* signals (§3) carry the value.

---

## 2. First-run / empty state (zero projects) — sell, don't blank

Today's empty state is one glyph + "No projects yet" + a connect panel. That is a *dead end* dressed as an onboarding. Replace it with a compact, honest pitch that answers **"what is this, why is it safe, what do I do"** above the fold. Keep it to **one screen, no scrolling required** to reach the CTA.

### 2.1 Structure (top → bottom)

1. **Hero line** — product name + the §1.1 anchor sentence.
2. **One-line "what it is"** — the plain-language explanation.
3. **3-step "how it works"** — Connect → Analyse → Work, each one line.
4. **Primary CTA** — the folder-picker entry (Aura's "Choose folder…", v2 §2).
5. **Trust strip** — 3–4 honest chips (local-first / OSS / no keys / works with your tool).
6. **Quiet secondary** — "See how it works" → links to a read-only demo project or the docs (no signup, no wall).

### 2.2 Draft microcopy (use verbatim or as a starting point)

**Hero**
> **DART**
> *A full AI dev team — and a process it can't skip — for the code already on your machine.*

**What it is (one line, muted)**
> *Point DART at a project folder. It reads the code, stands up a team of specialist agents, and runs them through a workflow with gates that can refuse to proceed — all on your machine, on the AI coding tool you already use.*

**How it works (3 steps — icon + label + one line each)**

| Step | Label | Line |
|---|---|---|
| 1 · `glyph-folder` | **Connect a folder** | *Choose any project on this machine. Nothing is uploaded.* |
| 2 · `glyph-index`  | **DART reads it** | *It analyses the code and docs, and remembers the rules your agents must follow.* |
| 3 · `glyph-workflow` | **The team gets to work** | *Specialist agents move tasks through an enforced workflow — you watch the process, not babysit it.* |

**Primary CTA**
> **[ ＋ Choose a folder… ]**
> *Takes about a minute. No account, no API key to paste.*

**Secondary (no-commitment path)**
> *New here? **See a sample project →** (read-only, nothing connected)*

> If a sample/read-only demo project isn't built for this slice, the secondary link points to the docs/README instead — never to a signup. Label it honestly ("Read the docs →") rather than implying an in-app tour that doesn't exist.

### 2.3 Trust strip (first-run) — four chips, glyph + text

> `🔒 Local-first` · `◌ No account needed` · `⌥ Open-source (MIT)` · `⌘ Works with Claude Code / Cursor`

(Glyph names are Aura's call; the point is each chip is a *literal, checkable fact*, not a slogan.)

### 2.4 What the empty state must NOT do

- No "Get started for free" / "Start your free trial" — there is no paid tier to contrast against; it reads as SaaS bait.
- No fake social proof ("Join 10,000 developers"), no logos we don't have.
- No motion-heavy hero. Respect `prefers-reduced-motion`; the page must be legible static.
- No second "what is this" paragraph below the fold that the CTA scrolls past — the CTA stays visible.

---

## 3. At-a-glance signals worth displaying (make the value *visible*)

This is where the tool proves — continuously — that it's doing something governed and that work is moving. Two scopes: **global** (a header strip above the grid) and **per-project** (on each card, extending Aura's v2 card §1).

**Governing principle:** every signal must (a) come from real data, (b) communicate *governance or momentum* (not vanity), and (c) degrade to *absent* (not a fake zero) when unknown. Per Aura's rule: never show "0" for missing data.

### 3.1 Global signals — a thin "control-plane" strip above the grid (populated state only)

Earns its place because it makes the multi-project, governed nature visible the instant you open the app. **Show at most 3–4; omit any whose data is unavailable.**

| Signal | Source | In-UI phrasing | Worth it? |
|---|---|---|---|
| **Projects under governance** | registry count | *"3 projects"* | **Yes** — quiet, factual, frames multi-project. |
| **Tasks needing you (across all projects)** | sum of `taskSummary.byStatus.needsYou` | *"2 need you"* (warning hue, only when > 0) | **Yes (high)** — the single most actionable, momentum-creating signal. The reason to open the app each day. |
| **Active right now** | live/SSE: any project with an agent running | *"● 1 agent working"* (accent, live dot) | **Yes** — proves the team is *acting*, not idle. Only when true. |
| **Last activity** | most-recent ledger entry across projects | *"updated 4h ago"* | Optional — keep if it doesn't crowd the strip. |

Do **not** put gate-pass tallies or doc counts in the *global* strip — too abstract at the roster level; they belong per-project.

### 3.2 Per-project card signals (extends Aura v2 §1) — priority for the limited card real estate

Aura's v2 card already adds a glyph tile, short description, and a task pulse (`☑ 12 · 2 need you`). I'm prioritising **which** signals deserve the remaining space and **why**, ordered by value:

| Rank | Signal | In-UI phrasing | Data | Why it earns the space |
|---|---|---|---|---|
| 1 | **Needs-you pulse** | *"⧗ 2 need you"* (only when > 0) | `taskSummary.needsYou` | The momentum/actionability hook. Already in Aura's design — keep it the loudest non-status element. |
| 2 | **Live activity** | *"● agent working"* / *"idle"* | SSE live state | Proves the team acts on its own. Reuse the Hub live dot. |
| 3 | **Governance badge** | *"⛨ security-reviewed"* / *"⛨ 3 gates passing"* | ledger gate labels (`SECOPS_APPROVED`, `CODE_REVIEWED`, …) | **This is our differentiator made visible per project.** A passed *hard* security gate is the single most credibility-building badge we can show — and it's a real ledger fact. See §3.3. |
| 4 | **Task progress mix** | the stacked mini-bar (Aura §3.4) shrunk to a 1-line sparkline | `taskSummary.byStatus` | Cheap "how much done vs blocked" glance; supports a sense of progress. |
| 5 | **Memory/knowledge indexed** | *"▤ 8 in base"* | `base.counts.indexed` | Signals "it remembers this project." Lower priority on the *card* (better on the shell, where Aura already has it). |
| 6 | **Connection / freshness** | `● connected · updated 2h ago` | record/state | Keep (already present) but demote visually — it's reassurance, not value. |

**Cut from the card:** stack chips when empty (already Aura's rule), raw total ticket count as a hero number (a big "147" is vanity — the *needs-you* and *progress mix* say more), and any per-agent breakdown (too granular for a roster card).

### 3.3 The governance badge — the most important new signal (spec)

This is the one signal that no competitor can show at a glance, so it deserves a precise, honest definition.

- **What it shows:** that this project has **passed an enforced gate** — most valuably the **hard security gate**. Phrase options, in honesty order:
  - When `SECOPS_APPROVED` is set on the relevant work: **`⛨ Security-reviewed`** (solid shield = hard gate).
  - When multiple gates are green: **`⛨ 3/3 gates passing`** (only count *defined* gates for this project's track; never invent gates that don't apply).
  - When a hard gate is currently **refusing/blocking** progress: **`⛨ blocked at security`** (danger hue) — this is *also* a positive signal: it visibly proves the gate has teeth. Showing a refusal is on-brand, not a failure to hide.
- **What it must NOT do:** never display "Security-reviewed" as a static decoration. It is a *derived ledger fact* or it is absent. No project gets the badge by default. Route the exact label wording to `/secops` so we don't imply a stronger assurance than a gate pass actually gives (a passed gate ≠ "this code is secure"; it means "the security stage ran and approved this change").
- **Tooltip (honest framing):** *"This project's security gate ran and approved its latest gated change. Gates here can refuse to proceed — they're not advisory."*

### 3.4 Streaks / activity — handle with care

A "7-day streak" style flourish is tempting for momentum but risks vanity. **Recommendation:** *do not* ship streak counters in this slice. If momentum needs reinforcing later, prefer a factual **"active this week"** dot row driven by real ledger timestamps over a gamified streak number. Momentum should come from *real work moving* (needs-you, live agent, progress mix), not from a manufactured score.

---

## 4. Trust & differentiation cues (phrased without overclaiming)

These are the cues that convert a curious visitor into someone willing to point the tool at their private code. Each is paired with the **fact that substantiates it** and a **phrasing that doesn't overreach**.

| Cue | Honest phrasing (use) | Backed by (fact) | Overclaim to avoid |
|---|---|---|---|
| **Local-first** | *"Runs on your machine. Bound to localhost by default."* | Loopback-by-default; all core functions work offline (VISION L8). | ✗ "Military-grade", ✗ "100% private" (absolute). |
| **No code egress** | *"Your code and history stay in your repo. Nothing is uploaded by DART."* | Project repos are source of truth; Core doesn't send code anywhere (architecture). **Caveat honestly:** the *host AI tool* (Claude Code/Cursor) still sends prompts to its own model under your existing plan. | ✗ "Your code never touches the cloud" — false, the host tool does. Say *"DART doesn't upload your code; your AI tool works exactly as it does today."* |
| **No new keys / no account** | *"No account, no API key to paste — it reuses the tool you've already signed into."* | Host-CLI runner reuses host login (L2). | ✗ "Free forever" promises about third-party model costs we don't control. |
| **Open-source** | *"Open-source (MIT). Read the code, fork it, run it offline."* | The OSS-first contract (VISION). | ✗ implying the whole stack incl. optional paid backends is free. |
| **Audit trail** | *"Every step is recorded — who did what, when — in your repo's history."* | Attributed, timestamped ledger entries (L7); nothing silently lost. | ✗ "Compliance-certified" / "SOC2" — we are not. Say *"audit-ready history"*, not "compliant". |
| **Enforced process** | *"Gates can refuse to proceed. Security is never silently skipped."* | `refusal: hard`, `safety_override` in `workflow-engine`. | ✗ "Guarantees secure code". A gate enforces *that the stage ran*, not perfection. |

> **The one caveat I insist on (legal + honesty):** the no-egress claim must be scoped to *DART*, not the host model. The accurate, still-compelling line is: **"DART keeps your code local — it never uploads it. Your AI coding tool keeps working exactly as it does today, on the plan you already have."** This is both true and reassuring; an absolute "nothing ever leaves" claim is false and would be a `/legal` + `/secops` red flag.

---

## 5. Microcopy library (concrete strings, honest, no hype)

Grouped by surface. These are drafts for Aura/Finn to drop in; adjust to token/space constraints.

### 5.1 Empty state
- Hero sub: *"A full AI dev team — and a process it can't skip — for the code already on your machine."*
- Lead: *"Point DART at a project folder. It reads the code, stands up specialist agents, and runs them through a workflow with gates that can refuse to proceed — on your machine, on the tool you already use."*
- Zero-state title (if a minimal one is still wanted above the steps): *"Add your first project"* (action-framed, replaces the dead-end *"No projects yet"*).

### 5.2 Connect CTA
- Button: *"＋ Choose a folder…"*
- Helper under button: *"No account, no API key to paste. Takes about a minute."*
- Cell title (the add-project card in the grid): *"Add a project"*
- Cell body: *"Pick a folder on this machine — DART analyses it right here."*

### 5.3 Folder-picker reassurance (the moment of maximum hesitation)
- Dialog subtitle: *"DART reads this folder on your machine to understand the project. Nothing is uploaded."*
- On selecting a folder with existing ADT artefacts: *"This folder already has DART files — we'll pick those up instead of starting over."* (matches Aura v2 §2.2 adopt hint).
- Footer reassurance line (persistent): *"Read-only analysis. DART never writes outside this folder."* (route exact wording to `/secops` — must match `/api/fs/*` containment behaviour.)

### 5.4 Status labels (colour + glyph + text, per canon)
- `connected` → **"connected"** · green dot
- `analyzing` → **"analysing…"** · warning dot
- `error` / unreachable → **"can't reach this project"** · danger dot
- live agent → **"agent working"** · accent live dot
- idle → (no badge, or muted **"idle"**)
- needs-you → **"{n} need you"** · warning, only when `> 0`
- security gate passed → **"security-reviewed"** · shield glyph (solid)
- gate blocking → **"blocked at {stage}"** · danger shield

### 5.5 Tooltips
- Needs-you: *"Tasks waiting on a person — a gate to approve or a decision to make."*
- Security-reviewed: *"This project's security gate ran and approved its latest gated change. Gates here can refuse to proceed."*
- Local-first chip: *"DART runs on your machine and binds to localhost by default."*
- No-keys chip: *"DART drives the AI tool you've already signed into — no extra key to paste."*
- Live dot: *"An agent is running on this project right now."*

### 5.6 Honesty guardrails for all copy
- Prefer verbs of fact ("reads", "records", "runs", "refuses") over adjectives of hype ("powerful", "seamless", "revolutionary").
- Never state a number the data can't back. If `taskSummary` is unknown, the pulse is **absent**, not "0 need you".
- Scope every privacy claim to DART, never to the third-party model.

---

## 6. What NOT to show (avoid clutter & vanity)

- **No vanity counters as heroes:** total tickets ever, total lines analysed, total agent messages, "uptime". They feel like dashboards-for-dashboards and crowd the real signals.
- **No streak/gamification score** in this slice (§3.4).
- **No fabricated social proof:** star counts, "N developers", testimonial carousels we don't have content for.
- **No model/vendor logos or "Powered by" badges** on the home view — it muddies the tool-agnostic positioning and invites the "is my code going to them?" fear we're trying to defuse.
- **No empty grids of zeros.** Any panel/strip with no data is *absent*, replaced by an invitation, never a row of "0 / 0 / 0" (Aura's anti-pattern).
- **No marketing modal / "rate us" / changelog popovers** interrupting the launcher.
- **No absolute privacy/security superlatives** ("100% secure", "your code never leaves" unqualified) — §4 caveat.
- **No per-agent micro-telemetry on the roster** (token counts, per-agent latency) — too granular for the home; belongs in a project's cost/budget view (VISION H1) if anywhere.
- **No motion that conveys meaning** unless it has a static fallback (reduced-motion).

---

## 7. Priority recommendation for the build (so this is right-sized)

If only a subset ships this slice, do them in this order — each is honest, data-backed, and buildable on data Core already returns:

1. **Rewrite the empty state** (§2) — pure copy + layout; zero new backend; biggest first-impression lift.
2. **Add the §1 anchor line + trust strip** to both states — copy only.
3. **Needs-you pulse on the card + global "N need you" strip** (§3.1/§3.2) — uses `taskSummary` (already specced in Aura v2 §6.1).
4. **Live "agent working" dot** (§3.2) — reuses the Hub SSE/live dot.
5. **Governance / security-reviewed badge** (§3.3) — derives from ledger gate labels; route wording to `/secops`. Highest differentiation payoff.
6. **Folder-picker reassurance copy** (§5.3) — copy on top of Aura's existing dialog.

Items 1–4 are essentially free (copy + data that exists). Item 5 is the one with real differentiation leverage and the one I'd fight hardest to include.

---

## 8. Hand-offs

- **→ `/po` (Max):** ratify the anchor one-liner (§1.1) and the empty-state pitch as the product's in-app message; decide whether a read-only **sample project** ships for the no-commitment secondary CTA (§2.2) or it links to docs.
- **→ `/ui` (Aura):** lay out the empty-state hero + 3-step + trust strip; place the §3 signals on card/strip within the v2 card spec; pick glyphs for the new chips (security shield reuse from v2 §4 `glyph-gate`).
- **→ `/fe` (Finn):** wire the global needs-you/live strip and the governance badge to existing `taskSummary`/ledger/SSE data; absent-not-zero rendering for every signal.
- **→ `/secops` (Soren) + `/arch` (Jorge):** **approve the exact wording** of the local-first / no-egress / security-reviewed claims (§3.3, §4, §5.3) before they ship — these are technical claims and must match real behaviour (my SKILL requires `/secops`+`/arch` sign-off on security claims).
- **→ `/legal` (Alex):** review the privacy/no-egress phrasing for overclaim (§4 caveat) and the "open-source (MIT)" + "no account" claims.

---

*This spec is content & positioning only. It invents no metrics, makes no claim the MVP can't substantiate, and scopes every privacy statement to DART rather than the third-party model. Differentiation leads with enforced, visible, local-first process — not with the number of agents.*
