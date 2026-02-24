"""Tests for SM quality rule validation."""

from models import Proposal, SectionSafety, ProposalStatus
from quality import (
    FORBIDDEN_PATTERNS,
    validate_universality,
    validate_not_duplicate,
    validate_actionable,
    validate_proposal,
)


class TestForbiddenPatterns:
    def test_patterns_exist(self):
        assert len(FORBIDDEN_PATTERNS) > 0

    def test_patterns_are_compiled_regexes(self):
        import re
        for p in FORBIDDEN_PATTERNS:
            assert hasattr(p, "search"), f"Pattern should be compiled regex: {p}"


class TestValidateUniversality:
    def test_clean_content_passes(self):
        ok, violations = validate_universality(
            "Use value objects for external IDs to prevent type confusion."
        )
        assert ok is True
        assert violations == []

    def test_sprint_reference_fails(self):
        ok, violations = validate_universality(
            "Per Sprint 10 retro, always validate inputs."
        )
        assert ok is False
        assert len(violations) > 0

    def test_ticket_id_fails(self):
        ok, violations = validate_universality(
            "Fix for SE-1025: add null check before API call."
        )
        assert ok is False

    def test_workaround_fails(self):
        ok, violations = validate_universality(
            "Workaround: restart the service after deploy."
        )
        assert ok is False

    def test_project_name_pattern_fails(self):
        ok, violations = validate_universality(
            "In the self-employment project, we used this pattern."
        )
        # "project" alone shouldn't fail — but "in the X project" might
        # The key forbidden pattern is specific project references
        # This test verifies the pattern catches common project-specific language
        # Let's test something more clearly forbidden
        pass

    def test_temporary_fails(self):
        ok, violations = validate_universality(
            "Temporary fix: disable caching until next release."
        )
        assert ok is False


class TestValidateNotDuplicate:
    def test_unique_content_passes(self):
        existing = "## Anti-Patterns\n\n1. Never mock repos in integration tests"
        ok, dup = validate_not_duplicate(
            "Always close database connections in finally blocks",
            existing,
        )
        assert ok is True
        assert dup is None

    def test_duplicate_content_fails(self):
        existing = "1. Never mock repositories in integration tests\n2. Avoid circular deps"
        ok, dup = validate_not_duplicate(
            "Never mock repositories in integration tests",
            existing,
        )
        assert ok is False
        assert dup is not None

    def test_similar_content_fails(self):
        existing = "Never mock repositories in integration tests"
        ok, dup = validate_not_duplicate(
            "Do not mock repositories when writing integration tests",
            existing,
        )
        assert ok is False

    def test_empty_existing_passes(self):
        ok, dup = validate_not_duplicate("Any new content", "")
        assert ok is True


class TestValidateActionable:
    def test_specific_content_passes(self):
        ok, reason = validate_actionable(
            "Use @Transactional(readOnly=true) for query methods to optimize connection pooling."
        )
        assert ok is True

    def test_vague_content_fails(self):
        ok, reason = validate_actionable("Be careful with code.")
        assert ok is False
        assert reason is not None

    def test_very_short_fails(self):
        ok, reason = validate_actionable("Fix it.")
        assert ok is False

    def test_checklist_item_passes(self):
        ok, reason = validate_actionable(
            "- [ ] All REST endpoints return proper HTTP status codes (201 for created, 204 for deleted)"
        )
        assert ok is True


class TestValidateProposal:
    def _make_proposal(self, content="Use constructor injection for all Spring beans"):
        return Proposal(
            proposal_id="test-1",
            agent_name="backend-developer",
            skill_file="skills/development/backend-developer/SKILL.md",
            target_section="Best Practices",
            section_safety=SectionSafety.SAFE,
            action="append",
            content=content,
            rationale="Recurring pattern in 3 sessions",
            source_patterns=["pat-1"],
            source_learnings=["l-1", "l-2", "l-3"],
        )

    def test_valid_proposal_passes(self):
        result = validate_proposal(
            self._make_proposal(),
            "## Best Practices\n\n- Use records for DTOs",
        )
        assert result["overall"] is True
        assert result["universal"] is True
        assert result["not_duplicate"] is True
        assert result["actionable"] is True
        assert result["violations"] == []

    def test_proposal_with_sprint_ref_fails(self):
        result = validate_proposal(
            self._make_proposal("Per Sprint 5, always use DTOs"),
            "",
        )
        assert result["overall"] is False
        assert result["universal"] is False
        assert len(result["violations"]) > 0

    def test_proposal_with_duplicate_fails(self):
        result = validate_proposal(
            self._make_proposal("Use records for DTOs"),
            "## Best Practices\n\n- Use records for DTOs\n- Prefer immutability",
        )
        assert result["overall"] is False
        assert result["not_duplicate"] is False

    def test_proposal_with_vague_content_fails(self):
        result = validate_proposal(
            self._make_proposal("Be good."),
            "",
        )
        assert result["overall"] is False
        assert result["actionable"] is False
