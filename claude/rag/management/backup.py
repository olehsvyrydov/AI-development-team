#!/usr/bin/env python3
"""Snapshot export/import for AI Team Memory collections."""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))

from qdrant_client import QdrantClient
from memory_mcp.collections import COLLECTIONS


def get_client(url: str = None) -> QdrantClient:
    url = url or os.environ.get("QDRANT_URL", "http://localhost:6333")
    return QdrantClient(url=url)


def cmd_export(args):
    """Export all collections as snapshots."""
    client = get_client(args.qdrant_url)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    for name in COLLECTIONS:
        try:
            snapshot = client.create_snapshot(collection_name=name)
            snapshot_name = snapshot.name
            # Download snapshot
            snapshot_path = out_dir / f"{name}_{timestamp}.snapshot"
            client.download_snapshot(
                collection_name=name,
                snapshot_name=snapshot_name,
                path=str(snapshot_path),
            )
            print(f"  EXPORTED: {name} -> {snapshot_path}")
        except Exception as e:
            print(f"  FAILED: {name} — {e}")


def cmd_list(args):
    """List available snapshots."""
    client = get_client(args.qdrant_url)

    for name in COLLECTIONS:
        try:
            snapshots = client.list_snapshots(collection_name=name)
            print(f"\n{name}:")
            if not snapshots:
                print("  (no snapshots)")
            for s in snapshots:
                print(f"  {s.name} ({s.size} bytes)")
        except Exception as e:
            print(f"\n{name}: ERROR — {e}")


def main():
    parser = argparse.ArgumentParser(description="AI Team Memory — Backup Management")
    parser.add_argument("--qdrant-url", help="Qdrant URL")

    sub = parser.add_subparsers(dest="command", required=True)

    export_p = sub.add_parser("export", help="Export collection snapshots")
    export_p.add_argument("--output-dir", default="./backups", help="Output directory")

    sub.add_parser("list", help="List available snapshots")

    args = parser.parse_args()
    handlers = {"export": cmd_export, "list": cmd_list}
    handlers[args.command](args)


if __name__ == "__main__":
    main()
