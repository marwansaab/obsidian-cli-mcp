// Original — no upstream. Co-located tests for the shared required-string field builder
// (BI-067 / PR #78 review). The per-tool FR-010 suites (create_base, query_base) pin the
// published messages on the real input schemas; these cases pin the builder's contract
// directly so the counted module stays covered.
import { expect, test } from "vitest";
import { z } from "zod";

import { requiredString } from "./_required-string.js";

const schema = z.strictObject({ sample: requiredString("sample") });

test("missing key yields '<field> is required'", () => {
  const r = schema.safeParse({});
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.message).toBe("sample is required");
  }
});

test("non-string value yields '<field> must be a string'", () => {
  const r = schema.safeParse({ sample: 42 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.message).toBe("sample must be a string");
  }
});

test("string value parses and round-trips", () => {
  const r = schema.safeParse({ sample: "ok" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.sample).toBe("ok");
  }
});
