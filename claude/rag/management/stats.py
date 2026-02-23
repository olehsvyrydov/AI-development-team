#!/usr/bin/env python3
"""Collection statistics and initialization for AI Team Memory."""

import argparse
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))

from qdrant_client import QdrantClient
from memory_mcp.collections import ensure_collections, get_collection_stats


def get_client(url: str = None) -> QdrantClient:
    """Create Qdrant client from URL or environment."""
    url = url or os.environ.get("QDRANT_URL", "http://localhost:6333")
    return QdrantClient(url=url, check_compatibility=False)


def cmd_init(args):
    """Initialize all collections."""
    client = get_client(args.qdrant_url)
    results = ensure_collections(client)

    for name, created in results.items():
        status = "CREATED" if created else "EXISTS"
        print(f"  {status}: {name}")

    print(f"\n{sum(results.values())} created, {sum(not v for v in results.values())} already existed.")


def cmd_stats(args):
    """Show collection statistics."""
    client = get_client(args.qdrant_url)
    stats = get_collection_stats(client)

    print(f"\n{'Collection':<20} {'Status':<10} {'Points':<10} {'Description'}")
    print("-" * 80)

    for s in stats:
        if s["exists"]:
            print(f"{s['name']:<20} {s['status']:<10} {s['points']:<10} {s['description']}")
        else:
            print(f"{s['name']:<20} {'MISSING':<10} {'-':<10} {s['description']}")


def cmd_health(args):
    """Check Qdrant health."""
    url = args.qdrant_url or os.environ.get("QDRANT_URL", "http://localhost:6333")
    try:
        import urllib.request
        resp = urllib.request.urlopen(f"{url}/healthz", timeout=5)
        print(f"Qdrant at {url}: OK ({resp.read().decode().strip()})")
    except Exception as e:
        print(f"Qdrant at {url}: UNREACHABLE ({e})")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="AI Team Memory — Collection Management")
    parser.add_argument("--qdrant-url", help="Qdrant URL (default: $QDRANT_URL or http://localhost:6333)")

    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Create collections if they don't exist")
    sub.add_parser("stats", help="Show collection statistics")
    sub.add_parser("health", help="Check Qdrant health")

    args = parser.parse_args()

    handlers = {"init": cmd_init, "stats": cmd_stats, "health": cmd_health}
    handlers[args.command](args)


if __name__ == "__main__":
    main()
