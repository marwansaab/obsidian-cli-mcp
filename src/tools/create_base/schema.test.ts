// Original — no upstream.
import { expect, test } from "vitest";
import { z } from "zod";

import { CREATE_BASE_RENAMES, createBaseInputSchema, createBaseOutputSchema, MAX_CONTENT_LENGTH } from "./schema.js";
import { BASE_PATH_DESCRIPTION } from "../_base-path.js";
import { deprecatedAliasCases } from "../_deprecated-params-test-cases.js";
import { messageForPath } from "../_schema-test-utils.js";

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
    base_path: "Indexes/Active.base",
    name: "New item",
  });
  expect(r.success).toBe(true);
});

test("happy: with all optional fields", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
    name: "New item",
    content: "Body text",
    view_name: "All",
    vault: "Work",
  });
  expect(r.success).toBe(true);
});

test("happy: extension case-insensitivity (.BASE accepted)", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "Indexes/Active.BASE",
    name: "New item",
  });
  expect(r.success).toBe(true);
});

// =====================================================================
// base_path sub-discriminators
// =====================================================================

test("INVALID_BASE_PATH/empty: empty path", () => {
  const r = createBaseInputSchema.safeParse({ base_path: "", name: "x" });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "empty",
    field: "base_path",
    value_length: 0,
  });
});

test("INVALID_BASE_PATH/too-long: 1001-char path", () => {
  const longPath = "a".repeat(1001 - ".base".length) + ".base";
  const r = createBaseInputSchema.safeParse({ base_path: longPath, name: "x" });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "too-long",
    field: "base_path",
    value_length: 1001,
  });
});

test("INVALID_BASE_PATH/wrong-extension: .md", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "Indexes/Active.md",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "wrong-extension",
  });
});

test("INVALID_BASE_PATH/path-traversal: ../escape.base", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "../escape.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    code: "INVALID_BASE_PATH",
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: leading slash", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "/etc/secrets.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: drive letter prefix", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "C:\\Users\\secrets.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "path-traversal",
  });
});

test("INVALID_BASE_PATH/path-traversal: control char", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "Indexes/Active\x00.base",
    name: "x",
  });
  expect(r.success).toBe(false);
  expect(paramsForPath(r, "base_path")).toMatchObject({
    reason: "path-traversal",
  });
});

// =====================================================================
// name sub-discriminators
// =====================================================================

test("INVALID_NAME/empty: empty name", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
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
    base_path: "Indexes/Active.base",
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
    base_path: "Indexes/Active.base",
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
    base_path: "Indexes/Active.base",
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
    base_path: "Indexes/Active.base",
    name: "x",
    surprise: "x",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some((i) => i.code === "unrecognized_keys" || i.path.includes("surprise")),
    ).toBe(true);
  }
});

test("vault min-length: empty vault string rejected", () => {
  const r = createBaseInputSchema.safeParse({
    base_path: "Indexes/Active.base",
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

test("z.toJSONSchema emits expected shape", () => {
  const json = z.toJSONSchema(createBaseInputSchema, { io: "input", target: "draft-2020-12" }) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  const props = json.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual(["base_path", "content", "name", "path", "vault", "view", "view_name"]);
  expect(json.required).toEqual(["name"]);
});

// =====================================================================
// BI-067 FR-010 — custom error-callback message parity (M1 migration).
// zod 4 SILENTLY ignores the v3 required/invalid-type message params,
// so these exact-string assertions are the only guard against a
// silent message regression on the migrated fields.
// =====================================================================

test("BI-067 FR-010 / spec 073 O5: missing base_path (and path) yields exact required message", () => {
  const r = createBaseInputSchema.safeParse({ name: "x" });
  expect(r.success).toBe(false);
  expect(messageForPath(r, "base_path")).toBe("base_path is required");
});

test("BI-067 FR-010: non-string base_path yields exact type message", () => {
  const r = createBaseInputSchema.safeParse({ base_path: 42, name: "x" });
  expect(r.success).toBe(false);
  expect(messageForPath(r, "base_path")).toBe("base_path must be a string");
});

test("BI-067 FR-010: missing name yields exact required message", () => {
  const r = createBaseInputSchema.safeParse({ base_path: "Indexes/Active.base" });
  expect(r.success).toBe(false);
  expect(messageForPath(r, "name")).toBe("name is required");
});

test("BI-067 FR-010: non-string name yields exact type message", () => {
  const r = createBaseInputSchema.safeParse({ base_path: "Indexes/Active.base", name: 42 });
  expect(r.success).toBe(false);
  expect(messageForPath(r, "name")).toBe("name must be a string");
});

// =====================================================================
// Spec 073 — base_path / view_name with deprecated aliases path / view
// =====================================================================

test("spec 073 O1: new names normalise with no notice", () => {
  const parsed = createBaseInputSchema.parse({ base_path: "Tasks.base", name: "x", view_name: "All" });
  expect(parsed).toEqual({ base_path: "Tasks.base", name: "x", view_name: "All" });
});

const aliasCases = deprecatedAliasCases(
  CREATE_BASE_RENAMES,
  { base_path: "Tasks.base", name: "x", content: "c", vault: "W", view_name: "All" },
  { base_path: "Tasks.base", view_name: "All" },
);

test.each(aliasCases.equivalence)("spec 073 O2: $old parses like its replacement, plus the notice", ({ viaOld, viaNew, notice }) => {
  expect(createBaseInputSchema.parse(viaOld)).toEqual({ ...createBaseInputSchema.parse(viaNew), deprecated_parameters: [notice] });
});

test.each(aliasCases.conflict)("spec 073 O4: $old alongside its replacement → one conflict issue at [old]", ({ input, issue }) => {
  const r = createBaseInputSchema.safeParse(input);
  expect(r.success).toBe(false);
  expect(r.error?.issues).toEqual([expect.objectContaining(issue)]);
});

test("spec 073 O4: view alongside a different view_name is rejected too", () => {
  const r = createBaseInputSchema.safeParse({ base_path: "Tasks.base", name: "x", view_name: "All", view: "Other" });
  expect(r.error?.issues).toEqual([expect.objectContaining({ path: ["view"] })]);
});

test("spec 073 O6: deprecated path with a wrong extension → INVALID_BASE_PATH naming base_path", () => {
  const r = createBaseInputSchema.safeParse({ path: "x.md", name: "x" });
  expect(r.error?.issues).toEqual([
    expect.objectContaining({
      path: ["base_path"],
      message: "INVALID_BASE_PATH/wrong-extension: base_path must end with .base",
      params: { code: "INVALID_BASE_PATH", reason: "wrong-extension", field: "base_path", value: "x.md" },
    }),
  ]);
});

test("spec 073 O6: deprecated path with a non-string value names base_path in the message", () => {
  const r = createBaseInputSchema.safeParse({ path: 42, name: "x" });
  expect(r.error?.issues[0]?.message).toBe("base_path must be a string");
});

test("spec 073: published JSON Schema — descriptions and deprecated aliases", () => {
  const json = createBaseInputSchema["~standard"].jsonSchema.input({ target: "draft-2020-12" });
  const props = json["properties"] as Record<string, Record<string, unknown>>;
  expect(props["base_path"]!["description"]).toBe(`${BASE_PATH_DESCRIPTION} Required (or the deprecated path).`);
  expect(props["view_name"]!["description"]).toBe(
    "Exact, case-sensitive name of the view to create the item in (as listed by views_base). Not checked by the CLI; omit for the default.",
  );
  expect(props["path"]).toMatchObject({
    deprecated: true,
    description: "Deprecated: use base_path (accepted until the next major release).",
  });
  expect(props["view"]).toMatchObject({
    deprecated: true,
    description: "Deprecated: use view_name (accepted until the next major release).",
  });
});
