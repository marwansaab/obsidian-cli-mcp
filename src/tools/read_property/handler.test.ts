// Original — no upstream. Tests for the read_property handler — TWO-CALL argv assembly (Call A + Call B), JSON.parse + name extraction, R6 type translation, R7 short-circuit, R3/R4 active mode, US4 heterogeneous-list downgrade, UpstreamError propagation, null-disambiguation triplet, CLI error code propagation.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeReadProperty } from "./handler.js";
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

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// (1) Story 1 AC#1 — text property happy path (Call A + Call B argv lock)
test("text property happy path: Call A returns value, Call B returns type=text (Story 1 AC#1)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '{"status":"in-progress"}\n', exitCode: 0 },
    { stdout: '[{"name":"status","type":"text","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: "in-progress", type: "text" });
  expect(recorded.map((r) => r.argv)).toEqual([
    ["vault=Demo", "properties", "path=notes/x.md", "format=json"],
    ["vault=Demo", "properties", "format=json"],
  ]);
});

// (2) Story 1 AC#2 — list property; R6 multitext → list translation
test("list property: multitext → list (Story 1 AC#2, R6)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"tags":["alpha","beta"]}\n', exitCode: 0 },
    { stdout: '[{"name":"tags","type":"multitext","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "tags" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: ["alpha", "beta"], type: "list" });
});

// (3) Story 1 AC#3 — number property
test("number property: { value: 7, type: 'number' } (Story 1 AC#3)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"count":7}\n', exitCode: 0 },
    { stdout: '[{"name":"count","type":"number","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "count" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: 7, type: "number" });
});

// (4) Story 1 AC#4 — checkbox property
test("checkbox property: { value: true, type: 'checkbox' } (Story 1 AC#4)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"archived":true}\n', exitCode: 0 },
    { stdout: '[{"name":"archived","type":"checkbox","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "archived" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: true, type: "checkbox" });
});

// (5) Story 1 AC#5 — date property
test("date property: { value: '2026-12-31', type: 'date' } (Story 1 AC#5)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"due":"2026-12-31"}\n', exitCode: 0 },
    { stdout: '[{"name":"due","type":"date","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "due" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: "2026-12-31", type: "date" });
});

// (6) Story 1 AC#6 — datetime property
test("datetime property: { value: '2026-05-08T14:30:00', type: 'datetime' } (Story 1 AC#6)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"updated":"2026-05-08T14:30:00"}\n', exitCode: 0 },
    { stdout: '[{"name":"updated","type":"datetime","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "updated" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: "2026-05-08T14:30:00", type: "datetime" });
});

// (7) Story 1 AC#7 — absent property short-circuits Call B
test("absent property short-circuits Call B → { value: null, type: 'unknown' } (Story 1 AC#7, FR-010)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '{"status":"x"}\n', exitCode: 0 },
    // Call B intentionally absent — must NOT be invoked
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "missing_field" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: null, type: "unknown" });
  expect(recorded).toHaveLength(1);
});

// (8) Story 1 AC#8 — no-frontmatter file short-circuits both calls
test("no-frontmatter file → { value: null, type: 'unknown' }; only Call A invoked (Story 1 AC#8, R7)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "\nNo frontmatter found.\n", exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "anything" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: null, type: "unknown" });
  expect(recorded).toHaveLength(1);
});

// (9) Story 1 AC#9 — malformed-frontmatter conflated with no-fm (R7)
test("malformed frontmatter conflated with no-fm; same short-circuit (Story 1 AC#9, R7 / FR-011 + FR-012)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "\nNo frontmatter found.\n", exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "malformed.md", name: "x" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: null, type: "unknown" });
  expect(recorded).toHaveLength(1);
});

// (10) Story 1 AC#11 — unknown vault → CLI_REPORTED_ERROR (R5 inheritance)
test("unknown vault → CLI_REPORTED_ERROR (cli-adapter R5 inheritance, Story 1 AC#11)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Vault not found.\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadProperty(
      { target_mode: "specific", vault: "NoSuchVault", path: "x.md", name: "status" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (11) Story 1 AC#10 — missing file → CLI_REPORTED_ERROR with verbatim wording
test("missing file: 'Error: File ... not found.' → CLI_REPORTED_ERROR verbatim (Story 1 AC#10)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: 'Error: File "Sandbox/__missing__.md" not found.\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadProperty(
      { target_mode: "specific", vault: "V", path: "Sandbox/__missing__.md", name: "x" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe('Error: File "Sandbox/__missing__.md" not found.');
});

// (12) Story 2 AC#1 — active mode happy path; R3 + R4 argv lock (no vault on either call; active flag on Call A only)
test("active mode happy path: argv has 'active' on Call A only, no vault on either call (Story 2 AC#1, R3/R4, T0.1-locked)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '{"status":"review"}\n', exitCode: 0 },
    { stdout: '[{"name":"status","type":"text","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "active", name: "status" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: "review", type: "text" });
  expect(recorded.map((r) => r.argv)).toEqual([
    ["properties", "format=json", "active"],
    ["properties", "format=json"],
  ]);
});

// (13) Story 2 AC#3 — active mode no focused note → ERR_NO_ACTIVE_FILE
test("active mode no-active-file → ERR_NO_ACTIVE_FILE (Story 2 AC#3)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: no active file\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadProperty({ target_mode: "active", name: "x" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
});

// (14) Q2 / FR-027 — mapping value happy path; Obsidian's native 'unknown' label (R6 + R8)
test("mapping value: { value: <object>, type: 'unknown' } via Obsidian's native label (FR-027, R6, R8)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"metadata":{"author":"x","source":"y"}}\n', exitCode: 0 },
    { stdout: '[{"name":"metadata","type":"unknown","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "metadata" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: { author: "x", source: "y" }, type: "unknown" });
});

// (15) US4 / FR-017 — heterogeneous list → array, type 'unknown' (T0.6-locked)
test("heterogeneous list: Obsidian labels native 'unknown'; result type = 'unknown' (US4 / FR-017, T0.6-locked)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"mixed":[1,"two",3]}\n', exitCode: 0 },
    { stdout: '[{"name":"mixed","type":"unknown","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "mixed" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: [1, "two", 3], type: "unknown" });
});

// (15-bis) US4 / FR-017 defensive — if Obsidian labels heterogeneous list as 'multitext', handler downgrades to 'unknown'
test("heterogeneous list defensive: multitext + mixed runtime types → downgraded to 'unknown' (FR-017 post-processing)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"mixed":[1,"two",3]}\n', exitCode: 0 },
    { stdout: '[{"name":"mixed","type":"multitext","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "mixed" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: [1, "two", 3], type: "unknown" });
});

// (16) R6 — type translation table is exhaustive
test.each<[string, string]>([
  ["text", "text"],
  ["multitext", "list"],
  ["aliases", "list"],
  ["tags", "list"],
  ["number", "number"],
  ["checkbox", "checkbox"],
  ["date", "date"],
  ["datetime", "datetime"],
  ["unknown", "unknown"],
  ["madeup_future_label", "unknown"],
])("type translation table: Obsidian '%s' → spec '%s' (R6)", async (obsidianLabel, specLabel) => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"f":"v"}\n', exitCode: 0 },
    { stdout: `[{"name":"f","type":"${obsidianLabel}","count":1}]\n`, exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "f" },
    deps(spawnFn),
  );
  expect(result.type).toBe(specLabel);
});

// (17) FR-018 / FR-019 — name with dots/dashes pass through verbatim; name NEVER forwarded to CLI argv
test.each<[string]>([["with.dots"], ["with-dashes"], ["_underscore"]])(
  "name '%s' passes through verbatim AND is never forwarded to CLI argv (FR-018, FR-019)",
  async (name) => {
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: JSON.stringify({ [name]: "value" }) + "\n", exitCode: 0 },
      { stdout: JSON.stringify([{ name, type: "text", count: 1 }]) + "\n", exitCode: 0 },
    ]);
    const result = await executeReadProperty(
      { target_mode: "specific", vault: "V", path: "x.md", name },
      deps(spawnFn),
    );
    expect(result).toEqual({ value: "value", type: "text" });
    for (const argv of recorded.map((r) => r.argv)) {
      expect(argv.some((a) => a.startsWith("name="))).toBe(false);
    }
  },
);

// (18) F2 — FR-009 literal-null string round-trip distinguishable from YAML null
test("literal-null string round-trip: { value: 'null', type: 'text' } (F2 / FR-009 / SC-007)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"key":"null"}\n', exitCode: 0 },
    { stdout: '[{"name":"key","type":"text","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "key" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: "null", type: "text" });
});

// (19) F2 — FR-009 explicit-null distinguishability vs absent (test 7)
test("explicit-null distinguishability: { value: null, type: '<typed>' } distinguishable from absent (F2 / FR-009)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '{"key":null}\n', exitCode: 0 },
    { stdout: '[{"name":"key","type":"text","count":1}]\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "key" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: null, type: "text" });
});

// (20) F3 — Story 2 AC#2 active-mode + absent property short-circuits Call B
test("active mode + absent property → { value: null, type: 'unknown' }; only Call A (Story 2 AC#2, F3)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '{"other":"x"}\n', exitCode: 0 },
  ]);
  const result = await executeReadProperty(
    { target_mode: "active", name: "missing_in_active" },
    deps(spawnFn),
  );
  expect(result).toEqual({ value: null, type: "unknown" });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.argv).toEqual(["properties", "format=json", "active"]);
});

// (21) F5 — FR-021 CLI_BINARY_NOT_FOUND propagation
test("ENOENT on Call A spawn → CLI_BINARY_NOT_FOUND (F5 / FR-021)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeQueuedSpawn([
    { errorOnSpawn: enoent },
  ]);
  const err = (await captureRejection(
    executeReadProperty(
      { target_mode: "specific", vault: "V", path: "x.md", name: "f" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// (22) F5 — FR-021 CLI_NON_ZERO_EXIT propagation
test("non-zero exit on Call A → CLI_NON_ZERO_EXIT verbatim (F5 / FR-021)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stderr: "permission denied", exitCode: 1 },
  ]);
  const err = (await captureRejection(
    executeReadProperty(
      { target_mode: "specific", vault: "V", path: "x.md", name: "f" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("permission denied");
});
