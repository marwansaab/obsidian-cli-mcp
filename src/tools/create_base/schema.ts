// Original — no upstream.
import { z } from "zod";

import { appendBasePathIssues, BASE_PATH_DESCRIPTION } from "../_base-path.js";
import { requiredString } from "../_required-string.js";

const NAME_MAX = 1000;
export const MAX_CONTENT_LENGTH = 3072;

export const createBaseInputSchema = z
  .strictObject({
    path: requiredString("path").describe(BASE_PATH_DESCRIPTION),
    name: requiredString("name").describe(
      "Name of the new item, 1..1000 chars; becomes the Markdown file name (auto-incremented on collision).",
    ),
    content: z
      .string()
      .optional()
      .describe(`Body text of the new item, up to ${MAX_CONTENT_LENGTH} UTF-16 code units. Default: none.`),
    view: z
      .string()
      .min(1)
      .optional()
      .describe("View name inside the base to create the item in. Not checked by the CLI; omit for the default."),
    vault: z
      .string()
      .min(1)
      .optional()
      .describe("Obsidian vault display name. Accepted for parity but currently ignored by the CLI."),
  })
  .superRefine((v, ctx) => {
    if (typeof v.path === "string") appendBasePathIssues(ctx, v.path, "path");

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

export const createBaseOutputSchema = z.strictObject({
  path: z.string(),
  name: z.string(),
});

export type CreateBaseInput = z.infer<typeof createBaseInputSchema>;
export type CreateBaseOutput = z.infer<typeof createBaseOutputSchema>;
