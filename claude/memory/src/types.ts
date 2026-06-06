/**
 * Shared types for the AI Dev Team memory subsystem.
 *
 * These are backend-neutral so the hooks, the MCP server, and the CLIs never
 * import a concrete store/embedding client directly.
 */

/** A chunk extracted from a transcript or ingested document, before embedding. */
export interface Chunk {
  chunk_type: ChunkType;
  content: string;
  metadata: Record<string, string | number | boolean>;
}

export type ChunkType =
  | "decision"
  | "file_change"
  | "task"
  | "discussion"
  | "error_resolution"
  | "workflow_state";

/** A vector + its payload, ready to upsert. Backend-neutral. */
export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

/** A search hit. Backend-neutral. */
export interface ScoredPoint {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

/** Equality filters applied to payload fields (AND-combined). */
export type Filters = Record<string, string | number | boolean>;

/** The minimal surface every vector backend implements. */
export interface VectorStore {
  /** Create collections/tables for `dims`-wide vectors if absent. Returns {name: created}. */
  ensureCollections(dims: number): Promise<Record<string, boolean>>;
  upsert(collection: string, points: VectorPoint[]): Promise<void>;
  query(
    collection: string,
    vector: number[],
    filters: Filters | null,
    limit: number,
  ): Promise<ScoredPoint[]>;
  /** Filtered scan without a query vector (for distillation/maintenance). */
  scroll(collection: string, filters: Filters | null, limit: number): Promise<ScoredPoint[]>;
  /** Quick reachability/openability check; never throws. */
  health(): Promise<boolean>;
  stats(): Promise<Array<{ name: string; exists: boolean; points: number }>>;
  /** The vector width this store is bound to (after ensureCollections). */
  readonly dims: number;
  close(): void;
}

/** The minimal surface every embedding provider implements. */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

/** Memory section of ~/.aidevteam/config.json (selection only — never secrets). */
export interface MemoryConfig {
  backend: "none" | "sqlite" | "qdrant";
  embeddings: "none" | "voyage" | "gemini";
  dbPath: string;
  qdrantUrl: string | null;
}
