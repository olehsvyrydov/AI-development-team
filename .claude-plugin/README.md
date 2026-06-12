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

This repository is itself the DART **marketplace** (`.claude-plugin/marketplace.json`),
and the `dart` plugin it lists is the plugin in this same repo. Install it via the
Claude Code CLI:

```bash
# 1. Register this repo as a marketplace (use your local clone's path)
claude plugin marketplace add /home/oleh/git/workspace/ai-dev-team
#    generic form:
#    claude plugin marketplace add <repo-path>

# 2. Confirm it is registered
claude plugin marketplace list          # ❯ dart  Source: Directory (<repo-path>)

# 3. Install the dart plugin from the dart marketplace
claude plugin install dart@dart         # installs at user scope, still DISABLED

# 4. Inspect what it ships (skills, commands, hooks, MCP, token cost)
claude plugin details dart@dart
```

`claude plugin install` lands the plugin **disabled** — DART is opt-in and stays inert
until you enable it (no hook fires, the MCP server is not spawned, no `/dart:*` command
or skill is active).

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
  (`/dart:arch`, `/dart:be`, `/dart:fe`, `/dart:rev`, `/dart:qa`, …). Your own
  same-named commands are never shadowed.
- **`dart` MCP tools** — the stdio write-back control-plane server, bound to the
  launching project at spawn. It binds no port and spawns no remote endpoint.

### Optional memory / overlay env vars (names only)

The MCP server reads these from your host environment as `${NAME}` passthroughs — the
manifests carry **names only, never values**. Set whichever you use; all are optional:

- `VOYAGE_API_KEY` — embeddings for the optional AI Team Memory.
- `GEMINI_API_KEY` — optional model overlay.
- `QDRANT_URL`, `QDRANT_API_KEY` — the optional Qdrant vector store.

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
