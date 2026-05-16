// Original — no upstream. Tests for the find_by_property handler — single-call argv assembly, base64 payload round-trip (R6 anti-injection lock), eval response parsing with => prefix, unknown-vault inheritance (R5), CLI error propagation, count/paths invariant, FR-023/FR-024 wrapper-non-transformation locks.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeFindByProperty } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: unknown;
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
    if (spec.errorOnSpawn) {
      throw spec.errorOnSpawn;
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
    child.pid = 4242;
    child.kill = (signal?: NodeJS.Signals) => {
      setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
      return true;
    };
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => {
        const closeCode = "exitCode" in spec ? (spec.exitCode ?? null) : 0;
        const closeSignal = "signal" in spec ? (spec.signal ?? null) : null;
        child.emit("exit", closeCode, closeSignal);
      });
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded };
}

function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

function decodePayload(argv: string[]): unknown {
  const codeArg = argv.find((a) => a.startsWith("code="));
  if (!codeArg) throw new Error("argv missing code= parameter");
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  if (!match) throw new Error("argv code= does not contain base64 atob(...) payload");
  return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"));
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// (1) US1 AC#1 — scalar string happy path
test("scalar string happy-path: { count: 1, paths: ['backlog/BI-030.md'] } (US1 AC#1)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["backlog/BI-030.md"]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "id", value: "BI-030", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 1, paths: ["backlog/BI-030.md"] });
  expect(recorded).toHaveLength(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  expect(argv[2]!.startsWith("code=")).toBe(true);
  expect(decodePayload(argv)).toEqual({
    property: "id",
    value: "BI-030",
    folder: "",
    arrayMatch: true,
    caseSensitive: true,
  });
});

// (2) US1 AC#4 — type-faithful number
test("type-faithful number value: payload encodes 7 as JSON number (US1 AC#4)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "count", value: 7, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { value: unknown };
  expect(payload.value).toBe(7);
  expect(typeof payload.value).toBe("number");
});

// (3) US1 AC#5 — type-faithful boolean
test("type-faithful boolean value: payload encodes true as JSON boolean (US1 AC#5)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "archived", value: true, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { value: unknown };
  expect(payload.value).toBe(true);
});

// (4) FR-014 — explicit-null query
test("explicit-null query: payload encodes null as JSON null (FR-014)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":2,"paths":["a.md","b.md"]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "explicit_null", value: null, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 2, paths: ["a.md", "b.md"] });
  const payload = decodePayload(recorded[0]!.argv) as { value: unknown };
  expect(payload.value).toBeNull();
});

// (5) US1 AC#3 — no-match returns {count:0, paths:[]}, no error
test("no-match: returns { count: 0, paths: [] } without error (US1 AC#3)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"count":0,"paths":[]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "id", value: "missing", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
});

// (6) US1 AC#2 — multi-match
test("multi-match: count and paths.length agree (US1 AC#2)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"count":3,"paths":["a.md","b.md","c.md"]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "status", value: "queued", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result.count).toBe(3);
  expect(result.paths).toHaveLength(3);
});

// (7) US2 AC#1 — folder-narrow happy-path
test("folder-narrow: payload carries folder='backlog' (US2 AC#1)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["backlog/BI-030.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "id", value: "BI-030", folder: "backlog", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { folder: unknown };
  expect(payload.folder).toBe("backlog");
});

// (8) US2 AC#2 — folder-exclude returns no-match
test("folder-exclude: payload carries folder='archive' AND no-match envelope (US2 AC#2)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":0,"paths":[]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "id", value: "BI-030", folder: "archive", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
  const payload = decodePayload(recorded[0]!.argv) as { folder: unknown };
  expect(payload.folder).toBe("archive");
});

// (9) US3 AC#1 — arrayMatch: true (default) — payload check
test("arrayMatch: true defaulted in payload (US3 AC#1)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "tags", value: "alpha", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { arrayMatch: unknown; value: unknown };
  expect(payload.arrayMatch).toBe(true);
  expect(payload.value).toBe("alpha");
});

// (10) US3 AC#3 — arrayMatch: false with array value — payload check
test("arrayMatch: false with array value: payload preserves array exactly (US3 AC#3)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "tags", value: ["alpha", "beta"], arrayMatch: false, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { arrayMatch: unknown; value: unknown };
  expect(payload.arrayMatch).toBe(false);
  expect(payload.value).toEqual(["alpha", "beta"]);
});

// (11) US4 AC#2 — caseSensitive: false — payload check
test("caseSensitive: false propagates into payload (US4 AC#2)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "tag", value: "alpha", arrayMatch: true, caseSensitive: false },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { caseSensitive: unknown };
  expect(payload.caseSensitive).toBe(false);
});

// (12) FR-003 — vault omitted → no vault= in argv (active-mode mapping)
test("vault omitted: argv has no vault= prefix (R4 active-mode mapping, FR-003)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { property: "id", value: "BI-030", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv[0]).toBe("eval");
  expect(decodePayload(argv)).toEqual({
    property: "id",
    value: "BI-030",
    folder: "",
    arrayMatch: true,
    caseSensitive: true,
  });
});

// (13) FR-003 — vault supplied → vault= in argv (specific-mode mapping)
test("vault supplied: argv[0] starts with vault= (R4 specific-mode mapping)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":0,"paths":[]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "MyVault", property: "id", value: "x", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv[0]).toBe("vault=MyVault");
});

// (14) US6 AC#1 — unknown vault → CLI_REPORTED_ERROR (R5 inheritance)
test("unknown vault → CLI_REPORTED_ERROR (cli-adapter R5 inheritance, US6 AC#1)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Vault not found.\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeFindByProperty(
      { vault: "NoSuchVault", property: "id", value: "x", arrayMatch: true, caseSensitive: true },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (15) FR-019 — CLI_NON_ZERO_EXIT propagation
test("non-zero exit on eval → CLI_NON_ZERO_EXIT verbatim (FR-019)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stderr: "eval syntax error", exitCode: 1 },
  ]);
  const err = (await captureRejection(
    executeFindByProperty(
      { vault: "Demo", property: "id", value: "x", arrayMatch: true, caseSensitive: true },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("eval syntax error");
});

// (16) FR-019 — CLI_BINARY_NOT_FOUND propagation
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND (FR-019)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeQueuedSpawn([
    { errorOnSpawn: enoent },
  ]);
  const err = (await captureRejection(
    executeFindByProperty(
      { vault: "Demo", property: "id", value: "x", arrayMatch: true, caseSensitive: true },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// (17) FR-019 / FR-012 — output cap kill propagation (large match set)
test("dispatch kill (output cap) → CLI_NON_ZERO_EXIT (FR-012, FR-019)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stderr: "output cap exceeded", exitCode: null, signal: "SIGTERM" },
  ]);
  const err = (await captureRejection(
    executeFindByProperty(
      { vault: "Demo", property: "category", value: "bulk", arrayMatch: true, caseSensitive: true },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// (18) Tolerant parse — eval response without `=> ` prefix parses anyway
test("eval response without '=> ' prefix parses as bare JSON", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "id", value: "x", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 1, paths: ["x.md"] });
});

// (19) Malformed JSON → CLI_REPORTED_ERROR with stage='json-parse'
test("malformed JSON eval response → CLI_REPORTED_ERROR (stage: json-parse)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "=> not-valid-json\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeFindByProperty(
      { vault: "Demo", property: "id", value: "x", arrayMatch: true, caseSensitive: true },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

// (20) Schema-violating shape → CLI_REPORTED_ERROR with stage='schema-parse'
test("eval response shape violates output schema → CLI_REPORTED_ERROR (stage: schema-parse)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"wrong":"shape"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeFindByProperty(
      { vault: "Demo", property: "id", value: "x", arrayMatch: true, caseSensitive: true },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("schema-parse");
});

// (21) R6 anti-injection — value with single quote / JS injection attempt survives base64 round-trip
test("anti-injection (R6): hostile value survives base64 round-trip exactly (SC-017)", async () => {
  const hostile = "'; alert(1); //";
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":0,"paths":[]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "key", value: hostile, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="))!;
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  expect(match).not.toBeNull();
  // The base64 alphabet is structurally constrained — no quotes, no JS metachars
  expect(/^[A-Za-z0-9+/=]+$/.test(match![1]!)).toBe(true);
  const payload = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf-8")) as { value: unknown };
  expect(payload.value).toBe(hostile);
});

// (22) R6 anti-injection — property field also passes through structurally
test("anti-injection (R6): hostile property survives base64 round-trip exactly", async () => {
  const hostile = "name'; drop";
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":0,"paths":[]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: hostile, value: "x", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { property: unknown };
  expect(payload.property).toBe(hostile);
});

// (BI-034 US3) Non-ASCII value match (em-dash + accented)
test("BI-034 US3 (a): em-dash + accented value round-trips through base64 (FR-009)", async () => {
  const value = "café — naïve";
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["Fixtures/BI-038/tc-mojibake-fbp.md"]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "unicode_marker", value, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 1, paths: ["Fixtures/BI-038/tc-mojibake-fbp.md"] });
  const payload = decodePayload(recorded[0]!.argv) as { value: unknown };
  expect(payload.value).toBe(value);
});

// (BI-034 US3) CJK value
test("BI-034 US3 (b): CJK value round-trips through base64 (FR-009)", async () => {
  const value = "你好世界";
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "marker", value, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { value: unknown };
  expect(payload.value).toBe(value);
});

// (BI-034 US3) Emoji value
test("BI-034 US3 (c): emoji value round-trips through base64 (FR-009)", async () => {
  const value = "🎉 launch";
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "marker", value, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { value: unknown };
  expect(payload.value).toBe(value);
});

// (BI-034 US3) Interleaved ASCII / non-ASCII value
test("BI-034 US3 (d): interleaved ASCII + non-ASCII value preserved verbatim (FR-009)", async () => {
  const value = "Release v1.0 — résumé draft";
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "title", value, arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { value: unknown };
  expect(payload.value).toBe(value);
});

// (BI-034 US3) Selectivity — non-ASCII value differs from ASCII fallback
test("BI-034 US3 (e): selectivity — non-ASCII value payload distinct from ASCII variant (FR-009)", async () => {
  const { spawnFn: spawnA, recorded: recordedA } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["café-note.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "marker", value: "café", arrayMatch: true, caseSensitive: true },
    deps(spawnA),
  );
  const payloadA = decodePayload(recordedA[0]!.argv) as { value: unknown };
  expect(payloadA.value).toBe("café");

  const { spawnFn: spawnB, recorded: recordedB } = makeQueuedSpawn([
    { stdout: '=> {"count":1,"paths":["cafe-note.md"]}\n', exitCode: 0 },
  ]);
  await executeFindByProperty(
    { vault: "Demo", property: "marker", value: "cafe", arrayMatch: true, caseSensitive: true },
    deps(spawnB),
  );
  const payloadB = decodePayload(recordedB[0]!.argv) as { value: unknown };
  expect(payloadB.value).toBe("cafe");
  expect(payloadA.value).not.toBe(payloadB.value);
});

// (23) FR-023 — hierarchical-tag rollup not performed (wrapper-side non-transformation lock)
test("FR-023: wrapper does not transform value 'work' to a rollup query", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":0,"paths":[]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "tags", value: "work", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
  const payload = decodePayload(recorded[0]!.argv) as { property: unknown; value: unknown };
  expect(payload.property).toBe("tags");
  expect(payload.value).toBe("work");
});

// (24) FR-024 — list-of-mappings query yields no-match envelope (no defensive type check at handler)
test("FR-024: scalar query against list-of-mappings property surfaces as no-match", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"count":0,"paths":[]}\n', exitCode: 0 },
  ]);
  const result = await executeFindByProperty(
    { vault: "Demo", property: "entries", value: "x", arrayMatch: true, caseSensitive: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
  const payload = decodePayload(recorded[0]!.argv) as { property: unknown; value: unknown };
  expect(payload.property).toBe("entries");
  expect(payload.value).toBe("x");
});
