/**
 * Integration test for the sqlite-vec store: ensure/upsert/query/scroll, project
 * isolation (security C10 / AC-M5), and dims-mismatch refusal (C-dim).
 * Skips automatically if the optional sqlite-vec dep isn't installed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteVecStore } from "../src/stores/sqlite-vec.ts";
import type { VectorPoint } from "../src/types.ts";

const DIMS = 8;
function vec(seed: number): number[] {
  // deterministic unit-ish vector; nearby seeds are similar
  return Array.from({ length: DIMS }, (_, i) => Math.sin(seed + i));
}
function point(id: string, seed: number, payload: Record<string, unknown>): VectorPoint {
  return { id, vector: vec(seed), payload: { content: id, ...payload } };
}

test("sqlite-vec store: upsert, KNN query, and project isolation", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-mem-"));
  const store = await SqliteVecStore.open(path.join(dir, "memory.db"));
  if (!store) {
    t.skip("sqlite-vec not installed");
    return;
  }
  try {
    await store.ensureCollections(DIMS);
    await store.upsert("session-context", [
      point("a-1", 1, { project_id: "projA", scope: "project", chunk_type: "decision" }),
      point("a-2", 2, { project_id: "projA", scope: "project", chunk_type: "task" }),
      point("b-1", 1, { project_id: "projB", scope: "project", chunk_type: "decision" }),
      point("g-1", 1, { project_id: "global", scope: "global", chunk_type: "decision" }),
    ]);

    // health
    assert.equal(await store.health(), true);

    // project isolation (C10 / AC-M5): query scoped to projA never returns projB
    const hits = await store.query("session-context", vec(1), { project_id: "projA", scope: "project" }, 10);
    const ids = hits.map((h) => h.id);
    assert.ok(ids.includes("a-1"), "returns project-A rows");
    assert.ok(!ids.includes("b-1"), "never returns project-B rows");
    assert.ok(!ids.includes("g-1"), "scope filter excludes global from a project query");

    // global scope retrievable on its own (AC-M6)
    const g = await store.query("session-context", vec(1), { scope: "global" }, 10);
    assert.deepEqual(g.map((h) => h.id), ["g-1"]);

    // scroll returns by filter without a query vector
    const scrolled = await store.scroll("session-context", { project_id: "projA" }, 10);
    assert.equal(scrolled.length, 2);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sqlite-vec store: refuses a dims mismatch (C-dim)", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-mem-"));
  const dbPath = path.join(dir, "memory.db");
  const s1 = await SqliteVecStore.open(dbPath);
  if (!s1) {
    t.skip("sqlite-vec not installed");
    return;
  }
  await s1.ensureCollections(8);
  s1.close();
  const s2 = await SqliteVecStore.open(dbPath);
  assert.ok(s2);
  await assert.rejects(() => s2!.ensureCollections(16), /mismatch/);
  s2!.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
