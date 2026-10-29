// Original — no upstream. Tests for the default-off opt-in environment flag parser (068 research R4).
import { describe, expect, it } from "vitest";

import { envFlagEnabled } from "./env-flags.js";

describe("envFlagEnabled — default-off opt-in parser (068 research R4)", () => {
  it.each(["1", "true", "yes", "on", "TRUE", " On ", "\tyes\n", "YES"])("truthy: %j → true", (v) => {
    expect(envFlagEnabled(v)).toBe(true);
  });

  it.each(["0", "false", "no", "off", "", "   ", "2", "enabled", "y", "t", "1 1"])("falsy: %j → false", (v) => {
    expect(envFlagEnabled(v)).toBe(false);
  });

  it("unset → false", () => {
    expect(envFlagEnabled(undefined)).toBe(false);
  });
});
