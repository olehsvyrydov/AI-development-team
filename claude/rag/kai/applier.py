"""Apply approved proposals to SKILL.md files and trigger re-ingestion."""

import subprocess
from pathlib import Path

from models import Proposal, ProposalStatus
from skill_parser import parse_skill_file


def apply_proposal(proposal: Proposal, skills_dir: Path) -> dict:
    """Apply an approved proposal by appending content to the target section.

    Re-parses the SKILL.md at apply time for robustness against intermediate edits.
    Matches section by heading text, not line number.
    """
    if proposal.status != ProposalStatus.APPROVED:
        return {
            "status": "rejected",
            "reason": f"Proposal is not approved (status: {proposal.status.value})",
        }

    skill_path = Path(proposal.skill_file)
    if not skill_path.exists():
        return {"status": "error", "reason": f"Skill file not found: {skill_path}"}

    # Re-parse to get current section positions
    sections = parse_skill_file(skill_path)
    target = None
    for section in sections:
        if section.heading == proposal.target_section:
            target = section
            break

    if target is None:
        return {
            "status": "error",
            "reason": f"Target section '{proposal.target_section}' not found in {skill_path}",
        }

    # Read current file and insert content at the end of the target section
    lines = skill_path.read_text().split("\n")

    # Find insertion point: end of target section content (before next heading)
    insert_at = target.line_end  # line_end is exclusive (0-indexed from parse)

    # Insert the new content
    new_lines = proposal.content.split("\n")
    lines[insert_at:insert_at] = new_lines

    skill_path.write_text("\n".join(lines))

    return {
        "status": "applied",
        "file": str(skill_path),
        "section": proposal.target_section,
        "lines_added": len(new_lines),
    }


def re_ingest_skill(
    skill_file: Path,
    skills_dir: Path,
    qdrant_url: str,
) -> dict:
    """Re-ingest a SKILL.md file into Qdrant via the ingestion script."""
    ingestion_script = Path(__file__).parent.parent / "ingestion" / "ingest.py"
    venv_python = Path(__file__).parent.parent / "mcp-server" / ".venv" / "bin" / "python3"

    result = subprocess.run(
        [
            str(venv_python),
            str(ingestion_script),
            "--skills-dir", str(skills_dir),
            "--file", str(skill_file),
            "--qdrant-url", qdrant_url,
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )

    if result.returncode != 0:
        return {"status": "error", "stderr": result.stderr}

    return {"status": "ingested", "output": result.stdout}


def apply_and_ingest(
    proposal: Proposal,
    skills_dir: Path,
    qdrant_url: str,
) -> dict:
    """Apply a proposal and re-ingest the modified SKILL.md."""
    apply_result = apply_proposal(proposal, skills_dir)
    if apply_result["status"] != "applied":
        return {"apply": apply_result, "ingest": {"status": "skipped"}}

    ingest_result = re_ingest_skill(
        Path(proposal.skill_file),
        skills_dir,
        qdrant_url,
    )

    return {"apply": apply_result, "ingest": ingest_result}
