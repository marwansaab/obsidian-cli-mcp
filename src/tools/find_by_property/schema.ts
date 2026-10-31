// Original — no upstream. find_by_property input/output schemas — flat z.object (no target_mode discriminator per FR-002); polymorphic value union for type-faithful matching; folder-traversal regex per Q2/FR-021; cross-field superRefine rejecting array value when array_match:true. Spec 073: family-aligned keys name / array_match / case_sensitive, with deprecated aliases property / arrayMatch / caseSensitive folded onto the new names before the new-name schema validates (old+new rejected; deprecated_parameters notice).
import { z } from "zod";

import { deprecatedAlias, deprecatedParametersField, foldDeprecatedAliases } from "../_deprecated-params.js";
import { requiredString } from "../_required-string.js";
import { focusedVaultField } from "../_vault-field.js";

export const FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/;

const scalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const PROPERTY_RENAME = { old: "property", replacement: "name" } as const;
const ARRAY_MATCH_RENAME = { old: "arrayMatch", replacement: "array_match" } as const;
const CASE_SENSITIVE_RENAME = { old: "caseSensitive", replacement: "case_sensitive" } as const;

export const FIND_BY_PROPERTY_RENAMES = [PROPERTY_RENAME, ARRAY_MATCH_RENAME, CASE_SENSITIVE_RENAME] as const;

/** The published input: both names for each renamed concept, with no defaults on the new booleans. */
const findByPropertyArgsSchema = z
  .strictObject({
    vault: focusedVaultField,
    name: z
      .string()
      .min(1)
      .optional()
      .describe('Frontmatter property name to match, matched exactly (e.g. "status"). Required (or the deprecated property).'),
    property: deprecatedAlias(z.string().min(1), PROPERTY_RENAME),
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
    array_match: z
      .boolean()
      .optional()
      .describe("For list properties: true matches when the list contains value; false requires an exact, ordered array match. Default true."),
    arrayMatch: deprecatedAlias(z.boolean(), ARRAY_MATCH_RENAME),
    case_sensitive: z.boolean().optional().describe("Match case exactly when true. Default true."),
    caseSensitive: deprecatedAlias(z.boolean(), CASE_SENSITIVE_RENAME),
  });

/** The input after the fold: new names only, `name` required again and today's defaults applied. */
const findByPropertyFoldedSchema = findByPropertyArgsSchema
  .omit({ property: true, arrayMatch: true, caseSensitive: true })
  .extend({
    name: requiredString("name").min(1),
    array_match: z.boolean().default(true),
    case_sensitive: z.boolean().default(true),
    deprecated_parameters: deprecatedParametersField,
  })
  .superRefine((input, ctx) => {
    if (Array.isArray(input.value) && input.array_match) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          "value cannot be an array when array_match is true (default); pass a scalar for contains semantics, or set array_match: false for exact-equality.",
      });
    }
  });

export const findByPropertyInputSchema = findByPropertyArgsSchema
  .transform(foldDeprecatedAliases(FIND_BY_PROPERTY_RENAMES))
  .pipe(findByPropertyFoldedSchema);

export const findByPropertyOutputSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
    deprecated_parameters: deprecatedParametersField,
  });

export type FindByPropertyInput = z.infer<typeof findByPropertyInputSchema>;
export type FindByPropertyOutput = z.infer<typeof findByPropertyOutputSchema>;
