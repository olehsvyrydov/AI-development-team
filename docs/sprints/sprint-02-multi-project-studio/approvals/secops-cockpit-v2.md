# SECOPS — Cockpit v2 Directory Browser & Claim Wording (ADT-220 / ADT-218)

> **/secops (Soren) — Principal Security Engineer.**
> Two gates in one pass:
> - **ADT-220 — `SECOPS_APPROVED` (HARD, safety-override).** A new read surface that hands
>   LOCAL FILESYSTEM READ to the browser (`GET /api/fs/roots`, `GET /api/fs/list`). This is
>   the single new attack surface in the slice. Implementation is **BLOCKED** until these
>   conditions are met AND verified at `/rev`.
> - **ADT-218 — `SECOPS_APPROVED` (claim-wording ratification).** No new data surface; the
>   trust-strip / local-first / "no code egress" / "security-reviewed" badge copy is a
>   **technical security claim** and must ship at the exact wording ratified below.
>
> Inputs read in full: `approvals/arch-cockpit-v2.md` (§3.2 containment algorithm, §3.4
> "what /secops must verify"), `ui-design-cockpit-v2.md` §6.3 (the `/api/fs/*` contract),
> `cockpit-promotion-apex.md` §3.3/§4/§5.3 (claim wording). Existing controls inspected in
> source — **I read the code, not the design's claim about it**: `hub/lib/guard.js`,
> `hub/lib/analyze.js` (`confinedPath`, `hasArtefacts`/`ARTEFACT_MARKERS`, `CAPS`),
> `hub/lib/http-body.js`, `hub/lib/registry.js` (`canonicalRoot`), `hub/server.js` (the
> dispatch + where `writeAllowed` is currently applied). Prior gate: `secops-slice1.md`
> (conditions C1–C17). PD-8: `$HOME`-only this slice, allowlist deferred.

**Verdict (summary up top):**
- **ADT-220 — `SECOPS_APPROVED` — CONDITIONAL (PASS).** Binding on the **15 numbered
  conditions C-1…C-15 in §3**, which are acceptance criteria `/rev` verifies in code with
  proving tests. No CRITICAL/HIGH finding is left open — each is converted to a binding,
  testable condition. **Implementation is blocked until C-1…C-15 ship with their negative
  tests and pass `/rev`.**
- **ADT-218 — `SECOPS_APPROVED` — CONDITIONAL (PASS).** The claim strings in §5 are
  **APPROVED AS WRITTEN THERE** (with the corrections noted). `/fe` must ship **exactly**
  those strings; any deviation that strengthens a privacy/security assurance re-opens this
  gate.

---

## 0. Verification of the controls this design reuses (I read the source)

A gate that rubber-stamps "reuse `analyze.js` containment" without reading it is malpractice.
The headline finding of slice-1 stands and is reaffirmed here: containment is **real code**,
but two of the three pieces the design leans on are **not yet wired for this endpoint** and
are therefore **net-new, not free reuse** — they must be built and independently tested.

| Control the design leans on | Source (verified) | Verdict for ADT-220 |
|---|---|---|
| `confinedPath(root, rel)` — realpath + `real===root \|\| real.startsWith(root+sep)` | `analyze.js:82–89`, **exported** (`analyze.js:400`) | **Real and reusable.** The exact containment rule the gate requires already exists and is exported. The fs-browse helper MUST reuse this rule (or a byte-identical equivalent), not re-implement it loosely. |
| DoS caps (`maxFiles`, time budget, depth) | `analyze.js:31–38` (`CAPS`), exported | **Real and reusable** as the *pattern*. But `analyze.js` caps bound a *recursive byte-reading* scan; the fs-browse cap is a different shape (one-level entry count + per-entry realpath + wall-clock). The cap is **net-new code in the new module** — reuse the constants/spirit, but it is tested fresh. |
| `hasArtefacts(root)` / `ARTEFACT_MARKERS` for `hasProject` | `analyze.js:73–80, 317–319` | The logic exists but `hasArtefacts`/`existsConfined` are **NOT exported** today (`analyze.js:400` exports only `analyze, readProfile, CAPS, confinedPath`). Surfacing `hasProject` is **net-new wiring** (export or re-derive), each child still containment-checked. |
| `writeAllowed` (anti-CSRF/DNS-rebinding) | `guard.js:53–59`, confirmed solid | **Real and sound.** BUT today it is applied **only to POST/DELETE** (`server.js:139,146,161`); **all GETs are open**. Routing the two `fs/*` **GETs** through `writeAllowed` is a deliberate, **net-new** extension of the guard to read endpoints — correct (§4), but it is new dispatch code with its own guard test, not an inherited behaviour. |
| `canonicalRoot(input)` validates absolute/exists/dir/no-NUL | `registry.js:28–36` | Reusable for **input validation** (C-2) — but note it does **NOT realpath**; it returns `projectRoot(input)`. The fs-browse path MUST apply its **own** `fs.realpathSync` + containment assertion (C-3/C-4) before listing. Do not assume `canonicalRoot` confines anything. |
| Body cap | `http-body.js` (`MAX_BODY` 64 KB) | N/A for these GETs (no body); instead bound the **`path` query length** (C-12). |

**Headline:** the realpath-containment *rule* is real and exported (`confinedPath`). The
`hasProject` surfacing, the one-level DoS cap, and the **guard-on-GET** are **net-new code**
for this endpoint and must each carry their own proving test. None of them may be credited as
"already there."

---

## 1. Trust boundaries & assets (delta from slice-1)

**Trust model unchanged:** single-developer, localhost. The Operator is trusted; **the
browser the Operator also uses is NOT** — any website the Operator visits can `fetch()`
`http://127.0.0.1:<port>/api/fs/list`. This endpoint therefore turns a hostile web page into
a potential **home-directory enumerator** unless the guard blocks it. That is the central
threat of ADT-220.

**New assets to protect (beyond slice-1 A1–A5):**
- **A6 — Confidentiality of the home-directory *structure*.** Even names-only, the *shape* of
  `$HOME` (presence of `~/.ssh`, `~/work/<client>`, `~/.config/<app>`) is reconnaissance value
  to an attacker. The endpoint discloses directory **names** by design; the guard (C-9) is the
  control that keeps that disclosure to the Operator's own browser session, not the web.
- **A7 — Confidentiality of everything *outside* `$HOME`.** `/etc`, `/`, other users' homes,
  `~/..` must never be listed — the containment assertion (C-3/C-4) is the control.
- **A8 — Availability of the Core.** A hostile/huge/cyclic directory must not hang or exhaust
  the single Core process — the one-level, capped, no-readFile design (C-7/C-8) is the control.

---

## 2. STRIDE threat model — the `fs/*` surface

| STRIDE | Threat | Sev | Disposition |
|---|---|---|---|
| **Spoofing / CSRF / DNS-rebinding / cross-site fetch** | A website the Operator visits drives `GET /api/fs/list` to enumerate `$HOME`, or rebinds DNS to reach loopback and walk the home tree, exfiltrating directory structure (A6). | **HIGH** | **C-9** — `fs/*` GETs require the full `writeAllowed` gauntlet (X-AIDT + Host loopback + Origin loopback + loopback socket). A cross-origin page cannot set `X-AIDT` without a preflight this server never grants. **No permissive CORS.** |
| **Info-disclosure (containment escape)** | `path=../..`, `path=/etc`, `path=/`, or a **symlink inside a listed dir whose target escapes `$HOME`** causes a listing outside Home (A7). | **HIGH** | **C-3, C-4, C-5** — realpath then assert `real===REAL_HOME \|\| startsWith(REAL_HOME+sep)`; every child realpath'd and containment-checked; escaping symlink **skipped, not followed**. |
| **Info-disclosure (content leak)** | Response carries file contents, file entries, sizes, or mtimes that aid recon beyond a folder name. | **HIGH** | **C-6** — `readdir` only, **never `readFile`/`open`**; response per entry is **exactly** `{ name, type:'dir', hasProject }`; files omitted entirely; no size/mtime/stat metadata emitted. |
| **Tampering (bad input)** | NUL byte, relative path, non-string, non-directory, or over-long `path` smuggled to confuse resolution. | MED | **C-2, C-12** — reject before any FS work; bound `path` length. |
| **DoS** | `path` points at a directory with millions of entries, or a deep/cyclic symlink farm, hanging the scan or exhausting memory. | **HIGH** | **C-7, C-8** — one directory level only (no recursion, no glob); entry cap with `truncated:true`; wall-clock budget; no file reads; bounded per-entry realpath. |
| **Info-disclosure (dotfiles)** | Listing hidden/dot directories (`~/.ssh`, `~/.gnupg`, `~/.aws`) advertises sensitive locations even by name. | MED | **C-11** — decision + justification below; hidden dirs are listed **name-only** (never their contents), and the picker is folder-navigation, but see C-11 for the dotfile policy. |
| **Tampering (write)** | The endpoint mutates the registry/profile/FS as a side effect of a "read". | MED | **C-10** — pure read; no registry/profile/FS mutation on any `fs/*` path; GET/HEAD only. |
| **Elevation (TOCTOU)** | Symlink swapped between the containment check and the listing. | LOW | **C-4** — the realpath used for the containment assertion is the **same** resolved path used to `readdir`; per-entry checks resolve at emit time. Single-user local model bounds this; documented. |

No CRITICAL findings. Every HIGH is converted to a binding condition in §3.

---

## 3. BINDING conditions for ADT-220 — `SECOPS_APPROVED` (HARD)

These are acceptance criteria. `/rev` verifies **each one in code with a proving test**; the
gate is met only when the negative tests in §6 ship green. The implementation is **blocked**
until then.

### Containment — prove the negative

**C-1 — Single allowed root, computed once.** There is exactly one allowed root this slice:
`REAL_HOME = fs.realpathSync(os.homedir())`, resolved once at startup/first use. No
admin-configurable allowlist this slice (PD-8 — deferred, not shipped). Every listing is
confined to `REAL_HOME` or a descendant.

**C-2 — Reject bad input before any FS work.** For `/list`, the `path` query param must be a
**string**, **absolute** (`path.isAbsolute`), contain **no NUL byte**, be non-empty, and within
the length bound (C-12). A missing `path` **defaults to `REAL_HOME`** (the picker opens at
Home). Any other failure → `400` with a clear machine-readable reason; **nothing is read**.
(Do not rely on `registry.js::canonicalRoot` for confinement — it validates shape but does not
realpath; use it at most for the absolute/exists/dir/NUL checks.)

**C-3 — Canonicalise via realpath BEFORE the containment check.** Resolve `real =
fs.realpathSync(path)`. If it does not resolve, or `fs.statSync(real).isDirectory()` is false →
`400`/`404`; nothing is listed. The realpath resolution means a symlink in the requested path
is followed to its true target **before** the check, so an escaping symlink is caught at C-4,
never listed.

**C-4 — Containment assertion (the core check), reusing the `analyze.js` rule.** Proceed
**only if** `real === REAL_HOME || real.startsWith(REAL_HOME + path.sep)` — the exact rule in
`analyze.js::confinedPath`. The fs-browse module MUST reuse `confinedPath` (now exported) or a
byte-identical equivalent; it MUST NOT re-implement containment with a looser string compare
(e.g. a prefix check without the trailing separator, which would let `/home/foobar` pass a
`/home/foo` root). A `..` climb out of `$HOME`, an absolute path outside `$HOME` (`/etc`, `/`),
and a symlink whose target escapes `$HOME` all fail this assertion and are **refused**
(`403`/`400`, no contents).

**C-5 — Per-child containment; escaping symlinks SKIPPED, not followed.** For **every** child
directory entry, resolve its realpath and include it **only if** it stays within `REAL_HOME`
(same assertion as C-4). A child that is a **symlink whose target escapes `$HOME` is skipped,
not listed** — applies to the requested path AND each listed child. Because the listing is
**one level only** (C-7), there is no descent and therefore no symlink loop to chase; a child
symlink is resolved once and either included (if contained) or skipped.

**C-6 — `parent` is contained or null.** Return `parent` **only if** `real !== REAL_HOME`
(i.e. the parent is itself within `REAL_HOME`); at `REAL_HOME` the `parent` is `null` so the UI
cannot navigate above Home. `parent` is itself realpath'd and containment-checked before it is
echoed.

### No content leakage

**C-7 — Names + type only — NEVER file contents or recon metadata.** Each entry is **exactly**
`{ name, type: 'dir', hasProject }`. The endpoint reads **directory entries** (`fs.readdir`
with `withFileTypes`) only; it **never** opens or reads a file (`readFile`/`open`/`readSync`
are forbidden on this path). **Files are omitted entirely** — not hidden client-side, the Core
never emits them. **No `size`, `mtime`, `ctime`, `ino`, `mode`, or any `stat`-derived field is
returned** — these aid recon beyond what navigation needs. `name` is the basename only,
treated as inert untrusted text (the UI escapes on render — forward-carried from C-13/slice-1).

**C-8 — `hasProject` is an existence check only.** `hasProject` is derived by reusing the
`analyze.js` artefact-marker existence logic (`hasArtefacts` / `ARTEFACT_MARKERS` —
export it or re-derive equivalently), checking only **whether** a marker path exists under the
child. It is **containment-checked** like any other access and reads **no file contents**
(existence/realpath only). It drives the "● has project" badge / init-vs-adopt hint.

**C-11 — Dotfile / hidden-directory policy (decision + justification).** **Decision:** hidden
(dot-prefixed) directories ARE listed, but **name-only**, exactly like any other folder — they
are **never** descended into automatically and their **contents are never read** (C-7 already
guarantees no file bytes; the listing is one level). **Justification:** (a) suppressing them
would be security-by-obscurity (anti-pattern #1) — the protection that matters is that
**contents** never leak (C-7) and that the structure is disclosed **only to the Operator's own
browser** via the guard (C-9), not hiding a name from the Operator who owns the home dir;
(b) legitimate adoptable projects live in dot-dirs (`~/.config/...`, dotfile repos), so hiding
them breaks the picker; (c) a sensitive dir such as `~/.ssh` therefore appears **as a name
only** — never a file, never a key, never a byte of content. The honest reassurance copy
(§5.3) is true under this policy. **What is NOT done:** the picker does not surface `~/..`,
`/`, or any non-`$HOME` location (C-4); it does not read `~/.ssh/*` (C-7). If a future slice
wants to *de-emphasise* dotfiles it is a UI nicety, not a security control, and must not be
sold as one.

### Access guard on the GET

**C-9 — `fs/*` GETs require `writeAllowed`.** Both `GET /api/fs/list` and `GET /api/fs/roots`
MUST pass `guard.js::writeAllowed` (X-AIDT header + Host pinned to loopback + Origin (when
present) pinned to loopback + loopback socket unless `--allow-remote-writes`) **before any FS
work** — even though they are reads — because they **disclose local filesystem structure**
(a capability disclosure, not public data). Missing `X-AIDT` → `403`; non-loopback Host/Origin
→ `403`; non-loopback socket without `--allow-remote-writes` → `403`. **This is confirmed as
the correct and required control** (it is the only thing standing between a hostile web page
and the Operator's home tree). **No permissive CORS** headers are ever emitted on these paths.
This extends the guard to GET routes for the first time — it is **new dispatch wiring** in
`server.js` and carries its own guard test (§6).

### No side effects / DoS bounds

**C-10 — Pure read, no mutation.** Neither `fs/*` endpoint writes, creates, deletes, moves, or
modifies anything on disk, in the registry, or in any profile. GET/HEAD only; any other method
→ `405`/ignored. Prove with a test asserting no write occurs.

**C-12 — Bounded input.** The `path` query string is length-bounded (e.g. ≤ 4096 bytes) and
rejected over the bound before any FS work (part of C-2). No globbing, no wildcard expansion,
no shell — `path` is used only as a literal filesystem path argument.

**C-13 — DoS-bounded listing (mirror `analyze.js` caps).** A single `/list`:
(a) reads **one directory level only** — non-recursive, no glob, no descent;
(b) returns **at most** a capped number of entries (reuse the `CAPS.maxFiles` spirit /
   a dedicated `maxEntries`), and when the directory has more, returns `truncated: true` and
   stops — never an unbounded array;
(c) completes within a **wall-clock budget** (reuse `CAPS.timeBudgetMs` spirit); on budget
   exhaustion it returns what it has with `truncated: true`, never hangs;
(d) performs **no file reads** (`readdir` + per-entry realpath/`lstat` for type only);
(e) per-entry realpath work is itself bounded by the entry cap, so a directory with millions of
   children cannot cause millions of realpath syscalls.

### Scope / non-goals (explicit for the gate)

**C-14 — Explicit non-goals (must hold).** The endpoint MUST NOT: return file contents, file
entries, or `stat`-derived recon fields; list outside `REAL_HOME` (no allowlist this slice —
PD-8); write anything; follow a symlink out of `$HOME` (skip-not-follow); recurse or glob;
construct a path from anything other than the validated, realpath'd, containment-checked
request `path`. `roots`/`recent` come from `$HOME` + the registry's **canonical** roots only,
and each `recent` path is itself containment-checked before it is returned (a stale registry
entry pointing outside `$HOME` is omitted, not echoed).

**C-15 — Negative tests are part of the gate.** The gate is met **only** when the
implementation ships the explicit negative/refusal tests enumerated in §6. A green happy-path
is insufficient; `/rev` confirms each refusal/skip/cap is proven, not asserted.

---

## 4. On the guard-on-GET extension (confirming the novel control)

ARCH (§3.2 #10, R-6) flagged that applying the write-guard to a GET is a novel control and
asked /secops to confirm it. **Confirmed — it is the right call and it is required.** Reasoning:

- Loopback binding alone does **not** protect this endpoint: any website the Operator visits can
  issue `fetch('http://127.0.0.1:<port>/api/fs/list?path=/home/<user>')`. Without the guard,
  that page enumerates the home directory (A6). With it, the cross-origin page cannot set
  `X-AIDT` (a non-safelisted header forces a CORS preflight this server never answers
  affirmatively), the Host/Origin pins defeat DNS-rebinding and cross-site fetch, and the
  loopback-socket check holds unless the Operator explicitly opted into remote.
- The control is **`guard.js::writeAllowed` reused unchanged** — I am not asking for a new guard,
  only that the existing one be applied to two GET routes. The risk that this is "a novel guard"
  is therefore low; the real net-new part is the **dispatch wiring** (today GETs skip the guard),
  which C-9 makes explicit and §6 tests.
- This is consistent with slice-1 C7 (all capability-bearing requests behind `writeAllowed`,
  no permissive CORS). The `fs/*` reads are capability-bearing (FS disclosure), so they belong
  on the guarded side of the line, with `/api/state` and `/api/projects` GETs (which disclose
  only the Operator's own already-connected project data) staying open as before.

---

## 5. ADT-218 — ratified claim strings (ship these EXACTLY)

These are **technical security/privacy claims**. `/fe` ships the strings **verbatim**. Any edit
that strengthens an assurance (drops a caveat, removes "DART"-scoping, turns a gate-pass into a
code-security guarantee) **re-opens this gate**. The governing honesty rule (Apex §5.6, §4
caveat): **scope every privacy claim to DART, never to the host model; a gate pass means the
stage ran and approved, never "this code is secure."**

### 5.1 Local-first (trust strip / chip)
- **APPROVED:** *"Runs on your machine. Bound to localhost by default."*
- Tooltip — **APPROVED:** *"DART runs on your machine and binds to localhost by default."*
- Substantiated by: loopback-by-default (`guard.js`, `server.js` bind). **Do NOT** use
  "100% private", "military-grade", or any absolute.

### 5.2 No code egress (the claim that most needs the caveat)
- **APPROVED (headline):** *"Your code and history stay in your repo. Nothing is uploaded by
  DART."*
- **APPROVED (the mandatory caveat — must ship adjacent, not buried):** *"DART doesn't upload
  your code; your AI coding tool works exactly as it does today, on the plan you already have."*
- **REJECTED wording (must never ship):** *"Your code never touches the cloud"* /
  *"Nothing ever leaves your machine"* / any unqualified absolute. These are **false** — the
  host AI tool (Claude Code / Cursor) still sends prompts to its own model. The no-egress claim
  is **scoped to DART only**; it must **NOT** imply the host model sends nothing.
- Folder-picker reassurance (§5.3) — **APPROVED:** dialog subtitle *"DART reads this folder on
  your machine to understand the project. Nothing is uploaded."* and persistent footer
  *"Read-only analysis. DART never writes outside this folder."*
  - **Security ratification of the footer:** this string is true **iff** C-7 (no file contents,
    read-only) and C-10 (no writes) and C-4 (confined to `$HOME`) hold. "Never writes outside
    this folder" is accurate for the `fs/*` browse surface (it writes nothing at all) and for
    connect/analyze (profile writes stay inside `<root>/.aidevteam/`, slice-1 C12). **Ship this
    footer only on the build where C-7/C-10 are verified green** — the copy must match real
    containment behaviour, per Apex §5.3's explicit "route to /secops" note.

### 5.3 "Security-reviewed" governance badge
- **APPROVED label:** *"Security-reviewed"* (solid shield glyph) — shown **only** when
  `SECOPS_APPROVED` is in `state === 'passed'` for the project's relevant gated work. **Never a
  default decoration; absent unless the gate actually passed** (absent-not-zero).
- **APPROVED multi-gate label:** *"N/M gates passing"* — counts **only gates DEFINED for this
  project's active track**; never invents gates that don't apply.
- **APPROVED blocking label:** *"blocked at {stage}"* (danger hue) when a **hard** gate is
  currently `rejected` — an honest, on-brand signal that the gate has teeth.
- **APPROVED tooltip (the honesty anchor — ship verbatim):** *"This project's security gate ran
  and approved its latest gated change. Gates here can refuse to proceed — they're not
  advisory."*
- **Binding meaning (enforced):** the badge means **"the security gate ran and approved this
  gated change"** — it does **NOT** mean "this code is secure". Any tooltip/label variant that
  implies code-level security assurance (e.g. "This code is secure", "Verified secure",
  "Vulnerability-free") is **REJECTED**.

### 5.4 Adjacent trust cues (ratified for consistency)
- No-keys chip — **APPROVED:** *"No account, no API key to paste — it reuses the tool you've
  already signed into."* (Substantiated; do not promise "free forever" re third-party model
  costs.)
- Audit-trail cue — **APPROVED:** *"Every step is recorded — who did what, when — in your repo's
  history."* **REJECTED:** "Compliance-certified" / "SOC2" — we are not. Use "audit-ready
  history", never "compliant".
- Enforced-process cue — **APPROVED:** *"Gates can refuse to proceed. Security is never silently
  skipped."* **REJECTED:** "Guarantees secure code."

---

## 6. Negative-test checklist `/rev` MUST confirm (ADT-220)

The gate is met only when these ship green. `/rev` confirms each is a real test, not a comment.

- [ ] **N-1 (`..`-climb refused):** `GET /api/fs/list?path=<$HOME>/../..` (and `/home/<user>/..`)
      → refused (`403`/`400`), no entries, nothing outside `$HOME` disclosed.
- [ ] **N-2 (absolute-outside refused):** `path=/etc`, `path=/`, `path=/root` → refused, no
      entries.
- [ ] **N-3 (escaping symlink in path refused):** a symlink inside `$HOME` whose target is
      `/etc` (or any non-`$HOME`), requested directly → realpath resolves, containment fails →
      refused, not listed.
- [ ] **N-4 (escaping symlink CHILD skipped):** a directory inside `$HOME` containing a child
      symlink whose target escapes `$HOME` → the child is **skipped**, the rest of the dir lists
      normally; the escaping target is never reached or disclosed.
- [ ] **N-5 (no content leak):** the response for any directory contains **only**
      `{ name, type:'dir', hasProject }` per entry — assert **no** file entries, **no** file
      contents, **no** `size`/`mtime`/`stat` fields; a directory containing a file (e.g. a fake
      `~/.ssh` with an `id_ed25519` fixture) lists the **folder name** at most and **never** the
      file or its bytes.
- [ ] **N-6 (NUL / relative / non-dir / over-long rejected):** `path` with a NUL byte, a
      relative `path`, a `path` to a file (not a dir), and an over-length `path` each → `400`,
      no FS read.
- [ ] **N-7 (guard required — missing header):** `GET /api/fs/list` and `/api/fs/roots`
      **without** `X-AIDT` → `403`.
- [ ] **N-8 (guard required — bad Host/Origin):** non-loopback `Host`, and cross-site `Origin`,
      each → `403`. (Reuse the existing `guard` test shape from `/api/projects`.)
- [ ] **N-9 (guard required — non-loopback socket):** a non-loopback remote socket without
      `--allow-remote-writes` → `403`.
- [ ] **N-10 (no permissive CORS):** assert the `fs/*` responses emit **no** `Access-Control-
      Allow-Origin: *` (or any permissive CORS) header.
- [ ] **N-11 (DoS cap / truncation):** a directory with more than the entry cap → response is
      capped with `truncated: true`; assert the array length ≤ cap and no hang.
- [ ] **N-12 (non-recursive, no file read):** assert the listing is one level (a nested dir's
      children do not appear) and that **no `readFile`/`open`** occurs (e.g. spy/fixture or a
      file whose read would error if attempted).
- [ ] **N-13 (`parent` null at Home):** `GET /api/fs/list` defaulting to `$HOME` → `parent` is
      `null`; a sub-dir → `parent` is the contained parent, itself within `$HOME`.
- [ ] **N-14 (pure read — no mutation):** after a series of `fs/*` calls, the registry, any
      profile, and the filesystem are unchanged (no write side effect).
- [ ] **N-15 (containment helper proven):** the realpath+containment helper used here has its
      own unit tests for the `$HOME` boundary, the `/home/foo` vs `/home/foobar` prefix trap
      (must reject `foobar`), symlink-escape, and `..`-climb — i.e. it reuses/equals
      `analyze.js::confinedPath`, with proving tests.

---

## 7. Gate decisions

**ADT-220 — `SECOPS_APPROVED` — CONDITIONAL (PASS), HARD gate.**
- **Binding on:** C-1…C-15 (§3), proven by the negative tests N-1…N-15 (§6).
- **No CRITICAL/HIGH left open:** every HIGH (CSRF/enumeration, containment escape, content
  leak, DoS) is converted to a binding, tested condition.
- **Net-new code flagged (not free reuse):** the `hasProject` surfacing, the one-level DoS cap,
  and the **guard-on-GET dispatch wiring** are net-new and each carry their own test; only the
  `confinedPath` containment *rule* is an existing, verified reuse.
- **Blocked until:** C-1…C-15 ship with N-1…N-15 green and pass `/rev`. ARCH approved the
  design; this gate does not waive — implementation is blocked until verified.

**ADT-218 — `SECOPS_APPROVED` — CONDITIONAL (PASS), claim-wording ratification.**
- **Binding on:** `/fe` shipping the §5 strings **exactly**, including the mandatory DART-scoping
  caveat on the no-egress claim and the honesty tooltip on the badge. Any strengthening of a
  privacy/security assurance re-opens the gate. The §5.3 folder-picker footer ships only on the
  build where C-7/C-10 are verified.

**Reviewed by:** /secops (Soren) · **Date:** 2026-06-07 · **Status:** APPROVED WITH CONDITIONS
(ADT-220 hard gate conditional on C-1…C-15 + negative tests; ADT-218 claim wording ratified) ·
**Next:** ADT-220 → `/be` under TDD (must ship N-1…N-15) → `/rev` verifies each condition in
code; ADT-218 → `/fe` ships the ratified strings. Then `/sm` — please update sprint status.
