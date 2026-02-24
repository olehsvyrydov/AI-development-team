"""Tests for Kai CLI."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

from models import Proposal, ProposalStatus, SectionSafety
from cli import build_parser, cmd_list, cmd_approve, cmd_reject, cmd_status


def _save_proposal(tmpdir, proposal_id="prop-001", status=ProposalStatus.PENDING):
    """Save a test proposal JSON file."""
    proposal = {
        "proposal_id": proposal_id,
        "agent_name": "backend-developer",
        "skill_file": "SKILL.md",
        "target_section": "Anti-Patterns",
        "section_safety": status.value if isinstance(status, SectionSafety) else "safe",
        "action": "append",
        "content": "- Test content",
        "rationale": "test",
        "source_patterns": ["p1"],
        "source_learnings": ["l1"],
        "status": status.value,
        "created_at": "2026-02-24T00:00:00+00:00",
        "quality_checks": {},
    }
    filepath = Path(tmpdir) / f"{proposal_id}.json"
    filepath.write_text(json.dumps(proposal, indent=2))
    return filepath


class TestBuildParser:
    def test_parser_has_subcommands(self):
        parser = build_parser()
        # Should parse analyze, propose, list, approve, reject, apply, status
        args = parser.parse_args(["list"])
        assert args.command == "list"

    def test_analyze_args(self):
        parser = build_parser()
        args = parser.parse_args(["analyze", "--agent", "backend-developer", "--min-frequency", "2"])
        assert args.command == "analyze"
        assert args.agent == "backend-developer"
        assert args.min_frequency == 2

    def test_approve_requires_id(self):
        parser = build_parser()
        args = parser.parse_args(["approve", "prop-001"])
        assert args.command == "approve"
        assert args.proposal_id == "prop-001"

    def test_reject_with_reason(self):
        parser = build_parser()
        args = parser.parse_args(["reject", "prop-001", "--reason", "Not relevant"])
        assert args.command == "reject"
        assert args.reason == "Not relevant"


class TestCmdList:
    def test_lists_proposals(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            _save_proposal(tmpdir, "p1", ProposalStatus.PENDING)
            _save_proposal(tmpdir, "p2", ProposalStatus.APPROVED)

            result = cmd_list(Path(tmpdir), status=None)
            assert len(result) == 2

    def test_filters_by_status(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            _save_proposal(tmpdir, "p1", ProposalStatus.PENDING)
            _save_proposal(tmpdir, "p2", ProposalStatus.APPROVED)

            result = cmd_list(Path(tmpdir), status="pending")
            assert len(result) == 1
            assert result[0]["proposal_id"] == "p1"


class TestCmdApprove:
    def test_approves_pending_proposal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            _save_proposal(tmpdir, "prop-001", ProposalStatus.PENDING)

            result = cmd_approve("prop-001", Path(tmpdir))
            assert result["status"] == "approved"

            # Verify file updated
            data = json.loads((Path(tmpdir) / "prop-001.json").read_text())
            assert data["status"] == "approved"

    def test_reject_nonexistent(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            result = cmd_approve("nonexistent", Path(tmpdir))
            assert result["status"] == "error"


class TestCmdReject:
    def test_rejects_proposal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            _save_proposal(tmpdir, "prop-001", ProposalStatus.PENDING)

            result = cmd_reject("prop-001", Path(tmpdir), reason="Not useful")
            assert result["status"] == "rejected"

            data = json.loads((Path(tmpdir) / "prop-001.json").read_text())
            assert data["status"] == "rejected"


class TestCmdStatus:
    def test_shows_summary(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            _save_proposal(tmpdir, "p1", ProposalStatus.PENDING)
            _save_proposal(tmpdir, "p2", ProposalStatus.APPROVED)
            _save_proposal(tmpdir, "p3", ProposalStatus.APPLIED)

            result = cmd_status(Path(tmpdir))
            assert result["pending"] == 1
            assert result["approved"] == 1
            assert result["applied"] == 1
            assert result["total"] == 3
