#!/usr/bin/env python3
"""Prune stale or duplicate points from AI Team Memory collections."""

import argparse
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
from memory_mcp.collections import COLLECTIONS


def get_client(url: str = None) -> QdrantClient:
    url = url or os.environ.get("QDRANT_URL", "http://localhost:6333")
    return QdrantClient(url=url)


def cmd_duplicates(args):
    """Find and optionally remove duplicate points (same source_file + heading)."""
    client = get_client(args.qdrant_url)
    collection = args.collection

    print(f"Scanning {collection} for duplicates...")

    # Scroll through all points
    points, offset = client.scroll(
        collection_name=collection,
        limit=100,
        with_payload=True,
        with_vectors=False,
    )

    all_points = list(points)
    while offset is not None:
        points, offset = client.scroll(
            collection_name=collection,
            offset=offset,
            limit=100,
            with_payload=True,
            with_vectors=False,
        )
        all_points.extend(points)

    # Group by source_file + heading
    keys = Counter()
    for p in all_points:
        key = f"{p.payload.get('source_file', '')}::{p.payload.get('heading', '')}"
        keys[key] += 1

    duplicates = {k: v for k, v in keys.items() if v > 1}

    if not duplicates:
        print("  No duplicates found.")
        return

    print(f"  Found {len(duplicates)} duplicate groups:")
    for key, count in duplicates.items():
        print(f"    {key}: {count} copies")

    if args.delete:
        print("\n  Duplicate removal requires manual review. Use reindex.py to rebuild from source.")


def cmd_stale(args):
    """Find points from source files that no longer exist."""
    client = get_client(args.qdrant_url)
    collection = args.collection
    base_dir = args.base_dir

    print(f"Scanning {collection} for stale points...")

    points, offset = client.scroll(
        collection_name=collection,
        limit=100,
        with_payload=["source_file"],
        with_vectors=False,
    )

    all_points = list(points)
    while offset is not None:
        points, offset = client.scroll(
            collection_name=collection,
            offset=offset,
            limit=100,
            with_payload=["source_file"],
            with_vectors=False,
        )
        all_points.extend(points)

    stale_ids = []
    for p in all_points:
        source = p.payload.get("source_file", "")
        full_path = os.path.join(base_dir, source)
        if source and not os.path.exists(full_path):
            stale_ids.append(p.id)
            if not args.delete:
                print(f"  STALE: {p.id} — {source}")

    if not stale_ids:
        print("  No stale points found.")
        return

    print(f"\n  Found {len(stale_ids)} stale points.")

    if args.delete:
        client.delete(collection_name=collection, points_selector=stale_ids)
        print(f"  DELETED {len(stale_ids)} stale points.")


def main():
    parser = argparse.ArgumentParser(description="AI Team Memory — Prune Management")
    parser.add_argument("--qdrant-url", help="Qdrant URL")

    sub = parser.add_subparsers(dest="command", required=True)

    dup_p = sub.add_parser("duplicates", help="Find duplicate points")
    dup_p.add_argument("--collection", default="agent-knowledge", help="Collection to scan")
    dup_p.add_argument("--delete", action="store_true", help="Delete duplicates")

    stale_p = sub.add_parser("stale", help="Find points from deleted source files")
    stale_p.add_argument("--collection", default="agent-knowledge", help="Collection to scan")
    stale_p.add_argument("--base-dir", required=True, help="Base directory for source files")
    stale_p.add_argument("--delete", action="store_true", help="Delete stale points")

    args = parser.parse_args()
    handlers = {"duplicates": cmd_duplicates, "stale": cmd_stale}
    handlers[args.command](args)


if __name__ == "__main__":
    main()
