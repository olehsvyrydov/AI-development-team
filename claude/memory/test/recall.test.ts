/**
 * End-to-end capture→recall round-trip with a MOCK embedder (no API key), so
 * AC-M3 (semantic recall), AC-M4 (capture), AC-M5 (project isolation) and
 * AC-M6 (global dev-rules) are proven without network. Mirrors what the
 * PreCompact (store) and SessionStart (query+format) hooks do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteVecStore } from "../src/stores/sqlite-vec.ts";
import { formatContext } from "../src/hooks/common.ts";
import type { EmbeddingProvider, VectorPoint } from "../src/types.ts";

const DIMS = 16;
/** Deterministic bag-of-chars embedding — similar texts get similar vectors. */
class MockEmbedder implements EmbeddingProvider {
  readonly model = "mock";
  readonly dimensions = DIMS;
  #vec(text: string): number[] {
    const v = new Array(DIMS).fill(0);
    for (const ch of text.toLowerCase()) v[ch.charCodeAt(0) % DIMS] += 1;
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
  async embedQuery(t: string): Promise<number[]> {
    return this.#vec(t);
  }
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.#vec(t));
  }
}

test("capture→recall round-trip: recall is project-scoped + includes global rules", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-recall-"));
  const store = await SqliteVecStore.open(path.join(dir, "memory.db"));
  if (!store) {
    t.skip("sqlite-vec not installed");
    return;
  }
  const embedder = new MockEmbedder();
  try {
    await store.ensureCollections(DIMS);

    // CAPTURE (AC-M4): store project-A context + a global dev rule.
    const mk = async (collection: string, id: string, content: string, payload: Record<string, unknown>) => {
      const [vector] = await embedder.embedDocuments([content]);
      const p: VectorPoint = { id, vector, payload: { content, ...payload } };
      await store.upsert(collection, [p]);
    };
    await mk("session-context", "a-dec", "Decided to use a token-bucket rate limiter for resets", {
      project_id: "projA", scope: "project", chunk_type: "decision",
    });
    await mk("session-context", "b-dec", "Chose GraphQL federation for the catalog service", {
      project_id: "projB", scope: "project", chunk_type: "decision",
    });
    await mk("dev-rules", "g-1", "Always write a failing test before implementing", {
      project_id: "global", scope: "global", chunk_type: "decision",
    });

    // RECALL (AC-M3): query as SessionStart does, scoped to project A.
    const qv = await embedder.embedQuery("rate limiter decision for resets");
    const projectHits = await store.query("session-context", qv, { project_id: "projA", scope: "project" }, 8);
    const globalHits = await store.query("dev-rules", qv, { scope: "global" }, 5);

    // AC-M5: project-A recall must not contain project-B content.
    const projIds = projectHits.map((h) => h.id);
    assert.ok(projIds.includes("a-dec"), "recalls project-A decision");
    assert.ok(!projIds.includes("b-dec"), "never recalls project-B decision");

    // AC-M6: global dev-rule is recalled regardless of project.
    assert.deepEqual(globalHits.map((h) => h.id), ["g-1"]);

    // The formatted block the hook injects contains both sections.
    const block = [
      formatContext(projectHits, "Restored Context from Previous Sessions"),
      formatContext(globalHits, "Global Dev Rules"),
    ].filter(Boolean).join("\n\n");
    assert.match(block, /Restored Context from Previous Sessions/);
    assert.match(block, /token-bucket rate limiter/);
    assert.match(block, /Global Dev Rules/);
    assert.ok(!block.includes("GraphQL federation"), "no cross-project leakage in the injected block");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
