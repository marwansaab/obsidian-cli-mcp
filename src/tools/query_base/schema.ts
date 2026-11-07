// Original — no upstream. query_base input/output/wire-envelope schemas — boundary validation per Constitution Principle III; strict mode rejects unknown top-level keys; refinements attach `params: { code, reason, field, value_length? }` to each custom issue per ADR-015 sub-discrimination convention (callers programmatically branch on `issue.params.code`); shared with handler via `z.infer`; no parallel TypeScript interfaces.
import { z } from "zod";

import { appendBasePathIssues, BASE_PATH_DESCRIPTION, BASE_PATH_MAX } from "../_base-path.js";
import { requiredString } from "../_required-string.js";
import { focusedVaultField } from "../_vault-field.js";

const VIEW_NAME_MAX = 1000;
const RESPONSE_ROW_CAP = 1000;

export const queryBaseInputSchema = z
  .strictObject({
    base_path: requiredString("base_path").describe(BASE_PATH_DESCRIPTION),
    view_name: requiredString("view_name").describe(
      "Exact, case-sensitive name of the view to run (as listed by views_base), 1..1000 chars.",
    ),
    vault: focusedVaultField,
  })
  .superRefine((v, ctx) => {
    if (typeof v.base_path === "string") appendBasePathIssues(ctx, v.base_path, "base_path");

    if (typeof v.view_name === "string") {
      const value_length = v.view_name.length;
      if (value_length === 0) {
        ctx.addIssue({
          code: "custom",
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
          code: "custom",
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
      "Response shape: { columns: string[], rows: object[], truncated: boolean, total_rows?: number, group_by?: { property, direction } }.",
      "",
      "Grouped views: Obsidian's base:query ignores a view's groupBy, so for a view grouped by a property the",
      "wrapper reads each row's group value from Obsidian and returns the rows in Obsidian's group order (rows keep",
      "their view order within a group, and the group of rows whose value is missing or null comes last). Each row then carries a",
      "reserved `group` key after `path` holding its group value as a string, or null for that last group, and",
      "`group_by` names the grouping. A view column also named `group` moves to `group_view`. A grouping the wrapper",
      "cannot match (a custom group order, a formula, a file property other than folder, ext, tags, ctime or mtime) fails",
      "with GROUPING_UNSUPPORTED. An ungrouped view's response has no `group_by` and no `group`.",
      "",
      'Empty-view columns: When a view matches zero rows, `columns` carries only `["path"]` (and `"group"` for a grouped view) —',
      "the wrapper has no signal for view-declared column names absent row data, and does NOT parse the",
      "`.base` YAML client-side to enumerate them. Agents writing parsing code",
      "MUST handle the zero-row case without assuming the full column set.",
      "",
      "Type-preservation passthrough: Frontmatter values are stringified by upstream regardless",
      "of their declared YAML type. The wrapper is passthrough — it does NOT coerce back to native JSON",
      'types. An integer YAML frontmatter value `count: 42` surfaces in the response as the string `"42"`.',
      'A boolean `done: true` surfaces as `"true"`. Agents must parse the string value if numeric or',
      "boolean semantics are required.",
      "",
      "`file.*` column-name emission: Source-property column names declared as `file.X` are emitted",
      'by upstream as the display label `"file X"` (with embedded space) — including `file.path` → `"file path"`',
      'and `file.name` → `"file name"`. The wrapper does NOT remap these display labels back to YAML',
      "segment names. Independent of the view's column declarations, the wrapper",
      "always injects a reserved `path` column at index 0 of every row carrying the source note's",
      "vault-relative path. A view declaring `file.path` and `file.name` therefore produces three columns:",
      '`["path", "file path", "file name"]` — the wrapper\'s reserved locator plus both display labels.',
      "Agents indexing rows by column name MUST use the exact emitted string, including the embedded space.",
    ].join("\n"),
  );

export const queryBaseRowSchema = z.record(z.string(), z.unknown());

export const queryBaseGroupBySchema = z
  .strictObject({
    property: z.string().min(1).describe("The property the view groups by, as the view declares it."),
    direction: z.enum(["ASC", "DESC"]).describe("The view's group order."),
  })
  .describe(
    "Present only for a view grouped by a property: rows then come in Obsidian's group order, and each row's `group` holds its group value as a string (`null` for the group of rows without a value).",
  );

export const queryBaseOutputSchema = z
  .strictObject({
    columns: z.array(z.string().min(1)),
    rows: z.array(queryBaseRowSchema).max(RESPONSE_ROW_CAP),
    truncated: z.boolean(),
    total_rows: z
      .number()
      .int()
      .min(RESPONSE_ROW_CAP + 1)
      .optional(),
    group_by: queryBaseGroupBySchema.optional(),
  })
  .refine(
    (o) => (o.truncated === true) === (o.total_rows !== undefined),
    "total_rows must be present iff truncated === true",
  );

export const queryBaseWireSchema = z.array(queryBaseRowSchema);

// BI-0207: one row's group value as the group-value eval templates report it (see _template.ts for the forms).
const groupValueObjectSchema = z.union([
  z.strictObject({ s: z.string() }),
  z.strictObject({ n: z.number() }),
  z.strictObject({ b: z.boolean() }),
  z.strictObject({ d: z.number(), t: z.boolean(), s: z.string(), o: z.number() }),
  z.strictObject({ l: z.string(), y: z.string().nullable(), r: z.string().nullable() }),
  z.strictObject({
    get a() {
      return z.array(groupListElementSchema);
    },
  }),
  z.strictObject({ u: z.string() }),
]);
export const queryBaseGroupValueSchema = groupValueObjectSchema.nullable();
const groupListElementSchema = z.strictObject({
  get v(): typeof queryBaseGroupValueSchema {
    return queryBaseGroupValueSchema;
  },
  w: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

/** The group-value eval's answer: the Obsidian collator's locale and one value per requested path, in order. */
export const queryBaseGroupValuesSchema = z.strictObject({
  locale: z.string().min(1),
  values: z.array(queryBaseGroupValueSchema),
});

export type QueryBaseInput = z.infer<typeof queryBaseInputSchema>;
export type QueryBaseOutput = z.infer<typeof queryBaseOutputSchema>;
export type QueryBaseRow = z.infer<typeof queryBaseRowSchema>;
export type QueryBaseWire = z.infer<typeof queryBaseWireSchema>;
export type QueryBaseGroupBy = z.infer<typeof queryBaseGroupBySchema>;
export type QueryBaseGroupValue = z.infer<typeof queryBaseGroupValueSchema>;
export type QueryBaseGroupListElement = z.infer<typeof groupListElementSchema>;

export const QUERY_BASE_RESPONSE_ROW_CAP = RESPONSE_ROW_CAP;
export const QUERY_BASE_BASE_PATH_MAX = BASE_PATH_MAX;
export const QUERY_BASE_VIEW_NAME_MAX = VIEW_NAME_MAX;
