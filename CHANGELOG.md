# Changelog

This file records all notable changes to the project. Versioning roughly follows [semver](https://semver.org), and dates are written in ISO-8601.

## [Unreleased]

Distribution moves from copying files to a versioned plugin, and three skills that documented
mechanisms which did not exist are corrected. The theme is the framework's own rule applied to
itself: a documented mechanism is worth nothing until something enforces it.

### Added
- **Claude Code plugin distribution.** `claude/` is the plugin root (`claude/.claude-plugin/plugin.json`), with the catalogue at `.claude-plugin/marketplace.json`. A consuming project declares it once in `.claude/settings.json` and every session gets it — including cloud sessions and anyone who clones the repo, neither of which reads `~/.claude/skills/`. `version` is deliberately omitted so the commit SHA is the version. `install.sh` keeps working and stays the path for Cursor, Kiro and VS Code.
- **`ai-dev-team` skill** — the always-on contract: principles, the rule to consult the workflow first, the process-skill roster, and the git conventions. A plugin cannot install a global `CLAUDE.md`, so a plugin-only install had been silently losing the instruction layer while appearing to work, because the skills themselves still loaded.
- **`pull-request` skill** — running a PR to a mergeable state: resolving every review conversation (including obsolete ones and ones you disagree with), enumerating workflow runs by commit SHA rather than trusting the checks summary, and confirming the merge result is the tree CI actually tested.
- **README sections** for plugin installation and for the cross-cutting process skills, which were roughly a fifth of the skill set and undocumented.
- **A vendor-neutrality rule** in `CONTRIBUTING.md` and the `ai-dev-team` skill: skills describe judgement and capability, never a product; a concrete backend is an optional adapter named only in a `references/` file or `docs/`. The framework must work correctly with no adapter configured.

### Changed
- **`/kai` now depends on a capability, not a store that never existed.** It documented reading `.aidevteam/learnings/`, "written by `/retro`" — a directory that has never existed, so `/kai` had no producer and had never run. Its input is now working-rules **a human has explicitly approved**, from whatever the project uses; concrete backends are adapters in `references/rule-sources.md`. Output is a unified diff with the rule's identifier and provenance. There is no apply step: it never edits, stages or commits a `SKILL.md`, and never writes back to the source. A source that cannot distinguish approved from proposed does not satisfy the contract — everything in it is treated as proposed and nothing is promoted. With no source configured it reports that and stops rather than inventing rules.
- **`/sm`'s re-scope now actually routes.** The role had been moved from ceremony to board integrity, but every surface that decides when the skill loads still pointed at the old one: the frontmatter description, the trigger list, the deep-dive reference list (which omitted `board-integrity.md` while listing the superseded ceremony protocol), an anti-pattern warning against skipping retrospectives, and a standards section prescribing a 15-minute daily standup while the context said standups are noise. The `/sm` and `/luda` command descriptions carried the same stale framing.
- **Board-integrity checks sharpened against a first real run.** Check 1 separates *orphaned* from *standalone by design* — roadmap placeholders, spikes and standalone fixes are legitimately parentless, and counting them as orphans discredits the report. Check 6 is flagged as the highest-yield check on boards that close epics by milestone: the headline ships, the epic closes, and the follow-ups it spawned stay open under a parent that says the work is finished. Check 4 now records passes by naming the enforcing symbol, so a later change that removes a guard reads as a contradiction rather than a silent regression.

### Removed
- **`/retro`.** Its capture job is automatic where a memory backend is connected, and a scheduled retrospective is the practice `board-integrity.md` argues against by name. Every reference to the store it wrote was swept from commands, skills, templates, docs and the README.

### Fixed
- **The root `AGENTS.md` is no longer tracked.** A connected agent-memory runtime owns a managed block inside it and refreshes it with captured working memory, which carried build states, review findings and branch names from other repositories into this public repository on every write. `.praxis/` and `.aidevteam/` were already ignored to keep exactly that content out; the generated block routed around them into a committed file. Ignoring the file is the fix, because a scrub does not hold — the block is re-inserted on the next write. Text published before this remains in the history.
- **Frontmatter added to `all.md`, `issue.md` and `bug.md`**, which were loading with empty metadata and could never auto-trigger.
- **Documented skill counts reconciled with the tree** — they had drifted nine behind.
- `claude/CLAUDE.md` and `claude/AGENTS.md` now state that nothing loads them automatically: `install.sh` deploys only `skills/`, `commands/`, `templates/` and `workflow/` and generates its own pointer file, and a plugin cannot load either. The `ai-dev-team` skill is the live copy.

## [5.1.0] — 2026-06-14

A consolidation and hygiene release that finishes the framework repositioning: the on-demand specialist roster is now backed by vendor-neutral reference libraries, two dormant agents are wired to commands, the team roster and knowledge-backend naming are reconciled across the docs, and the dashboard product, the RAG subsystem, and the personal migration scripts are removed.

### Added
- **Five cross-cutting process skills** — roles cover *who* does the work; these cover *how* it is decided, checked and paid for. `fid-lifecycle` (backlog → design doc/epic → tickets → Done, without orphans or two disagreeing records), `verify-landed` (prove a change exists and does something — a green build is not evidence, because removing nothing breaks nothing), `review-tier` (how much multi-agent review to buy and how to scope it), `model-selection` (which model tier to spend — the test is whether a cheap verifier exists downstream), `research-method` (investigate so the result is trustworthy; publish so it survives a hostile reader). Listed in `claude/commands/agents.md` and `claude/CLAUDE.md`.
- **`answer-audit`** — adversarially audit a retrieval-grounded answer, assuming it is wrong until each claim is proven verbatim against a source passage. Targets the failure class a grounding judge structurally cannot see: an answer minus its qualifier is still *entailed* by its sources, so "is this grounded?" passes it.
- **`/ext` — Browser Extension Developer**, with references for MV3 architecture, injection and extraction, permissions and security, tabs and groups, long-running work, surfaces, and build/test.
- **Theia references** for `/arch`, `/ui` and `/fe`, and a **Rust reference** for `/be`.
- **`references/board-integrity.md`** for `/sm` — six integrity checks with checkable answers, plus retrospection by continuous capture.

### Changed
- **`/sm` re-scoped from ceremony to board integrity.** The role read "you are the conductor of the orchestra — every agent reports to you", which is unfalsifiable, so nothing ever contradicted it and in practice it was never invoked. It is now accountable for orphan work items, plan-vs-tracker divergence, backlog items whose work has moved on, Done-without-negative-criteria, parked-without-a-trigger, and epics claiming completion over open children. Output is counts and named items, never a verdict.
- **Retrospectives are continuous, not scheduled.** Capture one question at merge; distil the running page per epic. A fortnightly retro reconstructs the past from memory and yields platitudes — the durable lessons are found mid-work, while the mechanism is still in your hands.
- **`workflow-engine`** gains the tracking-location rule: a local folder or an external tracker is a convenience call by project size, and never both for the same thing.

### Fixed
- `.gitignore` now covers machine-local agent state (`.praxis/`, `.aidevteam/`) and archived internal discussions (`docs/archive/`). This repository is public, and those transcripts carry product strategy and private-project detail.

## [5.1.0] — 2026-06-14

A consolidation and hygiene release that finishes the framework repositioning: the on-demand specialist roster is now backed by vendor-neutral reference libraries, two dormant agents are wired to commands, the team roster and knowledge-backend naming are reconciled across the docs, and the dashboard product, the RAG subsystem, and the personal migration scripts are removed.

### Added
- **ai-engineer reference libraries** — vendor-neutral, research-grounded, fact-checked references under `claude/skills/development/ai/ai-engineer/references/`: `rag-patterns.md` (chunking · embeddings · retrieval · reranking · context · eval) and `agentic-workflows.md` (loops · tools · memory · multi-agent · control). The first of the LLM/RAG/multi-agent reference libraries the role agent self-routes to.
- **ai-engineer reference libraries (cont.)** — same directory: `llm-frameworks.md` (framework selection by control model · MCP roles/transports/spec revisions) and `prompt-engineering.md` (structured output · repair loops · context engineering). Extends the LLM/RAG/multi-agent reference set.
- **ai-engineer reference libraries (complete)** — same directory: `eval-frameworks.md` (eval methodology · golden sets · metrics · LLM-as-judge bias · regression/statistical care · production observability · framework landscape) and `structured-output.md` (reliability spectrum · schema-constrained vs grammar-constrained decoding · JSON Schema 2020-12 subset · validate/retry/fallback loops). Completes the ai-engineer reference set (rag-patterns, agentic-workflows, llm-frameworks, prompt-engineering, eval-frameworks, structured-output).
- **solution-architect reference libraries** — vendor-neutral, research-grounded, fact-checked references under `claude/skills/architecture/solution-architect/references/`: `rag-architecture.md` (retrieval topology · caching tiers · freshness/consistency SLOs) and `agentic-systems-architecture.md` (agent topologies · control · observability/governance · OTel GenAI conventions). System-design altitude — complements the ai-engineer implementation references.
- **data/mlops/dba vector reference libraries** — vendor-neutral, research-grounded, fact-checked references, lane-separated by concern: `claude/skills/development/data/data-engineer/references/rag-corpus-pipelines.md` (RAG corpus ingestion · chunking · embedding pipelines · freshness), `claude/skills/operations/mlops/mlops-engineer/references/vector-db-operations.md` (vector-DB ops · serving · scaling · monitoring), and `claude/skills/development/data/dba/dba/references/vector-db-tuning.md` (index tuning · ANN parameters · query/storage optimization). Extends the LLM/RAG/multi-agent reference set across data-pipeline, ops, and index-tuning altitudes.
- **technical-writer is now a standing agent** — `/tw` runs at every commit point, owning two first-class deliverables: (1) the commit message for every commit in Conventional Commits form (reconciled against requirements, no `Co-Authored-By` trailer), and (2) living docs (README/CHANGELOG) kept current with drift flagged as a defect. New `claude/skills/specialized/technical-writer/references/commit-and-docs.md` carries the Conventional Commits spec, release-notes-from-commit-range workflow, a PR-description template (Summary/Changes/Risk/Test evidence), a commitlint config, and a docs-freshness CI gate.
- **Stakeholder-facing Gherkin as proof artifact** — `claude/skills/quality/testing/e2e-tester/references/cucumber-bdd.md` adds a "Benchmark & Stakeholder-Facing Scenarios" pattern: plain Given/When/Then a non-engineer can trust, tagged (`@benchmark`/`@acceptance`/`@slo`) with `Scenario Outline` + `Examples` so the bar (latency budget, accuracy floor, cost ceiling) is visible in a data table and the passing run IS the proof. backend-tester cross-references the pattern for API-level assertions.
- **`/tw` and `/mlops` slash commands** — the technical-writer and mlops-engineer skills existed but had no command, so they were dormant; both are now wired up. Command count 48 → 50.
- **README "On-Demand Specialists" table** — documents the previously-undocumented cross-cutting specialists (`/ai`, `/data`, `/dba`, `/sre`, `/perf`, `/android`, `/ios`, `/ux`), separated from the core 15.

### Changed
- **Knowledge-backend naming generalized** — dropped a named product from the framework docs (the agent-memory runtime keeps its name) and standardized the optional knowledge-base overlay to a single term, "knowledge-graph backend" (the unrelated "design canon" term is unchanged). Touches `CLAUDE.md`, `AGENTS.md`, `README.md`, `ARCHIVE.md`, and the deployable `claude/` instructions.
- **Team roster reconciled** across `README.md`, `claude/CLAUDE.md`, and `claude/AGENTS.md` to the canonical core 15 (DevOps in the 15; `/verify` and `/kai` shown as special-purpose), matching the "Team at a Glance" diagram.
- **`/arch`** — restored cross-component contract + stack guardrails.
- **Framework repositioning** — docs and memory surfaces re-pointed off the removed subsystems, positioning the project as the reusable agent-team framework.
- **Workflow docs reconciled** — the duplicate `docs/team-workflow.md` was merged into `docs/TEAM_WORKFLOW.md`, resolving a case-only filename collision.
- **Inline review comments are the authoritative checklist** — reviewer and scrum-master now require every inline PR comment to be resolved one-by-one (a change addressing it, or a per-thread reply with reasoning) before or alongside any holistic refactor; a maintainer's chat-level themes are never treated as the complete spec.
- **Engineering-standards enforcement (facts-only code)** — reviewer and backend-developer codify that code and Javadoc state facts only (contract, params, returns, throws, side effects). Process artifacts in source/Javadoc — ticket/issue IDs, ADR/condition codes (e.g. `C1`, `D4`), persona/sprint names — are BLOCKING and belong in the commit message or PR, not the artifact. backend-review adds the matching reviewer checks.

### Fixed
- **Reference-doc copy-edit (Copilot review)** — removed stray `</content>`/`</invoke>` paste artifacts at the end of `prompt-engineering.md`; pluralized the citation-count noun in the cucumber-bdd benchmark scenario (`source` → `source(s)`); clarified an ambiguous commit-message example in `commit-and-docs.md` (`do not 400` → `rather than rejecting with HTTP 400`).

### Removed
- **DART dashboard product** — the `hub/` Local Hub, `studio/cockpit/`, `dart-mcp/`, and the Kiro/plugin packaging, archived off the framework line (see `ARCHIVE.md`). This removes the Local Hub that 5.0.0 shipped.
- **Python RAG / Qdrant knowledge-base subsystem** (`claude/rag/`) — superseded; stale references trimmed from `install.sh`, `.gitignore`, scripts, and memory-surface docs.
- **Personal laptop-to-laptop migration scripts** (`migrate-pack.sh`, `migrate-unpack.sh`) — untracked from the public repo.

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
