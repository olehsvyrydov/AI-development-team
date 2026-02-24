"""Tests for proposal applier."""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

from models import Proposal, ProposalStatus, SectionSafety
from applier import apply_proposal, re_ingest_skill, apply_and_ingest


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

## Best Practices

- Use constructor injection
"""


def _make_proposal(status=ProposalStatus.APPROVED, target_section="Anti-Patterns"):
    return Proposal(
        proposal_id="prop-001",
        agent_name="backend-developer",
        skill_file="will-be-overwritten",
        target_section=target_section,
        section_safety=SectionSafety.SAFE,
        action="append",
        content="- Never use internal UUIDs for external API calls",
        rationale="Recurring pattern",
        source_patterns=["pat-1"],
        source_learnings=["l-1", "l-2"],
        status=status,
    )


class TestApplyProposal:
    def _setup_skill(self, tmpdir):
        skill_dir = Path(tmpdir) / "development" / "backend-developer"
        skill_dir.mkdir(parents=True)
        skill_file = skill_dir / "SKILL.md"
        skill_file.write_text(SAMPLE_SKILL)
        return skill_file

    def test_appends_to_target_section(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_file = self._setup_skill(tmpdir)
            proposal = _make_proposal()
            proposal.skill_file = str(skill_file)

            result = apply_proposal(proposal, Path(tmpdir))

            assert result["status"] == "applied"
            updated = skill_file.read_text()
            assert "Never use internal UUIDs for external API calls" in updated
            # Should be in the Anti-Patterns section area
            lines = updated.split("\n")
            anti_idx = next(i for i, l in enumerate(lines) if "## Anti-Patterns" in l)
            content_idx = next(i for i, l in enumerate(lines) if "internal UUIDs" in l)
            assert content_idx > anti_idx

    def test_rejects_unapproved_proposal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_file = self._setup_skill(tmpdir)
            proposal = _make_proposal(status=ProposalStatus.PENDING)
            proposal.skill_file = str(skill_file)

            result = apply_proposal(proposal, Path(tmpdir))

            assert result["status"] == "rejected"
            assert "not approved" in result["reason"].lower()

    def test_rejects_already_applied(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_file = self._setup_skill(tmpdir)
            proposal = _make_proposal(status=ProposalStatus.APPLIED)
            proposal.skill_file = str(skill_file)

            result = apply_proposal(proposal, Path(tmpdir))
            assert result["status"] == "rejected"

    def test_handles_missing_section(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_file = self._setup_skill(tmpdir)
            proposal = _make_proposal(target_section="Nonexistent Section")
            proposal.skill_file = str(skill_file)

            result = apply_proposal(proposal, Path(tmpdir))
            assert result["status"] == "error"

    def test_preserves_existing_content(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_file = self._setup_skill(tmpdir)
            proposal = _make_proposal()
            proposal.skill_file = str(skill_file)

            apply_proposal(proposal, Path(tmpdir))

            updated = skill_file.read_text()
            assert "Never mock repositories" in updated
            assert "circular dependencies" in updated

    def test_appends_to_checklist_section(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_file = self._setup_skill(tmpdir)
            proposal = _make_proposal(target_section="Checklist")
            proposal.content = "- [ ] Validate all external IDs before API calls"
            proposal.skill_file = str(skill_file)

            result = apply_proposal(proposal, Path(tmpdir))

            assert result["status"] == "applied"
            updated = skill_file.read_text()
            assert "Validate all external IDs" in updated


class TestReIngestSkill:
    @patch("applier.subprocess.run")
    def test_calls_ingest_script(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="OK", stderr="")

        result = re_ingest_skill(
            Path("/skills/dev/backend-developer/SKILL.md"),
            Path("/skills"),
            "http://localhost:6333",
        )

        assert result["status"] == "ingested"
        mock_run.assert_called_once()

    @patch("applier.subprocess.run")
    def test_handles_ingest_failure(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Error")

        result = re_ingest_skill(
            Path("/skills/dev/be/SKILL.md"),
            Path("/skills"),
            "http://localhost:6333",
        )

        assert result["status"] == "error"


class TestApplyAndIngest:
    @patch("applier.re_ingest_skill")
    def test_combines_apply_and_ingest(self, mock_ingest):
        mock_ingest.return_value = {"status": "ingested", "chunks": 5}

        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "development" / "backend-developer"
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text(SAMPLE_SKILL)

            proposal = _make_proposal()
            proposal.skill_file = str(skill_dir / "SKILL.md")

            result = apply_and_ingest(proposal, Path(tmpdir), "http://localhost:6333")

            assert result["apply"]["status"] == "applied"
            assert result["ingest"]["status"] == "ingested"
