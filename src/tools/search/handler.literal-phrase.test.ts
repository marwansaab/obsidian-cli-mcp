// Original — no upstream. search handler tests for literal phrase matching (spec 087): the escaped regex query in both subcommands, one entry per line in line mode, and line-break queries.
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeSearch } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { findKv, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const SENTINEL = { stdout: "\nNo matches found.\n", exitCode: 0 };

// =================== US1 — the query is sent as one escaped regex ===================

test("S1 a multi-word query is sent as one escaped regex; the result is unchanged", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["n1.md"]), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "alpha beta" }, deps(spawnFn));
  const argv = recorded[0]!.argv;
  expect(argv).toContain("query=/alpha beta/");
  expect(argv).not.toContain("query=alpha beta");
  expect(r).toEqual({ count: 1, paths: ["n1.md"] });
});

test.each([false, true])(
  "S3 leading and trailing whitespace is kept inside the delimiters (context_lines: %s)",
  async (contextLines) => {
    const { spawnFn, recorded } = makeQueuedSpawn([SENTINEL]);
    await executeSearch(
      { query: " alpha ", ...(contextLines ? { context_lines: true } : {}) },
      deps(spawnFn),
    );
    expect(recorded[0]!.argv).toContain("query=/ alpha /");
  },
);

test("S8 a single-word query is sent as a regex; case and folder are forwarded as before", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["P/a.md"]), exitCode: 0 },
  ]);
  const r = await executeSearch(
    { query: "alpha", case_sensitive: true, folder: "/P/" },
    deps(spawnFn),
  );
  const argv = recorded[0]!.argv;
  expect(argv).toContain("query=/alpha/");
  expect(argv).toContain("case=true");
  expect(findKv(argv, "path")).toBe("P");
  expect(r).toEqual({ count: 1, paths: ["P/a.md"] });
});

test.each([
  [true, false],
  [true, true],
  [false, false],
  [false, true],
])(
  "S9 a multi-word query keeps its case inside the delimiters (case_sensitive: %s, context_lines: %s)",
  async (caseSensitive, contextLines) => {
    const { spawnFn, recorded } = makeQueuedSpawn([SENTINEL]);
    await executeSearch(
      {
        query: "ALPHA BETA",
        ...(caseSensitive ? { case_sensitive: true } : {}),
        ...(contextLines ? { context_lines: true } : {}),
      },
      deps(spawnFn),
    );
    const argv = recorded[0]!.argv;
    expect(argv).toContain("query=/ALPHA BETA/");
    if (caseSensitive) {
      expect(argv).toContain("case=true");
    } else {
      expect(argv.find((a) => a.startsWith("case="))).toBeUndefined();
    }
  },
);

// =================== US2 — each matching line is returned once ===================

function lineWire(lines: number[]) {
  return JSON.stringify([
    { file: "a.md", matches: lines.map((line) => ({ line, text: "alpha beta" })) },
  ]);
}

test("S4 a line listed once per occurrence appears once; count is the number of lines", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: lineWire([1, 1, 2]), exitCode: 0 }]);
  const r = await executeSearch({ query: "alpha beta", context_lines: true }, deps(spawnFn));
  expect(r).toEqual({
    count: 2,
    matches: [
      { path: "a.md", line: 1, text: "alpha beta" },
      { path: "a.md", line: 2, text: "alpha beta" },
    ],
  });
});

test("S5 truncation counts lines: 2 distinct lines at limit 2 is truncated", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: lineWire([1, 1, 1, 2]), exitCode: 0 }]);
  const r = await executeSearch(
    { query: "alpha beta", context_lines: true, limit: 2 },
    deps(spawnFn),
  );
  expect(r).toEqual({
    count: 2,
    matches: [
      { path: "a.md", line: 1, text: "alpha beta" },
      { path: "a.md", line: 2, text: "alpha beta" },
    ],
    truncated: true,
  });
});

test("S6 truncation counts lines: 2 distinct lines at limit 3 is not truncated", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: lineWire([1, 1, 1, 2]), exitCode: 0 }]);
  const r = await executeSearch(
    { query: "alpha beta", context_lines: true, limit: 3 },
    deps(spawnFn),
  );
  expect(r.count).toBe(2);
  expect(Object.hasOwn(r, "truncated")).toBe(false);
});

test("S7 a line-break query returns no lines in line mode; default mode returns the stubbed path", async () => {
  const query = "end alpha\nbeta start";
  const { spawnFn: s1 } = makeQueuedSpawn([
    {
      stdout: JSON.stringify([{ file: "a.md", matches: [{ line: 1, text: "end alpha" }] }]),
      exitCode: 0,
    },
  ]);
  expect(await executeSearch({ query, context_lines: true }, deps(s1))).toEqual({
    count: 0,
    matches: [],
  });
  const { spawnFn: s2 } = makeQueuedSpawn([{ stdout: JSON.stringify(["a.md"]), exitCode: 0 }]);
  expect(await executeSearch({ query }, deps(s2))).toEqual({ count: 1, paths: ["a.md"] });
});

// =================== US3 — search-syntax characters are matched as text ===================

test.each([false, true])(
  "S2 quotes pass through and backslashes reach the CLI escaped inside the regex (context_lines: %s)",
  async (contextLines) => {
    const { spawnFn, recorded } = makeQueuedSpawn([SENTINEL]);
    const r = await executeSearch(
      { query: 'say "hi" a\\b', ...(contextLines ? { context_lines: true } : {}) },
      deps(spawnFn),
    );
    expect(recorded[0]!.argv).toContain('query=/say "hi" a\\\\b/');
    expect(r).toEqual(contextLines ? { count: 0, matches: [] } : { count: 0, paths: [] });
  },
);

// =================== BI-0175 — a query matches part-way through a word ===================

test.each([
  ["ead170", "query=/ead170/", "lead170 cap170long here"],
  ["pha bet", "query=/pha bet/", "alpha beta gamma"],
])(
  "S10 a query that starts or ends inside a word is sent as an escaped regex: %j",
  async (query, expected, text) => {
    const { spawnFn: s1, recorded: r1 } = makeQueuedSpawn([
      { stdout: JSON.stringify(["n1.md"]), exitCode: 0 },
    ]);
    expect(await executeSearch({ query }, deps(s1))).toEqual({ count: 1, paths: ["n1.md"] });
    expect(r1[0]!.argv).toContain(expected);

    const { spawnFn: s2, recorded: r2 } = makeQueuedSpawn([
      { stdout: JSON.stringify([{ file: "n1.md", matches: [{ line: 1, text }] }]), exitCode: 0 },
    ]);
    expect(await executeSearch({ query, context_lines: true }, deps(s2))).toEqual({
      count: 1,
      matches: [{ path: "n1.md", line: 1, text }],
    });
    expect(r2[0]!.argv).toContain(expected);
  },
);
