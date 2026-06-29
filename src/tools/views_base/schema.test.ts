// Original — no upstream.
import { expect, test } from "vitest";

import { viewsBaseInputSchema, viewsBaseOutputSchema } from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

function firstParams(r: ReturnType<typeof viewsBaseInputSchema.safeParse>): Record<string, unknown> | undefined {
  if (r.success) return undefined;
  const issue = r.error.issues.find((i) => (i as { params?: unknown }).params !== undefined);
  return (issue as { params?: Record<string, unknown> } | undefined)?.params;
}

test("happy: empty input parses OK (open-Base mode)", () => {
  const r = viewsBaseInputSchema.safeParse({});
  expect(r.success).toBe(true);
});

test("happy: with optional vault", () => {
  const r = viewsBaseInputSchema.safeParse({ vault: "Work" });
  expect(r.success).toBe(true);
});

test("happy: with optional base_path (.base)", () => {
  const r = viewsBaseInputSchema.safeParse({ base_path: "Folder/Tasks.base" });
  expect(r.success).toBe(true);
});

test("happy: base_path + vault together", () => {
  const r = viewsBaseInputSchema.safeParse({ base_path: "Tasks.base", vault: "Work" });
  expect(r.success).toBe(true);
});

test("base_path is optional: omitting it parses (selects open-Base mode)", () => {
  const r = viewsBaseInputSchema.safeParse({ vault: "Work" });
  expect(r.success).toBe(true);
});

test("INVALID_BASE_PATH/empty: empty base_path rejected", () => {
  const r = viewsBaseInputSchema.safeParse({ base_path: "" });
  expect(r.success).toBe(false);
  const p = firstParams(r);
  expect(p?.code).toBe("INVALID_BASE_PATH");
  expect(p?.reason).toBe("empty");
});

test("INVALID_BASE_PATH/too-long: base_path over 1000 units rejected", () => {
  const r = viewsBaseInputSchema.safeParse({ base_path: "a".repeat(1001) + ".base" });
  expect(r.success).toBe(false);
  const p = firstParams(r);
  expect(p?.code).toBe("INVALID_BASE_PATH");
  expect(p?.reason).toBe("too-long");
});

test("INVALID_BASE_PATH/path-traversal: traversal shape rejected", () => {
  const r = viewsBaseInputSchema.safeParse({ base_path: "../secrets.base" });
  expect(r.success).toBe(false);
  const p = firstParams(r);
  expect(p?.code).toBe("INVALID_BASE_PATH");
  expect(p?.reason).toBe("path-traversal");
});

test("INVALID_BASE_PATH/wrong-extension: non-.base path rejected", () => {
  const r = viewsBaseInputSchema.safeParse({ base_path: "Notes/Daily.md" });
  expect(r.success).toBe(false);
  const p = firstParams(r);
  expect(p?.code).toBe("INVALID_BASE_PATH");
  expect(p?.reason).toBe("wrong-extension");
});

test("strict mode: unknown top-level key rejected", () => {
  const r = viewsBaseInputSchema.safeParse({ surprise: "x" });
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
  const r = viewsBaseInputSchema.safeParse({ vault: "" });
  expect(r.success).toBe(false);
});

test("output: valid envelope accepted", () => {
  const r = viewsBaseOutputSchema.safeParse({ views: ["All", "Active"], count: 2 });
  expect(r.success).toBe(true);
});

test("output: empty list accepted", () => {
  const r = viewsBaseOutputSchema.safeParse({ views: [], count: 0 });
  expect(r.success).toBe(true);
});

test("output: count mismatch rejected (refine fires)", () => {
  const r = viewsBaseOutputSchema.safeParse({ views: ["All"], count: 5 });
  expect(r.success).toBe(false);
});

test("toMcpInputSchema emits expected shape with vault + base_path", () => {
  const json = toMcpInputSchema(viewsBaseInputSchema) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  const props = json.properties as Record<string, unknown>;
  expect(Object.keys(props)).toEqual(["vault", "base_path"]);
});
