// Original — no upstream.
import { expect, test } from "vitest";

import {
  createBaseInputSchema,
  createBaseOutputSchema,
  MAX_CONTENT_LENGTH,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

function paramsForPath(
  result: ReturnType<typeof createBaseInputSchema.safeParse>,
  field: string,
): Record<string, unknown> | undefined {
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.path[0] === field);
  return (issue as { params?: Record<string, unknown> } | undefined)?.params;
}

// =====================================================================
// Happy paths
// =====================================================================

test("happy: minimal required input parses OK", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "New item",
  });
  expect(r.success).toBe(true);
});

test("happy: with all optional fields", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "New item",
    content: "Body text",
    view: "All",
    vault: "Work",
  });
  expect(r.success).toBe(true);
});

test("happy: extension case-insensitivity (.BASE accepted)", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.BASE",
    name: "New item",
  });
  expect(r.success).toBe(true);
});

// =====================================================================
// path sub-discriminators
// =====================================================================

test("INVALID_BASE_PATH/empty: empty path", () => {
  const r = createBaseInputSchema.safeParse({ path: "", name: "x" });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "empty",
    field: "path",
    value_length: 0,
  });
});

test("INVALID_BASE_PATH/too-long: 1001-char path", () => {
  const longPath = "a".repeat(1001 - ".base".length) + ".base";
  const r = createBaseInputSchema.safeParse({ path: longPath, name: "x" });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "too-long",
    field: "path",
    value_length: 1001,
  });
});

test("INVALID_BASE_PATH/wrong-extension: .md", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.md",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "wrong-extension",
  });
});

test("INVALID_BASE_PATH/path-traversal: ../escape.base", () => {
  const r = createBaseInputSchema.safeParse({
    path: "../escape.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: leading slash", () => {
  const r = createBaseInputSchema.safeParse({
    path: "/etc/secrets.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "path")).toMatchObject({
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: drive letter prefix", () => {
  const r = createBaseInputSchema.safeParse({
    path: "C:\\Users\\secrets.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "path")).toMatchObject({
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: control char", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active\x00.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "path")).toMatchObject({
    reason: "path-traversal",
  });
});

// =====================================================================
// name sub-discriminators
// =====================================================================

test("INVALID_NAME/empty: empty name", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "name")).toMatchObject({
    code: "INVALID_NAME",
    reason: "empty",
    field: "name",
    value_length: 0,
  });
});

test("INVALID_NAME/too-long: 1001-char name", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "n".repeat(1001),
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "name")).toMatchObject({
    code: "INVALID_NAME",
    reason: "too-long",
    field: "name",
    value_length: 1001,
  });
});

// =====================================================================
// content size limit
// =====================================================================

test("CONTENT_TOO_LARGE: content over limit", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "x",
    content: "x".repeat(MAX_CONTENT_LENGTH + 1),
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "content")).toMatchObject({
    code: "CONTENT_TOO_LARGE",
    field: "content",
    value_length: MAX_CONTENT_LENGTH + 1,
    limit: MAX_CONTENT_LENGTH,
  });
});

test("content exactly at limit accepted", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "x",
    content: "x".repeat(MAX_CONTENT_LENGTH),
  });
  expect(r.success).toBe(true);
});

// =====================================================================
// Strict mode
// =====================================================================

test("strict mode: unknown top-level key rejected", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "x",
    surprise: "x",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some(
        (i) => i.code === "unrecognized_keys" || i.path.includes("surprise"),
      ),
    ).toBe(true);
  }
});

test("vault min-length: empty vault string rejected", () => {
  const r = createBaseInputSchema.safeParse({
    path: "Indexes/Active.base",
    name: "x",
    vault: "",
  });
  expect(r.success).toBe(false);
});

// =====================================================================
// Output schema
// =====================================================================

test("output: valid envelope accepted", () => {
  const r = createBaseOutputSchema.safeParse({
    path: "Indexes/Active/New item.md",
    name: "New item.md",
  });
  expect(r.success).toBe(true);
});

// =====================================================================
// JSON Schema round-trip
// =====================================================================

test("toMcpInputSchema emits expected shape", () => {
  const json = toMcpInputSchema(createBaseInputSchema) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  const props = json.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual(["content", "name", "path", "vault", "view"]);
  expect(json.required).toEqual(["path", "name"]);
});
