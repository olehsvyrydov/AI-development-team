"""Generate SKILL.md update proposals from detected patterns."""

import json
import uuid
from dataclasses import asdict
from pathlib import Path

from models import (
    Pattern, Proposal, ProposalStatus, SectionSafety,
)
from skill_parser import parse_skill_file, find_appendable_sections, find_skill_file
from quality import validate_proposal

NAMESPACE_UUID = uuid.UUID("f6a7b8c9-d0e1-2345-f012-567890123def")

# Map learning types to preferred target section headings
_SECTION_PREFERENCES = {
    "debugging-insight": ["Anti-Patterns", "Common Mistakes", "Checklist"],
    "architecture-decision": ["Standards", "Best Practices", "Expertise"],
    "domain-knowledge": ["Expertise", "Best Practices"],
    "troubleshooting": ["Anti-Patterns", "Common Mistakes", "Checklist"],
    "decision-pattern": ["Standards", "Best Practices"],
    "general": ["Best Practices", "Checklist"],
}


def _pick_target_section(sections, learning_type: str | None):
    """Pick the best appendable section for a given learning type."""
    prefs = _SECTION_PREFERENCES.get(learning_type or "general", _SECTION_PREFERENCES["general"])

    # Try preferred headings in order
    for pref in prefs:
        for section in sections:
            if pref.lower() in section.heading.lower():
                return section

    # Fallback: first SAFE section, then first CAUTIOUS
    safe = [s for s in sections if s.safety == SectionSafety.SAFE]
    if safe:
        return safe[0]
    cautious = [s for s in sections if s.safety == SectionSafety.CAUTIOUS]
    if cautious:
        return cautious[0]
    return None


def _format_content(pattern: Pattern, target_heading: str) -> str:
    """Format pattern into content suitable for the target section."""
    heading_lower = target_heading.lower()

    if any(kw in heading_lower for kw in ("anti-pattern", "common mistake")):
        return f"- {pattern.summary}"
    elif "checklist" in heading_lower:
        return f"- [ ] {pattern.summary}"
    else:
        return f"- {pattern.summary}"


def _dominant_learning_type(pattern: Pattern) -> str | None:
    """Get the most common learning_type among pattern's learnings."""
    types = [l.learning_type for l in pattern.learnings if l.learning_type]
    if not types:
        return None
    return max(set(types), key=types.count)


def generate_proposals(patterns: list[Pattern], skills_dir: Path) -> list[Proposal]:
    """Generate proposals from detected patterns.

    For each pattern:
    1. Find the SKILL.md for the agent
    2. Parse sections
    3. Match to the best appendable section
    4. Format content
    5. Validate quality
    """
    proposals = []

    for pattern in patterns:
        skill_file = find_skill_file(pattern.agent_name, skills_dir)
        if skill_file is None:
            continue

        sections = parse_skill_file(skill_file)
        appendable = find_appendable_sections(sections)
        if not appendable:
            continue

        learning_type = _dominant_learning_type(pattern)
        target = _pick_target_section(appendable, learning_type)
        if target is None:
            continue

        content = _format_content(pattern, target.heading)
        skill_text = skill_file.read_text()

        proposal_id = str(uuid.uuid5(
            NAMESPACE_UUID,
            f"{pattern.agent_name}::{target.heading}::{content[:100]}",
        ))

        proposal = Proposal(
            proposal_id=proposal_id,
            agent_name=pattern.agent_name,
            skill_file=str(skill_file),
            target_section=target.heading,
            section_safety=target.safety,
            action="append",
            content=content,
            rationale=f"Recurring pattern ({pattern.frequency}x, confidence {pattern.confidence:.2f}): {pattern.summary[:80]}",
            source_patterns=[pattern.pattern_id],
            source_learnings=[l.point_id for l in pattern.learnings],
        )

        # Run quality checks
        checks = validate_proposal(proposal, skill_text)
        proposal.quality_checks = checks

        proposals.append(proposal)

    return proposals


def _proposal_to_dict(proposal: Proposal) -> dict:
    """Convert a Proposal to a JSON-serializable dict."""
    d = asdict(proposal)
    d["status"] = proposal.status.value
    d["section_safety"] = proposal.section_safety.value
    return d


def _dict_to_proposal(d: dict) -> Proposal:
    """Convert a dict back to a Proposal."""
    d["status"] = ProposalStatus(d["status"])
    d["section_safety"] = SectionSafety(d["section_safety"])
    return Proposal(**d)


def save_proposals(proposals: list[Proposal], proposals_dir: Path) -> list[str]:
    """Save proposals as JSON files. Returns list of proposal IDs."""
    proposals_dir.mkdir(parents=True, exist_ok=True)
    ids = []
    for proposal in proposals:
        filename = f"{proposal.proposal_id}.json"
        filepath = proposals_dir / filename
        filepath.write_text(json.dumps(_proposal_to_dict(proposal), indent=2))
        ids.append(proposal.proposal_id)
    return ids


def load_proposals(
    proposals_dir: Path,
    status: ProposalStatus | None = None,
) -> list[Proposal]:
    """Load proposals from JSON files, optionally filtering by status."""
    if not proposals_dir.exists():
        return []

    proposals = []
    for filepath in sorted(proposals_dir.glob("*.json")):
        data = json.loads(filepath.read_text())
        proposal = _dict_to_proposal(data)
        if status is None or proposal.status == status:
            proposals.append(proposal)

    return proposals
