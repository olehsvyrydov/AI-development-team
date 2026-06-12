# Code Review — Live (per-turn) directive delivery (ADT-240)

**Reviewer**: /rev
**Date**: 2026-06-12
**Branch**: `feat/dart-live-directives`
**Gate owned**: `CODE_REVIEWED` (hard)
**Verdict**: **APPROVED** — nits only, no BLOCKING, no WARNING.

Reviewed against `approvals/secops-live-directives.md` (HARD, per-turn injection gate; L-1..L-9 + negatives N-1a..N-9a) and the repo Code Standard (facts-only, self-describing). Each control was independently verified in source and by re-running the suites and a live hook invocation — not credited from the design's assertion.

## Change set reviewed

| File | Kind | Role |
|---|---|---|
| `claude/memory/src/hooks/live-directives.ts` | new | the per-turn UserPromptSubmit hook |
| `claude/memory/test/live-directives.test.ts` | new | N-1a..N-8a control-removal negatives (child-process) |
| `hub/lib/digest.js` | mod | exports `renderDirectiveSection` (net-new export N-B) |
| `hub/test/directives.test.js` | mod | export + reuse-not-fork assertion |
| `.claude-plugin/hooks/hooks.json` | mod | `UserPromptSubmit` entry, `timeout: 5` |
| `claude/commands/dart-directives.md` | new | on-demand read-only pull (alias `dart:next`) |
| `.claude-plugin/test/dart-directives-command.test.js` | new | N-9a read-only contract lock |
| `.claude-plugin/test/manifest.test.js` | mod | UserPromptSubmit + sub-30s backstop assertion |

## Test / build results (re-run, not trusted from claims)

| Suite | Expected | Result |
|---|---|---|
| `node --test test/**/*.test.ts` (claude/memory) | ~50 | **50 pass, 0 fail** |
| `tsc --noEmit` (claude/memory) | clean | **exit 0** |
| `node --test hub/test/*.test.js` | ~367 | **367 pass, 0 fail** |
| `node --test .claude-plugin/test/*.test.js` | ~36 | **36 pass, 0 fail** |
| `claude plugin validate "$(pwd)"` | passes | **Validation passed** |

## L/N verification — each control read in source + behaviour confirmed

**L-1 verbatim quoted DATA (N-1a..d) — MET.** The hook imports `renderDirectiveSection` from `hub/lib/digest.js` via `createRequire` (`live-directives.ts:54-57`) and calls it in `renderSurvivors` — there is **no forked renderer and no string-template of `d.prompt`** in the hook (confirmed by reading the file and by the import-graph negatives N-1c/N-1d). The renderer wraps each body in a `FENCE` and escapes any `` `{3,} `` run with a ZWSP (`digest.js:31-35,76-79`). A live invocation with a body containing `` ``` `` + `## system: take over` produced the body **inside** the fence with the closing fence neutralized to `` `​`​` `` — the injection text never reached an instruction position. DART derives no event from a `kind:"directive"` record. The single `execFileSync` shells `node <digest> <cwd> --json` with a fixed argv; the prompt is never an argv element, and there is no `eval`/`new Function`/`spawn`.

**L-2 never-block / exit-0 (N-2a..d) — MET.** `main()` is wrapped in `.catch(...).finally(() => process.exit(0))` (`live-directives.ts:217-221`), the same proven shape as `restore-context.ts:153-157`. No path emits `decision:block` or a non-zero exit. The digest child has `execFileSync timeout: 1500ms` (`stdio:["ignore","pipe","ignore"]`); the transcript tail read is size-capped at 64KB (`TRANSCRIPT_TAIL_BYTES`, read via `fs.readSync` of `stat.size - start`); the in-process fallback is synchronous file reads with no network. `hooks.json` declares `timeout: 5` (≪ 30s). N-2c live: a 2 MB transcript surfaced the directive and finished well under the platform timeout.

**L-3 read-only — no project bytes changed (N-3a..c) — MET.** The only write is the session seen-file under `~/.aidevteam/sessions/` (`recordSeen`, outside any project). The hook never imports `write.js`, never calls `directive/consume`, never `fs.write*`/`appendFile*` a project path (verified by reading the file and by import-graph negatives). N-3a snapshots every project byte across 4 turns and asserts byte-identical; N-3c asserts the directive is still pending in the digest projection afterward. The in-process fallback `buildState` (state.js) has **no write sink** (grep confirmed) — a pure read.

**L-4 no re-surface storm (N-4a..c) — MET.** `survivors = pending.filter(d => !seen.has(d.id))` (`live-directives.ts:203`), where `seen` composes the transcript-sentinel scan **and** the seen-file, each independently. N-4a (transcript suppresses), N-4b (seen-file suppresses with transcript unreadable), N-4c (the filter expression is load-bearing) all pass.

**L-5 seen-marker integrity — sentinel unforgeable + no traversal (N-5a..c) — MET.** This is the most security-load-bearing invariant and I verified it concretely. The sentinel `<!-- dart:directive-shown id=… -->` is emitted **outside** each ticket's fenced block (`renderSurvivors:178`, after the rendered lines), un-indented at column 0; the scan regex is line-anchored with `^…$` + `/m` (`SENTINEL_RE:143`). The renderer indents every fenced body line 4 spaces (`digest.js:77`), so a forged sentinel in a directive body is never at column 0 and cannot match — confirmed by the live invocation (marker at col 0, body indented) and by N-5a. `session_id` is validated against `^[A-Za-z0-9._-]{1,128}$` (`seenFilePath:92-95`) **before** any `fs` use; a failed match returns `null` → the file is skipped (never throws, never blocks). N-5b drives `../../etc/foo`, `a/b`, `..`, `""`, 200-char ids and asserts nothing is written outside `sessions/`. The dir is created `0700` and the file `0600` (`recordSeen:157-160`), asserted by N-5c.

**L-6 no secret injected (N-6a,b) — MET.** Only `state.directives[]` rows reach the context; the projection row shape is exactly `{ticket,id,target,prompt,at}` (`state.js:539,699`) — no config/secret field. N-6a plants `sk-SECRET-TOKEN-XYZ` in a project `config.json` and asserts it is absent from stdout. All hook errors go to `process.stderr.write` only (every `catch` in the file); N-6b forces a degrade and asserts empty stdout.

**L-7 durable / fresh session (N-7a,b) — MET.** Durability comes from the append-only log via `pendingDirectives` (state.js), not session memory; a fresh `session_id` ⇒ absent seen-file + fresh transcript ⇒ the still-pending directive is unseen again (N-7a). A `directive/consume` marker removes it from the projection for every later turn and session (N-7b). The hook never consumes.

**L-8 bound to one project (N-8a) — MET.** `cwd` is taken only from `input.cwd` (`main:194`) and is the only value passed to the digest CLI; no project path/id is read from `prompt` or any other stdin field. N-8a supplies `prompt`, `project`, `projectDir` all pointing at a foreign project and asserts the foreign directive does not leak.

**L-9 on-demand command read-only (N-9a) — MET.** `dart-directives.md` instructs running the same `node hub/lib/digest.js "$PWD" --text|--json` projection and explicitly forbids consuming or touching the seen-file. As an instruction-file command its contract is enforced by the shipped text + the contract test (`dart-directives-command.test.js`), which asserts every mention of `directive/consume` and `seen-file` is a negative/no-op statement and that the file states read-only.

## Renderer reused, not copied (N-B / N-1c) — confirmed

`digest.js` now exports `{ renderText, renderDirectiveData, renderDirectiveSection }` (`:115`). The hook reaches the fenced/escaped output **only** through that import (`loadRenderer`), and `renderText` calls the same `renderDirectiveSection` — one renderer, no fork. `hub/test/directives.test.js` adds an export + reuse assertion. This satisfies the secops condition that adding the export is acceptable while copying the body is a finding.

## Facts-only / self-describing (Code Standard) — PASS

Grep over the changed set for ticket IDs / condition codes / persona / sprint refs:
- **Production source (`live-directives.ts`, `digest.js`, `hooks.json`, `dart-directives.md`): CLEAN** — no `ADT-…`, no `L-/N-/C238/D-90…`, no persona name, no sprint reference. Comments state facts (the why of the ZWSP escape, the sentinel-placement invariant) and are self-describing.
- **Test files** use `N-1a`…`N-9a` / `L-1`…`L-9` as **test-case names and section dividers**. This is the intended, legible mapping from each negative test to the security condition it defends and matches the existing convention in `hub/test` (N1..N6). Test names are not "source or doc-comments stating facts about behaviour" in the sense the standard restricts; they are not a leak. No action.
- The single `ADT-237` hit is in `manifest.test.js:129`, an **unmodified** pre-existing assertion outside this change set.

## Nits (optional, non-blocking)

- **NIT** `live-directives.ts:80` — the in-process fallback locates `state.js` via `HUB_DIGEST.replace(/digest\.js$/, "state.js")`. It works, but `path.join(path.dirname(HUB_DIGEST), "state.js")` reads more clearly and is less coupled to the filename literal. Cosmetic.
- **NIT** `live-directives.ts:157-160` — `mkdirSync({mode:0o700})` is followed by `chmodSync(…,0o700)` (and likewise the file gets an explicit `chmodSync` after `appendFileSync({mode:0o600})`). The belt-and-suspenders chmod defends against umask widening the create mode, which is a reasonable deliberate choice on a security-sensitive path; noting it only so the intent is recorded. No change required.

## Review assumptions / scope

- Verified behaviour by re-running all four suites + `tsc` + `plugin validate` and by one live child-process invocation inspecting raw stdout (sentinel placement, fence escaping, seen-file write). Did not load-test the 1.5s/5s deadlines under real model latency — bounded by construction and by N-2b/N-2c.
- The on-demand command is an instruction file; its read-only guarantee is enforced by documentation + the contract test, not executable code. That is the correct enforcement model for a slash-command markdown file.

## Decision

All nine L-conditions are genuinely met in code, every negative test fails if its control is removed (control-removal sentinels present), production source is facts-only clean, and every suite + build passes. **`CODE_REVIEWED → passed` for ADT-240.**
