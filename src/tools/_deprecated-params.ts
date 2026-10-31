// Original — no upstream. Shared deprecated-parameter-name mechanics for the family-name alignment (spec 073, research D1–D4, ADR-NNN): alias field builder, old+new conflict issue, notice collection and the deprecated_parameters result field.
import { z } from "zod";

/** One renamed parameter: the old (deprecated) key and the key that replaces it. */
export interface ParameterRename {
  old: string;
  replacement: string;
  /** True when the old key carries the opposite polarity (`old: true` equals `replacement: false`). */
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

/** Add one issue at `[old]` when the call supplies both the old and the new key. */
export function appendAliasConflictIssue(
  ctx: z.RefinementCtx,
  input: Record<string, unknown>,
  rename: ParameterRename,
): void {
  if (input[rename.old] !== undefined && input[rename.replacement] !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: [rename.old],
      message: `\`${rename.old}\` is deprecated and replaced by \`${rename.replacement}\`; supply only \`${rename.replacement}\``,
    });
  }
}

/** One notice entry per old key the call used, in rename-table order; `undefined` when none. */
export function collectDeprecatedParameters(
  input: Record<string, unknown>,
  renames: readonly ParameterRename[],
): DeprecatedParameter[] | undefined {
  const notices: DeprecatedParameter[] = [];
  for (const rename of renames) {
    if (input[rename.old] === undefined) continue;
    notices.push(
      rename.inverted
        ? {
            parameter: rename.old,
            replacement: rename.replacement,
            note: `${rename.old}: true equals ${rename.replacement}: false (opposite polarity).`,
          }
        : { parameter: rename.old, replacement: rename.replacement },
    );
  }
  return notices.length > 0 ? notices : undefined;
}

/** Attach `deprecated_parameters` to a handler result when the call used an old name. */
export function withDeprecatedParameters<R extends object>(
  result: R,
  notices: DeprecatedParameter[] | undefined,
): R | (R & { deprecated_parameters: DeprecatedParameter[] }) {
  if (notices === undefined || notices.length === 0) return result;
  return { ...result, deprecated_parameters: notices };
}
