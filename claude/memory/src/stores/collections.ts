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

/**
 * Payload fields we filter on — indexed in Qdrant, real columns in sqlite-vec.
 * `stack` is the cross-type knowledge-scope dimension: a common/global row may carry
 * a stack tag, and recall narrows it against the project's declared stack via the
 * shared scope predicate (see lib/knowledge-match.ts), with an "any" wildcard.
 */
export const FILTERABLE = ["project_id", "scope", "chunk_type", "session_id", "stack"] as const;
