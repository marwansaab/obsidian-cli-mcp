// Original — no upstream. Co-located vitest cases for the invokeBoundedCli escape-hatch facade — defaults, override, silent 120 s clamp, copy flag, queue-serialization (Q1 / FR-011).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpstreamError } from "../errors.js";
import { createLogger, type Logger } from "../logger.js";
import { createQueue } from "../queue.js";
import { __resetInFlightRegistryForTests } from "./_dispatch.js";
import {
  invokeBoundedCli,
  OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS,
  OBSIDIAN_EXEC_MAX_TIMEOUT_MS,
  OBSIDIAN_EXEC_OUTPUT_CAP_BYTES,
  type SpawnLike,
} from "./invoke-bounded-cli.js";

interface StubChildSpec {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  hold?: boolean;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeStubSpawn(spec: StubChildSpec): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  const spawnFn: SpawnLike = (binary, argv, options) => {
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
      if (spec.hold) return;
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

function captureLines(): { stream: Writable; logger: Logger; lines: () => string[] } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  const logger = createLogger({ stream });
  return {
    stream,
    logger,
    lines: () => Buffer.concat(chunks).toString("utf8").split("\n").filter((l) => l.length > 0),
  };
}

function pendingRejection<T>(p: Promise<T>): Promise<UpstreamError> {
  return p.then(
    () => { throw new Error("expected rejection but promise resolved"); },
    (e: unknown) => {
      if (!(e instanceof UpstreamError)) throw new Error(`expected UpstreamError, got ${String(e)}`);
      return e;
    },
  );
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("invokeBoundedCli — constants", () => {
  it("exposes the documented defaults (30 s / 10 MiB) and 120 s ceiling", () => {
    expect(OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(OBSIDIAN_EXEC_OUTPUT_CAP_BYTES).toBe(10 * 1024 * 1024);
    expect(OBSIDIAN_EXEC_MAX_TIMEOUT_MS).toBe(120_000);
  });
});

describe("invokeBoundedCli — argv assembly (FR-012)", () => {
  it("happy path argv is [vault=..., command, kvs..., flags..., --copy]", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ stdout: "ok", exitCode: 0 });
    const cap = captureLines();
    const out = await invokeBoundedCli(
      {
        command: "read",
        vault: "MyVault",
        parameters: { file: "Note", lines: 5 },
        flags: ["silent"],
        copy: true,
      },
      {},
      { spawnFn, env: {}, logger: cap.logger, queue: createQueue() },
    );
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe("ok");
    expect(out.argv[0]).toBe("obsidian");
    expect(recorded[0]!.argv).toEqual(["vault=MyVault", "read", "file=Note", "lines=5", "silent", "--copy"]);
  });

  it("copy: false omits --copy", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ stdout: "ok", exitCode: 0 });
    const cap = captureLines();
    await invokeBoundedCli(
      { command: "version", copy: false },
      {},
      { spawnFn, env: {}, logger: cap.logger, queue: createQueue() },
    );
    expect(recorded[0]!.argv).toEqual(["version"]);
  });
});

describe("invokeBoundedCli — timeout default and silent clamp (Q1 / FR-011)", () => {
  it("default 30 s timeout fires when no override", async () => {
    vi.useFakeTimers();
    try {
      const cap = captureLines();
      const { spawnFn } = makeStubSpawn({ hold: true });
      const rejected = pendingRejection(
        invokeBoundedCli(
          { command: "read" },
          {},
          { spawnFn, env: {}, logger: cap.logger, queue: createQueue() },
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_001);
      const err = await rejected;
      expect(err.code).toBe("CLI_TIMEOUT");
      expect(err.details).toMatchObject({ timeoutMs: 30_000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("override timeoutMs: 90_000 honored — fires at 90 s", async () => {
    vi.useFakeTimers();
    try {
      const cap = captureLines();
      const { spawnFn } = makeStubSpawn({ hold: true });
      const rejected = pendingRejection(
        invokeBoundedCli(
          { command: "read" },
          { timeoutMs: 90_000 },
          { spawnFn, env: {}, logger: cap.logger, queue: createQueue() },
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(90_001);
      const err = await rejected;
      expect(err.code).toBe("CLI_TIMEOUT");
      expect(err.details).toMatchObject({ timeoutMs: 90_000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("override > 120 s SILENTLY clamps to 120 s — no VALIDATION_ERROR, no warning, only the single dispatch.timeout line", async () => {
    vi.useFakeTimers();
    try {
      const cap = captureLines();
      const { spawnFn } = makeStubSpawn({ hold: true });
      const rejected = pendingRejection(
        invokeBoundedCli(
          { command: "read" },
          { timeoutMs: 200_000 },
          { spawnFn, env: {}, logger: cap.logger, queue: createQueue() },
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      // At 119 s the call should still be running.
      await vi.advanceTimersByTimeAsync(119_000);
      // But by 120.5 s the timeout fires.
      await vi.advanceTimersByTimeAsync(1_500);
      const err = await rejected;
      expect(err.code).toBe("CLI_TIMEOUT");
      expect(err.details).toMatchObject({ timeoutMs: 120_000 });
      // No VALIDATION_ERROR was raised (we got a CLI_TIMEOUT).
      // Exactly ONE log line — the dispatch.timeout from the dispatch primitive.
      // No clamp-warning line was emitted.
      const lines = cap.lines();
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0]!).event).toBe("dispatch.timeout");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("invokeBoundedCli — queue serialization (research R6)", () => {
  it("two overlapping calls run serially through the FIFO queue", async () => {
    let activeCount = 0;
    let maxActive = 0;
    const completions: number[] = [];
    const spawnFn: SpawnLike = () => {
      activeCount += 1;
      maxActive = Math.max(maxActive, activeCount);
      const child = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: Readable;
        kill: (signal?: NodeJS.Signals) => boolean;
        pid?: number;
      };
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.pid = 1;
      child.kill = () => true;
      setImmediate(() => {
        child.stdout.push(null);
        child.stderr.push(null);
        setTimeout(() => {
          activeCount -= 1;
          completions.push(Date.now());
          child.emit("exit", 0, null);
        }, 30);
      });
      return child as unknown as ReturnType<SpawnLike>;
    };
    const cap = captureLines();
    const queue = createQueue();
    const p1 = invokeBoundedCli({ command: "read" }, {}, { spawnFn, env: {}, logger: cap.logger, queue });
    const p2 = invokeBoundedCli({ command: "read" }, {}, { spawnFn, env: {}, logger: cap.logger, queue });
    await Promise.all([p1, p2]);
    expect(maxActive).toBe(1);
    expect(completions.length).toBe(2);
    expect(completions[1]!).toBeGreaterThanOrEqual(completions[0]!);
  });
});
