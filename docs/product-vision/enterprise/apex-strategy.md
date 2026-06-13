# DART-as-Enterprise — Strategy, Positioning & Usability Verdict (Apex)

> Prepared by **Apex** (`/mkt`) — Senior PMM / CSO. **Strategy proposal only — no code.**
> Lens: commercial viability, positioning, and the dual-audience (human + agent) usability of the Pipeline view.
> Posture per the brief: **fully skeptical.** This document's job is to tell DART where it can credibly win, where it cannot, and where "enterprise" is a vanity word that will get the team killed. It is deliberately not marketing gloss.
> Co-investigation: this is the strategy/positioning lens in a five-agent study (with /arch, /secops, /ui, and a product/usability lens) into making DART an enterprise solution, starting with the Pipeline view.

---

## 0. TL;DR — the honest verdict in four lines

1. **Is there a paid market for "an enterprise control surface for AI dev agents"?** *Yes, but not the one the word "enterprise" implies, and the window is closing.* There is a real, paid wedge — **local-first, governed, multi-tool agent control for regulated/privacy-bound dev teams** — but it is **narrow, defensive, and already being squeezed** from above (hyperscaler agent control planes) and from the side (coding-tool vendors building governance inward). DART is **not** a Jira killer, not a Cursor competitor, and not a horizontal "agent control plane." Pretending otherwise is the fastest way to lose.
2. **DART's sharpest defensible wedge:** *the only place agents must follow your gated process, across the tools and projects you already use, without your code or prompts leaving the machine.* The moat is **enforced gated governance + local-first/BYO-tool portability + an attributable audit trail** — three things the incumbents are each structurally reluctant to ship together.
3. **The Pipeline view** is a strong "serious engineering tool" signal **only if it shows live, governed work moving through gates with agents acting on it** — i.e. a *governance flow*, not a CI/CD cosmetic. The single thing that moves it from gimmick to serious tool: **make it the live, interactive control surface where a human reads flow-health and an agent acts on the next gated step — not a static diagram of a process that is usually empty.**
4. **The "is this even a product?" risk is real and unresolved.** Today DART reads as a *sophisticated personal/solo operator tool* with an enterprise-shaped vision bolted on. The enterprise story is **credible as a wedge, not as a platform**, and only if the team ruthlessly resists the gravity toward "build n8n + Linear + Jenkins for agents."

---

## 1. Commercial viability — the honest verdict

### 1.1 The market is real — but it is three different markets, and DART is conflating them

The brief's framing ("an enterprise control surface for AI dev agents") collapses three markets that have very different buyers, budgets, and incumbents. Be skeptical of any plan that treats them as one.

| Market | What it actually is | Buyer | Incumbents already there | DART's honest position |
|---|---|---|---|---|
| **A. Horizontal "agent control plane"** | Identity, permissions, memory, runtime, audit for *all* enterprise agents (not just dev) | CIO / platform org | **Microsoft (Build 2026 Agent Control Plane), Google Cloud (Next 2026), Salesforce Agentforce, Lyzr** | **Do not enter.** This is hyperscaler turf, capital-heavy, and not dev-specific. DART would be roadkill. |
| **B. AI coding tool / autonomous SWE** | The agent that writes the code | Eng lead / dev (per-seat) | **Cursor, Claude Code, Copilot, Devin/Cognition, Factory, Windsurf, Tabnine** | **Do not enter.** DART explicitly rides *on top of* these. Competing here loses to better models and bigger budgets. |
| **C. Governed dev-process layer (the wedge)** | Enforced gated workflow + audit + rules **over** the coding tool you already use, multi-project, local-first | Eng lead / staff eng / compliance-conscious team | **Thin/contested:** Kiro (IDE-bound, AWS-tilted), GitHub's enterprise-governed Copilot (GitHub-bound), issue trackers becoming agent infra (Linear/Jira via MCP) | **This is the only viable lane.** Narrow, defensible, but contested and closing. |

**The verdict:** there *is* a paid market in lane C. But it is a **wedge market, not a platform market** — and the enterprise dollars in lane C are currently flowing to **incumbents who already own a surface the buyer trusts** (the IDE, the issue tracker, the cloud). DART's task is not to "be enterprise"; it is to be **the one thing those incumbents structurally won't ship**, for the buyer those incumbents structurally underserve.

### 1.2 Where DART can credibly WIN (the sharp wedge)

The defensible win is the **intersection** of three properties that no single incumbent ships together, because each has a reason not to:

1. **Enforced, gated governance that can *refuse*.** Coding tools (Cursor, Copilot, Devin) optimize for *velocity and autonomy* — a gate that blocks the agent is anti-thetical to their pitch. DART's `workflow-engine` with `refusal: hard` and the security `safety_override` is the rare asset that says **"the agent is NOT allowed to skip this."** That is a *governance* product, and governance is what regulated buyers pay for.
2. **Local-first / BYO-tool / privacy.** This is now a **named, funded enterprise category** in 2026 — air-gapped/on-prem AI coding is real (Tabby, Tabnine, Bodega One's outbound-audit story, FedRAMP-Moderate Copilot, VS Code air-gapped BYOK). DART is *already* loopback-by-default, file-based, your-keys, exportable-history. The privacy-bound dev team is a buyer who **cannot** use a cloud-routed control plane — and DART is structurally on the right side of that line.
3. **Multi-tool, multi-project, attributable audit trail.** Cursor governs Cursor; Copilot governs Copilot; Kiro makes you adopt Kiro. DART governs *whichever tool the team already uses, across many repos*, with a timestamped, attributed ledger of who/which-agent did what. That cross-tool, cross-project audit is the thing an agency or a regulated team can show an auditor or a client.

**The wedge sentence (skeptical version):** *DART is the local, tool-neutral governance layer that proves your AI agents followed your process — the one record an auditor will accept, on the machine your code never leaves.*

> **Why this is defensible and not just nice:** each incumbent has a *structural* reason not to copy it. Cursor/Copilot/Devin won't ship a hard gate that refuses their own agent (it kills their velocity story). Microsoft/Google want your context *in their cloud* (it's the business model — the opposite of local-first). Linear/Jira are human-process tools retrofitting agents; they won't ship a refusing, security-override gate bound to a coding agent's run loop. DART's moat is the **seam between** these, held by **enforcement + locality**, not by having agents (anyone has agents).

### 1.3 Where DART is NOT viable (stop pretending)

Brutal honesty, because the brief asked for it:

- **Not a Jira/Linear killer.** Linear and Jira are *becoming* agent infrastructure (native MCP servers, webhook fan-out, epics/projects/roadmaps as agent-queryable structure). They own the human-PM surface, the integrations, and the enterprise procurement relationship. DART's task board is a *governed worklist for one team's gated flow*, not a cross-org PM system. **Interoperate (consume/emit), don't compete.** A DART that tries to be "Linear but agent-native across all your epics" will be out-shipped and out-sold.
- **Not a horizontal agent control plane.** That word now means Microsoft/Google/Salesforce. DART using "control plane" in enterprise copy invites a comparison it loses on every axis (scale, identity, SSO maturity, support). **Drop "control plane" from the enterprise pitch; say "governance layer for dev."**
- **Not an autonomy story.** Devin/Factory sell "the agent does the whole ticket." DART's pitch is the *opposite* — "the agent is constrained and proven." Don't blur them; the constraint *is* the product. Marketing the agents (15 personas!) instead of the discipline is the persona anti-pattern that dilutes the only defensible message.
- **Not "enterprise" by feature-count.** DART today lacks the table-stakes an actual enterprise *procurement* requires: SSO/SAML, RBAC, a multi-user permission model, an audit-export an auditor recognizes, SLAs/support, and a deployment story beyond "a local Node sidecar." Calling it enterprise before these exist is a credibility own-goal (see §2.3).

### 1.4 The skeptical positioning truth

> DART can win a **narrow, defensible wedge** — *governed, local-first, tool-neutral AI-dev process with a real audit trail* — as a **bottoms-up developer/team product that grows into a compliance sale.** It cannot win as a "platform," a "control plane," or a PM/IDE replacement. The enterprise opportunity is **real but defensive**: you are selling *proof and constraint* to a buyer the incumbents underserve, not *power and autonomy* to the mass market. Build for that buyer or don't claim enterprise.

---

## 2. The "enterprise feel" — what makes a tool credible

"Enterprise feel" is not a skin. It is a set of **trust signals** that tell a skeptical engineer "serious people built this, and I can defend choosing it to my boss and my auditor." Beyond features, it's about *credibility under scrutiny*.

### 2.1 What DART genuinely has (differentiated, lean into it)

| Asset | Why it reads "serious" | Why it's differentiated |
|---|---|---|
| **Gates that can refuse** (`refusal: hard`, `safety_override`) | The product says *no* to the agent. Tools that only assist feel like toys to a governance buyer; a tool that *enforces* feels like infrastructure. | Coding-tool vendors won't ship a gate that blocks their own agent — it's against their velocity pitch. This is structurally DART's to own. |
| **Attributable, timestamped ledger** (who/which-agent did what, append-in-effect) | An audit trail is the #1 artifact a regulated buyer asks for. "Show me what the AI did and that it followed the rules" is currently *unanswerable* for most AI dev — DART answers it. | Most agent tools log to a vendor cloud you can't fully export. DART's ledger is file-based, git-native, yours. |
| **Local-first / loopback-by-default / your keys** | Privacy-bound buyers (fintech, health, public sector, defense-adjacent) *cannot* use cloud-routed tools. Local-first is now a funded enterprise category, not a niche. | The hyperscaler control planes are cloud-by-design — the opposite. DART is on the right side of the air-gap line by construction. |
| **The honesty DART already practices** | The vision docs and UI specs refuse to fake states ("Filename index only," "planned and not yet available," "we'll pick those up instead of re-initialising"). Engineers trust tools that *don't lie about their own state*. This is a brand asset most tools lack. | Substantiated, scoped honesty is rare and **builds the exact trust an enterprise sale needs.** Protect it — never let marketing inflate a claim the product can't back (see anti-patterns). |
| **Proportional process** (solo → small-team → regulated presets) | "Right-sized governance" pre-empts the #1 objection to process tools: *"this will slow my team to a crawl."* The `regulated` preset *is* the enterprise surface. | Most governance tools are all-or-nothing. The proportional dial is a genuine usability + sales asset. |

### 2.2 The table-stakes DART lacks (the credibility gap — name it, don't hide it)

These are not differentiators; they are the **price of admission** to the word "enterprise." Without them, the enterprise pitch is aspirational:

- **Identity & access:** SSO/SAML/OIDC, RBAC (who can edit the workflow, who can override a gate, who can read the audit). A governance tool with no *who-can-do-what* is a contradiction.
- **Multi-user reality:** today's model is single-operator-shaped. Enterprise = several humans + several agents acting concurrently on shared state, with attribution and conflict handling. (The CAS ledger is a *good foundation* — but the human-permission layer over it doesn't exist.)
- **Audit export an auditor recognizes:** not just a JSON ledger — a signed, tamper-evident, exportable record with a defensible chain. ("Append-in-effect" must become "provably append-only" for the regulated sale.)
- **Deployment credibility:** a story beyond "a local Node sidecar" — team/shared deployment, on-prem/self-host packaging, update/patch path, support SLA. The hosted/shared tier is also where the money is.
- **Cost governance:** per-run token/cost accounting is in the vision (H1) but is *essential*, not optional, for the enterprise buyer who fears runaway agent spend.

**The honest framing for the team:** DART has the **hard-to-build, defensible half** (enforcement, locality, audit, honesty) and **lacks the boring-but-mandatory half** (SSO, RBAC, multi-user, signed audit, deployment/support). Most startups have it backwards — they build SSO and have no moat. DART's sequencing advantage is real *if* it adds the table-stakes deliberately, not if it pretends they don't matter.

### 2.3 The polish / density / "serious tool" perception

Enterprise developers judge seriousness in the first 30 seconds, mostly subconsciously:

- **Density over decoration.** Serious tools (Jenkins Blue Ocean, GitLab pipeline analytics, Datadog, Linear) show *meaningful information density* — real numbers, real state, real flow — not empty cards with "coming soon." Every empty placeholder reads as "early-stage side project." (The v2 shell redesign already kills the "coming soon" panels — that instinct is correct and load-bearing.)
- **Live, not static.** The single biggest "serious vs toy" tell for an *agent* tool is whether the screen is *alive* — work moving, agents acting, gates firing in real time — vs a static diagram you have to imagine running. DART's SSE live-mirror is a genuine asset here; the Pipeline view must exploit it (see §3).
- **Consistency = trust.** One design language, status always = colour + glyph + text, no tofu glyphs, real focus states. The cockpit's existing discipline (no icon library, WCAG 2.2 AA, inline SVG, no-unsafe-binding tests) *is* enterprise-feel groundwork. Keep it.
- **Honest empty states.** Paradoxically, *honest* empty states ("No tasks yet — the team will create them as work starts") read as *more* serious than faked density, because they signal the tool respects the user. But an empty *Pipeline* is a special hazard (§3.4).

---

## 3. The Pipeline view's strategic role + first impression

### 3.1 What the Pipeline view is *for* (strategically)

The Pipeline view is **the proof surface for the entire DART thesis.** Everything DART claims — "process, not prompts," "gates that refuse," "agents follow your rules," "auditable flow" — is *abstract* until the user can **see governed work physically moving through gated stages, with agents acting on it.** The Tasks board proves "agents manage work." The Pipeline view must prove **"work is governed."** It is the screenshot that goes in the pitch, the HN post, the auditor demo.

This is why the brief is right that "the pipeline we have now cannot be a commercial/enterprise solution": a read-only stage rail (vision → arch → secops → … → done) *describes* a process but doesn't *demonstrate* one. A description is a brochure; a demonstration is a product. The enterprise buyer pays for the demonstration.

### 3.2 The desired first impression (for an enterprise developer)

When a staff/lead engineer opens the Pipeline view, the gut reaction must be:

> *"This is mission control for how my AI agents ship software — I can see exactly where every piece of work is, what's blocking it, which gate it's stuck at, who/what is acting next, and I can act on it right here."*

Concretely, the first 5 seconds must convey, in order:
1. **Live state** — something is *moving* or *recently moved* (the SSE token/pulse), so the tool reads as alive, not a diagram.
2. **Flow-health at a glance** — where is work piling up? what's blocked at a gate? what's waiting on a human? (the "human reading flow-health" audience).
3. **Governance is visible** — gates are *present and enforced* (a hard gate that something is *stuck behind* is the money shot; it proves the refusal is real, not decorative).
4. **It's actionable** — a human can intervene (approve a gate, unblock, reroute) and an agent can read "what's the next gated step I'm allowed to take" (the dual audience).

### 3.3 The dual-audience feel (human reads, agent acts)

This is the subtle, defensible design problem — and getting it right is itself a differentiator:

- **For the human:** the Pipeline is a **flow-health dashboard** — a Kanban-of-gates / value-stream view. Density of *meaningful* signal: counts per stage, age/staleness of stuck work, which gate is the bottleneck, what needs a human decision *now*. Borrow the literacy of Jenkins Blue Ocean (stage status at a glance), GitLab pipeline analytics (flow metrics), and Linear (calm density) — **but the "stages" are governance gates and agent handoffs, not build steps.** That reframing is the whole differentiation: it's a *CI/CD-shaped view of governed agent work*, which no one else has, because no one else gates agent work.
- **For the agent:** the same underlying model must be a **machine-actionable control surface** — "what tickets are at which gate, what am I (this role) cleared to act on next, what's blocking me." The agent doesn't read the SVG; it reads the projection behind it (the same `workflowView`/ledger the human's pixels are drawn from). The design principle: **one source of truth, two renderings** — the human gets pixels and flow-health; the agent gets the structured next-action. If the human's Pipeline and the agent's view of the world can diverge, the tool is lying to one of them — and trust dies.

**The honest design tension:** a "Jenkins/GitLab-like pipeline" metaphor is *seductive but dangerous*. CI/CD pipelines visualize *deterministic, frequently-running build steps*. DART's "pipeline" is *governance + agent handoffs that may run rarely and unevenly*. If DART copies CI/CD literally, it inherits CI/CD's expectation — *constant flow* — and looks broken when flow is sparse (§3.4). The right metaphor is closer to a **value-stream / gated work-board** than a build pipeline. Use the CI/CD *visual literacy* (stage status, flow at a glance, the live token) but **not** the CI/CD *promise* (always-on throughput).

### 3.4 The empty-pipeline skeptic note (the load-bearing risk)

**Be skeptical: most DART projects, most of the time, have little mid-flow work.** A solo operator's repo might have 2 tickets, both `done`. An agency's client repo might be dormant for weeks. If the Pipeline view's first impression depends on *busy flow*, it will be **empty and pointless** in exactly the moment a prospect first opens it — the worst possible first impression, and a direct "this is a toy" signal.

This is the single biggest threat to the Pipeline view's credibility, and it must be designed for *first*, not last:

- **Never show a bare empty pipeline.** An empty CI/CD pipeline screams "broken/unused." Instead, the empty/quiet state must show **the governed process itself as the value** — "here is the gated path work *will* travel, and the rules at each gate" — i.e. the structure is the content when flow is absent. (The v2 spec's instinct — "Using the default solo workflow" + the track — is the right seed; it must be elevated, not a fallback.)
- **Make rare flow feel significant, not sparse.** When only one ticket is moving, *that* ticket and *its* gate should be the hero — a focused "here's the one thing in flight and what it's waiting on" — not one lonely dot on a vast empty rail. Density of *context* compensates for sparsity of *work*.
- **Surface history/throughput when live work is absent.** "12 items shipped through this pipeline this month; here's the gate that blocked the most" turns an idle pipeline into a *flow-health report* — which is arguably *more* enterprise (value-stream analytics) than a busy live view. This is also where DART's audit-trail asset pays off: the Pipeline view doubles as the audit/throughput surface.
- **The skeptic's test:** open the Pipeline view on a brand-new connected project (zero tickets) and on a dormant project (all done). If either reads as "empty/broken," the design has failed the most common real-world case. This must be the *first* state designed, not an afterthought.

> **The one-line takeaway for the Pipeline redesign:** design the **quiet/empty and single-item states first** (they are the common case), make the **live/governed/actionable** state the hero when work *is* flowing, and ensure **the human's flow-health view and the agent's next-action view are the same truth rendered twice.**

---

## 4. Positioning + the wedge + GTM honesty

### 4.1 The one-line positioning (DART-as-enterprise)

> **For engineering teams who must *prove* how their AI agents ship software, DART is the local-first governance layer that enforces your gated process, across the tools and projects you already use, and produces the audit trail an auditor will accept — without your code, prompts, or context ever leaving your machines.**

Shorter, for the headline: ***Prove your AI followed the process. Locally. Across every tool and project.***

Note what this deliberately **omits**: "control plane," "platform," "autonomous," "more agents," "replace Jira." Each omission is a positioning discipline that keeps DART out of a fight it loses.

### 4.2 The realistic wedge — who adopts first, and why

The enterprise sale does **not** start with a CIO. It starts bottoms-up and converts to a governance/compliance sale. The adoption ladder:

1. **First adopter: the privacy-bound or quality-obsessed staff/lead engineer** running AI agents on a sensitive codebase, who *cannot* pipe their repo to a cloud tool and is tired of agents skipping their own rules. They adopt DART *for themselves* because it's local, free, and enforces discipline. This is the wedge user — and it's the user DART already serves.
2. **Expansion trigger: the team standardizes.** "Every dev's AI does something different; our gates depend on memory." DART becomes *the shared process* — same gates fire for everyone. This is where the *2nd seat* and *2nd project* appear (the monetization leading indicators).
3. **The enterprise sale: compliance/audit forces the conversation.** "Prove the AI followed our security/PII rules." Now the buyer is a lead/CTO/compliance owner, and the pitch is **proof, not productivity.** The `regulated` preset, the refusing security gate, the local-first guarantee, and the audit export *are the pitch.* This is the only path where "enterprise" is earned, not claimed.

**The buyer truth:** for the wedge, the *user is the buyer* (PLG/bottoms-up). For enterprise, the buyer cares about **risk, proof, and locality** — sell governance and audit, never "agents" or "speed."

### 4.3 What to build vs what to NOT build (to stay credible)

**Build (deepens the moat, earns "enterprise"):**
- The **Pipeline view as a live, governed, dual-audience flow surface** (§3) — the proof screen. Empty/quiet states first.
- **The table-stakes that gate the compliance sale, in order:** signed/tamper-evident audit export → RBAC (who can override a gate) → SSO → multi-user shared-state reality. (These are *unsexy but mandatory*; without them "enterprise" is a lie.)
- **Cost/budget governance** (per-run token accounting + budget guard) — the enterprise buyer's #1 fear about agents is runaway spend.
- **Tool-neutral host coverage** — Claude Code first, then Cursor/Copilot/Kiro — because *tool-neutrality is the whole anti-lock-in pitch* and the thing incumbents can't match.

**Do NOT build (each erodes credibility or picks an unwinnable fight):**
- A general-purpose **visual workflow engine** (n8n/Node-RED clone). The vision already rejects this (L3) — hold that line; it's a swamp that turns DART into "build n8n for agents" (K14/R10) and dilutes the governance message.
- A **cross-org PM system** competing with Linear/Jira. Interoperate (consume/emit via MCP), don't replace.
- **Autonomy/"agent does the whole ticket"** features — that's Devin's fight and it contradicts the constraint message.
- **"Control plane" / horizontal-agent positioning** — concedes a comparison to Microsoft/Google you lose. Stay *dev-process-governance* specific.
- **Cloud/SaaS-first anything** that compromises the local-first guarantee — it's the one structural advantage the hyperscalers can't copy. A hosted *team* tier can exist, but local-first must remain the floor and the headline.

### 4.4 The honest risks — including "is this even a product?"

| Risk | Honest assessment | What de-risks it |
|---|---|---|
| **"Is this a product or a sophisticated personal tool?"** *(the load-bearing risk)* | **Today it reads as a solo/personal operator tool.** The multi-user, shared-state, RBAC, SSO, signed-audit reality that separates "my tool" from "our product" does **not** exist yet. The enterprise vision is credible as a *direction* but the product is currently single-operator-shaped. | A deliberate, sequenced bridge to *team* reality (shared state + permissions + signed audit), and an honest internal acknowledgment that **until then, DART is a powerful personal/solo tool with a wedge into team** — not yet an enterprise product. Don't market past the product. |
| **The window is closing.** | Hyperscaler control planes (MS/Google) and coding-tool governance (enterprise-managed Copilot, Cursor Enterprise) are landing *now*. The neutral-governance gap DART fits is being filled from both sides. | Move on the *defensible* wedge (local-first + enforcement + tool-neutral audit) fast; don't dilute time on un-winnable lanes. Speed on the moat, not breadth. |
| **Lock-in allergy cuts both ways.** | DART's whole pitch is "no lock-in," but an enterprise *also* needs to trust DART itself won't become lock-in. | Hammer file-based/git-native/exportable everything. The audit trail and rules base must be *yours*, plain-text, leave-anytime. This is consistent with the moat. |
| **The "thin wrapper" dismissal.** | Skeptics dismiss governance layers as thin. | The *live refusing gate* + *attributable audit* + *local-first* demo is the rebuttal — wrappers can't refuse and can't prove. The Pipeline view is where this rebuttal becomes visual. |
| **Monetization timing.** | OSS-first audience resists paywalls; too early kills the community motion that feeds the funnel. | Open-core, generously: framework + single local project free forever; monetize *team/regulated* surfaces (shared governance, signed audit export, SSO, hosted history). Sell scale + proof, never the agents. |
| **Empty Pipeline first impression** | Covered in §3.4 — the most common real-world state is the worst-designed one if ignored. | Design quiet/empty/single-item states first; make the process+history the content when flow is absent. |

### 4.5 GTM motion (honest, abbreviated)

- **Motion:** community-led (OSS) → product-led (PLG activation) → compliance-led (enterprise). Not sales-led at the start.
- **Lead magnet:** the *live refusing gate* and the *governed Pipeline flow* as a 30-second clip — that clip *is* the pitch. Distribute where the ICP lives (Claude Code/Cursor communities, HN, dev.to, GEO-optimized "vs Kiro," "AI agents that actually follow your rules," "local-first AI dev governance" pages).
- **Activation metric (the one that matters):** % of new projects that *connect AND run one gated workflow to completion* — proves the enforcement is felt, not bypassed.
- **Expansion/monetization trigger:** 2nd project + 2nd seat — where willingness-to-pay first appears, and the doorway to the team/regulated tier.
- **The enterprise close:** "show me the audit" → the Pipeline view + signed export answers it. That is the demo that converts a privacy-bound team into a paid governance customer.

---

## 5. Hand-offs (co-investigation)

- **→ /arch:** the dual-audience "one source of truth, two renderings" principle (§3.3) is an architecture constraint — the human's Pipeline pixels and the agent's next-action projection must derive from the same model, never diverge. Signed/tamper-evident audit export (§2.2) is an architecture ask, not a UI one.
- **→ /secops:** the local-first guarantee and the refusing security gate are the load-bearing trust signals — they must remain *provably* true (no silent egress, no skippable safety gate) or the entire enterprise positioning is fraudulent. RBAC/gate-override authority is a security-model question.
- **→ /ui:** the Pipeline view's empty/quiet/single-item states are the *first* states to design (§3.4), not the last; the hero state is live/governed/actionable. Density of meaningful signal over decoration; live (SSE) over static.
- **→ /po:** the strategic call is *sequencing the table-stakes* (§2.2, §4.3) — DART has the moat half and lacks the mandatory half; "enterprise" is earned only when the boring half lands. Decide the open-core line.

---

## Sources (research grounding)

- Microsoft Build 2026 Agent Control Plane — [Windows Forum](https://windowsforum.com/threads/build-2026-microsofts-agent-control-plane-context-governance-and-windows-runtime.425206/)
- Google Cloud Next 2026: the agentic enterprise control plane — [Bain & Company](https://www.bain.com/insights/google_cloud_next_2026_the_agentic_enterprise_control_plane_comes_into_view/)
- AI agent orchestration goes enterprise (governance maturity ~7–8%) — [FifthRow](https://www.fifthrow.com/blog/ai-agent-orchestration-goes-enterprise-the-april-2026-playbook-for-systematic-innovation-risk-and-value-at-scale)
- Best AI orchestration / agent control-plane platforms 2026 — [DevTools Academy](https://www.devtoolsacademy.com/blog/best-ai-agent-orchestration-platforms-2026) · [Domo](https://www.domo.com/learn/article/best-ai-orchestration-platforms) · [Lyzr](https://www.lyzr.ai/blog/agent-orchestration/)
- AI coding tool enterprise pricing/positioning (Cursor, Copilot, Devin, Claude Code) — [Paperclipped](https://www.paperclipped.de/en/blog/ai-coding-assistants-compared-2026/) · [Cursor pricing 2026 (DEV)](https://dev.to/rahulxsingh/cursor-pricing-in-2026-hobby-pro-pro-ultra-teams-and-enterprise-plans-explained-4b89) · [Devin pricing 2026](https://aitoolpick.org/blog/devin-pricing-2026/) · [AI coding pricing shake-up June 2026](https://www.digitalapplied.com/blog/ai-coding-tool-pricing-june-2026-seat-economics-guide)
- Local-first / air-gapped enterprise AI coding (the wedge category) — [VS Code air-gapped BYOK (TechTimes)](https://www.techtimes.com/articles/317986/20260608/vs-code-agents-hit-stable-air-gapped-byok-unlocks-enterprise-ai-coding.htm) · [Air-gapped AI coding guide (Bodega One)](https://www.bodegaone.ai/blog/air-gapped-ai-coding-guide-2026) · [Best local-first AI coding tools 2026 (Nimbalyst)](https://nimbalyst.com/blog/best-local-first-ai-coding-tools-2026/) · [Enterprise-governed Copilot BYOK (DigitalApplied)](https://www.digitalapplied.com/blog/enterprise-governed-ai-coding-vscode-copilot-byok-2026) · [Air-gapped enterprise code assistants (IntuitionLabs)](https://intuitionlabs.ai/articles/enterprise-ai-code-assistants-air-gapped-environments)
- Pipeline visualization "serious tool" literacy (Jenkins Blue Ocean, GitLab analytics) — [Jenkins vs GitLab (Folio3)](https://cloud.folio3.com/blog/jenkins-vs-gitlab/) · [GitLab CI/CD analytics](https://docs.gitlab.com/user/analytics/ci_cd_analytics/)
- Issue trackers becoming agent infrastructure (why not to compete with Linear/Jira) — [Issue trackers as AI agent infrastructure (MindStudio)](https://www.mindstudio.ai/blog/issue-trackers-ai-agent-infrastructure-jira-linear) · [Linear vs Jira 2026 (eesel)](https://www.eesel.ai/blog/linear-vs-jira) · [Jira to AI agents (Age-of-Product)](https://age-of-product.com/jira-ai-agents/)

*Internal grounding: `docs/product-vision/VISION.md`, `docs/product-vision/strategy.md`, `docs/product-vision/ui-design-cockpit-v2.md`, and the cockpit workflow-builder/shell components.*
