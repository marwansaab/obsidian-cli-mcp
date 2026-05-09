// Original — no upstream. find_by_property input/output schemas — flat z.object (no target_mode discriminator per FR-002); polymorphic value union for type-faithful matching; folder-traversal regex per Q2/FR-021; cross-field superRefine rejecting array value when arrayMatch:true.
import { z } from "zod";

export const FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/;

const scalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const findByPropertyInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    property: z.string().min(1),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(scalarValueSchema),
    ]),
    folder: z
      .string()
      .refine(
        (v) => !FOLDER_TRAVERSAL_REGEX.test(v),
        "folder must not contain '..' segments or start with '/' or '\\' (path-traversal escape)",
      )
      .optional(),
    arrayMatch: z.boolean().optional().default(true),
    caseSensitive: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Array.isArray(input.value) && input.arrayMatch === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message:
          "value cannot be an array when arrayMatch is true (default); pass a scalar for contains semantics, or set arrayMatch: false for exact-equality.",
      });
    }
  });

export const findByPropertyOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  })
  .strict();

export type FindByPropertyInput = z.infer<typeof findByPropertyInputSchema>;
export type FindByPropertyOutput = z.infer<typeof findByPropertyOutputSchema>;
