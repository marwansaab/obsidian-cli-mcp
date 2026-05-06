// Original — no upstream. Co-located vitest cases for the help MCP tool registration (FR-006 + FR-016 + Story 1 AC#5 + Story 3 AC#3 + FR-011).
import { describe, expect, it } from "vitest";

import { registerHelpTool, HELP_DESCRIPTION, HELP_TOOL_NAME } from "./tool.js";

describe("registerHelpTool", () => {
  it("publishes a verb-led top-level description that mentions help() invocation (Story 3 AC#3, FR-016, SC-003)", () => {
    const tool = registerHelpTool();
    expect(tool.descriptor.name).toBe(HELP_TOOL_NAME);
    expect(tool.descriptor.description).toBe(HELP_DESCRIPTION);
    expect(HELP_DESCRIPTION.length).toBeGreaterThan(0);
    expect(HELP_DESCRIPTION).toContain("help(");
    expect(HELP_DESCRIPTION).toContain('tool_name: "help"');
  });

  it("publishes a stripped inputSchema with no description keys at any depth (Story 1 AC#5, FR-006, SC-002)", () => {
    const tool = registerHelpTool();
    const inputSchema = tool.descriptor.inputSchema;
    expect(hasNestedDescription(inputSchema)).toBe(false);
    // Sanity: the structural key for the optional tool_name field is present.
    const props = (inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(props).toBeTruthy();
    expect(props!.tool_name).toBeTruthy();
  });

  it("rejects HELP_TOOL_NOT_FOUND through the SDK error-response shape (FR-011 round-trip)", async () => {
    const tool = registerHelpTool();
    const result = (await tool.handler({ tool_name: "definitely_not_a_real_tool_xyz" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("HELP_TOOL_NOT_FOUND");
    expect(Array.isArray(payload.details.availableTools)).toBe(true);
    expect(payload.details.availableTools.length).toBeGreaterThan(0);
    expect(payload.details.requestedName).toBe("definitely_not_a_real_tool_xyz");
  });
});

function hasNestedDescription(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const obj = node as Record<string, unknown>;
  for (const child of Object.values(obj.properties ?? {}) as unknown[]) {
    if (typeof child === "object" && child !== null && "description" in (child as object)) return true;
    if (hasNestedDescription(child)) return true;
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = obj[key];
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        if (typeof branch === "object" && branch !== null && "description" in (branch as object)) return true;
        if (hasNestedDescription(branch)) return true;
      }
    }
  }
  if (obj.items) {
    const items = Array.isArray(obj.items) ? obj.items : [obj.items];
    for (const item of items) {
      if (typeof item === "object" && item !== null && "description" in (item as object)) return true;
      if (hasNestedDescription(item)) return true;
    }
  }
  if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
    if ("description" in (obj.additionalProperties as object)) return true;
    if (hasNestedDescription(obj.additionalProperties)) return true;
  }
  return false;
}
