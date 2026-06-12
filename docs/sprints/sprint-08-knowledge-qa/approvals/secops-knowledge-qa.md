# SECOPS — Sprint 08 Knowledge Q&A + egress overlay (ADT-236 · HARD gate)

> **/secops (Soren) — Principal Security Engineer.**
> One HARD `SECOPS_APPROVED` (safety-override) **EGRESS** gate. ADT-236 introduces the **only egress
> surface** in the entire knowledge feature: a read-only `knowledge/ask` Q&A route plus a thin
> mem0/OpenMemory **overlay adapter** that, when enabled+healthy, sends a question off the machine to a
> user-configured URL. The headline risk is **data leaving the machine**; every condition below is turned
> into a **provable negative** (assert *no socket / no write / no secret*, not merely an error code).
>
> **Inputs read in full:** `sprint-08-knowledge-qa/approvals/arch-knowledge-qa.md` (Jorge's design §1–§8,
> esp. **§6 E-1..E-10**); `sprint-06-knowledge-scopes/approvals/secops-knowledge-scopes.md` (the existing
> write/read containment + scope-as-authorization posture — **must not be weakened**).
>
> **Existing machinery inspected IN SOURCE (I read the code, not the design's claim about it):**
> `hub/lib/knowledge.js` (`parseFrontMatter`, **`scopeMatches`** — the single scope authority, `commonVaultRoot`,
> `aidevteamHome`), `hub/lib/state.js` (`buildKnowledge`, `containedCommonVaultDir`, `readCommonKb`,
> `embedderConfigured`), `hub/lib/api.js` (the `handle(route,data,project)` control-plane dispatch — `kb/add`,
> `kb/propose`, `kb/approve`, `kb/reject`; **no `knowledge/ask` route exists yet**), `hub/lib/guard.js`
> (`writeAllowed` / `streamAllowed` — loopback Host/Origin/socket + X-AIDT), `hub/lib/write.js` (`addKbNote`
> chokepoint, `resolveCommonKbDir`), `claude/memory/src/lib/config.ts` (`loadMemoryConfig` — "carries the
> *choice* … never secrets; API keys are always read from the environment"), `claude/memory/src/hooks/common.ts`
> (`withDeadline`), `claude/memory/src/hooks/restore-context.ts` (the scoped recall path),
> `claude/workflow/adapters/README.md` (the capabilities/health-check/fallback/data-residency contract),
> `claude/workflow/adapters/mcp/{mem0,openmemory}.json` (the existing manifests).

---

## Verdict (summary up top)

- **ADT-236 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).** Binding on
  **E-1…E-10 + X-1…X-2 (§3–§4)**, proven by the negative tests **N-301…N-322 (§6)**. No CRITICAL/HIGH left
  open — each is converted to a binding, testable negative. **Implementation is BLOCKED until E-1…E-10 ship
  with their negative tests green and pass `/rev`. No network/egress code is approved as "done" until the
  no-overlay-no-network negative (N-301) ships green.**

**Headline conditions (the four that carry this gate):**
1. **E-1 — no overlay ⇒ NO network** (prove no socket opens; the local tier answers).
2. **E-2 — egress URL only from user config, NEVER from content** (no SSRF foothold).
3. **E-3 — credential ENV-ONLY, never persisted** (not in config / manifest / DB / logs).
4. **E-6 — minimal in-scope data only** (question + topic + in-scope matching titles + scope key; never the
   vault, another project's notes, pending proposals, or a secret).

---

## 0. Verification of the controls this design reuses (I read the source)

A gate that rubber-stamps "reuse the recall path / the adapter contract / `withDeadline`" without reading it
ships a hole when the "reused" control turns out to be net-new or behaves differently than claimed. Findings:

| Control the design leans on | Source (verified) | Verdict |
|---|---|---|
| **`scopeMatches(doc, project)`** — the single visibility/recall authority | `knowledge.js:169-182` | **Real & single-source.** `project` scope → `ownProject===true`; `common` → `status==='approved-common'` AND (`any` ∈ stack OR stack∩project.stack). The Q&A **must** build its scope through this and add **no** second predicate. Reused, not re-implemented. |
| **`buildKnowledge(project)`** local-first scoped projection | `state.js:370-423` | **Real.** Merges own vault ∪ `scopeMatches`-filtered common; surfaces **pending proposals separately** in `proposals[]` (inert by location). The Q&A wraps this; it must **not** read `proposals[]` into the answer/egress context (E-6/E-7). |
| **`embedderConfigured(project)`** honest grounding source | `state.js:562`, read-only selector | **Real.** Reads only the `memory.embeddings` selector (no secret). The honest grounding label derives from this + overlay health — no new secret read. |
| **`loadMemoryConfig()` selection-only contract** ("never secrets; keys from env") | `config.ts:1-34` | **Real for the existing memory selector.** The overlay URL persists in this same `~/.aidevteam/config.json` pattern. **`memory.overlay`/`memory.overlayUrl` are NET-NEW keys** — `loadMemoryConfig` does not read them today (it reads `backend`/`embeddings`/`dbPath`/`qdrantUrl` only). The new reader must inherit the *posture* (selection-only, env-only secret) but is **new code** with its own proving tests. |
| **`writeAllowed` / `streamAllowed`** request guard | `guard.js:53-75` | **Real.** Loopback Host/Origin/socket; writes also need X-AIDT; GET/SSE skip X-AIDT but keep Host/Origin/socket pinning. The `knowledge/ask` read route inherits the **read** posture (Host/Origin/socket loopback) — see X-2. |
| **`withDeadline(p, ms, fallback)`** time-box | `common.ts:54-59` | **Real but RACE-ONLY — it does NOT cancel the underlying promise.** It `Promise.race`s against a timer and returns `fallback` on timeout; **the in-flight `fetch` keeps running and its socket stays open.** For an egress call this is a **finding**: the overlay call must be aborted (AbortController / request timeout) so a hung overlay cannot pin a socket or leak the wider request lifetime — E-9. Do **not** credit `withDeadline` alone as the time-box for a network call. |
| **`addKbNote` chokepoint** (containment/O_EXCL/caps) | `write.js:235-287` | **Real.** Relevant only as the *thing the read-only Q&A must NEVER call* — E-7 proves the Q&A triggers no write through it (or any other writer). |
| **The mem0/OpenMemory egress client itself** (`knowledge/ask` route, the overlay adapter, ANY `fetch`/outbound socket, the health probe, the disclosure plumbing) | **absent** from `hub/` (grep clean: the only `node:http` in `hub/` is `projects.js:165` `http.createServer` — the hub's own **inbound** server; **no outbound network code exists anywhere in the hub or the recall path today**) | **NET-NEW — the entire egress surface.** None of it may be counted as a passing mitigation until written and tested with the negatives in §6. This is exactly why **E-1 (no-overlay ⇒ no network) is the cleanest negative available**: there is nothing to send today, so any socket that opens is new code regressing. |
| **`mem0.json` manifest** | `adapters/mcp/mem0.json:6` carries `"MEM0_API_KEY": "REPLACE_ME"` | **A secret-shaped slot in a checked-in manifest.** It invites an operator to paste a real key into a file. This **conflicts with env-only** (E-3) and is called out as **X-1** below: the credential must be read from the process environment at call time, and any manifest used for the overlay must **not** be a persistence site for a real key. |

**Headline:** the **scope authority (`scopeMatches`), the local-first projection (`buildKnowledge`), the
honest grounding signals (`embedderConfigured`), the selection-only config pattern, and the request guard**
are real and verified. The **overlay URL/credential config keys, the health probe, the egress client, the
`knowledge/ask` route, the abortable time-box, and the disclosure** are **net-new code** — each carries its
own proving negative in §6, and the `withDeadline` time-box is **insufficient for a network call** (X / E-9).

---

## 1. Trust model & threat surface (the egress delta)

**Trust model unchanged:** single-developer, localhost. The Operator is trusted; **the browser the Operator
also uses is NOT** — any website the Operator visits can `fetch('http://127.0.0.1:<port>/…')`. Loopback
binding is not the access control. ADT-236 adds **one decisive new thing: an outbound channel off the
machine.** Two facets dominate:

1. **Egress (data leaving):** the question + context can leave to a configured URL. The promise is
   *off-by-default, configured-URL-only, disclosed, minimal-and-in-scope.* A single un-gated, mis-targeted,
   over-scoped, or mis-disclosed send breaks the local-first guarantee.
2. **Ingress of untrusted text (data arriving):** the overlay's response is **untrusted input** that the UI
   renders and (must never) write back. A hostile overlay response must not inject, execute, self-promote
   into recall, or become a directive.

**STRIDE — the new egress surface:**

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Info-disclosure (silent egress)** | A Q&A opens a socket / sends content when no overlay is configured, or sends without disclosing. | **HIGH** | **E-1, E-4, E-5** — default OFF ⇒ zero network; egress only when enabled+healthy; disclosure driven by the same signal that gates the send. |
| **SSRF (egress target from content)** | A URL in a note body / front-matter / overlay response is used as the egress target → SSRF to internal hosts / metadata endpoints. | **HIGH** | **E-2** — the URL is read **only** from `~/.aidevteam/config.json`; never from content/response. |
| **Secret leak** | The overlay credential lands in `config.json`, the adapter manifest, a DB row, or a log line. | **HIGH** | **E-3, X-1** — env-only at call time; never persisted; missing ⇒ "not connected" (no secret echoed); manifest is not a key-persistence site. |
| **Elevation / scope leak via egress** | The egress context carries the whole vault, another project's project-scoped notes, pending proposals, or a secret off-machine. | **HIGH** | **E-6** — only `{question + minimal in-scope context (topic + `scopeMatches` titles) + scope key}` leaves; built through the same scope authority as the local answer; proposals excluded. |
| **Integrity (read becomes write)** | A question triggers a vault write / proposal write / ledger change / embedding job. | **HIGH** | **E-7** — the Q&A is read-only; both vaults + the proposal store byte-identical before/after. |
| **Stored/reflected XSS + prompt-injection (untrusted response)** | The overlay's answer/matches render as live HTML/script, or self-promote into recall, or are treated as instructions. | **HIGH** | **E-8** — interpolation-only render (no `[innerHTML]`/`bypassSecurityTrust*`/`v-html`), never executed, never written into a vault, never elevated to a directive. |
| **DoS / hang (hostile overlay)** | A slow/hanging/garbage/oversize overlay response hangs or crashes the hub, or pins a socket past the deadline. | **HIGH** | **E-9** — abortable, time-boxed call (NOT race-only); fall back to local; never-throws; bounded/validated response. |
| **Info-disclosure (error leak)** | A refusal/degraded answer echoes the credential, the full URL with embedded auth, an absolute/`$HOME` path, internal structure, or a stack trace. | **MED** | **E-10** — terse errors; no secret, no full auth-bearing URL, no path, no stack trace, no other project's data. |
| **Containment regression (ADT-234/235)** | The new read route reaches another project's vault, the proposal store, or weakens the scope-authorization established in sprint-06. | **HIGH** | **X-2** — the Q&A reads strictly through `buildKnowledge` + `scopeMatches`; introduces no second predicate, no second scan, no proposal read; the sprint-06 containment is unchanged. |
| **Dishonest privacy claim** | UI implies "100% private / nothing leaves" while an overlay is connected. | **MED** | **E-5, the §5 honesty note** — the disclosure is truthful by construction; no strengthened absolute once an overlay is enabled. |

No CRITICAL findings. Every HIGH is converted to a binding, tested negative.

---

## 2. The sprint-06 containment is NOT weakened (re-affirmed)

This pass **does not re-derive** ADT-234/235's conditions; it **binds that the new read route does not
relax them** (condition X-2, proven by N-321/N-322):

- The Q&A reads through `buildKnowledge` → `readProjectKb` (this project's vault only, via `record.path`)
  ∪ `readCommonKb` (the single `containedCommonVaultDir`, $HOME-contained) filtered by `scopeMatches`. It
  adds **no** new vault scan and **no** new scope predicate. (C-209/C-210/C-211 preserved.)
- Pending proposals remain **inert by location** — `buildKnowledge` surfaces them in a *separate*
  `proposals[]` array, never in `docs[]`. The Q&A answer and the egress context are built from `docs[]`
  **only**; the proposal store is never read into either. (C-220/C-221 preserved; E-6/E-7 prove it.)
- The read route requires no write authority and triggers no write path, so `addKbNote`'s containment,
  O_EXCL, caps, and the `writeAllowed` X-AIDT mutation guard are untouched. (E-7.)

---

## 3. BINDING conditions — the egress controls (HARD)

**E-1 — No overlay ⇒ NO network (the headline negative).** With no overlay configured
(`memory.overlay` unset/`null` — the default), an interpretation-check question opens **no outbound socket**
and makes **no outbound request** (`fetch`/`http(s).request`/`net.connect`/DNS lookup of a remote host); the
**local tier answers** (T2 semantic if an embedder, else T1 lexical, else T0 honest-absence). **All** of
ADT-234/235 (add/scope/tag/list/recall/propose-inbox/approve/reject) continues to work with **zero** egress.
The overlay is purely additive. **Prove the negative by spying the network primitive** (assert it was never
invoked), not merely by asserting a local-shaped answer. (N-301.)

**E-2 — Egress URL comes ONLY from user config, never from content (anti-SSRF).** The egress target is
read **only** from `~/.aidevteam/config.json` (`memory.overlayUrl`, the selection-only file). A URL appearing
in a note body, a front-matter value, a proposal, the question text, or **the overlay's own response** is
**never** used as an egress target — no redirect-follow that re-points egress, no second hop derived from
content. The configured URL is also validated to a sane shape (http/https, host present) so a malformed
config value fails closed (overlay treated unhealthy), but its **source** is the binding control: config only.
(N-302, N-303.)

**E-3 — Credential is ENV-ONLY, never persisted.** The overlay credential/token is read from the **process
environment** at call time (the existing manifest var names — `MEM0_API_KEY` / `OPENMEMORY_API_KEY` — or the
documented equivalent) and appears in **no** config file, **no** adapter manifest, **no** DB row, **no** log
line, and **no** error body. A **missing credential degrades to "not connected"** (the overlay is treated as
unconfigured/unhealthy and silently skipped → local answer) — **never** a crash and **never** a loud failure
that echoes secret detail. Prove: after configuring and querying an overlay, grepping `config.json` / the
manifest / the DB / logs yields **no** secret. (N-304, N-305.)

**E-4 — Egress only when enabled AND healthy.** A network call to the overlay happens **only** when the
overlay is (a) explicitly enabled in config (`memory.overlay` set + `memory.overlayUrl` present) AND (b)
passes a **time-boxed liveness health-check** (URL present, credential present if the service needs one, a
cheap probe succeeds within a short deadline). Unconfigured / disabled / credential-missing / unhealthy /
probe-timed-out → the overlay is **silently skipped**, the local answer is served, and **no** call to the
configured URL is made for the actual question. (N-306, N-307.)

**E-5 — Egress is to the configured URL ONLY, and the disclosure is TRUTHFUL.** When a question is sent it
goes **only** to the configured `overlayUrl` (host/scheme pinned to the config value; no redirect to another
host is followed for egress). The user-facing **disclosed-egress label** is **truthful by construction** —
it is driven by the *same* enabled+healthy signal that gates the send, shown **exactly when** a send will/does
happen, and **never** claims local-only when the overlay was queried (nor "external" when it was not). The
label also names the residency tier (`local-service` your-network vs `cloud`). No silent egress. (N-308, N-309.)

**E-6 — Minimal, in-scope data only.** The egress payload is **exactly** `{ question, context, scopeKey }`
where `context` is the **minimal in-scope** grounding (the topic + the **matching note titles** selected via
`scopeMatches` for this project) and `scopeKey` is the project's scope identifier. The payload **excludes**:
the whole vault, note **bodies** beyond the minimal titles needed, **another project's** project-scoped
notes, any **common** note the project may not see (stack-mismatched), **pending proposals**, the ledger, and
**any secret/credential**. The context is built through the **same `scopeMatches`** the local answer uses, so
egress can never carry what the local answer could not see. Prove the payload **excludes** out-of-scope +
proposal + secret data by snapshotting the captured request body. (N-310, N-311, N-312.)

**E-7 — The Q&A is READ-ONLY.** A question triggers **no** write — no vault file (project or common), no
proposal record, no ledger/overlay change, no audit comment, and **no** embedding/store job from the read.
Prove **both vaults + the proposal store are byte-identical** (file list + bytes) before and after any number
of questions — **with and without** an overlay configured. (N-313, N-314.)

**E-8 — Untrusted note content AND the overlay response are rendered escaped, never executed, never
self-promoting.** A `<script>` / `<img onerror>` / `javascript:` payload in a note body, a tag, **or in the
overlay's `answer`/`matches`** renders as **escaped text** (interpolation-only; source-scan: no
`[innerHTML]` / `bypassSecurityTrust*` / `v-html` on the Q&A/answer/matches surface, **plus** a behavioral
non-execution test). A malicious overlay response **cannot** inject/execute, **cannot** be written into a
recallable vault (it is never written — E-7), and **cannot** be elevated into a directive/instruction or a
recall row. The overlay's answer is always **labelled the overlay's**, never DART's own. (N-315, N-316.)

**E-9 — Time-boxed / resilient / never-throws (abortable, not race-only).** The overlay health-check and
the question call are **time-boxed with an ABORT** (AbortController / socket timeout), so a slow/hanging/
garbage/oversize response **abandons the overlay tier without leaving a dangling socket**; the Q&A **falls
back to the local tier** and the route/session stays responsive. The route **never throws, never hangs,
never crashes the hub** (inherits the never-throw contract). The response is **bounded** (size cap) and
**shape-validated** before use; a malformed/oversize/hostile response abandons the overlay tier. **Note: the
existing `withDeadline` is race-only and does not cancel the in-flight request — it is NOT sufficient on its
own for a network call.** (N-317, N-318.)

**E-10 — No info leak in errors.** A refusal / degraded answer / overlay error **never** echoes the
credential, the full overlay URL with embedded auth, an absolute server path, a `$HOME`-rooted path,
internal structure, another project's data, or a stack trace. Messages are terse. (N-319.)

---

## 4. Cross-cutting binding conditions

**X-1 — The overlay manifest is NOT a credential-persistence site.** The credential is read from the
environment only (E-3). Any manifest used to wire the overlay must **not** carry a real key; the checked-in
`mem0.json` placeholder `"MEM0_API_KEY": "REPLACE_ME"` is acceptable **only** as a non-secret env-var *name*
hint and must never be replaced with a real value in a committed/persisted file. The connect-your-overlay UI
may **name** the expected env var but must **never** store its value into any project file. (N-320.)

**X-2 — Sprint-06 containment + scope-authorization is not weakened.** The `knowledge/ask` route reads
**strictly** through `buildKnowledge` + `scopeMatches` (§2) — no new vault scan, no second scope predicate,
no proposal-store read, no relaxation of `containedCommonVaultDir`'s $HOME containment, and no new write
path. A question can surface (locally or via egress context) **only** what the project may already see.
(N-321, N-322.)

**Honesty note (extends sprint-06 C-242 / the `/legal` privacy-copy obligation):** the overlay copy must be
honest that an **external** service is queried when one is connected — **reject** any strengthened absolute
("100% private", "nothing ever leaves", "fully local") once an overlay is enabled. A gate-pass badge means
"the gate ran and approved this change," never "this code is secure / private." (Ratified at N-309.)

---

## 5. Negative-test checklist `/rev` MUST confirm

The gate is met only when these ship green. `/rev` confirms **each is a real test that would FAIL if its
control were removed** — not a comment, not a happy-path assertion. **Method for the egress/secret/write
negatives: capture the actual network primitive (spy/mock the outbound `fetch`/socket) and the on-disk state,
and assert *no call occurred / the captured body excludes X / no secret is present / bytes are unchanged* —
not merely a response code or a local-shaped answer.**

### Egress — the no-network & target negatives
- [ ] **N-301 (no overlay ⇒ no network — THE headline):** with `memory.overlay` unset, asking N questions
      opens **no** outbound socket and invokes **no** outbound network primitive (spy asserts zero
      invocations); the answer is served locally; ADT-234/235 routes all work. **Fails if** the gate that
      skips egress when unconfigured is removed.
- [ ] **N-302 (URL from config only — no SSRF from a note/proposal):** a note body / front-matter / proposal
      containing `http://169.254.169.254/…` (or any URL) is **never** used as the egress target; the only
      target ever contacted is the configured `overlayUrl`. **Fails if** the egress target is sourced from
      content.
- [ ] **N-303 (URL from config only — no SSRF from the overlay response):** an overlay response containing a
      URL / a redirect to a different host does **not** cause a second egress to that host; egress stays
      pinned to the configured URL. **Fails if** a response-supplied URL/redirect is followed.
- [ ] **N-306 (egress only when enabled AND healthy):** with an overlay configured but the health probe
      failing (unreachable / credential-missing / probe-timeout), the actual question makes **no** call to
      the URL and the local tier answers. **Fails if** egress proceeds without a passing health-check.
- [ ] **N-307 (disabled ⇒ no egress):** with `memory.overlay` set to a value but explicitly disabled (or
      URL absent), no outbound call occurs. **Fails if** a partial/disabled config still egresses.
- [ ] **N-308 (egress target is the configured URL only):** when enabled+healthy, the captured request goes
      to **exactly** the configured `overlayUrl` host/scheme and nowhere else. **Fails if** any other host is
      contacted.
- [ ] **N-309 (disclosure is truthful by construction):** the disclosed-egress label is present **iff** a
      send happened (enabled+healthy), names the residency tier, and is **absent** on a purely-local answer;
      a strengthened absolute privacy string ("100% private"/"nothing leaves") is rejected by the
      claim-string source-scan. **Fails if** the label can claim local while egressing, or claim external
      while local, or an absolute privacy claim ships.

### Secret negatives
- [ ] **N-304 (credential ENV-ONLY, never persisted):** after configuring + querying an overlay, grepping
      `~/.aidevteam/config.json`, the adapter manifest, the DB, and any log file yields **no** secret value;
      the credential is read from the env at call time only. **Fails if** the key is written to any file.
- [ ] **N-305 (missing credential ⇒ "not connected", graceful):** with the overlay enabled but the env
      credential absent, the overlay is treated as unhealthy/not-connected, the local tier answers, **no**
      call is made, and **no** error echoes the env-var value or secret detail. **Fails if** a missing
      credential crashes, throws loudly, or leaks.
- [ ] **N-320 (manifest is not a key store):** the committed `mem0.json` carries no real key (only the
      placeholder/name hint); the connect-overlay UI never writes a secret into a project file. **Fails if**
      a real key is persisted to a manifest/config.

### Minimal-scope-egress negatives
- [ ] **N-310 (payload excludes out-of-scope data):** with project A asking a question, the captured egress
      body contains **none** of project B's project-scoped note titles/bodies, and **no** stack-mismatched
      common note the project cannot see; only `scopeMatches`-visible titles + the question + scope key are
      present. **Fails if** the context is built outside `scopeMatches`.
- [ ] **N-311 (payload excludes pending proposals):** with pending proposals present, the captured egress
      body contains **no** proposal content/title. **Fails if** the egress context reads `proposals[]`.
- [ ] **N-312 (payload excludes secrets + whole-vault dump):** the captured egress body contains no env
      credential and is **not** a dump of every note body — only the minimal in-scope titles + question.
      **Fails if** the payload over-shares.

### Read-only negatives
- [ ] **N-313 (read-only, no overlay):** snapshot both vaults + the proposal store; after N questions with
      no overlay, all three are **byte-identical**; no embedding job ran. **Fails if** a question writes.
- [ ] **N-314 (read-only, with overlay):** same snapshot/assert with an overlay enabled+healthy and
      answering — both vaults + the proposal store remain byte-identical; the overlay's answer is **not**
      written into any vault or the recall store. **Fails if** an overlay answer is persisted/self-promoted.

### Untrusted-content negatives
- [ ] **N-315 (note content inert):** a `<script>`/`<img onerror>`/`javascript:` payload in a note body or
      tag surfaced by the Q&A renders **escaped** (source-scan: no `[innerHTML]`/`bypassSecurityTrust*`/
      `v-html`; behavioral non-execution). **Fails if** bound unsafely.
- [ ] **N-316 (overlay response inert + non-self-promoting):** a malicious overlay `answer`/`match`
      containing a script/`javascript:` payload renders **escaped**, is **never executed**, is **never
      written** into a vault/recall row, and is **never** treated as a directive/instruction; it is labelled
      the overlay's. **Fails if** the response can inject, persist, or become an instruction.

### Resilience negatives
- [ ] **N-317 (hang ⇒ abort + local fallback, no dangling socket):** an overlay that never responds is
      **aborted** at the deadline (the socket is closed, not merely raced past); the Q&A falls back to the
      local tier and returns promptly; the route stays responsive. **Fails if** the call is race-only and
      the socket dangles, or the route hangs.
- [ ] **N-318 (garbage/oversize response ⇒ abandon tier, never-throws):** a malformed / oversize / non-JSON
      / hostile overlay response abandons the overlay tier (bounded + shape-validated), the local tier
      answers, and the route never throws / never crashes the hub. **Fails if** a bad response throws or is
      used unvalidated.

### Error-leak negative
- [ ] **N-319 (no info leak in errors):** every overlay failure / refusal / degraded answer returns a body
      with **no** credential, **no** full auth-bearing URL, **no** absolute or `$HOME` path, **no** other
      project's data, and **no** stack trace. **Fails if** any of these leak.

### Containment-not-weakened negatives (sprint-06 re-affirmation)
- [ ] **N-321 (no cross-project / no proposal read via the Q&A):** project A's Q&A (local or egress context)
      surfaces **none** of project B's `scope:project` notes and **no** pending proposal; it reads strictly
      through `buildKnowledge` + `scopeMatches`. **Fails if** the route adds a second scan/predicate.
- [ ] **N-322 (scope authority single-source):** the Q&A's visible set equals `buildKnowledge`'s `docs[]`
      filtered by `scopeMatches` — a fixture visible in the panel but not to the Q&A (or vice-versa) fails;
      `containedCommonVaultDir`'s $HOME containment is unchanged. **Fails if** the Q&A diverges from the
      shared predicate.

---

## 6. Gate decision

**ADT-236 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** E-1…E-10 (§3) + X-1…X-2 (§4) + the honesty note, proven by N-301…N-322 (§5).
- **Net-new code flagged (not free reuse):** the **entire egress surface** — the `knowledge/ask` route, the
  overlay config keys + their reader, the health probe, the egress client, the **abortable** time-box, and
  the disclosure — is net-new (no outbound network code exists in the hub today). The `withDeadline` helper
  is **race-only and insufficient** for a network call (must add an abort). The `mem0.json` manifest carries
  a secret-shaped placeholder that must never become a real persisted key (X-1).
- **Load-bearing controls:** the no-overlay-no-network negative (E-1/N-301), config-only egress URL
  (E-2/N-302/N-303), env-only-never-persisted credential (E-3/N-304/N-320), minimal in-scope egress
  (E-6/N-310-312), read-only Q&A (E-7/N-313-314), untrusted-response-inert (E-8/N-316), and abortable
  resilience (E-9/N-317).
- **No CRITICAL/HIGH left open:** silent egress, SSRF-from-content, secret leak, scope-leak-via-egress,
  read-becoming-write, untrusted-response XSS/injection, hostile-overlay DoS, and containment regression are
  each a binding, tested negative.
- **BLOCKED until:** E-1…E-10 + X-1…X-2 ship with N-301…N-322 green and pass `/rev`. **No network/egress
  code is "done" until N-301 (no-overlay ⇒ no socket) ships green.**

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-12 · **Status:** APPROVED WITH CONDITIONS
(HARD egress gate, conditional on E-1…E-10 + X-1…X-2, proven by N-301…N-322) · **Next:** ADT-236 →
`/be` (read-only `knowledge/ask` over `buildKnowledge`+recall; thin overlay adapter; env-only secret +
config-only URL; abortable health-check + call; truthful disclosure) + `/fe` (minimal Q&A input; honest
grounding label; truthful egress indicator; connect-your-overlay setting that names — never stores — the env
var) under TDD — must ship the N-tests above → `/rev` verifies each condition in code → `/verify`. The soft
`DESIGN_APPROVED` (`/ui`) and the `/legal` privacy-copy review of the overlay honesty copy fire when the
surfaces are scoped. Then `/sm` — please update sprint status.
