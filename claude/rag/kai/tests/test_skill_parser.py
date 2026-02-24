"""Tests for SKILL.md parser and section safety classification."""

import tempfile
from pathlib import Path

from models import SectionSafety
from skill_parser import classify_section, parse_skill_file, find_appendable_sections, find_skill_file


SAMPLE_SKILL = """\
---
name: backend-developer
description: "Backend Developer"
---

# Backend Developer (/be)

**Primary command:** `/be`

## Trigger

Use this skill when:
- User invokes `/be` command

## Context

You are James, a Senior Backend Developer.

## Expertise

### Core Competencies
- Spring Boot 4.0+
- Java 21+

## Standards

### Code Quality
- Test coverage > 80%

## Anti-Patterns

1. Never mock repositories in integration tests
2. Avoid circular dependencies

## Checklist

- [ ] All endpoints have OpenAPI annotations
- [ ] Error responses follow RFC 7807

## Templates

### REST Controller Template

```java
@RestController
public class FooController {}
```

## Best Practices

- Use constructor injection
- Prefer records for DTOs

## Common Mistakes

1. Forgetting to close resources
"""


class TestClassifySection:
    def test_safe_sections(self):
        safe_headings = [
            ("Anti-Patterns", 2),
            ("Checklist", 2),
            ("Standards", 2),
            ("Best Practices", 2),
            ("Common Mistakes", 2),
            ("Code Quality", 3),
        ]
        for heading, level in safe_headings:
            result = classify_section(heading, level)
            assert result == SectionSafety.SAFE, f"Expected SAFE for '{heading}', got {result}"

    def test_cautious_sections(self):
        cautious_headings = [
            ("Expertise", 2),
            ("Templates", 2),
            ("Core Competencies", 3),
            ("REST Controller Template", 3),
        ]
        for heading, level in cautious_headings:
            result = classify_section(heading, level)
            assert result == SectionSafety.CAUTIOUS, f"Expected CAUTIOUS for '{heading}', got {result}"

    def test_unsafe_sections(self):
        unsafe_headings = [
            ("Trigger", 2),
            ("Context", 2),
            ("Backend Developer (/be)", 1),
            ("Research & Tools (MANDATORY)", 2),
        ]
        for heading, level in unsafe_headings:
            result = classify_section(heading, level)
            assert result == SectionSafety.UNSAFE, f"Expected UNSAFE for '{heading}', got {result}"

    def test_unknown_heading_defaults_to_cautious(self):
        assert classify_section("Random Section", 2) == SectionSafety.CAUTIOUS


class TestParseSkillFile:
    def test_parses_sections(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        headings = [s.heading for s in sections]
        assert "Trigger" in headings
        assert "Context" in headings
        assert "Anti-Patterns" in headings
        assert "Checklist" in headings
        assert "Expertise" in headings

    def test_section_levels(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        trigger = next(s for s in sections if s.heading == "Trigger")
        assert trigger.level == 2

        core = next(s for s in sections if s.heading == "Core Competencies")
        assert core.level == 3

    def test_section_content(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        anti = next(s for s in sections if s.heading == "Anti-Patterns")
        assert "Never mock repositories" in anti.content
        assert "circular dependencies" in anti.content

    def test_section_safety_classification(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        trigger = next(s for s in sections if s.heading == "Trigger")
        assert trigger.safety == SectionSafety.UNSAFE

        anti = next(s for s in sections if s.heading == "Anti-Patterns")
        assert anti.safety == SectionSafety.SAFE

    def test_line_numbers(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        for section in sections:
            assert section.line_start >= 1
            assert section.line_end >= section.line_start

    def test_empty_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("")
            f.flush()
            sections = parse_skill_file(Path(f.name))
        assert sections == []

    def test_frontmatter_excluded_from_sections(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        headings = [s.heading for s in sections]
        # Frontmatter should not appear as a section
        assert "name: backend-developer" not in headings


class TestFindAppendableSections:
    def test_filters_unsafe(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        appendable = find_appendable_sections(sections)
        for s in appendable:
            assert s.safety != SectionSafety.UNSAFE

    def test_includes_safe_sections(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        appendable = find_appendable_sections(sections)
        headings = [s.heading for s in appendable]
        assert "Anti-Patterns" in headings
        assert "Checklist" in headings

    def test_includes_cautious_sections(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(SAMPLE_SKILL)
            f.flush()
            sections = parse_skill_file(Path(f.name))

        appendable = find_appendable_sections(sections)
        headings = [s.heading for s in appendable]
        assert "Expertise" in headings


class TestFindSkillFile:
    def test_finds_by_agent_name(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "development" / "backend-developer"
            skill_dir.mkdir(parents=True)
            skill_file = skill_dir / "SKILL.md"
            skill_file.write_text("# Backend")

            result = find_skill_file("backend-developer", Path(tmpdir))
            assert result == skill_file

    def test_returns_none_for_unknown(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            result = find_skill_file("nonexistent-agent", Path(tmpdir))
            assert result is None

    def test_finds_nested_skill(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "architecture" / "solution-architect"
            skill_dir.mkdir(parents=True)
            skill_file = skill_dir / "SKILL.md"
            skill_file.write_text("# Architect")

            result = find_skill_file("solution-architect", Path(tmpdir))
            assert result == skill_file
