# The Knowledge Page in DART — product proposal (open-source-simple, Canon-dogfood)

> Product lens by **Max** (`/po`). Status: proposal draft. **No code.**
> Companion lenses (same five-agent investigation): `/arch`, `/ui`, `/secops`, `/ba` (their files alongside this one).
> Grounding (load-bearing, verified in-repo — do not re-litigate):
> - **Knowledge already exists** as a *side panel* (`base-panel.component.ts`): a scope toggle (project / common / all), a `/kai` **propose-inbox** (human-approved), an honest-grounding **Q&A** (`knowledge-qa.js`, read-only, egress only when an overlay is enabled+healthy), an **add-note** form, and a scope/tag/front-matter model (`hub/lib/knowledge.js`). The store today is **local markdown notes with front-matter** in per-project + common vaults.
> - **"Manage knowledge" is an inert "coming soon" stub** today (disabled, `aria-disabled`). Edit and remove do **not** exist yet. Add exists.
> - **Workflow and Tasks already have full dedicated pages/boards** in the shell; Knowledge is the only one of the three core surfaces still trapped as a summary panel. The ask is to give it parity.
> - **Connect-a-codebase does NOT exist.** This is the one genuinely new capability.
> - **Canon** is the commercial governed-KB product (Spring + Postgres + Qdrant + MCP, RBAC, cost receipts, provenance/audit, named-senior approval). It is the *enterprise overlay*, wired as an optional egress overlay — `knowledge-qa.js` already has the overlay tier and discloses egress. DART local stays simple + local-first.
> - **Open-core is already decided** (`strategy.md`): free = framework + single local project; paid = the governed/multi/audited surfaces. This document does not re-open that; it defines *what the Knowledge page builds* to make the free tier real and the Canon overlay credible.

---

## 1. The product — honestly, in one paragraph

**The Knowledge page is where the human and the agents share the project's durable knowledge — its decisions, patterns, conventions, and rules — so the agents act consistently with how this project actually wants to work, and where the human stays in control of that knowledge by curating it (add / edit / remove) and by grounding it in the real codebase.** It is not a wiki and not a chat memory; it is the **governing context the agents must read before they act**, kept honest by a human owner. Today the agents already *read* it (the scoped digest / recall path) and `/kai` already *proposes* into it (human approves); what is missing is a first-class surface for the human to **own** that knowledge — full CRUD — and a way to **anchor** it to the codebase so a convention can point at the code it governs. DART using its own Knowledge page to run DART is the dogfood that proves the local tier; pointing that same page at Canon is the dogfood that proves the governed overlay.

**Skeptical verdict — is a dedicated page justified, or is the panel enough?** The panel is enough for *reading* and *one-shot adding*. It is **not** enough for *curation*: you cannot edit a note that drifted, you cannot remove a rule that's now wrong, and you cannot see the knowledge **against the code it's supposed to govern**. Those are the jobs a knowledge *owner* does, and an owner needs room — a page, not a 320px rail. So: **yes to the page, but earn it.** The page is justified by exactly two jobs the panel structurally cannot do — *curate* (edit/remove) and *ground in code* (connect-a-codebase). If we ship a page that is just the panel made wider, we wasted the slot. The page must add curation and code-grounding or it's gold-plating.

---

## 2. The JOB of the Knowledge page — ranked

The page serves one human (the **knowledge owner / operator**) and many agents (the **readers**). The jobs, ranked by what makes the page worth its own route:

1. **Curate the project's durable knowledge — add / edit / remove.** *(THE #1 job — it's the reason the page exists.)* The human owns what the agents will obey. Adding exists; **editing** (a convention changed; fix the note) and **removing** (a rule is now wrong; delete it, don't let agents keep obeying it) are the new, load-bearing capabilities. Without edit/remove the knowledge rots and agents drift on stale rules — the exact failure DART exists to prevent. A page gives curation the room a panel can't.
2. **Ground the knowledge in the actual codebase — connect a codebase.** Point the project at its real source so a note can reference the code it governs, and so the agents' answers can be checked against what the code actually does — not just what a note claims. Open-source = **local, simple**: index filenames + keywords over the connected tree (the same honest, no-embedder grounding the Q&A already labels). This turns abstract rules into anchored, checkable knowledge and is the single highest-leverage new capability.
3. **Let agents READ the knowledge consistently (the digest / recall / MCP path).** Already real and must stay real: agents read the scoped projection every turn; the page must never break that contract. The page is the human's *write* surface over the same store the agents *read* — one source of truth, two audiences.
4. **Govern what enters — the `/kai` propose-inbox (human-approved).** Model-authored knowledge lands in an inbox; nothing is applied without an explicit human approve into a chosen vault. This is DART's "rules with teeth" promise at the knowledge layer; the page hosts it with more room than the panel.
5. **Check interpretation — the honest-grounding Q&A.** "Does DART actually understand my note on X?" — read-only, scoped exactly as the page, egress only when an overlay is enabled+healthy. It proves the knowledge is *usable*, not just *stored*. Keep it; it's the trust check.

> **The #1 job, explicit:** *a place where the human curates (add / edit / remove) the project's durable, governing knowledge — and grounds it in the real codebase — so the agents read one honest, owner-controlled source and act consistently with how this project actually works.*

**What the page is NOT (anti-scope):** not a general wiki / docs site, not a notes app, not a chat-history store, not a semantic search engine in the free tier (honest keyword/filename grounding only — semantic is Canon's job), not a place that auto-trusts model output (everything `/kai` proposes is human-gated).

---

## 3. Open-source-simple vs Canon-enterprise — the split

Same page, same jobs, two tiers behind it. The **free local tier** is fully useful standalone; **Canon** is an optional overlay that upgrades the *same surface* — never a different product, never a required dependency.

| Capability | Open-source DART (local, free) | Canon (governed overlay, paid) |
|---|---|---|
| **Store** | Local markdown notes with front-matter (today) + optional local SQLite index for the codebase. Your files, your repo, git-native, exportable. | Governed server store (Postgres + Qdrant), shared across a team. |
| **CRUD** | Add / edit / remove, owner-curated, no approval ceremony beyond the `/kai` inbox. | Same CRUD **+ RBAC** (who may edit what) and **named-senior approval** for governed knowledge. |
| **Codebase grounding** | Connect a **local** codebase; **honest filename/keyword index** (no embedder). Labeled as such, never oversold. | **Semantic** retrieval over the codebase + knowledge (embeddings, Qdrant), **cited** answers. |
| **Q&A grounding** | Local lexical match with an honest grounding label; egress only if an overlay is on. | Semantic, **cited**, with **provenance** (which note/commit grounded the answer). |
| **Provenance / audit** | Git history of the notes + the `/kai` inbox decisions (local, honest, not a formal audit log). | **Full provenance + audit trail**: who added/edited/approved, when, citation chains. |
| **Cost** | Free, zero egress by default. | **Cost receipts** per retrieval/embedding; the commercial governance value. |
| **Identity** | Single operator on this machine; "common" = shared across *your own* projects, not a cloud. | Team identities, RBAC, SSO. |

**The split in one line each:**
- **Open-source DART local Knowledge** = *CRUD a local markdown/SQLite knowledge base, connect a local codebase with an honest filename/keyword index, govern entry via the `/kai` inbox, and check interpretation with read-only lexical Q&A — all local, free, zero-egress by default.*
- **Canon enterprise overlay** = *the same page, governed — a shared server store with RBAC + named-senior approval, semantic + cited retrieval over code and knowledge, full provenance/audit, and cost receipts.*

**How they relate (the product story):** the Knowledge page is **one surface with a tier switch.** DART local is the **simple tier** that ships free and works alone; **connecting Canon** is the **governed tier** that lights up the same page with semantics, citations, RBAC, and audit. Canon attaches exactly where the Q&A overlay already attaches (a disclosed egress overlay) — so the page stays local-first and only reaches out when a team explicitly enables the governed tier. **You never migrate off DART to get Canon; you point DART at it.** That is the wedge made concrete: local-first, tool-neutral governance you can prove — with a paid overlay for teams that need the governed, audited version of the *same* knowledge.

---

## 4. The dogfood-for-Canon strategy

DART must use its own Knowledge page to run its own development — and that dogfood has to be credible **on both tiers**:

- **The local tier proves itself** when the DART team genuinely curates DART's conventions, patterns, and rules on the local page (add/edit/remove), connects the DART repo as the codebase, and the agents demonstrably read that knowledge and act on it. If the DART team won't curate on it, no one will — so the page must be good enough that *we* prefer it to a scratch markdown file. That's the bar: **the local page is credible only if it's the team's actual knowledge home, not a demo.**
- **The governed tier proves itself** when we point the *same* page at Canon and the upgrade is real and obvious: the lexical answer becomes a **cited semantic** answer, edits gain **RBAC + approval**, and we get **provenance + cost receipts** — with the egress disclosed exactly as the overlay contract requires. The dogfood test for Canon is: *"with Canon connected, can a senior prove an agent obeyed an approved, cited rule — and see what it cost?"* If yes, Canon's value is demonstrated by DART itself.

**What the page must do to be a credible dogfood AND a credible open-source feature standalone:**
1. **Be the real knowledge home** — full CRUD, no inert stubs. A page that can't edit/remove is not a home.
2. **Connect the codebase honestly** — index the local tree, label the grounding truthfully (filename/keyword, no embedder), never fake semantics.
3. **Keep the agent-read contract intact** — the same store the agents read every turn; the page is the human's write surface over it.
4. **Disclose the tier** — when Canon is attached, the page says so and discloses egress; when it isn't, it's honestly local. The dogfood *is* the disclosure working.
5. **Stand alone** — a solo OSS user with no Canon gets a complete, useful, local-first knowledge page. Canon is an upgrade, never a gate.

---

## 5. MVP — decisive (must / should / could / won't)

Anchored to DART's local/file-based reality and to what already exists (the scope/tag model, the `/kai` inbox, the read-only Q&A, the add-note form). The MVP **promotes Knowledge to a dedicated page and adds the two jobs the panel can't do** — curation (edit/remove) and code-grounding.

**MUST — the dedicated page is not real without these:**
- **A dedicated Knowledge page**, a peer of the Workflow and Tasks boards in the shell rail (not a side panel) — full-width room for curation.
- **Full CRUD: add, edit, remove** a note. Edit and remove are the new capabilities; add already exists and moves onto the page. Removing a note removes it from what agents read.
- **The simple local store** — keep local markdown + front-matter (today's vaults); add a **local index** (filenames/keywords, optionally SQLite-backed) for the connected codebase. No server, no embedder, no egress by default.
- **Connect a local codebase** — point the project at a source tree; build the honest filename/keyword index over it; surface it on the page so a note can reference code and the Q&A can ground in it.
- **The existing `/kai` propose-inbox** — model-authored knowledge, human-approved into a chosen vault, hosted on the page.
- **The existing honest-grounding Q&A** — read-only interpretation check, scoped exactly as the page, with the grounding label rendered verbatim and egress disclosed only when an overlay is on.

**SHOULD — credibility multipliers, fast-follow:**
- **The Canon overlay connection (disclosed)** — a tier switch that attaches Canon as the governed overlay: when connected, the page shows cited/semantic answers and discloses egress; when not, it's honestly local. This is the dogfood-for-Canon proof; it's a *should* only because the local tier must stand alone first.
- **A note ↔ code anchor** — let an edited note reference a path/symbol in the connected codebase, so a convention points at the code it governs (still local, still keyword-honest).

**COULD — only if pulled by evidence (resist):**
- **Richer codebase indexing / local semantic** — deeper parsing, symbol awareness, or a local embedding tier. Tempting, but it blurs the free/Canon line (semantic is Canon's value) — build only if OSS users genuinely demand it and it doesn't cannibalize the overlay.
- Knowledge versioning UI beyond git history; bulk import; multi-codebase per project.

**WON'T — explicit anti-scope (protects the product):** RBAC, named-senior approval, semantic/cited retrieval, provenance/audit logs, cost receipts, shared server store, SSO — **these are Canon.** A general wiki / docs site. Auto-applying model output without the `/kai` human gate. Cloud egress on by default.

---

## 6. Behavioural acceptance outcomes (WHAT, not HOW)

Add / edit / remove:
- When the operator opens the Knowledge page for a project, they see that project's durable knowledge — its own notes unioned with the approved common notes that match its stack — with each note's scope, kind, and tags.
- When the operator adds a note with a scope and content, the note appears in the project's knowledge and is included in what the agents read.
- When the operator edits an existing note's content and saves, the updated content replaces the old, and the agents subsequently read the updated content (the old content is no longer surfaced).
- When the operator removes a note, the note disappears from the page and is no longer included in what the agents read.
- When the operator attempts to edit or remove a note they cannot see in this project's scope, the system does not act on it (no cross-project write).

Connect a codebase (local, honest):
- When the operator connects a local codebase to the project, the page indexes it and shows that a codebase is connected and how it was indexed (filename/keyword, no embedder) — stated honestly, never as semantic.
- When the operator asks the read-only Q&A a question after connecting a codebase, answers may be grounded in the connected code, and the grounding label reflects the honest method used; asking writes nothing and triggers no egress unless an overlay is enabled and healthy.
- When no codebase is connected, the page invites connecting one rather than showing a bare empty state, and the Q&A still works over the notes alone.

Govern entry (`/kai` inbox) — unchanged contract, on the page:
- When `/kai` proposes knowledge, it appears in a propose-inbox on the page awaiting an explicit human approve into a chosen vault; nothing is applied automatically; the inbox is absent (not a zero state) when nothing is pending.

Tier honesty (Canon overlay, when present):
- When no overlay is configured, the page is honestly local: no egress indicator, local grounding labels only, no absolute privacy assurance beyond the honest local label.
- When a Canon (or other) overlay is configured, enabled, and healthy, the page discloses that an external service is in use and names the residency tier; answers may then be cited/semantic and are labeled as the overlay's. The disclosure is driven solely by whether the overlay was actually used.

Safety / trust (cross-cutting):
- Note content, tags, codebase filenames, and any overlay answer are treated as untrusted and rendered as inert text — a hostile note or codebase filename cannot execute or command an agent.
- Knowledge that `/kai` or an agent proposes is never obeyed as an instruction; it is data the human approves before it governs anything.

---

## 7. Open questions for the team
1. **Local index store** — keep the codebase index as plain files, or introduce **SQLite** for it? (`/arch` — the ask explicitly allows files *or* sqlite; pick the simpler that scales to a real repo's filenames.)
2. **Edit/remove of `/kai`-proposed vs operator-authored notes** — same CRUD for both once approved, or does proposed-knowledge carry a lighter provenance marker even in the free tier? (`/secops` + `/arch`.)
3. **Connect-a-codebase scope** — index the whole connected tree, or honor `.gitignore` / a scoping config to avoid indexing junk? (`/arch`.)
4. **Where Canon attaches** — confirm it reuses the existing Q&A egress-overlay seam (one overlay contract) rather than a second egress path. (`/secops`.)
5. **"Common" vault on the page** — does editing a common note (shared across the operator's own projects) need any extra confirmation, since it affects multiple projects? (`/ui` + `/secops`.)
