"""Tests for markdown heading-based chunker."""

import pytest
from chunker import chunk_markdown, Chunk


SIMPLE_SKILL = """\
---
name: test-agent
description: "A test agent"
---

# Test Agent (/test)

**Primary command:** `/test`

## Trigger

Use this skill when:
- User invokes `/test` command
- Testing is needed

## Expertise

### Core Competencies
- System design
- Architecture patterns

### Advanced Topics
- Event-driven architecture
- CQRS implementation
"""

SKILL_WITH_CODE = """\
---
name: backend-dev
description: "Backend developer"
---

# Backend Developer (/be)

## Templates

### REST Controller Template

```java
@RestController
@RequestMapping("/api/v1")
public class UserController {
    private final UserService userService;

    @GetMapping("/users/{id}")
    public ResponseEntity<UserDto> getUser(@PathVariable Long id) {
        return ResponseEntity.ok(userService.findById(id));
    }

    @PostMapping("/users")
    public ResponseEntity<UserDto> createUser(@RequestBody @Valid CreateUserRequest request) {
        return ResponseEntity.created(URI.create("/api/v1/users/" + user.getId()))
            .body(userService.create(request));
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<UserDto> updateUser(@PathVariable Long id, @RequestBody @Valid UpdateUserRequest request) {
        return ResponseEntity.ok(userService.update(id, request));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

## Checklist

- Write tests first
- Use DTOs
"""

LARGE_SECTION = """\
---
name: large-agent
description: "Agent with large section"
---

# Large Agent

## Big Section

### Sub One

""" + ("Content line.\n" * 100) + """

### Sub Two

""" + ("More content.\n" * 100)

NO_FRONTMATTER = """\
# Simple Doc

## Section One

Some content here.

## Section Two

More content here.
"""


class TestChunkMarkdown:
    def test_splits_at_h2_headings(self):
        chunks = chunk_markdown(SIMPLE_SKILL, "test.md")
        headings = [c.heading for c in chunks]
        assert "Trigger" in headings
        assert "Expertise" in headings

    def test_preserves_frontmatter_metadata(self):
        chunks = chunk_markdown(SIMPLE_SKILL, "test.md")
        for chunk in chunks:
            assert chunk.source_file == "test.md"

    def test_includes_intro_chunk(self):
        chunks = chunk_markdown(SIMPLE_SKILL, "test.md")
        intro = [c for c in chunks if c.heading == "Test Agent (/test)"]
        assert len(intro) == 1
        assert "/test" in intro[0].content

    def test_chunk_content_is_not_empty(self):
        chunks = chunk_markdown(SIMPLE_SKILL, "test.md")
        for chunk in chunks:
            assert len(chunk.content.strip()) > 0

    def test_extracts_code_blocks_as_patterns(self):
        chunks = chunk_markdown(SKILL_WITH_CODE, "be.md")
        code_chunks = [c for c in chunks if c.is_code_pattern]
        assert len(code_chunks) >= 1
        assert "RestController" in code_chunks[0].content

    def test_large_sections_split_at_h3(self):
        chunks = chunk_markdown(LARGE_SECTION, "large.md")
        sub_headings = [c.heading for c in chunks]
        assert "Big Section > Sub One" in sub_headings or "Sub One" in sub_headings

    def test_handles_no_frontmatter(self):
        chunks = chunk_markdown(NO_FRONTMATTER, "nofm.md")
        assert len(chunks) >= 2
        headings = [c.heading for c in chunks]
        assert "Section One" in headings
        assert "Section Two" in headings

    def test_deterministic_ids(self):
        chunks1 = chunk_markdown(SIMPLE_SKILL, "test.md")
        chunks2 = chunk_markdown(SIMPLE_SKILL, "test.md")
        ids1 = [c.chunk_id for c in chunks1]
        ids2 = [c.chunk_id for c in chunks2]
        assert ids1 == ids2

    def test_different_files_produce_different_ids(self):
        chunks1 = chunk_markdown(SIMPLE_SKILL, "file1.md")
        chunks2 = chunk_markdown(SIMPLE_SKILL, "file2.md")
        ids1 = set(c.chunk_id for c in chunks1)
        ids2 = set(c.chunk_id for c in chunks2)
        assert ids1.isdisjoint(ids2)

    def test_chunk_has_required_fields(self):
        chunks = chunk_markdown(SIMPLE_SKILL, "test.md")
        for chunk in chunks:
            assert isinstance(chunk, Chunk)
            assert chunk.chunk_id is not None
            assert chunk.heading is not None
            assert chunk.content is not None
            assert chunk.source_file is not None
            assert chunk.level in (1, 2, 3)
