// Original — no upstream. Tests for the shared Bases malformed-report helpers (spec 081 FR-011): the invalid-yaml pattern matches YAML parser complaints, ignores other Bases reports and is stateless; upstreamReport joins the trimmed channels.
import { describe, expect, it } from "vitest";

import { INVALID_YAML_PATTERN, upstreamReport } from "./_base-malformed.js";

describe("INVALID_YAML_PATTERN", () => {
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

describe("upstreamReport", () => {
  it.each([
    [" err \n", " out \n", "err\nout"],
    ["err", "  ", "err"],
    ["", "out\n", "out"],
    [" ", "\n", ""],
  ])("upstreamReport(%j, %j) → %j", (stderr, stdout, expected) => {
    expect(upstreamReport(stderr, stdout)).toBe(expected);
  });
});
