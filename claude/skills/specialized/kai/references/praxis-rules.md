# Promoting Praxis rules into skills

How `/kai` turns approved working-rules into proposed `SKILL.md` edits, and the contract it
depends on.

---

## Where rules come from

Praxis — the optional agent-memory runtime — mines **scoped working-rules** from a session's own
transcript when the session ends. Nobody writes them by hand and there is no capture ceremony:
a rule is a by-product of working.

A mined rule starts at `trust: proposed`. It does nothing in that state — Praxis withholds
proposed rules from the agent entirely. A human promotes it with `praxis rules --approve <id>`,
which sets `trust: approved` and full confidence, or removes it with `--dismiss` (soft, and
reversible with `--restore`; a dismissed rule is never re-proposed by later mining).

```
session ends → mined → proposed → [human] → approved → fires at the edits it governs
                                     └────→ dismissed → never re-proposed
```

**`/kai` reads only `approved` rules.** A proposed rule is not yet the user's word — promoting
one into a `SKILL.md` would launder a machine's guess into a standing instruction, and would
also route around the approval step Praxis exists to enforce.

## The unit

Rules are `memory_unit` rows with `kind = 'rule'`:

| Field | Use |
|---|---|
| `title` | The rule statement itself — secrets redacted, text neutralized at capture. |
| `trust` | `auto` \| `proposed` \| `approved`. **Filter to `approved`.** |
| `status` | `current` \| `superseded`. **Filter to `current`** — superseded means dismissed. |
| `scope_triggers` | Where the rule applies (path globs). The primary routing signal. |
| `judgment_kind` | `convention` \| `known_mistake` \| `design_rule`. Picks the target section. |
| `audience` | `reviewer` \| `developer` \| `tester` \| `all`. Narrows the target skill. |
| `sighting_count` | Times the rule was re-observed. A frequency signal, not a gate. |
| `example` / `counter_example` | Where the rule applies, and where it does not. |
| `confidence` | 1.0 once approved. |
| `source_ref` | Provenance — carry it into the proposal so a reviewer can trace the claim. |

## Reading them

Three paths, in order of preference:

1. **The `recall` MCP tool** (`kind: "rule"`) — the normal path when the Praxis MCP server is
   connected. Rules come back rendered with their exceptions attached.
2. **`praxis rules`** — the CLI listing, with `--trust approved` to filter.
3. **The store directly** — `.praxis/memory.db`, a SQLite database with an FTS5 index
   (`memory_fts` over `memory_unit`). Read-only:

   ```sql
   SELECT id, title, scope_triggers, judgment_kind, audience, sighting_count, source_ref
   FROM memory_unit
   WHERE kind = 'rule' AND trust = 'approved' AND status = 'current';
   ```

   Use the FTS index (`memory_fts MATCH ?`) when searching by text rather than listing.

**Never write to the store.** `/kai` is a reader. Approval, dismissal and restoration are the
human's, through Praxis's own commands.

## Routing a rule to a skill

A rule earns a place in a `SKILL.md` only if it is **universal** — true beyond the project it
was mined in. Most rules are not, and that is the expected outcome.

**Which skill** — narrow with `audience` first, then `scope_triggers`:

| Signal | Target |
|---|---|
| `audience: reviewer` | the code-reviewer skill |
| `audience: tester` | the testing skills |
| `audience: developer` + a stack-specific `scope_triggers` glob | that stack's role skill or its `references/<stack>.md` |
| `audience: all`, no stack in scope | a cross-cutting process skill, or nothing |

**Which section** — from `judgment_kind`:

| `judgment_kind` | Section |
|---|---|
| `known_mistake` | Anti-Patterns / Common Mistakes |
| `convention` | Standards / Best Practices |
| `design_rule` | Standards, or Expertise when it needs explanation |

Section safety is unchanged and absolute — see the SAFE / CAUTIOUS / UNSAFE classification in
`SKILL.md`. Trigger, Context, Workflow and frontmatter are never touched: they decide when a
skill loads, and a wrong edit there silently stops it loading at all.

## Promotion test

A rule is proposable when **all** hold:

1. `trust = approved` and `status = current`.
2. **Universal** — no project name, ticket key, path unique to one repository, or one-off
   workaround. A rule about `src/billing/` in one product is not a framework rule.
3. **Not already covered** — check the target `SKILL.md` for existing text saying the same thing.
4. **Actionable** — names a mechanism, not an intention. *"Be careful with migrations"* fails;
   *"a migration that adds a NOT NULL column without a default locks the table — add the
   column nullable, backfill, then constrain"* passes.
5. **Names its enforcing symbol** where it claims one, so a reviewer can check the rule is real.

`sighting_count` is evidence, not a threshold: a rule sighted many times is better attested, but
a single approved rule that passes 2–5 is worth proposing. The human already gated it once.

## Output — a diff, never a commit

`/kai` proposes. It does not apply, and it does not commit.

For each promotable rule, emit a **unified diff** against the target `SKILL.md`, with the rule's
`id` and `source_ref` alongside it so the reviewer can trace where it came from:

```diff
--- a/claude/skills/<path>/SKILL.md
+++ b/claude/skills/<path>/SKILL.md
@@
 ## Anti-Patterns
+
+- <the rule statement>
```

Then stop. The human applies the diff, or does not. Nothing in this skill edits a `SKILL.md`
in place, stages a change, or writes to the Praxis store.

## When there are no approved rules

Say so and stop:

> No approved Praxis rules found. Rules are mined automatically at session end and start as
> `proposed`; run `praxis rules` to review them and `praxis rules --approve <id>` to promote
> one. Nothing to propose until then.

Do **not** substitute another source, infer rules from commit history, or synthesise plausible
ones. An empty well is a real and correct answer — inventing content to fill it is precisely
the failure this skill was rewritten to remove.
