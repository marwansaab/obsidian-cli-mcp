// Original — no upstream. Shared deprecated-parameter-name mechanics for the family-name alignment (spec 073, research D1–D4, ADR-NNN): alias field builder, the fold from old names to new names (conflict issue, polarity, notices) and the deprecated_parameters result field.
import { z } from "zod";

/** One renamed parameter: the old (deprecated) key and the key that replaces it. */
export interface ParameterRename<K extends string = string> {
  old: K;
  replacement: K;
  /** True when the old key carries the opposite polarity (`old: true` equals `replacement: false`); the fold negates its value. */
  inverted?: boolean;
}

export const deprecatedParameterSchema = z.strictObject({
  parameter: z.string().min(1),
  replacement: z.string().min(1),
  note: z.string().min(1).optional(),
});

export type DeprecatedParameter = z.infer<typeof deprecatedParameterSchema>;

/** The optional result field a tool declares on its output schema. */
export const deprecatedParametersField = z
  .array(deprecatedParameterSchema)
  .min(1)
  .optional()
  .describe(
    "Present only when the call used a deprecated parameter name: each old name, its replacement and any note. Old names are accepted until the next major release.",
  );

/** Wrap `field` as the optional, published-deprecated alias key of `rename.replacement`. */
export function deprecatedAlias<T extends z.ZodType>(field: T, rename: ParameterRename) {
  const description = rename.inverted
    ? `Deprecated: use ${rename.replacement} with the opposite value (${rename.old}: true equals ${rename.replacement}: false); accepted until the next major release.`
    : `Deprecated: use ${rename.replacement} (accepted until the next major release).`;
  return field.optional().meta({ description, deprecated: true });
}

function noticeFor(rename: ParameterRename): DeprecatedParameter {
  return rename.inverted
    ? {
        parameter: rename.old,
        replacement: rename.replacement,
        note: `${rename.old}: true equals ${rename.replacement}: false (opposite polarity).`,
      }
    : { parameter: rename.old, replacement: rename.replacement };
}

/**
 * The transform between a tool's published schema (old and new names) and the schema it pipes
 * into, which knows only the new names. Per rename, in table order: an old key sent with its
 * replacement adds one issue at `[old]`, which stops the pipe; otherwise the old key's value
 * moves to the replacement (negated when `inverted`) and one notice is recorded. The notices
 * ride on the folded object as `deprecated_parameters`, absent when no old key was used.
 */
export function foldDeprecatedAliases<T extends Record<string, unknown>>(
  renames: readonly ParameterRename<Extract<keyof NoInfer<T>, string>>[],
): (input: T, ctx: z.RefinementCtx<T>) => Record<string, unknown> {
  return (input, ctx) => {
    const folded: Record<string, unknown> = { ...input };
    const notices: DeprecatedParameter[] = [];
    for (const rename of renames) {
      const value = input[rename.old];
      if (value === undefined) continue;
      if (input[rename.replacement] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [rename.old],
          message: `\`${rename.old}\` is deprecated and replaced by \`${rename.replacement}\`; supply only \`${rename.replacement}\``,
        });
        continue;
      }
      delete folded[rename.old];
      folded[rename.replacement] = rename.inverted ? !value : value;
      notices.push(noticeFor(rename));
    }
    if (notices.length > 0) folded["deprecated_parameters"] = notices;
    return folded;
  };
}

/** Attach `deprecated_parameters` to a handler result when the call used an old name. */
export function withDeprecatedParameters<R extends object>(
  result: R,
  notices: DeprecatedParameter[] | undefined,
): R | (R & { deprecated_parameters: DeprecatedParameter[] }) {
  return notices === undefined ? result : { ...result, deprecated_parameters: notices };
}
