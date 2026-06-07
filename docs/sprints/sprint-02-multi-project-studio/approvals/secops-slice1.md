# SECOPS — Slice 1 Threat Model & Gate Decision

> **/secops (Soren) — Principal Security Engineer. `SECOPS_APPROVED` gate (hard, safety-override) for the LOCAL, no-exec foundation of the Multi-Project Studio.**
> Scope reviewed: project registry (`~/.aidevteam/registry.json`), connect+analyze flow (validate → canonicalize → read artefacts or deterministic no-LLM analysis → write `<root>/.aidevteam/profile.json`), and the new control-plane HTTP endpoints (`GET /api/projects`, `POST /api/projects/connect`, `GET /api/projects/:id`, `DELETE /api/projects/:id`, optional `POST /api/projects/:id`). Surfaces **S1–S5 and S8**.
> Input: `approvals/arch-slice1.md` (ARCH_APPROVED, conditional). Existing controls inspected in source: `hub/lib/guard.js`, `hub/lib/write.js`, `hub/lib/state.js`, `hub/lib/api.js`, `hub/server.js`.
> **OUT OF SCOPE — NOT approved by this pass:** S6 (AgentRunner host-CLI **execution**, ADT-230) and S7 (remote **SSH** execution, ADT-234). These remain **gated**; each requires its **own dedicated hard SECOPS pass** before any exec path is enabled. This document reviews their *contract/seam shape* only and confirms they stay blocked.

**Verdict (summary up top):** **`SECOPS_APPROVED` — CONDITIONAL** for the Slice-1 local, no-exec foundation (S1–S5, S8). Approval is binding on the **17 numbered conditions in §4**, which become acceptance criteria that `/rev` and `/e2e` verify. **No CRITICAL or HIGH finding is left unaddressed** — all are converted into binding conditions. **S6 and S7 are explicitly NOT approved** and remain hard-gated.

---

## 0. Verification of the controls this design reuses (I read the source — they are real)

A gate that rubber-stamps "reuse existing controls" without reading them is malpractice. I inspected each:

| Control claimed | Source | Verified behavior | Caveat surfaced for this slice |
|---|---|---|---|
| Anti-CSRF / DNS-rebinding guard | `guard.js::writeAllowed` | **Confirmed**: X-AIDT header required + Host pinned to loopback + Origin (when present) pinned to loopback + loopback-socket unless `--allow-remote-writes`. No permissive CORS emitted anywhere. Sound. | server.js currently guards **only `POST /api/`** (server.js:144). **`DELETE` is not in the dispatch at all today**, and `:id` path-param routing does not yet exist. New mutations must be explicitly routed through the same `writeAllowed` call — see C7. |
| Atomic writes | `write.js::atomicWriteJSON` | **Confirmed**: `mkdir -p` → write to `*.tmp.<pid>.<seq>` → `fsync` → `rename` (atomic same-fs). No torn files. | `atomicWriteJSON` is **not self-locking**; serialization is a *separate* `withLock` tail-promise mutex. Registry persists MUST be wrapped in `withLock` — see C8. |
| In-process mutex | `write.js::withLock` | **Confirmed**: single tail-promise serializes mutations within one process. | **Cross-process** safety is explicitly NOT provided (documented in write.js comment re: comment-append). Two Core instances writing the single user-global registry can still race at the OS level. Accepted-with-condition — see C9. |
| Read-tolerance | `state.js::safeRead/safeExists` | **Confirmed**: swallow errors, return `''`/`false`. Good for never-throw loads. | They provide **no containment** — they read whatever path they're handed. There is **no existing realpath-containment helper** in the codebase (the static handler only serves a hardcoded `index.html`). Therefore analyzer read-confinement is **net-new code, not a reuse** — it must be built and tested. This is the single most important finding: see C1–C4. |

**Headline:** the CSRF/atomic/mutex floor is solid and reusable. The path-containment story the architecture leans on does **not yet exist as code** — it is a pattern to be *implemented* in the analyzer, and it is where the real risk of this slice lives.

---

## 1. Trust boundaries & assets

**Trust model:** single-developer, localhost. The Operator is trusted; the **browser the Operator also uses is not** (it can be driven by any website → the guard exists precisely for this). The **filesystem the Operator points us at is semi-trusted** — a connected folder may be a freshly-cloned third-party repo containing hostile contents (malicious symlinks, a `.git/config` with attacker-controlled `remote.origin.url`, enormous/cyclic directory trees, files named to provoke traversal). The connect target is therefore **attacker-influenced data**, even though the *act* of connecting is Operator-initiated.

**Assets to protect:**
- **A1** Integrity of `~/.aidevteam/registry.json` (user-global index; corruption breaks every project's board).
- **A2** Confidentiality of files **outside** any connected project root (the analyzer must never read them).
- **A3** Integrity of the user's project files (DELETE must never touch them; profile writes must stay inside `<root>/.aidevteam/`).
- **A4** Absence of secrets in registry/profile/ledger/logs (nothing here should read or persist API keys/tokens).
- **A5** Availability of the Core process (no DoS from a hostile/huge folder; no hang on a hostile git repo).

---

## 2. STRIDE threat model — S1–S5, S8

### S1 — `connect` path input (the analyzer + canonicalization)  ⚠ highest-risk surface

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Tampering / Info-disclosure** | `path` body crafted with `../`, absolute escape, or a **symlink inside the chosen folder pointing outside it**, causing the analyzer to read files outside the project root (e.g. `~/.ssh/id_ed25519`, `~/.aidevteam`, another repo). | **HIGH** | **Mitigated by C1–C4** (canonicalize + realpath + containment on connect AND on every analyzer read; skip symlinks escaping root; fixed allowlist only — never a path from file contents). |
| **Tampering** | NUL byte / empty / relative path smuggled to confuse `path.resolve` or downstream `statSync`. | MED | **C2** (reject empty, NUL, non-absolute, non-directory before any FS work). |
| **DoS** | Operator (or a browser-driven connect) points at a **gigantic / deep / cyclic** tree; analyzer reads a 2 GB "README", or walks millions of files, or follows a symlink loop. | **HIGH** | **C5** (hard caps: per-file byte cap, total-files-scanned cap, total-bytes cap, wall-clock budget; depth cap; no unbounded glob; symlink-loop safe via realpath + visited-set or simply not recursing). |
| **Tampering** | Hostile `.git/config` `remote.origin.url` (used for title derivation) contains shell metacharacters or a payload. | MED | **C6** (`git` via `execFileSync`/`spawn` **argv form only**, never a shell; treat output as inert text; cap length; failure falls through to `basename`). Already specified in arch §2/§4.3 — pinned here as binding. |
| **Repudiation** | — | — | Local single-user; out of scope. |

### S2 — Registry write (`~/.aidevteam/registry.json`)

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Tampering** | Torn/partial file on crash mid-write; concurrent in-process writers clobber. | MED | **C8** (atomic write + `withLock`). |
| **Tampering** | Two OS processes (two Cores) interleave writes → lost update. | LOW (accepted) | **C9** (single-developer model; document limitation; advisory file-lock is a follow-up, not a Slice-1 blocker). |
| **Tampering** | Malformed/oversized fields persisted (attacker-influenced `label`/`path`). | MED | **C10** (validate+cap before persist; whitelist patch fields; nothing persisted on validation failure — A1). |
| **DoS** | Malformed registry on disk crashes load. | LOW | Met by existing read-tolerance contract (`load()` never throws → `{version:1,projects:[]}`); **C11** pins it as a test. |

### S3 — Profile write (`<root>/.aidevteam/profile.json`)

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Tampering** | Write escapes `<root>/.aidevteam/` (e.g. via a symlinked `.aidevteam` pointing elsewhere) and clobbers a file outside the repo. | **HIGH** | **C12** (resolve the write target with realpath and assert it is contained in `realpath(root)`; if `.aidevteam` is a symlink escaping root, refuse the write — do not follow it). |
| **Stored-data injection** | README/manifest content flows into `title`/`description`; later rendered in the UI. | MED | **C13** (values are plain length-capped strings; **no execution of file contents**; the UI MUST treat them as untrusted text — escape on render, never `innerHTML`/`eval`. Flag to `/fe` for the Cockpit slice). |

### S4 — Control-plane writes (`connect`, `DELETE`, optional patch)

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Spoofing / Tampering (CSRF / DNS-rebinding / cross-site fetch)** | A website the Operator visits drives `POST /api/projects/connect` or `DELETE /api/projects/:id` against localhost, registering or deleting projects, or pointing connect at a sensitive folder to exfiltrate a derived description. | **HIGH** | **C7** (every new mutation — `connect`, `DELETE`, patch — routed through `guard.js::writeAllowed` **unchanged**; DELETE added to the guarded dispatch; body cap 64 KB; **no permissive CORS**). |
| **DoS** | Oversized request body. | LOW | Existing `MAX_BODY` 64 KB cap (server.js:52) — reuse for all new routes (part of C7). |
| **Elevation / path abuse** | `:id` used to build a filesystem path → traversal via `:id`. | **HIGH** | **C14** (`:id` validated as an existing 12-hex registry id; **never** concatenated into a filesystem path; resolve id→canonical path via the registry map only; reject any `:id` that is not `^[0-9a-f]{12}$`). |

### S5 — `git` invocation (covered under S1/C6).

### S8 — Bind policy (ADT-216)

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Info-disclosure / Tampering** | Off-loopback exposure of the control plane on a shared LAN. | MED | **C15** (loopback `127.0.0.1` default inherited from server.js; off-loopback writes refused unless explicit `--allow-remote-writes` AND the guard still applies; remote connection refused when not enabled). No change that weakens the existing default. |

---

## 3. Findings summary

| ID | Finding | Severity | Resolved by |
|---|---|---|---|
| F-1 | Analyzer read-confinement is **net-new**, not an existing reuse; no containment helper exists today. Without it, a symlink inside a connected folder can exfiltrate arbitrary files. | **HIGH** | C1–C4 |
| F-2 | Unbounded analyzer reads on a hostile/huge folder → DoS / memory exhaustion. | **HIGH** | C5 |
| F-3 | DELETE is not in the current guarded dispatch; `:id` routing is new. Risk of an unguarded or path-building mutation. | **HIGH** | C7, C14 |
| F-4 | Profile write could escape root via a symlinked `.aidevteam`. | **HIGH** | C12 |
| F-5 | Stored README/manifest text → UI render (stored-injection / XSS in a later slice). | MED | C13 |
| F-6 | `git` output / repo config is attacker-influenced. | MED | C6 |
| F-7 | Single user-global registry has no cross-process lock. | LOW (accepted) | C9 (documented) |

No CRITICAL findings. All HIGH findings are converted to binding conditions below.

---

## 4. BINDING conditions (acceptance criteria — `/rev` and `/e2e` verify)

**Path containment & the analyzer (the core of this gate):**

1. **C1 — Canonicalize on connect.** `connect` resolves the chosen folder to a canonical root via git-toplevel (argv `git`) **or** `fs.realpathSync` (symlinks resolved). The **canonical** root is what is stored and what bounds every read. The raw user pick is never used for FS access after canonicalization.
2. **C2 — Reject bad input before any FS work.** `path` must be present, a string, **absolute**, contain **no NUL byte**, be non-empty, and `statSync(path).isDirectory()` must be true. Each failure → a clear machine-readable reason; **nothing is persisted** (no half-registered project).
3. **C3 — Containment on every analyzer read.** Every file the analyzer touches is `path.join(root, rel)` where `rel` is drawn from a **fixed allowlist** of marker/doc files. The analyzer **never** reads a path taken from file *contents*, never follows an unbounded glob, never reads outside `root`. Before each read, the resolved (realpath'd) target MUST satisfy `realTarget === realRoot || realTarget.startsWith(realRoot + path.sep)`; otherwise **skip** (do not read).
4. **C4 — Never follow symlinks out of root.** A symlink inside `root` whose realpath escapes `root` is **skipped, not read** (applies to allowlisted files and to any directory the scan descends into). Symlink loops must not hang the scan (visited-set or non-recursive design).
5. **C5 — Cap analyzer reads (anti-DoS).** Enforce, as hard limits with test coverage: (a) per-file byte cap (e.g. README ≤ ~64 KB read); (b) total-files-scanned cap; (c) total-bytes-read cap; (d) directory-depth cap (shallow — root + one level as designed); (e) a wall-clock/time budget for the whole analyze. Exceeding any cap **degrades gracefully** to a usable placeholder profile, never crashes or hangs.
6. **C6 — `git` is argv-only, inert output.** All `git` calls use `execFileSync`/`spawn` in **argv form** (no shell, no `shell:true`, no string interpolation), with stderr ignored and a bounded run. `git` output (toplevel, `remote.origin.url` basename) is treated as **inert text**, length-capped; any failure falls through to `realpath`/`basename`. Never pass repo-derived strings to a shell.

**Registry & profile writes:**

7. **C7 — All writes behind guard.js, unchanged.** `POST /api/projects/connect`, `DELETE /api/projects/:id`, and the optional `POST /api/projects/:id` patch all pass `guard.js::writeAllowed` **before any mutation** — same gauntlet as existing `/api/` POSTs (X-AIDT + Host/Origin loopback + loopback socket). **DELETE must be added to the guarded dispatch** (it is absent today). Reuse the 64 KB `MAX_BODY` cap. **No permissive CORS** headers are ever emitted. `GET` reads remain open (no guard), consistent with `/api/state`.
8. **C8 — Atomic + serialized registry/profile writes.** Every registry and profile persist goes through `write.js::atomicWriteJSON` (tmp+fsync+rename) **wrapped in `write.js::withLock`** (or an equivalent single shared mutex). No torn files; no in-process lost update.
9. **C9 — Cross-process limitation documented.** The single user-global registry has no OS-level lock in Slice 1 (single-developer model). This is **accepted** for Slice 1 and **must be documented** in the registry module and the known-limitations list; an advisory file-lock is a tracked follow-up, not a blocker.
10. **C10 — Validate + cap before persist; whitelist patches.** Persisted fields (`label`, `path`, derived `title`/`description`, `stack`, `keyFiles`) are length-capped plain strings/arrays; the patch endpoint accepts **only** a whitelist (`label`, `color`, `status`, `title`, `description`) and **never** mutates `id` or `path` (re-link is a separate ticket). Validation failure persists nothing.
11. **C11 — Tolerant load is a test, not a hope.** `registry.load()` never throws: missing/malformed/newer-version file → `{version:1, projects:[]}` (ignore unknown fields). Pin with a `node:test`.
12. **C12 — Profile write stays inside root.** The profile target `<root>/.aidevteam/profile.json` is written only after asserting its realpath is contained within `realpath(root)`. If `.aidevteam` (or `profile.json`) is a symlink whose realpath escapes `root`, **refuse the write** — never follow it out of the repo.
13. **C13 — Profile values are inert untrusted text.** README/manifest-derived `title`/`description` are stored as length-capped plain strings; **file contents are never executed/evaluated**. The values are **untrusted** and any UI that renders them MUST escape on output (no `innerHTML`/template injection). This requirement is handed to `/fe` for the Cockpit slice and recorded as a security AC there.

**Endpoint identity & deletion safety:**

14. **C14 — `:id` is validated, derived, never a raw FS path.** `:id` must match `^[0-9a-f]{12}$` **and** exist in the registry before any work. It is **never** concatenated into a filesystem path; the canonical path is obtained from the registry map (id→path), which itself stores only canonical roots. Reject traversal in `:id` (the regex does this) and in the `connect` POST body (C2/C3).
15. **C15 — Project id is derived, not attacker-supplied.** `id = sha1(canonicalRoot).slice(0,12)`. The client never supplies the id on connect; it is computed server-side from the canonicalized root. Connect is idempotent on this derived id (re-connecting returns the existing record, never a duplicate).
16. **C16 — DELETE removes the index entry only.** `DELETE /api/projects/:id` removes **only** the registry record. It MUST NOT delete, move, or modify any file under the project root (profile and all project files remain on disk). Prove with a test that asserts on-disk files are untouched after delete.
17. **C17 — No secrets read or persisted.** Nothing in this slice reads, derives, stores, or logs API keys / tokens / SSH secrets. `registry.json` and `profile.json` carry **no secrets** (only index + analysis metadata). If `git`/analyzer ever surfaces a secret-shaped string into a derived field, it is **not** a feature — treat as a defect. (The AgentRunner secret-redaction obligations belong to S6/S7, reviewed separately.)

---

## 5. Explicitly NOT approved by this pass (remain hard-gated)

- **S6 — AgentRunner `local-cli` host-CLI EXECUTION (ADT-230).** Spawning a host binary as a child process is **remote-code-execution-class** risk (prompt-injection into argv, secret leakage on streams, child-process resource/abort handling). The **interface/seam shape** reviewed in arch §6 is acceptable to *design* against (argv-only spawn, no `shell:true`, prompt via stdin/arg not interpolated, Core never reads the host token, stream redaction). **Enabling execution requires its own dedicated hard `SECOPS_APPROVED` pass.** NOT approved here.
- **S7 — AgentRunner `remote-ssh` EXECUTION (ADT-234).** Remote code execution over SSH. The designed controls (opt-in per project, host allowlist, known-hosts pinning / no TOFU, fixed agent command in argv form / no arbitrary shell, SSH key via agent only / no stored secret) are the **right shape**, but **enabling it requires its own dedicated hard `SECOPS_APPROVED` pass.** NOT approved here. Off by default; the bind/guard policy (C15) must continue to refuse it when not enabled.

This approval **does not unblock** S6 or S7. Implementing the Slice-1 local foundation (ADT-210/213/216/217) must not land any code path that performs host-CLI or SSH execution.

---

## 6. Gate decision

**`SECOPS_APPROVED` — CONDITIONAL (safety-override gate satisfied for the LOCAL, no-exec foundation only).**

- **Approved scope:** S1–S5, S8 — the project registry, the connect+analyze (deterministic, no-LLM) flow, and the `projects/*` HTTP control-plane (GET/POST/DELETE), behind the existing `guard.js`, reusing `write.js` atomic+locked writes.
- **Binding on:** the 17 conditions in §4 (they are acceptance criteria; `/rev` confirms in code review, `/e2e` confirms with tests — especially a symlink-escape test for C3/C4/C12, a DoS-cap test for C5, a CSRF/guard test for C7, a `:id`-traversal test for C14, and a files-untouched-after-DELETE test for C16).
- **No CRITICAL/HIGH left open:** every HIGH finding (F-1…F-4) is converted to a binding condition.
- **NOT approved / remain hard-gated:** **S6 (host-CLI exec, ADT-230)** and **S7 (SSH, ADT-234)** — each needs its **own dedicated hard SECOPS pass** before any exec path is enabled.

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-07 · **Status:** APPROVED WITH CONDITIONS (local, no-exec foundation) · **Next:** implementation under TDD; `/sm` — please update sprint status.

---

## Forward-carried obligation (from code review)

The connect/analyze foundation stores `title`/`description` derived from a project's
README/manifest as inert text. The future Cockpit UI ticket MUST escape these on
render (no innerHTML/template injection), so a stored payload in a malicious repo's
README cannot execute when its project card renders. This is a required security
acceptance criterion on the UI ticket, enforced at its /rev + /adam gates.
