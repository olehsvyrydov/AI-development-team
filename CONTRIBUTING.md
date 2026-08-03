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
└── workflow/workflow.yaml  # the proportional, enforced workflow + presets
```

Key ideas:
- **Roles are agents; technology stacks are `references/`.** A role agent (e.g. `/be`) detects the project's stack and loads `references/<stack>.md` — we don't ship one agent per framework. See `claude/skills/disambiguation.md`.
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
pip install pyyaml                        # once
python3 scripts/validate-framework.py     # the framework gates
claude plugin validate ./claude           # the plugin manifest + component check
./install.sh --dry-run --editors=all --scope=project --yes
```

`validate-framework.py` checks seven things, each of which has actually broken here at least once:

| Gate | Catches |
|------|---------|
| G1 frontmatter | A `SKILL.md` whose YAML does not parse. It then loads with **empty metadata** — no description, so it can never auto-trigger, while looking correct in the file |
| G2 manifests | Malformed plugin JSON, and a `version` key reappearing in `plugin.json` (omitted on purpose so the commit SHA is the version) |
| G3 counts | A documented skill/command/template count that no longer matches the tree |
| G4 links | A relative `.md` link pointing at nothing. Fenced blocks are skipped, since template examples are illustrative |
| G5 credentials | A credential-shaped file being tracked in a public repository |
| G6 retired | A reference to a mechanism that was removed — a promise the repo no longer keeps |
| G7 vendor-neutrality | A backend product named inside a skill instead of in its adapter reference |

If a gate is wrong, change the gate deliberately and say why in the commit — do not work around it.

## Pull requests & commits

- Branch from `main`: `feat/<short-desc>` or `fix/<short-desc>`.
- Keep PRs focused; fill out the PR template.
- Commit messages: imperative summary + a short body. **Do not add AI co-author trailers.**
- CI/Copilot review runs on PRs; address feedback before merge.

By contributing, you agree your contributions are licensed under the repository's [MIT License](LICENSE).
