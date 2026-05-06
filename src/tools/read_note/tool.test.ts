// Original — no upstream. Tests for the read_note MCP tool registration (FR-008/FR-009/FR-011/FR-013, Story 6).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect, vi } from "vitest";

import { registerReadNoteTool, READ_NOTE_TOOL_NAME, READ_NOTE_DESCRIPTION } from "./tool.js";
import { createQueue } from "../../queue.js";

import type { Logger } from "../../logger.js";

function makeStubLogger(): Logger {
  return {
    callStart: vi.fn(),
    callEndSuccess: vi.fn(),
    callEndFailure: vi.fn(),
    shutdown: vi.fn(),
  } as unknown as Logger;
}

function findDescriptionKeys(node: unknown, found: string[] = []): string[] {
  if (typeof node !== "object" || node === null) return found;
  const obj = node as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, "description")) {
    found.push("description");
  }
  for (const child of Object.values(obj.properties ?? {}) as unknown[]) {
    findDescriptionKeys(child, found);
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = obj[key];
    if (Array.isArray(branches)) {
      for (const branch of branches) findDescriptionKeys(branch, found);
    }
  }
  if (obj.items) {
    const items = Array.isArray(obj.items) ? obj.items : [obj.items];
    for (const item of items) findDescriptionKeys(item, found);
  }
  if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
    findDescriptionKeys(obj.additionalProperties, found);
  }
  return found;
}

test("registerReadNoteTool returns descriptor with name 'read_note'", () => {
  const tool = registerReadNoteTool({ logger: makeStubLogger(), queue: createQueue() });
  expect(tool.descriptor.name).toBe(READ_NOTE_TOOL_NAME);
  expect(tool.descriptor.name).toBe("read_note");
});

test("descriptor.inputSchema has zero description keys at any depth (Story 6 AC#1, FR-008)", () => {
  const tool = registerReadNoteTool({ logger: makeStubLogger(), queue: createQueue() });
  // Walk descendants of the schema root; the strip preserves the root description but
  // strips every nested one. read_note's schema has no descriptions at any level today,
  // but this assertion guards against a future amendment that adds them.
  const root = tool.descriptor.inputSchema as Record<string, unknown>;
  const childContainers: unknown[] = [];
  for (const child of Object.values(root.properties ?? {}) as unknown[]) childContainers.push(child);
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = root[key];
    if (Array.isArray(branches)) for (const b of branches) childContainers.push(b);
  }
  if (root.items) {
    const items = Array.isArray(root.items) ? root.items : [root.items];
    for (const item of items) childContainers.push(item);
  }
  if (root.additionalProperties && typeof root.additionalProperties === "object") {
    childContainers.push(root.additionalProperties);
  }
  const found: string[] = [];
  for (const c of childContainers) findDescriptionKeys(c, found);
  expect(found).toHaveLength(0);
});

test("descriptor.description contains 'help' (case-insensitive) and 'read_note' (case-sensitive); sane length (Story 6 AC#2)", () => {
  const tool = registerReadNoteTool({ logger: makeStubLogger(), queue: createQueue() });
  const desc = tool.descriptor.description;
  expect(desc).toBe(READ_NOTE_DESCRIPTION);
  expect(desc.length).toBeGreaterThan(0);
  expect(desc.toLowerCase()).toContain("help");
  expect(desc).toContain("read_note");
  expect(desc.length).toBeGreaterThan(100);
  expect(desc.length).toBeLessThan(500);
});

test("registered handler returns VALIDATION_ERROR envelope for malformed input (end-to-end Story 4)", async () => {
  const tool = registerReadNoteTool({ logger: makeStubLogger(), queue: createQueue() });
  const result = (await tool.handler({})) as { isError: true; content: { type: string; text: string }[] };
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0]!.text) as {
    code: string;
    message: string;
    details: { issues: { path: (string | number)[]; message: string; code: string }[] };
  };
  expect(payload.code).toBe("VALIDATION_ERROR");
  expect(payload.message).toContain("read_note");
  const targetModeMentioned = payload.details.issues.some((i) =>
    i.path.some((p) => String(p).includes("target_mode")),
  );
  expect(targetModeMentioned).toBe(true);
});

test("docs/tools/read_note.md is non-stub AND covers all error codes + both branch examples (FR-011, FR-013(e), Story 6 AC#3, P7)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const docPath = resolve(here, "..", "..", "..", "docs", "tools", "read_note.md");
  const body = readFileSync(docPath, "utf8");

  // Stub-marker absence (FR-011 last paragraph; P7).
  expect(body).not.toContain("<!-- TODO(BI-003)");

  // Sanity floor against accidental truncation.
  expect(body.length).toBeGreaterThan(500);

  // Overview anchor.
  expect(body).toContain("Read a note");

  // One example per branch (Story 6 AC#3 "≥1 example per branch").
  expect(body).toContain('read_note({ target_mode: "specific"');
  expect(body).toContain('read_note({ target_mode: "active"');

  // Both specific-branch locator forms documented.
  expect(body).toContain("file=");
  expect(body).toContain("path=");

  // Full propagated-codes roster (Story 6 AC#3 "the propagated error codes").
  for (const code of [
    "VALIDATION_ERROR",
    "CLI_NON_ZERO_EXIT",
    "CLI_REPORTED_ERROR",
    "ERR_NO_ACTIVE_FILE",
    "CLI_BINARY_NOT_FOUND",
  ]) {
    expect(body).toContain(code);
  }
});
