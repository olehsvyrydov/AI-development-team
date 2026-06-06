/**
 * Optional Qdrant backend (reuses an existing Docker Qdrant). Loaded only when
 * the optional `@qdrant/js-client-rest` dep is present; otherwise the factory
 * falls back to sqlite-vec. Same collection names as the prior Python RAG.
 */
import type { Filters, ScoredPoint, VectorPoint, VectorStore } from "../types.ts";
import { COLLECTIONS, FILTERABLE } from "./collections.ts";

interface QClient {
  getCollections(): Promise<{ collections: Array<{ name: string }> }>;
  createCollection(name: string, opts: unknown): Promise<unknown>;
  createPayloadIndex(name: string, opts: unknown): Promise<unknown>;
  upsert(name: string, opts: unknown): Promise<unknown>;
  query(name: string, opts: unknown): Promise<{ points: Array<{ id: string | number; score: number; payload: Record<string, unknown> }> }>;
  scroll(name: string, opts: unknown): Promise<{ points: Array<{ id: string | number; payload: Record<string, unknown> }> }>;
  getCollection(name: string): Promise<{ points_count: number }>;
}

export class QdrantStore implements VectorStore {
  #client: QClient;
  dims = 0;
  private constructor(client: QClient) {
    this.#client = client;
  }

  static async open(url: string): Promise<QdrantStore | null> {
    try {
      const mod = (await import("@qdrant/js-client-rest")) as {
        QdrantClient: new (opts: { url: string }) => QClient;
      };
      return new QdrantStore(new mod.QdrantClient({ url }));
    } catch {
      return null;
    }
  }

  async ensureCollections(dims: number): Promise<Record<string, boolean>> {
    this.dims = dims;
    const existing = new Set((await this.#client.getCollections()).collections.map((c) => c.name));
    const result: Record<string, boolean> = {};
    for (const c of COLLECTIONS) {
      if (existing.has(c)) {
        result[c] = false;
        continue;
      }
      await this.#client.createCollection(c, { vectors: { size: dims, distance: "Cosine" } });
      for (const field of FILTERABLE) {
        await this.#client.createPayloadIndex(c, { field_name: field, field_schema: "keyword" });
      }
      result[c] = true;
    }
    return result;
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    if (!points.length) return;
    await this.#client.upsert(collection, {
      points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
    });
  }

  async query(collection: string, vector: number[], filters: Filters | null, limit: number): Promise<ScoredPoint[]> {
    const res = await this.#client.query(collection, {
      query: vector,
      limit,
      with_payload: true,
      filter: toFilter(filters),
    });
    return res.points.map((p) => ({ id: String(p.id), score: p.score, payload: p.payload }));
  }

  async scroll(collection: string, filters: Filters | null, limit: number): Promise<ScoredPoint[]> {
    const res = await this.#client.scroll(collection, { limit, with_payload: true, filter: toFilter(filters) });
    return res.points.map((p) => ({ id: String(p.id), score: 0, payload: p.payload }));
  }

  async health(): Promise<boolean> {
    try {
      await this.#client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  async stats(): Promise<Array<{ name: string; exists: boolean; points: number }>> {
    const existing = new Set((await this.#client.getCollections()).collections.map((c) => c.name));
    const out = [];
    for (const c of COLLECTIONS) {
      if (!existing.has(c)) {
        out.push({ name: c, exists: false, points: 0 });
        continue;
      }
      const info = await this.#client.getCollection(c);
      out.push({ name: c, exists: true, points: info.points_count });
    }
    return out;
  }

  close(): void {
    /* REST client — nothing to close */
  }
}

function toFilter(filters: Filters | null): unknown {
  if (!filters || !Object.keys(filters).length) return undefined;
  return {
    must: Object.entries(filters).map(([key, value]) => ({ key, match: { value } })),
  };
}
