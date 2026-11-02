// Original — no upstream. Tests for context_search's read-back (spec 088): batching under READ_BACK_CODE_MAX, reconciliation against the CLI text, and the MATCH_LINE_UNAVAILABLE error contract (R1–R16).
import { afterEach, beforeEach, expect, test } from "vitest";

import { readBackAnswer } from "./_handler-fixtures.js";
import { JS_TEMPLATE } from "./_template.js";
import { planReadBack, readBackLines, READ_BACK_CODE_MAX } from "./read-back.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, findKv, makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";
import { composeEvalCode } from "../_shared.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

interface Row {
  path: string;
  line: number;
  text: string;
}

/** A `read` answer giving each row's note line as `raw(row)`. */
function readAll(rows: Row[], raw: (row: Row) => string | null): StubResponse {
  return readBackAnswer(
    rows.map((r) => ({ path: r.path, state: "read", lines: [{ line: r.line, raw: raw(r) }] })),
  );
}

function linesOf(path: string, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ path, line: i + 1, text: `zqx ${i + 1}` }));
}

async function rejection(rows: Row[], responses: StubResponse[]): Promise<UpstreamError> {
  const { spawnFn } = makeQueuedSpawn(responses);
  const err = await captureRejection(readBackLines(rows, undefined, deps(spawnFn)));
  expect(err).toBeInstanceOf(UpstreamError);
  return err as UpstreamError;
}

function unavailable(reason: string, path: string, line: number, detail?: string) {
  return {
    code: "MATCH_LINE_UNAVAILABLE",
    reason,
    path,
    line,
    ...(detail === undefined ? {} : { detail }),
  };
}

test("R1 one eval for rows across two notes; texts are the note lines minus the \\r, in row order", async () => {
  const rows = [
    { path: "a.md", line: 2, text: "zqx a" },
    { path: "a.md", line: 7, text: "zqx b" },
    { path: "b.md", line: 1, text: "zqx c" },
  ];
  const { spawnFn, getCount } = makeQueuedSpawn([
    readBackAnswer([
      { path: "a.md", state: "read", lines: [{ line: 2, raw: "\tzqx a\r" }, { line: 7, raw: "zqx b  " }] },
      { path: "b.md", state: "read", lines: [{ line: 1, raw: "  zqx c" }] },
    ]),
  ]);
  expect(await readBackLines(rows, undefined, deps(spawnFn))).toEqual(["\tzqx a", "zqx b  ", "  zqx c"]);
  expect(getCount()).toBe(1);
});

test("R2 large results are batched under the code budget and restored in order", async () => {
  const notes = Array.from({ length: 200 }, (_, i) => ({
    path: `Notes/${String(i).padStart(3, "0")}-${"p".repeat(27)}.md`,
    line: 1,
    text: `zqx ${i}`,
  }));
  expect(notes[0]!.path).toHaveLength(40);
  const rows = [...linesOf("Big.md", 600), ...notes];
  const batches = planReadBack(rows);
  expect(batches.length).toBeGreaterThanOrEqual(2);
  for (const batch of batches) expect(composeEvalCode(JS_TEMPLATE, batch).length).toBeLessThanOrEqual(READ_BACK_CODE_MAX);
  expect(batches.filter((b) => b.some(([p]) => p === "Big.md")).length).toBeGreaterThanOrEqual(2);
  expect(batches.flatMap((b) => b.flatMap(([p, ls]) => ls.map((l) => `${p}:${l}`)))).toEqual(
    rows.map((r) => `${r.path}:${r.line}`),
  );

  const answer = readAll(rows, (r) => `  ${r.text}`);
  const { spawnFn, recorded } = makeQueuedSpawn(batches.map(() => answer));
  expect(await readBackLines(rows, undefined, deps(spawnFn))).toEqual(rows.map((r) => `  ${r.text}`));
  expect(recorded).toHaveLength(batches.length);
  for (const r of recorded) expect(findKv(r.argv, "code")!.length).toBeLessThan(3000);
});

test("R14 a single row with a 1,000-character path is one eval within the budget", async () => {
  const row = { path: `${"d".repeat(997)}.md`, line: 1, text: "zqx" };
  expect(planReadBack([row])).toEqual([[[row.path, [1]]]]);
  expect(composeEvalCode(JS_TEMPLATE, planReadBack([row])[0]).length).toBeLessThanOrEqual(READ_BACK_CODE_MAX);
  const { spawnFn, recorded } = makeQueuedSpawn([readAll([row], () => " zqx")]);
  expect(await readBackLines([row], undefined, deps(spawnFn))).toEqual([" zqx"]);
  expect(recorded).toHaveLength(1);
  expect(findKv(recorded[0]!.argv, "code")!.length).toBeLessThan(3000);
});

test("R3 every eval carries vault=X when the vault is named, and no vault= otherwise", async () => {
  const rows = linesOf("Big.md", 900);
  const batches = planReadBack(rows);
  expect(batches.length).toBeGreaterThanOrEqual(2);
  const answer = readAll(rows, (r) => r.text);

  const named = makeQueuedSpawn(batches.map(() => answer));
  await readBackLines(rows, "X", deps(named.spawnFn));
  expect(named.recorded).toHaveLength(batches.length);
  for (const r of named.recorded) expect(r.argv).toContain("vault=X");

  const focused = makeQueuedSpawn(batches.map(() => answer));
  await readBackLines(rows, undefined, deps(focused.spawnFn));
  for (const r of focused.recorded) expect(findKv(r.argv, "vault")).toBeUndefined();
});

test("R4 a note that no longer exists fails with note-not-found", async () => {
  const err = await rejection(
    [{ path: "a.md", line: 3, text: "zqx" }],
    [readBackAnswer([{ path: "a.md", state: "note-not-found" }])],
  );
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.cause).toBeNull();
  expect(err.details).toEqual(unavailable("note-not-found", "a.md", 3));
  expect(err.message).toBe(
    'context_search: line 3 of "a.md" could not be read back (note-not-found); the note may have changed during the search. Run the search again.',
  );
});

test("R5 a failed read carries its detail", async () => {
  const err = await rejection(
    [{ path: "a.md", line: 1, text: "zqx" }],
    [readBackAnswer([{ path: "a.md", state: "read-failed", detail: "boom" }])],
  );
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual(unavailable("read-failed", "a.md", 1, "boom"));
});

test("R6 a line past the note's end is line-changed", async () => {
  const row = { path: "a.md", line: 9, text: "zqx" };
  const err = await rejection([row], [readAll([row], () => null)]);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual(unavailable("line-changed", "a.md", 9));
});

test("R7 a line whose trimmed text differs from the CLI's is line-changed", async () => {
  const row = { path: "a.md", line: 2, text: "zqx old" };
  const err = await rejection([row], [readAll([row], () => "  zqx new  ")]);
  expect(err.details).toEqual(unavailable("line-changed", "a.md", 2));
});

test("R8 trim equality accepts the untrimmed line and drops one trailing \\r", async () => {
  const rows = [
    { path: "a.md", line: 1, text: "x" },
    { path: "a.md", line: 2, text: "x" },
  ];
  const raws: Record<number, string> = { 1: " x\t", 2: "  x  \r" };
  const { spawnFn } = makeQueuedSpawn([readAll(rows, (r) => raws[r.line]!)]);
  expect(await readBackLines(rows, undefined, deps(spawnFn))).toEqual([" x\t", "  x  "]);
});

test("R9 two failing rows in different notes: the first in output order is named", async () => {
  const rows = [
    { path: "a.md", line: 4, text: "zqx a" },
    { path: "b.md", line: 1, text: "zqx b" },
  ];
  const err = await rejection(rows, [
    readBackAnswer([
      { path: "b.md", state: "note-not-found" },
      { path: "a.md", state: "read", lines: [{ line: 4, raw: "changed" }] },
    ]),
  ]);
  expect(err.details).toEqual(unavailable("line-changed", "a.md", 4));
});

test.each([
  ["an answer that is not JSON", { stdout: "=> not json\n", exitCode: 0 }],
  ["no tagged answer", { stdout: "", exitCode: 0 }],
])("R10 %s fails at stage json-parse", async (_label, response) => {
  const err = await rejection([{ path: "a.md", line: 1, text: "zqx" }], [response]);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("context_search: line read-back eval returned unparseable response");
  expect(err.details).toMatchObject({ stage: "json-parse" });
  expect(err.details).toHaveProperty("stdout");
  expect(err.details).toHaveProperty("stdoutLength");
});

test.each([
  ["a missing line", readBackAnswer([{ path: "a.md", state: "read", lines: [{ line: 2, raw: "zqx" }] }])],
  ["a missing path", readBackAnswer([{ path: "b.md", state: "read", lines: [{ line: 1, raw: "zqx" }] }])],
  ["a wrong shape", readBackAnswer([{ path: "a.md", state: "read", lines: "zqx" }])],
  ["an unknown state", readBackAnswer([{ path: "a.md", state: "gone" }])],
])("R11 an answer with %s fails at stage envelope-parse", async (_label, response) => {
  const err = await rejection([{ path: "a.md", line: 1, text: "zqx" }], [response]);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("context_search: line read-back eval returned unexpected shape");
  expect(err.details).toMatchObject({ stage: "envelope-parse" });
  expect(err.details).toHaveProperty("stdoutLength");
});

test("R12 an eval that exits non-zero propagates invokeEval's error unchanged", async () => {
  const err = await rejection([{ path: "a.md", line: 1, text: "zqx" }], [{ stdout: "", stderr: "boom", exitCode: 2 }]);
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

test("R13 a second batch failing after the first succeeded fails the whole call", async () => {
  const rows = linesOf("Big.md", 900);
  expect(planReadBack(rows).length).toBeGreaterThanOrEqual(2);
  const err = await rejection(rows, [readAll(rows, (r) => r.text), { stdout: "", stderr: "boom", exitCode: 2 }]);
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

test("R15 a byte-order mark is dropped from line 1 only", async () => {
  const rows = [
    { path: "a.md", line: 1, text: "zqx bom" },
    { path: "a.md", line: 2, text: "zqx" },
  ];
  const raws: Record<number, string> = { 1: "﻿  zqx bom", 2: "﻿zqx" };
  const { spawnFn } = makeQueuedSpawn([readAll(rows, (r) => raws[r.line]!)]);
  expect(await readBackLines(rows, undefined, deps(spawnFn))).toEqual(["  zqx bom", "﻿zqx"]);
});

test("R16 a note's state applies to its rows in every batch", async () => {
  const rows = linesOf("Big.md", 900);
  const batches = planReadBack(rows);
  expect(batches.length).toBeGreaterThanOrEqual(2);
  const err = await rejection(rows, [
    readAll(rows, (r) => r.text),
    ...batches.slice(1).map(() => readBackAnswer([{ path: "Big.md", state: "note-not-found" }])),
  ]);
  expect(err.details).toEqual(unavailable("note-not-found", "Big.md", 1));
});
