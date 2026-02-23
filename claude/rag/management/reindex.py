#!/usr/bin/env python3
"""Full re-ingestion: delete collections and re-ingest from source.

Usage:
    python3 reindex.py --skills-dir ../../skills
    python3 reindex.py --skills-dir ../../skills --collections agent-knowledge code-patterns
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))

from qdrant_client import QdrantClient
from memory_mcp.collections import COLLECTIONS, ensure_collections


def get_client(url: str = None) -> QdrantClient:
    url = url or os.environ.get("QDRANT_URL", "http://localhost:6333")
    return QdrantClient(url=url)


def main():
    parser = argparse.ArgumentParser(description="AI Team Memory — Full Reindex")
    parser.add_argument("--qdrant-url", help="Qdrant URL")
    parser.add_argument("--skills-dir", required=True, help="Path to skills directory")
    parser.add_argument(
        "--collections",
        nargs="+",
        default=["agent-knowledge", "code-patterns"],
        help="Collections to reindex (default: agent-knowledge code-patterns)",
    )
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")

    args = parser.parse_args()
    client = get_client(args.qdrant_url)

    # Validate collections
    for name in args.collections:
        if name not in COLLECTIONS:
            print(f"ERROR: Unknown collection '{name}'. Valid: {list(COLLECTIONS.keys())}")
            sys.exit(1)

    if not args.yes:
        print(f"This will DELETE and recreate: {args.collections}")
        confirm = input("Continue? [y/N] ").strip().lower()
        if confirm != "y":
            print("Cancelled.")
            sys.exit(0)

    # Delete collections
    existing = {c.name for c in client.get_collections().collections}
    for name in args.collections:
        if name in existing:
            client.delete_collection(name)
            print(f"  DELETED: {name}")

    # Recreate
    results = ensure_collections(client)
    for name, created in results.items():
        if created:
            print(f"  CREATED: {name}")

    # Re-ingest
    print(f"\nRe-ingesting from {args.skills_dir}...")
    print("Run the ingestion script:")
    print(f"  python3 ../ingestion/ingest.py --skills-dir {args.skills_dir}")


if __name__ == "__main__":
    main()
