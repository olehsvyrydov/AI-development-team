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
- Balanced, non-nested code fences (wrap a `markdown` template that contains inner code in **4** backticks).
- A sharp, disambiguating `description` so the right agent triggers.

## Testing your changes

```bash
./install.sh --link   # symlink this repo into ~/.claude so changes apply immediately
```
Then invoke the agent/command in your editor and confirm it behaves as intended.

## Pull requests & commits

- Branch from `main`: `feat/<short-desc>` or `fix/<short-desc>`.
- Keep PRs focused; fill out the PR template.
- Commit messages: imperative summary + a short body. **Do not add AI co-author trailers.**
- CI/Copilot review runs on PRs; address feedback before merge.

By contributing, you agree your contributions are licensed under the repository's [MIT License](LICENSE).
