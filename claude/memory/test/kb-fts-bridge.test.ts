/**
 * The CommonJS bridge is the hub's read-only query path into the index. It must open
 * the db query-only, run the narrowing candidate prefilter, and return server-known
 * {file, scope, stack, score} — never an absolute path or a drift key — and degrade to
 * {available:false} on any miss (absent db, locked, corrupt). It NEVER writes/indexes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KbFtsStore } from "../src/stores/kb-fts.ts";

const require = createRequire(import.meta.url);
const BRIDGE = path.resolve(import.meta.dirname, "../kb-fts-bridge.cjs");

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aidt-bridge-"));
}

test("bridge returns scoped hits with only server-known keys", async () => {
  const dir = tmp();
  try {
    const dbPath = path.join(dir, "memory.db");
    const store = await KbFtsStore.open(dbPath);
    store!.ensureSchema();
    const vault = path.join(dir, "proj", "docs");
    const common = path.join(dir, "common");
    fs.mkdirSync(vault, { recursive: true });
    fs.mkdirSync(common, { recursive: true });
    fs.writeFileSync(path.join(vault, "note.md"), "---\nscope: project\n---\n# Note\n\nbridgeword body\n");
    store!.syncVaults("proj-1", vault, common, ["any"]);
    store!.close();

    const bridge = require(BRIDGE) as {
      ftsSearch(project: string, opts: Record<string, unknown>): { available: boolean; hits: Array<Record<string, unknown>> } | null;
    };
    const out = bridge.ftsSearch(dir, { query: "bridgeword", projectId: "proj-1", projectStack: ["any"], scope: "all", dbPath });
    assert.ok(out && out.available === true, "bridge is available");
    assert.equal(out!.hits.length, 1);
    const hit = out!.hits[0];
    assert.equal(hit.file, "note.md");
    assert.ok(!("path" in hit), "no absolute path leaked");
    assert.ok(!("mtime_ms" in hit), "no drift key leaked");
    assert.ok(!("size" in hit), "no drift key leaked");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bridge degrades to available:false when the db is absent", () => {
  const dir = tmp();
  try {
    const bridge = require(BRIDGE) as { ftsSearch(p: string, o: Record<string, unknown>): { available: boolean } | null };
    const out = bridge.ftsSearch(dir, { query: "x", projectId: "p", projectStack: ["any"], scope: "all", dbPath: path.join(dir, "nope.db") });
    assert.ok(out === null || out.available === false, "absent db → not available");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bridge degrades to available:false on a corrupt db", () => {
  const dir = tmp();
  try {
    const dbPath = path.join(dir, "memory.db");
    fs.writeFileSync(dbPath, "this is not a sqlite database at all");
    const bridge = require(BRIDGE) as { ftsSearch(p: string, o: Record<string, unknown>): { available: boolean } | null };
    const out = bridge.ftsSearch(dir, { query: "x", projectId: "p", projectStack: ["any"], scope: "all", dbPath });
    assert.ok(out === null || out.available === false, "corrupt db → not available");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
