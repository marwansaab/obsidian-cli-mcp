// Original — no upstream. Integration tests for the obsidian_exec handler — exercises the response envelope through the invokeBoundedCli → dispatchCli pipeline.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeObsidianExec } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";


interface MockChildSpec {
  stdoutChunks?: Buffer[];
  stderrChunks?: Buffer[];
  exitCode?: number;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: NodeJS.ErrnoException;
}

interface SpawnRecording {
  binary: string;
  spawnArgs: string[];
}

function makeMockSpawn(spec: MockChildSpec): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  const spawnFn: SpawnLike = (binary, spawnArgs, _opts: SpawnOptions) => {
    if (spec.errorOnSpawn) {
      throw spec.errorOnSpawn;
    }
    recorded.push({ binary, spawnArgs: [...spawnArgs] });
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 1234;
    child.kill = (signal?: NodeJS.Signals) => {
      setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
      return true;
    };
    setImmediate(() => {
      for (const c of spec.stdoutChunks ?? []) child.stdout.push(c);
      child.stdout.push(null);
      for (const c of spec.stderrChunks ?? []) child.stderr.push(c);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", spec.exitCode ?? 0, spec.signal ?? null));
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

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

test("happy path: 'version' returns success envelope with argv [obsidian, version]", async () => {
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
  expect(recorded[0]!.binary).toBe("obsidian");
  expect(recorded[0]!.spawnArgs).toEqual(["version"]);
});

test("CLI_NON_ZERO_EXIT integration: stderr + exit 2 surfaces with full details", async () => {
  const { spawnFn } = makeMockSpawn({
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
  expect(err.details.argv).toEqual(["obsidian", "nonexistent_command_xyz"]);
  expect(err.details.exitCode).toBe(2);
});

test("CLI_BINARY_NOT_FOUND integration: ENOENT-on-spawn surfaces with binaryAttempted+PATH", async () => {
  const enoent: NodeJS.ErrnoException = new Error("spawn obsidian ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  const { spawnFn } = makeMockSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "version" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: { PATH: "C:\\Windows;C:\\Tools" } },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
  expect(err.details.binaryAttempted).toBe("obsidian");
  expect(err.details.PATH).toBe("C:\\Windows;C:\\Tools");
});

test("CLI_REPORTED_ERROR integration: exit 0 + leading 'Error:' produces CLI_REPORTED_ERROR with first-line message", async () => {
  const stdoutText = `Error: Command "nonexistent_command_xyz" not found.\n`;
  const { spawnFn } = makeMockSpawn({
    stdoutChunks: [Buffer.from(stdoutText, "utf8")],
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "nonexistent_command_xyz" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe(`Error: Command "nonexistent_command_xyz" not found.`);
  expect(err.details.exitCode).toBe(0);
});

test("ERR_NO_ACTIVE_FILE integration (FR-021 — newly reachable through obsidian_exec)", async () => {
  const { spawnFn } = makeMockSpawn({
    stdoutChunks: [Buffer.from("Error: no active file\n", "utf8")],
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeObsidianExec(
      { command: "read" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.message).toBe(
    'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
  );
});

test("argv: vault-omitted produces ['obsidian','search','query=fixture'] with no vault= token", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { command: "search", parameters: { query: "fixture" } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.argv).toEqual(["obsidian", "search", "query=fixture"]);
  expect(recorded[0]!.spawnArgs).toEqual(["search", "query=fixture"]);
});

test("argv: vault prepends 'vault=<value>' as the first POST-BINARY token (FR-012)", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { vault: "test-vault", command: "search", parameters: { query: "fixture" } },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.argv).toEqual(["obsidian", "vault=test-vault", "search", "query=fixture"]);
  expect(recorded[0]!.spawnArgs).toEqual(["vault=test-vault", "search", "query=fixture"]);
});

test("argv: copy:true appends '--copy' as the FINAL argv token", async () => {
  const { spawnFn, recorded } = makeMockSpawn({ exitCode: 0 });
  const result = await executeObsidianExec(
    { command: "read", parameters: { path: "n.md" }, copy: true },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.argv[result.argv.length - 1]).toBe("--copy");
  expect(recorded[0]!.spawnArgs[recorded[0]!.spawnArgs.length - 1]).toBe("--copy");
});

test("argv: all-fields-together produces the documented order [binary, vault=v, command, kvs..., flags..., --copy] (FR-012)", async () => {
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

test("OBSIDIAN_BIN override: spawn receives the overridden binary; argv reflects it", async () => {
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

test("handler emits ZERO call.start/call.end log lines (R3 — failure-only logging discipline)", async () => {
  const chunks: Buffer[] = [];
  const stream = new Writable({ write(c, _e, cb) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); cb(); } });
  const logger = createLogger({ stream });
  const { spawnFn } = makeMockSpawn({ stdoutChunks: [Buffer.from("ok", "utf8")], exitCode: 0 });
  await executeObsidianExec(
    { command: "version" },
    { logger, queue: createQueue(), spawnFn, env: {} },
  );
  const lines = Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean);
  expect(lines.length).toBe(0);
});
