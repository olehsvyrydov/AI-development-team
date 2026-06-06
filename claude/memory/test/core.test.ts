/** Regression tests for the deterministic digest and the transcript parser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDigest, renderDigest } from "../src/digest.ts";
import { parseTranscript } from "../src/transcript.ts";

function tmpProject(ledger: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-dig-"));
  fs.writeFileSync(path.join(dir, ".workflow-state.json"), JSON.stringify(ledger));
  return dir;
}

test("digest surfaces stage, assignee, and unmet/rejected gates (AC-M1)", () => {
  const dir = tmpProject({
    "T-1": {
      title: "Do the thing",
      stage: "review",
      assignee: "/rev",
      gates: {
        ARCH_APPROVED: { state: "passed" },
        CODE_REVIEWED: { state: "rejected" },
        VERIFIED: { state: "pending" },
      },
    },
  });
  try {
    const d = buildDigest(dir);
    assert.equal(d.tickets[0].assignee, "/rev");
    assert.deepEqual(d.tickets[0].rejected, ["CODE_REVIEWED"]);
    assert.deepEqual(d.tickets[0].unmet, ["VERIFIED"]);
    const text = renderDigest(dir);
    assert.match(text, /T-1/);
    assert.match(text, /REJECTED: CODE_REVIEWED/);
    assert.match(text, /\/rev/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("digest never throws on a missing or malformed ledger (AC-M2)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-dig-"));
  try {
    assert.match(renderDigest(dir), /Project Workflow State/); // no ledger
    fs.writeFileSync(path.join(dir, ".workflow-state.json"), "{ not json");
    assert.doesNotThrow(() => renderDigest(dir)); // malformed
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("transcript parser extracts decisions, file changes, and tasks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidt-tr-"));
  const file = path.join(dir, "t.jsonl");
  const lines = [
    { type: "user", message: { content: "Which database should we use?" } },
    { type: "assistant", message: { content: "I recommend PostgreSQL for transactional safety rather than Mongo." } },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "/x/app.ts", content: "export const a = 1;" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "TaskCreate", input: { subject: "Build it", description: "do the work" } }] } },
  ];
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
  try {
    const chunks = parseTranscript(file);
    const types = new Set(chunks.map((c) => c.chunk_type));
    assert.ok(types.has("decision"), "captured a decision");
    assert.ok(types.has("file_change"), "captured a file change");
    assert.ok(types.has("task"), "captured a task");
    assert.ok(chunks.some((c) => c.content.includes("PostgreSQL")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("transcript parser returns [] on a missing file (never throws)", () => {
  assert.deepEqual(parseTranscript("/no/such/file.jsonl"), []);
});
