#!/usr/bin/env node
/**
 * SessionStart hook — inject project context on a new/resumed/compacted session.
 *
 * Order (security C6, AC-M1/M2):
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
import type { ScoredPoint } from "../types.ts";
import { formatContext, readStdinJson, withDeadline } from "./common.ts";

/** Hub digest CLI path, resolved relative to this hook (repo/hub/lib/digest.js). */
const HUB_DIGEST = path.resolve(import.meta.dirname, "../../../../hub/lib/digest.js");

/** One shared projection (AC-X3): prefer the hub's overlay-aware digest CLI. */
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
  // project the SAME state (AC-X3); fall back to the local renderer.
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
      const globalHits = await store.query("dev-rules", qv, { scope: "global" }, 5);
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

main()
  .catch((e) => process.stderr.write(`[memory] restore-context error: ${(e as Error).message}\n`))
  .finally(() => process.exit(0)); // C6: never break a session
