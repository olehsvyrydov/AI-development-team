# Knowledge Page — Strategy, Positioning & Usability Verdict (Apex)

> Prepared by **Apex** (`/mkt`) — Senior PMM / CSO. **Strategy / positioning / usability proposal only — no code.**
> Lens: the commercial honesty of the **DART-local-Knowledge ↔ Canon** relationship, the first-impression / trust feel of a **dedicated Knowledge page**, the Knowledge feature's **wedge**, and the **honest copy + risks**.
> Posture per the brief: **fully skeptical.** This document's job is to say where the dedicated Knowledge page earns trust, where the Canon tie-in helps the funnel vs. where it muddies the open-source story, and where "Knowledge" is a thin feature that won't move anyone. It is deliberately not gloss.
> Co-investigation: this is the strategy/positioning/usability lens in a five-agent study (with /arch, /secops, /ui, and a product lens) into a dedicated Knowledge page for DART.

**Read for grounding (live build + prior art):**
`docs/product-vision/conditional-workflow/usability-home-tasks-knowledge-apex.md` (my locked Knowledge mental model + microcopy — carried, not re-litigated) · `docs/product-vision/architecture.md §7` (BASE = `claude/memory`; KGB/Canon = *optional* overlay, not yet built) · `docs/product-vision/DECISIONS.md` (Canon = commercial branch of KGB; local Bumbl/KGB facts) · `docs/sprints/sprint-08-knowledge-qa/approvals/legal-privacy-copy.md` (the **ADT-236** honesty clearance — egress disclosure, "Common"=own-projects, filename-not-semantic, /kai propose≠apply) · live: `shell/base-panel.component.ts`, `shell/propose-inbox.component.ts`, `shell/knowledge-qa.component.ts`, `hub/lib/overlay.js`.

> **A grounding correction the brief should absorb.** The *currently shipped* optional overlay seam is **memory** (mem0 = cloud, OpenMemory = local-service — `hub/lib/overlay.js`), gated by the ADT-236 egress-disclosure honesty. **Canon is not wired today** — architecture.md treats KGB/Canon as a *recommended optional governance overlay for teams*, with the MCP surface "to be confirmed against the actual schema." So "connect-to-Canon" is a **forward** affordance on the same adapter seam memory already proves out. This matters for honesty: the page must not imply a Canon button that does nothing (the dead-control anti-pattern). Design the words now; ship the affordance only when the adapter exists.

---

## 0. TL;DR — the honest verdict in five lines

1. **The DART-Knowledge ↔ Canon one-liner (honest):** *DART's local Knowledge is the free, on-your-machine memory your agents read and obey; Canon is the governed, multi-person upgrade you connect when "my notes" has to become "our record an auditor trusts." Same Knowledge surface — you change where it lives, not what it is.*
2. **Is the relationship coherent or muddled?** *Coherent IF — and only if — DART never sells Canon and Canon never leaks into the open-source page as a nag.* The funnel is real (local → team → governed). The danger is real too: a "Connect Canon" call-to-action on a local-first free tool reads as a bait-and-switch and poisons the exact trust the wedge depends on. **Default the page to local; make Canon an invisible-until-relevant capability, never a marketed upsell.**
3. **The Knowledge feature's sharpest wedge:** *it is the only "notes" that your coding agents actually read and are gated by — curated by you, local, and tied to the workflow that can refuse to proceed.* A README is docs for humans; Notion/Obsidian are notes for humans. DART Knowledge is **operating instructions for your agents, enforced by the pipeline.** That, not "another KB," is the reason to use it.
4. **The single thing that makes the page feel trustworthy vs a notes dump:** **show provenance + grounding honesty on every entry — where it came from, whether it's actually recallable-by-meaning or only by filename, and (if connected) whether answering it left the machine.** A notes dump shows text; a knowledge surface shows *whether the system actually understands and uses each note.* DART already practices this honesty (ADT-236) — the dedicated page must make it the visible spine, not a footnote.
5. **The load-bearing risk:** the open-source Knowledge could be **too thin to matter** (a glorified notes list) *and* the Canon tie-in could **muddy the free story**. Both are avoidable, but only by (a) anchoring the wedge in *agents-read-and-are-gated-by-this* and (b) ring-fencing Canon as a quiet "scales with you" capability, not a sales surface.

---

## 1. The two-product relationship — positioning honesty

### 1.1 The honest two-product map (no gloss)

| | **DART local Knowledge** | **Canon (connected)** |
|---|---|---|
| What it is | The agent-readable memory for one operator's projects, stored in the project folder | A self-hosted **governed** KB service (Spring + Postgres + Qdrant + MCP) shared by a team |
| Where it lives | **On your machine**, in files / sqlite-vec (BASE = `claude/memory`) | A server the team runs (self-hosted), reached via an MCP adapter |
| Who it's for | The solo / privacy-bound dev; the get-started tier | A team that must share knowledge **and prove its governance** |
| Governance | **Gated by the DART workflow** (the same gates that refuse code refuse bad knowledge writes via `/kai` propose→approve) | RBAC + **provenance/audit** + **named-senior approval** + per-proposal cost receipt (TrustGate) |
| Recall honesty | filename-only **or** local semantic (if an embedder is configured) — *stated plainly* | semantic + cited, with a governed write-back trail |
| Price | **Free, forever** | Commercial track |
| The trust line | "Nothing is uploaded; indexed on this machine" | "Connecting Canon sends in-scope knowledge to *your* governed server — disclosed when it happens" |

**The relationship in one breath:** *DART local Knowledge and Canon are the same job at two scales.* Local Knowledge answers "how do I stop re-explaining the rules to my agents, privately?" Canon answers "how do I prove, across a team, that the knowledge my agents act on is governed, attributed, and approved?" **You don't switch products; you connect a stronger backend under the same Knowledge surface.**

### 1.2 Is this coherent — or muddled? (the skeptical test)

**It is coherent on the merits.** This is the canonical open-core funnel — free local tier, governed paid/self-hosted upgrade — and DART's version is unusually clean because *the upgrade is a backend swap behind one surface*, not a different app. The adapter seam already exists and is proven by the memory overlay; Canon is "the same seam, a governed destination." Architecturally honest.

**But it is one bad CTA away from muddled.** Three specific ways the team will break it if not disciplined:

1. **The upsell-in-the-free-tool trap.** The moment the open-source Knowledge page carries a prominent "Upgrade to Canon" / "Connect Canon" banner, the local-first promise reads as a teaser. The privacy-bound dev — *the entire wedge user* — feels the rug move. **Rule: the free page sells nothing. Canon is discoverable, never promoted.** (See §1.4.)
2. **The "what even is Canon?" confusion.** Most open-source users will never run a self-hosted Spring/Postgres/Qdrant service. If the page explains Canon up front, it teaches 95% of users about a thing they'll never use — pure cognitive tax. **Canon copy appears only at the connect affordance, only when someone goes looking.**
3. **The provenance-double-standard trap.** If local Knowledge is sloppy ("just notes") and Canon is "the governed one," it implies *the free tier isn't trustworthy.* That's a self-inflicted wound. **The free tier must already practice provenance + grounding honesty** (§2) — Canon adds *multi-person* governance (RBAC, named-senior approval, audit export), not *first-time* trust. Local Knowledge is trustworthy on day one; Canon makes it *defensible to an auditor and shareable across people.*

**Verdict:** the relationship is **coherent as a capability ladder, fragile as a marketing story.** Keep it a capability ladder. The product's own behaviour (local default, disclosed egress, propose→approve) carries the funnel honestly; any *marketing* of Canon inside the free surface is where it goes muddled.

### 1.3 The cannibalization / confusion check

- **Does Canon cannibalize local Knowledge?** No — different buyer, different job. The solo/privacy user *can't and won't* run Canon; the team that needs RBAC/audit *can't* satisfy compliance with a local file. They don't compete; one is the on-ramp to the other. The only cannibalization risk is **self-inflicted**: positioning local Knowledge as "lite/crippled" instead of "complete for one operator." Don't. Local Knowledge is *the whole product* for its user.
- **Does the dogfood muddy the message?** DART *dogfooding* Canon (the team building DART uses Canon internally) is an **internal credibility asset, not a public message.** "We use it ourselves" is a quiet proof point for the *Canon* sale later — it is **not** something the open-source Knowledge page should announce. Keep dogfood in the Canon GTM, out of the DART OSS surface.

### 1.4 The funnel — honest mechanics

The funnel is **bottoms-up, behaviour-triggered, never banner-triggered:**

1. **Land (free, local):** dev uses DART Knowledge because their agents finally stop re-explaining the rules — local, private, gated. No account, nothing uploaded. *This is the whole experience for most users, forever, and that's fine.*
2. **Strain (the real trigger):** a *second person* needs the same knowledge; or someone asks "prove the AI followed our rules"; or "who approved this rule and when?" Local files can't answer *multi-person governance* — and the user *feels* the gap themselves. **The product surfaces the upgrade only at the moment of strain** (e.g. when a shared/team scope or an audit-export need appears), never before.
3. **Connect Canon (governed):** the team stands up Canon (self-hosted) and connects it under the same Knowledge surface. Now: RBAC, provenance/audit, named-senior approval, cited answers. **The buyer here is a lead/compliance owner — and the pitch is proof, not productivity.**

**The single funnel metric that matters:** not "Canon clicks" — it's **% of projects whose agents actually recall a curated Knowledge entry in a real run.** That proves the local tier delivers its job; a tier nobody's agents read will never produce a Canon upgrade. *Activation of the free tier is the only thing that feeds the paid one.* Optimize the free wedge first; the Canon funnel is downstream of it.

---

## 2. The dedicated-page first impression + trust signals

### 2.1 Why a dedicated page at all (the strategic upgrade vs the panel)

Today Knowledge is a **read panel** in the project shell (`base-panel.component.ts`) — counts, an index breakdown, a few recent docs, a paste-a-note composer, and an inert "Manage · soon". A dedicated page (peer to Tasks and Workflow) is the right move **if and only if** it earns the promotion: a page is a promise of *depth*. An empty or shallow page next to a rich Tasks board reads as "early-stage side project" — the exact toy signal to avoid. The promotion is justified by what the brief adds: **full add / edit / remove + connect-external-codebase + (forward) connect-Canon.** That's CRUD + provenance + scaling — page-worthy. A panel that only *reads* is not.

**The strategic role of the page:** it is the surface where DART proves *"your agents have a curated, governed memory — and you can see and shape exactly what they know."* Tasks proves work *moves*; Workflow proves it's *gated*; **Knowledge proves the agents are *informed and constrained by what you decide they know.*** That's the third leg of the "process, not prompts" thesis.

### 2.2 What makes it feel like a real knowledge surface (vs a notes dump)

A notes dump shows **text you typed.** A trustworthy knowledge surface shows **whether the system actually ingested, understood, and will use each entry.** The difference is entirely about *surfacing the machine's relationship to the note*, and DART already has the honest signals to do it (ADT-236). The first-impression hierarchy:

| Rank | Signal | Why it reads "real knowledge surface, not a notepad" | Honesty rule |
|---|---|---|---|
| 1 | **Grounding state per entry** — recallable-by-meaning vs filename-only | The user sees *whether the agent can actually find this by meaning* — the single biggest "this is a real index, not a text box" tell. | "Filename index only — connect an embedder for semantic recall" ships verbatim; never imply "understood" without an embedder. |
| 2 | **Provenance per entry** — who/what added it (you, an agent via /kai, an imported codebase), when | A notes dump has no origin; a knowledge base has *lineage*. Provenance is the spine of trust. | Show the real origin; never fabricate an author. /kai-proposed entries are **proposals until you approve** — never silently authored. |
| 3 | **Scope** — this project vs shared across your projects (vs, forward, Canon/team) | Tells the user *who/what acts on this* — the reach of the rule. | "Shared" = across *your own* projects on this machine, never a cloud (ADT-236 C-242). |
| 4 | **Index health** — indexed / indexing / failed, with retry | A real index has *state*; a notes app doesn't. Failures shown honestly (not hidden) read as *more* trustworthy. | Absent, never a fake zero; "failed — open to retry" is honest, not alarming. |
| 5 | **Kind** — Rule / Convention / Context / Decision (plain language) | Structure signals curation, not a wall of text. | Plain words, not schema enums (no "embeddings/chunk/vector" in user copy). |
| 6 | **Egress state (only when connected)** — did answering this leave the machine, and to where (local-service vs cloud) | The trust unlock for the connected tiers: the user is *told* when knowledge egresses, with residency. | Driven by the real `egressDisclosed` flag (ADT-236) — present iff a send happened, names the residency tier. |

**The one-line test (the brief's question, answered):** *the page feels trustworthy — not a notes dump — when every entry visibly answers "can my agent actually find this, where did it come from, and does using it leave my machine?" before it shows the note's text.* Provenance + grounding-honesty on the row **is** the difference. A dump shows the words; a knowledge surface shows the system's honest relationship to the words.

### 2.3 The honesty DART already practices — keep it as the visible spine

This is DART's rarest brand asset and the page must **foreground** it, not bury it:

- **Filename-only-unless-embedder.** Most KB tools imply semantic magic they don't always have. DART *says* when it's only a filename match. On a dedicated page, make this a calm per-entry badge, not a hidden caveat — it is a **credibility multiplier**, because a tool that admits its limits is trusted on its claims.
- **Local-first by construction.** "Indexed on this machine; nothing is uploaded" is true *by default* and provable. The page leads with this as the resting state.
- **No fake semantic / no fake zero / propose≠apply.** /kai proposes; you approve; nothing is recallable until you do (ADT-236 Item 3, proven inert-by-location). The page renders proposals as a **review queue**, never as already-saved knowledge.

**The discipline:** these honesty signals are not fine print — on a dedicated page they are the *information architecture*. The page that shows its own limits honestly is the page an engineer trusts with their agents' brain.

### 2.4 Connect-codebase + connect-Canon as "this scales with you" signals

Two affordances signal *the page grows with you* — but they carry different honesty loads:

- **Connect an external codebase (open-source, local, ships with the page).** This is a **pure trust win** and the strongest "real tool" signal: point Knowledge at another local repo and it ingests that code/docs into the agent-readable index, **on your machine, read-only** (mirror the ratified picker honesty: "DART reads this folder… nothing is uploaded… never writes outside this folder"). It says *"your agents' knowledge isn't limited to one repo — it spans the code you actually work across."* That is a concrete, local, honest capability — it belongs on the page now.
- **Connect Canon (forward, governed, team).** This is the *"scales beyond one machine"* signal — but it must be **a quiet capability discovered at the connect surface, not a banner.** When present, its copy must disclose egress truthfully (knowledge now lives on / is answered by your governed server; sends are disclosed with residency, per ADT-236). **Until the Canon adapter actually exists, there is no Canon button** — drafting the words now (this doc) is content-ahead-of-build, not a shipped dead control.

> **The "scales with you" framing, honestly:** *connect-codebase* says "your agents know your code" (local, now); *connect-Canon* says "your team's knowledge is governed and provable" (server, later). Both are real ladders — neither is a teaser — **as long as the local capabilities are complete on their own** and Canon is never dangled as the thing that makes Knowledge "actually good."

---

## 3. The wedge for the Knowledge feature

### 3.1 The skeptic's question, head-on: why use this over a README / Notion / Obsidian?

Be brutal: a dev already has a README, maybe a Notion, maybe Obsidian, maybe just comments. Another "place to put notes" is **dead on arrival.** If DART Knowledge competes as *a better place to write notes*, it loses — Notion and Obsidian are better notes apps and always will be. So the wedge **cannot** be "notes." It has to be something those tools structurally are not.

### 3.2 The sharp wedge (the one sentence)

> **DART Knowledge is the only notes your coding agents actually read and are gated by** — curated by you, local, and wired into the workflow that can refuse to proceed. A README is for humans to read; Notion/Obsidian are for humans to read. **DART Knowledge is operating instructions your agents obey, enforced by the pipeline.**

Three properties make it a wedge, not a feature — and each is something README/Notion/Obsidian cannot claim:

1. **Agents read and act on it.** A README sits there hoping a human reads it. DART Knowledge is *recalled into the agent's run* (the existing SessionStart recall feeds agent runs — architecture.md). The note you write today *changes what your agents do tomorrow*, automatically. That's the difference between documentation and *operating memory.*
2. **It's governed by the same gates as the code.** New knowledge isn't a silent write — agent-proposed rules go through `/kai` propose→**you approve** (ADT-236). So the knowledge your agents trust is *curated and gated*, not a wiki that rots. Notion has no gate; Obsidian has no gate; a README has no gate.
3. **It's local and yours.** Plain-text / sqlite in the project folder; nothing uploaded by default; leaves with the repo. The privacy-bound dev *cannot* put their rules in a cloud Notion — DART Knowledge is structurally on the right side of that line, and it travels with the code.

### 3.3 The differentiator, distilled

> **README / Notion / Obsidian = knowledge for *humans*. DART Knowledge = knowledge for *agents*, curated by humans, gated by the workflow, kept local.** It's the curated brain your AI team operates from — and the only one tied to a process that can refuse to proceed.

This is also why a dedicated *page* is justified: the wedge is "shape exactly what your agents know and obey," and shaping requires real CRUD + provenance + scope + connect — a page, not a read panel. The page is where the user *governs the agents' mind.*

### 3.4 The honest limit of the wedge (skeptical)

The wedge is sharp **only if the recall actually works in real agent runs.** If a curated note never demonstrably changes an agent's behaviour, the whole wedge collapses to "notes with extra steps." So the load-bearing product proof is **demonstrable recall** — the agent visibly acting on a curated entry. (This is also the activation metric in §1.4.) Marketing must not run ahead of this: if recall is shallow today (filename-only without an embedder), the honest pitch is *"curate the rules; connect a local embedder for search-by-meaning,"* never "your agents deeply understand everything you write." The honesty discipline (§2.3) *is* the credibility that lets the wedge claim stand.

---

## 4. Honest copy + the risks

### 4.1 Honest copy (reuse the ADT-236 / locked vocabulary — ship verbatim, route privacy lines to /secops + /legal)

These extend, not replace, my locked Knowledge microcopy (`usability-home-tasks-knowledge-apex.md §3`) and the ratified strings. Privacy/grounding lines route to `/secops` + `/arch` + `/legal` before shipping (same bar as `copy.ts`).

**Page identity + resting honesty**
- Page title: **"Knowledge"** (never "Base" — internal noun).
- Page one-liner: *"The rules and context your team follows — curated by you, read by your agents, on your machine."*
- Resting local-first line: *"Local-first — nothing is uploaded. Indexed on this machine."* (ships verbatim; ADT-236-cleared.)

**Grounding honesty per entry (the spine)**
- Semantic: *"Searchable by meaning — indexed locally on your machine."*
- Filename-only: *"Filename index only — connect an embedder for semantic recall."* (verbatim, ADT-236 Item 4 — never elevate to "understood.")
- Failed: *"Couldn't be read — open to retry."*

**Add / edit / remove (the new CRUD honesty)**
- Add composer lead: *"Add a rule or piece of context your team should follow. It's saved to this project, on your machine."*
- Edit: *"Editing updates what your agents recall. Changes are re-indexed locally."*
- Remove: *"Remove from your team's knowledge. Your agents stop recalling it. This deletes the note from this project on your machine — it isn't sent anywhere."* (Honesty: removal is a real local delete, not a cloud tombstone.)

**Connect an external codebase (local, ships with the page)**
- CTA: *"Connect a codebase"*
- Helper: *"Point DART at another local repo — it reads the code and docs into your agents' knowledge, read-only, on this machine. Nothing is uploaded; DART never writes outside that folder."* (mirrors ratified picker copy.)

**Connect Canon (forward — drafted, ships only with the adapter)**
- CTA (discovered, never a banner): *"Connect a governed knowledge server"* (lead with the *capability*, not the product name).
- Helper: *"For teams: store and govern this knowledge on your self-hosted Canon server — with roles, provenance, named approval, and an audit trail. Connecting sends in-scope knowledge to your server; you'll be told when knowledge leaves this machine, and where it goes."*
- Egress disclosure (when connected, driven by the real flag): *"Answered using your governed server"* + residency tier (verbatim mechanism from ADT-236; **no second egress path, no second disclosure** — the backend is the single source of truth).

**/kai proposals (the propose→approve guardrail)**
- Inbox line (verbatim, shipped): *"/kai surfaced these recurring notes for review. Nothing is saved until you approve — and you choose where it goes."*

**Banned on this page (anti-patterns):**
- ❌ No "Upgrade to Canon" / pricing / "Pro" banner on the open-source page (§1.2 trap 1).
- ❌ No absolute privacy superlative ("100% private", "never leaves", "fully local" unconditionally) anywhere an overlay could falsify it (ADT-236 re-open trigger; CPUTRs/DMCCA exposure per `/legal`).
- ❌ No "0 docs" / fake-zero rows — absent, or the teaching empty state.
- ❌ No "understood / semantic" claim when only a filename matched.
- ❌ No auto-applied /kai writes — propose→approve only.
- ❌ No "synced to cloud / shared with your team" for the *local* "shared" scope (= your own projects, this machine).

### 4.2 The risks — skeptical, with what de-risks each

| Risk | Honest assessment | What de-risks it |
|---|---|---|
| **Open-source Knowledge is too thin to matter** *(load-bearing)* | A real danger. If recall doesn't demonstrably change agent behaviour, the page is "a notes list with extra steps" — and loses to Obsidian instantly. The default filename-only tier is *weak* without an embedder. | Anchor the wedge in **demonstrable agent recall** (§3.4), make **connect-an-embedder** a first-class, easy local step, and ship **connect-codebase** so the agents' knowledge spans real code, not a handful of pasted notes. Measure recall-in-real-runs (§1.4), not doc count. |
| **The Canon tie-in muddies the open-source story** *(load-bearing)* | Equally real. A "Connect Canon" banner on a local-first free tool reads as bait-and-switch and poisons the wedge's trust. Explaining Canon up front taxes the 95% who'll never run it. | **Local is the default and the whole product for one operator. Canon is a discovered capability, never a marketed upsell** (§1.2). Lead the connect affordance with the *capability* ("governed knowledge server"), not the product name; surface it only at the moment of strain (§1.4). |
| **Dead control: a Canon button that does nothing** | The adapter isn't built (architecture.md — MCP surface unconfirmed). Shipping a "Connect Canon" CTA before the adapter exists is the dead-control anti-pattern that screams "demo-ware." | Content-ahead-of-build only (§4.1). **No Canon affordance ships until the adapter is real and health-checked.** The words wait for the behaviour — same discipline as the /kai scope copy. |
| **Provenance double-standard** | If local Knowledge is "just notes" and Canon is "the trustworthy one," the free tier reads as untrustworthy — self-inflicted. | The **free tier already practices provenance + grounding honesty** (§2). Canon adds *multi-person* governance (RBAC, named approval, audit export), not *first-time* trust. |
| **Privacy overclaim on egress** | The moment a Canon/memory overlay is connected, any absolute "nothing leaves" claim becomes false (ADT-236 / `/legal` re-open trigger #1). | Truthful-by-construction: egress disclosed iff a send happened, with residency tier, from the single backend flag. **No second disclosure path.** Route all privacy lines to `/secops` + `/legal`. |
| **CRUD without governance feels less safe than the panel** | Add/edit/**remove** is more power than the read panel — a careless delete could strip a rule agents depend on. | Honest, reversible-feeling copy on remove (§4.1); show *what recalls this* before deletion; keep /kai writes gated. Edit/remove are *operator* actions — but the connected (Canon) tier is where *who-can-edit* (RBAC) and *named approval* make destructive changes governed, which is itself a clean reason the team tier exists. |
| **"Knowledge" competes with the user's existing KB** | Devs won't migrate Notion/Obsidian into DART. | Don't ask them to. The wedge is *agent-readable + gated*, not *replace your wiki* (§3). Connect-codebase pulls in the *code* the agents need; the user keeps their human wiki. Interoperate, don't replace. |

### 4.3 GTM honesty (abbreviated)

- **Motion:** community/PLG on the free local tier → compliance-led for Canon. The free Knowledge page is the *activation surface*, never a Canon ad.
- **The clip that sells it:** *write a rule → watch an agent obey it in a real run → watch a gate refuse a change that violates it.* That 30-second loop is the pitch — "knowledge your agents actually follow," which README/Notion/Obsidian can't show.
- **The Canon close (later, separate audience):** "prove who approved this rule and that the agents followed it" → RBAC + provenance + audit export answers it. Sell **proof**, never "more agents," never "Knowledge but better."
- **Dogfood is internal proof for the Canon sale — keep it out of the OSS page** (§1.3).

---

## 5. Hand-offs (co-investigation)

- **→ /arch (Jorge):** the connect-Canon affordance must ride the **same adapter seam** the memory overlay proves (`hub/lib/overlay.js`) — health-checked, graceful fallback to local, **no Canon UI until the MCP surface is confirmed** (architecture.md R7). Edit/remove must re-index locally and (when connected) respect the governed write-back contract, not bypass it. One source of truth for the egress flag — no second disclosure path.
- **→ /secops (Soren):** all per-entry privacy/grounding/egress copy (§4.1) is load-bearing and must remain *provably* true (ADT-236 re-open triggers). Connect-codebase must be *provably read-only, local, no egress*. Connect-Canon egress must disclose residency exactly when a send happens.
- **→ /ui (Aura):** the page's trust comes from **per-entry provenance + grounding state surfaced before the note text** (§2.2) — that's the IA, not decoration. Design the **empty / quiet / single-entry** states first (the common case for a fresh project); Canon is a *discovered* affordance, never a banner. Density of meaningful signal (grounding, provenance, scope, index health) over a flat notes list.
- **→ /po (Max):** ratify (a) **local is the default and complete product for one operator; Canon is discovered, never marketed in the OSS page** (§1.2); (b) **connect-codebase ships now, connect-Canon is forward** (gated on the adapter); (c) the activation metric = **recall-in-real-runs**, not doc count (§1.4). Decide the open-core line: free = local Knowledge + connect-codebase; paid/governed = Canon (RBAC, provenance/audit, named approval, cited answers).

---

## 6. The three answers (for the report)

1. **The honest one-line on the DART-Knowledge ↔ Canon relationship:** *DART's local Knowledge is the free, on-your-machine memory your agents read and obey; Canon is the governed, multi-person upgrade you connect when "my notes" must become "our record an auditor trusts" — same Knowledge surface, a stronger backend, never a separate app and never an upsell inside the free tool.*
2. **The Knowledge feature's sharpest wedge:** *it's the only notes your coding agents actually read and are gated by — operating instructions your agents obey, curated by you, local, and wired into a workflow that can refuse to proceed. README/Notion/Obsidian are knowledge for humans; this is knowledge for agents.*
3. **The single thing that makes the page feel trustworthy vs a notes dump:** *per-entry provenance + grounding honesty surfaced before the note text — where it came from, whether the agent can actually recall it by meaning or only by filename, and (if connected) whether using it left the machine. A dump shows the words; a knowledge surface shows the system's honest relationship to the words — and DART already practices exactly that honesty (ADT-236).*

---

## Sources (internal grounding)

- `docs/product-vision/conditional-workflow/usability-home-tasks-knowledge-apex.md` — locked Knowledge mental model, microcopy, scope/tags/`/kai` forward framing.
- `docs/product-vision/architecture.md §7` — BASE = `claude/memory`; **KGB/Canon = optional governance overlay, not a hard dependency**; MCP surface to be confirmed (R7).
- `docs/product-vision/DECISIONS.md` — Canon = commercial branch of KGB (Spring/Java + Angular); local repos; keys env-only.
- `docs/product-vision/VISION.md` — L4 (BASE reuse), D-D (KGB/Canon now-or-later), H5 (optional governance overlay).
- `docs/sprints/sprint-08-knowledge-qa/approvals/legal-privacy-copy.md` — **ADT-236** honesty clearance (egress disclosure by real flag + residency tier; "Common"=own-projects; filename≠semantic; /kai propose≠apply; re-open triggers).
- Live build — `studio/cockpit/src/app/shell/base-panel.component.ts`, `propose-inbox.component.ts`, `knowledge-qa.component.ts`; `hub/lib/overlay.js` (mem0=cloud / OpenMemory=local-service adapter seam).

*Strategy / positioning / usability only. Invents no metrics. Every claim points at a live behaviour, a ratified string, or is clearly marked forward (Canon affordance) that ships only with its adapter. Load-bearing honesty: DART's local Knowledge is the complete free product for one operator; Canon is a governed upgrade discovered at the connect surface, never an upsell — and nothing leaves the machine that the ADT-236-cleared, `/secops`-approved disclosure doesn't already permit. Visual/interaction is Aura's; this is the positioning, the wedge, and the words underneath them.*
