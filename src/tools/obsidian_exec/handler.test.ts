// Original — no upstream. Tests for the obsidian_exec spawn handler. US1/US2/US3 cases.
import { test, expect } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
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
  neverExit?: boolean;
  exitOnKill?: boolean;
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

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

// --- US1 cases ---

test("US1 happy path: command 'version' returns success shape with published argv [binary, ...spawnArgs]", async () => {
  const { spawnFn, recorded } = makeMockSpawn({
    stdoutChunks: [Buffer.from("1.7.2\n", "utf8")],
    exitCode: 0,
  });
  const result = await executeObsidianExec(
    { command: "version" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.stdout).toBe("1.7.2\n");
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.argv).toEqual(["obsidian", "version"]);
  expect(recorded.length).toBe(1);
  expect(recorded[0]!.binary).toBe("obsidian");
  expect(recorded[0]!.spawnArgs).toEqual(["version"]);
});

test("US1 failure path: nonexistent_command_xyz raises UpstreamError(CLI_NON_ZERO_EXIT)", async () => {
  const { spawnFn } = makeMockSpawn({
    stdoutChunks: [],
    stderrChunks: [Buffer.from("unknown command\n", "utf8")],
    exitCode: 2,
  });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "nonexistent_command_xyz" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.cause).toEqual({ exitCode: 2, signal: null });
  expect(err.details.argv).toEqual(["obsidian", "nonexistent_command_xyz"]);
  expect(err.details.stdout).toBe("");
  expect(err.details.stderr).toBe("unknown command\n");
});

test("US1 boundary path (vault-omitted): produces argv ['obsidian','search','query=fixture'] with no vault= token", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { command: "search", parameters: { query: "fixture" } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.argv).toEqual(["obsidian", "search", "query=fixture"]);
  expect(recorded[0]!.spawnArgs).toEqual(["search", "query=fixture"]);
  expect(result.argv.some((t) => t.startsWith("vault="))).toBe(false);
});

test("US1 spawn ENOENT raises UpstreamError(CLI_BINARY_NOT_FOUND) with binaryAttempted and PATH", async () => {
  const enoent: NodeJS.ErrnoException = new Error("spawn obsidian ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  enoent.syscall = "spawn obsidian";
  enoent.path = "obsidian";
  const { spawnFn } = makeMockSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "version" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: { PATH: "C:\\Windows;C:\\Tools" } },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
  expect(err.details.binaryAttempted).toBe("obsidian");
  expect(err.details.PATH).toBe("C:\\Windows;C:\\Tools");
});

test("US1 numeric and boolean parameter values stringify into key=value tokens", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  await executeObsidianExec(
    { command: "search", parameters: { limit: 10, silent: true } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.spawnArgs).toEqual(["search", "limit=10", "silent=true"]);
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
  expect(lines.length).toBe(2);
  const start = JSON.parse(lines[0]!);
  const end = JSON.parse(lines[1]!);
  expect(start.event).toBe("call.start");
  expect(end.event).toBe("call.end");
  expect(start.callId).toBe(end.callId);
  expect(start.argv).toEqual(["obsidian", "version"]);
  expect(end.exitCode).toBe(0);
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
  expect(recorded[0]!.binary).toBe("C:\\custom\\obsidian.exe");
  expect(result.argv).toEqual(["C:\\custom\\obsidian.exe", "version"]);
});

// --- US2 cases ---

test("US2 vault prepends 'vault=<value>' as the first POST-BINARY argv element", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { vault: "test-vault", command: "search", parameters: { query: "fixture" } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.argv).toEqual(["obsidian", "vault=test-vault", "search", "query=fixture"]);
  expect(recorded[0]!.spawnArgs).toEqual(["vault=test-vault", "search", "query=fixture"]);
});

test("US2 flags appended verbatim after parameters in declaration order", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  await executeObsidianExec(
    { command: "x", parameters: { k: "v" }, flags: ["silent", "overwrite"] },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.spawnArgs).toEqual(["x", "k=v", "silent", "overwrite"]);
});

test("US2 copy:true appends '--copy' as the FINAL argv token", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { command: "read", parameters: { path: "n.md" }, copy: true },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.argv[result.argv.length - 1]).toBe("--copy");
  expect(recorded[0]!.spawnArgs[recorded[0]!.spawnArgs.length - 1]).toBe("--copy");
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
  expect(result.argv).toEqual([
    "obsidian",
    "vault=work",
    "read",
    "path=n.md",
    "deep=true",
    "silent",
    "--copy",
  ]);
  expect(recorded[0]!.spawnArgs).toEqual([
    "vault=work",
    "read",
    "path=n.md",
    "deep=true",
    "silent",
    "--copy",
  ]);
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
  expect(startA.vault).toBe("v");
  expect(startB.vault).toBeNull();
});

// --- US3 cases ---

test("US3 default timeout constant is 30000 ms (FR-008 default)", () => {
  expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
});

test("US3 output cap constant is 10 MiB (FR-027)", () => {
  expect(OUTPUT_CAP_BYTES).toBe(10 * 1024 * 1024);
});

test("US3 CLI_TIMEOUT: short timeout + non-responsive child raises CLI_TIMEOUT and sends SIGTERM", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ neverExit: true, exitOnSignals: ["SIGTERM"] });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "version", timeoutMs: 1 },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_TIMEOUT");
  expect(err.details.argv).toEqual(["obsidian", "version"]);
  expect(err.details.timeoutMs).toBe(1);
  expect(typeof err.details.partialStdout).toBe("string");
  expect(typeof err.details.partialStderr).toBe("string");
  expect(recorded[0]!.killsReceived).toContain("SIGTERM");
});

test("US3 CLI_TIMEOUT: SIGKILL fires after 2-second grace if child ignores SIGTERM", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ neverExit: true, exitOnSignals: ["SIGKILL"] });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "version", timeoutMs: 10 },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_TIMEOUT");
  expect(recorded[0]!.killsReceived).toContain("SIGTERM");
  expect(recorded[0]!.killsReceived).toContain("SIGKILL");
  expect(recorded[0]!.killsReceived[0]).toBe("SIGTERM");
});

test("US3 CLI_OUTPUT_TOO_LARGE on stdout: 11 MiB ASCII trips cap, raises with truncated partial", async () => {
  const oneMiB = Buffer.alloc(1024 * 1024, 0x41);
  const elevenMiBChunks = Array.from({ length: 11 }, () => oneMiB);
  const { spawnFn, recorded } = makeMockSpawn({
    stdoutChunks: elevenMiBChunks,
    exitOnSignals: ["SIGTERM"],
  });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "eval", parameters: { code: "x" } },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
  expect(err.details.stream).toBe("stdout");
  expect(err.details.limitBytes).toBe(10 * 1024 * 1024);
  expect(err.details.capturedBytes as number).toBeGreaterThan(10 * 1024 * 1024);
  expect((err.details.partial as string).length).toBe(10 * 1024 * 1024);
  expect(Buffer.byteLength(err.details.partial as string, "utf8")).toBe(10 * 1024 * 1024);
  expect(recorded[0]!.killsReceived).toContain("SIGTERM");
});

test("US3 CLI_OUTPUT_TOO_LARGE on stderr: same cap behavior on stderr stream", async () => {
  const oneMiB = Buffer.alloc(1024 * 1024, 0x41);
  const elevenMiBChunks = Array.from({ length: 11 }, () => oneMiB);
  const { spawnFn } = makeMockSpawn({
    stderrChunks: elevenMiBChunks,
    exitOnSignals: ["SIGTERM"],
  });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "x" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
  expect(err.details.stream).toBe("stderr");
  expect((err.details.partial as string).length).toBe(10 * 1024 * 1024);
});

test("US3 timeout starts at spawn, not at enqueue (FR-023): short call after a slow one does not timeout from queue wait", async () => {
  const queue = createQueue();
  const { spawnFn: slowSpawn } = makeMockSpawn({ delayMs: 200, exitCode: 0 });
  const { spawnFn: fastSpawn, recorded: fastRecorded } = makeMockSpawn({ delayMs: 5, exitCode: 0 });
  const slow = executeObsidianExec({ command: "slow" }, { logger: silentLogger(), queue, spawnFn: slowSpawn, env: {} });
  const fast = executeObsidianExec(
    { command: "fast", timeoutMs: 100 },
    { logger: silentLogger(), queue, spawnFn: fastSpawn, env: {} },
  );
  const [, fastResult] = await Promise.all([slow, fast]);
  expect(fastResult.exitCode).toBe(0);
  expect(fastRecorded.length).toBe(1);
});

test("US3 SC-004 round-trip: parameter values with shell metacharacters reach the mock argv byte-for-byte", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const trickyValue = `with spaces, quotes "x", $vars, ;& backticks \`y\``;
  await executeObsidianExec(
    { command: "eval", parameters: { code: trickyValue } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.spawnArgs).toEqual(["eval", `code=${trickyValue}`]);
});

test("US3 killActiveChild returns false when no call is in flight", () => {
  expect(killActiveChild()).toBe(false);
});

test("US3 killActiveChild kills the in-flight child and returns true", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ neverExit: true, exitOnSignals: ["SIGTERM"] });
  const promise = executeObsidianExec(
    { command: "long" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const result = killActiveChild();
  expect(result).toBe(true);
  await captureRejection(promise);
  expect(recorded[0]!.killsReceived).toContain("SIGTERM");
});
