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
 * Payload fields a backend may filter on. The two backends differ in what they
 * persist as a queryable dimension, so a filter on a field is only honored where
 * that field is actually stored:
 *
 *   - sqlite-vec: only `project_id`, `scope`, `chunk_type`, `session_id` are vec0
 *     columns (see stores/sqlite-vec.ts). `stack` is NOT a vec0 column — a `stack`
 *     filter passed to this store is IGNORED at the store level.
 *   - Qdrant: every field below gets a keyword payload index, so it can be filtered
 *     there.
 *
 * `stack` is the cross-type knowledge-scope dimension: a common/global row may carry
 * a stack tag. It appears below because Qdrant indexes it, NOT because every store
 * filters it. Stack narrowing in recall is done POST-FETCH in the SessionStart hook
 * (hooks/restore-context.ts `selectGlobalRules`, via the shared scope predicate in
 * lib/knowledge-match.ts, with an "any" wildcard) — never relied on at the store level.
 */
export const FILTERABLE = ["project_id", "scope", "chunk_type", "session_id", "stack"] as const;
