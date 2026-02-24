#!/usr/bin/env python3
"""Kai CLI — Self-Improving Meta-Agent for AI Dev Team.

Usage:
    python3 cli.py analyze [--agent NAME] [--min-frequency 3] [--max-age-days 30]
    python3 cli.py propose [--agent NAME] [--skills-dir DIR]
    python3 cli.py list [--status pending|approved|applied|rejected]
    python3 cli.py approve PROPOSAL_ID
    python3 cli.py reject PROPOSAL_ID [--reason TEXT]
    python3 cli.py apply PROPOSAL_ID [--skills-dir DIR]
    python3 cli.py status
"""

import argparse
import json
import os
import sys
from pathlib import Path

from models import ProposalStatus, SectionSafety
from proposer import load_proposals, save_proposals, _proposal_to_dict, _dict_to_proposal


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Kai — Self-Improving Meta-Agent",
        prog="kai",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # analyze
    p_analyze = sub.add_parser("analyze", help="Scan learnings for recurring patterns")
    p_analyze.add_argument("--agent", help="Filter by agent name")
    p_analyze.add_argument("--min-frequency", type=int, default=3)
    p_analyze.add_argument("--max-age-days", type=int, default=30)

    # propose
    p_propose = sub.add_parser("propose", help="Generate SKILL.md update proposals")
    p_propose.add_argument("--agent", help="Filter by agent name")
    p_propose.add_argument("--skills-dir", help="Path to skills directory")

    # list
    p_list = sub.add_parser("list", help="List proposals")
    p_list.add_argument("--status", choices=["pending", "approved", "applied", "rejected"])

    # approve
    p_approve = sub.add_parser("approve", help="Approve a proposal")
    p_approve.add_argument("proposal_id", help="Proposal ID to approve")

    # reject
    p_reject = sub.add_parser("reject", help="Reject a proposal")
    p_reject.add_argument("proposal_id", help="Proposal ID to reject")
    p_reject.add_argument("--reason", default="", help="Rejection reason")

    # apply
    p_apply = sub.add_parser("apply", help="Apply an approved proposal")
    p_apply.add_argument("proposal_id", help="Proposal ID to apply")
    p_apply.add_argument("--skills-dir", help="Path to skills directory")
    p_apply.add_argument("--qdrant-url", default=os.environ.get("QDRANT_URL", "http://localhost:6333"))

    # status
    sub.add_parser("status", help="Show proposal summary")

    return parser


def _proposals_dir() -> Path:
    return Path(__file__).parent / "proposals"


def cmd_list(proposals_dir: Path, status: str | None = None) -> list[dict]:
    """List proposals, optionally filtered by status."""
    filter_status = ProposalStatus(status) if status else None
    proposals = load_proposals(proposals_dir, status=filter_status)
    return [_proposal_to_dict(p) for p in proposals]


def cmd_approve(proposal_id: str, proposals_dir: Path) -> dict:
    """Approve a proposal by ID."""
    filepath = proposals_dir / f"{proposal_id}.json"
    if not filepath.exists():
        return {"status": "error", "reason": f"Proposal {proposal_id} not found"}

    data = json.loads(filepath.read_text())
    data["status"] = "approved"
    filepath.write_text(json.dumps(data, indent=2))
    return {"status": "approved", "proposal_id": proposal_id}


def cmd_reject(proposal_id: str, proposals_dir: Path, reason: str = "") -> dict:
    """Reject a proposal by ID."""
    filepath = proposals_dir / f"{proposal_id}.json"
    if not filepath.exists():
        return {"status": "error", "reason": f"Proposal {proposal_id} not found"}

    data = json.loads(filepath.read_text())
    data["status"] = "rejected"
    if reason:
        data["rejection_reason"] = reason
    filepath.write_text(json.dumps(data, indent=2))
    return {"status": "rejected", "proposal_id": proposal_id}


def cmd_status(proposals_dir: Path) -> dict:
    """Show summary counts by status."""
    all_proposals = load_proposals(proposals_dir)
    counts = {"pending": 0, "approved": 0, "applied": 0, "rejected": 0}
    for p in all_proposals:
        counts[p.status.value] = counts.get(p.status.value, 0) + 1
    counts["total"] = len(all_proposals)
    return counts


def main():
    parser = build_parser()
    args = parser.parse_args()
    proposals_dir = _proposals_dir()

    if args.command == "analyze":
        from qdrant_client import QdrantClient
        sys.path.insert(0, str(Path(__file__).parent.parent / "mcp-server"))
        from memory_mcp.embeddings import VoyageEmbeddingProvider
        from analyzer import analyze

        qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333")
        qdrant = QdrantClient(url=qdrant_url)
        embedder = VoyageEmbeddingProvider()

        result = analyze(
            qdrant, embedder,
            agent_name=args.agent,
            min_frequency=args.min_frequency,
            max_age_days=args.max_age_days,
        )
        # Convert patterns for JSON serialization
        output = {
            "total_learnings_scanned": result["total_learnings_scanned"],
            "patterns_found": result["patterns_found"],
            "agents": result["agents"],
            "patterns": [
                {
                    "pattern_id": p.pattern_id,
                    "summary": p.summary,
                    "agent_name": p.agent_name,
                    "frequency": p.frequency,
                    "confidence": p.confidence,
                }
                for p in result["patterns"]
            ],
        }
        print(json.dumps(output, indent=2))

    elif args.command == "propose":
        from qdrant_client import QdrantClient
        sys.path.insert(0, str(Path(__file__).parent.parent / "mcp-server"))
        from memory_mcp.embeddings import VoyageEmbeddingProvider
        from analyzer import detect_patterns
        from proposer import generate_proposals

        qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333")
        qdrant = QdrantClient(url=qdrant_url)
        embedder = VoyageEmbeddingProvider()

        skills_dir = Path(args.skills_dir) if args.skills_dir else Path(__file__).parent.parent.parent / "skills"

        patterns = detect_patterns(qdrant, embedder, agent_name=args.agent)
        proposals = generate_proposals(patterns, skills_dir)
        ids = save_proposals(proposals, proposals_dir)

        print(json.dumps({"proposals_generated": len(ids), "proposal_ids": ids}, indent=2))

    elif args.command == "list":
        result = cmd_list(proposals_dir, status=args.status)
        print(json.dumps(result, indent=2))

    elif args.command == "approve":
        result = cmd_approve(args.proposal_id, proposals_dir)
        print(json.dumps(result, indent=2))

    elif args.command == "reject":
        result = cmd_reject(args.proposal_id, proposals_dir, reason=args.reason)
        print(json.dumps(result, indent=2))

    elif args.command == "apply":
        from applier import apply_and_ingest

        proposal_file = proposals_dir / f"{args.proposal_id}.json"
        if not proposal_file.exists():
            print(json.dumps({"status": "error", "reason": "Proposal not found"}))
            return

        data = json.loads(proposal_file.read_text())
        proposal = _dict_to_proposal(data)
        skills_dir = Path(args.skills_dir) if args.skills_dir else Path(__file__).parent.parent.parent / "skills"

        result = apply_and_ingest(proposal, skills_dir, args.qdrant_url)

        if result["apply"]["status"] == "applied":
            data["status"] = "applied"
            proposal_file.write_text(json.dumps(data, indent=2))

        print(json.dumps(result, indent=2))

    elif args.command == "status":
        result = cmd_status(proposals_dir)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
