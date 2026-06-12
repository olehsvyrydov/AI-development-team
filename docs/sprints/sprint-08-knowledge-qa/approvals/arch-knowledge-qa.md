# ARCH approval — Knowledge interpretation-check Q&A + optional mem0/OpenMemory overlay

**Gate:** `ARCH_APPROVED` (hard) · **Owner:** `/arch` (Jorge) · **Decision:** **APPROVED** for **ADT-236**
**Date:** 2026-06-12 · **Sprint:** sprint-08-knowledge-qa · **Preset:** solo · **Track:** full
**Trigger basis:** `cross_boundary` + `public_api` (a new read route) + the **only egress surface in the
chunk** (an external endpoint). The egress posture is gated HARD by `/secops` against §6 below before code
is considered done — this ADR draws the boundaries; `/be`/`/fe` decide HOW within them under TDD.

This decision ratifies the deferred follow-on (D-012) under the binding strategy **D-009**: the local
markdown vault is the default; heavy lifting is delegated to **existing OSS local tools as OPTIONAL
overlays connected by URL** — never required. The Q&A is a **read over what already exists**; the overlay
is a **thin client** over an existing self-hosted memory service. **No memory engine is built here.**

---

## 1. Context & constraints — what already exists (REUSE, do not reinvent)

The semantic substrate and the scoped knowledge model are **already built and tested**. This slice is
**additive wiring**, not new machinery. Verified in source:

| Existing fact (file) | What it gives this slice |
|---|---|
| `hub/lib/state.js` `buildKnowledge(project)` | The **local-first scoped projection** already in place: merges this project's vault + the matching `approved-common` notes (via `scopeMatches`), returns `docs[]` with `scope/stack/kind/status`, per-scope `counts`, and the **honest `method`** (`filename-only` unless an embedder is configured) — exactly what the Q&A must read. The Q&A endpoint **wraps this**, it does not re-scan. |
| `hub/lib/knowledge.js` `parseFrontMatter` / `scopeMatches` | The single-source-of-truth visibility predicate + bounded never-throwing front-matter reader (ADT-234, S-6/C-208). The Q&A scopes its answer through the **same** predicate — a question can only surface what the project may already see. |
| `hub/lib/state.js` `embedderConfigured(project)` | Reads **only** the `memory.embeddings` selector (never a secret; `state.js`) to decide `filename-only` vs `local-embeddings`. This is the **grounding-label source** for the local answer. |
| `claude/memory/src/hooks/restore-context.ts` (`selectGlobalRules`, recall) + `stores/*` (sqlite-vec / Qdrant) + `embeddings/*` (voyage \| gemini \| none) + `lib/knowledge-match.ts` (`scopeMatches`) | The **proven semantic-recall path**: embed a query, query the store, filter by `project_id`+`scope`+`stack` (AND-equality, `any` wildcard), return scored points. The Q&A's semantic branch **reuses this recall**; it does not embed or query directly in a new way. |
| `claude/memory/src/lib/config.ts` `loadMemoryConfig()` (`~/.aidevteam/config.json`) | The **selection-only** config contract: "carries the *choice* of backend/embeddings only — never secrets. API keys are always read from the environment." The overlay URL/choice persists **here**; the credential is **env-only**. This is the exact pattern the overlay adapter follows. |
| `claude/workflow/adapters/README.md` + `adapters/mcp/{mem0,openmemory}.json` | The **adapter contract already defined**: every adapter declares **capabilities / health-check / fallback / data-residency**, and "agents always degrade gracefully to the file-based default when an adapter is absent." Manifests for **mem0** (`cloud`, `MEM0_API_KEY`) and **OpenMemory** (`local-service`, `OPENMEMORY_BASE_URL`) already exist. The overlay adapter **implements this contract**; it adds no new seam. |
| `hub/lib/api.js` `handle(route, data, project)` + `hub/lib/guard.js` `writeAllowed` | The control-plane dispatch. Mutations run the loopback + `X-AIDT` + Host/Origin guard. The Q&A is a **read** route (no mutation) but still rides the same loopback/Host/Origin posture (§2). |

**Quality attributes that dominate this design (ATAM):**
- **No-egress / local-first (H, H)** — the headline promise. With **no overlay configured, nothing leaves
  the machine** and the Q&A still answers from the local store. This is the sensitivity point the whole
  design pivots on, and the negative `/secops` must prove.
- **Honesty / non-fabrication (H, M)** — the Q&A must label its grounding truthfully (filename-only vs
  semantic score vs overlay-answered) and **never fabricate** an interpretation. A wrong confidence label
  is as harmful as a wrong answer.
- **Security / egress containment (H, H)** — the overlay URL comes **only** from the user's config (never
  from a note's content); the credential is **env-only**; egress is **disclosed** and only to the
  configured URL when the overlay is enabled+healthy.
- **Availability / never-throws (H, L)** — the Q&A is read-only and degrades on every failure (no
  embedder, no overlay, unhealthy overlay, malformed note) to a usable local answer; it never crashes the
  hub. Inherited from the `state.js` never-throw contract.

---

## 2. Decision A — the interpretation-check Q&A capability (local-first, read-only)

### What the user asks, what DART answers

The user asks an interpretation-check question — *"did it understand my note about X?"* / *"what does DART
have on X?"*. DART answers with **what it actually holds for that topic, scoped to the project (+ matching
common), with an honest grounding label** — never a fabricated paraphrase of intent.

The answer is assembled from a tiered recall (best available tier wins; all degrade locally):

```
answer(question, project):
  scope = the project's visible set  (buildKnowledge: own project vault ∪ approved-common matching stack)
  tiers, best-available first:
    T3  overlay  — IF an overlay is configured AND healthy (Decision B):
                   send {question + minimal local context} to the configured URL; the overlay returns how
                   it understood the topic + matches. grounding = "overlay: <name> (external)", egress-disclosed.
    T2  semantic — ELSE IF embedderConfigured(project):  reuse the memory recall path
                   (embed the question, query the store, filter by project_id+scope+stack via scopeMatches),
                   return the top matching notes + scores. grounding = "semantic match, score N".
    T1  lexical  — ELSE: filename/keyword match over the buildKnowledge docs[] (title/slug/tag contains),
                   return the matching notes. grounding = "filename-only, no embedder".
    T0  empty    — no match in any tier: "I have no note on that topic in this scope" (honest absence).
```

**The answer is always grounded in `buildKnowledge`'s scope** — the Q&A can surface only what the project
is already allowed to see (its own vault + matching `approved-common`). It cannot reach another project's
notes, pending proposals (inert by location), or a stack-mismatched common note. The scope boundary is
**inherited**, not re-implemented (`scopeMatches` is the single source of truth, ADT-234 §6).

### The honest grounding/confidence label (non-fabrication)

Every answer carries a **grounding** descriptor the UI shows verbatim. It states **which tier answered**
and the evidence quality — never an unqualified "yes it understood":

| Tier | `grounding.method` | `grounding.source` | What the label says |
|---|---|---|---|
| T3 overlay | `overlay` | the configured overlay name + **`external: true`** | "Answered by your connected memory service `<name>` (external)." |
| T2 semantic | `semantic` | `local-embeddings` (+ the embedder, e.g. `voyage`) | "Semantic match in your local index, score `N`." |
| T1 lexical | `filename-only` | `filename-only` | "Filename/keyword match only — no embedder configured, so this is **not** a semantic understanding check." |
| T0 empty | `none` | the active tier | "No note found on this topic in this project's scope." |

The label is **derived from `embedderConfigured` and the overlay health**, the same honest signals
`buildKnowledge` already uses — so the Q&A can never claim "semantic understanding" when only filenames
were matched, and never claim a local answer when the overlay produced it. **The Q&A presents the
overlay's answer as the overlay's, never as DART's own (AC-2).**

### Where it lives — a hub control-plane READ route

A new **read-only** control-plane route on the hub (the natural home: `buildKnowledge` and the recall path
already live behind the hub; the cockpit Knowledge panel already calls hub routes):

- **Route:** `knowledge/ask` (read; `GET`-style semantics with a query param, or a body-carrying read —
  the HTTP layer decides; **it is not a mutation**). Input: `{ project, question }`. Output:
  `{ answer, matches: [{ name, scope, stack, score? }…], grounding: { method, source, external }, egressDisclosed }`.
- **Read-only / never-mutates (AC: read-only posture):** the route calls `buildKnowledge` + the recall/
  overlay read path and **writes nothing** — no vault file, no proposal, no ledger change, no embedding
  job triggered. A question can never cause a write. (`/secops` proves this: a question leaves both vaults
  byte-identical.)
- **Never-throws:** every failure tier (no embedder, recall error, overlay timeout/error, malformed note)
  is caught and degrades to the next-lower tier; the route always returns a usable answer or an honest
  "no match", never a 500 / stack trace. Inherits the `state.js` never-throw contract.
- **Request posture:** rides the hub's existing loopback + Host/Origin guard. As a read it does not require
  `X-AIDT` (that is the write-mutation guard), but it is still bound to the loopback socket like the rest
  of the hub board — no permissive CORS, no remote read without the existing remote flag.

**No new projection or scan is introduced** — the Q&A is a thin read wrapper over `buildKnowledge` +
the existing recall. This keeps the hub↔memory scope predicate single-source (no drift, ADT-234 R-3).

---

## 3. Decision B — the thin mem0/OpenMemory overlay adapter

A **thin client**, not a memory engine. It implements the **existing adapter contract** (capabilities /
health-check / fallback / data-residency — `adapters/README.md`) for the **memory** category, connecting
to a **user-configured self-hosted endpoint by URL**.

### Configuration (selection-only; secret env-only)

- The overlay **choice + URL** persist in `~/.aidevteam/config.json` under the memory section, the **same
  selection-only file** `loadMemoryConfig()` already owns ("carries the *choice* … never secrets"). New
  keys (illustrative, `/be` finalizes): `memory.overlay = "openmemory" | "mem0" | null` and
  `memory.overlayUrl = "http://localhost:8765"`. **Default: `null` — OFF.**
- The **credential is ENV-ONLY** — read from the environment at call time (e.g. `MEM0_API_KEY` /
  `OPENMEMORY_API_KEY` per the existing manifests), **never written** to `config.json`, the manifest, the
  DB, or logs. A **missing credential degrades to "not connected"** (the overlay is treated as
  unconfigured/unhealthy) — never a loud failure echoing secret detail (AC-5).
- The **URL is taken ONLY from this user config** — never from a note's body, a front-matter value, an
  overlay response, or any observed/untrusted content. (This is a HARD `/secops` item — §6 E-2.)

### The adapter contract (capability / health / fallback / residency)

| Contract field | This overlay |
|---|---|
| **capabilities** | `semantic_recall` (query the topic → matching memories) and `interpretation_check` (the "how was this understood?" answer). Declared per service; a service that lacks a capability simply isn't used for that tier (fall through to local). |
| **health-check** | (1) `memory.overlay` set **and** `memory.overlayUrl` present in config; (2) the credential the service needs is present in env (if it needs one); (3) a **cheap, time-boxed liveness probe** to the configured URL succeeds within a short deadline (reuse the `withDeadline` pattern already in `claude/memory/src/hooks/common.ts`). Any miss → **unhealthy → skipped**. |
| **fallback** | **Always the local default** — when absent/unconfigured/unhealthy/timed-out, the overlay is **silently skipped** and the Q&A answers from T2 (semantic, if an embedder) or T1 (lexical). The team **never blocks** on the overlay; the local answer is degraded-but-functional. This is the README's stated rule of thumb. |
| **data-residency** | `local-service` for self-hosted OpenMemory (the user's own machine/network), `cloud` for hosted mem0. The residency tier is **shown in the disclosure** (§4) so the user knows whether the query stays on their network or leaves it. |

### Request / response contract (thin, stable, validated)

The adapter speaks the overlay's documented HTTP API over the configured base URL. The DART-side contract
the Q&A depends on (the adapter maps the service's native shape to this):

```jsonc
// Request (DART → overlay), only when enabled + healthy:
{ "query": "<the user's question>",
  "context": "<MINIMAL local context: the topic / the matching note titles in scope — NOT the whole vault>",
  "project": "<the project's id/scope key>" }     // scoping only; no secrets in the body

// Response (overlay → DART), treated as UNTRUSTED:
{ "answer": "<how the service understood the topic>",   // rendered ESCAPED, never executed
  "matches": [ { "title": "…", "score": 0.0 } … ] }     // escaped on render
```

- The **response is untrusted input** — rendered **escaped** (interpolation-only, the `no-unsafe-binding`
  rule already enforced for KB/proposal content), **never executed**, and **never written** into a vault
  by the Q&A (a question is read-only). A malicious overlay response cannot inject/execute or self-promote
  into recall. (HARD `/secops` — §6 E-7/E-8.)
- The adapter **validates and bounds** the response (size cap, shape check, never-throws) exactly like the
  bounded readers elsewhere; a malformed/oversize/hostile response → the overlay tier is **abandoned** and
  the local tier answers. The overlay can degrade the answer's tier but can never corrupt DART state.

### Why thin (D-009 honored)

The overlay is **integration, not implementation**: DART sends a question + minimal context to an existing
self-hosted mem0/OpenMemory and renders what comes back. DART builds **no** embedding pipeline, vector
store, or memory model for the overlay — those already exist in the service (and, for the local tier, in
`claude/memory`). This keeps the slice additive and the maintenance surface a thin client + its manifest.

---

## 4. Decision C — data-residency / egress model

**The only egress surface in the entire knowledge feature.** The model is *disclose-then-send, configured-
URL-only, off-by-default*:

| Property | Decision |
|---|---|
| **What leaves the machine** | **Only** when an overlay is enabled **and** healthy: the **question** + **minimal local context** (the topic and the in-scope matching note titles needed to ground the check) + the project scope key. **Not** the whole vault, **not** unrelated notes, **not** secrets, **not** another project's notes. The minimal context is bounded and is itself in-scope content (`scopeMatches`). |
| **Where it goes** | **Only** to the **user-configured `overlayUrl`** in `~/.aidevteam/config.json`. **Never** a URL derived from a note's content, a front-matter value, an overlay response, or any observed/untrusted data. |
| **When nothing leaves** | When **no overlay is configured** (`memory.overlay = null`, the default) **OR** the overlay is unhealthy/credential-missing: **zero network calls**, the Q&A answers **entirely locally** (T2/T1), and **all of ADT-234/235 is unaffected** (AC-3). `/secops` proves this negative: no overlay ⇒ no socket opened. |
| **Disclosure** | Egress is **disclosed before/at the point of send** — the Q&A surface and its answer **state, truthfully, that the question was sent to the configured external endpoint** (and its residency tier: your-network `local-service` vs `cloud`). The disclosure is **driven by the same health/enabled signal** that gates the send, so it cannot drift from reality (the label is truthful by construction). No silent egress, consistent with the "nothing is uploaded by default" honesty. |
| **Authoritative store** | The **local store stays authoritative**. The overlay is an additive recall/answer source; it never becomes the source of truth, never silently replaces the local vault, and its answer is always labelled as the overlay's. |

---

## 5. Decision D — UI (light, deferred per the user)

Per the user, the UI is intentionally minimal for this slice; full polish later (a `/ui` per-surface spec
fires under the soft `DESIGN_APPROVED` gate when scoped — see the ledger note for ADT-236).

- A **minimal Q&A input** in the Knowledge panel: a single question field + an answer area showing the
  answer and its **matches** (scoped notes).
- An **honest grounding/source indicator** on every answer (the §2 label, verbatim): filename-only vs
  semantic-with-score vs overlay-answered — the user always knows *how* the answer was grounded.
- An **egress indicator** that is **truthful and present only when an external overlay was queried** —
  it states the question was sent to the configured external endpoint and its residency tier. When no
  overlay is configured, the answer carries **no** egress claim (because none occurred).
- A **connect-your-overlay setting** (thin): enter the self-hosted URL, pick the service; the panel
  **honestly reflects connected / not-connected** (and "credential missing → not connected"). The
  credential is **never** entered into or shown by a project file — it is an environment variable
  (the setting may *name* the expected env var, never store its value).
- Untrusted content (note bodies, overlay answers/matches) is **rendered escaped** — interpolation-only,
  no `[innerHTML]`/`bypassSecurityTrust*`/`v-html` — the existing `no-unsafe-binding` source-scan covers it.

`/ui` (Aura) applies the §3 honesty framing ("shared = local; overlay = external, disclosed; nothing
uploaded by default") when the per-surface design is scoped.

---

## 6. What `/secops` must HARD-verify (the egress gate — precise list)

This slice introduces the **only egress surface** in the knowledge feature. `/secops` runs the HARD
(safety-override) `SECOPS_APPROVED` gate and must **prove each negative** (snapshot-and-assert where a
write/egress is alleged to be absent — assert *no call / no write occurred*, not merely an error code):

- **E-1 — No overlay ⇒ no egress (prove the negative).** With `memory.overlay` unset (the default), an
  interpretation-check question opens **no network socket** and answers entirely locally; **all** of
  ADT-234/235 (add/scope/tag/list/recall/propose-inbox) works with **zero** egress. The overlay is purely
  additive. (AC-3, the headline promise.)
- **E-2 — Overlay URL comes ONLY from user config, never from content.** The endpoint is read **only**
  from `~/.aidevteam/config.json` (`memory.overlayUrl`). Prove a URL embedded in a note body, a
  front-matter value, an overlay response, or any observed/untrusted data is **never** used as an egress
  target — no SSRF from content.
- **E-3 — Credential is ENV-ONLY, never persisted.** The overlay credential is read from the environment
  only and appears in **no** config file, **no** adapter manifest, **no** DB row, and **no** log line.
  Prove: after configuring and querying an overlay, grepping `config.json`/manifest/DB/logs yields **no**
  secret; a missing credential degrades to **"not connected"** (no loud failure, no secret echoed). (AC-5.)
- **E-4 — Egress only when enabled AND healthy.** A network call to the overlay happens **only** when the
  overlay is configured **and** passes the health-check (URL present, credential present if required,
  liveness probe within deadline). Unconfigured / unhealthy / timed-out / credential-missing → **silently
  skipped**, local answer served, **no** call to the URL.
- **E-5 — Egress is to the configured URL ONLY, and is disclosed.** When a query is sent, it goes **only**
  to the configured `overlayUrl`; the disclosure shown to the user is **truthful** (driven by the same
  enabled+healthy signal that gates the send, so it cannot claim "local" when it egressed or "external"
  when it did not). No silent egress. (AC-4.)
- **E-6 — Minimal data leaves; scope is respected.** Only the question + **minimal in-scope** context (the
  topic + in-scope matching note titles) + the scope key leave — **not** the whole vault, **not** another
  project's notes, **not** pending proposals, **not** secrets. The context is bounded and passes through
  the same `scopeMatches` scope the local answer uses.
- **E-7 — The Q&A is READ-ONLY.** A question triggers **no** write — no vault file, no proposal, no ledger
  change, no embedding job. Prove both vaults + the proposal store are **byte-identical** before and after
  any number of questions (with and without an overlay).
- **E-8 — Untrusted note content AND overlay responses are rendered escaped, never executed.** A
  `<script>`/`<img onerror>`/`javascript:` payload in a note body, a tag, **or an overlay answer/match**
  renders as **escaped text** (source-scan: no `[innerHTML]`/`bypassSecurityTrust*`/`v-html` on Q&A/answer
  content + a behavioral non-execution test). A **malicious overlay response cannot inject, execute, or
  self-promote** into a recallable vault (it is never written by the read-only Q&A — E-7).
- **E-9 — Overlay failure cannot break or hang the hub.** The overlay call is **time-boxed** (the
  `withDeadline` pattern); a slow/hostile/malformed/oversize response abandons the overlay tier and the
  **local tier answers** — the Q&A never throws, never hangs, never crashes the hub (never-throws contract).
- **E-10 — No info leak in errors.** A refusal / degraded answer never echoes an absolute server path, a
  `$HOME`-rooted path, the credential, the full overlay URL with embedded auth, or a stack trace.

> `/secops` owns the matching HARD gate; these are the precise negatives. The `/legal` privacy-copy
> obligation from sprint-06 (C-242: "Common = your own projects on this machine, never a cloud/account")
> **extends** here: the overlay copy must be honest that an **external** service is queried when one is
> connected — never an absolute "100% private" claim once an overlay is enabled.

---

## 7. Risks & mitigations

| ID | Risk | Mitigation |
|---|---|---|
| Q-1 | **Fabricated confidence** — the Q&A implies "it understood" when only filenames matched. | The grounding label is **derived from `embedderConfigured` + overlay health** (the same honest signals `buildKnowledge` uses); T1 explicitly says "filename-only — not a semantic check"; the overlay answer is labelled the overlay's. Non-fabrication is structural (§2). |
| Q-2 | **Silent egress** — content leaves without the user knowing. | Egress is gated by enabled+healthy **and** disclosed by the **same** signal, so the disclosure cannot drift from the act. Default OFF. `/secops` E-1/E-4/E-5 prove it. |
| Q-3 | **SSRF from content** — a note/overlay response supplies the egress URL. | URL is read **only** from user config; never from content/response (E-2). |
| Q-4 | **Secret leak** — the credential lands in config/manifest/DB/logs. | Env-only at call time, never persisted; missing → "not connected" (E-3). Mirrors `loadMemoryConfig`'s existing "choice only, never secrets" contract. |
| Q-5 | **Malicious overlay response** — XSS / injected "memory" / self-promotion into recall. | Response is untrusted: bounded, validated, **rendered escaped**, **never executed**, **never written** by the read-only Q&A (E-7/E-8). |
| Q-6 | **Overlay outage hangs the panel.** | Time-boxed health-check + call; unhealthy/timeout → silently skip → local answer (E-9). Fallback is always the local default (adapter contract). |
| Q-7 | **Hub↔memory scope drift** — the Q&A surfaces a note recall wouldn't (or vice-versa). | The Q&A reads **through `buildKnowledge` + `scopeMatches`** — the existing single source of truth; it introduces **no** second predicate (§2). |
| Q-8 | **Scope leak via the overlay** — the question's context carries another project's / out-of-scope notes off-machine. | Context is built from the **in-scope** matching set only (`scopeMatches`), bounded and minimal (E-6). |
| Q-9 | **The overlay becomes a silent source of truth.** | The local store stays authoritative; the overlay is additive, its answer always labelled external; it never replaces the vault (§4). |

---

## 8. ATAM summary

- **Sensitivity point:** the **egress boundary** (E-1..E-6) — a single un-gated or mis-disclosed send
  breaks the local-first promise. Mitigated by default-OFF, enabled+healthy gating, config-only URL,
  env-only secret, and disclosure driven by the same signal that gates the send.
- **Trade-off point:** the overlay buys richer semantic recall + a real interpretation-check at the cost
  of (disclosed, opt-in) egress — accepted because it is off by default, additive, and the local tier
  remains fully functional without it.
- **Non-risks:** the local-first default is **unaffected** (the Q&A is a read over the existing
  `buildKnowledge`; no overlay ⇒ no network); the scope boundary is **inherited** (`scopeMatches`, no new
  predicate); the overlay is a **thin client** over an existing OSS service (no engine built — D-009);
  the read-only Q&A **cannot mutate** state.

**Decision: ARCH_APPROVED — passed — for ADT-236.** Implementation (`/be` thin overlay adapter +
read-only `knowledge/ask` route + egress disclosure + env-only secrets; `/fe` minimal Q&A input +
grounding + egress indicator + connect-your-overlay setting) proceeds under TDD within these boundaries.
**`/secops` runs its HARD egress gate against §6 (E-1..E-10) before any network code is considered done**
— no egress is approved until those negatives ship green and pass `/rev`. The soft `DESIGN_APPROVED` (`/ui`)
fires when the Q&A/connect surfaces are scoped into a per-surface spec. Then `/sm` — please update sprint
status.

**Reviewed by:** /arch (Jorge) · **Date:** 2026-06-12 · **Status:** APPROVED (boundaries set; egress is
HARD-gated by `/secops` next).
