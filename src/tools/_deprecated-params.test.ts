// Original — no upstream.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  appendAliasConflictIssue,
  collectDeprecatedParameters,
  deprecatedAlias,
  deprecatedParametersField,
  withDeprecatedParameters,
  type ParameterRename,
} from "./_deprecated-params.js";

const PLAIN: ParameterRename = { old: "subfolder", replacement: "folder" };
const INVERTED: ParameterRename = { old: "case_insensitive", replacement: "case_sensitive", inverted: true };

function publishedProperty(schema: z.ZodType, key: string): Record<string, unknown> {
  const json = schema["~standard"].jsonSchema.input({ target: "draft-2020-12" });
  return (json["properties"] as Record<string, Record<string, unknown>>)[key]!;
}

describe("deprecatedAlias", () => {
  it("publishes deprecated: true with the plain description", () => {
    const schema = z.strictObject({ subfolder: deprecatedAlias(z.string(), PLAIN) });
    expect(publishedProperty(schema, "subfolder")).toMatchObject({
      type: "string",
      deprecated: true,
      description: "Deprecated: use folder (accepted until the next major release).",
    });
  });

  it("publishes deprecated: true with the inverted-polarity description", () => {
    const schema = z.strictObject({ case_insensitive: deprecatedAlias(z.boolean(), INVERTED) });
    expect(publishedProperty(schema, "case_insensitive")).toMatchObject({
      type: "boolean",
      deprecated: true,
      description:
        "Deprecated: use case_sensitive with the opposite value (case_insensitive: true equals case_sensitive: false); accepted until the next major release.",
    });
  });

  it("is optional and keeps the wrapped field's validation", () => {
    const field = deprecatedAlias(z.string().min(1), PLAIN);
    expect(field.parse(undefined)).toBeUndefined();
    expect(field.parse("x")).toBe("x");
    expect(field.safeParse("").success).toBe(false);
  });
});

describe("appendAliasConflictIssue", () => {
  const schema = z
    .strictObject({ folder: z.string().optional(), subfolder: z.string().optional() })
    .superRefine((v, ctx) => appendAliasConflictIssue(ctx, v, PLAIN));

  it("raises one issue at [old] naming both keys when both are present", () => {
    const result = schema.safeParse({ folder: "A", subfolder: "B" });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        code: "custom",
        path: ["subfolder"],
        message: "`subfolder` is deprecated and replaced by `folder`; supply only `folder`",
      }),
    ]);
  });

  it("raises the issue even when both values are equal", () => {
    const result = schema.safeParse({ folder: "A", subfolder: "A" });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
  });

  it("raises nothing when only one key is present", () => {
    expect(schema.safeParse({ folder: "A" }).success).toBe(true);
    expect(schema.safeParse({ subfolder: "A" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });
});

describe("collectDeprecatedParameters", () => {
  const renames = [INVERTED, PLAIN];

  it("returns one entry per old key used, in table order, with the polarity note only when inverted", () => {
    expect(collectDeprecatedParameters({ subfolder: "N", case_insensitive: false }, renames)).toEqual([
      {
        parameter: "case_insensitive",
        replacement: "case_sensitive",
        note: "case_insensitive: true equals case_sensitive: false (opposite polarity).",
      },
      { parameter: "subfolder", replacement: "folder" },
    ]);
  });

  it("returns undefined when no old key was used", () => {
    expect(collectDeprecatedParameters({ folder: "N", case_sensitive: true }, renames)).toBeUndefined();
    expect(collectDeprecatedParameters({ subfolder: undefined }, renames)).toBeUndefined();
  });
});

describe("withDeprecatedParameters", () => {
  const result = { count: 0, paths: [] };

  it("returns the result unchanged when there are no notices", () => {
    expect(withDeprecatedParameters(result, undefined)).toBe(result);
    expect(withDeprecatedParameters(result, [])).toBe(result);
  });

  it("adds the deprecated_parameters field otherwise", () => {
    const notices = [{ parameter: "subfolder", replacement: "folder" }];
    expect(withDeprecatedParameters(result, notices)).toEqual({ count: 0, paths: [], deprecated_parameters: notices });
  });
});

describe("deprecatedParametersField", () => {
  it("accepts undefined and a non-empty list, rejects an empty list", () => {
    expect(deprecatedParametersField.safeParse(undefined).success).toBe(true);
    expect(deprecatedParametersField.safeParse([{ parameter: "a", replacement: "b" }]).success).toBe(true);
    expect(deprecatedParametersField.safeParse([]).success).toBe(false);
  });
});
