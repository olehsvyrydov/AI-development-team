/**
 * Memory-side MIRROR of the hub's knowledge scope/stack visibility predicate.
 *
 * The canonical implementation lives in the hub (hub/lib/knowledge.js
 * `scopeMatches`). Because the TS recall path cannot import the JS hub module across
 * the package boundary, the predicate is re-implemented here byte-for-byte and locked
 * with a parity test over a shared fixture table (hub/lib/scope-fixtures.json), so a
 * note shown in the hub panel can never be invisible to recall (or vice-versa). The
 * `global` scope token read-aliases to `common`, matching the hub reader.
 */
export interface KnowledgeDoc {
  scope: string;
  status?: string;
  stack?: string[];
  ownProject?: boolean;
}

export interface ProjectMeta {
  stack?: string[];
}

/** Read-alias `global` to `common`; pass other scope values through unchanged. */
export function aliasScope(scope: string): string {
  return scope === "global" ? "common" : scope;
}

/**
 * True when a project may see/recall the doc:
 *   - its own project-scoped note (ownProject), OR
 *   - an approved-common note whose stack is "any" or intersects the project's stack.
 */
export function scopeMatches(doc: KnowledgeDoc, project: ProjectMeta): boolean {
  if (!doc || typeof doc !== "object") return false;
  const projectStack = Array.isArray(project?.stack) && project.stack.length ? project.stack : ["any"];
  const scope = aliasScope(doc.scope);
  if (scope === "project") {
    return doc.ownProject === true;
  }
  if (scope === "common") {
    if (doc.status !== "approved-common") return false;
    const docStack = Array.isArray(doc.stack) && doc.stack.length ? doc.stack : ["any"];
    if (docStack.includes("any")) return true;
    return docStack.some((t) => projectStack.includes(t));
  }
  return false;
}
