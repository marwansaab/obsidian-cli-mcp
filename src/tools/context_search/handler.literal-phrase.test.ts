// Original — no upstream. context_search handler tests for literal phrase matching (spec 087): the quoted query, one entry per line, line-break queries, and the unchanged folder probe.
import { afterEach, beforeEach, expect, test } from "vitest";

import { readBackResponse } from "./_handler-fixtures.js";
import { executeContextSearch } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const SENTINEL = { stdout: "\nNo matches found.\n", exitCode: 0 };

// =================== US1 — the query is sent as one quoted phrase ===================

test("C1 a multi-word query is sent as one double-quoted phrase", async () => {
  const wire = [{ file: "a.md", matches: [{ line: 3, text: "alpha beta" }] }];
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
    readBackResponse(wire),
  ]);
  const r = await executeContextSearch({ query: "alpha beta" }, deps(spawnFn));
  expect(recorded[0]!.argv).toContain('query="alpha beta"');
  expect(r).toEqual({ count: 1, matches: [{ path: "a.md", line: 3, text: "alpha beta" }] });
});

test.each([
  ["alpha ", 'query="alpha "'],
  [" alpha", 'query=" alpha"'],
])("C3 surrounding whitespace is kept inside the quotes: %j", async (query, expected) => {
  const { spawnFn, recorded } = makeQueuedSpawn([SENTINEL]);
  await executeContextSearch({ query }, deps(spawnFn));
  expect(recorded[0]!.argv).toContain(expected);
});

test("C8 a missing folder still errors through the probe; the search carried the quoted query", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    SENTINEL,
    { stdout: 'Error: Folder "Missing" not found.\n', exitCode: 0 },
  ]);
  const err = await captureRejection(
    executeContextSearch({ query: "alpha beta", folder: "Missing" }, deps(spawnFn)),
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
  expect(recorded[0]!.argv).toContain('query="alpha beta"');
});

test.each([true, false])(
  "C9 a multi-word query keeps its case inside the quotes (case_sensitive: %s)",
  async (caseSensitive) => {
    const { spawnFn, recorded } = makeQueuedSpawn([SENTINEL]);
    await executeContextSearch(
      { query: "ALPHA BETA", ...(caseSensitive ? { case_sensitive: true } : {}) },
      deps(spawnFn),
    );
    const argv = recorded[0]!.argv;
    expect(argv).toContain('query="ALPHA BETA"');
    if (caseSensitive) {
      expect(argv).toContain("case=true");
    } else {
      expect(argv.find((a) => a.startsWith("case="))).toBeUndefined();
    }
  },
);

// =================== US2 — each matching line is returned once ===================

function fileWithLines(file: string, lines: number[], text = "alpha beta") {
  return { file, matches: lines.map((line) => ({ line, text })) };
}

test("C4 a line listed once per occurrence appears once, across files", async () => {
  const wire = [fileWithLines("a.md", [2, 2, 5]), fileWithLines("b.md", [1, 1])];
  const { spawnFn } = makeQueuedSpawn([{ stdout: JSON.stringify(wire), exitCode: 0 }, readBackResponse(wire)]);
  const r = await executeContextSearch({ query: "alpha beta" }, deps(spawnFn));
  expect(r).toEqual({
    count: 3,
    matches: [
      { path: "a.md", line: 2, text: "alpha beta" },
      { path: "a.md", line: 5, text: "alpha beta" },
      { path: "b.md", line: 1, text: "alpha beta" },
    ],
  });
});

test("C5 truncation counts lines: 2 distinct lines at limit 2 is truncated", async () => {
  const wire = [fileWithLines("a.md", [1, 1, 1]), fileWithLines("b.md", [1])];
  const { spawnFn } = makeQueuedSpawn([{ stdout: JSON.stringify(wire), exitCode: 0 }, readBackResponse(wire)]);
  const r = await executeContextSearch({ query: "alpha beta", limit: 2 }, deps(spawnFn));
  expect(r).toEqual({
    count: 2,
    matches: [
      { path: "a.md", line: 1, text: "alpha beta" },
      { path: "b.md", line: 1, text: "alpha beta" },
    ],
    truncated: true,
  });
});

test("C6 the CR strip still applies after one entry per line is kept", async () => {
  const wire = [fileWithLines("a.md", [1, 1], "x\r")];
  const { spawnFn } = makeQueuedSpawn([{ stdout: JSON.stringify(wire), exitCode: 0 }, readBackResponse(wire)]);
  const r = await executeContextSearch({ query: "alpha beta" }, deps(spawnFn));
  expect(r).toEqual({ count: 1, matches: [{ path: "a.md", line: 1, text: "x" }] });
});

test("C7 a line-break query returns no lines and runs no folder probe", async () => {
  const wire = [fileWithLines("a.md", [1])];
  const { spawnFn, getCount } = makeQueuedSpawn([{ stdout: JSON.stringify(wire), exitCode: 0 }]);
  const r = await executeContextSearch({ query: "a\nb", folder: "Projects" }, deps(spawnFn));
  expect(r).toEqual({ count: 0, matches: [] });
  expect(getCount()).toBe(1);
});

// =================== US3 — search-syntax characters are matched as text ===================

test("C2 every search-syntax character group reaches the CLI as text inside the phrase", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SENTINEL]);
  const r = await executeContextSearch(
    { query: '"hello" -x tag:y /z/ [p] (q) a*b c\\d' },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain('query="\\"hello\\" -x tag:y /z/ [p] (q) a*b c\\\\d"');
  expect(r).toEqual({ count: 0, matches: [] });
});
