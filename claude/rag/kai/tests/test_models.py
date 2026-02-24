"""Tests for Kai data models."""

from datetime import datetime, timezone
from models import (
    ProposalStatus,
    SectionSafety,
    Learning,
    Pattern,
    SkillSection,
    Proposal,
)


class TestProposalStatus:
    def test_enum_values(self):
        assert ProposalStatus.PENDING.value == "pending"
        assert ProposalStatus.APPROVED.value == "approved"
        assert ProposalStatus.APPLIED.value == "applied"
        assert ProposalStatus.REJECTED.value == "rejected"

    def test_from_string(self):
        assert ProposalStatus("pending") == ProposalStatus.PENDING


class TestSectionSafety:
    def test_enum_values(self):
        assert SectionSafety.SAFE.value == "safe"
        assert SectionSafety.CAUTIOUS.value == "cautious"
        assert SectionSafety.UNSAFE.value == "unsafe"


class TestLearning:
    def test_creation(self):
        now = datetime.now(timezone.utc).isoformat()
        learning = Learning(
            point_id="abc-123",
            content="Always validate external IDs",
            agent_name="backend-developer",
            learning_type="debugging-insight",
            stored_at=now,
            score=0.85,
        )
        assert learning.point_id == "abc-123"
        assert learning.content == "Always validate external IDs"
        assert learning.agent_name == "backend-developer"
        assert learning.score == 0.85

    def test_defaults(self):
        learning = Learning(
            point_id="x",
            content="test",
        )
        assert learning.agent_name is None
        assert learning.learning_type is None
        assert learning.stored_at is None
        assert learning.score == 0.0


class TestPattern:
    def test_creation(self):
        learnings = [
            Learning(point_id="1", content="A"),
            Learning(point_id="2", content="B"),
            Learning(point_id="3", content="C"),
        ]
        pattern = Pattern(
            pattern_id="pat-1",
            summary="Validate external IDs before API calls",
            learnings=learnings,
            agent_name="backend-developer",
            frequency=3,
            confidence=0.82,
        )
        assert pattern.pattern_id == "pat-1"
        assert pattern.frequency == 3
        assert len(pattern.learnings) == 3
        assert pattern.confidence == 0.82

    def test_recency_days_default(self):
        pattern = Pattern(
            pattern_id="p",
            summary="s",
            learnings=[],
            agent_name="a",
            frequency=1,
            confidence=0.5,
        )
        assert pattern.recency_days == 0


class TestSkillSection:
    def test_creation(self):
        section = SkillSection(
            heading="Anti-Patterns",
            level=3,
            content="1. Never use mutable state\n2. Avoid global config",
            line_start=50,
            line_end=55,
            safety=SectionSafety.SAFE,
        )
        assert section.heading == "Anti-Patterns"
        assert section.level == 3
        assert section.safety == SectionSafety.SAFE
        assert section.line_start == 50
        assert section.line_end == 55


class TestProposal:
    def test_creation_with_defaults(self):
        proposal = Proposal(
            proposal_id="prop-001",
            agent_name="backend-developer",
            skill_file="skills/development/backend-developer/SKILL.md",
            target_section="Anti-Patterns",
            section_safety=SectionSafety.SAFE,
            action="append",
            content="- Never use internal UUIDs for external API calls",
            rationale="Recurring pattern: 3 learnings about external ID misuse",
            source_patterns=["pat-1"],
            source_learnings=["l-1", "l-2", "l-3"],
        )
        assert proposal.status == ProposalStatus.PENDING
        assert proposal.proposal_id == "prop-001"
        assert proposal.action == "append"
        assert proposal.quality_checks == {}

    def test_status_transitions(self):
        proposal = Proposal(
            proposal_id="p",
            agent_name="a",
            skill_file="f",
            target_section="s",
            section_safety=SectionSafety.SAFE,
            action="append",
            content="c",
            rationale="r",
            source_patterns=[],
            source_learnings=[],
        )
        assert proposal.status == ProposalStatus.PENDING
        proposal.status = ProposalStatus.APPROVED
        assert proposal.status == ProposalStatus.APPROVED
        proposal.status = ProposalStatus.APPLIED
        assert proposal.status == ProposalStatus.APPLIED

    def test_created_at_auto_set(self):
        proposal = Proposal(
            proposal_id="p",
            agent_name="a",
            skill_file="f",
            target_section="s",
            section_safety=SectionSafety.SAFE,
            action="append",
            content="c",
            rationale="r",
            source_patterns=[],
            source_learnings=[],
        )
        assert proposal.created_at != ""
        # Should be a valid ISO timestamp
        datetime.fromisoformat(proposal.created_at)
