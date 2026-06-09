#!/usr/bin/env node
/**
 * SessionStart hook — inject project context on a new/resumed/compacted session.
 *
 * Order:
 *   1. Print the DETERMINISTIC digest first (file-based, no network) and flush —
 *      so the workflow state is never lost even if everything below fails.
 *   2. Best-effort semantic recall (project-scoped + global dev-rules), time-boxed.
 * Every path exits 0; errors go to stderr only (stdout is injected as context).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { renderDigest } from "../digest.ts";
import { loadMemoryConfig } from "../lib/config.ts";
import { projectId } from "../lib/project-id.ts";
import { getEmbedder } from "../embeddings/factory.ts";
import { getStore } from "../stores/factory.ts";
import type { ScoredPoint, VectorStore } from "../types.ts";
import { formatContext, readStdinJson, withDeadline } from "./common.ts";
import { scopeMatches } from "../lib/knowledge-match.ts";
import { projectStackOf } from "../lib/project-stack.ts";

/** Hub digest CLI path, resolved relative to this hook (repo/hub/lib/digest.js). */
const HUB_DIGEST = path.resolve(import.meta.dirname, "../../../../hub/lib/digest.js");

/** How many global dev-rules are injected into the session. */
export const GLOBAL_RULE_LIMIT = 5;

/**
 * How many candidates to fetch before filtering, as a multiple of the display
 * limit. The scope/stack filter discards stack-mismatched rows, so we must fetch
 * a wider pool than we display — otherwise a stack-mismatched top result would
 * under-fill the section. Kept a bounded multiple to cap recall cost.
 */
const GLOBAL_RULE_CANDIDATE_MULTIPLE = 6;

/**
 * Select the global dev-rules to inject, FILTERING by the project's stack/scope
 * BEFORE limiting to the display count — so the displayed rules are the top-N
 * MATCHING rules, not the matching subset of an already-truncated top-N.
 *
 * A bounded candidate pool (a fixed multiple of the display limit) is fetched in
 * rank order, the shared scope/stack predicate is applied, then the top
 * `GLOBAL_RULE_LIMIT` survivors are returned in their original rank order. A row
 * with no stack tag is treated as "any" and recalled.
 *
 * @param store the vector store to query
 * @param collection the dev-rules collection name
 * @param queryVector the embedded recall query
 * @param declaredStack the project's declared stack tokens
 * @return up to `GLOBAL_RULE_LIMIT` matching rules, highest-ranked first
 */
export async function selectGlobalRules(
  store: VectorStore,
  collection: string,
  queryVector: number[],
  declaredStack: string[],
): Promise<ScoredPoint[]> {
  const candidates = await store.query(
    collection,
    queryVector,
    { scope: "global" },
    GLOBAL_RULE_LIMIT * GLOBAL_RULE_CANDIDATE_MULTIPLE,
  );
  const matching = candidates.filter((h) => {
    const tags = (h.payload && Array.isArray((h.payload as Record<string, unknown>).stack)
      ? ((h.payload as Record<string, unknown>).stack as string[])
      : ["any"]);
    return scopeMatches({ scope: "common", status: "approved-common", stack: tags }, { stack: declaredStack });
  });
  return matching.slice(0, GLOBAL_RULE_LIMIT);
}

/** One shared projection: prefer the hub's overlay-aware digest CLI. */
function projectDigest(cwd: string): string {
  try {
    if (fs.existsSync(HUB_DIGEST)) {
      const out = execFileSync("node", [HUB_DIGEST, cwd, "--text"], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out) return out;
    }
  } catch {
    /* hub unavailable / errored — fall back to the local renderer */
  }
  return renderDigest(cwd);
}

async function main(): Promise<void> {
  const input = await readStdinJson();
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();

  // 1) Deterministic digest FIRST — the floor that never fails.
  // Prefer the hub's overlay-aware digest CLI so the hook and the hub board
  // project the SAME state; fall back to the local renderer.
  try {
    process.stdout.write(projectDigest(cwd) + "\n");
  } catch {
    /* digest failed somehow — still continue; never abort the session */
  }

  // 2) Best-effort semantic recall.
  try {
    const cfg = loadMemoryConfig();
    const embedder = getEmbedder(cfg);
    if (!embedder) return;
    const store = await getStore(cfg);
    if (!store) return;

    const recall = async (): Promise<string> => {
      await store.ensureCollections(embedder.dimensions);
      const pid = projectId(cwd);
      const qv = await embedder.embedQuery(`project context decisions files tasks for ${cwd}`);
      const hits: ScoredPoint[] = [];
      for (const c of ["session-context", "decisions", "learnings"]) {
        hits.push(...(await store.query(c, qv, { project_id: pid, scope: "project" }, 8)));
      }
      // Narrow cross-project (global/common) rows by the project's declared stack via
      // the SHARED scope predicate — the same any-wildcard/intersection rule the hub
      // panel applies — so a stack-specific shared rule never leaks into a project of
      // a different stack. The filter is applied to a wider candidate pool BEFORE the
      // display limit, so a stack-mismatched top result does not under-fill the
      // section. A row with no stack tag is treated as "any" (recalled).
      const declaredStack = projectStackOf(cwd);
      const globalHits = await selectGlobalRules(store, "dev-rules", qv, declaredStack);
      const out = [
        formatContext(hits, "Restored Context from Previous Sessions"),
        formatContext(globalHits, "Global Dev Rules"),
      ].filter(Boolean);
      return out.join("\n\n");
    };

    const text = await withDeadline(recall(), 3000, "");
    if (text) process.stdout.write("\n" + text + "\n");
    store.close();
  } catch (e) {
    process.stderr.write(`[memory] recall skipped: ${(e as Error).message}\n`);
  }
}

/** True when this module is the process entrypoint (run directly as the hook). */
function isEntrypoint(): boolean {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isEntrypoint()) {
  main()
    .catch((e) => process.stderr.write(`[memory] restore-context error: ${(e as Error).message}\n`))
    .finally(() => process.exit(0)); // never break a session
}
