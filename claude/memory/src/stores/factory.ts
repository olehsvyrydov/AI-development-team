/**
 * Select a vector store from config, with a graceful fallback ladder:
 *   qdrant (if chosen & healthy) → sqlite-vec → null (digest-only).
 * Never throws — a null store means semantic recall/capture is skipped, not a
 * crash. This is the backbone of the "never break a session" guarantee.
 */
import type { MemoryConfig, VectorStore } from "../types.ts";
import { SqliteVecStore } from "./sqlite-vec.ts";
import { QdrantStore } from "./qdrant.ts";

export async function getStore(cfg: MemoryConfig): Promise<VectorStore | null> {
  if (cfg.backend === "none") return null;

  if (cfg.backend === "qdrant" && cfg.qdrantUrl) {
    const q = await QdrantStore.open(cfg.qdrantUrl);
    if (q && (await q.health())) return q;
    // configured Qdrant is down/absent → fall back to the local file store
  }

  const s = await SqliteVecStore.open(cfg.dbPath);
  if (s && (await s.health())) return s;
  return null;
}
