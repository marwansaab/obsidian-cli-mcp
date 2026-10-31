// Original — no upstream. create_base input/output schemas; spec 073 aligned names base_path / view_name with deprecated aliases path / view, folded onto the new names before the new-name schema validates.
import { z } from "zod";

import { appendBasePathIssues, BASE_PATH_DESCRIPTION } from "../_base-path.js";
import { deprecatedAlias, deprecatedParametersField, foldDeprecatedAliases } from "../_deprecated-params.js";
import { requiredString } from "../_required-string.js";

const NAME_MAX = 1000;
export const MAX_CONTENT_LENGTH = 3072;

const PATH_RENAME = { old: "path", replacement: "base_path" } as const;
const VIEW_RENAME = { old: "view", replacement: "view_name" } as const;

export const CREATE_BASE_RENAMES = [PATH_RENAME, VIEW_RENAME] as const;

/** The published input: both names for each renamed concept, so `base_path` is optional here. */
const createBaseArgsSchema = z.strictObject({
  base_path: requiredString("base_path")
    .optional()
    .describe(`${BASE_PATH_DESCRIPTION} Required (or the deprecated path).`),
  path: deprecatedAlias(requiredString("base_path"), PATH_RENAME),
  name: requiredString("name").describe(
    "Name of the new item, 1..1000 chars; becomes the Markdown file name (auto-incremented on collision).",
  ),
  content: z
    .string()
    .optional()
    .describe(`Body text of the new item, up to ${MAX_CONTENT_LENGTH} UTF-16 code units. Default: none.`),
  view_name: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Exact, case-sensitive name of the view to create the item in (as listed by views_base). Not checked by the CLI; omit for the default.",
    ),
  view: deprecatedAlias(z.string().min(1), VIEW_RENAME),
  vault: z
    .string()
    .min(1)
    .optional()
    .describe("Obsidian vault display name. Accepted for parity but currently ignored by the CLI."),
});

/** The input after the fold: new names only, with `base_path` required again. */
const createBaseFoldedSchema = createBaseArgsSchema
  .omit({ path: true, view: true })
  .extend({ base_path: requiredString("base_path"), deprecated_parameters: deprecatedParametersField })
  .superRefine((v, ctx) => {
    appendBasePathIssues(ctx, v.base_path, "base_path");

    if (typeof v.name === "string") {
      const value_length = v.name.length;
      if (value_length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: "INVALID_NAME/empty: name is empty",
          params: {
            code: "INVALID_NAME",
            reason: "empty",
            field: "name",
            value_length,
          },
        });
      } else if (value_length > NAME_MAX) {
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: `INVALID_NAME/too-long: name exceeds ${NAME_MAX} UTF-16 code units`,
          params: {
            code: "INVALID_NAME",
            reason: "too-long",
            field: "name",
            value_length,
          },
        });
      }
    }

    if (typeof v.content === "string" && v.content.length > MAX_CONTENT_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["content"],
        message: `CONTENT_TOO_LARGE: content exceeds ${MAX_CONTENT_LENGTH} UTF-16 code units`,
        params: {
          code: "CONTENT_TOO_LARGE",
          field: "content",
          value_length: v.content.length,
          limit: MAX_CONTENT_LENGTH,
        },
      });
    }
  });

export const createBaseInputSchema = createBaseArgsSchema
  .transform(foldDeprecatedAliases(CREATE_BASE_RENAMES))
  .pipe(createBaseFoldedSchema);

export const createBaseOutputSchema = z.strictObject({
  path: z.string(),
  name: z.string(),
  deprecated_parameters: deprecatedParametersField,
});

export type CreateBaseInput = z.infer<typeof createBaseInputSchema>;
export type CreateBaseOutput = z.infer<typeof createBaseOutputSchema>;
