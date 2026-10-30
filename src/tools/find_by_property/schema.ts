// Original — no upstream. find_by_property input/output schemas — flat z.object (no target_mode discriminator per FR-002); polymorphic value union for type-faithful matching; folder-traversal regex per Q2/FR-021; cross-field superRefine rejecting array value when arrayMatch:true.
import { z } from "zod";

import { focusedVaultField } from "../_vault-field.js";

export const FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/;

const scalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const findByPropertyInputSchema = z
  .strictObject({
    vault: focusedVaultField,
    property: z.string().min(1).describe('Frontmatter property name to match, exactly (e.g. "status").'),
    value: z
      .union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(scalarValueSchema),
      ])
      .describe("Value to match: string, number, boolean, null, or an array of scalars; compared type-faithfully (7 is not \"7\")."),
    folder: z
      .string()
      .refine(
        (v) => !FOLDER_TRAVERSAL_REGEX.test(v),
        "folder must not contain '..' segments or start with '/' or '\\' (path-traversal escape)",
      )
      .optional()
      .describe("Vault-relative folder to search under, no leading slash or '..'. Default: the whole vault."),
    arrayMatch: z
      .boolean()
      .optional()
      .default(true)
      .describe("For list properties: true matches when the list contains value; false requires an exact, ordered array match. Default true."),
    caseSensitive: z.boolean().optional().default(true).describe("Compare string values case-sensitively. Default true."),
  })
  .superRefine((input, ctx) => {
    if (Array.isArray(input.value) && input.arrayMatch === true) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          "value cannot be an array when arrayMatch is true (default); pass a scalar for contains semantics, or set arrayMatch: false for exact-equality.",
      });
    }
  });

export const findByPropertyOutputSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  });

export type FindByPropertyInput = z.infer<typeof findByPropertyInputSchema>;
export type FindByPropertyOutput = z.infer<typeof findByPropertyOutputSchema>;
