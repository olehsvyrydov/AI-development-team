# DART — Claude Code plugin

Packages the DART AI Development Team as a single, versioned Claude Code plugin: the
agent team, the workflow-engine, the session-context hooks, and the write-back
control-plane MCP server — all from the source already in this repository, no fork.

This is the recommended way to use DART inside Claude Code. The `install.sh --user`
merge into `~/.claude` remains a supported fallback for an un-namespaced global install.

## What it adds

- **Commands** — every agent (`/dart:arch`, `/dart:be`, `/dart:fe`, `/dart:rev`,
  `/dart:qa`, …) and the workflow utilities, reachable under the `dart:` namespace.
- **Skills** — the `workflow-engine` and the agent-team skills, loaded by the host.
- **Hooks** — a `SessionStart` hook that injects the deterministic workflow digest
  (active tickets, gates, pending directives) and a `PreCompact` hook that saves
  session context. Both are best-effort and exit cleanly; neither can break a session.
- **MCP server** — a stdio write-back server (`dart`) that exposes the hub control
  plane as typed tools, bound to the launching project at spawn. It binds no port and
  spawns no remote endpoint.

## Install & enable

DART installs from **public git in two commands** — no clone, no `npx`, no `npm install`
of DART itself. This repository is itself the DART **marketplace**
(`.claude-plugin/marketplace.json`), and the `dart` plugin it lists is the plugin in this
same repo. Claude Code fetches both directly from GitHub.

### Two-command install (canonical — once published on the default branch)

```bash
# 1. Register the public repo as a marketplace (targets the repo's DEFAULT branch)
claude plugin marketplace add olehsvyrydov/AI-development-team

# 2. Install the dart plugin from the dart marketplace
claude plugin install dart@dart
```

`claude plugin marketplace add <owner>/<repo>` resolves the repository's **default
branch**. This canonical form works **once the plugin is on the default branch** (after
the feature branch merges to `main`). Until then, use the branch-ref form below.

### Current install (pre-main — pin the feature branch)

While the plugin lives on the `feat/dart-interactive` branch (not yet `main`), pin the
ref explicitly. The git-URL form clones over HTTPS and needs no SSH key:

```bash
# 1. Register the public repo at the feature branch
claude plugin marketplace add 'https://github.com/olehsvyrydov/AI-development-team.git#feat/dart-interactive'

# 2. Install the dart plugin from the dart marketplace
claude plugin install dart@dart
```

The GitHub shorthand `claude plugin marketplace add olehsvyrydov/AI-development-team@feat/dart-interactive`
is equivalent (it clones via SSH if your git is configured for it).

### Inspect and confirm

```bash
claude plugin marketplace list          # ❯ dart  Source: Git (…@feat/dart-interactive)
claude plugin details dart@dart         # skills, commands, the 3 hooks, token cost
```

`claude plugin install` lands the plugin **disabled** — DART is opt-in and stays inert
until you enable it (no hook fires, the MCP server is not spawned, no `/dart:*` command
or skill is active). `claude plugin details dart@dart` lists the agent + workflow skills,
the **three hooks** (`SessionStart`, `UserPromptSubmit`, `PreCompact`), and the `dart`
MCP server declared by the plugin.

### One-time MCP runtime setup (only if you use the `dart` MCP tools)

The `dart` MCP server ships its source but **not** its `node_modules` (install runs no
side effect outside the plugin directory). To run the MCP write-back tools, install its
pinned runtime dependencies once inside the installed plugin's `dart-mcp/` directory:

```bash
# the installed plugin lives under the user plugin cache, keyed by version
cd ~/.claude/plugins/cache/dart/dart/*/dart-mcp
npm ci    # installs @modelcontextprotocol/sdk + zod from the committed lockfile
```

The `/dart:*` commands, skills, and the SessionStart/UserPromptSubmit/PreCompact hooks
work **without** this step; it is required only for the live MCP write-back tools.

### No `npx` / `npm install` one-liner

There is **no** `npx dart` or `npm install`-style one-liner to install a Claude Code
plugin — Claude Code plugins install only through `claude plugin marketplace add` +
`claude plugin install`. npm is supported by the CLI **only as an optional marketplace
*source*** (a published package whose files contain a `.claude-plugin/marketplace.json`),
for teams that prefer registry distribution over a git source. DART is distributed from
public git and ships no such npm package today; the two-command git flow above is the
install path.

Opt in per project by setting `enabledPlugins` in that project's own settings — DART is
active only where a project asks for it:

```jsonc
// <project>/.claude/settings.json
{
  "enabledPlugins": { "dart@dart": true }
}
```

To opt in for your whole user account instead, add the same `enabledPlugins` entry to
your user-level Claude Code settings. The CLI also prints a one-line activation command
right after install if you prefer the command form over editing settings.

### What to expect once enabled

- **SessionStart digest** — each new session, the deterministic workflow digest is
  injected (active tickets, gates, pending directives). A `PreCompact` hook saves session
  context. Both are best-effort and exit cleanly; neither can break a session.
- **`/dart:*` commands** — every agent and workflow utility under the `dart:` namespace
  (`/dart:arch`, `/dart:be`, `/dart:fe`, `/dart:rev`, `/dart:qa`, …), plus the read-only
  workflow commands `/dart:status` (tickets · stages · gates), `/dart:directives` (pending
  directives), and `/dart:ask` (interpretation check over the project knowledge). Your own
  same-named commands are never shadowed.
- **`dart` MCP tools** — the stdio write-back control-plane server, bound to the
  launching project at spawn. It binds no port and spawns no remote endpoint.

### Optional memory / overlay env vars (names only)

The MCP server and the optional memory overlay read these from your host environment as
`${NAME}` passthroughs — the manifests carry **names only, never values**, and nothing is
ever written into config or the manifests. Set whichever you use; all are optional and
DART works with none of them:

- `VOYAGE_API_KEY` — embeddings for the optional AI Team Memory.
- `GEMINI_API_KEY` — optional model overlay.
- `QDRANT_URL`, `QDRANT_API_KEY` — the optional Qdrant vector store.
- `OPENMEMORY_BASE_URL`, `OPENMEMORY_API_KEY` — the optional OpenMemory overlay.
- `MEM0_API_KEY` — the optional mem0 memory overlay.

These are read from the environment **only**; they are never persisted to plugin config,
the manifests, or your project files.

### Disable / uninstall (reversible)

```bash
claude plugin disable dart@dart            # removes all DART influence; collisions untouched
claude plugin uninstall dart@dart          # remove the plugin
claude plugin marketplace remove dart      # forget the marketplace
```

### Local development / dogfooding

Load the plugin in place without a marketplace:

```bash
claude --plugin-dir /path/to/ai-dev-team
```

Installing or enabling DART writes nothing into `~/.claude` outside the plugin's own
directory.

## Augments, never overrides

Plugins are the **lowest** precedence layer (enterprise > user > project > plugin), and
every DART command/skill is `dart:`-namespaced. On a name collision the **user's** own
component wins — your existing `/arch`, `/rev`, `/deploy`, or your own `SessionStart`
hook are untouched and keep working. DART adds an opt-in layer; it never overwrites your
configuration.

## No secrets shipped

`plugin.json`, `.mcp.json`, and `hooks/hooks.json` carry **no** credential values. The
MCP server's `env` declares only env-var **names** as passthroughs (e.g.
`"VOYAGE_API_KEY": "${VOYAGE_API_KEY}"`); keys are read from the host environment at
spawn time and stay env-only. No tool accepts or persists a secret.

## Reversible

Disabling the plugin (`/plugin disable dart@dart`) removes all DART influence —
commands, skills, hooks, and the MCP server. A colliding user command or hook is
untouched throughout and remains after disable.

## Enterprise / managed settings

Managed (enterprise) settings can force-enable or force-disable this plugin via
`enabledPlugins` in managed policy, which sits above user and project scope. A plugin
that managed settings **force-disable** cannot be re-enabled by the user, and
`--plugin-dir` cannot override a managed force-disable. DART contains **no** code path
that attempts to re-enable itself against a managed disable — enablement is entirely the
host's settings decision, never DART's.
