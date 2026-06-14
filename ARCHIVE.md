# Archive

This repository narrowed to its durable core: the reusable agent-team framework — the agent skills in `claude/skills/`, the `workflow-engine`, the `workflow.yaml` definition, the document templates, and the `install.sh` installer. The skills are installed globally and used by every project.

Earlier work that no longer belongs on the framework line was set aside. Nothing was lost — it is preserved in annotated git tags, in this branch's history before the removal commit, and on the remote feature branches. This document records what was removed, why, and how to retrieve it.

## What was set aside

**The DART dashboard product** — a human-facing dashboard built on top of the framework:

- `hub/` — the Node dashboard server
- `studio/cockpit/` — the Angular control-surface app
- `dart-mcp/` — the dashboard MCP packaging
- `kiro/` — Kiro-specific packaging
- `.claude-plugin/` — Claude plugin packaging
- `claude/memory/` — the knowledge full-text-search subsystem
- The feature work around it: Projects Home, the knowledge page, pipeline edit-mode, cross-project rollup, and knowledge FTS
- Its documentation: `docs/product-vision/`, `docs/sprints/`, the hub demo image, and the Kai / knowledge-management guides

**The Python RAG knowledge base** (`claude/rag/`) — Qdrant + voyage-code-3 semantic search, plus `docs/rag-setup/`. Removed as stale; superseded by Praxis.

**The persistent-memory design** (`docs/persistent-memory/`) — the "never-forgets coding assistant" concept, market research, and Quarkus + Qdrant build architecture for that removed RAG subsystem. Archived as superseded by Praxis (runtime) + Canon (backend).

## Why

The framework's identity narrowed to a reusable AI agent-team layer — the skills, the workflow engine, the workflow definition, the templates, and the installer — which every project installs and shares.

The dashboard-first model was superseded by a pivot to two sibling products that live in their own separate repositories:

- **Praxis** — an open agent-memory runtime.
- **Canon** — a governed knowledge backend.

The Python RAG was superseded by Praxis. The agent skills are the durable, shared layer used across all of these, so they stay here rather than moving into Praxis or Canon.

### The Cockpit

The Cockpit (`studio/cockpit/`) is the **reference seed for Praxis's human control surface** (build-order step 5). It was archived for that reason — to seed that surface — not deleted.

## Where it lives

**Annotated tags** (stable references — prefer these over commit SHAs):

- `archive/dart-dashboard-base-2026-06`
- `archive/dart-dashboard-interactive-2026-06`
- `archive/dart-dashboard-kb-fts-2026-06`

**Branch history** — everything is present in `main`'s history before commit `76a7473` (the removal commit: `chore: archive the DART dashboard product off the framework line`).

**Remote feature branches** — the `origin/feat/dart-*` branches also retain the work.

## How to inspect an archive

Show a tag's contents without changing your working tree:

```bash
git show archive/dart-dashboard-kb-fts-2026-06          # the tag's commit + message
git ls-tree -r archive/dart-dashboard-base-2026-06      # files at that point
git show archive/dart-dashboard-base-2026-06:hub/server.js   # a single file's contents
```

Check out an archived state on a throwaway branch to browse or build it:

```bash
git switch -c review archive/dart-dashboard-interactive-2026-06
```

Recover a single file or directory into the current tree:

```bash
git checkout archive/dart-dashboard-base-2026-06 -- hub/
```
