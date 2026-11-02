// Original — no upstream. context_search handler tests for untrimmed line text (spec 088): H20–H35 through executeContextSearch with the search stub plus the read-back stub.
import { afterEach, beforeEach, expect, test } from "vitest";

import { readBackAnswer, readBackResponse } from "./_handler-fixtures.js";
import { executeContextSearch } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, findKv, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

/** One matched line whose note text is `raw` while the CLI reports it trimmed. */
async function textFor(raw: string, line = 4) {
  const wire = [{ file: "a.md", matches: [{ line, text: raw.trim() }] }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
    readBackResponse(wire, () => raw),
  ]);
  const r = await executeContextSearch({ query: "zqx" }, deps(spawnFn));
  expect(r.count).toBe(1);
  return r.matches[0]!.text;
}

test.each([
  ["H20 a leading tab is kept", "\tzqx tab", "\tzqx tab"],
  ["H21 leading spaces are kept", "    zqx four", "    zqx four"],
  ["H22 a line without edge whitespace is unchanged", "zqx plain", "zqx plain"],
  ["H23 trailing spaces are kept", "zqx two  ", "zqx two  "],
  ["H24 a CRLF line loses its \\r", "zqx crlf\r", "zqx crlf"],
  ["H25 trailing spaces before a CRLF ending are kept", "zqx crlf  \r", "zqx crlf  "],
  ["H26 a trailing tab is kept", "zqx tab\t", "zqx tab\t"],
])("%s", async (_label, raw, expected) => {
  expect(await textFor(raw)).toBe(expected);
});

test("H27 the 500-character cap applies after the read-back, so leading whitespace counts", async () => {
  const raw = "      " + "a".repeat(600);
  expect(await textFor(raw)).toBe(raw.slice(0, 500) + "…");
});

test("H28 a line of exactly 500 characters with leading spaces is not cut", async () => {
  // The contract row says 498 spaces, but 498 + "zqx" is 501 characters; 497 gives the 500-character boundary it names.
  const text = await textFor(" ".repeat(497) + "zqx");
  expect(text).toBe(" ".repeat(497) + "zqx");
  expect(text).toHaveLength(500);
  expect(text.endsWith("…")).toBe(false);
});

test("H29 count, truncation, paths, lines and order come from the unchanged selection", async () => {
  const wire = [
    { file: "c.md", matches: [{ line: 1, text: "zqx c1" }] },
    { file: "a.md", matches: [{ line: 3, text: "zqx a3" }, { line: 1, text: "zqx a1" }] },
    { file: "b.md", matches: [{ line: 2, text: "zqx b2" }] },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
    readBackResponse(wire, (_p, _l, text) => ` ${text} `),
  ]);
  const r = await executeContextSearch({ query: "zqx", limit: 2 }, deps(spawnFn));
  expect(r).toEqual({
    count: 2,
    matches: [
      { path: "a.md", line: 1, text: " zqx a1 " },
      { path: "a.md", line: 3, text: " zqx a3 " },
    ],
    truncated: true,
  });
});

test("H30 a zero-match search makes no read-back, with or without a folder", async () => {
  const bare = makeQueuedSpawn([{ stdout: "\nNo matches found.\n", exitCode: 0 }]);
  expect(await executeContextSearch({ query: "zqx" }, deps(bare.spawnFn))).toEqual({ count: 0, matches: [] });
  expect(bare.getCount()).toBe(1);

  const scoped = makeQueuedSpawn([
    { stdout: "\nNo matches found.\n", exitCode: 0 },
    { stdout: "Sandbox\n", exitCode: 0 },
  ]);
  expect(await executeContextSearch({ query: "zqx", folder: "Sandbox" }, deps(scoped.spawnFn))).toEqual({
    count: 0,
    matches: [],
  });
  expect(scoped.getCount()).toBe(2);
});

test("H31 a note gone before the read-back fails the whole call", async () => {
  const wire = [
    { file: "a.md", matches: [{ line: 1, text: "zqx a" }] },
    { file: "b.md", matches: [{ line: 2, text: "zqx b" }] },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
    readBackAnswer([
      { path: "a.md", state: "read", lines: [{ line: 1, raw: "zqx a" }] },
      { path: "b.md", state: "note-not-found" },
    ]),
  ]);
  const err = await captureRejection(executeContextSearch({ query: "zqx" }, deps(spawnFn)));
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
  expect((err as UpstreamError).details).toEqual({
    code: "MATCH_LINE_UNAVAILABLE",
    reason: "note-not-found",
    path: "b.md",
    line: 2,
  });
});

test("H32 a line that changed before the read-back fails with line-changed", async () => {
  const wire = [{ file: "a.md", matches: [{ line: 1, text: "zqx old" }] }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
    readBackResponse(wire, () => "zqx new"),
  ]);
  const err = await captureRejection(executeContextSearch({ query: "zqx" }, deps(spawnFn)));
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
  expect((err as UpstreamError).details).toEqual({
    code: "MATCH_LINE_UNAVAILABLE",
    reason: "line-changed",
    path: "a.md",
    line: 1,
  });
});

test("H33 the search and the read-back both carry vault=V", async () => {
  const wire = [{ file: "a.md", matches: [{ line: 1, text: "zqx" }] }];
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
    readBackResponse(wire),
  ]);
  await executeContextSearch({ query: "zqx", vault: "V" }, deps(spawnFn));
  expect(recorded).toHaveLength(2);
  expect(recorded[0]!.argv).toContain("search:context");
  expect(findKv(recorded[1]!.argv, "code")).toBeDefined();
  for (const r of recorded) expect(r.argv).toContain("vault=V");
});

test("H34 line 1 loses a byte-order mark and keeps its indentation", async () => {
  expect(await textFor("﻿\tzqx bom", 1)).toBe("\tzqx bom");
});

test("H35 a line the search lists twice is one row with its whitespace", async () => {
  const wire = [{ file: "a.md", matches: [{ line: 3, text: "zqx dup" }, { line: 3, text: "zqx dup" }] }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
    readBackResponse(wire, () => "  zqx dup  "),
  ]);
  expect(await executeContextSearch({ query: "zqx" }, deps(spawnFn))).toEqual({
    count: 1,
    matches: [{ path: "a.md", line: 3, text: "  zqx dup  " }],
  });
});
