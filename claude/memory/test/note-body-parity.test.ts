/**
 * Parity proof that the index's body reduction matches the hub's `markdownBody`. The
 * indexed body and the hub-displayed excerpt must derive from the same front-matter /
 * title stripping, so no markup or front-matter leaks into the index that the hub would
 * not also strip. Both sides reduce a shared set of documents and must agree exactly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { reduceBody } from "../src/lib/note-body.ts";

const HUB_STATE = path.resolve(import.meta.dirname, "../../../hub/lib/state.js");

const SAMPLES = [
  "---\nscope: project\nstack: [java]\n---\n# Title\n\nThe body text here.\n",
  "no front matter, no title, just prose",
  "---\nscope: common\n---\nbody with no title heading\n",
  "# Leading title only\n\nbody under a title without front matter",
  "---\nscope: project\n---\n# Title\n\n## A subheading\n\n- a list item\n\n`code` and **bold**.",
  "   \n\n---\nbad: frontmatter never closed\nbody\n",
  "",
];

test("reduceBody agrees with the hub markdownBody over shared samples", () => {
  const script = `
    const { markdownBody } = require(${JSON.stringify(HUB_STATE)});
    const samples = ${JSON.stringify(SAMPLES)};
    process.stdout.write(JSON.stringify(samples.map((s) => markdownBody(s))));
  `;
  const hub = JSON.parse(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" })) as string[];
  assert.equal(hub.length, SAMPLES.length);
  for (let i = 0; i < SAMPLES.length; i++) {
    assert.equal(reduceBody(SAMPLES[i]), hub[i], `body parity mismatch on sample ${i}`);
  }
});
