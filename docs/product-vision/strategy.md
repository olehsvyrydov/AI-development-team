# Product Strategy & Positioning — Agent-Team Orchestration & Governance Layer

> Prepared by **Apex** (`/mkt`) — Senior PMM / CSO.
> Status: strategy draft for a new product vision. **No code.**
> Grounding assumption (load-bearing): the product is **OSS-first, zero-paid by default**, and **rides on top of the user's existing AI coding tool** (Claude Code / Cursor / Kiro), reusing its API keys. Paid/cloud backends are optional overlays, never required.

---

## 0. The product in one breath

A cross-platform desktop/app tool that connects to **multiple projects** (local or remote), analyzes each, and gives every project three governed surfaces:

1. **Visual Workflow Builder** — a visual program: trigger agents on events, loops, background and conditional agents.
2. **Agent-managed Tasks board** — full history, agents move and annotate work.
3. **Base of rules/policies/context** — indexed and semantically recalled; agents *must* follow it.

It is the **orchestration + governance layer that sits on top of** the coding tool you already use — not a new model, not a new IDE, not another agent SDK.

---

## 1. Positioning

### One-sentence positioning statement

> **For developers and small teams who already code with an AI assistant, [Product] is the agent-team orchestration and governance layer that turns your existing AI coding tool into a disciplined, multi-project software team — with a visual workflow you can see, a tasks board agents actually manage, and a rules base they're forced to obey — without locking you into a new IDE, model, or cloud.**

### The category

We are **not** entering "AI IDE" or "agent framework." We are naming and owning a new adjacent category:

> **Agentic Dev Governance** *(a.k.a. the "agent-team control plane" or "AI dev orchestration layer")*

The framing matters. "IDE" and "framework" categories are crowded and capital-heavy (AWS, Microsoft, Anthropic, OpenAI). "Governance / control plane *on top of* what you already pay for" is a **wedge** category where incumbents are structurally conflicted — they want you *inside* their IDE, not orchestrating across tools.

### Core differentiator vs. everything adjacent

Three things, in priority order:

1. **It's a layer, not a destination.** It governs the coding tool you already use and already pay for. No new model bill, no IDE migration, no SDK rewrite. (Kiro asks you to switch IDE and lean on AWS; LangGraph asks you to write Python; we ask you to *point at a folder*.)
2. **Process is a first-class visual object, and it's enforced.** Most tools have *implicit* orchestration buried in prompts/specs/code. Ours is a **visible program** (the workflow builder) backed by **gates that can refuse to proceed** — the existing `workflow-engine` already does this (`refusal: hard`, `safety_override`). That's a governance product, not a prompt pack.
3. **Multi-project, persistent, governed.** A roster of role specialists + a rules/policy base (indexed + semantically recalled) + a tasks board with history, across *many* projects. Competitors are single-repo, single-session, or single-tool.

**The defensible moat is governance + portability, not the agents themselves.** Anyone can ship agents. Few will ship *enforced, visible, tool-agnostic process* that an engineering lead can trust.

---

## 2. Competitive landscape (honest scan)

The honest read: **no single competitor occupies our exact box**, but pieces of our value are claimed by tools in five adjacent lanes. Our risk is not one giant — it's being *dismembered* ("Kiro does the workflow, CrewAI does the agents, Linear does the tasks, so why you?"). The answer is the **seam**: nobody binds orchestration + governance + tasks + rules across *multiple projects on top of an existing tool*.

### Where we win / lose, by lane

| Tool | What it does | Gap this product fills |
|---|---|---|
| **Claude Code** | Best-in-class terminal coding agent; single-session, single-repo; you drive it turn by turn. | No persistent multi-project team, no visual workflow, no enforced gates, no managed tasks board. We **wrap and govern** it (and reuse its keys). |
| **Cursor** | AI-native IDE; great inline + agent modes; some background agents. | IDE-bound, single-project focus, no enforced multi-role gated process, no cross-project control plane. We add the *team + governance* layer it lacks. |
| **Kiro (AWS)** | Spec-driven agentic IDE: requirements → design → tasks → code; **agent hooks** on file/PR events; **steering files** for standards; multi-agent topologies. *Closest conceptual competitor.* | It's an **IDE you must adopt**, tilted toward **AWS** (Bedrock/CodeCatalyst/IAM). We are **tool-agnostic, multi-project, OSS-first**, and govern the tool you *already* use. Win on portability + no-lock-in; lose on "all-in-one polish" for AWS-native teams. |
| **GitHub Copilot Workspace** | Issue → plan → implementation inside GitHub's walled flow. | GitHub-and-single-repo bound; no agent roster, no visual workflow program, no cross-tool governance. We win on tool-neutrality and team modeling; lose on GitHub-native convenience. |
| **Devin / SWE-agents** | Autonomous "do the whole ticket" agents. | Black-box autonomy; **low governance/visibility**, hard to constrain, per-seat/cloud cost. We win on **transparency + enforced gates + cost** (rides your existing keys); lose on hands-off "just ship it" appeal. |
| **n8n / Windmill / Node-RED** | General visual workflow/automation builders. | Generic automation, **not dev-team-aware** — no role agents, no code-review gate, no rules base, no repo analysis. We win by being **purpose-built for software delivery**; we should *borrow their UX literacy* for the builder, not their generality. |
| **Linear / Jira / Backlog.md** | Issue tracking & project management. | Human-first boards; agents are bolted on, not native operators. Our board is **agent-managed with history**, wired to the workflow. We win on agent-native + integration; we **interoperate** (Backlog.md is already our file-based default; Jira an optional overlay) rather than compete head-on. |
| **LangGraph / CrewAI / AutoGen (AG2)** | Agent-orchestration **frameworks/SDKs** — you write the graph/crew in code. | **Code-first, no governance UI, no tasks/rules surfaces, no "point at a folder."** They are *infrastructure*; we are a *product*. We win on time-to-value and non-coder accessibility; we could even **sit on top of** one of them internally. Lose to them when a team wants raw programmability. |
| **RAG / Knowledge tools (LlamaIndex, vector DBs, "context" plugins)** | Index docs/code for retrieval. | Retrieval without **enforcement** — knowing a rule ≠ obeying it. Our rules base is **bound to gates**: policies aren't just recalled, they're *required*. We win on "context that has teeth." |

### The one-line competitive narrative (battlecard top-line)

> *Kiro makes you switch IDEs and lean on AWS. The frameworks make you write Python. Devin asks for blind trust. We sit on top of the tool you already use, make the process visible and enforceable, and do it across all your projects — open-source, no new bill.*

---

## 3. Target users & jobs-to-be-done

| Segment | Who | The pain we remove | JTBD |
|---|---|---|---|
| **Solo / indie devs & "vibe-coders+"** *(primary wedge)* | One developer running Claude Code/Cursor across several side or client projects. | Agents drift, forget context, skip tests, repeat mistakes; no memory across projects; "I'm the only process." | *"Give me a disciplined team and a repeatable process so my AI doesn't go off the rails — without me babysitting every turn."* |
| **Small / scaling teams (2–15 devs)** *(primary growth)* | Startup or product team standardizing how AI is used. | Every dev prompts differently; quality/security gates depend on memory; no shared rules; review/QA inconsistent. | *"Make our AI dev process consistent, reviewable, and enforced — the same gates fire for everyone."* |
| **Agencies / dev shops** *(high-LTV)* | Teams shipping many client repos in parallel. | Context-switching across projects; per-client rules/policies; need an audit trail to show clients. | *"Run many client projects from one control plane, each with its own rules and a defensible history."* |
| **Regulated / quality-sensitive teams** *(beachhead-into-enterprise)* | Fintech, health, public sector, anyone with compliance. | "Did the AI follow our security/PII rules?" is unanswerable; black-box agents are a non-starter. | *"Prove the process — enforced gates (security never skipped), a rules base agents must obey, and a full audit history."* The `regulated` preset is literally this product surface. |

**Buyer vs. user:** For solo/small-team the **user is the buyer** (bottoms-up, PLG). For agency/regulated the buyer is a **lead/founder/CTO** who cares about consistency, auditability, and risk — sell *governance and proof*, not *agents*.

---

## 4. Value props & messaging (top 2 segments)

### Segment A — Solo / indie devs (the wedge)

- **Headline:** *"Your AI doesn't need a smarter model. It needs a team and a process."*
- **Sub:** *Point it at a folder. Get a roster of specialist agents, a workflow you can see, and rules they can't ignore — on top of the Claude Code or Cursor you already use.*
- **Three proof bullets (benefit-led, "So What?"):**
  - *See the program, not the prompt* — a visual workflow with event triggers, loops, and background agents, so you always know what your agents will do next.
  - *Stop re-explaining your project* — a rules/context base that's semantically recalled and **enforced**, so quality and security gates fire every time, not when you remember.
  - *No new bill, no new IDE* — open-source, runs on your existing tool's API keys.
- **The enemy:** the lone mega-prompt that "hopes it remembers." (This is already the README's framing — lean into it.)

### Segment B — Small / scaling teams (the growth engine)

- **Headline:** *"One process for your whole team — enforced, not hoped-for."*
- **Sub:** *Standardize how everyone's AI ships software: shared rules, gated reviews, an agent-managed board with full history — across every project, in the tool each dev already prefers.*
- **Three proof bullets:**
  - *Gates that can refuse* — security and review gates that block bad work from advancing (security gates never downsized), right-sized to the change so a typo isn't dragged through architecture.
  - *Shared brain, per-project rules* — one rules/policy base per project, recalled on demand, obeyed by every agent — onboarding and consistency, solved.
  - *Audit-ready by default* — a tasks board with full history and a workflow you can show a reviewer, an auditor, or a client.
- **The enemy:** "every dev prompts differently and quality is a coin flip."

> Messaging guardrail (per persona anti-patterns): benefit-led, "So What?" framing; no feature-dumps; substantiate every claim with the actual `workflow-engine` behavior and the Hub demo. Avoid the trap of marketing the **agents** — market the **discipline**.

---

## 5. MVP recommendation (market lens) — opinionated

**The single thing to prove:** *"On top of the AI coding tool you already use, this makes your agents' process visible and enforced — and it sticks across sessions and projects."*

That sentence dictates the cut. Most of the differentiation lives in **governance + visibility + portability**, *not* in having more agents. So:

### Build first (the differentiated core)

1. **Connect-a-folder → instant team + analyzed project.** The "30-second wow." Point at a repo, it analyzes and stands up the roster + a starter workflow. This is the activation moment; nail it.
2. **The enforced gated workflow, made *visible*.** The `workflow-engine` already enforces and refuses — the MVP's job is to **render it as the visual program** and let agents fire on events/loops/conditions. The *visibility of enforcement* is the demo that no competitor matches in one screen. The **Hub** (zero-dependency dashboard, already in the repo) is the seed — productize it.
3. **Rules/context base with teeth.** Indexed + semantically recalled **and bound to a gate** (rule known → rule enforced). Ship the "context that's actually obeyed" claim, even with a modest first ruleset.
4. **Agent-managed tasks board with history.** Use the existing **file-based (Backlog.md) default** so MVP needs zero paid accounts and the history is git-native and portable.
5. **One host integration, done excellently** — start with **Claude Code** (reuse its API keys; tightest fit, friendliest OSS audience). Cursor/Kiro next.

### Defer (real, but not what proves the wedge)

- **Multi-project at scale / remote projects** — ship *one local project* flawlessly first; "multiple projects" is the expansion story (and the agency upsell), not the activation proof.
- **Deep workflow-builder power** (rich branching/loop authoring UX): start with a small set of high-value templated workflows (solo / small-team / regulated presets already exist) and *edit*, not *author-from-blank-canvas*.
- **Jira/Confluence/Penpot/cloud-memory overlays** — keep as optional adapters; they're table-stakes for later segments, not MVP differentiators.
- **Many editor integrations at once** — breadth dilutes the first impression; go deep on one.

### Why this cut wins

It proves **the three things only we do** (visible + enforced process, rules with teeth, on-top-of-your-tool) on day one, with **zero paid dependencies**, using assets **the repo already has** (`workflow-engine`, the Hub, file-based tickets, the RAG/memory base). It deliberately refuses to compete on "most agents" or "best autonomy," which are losing fights against Devin/Cursor/Anthropic.

---

## 6. Naming options + positioning traps

### Naming

Current: **AI Dev Team / ADT**. Honest assessment: *descriptive, friendly, SEO-weak, and it undersells the differentiator* (it sounds like "a bunch of agents," which is the crowded lane). For the **product** (vs. the OSS framework), consider a name that signals **layer / control / governance**, not "more agents."

| Name | Signals | Notes |
|---|---|---|
| **Keep "AI Dev Team" for the OSS framework** | Community familiarity, existing stars/repo | Don't throw away earned recognition; let it be the *community* brand. |
| **Conductor** *(product)* | Orchestration, you hold the baton | Strong metaphor for "you direct a team of agents"; check trademark crowding (common word). |
| **Helm / Crew Deck / Bridge** | Control plane, "you're on the bridge" | "Helm" collides w/ Kubernetes Helm — avoid. "Bridge" is evocative but generic. |
| **Cadence** | Repeatable, enforced rhythm/process | Leans into *process discipline* — our actual moat. Some SaaS collisions; verify. |
| **Gatehouse / Guardrail-ish** | Governance, gates, enforcement | On-message but risks sounding restrictive/negative. |
| **Overlay / Layer-named** (e.g., **"DevLayer", "Atlas Layer"**) | "Sits on top of your tool" | Most accurate to positioning; least emotionally warm. |

**Recommendation:** dual-brand. Keep **AI Dev Team (ADT)** as the **open-source framework** (community equity, MIT, GitHub). Introduce a distinct **product name centered on orchestration/discipline** (lead candidates: **Conductor** or **Cadence**) for the app/control-plane. The framework feeds the product's funnel; the product name carries the category claim ("orchestration & governance," not "a team of bots"). Trademark + domain clearance required before commit — flag to `/legal`.

### Positioning traps (and the antidote)

| Trap | Why it bites | Antidote |
|---|---|---|
| **"Just another agent framework."** | LangGraph/CrewAI/AutoGen own that shelf; we'd lose on programmability and mindshare. | Never say "framework" in product copy. Lead with **governance + visibility + on-top-of-your-tool**. We're a *control plane*, not an SDK. |
| **Lock-in fear** | Devs are allergic after IDE/SDK/cloud lock-in (Kiro→AWS is the cautionary tale). | Hammer **OSS-first, file-based defaults, vendor-neutral, your keys, your repo, exportable history**. Make "no lock-in" a top-3 message, not fine print. |
| **OSS-first expectation / "why pay?"** | Audience expects open and free; a paywall too early kills the community motion. | **Open-core, generously.** Core framework + local single-project = free forever. Monetize *team/agency/regulated* surfaces (multi-project control plane, shared rules governance, hosted history, SSO/audit). Sell **scale & proof**, not the agents. |
| **"It's just a wrapper / prompt pack."** | Skeptics dismiss layers as thin. | Show the **enforced refusal** live (a gate blocking unsafe work) and the **visible workflow program** — wrappers can't do that. The Hub demo is the rebuttal. |
| **Marketing the agents, not the discipline** | Easy to demo 15 personas; but that's the commodity. | Persona anti-pattern discipline: benefit-led. The hero is **enforced process across projects**, agents are the cast. |
| **Breadth-first (4 editors, multi-project, all overlays at launch)** | Dilutes the first impression; "jack of all trades." | Go **deep on Claude Code + one local project** first (see MVP). |

---

## 7. GTM sketch + success metrics

### Motion: OSS-first community-led, open-core product on top

This is a **developer product with a free, open default** — so the motion is **community-led growth feeding product-led growth**, not sales-led. Sequence:

1. **Community / OSS (now → ongoing).** The repo, the README's "process, not prompts" narrative, the zero-dependency Hub demo (`node hub/server.js examples/demo`) are the lead magnets. Win developer trust: GitHub stars, MIT license, "your keys, your files, no lock-in." Content motion = *show the enforced gate refusing unsafe work* (a 30-second clip is the whole pitch). Distribute where the ICP lives: Hacker News, dev.to, r/ClaudeAI / r/cursor, Claude Code & Cursor communities, GEO-optimized comparison pages ("vs Kiro," "vs CrewAI," "AI agents that actually follow your rules").
2. **Activation (PLG).** "Connect a folder → see your team + workflow in 30 seconds." Instrument this ruthlessly; it's the whole funnel top.
3. **Product / monetization (open-core).** Free: framework + single local project. Paid: **multi-project control plane, shared/enforced rules governance, hosted task history, audit export, SSO** — i.e., the **team / agency / regulated** surfaces. Expansion path: solo dev → invites team → team needs governance/audit → agency/regulated tier.
4. **GEO + comparison SEO** as the durable acquisition channel (per persona: GEO alongside SEO) — own the answer to "how do I make my AI coding agents follow a process / our rules?"

### Three measurable success metrics (revenue/behavior, not vanity)

| # | Metric | Why it matters | Honest target (first ~6 mo post-MVP) |
|---|---|---|---|
| 1 | **Activation rate**: % of new installs that *connect a project AND run one gated workflow to completion* within 24h. | Proves the "30-second wow" + that enforcement is felt, not bypassed. This is the single leading indicator. | **≥ 40%** |
| 2 | **Week-4 project retention**: % of activated projects still running governed workflows at day 28. | Proves the layer *sticks* across sessions — our persistence/governance claim, not a one-off demo. | **≥ 25%** |
| 3 | **OSS→multi-project conversion**: % of retained users who add a **2nd project** (the expansion + monetization trigger). | The leading indicator of the team/agency revenue motion; "2nd project" is where willingness-to-pay appears. | **≥ 15%** |

*(Vanity metrics — stars, installs, agent count — are useful for the community top-of-funnel but must not be the scoreboard. GitHub stars are a community health signal, tracked separately, not a success metric.)*

---

## Appendix — strategic one-liners (for sales enablement / battlecards)

- **Category claim:** *"The agent-team orchestration & governance layer for the AI coding tool you already use."*
- **vs Kiro:** *"All the spec/hook discipline — without switching IDEs or marrying AWS."*
- **vs CrewAI/LangGraph:** *"Their power, without writing Python — and with a board, rules, and gates they don't have."*
- **vs Devin:** *"Autonomy you can actually govern, on your existing keys."*
- **The wedge sentence:** *"Your AI doesn't need a smarter model. It needs a team and a process."*

---

### Sources (competitive grounding)

- [Kiro — Bring engineering rigor to agentic development](https://kiro.dev/) · [Introducing Kiro](https://kiro.dev/blog/introducing-kiro/) · [Amazon Kiro 2026 Developer Guide](https://www.digitalapplied.com/blog/amazon-kiro-aws-agentic-ide-complete-guide) · [AWS Kiro — spec-first bet (SoftwareSeni)](https://www.softwareseni.com/aws-kiro-amazons-spec-first-bet-on-agentic-development/)
- [LangGraph vs CrewAI vs AutoGen 2026 (DEV)](https://dev.to/pockit_tools/langgraph-vs-crewai-vs-autogen-the-complete-multi-agent-ai-orchestration-guide-for-2026-2d63) · [Best Multi-Agent Frameworks 2026 (gurusup)](https://gurusup.com/blog/best-multi-agent-frameworks-2026) · [Open-source agent frameworks compared (OpenAgents)](https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared)
