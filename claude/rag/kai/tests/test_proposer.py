"""Tests for proposal generation."""

import json
import tempfile
from pathlib import Path

from models import Learning, Pattern, Proposal, ProposalStatus, SectionSafety
from proposer import generate_proposals, save_proposals, load_proposals


SAMPLE_SKILL = """\
---
name: backend-developer
description: "Backend Developer"
---

# Backend Developer (/be)

## Trigger

Use this skill when:
- User invokes `/be`

## Context

You are James.

## Anti-Patterns

1. Never mock repositories in integration tests
2. Avoid circular dependencies

## Checklist

- [ ] All endpoints have OpenAPI annotations

## Expertise

### Core Competencies
- Spring Boot 4.0+

## Best Practices

- Use constructor injection
"""


def _make_pattern(
    summary="Validate external IDs before calling third-party APIs",
    agent_name="backend-developer",
    frequency=3,
    learning_type="debugging-insight",
):
    learnings = [
        Learning(f"l-{i}", f"Learning about external IDs #{i}", agent_name, learning_type)
        for i in range(frequency)
    ]
    return Pattern(
        pattern_id=f"pat-{agent_name}-{summary[:20]}",
        summary=summary,
        learnings=learnings,
        agent_name=agent_name,
        frequency=frequency,
        confidence=0.8,
    )


class TestGenerateProposals:
    def _setup_skills(self, tmpdir):
        skill_dir = Path(tmpdir) / "development" / "backend-developer"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(SAMPLE_SKILL)
        return Path(tmpdir)

    def test_generates_proposal_for_pattern(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = self._setup_skills(tmpdir)
            patterns = [_make_pattern()]

            proposals = generate_proposals(patterns, skills_dir)

            assert len(proposals) == 1
            assert isinstance(proposals[0], Proposal)
            assert proposals[0].agent_name == "backend-developer"
            assert proposals[0].status == ProposalStatus.PENDING

    def test_targets_safe_section_for_debugging_insight(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = self._setup_skills(tmpdir)
            patterns = [_make_pattern(learning_type="debugging-insight")]

            proposals = generate_proposals(patterns, skills_dir)

            assert len(proposals) == 1
            # Should target Anti-Patterns or Checklist (SAFE sections)
            assert proposals[0].section_safety in (SectionSafety.SAFE, SectionSafety.CAUTIOUS)

    def test_skips_unknown_agent(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = self._setup_skills(tmpdir)
            patterns = [_make_pattern(agent_name="nonexistent-agent")]

            proposals = generate_proposals(patterns, skills_dir)
            assert proposals == []

    def test_proposal_has_source_references(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = self._setup_skills(tmpdir)
            patterns = [_make_pattern()]

            proposals = generate_proposals(patterns, skills_dir)

            assert len(proposals[0].source_patterns) == 1
            assert len(proposals[0].source_learnings) == 3

    def test_multiple_patterns_multiple_proposals(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = self._setup_skills(tmpdir)
            patterns = [
                _make_pattern("External ID validation", "backend-developer"),
                _make_pattern("Connection pool tuning", "backend-developer"),
            ]

            proposals = generate_proposals(patterns, skills_dir)
            assert len(proposals) == 2

    def test_proposal_content_is_formatted(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skills_dir = self._setup_skills(tmpdir)
            patterns = [_make_pattern()]

            proposals = generate_proposals(patterns, skills_dir)

            content = proposals[0].content
            # Content should not be empty
            assert len(content) > 0


class TestSaveAndLoadProposals:
    def test_save_creates_json_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proposals = [
                Proposal(
                    proposal_id="prop-001",
                    agent_name="backend-developer",
                    skill_file="SKILL.md",
                    target_section="Anti-Patterns",
                    section_safety=SectionSafety.SAFE,
                    action="append",
                    content="- Never use internal UUIDs for external APIs",
                    rationale="3 learnings",
                    source_patterns=["pat-1"],
                    source_learnings=["l-1", "l-2"],
                ),
            ]

            ids = save_proposals(proposals, Path(tmpdir))

            assert len(ids) == 1
            files = list(Path(tmpdir).glob("*.json"))
            assert len(files) == 1

    def test_load_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proposals = [
                Proposal(
                    proposal_id="prop-001",
                    agent_name="backend-developer",
                    skill_file="SKILL.md",
                    target_section="Anti-Patterns",
                    section_safety=SectionSafety.SAFE,
                    action="append",
                    content="- Test content",
                    rationale="test",
                    source_patterns=["p1"],
                    source_learnings=["l1"],
                ),
            ]

            save_proposals(proposals, Path(tmpdir))
            loaded = load_proposals(Path(tmpdir))

            assert len(loaded) == 1
            assert loaded[0].proposal_id == "prop-001"
            assert loaded[0].status == ProposalStatus.PENDING
            assert loaded[0].section_safety == SectionSafety.SAFE

    def test_load_filters_by_status(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            p1 = Proposal(
                proposal_id="p1", agent_name="a", skill_file="f",
                target_section="s", section_safety=SectionSafety.SAFE,
                action="append", content="c1", rationale="r",
                source_patterns=[], source_learnings=[],
                status=ProposalStatus.PENDING,
            )
            p2 = Proposal(
                proposal_id="p2", agent_name="a", skill_file="f",
                target_section="s", section_safety=SectionSafety.SAFE,
                action="append", content="c2", rationale="r",
                source_patterns=[], source_learnings=[],
                status=ProposalStatus.APPROVED,
            )
            save_proposals([p1, p2], Path(tmpdir))

            pending = load_proposals(Path(tmpdir), status=ProposalStatus.PENDING)
            assert len(pending) == 1
            assert pending[0].proposal_id == "p1"

    def test_load_empty_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            loaded = load_proposals(Path(tmpdir))
            assert loaded == []
