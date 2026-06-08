# Changelog

This file records all notable changes to the project. Versioning roughly follows [semver](https://semver.org), and dates are written in ISO-8601.

## [Unreleased]

### Added
- **Core serves the Cockpit at `/`** — the local Hub server now serves the production Angular Cockpit build (`studio/cockpit/dist/cockpit/browser`) same-origin at `/`, with client-side routes falling back to the app's `index.html` for deep links. The original zero-dependency board moves to `/legacy`, and is also served when no Cockpit build is present, so the server still works undeployed. The static file resolver confines every request to the build root and never lists directories.
- **Cockpit v2 — multi-project Studio** — a first-run pitch when no project is connected, then a project launcher whose cards show a short auto-collected description, a "needs you" pulse, and a "Security-reviewed" governance badge (all *absent-not-zero* — no fabricated zeros when a signal is missing). Adding a project uses a focus-trapped **folder-picker dialog** that browses the local filesystem instead of a typed path. Each project opens a **Project Shell** with read-only Workflow, Tasks, and Base panels, each derived independently so one failing panel never blanks the others.
- **Read-only directory-browser API** — `GET /api/fs/roots` and `GET /api/fs/list?path=` back the folder picker. The endpoint is read-only and confined to `realpath($HOME)`: it realpath-resolves and containment-checks every path (and each child) before listing, refuses escaping symlinks, returns directory entries only (no file bytes, no stat/recon fields), is one level deep and entry-capped, and — though served over GET — is loopback-guarded by the same write guard (anti-CSRF / anti-DNS-rebinding) because disclosing home-directory structure is a capability.
- **ai-engineer reference libraries** — vendor-neutral, research-grounded, fact-checked references under `claude/skills/development/ai/ai-engineer/references/`: `rag-patterns.md` (chunking · embeddings · retrieval · reranking · context · eval) and `agentic-workflows.md` (loops · tools · memory · multi-agent · control). The first of the LLM/RAG/multi-agent reference libraries the role agent self-routes to.
- **ai-engineer reference libraries (cont.)** — same directory: `llm-frameworks.md` (framework selection by control model · MCP roles/transports/spec revisions) and `prompt-engineering.md` (structured output · repair loops · context engineering). Extends the LLM/RAG/multi-agent reference set.
- **ai-engineer reference libraries (complete)** — same directory: `eval-frameworks.md` (eval methodology · golden sets · metrics · LLM-as-judge bias · regression/statistical care · production observability · framework landscape) and `structured-output.md` (reliability spectrum · schema-constrained vs grammar-constrained decoding · JSON Schema 2020-12 subset · validate/retry/fallback loops). Completes the ai-engineer reference set (rag-patterns, agentic-workflows, llm-frameworks, prompt-engineering, eval-frameworks, structured-output).
- **solution-architect reference libraries** — vendor-neutral, research-grounded, fact-checked references under `claude/skills/architecture/solution-architect/references/`: `rag-architecture.md` (retrieval topology · caching tiers · freshness/consistency SLOs) and `agentic-systems-architecture.md` (agent topologies · control · observability/governance · OTel GenAI conventions). System-design altitude — complements the ai-engineer implementation references.
- **data/mlops/dba vector reference libraries** — vendor-neutral, research-grounded, fact-checked references, lane-separated by concern: `claude/skills/development/data/data-engineer/references/rag-corpus-pipelines.md` (RAG corpus ingestion · chunking · embedding pipelines · freshness), `claude/skills/operations/mlops/mlops-engineer/references/vector-db-operations.md` (vector-DB ops · serving · scaling · monitoring), and `claude/skills/development/data/dba/dba/references/vector-db-tuning.md` (index tuning · ANN parameters · query/storage optimization). Extends the LLM/RAG/multi-agent reference set across data-pipeline, ops, and index-tuning altitudes.
- **technical-writer is now a standing agent** — `/tw` runs at every commit point, owning two first-class deliverables: (1) the commit message for every commit in Conventional Commits form (reconciled against requirements, no `Co-Authored-By` trailer), and (2) living docs (README/CHANGELOG) kept current with drift flagged as a defect. New `claude/skills/specialized/technical-writer/references/commit-and-docs.md` carries the Conventional Commits spec, release-notes-from-commit-range workflow, a PR-description template (Summary/Changes/Risk/Test evidence), a commitlint config, and a docs-freshness CI gate.
- **Stakeholder-facing Gherkin as proof artifact** — `claude/skills/quality/testing/e2e-tester/references/cucumber-bdd.md` adds a "Benchmark & Stakeholder-Facing Scenarios" pattern: plain Given/When/Then a non-engineer can trust, tagged (`@benchmark`/`@acceptance`/`@slo`) with `Scenario Outline` + `Examples` so the bar (latency budget, accuracy floor, cost ceiling) is visible in a data table and the passing run IS the proof. backend-tester cross-references the pattern for API-level assertions.

### Changed
- **Inline review comments are the authoritative checklist** — reviewer and scrum-master now require every inline PR comment to be resolved one-by-one (a change addressing it, or a per-thread reply with reasoning) before or alongside any holistic refactor; a maintainer's chat-level themes are never treated as the complete spec.
- **Engineering-standards enforcement (facts-only code)** — reviewer and backend-developer codify that code and Javadoc state facts only (contract, params, returns, throws, side effects). Process artifacts in source/Javadoc — ticket/issue IDs, ADR/condition codes (e.g. `C1`, `D4`), persona/sprint names — are BLOCKING and belong in the commit message or PR, not the artifact. backend-review adds the matching reviewer checks.

### Fixed
- **Reference-doc copy-edit (Copilot review)** — removed stray `</content>`/`</invoke>` paste artifacts at the end of `prompt-engineering.md`; pluralized the citation-count noun in the cucumber-bdd benchmark scenario (`source` → `source(s)`); clarified an ambiguous commit-message example in `commit-and-docs.md` (`do not 400` → `rather than rejecting with HTTP 400`).

## [5.0.0] — 2026-06-06

The **OSS-first, vendor-neutral** release: a proportional enforced workflow, a leaner roster, a universal installer, pluggable backends, and a local dashboard. No paid accounts required by default; works in **Claude Code, Cursor, Kiro, and VS Code**.

### Added
- **Proportional workflow engine** — a versioned `workflow.yaml` + a `workflow-engine` skill + presets (`solo` / `small-team` / `regulated`). Gates fire by change-class / trigger / preset and can **refuse** to proceed; security gates are a safety override that's never skipped for being "small".
- **Universal installer** — one `install.sh` wires up any of four editors and emits the right config for each (`.claude/` + `CLAUDE.md`, `.cursor/rules/`, `.kiro/steering/`, `.github/copilot-instructions.md`, all alongside `AGENTS.md`). Flags: `--editors/--scope/--preset/--dry-run/--yes/--link/--uninstall`. (#26)
- **Pluggable OSS-first adapters** — tickets / knowledge base / memory / design as swappable backends with a documented contract (capabilities / health-check / fallback / data-residency) and ready-to-paste `.mcp.json` overlays: atlassian, backlog, openmemory, mem0, penpot, figma, canva, obsidian. (#27)
- **Local Hub** — a zero-dependency dashboard (`node hub/server.js`) showing the live gate board, tickets, and knowledge base over SSE; reads the file-based defaults, no `npm install`. (#28)
- **Bundled demo** — `examples/demo/` for an instant, populated Hub preview. (#29)
- `AGENTS.md` (root + `claude/`), `CONTRIBUTING.md`, and GitHub issue/PR templates.

### Changed
- **Roster consolidated 48 → 29 agents** (a 15-agent core team + optional specialists). Technology stacks are now `references/` that a role agent self-routes to — not separate agents. (#24)
- **All agent skills modernized** to progressive disclosure: a lean `SKILL.md` (< ~500 lines, sharp `description`) + deep `references/` loaded on demand. (#5–#22)
- **File-based by default** — markdown tickets (Backlog.md) + a markdown knowledge base; Jira/Confluence and MCP memory are optional overlays enabled in `workflow.yaml`. Agent skills decoupled from hard-coded Jira. (#25)
- **README** rewritten — editor-neutral hero, proportional-gates framing, "process, not prompts", no-lock-in positioning.

## [4.1.0] — 2026-02-24
- Kai meta-agent, multi-LLM consultation, context persistence, RAG knowledge base, migration scripts.

## [4.0.0] — 2025-01-02
- Restructured for easy `~/.claude` deployment; one-command installer.
