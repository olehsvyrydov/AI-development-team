# ARCH — Slice 1 Conformance Review (post-implementation)

> **/arch (Jorge) — read-only architecture-conformance review.** Compares the Slice-1
> implementation against `arch-slice1.md` and its 6 binding ARCH conditions. Structure /
> boundaries / reuse only — security was a separate gate (/secops, S1–S8). No code changes.
>
> **Implementation reviewed:** `hub/lib/project-id.js`, `hub/lib/registry.js`,
> `hub/lib/analyze.js`, `hub/lib/projects.js` (NEW); `hub/server.js` (additive routing edit).
> Tests: `hub/test/{project-id,registry,analyze,projects}.test.js` — **36 pass / 0 fail**
> (`node --test`).

---

## Verdict: **CONFORMANT-WITH-NOTES**

The foundation reproduces the approved design faithfully: projectId parity is byte-for-byte,
the strangler-fig seam holds (reused libs unchanged, server.js wiring purely additive), no
exec/runner path leaked in, and all 6 binding conditions hold structurally and are pinned by
tests. The only deviations are **naming/packaging** (a single `analyze.js` instead of the
designed `analyzer.js` + `profile.js`; the AgentRunner seam file is absent rather than
present-as-interface-only) — neither changes a contract or a boundary. Details below.

---

## The 6 binding ARCH conditions

### 1. projectId parity — **PASS**
`hub/lib/project-id.js` reproduces `claude/memory/src/lib/project-id.ts` **exactly**:
same fall-through (`git rev-parse --show-toplevel` via `execFileSync` argv form, `cwd=dir`,
`stdio:['ignore','pipe','ignore']`, `.trim()` → if non-empty return; else `fs.realpathSync`;
else raw `dir`), same `crypto.createHash('sha1').update(root).digest('hex').slice(0,12)`.
A line-by-line read of both files shows identical logic, encoding (raw UTF-8, no
normalization), and truncation.
- Pinned by `hub/test/project-id.test.js`, which **embeds the TS algorithm and asserts
  equality** for the realpath path, the git-toplevel path, sub-dir==toplevel (same id), and
  symlink-collapse (`projectRoot(link) === realpathSync(real)`), plus the `^[0-9a-f]{12}$`
  shape. This is the critical board↔memory key alignment — confirmed intact.

### 2. No bypass of write.js / no weakening of guard.js — **PASS**
- **Every** file mutation routes through `write.js::atomicWriteJSON`: registry persists
  (`registry.js:67` `persist → atomicWriteJSON`) and the profile write
  (`analyze.js:261` `atomicWriteJSON(target, profile)`). No `fs.writeFileSync`/`writeSync`
  for state files anywhere in the new modules.
- **Every** `projects/*` write (POST/DELETE) passes `guard.js::writeAllowed` **unchanged**
  before dispatch — in `server.js:157` (production wiring) and `projects.js:158`
  (self-contained test server). `guard.js` itself is untouched (no diff). The 64 KB
  `MAX_BODY` cap and `readJsonBody` are reused. GET reads are open, matching `/api/state`.
- The registry adds its **own** in-process mutex (`withLock`, `registry.js:49`) because
  `atomicWriteJSON` is not self-locking — this matches the design's explicit recommendation
  (§3.2) to serialize read-modify-write on the single user-global file, and mirrors the
  `write.js::withLock` pattern rather than reimplementing atomicity.

### 3. Read-confinement (analyzer) — **PASS**
`analyze.js` confines every read to the canonical root: `confinedPath` (`:83`) resolves
`realpathSync(join(root, rel))` and returns null unless `real === root || real.startsWith(root + sep)`;
`confinedRead`/`existsConfined` go through it. Reads come **only** from fixed allowlists
(`STACK_MARKERS`, `KEY_FILE_CANDIDATES`, `README_NAMES`, `ARTEFACT_MARKERS`) — never from
file contents. The profile target is also confined (`profileTarget`, `:206`: a symlinked
`.aidevteam` escaping root throws rather than being followed). DoS caps (`CAPS`, `:31`:
per-file/total bytes, max files, depth, time budget) bound the scan.
- Pinned by `analyze.test.js`: escaping README-symlink contents never reach the profile;
  a symlinked `.aidevteam` escaping root refuses the write and leaves the outside dir empty.

### 4. No partial / torn state — **PASS**
- Connect validation (`registry.js::canonicalRoot`, `:28`) checks string/NUL/absolute/exists/
  isDirectory and **throws before any write**; `projects.js:60` maps the throw to `400` with
  nothing persisted.
- Analysis failure does **not** orphan the registration: `projects.js:70-74` keeps the
  registry record and returns a placeholder `{ error }` profile so the project stays usable —
  exactly the design's "never half-registered" rule (§4.5). Registration and analysis are
  sequenced (register first, then analyze) so a failed analyze cannot leave a registered
  project without a usable response.
- Atomic tmp+fsync+rename (via `write.js`) means no torn file on the registry/profile writes.
- Pinned by `registry.test.js` (tolerant read of missing/corrupt file; concurrent connects
  serialize without loss) and `projects.test.js` (missing/invalid path → 400, nothing
  persisted).

### 5. No secrets across the seam (AgentRunner) — **PASS (vacuously) — see Note A**
No AgentRunner / exec path exists in this slice. `grep` over all four new modules finds **no**
`spawn`, `child_process` exec for agents, `ssh`, `createRunner`, or `agent-runner` import. The
only `execFileSync` calls are the **two git invocations the design itself specifies** —
`project-id.js:22` (`git rev-parse --show-toplevel`) and `analyze.js:137`
(`git -C root config --get remote.origin.url`) — both argv-form, fixed args, stderr ignored,
failure falling through. Therefore no credential can cross a seam that was not built. The
host-CLI exec (S6 / ADT-230) and SSH (S7 / ADT-234) remain unbuilt and gated, as agreed.

### 6. Determinism — **PASS**
Analyzer output is byte-stable per directory: all scans sort/dedup (`detectStack` returns
`[...found].sort()`; key files follow a fixed-priority list), title/description ladders are
deterministic, and the only time-varying field is `analyzedAt`. Pinned by `analyze.test.js`
"same directory yields a byte-identical profile (ignoring analyzedAt)".

---

## Boundaries / strangler-fig seam — **PASS**
- `hub/server.js` diff is **purely additive**: a new `/api/projects[/...]` branch inserted
  **ahead** of the generic `POST /api/<route>` dispatch, plus two `require`s and one
  `createRegistry` line. `/api/state`, `/api/events` (SSE), and the existing
  `POST /api/<route>` control plane are byte-for-byte unchanged (only comment-text edits
  dropping the `C3/C5` tags — no behavioral change). No reused lib's contract was modified
  (`write.js`, `guard.js`, `state.js`, `comments.js` have no diff).
- The new modules consume reused libs through their public exports only
  (`state.js::buildState`/`safeExists`, `write.js::atomicWriteJSON`, `guard.js::writeAllowed`,
  `project-id` from the shared module). No reach-in, no duplicated atomic-write/CSRF logic.
- Zero-dependency Node hub style preserved: CommonJS, `'use strict'`, `node:` core modules
  only, no build step, no new runtime dependency, `node:test` coverage.

---

## Drift / notes (non-blocking)

- **Note A — module packaging differs from §8.1 (cosmetic).** The design listed
  `analyzer.js` + `profile.js` as separate files and an `agent-runner.js` interface stub.
  The implementation **merges analyzer+profile into one `hub/lib/analyze.js`** (profile
  read/write is small and lives naturally beside the analysis that produces it) and **omits
  the `agent-runner.js` seam file entirely** rather than shipping an interface-only stub.
  - *Assessment:* no contract or boundary is affected. Co-locating profile I/O with the
    analyzer is reasonable cohesion. Omitting the seam file is acceptable for a slice that
    builds nothing behind it — but the **interface contract from §6 is the binding input to
    ADT-230/234**, so the runner work must carry that contract forward (it lives in
    `arch-slice1.md §6`, not in code). Flagged so the next slice doesn't lose it.
- **Note B — `profile.js` test absent.** §8.1 enumerated profile behavior under
  `analyzer.test.js`; profile read-back (load-existing, override-wins-over-reanalysis) is
  **not** exercised. The implemented `analyze()` always re-derives and writes; it does not
  yet *read back* an existing profile or honor `titleOverride`/`descriptionOverride` on
  re-analysis (the fields are written as `null` but never consumed). This is the
  **edit-and-persist / override-wins** behavior from §4.5 — likely deferred with the UI edit
  endpoint (`POST /api/projects/:id`, marked *optional this slice* in §5). Not a conformance
  failure for Slice 1; **carry into the slice that adds the edit route** so overrides are not
  silently dropped.
- **Note C — `update()` exists but is unrouted.** `registry.js::update` (whitelisted
  label/color/status patch) is implemented and tested but no `POST /api/projects/:id` route
  wires to it yet (consistent with §5's "optional this slice"). Fine; foundation is ready.
- **Note D — GET `/api/projects/:id` re-runs `analyze()` on every read.** `projects.js:87`
  re-derives the profile (and, on the fast path, calls `buildState`) for each GET rather than
  reading the persisted `profile.json`. Correct and deterministic, but it re-writes the
  profile on every read and pays the scan cost per request. Not an architectural violation
  (caps bound it; output is stable) — a **performance/idempotency-of-reads** observation for
  when the read volume grows or the profile-read-back from Note B lands.

---

## Foundation readiness for next slices
- **Angular Cockpit (ADT-211+):** the `{ ok, projects[] }` / `{ ok, project, profile, state }`
  shapes and the GET-open / POST-guarded split are exactly what a UI consumes; canonical
  `projectId` is the stable partition key the board and memory share. Ready.
- **Multi-project SSE (ADT-211):** existing single-project `/api/events` untouched, as the
  design required (namespace-by-projectId is the documented follow-up).
- **AgentRunner (ADT-230/234):** seam is cleanly *absent* (no exec leaked), gated, and the
  interface contract is preserved in `arch-slice1.md §6` — but it must be **carried forward
  explicitly** since no stub file anchors it (Note A).

**Conformance verdict: CONFORMANT-WITH-NOTES.** No layering violation, no boundary breach,
no bypass of `write.js`/`guard.js`, parity intact, exec correctly unbuilt. Notes A–D are
forward-carry items, not Slice-1 defects.
