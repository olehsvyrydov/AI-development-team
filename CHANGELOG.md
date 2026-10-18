# Changelog

This file records all notable changes to the project. Versioning roughly follows [semver](https://semver.org), and dates are written in ISO-8601.

## [Unreleased]

### Added
- **Gate G8 `uk-tax-year`** in `scripts/validate-framework.py`. In `claude/skills/compliance/**/*.md`, a `YYYY/YY (current)` label must equal the UK tax year in force today (a year starts on 6 April). It matches `2026/27` and `2026-27`, any case, with or without bold or italics between the label and `(current)`, and reports the label found in slash form. Every `Verified against GOV.UK on` line must carry a valid ISO date that falls on or after 6 April of the current tax year and is not in the future, so moving a label to a new year also forces the figures to be re-checked. Failures name the file, line, and what was found against what was expected.
- **Tests for the gates** in `tests/` (pytest), run by a new `tests` job in the `Validate` workflow. They cover the 5/6 April boundaries, the markdown spellings of a stale label, and the verified-date rules. The gates now take an injectable root, file list and date, and report into a `Report` object instead of module-level lists.
- **Scheduled reminder** (`.github/workflows/uk-tax-year-reminder.yml`): on 6 April each year, and on manual dispatch, it opens an issue listing the accountant files to refresh and the GOV.UK rates pages, and does nothing if an open issue with that title already exists.

### Changed
- **Workflow versions**: `actions/checkout`, `actions/setup-python` and `actions/setup-node` v7, Python 3.14, Node 24, the pinned Claude Code validator 2.1.302, and pinned `pytest` 9.1.1 and `pyyaml` 6.0.3.
- **Salary-and-dividend section** of the tax reference replaced with a worked 2026/27 comparison for a single director, and the sole trader versus limited company scenario recomputed with corporation tax marginal relief instead of a flat 19%. A short *Announced for 2027/28* note lists only changes GOV.UK has published.

### Fixed
- **UK tax reference data moved to 2026/27** in the accountant skill (`tax-domains.md`, `scenarios.md`, `uk-self-employment.md`). Every table marks 2026/27 as current, and the rate and threshold tables carry the date their figures were last checked against GOV.UK. Tables whose figures were not checked (R&D, filing penalties, record retention, SA103 boxes) carry no such date.
- **Rates and thresholds corrected**: dividend tax 10.75% / 35.75% / 39.35% from 6 April 2026; income tax and National Insurance thresholds frozen until 5 April 2031 (previously stated as 2028); Class 2 at £3.45 / £3.50 / £3.65 a week with Small Profits Threshold £6,725 / £6,845 / £7,105; Business Asset Disposal Relief 18% from 6 April 2026; approved mileage allowance 55p for the first 10,000 miles from 2026/27; Employment Allowance and pension annual allowance gain a 2026/27 column; 2024/25 capital gains rates show the 30 October 2024 change; the payments-on-account example is rolled forward.
- **Company car benefit percentages** replaced with selected bands from the GOV.UK 2025/26 and 2026/27 tables: several 2025/26 percentages were one point too low, plug-in hybrid bands had been collapsed into one range, and the 2027/28 column was removed because GOV.UK has not published it.
- **Making Tax Digital for Income Tax**: thresholds are tied to the qualifying income of an earlier tax year, quarterly updates are due on the 7th and are cumulative, there is no End of Period Statement step, and 2026/27 carries no penalty points for late quarterly updates.
- **Class 2 National Insurance in the self-employment tax calculator sample.** It added Class 2 to the tax due and read a threshold accessor that did not match its constant. Class 2 now reports a status (treated as paid at or above the Small Profits Threshold, voluntary below it) and is excluded from the total; the rates class is renamed `TaxRates2026_27` with 2026/27 values.

## [5.3.0] — 2026-08-09

Language expertise becomes a first-class layer. Four knowledge skills — Rust, SQL, Java,
TypeScript — auto-load from context whenever their language is being written, instead of
waiting for a role command; the architect gains the deliverables that put failure modes and
test cases on paper before implementation; and the gates that used to be run by hand now run
in CI. New capability plus one removal whose replacement ships in the same release, so a
minor bump per the versioning note below.

### Added
- **Language skills: `rust` and `sql`** (`claude/skills/development/languages/`) — a deliberate amendment to "stacks are references". References never auto-load, and language standards must apply whenever that language is being written, with no role command invoked — so language expertise becomes a first-class skill whose frontmatter description triggers from context (a `.rs` file, a migration, an embedded query). No persona and no slash command; `/be`, `/dba`, `/rev` and `/arch` route into the one copy. Rust carries checked-in toolchain/lint/deny policy, ownership-driven architecture (core crate + thin shells, state machines, newtypes), the error doctrine with a failure-table method, tokio task ownership and cancellation, rusqlite embedding, deterministic testing (fixtures that refuse real credentials), boundary security, and a reviewer pass. SQL carries parameterized-only, versioned migrations with expand-migrate-contract, EXPLAIN-before-merge, a scratch-container empirical check, dialect branches for PostgreSQL 18, MySQL 8.4/9.7, Oracle 26ai and SQLite, and a reviewer pass.
- **Language skills: `java` and `typescript`** — the second pair, targeting JVM and Node/browser work. Java carries record/sealed-type modelling with exhaustive switches, JSpecify `@NullMarked` + NullAway as a build error, immutability doctrine, the JEP-491-corrected virtual-thread guidance, ScopedValue over ThreadLocal, ArchUnit rules as the executable form of approved boundaries, PIT mutation thresholds, Testcontainers-first integration testing, and boundary security — with complete Gradle/Maven wiring in a build-and-quality-gates reference. TypeScript carries the strictest-profile checked-in tsconfig, discriminated unions with exhaustiveness, branded types, parse-don't-validate with Zod at every I/O edge (env read in exactly one module), ESM/package discipline, typescript-eslint with the promise rules as errors, and Vitest/MSW/fast-check testing — with complete checked-in templates. The backend role's `java-expertise.md` splits: the language half moves to the `java` skill, the Spring half stays and gains a Spring Boot 4 standards block; the frontend role's React reference points its language-level TypeScript section at the `typescript` skill.
- **`/arch` design-for-predictability reference** — the ARCH_APPROVED deliverables that make reviews find decisions instead of surprises, produced before implementation: boundary contract sheets (where the Done rule's named enforcing symbols are born), state tables with no blank cells, lightweight FMEA over a fixed failure-class checklist, a test-case table whose negative rows must at least match its positive rows, blast-radius notes for shared contracts, and declared extension points. Proportional: contract sheet + test-case table on the standard track, all six on full.
- **CI.** The skills here are markdown: nothing compiles and no test suite runs, so a defect stays invisible until someone reads the exact line. Every gate was previously run by hand, which means it was run when someone remembered — and the record of what shipped was reconciled against the tree only after it had drifted nine behind. Three jobs now run on every pull request: `scripts/validate-framework.py`, `claude plugin validate` (which needs no credentials), and `install.sh --dry-run --editors=all`.
- **`scripts/validate-framework.py`** — seven gates, each covering something that has actually broken in this repository: a `SKILL.md` whose frontmatter does not parse and therefore loads with empty metadata and can never auto-trigger; malformed plugin JSON, or a `version` key reappearing where it is omitted on purpose; a documented count that no longer matches the tree; a relative link pointing at nothing; a credential-shaped file being tracked in a public repository; a reference to a mechanism that was removed; and a backend product named inside a skill rather than in its adapter reference. Every gate was verified to fail on its own defect and pass when clean, because a gate that cannot fail is decoration.

### Removed
- **`/be`'s project-specific Rust reference** — replaced by the universal `rust` language skill. The old file named one private project's modules, paths and error codes, violating the framework's own universal-knowledge rule; the project-specific half now lives in that project's own repository as a project-local skill.

## [5.2.0] — 2026-08-03

Distribution moves from copying files to a versioned plugin, and three skills that documented
mechanisms which did not exist are corrected. The theme is the framework's own rule applied to
itself: a documented mechanism is worth nothing until something enforces it.

Note on versioning: `claude/.claude-plugin/plugin.json` deliberately omits `version`, so for a
plugin consumer the commit SHA is the version and every push is an update. The number here is for
readers of this file. Removals are treated as a minor bump, following 5.1.0, which removed the
dashboard product and the RAG subsystem.

### Added
- **Claude Code plugin distribution.** `claude/` is the plugin root (`claude/.claude-plugin/plugin.json`), with the catalogue at `.claude-plugin/marketplace.json`. A consuming project declares it once in `.claude/settings.json` and every session gets it — including cloud sessions and anyone who clones the repo, neither of which reads `~/.claude/skills/`. `version` is deliberately omitted so the commit SHA is the version. `install.sh` keeps working and stays the path for Cursor, Kiro and VS Code.
- **`ai-dev-team` skill** — the always-on contract: principles, the rule to consult the workflow first, the process-skill roster, and the git conventions. A plugin cannot install a global `CLAUDE.md`, so a plugin-only install had been silently losing the instruction layer while appearing to work, because the skills themselves still loaded.
- **`pull-request` skill** — running a PR to a mergeable state: resolving every review conversation (including obsolete ones and ones you disagree with), enumerating workflow runs by commit SHA rather than trusting the checks summary, and confirming the merge result is the tree CI actually tested.
- **README sections** for plugin installation and for the cross-cutting process skills, which were roughly a fifth of the skill set and undocumented.
- **A vendor-neutrality rule** in `CONTRIBUTING.md` and the `ai-dev-team` skill: skills describe judgement and capability, never a product; a concrete backend is an optional adapter named only in a `references/` file or `docs/`. The framework must work correctly with no adapter configured.

### Changed
- **`/kai` now depends on a capability, not a store that never existed.** It documented reading `.aidevteam/learnings/`, "written by `/retro`" — a directory that has never existed, so `/kai` had no producer and had never run. Its input is now working-rules **a human has explicitly approved**, from whatever the project uses; concrete backends are adapters in `references/rule-sources.md`. Output is a unified diff with the rule's identifier and provenance. There is no apply step: it never edits, stages or commits a `SKILL.md`, and never writes back to the source. A source that cannot distinguish approved from proposed does not satisfy the contract — everything in it is treated as proposed and nothing is promoted. With no source configured it reports that and stops rather than inventing rules.
- **`/sm`'s re-scope now actually routes.** The role had been moved from ceremony to board integrity, but every surface that decides when the skill loads still pointed at the old one: the frontmatter description, the trigger list, the deep-dive reference list (which omitted `board-integrity.md` while listing the superseded ceremony protocol), an anti-pattern warning against skipping retrospectives, and a standards section prescribing a 15-minute daily standup while the context said standups are noise. The `/sm` and `/luda` command descriptions carried the same stale framing.
- **`review-tier` learns that a churning review loop is a signal, not a success.** Measured on one feature: five rounds, ~10 verified findings each, 49 of 49 real, every round finding defects introduced by the previous round's fixes. The review was working perfectly; the question it was answering had no answer in the data, and nothing in these skills could say so. Two changes follow. `TARGETED` scope now also includes the **writers of any persistent field the diff reads but does not write** — callers-and-callees follows the call graph, but a defect in what a column *means* propagates along the schema, and a read and a write of the same column are connected by no call at all, so a read-only feature cannot reach the code that decides what it is reading by any call-graph scoping. And a **halt rule**: stop the loop and open an investigation when a verified finding blames the previous round's fix two rounds running, when findings across rounds restate one definitional question, or when a candidate fix must consult a side channel to decide what a field means. Findings-per-token detects a loop gone *dry*; it cannot detect one churning at a steady rate over an unsatisfiable design, and says "keep going" forever.
- **`verify-landed` gains claim discipline** — a verification carries the command it ran and the tool's own output, not a summary of it.
- **Board-integrity checks sharpened against a first real run.** Check 1 separates *orphaned* from *standalone by design* — roadmap placeholders, spikes and standalone fixes are legitimately parentless, and counting them as orphans discredits the report. Check 6 is flagged as the highest-yield check on boards that close epics by milestone: the headline ships, the epic closes, and the follow-ups it spawned stay open under a parent that says the work is finished. Check 4 now records passes by naming the enforcing symbol, so a later change that removes a guard reads as a contradiction rather than a silent regression.

### Removed
- **`/retro`.** Its capture job is automatic where a memory backend is connected, and a scheduled retrospective is the practice `board-integrity.md` argues against by name. Every reference to the store it wrote was swept from commands, skills, templates, docs and the README.

### Fixed
- **The root `AGENTS.md` is no longer tracked.** A connected agent-memory runtime owns a managed block inside it and refreshes it with captured working memory, which carried build states, review findings and branch names from other repositories into this public repository on every write. `.praxis/` and `.aidevteam/` were already ignored to keep exactly that content out; the generated block routed around them into a committed file. Ignoring the file is the fix, because a scrub does not hold — the block is re-inserted on the next write. Text published before this remains in the history.
- **Frontmatter added to `all.md`, `issue.md` and `bug.md`**, which were loading with empty metadata and could never auto-trigger.
- **Documented skill counts reconciled with the tree** — they had drifted nine behind.
- **The plugin manifest's own description** still advertised "six cross-cutting process skills" and then listed five, while nine exist. It is the text `claude plugin details` prints, so it was the one stale count a user would see first.
- **Credential-shaped files are ignored.** This repository is public and several commits here were staged with `git add -A`; a hidden secret file dropped into the tree would have been published by the next one. Scoped to the hidden-file shape and to key material, so documentation *about* auth is unaffected — verified that no tracked file is masked by the rule.
- `claude/CLAUDE.md` and `claude/AGENTS.md` now state that nothing loads them automatically: `install.sh` deploys only `skills/`, `commands/`, `templates/` and `workflow/` and generates its own pointer file, and a plugin cannot load either. The `ai-dev-team` skill is the live copy.
- **`ARCHIVE.md` no longer promises preservation "on the remote feature branches".** Those branches are deleted; each archive tag points at the exact commit its branch tip did, and the tags are pushed, so the work stays on the remote and reachable. The document would otherwise have described a mechanism that no longer exists — the failure this release removes elsewhere.

### Repository hygiene
- **One remote, one branch.** A second remote (a self-hosted mirror) had diverged by 26 commits while the working tree was live configuration through a symlinked `~/.claude/skills` — a pull against the wrong remote silently rewound the tree and removed every skill from a running session. Every ref on it was verified reachable from `origin` before it was removed.
- **Merged and superseded branches deleted**, local and remote. Unmerged ones were archived as annotated tags first. Two were declined on inspection rather than merged: one re-added the retired `/retro` command and its learnings reference, and one carried only product docs belonging to a different repository, its skills content having already landed by another route.

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
