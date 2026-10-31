// Original — no upstream.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  deprecatedAlias,
  deprecatedParametersField,
  foldDeprecatedAliases,
  withDeprecatedParameters,
  type ParameterRename,
} from "./_deprecated-params.js";

const PLAIN = { old: "subfolder", replacement: "folder" } as const satisfies ParameterRename;
const INVERTED = { old: "case_insensitive", replacement: "case_sensitive", inverted: true } as const satisfies ParameterRename;

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

describe("foldDeprecatedAliases", () => {
  const schema = z
    .strictObject({
      case_sensitive: z.boolean().optional(),
      case_insensitive: z.boolean().optional(),
      folder: z.string().optional(),
      subfolder: z.string().optional(),
    })
    .transform(foldDeprecatedAliases([INVERTED, PLAIN] as const));

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

  it("moves an old key onto its replacement, negating an inverted one, with notices in table order", () => {
    expect(schema.parse({ subfolder: "N", case_insensitive: true })).toEqual({
      folder: "N",
      case_sensitive: false,
      deprecated_parameters: [
        {
          parameter: "case_insensitive",
          replacement: "case_sensitive",
          note: "case_insensitive: true equals case_sensitive: false (opposite polarity).",
        },
        { parameter: "subfolder", replacement: "folder" },
      ],
    });
    expect(schema.parse({ case_insensitive: false })).toMatchObject({ case_sensitive: true });
  });

  it("leaves a new-name call untouched, with no deprecated_parameters key", () => {
    expect(schema.parse({ folder: "N", case_sensitive: true })).toEqual({ folder: "N", case_sensitive: true });
    expect(schema.parse({})).toEqual({});
  });
});

describe("withDeprecatedParameters", () => {
  const result = { count: 0, paths: [] };

  it("returns the result unchanged when there are no notices", () => {
    expect(withDeprecatedParameters(result, undefined)).toBe(result);
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
