# Rule sources — optional adapters for `/kai`

`/kai` takes one input: **working-rules a human has explicitly approved.** The skill itself names
no product and depends on none. This file is the adapter layer: it lists concrete places those
rules can come from, and how to read each.

**The framework works with none of these configured.** With no source, `/kai` reports that there
is nothing approved and stops. That is a correct outcome, not a broken install.

---

## What an adapter must supply

Whatever the backend, `/kai` needs three things per rule. An adapter's only job is to map the
backend's vocabulary onto them.

| `/kai` needs | Meaning |
|---|---|
| **approved** | A human explicitly promoted this rule. Distinct from anything the system captured, inferred, or merely proposed. |
| **current** | Not superseded, retired, or dismissed. |
| **scope** | Where the rule applies — used to route it to a target skill. |

Optionally, and used when present: the **audience** (which role the rule is for), the **kind of
judgment** it encodes (a convention, a known mistake, a constraint the design depends on), how
often it was **re-observed**, and an **identifier + provenance** so a proposal stays traceable.

**If a backend cannot distinguish approved from proposed, it does not satisfy the contract.**
Treat everything in it as proposed and propose nothing — ask the user to confirm rules explicitly
instead. A source that cannot express human approval is the one failure mode that matters here,
because the whole point is that a human already said yes.

---

## Adapter: an agent-memory MCP server

The common case. A memory runtime that observes real sessions, proposes scoped rules from them,
and holds each one until a human approves it.

Read through the server's recall tool, restricted to rules, and keep only the approved, current
ones. Typical vocabulary maps as:

| `/kai` needs | Usually exposed as |
|---|---|
| approved | a trust or state field distinguishing *approved* from *proposed* |
| current | a status field, with superseded/retired as the negative |
| scope | path globs or a scope/trigger field |

**Reference implementation.** [Praxis](https://github.com/olehsvyrydov/praxis), the sibling
agent-memory runtime described in the README, satisfies this contract: it mines scoped rules from
each session automatically, holds them at *proposed*, and promotes them to *approved* only on an
explicit human command. It exposes them through a `recall` MCP tool and a local store.

It is named here as **one example**, not a dependency. Any backend meeting the contract above
works identically, and `/kai` must not encode this one's table names, column names, or CLI flags.

## Adapter: a file the team maintains

No services required. The project keeps approved rules in a markdown or YAML file it controls —
`docs/rules.md`, or wherever it already documents conventions.

Approval is the fact that a human committed the entry, so require an explicit marker per rule
(a status field, a section heading such as *Approved*, or a checked box). Entries without the
marker are proposals and must not be promoted. Scope is whatever the entry states about where it
applies; when it states none, ask rather than guessing.

## Adapter: none

The default. `/kai` reports that no approved rules are available and stops:

> No approved rules found. `/kai` promotes rules a human has already approved; configure a memory
> backend or maintain an approved-rules file, and there will be something to review.

Do not substitute another source, infer rules from commit history, or synthesise plausible ones.

---

## Adding an adapter

Keep the boundary intact:

- Document the mapping **here**, not in `SKILL.md`. The skill states what qualifies and what to
  emit; this file states how to fetch.
- Never put a product name in a skill's frontmatter, trigger, or core contract — those decide when
  the skill loads and what it promises, and neither should depend on a vendor.
- If an adapter needs the skill to change, the contract is probably wrong. Fix the contract to be
  more general rather than teaching the skill about one backend.
