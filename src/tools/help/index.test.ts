// Original — no upstream. Co-located tests for the help tool's registered surface — descriptor + handler exercised via the registerTool wrapper.
import { describe, expect, it } from "vitest";

import { createHelpTool, HELP_DESCRIPTION, HELP_TOOL_NAME } from "./index.js";

describe("createHelpTool", () => {
  it("publishes the verb-led top-level description verbatim (FR-016, SC-003)", () => {
    const tool = createHelpTool();
    expect(tool.descriptor.name).toBe(HELP_TOOL_NAME);
    expect(tool.descriptor.description).toBe(HELP_DESCRIPTION);
    expect(HELP_DESCRIPTION).toContain("help(");
    expect(HELP_DESCRIPTION).toContain('tool_name: "help"');
  });

  it("publishes a stripped inputSchema with type === 'object' at the top and no nested descriptions (FR-002, FR-006)", () => {
    const tool = createHelpTool();
    const inputSchema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(inputSchema.type).toBe("object");
    expect(hasNestedDescription(inputSchema)).toBe(false);
    const props = inputSchema.properties as Record<string, unknown> | undefined;
    expect(props).toBeTruthy();
    expect(props!.tool_name).toBeTruthy();
  });

  it("HELP_TOOL_NOT_FOUND surfaces through the SDK error-response shape (FR-011 round-trip)", async () => {
    const tool = createHelpTool();
    const result = (await tool.handler({ tool_name: "definitely_not_a_real_tool_xyz" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("HELP_TOOL_NOT_FOUND");
    expect(Array.isArray(payload.details.availableTools)).toBe(true);
    expect(payload.details.requestedName).toBe("definitely_not_a_real_tool_xyz");
  });

  it("VALIDATION_ERROR surfaces for invalid input (ZodError → registerTool wrapper)", async () => {
    const tool = createHelpTool();
    const result = (await tool.handler({ tool_name: "" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("help");
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
