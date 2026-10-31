// Original — no upstream. create_base input/output schemas; spec 073 aligned names base_path / view_name with deprecated aliases path / view.
import { z } from "zod";

import { appendBasePathIssues, BASE_PATH_DESCRIPTION } from "../_base-path.js";
import {
  appendAliasConflictIssue,
  collectDeprecatedParameters,
  deprecatedAlias,
  deprecatedParametersField,
  type ParameterRename,
} from "../_deprecated-params.js";
import { requiredString } from "../_required-string.js";

const NAME_MAX = 1000;
export const MAX_CONTENT_LENGTH = 3072;

const PATH_RENAME: ParameterRename = { old: "path", replacement: "base_path" };
const VIEW_RENAME: ParameterRename = { old: "view", replacement: "view_name" };

export const CREATE_BASE_RENAMES: readonly ParameterRename[] = [PATH_RENAME, VIEW_RENAME];

export const createBaseInputSchema = z
  .strictObject({
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
  })
  .superRefine((v, ctx) => {
    for (const rename of CREATE_BASE_RENAMES) appendAliasConflictIssue(ctx, v, rename);

    const basePath = v.base_path ?? v.path;
    if (basePath === undefined) {
      ctx.addIssue({ code: "custom", path: ["base_path"], message: "base_path is required" });
    } else {
      appendBasePathIssues(ctx, basePath, "base_path");
    }

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
  })
  .transform((v) => {
    const view_name = v.view_name ?? v.view;
    const deprecated_parameters = collectDeprecatedParameters(v, CREATE_BASE_RENAMES);
    return {
      // superRefine guarantees one of the two is present.
      base_path: (v.base_path ?? v.path)!,
      name: v.name,
      ...(v.content !== undefined && { content: v.content }),
      ...(view_name !== undefined && { view_name }),
      ...(v.vault !== undefined && { vault: v.vault }),
      ...(deprecated_parameters !== undefined && { deprecated_parameters }),
    };
  });

export const createBaseOutputSchema = z.strictObject({
  path: z.string(),
  name: z.string(),
  deprecated_parameters: deprecatedParametersField,
});

export type CreateBaseInput = z.infer<typeof createBaseInputSchema>;
export type CreateBaseOutput = z.infer<typeof createBaseOutputSchema>;
