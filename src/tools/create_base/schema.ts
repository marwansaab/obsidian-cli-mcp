// Original — no upstream.
import { z } from "zod";

import { appendBasePathIssues } from "../_base-path.js";

const NAME_MAX = 1000;
export const MAX_CONTENT_LENGTH = 3072;

export const createBaseInputSchema = z
  .object({
    path: z.string({
      required_error: "path is required",
      invalid_type_error: "path must be a string",
    }),
    name: z.string({
      required_error: "name is required",
      invalid_type_error: "name must be a string",
    }),
    content: z.string().optional(),
    view: z.string().min(1).optional(),
    vault: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (typeof v.path === "string") appendBasePathIssues(ctx, v.path, "path");

    if (typeof v.name === "string") {
      const value_length = v.name.length;
      if (value_length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
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
          code: z.ZodIssueCode.custom,
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
        code: z.ZodIssueCode.custom,
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

export const createBaseOutputSchema = z
  .object({
    path: z.string(),
    name: z.string(),
  })
  .strict();

export type CreateBaseInput = z.infer<typeof createBaseInputSchema>;
export type CreateBaseOutput = z.infer<typeof createBaseOutputSchema>;
