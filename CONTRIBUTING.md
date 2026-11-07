# Contributing to AI Dev Team

Thanks for helping build an open, vendor-neutral AI development team! This framework is just **Markdown** — agent personas (`SKILL.md`), slash commands, a workflow definition, and templates. No build step, no runtime to learn. Contributions of all sizes are welcome.

## Ways to contribute

- **Improve an agent** — sharpen a `SKILL.md` or add a stack reference (see below).
- **Add a new agent** — a new specialist role (the 5-minute path below).
- **Improve the workflow** — `claude/workflow/workflow.yaml` + the `workflow-engine` skill.
- **Docs, examples, bug reports** — open an issue using the templates.

## How the framework is structured

```
claude/
├── CLAUDE.md / AGENTS.md   # always-on instructions (kept lean; emit both)
├── skills/<category>/<agent>/
│   ├── SKILL.md            # the persona: < ~500 lines, frontmatter `description` is always in context
│   └── references/         # deep knowledge, loaded on demand (can be large)
├── commands/<name>.md      # slash command that invokes a skill
├── hooks/                  # hooks.json + commit_gate.py: blocks commit/push/PR creation on an unmet hard pre-implementation gate
└── workflow/workflow.yaml  # the proportional workflow + presets
```

Key ideas:
- **Roles are agents; technology stacks are `references/` — and core languages are knowledge skills.** A role agent (e.g. `/be`) detects the project's stack and loads `references/<stack>.md` — we don't ship one agent per framework. The deliberate exception is `claude/skills/development/languages/`: language expertise (Rust, Java, TypeScript; SQL with Postgres/MySQL/Oracle/SQLite branches) is a first-class skill, because references never auto-load and language standards must apply whenever that language is being written — with no role command invoked. Language skills have no persona and no slash command; role agents route into them, and each body of knowledge exists in exactly one place. See `claude/skills/disambiguation.md`.
- **Progressive disclosure.** Keep `SKILL.md` under ~500 lines; move depth into `references/`. The frontmatter `description` is the always-in-context "menu" the model scans, so keep it sharp and enumerate what the agent covers.
- **OSS-first, no lock-in.** Defaults need zero paid accounts; Jira/Confluence/MCP backends are optional overlays enabled in `workflow.yaml`.

## Add a new agent in ~5 minutes

1. Create `claude/skills/<category>/<your-agent>/SKILL.md`:
   ```markdown
   ---
   name: your-agent
   description: "Your Agent (/cmd) — one-sharp-sentence on what it does and when to use it. NOT for <the lookalike agent>."
   ---
   # Your Agent (/cmd)
   ## Gate Check (workflow)
   Consult the `workflow-engine` skill first. <preconditions / what gate, if any, it owns>.
   ## When to use (and when not)
   ## Core expertise
   ## Standards
   ```
2. Add `claude/commands/cmd.md` that invokes it.
3. Add a row to `claude/commands/agents.md` (Core or Specialists) and, if it overlaps another agent, a line in `claude/skills/disambiguation.md`.
4. If the agent has a lot of depth, put it in `references/` and add a references index + (for multi-stack roles) a "Stack selection" router.

## Add a language skill

Language skills live in `claude/skills/development/languages/<lang>/` and differ from agents: no persona, no command file, and a frontmatter `description` written to **auto-trigger from context** — name the concrete file signals (extensions, manifests, tool failures) first, and end with a NOT-clause so it doesn't fire spuriously.

1. Create `claude/skills/development/languages/<lang>/SKILL.md` (+ `references/` for depth, including a `<lang>-review.md` pass for `/rev`).
2. Point the owning role agents' router tables at it (`/be`, `/fe`, `/dba`, `/rev` as applicable) — the role routes to the one copy; it does not duplicate it.
3. Add a line to `claude/skills/disambiguation.md` and to the language-skills note in `claude/commands/agents.md`.
4. Update the skill-count claim sites (G3 lists them if you miss one). No command step — loading from context is the point.

## Quality bar

- `SKILL.md` < ~500 lines; deep content in `references/`.
- **Universal, reusable knowledge only** — no project/ticket/sprint specifics in skills.
- **No product names in a skill's frontmatter, trigger, or core contract.** Skills describe
  judgement and capability; a concrete backend (tracker, memory store, design tool, knowledge
  base) is an **optional adapter**, named only in a `references/` adapter file or in `docs/`.
  The framework must work correctly with no adapter configured — a skill whose input is absent
  says so and stops rather than guessing. If wiring up a backend needs the skill itself changed,
  generalise the contract instead of teaching the skill about one vendor.
- Balanced, non-nested code fences (wrap a `markdown` template that contains inner code in **4** backticks).
- A sharp, disambiguating `description` so the right agent triggers.

## Testing your changes

```bash
./install.sh --link   # symlink this repo into ~/.claude so changes apply immediately
```
Then invoke the agent/command in your editor and confirm it behaves as intended.

### Run the gates before you push

CI runs these on every pull request; running them locally is faster than a round trip.

```bash
pip install pyyaml pytest                 # once
python3 scripts/validate-framework.py     # the framework gates
python3 -m pytest -q tests                # the tests for the gates
claude plugin validate ./claude           # the plugin manifest + component check
./install.sh --dry-run --editors=all --scope=project --yes
```

`validate-framework.py` checks eleven things. The first nine each broke here at least once; the last two guard the commit gate hook:

| Gate | Catches |
|------|---------|
| G1 frontmatter | A `SKILL.md` whose YAML does not parse. It then loads with **empty metadata** — no description, so it can never auto-trigger, while looking correct in the file |
| G2 manifests | Malformed plugin JSON, and a `version` key reappearing in `plugin.json` (omitted on purpose so the commit SHA is the version) |
| G3 counts | A documented skill/command/template count that no longer matches the tree |
| G4 links | A relative `.md` link pointing at nothing. Fenced blocks are skipped, since template examples are illustrative |
| G5 credentials | A credential-shaped file being tracked in a public repository |
| G6 retired | A reference to a mechanism that was removed — a promise the repo no longer keeps |
| G7 vendor-neutrality | A backend product named inside a skill instead of in its adapter reference |
| G7 private-names | A tracked file path or line that names something the maintainers keep out of this public repository (see below) |
| G8 uk-tax-year | A tax-year label marked `(current)` in the compliance skills (any of `2026/27`, `2026-27`, `2026–27`, `2026/2027`, followed by `(current)`, `(current year)` or `(current tax year)`) that is not the UK tax year in force today; a table carrying such a label with no `Verified against GOV.UK on` line directly above it; or a `Verified against GOV.UK on` date that has no valid ISO date, is in the future, or is earlier than the start of the current tax year. A stale label or date is only a warning for the first 30 days of a new tax year (6 April to 5 May) and fails from 6 May |
| G9 hooks | `claude/hooks/hooks.json` that does not parse, has no top-level `hooks` object, has no `PreToolUse` entry for `Bash`, references no `${CLAUDE_PLUGIN_ROOT}/…` path at all, or passes a `${CLAUDE_PLUGIN_ROOT}/…` path that is not a regular file inside `claude/`. Claude Code skips such a hook silently, so the commit gate would stop guarding anything |
| G10 phases | A gate in `claude/workflow/workflow.yaml` or the demo's `workflow.yaml` without a valid `phase` (`pre_implementation` or `pre_done`), or `workflow.schema.json` no longer requiring it with that enum. The commit gate blocks only on hard gates of the `pre_implementation` phase |

The UK tax-year reminder workflow (`.github/workflows/uk-tax-year-reminder.yml`) opens a refresh issue on 6 April, but GitHub disables scheduled workflows in a repository with no activity for 60 days, so it can be switched off silently. G8 is the enforcement; the reminder is a convenience.

#### Private-names check

The names to keep out of this repository are listed in a local file that is never tracked, so the list itself is never published. Maintainers keep it at `.aidevteam/private-names` (a path the repository ignores), or point `AIDEVTEAM_PRIVATE_NAMES_FILE` at another path.

- One entry per line; blank lines and lines starting with `#` are ignored.
- A plain entry is a literal name, matched case-sensitively as a whole word.
- An entry starting with `re:` is a Python regular expression, for names that need exceptions, such as `re:(?<!Design )\bName\b`.
- Both the path and the content of every tracked file are checked. Files that are not valid UTF-8 (binaries) have only their path checked, not their contents. Tracked files under `docs/archive/` are included, although the other gates skip them. A hit is reported as `path:line matches private-names entry #N`, where `N` is the line in the file; the name, the pattern and the matched text are never printed, and a path that matches is not printed either.
- Entries are matched against the whole file text, with `^` and `$` anchoring at each line, and the line of each match is reported. A regex using `\s` or `[^…]` can therefore match across a line break; the match is reported at its first line.
- An invalid entry fails the check; it is never skipped. A file with no entries, or no file at the default location, is reported as skipped, not passed. A path set through `AIDEVTEAM_PRIVATE_NAMES_FILE` must exist, otherwise the check fails.
- The default location is resolved through the main checkout, so a linked worktree (which has no copy of the ignored file) finds the same list. When the main checkout cannot be located (for example a repository created with `--separate-git-dir`), a linked worktree reports the check as skipped with "list not found"; set `AIDEVTEAM_PRIVATE_NAMES_FILE` there.
- `python3 scripts/validate-framework.py --private-names-only` runs only this check and needs nothing outside the standard library. Adding `--staged` checks the staged snapshot instead of the working tree.
- `python3 scripts/validate-framework.py --private-names-message FILE` checks a commit message file; a hit is reported as `commit message matches private-names entry #N`. Everything from the scissors line down, such as the diff shown by `git commit -v`, is not checked. When a scissors line is present an editor ran, so lines above it that start with the configured comment character (`core.commentString` or `core.commentChar`, default `#`) are not checked either. Without a scissors line, comment lines are skipped only for editor-template messages (a plain `git commit` and `git commit` during a squash); for `-m`, `-F`, `-C`, `--amend -m`, and merge messages git keeps `#` lines in the final message, so every line is checked. With `core.commentChar=auto` the character is read from the scissors line or from the "Please enter the commit message" line git writes for editor commits; when neither is present, no line is treated as a comment and every line is checked.

The check runs locally only. CI has no list, so there it reports as skipped; the list is never uploaded or stored in the repository settings.

To run it on every commit, point the repository at the bundled hooks once (this also works in linked worktrees). This installs three hooks: `pre-commit`, which checks what is staged; `prepare-commit-msg`, which only records how the message was supplied (in a file under `git rev-parse --git-path aidevteam-commit-msg-source`, separate for each worktree, removed again by the next check); and `commit-msg`, which checks the message:

```bash
git config core.hooksPath scripts/hooks
```

`pre-commit` reads the staged content, so a name that is staged is caught even when the working copy has since been cleaned, and unstaged edits do not affect the result.

In hook modes (`--staged` and `--private-names-message`) the check prints nothing when it passes or has no list, and prints the failures when it blocks. The plain `--private-names-only` run prints its result lines as before.

Known gap: an editor commit made with `--cleanup=verbatim` or `--cleanup=whitespace` keeps lines that start with the comment character in the final message, and the hook does not check those lines.

If a gate is wrong, change the gate deliberately and say why in the commit — do not work around it.

## Pull requests & commits

- Branch from `main`: `feat/<short-desc>` or `fix/<short-desc>`.
- Keep PRs focused; fill out the PR template.
- Commit messages: imperative summary + a short body. **Do not add AI co-author trailers.**
- CI/Copilot review runs on PRs; address feedback before merge.

By contributing, you agree your contributions are licensed under the repository's [MIT License](LICENSE).
