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

## Opt-in per project

The plugin ships **disabled** (`defaultEnabled: false`). It is **inert** until a
project enables it — no hook fires, the MCP server is not spawned, and no DART command
or skill is active until then. Enable it for a project in that project's own settings:

```jsonc
// <project>/.claude/settings.json
{
  "extraKnownMarketplaces": {
    "dart": { "source": { "source": "github", "repo": "<owner>/ai-dev-team" } }
  },
  "enabledPlugins": { "dart@dart": true }
}
```

For local development / dogfooding, load it in place without a marketplace:

```bash
claude --plugin-dir /path/to/ai-dev-team
```

Enabling DART writes nothing into `~/.claude` outside the plugin's own directory.

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
