// Original — no upstream. Tests for the shared Bases invalid-yaml pattern (spec 081 FR-011): the moved literal is byte-identical, matches YAML parser complaints, ignores other Bases reports and is stateless.
import { describe, expect, it } from "vitest";

import { INVALID_YAML_PATTERN } from "./_base-malformed.js";

describe("INVALID_YAML_PATTERN", () => {
  it("keeps query_base's original source and flags (byte-identical move)", () => {
    const original =
      /\b(yaml(?:exception)?|yaml\s+parse|invalid\s+yaml|unexpected\s+token\s+at\s+line|sufficiently\s+indented|flow\s+(?:sequence|mapping)|block\s+(?:mapping|collection|sequence)|(?:bad|deficient)\s+indentation|duplicated\s+mapping\s+key|could\s+not\s+find\s+expected|mapping\s+values\s+are\s+not\s+allowed|tab\s+characters\s+must\s+not\s+be\s+used)\b/i;
    expect(INVALID_YAML_PATTERN.source).toBe(original.source);
    expect(INVALID_YAML_PATTERN.flags).toBe(original.flags);
  });

  it.each([
    "Flow sequence in block collection must be sufficiently indented and end with a ]",
    "YAMLException: bad indentation of a mapping entry",
    "duplicated mapping key",
  ])("matches the YAML parser complaint %j", (text) => {
    expect(INVALID_YAML_PATTERN.test(text)).toBe(true);
  });

  it.each([
    "No views defined",
    "missing required key: views",
    "Active file is not a base file",
    "All\ttable",
    "Error: something unrelated",
  ])("does not match %j", (text) => {
    expect(INVALID_YAML_PATTERN.test(text)).toBe(false);
  });

  it("is stateless across consecutive .test calls", () => {
    const text = "YAMLException: bad indentation of a mapping entry";
    expect(INVALID_YAML_PATTERN.test(text)).toBe(true);
    expect(INVALID_YAML_PATTERN.test(text)).toBe(true);
  });
});
