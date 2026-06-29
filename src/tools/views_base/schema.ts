// Original — no upstream. views_base input/output schemas — boundary validation per Constitution Principle III; strict mode rejects unknown top-level keys. `base_path` is the OPTIONAL vault-relative `.base` locator (present ⇒ name a specific Base; absent ⇒ the Base focused in Obsidian); its INVALID_BASE_PATH sub-issues are byte-for-byte the `query_base.base_path` contract (empty / too-long / path-traversal / wrong-extension), attaching `params: { code, reason, field, value_length? }` per the ADR-015 sub-discrimination convention so callers branch on `issue.params.code`. Shared with the handler via `z.infer`; no parallel TypeScript interfaces.
import { z } from "zod";

import { isStructurallySafePath } from "../../path-safety/schema.js";

const BASE_PATH_MAX = 1000;

export const viewsBaseInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    // Optional vault-relative `.base` locator. Omitted ⇒ open-Base active mode
    // (lists the views of the focused Base). Present ⇒ named-Base mode (focus the
    // named `.base`, then list its views), overriding whatever is focused.
    base_path: z.string().optional(),
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
      } else if (!isStructurallySafePath(v.base_path)) {
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
  });

export const viewsBaseOutputSchema = z
  .object({
    views: z.array(z.string()),
    count: z.number().int().min(0),
  })
  .strict()
  .refine((o) => o.count === o.views.length, "count must equal views.length");

export type ViewsBaseInput = z.infer<typeof viewsBaseInputSchema>;
export type ViewsBaseOutput = z.infer<typeof viewsBaseOutputSchema>;

// Discriminated eval-envelope wire format for the named-Base focus step (cohort
// parity with open_file's openEvalResponseSchema). The frozen FOCUS_BASE_TEMPLATE
// returns `{ok:true, opened}` after focusing the named `.base`, or
// `{ok:false, code:"FILE_NOT_FOUND"}` when no file exists at the locator (the
// handler remaps that to BASE_NOT_FOUND/named-missing — never leaked). This is an
// internal handoff envelope, not the tool's published surface, so it does NOT
// affect the input fingerprint.
export const focusBaseEvalResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), opened: z.string() }).strict(),
  z.object({ ok: z.literal(false), code: z.literal("FILE_NOT_FOUND") }).strict(),
]);
export type FocusBaseEvalResponse = z.infer<typeof focusBaseEvalResponseSchema>;

export const VIEWS_BASE_BASE_PATH_MAX = BASE_PATH_MAX;
