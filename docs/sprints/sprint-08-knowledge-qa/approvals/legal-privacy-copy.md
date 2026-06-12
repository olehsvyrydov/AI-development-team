# LEGAL — Privacy-Copy Review (condition C-242 / E-5 truthful-disclosure)

**Reviewer:** Alex (Legal Counsel) · **Command:** `/legal` (`/alex`)
**Jurisdiction:** England & Wales — UK GDPR (retained EU 2016/679), Data Protection Act 2018, Data (Use and Access) Act 2025; Consumer Protection from Unfair Trading Regulations 2008 (CPUTRs) / Digital Markets, Competition and Consumers Act 2024 (DMCCA) for the no-misleading-claim dimension.
**Tickets:** ADT-234, ADT-235, ADT-236
**Conditions cleared:** sprint-06 **C-242** ("Common" = the operator's own projects on this machine, never a cloud/account) + sprint-08 **E-5 / §5 honesty note** (truthful egress disclosure; no strengthened absolute once an overlay is enabled).
**Scope of review:** user-facing copy ONLY (honesty strings, scope framing, grounding labels, egress disclosure). This is a REVIEW — no code was edited.

---

## Verdict: **PASS — NO CHANGES REQUIRED**

All four assessed criteria are satisfied in the shipped copy. The privacy/honesty wording is truthful "by construction" — the egress disclosure is driven by the same enabled+healthy signal that gates the send, and no absolute privacy claim is present that the optional overlay could falsify. C-242 and the E-5/§5 honesty obligation are **cleared**; the honesty copy may ship.

> **AI disclaimer:** I am an expert AI legal agent, not a substitute for an insured human solicitor. This sign-off covers the truthfulness/misleading-claim dimension of user-facing copy under UK GDPR and UK consumer-protection law; it is guidance, not formal legal advice.

---

## Per-item findings

### Item 1 — "Common" scope must NOT read as cloud/shared-publicly — **PASS**

C-242 requires that any "Common"/"Shared" copy be scoped to the operator's own projects on this machine, never a cloud or shared account.

Evidence in the shipped copy:
- `studio/cockpit/src/app/shell/base-panel.component.ts:20-21` — the JSDoc states the scope toggle's Common "is framed honestly as shared across the operator's own projects on this machine, never a cloud."
- `:58` — `Local-first — nothing is uploaded. Indexed on this machine.` (honesty line on the Knowledge panel).
- `:392` — empty-state for Common: `No common knowledge yet — add a shared note, or promote a project note.` The word "shared" is bounded by the local-first line and the panel framing; it reads as *re-used across the operator's own projects*, not *shared with other people / a team / the public*.
- `:400` — `Filename index only — connect an embedder for semantic recall` (see Item 4).

No string asserts "synced to the cloud", "shared with your team", or "shared publicly". **Compliant.** "Common" carries no representation that personal data leaves the device or is disclosed to third parties — so no CPUTRs/DMCCA misleading-action exposure on the scope framing.

### Item 2 — No absolute "100% private / never leaves / fully local" claim that the optional overlay would falsify; egress disclosure truthful + present exactly when egress happens — **PASS**

This is the highest-risk item: a strengthened absolute privacy claim becomes a **false/misleading representation** the moment the optional mem0/OpenMemory overlay is enabled and the question + in-scope context egress to the configured service. Under UK GDPR that also undermines the transparency/fair-processing principle (Art. 5(1)(a), Arts. 13–14); under CPUTRs 2008 reg. 5 / DMCCA an absolute "never leaves" claim that is in fact false is a misleading action.

Evidence the copy is truthful by construction:
- **No absolute privacy claim ships.** A source scan for `100% private | fully local | never leaves | nothing (ever) leaves | completely private` across all six implementation files returns only ONE hit — `knowledge-qa.component.ts:19`, a code comment stating the panel **prints no** such assurance ("The panel prints no absolute '100% private' assurance"). That is the control, not a violation.
- **Disclosure is gated by the real egress signal, not a static string.** `studio/cockpit/src/app/shell/knowledge-qa.component.ts:17-20, 73-77` — the egress indicator renders **solely** from the answer's `egressDisclosed` flag; absent for a purely-local answer, present (and naming the residency tier) only when an external overlay actually answered.
- **Backend is the single source of truth for the flag.** `hub/lib/knowledge-qa.js:176` sets `egressDisclosed: true` only inside the overlay-answered branch (`:158-178`); the local lexical tier (`:183-193`) and the absence tier (`:198-206`) both set `egressDisclosed: false`. So the disclosure is present **iff** a send happened — exactly the E-5/N-309 requirement.
- **The disclosed label names the residency tier truthfully.** `hub/lib/overlay.js:32-34` declares `openmemory → residency: 'local-service'` and `mem0 → residency: 'cloud'`; the label text (`knowledge-qa.component.ts:158-160`; CLI `knowledge-qa.js:225-228`) appends that residency, so the operator is told whether the destination is their own-network service or a cloud service. This is material to a UK GDPR transfer assessment (cloud egress may be an international transfer under Chapter V).
- **CLI parity.** `hub/lib/knowledge-qa.js:223-228` prints the grounding label verbatim and the `Egress:` line **only** when `result.egressDisclosed` is true — no second egress path, no disclosure the backend did not make. The `/dart-ask` command copy (`claude/commands/dart-ask.md:36-52`) restates this faithfully ("surface the egress disclosure truthfully … must not add a second egress path or a second disclosure").
- **README env copy is honest and secret-safe.** `.claude-plugin/README.md:73-114` documents overlay/model env vars as **names-only passthroughs** read from the host environment, never persisted — consistent with the env-only-credential control and making no privacy over-claim.

**Compliant.** The product never makes a privacy promise it cannot keep; when (and only when) data egresses, the operator is told, including the residency tier. This satisfies UK GDPR transparency and avoids a CPUTRs/DMCCA misleading-action claim.

### Item 3 — "/kai proposals not saved until you approve" must match actual behavior — **PASS**

The copy states proposals are not persisted to recallable knowledge until an explicit human approval. A misleading "nothing is saved" line would be a false representation; here it matches the implementation.

Evidence:
- Copy: `studio/cockpit/src/app/shell/propose-inbox.component.ts:58` — `/kai surfaced these recurring notes for review. Nothing is saved until you approve — and you choose where it goes.`; JSDoc `:31` — "becomes recallable knowledge only when the operator approves it into a chosen vault."
- Behavior: `hub/lib/state.js:398-421` — the `/kai` inbox surfaces **pending** proposals only; they are "inert BY LOCATION (a separate" store), counted separately (`counts.proposals`) and never merged into `docs[]`. The SECOPS gate independently proved this (C-220 inert-by-location, C-221 no path from pending→recall without explicit approve; ADT-235 `CODE_REVIEWED` note, negatives N-220/N-221).

The line is **accurate**: "saved" here means "written to a vault and made recallable", which provably occurs only on approve. **Compliant.**

### Item 4 — Honest grounding: no claim of semantic "understanding" when only a filename/keyword match happened — **PASS**

Claiming the product "understood" a note when it merely matched a filename/keyword would be a misleading capability representation (CPUTRs reg. 5; relevant to AI-transparency expectations).

Evidence:
- `hub/lib/knowledge-qa.js:116` — lexical-tier answer: `…No embedder is configured, so this is not a semantic understanding check.`
- `:191` — filename-only grounding label: `Filename/keyword match only — no embedder configured, so this is not a semantic understanding check.`
- `:188-190` — the grounding `method`/`source` are `filename-only`, `external:false` — the label is not over-claimed.
- UI shows the backend label as-is: `studio/cockpit/src/app/shell/knowledge-qa.component.ts:14-16, 77` ("shows that label as-is. It never" overclaims).
- Command copy mirrors it: `claude/commands/dart-ask.md:33-34` — "say so plainly — it is a filename match, **not** a semantic understanding check."
- Base panel: `studio/cockpit/src/app/shell/base-panel.component.ts:400` — `Filename index only — connect an embedder for semantic recall.`

**Compliant.** The grounding label is honest at every tier (filename-only, overlay-answered, absence) and is never elevated to "understanding" without an embedder.

---

## Risk assessment & penalties (context, not triggered here)

Had an absolute privacy claim shipped that the overlay falsified, exposure would include:
- **UK GDPR** transparency/fairness breach (Art. 5(1)(a), Arts. 13–14) — ICO enforcement; maximum administrative fine up to **£17.5m or 4% of global annual turnover**, whichever is higher.
- **CPUTRs 2008 / DMCCA 2024** misleading-action — for a single-user free OSS tool the realistic consumer-law exposure is low, but the reputational/trust cost of a false "never leaves your machine" claim is high.
- For **cloud**-tier overlays (mem0), egress may constitute an **international data transfer** (UK GDPR Chapter V) — the residency-tier label is what lets the operator make that assessment, so retaining it is load-bearing, not cosmetic.

None of these are triggered: the copy avoids the absolute claim and discloses egress (with tier) exactly when it occurs.

---

## Conditions for this sign-off to remain valid (re-open triggers)

This clearance is bound to the current copy. The C-242 / E-5 gate **re-opens** and must be re-reviewed if any future change:
1. Adds or strengthens an absolute privacy assurance ("100% private", "never leaves", "fully local", "nothing is uploaded" stated unconditionally) anywhere a configured overlay could falsify it.
2. Decouples the egress disclosure from the `egressDisclosed` flag / the enabled+healthy signal, or suppresses the residency-tier name.
3. Reframes "Common" toward any cloud/account/team-sharing meaning.
4. Elevates a filename/keyword match to a "semantic"/"understanding" claim without an embedder actually running.
5. Adds a new egress destination or a residency tier not named in the disclosure.

---

## Sign-off

**C-242 (sprint-06) + E-5 / §5 honesty note (sprint-08): CLEARED.** No copy edits required. The honesty/privacy copy for the Knowledge panel, the `/kai` propose inbox, and the interpretation-check Q&A (incl. the optional mem0/OpenMemory egress disclosure) is truthful, non-misleading, and UK GDPR-aligned. The honesty copy may ship.

*— Alex (Legal Counsel), `/legal`*
