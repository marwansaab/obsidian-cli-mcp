// Original — no upstream. Shared zod discriminated-union schema primitives for target_mode (ADR-003 / BI-029) plus the companion published-JSON-Schema export (feature 007 / FR-002).
import { z } from "zod";

import { toMcpInputSchema } from "../tools/_shared.js";

const FORBIDDEN_KEYS_IN_ACTIVE = ["vault", "file", "path"] as const;

function refineSpecificBranch(input: unknown, ctx: z.RefinementCtx): void {
  const record = input as { file?: unknown; path?: unknown };
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
}

function refineActiveBranch(input: unknown, ctx: z.RefinementCtx): void {
  const record = input as Record<string, unknown>;
  for (const key of FORBIDDEN_KEYS_IN_ACTIVE) {
    if (Object.hasOwn(record, key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is not allowed in active mode`,
      });
    }
  }
}

export const targetModeSpecificBaseSchema = z
  .object({
    target_mode: z.literal("specific"),
    vault: z.string().min(1),
    file: z.string().optional(),
    path: z.string().optional(),
  })
  .passthrough();

export function applyTargetModeSpecificRefinement<T extends z.AnyZodObject>(
  schema: T,
): z.ZodEffects<T> {
  return schema.superRefine(refineSpecificBranch);
}

export const targetModeSpecificSchema = applyTargetModeSpecificRefinement(
  targetModeSpecificBaseSchema,
);

export type TargetModeSpecific = z.infer<typeof targetModeSpecificSchema>;

export const targetModeActiveBaseSchema = z
  .object({ target_mode: z.literal("active") })
  .passthrough();

export function applyTargetModeActiveRefinement<T extends z.AnyZodObject>(
  schema: T,
): z.ZodEffects<T> {
  return schema.superRefine(refineActiveBranch);
}

export const targetModeActiveSchema = applyTargetModeActiveRefinement(targetModeActiveBaseSchema);

export type TargetModeActive = z.infer<typeof targetModeActiveSchema>;

// zod 3.x's z.discriminatedUnion requires ZodObject branches — it reads
// .shape[discriminator] during construction, which ZodEffects lacks. Apply the
// per-branch refinements via a union-level superRefine dispatcher rather than
// per-branch wrapping. Pattern (b) consumers must follow the same idiom: extend
// the BASE schemas, build a discriminated union over the extended bases, then
// dispatch to the per-branch refinement bodies via union-level superRefine.
const targetModeBaseUnion = z.discriminatedUnion("target_mode", [
  targetModeSpecificBaseSchema,
  targetModeActiveBaseSchema,
]);

export const targetModeSchema = targetModeBaseUnion.superRefine((input, ctx) => {
  if (input.target_mode === "specific") {
    refineSpecificBranch(input, ctx);
  } else {
    refineActiveBranch(input, ctx);
  }
});

export type TargetMode = z.infer<typeof targetModeSchema>;

// Companion JSON Schema export — feature 007 / FR-002. Renders targetModeSchema
// through the envelope helper so the published descriptor has top-level
// `type: "object"` (the MCP `Tool` definition's binding constraint) while still
// exposing the two-branch shape via nested `oneOf` per Clarifications 2026-05-06
// Q1 / FR-002a. Every consumer that re-exports targetModeSchema as its tool's
// input schema (today: read_note; tomorrow: read_heading et al.) imports this
// companion instead of running zodToJsonSchema themselves.
export const targetModeJsonSchema = toMcpInputSchema(targetModeSchema);
