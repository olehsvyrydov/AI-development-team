/**
 * Global-rule recall must FILTER by the project's stack BEFORE limiting to the
 * display count — not after. When the highest-scoring candidates are
 * stack-mismatched, they would be discarded by the scope/stack predicate; if the
 * limit were applied first, those discards would leave the "Global Dev Rules"
 * section under-filled even though enough matching rules exist further down the
 * candidate list. This asserts the filter-then-limit ordering: the section is
 * filled with the top-N MATCHING rules, ranked highest-score first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectGlobalRules, GLOBAL_RULE_LIMIT } from "../src/hooks/restore-context.ts";
import type { Filters, ScoredPoint, VectorPoint, VectorStore } from "../src/types.ts";

/**
 * Minimal store stub: returns a fixed, pre-ranked candidate list (highest score
 * first), honoring the requested `limit` so the candidate fetch stays bounded.
 * Records the largest limit it was asked for so the test can assert the fetch is
 * bounded (a modest multiple of the display limit), not unbounded.
 */
class RankedStore implements VectorStore {
  readonly dims = 0;
  maxLimitRequested = 0;
  #ranked: ScoredPoint[];
  constructor(ranked: ScoredPoint[]) {
    this.#ranked = ranked;
  }
  async query(_collection: string, _vector: number[], _filters: Filters | null, limit: number): Promise<ScoredPoint[]> {
    this.maxLimitRequested = Math.max(this.maxLimitRequested, limit);
    return this.#ranked.slice(0, limit);
  }
  async ensureCollections(): Promise<Record<string, boolean>> { return {}; }
  async upsert(_c: string, _p: VectorPoint[]): Promise<void> {}
  async scroll(): Promise<ScoredPoint[]> { return []; }
  async health(): Promise<boolean> { return true; }
  async stats(): Promise<Array<{ name: string; exists: boolean; points: number }>> { return []; }
  close(): void {}
}

const rule = (id: string, stack: string[]): ScoredPoint => ({
  id,
  score: 0,
  payload: { content: `rule ${id}`, chunk_type: "decision", status: "approved-common", stack },
});

test("global rules: top candidates are stack-mismatched, matching rules sit lower → section is filled with top-N MATCHING", async () => {
  // The top GLOBAL_RULE_LIMIT candidates are all python-only (mismatch for a
  // typescript project); enough typescript-matching rules sit below them.
  const ranked: ScoredPoint[] = [];
  for (let i = 0; i < GLOBAL_RULE_LIMIT; i++) ranked.push(rule(`py-${i}`, ["python"]));
  for (let i = 0; i < GLOBAL_RULE_LIMIT; i++) ranked.push(rule(`ts-${i}`, ["typescript"]));
  const store = new RankedStore(ranked);

  const hits = await selectGlobalRules(store, "dev-rules", [], ["typescript"]);

  // filter-then-limit: section is FILLED with the display count, all matching,
  // highest-ranked matching first — none of the mismatched top candidates leak.
  assert.equal(hits.length, GLOBAL_RULE_LIMIT, "section is filled, not under-filled");
  assert.deepEqual(
    hits.map((h) => h.id),
    Array.from({ length: GLOBAL_RULE_LIMIT }, (_, i) => `ts-${i}`),
    "returns the top-N matching rules in rank order",
  );
  assert.ok(hits.every((h) => h.id.startsWith("ts-")), "no stack-mismatched rule leaks through");
});

test("global rules: only APPROVED rows are recalled; pending/rejected global rows are excluded", async () => {
  // A candidate pool mixing each status. Only `approved-common` rows may surface;
  // `pending` and `rejected` (and any other non-approved status) are inert and
  // must NOT be recalled even though they carry a recallable scope/stack.
  const approved = (id: string): ScoredPoint => ({
    id,
    score: 0,
    payload: { content: `rule ${id}`, chunk_type: "decision", status: "approved-common", stack: ["any"] },
  });
  const withStatus = (id: string, status: string): ScoredPoint => ({
    id,
    score: 0,
    payload: { content: `rule ${id}`, chunk_type: "decision", status, stack: ["any"] },
  });
  const ranked: ScoredPoint[] = [
    withStatus("pending-top", "pending"),
    approved("approved-1"),
    withStatus("rejected-mid", "rejected"),
    approved("approved-2"),
  ];
  const store = new RankedStore(ranked);

  const hits = await selectGlobalRules(store, "dev-rules", [], ["typescript"]);

  assert.deepEqual(
    hits.map((h) => h.id),
    ["approved-1", "approved-2"],
    "only approved-common rows are recalled, in rank order",
  );
  assert.ok(
    !hits.some((h) => h.id === "pending-top" || h.id === "rejected-mid"),
    "pending/rejected global rows are excluded from recall",
  );
});

test("global rules: untagged rules count as 'any' and are recalled; candidate fetch stays bounded", async () => {
  const ranked = [rule("any-0", ["any"]), rule("untagged", [])];
  // untagged → treated as "any" by stripping the empty stack so the default applies.
  ranked[1] = { id: "untagged", score: 0, payload: { content: "u", chunk_type: "decision", status: "approved-common" } };
  const store = new RankedStore(ranked);

  const hits = await selectGlobalRules(store, "dev-rules", [], ["typescript"]);

  assert.deepEqual(hits.map((h) => h.id), ["any-0", "untagged"]);
  // bounded fetch: never asks the store for an unbounded candidate set.
  assert.ok(store.maxLimitRequested <= GLOBAL_RULE_LIMIT * 10, "candidate fetch is bounded");
  assert.ok(store.maxLimitRequested > GLOBAL_RULE_LIMIT, "fetches more candidates than it displays");
});
