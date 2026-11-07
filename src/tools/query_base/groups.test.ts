// Original — no upstream. groups.ts tests (BI-0207): the mirror of Obsidian's grouping and group order, pinned to the orders Obsidian 1.15 showed for the same values in the live T0 probe on the test vault (2026-11-07, fix.md); Obsidian's loose value equality; the property-to-source mapping; the folder-grouped batch plan under the eval budget; and readGroupValues' typed failures (no fallback to ungrouped rows).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GROUP_VALUES_CODE_MAX,
  groupRows,
  groupSource,
  looseEquals,
  planGroupBatches,
  readGroupValues,
  valueText,
  type Value,
} from "./groups.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { composeEvalCode } from "../_shared.js";

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

describe("groupSource", () => {
  it.each([
    ["note.status", { kind: "note", name: "status" }],
    ["status", { kind: "note", name: "status" }],
    ["my.prop", { kind: "note", name: "my.prop" }],
    ["file.folder", { kind: "file", name: "folder" }],
    ["file.Ext", { kind: "file", name: "ext" }],
    ["file.tags", { kind: "file", name: "tags" }],
    ["file.ctime", { kind: "file", name: "ctime" }],
    ["file.mtime", { kind: "file", name: "mtime" }],
  ])("%s", (property, expected) => {
    expect(groupSource(property)).toEqual(expected);
  });

  it.each(["formula.score", "file.name", "file.size", "file"])("%s is GROUPING_UNSUPPORTED/property", (property) => {
    let caught: unknown;
    try {
      groupSource(property);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamError);
    expect((caught as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((caught as UpstreamError).details).toEqual({ code: "GROUPING_UNSUPPORTED", reason: "property", property });
  });
});

describe("planGroupBatches", () => {
  it("groups paths by folder in order and keeps every batch's code within the budget", () => {
    const paths = Array.from({ length: 300 }, (_, i) => `Projects/Long folder name ${i % 3}/note number ${i}.md`);
    const source = { kind: "note" as const, name: "status" };
    const batches = planGroupBatches(source, paths);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap((b) => b.flatMap(([folder, names]) => names.map((n) => `${folder}/${n}`)))).toEqual(paths);
    for (const b of batches) expect(composeEvalCode("__PAYLOAD_B64__", { p: "status", f: b }).length).toBeLessThan(GROUP_VALUES_CODE_MAX);
  });

  it("sends a root note with an empty folder", () => {
    expect(planGroupBatches({ kind: "file", name: "folder" }, ["top.md", "a/b.md", "a/c.md"])).toEqual([[["", ["top.md"]], ["a", ["b.md", "c.md"]]]]);
  });
});

describe("readGroupValues", () => {
  beforeEach(() => __resetInFlightRegistryForTests());
  afterEach(() => __resetInFlightRegistryForTests());

  const deps = (responses: Parameters<typeof makeQueuedSpawn>[0]) => {
    const spawn = makeQueuedSpawn(responses);
    return { spawn, deps: { logger: silentLogger(), queue: createQueue(), spawnFn: spawn.spawnFn, env: {} } };
  };
  const answer = (body: unknown) => ({ stdout: `=> ${JSON.stringify(body)}\n`, exitCode: 0 });
  const source = { kind: "note" as const, name: "status" };

  it("returns the values and the locale, sending vault= when named", async () => {
    const { spawn, deps: d } = deps([answer({ locale: "en-US", values: [{ s: "x" }, null] })]);
    expect(await readGroupValues(source, ["a.md", "b.md"], "Demo", d)).toEqual({ locale: "en-US", values: [{ s: "x" }, null] });
    expect(spawn.recorded[0]!.argv).toContain("vault=Demo");
  });

  it("asks once per batch", async () => {
    const paths = Array.from({ length: 200 }, (_, i) => `Folder ${i}/note ${i}.md`);
    const n = planGroupBatches(source, paths).length;
    const responses = planGroupBatches(source, paths).map((b) => answer({ locale: "en-US", values: b.map(() => null) }));
    const { spawn, deps: d } = deps(responses);
    const r = await readGroupValues(source, paths, undefined, d);
    expect(r.values).toHaveLength(200);
    expect(spawn.getCount()).toBe(n);
  });

  it.each<[string, unknown, Record<string, unknown>]>([
    ["a missing note", { locale: "en-US", values: [{ u: "note-not-found" }] }, { stage: "group-values", reason: "note-not-found", path: "a.md" }],
    ["a value it cannot mirror", { locale: "en-US", values: [{ u: "object" }] }, { code: "GROUPING_UNSUPPORTED", reason: "value-type", path: "a.md", value_type: "object" }],
    ["a list element it cannot mirror", { locale: "en-US", values: [{ a: [{ v: { u: "object" } }] }] }, { code: "GROUPING_UNSUPPORTED", reason: "value-type", path: "a.md" }],
    ["an answer for a different number of rows", { locale: "en-US", values: [] }, { stage: "envelope-parse", asked: 1, answered: 0 }],
    ["a malformed answer", { locale: "en-US", values: [{ x: 1 }] }, { stage: "envelope-parse" }],
  ])("fails with a typed CLI_REPORTED_ERROR on %s", async (_label, body, details) => {
    const { deps: d } = deps([answer(body)]);
    const err = (await captureRejection(readGroupValues(source, ["a.md"], undefined, d))) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toMatchObject(details);
  });

  it("fails with a typed json-parse error when the eval answers no JSON", async () => {
    const { deps: d } = deps([{ stdout: "=> not json\n", exitCode: 0 }]);
    const err = (await captureRejection(readGroupValues(source, ["a.md"], undefined, d))) as UpstreamError;
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toMatchObject({ stage: "json-parse" });
  });

  it("fails when batches report different locales", async () => {
    const paths = Array.from({ length: 200 }, (_, i) => `Folder ${i}/note ${i}.md`);
    const responses = planGroupBatches(source, paths).map((b, i) => answer({ locale: i === 0 ? "en-US" : "fr", values: b.map(() => null) }));
    const { deps: d } = deps(responses);
    const err = (await captureRejection(readGroupValues(source, paths, undefined, d))) as UpstreamError;
    expect(err.details).toMatchObject({ stage: "envelope-parse" });
  });

  it("names both locales when batches disagree (PR #158 review)", async () => {
    const paths = Array.from({ length: 200 }, (_, i) => `Folder ${i}/note ${i}.md`);
    const responses = planGroupBatches(source, paths).map((b, i) => answer({ locale: i === 0 ? "en-US" : "fr", values: b.map(() => null) }));
    const { deps: d } = deps(responses);
    const err = (await captureRejection(readGroupValues(source, paths, undefined, d))) as UpstreamError;
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toEqual({ stage: "envelope-parse", locales: ["en-US", "fr"] });
  });

  it("refuses no paths as INTERNAL_ERROR without an eval, instead of inventing a locale (PR #158 review)", async () => {
    const { spawn, deps: d } = deps([]);
    const err = (await captureRejection(readGroupValues(source, [], undefined, d))) as UpstreamError;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.details).toEqual({ stage: "group-values" });
    expect(spawn.getCount()).toBe(0);
  });
});

describe("groupRows locale", () => {
  it("fails GROUPING_UNSUPPORTED/collator-locale for a locale this server's ICU lacks", () => {
    let caught: unknown;
    try {
      groupRows([S("a")], "ASC", "zz-Unknown-x-none");
    } catch (err) {
      caught = err;
    }
    expect((caught as UpstreamError).details).toMatchObject({ code: "GROUPING_UNSUPPORTED", reason: "collator-locale" });
  });
});
