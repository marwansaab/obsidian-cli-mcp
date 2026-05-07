// Original — no upstream. Co-located vitest cases for the invokeCli typed-tool facade — argv assembly via dispatchCli, locator-strip, queue-serialization, fixed bounds.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "../logger.js";
import { createQueue } from "../queue.js";
import { __resetInFlightRegistryForTests } from "./_dispatch.js";
import {
  invokeCli,
  TYPED_TOOL_OUTPUT_CAP_BYTES,
  TYPED_TOOL_TIMEOUT_MS,
  UpstreamError,
  type SpawnLike,
} from "./cli-adapter.js";

interface StubChildSpec {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: NodeJS.ErrnoException;
  hold?: boolean;
  delayCloseMs?: number;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeStubSpawn(spec: StubChildSpec): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  const spawnFn: SpawnLike = (binary, argv, options) => {
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
      if (spec.hold) return;
      const closeCode = "exitCode" in spec ? (spec.exitCode ?? null) : 0;
      const closeSignal = "signal" in spec ? (spec.signal ?? null) : null;
      const fire = () => child.emit("exit", closeCode, closeSignal);
      if (spec.delayCloseMs) {
        setTimeout(fire, spec.delayCloseMs);
      } else {
        setImmediate(fire);
      }
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded };
}

async function captureRejection(promise: Promise<unknown>): Promise<UpstreamError> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    if (!(e instanceof UpstreamError)) {
      throw new Error(`expected UpstreamError, got ${String(e)}`);
    }
    return e;
  }
}

function defaultDeps(extra: { spawnFn: SpawnLike; env?: NodeJS.ProcessEnv }) {
  const logger = createLogger({
    stream: new Writable({ write(_c, _e, cb) { cb(); } }),
  });
  return { ...extra, logger, queue: createQueue() };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("invokeCli — fixed bounds (FR-013)", () => {
  it("exposes constants TYPED_TOOL_TIMEOUT_MS and TYPED_TOOL_OUTPUT_CAP_BYTES", () => {
    expect(TYPED_TOOL_TIMEOUT_MS).toBe(10_000);
    expect(TYPED_TOOL_OUTPUT_CAP_BYTES).toBe(10 * 1024 * 1024);
  });

  it("happy specific mode: argv [vault=..., command, file=...]", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ stdout: "# Note body\n", exitCode: 0 });
    const result = await invokeCli(
      { command: "read", vault: "MyVault", parameters: { file: "Note" }, flags: [], target_mode: "specific" },
      defaultDeps({ spawnFn, env: {} }),
    );
    expect(result).toEqual({ stdout: "# Note body\n", stderr: "" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.binary).toBe("obsidian");
    expect(recorded[0]!.argv).toEqual(["vault=MyVault", "read", "file=Note"]);
  });

  it("undefined parameter values are dropped from argv", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ exitCode: 0 });
    await invokeCli(
      {
        command: "read",
        vault: "V",
        parameters: { file: undefined, query: "q" },
        flags: [],
        target_mode: "specific",
      },
      defaultDeps({ spawnFn, env: {} }),
    );
    expect(recorded[0]!.argv).toEqual(["vault=V", "read", "query=q"]);
  });

  it("locator strip: target_mode 'active' drops vault, file, path; preserves non-target keys", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ exitCode: 0 });
    await invokeCli(
      {
        command: "read",
        parameters: { vault: "V", file: "F", lines: 5 },
        flags: [],
        target_mode: "active",
      },
      defaultDeps({ spawnFn, env: {} }),
    );
    expect(recorded[0]!.argv).toEqual(["read", "lines=5"]);
  });

  it("locator strip: drops path under active mode", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ exitCode: 0 });
    await invokeCli(
      {
        command: "read",
        parameters: { path: "some/path.md", query: "term" },
        flags: [],
        target_mode: "active",
      },
      defaultDeps({ spawnFn, env: {} }),
    );
    expect(recorded[0]!.argv).toEqual(["read", "query=term"]);
  });

  it("active mode ignores top-level vault: argv has no vault prefix even if vault is set", async () => {
    // Symmetric-shape contract (Code-5, 2026-05-08): vault is a top-level
    // input field, but in active mode it MUST be ignored — the typed-tool
    // schema rejects it, and the adapter is the second line of defence.
    const { spawnFn, recorded } = makeStubSpawn({ exitCode: 0 });
    await invokeCli(
      {
        command: "read",
        vault: "ShouldBeIgnored",
        parameters: {},
        flags: [],
        target_mode: "active",
      },
      defaultDeps({ spawnFn, env: {} }),
    );
    expect(recorded[0]!.argv).toEqual(["read"]);
  });
});

describe("invokeCli — classification routes through dispatchCli", () => {
  it("non-zero exit → CLI_NON_ZERO_EXIT", async () => {
    const { spawnFn } = makeStubSpawn({ stderr: "boom", exitCode: 1 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", vault: "V", parameters: {}, flags: [], target_mode: "specific" },
        defaultDeps({ spawnFn, env: {} }),
      ),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.cause).toEqual({ exitCode: 1, signal: null });
    expect(err.details).toMatchObject({ command: "read", stderr: "boom", exitCode: 1, signal: null });
  });

  it("ERR_NO_ACTIVE_FILE recovery message verbatim", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        defaultDeps({ spawnFn, env: {} }),
      ),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.message).toBe(
      'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
    );
  });

  it("CLI_REPORTED_ERROR — stdout starting 'Error: File not found'", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "Error: File not found\n", exitCode: 0 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", vault: "V", parameters: { file: "missing" }, flags: [], target_mode: "specific" },
        defaultDeps({ spawnFn, env: {} }),
      ),
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe("Error: File not found");
  });

  it("priority (b) beats (c): longer 'Error: no active file. ...' classifies as ERR_NO_ACTIVE_FILE", async () => {
    const { spawnFn } = makeStubSpawn({
      stdout: "Error: no active file. Open one or use specific mode.\n",
      exitCode: 0,
    });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        defaultDeps({ spawnFn, env: {} }),
      ),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  });

  it("priority (a) beats (b): exit 1 + 'Error: no active file' stdout → CLI_NON_ZERO_EXIT", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 1 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        defaultDeps({ spawnFn, env: {} }),
      ),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  });

  it("signal-only termination: exitCode -1 sentinel + signal carried", async () => {
    const { spawnFn } = makeStubSpawn({ exitCode: null, signal: "SIGTERM" });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        defaultDeps({ spawnFn, env: {} }),
      ),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.cause).toEqual({ exitCode: -1, signal: "SIGTERM" });
    expect(err.details).toMatchObject({ exitCode: -1, signal: "SIGTERM" });
  });
});

describe("invokeCli — queue serialization (research R6)", () => {
  it("two overlapping invokeCli calls execute serially through the FIFO queue", async () => {
    let activeCount = 0;
    let maxActive = 0;
    const completions: number[] = [];
    const spawnFn: SpawnLike = (_binary, _argv, _options) => {
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
    const logger = createLogger({
      stream: new Writable({ write(_c, _e, cb) { cb(); } }),
    });
    const queue = createQueue();
    const p1 = invokeCli(
      { command: "read", parameters: {}, flags: [], target_mode: "active" },
      { spawnFn, env: {}, logger, queue },
    );
    const p2 = invokeCli(
      { command: "read", parameters: {}, flags: [], target_mode: "active" },
      { spawnFn, env: {}, logger, queue },
    );
    await Promise.all([p1, p2]);
    expect(maxActive).toBe(1);
    expect(completions.length).toBe(2);
    expect(completions[1]!).toBeGreaterThanOrEqual(completions[0]!);
  });
});

describe("invokeCli — UpstreamError re-export sentinel", () => {
  it("UpstreamError is the canonical class identity (FR-011 / Story 4 AC #1)", () => {
    expect(UpstreamError).toBeDefined();
    expect(UpstreamError.name).toBe("UpstreamError");
  });
});
