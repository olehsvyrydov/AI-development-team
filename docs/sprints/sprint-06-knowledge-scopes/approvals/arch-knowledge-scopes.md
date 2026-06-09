# ARCH approval — Knowledge scopes (file-based) + /kai propose-inbox

**Gate:** `ARCH_APPROVED` (hard) · **Owner:** `/arch` (Jorge) · **Decision:** **APPROVED** for **ADT-234** and **ADT-235**
**Date:** 2026-06-09 · **Sprint:** sprint-06-knowledge-scopes · **Preset:** solo · **Track:** full (both)
**Out of scope (noted, deferred):** **ADT-236** — mem0/OpenMemory interpretation-check Q&A adapter — per **D-012** is a follow-on slice with its own HARD SECOPS egress gate. No architecture is ratified for it here.

This ADR ratifies the open items routed to `/arch` by the DECISION_LOG (D-010..D-014) and the binding strategy **D-009** (local markdown vault is the default; existing OSS tools are optional overlays — this chunk is **file-based scopes/tags + a propose-inbox, not a custom memory engine**). It draws boundaries; the implementers (`/be`, `/fe`) decide HOW within them under TDD.

---

## 1. Context & constraints (what already exists — extend, do not reinvent)

| Existing fact (file) | What it gives this chunk |
|---|---|
| `hub/lib/state.js` `readKb()` | Scans the **first-existing** project KB dir (`docs/` → `kb/` → `.aidevteam/kb`), `.md` only, returns `{name, file}`. The place to add front-matter parsing. |
| `hub/lib/state.js` `buildBase()` / `embedderConfigured()` | The honest projection: `method` is `filename-only` unless a memory config selects an embedder. Scope/tags must **not** change this honesty. |
| `hub/lib/write.js` `addKbNote()` | The **single guarded write chokepoint** (ADT-223): realpath-containment (`isContained`), `O_EXCL` never-overwrite (`writeNewFileExclusive`), 64 KB cap, text-only body (`kbBodyError`), server-derived slug filename (client never supplies a path), atomic create. **Every new write path reuses this.** |
| `hub/lib/api.js` `kb/add` + `hub/lib/resolve-project.js` | The route; `project` is a registry **lookup key** resolved to a canonical `record.path` (D-006) — never concatenated into a path. The new routes ride the same resolution + guard. |
| `hub/lib/guard.js` | Loopback + `X-AIDT` + Host/Origin write guard. Unchanged; the new write routes are mutations and pass through it. |
| `claude/memory/` (`stores/collections.ts`, `hooks/restore-context.ts`, tests) | The **proven scope model**: payload carries `project_id` + `scope ∈ {project, global}`; recall is **AND-combined equality filters**; `FILTERABLE = [project_id, scope, chunk_type, session_id]`. A project query never returns another project's or global rows; a `scope:global` query returns only global. **This chunk adds dimensions to this model; it does not replace it.** |
| `hub/lib/analyze.js` `detectStack()` | Already produces a deterministic `stack[]` (e.g. `typescript`, `java`) — the auto-detect source for the project's declared stack. |

**Quality attributes that dominate this design (ATAM):**
- **Security / isolation (H, H)** — scope is an *authorization boundary*: a project must never recall another project's project-scoped knowledge, and a `scope:common` claim is the cross-project leak vector. This is the sensitivity point the whole design pivots on.
- **Consistency (H, M)** — the hub projection AND the memory hooks must agree on scope/match, or a note shown in the panel is invisible to recall (or vice-versa). Drives the **shared-rule / single-source-of-truth** decision (§6).
- **No-egress / local-first (H, L)** — pure file reads/writes; zero network in this chunk. Inherited, must not regress.
- **Maintainability (M, M)** — additive front-matter on the existing scanner + a second vault dir + one new write target; no new engine, no schema migration.

---

## 2. ADT-234 — Decision A: front-matter is the source of truth (D-013)

A Knowledge doc is a markdown file. Its scope/tags live in **YAML front-matter** at the top of the file; the front-matter is the **canonical** record of scope, and the vault that holds the file is the *physical* expression of that scope — the two are kept in agreement by construction (a project-vault file is `scope: project`, a common-vault file is `scope: common`). On a conflict (a hand-edited file whose front-matter disagrees with its vault), **the holding vault wins for the authorization decision** — see §7, R-2 — because the vault is the containment boundary `/secops` can prove, and front-matter is user-editable text.

### Front-matter schema (the contract `readKb` parses and the writer emits)

```yaml
---
scope:   project            # project | common   (canonical; `global` read-aliases to common — D-010)
stack:   [java]             # list of tokens from a closed vocabulary + "any"; default ["any"]
kind:    context            # one of: pattern | style | rule | context ; default "context"
status:  approved-project   # approved-project | approved-common | pending | rejected ; default approved-project for a direct user add
created: 2026-06-09T12:00:00Z
by:      user               # "user" for a manual add; "/kai" for an approved proposal
---
# Title

Body markdown…
```

**Field rules (all enforced server-side, all treated as untrusted — §7):**

| Field | Type | Default | Validation |
|---|---|---|---|
| `scope` | enum | `project` | One of `{project, common}`. `global` is **read-aliased** to `common` on parse (never written). Anything else → treated as `project` (safest) on read; **rejected** on write. |
| `stack` | list of enum | `["any"]` | Each token lowercased, matched against a **closed allow-list** (the analyzer's stack vocabulary ∪ `any`); unknown tokens dropped (not rejected — a hand-edited file stays readable), empty list → `["any"]`. Capped at 16 tokens. |
| `kind` | enum | `context` | One of `{pattern, style, rule, context}`; unknown → `context`. |
| `status` | enum | `approved-project` | One of `{approved-project, approved-common, pending, rejected}`. Only `approved-*` is recalled (§4). |
| `created` | ISO-8601 string | now | Parse-tolerant; display-only. |
| `by` | short string | `user` | Free token, escaped on render, ≤ 64 chars, no control chars. |

**Defaults (D-011): a doc that omits tags is `scope:project, stack:["any"], kind:context`** — the safest, least-sharing interpretation. The reader applies these defaults; it never fabricates a scope a file does not carry beyond "project" (narrowest).

### Parsing rule (extend the existing scanner, robustly — §7 R-1)

`readKb` (and the common-vault scan, §3) gains a **bounded, line-oriented front-matter reader** — *not* a general YAML library:
- Front-matter is recognized **only** as a leading `---\n … \n---` block (the same shape `markdownBody()` already strips).
- Parse **only the keys in the schema above**; ignore all other keys (no arbitrary key ingestion).
- Reuse the existing **`FORBIDDEN_KEYS` / prototype-pollution discipline** already in `state.js` (`__proto__`/`constructor`/`prototype` dropped) and `parseInline`-style scalar coercion — the projection object is built with own-property assignment only.
- Values are **scalars or short flat lists of scalars** — never nested objects, never executed. A malformed block degrades to "all defaults," never throws (consistent with `state.js`'s never-throw contract).

This keeps front-matter parsing in the **same security posture** as the existing `labels:`/`rules:` parsing — bounded keys, closed vocabularies, prototype-safe.

---

## 3. ADT-234 — Decision B: vault layout + the merge / cross-type-match rule (D-011, D-013)

### Where files live

| Scope | Vault | Resolution |
|---|---|---|
| **project** | the existing first-existing project KB dir (`docs/` → `kb/` → `.aidevteam/kb`) — exactly what `readKb`/`addKbNote` use today | per project, via `record.path` (D-006) |
| **common** | a **single user-level shared vault** | **`~/.aidevteam/kb-common/`** by default, resolved the **same cascade** as the rest of user-global state (`aidevteamHome()` in `claude/memory/src/lib/paths.ts` — the same `~/.aidevteam` root that holds `config.json`, `registry.json`, `memory/`). One location for the whole machine. |

The common vault is **surfaced into every project's "Common" view without copying** — the projection reads the one shared dir and the project dir, and merges in memory. A "Common" note saved while viewing project A is physically one file in `~/.aidevteam/kb-common/`; project B's projection reads that same file. **No note is ever duplicated into N projects** (satisfies AC-7).

> **Common-vault default path is configurable but bounded.** The path resolves via the user-global root; an optional `knowledge.commonVaultDir` in `~/.aidevteam/config.json` may override it, but the override is **realpath-resolved and is itself the containment root** for common writes (§7). The default needs no config.

### The merged LIST / projection shape the Knowledge UI needs

`buildBase`/`readKb` are extended to return, per doc, the parsed front-matter facts and which vault it came from:

```
docs: [ { name, file, scope, stack:[…], kind, status, source: "project" | "common", index } … ]
```

plus per-scope live counts (`{ project: N, common: M }`) so the scope segmented control shows real counts (absent-not-zero per Apex). The UI's scope filter and tag chips operate over this single merged set (the FE filters client-side over what the projection returns — Aura §3).

### Cross-type matching rule (the recall/visibility contract — AC-5/6, D-011)

A project declares **its own** `stack` (and optional `domain`, reserved — `any` for now) once (§5). The set of knowledge **visible/recallable** to a project is the **union**:

```
( source == project  AND it is THIS project's vault )
OR
( source == common   AND status == approved-common
                     AND ( "any" ∈ doc.stack  OR  doc.stack ∩ project.stack ≠ ∅ ) )
```

Worked (the answer to "share across project types"):

| Project declared stack | Sees | Never sees |
|---|---|---|
| `java` | its own project notes + common notes tagged `java` or `any` | common notes tagged only `python` (AC-5) |
| `any` (research / no stack) | its own project notes + common notes tagged **only** `any` | any stack-specific common note (AC-6) |
| `[frontend, angular]` | own + common tagged `frontend`/`angular`/`any` | common tagged only `java`/`python` |

This is a strict, additive extension of the **proven** memory AND-equality model (`scope` + `project_id` already filter; `stack` becomes an additional filter term with an `any` wildcard). The hub projection and the memory hooks evaluate the **same** predicate (§6).

---

## 4. ADT-234 — Decision C: scoped add/list (reuse the ADT-223 chokepoint)

**Add-with-scope** extends `addKbNote(projectDir, { title, body, scope, stack, kind })`:

1. **Validate scope server-side** — `scope ∈ {project, common}`; default `project` when absent (AC-2). A `common` claim is accepted only after the scope passes validation; it is **not** a client-trusted field that selects an arbitrary path — it selects **which of two server-known vaults** the write targets (project's `record.path` KB dir, or the resolved common-vault dir). The client never supplies a path, filename, dir, or vault path — only the **enum** `scope`.
2. **Resolve the target vault** — `scope:project` → `resolveKbDir(record.path)` (unchanged); `scope:common` → `resolveCommonKbDir()` = realpath of `~/.aidevteam/kb-common/` (created if absent, like the existing `.aidevteam/kb` default).
3. **Reuse every ADT-223 condition on the resolved target**: realpath-containment **against the chosen vault's root** (a `common` write is contained to the common vault; a `project` write to the project vault), `O_EXCL` never-overwrite, 64 KB cap, text-only body, server-derived slug filename, atomic create. The containment root is the *target* vault — this is the one new realpath root `/secops` must verify (§7).
4. **Emit the front-matter** (§2) as the file header from the validated scope/stack/kind — the file is self-describing and Obsidian-editable (D-009).

**Scoped list** = the merged projection of §3, filtered by scope in the UI. The honest `method` line (`filename-only` unless an embedder is configured) is **unchanged** — scope/tags add no semantic-recall claim (AC-8).

**global→common alias (D-010):** on **read**, a doc or memory payload carrying `scope: global` is treated as `common`. On **write**, only `common` is ever emitted. **No `claude/memory` payloads are renamed** — the tested `scope: global` rows keep working; the alias is read-compatibility only. The hub never writes `global`.

---

## 5. ADT-234 — Decision D: project stack declaration (D-011)

The project's declared `stack` (that recall matches against) is read from **`.aidevteam/config.json`** — the **same project-local file `embedderConfigured()` already reads** — under a new `knowledge.stack` key (and reserved `knowledge.domain`):

```jsonc
{ "knowledge": { "stack": ["java"], "domain": ["any"] } }
```

**Precedence (ratified): manual declaration in config > analyzer auto-detect > `["any"]`.**
- If `knowledge.stack` is present and non-empty → use it (manual override).
- Else derive from the analyzer's `detectStack()` result (the same stack chips the home cards already show) → the auto-detected default.
- Else `["any"]` (a no-stack/research project — sees only `any` common, AC-6).

No registry-schema change, no new global store — the declaration is per-project and file-based, reusing a file the hub already reads. Tokens are normalized against the closed stack vocabulary (§2).

---

## 6. Cross-cutting decision: the match rule lives in ONE shared module (consistency)

**The visibility/match predicate of §3 is a single source of truth**, not re-implemented in two places. Per the framework's cross-component-contract guardrail, a predicate derived independently in the hub projection and the memory recall hook would drift and silently diverge (a note shown but not recalled). Decision:

- Extract `scopeMatches(doc, project)` and the front-matter parse into a **small shared lib** (a `hub/lib/` module, dependency-free, the same zero-dep style as `state.js`) that **both** `buildState`/`readKb` (the hub) **and** the memory recall path consume. Where the memory hook cannot import the hub lib directly (TS vs JS boundary), the predicate is mirrored **with a parity test asserting identical results** across a shared fixture table (the cross-implementation parity-test mandate). One canonical vocabulary, one `any`-wildcard rule, one alias rule — evaluated identically on both sides.

This is the maintainability/consistency trade-off point: a little extraction now prevents the worst failure mode (scope shown ≠ scope recalled).

---

## 7. ADT-235 — Decision E: the /kai propose → approve inbox (D-014)

### The pending store (inert until approved)

A proposal is **never** written into a recallable vault. It lives in a **separate pending store** distinct from both vaults:

- **Location:** `~/.aidevteam/kb-proposals/` (user-level, alongside the common vault under the same `~/.aidevteam` root) — a JSONL/markdown-with-front-matter store of `status: pending` items. It is **NOT** scanned by `readKb` and **NOT** read by the recall predicate (§3 only reads `project`/`common` vaults) — a pending proposal is inert to **all** recall by construction (AC-1, AC-5).
- **Why a third location, not the common vault:** model-authored (untrusted) content must be physically outside the recall path until a human approves — the SECOPS hinge. Putting it in the common vault would make "inert" a *filter* (fragile); a separate dir makes it inert by *location* (provable). This mirrors `/kai`'s existing propose→approve discipline (it already never auto-applies).

### Proposal data contract

```jsonc
{
  "id": "uuid",
  "status": "pending",                  // pending | approved-common | approved-project | rejected
  "content": "…proposed note body…",    // UNTRUSTED model output — stored inert, rendered escaped
  "title": "…",
  "suggestedScope": "common",           // common | project (a suggestion only — user decides)
  "suggestedStack": ["any"],
  "suggestedKind": "rule",
  "source": "/kai",
  "why": "seen in 4 tickets across 2 projects",  // recurrence evidence, untrusted, escaped on render
  "proposedAt": "ISO-8601",
  "decidedBy": null, "decidedAt": null  // set on approve/reject (audit)
}
```

### Approve / reject flow

- **APPROVE** (explicit human action only): the user confirms scope (`common` | `project`) + stack/kind, then the proposal is written into the corresponding vault **via the exact same guarded/contained writer from §4** (`addKbNote` with the chosen scope) — `approve-as-common` → common vault (`status: approved-common`), `approve-as-project` → current project vault (`status: approved-project`). The pending item is marked decided; the **approval is audited** (`decidedBy`, `decidedAt`, plus a comment via the existing `appendComment` audit trail). The approve action's name reflects the chosen scope (AC-2/3/7) — no silent over-share.
- **REJECT**: `status: rejected`, **retained in the pending store for audit**, removed from the inbox, **never recalled** (AC-4).
- **No path from pending → recall exists without an explicit approve** (AC-5). There is no auto-promotion, no background job, no "apply all."

### Untrusted content handling (AC-6)

Proposed content is **model output → untrusted**. It is: stored **inert** (in the pending store, outside recall); rendered **escaped** in the inbox (interpolation only, never `[innerHTML]` — the FE `no-unsafe-binding` rule already enforced for KB bodies); **never executed, never auto-applied**. On approve, the same body validation as a user add applies (text-only, capped, contained).

### Recall precedence: project overrides common (D-014)

When a `common` item and a `project` item both match a project and conflict, **both surface but the project-scoped item is marked as taking precedence** (the more-specific scope is the user's deliberate local override) — AC-K5. This is a *render/annotation* rule in the projection, not a suppression: nothing is hidden, the project item is flagged authoritative.

---

## 8. What `/secops` must HARD-verify (precise list — ADT-234 + ADT-235)

Scope is an **authorization boundary**. `/secops` runs the HARD gate on both tickets and must prove each of these negatives:

**S-1 — New common-vault write target is realpath-contained.** `~/.aidevteam/kb-common/` is a NEW write+read location **outside the project root**. Every `scope:common` write must be realpath-contained to the common-vault root (the ADT-223 `isContained` / `O_EXCL` / size-cap / text-only conditions, C-1..C-12, applied with the **common vault as the containment root**). Prove a crafted title/slug/symlink cannot escape the common vault.

**S-2 — Reading common must not leak project-scoped notes.** The common-vault scan reads **only** the common vault; the project scan reads **only** that project's vault (via `record.path`, D-006). A project must **never** recall another project's `scope:project` notes. Prove project A's projection/recall never contains project B's project-scoped rows.

**S-3 — `scope:common` is server-validated, never a client path.** The `scope` field is an **enum that selects one of two server-known vaults** — it is never concatenated into a path, never names a directory. Prove a request claiming `scope:common` (or any out-of-enum scope, or a path-shaped scope) cannot write outside the resolved vault and cannot set a scope by supplying a path (AC-9).

**S-4 — Pending proposals are inert until explicit approval.** No path exists from a `pending` proposal to recall without a human approve. Prove: with no approval, no project recalls the proposal and **nothing** is written into a recallable vault (AC-5). The pending store is not scanned by `readKb` and not read by the match predicate.

**S-5 — Approve write is scope-authorized + audited; reject retained, never recalled.** The approve write rides the same guarded/contained writer (§4) at the chosen scope; the decision is audited (who, when). Reject is retained for audit and never recalled (AC-4).

**S-6 — Proposed (and all front-matter) content is untrusted.** Model-authored proposal text and all front-matter values are escaped on render (interpolation only, no `[innerHTML]`), never executed, never auto-applied. Front-matter parsing is **injection/prototype-pollution-safe**: bounded to the schema keys, closed vocabularies, `FORBIDDEN_KEYS` dropped, no nested-object ingestion, never throws (§2).

**S-7 — ADT-223 conditions hold on EVERY new write path.** The scoped add, the approve-as-common write, and the approve-as-project write each reuse realpath-containment, `O_EXCL` no-overwrite, the 64 KB cap, text-only body, and the server-derived slug filename. No new write path bypasses the chokepoint. The existing loopback + `X-AIDT` + Host/Origin guard (`guard.js`) covers the new mutation routes unchanged.

**S-8 — Honesty preserved.** Scope/tags add no semantic-recall claim; the `method` line stays `filename-only` unless an embedder is configured (AC-8). "Common" is across **the user's own projects on this machine** — never a cloud/account (the `/legal` privacy-copy review of D-014 still applies before the honesty copy ships).

---

## 9. Risks & mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | **Front-matter parse is an injection / proto-pollution / DoS surface** (hand-edited or `/kai`-authored). | Bounded line-oriented reader, schema-keys-only, closed vocabularies, `FORBIDDEN_KEYS` dropped, scalars/flat-lists only, never-throw, size-capped — same posture as the existing `labels:`/`rules:` parse (S-6). |
| R-2 | **Front-matter scope disagrees with the holding vault** (hand-edited file moved between vaults). | The **holding vault wins for authorization** (it is the containment boundary `/secops` proves); front-matter is display/intent. The writer always emits agreement; a divergent hand-edit cannot widen reach beyond its vault. |
| R-3 | **Hub projection and memory recall drift** (note shown but not recalled, or vice-versa). | Single shared `scopeMatches`/front-matter module consumed by both, or a mirrored predicate with a **parity test** over a shared fixture table (§6). |
| R-4 | **Common-vault override path escapes the user-global root.** | The optional `knowledge.commonVaultDir` is realpath-resolved and becomes the containment root for common writes; default needs no config (§3, S-1). |
| R-5 | **Stack-token explosion / unknown tokens** break matching. | Closed allow-list (analyzer vocabulary ∪ `any`), unknown tokens dropped on read, capped count; `any` wildcard is the safe fallback (§2, §5). |
| R-6 | **A `common` note over-shares** because a mis-tag makes it visible to the wrong stack. | Default `stack:["any"]` is the *most* shared but stack-agnostic (house rules); stack-specific sharing is opt-in via an explicit tag; the approve action names the scope so an accidental click cannot silently over-share (AC-7, §7). |

---

## 10. ATAM summary

- **Sensitivity point:** the scope-authorization boundary (S-1..S-5) — a single misjudged write target leaks across projects. Mitigated by physical vault separation + realpath containment + a separate inert pending store.
- **Trade-off point:** extracting the match predicate into one shared module (§6) costs a little structure but buys hub/recall consistency — accepted.
- **Non-risks:** no-egress (pure file I/O), no schema migration (additive front-matter), no new engine (D-009 honored), the rename is a string/label change keeping stable test ids.

**Decision: ARCH_APPROVED — passed — for ADT-234 and ADT-235.** Implementation (`/be`, `/fe`) proceeds under TDD within these boundaries; `/secops` runs its HARD gate against §8 before code is considered done. ADT-236 remains a deferred follow-on (D-012) with no architecture ratified here.
