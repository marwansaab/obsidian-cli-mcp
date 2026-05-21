// Original — no upstream. query_base input/output/wire-envelope schemas — boundary validation per Constitution Principle III; strict mode rejects unknown top-level keys; refinements attach `params: { code, reason, field, value_length? }` to each custom issue per ADR-015 sub-discrimination convention (callers programmatically branch on `issue.params.code`); shared with handler via `z.infer`; no parallel TypeScript interfaces.
import { z } from "zod";

import { isStructurallySafePath } from "../../path-safety/schema.js";

const BASE_PATH_MAX = 1000;
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
    if (typeof v.base_path === "string") {
      const value_length = v.base_path.length;
      if (value_length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["base_path"],
          message: "INVALID_BASE_PATH/empty: base_path is empty",
          params: {
            code: "INVALID_BASE_PATH",
            reason: "empty",
            field: "base_path",
            value_length,
          },
        });
      } else if (value_length > BASE_PATH_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["base_path"],
          message: `INVALID_BASE_PATH/too-long: base_path exceeds ${BASE_PATH_MAX} UTF-16 code units`,
          params: {
            code: "INVALID_BASE_PATH",
            reason: "too-long",
            field: "base_path",
            value_length,
          },
        });
      } else {
        if (!isStructurallySafePath(v.base_path)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["base_path"],
            message: "INVALID_BASE_PATH/path-traversal: base_path contains path-traversal shapes",
            params: {
              code: "INVALID_BASE_PATH",
              reason: "path-traversal",
              field: "base_path",
              value: v.base_path,
            },
          });
        } else if (!/\.base$/i.test(v.base_path)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["base_path"],
            message: "INVALID_BASE_PATH/wrong-extension: base_path must end with .base",
            params: {
              code: "INVALID_BASE_PATH",
              reason: "wrong-extension",
              field: "base_path",
              value: v.base_path,
            },
          });
        }
      }
    }

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
  });

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
