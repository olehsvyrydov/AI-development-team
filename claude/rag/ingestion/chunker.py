"""Markdown heading-based chunker for SKILL.md files.

Splits markdown at ## headings, with further splitting at ### for large sections.
Extracts code blocks >500 chars as separate code-pattern chunks.
Generates deterministic UUIDs for idempotent re-ingestion.
"""

import re
import uuid
from dataclasses import dataclass, field

# Thresholds
MAX_SECTION_CHARS = 2000
MIN_CODE_PATTERN_CHARS = 500

NAMESPACE_UUID = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")


@dataclass
class Chunk:
    chunk_id: str
    heading: str
    content: str
    source_file: str
    level: int  # 1, 2, or 3
    is_code_pattern: bool = False
    parent_heading: str | None = None


def _make_id(source_file: str, heading: str) -> str:
    """Deterministic UUID from source file + heading."""
    return str(uuid.uuid5(NAMESPACE_UUID, f"{source_file}::{heading}"))


def _strip_frontmatter(text: str) -> str:
    """Remove YAML frontmatter if present."""
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            return text[end + 3:].strip()
    return text


def _split_at_headings(text: str, level: int) -> list[tuple[str, str]]:
    """Split text at headings of given level. Returns [(heading, content), ...]."""
    prefix = "#" * level
    pattern = re.compile(rf"^{prefix}\s+(.+)$", re.MULTILINE)

    sections = []
    matches = list(pattern.finditer(text))

    if not matches:
        return []

    # Content before first heading
    before = text[:matches[0].start()].strip()
    if before:
        # Find the H1 title if it exists
        h1_match = re.match(r"^#\s+(.+)$", before, re.MULTILINE)
        title = h1_match.group(1) if h1_match else "Introduction"
        sections.append((title, before))

    for i, match in enumerate(matches):
        heading = match.group(1).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if content:
            sections.append((heading, content))

    return sections


def _extract_code_blocks(content: str) -> list[str]:
    """Extract fenced code blocks from content."""
    pattern = re.compile(r"```[\w]*\n(.*?)```", re.DOTALL)
    return [m.group(0) for m in pattern.finditer(content) if len(m.group(0)) >= MIN_CODE_PATTERN_CHARS]


def chunk_markdown(text: str, source_file: str) -> list[Chunk]:
    """Split markdown into chunks at ## headings.

    - Strips YAML frontmatter
    - Splits at ## headings
    - Large sections (>2000 chars) with ### subsections: split further
    - Code blocks >500 chars: extracted as code-pattern chunks
    - Deterministic IDs from source_file + heading
    """
    body = _strip_frontmatter(text)
    if not body:
        return []

    chunks: list[Chunk] = []

    # First split at ## (level 2)
    h2_sections = _split_at_headings(body, 2)

    # If no ## headings found, try to at least create one chunk from the whole body
    if not h2_sections:
        h1_match = re.match(r"^#\s+(.+)$", body, re.MULTILINE)
        title = h1_match.group(1) if h1_match else "Content"
        chunks.append(Chunk(
            chunk_id=_make_id(source_file, title),
            heading=title,
            content=body,
            source_file=source_file,
            level=1,
        ))
        return chunks

    for heading, content in h2_sections:
        # Determine if this is an intro (H1) or H2 section
        is_intro = not any(content.startswith(f"{'#' * l} ") for l in range(2, 5))
        level = 1 if heading == h2_sections[0][0] and "## " not in body[:body.find(heading)] else 2

        # Check if intro chunk (content before first ##)
        h1_match = re.match(r"^#\s+(.+)$", content, re.MULTILINE)
        if h1_match and heading == h1_match.group(1):
            level = 1

        # Extract code patterns
        code_blocks = _extract_code_blocks(content)
        for i, code in enumerate(code_blocks):
            code_heading = f"{heading} > code-{i}" if len(code_blocks) > 1 else f"{heading} > code"
            chunks.append(Chunk(
                chunk_id=_make_id(source_file, code_heading),
                heading=code_heading,
                content=code,
                source_file=source_file,
                level=3,
                is_code_pattern=True,
                parent_heading=heading,
            ))

        # Check if section is large and has ### subsections
        if len(content) > MAX_SECTION_CHARS:
            h3_sections = _split_at_headings(content, 3)
            if h3_sections:
                for sub_heading, sub_content in h3_sections:
                    full_heading = f"{heading} > {sub_heading}" if heading != sub_heading else sub_heading
                    chunks.append(Chunk(
                        chunk_id=_make_id(source_file, full_heading),
                        heading=full_heading,
                        content=sub_content,
                        source_file=source_file,
                        level=3,
                        parent_heading=heading,
                    ))
                continue

        # Normal-sized section — add as single chunk
        chunks.append(Chunk(
            chunk_id=_make_id(source_file, heading),
            heading=heading,
            content=content,
            source_file=source_file,
            level=level,
        ))

    return chunks
