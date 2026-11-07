// Original — no upstream. Tests for the shared eval batch planner (BI-0207 PR #158 review): same-key items share a tuple, batches stay within EVAL_BATCH_CODE_MAX, order is kept, and an oversized single item still gets its own batch.
import { describe, expect, it } from "vitest";

import { EVAL_BATCH_CODE_MAX, planEvalBatches, type EvalBatch } from "./_eval-batches.js";

const code = (batch: EvalBatch<string>): string => JSON.stringify(batch);
const entry = (path: string): [string, string] => {
  const slash = path.indexOf("/");
  return [path.slice(0, slash), path.slice(slash + 1)];
};

describe("planEvalBatches", () => {
  it("plans no batch for no items", () => {
    expect(planEvalBatches([], entry, code)).toEqual([]);
  });

  it("joins consecutive items with the same key into one tuple", () => {
    expect(planEvalBatches(["a/1", "a/2", "b/3", "a/4"], entry, code)).toEqual([
      [
        ["a", ["1", "2"]],
        ["b", ["3"]],
        ["a", ["4"]],
      ],
    ]);
  });

  it("keeps every batch within the limit and every item in order", () => {
    const items = Array.from({ length: 400 }, (_, i) => `folder ${i % 4}/note number ${i}`);
    const batches = planEvalBatches(items, entry, code);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(code(b).length).toBeLessThanOrEqual(EVAL_BATCH_CODE_MAX);
    expect(batches.flatMap((b) => b.flatMap(([k, vs]) => vs.map((v) => `${k}/${v}`)))).toEqual(items);
  });

  it("gives an item longer than the limit a batch of its own", () => {
    const long = `x/${"y".repeat(EVAL_BATCH_CODE_MAX)}`;
    expect(planEvalBatches(["x/a", long, "x/b"], entry, code)).toEqual([[["x", ["a"]]], [["x", [long.slice(2)]]], [["x", ["b"]]]]);
  });
});
