"""Agent and category metadata extraction from file paths.

Extracts agent_name, agent_command, and category from SKILL.md file paths
and optional YAML frontmatter.
"""

import re


# Pattern: /command in description like "(/arch, alias: Jorge, /jorge)"
COMMAND_PATTERN = re.compile(r"\(/(\w+)")


def extract_metadata(file_path: str, frontmatter: dict | None = None) -> dict:
    """Extract metadata from a SKILL.md file path and optional frontmatter.

    Args:
        file_path: Relative path to the file (e.g., "claude/skills/architecture/solution-architect/SKILL.md")
        frontmatter: Optional parsed YAML frontmatter dict with 'name' and 'description' keys

    Returns:
        Dict with keys: agent_name, agent_command, category, source_file
    """
    result = {
        "agent_name": None,
        "agent_command": None,
        "category": None,
        "source_file": file_path,
    }

    # Normalize path separators
    path = file_path.replace("\\", "/")

    # Check if this is a skill file
    parts = path.split("/")
    try:
        skills_idx = parts.index("skills")
    except ValueError:
        return result

    # Everything after "skills/" until the agent folder
    # e.g., skills/architecture/solution-architect/SKILL.md
    # category = "architecture", agent = "solution-architect"
    after_skills = parts[skills_idx + 1:]

    if len(after_skills) < 2:
        return result

    # Agent name is the folder containing SKILL.md
    agent_folder = after_skills[-2]  # second-to-last part (last is SKILL.md)
    result["agent_name"] = agent_folder

    # Category is everything between "skills/" and the agent folder
    category_parts = after_skills[:-2]  # everything except agent_folder/SKILL.md
    if category_parts:
        result["category"] = "/".join(category_parts)

    # Extract command from frontmatter description
    if frontmatter and "description" in frontmatter:
        desc = frontmatter["description"]
        match = COMMAND_PATTERN.search(desc)
        if match:
            result["agent_command"] = f"/{match.group(1)}"

    return result
