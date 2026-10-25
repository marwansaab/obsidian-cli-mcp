// Original — no upstream. Tests for the tags schemas — the ADR-038 scope matrix (specific requires vault, active forbids vault, at most one of file / path / activeOnly in either mode, activeOnly:false counts as unset), strict unknown-key rejection (AC 11), ADR-009 Layer-1 path safety (FR-012), empty locators, wrong types, target_mode presence, and the output / upstream-wire schemas.
import { describe, expect, test } from "vitest";

import { tagsInputSchema, tagsOutputSchema, tagsUpstreamArraySchema } from "./schema.js";
import { STRUCTURALLY_UNSAFE_PATH_MESSAGE } from "../../path-safety/schema.js";

const SCOPE_CONFLICT_MESSAGE = "at most one of `file`, `path`, `activeOnly` may be set";

function issuesOf(input: unknown) {
  const r = tagsInputSchema.safeParse(input);
  expect(r.success).toBe(false);
  return r.success ? [] : r.error.issues;
}

function issuePaths(input: unknown): string[] {
  return issuesOf(input).map((i) => i.path.join("."));
}

describe("tagsInputSchema — valid inputs", () => {
  const valid: Array<[string, unknown]> = [
    ["specific + vault (vault-wide)", { target_mode: "specific", vault: "V" }],
    ["active with no vault (focused vault, vault-wide)", { target_mode: "active" }],
    ["active + vault: undefined", { target_mode: "active", vault: undefined }],
    ["specific + file", { target_mode: "specific", vault: "V", file: "Alpha" }],
    ["specific + path", { target_mode: "specific", vault: "V", path: "Sandbox/x/Alpha.md" }],
    ["specific + activeOnly", { target_mode: "specific", vault: "V", activeOnly: true }],
    ["active + file", { target_mode: "active", file: "Alpha" }],
    ["active + path", { target_mode: "active", path: "Sandbox/x/Alpha.md" }],
    ["active + activeOnly", { target_mode: "active", activeOnly: true }],
    ["file + activeOnly: false", { target_mode: "specific", vault: "V", file: "Alpha", activeOnly: false }],
    ["path + activeOnly: false", { target_mode: "active", path: "a.md", activeOnly: false }],
    [
      "all booleans explicit",
      { target_mode: "specific", vault: "V", activeOnly: false, sortByCount: true, includeCounts: false },
    ],
    ["non-ASCII path", { target_mode: "specific", vault: "V", path: "Notes/réunion 日本.md" }],
  ];
  for (const [label, input] of valid) {
    test(`${label} → parses`, () => {
      expect(tagsInputSchema.safeParse(input).success).toBe(true);
    });
  }

  test("parsed output keeps the optional booleans undefined when omitted (defaults resolve in the handler)", () => {
    const r = tagsInputSchema.parse({ target_mode: "specific", vault: "V" });
    expect(r.activeOnly).toBeUndefined();
    expect(r.sortByCount).toBeUndefined();
    expect(r.includeCounts).toBeUndefined();
  });
});

describe("tagsInputSchema — AC 9 scope conflicts (both modes)", () => {
  const combos: Array<[string, Record<string, unknown>, string[]]> = [
    ["file + path", { file: "A", path: "A.md" }, ["file", "path"]],
    ["file + activeOnly", { file: "A", activeOnly: true }, ["file", "activeOnly"]],
    ["path + activeOnly", { path: "A.md", activeOnly: true }, ["path", "activeOnly"]],
    ["file + path + activeOnly", { file: "A", path: "A.md", activeOnly: true }, ["file", "path", "activeOnly"]],
  ];
  for (const [label, scope, keys] of combos) {
    for (const base of [{ target_mode: "specific", vault: "V" }, { target_mode: "active" }]) {
      test(`AC 9 — ${label} in ${base.target_mode} mode → one issue on each offending key`, () => {
        const issues = issuesOf({ ...base, ...scope });
        expect(issues.map((i) => i.path.join(".")).sort()).toEqual([...keys].sort());
        for (const issue of issues) expect(issue.message).toBe(SCOPE_CONFLICT_MESSAGE);
      });
    }
  }
});

describe("tagsInputSchema — vault rules", () => {
  test("AC 10 — specific mode without vault → issue path ['vault']", () => {
    const issues = issuesOf({ target_mode: "specific" });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toEqual(["vault"]);
    expect(issues[0]!.message).toBe("vault is required in specific mode");
  });

  test("AC 10 — specific mode without vault but with a scope → still issue path ['vault']", () => {
    expect(issuePaths({ target_mode: "specific", file: "A" })).toEqual(["vault"]);
  });

  test("AC 12 — active mode with vault → issue path ['vault']", () => {
    const issues = issuesOf({ target_mode: "active", vault: "V" });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toEqual(["vault"]);
    expect(issues[0]!.message).toBe("vault is not allowed in active mode");
  });

  test("empty vault string fails", () => {
    expect(issuePaths({ target_mode: "specific", vault: "" })).toContain("vault");
  });
});

describe("tagsInputSchema — keys and types", () => {
  test("AC 11 — an unknown top-level key fails", () => {
    const issues = issuesOf({ target_mode: "specific", vault: "V", bogus: 1 });
    expect(issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  });

  test("upstream-only knobs (sort, total, format) are unknown keys", () => {
    for (const key of ["sort", "total", "format"]) {
      expect(tagsInputSchema.safeParse({ target_mode: "specific", vault: "V", [key]: "x" }).success).toBe(false);
    }
  });

  test("empty file fails", () => {
    expect(issuePaths({ target_mode: "specific", vault: "V", file: "" })).toContain("file");
  });

  test("empty path fails", () => {
    expect(issuePaths({ target_mode: "specific", vault: "V", path: "" })).toContain("path");
  });

  test("wrong types fail (activeOnly: 'yes', sortByCount: 1, includeCounts: null, file: 3)", () => {
    const base = { target_mode: "specific", vault: "V" };
    expect(issuePaths({ ...base, activeOnly: "yes" })).toContain("activeOnly");
    expect(issuePaths({ ...base, sortByCount: 1 })).toContain("sortByCount");
    expect(issuePaths({ ...base, includeCounts: null })).toContain("includeCounts");
    expect(issuePaths({ ...base, file: 3 })).toContain("file");
  });

  test("target_mode missing fails", () => {
    expect(issuePaths({ vault: "V" })).toContain("target_mode");
  });

  test("target_mode invalid fails", () => {
    expect(issuePaths({ target_mode: "focused", vault: "V" })).toContain("target_mode");
  });
});

describe("tagsInputSchema — FR-012 path safety (ADR-009 Layer 1)", () => {
  const unsafe = ["../x.md", "a/../b.md", "/x.md", "\\x.md", "C:/x.md", "x\u0000.md", "a\\..\\b.md"];
  for (const path of unsafe) {
    test(`path ${JSON.stringify(path)} → STRUCTURALLY_UNSAFE_PATH_MESSAGE`, () => {
      const issues = issuesOf({ target_mode: "specific", vault: "V", path });
      expect(issues.some((i) => i.path.join(".") === "path" && i.message === STRUCTURALLY_UNSAFE_PATH_MESSAGE)).toBe(
        true,
      );
    });
  }

  test("a `..` substring inside a segment name is NOT a traversal (`a..b.md` parses)", () => {
    expect(tagsInputSchema.safeParse({ target_mode: "specific", vault: "V", path: "a..b.md" }).success).toBe(true);
  });
});

describe("output and upstream-wire schemas", () => {
  test("tagsOutputSchema accepts entries with and without count", () => {
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a", count: 2 }] }).success).toBe(true);
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a" }] }).success).toBe(true);
    expect(tagsOutputSchema.safeParse({ total: 0, tags: [] }).success).toBe(true);
  });

  test("tagsOutputSchema rejects an empty name, a negative or fractional count, and extra keys", () => {
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "" }] }).success).toBe(false);
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a", count: -1 }] }).success).toBe(false);
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a", count: 1.5 }] }).success).toBe(false);
    expect(tagsOutputSchema.safeParse({ total: 1, tags: [{ name: "a", extra: 1 }] }).success).toBe(false);
  });

  test("tagsUpstreamArraySchema accepts string counts, missing counts and extra fields; rejects a non-array", () => {
    expect(tagsUpstreamArraySchema.safeParse([{ tag: "#a", count: "1" }]).success).toBe(true);
    expect(tagsUpstreamArraySchema.safeParse([{ tag: "#a" }]).success).toBe(true);
    expect(tagsUpstreamArraySchema.safeParse([{ tag: "#a", count: "1", x: 1 }]).success).toBe(true);
    expect(tagsUpstreamArraySchema.safeParse({ x: 1 }).success).toBe(false);
    expect(tagsUpstreamArraySchema.safeParse([{ tag: "#a", count: 1 }]).success).toBe(false);
  });
});
