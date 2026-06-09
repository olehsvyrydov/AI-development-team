# SECOPS — Sprint 06 Knowledge Scopes (ADT-234 + ADT-235 · HARD gate)

> **/secops (Soren) — Principal Security Engineer.**
> Two HARD `SECOPS_APPROVED` (safety-override) gates in one pass:
> - **ADT-234 — scope/tag model (file-based).** Scope is the **recall-authorization boundary**. The NEW
>   surfaces are: (a) a NEW user-level write+read vault `~/.aidevteam/kb-common/` **outside the project
>   root**; (b) `scope`/`stack`/`kind` as NEW params on the `addKbNote` chokepoint; (c) a NEW
>   front-matter parser on the read path. The cross-project leak vector is a `scope:common` write.
> - **ADT-235 — `/kai` propose→approve inbox.** Model-authored (UNTRUSTED) proposal content must be
>   **inert until an explicit human approve**, with the approve write scope-authorized + audited.
>
> **ADT-236 (mem0/OpenMemory egress adapter) is OUT OF SCOPE here** — deferred follow-on per D-012 with
> its own HARD SECOPS egress gate. No egress is approved by this pass.
>
> **Inputs read in full:** `approvals/arch-knowledge-scopes.md` (Jorge's design §1–§9, esp. **§8 S-1..S-8**);
> `TICKETS.md` (ADT-234 AC-1..AC-9, ADT-235 AC-1..AC-8); `DECISION_LOG.md` (D-010..D-014).
> **Existing machinery inspected IN SOURCE (I read the code, not the design's claim about it):**
> `hub/lib/write.js` (`addKbNote` — slug/`isContained`/`resolveKbDir`/`writeNewFileExclusive` O_EXCL/
> `kbBodyError` text+cap, `deepMerge` `FORBIDDEN_KEYS`, `appendComment`), `hub/lib/guard.js`
> (`writeAllowed`), `hub/lib/state.js` (`readKb`, `buildBase`, `embedderConfigured`, `markdownBody`,
> `parseInline`/`dropForbiddenKeys`/`FORBIDDEN_KEYS`, `fileRev`), `claude/memory/src/stores/collections.ts`
> (`FILTERABLE=[project_id, scope, chunk_type, session_id]`), `claude/memory/src/hooks/restore-context.ts`
> (AND-equality recall: `{project_id, scope:"project"}` + `{scope:"global"}`), `claude/memory/src/lib/paths.ts`
> (`aidevteamHome()`). Prior KB-write gate (reused verbatim as the per-vault baseline):
> `docs/sprints/sprint-03-interactive-cockpit/approvals/secops-interactive.md` (ADT-223 **C-1..C-12 / N-1..N-13**).

---

## Verdict (summary up top)

- **ADT-234 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).** Binding on
  **C-201…C-214 (§3)**, proven by the negative tests **N-201…N-219 (§6)**. No CRITICAL/HIGH left open —
  each is converted to a binding, testable condition. **Implementation is BLOCKED until C-201…C-214 ship
  with their negative tests green and pass `/rev`.**
- **ADT-235 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).** Binding on
  **C-220…C-229 (§4)**, proven by **N-220…N-233 (§6)**. The proposal-inert-until-approve trust contract
  (C-220/C-221) and the untrusted-content handling (C-225) are the load-bearing controls.

**Cross-cutting honesty conditions C-240…C-242 (§5)** apply to both tickets.

---

## 0. Verification of the controls these designs reuse (I read the source)

A gate that rubber-stamps "reuse the ADT-223 chokepoint" without reading it ships a hole when the
"reused" control turns out to be net-new. Findings:

| Control the design leans on | Source (verified) | Verdict |
|---|---|---|
| **`writeAllowed`** anti-CSRF/DNS-rebinding (X-AIDT + loopback Host + loopback Origin + loopback socket) | `guard.js:53-59`, sound | **Real.** Applied to every `/api/*` POST in `server.js` by placement. The new scoped-add / approve / reject routes are mutations → they inherit the guard **by placement** (prove the negative anyway: N-205, N-228). |
| **`isContained(root, child)`** trailing-separator containment (rejects the `/p/kb` vs `/p/kbevil` prefix trap) | `write.js:136-138` | **Real and reusable as the containment RULE.** But today it is only ever called with the **project KB dir** as root. Confining against a **second, user-level root** (the common vault) is **net-new wiring** — C-201. |
| **`resolveKbDir(projectDir)`** first-existing `docs`→`kb`→`.aidevteam/kb`, realpath'd, containment-checked, default-created | `write.js:143-157` | **Real** for the **project** vault. There is **NO** `resolveCommonKbDir` anywhere in `hub/` (grep clean). The common-vault resolver is **NET-NEW** — C-201. |
| **`writeNewFileExclusive`** O_EXCL `wx` create (never follows/truncates a pre-existing entry, symlink included) + fsync | `write.js:221-229` | **Real and reusable.** Holds identically against the common vault once the target parent is contained to it — C-203. |
| **`kbBodyError`** non-empty UTF-8 text, no C0 control (bar tab/CR/LF), ≤ 64 KB, surrogate-safe | `write.js:162-170` | **Real and reusable** unchanged on every new write path — C-204. |
| **`slugify` + server-derived `<slug>.md`** (client never supplies a path/filename/dir/ext; collision → unique numeric suffix) | `write.js:125-132,188-214` | **Real.** The scope is an **enum**, not a path — the filename stays 100 % server-derived for both vaults — C-202. |
| **`addKbNote(projectDir, { title, body })`** signature | `write.js:188` | **Today takes only `{title, body}`.** `scope`/`stack`/`kind` are **NET-NEW params**, and a `scope:common` branch that targets a **different vault root** is **net-new write-path code** — C-201/C-206. **Do not credit the second vault as covered by the existing test set.** |
| **Front-matter parse on read** | `state.js` `markdownBody:289-295` only **strips** `^---\n…\n---`; it does **NOT parse** keys. `parseInline`+`dropForbiddenKeys`+`FORBIDDEN_KEYS` (`state.js:140-202`) parse the **workflow.yaml** inline blocks, not KB front-matter. | **The bounded front-matter *reader* for KB docs is NET-NEW.** It must inherit the **posture** of `parseInline`/`dropForbiddenKeys` (schema-keys-only, `FORBIDDEN_KEYS` dropped, scalars/flat-lists, never-throw) — but it is new code with its own proving tests — C-208. |
| **Memory scope/project_id isolation** | `collections.ts:18` `FILTERABLE=[project_id, scope, …]`; `restore-context.ts:69-71` recalls `{project_id:pid, scope:"project"}` AND `{scope:"global"}` (AND-equality) | **Real and tested.** Project A's recall never returns project B's `scope:project` rows. **`stack` is a NEW filter term** added to this model (with an `any` wildcard) — its parity with the hub predicate is **net-new** and must be proven (C-211, N-211). |
| **`appendComment`** append-only JSONL audit (id, ticket, ts, author, kind, body≤8 KB) | `write.js:232-253` | **Real and reusable** as the approve/reject audit trail — C-223. |
| **`embedderConfigured` / honest `filename-only`** | `state.js:385-413` reads only the `memory.embeddings` selector (no secret), `method='filename-only'` unless ≠ `none` | **Real.** Scope/tags add **no** semantic claim; honesty preserved — C-240. |
| **`resolveCommonKbDir` / `knowledge.commonVaultDir` override / `~/.aidevteam/kb-proposals/` store** | **absent** from `hub/` (grep clean) | **NET-NEW, the entire ADT-234/235 write+store surface.** Each carries its own proving tests below. |

**Headline:** the per-vault baseline (`isContained` rule, `writeNewFileExclusive` O_EXCL, `kbBodyError`,
`slugify`, `writeAllowed`, `appendComment`, the memory project_id/scope isolation, honest indexing) is
**real and verified**. The **second (common) vault resolver + containment root**, the **scoped
`addKbNote` params**, the **front-matter reader**, the **`stack` match term + its hub↔memory parity**,
and the **`/kai` pending store + approve/reject flow** are **net-new code** — none may be counted as a
passing mitigation until written and tested with the negatives in §6.

---

## 1. Trust model & threat surface (delta)

**Trust model unchanged:** single-developer, localhost. The Operator is trusted; **the browser the
Operator also uses is NOT** — any website the Operator visits can `fetch('http://127.0.0.1:<port>/…')`.
Loopback binding is not the access control; `writeAllowed` is. Two deltas this chunk introduces:

1. **A second write+read root outside the project** (`~/.aidevteam/kb-common/`). The ADT-223 chokepoint
   was proven against *one* root (the project KB dir). A `scope:common` write must be contained to the
   **common-vault** root, and the common scan must read **only** that root — or the design's central
   promise (scope = isolation boundary) fails. This is the **cross-project leak vector**.
2. **A third location holding UNTRUSTED model output** (`~/.aidevteam/kb-proposals/`). `/kai`-authored
   content must be **inert by location** until a human approves — not inert by a filter that could be
   bypassed or regressed.

**STRIDE — the new surfaces:**

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Elevation / IDOR (cross-project recall)** | Project A recalls project B's `scope:project` notes; or reading "Common" leaks a project-scoped note; or a stack-mismatched common note leaks another stack's data. | **HIGH** | **C-209, C-210, C-211** — each vault scans only its own root; the match predicate is single-source + parity-tested; `stack∩project.stack` with `any` wildcard, default-narrowest. |
| **Tampering (common-vault escape)** | A crafted `title`/slug, or a `commonVaultDir` override, or a symlinked common vault writes outside `~/.aidevteam/kb-common/`. | **HIGH** | **C-201, C-202, C-203** — realpath-contain to the **common** root before any write; O_EXCL; server slug; override realpath'd and itself the containment root. |
| **Spoofing scope (client-supplied path-as-scope)** | A request supplies `scope:"../../etc"` / a path-shaped or out-of-enum scope to redirect the write. | **HIGH** | **C-206** — `scope` is a **server-validated enum** {project, common} selecting one of **two server-known roots**; never concatenated into a path; unknown → reject on write. |
| **Elevation (proposal → live without approval)** | A pending `/kai` proposal becomes recallable with no human approve (auto-promote, background job, "apply all", or recall scanning the proposals dir). | **HIGH** | **C-220, C-221** — proposals live in a third dir NOT scanned by `readKb` and NOT read by the match predicate; inert by **location**; no auto-apply path exists. |
| **Stored XSS (untrusted proposal/front-matter)** | Proposal body or a front-matter value renders as live HTML/script in the inbox or list. | **HIGH** | **C-225, C-208, C-241** — interpolation-only (no `[innerHTML]`/`bypassSecurityTrust*`), enforced by the `no-unsafe-binding` source-scan + a behavioral non-execution test. |
| **Injection / proto-pollution / DoS (front-matter)** | A hand-edited or `/kai`-authored doc with a `__proto__`/`constructor` key, a nested object, or a giant block pollutes the prototype or crashes the scanner. | **HIGH** | **C-208** — bounded line reader, schema-keys-only, closed vocabularies, `FORBIDDEN_KEYS` dropped, scalars/flat-lists, size-capped, **never throws**. |
| **Tampering (front-matter ≠ vault)** | A hand-edited file's `scope:` disagrees with its holding vault to widen reach. | **MED** | **C-207** — the **holding vault wins for authorization** (the containment boundary `/secops` can prove); front-matter is display/intent. A divergent hand-edit cannot widen reach beyond its vault. |
| **Integrity (approve bypasses chokepoint)** | The approve write skips containment/O_EXCL/caps. | **HIGH** | **C-222** — approve writes via the **same** `addKbNote` at the chosen scope; reject retained, never recalled; both audited. |
| **Info-disclosure (error leak)** | A refusal echoes an absolute server path (esp. a `$HOME`-rooted common-vault path) or a stack trace. | **MED** | **C-213** — terse messages; no absolute paths, no stack traces, no `$HOME` leak. |
| **Dishonest capability** | Scope/tags imply semantic recall, or "Common" implies cloud. | **MED** | **C-240, C-242** — `filename-only` preserved; "Common" = the user's own projects on this machine, never cloud. |

No CRITICAL findings. Every HIGH is converted to a binding, tested condition.

---

## 2. Reused baseline (the ADT-223 set, applied per-vault)

Every new write path (scoped project add, approve-as-project, approve-as-common) **re-satisfies the
ADT-223 conditions C-1..C-12 / N-1..N-13** from `secops-interactive.md`, **with the containment root set
to the *target* vault**. This pass does not re-derive them; it **binds them onto each new write path** via
C-204/C-206/C-222 and re-proves them against the common root in §6. If any ADT-223 negative would fail
on the common vault or the approve path, this gate is **not** met.

---

## 3. BINDING conditions — ADT-234 `SECOPS_APPROVED` (HARD)

**C-201 — The common vault is realpath-contained to a server-known root (NET-NEW).** `scope:common`
resolves to `resolveCommonKbDir()` = `realpath` of `~/.aidevteam/kb-common/` (via `aidevteamHome()`,
created if absent like the project default). **Before any write**, realpath the target's parent and
assert `isContained(realCommonRoot, realParent)` using the **trailing-separator** rule (`write.js:136`)
— a sibling `~/.aidevteam/kb-common-evil` must NOT pass. A symlinked common vault, or a planted symlink
entry, whose target escapes the root → **reject, nothing written**. The common root is the **one new
containment root** of this ticket.

**C-202 — Filename stays 100 % server-derived for BOTH vaults.** The client supplies `title`, `body`,
and the **enum** `scope`/`stack`/`kind` — **never** a path, filename, directory, vault, or extension.
The `<slug>.md` (server slug, server-fixed `.md`, collision → unique numeric suffix) and the chosen vault
root are server constants. A `title` slugging to `../../x`, `/abs`, `a/b`, `x.md.sh`, or NUL collapses to
one contained `*.md` **or is rejected** — in **either** vault.

**C-203 — O_EXCL no-overwrite holds on the common vault.** `writeNewFileExclusive` (`wx`) on the common
target never follows/truncates a pre-existing entry (symlink included); collision → unique-suffix retry;
atomic. Proven with a real pre-existing file AND a real symlink in the common vault (N-203).

**C-204 — Size cap + text/markdown allowlist on every new write path.** `kbBodyError` (≤ 64 KB, UTF-8
text, no binary/control-soup, surrogate-safe) and the ≤ 200-char title cap apply unchanged to the scoped
add and both approve writes. Oversize/binary → reject before write, nothing persisted.

**C-205 — Write-guard required on every new mutation route.** Scoped add (and ADT-235's approve/reject)
sit on the `/api/*` POST path that runs `writeAllowed`. Missing X-AIDT / non-loopback Host or Origin /
non-loopback socket (without `--allow-remote-writes`) → `403`, nothing written. No permissive CORS.
(Inherited by placement; prove the negative — N-205.)

**C-206 — `scope` is a server-validated ENUM, never a client path.** `scope ∈ {project, common}`,
default `project` when absent (the safest, least-sharing choice — AC-2). The enum **selects which of two
server-known roots** the write targets; it is **never** concatenated into a path, never names a directory,
never sets a vault path. A request supplying a path-shaped scope (`"../x"`, `"/abs"`, `"common/../.."`),
an out-of-enum scope, or any attempt to set the target by supplying a path → **rejected on write**,
nothing persisted, **no path detail leaked** (AC-9). The `global` token is **read-aliased to `common`**
on parse only; `global` is **never written**.

**C-207 — Holding vault wins for authorization (front-matter is display/intent).** When a hand-edited
file's `scope:` front-matter disagrees with the vault that physically holds it, the **holding vault**
decides reach for the recall/authorization decision (it is the containment boundary `/secops` proves).
The writer always emits agreement; a divergent hand-edit **cannot widen** a file's reach beyond its vault.

**C-208 — Front-matter parsing is injection / proto-pollution / DoS-safe and never throws (NET-NEW).**
The new KB front-matter reader: recognizes **only** a leading `---\n…\n---` block (same shape
`markdownBody` strips); parses **only** the schema keys (`scope`, `stack`, `kind`, `status`, `created`,
`by`) and **ignores all others** (no arbitrary-key ingestion); drops `FORBIDDEN_KEYS`
(`__proto__`/`constructor`/`prototype`) using own-property assignment only (mirroring
`state.js:166-174`); accepts **scalars or short flat lists of scalars only** (never a nested object,
never executed); applies closed vocabularies (`scope`/`kind`/`status` enums; `stack` against the analyzer
vocabulary ∪ `any`, unknown tokens **dropped** not thrown, capped ≤ 16); is **size-bounded**; and on any
malformed/oversize/hostile block **degrades to all-defaults** (`scope:project, stack:["any"],
kind:context`) and **never throws** (the `state.js` never-throw contract). A front-matter key like
`__proto__: x` does not pollute `Object.prototype`; a value like `scope: "../../etc"` cannot widen reach
(C-206/C-207); a value `by: "<script>"` is stored inert and escaped on render (C-241).

**C-209 — Reading Common never leaks a project-scoped note, and vice-versa.** The common scan reads
**only** the resolved common vault; each project scan reads **only** that project's vault (via
`record.path`, D-006). A project's projection/recall **never** contains another project's `scope:project`
rows; the Common view **never** contains a project-scoped note. (The proven `claude/memory` AND-equality
filter — `collections.ts:18`, `restore-context.ts:69-71` — is preserved; `stack` is an additional AND
term, not a relaxation.)

**C-210 — Cross-type match is the strict additive predicate (no stack leak).** Visible/recallable to a
project = `(source==project AND it is THIS project's vault) OR (source==common AND status==approved-common
AND ("any" ∈ doc.stack OR doc.stack ∩ project.stack ≠ ∅))`. A `java` project sees its own + common tagged
`java`/`any` and **never** common tagged only `python` (AC-5); a no-stack (`any`) project sees its own +
**only** `any`-tagged common (AC-6). The project's declared `stack` comes from `.aidevteam/config.json`
`knowledge.stack` (precedence: manual > analyzer `detectStack` > `["any"]`) — an untrusted config value,
normalized against the closed vocabulary, never used as a path.

**C-211 — The match predicate + front-matter parse are single-source-of-truth (hub ↔ memory parity).**
`scopeMatches(doc, project)` and the front-matter parse live in **one** shared dependency-free module
consumed by both the hub projection and the memory recall path; where the TS/JS boundary forbids a direct
import, the predicate is **mirrored with a parity test** asserting byte-identical results across a shared
fixture table (the cross-implementation parity mandate, §6 of the ADR). One vocabulary, one `any`-wildcard
rule, one `global→common` alias — evaluated identically on both sides, so a note shown in the panel is
never invisible to recall (or vice-versa).

**C-212 — `commonVaultDir` override is realpath-resolved and is itself the containment root.** If
`~/.aidevteam/config.json` carries `knowledge.commonVaultDir`, it is realpath-resolved and **becomes the
containment root** for common writes (C-201 applies to it). The default needs no config. A relative,
NUL-bearing, non-directory, or symlink-escaping override → degrade to the default or refuse the common
write — never write to an unresolved/uncontained path.

**C-213 — No info leak in errors.** `400`/`409`/`413` bodies are terse and **never** echo an absolute
server path, a `$HOME`-rooted common-vault path, or a stack trace.

**C-214 — Single mutation chokepoint, atomic.** The only new write goes through `addKbNote` (extended).
No second module touches the vault files. Each write is atomic (O_EXCL create + fsync). A reader never
sees a partial file.

---

## 4. BINDING conditions — ADT-235 `SECOPS_APPROVED` (HARD)

**C-220 — Pending proposals are inert by LOCATION, not by a filter (NET-NEW).** Proposals live in
`~/.aidevteam/kb-proposals/`, a third store **distinct from both vaults**. It is **NOT** scanned by
`readKb`/the common scan and **NOT** read by `scopeMatches`/the recall predicate. Inertness is a property
of *where the bytes are*, not of a status filter that could be regressed. Prove: a `status:pending`
proposal appears in **no** project's Knowledge recall/list — only in the proposal inbox.

**C-221 — No path from pending → recall without an explicit human approve.** There is **no**
auto-promotion, no background job, no "apply all", no scheduled sweep. With zero approval action, **nothing**
is written into a recallable vault and **no** project recalls the proposal (AC-5, the trust contract).

**C-222 — Approve writes via the SAME guarded/contained chokepoint at the chosen scope.** Approve is an
**explicit human action only**. `approve-as-common` → common vault (`status: approved-common`);
`approve-as-project` → current project vault (`status: approved-project`) — each via the **same** extended
`addKbNote` at the chosen scope, so **all** of C-201..C-208/C-213/C-214 (containment, O_EXCL, caps,
text-only, server slug, no-leak) hold on the approve write. No approve path bypasses the chokepoint or
writes to a vault other than the one the chosen scope names.

**C-223 — Approve/reject are audited; reject is retained and never recalled.** Each decision writes an
audit record (who/`decidedBy`, when/`decidedAt`) via the existing append-only `appendComment` trail
(`write.js:232-253`) and stamps the proposal. **Reject** sets `status:rejected`, is **retained** in the
proposal store for audit, removed from the inbox, and **never** recalled by any project (AC-4).

**C-224 — Approve re-authorizes against the stored proposal (BOLA/IDOR defense).** The approve handler
re-reads the stored `pending` proposal by id and acts on **its** content + the **server-resolved** scope
(common root, or the **server-resolved current project**), not on client-supplied content masquerading as
an approval. A request carrying a foreign/forged/stale id, or attempting to approve into a scope the
server did not resolve, is refused **and nothing is written**. (Assert no write occurred, not merely the
refusal — `secops-engineer` BOLA mandate.)

**C-225 — Proposed text + ALL front-matter values are UNTRUSTED → stored inert, rendered escaped, never
executed.** `/kai`-authored `content`/`title`/`why` and every front-matter value are model/untrusted
input: stored inert in the proposal store (outside recall), rendered **interpolation-only** in the inbox
(no `[innerHTML]`/`bypassSecurityTrust*`/`v-html` — the FE `no-unsafe-binding` source-scan
`studio/cockpit/src/app/testing/no-unsafe-binding.spec.ts` covers KB/proposal content), **never executed,
never auto-applied**. On approve, the same body validation as a user add applies (C-204).

**C-226 — The proposal store parser is bounded and never throws.** Reading the JSONL/front-matter
proposal store reuses the C-208 posture (schema-keys-only, `FORBIDDEN_KEYS` dropped, scalars/flat-lists,
size-bounded, never-throws). A malformed proposal record is skipped, not fatal; a `__proto__` key does
not pollute; a hostile value does not break parsing.

**C-227 — The approve action name reflects the chosen scope (no silent over-share).** The confirming
action plainly states the scope it applies ("Approve as Common" / "Approve as This project") so an
accidental click cannot silently widen reach (AC-7). The over-share guard is a **product** + **render**
control; the **authorization** control is C-222/C-224 (the server writes only to the scope it resolved).

**C-228 — Write-guard required on approve/reject routes.** Same as C-205: approve/reject are mutations on
the guarded `/api/*` POST path. Missing X-AIDT / non-loopback Host/Origin / non-loopback socket → `403`,
nothing written, no recall change. (Prove the negative — N-228.)

**C-229 — Recall precedence (project-overrides-common) is a render annotation, not a suppression or an
authorization control.** When a matching `common` and `project` item conflict, both surface and the
project item is **flagged authoritative** — nothing is hidden. This is a projection/render rule and must
**not** be relied on as a security boundary (the boundary is C-209/C-210).

---

## 5. Cross-cutting honesty conditions (BOTH tickets)

**C-240 — Honest indexing preserved.** Scope/tags/proposals add **no** semantic-recall claim. The
`method` line stays `filename-only` unless a **real** embedder is configured (`embedderConfigured` reads
**only** the `memory.embeddings` selector — **never** a secret — to decide; `state.js:385-413`). No
embedding job is triggered by add/approve. Claiming "indexed"/semantic without a configured embedder is a
dishonest-capability finding.

**C-241 — Untrusted-content render obligation is source-scan-enforced.** No KB/proposal/front-matter
value is bound via `[innerHTML]`/`bypassSecurityTrust*`/`v-html`. Enforced by the existing
`no-unsafe-binding` source-scan **plus** a behavioral non-execution test on a `<script>`/`<img onerror>`/
`javascript:` payload in a body, a tag, and a `by:` value.

**C-242 — "Common" = the user's own projects on this machine, never a cloud/account.** Any user-facing
"Common"/"Shared" copy is scoped to local projects on this machine. Reject any strengthened absolute
("synced to the cloud", "shared with your team", "100 % private"). The `/legal` privacy-copy review of the
"Common = across your own projects on this machine, never a cloud/account" phrasing (DECISION_LOG item 3)
**must complete before the honesty copy ships** — this gate re-opens if any privacy/security assurance is
strengthened. (No egress exists in ADT-234/235; egress is ADT-236, separately gated.)

---

## 6. Negative-test checklist `/rev` MUST confirm

The gate is met only when these ship green. `/rev` confirms **each is a real test that would FAIL if its
control were removed** — not a comment, not a happy-path assertion. **Method for the write-refusal tests:
snapshot the relevant vault/store (file list + bytes) before the refused request and assert it is
byte-identical after** — assert *no write occurred*, not merely the error code.

### ADT-234 (HARD — N-201…N-219)

- [ ] **N-201 (common-vault traversal contained/rejected):** a `scope:common` add with
      `title:"../../etc/passwd"` → a contained `*.md` **inside** `~/.aidevteam/kb-common/` **or** `400`;
      no file at/above `/etc`, nothing outside the common root. List the FS after.
- [ ] **N-202 (sibling-prefix trap on the common root):** a write cannot land in a sibling
      `~/.aidevteam/kb-common-evil/`; the trailing-separator containment rejects it.
- [ ] **N-203 (common-vault symlink escape — REAL symlink):** (a) the common vault is a symlink whose
      target is outside `~/.aidevteam`, and (b) a symlink planted at the common target points outside —
      each → rejected, **nothing written** (assert via the real target dir).
- [ ] **N-204 (O_EXCL no-overwrite on common):** two common adds with the same title never replace the
      first; a unique-suffixed `*.md` is created (or the second rejected); the first file's bytes unchanged.
- [ ] **N-205 (write-guard on scoped add):** `scope:common` and `scope:project` adds **without** X-AIDT,
      with a non-loopback Host, and with a cross-site Origin → each `403`; nothing written in either vault.
- [ ] **N-206 (scope is an enum, not a path):** an add with `scope:"../../etc"`, `scope:"/abs"`,
      `scope:"common/../.."`, and `scope:"bogus"` → rejected on write; nothing persisted; **no path
      detail** in the error body.
- [ ] **N-207 (over-cap / non-text on common):** an over-64 KB body and a NUL/binary body on a
      `scope:common` add → `400`/`413`, nothing written, clean response (no socket reset).
- [ ] **N-208 (front-matter proto-pollution):** a doc whose front-matter carries `__proto__:`,
      `constructor:`, `prototype:` → parsed with those keys dropped; `({}).polluted` is undefined after;
      the doc still reads (degrades to defaults), parser **does not throw**.
- [ ] **N-209 (front-matter malformed / nested / oversize never throws):** a nested-object value, a giant
      block, and a truncated `---` fence → each degrades to all-defaults (`scope:project, stack:["any"],
      kind:context`); the scanner returns and never throws.
- [ ] **N-210 (cross-project isolation — project↔project):** project A's recall/list contains **none** of
      project B's `scope:project` rows; the Common view contains **no** project-scoped note.
- [ ] **N-211 (cross-type stack leak — the core negative):** with a `java`-tagged common note, a
      `python`-tagged common note, and a `java` project → recall returns the `java` + `any` common notes
      and the project's own, and **never** the `python` common note (AC-5). A no-stack project sees
      **only** `any`-common + its own (AC-6).
- [ ] **N-212 (hub ↔ memory parity):** the shared `scopeMatches`/front-matter parse produces
      **byte-identical** results across the shared fixture table on both the hub and the memory side; a
      fixture that matches in the hub but not in memory (or vice-versa) fails the test.
- [ ] **N-213 (front-matter scope ≠ vault → vault wins):** a file physically in the **project** vault whose
      front-matter says `scope:common` is treated as **project** for authorization (does not leak into
      other projects' Common); a file in the **common** vault whose front-matter says `scope:project` is
      still governed by the common root — neither hand-edit widens reach beyond its holding vault.
- [ ] **N-214 (`commonVaultDir` override contained):** a `knowledge.commonVaultDir` that is relative /
      NUL-bearing / a non-directory / a symlink escaping `$HOME` → the common write degrades to the
      default or is refused; never writes to the uncontained override path.
- [ ] **N-215 (no info leak in errors):** every refusal above returns a body with **no** absolute path
      (esp. no `$HOME`/common-vault path) and **no** stack trace.
- [ ] **N-216 (honest indexing):** with no embedder configured, the method line is `filename-only` after
      adds in both scopes; no add/approve triggers an embedding job; the selector read touches no secret.
- [ ] **N-217 (default scope = project):** an add with **no** scope persists as `scope:project` (safest),
      lists under "This project", and is not visible to any other project's Common.
- [ ] **N-218 (shared-not-copied):** a `scope:common` note saved while viewing project A appears in
      matching project B's Common view from the **single** `~/.aidevteam/kb-common/` file — assert exactly
      one file on disk, not one-per-project.
- [ ] **N-219 (inert render — no stored XSS, ADT-234):** a `<script>`/`<img onerror>`/`javascript:`
      payload in a body, a `stack`/`kind` tag, and a `by:` front-matter value renders as **escaped text**
      (source-scan: no `[innerHTML]`/`bypassSecurityTrust*` on KB content + behavioral non-execution).

### ADT-235 (HARD — N-220…N-233)

- [ ] **N-220 (pending is inert by location):** a `status:pending` proposal in `~/.aidevteam/kb-proposals/`
      appears in **no** project's Knowledge recall/list — only in the proposal inbox. `readKb`/the common
      scan/`scopeMatches` never read the proposals dir (assert by source + behavior).
- [ ] **N-221 (no auto-apply — the trust contract):** with **no** approval action, snapshot both vaults →
      after any number of proposals are recorded, both vaults are **byte-unchanged** and no project
      recalls any proposal. There is no code path (job/sweep/apply-all) from pending → recall.
- [ ] **N-222 (approve-as-common writes only to the common vault, guarded+contained):** approving as
      Common writes one `status:approved-common` file **inside** the common root via `addKbNote` (C-201..
      C-208 re-proven on the approve write: traversal contained, O_EXCL, cap, text-only, no path leak);
      nothing written to the project vault.
- [ ] **N-223 (approve-as-project writes only to the current project's vault):** approving as This-project
      writes one `status:approved-project` file in **this** project's vault, recallable **only here**;
      nothing in the common vault or any other project.
- [ ] **N-224 (approve/reject audited):** each decision appends an audit record (decidedBy, decidedAt) via
      `appendComment`; the record exists in the JSONL after the action.
- [ ] **N-225 (reject retained, never recalled):** rejecting sets `status:rejected`, keeps the record in
      the proposal store, removes it from the inbox, and **no** project ever recalls it.
- [ ] **N-226 (BOLA on approve):** an approve carrying a **foreign/forged/stale** proposal id, or
      attempting to approve into a scope the server did not resolve, is refused **and** both vaults are
      byte-unchanged (assert no write, not just the error).
- [ ] **N-227 (proposal-store parser safe):** a proposal record with `__proto__`/nested/oversize content
      is skipped (not fatal), pollutes nothing, and the inbox still renders the valid records.
- [ ] **N-228 (write-guard on approve/reject):** approve and reject **without** X-AIDT / with non-loopback
      Host/Origin / off a non-loopback socket → `403`; no vault write, no recall change.
- [ ] **N-229 (approve write is the same chokepoint):** an over-cap or non-text proposal body on approve is
      rejected by `kbBodyError` exactly as a user add; a traversal-shaped title on approve is contained or
      rejected — the approve write inherits **every** ADT-223 condition.
- [ ] **N-230 (inert render — no stored XSS, ADT-235):** a proposal whose `content`/`why`/`title` contains
      `<script>`/`<img onerror>`/`javascript:` renders as **escaped text** in the inbox (source-scan +
      behavioral non-execution); the proposal is never executed.
- [ ] **N-231 (action name reflects scope):** the confirming control reads "Approve as Common" vs "Approve
      as This project" per the chosen scope (no generic "Approve" that could silently over-share).
- [ ] **N-232 (precedence is annotation, not suppression):** when a common and a project item conflict,
      **both** surface and the project item is flagged authoritative — nothing is hidden, and the flag is
      not used as an authorization decision.
- [ ] **N-233 (honest framing):** the inbox states nothing is shared until the user approves; the empty
      state explains `/kai` surfaces recurring knowledge for review; no cloud/upload claim (C-242).

---

## 7. Gate decisions

**ADT-234 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** C-201…C-214 (§3) + C-240…C-242 (§5), proven by N-201…N-219 (§6).
- **Net-new code flagged (not free reuse):** the common-vault resolver + its containment root, the scoped
  `addKbNote` params + the `scope:common` branch, the front-matter reader, and the `stack` match term +
  hub↔memory parity are **net-new** and each carries a proving test; the ADT-223 per-vault baseline is
  reused but **re-proven against the common root**.
- **No CRITICAL/HIGH left open:** cross-project recall, common-vault escape, scope-as-path spoofing,
  front-matter injection/proto-pollution, and stored XSS are each a binding, tested condition.
- **BLOCKED until:** C-201…C-214 ship with N-201…N-219 green and pass `/rev`.

**ADT-235 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate (safety-override).**
- **Binding on:** C-220…C-229 (§4) + C-240…C-242 (§5), proven by N-220…N-233 (§6).
- **Load-bearing controls:** proposals inert **by location** (C-220/C-221), approve via the same
  guarded/contained chokepoint at the server-resolved scope with BOLA re-authorization (C-222/C-224),
  reject retained+never-recalled+audited (C-223), and untrusted content stored inert + rendered escaped
  (C-225/C-226).
- **BLOCKED until:** C-220…C-229 ship with N-220…N-233 green and pass `/rev`.

**ADT-236 — NOT in scope.** No egress surface is approved by this pass; the mem0/OpenMemory adapter keeps
its own HARD SECOPS egress gate (D-012).

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-09 · **Status:** APPROVED WITH CONDITIONS
(ADT-234 HARD conditional on C-201…C-214 + C-240…C-242, proven by N-201…N-219; ADT-235 HARD conditional
on C-220…C-229 + C-240…C-242, proven by N-220…N-233) · **Next:** ADT-234/235 → `/be` (scope/tag
persistence, common-vault resolver, front-matter reader, pending store, approve/reject) + `/fe` (rename,
scope control, tag chips, scoped add form, propose-inbox) under TDD — must ship the N-tests above →
`/rev` verifies each condition in code → `/verify`. `/legal` privacy-copy review (C-242) before the
"Common" honesty copy ships. Then `/sm` — please update sprint status.
