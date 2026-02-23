#!/usr/bin/env python3
"""Ingestion pipeline for AI Team Memory.

Reads SKILL.md files, chunks them, embeds with voyage-code-3,
and upserts into Qdrant collections.

Usage:
    python3 ingest.py --skills-dir ../../skills
    python3 ingest.py --skills-dir ../../skills --dry-run
    python3 ingest.py --file path/to/SKILL.md
"""

import argparse
import os
import re
import sys
from pathlib import Path

from chunker import chunk_markdown, Chunk
from metadata import extract_metadata

# Optional imports — fail gracefully for --dry-run
try:
    import voyageai
    HAS_VOYAGE = True
except ImportError:
    HAS_VOYAGE = False

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct
    HAS_QDRANT = True
except ImportError:
    HAS_QDRANT = False


FRONTMATTER_PATTERN = re.compile(r"^---\n(.*?)\n---", re.DOTALL)
BATCH_SIZE = 64  # voyage-code-3 max batch size


def parse_frontmatter(text: str) -> dict | None:
    """Extract YAML frontmatter as a simple dict (name/description only)."""
    match = FRONTMATTER_PATTERN.match(text)
    if not match:
        return None

    result = {}
    for line in match.group(1).split("\n"):
        line = line.strip()
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key in ("name", "description"):
                result[key] = value

    return result if result else None


def find_skill_files(skills_dir: str) -> list[Path]:
    """Find all SKILL.md files under the given directory."""
    return sorted(Path(skills_dir).rglob("SKILL.md"))


def process_file(file_path: Path, base_dir: Path) -> list[tuple[Chunk, dict]]:
    """Process a single SKILL.md file into chunks with metadata."""
    text = file_path.read_text(encoding="utf-8")
    rel_path = str(file_path.relative_to(base_dir.parent.parent))  # relative to claude/
    frontmatter = parse_frontmatter(text)
    meta = extract_metadata(rel_path, frontmatter)

    chunks = chunk_markdown(text, rel_path)
    results = []

    for chunk in chunks:
        payload = {
            **meta,
            "heading": chunk.heading,
            "level": chunk.level,
            "is_code_pattern": chunk.is_code_pattern,
        }
        if chunk.parent_heading:
            payload["parent_heading"] = chunk.parent_heading

        results.append((chunk, payload))

    return results


def embed_texts(texts: list[str], client) -> list[list[float]]:
    """Embed texts in batches using voyage-code-3."""
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        result = client.embed(batch, model="voyage-code-3")
        all_embeddings.extend(result.embeddings)
    return all_embeddings


def upsert_chunks(
    chunks_with_meta: list[tuple[Chunk, dict]],
    embeddings: list[list[float]],
    qdrant: "QdrantClient",
):
    """Upsert embedded chunks into Qdrant."""
    # Split into agent-knowledge and code-patterns
    knowledge_points = []
    pattern_points = []

    for (chunk, payload), embedding in zip(chunks_with_meta, embeddings):
        point = PointStruct(
            id=chunk.chunk_id,
            vector=embedding,
            payload={**payload, "content": chunk.content},
        )

        if chunk.is_code_pattern:
            pattern_points.append(point)
        else:
            knowledge_points.append(point)

    if knowledge_points:
        qdrant.upsert(collection_name="agent-knowledge", points=knowledge_points)

    if pattern_points:
        qdrant.upsert(collection_name="code-patterns", points=pattern_points)

    return len(knowledge_points), len(pattern_points)


def main():
    parser = argparse.ArgumentParser(description="Ingest SKILL.md files into AI Team Memory")
    parser.add_argument("--skills-dir", required=True, help="Path to skills directory")
    parser.add_argument("--file", help="Ingest a single file instead of whole directory")
    parser.add_argument("--dry-run", action="store_true", help="Parse and chunk without embedding/upserting")
    parser.add_argument("--qdrant-url", default=os.environ.get("QDRANT_URL", "http://localhost:6333"))

    args = parser.parse_args()
    skills_dir = Path(args.skills_dir).resolve()

    if args.file:
        files = [Path(args.file).resolve()]
    else:
        files = find_skill_files(skills_dir)

    if not files:
        print(f"No SKILL.md files found in {skills_dir}")
        sys.exit(1)

    print(f"Found {len(files)} SKILL.md file(s)")

    # Process all files
    all_chunks: list[tuple[Chunk, dict]] = []
    for f in files:
        chunks = process_file(f, skills_dir)
        all_chunks.extend(chunks)
        print(f"  {f.name} ({f.parent.name}): {len(chunks)} chunks")

    total_knowledge = sum(1 for c, _ in all_chunks if not c.is_code_pattern)
    total_patterns = sum(1 for c, _ in all_chunks if c.is_code_pattern)
    print(f"\nTotal: {len(all_chunks)} chunks ({total_knowledge} knowledge, {total_patterns} code patterns)")

    if args.dry_run:
        print("\n[DRY RUN] Skipping embedding and upsert.")
        for chunk, meta in all_chunks[:5]:
            print(f"  - [{meta.get('agent_name', '?')}] {chunk.heading} ({len(chunk.content)} chars)")
        if len(all_chunks) > 5:
            print(f"  ... and {len(all_chunks) - 5} more")
        return

    # Check dependencies
    if not HAS_VOYAGE:
        print("ERROR: voyageai package not installed. Run: pip install voyageai")
        sys.exit(1)
    if not HAS_QDRANT:
        print("ERROR: qdrant-client package not installed. Run: pip install qdrant-client")
        sys.exit(1)

    api_key = os.environ.get("VOYAGE_API_KEY")
    if not api_key:
        print("ERROR: VOYAGE_API_KEY environment variable not set")
        sys.exit(1)

    # Embed
    print("\nEmbedding with voyage-code-3...")
    voyage = voyageai.Client(api_key=api_key)
    texts = [chunk.content for chunk, _ in all_chunks]
    embeddings = embed_texts(texts, voyage)
    print(f"  Embedded {len(embeddings)} chunks")

    # Upsert
    print(f"\nUpserting to Qdrant at {args.qdrant_url}...")
    qdrant = QdrantClient(url=args.qdrant_url)
    n_knowledge, n_patterns = upsert_chunks(all_chunks, embeddings, qdrant)
    print(f"  agent-knowledge: {n_knowledge} points")
    print(f"  code-patterns: {n_patterns} points")

    print("\nIngestion complete!")


if __name__ == "__main__":
    main()
