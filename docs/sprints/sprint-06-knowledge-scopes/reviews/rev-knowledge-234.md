# Code Review — ADT-234 (Knowledge scope/tag model + common vault, backend + UI)

> **/rev — Senior Full-Stack Code Reviewer.** Gate owned: `CODE_REVIEWED` (HARD).
> Branch: `feat/dart-knowledge` · Change set: uncommitted working tree (per scope).
> Reviewed against the binding SECOPS conditions `secops-knowledge-scopes.md`
> (ADT-234: C-201…C-214 + C-240…C-242, proven by N-201…N-219) and the repo Code Standard.
> Prerequisite gates verified passed in the ledger: `ARCH_APPROVED`, `SECOPS_APPROVED`,
> `DESIGN_APPROVED`. ADT-235 conditions (C-220…C-229 / N-220…N-233) are OUT OF SCOPE for this
> review — they belong to the `/kai` propose→approve ticket and are not present in this change set.

## Verdict

**APPROVED — `CODE_REVIEWED = passed`.** Every binding ADT-234 condition is independently verified
**met in code** (not merely claimed), each proven by a genuine negative test that would fail if its
control were removed; the refusal tests snapshot the vault/store and assert byte-identical after.
No BLOCKING or WARNING findings. NITs only (listed below) — none gate the merge.

---

## Re-run results (re-run, not trusted)

| Suite | Command | Expected | Actual |
|---|---|---|---|
| Hub | `node --test hub/test/*.test.js` | ~283 pass | **283 pass, 0 fail** |
| Memory tests | `node --test "test/*.test.ts"` (see note) | ~25 pass | **25 pass, 0 fail** |
| Memory typecheck | `npx tsc --noEmit` | clean | **clean (exit 0)** |
| Cockpit | `npm test` | ~417 pass | **417 pass (32 files)** |
| Cockpit build | `npm run build` | succeeds | **succeeds (exit 0)** |

**Note on `npm test` in `claude/memory`:** the packaged script `node --test test/` (directory form)
fails on this Node (`v24.14.1`) with `MODULE_NOT_FOUND` because the directory form does not expand to
the `.ts` test files. Running the explicit glob `node --test "test/*.test.ts"` runs all 25 tests green.
This is a **pre-existing harness quirk in the test script**, not a defect in this change set (the
change set adds `test/knowledge-match.test.ts`, which passes under the glob and contributes to the 25).
**NIT-1** below tracks fixing the script.

Cockpit build emits two **pre-existing** SCSS-budget warnings (`workflow-builder.component.ts`,
`tasks-board.component.ts`) — neither file is in this change set; not a regression.

---

## Condition verification — C-201…C-214 + C-240…C-242 (independently confirmed in code)

| Cond | What it requires | Verified in code | Proving negative |
|---|---|---|---|
| **C-201** | Common vault realpath-contained to a server-known root; sibling-prefix + symlink-escape rejected, nothing written | `write.js resolveCommonKbDir()` realpaths `~/.aidevteam/kb-common`, asserts `isContained(realHome, real)`; per-write `isContained(vaultDir, realParent)` before `wx` | **N-201/N-202/N-203/N-203b** — traversal contained, sibling `kb-common-evil` rejected, real symlink escape refused (bytes unchanged), planted symlink not followed |
| **C-202** | Filename 100% server-derived for BOTH vaults | `slugify()` excludes `/ \ . NUL`; `<slug>.md` server-fixed; collision → numeric suffix | N-201 (traversal title → contained `.md`), `kb-write` N-8 |
| **C-203** | O_EXCL no-overwrite on common | `writeNewFileExclusive()` `fs.openSync(target,'wx')`; EEXIST → next suffix | **N-204** (two same-title common adds; first bytes unchanged) |
| **C-204** | 64 KB cap + text/markdown allowlist on every new write path | `kbBodyError()` (≤64 KB, no C0 ctrl, surrogate-safe); `MAX_KB_TITLE=200` | **N-207** (oversize + binary common body → 400, nothing written) |
| **C-205** | Write-guard (403 w/o X-AIDT / non-loopback) on every new mutation route | `kb/add` rides `/api/*` POST through `writeAllowed` (by placement) | **N-205** (live server: project + common adds 403 w/o X-AIDT and with non-loopback Host; both vaults empty) |
| **C-206** | `scope` is a server-validated ENUM, never a client path; out-of-enum/path-shaped rejected; `global` read-aliased not written | `SCOPE_ENUM={project,common}`, default `project`; `!has → reject('invalid scope')`; enum selects root, never concatenated | **N-206** (`../../etc`, `/abs`, `common/../..`, `bogus`, `global` all rejected, nothing persisted, no path leak) |
| **C-207** | Holding vault wins for authorization (front-matter = intent) | `state.js readVault(..., enforcedScope, ...)` sets `scope: enforcedScope`; front-matter `scope` ignored for authz | **N-213** (project-vault file claiming `scope:common` treated as project; does not leak to other project) |
| **C-208** | Front-matter parse: schema-keys-only, FORBIDDEN_KEYS dropped, scalars/flat-lists, size-bounded, never throws → defaults | `knowledge.js parseFrontMatter()` regex-fenced, `MAX_FRONT_MATTER_BYTES=8KB`, own-property only, `FORBIDDEN_KEYS` skip, closed vocabs, `try/catch → defaults()` | **N-208/N-208b/N-209/N-209b/N-209c/N-209d** + **N-208proj** (proto-pollution dropped, nested/giant/truncated/non-string never throw) |
| **C-209** | Reading Common never leaks a project note (and vice-versa) | `readCommonKb()` reads only resolved common root; `readProjectKb()` only project dir; merged in `buildKnowledge()` | **N-209iso** (no project note in common set), **N-210** |
| **C-210** | Cross-type match is the strict additive predicate (no stack leak); narrowest default | `scopeMatches()`: project→ownProject; common→approved-common AND (any ∈ stack OR intersection); `projectStack()` precedence manual>detect>any | **N-211/N-211b** (java sees java+any, never python-only; no-stack sees only any) — proven end-to-end via `buildState` |
| **C-211** | Match predicate + front-matter parse single-source / parity-tested (hub↔memory) | `knowledge.js` is the canonical module; `knowledge-match.ts` is the mirror; `scope-fixtures.json` shared; `scope-parity.test.js` evaluates the TS mirror in a child node process and asserts byte-identical row-for-row | **N-212** — real cross-implementation parity test (see "Parity" below) |
| **C-212** | `commonVaultDir` override realpath-resolved + contained; bad override degrades/refuses | `commonVaultRoot()` ignores relative/NUL overrides → default; `resolveCommonKbDir()` realpaths absolute override, requires dir + containment to home, else null | **N-214** (relative→default; non-dir untouched; symlink-escaping override target unchanged) |
| **C-213** | No info leak in errors | All `reject()` messages are static terse literals; no path / `$HOME` / stack trace echoed | **N-215** (refused common write: no home/target/project/`kb-common`/stack-frame token in body) |
| **C-214** | Single mutation chokepoint, atomic | Only `addKbNote` writes vault files; `writeNewFileExclusive` O_EXCL + fsync | Covered by C-203/C-205 tests |
| **C-240** | Honest indexing preserved (`filename-only` unless real embedder) | `buildKnowledge().method = configured ? 'local-embeddings' : 'filename-only'` via `embedderConfigured` (reads only the selector, no secret); no embed job on add | **N-216** (`method` stays `filename-only` after scoped adds in both scopes) |
| **C-241** | Untrusted content rendered escaped, source-scan-enforced | FE: `no-unsafe-binding.spec.ts` whole-app scan (0 `[innerHTML]`/`bypassSecurityTrust*`); list + preview render via interpolation | **N-219** behavioral: base-panel escapes hostile name + stack tag (`img[onerror]` absent, no global side-effect); add-note-form previews script payload inert; **N-219-store** stores body verbatim (inert) |
| **C-242** | "Common" = your own projects on this machine, never cloud; filename-only honesty | Copy: "saves a markdown file on this machine — nothing is uploaded"; "Common is shared across your own projects on this machine — never uploaded, never a cloud" | base-panel + add-note-form specs assert the honest local/Common copy |

**Result: 14/14 ADT-234 binding conditions + 3/3 cross-cutting honesty conditions verified met in code,
each with a genuine proving test.**

---

## Parity verification (C-211 / N-212) — confirmed real and meaningful

`hub/test/scope-parity.test.js` does **not** merely re-assert the hub side. It:
1. loads the shared `hub/lib/scope-fixtures.json` table,
2. evaluates the **hub** `scopeMatches` over every row,
3. spawns a child `node` process that imports the **TS mirror** (`knowledge-match.ts`) and evaluates
   the same rows, and
4. asserts the two result arrays are **byte-identical row-for-row** AND each equals the fixture's
   `expected`.

A predicate drift on either side (different `any`-wildcard rule, a missing status gate, a lost alias)
fails the test on both sides. The fixture table covers the load-bearing cross-type cases: own-project
(true), another project's project note (false), java→java (true), **python→java (false)**, any→java
(true), **java→no-stack (false)**, any→no-stack (true), intersecting stacks (true), and
pending/rejected/wrong-status common (false). The memory side independently re-checks the same fixture
in `claude/memory/test/knowledge-match.test.ts`. **This is a true single-source-of-truth + parity
arrangement; C-211/N-212 met.**

Minor predicate divergence noted (NIT-2): the TS mirror applies the `global→common` alias *inside*
`scopeMatches` (`aliasScope`), whereas the hub aliases only in `parseFrontMatter` (so its
`scopeMatches` never receives `global`). System-level behaviour is equivalent — the JS path has
already aliased before recall — but the fixture table has **no `global` row**, so the parity test does
not lock this corner. Adding a `global`-scope fixture row would harden the parity. Not blocking.

## Cross-type / cross-project leak verification (C-209 / C-210)

Proven **end-to-end through `buildState`** (not just the unit predicate):
- **N-210**: project A's projection contains none of project B's `scope:project` rows, and vice-versa.
- **N-211**: a `java` project's `common` set includes `java-common` + `any-common` and **excludes
  `python-common`**; its own project note is present.
- **N-211b**: a no-stack project's `common` set is **exactly `['any-common']`** — no stack-specific leak.
- **N-209iso**: the `common` doc set never contains a project-scoped note.
- **N-213**: a project-vault file lying `scope:common` in its front-matter is authorized as **project**
  (holding vault wins) and does not leak into another project.

Memory recall (`restore-context.ts`) applies the same shared `scopeMatches` to narrow `global/common`
rows by the project's declared stack (`projectStackOf`), and `collections.ts FILTERABLE` adds `stack`
as an AND term — consistent with the hub projection. No relaxation of the existing `project_id`+`scope`
AND-equality isolation.

---

## Facts-only / self-describing scan (Code Standard)

Grep of the changed **production** source (`hub/lib/{knowledge,write,state,api}.js`,
`claude/memory/src/lib/{knowledge-match,project-stack}.ts`, `restore-context.ts`, `collections.ts`,
and all changed `studio/cockpit/src/**/*.ts` excluding specs) for ticket IDs (`ADT-…`), condition
codes (`C-2xx`/`N-2xx`), persona names (Soren/Jorge/Aura/Finn/James), and sprint refs:

- **No process artifacts in production source.** The only grep hits are facts, not artifacts:
  - `api.js` / `write.js`: "C0 control char" (a real character-class fact) and the owner-token string
    `"/be"` (an actual data-model value the analyzer documents), not a persona reference.
  - `glyph.component.ts`: the glyph name `'condition'` (a stage-rule icon), not a review-condition code.
- **Doc-comments are facts-only and self-describing** — they describe behaviour/contract, not history,
  tickets, or agents. Names are self-describing (`resolveCommonKbDir`, `scopeMatches`, `frontMatterHeader`).

**Test files** (`knowledge.test.js`, `kb-scope-write.test.js`, `kb-projection.test.js`,
`scope-parity.test.js`, `mutation-guard.test.js`) carry `N-2xx` IDs in test names/comments. These are
**traceability annotations the SECOPS gate explicitly requires** ("`/rev` confirms each N-test is a
real test…"), consistent with the existing ADT-223 baseline test style, and they live in tests, not
shipped product code. **Not flagged as BLOCKING** — removing them would defeat the gate's auditability.
The `ADT-9` token in `project-shell.component.spec.ts` is **fixture data** (a mock ticket id rendered on
a board column to prove the board displays ticket ids), not a reference to this ticket.

---

## Findings

### BLOCKING
None.

### WARNING
None.

### NIT
- **NIT-1 — `claude/memory` `test` script.** `node --test test/` does not pick up the `.ts` test files
  on Node 24 (`MODULE_NOT_FOUND`); the glob `node --test "test/*.test.ts"` works. Update the `test`
  script to the glob so the suite runs via `npm test`. (Pre-existing; out-of-scope file, noted for the team.)
- **NIT-2 — parity fixture lacks a `global` row.** The `global→common` alias is handled in two slightly
  different places across hub/memory; add a `scope:"global"` fixture row to `scope-fixtures.json` so the
  parity test locks that corner too.
- **NIT-3 — unused import in `write.js`.** `parseFrontMatter` is destructured from `./knowledge`
  (line 17) but `write.js` only *emits* front-matter, never parses it. Drop `parseFrontMatter` from the
  import to keep the dependency honest.
- **NIT-4 — "Indexed on this machine." copy (base-panel `.local` line) / per-doc `index:'indexed'`.**
  The authoritative honesty signal is the `method` line (`Filename index only …`), which is correct.
  The standalone word "Indexed" and the per-doc literal `index:'indexed'` (matching the pre-existing
  `buildBase` behaviour) are slightly imprecise in filename-only mode but are disambiguated by the
  method line; consider "Filename-indexed on this machine." Cosmetic.
- **NIT-5 — mixed apostrophe glyphs** in `add-note-form` `friendlyError` (straight `can't` vs curly
  `Couldn't`). Cosmetic consistency only.

---

## Review assumptions / scope notes

- I treated the **uncommitted working tree** as the change set (`git diff` / `git status`), per the
  task scope — `git diff main` shows the whole branch and is not the review surface.
- I did **not** run e2e/Playwright (no live hub on :4477), per instruction. The write-guard negative
  (N-205) is nonetheless exercised against a real in-process server in `mutation-guard.test.js`.
- ADT-235 (propose→approve inbox, C-220…C-229 / N-220…N-233) is **not** in this change set and was not
  reviewed; its gate remains separate.
- The `commonVaultDir` override implementation is **stricter** than C-212's letter: it refuses any
  override whose realpath escapes `$HOME` rather than letting an override become its own root. This is a
  safety-positive deviation (narrower blast radius), is documented in the code comment, and is proven by
  N-214 — accepted.

**Reviewed by:** /rev · **Date:** 2026-06-09 · **Decision:** APPROVED (`CODE_REVIEWED = passed`).
**Next:** `/qa` + `/e2e` may begin. `/legal` privacy-copy review (C-242) must complete before the
"Common" honesty copy ships, per the SECOPS gate. Then `/sm` — please update sprint status.
