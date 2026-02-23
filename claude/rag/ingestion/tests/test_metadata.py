"""Tests for metadata extraction from file paths."""

import pytest
from metadata import extract_metadata


class TestExtractMetadata:
    def test_extracts_agent_name_from_skill_path(self):
        meta = extract_metadata("claude/skills/architecture/solution-architect/SKILL.md")
        assert meta["agent_name"] == "solution-architect"

    def test_extracts_category(self):
        meta = extract_metadata("claude/skills/architecture/solution-architect/SKILL.md")
        assert meta["category"] == "architecture"

    def test_extracts_command_from_frontmatter(self):
        meta = extract_metadata(
            "claude/skills/management/product-owner/SKILL.md",
            frontmatter={"name": "product-owner", "description": "Product Owner (/po, alias: Max)"},
        )
        assert meta["agent_name"] == "product-owner"
        assert meta["agent_command"] == "/po"

    def test_extracts_nested_category(self):
        meta = extract_metadata("claude/skills/development/backend/java/backend-developer/SKILL.md")
        assert meta["category"] == "development/backend/java"

    def test_handles_compliance_regions(self):
        meta = extract_metadata("claude/skills/compliance/regions/uk/uk-accountant/SKILL.md")
        assert meta["agent_name"] == "uk-accountant"
        assert meta["category"] == "compliance/regions/uk"

    def test_extracts_command_from_description_pattern(self):
        meta = extract_metadata(
            "claude/skills/operations/secops/secops-engineer/SKILL.md",
            frontmatter={"name": "secops-engineer", "description": "SecOps (/secops, alias: Soren)"},
        )
        assert meta["agent_command"] == "/secops"

    def test_handles_missing_frontmatter(self):
        meta = extract_metadata("claude/skills/design/ui-designer/SKILL.md")
        assert meta["agent_name"] == "ui-designer"
        assert meta["category"] == "design"
        assert meta["agent_command"] is None

    def test_handles_non_skill_file(self):
        meta = extract_metadata("docs/architecture/adr-001.md")
        assert meta["agent_name"] is None
        assert meta["category"] is None

    def test_source_file_always_set(self):
        meta = extract_metadata("any/path/file.md")
        assert meta["source_file"] == "any/path/file.md"

    def test_extracts_multiple_aliases(self):
        meta = extract_metadata(
            "claude/skills/architecture/solution-architect/SKILL.md",
            frontmatter={
                "name": "solution-architect",
                "description": "Solution Architect (/arch, alias: Jorge, /jorge)"
            },
        )
        assert meta["agent_command"] == "/arch"
