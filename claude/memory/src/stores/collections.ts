/**
 * Logical collections shared by every vector backend. Same names as the prior
 * Python RAG so existing Qdrant data keeps working, plus `dev-rules` for the
 * global cross-project standards the SessionStart hook always recalls.
 */
export const COLLECTIONS = [
  "agent-knowledge",
  "decisions",
  "learnings",
  "code-patterns",
  "session-context",
  "dev-rules",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/** Payload fields we filter on — indexed in Qdrant, real columns in sqlite-vec. */
export const FILTERABLE = ["project_id", "scope", "chunk_type", "session_id"] as const;
