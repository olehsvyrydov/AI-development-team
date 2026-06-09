/**
 * Parity proof for the memory-side scope/stack predicate mirror. The mirror must
 * agree with the shared hub fixture table (hub/lib/scope-fixtures.json) on every row,
 * which the hub side asserts against its own scopeMatches — so both implementations
 * are pinned to one expected truth table and cannot silently diverge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scopeMatches, aliasScope } from "../src/lib/knowledge-match.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../../../hub/lib/scope-fixtures.json");

interface Row {
  name: string;
  doc: Parameters<typeof scopeMatches>[0];
  project: Parameters<typeof scopeMatches>[1];
  expected: boolean;
}

test("memory mirror matches the shared hub fixture expected values", () => {
  const rows = JSON.parse(fs.readFileSync(FIXTURE, "utf8")).rows as Row[];
  assert.ok(rows.length > 0, "fixture has rows");
  for (const row of rows) {
    assert.equal(scopeMatches(row.doc, row.project), row.expected, `mirror: ${row.name}`);
  }
});

test("global scope read-aliases to common in the mirror", () => {
  assert.equal(aliasScope("global"), "common");
  assert.equal(
    scopeMatches({ scope: "global", status: "approved-common", stack: ["any"] }, { stack: ["java"] }),
    true,
    "a global-tagged approved-common note is visible like common",
  );
});
