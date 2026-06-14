/**
 * Parity proof that the full-text index's effective visibility never diverges from the
 * shared scope predicate. For every row in the cross-implementation fixture table
 * (hub/lib/scope-fixtures.json), a note is indexed in the holding vault that yields the
 * fixture's doc, then a query is run as the fixture's project. The note appears in the
 * results IF AND ONLY IF `scopeMatches` admits it — so the SQL candidate prefilter can
 * never out-vote the canonical predicate (the index may hide, never reveal).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KbFtsStore } from "../src/stores/kb-fts.ts";

const require = createRequire(import.meta.url);
const FIXTURE = path.resolve(import.meta.dirname, "../../../hub/lib/scope-fixtures.json");
const KB_SEARCH = path.resolve(import.meta.dirname, "../../../hub/lib/kb-search.js");

interface Row {
  name: string;
  doc: { scope: string; status?: string; stack?: string[]; ownProject?: boolean };
  project: { stack?: string[] };
  expected: boolean;
}

const NEEDLE = "paritymarker";

/** Render a fixture doc into a note placed in the holding vault that produces that doc. */
function placeNote(row: Row, projectVault: string, commonVault: string): void {
  const scope = row.doc.scope === "global" ? "common" : row.doc.scope;
  const lines = [`scope: ${scope}`];
  if (row.doc.status) lines.push(`status: ${row.doc.status}`);
  if (row.doc.stack) lines.push(`stack: [${row.doc.stack.join(", ")}]`);
  const body = `---\n${lines.join("\n")}\n---\n# note\n\n${NEEDLE} body\n`;
  // The HOLDING VAULT determines ownProject: a project-scoped fixture that is the
  // querying project's own note lives in the project vault; another project's note (or a
  // common note) lives elsewhere so the querying project does not own it.
  const dir = scope === "project" && row.doc.ownProject === true ? projectVault : commonVault;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "note.md"), body);
}

test("FTS effective visibility equals scopeMatches over the shared fixture table", async () => {
  const rows = JSON.parse(fs.readFileSync(FIXTURE, "utf8")).rows as Row[];
  assert.ok(rows.length > 0, "fixture has rows");

  for (const row of rows) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-kbfts-par-"));
    try {
      const store = await KbFtsStore.open(path.join(dir, "memory.db"));
      assert.ok(store);
      store!.ensureSchema();
      const projectVault = path.join(dir, "proj", "docs");
      const otherVault = path.join(dir, "other", "docs"); // a foreign project's vault
      const commonVault = path.join(dir, "common");
      fs.mkdirSync(projectVault, { recursive: true });
      fs.mkdirSync(commonVault, { recursive: true });

      const scope = row.doc.scope === "global" ? "common" : row.doc.scope;
      if (scope === "project" && row.doc.ownProject !== true) {
        // a foreign project's project-scoped note: index it under a DIFFERENT project id
        placeNote(row, otherVault, otherVault);
        store!.syncVaults("other-project", otherVault, commonVault, []);
        store!.syncVaults("the-project", projectVault, commonVault, row.project.stack ?? []);
      } else {
        placeNote(row, projectVault, commonVault);
        store!.syncVaults("the-project", projectVault, commonVault, row.project.stack ?? []);
      }

      const hits = store!.search({
        projectId: "the-project",
        projectStack: row.project.stack ?? [],
        scope: "all",
        query: NEEDLE,
        limit: 50,
      });
      const visible = hits.length > 0;
      assert.equal(visible, row.expected, `FTS visibility diverged from scopeMatches on "${row.name}"`);
      store!.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("bridge-path effective visibility (bridge + hub kb-search) equals scopeMatches over the shared fixture table", async () => {
  const rows = JSON.parse(fs.readFileSync(FIXTURE, "utf8")).rows as Row[];
  assert.ok(rows.length > 0, "fixture has rows");
  const kbSearch = require(KB_SEARCH) as {
    ftsSearch(
      project: string,
      opts: Record<string, unknown>,
    ): { available: boolean; hits: Array<{ file: string }> } | null;
  };

  for (const row of rows) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-kbfts-bridge-par-"));
    try {
      const dbPath = path.join(dir, "memory.db");
      const store = await KbFtsStore.open(dbPath);
      assert.ok(store);
      store!.ensureSchema();
      const projectVault = path.join(dir, "proj", "docs");
      const otherVault = path.join(dir, "other", "docs");
      const commonVault = path.join(dir, "common");
      fs.mkdirSync(projectVault, { recursive: true });
      fs.mkdirSync(commonVault, { recursive: true });

      const scope = row.doc.scope === "global" ? "common" : row.doc.scope;
      if (scope === "project" && row.doc.ownProject !== true) {
        placeNote(row, otherVault, otherVault);
        store!.syncVaults("other-project", otherVault, commonVault, []);
        store!.syncVaults("the-project", projectVault, commonVault, row.project.stack ?? []);
      } else {
        placeNote(row, projectVault, commonVault);
        store!.syncVaults("the-project", projectVault, commonVault, row.project.stack ?? []);
      }
      store!.close();

      // Drive the END-TO-END bridge path the hub uses: the CJS bridge reads the db and
      // returns candidates carrying project_id/status, then hub/lib/kb-search.js re-decides
      // visibility through the canonical scopeMatches. The bridge re-opens the db per call,
      // so the per-row dbPath is honoured even though the module require is cached.
      const out = kbSearch.ftsSearch(dir, {
        query: NEEDLE,
        projectId: "the-project",
        projectStack: row.project.stack ?? [],
        scope: "all",
        dbPath,
      });
      const visible = !!(out && out.available && out.hits.length > 0);
      assert.equal(visible, row.expected, `bridge-path visibility diverged from scopeMatches on "${row.name}"`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
