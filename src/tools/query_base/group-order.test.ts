// Original — no upstream. group-order.ts tests (BI-0207): the mirror of Obsidian's grouping and group order, pinned to the orders Obsidian 1.15 showed for the same values in the live T0 probe on the test vault (2026-11-07, fix.md), and Obsidian's loose value equality.
import { describe, expect, it } from "vitest";

import { groupRows, looseEquals, valueText, type Value } from "./group-order.js";

const S = (s: string): Value => ({ s });
const N = (n: number): Value => ({ n });
const B = (b: boolean): Value => ({ b });
const L = (...items: Array<string | number | null>): Value => ({
  a: items.map((w) => ({ v: w === null ? null : typeof w === "number" ? { n: w } : { s: w }, w })),
});
const TAGS = (...tags: string[]): Value => ({ a: tags.map((t) => ({ v: { s: t } })) });
const day = (iso: string): Value => {
  const ms = new Date(`${iso}T00:00:00`).getTime();
  return { d: ms, t: false, s: iso, o: ms };
};
const dateTime = (iso: string): Value => {
  const d = new Date(iso);
  return { d: d.getTime(), t: true, s: iso, o: new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() };
};

// The probe's notes, in path order: a, b, c, d, e, sub/f, sub/g.
const ROWS = ["a", "b", "c", "d", "e", "sub/f", "sub/g"];

/** Each group as [printed key or null, its rows by name], in group order. */
function shape(values: Value[], direction: "ASC" | "DESC"): Array<[string | null, string[]]> {
  return groupRows(values, direction, "en-US").map((g) => [g.key === null ? null : valueText(g.key), g.rows.map((i) => ROWS[i]!)]);
}

describe("groupRows mirrors the order Obsidian showed in the live probe", () => {
  it("strings: case-distinct groups, case-insensitive order, ties keep first appearance in both directions, null last", () => {
    const values = [S("two"), S("one"), S("Two"), S("b"), S("B"), S(""), null];
    expect(shape(values, "ASC")).toEqual([["", ["sub/f"]], ["b", ["d"]], ["B", ["e"]], ["one", ["b"]], ["two", ["a"]], ["Two", ["c"]], [null, ["sub/g"]]]);
    expect(shape(values, "DESC")).toEqual([["two", ["a"]], ["Two", ["c"]], ["one", ["b"]], ["b", ["d"]], ["B", ["e"]], ["", ["sub/f"]], [null, ["sub/g"]]]);
  });

  it("numbers: numeric order", () => {
    const values = [N(10), N(9), N(2), N(2.5), null, N(-1), null];
    expect(shape(values, "ASC")).toEqual([["-1", ["sub/f"]], ["2", ["c"]], ["2.5", ["d"]], ["9", ["b"]], ["10", ["a"]], [null, ["e", "sub/g"]]]);
    expect(shape(values, "DESC").map(([k]) => k)).toEqual(["10", "9", "2.5", "2", "-1", null]);
  });

  it("booleans", () => {
    const values = [B(true), B(false), null, null, null, null, null];
    expect(shape(values, "ASC")).toEqual([["false", ["b"]], ["true", ["a"]], [null, ["c", "d", "e", "sub/f", "sub/g"]]]);
    expect(shape(values, "DESC").map(([k]) => k)).toEqual(["true", "false", null]);
  });

  it("dates: a date and a date-time on the same day share the first one's group", () => {
    const values = [day("2026-01-05"), day("2025-12-31"), dateTime("2026-01-05T10:00:00"), null, null, null, null];
    expect(shape(values, "ASC")).toEqual([["2025-12-31", ["b"]], ["2026-01-05", ["a", "c"]], [null, ["d", "e", "sub/f", "sub/g"]]]);
    expect(shape(values, "DESC").map(([k]) => k)).toEqual(["2026-01-05", "2025-12-31", null]);
  });

  it("mixed number and string values order by the numeric collator", () => {
    const values = [S("10"), N(9), S("abc"), null, null, null, null];
    expect(shape(values, "ASC").map(([k]) => k)).toEqual(["9", "10", "abc", null]);
    expect(shape(values, "DESC").map(([k]) => k)).toEqual(["abc", "10", "9", null]);
  });

  it("lists: one group per list, printed joined, the empty list a \"\" group", () => {
    const values = [L("a", "b"), L("b"), L("a"), L(), null, null, null];
    expect(shape(values, "ASC")).toEqual([["", ["d"]], ["a", ["c"]], ["a, b", ["a"]], ["b", ["b"]], [null, ["e", "sub/f", "sub/g"]]]);
    expect(shape(values, "DESC").map(([k]) => k)).toEqual(["b", "a, b", "a", "", null]);
  });

  it("file.tags: notes without tags form a \"\" group, first ascending and last descending, with no null group", () => {
    const values = [TAGS("#inl", "#x", "#y"), TAGS("#y"), TAGS(), TAGS("#x"), TAGS(), TAGS(), TAGS()];
    expect(shape(values, "ASC")).toEqual([["", ["c", "e", "sub/f", "sub/g"]], ["#inl, #x, #y", ["a"]], ["#x", ["d"]], ["#y", ["b"]]]);
    expect(shape(values, "DESC").map(([k]) => k)).toEqual(["#y", "#x", "#inl, #x, #y", ""]);
  });

  it("file.ctime: distinct times printed alike stay distinct groups in first-appearance order in both directions", () => {
    const t = (ms: number): Value => ({ d: ms, t: true, s: "2026-11-07T19:35:44", o: 0 });
    const values = [t(1), t(1), t(2), t(3), t(3), t(4), t(5)];
    const expected = [["a", "b"], ["c"], ["d", "e"], ["sub/f"], ["sub/g"]];
    expect(shape(values, "ASC").map(([, rows]) => rows)).toEqual(expected);
    expect(shape(values, "DESC").map(([, rows]) => rows)).toEqual(expected);
  });
});

describe("looseEquals (Obsidian's Value.looseEquals)", () => {
  it.each<[string, Value, Value, boolean]>([
    ["a number and its string", N(9), S("9"), true],
    ["true and 1", B(true), N(1), true],
    ["true and \"true\"", B(true), S("true"), false],
    ["a one-element list and its element", L("a"), S("a"), true],
    ["a list of null and null", L(null), null, true],
    ["a string and a link with that target", S("x"), { l: "x", y: null, r: null }, true],
    ["two links resolving to one file", { l: "A", y: null, r: "A.md" }, { l: "a", y: "x", r: "A.md" }, true],
    ["two unresolved links with different targets", { l: "A", y: null, r: null }, { l: "B", y: null, r: null }, false],
    ["two date-times a second apart", dateTime("2026-01-05T10:00:00"), dateTime("2026-01-05T10:00:01"), false],
    ["null and null", null, null, true],
    ["null and the empty string", null, S(""), false],
  ])("%s", (_label, x, y, expected) => {
    expect(looseEquals(x, y)).toBe(expected);
    expect(looseEquals(y, x)).toBe(expected);
  });

  it("groups 9 and \"9\" together under the first value's key", () => {
    expect(groupRows([N(9), S("9")], "ASC", "en-US")).toEqual([{ key: N(9), rows: [0, 1] }]);
  });
});
