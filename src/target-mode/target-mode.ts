// Original — no upstream. Flat z.object zod primitive for target_mode (ADR-003 amended 2026-05-07 / BI-029).
import { z } from "zod";

const FORBIDDEN_KEYS_IN_ACTIVE = ["vault", "file", "path"] as const;

export const targetModeBaseSchema = z
  .object({
    target_mode: z.enum(["specific", "active"]),
    vault: z.string().min(1).optional(),
    file: z.string().optional(),
    path: z.string().optional(),
  })
  .strict();

export function applyTargetModeRefinement<
  T extends z.ZodObject<z.ZodRawShape, z.UnknownKeysParam>,
>(schema: T): z.ZodEffects<T> {
  return schema.superRefine((input, ctx) => {
    const record = input as Record<string, unknown>;
    if (record.target_mode === "specific") {
      if (record.vault === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vault"],
          message: "vault is required in specific mode",
        });
      }
      const hasFile = record.file !== undefined;
      const hasPath = record.path !== undefined;
      if (!hasFile && !hasPath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [],
          message: "exactly one of `file` or `path` must be provided in specific mode (got neither)",
        });
      } else if (hasFile && hasPath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["file"],
          message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["path"],
          message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
        });
      }
    } else {
      for (const key of FORBIDDEN_KEYS_IN_ACTIVE) {
        // Explicit-undefined is treated as "not provided" — semantically equivalent
        // to the absent-key case, matching pre-010 .passthrough() behaviour where
        // zod stripped undefined-valued passthrough keys before refinement ran.
        if (Object.hasOwn(record, key) && record[key] !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is not allowed in active mode`,
          });
        }
      }
    }
  });
}

export const targetModeSchema = applyTargetModeRefinement(targetModeBaseSchema);

export type TargetMode = z.infer<typeof targetModeSchema>;
