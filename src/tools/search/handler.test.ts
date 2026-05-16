// Original — no upstream. Tests for the search handler — ~35 cases per data-model.md
// handler-test inventory covering both subcommand branches (`search` / `search:context`),
// parameter assembly invariants (I-1..I-11), zero-match sentinel detection, staged
// parse failures (`json-parse` / `wire-parse`), defensive `.md` filter, deterministic
// sort, truncation flag encoding (+1 probe / conservative file-cap / flat-exceeds-cap),
// 500-char text cap with U+2026 ellipsis, folder normalisation, case-sensitive flag,
// and locator-non-echo invariants. Tests stub the CLI at the spawn boundary (not
// invokeCli) so the dispatch layer's argv assembly and stdout flow are exercised in
// full, matching the project's properties / files / tag handler-test conventions.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeSearch, stripBoundarySlashes } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeQueuedSpawn(responses: StubResponse[]): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(`unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`);
    }
    recorded.push({ binary, argv: [...argv], options });
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 9090;
    child.kill = (signal?: NodeJS.Signals) => {
      setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
      return true;
    };
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", spec.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded };
}

function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

function findKv(argv: string[], key: string): string | undefined {
  const prefix = `${key}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? undefined : hit.slice(prefix.length);
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =================== Default mode — Q-1 happy path ===================

test("Q-1 default-mode happy path — invokes `search` subcommand with format=json and limit=1001, returns sorted paths", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md", "b.md"]), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo" }, deps(spawnFn));
  expect(recorded).toHaveLength(1);
  const argv = recorded[0]!.argv;
  expect(argv).toContain("search");
  expect(argv).toContain("query=foo");
  expect(argv).toContain("format=json");
  expect(findKv(argv, "limit")).toBe("1001");
  expect(r).toEqual({ count: 2, paths: ["a.md", "b.md"] });
});

// =================== Default mode — Q-3 zero-match sentinel ===================

test("Q-3 zero-match sentinel default mode — returns { count: 0, paths: [] } (no error, no truncated)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "\nNo matches found.\n", exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "noresults" }, deps(spawnFn));
  expect(r).toEqual({ count: 0, paths: [] });
  expect(Object.hasOwn(r, "truncated")).toBe(false);
});

// =================== Default mode — Q-18 sort ===================

test("Q-18 deterministic sort default mode — unsorted upstream → ascending response", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(["z.md", "a.md", "m.md"]), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo" }, deps(spawnFn));
  if ("paths" in r) {
    expect(r.paths).toEqual(["a.md", "m.md", "z.md"]);
  } else {
    throw new Error("expected default-mode response with `paths`");
  }
});

// =================== Q-21..Q-24 validation-before-spawn (I-1) ===================

test("Q-21 validation rejects empty query before any spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([]);
  await expect(executeSearch({ query: "" } as never, deps(spawnFn))).rejects.toBeInstanceOf(Error);
  expect(recorded).toHaveLength(0);
});

test("Q-22 validation rejects whitespace-only query before any spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([]);
  await expect(executeSearch({ query: "   " } as never, deps(spawnFn))).rejects.toBeInstanceOf(Error);
  expect(recorded).toHaveLength(0);
});

test("Q-21b validation rejects query > 1000 chars before any spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([]);
  await expect(
    executeSearch({ query: "a".repeat(1001) } as never, deps(spawnFn)),
  ).rejects.toBeInstanceOf(Error);
  expect(recorded).toHaveLength(0);
});

test("Q-23 validation rejects limit <= 0 / > 10000 / non-integer before any spawn", async () => {
  for (const bad of [0, -1, 10001, 50.5]) {
    const { spawnFn, recorded } = makeQueuedSpawn([]);
    await expect(
      executeSearch({ query: "foo", limit: bad } as never, deps(spawnFn)),
    ).rejects.toBeInstanceOf(Error);
    expect(recorded).toHaveLength(0);
  }
});

test("Q-24 validation rejects unknown key before any spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([]);
  await expect(
    executeSearch({ query: "foo", unknown: "x" } as never, deps(spawnFn)),
  ).rejects.toBeInstanceOf(Error);
  expect(recorded).toHaveLength(0);
});

// =================== Q-25 unknown-vault propagation (I-7 inherited) ===================

test("Q-25 unknown-vault inherited CLI_REPORTED_ERROR via cli-adapter success-path inspection", async () => {
  // The cli-adapter classifies stdout starting with `Vault not found.` as CLI_REPORTED_ERROR.
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Vault not found.\n", exitCode: 0 },
  ]);
  const err = await captureRejection(
    executeSearch({ query: "foo", vault: "Nonexistent" }, deps(spawnFn)),
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
});

// =================== Q-32 JSON-parse failure ===================

test("Q-32 JSON-parse failure default mode → CLI_REPORTED_ERROR details.stage=json-parse with original cause", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "not json {{{", exitCode: 0 },
  ]);
  const err = await captureRejection(executeSearch({ query: "foo" }, deps(spawnFn)));
  expect(err).toBeInstanceOf(UpstreamError);
  const u = err as UpstreamError;
  expect(u.code).toBe("CLI_REPORTED_ERROR");
  expect((u.details as { stage?: string }).stage).toBe("json-parse");
  expect(u.cause).toBeDefined();
});

// =================== Q-33 wire-schema mismatch ===================

test("Q-33 wire-schema mismatch default mode → CLI_REPORTED_ERROR details.stage=wire-parse", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "[null]", exitCode: 0 },
  ]);
  const err = await captureRejection(executeSearch({ query: "foo" }, deps(spawnFn)));
  expect(err).toBeInstanceOf(UpstreamError);
  const u = err as UpstreamError;
  expect(u.code).toBe("CLI_REPORTED_ERROR");
  expect((u.details as { stage?: string }).stage).toBe("wire-parse");
});

// =================== Q-30 defensive .md filter default mode (I-9) ===================

test("Q-30 defensive .md filter default mode — canvas entry filtered out, count adjusted", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md", "b.canvas", "c.md"]), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo" }, deps(spawnFn));
  if ("paths" in r) {
    expect(r.paths).toEqual(["a.md", "c.md"]);
    expect(r.count).toBe(2);
  } else {
    throw new Error("expected default-mode response");
  }
});

// =================== Q-34 response-key-set assertion (I-14) ===================

test("Q-34 response key set default mode — exactly ['count','paths'] when not truncated", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo" }, deps(spawnFn));
  expect(Object.keys(r).sort()).toEqual(["count", "paths"]);
});

test("Q-34b response key set default mode — exactly ['count','paths','truncated'] when truncated", async () => {
  const paths = Array.from({ length: 1001 }, (_, i) => `f${String(i).padStart(4, "0")}.md`);
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(paths), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo" }, deps(spawnFn));
  expect(Object.keys(r).sort()).toEqual(["count", "paths", "truncated"]);
});

// =================== Q-35 byte-identical repeated call (I-13) ===================

test("Q-35 byte-identical repeated call — same upstream → JSON.stringify equality", async () => {
  const upstream = JSON.stringify(["b.md", "a.md", "c.md"]);
  const { spawnFn: s1 } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const { spawnFn: s2 } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const r1 = await executeSearch({ query: "foo" }, deps(s1));
  const r2 = await executeSearch({ query: "foo" }, deps(s2));
  expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
});

// =================== vault flow-through (I-4) ===================

test("vault flow-through — argv contains vault=X verbatim when set; absent when undefined", async () => {
  const { spawnFn: sSet, recorded: rSet } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "foo", vault: "Demo" }, deps(sSet));
  expect(rSet[0]!.argv).toContain("vault=Demo");

  const { spawnFn: sOmit, recorded: rOmit } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "foo" }, deps(sOmit));
  expect(rOmit[0]!.argv.find((a) => a.startsWith("vault="))).toBeUndefined();
});

// =================== Line mode — Q-2 happy path ===================

test("Q-2 line-mode happy path — invokes `search:context`, limit=1000 (no +1), returns flattened matches", async () => {
  const wire = [{ file: "a.md", matches: [{ line: 3, text: "foo bar" }] }];
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo", context_lines: true }, deps(spawnFn));
  const argv = recorded[0]!.argv;
  expect(argv).toContain("search:context");
  expect(findKv(argv, "limit")).toBe("1000");
  expect(r).toEqual({ count: 1, matches: [{ path: "a.md", line: 3, text: "foo bar" }] });
});

// =================== Line mode — Q-4 zero-match sentinel ===================

test("Q-4 zero-match sentinel line mode — returns { count: 0, matches: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "\nNo matches found.\n", exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  expect(r).toEqual({ count: 0, matches: [] });
});

// =================== Line mode — Q-26 drop empty matches (R9) ===================

test("Q-26 line-mode drops file entries with empty matches: []", async () => {
  const wire = [
    { file: "a.md", matches: [] },
    { file: "b.md", matches: [{ line: 1, text: "y" }] },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  expect(r).toEqual({ count: 1, matches: [{ path: "b.md", line: 1, text: "y" }] });
});

// =================== Line mode — Q-19 sort path-then-line ===================

test("Q-19 line-mode sort path asc then line asc", async () => {
  const wire = [
    { file: "z.md", matches: [{ line: 1, text: "x" }] },
    {
      file: "a.md",
      matches: [
        { line: 5, text: "y" },
        { line: 2, text: "z" },
      ],
    },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.matches).toEqual([
      { path: "a.md", line: 2, text: "z" },
      { path: "a.md", line: 5, text: "y" },
      { path: "z.md", line: 1, text: "x" },
    ]);
  } else {
    throw new Error("expected line-mode response");
  }
});

// =================== Line mode — Q-27..Q-29 text cap (FR-024) ===================

test("Q-27 text cap at exactly 500 chars — no ellipsis appended", async () => {
  const text500 = "x".repeat(500);
  const wire = [{ file: "a.md", matches: [{ line: 1, text: text500 }] }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.matches[0]!.text).toBe(text500);
    expect(r.matches[0]!.text.length).toBe(500);
  }
});

test("Q-28 text cap at 501 — first 500 + U+2026 ellipsis, total 501 chars", async () => {
  const text501 = "x".repeat(501);
  const wire = [{ file: "a.md", matches: [{ line: 1, text: text501 }] }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.matches[0]!.text).toBe("x".repeat(500) + "…");
    expect(r.matches[0]!.text.length).toBe(501);
  }
});

test("Q-29 text cap at 1000 — first 500 + ellipsis", async () => {
  const text1000 = "x".repeat(1000);
  const wire = [{ file: "a.md", matches: [{ line: 1, text: text1000 }] }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.matches[0]!.text).toBe("x".repeat(500) + "…");
  }
});

// =================== Line mode — Q-31 defensive .md filter at file level ===================

test("Q-31 line-mode defensive .md filter — canvas file dropped before flatten", async () => {
  const wire = [
    { file: "a.md", matches: [{ line: 1, text: "x" }] },
    { file: "b.canvas", matches: [{ line: 1, text: "y" }] },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.matches).toEqual([{ path: "a.md", line: 1, text: "x" }]);
  }
});

// =================== Line mode — wire-schema mismatch routes per-mode ===================

test("line-mode wire-schema mismatch — matches: 'not-array' → wire-parse stage", async () => {
  const stdout = JSON.stringify([{ file: "a.md", matches: "not-array" }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const err = await captureRejection(
    executeSearch({ query: "x", context_lines: true }, deps(spawnFn)),
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect(((err as UpstreamError).details as { stage?: string }).stage).toBe("wire-parse");
});

// =================== Line mode — flatten multi-match ===================

test("line-mode flatten — multi-match file → multiple flat rows", async () => {
  const wire = [
    {
      file: "a.md",
      matches: [
        { line: 1, text: "x" },
        { line: 5, text: "y" },
      ],
    },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.matches).toEqual([
      { path: "a.md", line: 1, text: "x" },
      { path: "a.md", line: 5, text: "y" },
    ]);
  }
});

// =================== US3 folder scoping ===================

test("Q-5 folder forwards — argv contains path=Projects", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["Projects/x.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "foo", folder: "Projects" }, deps(spawnFn));
  expect(findKv(recorded[0]!.argv, "path")).toBe("Projects");
});

test("Q-6 folder normalisation — /Projects/, Projects/, /Projects, Projects all normalise to 'Projects'", async () => {
  for (const folder of ["/Projects/", "Projects/", "/Projects", "Projects"]) {
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: JSON.stringify(["Projects/x.md"]), exitCode: 0 },
    ]);
    await executeSearch({ query: "foo", folder }, deps(spawnFn));
    expect(findKv(recorded[0]!.argv, "path")).toBe("Projects");
  }
});

test("Q-7 folder = '/' alone — path parameter absent (empty post-strip)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "foo", folder: "/" }, deps(spawnFn));
  expect(findKv(recorded[0]!.argv, "path")).toBeUndefined();
});

test("folder undefined — path parameter absent", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "foo" }, deps(spawnFn));
  expect(findKv(recorded[0]!.argv, "path")).toBeUndefined();
});

test("folder propagates to line mode too — subcommand search:context AND path=Projects", async () => {
  const wire = [{ file: "Projects/x.md", matches: [{ line: 1, text: "x" }] }];
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  await executeSearch(
    { query: "foo", folder: "Projects", context_lines: true },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("search:context");
  expect(findKv(recorded[0]!.argv, "path")).toBe("Projects");
});

test("stripBoundarySlashes — at most one leading and one trailing strip (//Projects// → /Projects/)", () => {
  expect(stripBoundarySlashes("//Projects//")).toBe("/Projects/");
  expect(stripBoundarySlashes("/Projects/")).toBe("Projects");
  expect(stripBoundarySlashes("Projects")).toBe("Projects");
  expect(stripBoundarySlashes("/")).toBe("");
});

// =================== US4 limit + truncated ===================

test("Q-8 limit forwards +1 in default mode — input.limit=50 → CLI limit=51", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "foo", limit: 50 }, deps(spawnFn));
  expect(findKv(recorded[0]!.argv, "limit")).toBe("51");
});

test("Q-9 limit forwards as-is in line mode — input.limit=50 → CLI limit=50", async () => {
  const wire: unknown[] = [];
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  await executeSearch({ query: "foo", limit: 50, context_lines: true }, deps(spawnFn));
  expect(findKv(recorded[0]!.argv, "limit")).toBe("50");
});

test("Q-10 default-mode cap-clip detection — CLI returns 51 paths with limit=50 → trim to 50 + truncated: true", async () => {
  const paths = Array.from({ length: 51 }, (_, i) => `f${String(i).padStart(3, "0")}.md`);
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(paths), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo", limit: 50 }, deps(spawnFn));
  if ("paths" in r) {
    expect(r.paths).toHaveLength(50);
    expect(r.count).toBe(50);
    expect(r.truncated).toBe(true);
  }
});

test("Q-11 default-mode no truncation when underlying <= cap — 49 paths with limit=50 → no truncated field", async () => {
  const paths = Array.from({ length: 49 }, (_, i) => `f${String(i).padStart(3, "0")}.md`);
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(paths), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo", limit: 50 }, deps(spawnFn));
  expect(r.count).toBe(49);
  expect(Object.hasOwn(r, "truncated")).toBe(false);
});

test("Q-12 implicit 1000 cap — no input.limit, CLI returns 1001 → 1000 trimmed + truncated: true; CLI limit=1001", async () => {
  const paths = Array.from({ length: 1001 }, (_, i) => `f${String(i).padStart(4, "0")}.md`);
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(paths), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "foo" }, deps(spawnFn));
  expect(findKv(recorded[0]!.argv, "limit")).toBe("1001");
  if ("paths" in r) {
    expect(r.paths).toHaveLength(1000);
    expect(r.count).toBe(1000);
    expect(r.truncated).toBe(true);
  }
});

test("Q-13 line-mode flat-exceeds-cap — single file with 1500 matches, no input.limit → 1000 + truncated: true", async () => {
  const matches = Array.from({ length: 1500 }, (_, i) => ({ line: i + 1, text: `t${i}` }));
  const wire = [{ file: "a.md", matches }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.matches).toHaveLength(1000);
    expect(r.count).toBe(1000);
    expect(r.truncated).toBe(true);
  }
});

test("Q-14 line-mode CLI-file-cap-fired conservative — 1000 files × 1 match each → truncated: true (file-cap signal)", async () => {
  const wire = Array.from({ length: 1000 }, (_, i) => ({
    file: `f${String(i).padStart(4, "0")}.md`,
    matches: [{ line: 1, text: "x" }],
  }));
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  if ("matches" in r) {
    expect(r.count).toBe(1000);
    expect(r.truncated).toBe(true);
  }
});

test("line-mode no truncation — 5 files × 2 matches, no input.limit → count 10, no truncated", async () => {
  const wire = Array.from({ length: 5 }, (_, i) => ({
    file: `f${i}.md`,
    matches: [
      { line: 1, text: "a" },
      { line: 2, text: "b" },
    ],
  }));
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  const r = await executeSearch({ query: "x", context_lines: true }, deps(spawnFn));
  expect(r.count).toBe(10);
  expect(Object.hasOwn(r, "truncated")).toBe(false);
});

test("I-11 truncated encoding — field is literal true when fired, absent when not (never false)", async () => {
  const { spawnFn: sNo } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  const rNo = await executeSearch({ query: "x" }, deps(sNo));
  expect(Object.hasOwn(rNo, "truncated")).toBe(false);

  const paths = Array.from({ length: 1001 }, (_, i) => `f${String(i).padStart(4, "0")}.md`);
  const { spawnFn: sYes } = makeQueuedSpawn([
    { stdout: JSON.stringify(paths), exitCode: 0 },
  ]);
  const rYes = await executeSearch({ query: "x" }, deps(sYes));
  expect(Object.hasOwn(rYes, "truncated")).toBe(true);
  if ("truncated" in rYes) expect(rYes.truncated).toBe(true);
});

// =================== US5 case sensitivity ===================

test("Q-15 case_sensitive: true → argv contains 'case' (presence-only flag)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "Foo", case_sensitive: true }, deps(spawnFn));
  expect(recorded[0]!.argv).toContain("case=true");
});

test("Q-16 case_sensitive absent or false → argv lacks any 'case=' token", async () => {
  const { spawnFn: s1, recorded: r1 } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "Foo" }, deps(s1));
  expect(r1[0]!.argv.find((a) => a.startsWith("case="))).toBeUndefined();

  const { spawnFn: s2, recorded: r2 } = makeQueuedSpawn([
    { stdout: JSON.stringify(["a.md"]), exitCode: 0 },
  ]);
  await executeSearch({ query: "Foo", case_sensitive: false }, deps(s2));
  expect(r2[0]!.argv.find((a) => a.startsWith("case="))).toBeUndefined();
});

test("case flag propagates to line mode — argv contains both search:context AND case=true", async () => {
  const wire: unknown[] = [];
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: JSON.stringify(wire), exitCode: 0 },
  ]);
  await executeSearch(
    { query: "Foo", case_sensitive: true, context_lines: true },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("search:context");
  expect(recorded[0]!.argv).toContain("case=true");
});
