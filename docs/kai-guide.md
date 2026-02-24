# Kai — Self-Improving Meta-Agent

Kai closes the learning loop in the AI Development Team. Sessions generate learnings via the distillation pipeline, and Kai detects recurring patterns in those learnings, then proposes permanent SKILL.md updates for human review.

## How It Works

```
Sessions → distill_context.py → learnings + agent-knowledge (Qdrant)
                                        ↓
Kai analyze   ← scan collections → cluster by embedding similarity
    ↓
Kai propose   → match patterns to SKILL.md sections → quality validate → save JSON
    ↓
Human review  → /kai list → /kai approve ID
    ↓
Kai apply     → append to SKILL.md → re-ingest into Qdrant
```

### The Problem Kai Solves

Without Kai, valuable insights accumulate in Qdrant's `learnings` and `agent-knowledge` collections but never flow back into the SKILL.md files that define agent behavior. Agents keep re-discovering the same patterns. Kai automates pattern detection and proposes skill updates — with human approval as a mandatory gate.

## Prerequisites

- Qdrant running (`docker compose up -d` in `claude/rag/`)
- AI Team Memory MCP server installed and registered
- Distillation pipeline has run at least once (`distill_context.py`)
- Python venv at `claude/rag/mcp-server/.venv/` with dependencies installed

## Quick Start

```bash
# Navigate to Kai directory
cd claude/rag/kai

# Analyze — scan for recurring patterns
../mcp-server/.venv/bin/python3 cli.py analyze

# Propose — generate SKILL.md update proposals
../mcp-server/.venv/bin/python3 cli.py propose --skills-dir ../../skills

# Review — list pending proposals
../mcp-server/.venv/bin/python3 cli.py list --status pending

# Approve a proposal
../mcp-server/.venv/bin/python3 cli.py approve <PROPOSAL_ID>

# Apply — append to SKILL.md and re-ingest
../mcp-server/.venv/bin/python3 cli.py apply <PROPOSAL_ID> --skills-dir ../../skills

# Status summary
../mcp-server/.venv/bin/python3 cli.py status
```

Or use the slash command in Claude Code:

```
/kai analyze
/kai propose
/kai list --status pending
/kai approve abc-123
/kai apply abc-123
/kai status
```

## CLI Reference

### `analyze`

Scans `learnings` and `agent-knowledge` collections for recurring patterns.

```bash
python3 cli.py analyze [--agent NAME] [--min-frequency 3] [--max-age-days 30]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--agent` | all | Filter to a specific agent (e.g., `backend-developer`) |
| `--min-frequency` | 3 | Minimum occurrences to qualify as a pattern |
| `--max-age-days` | 30 | Only consider learnings from the last N days |

**Output:** JSON with `total_learnings_scanned`, `patterns_found`, and pattern details.

### `propose`

Generates SKILL.md update proposals from detected patterns.

```bash
python3 cli.py propose [--agent NAME] [--skills-dir DIR]
```

For each pattern:
1. Finds the agent's SKILL.md file
2. Parses sections with safety classification
3. Matches the pattern to the best appendable section
4. Formats content for the section type (checklist, anti-pattern, etc.)
5. Validates against quality rules
6. Saves as JSON in `claude/rag/kai/proposals/`

### `list`

Lists proposals, optionally filtered by status.

```bash
python3 cli.py list [--status pending|approved|applied|rejected]
```

### `approve` / `reject`

Change a proposal's status.

```bash
python3 cli.py approve PROPOSAL_ID
python3 cli.py reject PROPOSAL_ID [--reason "Not universal enough"]
```

### `apply`

Applies an approved proposal to the SKILL.md file and triggers re-ingestion into Qdrant.

```bash
python3 cli.py apply PROPOSAL_ID [--skills-dir DIR] [--qdrant-url URL]
```

This will:
1. Re-parse the SKILL.md (robust to intermediate edits)
2. Find the target section by heading text
3. Append the proposal content
4. Call `ingest.py --file` to re-embed the modified file
5. Update the proposal status to `applied`

### `status`

Shows summary counts by proposal status.

```bash
python3 cli.py status
```

## Section Safety Classification

Kai classifies every SKILL.md section heading to prevent modifications to critical sections:

| Safety Level | Sections | Can Kai Append? |
|-------------|----------|-----------------|
| **SAFE** | Anti-Patterns, Checklist, Standards, Best Practices, Common Mistakes | Yes |
| **CAUTIOUS** | Expertise, Templates, Code Examples | Yes (with care) |
| **UNSAFE** | Trigger, Context, Workflow, Research & Tools, frontmatter | Never |

## Quality Gates

Every proposal must pass three validation checks from the `/sm` quality rules:

### 1. Universality

No sprint numbers, ticket IDs, project names, or temporary workarounds.

```
WRONG: "Per Sprint 10, always validate inputs (SE-1025)"
RIGHT: "Validate all external IDs before passing to third-party APIs"
```

### 2. Not Duplicate

Content must not already exist in the target SKILL.md. Uses text similarity matching (threshold: 0.65).

### 3. Actionable

Content must be specific and actionable, not vague. Minimum 20 characters. No phrases like "be careful" or "just fix it".

```
WRONG: "Be careful with code."
RIGHT: "Use @Transactional(readOnly=true) for query methods to optimize connection pooling."
```

## Proposal Lifecycle

```
PENDING → APPROVED → APPLIED
    ↓
REJECTED (with optional reason)
```

Proposals are stored as JSON files in `claude/rag/kai/proposals/`. Each file contains:

- `proposal_id` — deterministic UUID
- `agent_name` — target agent (e.g., `backend-developer`)
- `skill_file` — path to the SKILL.md
- `target_section` — heading to append to
- `section_safety` — SAFE, CAUTIOUS, or UNSAFE
- `content` — the text to append
- `rationale` — why this was proposed
- `source_patterns` / `source_learnings` — traceability
- `quality_checks` — validation results
- `status` — current lifecycle state

## Promotion Thresholds

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `min_frequency` | 3 | SM rule: 3+ occurrences = meaningful pattern |
| `max_age_days` | 30 | Focus on recent, relevant patterns |
| `min_similarity` | 0.7 | Cosine threshold for clustering similar learnings |

## Architecture

```
claude/rag/kai/
├── __init__.py
├── models.py          # Dataclasses: Learning, Pattern, SkillSection, Proposal
├── skill_parser.py    # Parse SKILL.md → sections with safety classification
├── quality.py         # /sm quality rule validation
├── analyzer.py        # Fetch learnings, cluster similar, detect patterns
├── proposer.py        # Generate proposals, save/load JSON
├── applier.py         # Apply proposals to SKILL.md, trigger re-ingestion
├── cli.py             # CLI entry point
├── proposals/         # Stored proposal JSON files
│   └── .gitkeep
└── tests/             # 88 tests
    ├── conftest.py
    ├── test_models.py
    ├── test_skill_parser.py
    ├── test_quality.py
    ├── test_analyzer.py
    ├── test_proposer.py
    ├── test_applier.py
    └── test_cli.py
```

## Running Tests

```bash
cd claude/rag/kai
../mcp-server/.venv/bin/python3 -m pytest tests/ -v
# 88 tests, ~0.6s
```

## Safety Rules

1. **Never auto-apply** — all proposals require explicit `approve` then `apply`
2. **Section safety** — only append to SAFE/CAUTIOUS sections; never Trigger/Context/Workflow
3. **Quality gates** — every proposal validated against /sm quality rules
4. **Re-parse at apply time** — robust to intermediate SKILL.md edits
5. **Git-trackable** — all SKILL.md changes visible in `git diff`
6. **Source traceability** — every proposal links back to its source learnings

## Example Full Cycle

```bash
# 1. Check if there are patterns worth promoting
python3 cli.py analyze --min-frequency 2
# Output: {"total_learnings_scanned": 47, "patterns_found": 3, ...}

# 2. Generate proposals
python3 cli.py propose --skills-dir ../../skills
# Output: {"proposals_generated": 3, "proposal_ids": ["abc...", "def...", "ghi..."]}

# 3. Review proposals
python3 cli.py list --status pending
# Shows each proposal with target section, content, quality checks

# 4. Approve the good ones
python3 cli.py approve abc-123
python3 cli.py reject def-456 --reason "Too vague"

# 5. Apply approved proposals
python3 cli.py apply abc-123 --skills-dir ../../skills
# Updates SKILL.md and re-ingests into Qdrant

# 6. Verify in git
git diff claude/skills/
```
