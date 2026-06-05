# Pluggable backends (adapters)

The framework is **OSS-first with zero lock-in**: every backend is an **adapter** behind a stable seam. The defaults need **no paid accounts** and run fully local; everything else is an *optional overlay* you opt into in `workflow.yaml`. Agents always degrade gracefully to the file-based default when an adapter is absent.

## The adapter contract

Every adapter — whether for tickets, knowledge, memory, or design — declares four things:

| Field | Meaning |
|---|---|
| **capabilities** | what it can do (e.g. `create_ticket`, `advance_state`, `search_memory`, `render_design`) |
| **health-check** | how an agent detects it's present & configured (a file exists, an MCP tool is reachable, an env var is set) |
| **fallback** | what to use when it's *not* available — **always** the file-based default, so the team never blocks on a missing backend |
| **data-residency** | where data lives: **local-repo**, **local-service**, or **cloud** (so you can pick by privacy needs) |

An agent's rule of thumb: *detect the highest-tier available adapter for the task; if none, use the file-based default.* The same logic the `ledger:` cascade in `workflow.yaml` already encodes.

## The OSS-first menu (default → optional overlays)

| Category | Default (free, local) | OSS overlay (self-host) | Cloud (optional) |
|---|---|---|---|
| **Tickets / workflow** | `.workflow-state.json` + Backlog.md markdown tickets (`local-repo`) | **workflow MCP** — stateful, refuses out-of-order advances (`local-service`) | **Jira** (`cloud`) |
| **Knowledge base** | markdown vault (`docs/` or Obsidian-compatible) (`local-repo`) | **Obsidian MCP** (`local-service`) | **Confluence**, KGB-Canon (`cloud`) |
| **Memory** | native files under `memory/` (`local-repo`) | **OpenMemory / mem0** MCP (`local-service`) | — |
| **Design** | local Claude-generated HTML + headless Chrome screenshots (`local-repo`) | **Penpot** MCP (`local-service`) | **Figma**, Canva (`cloud`) |

*Resolution order is always: project `./.aidevteam/` override → user `~/.aidevteam/` → the shipped default. First found wins.*

## Enabling an overlay (two steps)

1. **Choose it in `workflow.yaml`** — set the backend for the category, e.g.:
   ```yaml
   tickets:        { default: jira }
   knowledge_base: { default: confluence }
   memory:         { default: openmemory }
   design:         { default: penpot }
   ```
   (or just switch `preset:` — `regulated` selects Jira + Confluence.)
2. **Add the MCP overlay** — copy the matching snippet from `adapters/mcp/` into your project's `.mcp.json` (the installer writes a `.mcp.json.example` to start from). Fill in URLs/keys. *(Some overlays cover more than one backend — **Jira** and **Confluence** both come from `atlassian.json`.)*

| Overlay file | Backend | Notes |
|---|---|---|
| `adapters/mcp/atlassian.json` | Jira + Confluence | remote MCP; sign in with your Atlassian account |
| `adapters/mcp/backlog.json` | Backlog.md tickets | local MCP server (MIT); markdown tickets in-repo |
| `adapters/mcp/openmemory.json` | OpenMemory (local mem0 server) | local memory MCP (OSS) |
| `adapters/mcp/mem0.json` | mem0 (hosted) | managed memory; set `MEM0_API_KEY` |
| `adapters/mcp/penpot.json` | Penpot design | self-hosted or penpot.app; OSS design |
| `adapters/mcp/figma.json` | Figma (Dev Mode MCP) | local server from the Figma desktop app (port 3845) |
| `adapters/mcp/canva.json` | Canva | hosted MCP; sign in with your Canva account |
| `adapters/mcp/obsidian.json` | Obsidian vault | local KB MCP |

## Adding a new adapter

1. Pick the category; confirm it has a real OSS-or-local default to fall back to.
2. Document its **capabilities / health-check / fallback / data-residency** (the table above).
3. Add an `adapters/mcp/<name>.json` overlay (if it's an MCP server) and a row to `workflow.yaml`'s `optional_mcp` list for that category.
4. Keep the **file-based default authoritative** — overlays are additive; pulling one must never break the core 5-minute first run.
