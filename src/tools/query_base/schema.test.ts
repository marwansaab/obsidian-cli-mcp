// Original — no upstream. query_base schema tests — full validation-error cohort: base_path length/extension/traversal sub-states, view_name length sub-states, unknown-key strict rejection, output schema envelope refine, wire schema shape.
import { expect, test } from "vitest";

import {
  queryBaseInputSchema,
  queryBaseOutputSchema,
  queryBaseWireSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

function paramsForPath(
  result: ReturnType<typeof queryBaseInputSchema.safeParse>,
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
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    view_name: "Open",
  });
  expect(r.success).toBe(true);
});

test("happy: with optional vault", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    view_name: "Open",
    vault: "Work",
  });
  expect(r.success).toBe(true);
});

test("happy: extension case-insensitivity (.BASE accepted)", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.BASE",
    view_name: "Open",
  });
  expect(r.success).toBe(true);
});

test("happy: extension case-insensitivity (.Base accepted)", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.Base",
    view_name: "Open",
  });
  expect(r.success).toBe(true);
});

// =====================================================================
// base_path sub-discriminators
// =====================================================================

test("INVALID_BASE_PATH/empty: empty base_path → params.reason='empty'", () => {
  const r = queryBaseInputSchema.safeParse({ base_path: "", view_name: "X" });
  expect(r.success).toBe(false);
  const params = paramsForPath(r, "base_path");
  expect(params).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "empty",
    field: "base_path",
    value_length: 0,
  });
});

test("INVALID_BASE_PATH/too-long: 1001-char base_path → params.reason='too-long'", () => {
  const longPath = "a".repeat(1001 - ".base".length) + ".base";
  const r = queryBaseInputSchema.safeParse({
    base_path: longPath,
    view_name: "X",
  });
  expect(r.success).toBe(false);
  const params = paramsForPath(r, "base_path");
  expect(params).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "too-long",
    field: "base_path",
    value_length: 1001,
  });
});

test("INVALID_BASE_PATH/wrong-extension: .md → params.reason='wrong-extension'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.md",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  const params = paramsForPath(r, "base_path");
  expect(params).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "wrong-extension",
  });
});

test("INVALID_BASE_PATH/wrong-extension: .txt → params.reason='wrong-extension'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.txt",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "wrong-extension",
  });
});

test("INVALID_BASE_PATH/wrong-extension: no extension → params.reason='wrong-extension'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "wrong-extension",
  });
});

test("INVALID_BASE_PATH/wrong-extension: .base.bak → params.reason='wrong-extension'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base.bak",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "wrong-extension",
  });
});

test("INVALID_BASE_PATH/path-traversal: ../escape.base → params.reason='path-traversal'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "../escape.base",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: leading slash → params.reason='path-traversal'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "/etc/secrets.base",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: leading backslash → params.reason='path-traversal'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "\\Windows\\secrets.base",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: drive letter prefix → params.reason='path-traversal'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "C:\\Users\\secrets.base",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: control char → params.reason='path-traversal'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active\x00.base",
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "path-traversal",
  });
});

// =====================================================================
// view_name sub-discriminators
// =====================================================================

test("INVALID_VIEW_NAME/empty: empty view_name → params.reason='empty'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    view_name: "",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "view_name")).toMatchObject({
    code: "INVALID_VIEW_NAME",
    reason: "empty",
    field: "view_name",
    value_length: 0,
  });
});

test("INVALID_VIEW_NAME/too-long: 1001-char view_name → params.reason='too-long'", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    view_name: "v".repeat(1001),
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "view_name")).toMatchObject({
    code: "INVALID_VIEW_NAME",
    reason: "too-long",
    field: "view_name",
    value_length: 1001,
  });
});

// =====================================================================
// Standard Zod failures
// =====================================================================

test("strict mode: unknown top-level key rejected", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    view_name: "Open",
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

test("missing base_path → Zod invalid_type, path=['base_path']", () => {
  const r = queryBaseInputSchema.safeParse({ view_name: "Open" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path[0] === "base_path")).toBe(true);
  }
});

test("missing view_name → Zod invalid_type, path=['view_name']", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path[0] === "view_name")).toBe(true);
  }
});

test("non-string base_path → Zod invalid_type", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: 42,
    view_name: "Open",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    const issue = r.error.issues.find((i) => i.path[0] === "base_path")!;
    expect(issue.code).toBe("invalid_type");
  }
});

test("non-string view_name → Zod invalid_type", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    view_name: ["Open"],
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    const issue = r.error.issues.find((i) => i.path[0] === "view_name")!;
    expect(issue.code).toBe("invalid_type");
  }
});

test("empty vault string → fail", () => {
  const r = queryBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    view_name: "Open",
    vault: "",
  });
  expect(r.success).toBe(false);
});

// =====================================================================
// Output schema
// =====================================================================

test("output: untruncated envelope without total_rows accepted", () => {
  const r = queryBaseOutputSchema.safeParse({
    columns: ["path", "status"],
    rows: [{ path: "x.md", status: "open" }],
    truncated: false,
  });
  expect(r.success).toBe(true);
});

test("output: truncated envelope with total_rows accepted", () => {
  const r = queryBaseOutputSchema.safeParse({
    columns: ["path"],
    rows: Array.from({ length: 1000 }, (_, i) => ({ path: `${i}.md` })),
    truncated: true,
    total_rows: 4527,
  });
  expect(r.success).toBe(true);
});

test("output: truncated=true without total_rows rejected (refine fires)", () => {
  const r = queryBaseOutputSchema.safeParse({
    columns: ["path"],
    rows: [{ path: "x.md" }],
    truncated: true,
  });
  expect(r.success).toBe(false);
});

test("output: truncated=false with total_rows rejected", () => {
  const r = queryBaseOutputSchema.safeParse({
    columns: ["path"],
    rows: [{ path: "x.md" }],
    truncated: false,
    total_rows: 1500,
  });
  expect(r.success).toBe(false);
});

test("output: rows.length > 1000 rejected at array max", () => {
  const r = queryBaseOutputSchema.safeParse({
    columns: ["path"],
    rows: Array.from({ length: 1001 }, (_, i) => ({ path: `${i}.md` })),
    truncated: true,
    total_rows: 1001,
  });
  expect(r.success).toBe(false);
});

test("output: total_rows must be >= 1001", () => {
  const r = queryBaseOutputSchema.safeParse({
    columns: ["path"],
    rows: [],
    truncated: true,
    total_rows: 999,
  });
  expect(r.success).toBe(false);
});

// =====================================================================
// Wire envelope schema
// =====================================================================

test("wire: empty array accepted", () => {
  const r = queryBaseWireSchema.safeParse([]);
  expect(r.success).toBe(true);
});

test("wire: array of row objects accepted", () => {
  const r = queryBaseWireSchema.safeParse([
    { path: "x.md", status: "open", priority: 1 },
    { path: "y.md", status: "closed", priority: 2 },
  ]);
  expect(r.success).toBe(true);
});

test("wire: non-array stdout rejected", () => {
  const r = queryBaseWireSchema.safeParse({ rows: [] });
  expect(r.success).toBe(false);
});

// =====================================================================
// JSON Schema round-trip
// =====================================================================

test("toMcpInputSchema emits additionalProperties:false + expected property set", () => {
  const json = toMcpInputSchema(queryBaseInputSchema) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  const props = json.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual(["base_path", "vault", "view_name"]);
  expect(json.required).toEqual(["base_path", "view_name"]);
});
