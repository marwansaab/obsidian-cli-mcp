// Original — no upstream. find_by_property input/output schemas — flat z.object (no target_mode discriminator per FR-002); polymorphic value union for type-faithful matching; folder-traversal regex per Q2/FR-021; cross-field superRefine rejecting array value when array_match:true. Spec 073: family-aligned keys name / array_match / case_sensitive, with deprecated aliases property / arrayMatch / caseSensitive folded by the transform (old+new rejected; deprecated_parameters notice).
import { z } from "zod";

import {
  appendAliasConflictIssue,
  collectDeprecatedParameters,
  deprecatedAlias,
  deprecatedParametersField,
  type ParameterRename,
} from "../_deprecated-params.js";
import { focusedVaultField } from "../_vault-field.js";

export const FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/;

const scalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const PROPERTY_RENAME: ParameterRename = { old: "property", replacement: "name" };
const ARRAY_MATCH_RENAME: ParameterRename = { old: "arrayMatch", replacement: "array_match" };
const CASE_SENSITIVE_RENAME: ParameterRename = { old: "caseSensitive", replacement: "case_sensitive" };

export const FIND_BY_PROPERTY_RENAMES: readonly ParameterRename[] = [
  PROPERTY_RENAME,
  ARRAY_MATCH_RENAME,
  CASE_SENSITIVE_RENAME,
];

export const findByPropertyInputSchema = z
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
  })
  .superRefine((input, ctx) => {
    for (const rename of FIND_BY_PROPERTY_RENAMES) appendAliasConflictIssue(ctx, input, rename);
    if (input.name === undefined && input.property === undefined) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "name is required" });
    }
    const arrayMatch = input.array_match ?? input.arrayMatch ?? true;
    if (Array.isArray(input.value) && arrayMatch) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          "value cannot be an array when array_match is true (default); pass a scalar for contains semantics, or set array_match: false for exact-equality.",
      });
    }
  })
  .transform((v) => {
    const deprecated_parameters = collectDeprecatedParameters(v, FIND_BY_PROPERTY_RENAMES);
    return {
      ...(v.vault !== undefined && { vault: v.vault }),
      // superRefine guarantees one of the two is present.
      name: (v.name ?? v.property)!,
      value: v.value,
      ...(v.folder !== undefined && { folder: v.folder }),
      array_match: v.array_match ?? v.arrayMatch ?? true,
      case_sensitive: v.case_sensitive ?? v.caseSensitive ?? true,
      ...(deprecated_parameters !== undefined && { deprecated_parameters }),
    };
  });

export const findByPropertyOutputSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
    deprecated_parameters: deprecatedParametersField,
  });

export type FindByPropertyInput = z.infer<typeof findByPropertyInputSchema>;
export type FindByPropertyOutput = z.infer<typeof findByPropertyOutputSchema>;
