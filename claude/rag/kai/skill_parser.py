"""Parse SKILL.md files into sections with safety classification."""

import re
from pathlib import Path

from models import SectionSafety, SkillSection

# Headings (lowercase) that map to SAFE — always appendable
_SAFE_KEYWORDS = {
    "anti-pattern", "anti-patterns",
    "checklist", "checklists",
    "standard", "standards",
    "best practice", "best practices",
    "common mistake", "common mistakes",
    "rules", "quality rules",
    "code quality", "verification",
}

# Headings (lowercase) that map to UNSAFE — never modify
_UNSAFE_KEYWORDS = {
    "trigger", "context", "workflow",
    "research", "research & tools",
    "documentation lookup", "jira",
    "frontmatter",
}

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
_FRONTMATTER_RE = re.compile(r"^---\s*$")


def classify_section(heading: str, level: int) -> SectionSafety:
    """Classify a section heading as SAFE, CAUTIOUS, or UNSAFE.

    Level-1 headings are always UNSAFE (title).
    """
    if level == 1:
        return SectionSafety.UNSAFE

    lower = heading.lower().strip()
    # Remove trailing parenthetical like "(MANDATORY)"
    lower = re.sub(r"\s*\(.*\)\s*$", "", lower)

    for keyword in _UNSAFE_KEYWORDS:
        if keyword in lower:
            return SectionSafety.UNSAFE

    for keyword in _SAFE_KEYWORDS:
        if keyword in lower:
            return SectionSafety.SAFE

    return SectionSafety.CAUTIOUS


def parse_skill_file(file_path: Path) -> list[SkillSection]:
    """Parse a SKILL.md file into a list of SkillSections."""
    text = file_path.read_text()
    if not text.strip():
        return []

    lines = text.split("\n")
    sections: list[SkillSection] = []

    # Skip frontmatter
    start = 0
    if lines and _FRONTMATTER_RE.match(lines[0]):
        for i in range(1, len(lines)):
            if _FRONTMATTER_RE.match(lines[i]):
                start = i + 1
                break

    # Find all headings
    heading_positions: list[tuple[int, int, str]] = []  # (line_idx, level, text)
    for i in range(start, len(lines)):
        m = _HEADING_RE.match(lines[i])
        if m:
            level = len(m.group(1))
            heading_text = m.group(2).strip()
            heading_positions.append((i, level, heading_text))

    # Build sections
    for idx, (line_idx, level, heading_text) in enumerate(heading_positions):
        # Content starts after the heading line
        content_start = line_idx + 1
        # Content ends at the next heading of same or higher level, or EOF
        if idx + 1 < len(heading_positions):
            content_end = heading_positions[idx + 1][0]
        else:
            content_end = len(lines)

        content = "\n".join(lines[content_start:content_end]).strip()
        safety = classify_section(heading_text, level)

        sections.append(SkillSection(
            heading=heading_text,
            level=level,
            content=content,
            line_start=line_idx + 1,  # 1-indexed
            line_end=content_end,
            safety=safety,
        ))

    return sections


def find_appendable_sections(sections: list[SkillSection]) -> list[SkillSection]:
    """Return sections that are SAFE or CAUTIOUS (appendable)."""
    return [s for s in sections if s.safety != SectionSafety.UNSAFE]


def find_skill_file(agent_name: str, skills_dir: Path) -> Path | None:
    """Find SKILL.md for a given agent name by searching skills_dir recursively."""
    for skill_file in skills_dir.rglob("SKILL.md"):
        if skill_file.parent.name == agent_name:
            return skill_file
    return None
