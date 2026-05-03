// Original — no upstream. Tests for the obsidian_exec spawn handler. US1 cases here; US2/US3 cases get added in their phases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { Readable } from "node:stream";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { UpstreamError } from "../../errors.js";
import { executeObsidianExec, killActiveChild, DEFAULT_TIMEOUT_MS, OUTPUT_CAP_BYTES, type SpawnLike } from "./handler.js";

interface MockChildSpec {
  stdoutChunks?: Buffer[];
  stderrChunks?: Buffer[];
  exitCode?: number;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: NodeJS.ErrnoException;
  delayMs?: number;
  /** When true, the mock never emits 'exit' on its own; tests must trigger via kill or manually. */
  neverExit?: boolean;
  /** When true, the mock fires 'exit' immediately when child.kill is called (well-behaved child). */
  exitOnKill?: boolean;
  /** When set, the mock fires 'exit' only when a kill signal in this set is received. */
  exitOnSignals?: NodeJS.Signals[];
}

interface SpawnRecording {
  binary: string;
  spawnArgs: string[];
  killsReceived: NodeJS.Signals[];
}

function makeMockSpawn(spec: MockChildSpec): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  const spawnFn: SpawnLike = (binary, spawnArgs, _opts) => {
    const recording: SpawnRecording = { binary, spawnArgs: [...spawnArgs], killsReceived: [] };
    recorded.push(recording);
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
    };
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = (signal?: NodeJS.Signals) => {
      const sig = signal ?? "SIGTERM";
      recording.killsReceived.push(sig);
      const exitOnAny = spec.exitOnKill === true;
      const exitOnThisSig = spec.exitOnSignals?.includes(sig) ?? false;
      if (exitOnAny || exitOnThisSig) {
        setImmediate(() => child.emit("exit", null, sig));
      }
      return true;
    };
    setImmediate(() => {
      if (spec.errorOnSpawn) {
        child.emit("error", spec.errorOnSpawn);
        return;
      }
      for (const c of spec.stdoutChunks ?? []) stdout.push(c);
      stdout.push(null);
      for (const c of spec.stderrChunks ?? []) stderr.push(c);
      stderr.push(null);
      if (spec.neverExit) return;
      const fire = () => child.emit("exit", spec.exitCode ?? 0, spec.signal ?? null);
      if (spec.delayMs) setTimeout(fire, spec.delayMs);
      else setImmediate(fire);
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded };
}

function silentLogger() {
  const stream = new Writable({ write(_c, _e, cb) { cb(); } });
  return createLogger({ stream });
}

test("US1 happy path: command 'version' returns success shape with published argv [binary, ...spawnArgs]", async () => {
  const { spawnFn, recorded } = makeMockSpawn({
    stdoutChunks: [Buffer.from("1.7.2\n", "utf8")],
    exitCode: 0,
  });
  const result = await executeObsidianExec(
    { command: "version" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.equal(result.stdout, "1.7.2\n");
  assert.equal(result.stderr, "");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.argv, ["obsidian", "version"]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]!.binary, "obsidian");
  assert.deepEqual(recorded[0]!.spawnArgs, ["version"]);
});

test("US1 failure path: nonexistent_command_xyz raises UpstreamError(CLI_NON_ZERO_EXIT)", async () => {
  const { spawnFn } = makeMockSpawn({
    stdoutChunks: [],
    stderrChunks: [Buffer.from("unknown command\n", "utf8")],
    exitCode: 2,
  });
  await assert.rejects(
    executeObsidianExec(
      { command: "nonexistent_command_xyz" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
    (err: unknown) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.code, "CLI_NON_ZERO_EXIT");
      assert.deepEqual(err.cause, { exitCode: 2, signal: null });
      assert.deepEqual(err.details.argv, ["obsidian", "nonexistent_command_xyz"]);
      assert.equal(err.details.stdout, "");
      assert.equal(err.details.stderr, "unknown command\n");
      return true;
    },
  );
});

test("US1 boundary path (vault-omitted): produces argv ['obsidian','search','query=fixture'] with no vault= token", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { command: "search", parameters: { query: "fixture" } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.deepEqual(result.argv, ["obsidian", "search", "query=fixture"]);
  assert.deepEqual(recorded[0]!.spawnArgs, ["search", "query=fixture"]);
  assert.ok(!result.argv.some((t) => t.startsWith("vault=")), "no vault= token");
});

test("US1 spawn ENOENT raises UpstreamError(CLI_BINARY_NOT_FOUND) with binaryAttempted and PATH", async () => {
  const enoent: NodeJS.ErrnoException = new Error("spawn obsidian ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  enoent.syscall = "spawn obsidian";
  enoent.path = "obsidian";
  const { spawnFn } = makeMockSpawn({ errorOnSpawn: enoent });
  await assert.rejects(
    executeObsidianExec(
      { command: "version" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: { PATH: "C:\\Windows;C:\\Tools" } },
    ),
    (err: unknown) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.code, "CLI_BINARY_NOT_FOUND");
      assert.equal(err.details.binaryAttempted, "obsidian");
      assert.equal(err.details.PATH, "C:\\Windows;C:\\Tools");
      return true;
    },
  );
});

test("US1 numeric and boolean parameter values stringify into key=value tokens", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  await executeObsidianExec(
    { command: "search", parameters: { limit: 10, silent: true } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.deepEqual(recorded[0]!.spawnArgs, ["search", "limit=10", "silent=true"]);
});

test("US1 handler emits matching call.start / call.end log lines via injected logger", async () => {
  const chunks: Buffer[] = [];
  const stream = new Writable({ write(c, _e, cb) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); cb(); } });
  const logger = createLogger({ stream });
  const { spawnFn } = makeMockSpawn({ stdoutChunks: [Buffer.from("ok", "utf8")], exitCode: 0 });
  await executeObsidianExec(
    { command: "version" },
    { logger, queue: createQueue(), spawnFn, env: {} },
  );
  const lines = Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  const start = JSON.parse(lines[0]!);
  const end = JSON.parse(lines[1]!);
  assert.equal(start.event, "call.start");
  assert.equal(end.event, "call.end");
  assert.equal(start.callId, end.callId);
  assert.deepEqual(start.argv, ["obsidian", "version"]);
  assert.equal(end.exitCode, 0);
});

test("US1 OBSIDIAN_BIN override: spawn receives the overridden binary and published argv reflects it (FR-013)", async () => {
  const { spawnFn, recorded } = makeMockSpawn({
    stdoutChunks: [Buffer.from("1.7.2\n", "utf8")],
    exitCode: 0,
  });
  const result = await executeObsidianExec(
    { command: "version" },
    {
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn,
      env: { OBSIDIAN_BIN: "C:\\custom\\obsidian.exe", PATH: "C:\\Windows" },
    },
  );
  assert.equal(recorded[0]!.binary, "C:\\custom\\obsidian.exe");
  assert.deepEqual(result.argv, ["C:\\custom\\obsidian.exe", "version"]);
});

// --- US2 cases (vault, flags, copy) ---

test("US2 vault prepends 'vault=<value>' as the first POST-BINARY argv element", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { vault: "test-vault", command: "search", parameters: { query: "fixture" } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.deepEqual(result.argv, ["obsidian", "vault=test-vault", "search", "query=fixture"]);
  assert.deepEqual(recorded[0]!.spawnArgs, ["vault=test-vault", "search", "query=fixture"]);
});

test("US2 flags appended verbatim after parameters in declaration order", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  await executeObsidianExec(
    { command: "x", parameters: { k: "v" }, flags: ["silent", "overwrite"] },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.deepEqual(recorded[0]!.spawnArgs, ["x", "k=v", "silent", "overwrite"]);
});

test("US2 copy:true appends '--copy' as the FINAL argv token", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { command: "read", parameters: { path: "n.md" }, copy: true },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.equal(result.argv[result.argv.length - 1], "--copy");
  assert.equal(recorded[0]!.spawnArgs[recorded[0]!.spawnArgs.length - 1], "--copy");
});

test("US2 all-fields-together produces argv in FR-010 order [binary, vault=v, command, ...params, ...flags, --copy]", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    {
      vault: "work",
      command: "read",
      parameters: { path: "n.md", deep: true },
      flags: ["silent"],
      copy: true,
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.deepEqual(result.argv, [
    "obsidian",
    "vault=work",
    "read",
    "path=n.md",
    "deep=true",
    "silent",
    "--copy",
  ]);
  assert.deepEqual(recorded[0]!.spawnArgs, [
    "vault=work",
    "read",
    "path=n.md",
    "deep=true",
    "silent",
    "--copy",
  ]);
});

// --- US3 cases (timeout, output cap, signal cleanup hook) ---

test("US3 default timeout constant is 30000 ms (FR-008 default)", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 30_000);
});

test("US3 output cap constant is 10 MiB (FR-027)", () => {
  assert.equal(OUTPUT_CAP_BYTES, 10 * 1024 * 1024);
});

test("US3 CLI_TIMEOUT: short timeout + non-responsive child raises CLI_TIMEOUT and sends SIGTERM", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ neverExit: true, exitOnSignals: ["SIGTERM"] });
  await assert.rejects(
    executeObsidianExec(
      { command: "version", timeoutMs: 1 },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
    (err: unknown) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.code, "CLI_TIMEOUT");
      assert.deepEqual(err.details.argv, ["obsidian", "version"]);
      assert.equal(err.details.timeoutMs, 1);
      assert.equal(typeof err.details.partialStdout, "string");
      assert.equal(typeof err.details.partialStderr, "string");
      return true;
    },
  );
  assert.ok(recorded[0]!.killsReceived.includes("SIGTERM"), "child received SIGTERM");
});

test("US3 CLI_TIMEOUT: SIGKILL fires after 2-second grace if child ignores SIGTERM", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ neverExit: true, exitOnSignals: ["SIGKILL"] });
  const promise = executeObsidianExec(
    { command: "version", timeoutMs: 10 },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof UpstreamError);
    assert.equal(err.code, "CLI_TIMEOUT");
    return true;
  });
  assert.ok(recorded[0]!.killsReceived.includes("SIGTERM"), "SIGTERM was sent first");
  assert.ok(recorded[0]!.killsReceived.includes("SIGKILL"), "SIGKILL followed");
  assert.equal(recorded[0]!.killsReceived[0], "SIGTERM", "SIGTERM ordered first");
});

test("US3 CLI_OUTPUT_TOO_LARGE on stdout: 11 MiB ASCII trips cap, raises with truncated partial", async () => {
  // 11 MiB = 11 chunks of 1 MiB each, ASCII 'A' (0x41) — guaranteed single-byte UTF-8.
  const oneMiB = Buffer.alloc(1024 * 1024, 0x41);
  const elevenMiBChunks = Array.from({ length: 11 }, () => oneMiB);
  const { spawnFn, recorded } = makeMockSpawn({
    stdoutChunks: elevenMiBChunks,
    exitOnSignals: ["SIGTERM"],
  });
  await assert.rejects(
    executeObsidianExec(
      { command: "eval", parameters: { code: "x" } },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
    (err: unknown) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.code, "CLI_OUTPUT_TOO_LARGE");
      assert.equal(err.details.stream, "stdout");
      assert.equal(err.details.limitBytes, 10 * 1024 * 1024);
      assert.ok((err.details.capturedBytes as number) > 10 * 1024 * 1024);
      assert.equal((err.details.partial as string).length, 10 * 1024 * 1024);
      assert.equal(Buffer.byteLength(err.details.partial as string, "utf8"), 10 * 1024 * 1024);
      return true;
    },
  );
  assert.ok(recorded[0]!.killsReceived.includes("SIGTERM"), "SIGTERM sent on cap overflow");
});

test("US3 CLI_OUTPUT_TOO_LARGE on stderr: same cap behavior on stderr stream", async () => {
  const oneMiB = Buffer.alloc(1024 * 1024, 0x41);
  const elevenMiBChunks = Array.from({ length: 11 }, () => oneMiB);
  const { spawnFn } = makeMockSpawn({
    stderrChunks: elevenMiBChunks,
    exitOnSignals: ["SIGTERM"],
  });
  await assert.rejects(
    executeObsidianExec(
      { command: "x" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
    (err: unknown) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.code, "CLI_OUTPUT_TOO_LARGE");
      assert.equal(err.details.stream, "stderr");
      assert.equal((err.details.partial as string).length, 10 * 1024 * 1024);
      return true;
    },
  );
});

test("US3 timeout starts at spawn, not at enqueue (FR-023): short call after a slow one does not timeout from queue wait", async () => {
  const queue = createQueue();
  const { spawnFn: slowSpawn } = makeMockSpawn({ delayMs: 200, exitCode: 0 });
  const { spawnFn: fastSpawn, recorded: fastRecorded } = makeMockSpawn({ delayMs: 5, exitCode: 0 });
  const slow = executeObsidianExec({ command: "slow" }, { logger: silentLogger(), queue, spawnFn: slowSpawn, env: {} });
  // Second call has timeoutMs: 100 — shorter than slow's 200 ms. If the timer started at enqueue, it would expire while slow is running. With FR-023 (timer starts at spawn), it should succeed.
  const fast = executeObsidianExec(
    { command: "fast", timeoutMs: 100 },
    { logger: silentLogger(), queue, spawnFn: fastSpawn, env: {} },
  );
  const [, fastResult] = await Promise.all([slow, fast]);
  assert.equal(fastResult.exitCode, 0);
  assert.equal(fastRecorded.length, 1, "fast call did spawn");
});

test("US3 SC-004 round-trip: parameter values with shell metacharacters reach the mock argv byte-for-byte", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const trickyValue = `with spaces, quotes "x", $vars, ;& backticks \`y\``;
  await executeObsidianExec(
    { command: "eval", parameters: { code: trickyValue } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  assert.deepEqual(recorded[0]!.spawnArgs, ["eval", `code=${trickyValue}`]);
});

test("US3 killActiveChild returns false when no call is in flight", () => {
  // Ensure clean state — best-effort; previous tests may have left activeChild set if they failed.
  // After a successful test the handler clears activeChild on exit.
  assert.equal(killActiveChild(), false);
});

test("US3 killActiveChild kills the in-flight child and returns true", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ neverExit: true, exitOnSignals: ["SIGTERM"] });
  const promise = executeObsidianExec(
    { command: "long" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  // Wait for spawn to register activeChild
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const result = killActiveChild();
  assert.equal(result, true);
  await assert.rejects(promise);
  assert.ok(recorded[0]!.killsReceived.includes("SIGTERM"), "active child got SIGTERM");
});

test("US2 call.start log line carries vault when present and null when omitted", async () => {
  const chunksA: Buffer[] = [];
  const chunksB: Buffer[] = [];
  const sA = new Writable({ write(c, _e, cb) { chunksA.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); cb(); } });
  const sB = new Writable({ write(c, _e, cb) { chunksB.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); cb(); } });
  const { spawnFn: sf1 } = makeMockSpawn({ exitCode: 0 });
  await executeObsidianExec(
    { vault: "v", command: "x" },
    { logger: createLogger({ stream: sA }), queue: createQueue(), spawnFn: sf1, env: {} },
  );
  const { spawnFn: sf2 } = makeMockSpawn({ exitCode: 0 });
  await executeObsidianExec(
    { command: "x" },
    { logger: createLogger({ stream: sB }), queue: createQueue(), spawnFn: sf2, env: {} },
  );
  const startA = JSON.parse(Buffer.concat(chunksA).toString("utf8").split("\n").filter(Boolean)[0]!);
  const startB = JSON.parse(Buffer.concat(chunksB).toString("utf8").split("\n").filter(Boolean)[0]!);
  assert.equal(startA.vault, "v");
  assert.equal(startB.vault, null);
});
