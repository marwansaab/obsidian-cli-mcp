// Original — no upstream. Tests for the tags input/output/upstream schemas — input happy paths (every field optional), the scope-matrix superRefine (SCOPE_CONFLICT file+path / active+note / active+vault, first-row-wins, allowed rows), field-level rejections (INVALID_NOTE/path-traversal on file/path, `[[…]]` on file, empty vault), unknown-key rejection (AC-11, dual client pathway), the upstream wire schema pinned at T0 P1, and the output invariants (total === length, unique names, all-or-none counts, strict entries).
import { describe, expect, expectTypeOf, test } from "vitest";

import {
  tagsInputSchema,
  tagsOutputSchema,
  tagsUpstreamArraySchema,
  type TagEntry,
  type TagsInput,
  type TagsOutput,
} from "./schema.js";

import type { z } from "zod";

type Issue = z.core.$ZodIssue & { params?: { subCode?: string; subReason?: string } };

function issuesOf(input: unknown): Issue[] {
  const r = tagsInputSchema.safeParse(input);
  expect(r.success).toBe(false);
  return r.success ? [] : (r.error.issues as Issue[]);
}

function scopeConflicts(input: unknown): Issue[] {
  return issuesOf(input).filter((i) => i.params?.subCode === "SCOPE_CONFLICT");
}

// ============================ input — happy paths ============================

describe("tagsInputSchema — accepted shapes", () => {
  test("{} parses (every field optional, no injected defaults)", () => {
    const r = tagsInputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({});
  });

  test.each([
    [{ vault: "V" }],
    [{ file: "Note" }],
    [{ path: "dir/Note.md" }],
    [{ activeOnly: true }],
    [{ activeOnly: false }],
    [{ sortByCount: true }],
    [{ includeCounts: false }],
  ])("single field %j parses", (input) => {
    expect(tagsInputSchema.safeParse(input).success).toBe(true);
  });

  test.each([
    [{ file: "Note", vault: "V" }],
    [{ path: "a/b.md", vault: "V" }],
    [{ vault: "V", sortByCount: true, includeCounts: false }],
    [{ activeOnly: true, sortByCount: true }],
    [{ activeOnly: false, file: "Note" }],
    [{ activeOnly: false, path: "a/b.md", vault: "V" }],
    [{ file: "[draft] Note" }],
  ])("allowed combination %j parses", (input) => {
    expect(tagsInputSchema.safeParse(input).success).toBe(true);
  });
});

// ============================ input — scope matrix ============================

describe("tagsInputSchema — scope matrix (SCOPE_CONFLICT)", () => {
  test.each([
    [{ file: "a", path: "b.md" }, "file+path"],
    [{ activeOnly: true, file: "a" }, "active+note"],
    [{ activeOnly: true, path: "a.md" }, "active+note"],
    [{ activeOnly: true, vault: "V" }, "active+vault"],
  ])("%j → one custom issue with reason %s", (input, reason) => {
    const conflicts = scopeConflicts(input);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe("custom");
    expect(conflicts[0]!.params).toEqual({ subCode: "SCOPE_CONFLICT", subReason: reason });
    expect(conflicts[0]!.path).toEqual([]);
  });

  test("four-way conflict reports only the first row's reason (file+path)", () => {
    const conflicts = scopeConflicts({ activeOnly: true, file: "a", path: "b.md", vault: "V" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.params?.subReason).toBe("file+path");
  });

  test("active + note + vault reports active+note (row 2 precedes row 3)", () => {
    const conflicts = scopeConflicts({ activeOnly: true, file: "a", vault: "V" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.params?.subReason).toBe("active+note");
  });
});

// ============================ input — field-level ============================

describe("tagsInputSchema — field-level rejections", () => {
  test.each(["../x.md", "/abs.md", "\\abs.md", "C:\\x.md", "a\u0001b.md", "a\u007fb.md", "dir/../x.md"])(
    "unsafe locator %j → INVALID_NOTE/path-traversal on file and on path",
    (value) => {
      for (const field of ["file", "path"] as const) {
        const issues = issuesOf({ [field]: value });
        const unsafe = issues.find((i) => i.params?.subCode === "INVALID_NOTE");
        expect(unsafe, `${field}=${JSON.stringify(value)}`).toBeDefined();
        expect(unsafe!.params?.subReason).toBe("path-traversal");
        expect(unsafe!.path).toEqual([field]);
      }
    },
  );

  test("file: \"[[Note]]\" → custom issue without params, message asks for the bare name", () => {
    const issues = issuesOf({ file: "[[Note]]" });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("custom");
    expect(issues[0]!.path).toEqual(["file"]);
    expect(issues[0]!.params).toBeUndefined();
    expect(issues[0]!.message).toContain("bare note name");
  });

  test("path: \"[[x]].md\" is not bracket-checked (path is a literal path)", () => {
    expect(tagsInputSchema.safeParse({ path: "[[x]].md" }).success).toBe(true);
  });

  test.each([[{ vault: "" }], [{ file: "" }], [{ path: "" }]])("empty string %j rejected", (input) => {
    expect(tagsInputSchema.safeParse(input).success).toBe(false);
  });

  test.each([[{ activeOnly: "yes" }], [{ sortByCount: 1 }], [{ includeCounts: null }], [{ vault: 3 }]])(
    "wrong type %j rejected",
    (input) => {
      expect(tagsInputSchema.safeParse(input).success).toBe(false);
    },
  );
});

// ============================ input — unknown keys (AC-11) ============================

describe("tagsInputSchema — unknown keys (AC-11)", () => {
  // Dual-pathway note: clients that strip keys absent from the published schema never
  // send these, so the rejection is observable end-to-end only on forwarding clients.
  // These tests exercise the server-side rejection directly.
  test.each([[{ target_mode: "specific" }], [{ sort: "count" }], [{ foo: 1 }]])(
    "%j → unrecognized_keys (server-side pathway; stripping clients never send it)",
    (input) => {
      const issues = issuesOf(input);
      expect(issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    },
  );
});

// ============================ upstream wire schema ============================

describe("tagsUpstreamArraySchema (T0 P1 wire)", () => {
  test("accepts the observed [{ tag, count: digit-string }] shape", () => {
    expect(
      tagsUpstreamArraySchema.safeParse([
        { tag: "#t068-real", count: "1" },
        { tag: "#T068-Case", count: "12" },
      ]).success,
    ).toBe(true);
  });

  test.each([[[{ tag: "#a", count: 1 }]], [[{ tag: "#a", count: "x" }]], [[{ tag: "", count: "1" }]], [[{ count: "1" }]]])(
    "rejects %j",
    (value) => {
      expect(tagsUpstreamArraySchema.safeParse(value).success).toBe(false);
    },
  );
});

// ============================ output schema ============================

describe("tagsOutputSchema — invariants", () => {
  test("accepts a valid envelope with counts", () => {
    expect(
      tagsOutputSchema.safeParse({ total: 2, tags: [{ name: "a", count: 1 }, { name: "b", count: 0 }] }).success,
    ).toBe(true);
  });

  test("accepts a valid envelope without counts", () => {
    expect(tagsOutputSchema.safeParse({ total: 2, tags: [{ name: "a" }, { name: "b" }] }).success).toBe(true);
  });

  test("accepts the empty envelope", () => {
    expect(tagsOutputSchema.safeParse({ total: 0, tags: [] }).success).toBe(true);
  });

  test("rejects total !== tags.length", () => {
    expect(tagsOutputSchema.safeParse({ total: 2, tags: [{ name: "a", count: 1 }] }).success).toBe(false);
  });

  test("rejects duplicate names", () => {
    const r = tagsOutputSchema.safeParse({ total: 2, tags: [{ name: "a", count: 1 }, { name: "a", count: 2 }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(["tags", 1, "name"]);
  });

  test("rejects mixed count presence", () => {
    expect(tagsOutputSchema.safeParse({ total: 2, tags: [{ name: "a", count: 1 }, { name: "b" }] }).success).toBe(
      false,
    );
  });

  test("rejects an empty name", () => {
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "", count: 1 }] }).success).toBe(false);
  });

  test("rejects an extra entry key", () => {
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a", count: 1, type: "x" }] }).success).toBe(false);
  });

  test("rejects an extra top-level key", () => {
    expect(tagsOutputSchema.safeParse({ total: 0, tags: [], count: 0 }).success).toBe(false);
  });

  test("rejects negative or fractional counts", () => {
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a", count: -1 }] }).success).toBe(false);
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a", count: 1.5 }] }).success).toBe(false);
  });
});

test("inferred types expose the published shape", () => {
  expectTypeOf<TagsInput>().toEqualTypeOf<{
    vault?: string | undefined;
    file?: string | undefined;
    path?: string | undefined;
    activeOnly?: boolean | undefined;
    sortByCount?: boolean | undefined;
    includeCounts?: boolean | undefined;
  }>();
  expectTypeOf<TagEntry>().toEqualTypeOf<{ name: string; count?: number | undefined }>();
  expectTypeOf<TagsOutput["tags"]>().toEqualTypeOf<TagEntry[]>();
});
