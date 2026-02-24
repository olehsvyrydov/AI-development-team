"""SM quality rule validation for Kai proposals.

Implements rules from scrum-master SKILL.md:309-349:
- Universality: no sprint/project/ticket references
- Not duplicate: no redundant content
- Actionable: specific, not vague
"""

import re
from difflib import SequenceMatcher

from models import Proposal

# Compiled forbidden patterns for universality checks
FORBIDDEN_PATTERNS = [
    re.compile(r"sprint\s+\d+", re.IGNORECASE),
    re.compile(r"[A-Z]{2,}-\d+"),  # Ticket IDs like SE-1025
    re.compile(r"\bworkaround\b", re.IGNORECASE),
    re.compile(r"\btemporary\s+(fix|solution|hack)\b", re.IGNORECASE),
    re.compile(r"\bper\s+sprint\b", re.IGNORECASE),
    re.compile(r"\bretro(spective)?\s+(finding|item)\b", re.IGNORECASE),
    re.compile(r"\bhack\b", re.IGNORECASE),
]

# Minimum content length for actionability
_MIN_CONTENT_LENGTH = 20

# Similarity threshold for dedup
_SIMILARITY_THRESHOLD = 0.65


def validate_universality(content: str) -> tuple[bool, list[str]]:
    """Check content has no sprint/project/ticket references.

    Returns:
        (passed, list of violation descriptions)
    """
    violations = []
    for pattern in FORBIDDEN_PATTERNS:
        match = pattern.search(content)
        if match:
            violations.append(f"Forbidden pattern '{pattern.pattern}' matched: '{match.group()}'")

    return (len(violations) == 0, violations)


def validate_not_duplicate(content: str, existing_skill_text: str) -> tuple[bool, str | None]:
    """Check content is not a duplicate of existing skill text.

    Uses line-level similarity matching.

    Returns:
        (passed, duplicate_line or None)
    """
    if not existing_skill_text.strip():
        return (True, None)

    content_lower = content.lower().strip()
    existing_lines = [
        line.strip() for line in existing_skill_text.split("\n")
        if line.strip() and not line.strip().startswith("#")
    ]

    for line in existing_lines:
        line_lower = line.lower().lstrip("0123456789.-[] ")
        if not line_lower:
            continue
        ratio = SequenceMatcher(None, content_lower, line_lower).ratio()
        if ratio >= _SIMILARITY_THRESHOLD:
            return (False, line.strip())

    return (True, None)


def validate_actionable(content: str) -> tuple[bool, str | None]:
    """Check content is specific and actionable, not vague.

    Returns:
        (passed, reason or None)
    """
    stripped = content.strip()

    if len(stripped) < _MIN_CONTENT_LENGTH:
        return (False, f"Too short ({len(stripped)} chars, minimum {_MIN_CONTENT_LENGTH})")

    # Check for vague phrases
    vague_patterns = [
        re.compile(r"^be\s+(careful|good|better)\b", re.IGNORECASE),
        re.compile(r"^(just|simply)\s+\w+\b", re.IGNORECASE),
        re.compile(r"^(don't|do not)\s+forget\b", re.IGNORECASE),
    ]
    for pattern in vague_patterns:
        if pattern.search(stripped):
            return (False, f"Vague language detected: '{pattern.pattern}'")

    return (True, None)


def validate_proposal(proposal: Proposal, existing_skill_text: str) -> dict:
    """Run all quality checks on a proposal.

    Returns:
        {universal: bool, not_duplicate: bool, actionable: bool, overall: bool, violations: []}
    """
    violations = []

    u_ok, u_violations = validate_universality(proposal.content)
    if not u_ok:
        violations.extend(u_violations)

    d_ok, d_dup = validate_not_duplicate(proposal.content, existing_skill_text)
    if not d_ok:
        violations.append(f"Duplicate of existing: '{d_dup}'")

    a_ok, a_reason = validate_actionable(proposal.content)
    if not a_ok:
        violations.append(f"Not actionable: {a_reason}")

    return {
        "universal": u_ok,
        "not_duplicate": d_ok,
        "actionable": a_ok,
        "overall": u_ok and d_ok and a_ok,
        "violations": violations,
    }
