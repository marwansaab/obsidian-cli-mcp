// Original — no upstream. Co-located vitest cases for the help input schema (FR-017 + C1 remediation).
import { describe, it, expect } from "vitest";

import { helpInputSchema } from "./schema.js";

describe("helpInputSchema", () => {
  it("parses successfully when tool_name is omitted (Story 2 AC#2, FR-007)", () => {
    const result = helpInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool_name).toBeUndefined();
    }
  });

  it("parses successfully with a non-empty tool_name (Story 2 AC#1, FR-007)", () => {
    const result = helpInputSchema.safeParse({ tool_name: "obsidian_exec" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool_name).toBe("obsidian_exec");
    }
  });

  it("rejects an empty-string tool_name with path: ['tool_name'] (Q1, Edge Case help({tool_name:''}), FR-007)", () => {
    const result = helpInputSchema.safeParse({ tool_name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("tool_name"));
      expect(issue).toBeTruthy();
      expect(issue!.code).toBe("too_small");
    }
  });

  it("rejects non-string tool_name with code 'invalid_type' and path: ['tool_name'] (Story 2 AC#6, remediation C1)", () => {
    const malformedInputs: unknown[] = [42, null, true, [], { wrong: "shape" }];
    for (const malformed of malformedInputs) {
      const result = helpInputSchema.safeParse({ tool_name: malformed });
      expect(result.success, `expected failure for tool_name=${JSON.stringify(malformed)}`).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("tool_name"));
        expect(issue, `expected an issue path including 'tool_name' for ${JSON.stringify(malformed)}`).toBeTruthy();
        expect(issue!.code).toBe("invalid_type");
      }
    }
  });
});
