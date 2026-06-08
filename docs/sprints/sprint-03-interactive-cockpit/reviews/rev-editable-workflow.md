# Code Review — Interactive Cockpit slice 2 (ADT-224 / ADT-225 / ADT-226)

**Reviewer:** /rev · **Date:** 2026-06-08 · **Branch:** feat/dart-interactive
**Change set reviewed:** `git diff 988810c -- hub studio` + new files (uncommitted).
**Binding inputs:** `approvals/secops-editable-workflow.md` (C-1…C-27, N-1…N-23, HARD ADT-224),
`approvals/arch-editable-workflow.md` (routing/overlay contracts), repo Code Standard (facts-only).

## Verdict

| Ticket | Gate | Decision |
|--------|------|----------|
| ADT-224 | CODE_REVIEWED (hard) | **PASS** — all C-1…C-17 verified in code with genuine FS-snapshotting negatives N-1…N-16. |
| ADT-225 | CODE_REVIEWED | **PASS** — C-18…C-24 verified; declarative validator + pollution neutralization + byte-identical base YAML proven. |
| ADT-226 | CODE_REVIEWED | **PASS** — C-25…C-27 verified; pure FE re-projection, escaped render, off-track surfaced not re-keyed. |

**No BLOCKING findings. No WARNING findings.** Three FYI/NIT notes (below). The build emits the
known non-fatal style-budget WARNING only.

---

## Re-run results (independently executed)

- **Hub:** `node --test hub/test/*.test.js` → **193 pass / 0 fail** (suites 0, ~10.5s).
- **Cockpit unit:** `npm test` → **251 pass / 0 fail** (25 files, ~4.3s).
- **Cockpit build:** `npm run build` → **succeeds.** One WARNING only:
  `workflow-builder.component.ts` SCSS exceeded the 6.00 kB component-style budget by 1.45 kB
  (total 7.45 kB). This is a `[WARNING]`, **not** an `[ERROR]`; the bundle is produced and the
  output is written. Non-blocking (recommend bumping the per-component style budget or trimming
  the builder SCSS in a follow-up).

## Facts-only grep (changed source)

Scanned every changed source file (excluding `.spec.ts`) for ticket IDs (`ADT-\d+`), condition
codes (`C-\d`/`N-\d`), sprint refs, and persona names. **Clean — no process artifacts in source.**

- The only allowlist-style hit is `STANDARD_OWNERS = ['/po','/ba','/arch',…]` in
  `workflow-builder.component.ts:13` — legitimate **domain data** (the agent-role allowlist used to
  populate the owner `<select>` at line 452), not a process artifact.
- `[innerHTML]`/`bypassSecurityTrust*` hits are all inside doc-comments documenting the
  *security rationale* ("interpolated only — never `[innerHTML]`") — genuine non-obvious-WHY
  comments, allowed. No actual `[innerHTML]` or `DomSanitizer` bypass in any template.

---

## ADT-224 HARD surface — verified in source (not credited as reuse)

The /secops gate flagged `resolveProject`, per-project channel isolation, and the bounded watcher
map as **net-new code** that must each be proven. Confirmed in source:

- **`hub/lib/resolve-project.js`** — `resolveProject(id, {registry, launch})`:
  `id == null || ''` → launch project (back-compat, **C-6**); `typeof !== 'string' || !HEX_ID.test(id)`
  → `400 invalid project id` using the **imported anchored** `registry.HEX_ID` (**C-1, C-2**, no
  looser re-declaration); `registry.get(id)` `null` → `404 unknown project` (**C-4**); success returns
  **`record.path` only** (**C-3, C-5** — the id is only ever a `===` lookup key, never passed to
  `path.*`/`fs.*`; no `path`/`dir`/`file` body field is read). One function serves both the body
  field and the stream query param (**C-16**); terse messages, no path/stack (**C-17**).
- **`hub/server.js`** — guard placement is correct: `writeAllowed` runs at the POST dispatch
  (line 182) **before** body parse and **before** `resolveProject` (line 190) → **guard → resolve →
  CAS** (**C-8**). The stream (`/api/events`) runs the new `streamAllowed` (Host/Origin/socket
  loopback pinning, no X-AIDT, no permissive CORS) **before** resolving the id or opening a channel,
  and the cap check fires **before** the SSE head is written (**C-9, C-13**). A successful mutation
  pushes only to `channels.push(rp.dir)` — the resolved project (**C-10, C-14**). `/api/state`
  resolves the same way and refuses crafted/unknown ids.
- **`hub/lib/channels.js`** — per-resolved-dir channel map; watchers created on first subscriber,
  torn down on last unsubscribe via the returned `close()` (refcount, **C-12**); over-cap NEW project
  → `{ ok:false, code:503 }` while existing channels keep serving (**C-13**); `push(dir)` reaches one
  channel's subscribers only (**C-10/C-11**).
- **`hub/lib/guard.js`** — `streamAllowed` is net-new and correctly omits the X-AIDT requirement
  (EventSource cannot set it) while keeping loopback Host/Origin/socket pinning (**C-9**).

**Negatives are genuine and FS-snapshotting (not status-code-only):** `project-scope.test.js`
defines `snapshot(dir)` = recursive `{relPath → sha256}` over content **and** structure (via
`lstatSync`, so a symlink is detected, not followed), then asserts
`assert.deepEqual(snapshot(a), before)` after every crafted-id mutation (N-1…N-9), after the
no-cross-project-write case (N-11: launch B + scope A → B byte-unchanged), after the guard-missing
case (N-13), and after the stale-rev 409 (N-16b). N-13 explicitly asserts a **crafted id yields 403,
not 400** — proving the guard fires before resolution. `channels.test.js` proves teardown
(watcherCount → 0), the cap 503, and per-channel push isolation. Each negative would fail if its
control were removed (e.g. drop `FORBIDDEN_NAMES` → the pollution test's `Object.prototype` assertion
fails; drop the guard → N-13's 403 becomes a 400/200; drop the cap → the 503 assertion fails).

## ADT-225 — `track/set-stages` + overlay merge

- **`hub/lib/api.js`** — `validateStageList` is a **declarative** validator (does NOT reuse
  `isPermutation`): rejects non-array/empty (**C-19**), per-stage non-string/`null`, empty-after-trim,
  over-`STAGE_NAME_MAX`(64), duplicate, `hasUnsafeChar` (control/NUL/`/`/`\`), and
  `FORBIDDEN_NAMES` (`__proto__`/`constructor`/`prototype`) → `400`, **writing nothing** (**C-19, C-21**).
  Owner is a plain capped (64) string, control-char- and forbidden-key-checked, never a path (**C-20**);
  a leading `/` is allowed because owners are agent tokens like `/be` — correct. `set-stages` writes
  via `writeOverlayCAS` only (**C-18, C-23, C-24**); the per-stage `gate` field is not honored to
  rewrite gate defs (**C-20**).
- **`hub/lib/write.js`** — `deepMerge` skips `FORBIDDEN_KEYS` so a stage/owner string surfacing as an
  object key cannot pollute `Object.prototype` (**C-21**) — defense-in-depth behind the api.js reject.
- **`hub/lib/state.js`** — `applyOverlay` reads `overlay.stageOwners` (line 118); `buildState`
  applies precedence overlay→gate-owner→default→null using `Object.prototype.hasOwnProperty.call`
  (line 341, pollution-safe lookup); base `workflow.yaml` is never opened for write.
- **Negatives:** `set-stages.test.js` proves base-YAML byte-identical via `sha256` hash before/after a
  full add/delete/move/owner session (N-17); CAS 409 with no overlay written (N-18); every validator
  rejection with `!fs.existsSync(overlay)` (N-19); and pollution neutralization with a real
  `({}).__proto__ === Object.prototype` integrity assertion (N-20).
- **FE escaping (C-22/N-21):** stage names and owners render via `{{ }}` interpolation in
  `workflow-builder.component.ts`; the spec flushes an `<img onerror>` / `<script>` owner payload and
  asserts `host.querySelector('img[onerror]')` is null and `innerHTML` lacks `<script>`.

## ADT-226 — Stage-aligned board (FE re-projection)

- **`hub/lib/api.js`** confirms **no** new route for the board — `ticket/advance` is unchanged and
  CAS-guarded (**C-25, C-27**). `board.ts` derives columns from `workflowView.stages` (ordered) and
  places by `ticket.stage`; `offTrackGroups` surfaces orphaned-stage tickets by set-difference and
  preserves first-seen order — **surfaced, never dropped or re-keyed** server-side (**C-27, N-23**).
- **Escaped render (C-26/N-22):** `tasks-board.component.ts` renders stage, owner, title, status,
  off-track stage, and gate text all via `{{ }}` — no `[innerHTML]`/bypass.
- **409 is a real, non-silent UI state:** `control-plane.service.ts::mutate` decodes HTTP 409 into a
  first-class `{ ok:'conflict', state }` result (never thrown); the board spec asserts an inline
  `card-conflict` + retry, and the builder spec asserts a reconcile banner with discard/re-apply.

## Project-id threading (every mutation + the stream)

- `ControlPlaneService.scoped()` appends the scoped `project` id **last** so it wins over any body
  field (matches the design); applied to every mutation including `addKbNote`. With no id set the
  field is omitted (single-project back-compat). `project-shell.component.ts` calls `setProject(id)`
  and `events.connect(id)` on the viewed id, with `if (this.id() === id)` guards against stale
  adoption. `events.service.ts` opens `/api/events?project=<encodeURIComponent(id)>`. **No un-scoped
  write path remains.**

## a11y (quality bar)

- Board: `role=list/listitem`, `tabindex="0"` columns, `[attr.aria-label]` per column, and a
  `(keydown)="onColumnKeydown"` handler; an `aria-live="polite" role="status"` board-live region.
- Builder: reorder grip with `(keydown)="onGripKeydown"`; preset radiogroup with keyboard handler;
  owner via native `<select>`; add/delete via native `<button>`/submit with an inline confirm; an
  `aria-live="assertive"` builder-live region. All interactive controls are native focusable
  elements — keyboard-operable.

---

## C-1…C-27 / N-1…N-23 verification table

| ID | Condition (abbrev) | Status | Evidence |
|----|--------------------|--------|----------|
| C-1 | id is lookup key, never path | PASS | resolve-project.js:35 `registry.get(id)`; never `path.*` |
| C-2 | anchored HEX_ID shape-check first | PASS | resolve-project.js:32 imports `registry.HEX_ID` (`^[0-9a-f]{12}$`) |
| C-3 | only `record.path` used | PASS | resolve-project.js:37 returns `record.path` |
| C-4 | unregistered id → 404 nothing written | PASS | resolve-project.js:36; N-9 |
| C-5 | no client path/dir/file honored | PASS | resolver reads only `id`; N-10 (injected path untouched) |
| C-6 | absent id → launch, still guarded | PASS | resolve-project.js:31; server.js:182 guard precedes |
| C-7 | CAS per resolved project | PASS | server.js:192 `api.handle(route,data,rp.dir)`; N-16b |
| C-8 | guard before resolve | PASS | server.js:182 then :190; N-13 (crafted id → 403 not 400) |
| C-9 | stream guarded before channel/resolve | PASS | server.js:125 `streamAllowed`; guard.js:70; N-14 |
| C-10 | per-project channels, push to resolved root | PASS | channels.js push/subscribe; server.js:194 |
| C-11 | cross-project isolation under concurrent writes | PASS | N-12 (A only A-frames, B only B-frames) |
| C-12 | watchers refcounted + torn down | PASS | channels.js:113-121; N-15 (watcherCount→0) |
| C-13 | active-project cap → 503 | PASS | channels.js:104, server.js:131; N-16 |
| C-14 | no mutation crosses projects | PASS | N-11 (B byte-unchanged) |
| C-15 | crafted id → FS byte-unchanged | PASS | snapshot()+deepEqual; N-1…N-9 |
| C-16 | single resolveProject authority | PASS | one module, used by state/events/POST |
| C-17 | no info leak in errors | PASS | terse `invalid project id`/`unknown project`/`too many active projects` |
| C-18 | overlay-only, base YAML byte-unchanged | PASS | api.js:163 writeOverlayCAS; N-17 (hash equal) |
| C-19 | declarative validator, reject writing nothing | PASS | api.js:49-69 validateStageList; N-19 |
| C-20 | owner plain capped string, not a path | PASS | api.js:60-63; gate field not honored for defs |
| C-21 | prototype-pollution neutralized | PASS | api.js:58 FORBIDDEN_NAMES + write.js:79 FORBIDDEN_KEYS; N-20 |
| C-22 | escaped render (builder) | PASS | interpolation-only; N-21 (img[onerror] null) |
| C-23 | CAS-safe set-stages | PASS | api.js:163; N-18 |
| C-24 | behind write-guard, overlay-only | PASS | POST path guarded; only overrides.json written |
| C-25 | no new server surface (board) | PASS | api.js has no board route; advance unchanged |
| C-26 | escaped board render | PASS | tasks-board interpolation-only; N-22 |
| C-27 | advance CAS-safe + scoped, off-track not re-keyed | PASS | board.ts offTrackGroups (FE set-diff); N-23 |
| N-1…N-9 | crafted ids refused, FS byte-identical | PASS | project-scope.test.js snapshot/deepEqual |
| N-10 | client path field ignored | PASS | project-scope.test.js (injected path untouched) |
| N-11 | no cross-project write (B unchanged) | PASS | project-scope.test.js:218 |
| N-12 | stream isolation under concurrent writes | PASS | project-scope.test.js:236 |
| N-13 | guard before resolve (403 not 400) | PASS | project-scope.test.js:268 |
| N-14 | stream guarded (Host/Origin) | PASS | project-scope.test.js:288 |
| N-15 | watcher teardown, no FD leak | PASS | channels.test.js (watcherCount→0) |
| N-16 | watcher cap → 503 | PASS | channels.test.js:62 |
| N-16b | CAS per resolved project (stale → 409) | PASS | project-scope.test.js:399 |
| N-17 | base YAML byte-identical | PASS | set-stages.test.js:158 |
| N-18 | overlay CAS stale → 409 | PASS | set-stages.test.js:133 |
| N-19 | invalid stage-list rejected, nothing written | PASS | set-stages.test.js:95 |
| N-20 | prototype-pollution neutralized | PASS | set-stages.test.js:117 |
| N-21 | escaped render + guard | PASS | workflow-builder.spec + guard path |
| N-22 | escaped board render | PASS | tasks-board.spec |
| N-23 | advance CAS-safe, off-track not re-keyed | PASS | board.ts + tasks-board.spec |

---

## Non-blocking findings

- **FYI (build):** the `workflow-builder.component.ts` SCSS exceeds the 6 kB per-component style
  budget by 1.45 kB — emitted as a WARNING, not an error. Bump the budget or trim the SCSS in a
  follow-up.
- **NIT (state.js:340):** `if (stage in stageOwners) continue;` uses the `in` operator against a
  plain-object accumulator, so an inherited key (e.g. a base-config stage literally named
  `constructor`) could short-circuit. Stage names from the editable overlay are already rejected by
  `FORBIDDEN_NAMES`; base `workflow.yaml` stage names are trusted config. Cosmetic robustness only —
  consider `Object.prototype.hasOwnProperty.call(stageOwners, stage)` for symmetry with line 341.
- **NIT (board.ts:133):** `STATUS_CHIPS[status]` lookup falls back via `||` to a neutral chip; a
  status of `constructor` would return the inherited function before the `||`. Status comes from the
  trusted server ledger, not the editable surface — no security weight. Cosmetic.

## Review assumptions

- I verified each condition against the source and re-ran the suites; I did **not** run the live
  Playwright/E2E layer (a live hub occupies :4477, per scope). The unit suites cover the SSE channel,
  guard, resolver, and FS-snapshot negatives directly, so the HARD surface is proven without E2E.
- I assumed the SECOPS conditions are themselves the correct acceptance bar (they are derived from
  the ARCH routing/overlay contracts, which I cross-read).

## Gate decision

**CODE_REVIEWED = PASS for ADT-224 (hard), ADT-225, ADT-226.** Hand off to /qa + /e2e.
Note for /sm: APPROVAL_GATE is still `pending` in the ledger for all three (set during planning) —
flag for /verify / the orchestrator before VERIFIED.
