// Original — no upstream. query_base input/output/wire-envelope schemas — boundary validation per Constitution Principle III; strict mode rejects unknown top-level keys; refinements attach `params: { code, reason, field, value_length? }` to each custom issue per ADR-015 sub-discrimination convention (callers programmatically branch on `issue.params.code`); shared with handler via `z.infer`; no parallel TypeScript interfaces.
import { z } from "zod";

import { appendBasePathIssues, BASE_PATH_MAX } from "../_base-path.js";

const VIEW_NAME_MAX = 1000;
const RESPONSE_ROW_CAP = 1000;

export const queryBaseInputSchema = z
  .object({
    base_path: z.string({
      required_error: "base_path is required",
      invalid_type_error: "base_path must be a string",
    }),
    view_name: z.string({
      required_error: "view_name is required",
      invalid_type_error: "view_name must be a string",
    }),
    vault: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (typeof v.base_path === "string") appendBasePathIssues(ctx, v.base_path, "base_path");

    if (typeof v.view_name === "string") {
      const value_length = v.view_name.length;
      if (value_length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["view_name"],
          message: "INVALID_VIEW_NAME/empty: view_name is empty",
          params: {
            code: "INVALID_VIEW_NAME",
            reason: "empty",
            field: "view_name",
            value_length,
          },
        });
      } else if (value_length > VIEW_NAME_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["view_name"],
          message: `INVALID_VIEW_NAME/too-long: view_name exceeds ${VIEW_NAME_MAX} UTF-16 code units`,
          params: {
            code: "INVALID_VIEW_NAME",
            reason: "too-long",
            field: "view_name",
            value_length,
          },
        });
      }
    }
  })
  .describe(
    // BI-041 FR-006 / FR-007 / FR-008 — response-shape contract reconciled to live
    // upstream emission captured by T0 probes (specs/041-reconcile-cohort-doc-drift/
    // research.md Task 5 + contracts/query_base-doc-shape.md). Brittle-string claims
    // below are guarded by schema.test.ts assertions per Principle III.
    [
      "Query a named view from an Obsidian Bases (.base) file and return its matched rows.",
      "",
      "Response shape: { columns: string[], rows: object[], truncated: boolean, total_rows?: number }.",
      "",
      "Empty-view columns (FR-006): When a view matches zero rows, `columns` carries only `[\"path\"]` —",
      "the wrapper has no signal for view-declared column names absent row data, and does NOT parse the",
      "`.base` YAML client-side to enumerate them (out-of-scope per BI-041). Agents writing parsing code",
      "MUST handle the zero-row case without assuming the full column set.",
      "",
      "Type-preservation passthrough (FR-007): Frontmatter values are stringified by upstream regardless",
      "of their declared YAML type. The wrapper is passthrough — it does NOT coerce back to native JSON",
      "types. An integer YAML frontmatter value `count: 42` surfaces in the response as the string `\"42\"`.",
      "A boolean `done: true` surfaces as `\"true\"`. Agents must parse the string value if numeric or",
      "boolean semantics are required.",
      "",
      "`file.*` column-name emission (FR-008): Source-property column names declared as `file.X` are emitted",
      "by upstream as the display label `\"file X\"` (with embedded space) — including `file.path` → `\"file path\"`",
      "and `file.name` → `\"file name\"`. The wrapper does NOT remap these display labels back to YAML",
      "segment names (out-of-scope per BI-041). Independent of the view's column declarations, the wrapper",
      "always injects a reserved `path` column at index 0 of every row carrying the source note's",
      "vault-relative path. A view declaring `file.path` and `file.name` therefore produces three columns:",
      "`[\"path\", \"file path\", \"file name\"]` — the wrapper's reserved locator plus both display labels.",
      "Agents indexing rows by column name MUST use the exact emitted string, including the embedded space.",
    ].join("\n"),
  );

export const queryBaseRowSchema = z.record(z.string(), z.unknown());

export const queryBaseOutputSchema = z
  .object({
    columns: z.array(z.string().min(1)),
    rows: z.array(queryBaseRowSchema).max(RESPONSE_ROW_CAP),
    truncated: z.boolean(),
    total_rows: z.number().int().min(RESPONSE_ROW_CAP + 1).optional(),
  })
  .strict()
  .refine(
    (o) => (o.truncated === true) === (o.total_rows !== undefined),
    "total_rows must be present iff truncated === true",
  );

export const queryBaseWireSchema = z.array(queryBaseRowSchema);

export type QueryBaseInput = z.infer<typeof queryBaseInputSchema>;
export type QueryBaseOutput = z.infer<typeof queryBaseOutputSchema>;
export type QueryBaseRow = z.infer<typeof queryBaseRowSchema>;
export type QueryBaseWire = z.infer<typeof queryBaseWireSchema>;

export const QUERY_BASE_RESPONSE_ROW_CAP = RESPONSE_ROW_CAP;
export const QUERY_BASE_BASE_PATH_MAX = BASE_PATH_MAX;
export const QUERY_BASE_VIEW_NAME_MAX = VIEW_NAME_MAX;
